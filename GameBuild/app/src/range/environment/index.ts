// Environment module entry point (Stage 2 of
// Design/archive/test-range-environment-plan.md). Wires sampler → lighting →
// sky/fog → terrain and owns the RangeScene-style `objects[]`/`disposables[]`
// bookkeeping so `dispose()` cleans up everything it built. Stage 4 adds
// mountains + drifting clouds.

import * as THREE from 'three';
import {
  generateCloudPlacements,
  generateScatterPlacements,
  generateTreePlacements,
  makeTerrainSampler,
  mulberry32,
  type EnvironmentConfig,
} from './environment-config';
import { buildClouds } from './clouds';
import { buildGroundCover } from './ground-cover';
import { buildLighting } from './lighting';
import { buildMountains } from './mountains';
import { buildSky } from './sky';
import { buildTerrain } from './terrain';
import { buildTrees } from './trees';
import { createWindSway } from './wind-sway';
import type { TrackFn } from './track';

export interface EnvironmentHandle {
  /** True when this environment configured a shadow map — the scene uses it to
   *  decide whether to enable `renderer.shadowMap`, which is a RENDERER-level
   *  flag and therefore the one genuinely global piece of Stage 3. */
  readonly usesShadows: boolean;
  getTerrainHeight(x: number, z: number): number;
  /**
   * Per-frame animation. `windVec` is the dialled MEAN, used for cloud drift.
   * `sampleWindAt` is the range's own wind sampler — the SAME one its wind
   * markers use, and therefore the same wind its shots experience — used to
   * drive canopy sway. Omitting it leaves the canopies still.
   */
  update(
    dt: number,
    timeS: number,
    windVec: { x: number; y: number; z: number },
    sampleWindAt?: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
  ): void;
  dispose(): void;
}

export function buildEnvironment(scene: THREE.Scene, cfg: EnvironmentConfig): EnvironmentHandle {
  const objects: THREE.Object3D[] = [];
  const disposables: Array<{ dispose(): void }> = [];
  const track: TrackFn = (d) => {
    disposables.push(d);
    return d;
  };

  const sampler = makeTerrainSampler(cfg);

  const lighting = buildLighting(scene, cfg);
  objects.push(...lighting.lights);

  const sky = buildSky(scene, cfg, track);
  objects.push(sky.mesh);

  const terrain = buildTerrain(scene, cfg, sampler, track);
  objects.push(...terrain.meshes);

  const sway = createWindSway(cfg);
  disposables.push(sway);
  const trees = buildTrees(scene, cfg, generateTreePlacements(cfg), track, sway);
  objects.push(...trees.meshes);

  // Shadow participation (Stage 3, plan §9.2). Terrain only RECEIVES — a ground
  // plane casting onto itself is pure cost and pure acne. Trees do both, which
  // is what puts dappled light across the lanes. InstancedMesh casts correctly
  // as a single flagged object.
  if (cfg.lighting.shadows) {
    for (const m of terrain.meshes) m.receiveShadow = true;
    for (const m of trees.meshes) {
      m.castShadow = true;
      m.receiveShadow = true;
    }
  }

  // Own PRNG stream (seed+4) for ground-cover VISUAL variation (bush tint,
  // rock jitter/scale/rotation) — distinct from generateScatterPlacements'
  // own seed+1 stream, which only ever decides WHERE things go.
  const coverRand = mulberry32(cfg.seed + 4);
  const groundCover = buildGroundCover(scene, generateScatterPlacements(cfg), coverRand, track);
  objects.push(...groundCover.meshes);
  if (cfg.lighting.shadows) for (const m of groundCover.meshes) m.castShadow = true;

  const mountains = buildMountains(scene, cfg, track);
  objects.push(...mountains.meshes);

  const clouds = buildClouds(scene, cfg, generateCloudPlacements(cfg), track);
  objects.push(clouds.mesh);

  return {
    usesShadows: !!cfg.lighting.shadows,
    getTerrainHeight(x: number, z: number): number {
      return sampler(x, z);
    },
    update(dt, timeS, windVec, sampleWindAt): void {
      clouds.update(dt, windVec);
      if (sampleWindAt) sway.update(timeS, sampleWindAt);
    },
    dispose(): void {
      for (const o of objects) scene.remove(o);
      for (const d of disposables) d.dispose();
      objects.length = 0;
      disposables.length = 0;
      scene.fog = null;
    },
  };
}

