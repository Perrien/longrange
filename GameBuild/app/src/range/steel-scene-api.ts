// The contract between ScopeView's steel fire path / reaction loop and any
// steel scene builder. Extracted (Test Range plan, Stage 1) from what fireSteel
// and the per-frame reaction loop actually touch on RangeScene — see
// ScopeView.tsx fireSteel + the reactions loop. RangeScene and TestRangeScene
// both satisfy this structurally.

import type * as THREE from 'three';
import type { PlateInstance } from './RangeScene';
import type { PlateSurface } from './plate-surface';

export interface SteelSceneApi {
  /**
   * Shooter eye height above the world datum (m). Optional — omit for the flat
   * ranges, which all use ScopeView's `EYE_HEIGHT_M`.
   *
   * The paper-bay side already had this (`PaperBayScene.eyeHeightM`, added when the
   * Wooded Zero Range put the firing point on a knoll). The steel side needed it
   * once a steel range did the same: the ELR Range's high line stands on a platform,
   * and without this the camera stays at 1.6 m while the targets climb a hillside —
   * every sight line then runs into the ground.
   */
  eyeHeightM?: number;
  /**
   * Ground height (m) at a downrange distance (m). Optional — omit for flat ground,
   * which is every range but the ELR Range.
   *
   * Needed so a low miss draws its dust where the round actually strikes. The flat
   * assumption was invisible until a range had a hillside; on the ELR Range's convex
   * slope it would put the puff far past the real impact and underground.
   */
  groundYAt?(downrangeM: number): number;
  plates: PlateInstance[];
  plateMesh: THREE.InstancedMesh;
  plateSurface: PlateSurface;
  chainMesh: THREE.InstancedMesh;
  /** Rest transform per chain instance; chains for plate `id` are id*2, id*2+1. */
  chainRest: THREE.Matrix4[];
  /**
   * Where instance `id`'s matrix lives, when a scene draws more than one plate
   * SHAPE (task T5/T9b).
   *
   * A shape needs its own geometry and therefore its own `InstancedMesh`, but
   * `instanceId` must stay a single global space: it is simultaneously the paint
   * atlas layer index, the `chainRest[id*2+ci]` key, the reaction map key, and the
   * store's `currentTarget.plateInstanceId`. Per-mesh index spaces would break all
   * four. So a multi-shape scene keeps global ids and uses this to say which mesh
   * (and which local row) a given id lives in.
   *
   * OMIT for `{ mesh: plateMesh, index: instanceId }` — which is every shipped
   * range, so omitting it is a guarantee of no change.
   */
  meshFor?(instanceId: number): { mesh: THREE.InstancedMesh; index: number };
  /** Optional per-frame environment animation (cloud drift etc.). windVec is the
   *  dialed mean wind in world m/s. RangeScene doesn't implement it — callers
   *  must use `scene.update?.(…)`. */
  update?(
    dt: number,
    timeS: number,
    windVec: { x: number; y: number; z: number },
    /** The range's own wind sampler — drives canopy sway from the same wind the
     *  bullet gets (Stage 5, `environment/wind-sway.ts`). */
    sampleWindAt?: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
  ): void;
  dispose(): void;
}

/** Resolve a plate instance to the mesh row holding its matrix. Falls back to the
 *  single shared `plateMesh`, so a scene that never implements `meshFor` behaves
 *  exactly as it did before the field existed. */
export function plateMeshSlot(
  scene: Pick<SteelSceneApi, 'plateMesh' | 'meshFor'>,
  instanceId: number,
): { mesh: THREE.InstancedMesh; index: number } {
  return scene.meshFor?.(instanceId) ?? { mesh: scene.plateMesh, index: instanceId };
}
