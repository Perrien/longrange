// Reactive-steel lifecycle (Design/archive/target-system-plan.md §9, tasks T5–T6).
//
// T5 EXTRACTED this from `ScopeView.tsx`, where it had been split across four
// separated regions — the two Maps, the create/strike branching inside the
// deferred-impact closure, the per-frame step/pose/chain/settle loop, and the unmount
// teardown. That extraction added no behaviour.
//
// T6 then added the KNOCKDOWN mode here, which is the whole reason the extraction came
// first: a third reaction mode threaded through four scattered regions of a
// 2400-line component is exactly the "patch and repatch" the owner ruled against on
// 2026-07-18. As one file, a mode is one branch.
//
// Three reaction modes, resolved per plate by `reactionModeOf` (mount → mode):
//   swing     — C++ rigid body, stepped and posed each frame, settles and snaps back.
//   bolted    — takes paint, never posed. Nothing moves.
//   knockdown — TS state machine (`targets/knockdown.ts`) drives a hinge rotation;
//               the C++ target is kept for its paint buffer but never stepped.
//               Deliberately does NOT push its pose down via `setOrientation` the
//               way `flip` does: a popper is filtered out of the rack while it is
//               anything but standing (`isStanding`, read by ScopeView before
//               `resolveShot`), so it can only ever be struck upright — at which
//               point its orientation IS the identity the engine already assumes.
//   flip      — TS state machine (`targets/flip.ts`) advances a hostage paddle
//               between discrete clamp stops, animated as a 180° SWING about a
//               vertical pivot (see `poseFlip` for why a swing and not a slide);
//               the C++ target is kept for its paint buffer but never stepped,
//               same as knockdown. Unlike knockdown, the new stop moves the
//               plate's HIT-TESTABLE position (`game/shot.ts` reads
//               `PlateInstance.position` directly, never a mesh matrix) — that
//               mutation happens immediately on strike, before the swing animates.
//
// WHAT DELIBERATELY STAYS IN ScopeView: `pendingImpacts`. That is time-of-flight
// SCHEDULING — when an effect happens — which is a different concern from what the
// effect is. Its closure body is a single `controller.onImpact(...)` call.

import * as THREE from 'three';
import type { SteelReaction, SteelReactionSpec } from '../engine-bridge/steel-target';
import type { Vec3 } from '../engine-bridge/types';
import { PLATE_THICKNESS_M, setChainInstance, type PlateInstance } from '../range/RangeScene';
import { plateMeshSlot, type SteelSceneApi } from '../range/steel-scene-api';
import { getMountType, reactionModeOf } from '../range/targets/mount-registry';
import { plateHeightM } from '../game/target-hit';
import {
  isStandingPhase,
  resetKnockdown,
  seedFallRate,
  standingState,
  steelPlateMassKg,
  stepKnockdown,
  strikeKnockdown,
  type KnockdownState,
} from '../range/targets/knockdown';
import { resetFlip, restFlipState, strikeFlip, type FlipState } from '../range/targets/flip';
import type { FlipSpec, KnockdownSpec } from '../range/targets/mount-type';

/**
 * How a native steel target gets built.
 *
 * INJECTED rather than imported, for two reasons. It keeps embind handles confined
 * to `engine-bridge/` (build-plan §3: that is the only place allowed to touch them
 * and their `.delete()` rules), and it is what makes the orchestration testable —
 * "settles after N steps" and "delete() called exactly once" cannot be asserted
 * against the real WASM target.
 */
export type SteelReactionFactory = (spec: SteelReactionSpec) => SteelReaction;

/** One bullet arriving at one plate. */
export interface SteelImpact {
  plate: PlateInstance;
  /** Impact point, world m. */
  impactWorld: Vec3;
  /** Bullet velocity at impact, world m/s. */
  impactVel: Vec3;
  bulletMassKg: number;
  bulletDiameterM: number;
}

