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
//   star-arm  — a plate on the popper star's ROTATING carrier
//               (`Design/archive/popper-star-plan.md`). The first reaction here whose REST
//               FRAME is a function of time: every mode above poses a plate against a
//               matrix captured once, while a star arm's rest matrix is recomputed
//               every frame from the scene clock. Two consequences worth stating
//               plainly, because they are what makes this mode different rather than
//               just longer:
//                 • its entries are built EAGERLY, at controller construction, not
//                   lazily on first hit — a rotating target has to move from frame 0.
//                 • it is the SOLE WRITER of its plates' instance matrices AND of
//                   `plate.position` (x/y only, never z). `TestRangeScene` spins the
//                   drawn arms from the same `timeS`, so the metalwork and the plates
//                   cannot drift; but nothing else may write those matrices.
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
import {
  starArmAngleAt,
  starArmOf,
  starArmOffsetAt,
  starArmTangentUnit,
  starCarrierRotationZ,
  starFoldCfg,
  starFoldMomentArmM,
  starHingeRadiusM,
  starHubFrom,
} from '../range/targets/popper-star';
import type { FlipSpec, KnockdownSpec, StarArmSpec } from '../range/targets/mount-type';

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
  /**
   * Advance every moving reaction and mirror its pose into the scene.
   *
   * `timeS` is the scene's ABSOLUTE clock (ScopeView's `st.t`), needed by the star
   * rotor — its pose is a pure function of time, not an integration of `dt`, which is
   * exactly what lets `TestRangeScene` spin the drawn arms from the same value without
   * the two ever drifting. Defaulted so the callers and tests that predate rotors keep
   * working unchanged; production MUST pass the real clock or the star stands still.
   */
  update(dt: number, timeS?: number): void;
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
  /**
   * Where a rotor plate's centre will be `aheadS` seconds after `timeS`, or `null` if
   * the plate is not on a rotating carrier.
   *
   * Exists for time-of-flight: a shot resolved against where a moving plate WAS at
   * trigger break would need no lead at all. At 36°/s and a ~0.11 s flight a 10″ plate
   * moves about a fifth of its own width, so the containment test uses this instead of
   * the live position. Returns `null` — rather than the live position — so the caller
   * has to decide explicitly, and every non-rotor range keeps its exact old numbers.
   */
  rotorPositionAt(instanceId: number, timeS: number, aheadS: number): { x: number; y: number } | null;
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

/**
 * One plate on the popper star's rotating carrier.
 *
 * Built EAGERLY (see `scanStarRotors`), unlike every other entry type here — a
 * rotating target has to move before anything has been shot.
 *
 * Everything geometric is DERIVED from the authored plate positions rather than
 * carried alongside them: `hub` is the group's centroid, and `restAngleRad`/`radiusM`
 * come from `starArmOf` against it. So there is no hub coordinate in this struct that
 * could disagree with the placements — see `popper-star.ts`'s header.
 */
