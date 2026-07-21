// The contract between ScopeView's steel fire path / reaction loop and any
// steel scene builder. Extracted (Test Range plan, Stage 1) from what fireSteel
// and the per-frame reaction loop actually touch on RangeScene — see
// ScopeView.tsx fireSteel + the reactions loop. RangeScene and TestRangeScene
// both satisfy this structurally.

import type * as THREE from 'three';
import type { PlateInstance } from './RangeScene';
import type { PlateSurface } from './plate-surface';

export interface SteelSceneApi {
  plates: PlateInstance[];
  plateMesh: THREE.InstancedMesh;
  plateSurface: PlateSurface;
  chainMesh: THREE.InstancedMesh;
  /** Rest transform per chain instance; chains for plate `id` are id*2, id*2+1. */
  chainRest: THREE.Matrix4[];
  /** Optional per-frame environment animation (cloud drift etc.). windVec is the
   *  dialed mean wind in world m/s. RangeScene doesn't implement it — callers
   *  must use `scene.update?.(…)`. */
  update?(dt: number, timeS: number, windVec: { x: number; y: number; z: number }): void;
  dispose(): void;
}