export interface SteelReactionController {
  /** A bullet has ARRIVED (already time-of-flight delayed by the caller). */
  onImpact(impact: SteelImpact): void;
  /** Advance every moving reaction and mirror its pose into the scene. */
  update(dt: number): void;
  /** Stand knocked-down targets back up (task T6). Omit `groupId` for every
   *  knockdown on the range; pass one to reset a single piece of furniture, e.g. a
   *  plate rack, together. */
  resetDownTargets(groupId?: string): void;
  /** Snap every flip target (a hostage paddle) back to its rest stop. No `groupId`
   *  — hostage-target assemblies deliberately do not use `groupId` (their members
   *  disagree on mount, which `placements.ts` forbids within one group), and the
   *  single call site resets every reactive target unconditionally already. */
  resetFlipTargets(): void;
  /** Whether a plate can currently be hit. False for a knockdown target that is
   *  down or resetting; true for everything else, including any plate that has never
   *  been struck. */
  isStanding(instanceId: number): boolean;
  /** Release every native handle. Idempotent. */
  dispose(): void;
}

/** A plate toppling, down, or resetting. Its pose is TS-animated (see
 *  `targets/knockdown.ts` for why not C++), so it never joins `moving`. */
interface KnockdownEntry {
  plate: PlateInstance;
  cfg: KnockdownSpec;
  state: KnockdownState;
  /** The plate's upright instance matrix, the frame the hinge rotation composes onto. */
  rest: THREE.Matrix4;
  /** Hinge pivot in world space — the base of the stem, `pivotYM` if given. */
  pivot: THREE.Vector3;
  massKg: number;
}

/** A plate whose physics is currently being stepped. */
interface MovingEntry {
  reaction: SteelReaction;
  /** The plate's static instance matrix, restored on settle. */
  rest: THREE.Matrix4;
  /** Rest rotation (identity for the engine-frame geometry) and size. */
  baseQuat: THREE.Quaternion;
  scale: THREE.Vector3;
}

/** A hostage paddle flipping between clamp positions. Its pose is TS-animated
 *  (`targets/flip.ts`), so — like a knockdown target — it never joins `moving`. */
interface FlipEntry {
  plate: PlateInstance;
  spec: FlipSpec;
  state: FlipState;
  /** Rest position/rotation/scale at stop 0, decomposed once from the plate's
   *  live instance matrix on its first hit. The X component of every stop is an
   *  offset FROM `basePos.x`, never an absolute coordinate. */
  basePos: THREE.Vector3;
  baseQuat: THREE.Quaternion;
  scale: THREE.Vector3;
  /** The cosmetic swing's start/end X offsets (from `basePos.x`) and progress
   *  0..1. Purely visual — `plate.position.x` is already the new stop the
   *  instant a strike is registered, independent of this animation. */
  animFromXM: number;
  animToXM: number;
  animT: number;
  /**
   * Accumulated rotation about the VERTICAL axis, rad — the paddle's facing at
   * the start (`From`) and end (`To`) of the current transition. Every strike
   * adds exactly ±π, so the face the shooter sees alternates with each hit.
   *
   * Carried as an accumulator rather than derived from `state.index` because the
   * cycle repeats positions (`[center, right, center, left]`) while the facing
   * does not — after four strikes the paddle is back at `center` having turned
   * through 2π, and stop index alone cannot tell you which face is out.
   */
  spunFromRad: number;
  spunToRad: number;
  /**
   * Where the C++ target believes it is — `plate.position` at the moment the native
   * target was built, captured because the engine has no `setPosition`.
   *
   * `SteelTarget::recordImpact` computes `local = impact − position_` against its own
   * frozen `position_`. A flip paddle's position is TS-driven, so once it swings to a
   * stop 0.33 m away, an impact expressed in world coordinates lands a third of a
   * metre off a 15 cm paddle — i.e. clamped to the rim, every time. The strike is
   * therefore re-expressed in this frame before being handed down (`onImpact`).
   */
  enginePos: THREE.Vector3;
}

