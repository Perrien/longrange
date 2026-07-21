// Environment module entry point (Stage 2 of
// Design/Plans/test-range-environment-plan.md). Wires sampler → lighting →
// sky/fog → terrain and owns the RangeScene-style `objects[]`/`disposables[]`
// bookkeeping so `dispose()` cleans up everything it built. Stage 4 adds
// mountains + drifting clouds.

import * as THREE from 'three';
import {
  generateCloudPlacements,
  generateMountainPlacements,
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
import type { TrackFn } from './track';

export interface EnvironmentHandle {
  getTerrainHeight(x: number, z: number): number;
  /** Drifts clouds with the dialed wind (`windVec`); everything else is
   *  static once built. */
  update(dt: number, timeS: number, windVec: { x: number; y: number; z: number }): void;
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

  const lighting = buildLighting(scene);
  objects.push(...lighting.lights);

  const sky = buildSky(scene, cfg, track);
  objects.push(sky.mesh);

  const terrain = buildTerrain(scene, cfg, sampler, track);
  objects.push(...terrain.meshes);

  const trees = buildTrees(scene, cfg, generateTreePlacements(cfg), track);
  objects.push(...trees.meshes);

  // Own PRNG stream (seed+4) for ground-cover VISUAL variation (bush tint,
  // rock jitter/scale/rotation) — distinct from generateScatterPlacements'
  // own seed+1 stream, which only ever decides WHERE things go.
  const coverRand = mulberry32(cfg.seed + 4);
  const groundCover = buildGroundCover(scene, generateScatterPlacements(cfg), coverRand, track);
  objects.push(...groundCover.meshes);

  const mountains = buildMountains(scene, generateMountainPlacements(cfg), track);
  objects.push(mountains.mesh);

  const clouds = buildClouds(scene, cfg, generateCloudPlacements(cfg), track);
  objects.push(clouds.mesh);

  return {
    getTerrainHeight(x: number, z: number): number {
      return sampler(x, z);
    },
    update(dt, _timeS, windVec): void {
      clouds.update(dt, windVec);
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

