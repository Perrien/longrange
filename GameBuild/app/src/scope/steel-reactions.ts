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
import type { KnockdownSpec } from '../range/targets/mount-type';

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

  // Scratch, reused per frame rather than allocated in the loop.
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const mat = new THREE.Matrix4();
  const hingeAxis = new THREE.Vector3(1, 0, 0); // topple away from the shooter, about X
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
      for (const target of targets.values()) target.delete();
      targets.clear();
    },
  };
}