interface StarEntry {
  plate: PlateInstance;
  spec: StarArmSpec;
  /** Carrier centre in world space. Shared by every member of the group. */
  hub: THREE.Vector3;
  /** The arm's angle at t = 0 (rad), clockwise from straight up. */
  restAngleRad: number;
  /** Plate-centre radius (m) — the arm's length. */
  radiusM: number;
  /** Instance scale, decomposed once from the plate's build matrix. */
  scale: THREE.Vector3;
  /** Fold state. `standing` until struck; latches `down` forever (the spec's dwell is
   *  `STAR_LATCH_UNTIL_RESET`) until `resetDownTargets` raises it. */
  state: KnockdownState;
  /** The fold's `KnockdownSpec`, built once from `spec` + the plate's own width. */
  cfg: KnockdownSpec;
  /** Where the C++ target believes it is — see `FlipEntry.enginePos` for the full
   *  reasoning. It matters far more here: a star plate is ALWAYS somewhere other than
   *  its build position, so without this correction every splat on every arm would
   *  clamp to the rim. */
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
  /** Plates on a rotating star carrier. Built EAGERLY below — every other map here
   *  fills on first hit, but a star has to turn from frame 0. */
  const stars = new Map<number, StarEntry>();

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
  // Star scratch. Kept separate from the matrices above because a star pose composes
  // four of them at once and the knockdown/flip loops may be mid-use. Every star plate
  // is posed every frame, so nothing here may allocate.
  const CARRIER_AXIS = new THREE.Vector3(0, 0, 1);
  /** The fold hinge, set per arm each pose — TANGENTIAL to the carrier, not a fixed
   *  axis. See `starArmTangentUnit`. */
  const foldAxis = new THREE.Vector3();
  const IDENTITY_QUAT = new THREE.Quaternion();
  const starQuat = new THREE.Quaternion();
  const starPos = new THREE.Vector3();
  const starCarrier = new THREE.Matrix4();
  const starFold = new THREE.Matrix4();
  const starToHinge = new THREE.Matrix4();
  const starFromHinge = new THREE.Matrix4();
  const starRest = new THREE.Matrix4();
  const starHubT = new THREE.Matrix4();
  /**
   * The scene time the star rotors were last posed at.
   *
   * `onImpact` needs the carrier angle to push down as the plate's orientation, but a
   * bullet arrival carries no clock of its own — it is scheduled by ScopeView's
   * time-of-flight queue, which runs immediately before `update` each frame. So the
   * last posed time IS the pose the arriving bullet is hitting, to within one frame
   * (~7 mm of arm travel at this rate).
   */
  let starTimeS = 0;
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

  /**
   * Find every rotating-star plate in the scene and build its entry, ONCE, now.
   *
   * ── WHY EAGERLY, AND WHY HERE ────────────────────────────────────────────────────
   * Every other entry map in this file fills lazily on a plate's first hit, which is
   * right for a reaction: nothing has happened yet, so there is nothing to remember.
   * A rotating carrier is the opposite — it has to be turning on frame 0, before
   * anything is shot. Doing the scan inside the constructor (rather than exposing a
   * `registerRotors` method for ScopeView to call) means a future caller cannot forget
   * it; the only thing ScopeView has to get right is creating the controller early,
   * which it does at scene setup.
   *
   * GROUPING: one star is one `groupId`. The hub is the centroid of the group's plate
   * positions and each arm's angle/radius comes from `starArmOf` against it, so a
   * star's geometry is entirely recovered from its authored placements — see
   * `popper-star.ts`'s header for why that is worth the indirection.
   *
   * A star-arm plate with no `groupId` is skipped rather than guessed at: with nothing
   * to take a centroid over, its hub would have to be invented.
   */
  function scanStarRotors(): void {
    const groups = new Map<string, PlateInstance[]>();
    for (const plate of scene.plates) {
      if (reactionModeOf(plate) !== 'star-arm') continue;
      if (plate.groupId === undefined) {
        console.warn(
          `steel-reactions: star-arm plate '${plate.rackId}' has no groupId, so its hub cannot be derived — skipped`,
        );
        continue;
      }
      const list = groups.get(plate.groupId);
      if (list) list.push(plate);
      else groups.set(plate.groupId, [plate]);
    }

    for (const members of groups.values()) {
      const hub2d = starHubFrom(members.map((p) => ({ x: p.position.x, y: p.position.y })));
      // The carrier is coplanar with its plates, so z is the group's own (shared, by
      // the placement loader's group invariant).
      const hub = new THREE.Vector3(hub2d.x, hub2d.y, members[0].position.z);
      for (const plate of members) {
        const spec = getMountType(plate.mountId!).star!;
        const { restAngleRad, radiusM } = starArmOf(hub2d, {
          x: plate.position.x,
          y: plate.position.y,
        });
        const slot = plateMeshSlot(scene, plate.instanceId);
        const rest = new THREE.Matrix4();
        slot.mesh.getMatrixAt(slot.index, rest);
        const scale = new THREE.Vector3();
        rest.decompose(new THREE.Vector3(), new THREE.Quaternion(), scale);
        stars.set(plate.instanceId, {
          plate,
          spec,
          hub,
          restAngleRad,
          radiusM,
          scale,
          state: standingState(),
          cfg: starFoldCfg(spec, plate.diameterM),
          // The native target is built from `plate.position` on this plate's first hit
          // (`targetFor`), and `plate.position` is rewritten every frame from here on —
          // so capture the build-time value NOW, while it is still the authored one.
          enginePos: plate.position.clone(),
        });
      }
    }
  }

