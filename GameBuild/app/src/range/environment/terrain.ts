// Terrain mesh for the environment module (Stage 2 of
// Design/Plans/test-range-environment-plan.md). Displaces a plane through the
// shared `makeTerrainSampler` height function so the lane, the tree/scatter
// placements, and the rendered ground all agree on the same heights.

import * as THREE from 'three';
import { loadPbrMaterial } from './texture-loader';
import type { EnvironmentConfig } from './environment-config';
import type { TrackFn } from './track';

export interface TerrainHandle {
  meshes: THREE.Object3D[];
}

/** Pure geometry step, split out from `buildTerrain` so it's directly
 *  vitest-able without touching `loadPbrMaterial`'s DOM-dependent texture
 *  loading (`THREE.TextureLoader`/`Image` aren't available under node-env
 *  vitest). Builds the displaced-lane plane and returns it pre-rotation so
 *  callers can assert against `sampler`'s own (x, z) convention directly. */
export function buildLaneGeometry(
  cfg: EnvironmentConfig,
  sampler: (x: number, z: number) => number,
): THREE.PlaneGeometry {
  const { widthM, lengthM } = cfg.terrain;
  const laneGeo = new THREE.PlaneGeometry(widthM, lengthM, 96, 192);
  const pos = laneGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const yLocal = pos.getY(i);
    pos.setZ(i, sampler(x, -yLocal - lengthM / 2));
  }
  pos.needsUpdate = true;
  laneGeo.computeVertexNormals();
  return laneGeo;
}

export function buildTerrain(
  scene: THREE.Scene,
  cfg: EnvironmentConfig,
  sampler: (x: number, z: number) => number,
  track: TrackFn,
): TerrainHandle {
  const { widthM, lengthM } = cfg.terrain;

  // Displace in the plane's local frame (x, y) BEFORE rotating flat: local
  // (x, y) maps to world (x, −y − lengthM/2) once rotated -Math.PI/2 about X
  // and translated by `position.z = -lengthM/2` below — so the height at each
  // vertex must be sampled at that SAME world z, not just `-yLocal` (that was
  // off by lengthM/2: the terrain right at the target was being height-sampled
  // ~250 m further downrange than it actually renders, i.e. well past
  // `zFlatToM`/`zBlendM`'s unlock point, so a relief bump always showed up
  // right at the target regardless of any hill/mask tuning — see
  // Design/execution/PROGRESS.md Stage-2 Iter 5). `buildLaneGeometry` above
  // owns the actual displacement math now, tested directly.
  const laneGeo = track(buildLaneGeometry(cfg, sampler));

  const grass = track(
    loadPbrMaterial({
      basePath: 'textures/grass/Grass004_1K-JPG',
      repeat: [widthM / 8, lengthM / 8],
      fallbackColor: 0x7d9450,
    }),
  );
  const laneMesh = new THREE.Mesh(laneGeo, grass.material);
  laneMesh.rotation.x = -Math.PI / 2;
  laneMesh.position.z = -lengthM / 2;
  scene.add(laneMesh);

  const dirt = track(
    loadPbrMaterial({
      basePath: 'textures/dirt/Ground082S_1K-JPG',
      repeat: [60, 60],
      fallbackColor: 0xb89d6f,
    }),
  );
  const dirtGeo = track(new THREE.PlaneGeometry(widthM * 3, lengthM * 3));
  const dirtMesh = new THREE.Mesh(dirtGeo, dirt.material);
  dirtMesh.rotation.x = -Math.PI / 2;
  dirtMesh.position.set(0, -0.15, -lengthM / 2);
  scene.add(dirtMesh);

  return { meshes: [laneMesh, dirtMesh] };
}