export function createSteelReactions(
  scene: SteelSceneApi,
  makeReaction: SteelReactionFactory,
): SteelReactionController {
  /** Plates currently SWINGING — the stepped set. */
  const moving = new Map<number, MovingEntry>();
  /**
   * Session-long C++ steel targets, one per STRUCK plate. Created on a plate's
   * first hit and kept after it settles, because the C++ impact-paint buffer IS the
   * persistent hit-mark store — deleting on settle (as pre-TS-C code did) wipes the
   * plate's marks. Entries in `moving` always alias entries here; handles are freed
   * only in `dispose`.
   */
  const targets = new Map<number, SteelReaction>();
  /** Plates on a knockdown mount, once struck. Kept for the whole session so a
   *  reset target remembers its rest frame and its accumulated state. */
  const knocked = new Map<number, KnockdownEntry>();
  /** Plates on a flip mount (a hostage paddle), once struck. Kept for the whole
   *  session, same reasoning as `knocked`. */
  const flipped = new Map<number, FlipEntry>();

  // Scratch, reused per frame rather than allocated in the loop.
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const hingeAxis = new THREE.Vector3(1, 0, 0); // topple away from the shooter, about X
  // A hostage paddle swings about a VERTICAL pivot (see `poseFlip`) — a different
  // axis from the knockdown hinge above, and its own scratch quaternion because
  // `quat` is live inside the per-frame swing loop.
  const SPIN_AXIS = new THREE.Vector3(0, 1, 0);
  const flipQuat = new THREE.Quaternion();
  const toPivot = new THREE.Matrix4();
  const fromPivot = new THREE.Matrix4();
  const spin = new THREE.Matrix4();
  let deleted = false;

  /** The native target for a plate, created on first use. */
  function targetFor(plate: PlateInstance): SteelReaction {
    let reaction = targets.get(plate.instanceId);
    if (!reaction) {
      const heightM = plateHeightM({
        diameterM: plate.diameterM,
        heightM: plate.heightM,
        typeId: plate.targetTypeId,
      });
      reaction = makeReaction({
        diameterM: plate.diameterM,
        heightM: Math.abs(heightM - plate.diameterM) < 1e-9 ? undefined : heightM,
        thicknessM: PLATE_THICKNESS_M,
        position: { x: plate.position.x, y: plate.position.y, z: plate.position.z },
        beamHeightM: plate.beamHeightM,
        paintColorHex: plate.paintColor,
        chainOutwardOffsetM: plate.chainOutwardOffsetM,
        // A non-round silhouette takes the rectangular tensor; a round plate keeps
        // the elliptical default, so shipped ranges are unchanged.
        isOval: Math.abs(heightM - plate.diameterM) < 1e-9 ? undefined : false,
      });
      targets.set(plate.instanceId, reaction);
    }
    return reaction;
  }

  /**
   * The knockdown config for one plate, with `stemLengthM` replaced by the plate's OWN
   * height where its geometry gives one.
   *
   * `stemLengthM` on the mount is a default. The rod in `θ̈ = (3g/2L)·sin θ` is the
   * pivot-to-tip distance, and a popper hinged at its base has L = its height — so
   * taking L from the mount would make every popper fall at the rate of a 1 m one
   * regardless of size. Latch angle, dwell and reset rate stay the mount's, because
   * those really are hardware properties.
   */
  function knockdownCfgFor(plate: PlateInstance, base: KnockdownSpec): KnockdownSpec {
    const heightM = plateHeightM({
      diameterM: plate.diameterM,
      heightM: plate.heightM,
      typeId: plate.targetTypeId,
    });
    return heightM > 0 ? { ...base, stemLengthM: heightM } : base;
  }

  /** Knockdown bookkeeping for a plate, created on its first hit. */
  function knockdownFor(plate: PlateInstance, cfg: KnockdownSpec): KnockdownEntry {
    let entry = knocked.get(plate.instanceId);
    if (!entry) {
      const slot = plateMeshSlot(scene, plate.instanceId);
      const rest = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.index, rest);
      // Take the plate centre from the REST MATRIX, not from `plate.position`.
      // The two agree in every real scene (the builder writes both from one value),
      // but the rest matrix is what the hinge rotation composes onto — so deriving
      // the pivot from anything else makes a disagreement silently rotate the plate
      // about a point it isn't attached to.
      const centre = new THREE.Vector3().setFromMatrixPosition(rest);
      // The hinge is at the base of the stem: `pivotYM` if the scene supplied one,
      // else a stem length below the plate centre.
      const pivotY = plate.pivotYM ?? centre.y - cfg.stemLengthM;
      const heightM = plateHeightM({
        diameterM: plate.diameterM,
        heightM: plate.heightM,
        typeId: plate.targetTypeId,
      });
      entry = {
        plate,
        cfg,
        state: standingState(),
        rest: rest.clone(),
        pivot: new THREE.Vector3(centre.x, pivotY, centre.z),
        massKg: steelPlateMassKg(plate.diameterM, heightM, PLATE_THICKNESS_M),
      };
      knocked.set(plate.instanceId, entry);
    }
    return entry;
  }

  /** Flip bookkeeping for a plate, created on its first hit. Mirrors
   *  `knockdownFor`: decompose the live instance matrix once, so a reset can
   *  restore it exactly and a strike can compose a new one from it. */
  function flipFor(plate: PlateInstance, spec: FlipSpec): FlipEntry {
    let entry = flipped.get(plate.instanceId);
    if (!entry) {
      const slot = plateMeshSlot(scene, plate.instanceId);
      const rest = new THREE.Matrix4();
      slot.mesh.getMatrixAt(slot.index, rest);
      const basePos = new THREE.Vector3();
      const baseQuat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      rest.decompose(basePos, baseQuat, scale);
      entry = {
        plate,
        spec,
        state: restFlipState(),
        basePos,
        baseQuat,
        scale,
        animFromXM: 0,
        animToXM: 0,
        animT: 1, // already settled at stop 0
        spunFromRad: 0,
        spunToRad: 0,
        // The native target is built from `plate.position` on this same first hit
        // (`targetFor`), so this is that value — and the paddle is at stop 0 here by
        // construction, since a flip entry is created before its first strike is
        // registered.
        enginePos: plate.position.clone(),
      };
      flipped.set(plate.instanceId, entry);
    }
    return entry;
  }

  /** Write a knockdown entry's current angle into the scene. */
  function poseKnockdown(id: number, entry: KnockdownEntry): void {
    const slot = plateMeshSlot(scene, id);
    // Rotate about the hinge, not the plate centre: translate the pivot to the
    // origin, spin about X, translate back, then apply the plate's rest frame.
    toPivot.makeTranslation(-entry.pivot.x, -entry.pivot.y, -entry.pivot.z);
    fromPivot.makeTranslation(entry.pivot.x, entry.pivot.y, entry.pivot.z);
    spin.makeRotationAxis(hingeAxis, -entry.state.angleRad);
    mat.copy(fromPivot).multiply(spin).multiply(toPivot).multiply(entry.rest);
    slot.mesh.setMatrixAt(slot.index, mat);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /**
   * Write a flip entry's current pose into the scene — a paddle SWINGING on a
   * vertical pivot, not sliding. Purely visual: `entry.plate.position.x` is
   * already the landed stop, set the instant the strike was registered
   * (`onImpact`'s `'flip'` branch), so nothing here decides where a shot lands.
   *
   * ── WHY A SWING AND NOT A SLIDE (owner, on device 2026-08-06) ───────────────
   * "Both flippers don't actually flip, they just slide to the side so the same
   * face is always visible. If I shoot the right side of the flipper, it slides
   * out to the side and the splat is still visible on the right side." The first
   * pass lerped X and left the orientation alone — a translating plate, not a
   * paddle on a clamp.
   *
   * THE MODEL. The pivot is the VERTICAL axis midway between the two stops, and a
   * strike swings the paddle 180° about it, like a door. Two things the owner
   * asked for fall out of that one rotation for free:
   *   • the paddle lands exactly on the next stop — a half turn about the
   *     midpoint maps either stop onto the other, so there is no separate
   *     translation that could drift out of step with the rotation;
   *   • the far face comes round to the shooter, so a splat on the struck side
   *     travels with the paddle and ends up on the far side.
   * It is also the pivot the owner described for the head paddle in the first
   * round ("the pivot point should be behind the center of the head") — which is
   * exactly the midpoint of that mount's two stops.
   *
   * ── THE SWING GOES AWAY FROM THE SHOOTER ─────────────────────────────────
   * Owner, 2026-08-06, after the first swing shipped arcing toward the shooter:
   * "the action is actually backwards, the paddles shouldn't flip towards the
   * shooter but away. Technically the paddle is behind the body target. The
   * bullet goes through the center hole, hits the paddle, it flips away from the
   * shooter rather than towards."
   *
   * That is momentum, not taste — the bullet is travelling downrange, so it drives
   * the paddle downrange. It also settles the mount's DEPTH: a paddle that swings
   * away must hang BEHIND the backing plate, or the arc sweeps it straight through
   * the plate on every strike. Which is why `test-hostage-center`'s `zNudgeM` is
   * negative (see `placements.data.json`); this is the reusable half of that
   * pairing, and the reason it is stated here rather than only in the placement.
   *
   * The arc is always away, whichever way the paddle is travelling: `sin(πt)` is
   * taken unsigned and only the FACING carries the travel's sign. A door that
   * opened both ways would come back through the plate on alternate strikes.
   */
  function poseFlip(id: number, entry: FlipEntry): void {
    const slot = plateMeshSlot(scene, id);
    // Half the travel, and the pivot at its midpoint. Zero for a paddle at rest,
    // or one whose two stops coincide — which degrades to "no swing" rather than
    // to a degenerate pivot.
    const halfTravelM = (entry.animToXM - entry.animFromXM) / 2;
    const pivotX = entry.basePos.x + entry.animFromXM + halfTravelM;
    const t = entry.animT;
    // The rest offset (−halfTravel, 0) rotated about the pivot: x = −h·cos(πt),
    // z = −|h|·sin(πt) — NEGATIVE, i.e. downrange, away from the shooter (world
    // −z is downrange; the plate sits at −distanceM). t=0 is the from-stop, t=1
    // the to-stop, and t=½ has the paddle edge-on, one half-travel BEHIND the
    // plate's plane.
    pos.set(
      pivotX - halfTravelM * Math.cos(Math.PI * t),
      entry.basePos.y,
      entry.basePos.z - Math.abs(halfTravelM) * Math.sin(Math.PI * t),
    );
    // Facing: the ACCUMULATED turn, so the visible face alternates per strike
    // rather than resetting with the stop index.
    const theta = entry.spunFromRad + (entry.spunToRad - entry.spunFromRad) * t;
    flipQuat.setFromAxisAngle(SPIN_AXIS, theta).multiply(entry.baseQuat);
    mat.compose(pos, flipQuat, entry.scale);
    slot.mesh.setMatrixAt(slot.index, mat);
    slot.mesh.instanceMatrix.needsUpdate = true;
  }

  /** Mirror the engine's paint buffer into the plate's atlas layer. Compositing over
   *  any authored art is `writeEngineLayer`'s job (T4b). The buffer view is a fresh
   *  zero-copy window on the WASM heap, so it is consumed immediately. */
  function paint(plate: PlateInstance, reaction: SteelReaction): void {
    scene.plateSurface.writeEngineLayer(plate.instanceId, reaction.getTexture(), plate.paintColor);
  }

  return {
    onImpact({ plate, impactWorld, impactVel, bulletMassKg, bulletDiameterM }): void {
      const mode = reactionModeOf(plate);

      // KNOCKDOWN. The plate still gets a native target — that is what records the
      // splat — but it is never stepped or posed by the engine; its pose is the TS
      // state machine's (`targets/knockdown.ts`).
      if (mode === 'knockdown') {
        const mount = getMountType(plate.mountId!);
        const entry = knockdownFor(plate, knockdownCfgFor(plate, mount.knockdown!));
        const cfg = entry.cfg;
        const reaction = targetFor(plate);
        reaction.strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM);
        paint(plate, reaction);
        const speed = Math.hypot(impactVel.x, impactVel.y, impactVel.z);
        entry.state = strikeKnockdown(
          entry.state,
          seedFallRate({
            impulseNs: bulletMassKg * speed,
            impactHeightM: impactWorld.y - entry.pivot.y,
            massKg: entry.massKg,
            stemLengthM: cfg.stemLengthM,
          }),
        );
        return;
      }

      // FLIP (a hostage paddle). Same "native target for paint only" shape as
      // knockdown, but the reaction is a lateral reposition rather than a fall.
      // `plate.position.x` is mutated to the LANDED stop immediately — that is
      // what `game/shot.ts` reads on the very next shot — before the cosmetic
      // slide animates it visually over `spec.transitionS`.
      if (mode === 'flip') {
        const mount = getMountType(plate.mountId!);
        const spec = mount.flip!;
        const entry = flipFor(plate, spec);
        const reaction = targetFor(plate);
        // ── PUSH THE TS-DRIVEN POSE DOWN BEFORE RECORDING THE HIT ───────────────
        // Owner, on device 2026-08-06: "The shoulder target only gets splats on the
        // front side... When it flips to the other side, even after multiple shots,
        // the back is always clean."
        //
        // `SteelTarget::recordImpact` reads the body's OWN `orientation_` and
        // `position_` — it picks the texture half from `vel · normal_` and stores the
        // impact at `inverse(orientation_) · (impact − position_)`. A flip paddle's
        // pose lives in TypeScript, so the engine still believes it is unrotated at
        // its build position, and every splat went to the half that ends up facing
        // downrange after a flip. `setOrientation` exists for exactly this (see its
        // docstring in `steel_target.h`); it simply was never called.
        //
        // Orientation is the paddle's facing as it stands NOW — `spunToRad`, the end
        // of the last completed transition, since the strike lands before this one
        // begins.
        flipQuat.setFromAxisAngle(SPIN_AXIS, entry.spunToRad);
        reaction.setOrientation({
          x: flipQuat.x,
          y: flipQuat.y,
          z: flipQuat.z,
          w: flipQuat.w,
        });
        // Position gets no such setter, so the IMPACT moves instead: re-expressed in
        // the frame the engine still believes it occupies. Without this a paddle at a
        // 0.33 m stop takes every hit 0.33 m off a 15 cm face — clamped to the rim.
        reaction.strike(
          {
            x: impactWorld.x - (plate.position.x - entry.enginePos.x),
            y: impactWorld.y - (plate.position.y - entry.enginePos.y),
            z: impactWorld.z - (plate.position.z - entry.enginePos.z),
          },
          impactVel,
          bulletMassKg,
          bulletDiameterM,
        );
        paint(plate, reaction);
        const fromOffsetM = spec.positions[entry.state.index].xOffsetM;
        entry.state = strikeFlip(entry.state, spec.positions.length);
        entry.animFromXM = fromOffsetM;
        entry.animToXM = spec.positions[entry.state.index].xOffsetM;
        entry.animT = 0;
        // Each strike is another HALF TURN about the vertical pivot, signed by the
        // travel direction so the paddle turns the way it swings. Taking the new
        // baseline from the previous transition's END (`spunToRad`) treats a strike
        // landing mid-swing as having completed the previous one — exactly what the
        // line above already does for position, so the two cannot disagree about
        // which stop the paddle is coming from.
        entry.spunFromRad = entry.spunToRad;
        entry.spunToRad =
          entry.spunFromRad + Math.sign(entry.animToXM - entry.animFromXM) * Math.PI;
        plate.position.x = entry.basePos.x + entry.animToXM;
        return;
      }

      // A BOLTED plate still needs its native target — that is what holds the paint
      // buffer and records the splat — but it must never join the stepped set,
      // because bolted steel does not swing.
      const swings = mode === 'swing';
      let entry = moving.get(plate.instanceId);
      if (!entry) {
        const reaction = targetFor(plate);
        if (!swings) {
          reaction.strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM);
          paint(plate, reaction);
          return;
        }
        // Not in `moving` ⇒ the plate is at rest, so its current instance matrix IS
        // the rest matrix (first hit, or settled and snapped back).
        const slot = plateMeshSlot(scene, plate.instanceId);
        const rest = new THREE.Matrix4();
        slot.mesh.getMatrixAt(slot.index, rest);
        const baseQuat = new THREE.Quaternion();
        const scale = new THREE.Vector3();
        rest.decompose(new THREE.Vector3(), baseQuat, scale);
        entry = { reaction, rest: rest.clone(), baseQuat, scale };
        moving.set(plate.instanceId, entry);
      }
      entry.reaction.strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM);
      paint(plate, entry.reaction);
    },

    update(dt: number): void {
      // Knockdowns advance independently of the swing set — different physics, and a
      // knocked target keeps animating (dwell, then rise) with nothing "moving".
      for (const [id, entry] of knocked) {
        if (entry.state.phase === 'standing') continue;
        const next = stepKnockdown(entry.state, dt, entry.cfg);
        if (next !== entry.state) {
          entry.state = next;
          poseKnockdown(id, entry);
        }
      }
      // Flips advance independently too — a purely cosmetic slide toward the stop
      // `plate.position.x` already landed on at strike time (`onImpact`).
      for (const [id, entry] of flipped) {
        if (entry.animT >= 1) continue;
        entry.animT = Math.min(1, entry.animT + dt / entry.spec.transitionS);
        poseFlip(id, entry);
      }
      if (moving.size === 0) return;
      // Track the meshes actually written, so a multi-shape scene flags only those.
      const touched = new Set<THREE.InstancedMesh>();
      for (const [id, entry] of moving) {
        entry.reaction.step(dt);
        const pose = entry.reaction.getPose();
        pos.set(pose.position.x, pose.position.y, pose.position.z);
        // Steel orientation (relative to the world-aligned rest frame) composed onto
        // the plate's rest rotation — identity for the engine-frame geometry, kept
        // as a compose so any future base rotation works.
        quat
          .set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w)
          .multiply(entry.baseQuat);
        mat.compose(pos, quat, entry.scale);
        const slot = plateMeshSlot(scene, id);
        slot.mesh.setMatrixAt(slot.index, mat);
        touched.add(slot.mesh);
        // Redraw this plate's two chains so they track the swing.
        const chains = entry.reaction.getChains();
        for (let ci = 0; ci < chains.length; ci++) {
          setChainInstance(scene.chainMesh, id * 2 + ci, chains[ci].attach, chains[ci].fixed);
        }
        if (!entry.reaction.isMoving()) {
          slot.mesh.setMatrixAt(slot.index, entry.rest); // snap back to rest
          for (let ci = 0; ci < 2; ci++) {
            scene.chainMesh.setMatrixAt(id * 2 + ci, scene.chainRest[id * 2 + ci]);
          }
          // Retire from the swing loop but KEEP the C++ target: its paint buffer
          // holds this plate's accumulated marks for the session.
          moving.delete(id);
        }
      }
      for (const mesh of touched) mesh.instanceMatrix.needsUpdate = true;
      scene.chainMesh.instanceMatrix.needsUpdate = true;
    },

    resetDownTargets(groupId?: string): void {
      // Omitted groupId ⇒ every knockdown on the range. A group is one piece of
      // furniture, so resetting by group stands a whole plate rack up together.
      for (const [id, entry] of knocked) {
        if (groupId !== undefined && entry.plate.groupId !== groupId) continue;
        if (entry.state.phase === 'standing') continue;
        entry.state = resetKnockdown();
        poseKnockdown(id, entry);
      }
    },

    resetFlipTargets(): void {
      for (const [id, entry] of flipped) {
        // `spunToRad` is part of "at rest" now: a paddle can sit on stop 0 having
        // turned through 2π, which looks identical but is NOT the state a fresh
        // engagement should start from — the accumulator has to be zeroed or the
        // face it presents depends on the previous engagement.
        if (entry.state.index === 0 && entry.animT >= 1 && entry.spunToRad === 0) continue;
        entry.state = resetFlip();
        entry.animFromXM = 0;
        entry.animToXM = entry.spec.positions[0].xOffsetM; // 0, by FlipSpec validation
        entry.animT = 1; // snap instantly — a reset is not a struck reaction
        entry.spunFromRad = 0;
        entry.spunToRad = 0;
        entry.plate.position.x = entry.basePos.x + entry.animToXM;
        poseFlip(id, entry);
      }
    },

    isStanding(instanceId: number): boolean {
      const entry = knocked.get(instanceId);
      // A plate with no knockdown state has never been knocked (or cannot be), so it
      // is standing — which is what keeps every non-knockdown plate in play.
      return entry ? isStandingPhase(entry.state.phase) : true;
    },

    dispose(): void {
      if (deleted) return;
      deleted = true;
      // Every moving entry ALIASES a `targets` entry, so freeing via `targets` frees
      // each native handle exactly once.
      moving.clear();
      knocked.clear();
      flipped.clear();
      for (const target of targets.values()) target.delete();
      targets.clear();
    },
  };
}