  /**
   * Write one star plate's pose into the scene, and its centre into `plate.position`.
   *
   * THE COMPOSITION, outermost first:
   *
   *   M = T(hub) · Rz(carrierθ) · [T(hinge) · Rx(−fold) · T(−hinge)] · T(0, R, 0) · S
   *
   * Read right to left: put the plate at radius R up the arm; fold it about the hinge
   * at its inner rim (the bracketed conjugation is `poseKnockdown`'s rotate-about-a-
   * point idiom, and `Rx(−α)` is its sign convention too, which is what sends the
   * outer rim DOWNRANGE rather than toward the shooter); spin the whole arm to the
   * carrier's current angle; translate to the hub.
   *
   * `Rz(carrierθ)` keeps the plate's face normal along Z — it still faces the shooter
   * at every point in the revolution — while rotating the plate about its own centre
   * axis, which is what a plate rigidly bolted to a turning arm actually does. That
   * rotation is why `onImpact` must push the same angle down via `setOrientation`, or
   * splats land on the wrong part of the face.
   *
   * WRITING `plate.position` IS THE POINT, not a side effect: `game/shot.ts` and
   * `scope/aim-pick.ts` both read it directly and never look at a mesh matrix, so this
   * one assignment is what makes a moving target aimable and hittable at all. Only x
   * and y — z is the plate's rack plane, which `ScopeView`'s exact-distance rack filter
   * depends on and which a coplanar carrier never changes.
   */
  function poseStar(id: number, entry: StarEntry, timeS: number): void {
    const angle = starArmAngleAt(entry.restAngleRad, timeS, entry.spec);
    const centre = starArmOffsetAt(angle, entry.radiusM);

    // Hit-test / aim-pick position. Written before the matrix so an exception in the
    // THREE work below can never leave the two disagreeing.
    entry.plate.position.x = entry.hub.x + centre.dx;
    entry.plate.position.y = entry.hub.y + centre.dy;

    // In the CARRIER's frame the arm sits at `restAngleRad` and the carrier rotation is
    // applied on top. The hinge is at the plate's inner rim IN THE PLATE'S OWN PLANE
    // (z = 0), not at the drawn arm's slight downrange offset: the plate is hinged to the
    // arm along its own face, and using the arm's z would shove the plate 3 cm downrange
    // as it folded.
    //
    // THE AXIS IS PER-ARM. It is the TANGENTIAL direction (`starArmTangentUnit`), not the
    // carrier frame's fixed X — folding every arm about X sent arms 2 and 3 toward the
    // shooter and dragged 1 and 4 sideways off their hinge lines. See that function's
    // docstring for the measured numbers.
    const hingeR = starHingeRadiusM(entry.radiusM, entry.plate.diameterM);
    const hinge = starArmOffsetAt(entry.restAngleRad, hingeR);
    const rest = starArmOffsetAt(entry.restAngleRad, entry.radiusM);
    const tangent = starArmTangentUnit(entry.restAngleRad);

    starHubT.makeTranslation(entry.hub.x, entry.hub.y, entry.hub.z);
    starQuat.setFromAxisAngle(CARRIER_AXIS, starCarrierRotationZ(timeS, entry.spec));
    starCarrier.makeRotationFromQuaternion(starQuat);
    starToHinge.makeTranslation(-hinge.dx, -hinge.dy, 0);
    starFromHinge.makeTranslation(hinge.dx, hinge.dy, 0);
    foldAxis.set(tangent.dx, tangent.dy, 0);
    starFold
      .makeRotationAxis(foldAxis, -entry.state.angleRad)
      .premultiply(starFromHinge)
      .multiply(starToHinge);
    starPos.set(rest.dx, rest.dy, 0);
    starRest.compose(starPos, IDENTITY_QUAT, entry.scale);

    mat.copy(starHubT).multiply(starCarrier).multiply(starFold).multiply(starRest);
    const slot = plateMeshSlot(scene, id);
    slot.mesh.setMatrixAt(slot.index, mat);
    slot.mesh.instanceMatrix.needsUpdate = true;
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

  /**
   * Stand every knocked-down target back up — optionally only one group's.
   *
   * A plain function rather than only a method, because there are now TWO callers: the
   * controller's own `resetDownTargets` (which COMMIT uses to re-arm the range) and the
   * `'reset-switch'` strike branch, where the popper star's hub plate re-arms its arms.
   * A method calling itself through `this` would work but ties the branch to how the
   * object happens to be constructed.
   */
  function resetDown(groupId?: string): void {
    // Omitted groupId ⇒ every knockdown on the range. A group is one piece of
    // furniture, so resetting by group stands a whole plate rack up together.
    for (const [id, entry] of knocked) {
      if (groupId !== undefined && entry.plate.groupId !== groupId) continue;
      if (entry.state.phase === 'standing') continue;
      entry.state = resetKnockdown();
      poseKnockdown(id, entry);
    }
    // Star arms latch down forever (`STAR_LATCH_UNTIL_RESET`), so this is the ONLY way
    // one comes back up. Re-posed at the last known carrier time so a raised plate
    // appears on its arm rather than at its authored t=0 position.
    for (const [id, entry] of stars) {
      if (groupId !== undefined && entry.plate.groupId !== groupId) continue;
      if (entry.state.phase === 'standing') continue;
      entry.state = resetKnockdown();
      poseStar(id, entry, starTimeS);
    }
  }

  // Rotors are the one thing that must exist before anything is shot, so the scan runs
  // now rather than on first impact.
  scanStarRotors();

  return {
    onImpact({ plate, impactWorld, impactVel, bulletMassKg, bulletDiameterM }): void {
      const mode = reactionModeOf(plate);

      // RESET SWITCH — the popper star's hub plate. Bolted steel that takes paint like
      // any other plate, plus one side effect: it re-arms a group.
      //
      // The group comes from the PLATE, not the mount (`resetsGroupId`), which is what
      // keeps this mount reusable for a second star or a future plate rack. A switch
      // with no group named is a data error the placement loader already rejects, so
      // reaching here without one means something bypassed it — take the paint and warn
      // rather than throw mid-engagement.
      if (mode === 'reset-switch') {
        const reaction = targetFor(plate);
        reaction.strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM);
        paint(plate, reaction);
        if (plate.resetsGroupId === undefined) {
          console.warn(
            `steel-reactions: reset-switch plate '${plate.rackId}' has no resetsGroupId, so a hit resets nothing`,
          );
          return;
        }
        resetDown(plate.resetsGroupId);
        return;
      }

      // STAR ARM. The plate takes paint like any other, but two corrections have to be
      // applied first, because the engine's target believes it is still sitting at the
      // authored position with no rotation — and a star plate is essentially NEVER
      // there. Without both, every splat on every arm lands wrong.
      if (mode === 'star-arm') {
        const entry = stars.get(plate.instanceId);
        // No entry means the scan skipped it (a star-arm plate with no groupId). Take
        // the paint and nothing else rather than throwing mid-engagement.
        if (!entry) {
          const reaction = targetFor(plate);
          reaction.strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM);
          paint(plate, reaction);
          return;
        }
        const reaction = targetFor(plate);
        // (1) ORIENTATION: the plate is bolted to a turning arm, so its own frame is
        // rotated by the carrier angle. `recordImpact` picks the texture half from
        // `vel · normal_` and stores the impact at `inverse(orientation_)·(impact −
        // position_)`, so without this the splat is placed as if the plate had never
        // turned — the same defect `poseFlip`'s `setOrientation` call fixed for paddles.
        starQuat.setFromAxisAngle(CARRIER_AXIS, starCarrierRotationZ(starTimeS, entry.spec));
        reaction.setOrientation({
          x: starQuat.x,
          y: starQuat.y,
          z: starQuat.z,
          w: starQuat.w,
        });
        // (2) POSITION: there is no `setPosition` on the native target, so the IMPACT
        // moves into the frame the engine still believes it occupies. A star plate is
        // up to 1.2 m from its build position, so on a 25 cm face this is the
        // difference between a mark where the bullet hit and one clamped to the rim.
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
        // (3) THE FOLD. Reuses `knockdown.ts` unchanged; what differs from a ground
        // popper is only the MOMENT ARM — radial along the arm from the hinge at the
        // plate's inner rim, not height above a hinge at its base. A hit on the hinge
        // line imparts no rotation, one at the outer rim the most.
        const angle = starArmAngleAt(entry.restAngleRad, starTimeS, entry.spec);
        const hingeOff = starArmOffsetAt(angle, starHingeRadiusM(entry.radiusM, plate.diameterM));
        const speed = Math.hypot(impactVel.x, impactVel.y, impactVel.z);
        entry.state = strikeKnockdown(
          entry.state,
          seedFallRate({
            impulseNs: bulletMassKg * speed,
            impactHeightM: starFoldMomentArmM(
              { x: entry.hub.x + hingeOff.dx, y: entry.hub.y + hingeOff.dy },
              impactWorld,
              starArmOffsetAt(angle, 1),
            ),
            massKg: steelPlateMassKg(plate.diameterM, plate.diameterM, PLATE_THICKNESS_M),
            stemLengthM: entry.cfg.stemLengthM,
          }),
        );
        return;
      }

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

    update(dt: number, timeS = 0): void {
      // Star rotors first, and unconditionally: they turn whether or not anything has
      // been struck, and their pose is a pure function of `timeS` rather than an
      // integration of `dt` — which is what keeps them locked to the drawn arms
      // `TestRangeScene` spins from the same value.
      starTimeS = timeS;
      for (const [id, entry] of stars) {
        // Advance the FOLD before posing, so the pose uses this frame's angle. A latched
        // plate is a no-op here (`stepKnockdown` cannot leave `down` at an infinite
        // dwell) but still gets re-posed, because the carrier under it keeps turning —
        // a folded plate rides round on its arm rather than stopping with it.
        entry.state = stepKnockdown(entry.state, dt, entry.cfg);
        poseStar(id, entry, timeS);
      }
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
      resetDown(groupId);
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
      // A folded star arm is out of play exactly as a downed popper is — ScopeView reads
      // this before `resolveShot`, so the plate leaves both the hit test AND the
      // aimed-plate pick while it is down.
      const star = stars.get(instanceId);
      if (star) return isStandingPhase(star.state.phase);
      const entry = knocked.get(instanceId);
      // A plate with no knockdown state has never been knocked (or cannot be), so it
      // is standing — which is what keeps every non-knockdown plate in play.
      return entry ? isStandingPhase(entry.state.phase) : true;
    },

    rotorPositionAt(instanceId, timeS, aheadS) {
      const entry = stars.get(instanceId);
      if (!entry) return null;
      const angle = starArmAngleAt(entry.restAngleRad, timeS + aheadS, entry.spec);
      const centre = starArmOffsetAt(angle, entry.radiusM);
      return { x: entry.hub.x + centre.dx, y: entry.hub.y + centre.dy };
    },

    dispose(): void {
      if (deleted) return;
      deleted = true;
      // Every moving entry ALIASES a `targets` entry, so freeing via `targets` frees
      // each native handle exactly once.
      moving.clear();
      knocked.clear();
      flipped.clear();
      stars.clear();
      for (const target of targets.values()) target.delete();
      targets.clear();
    },
  };
}
