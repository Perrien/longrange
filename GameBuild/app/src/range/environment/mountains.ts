// Distant mountains for the environment module. Stage 4b of
// `Design/archive/mil-zero-range-plan.md` replaced the ring of instanced cones
// with overlapping ridge silhouettes.
//
// WHY THE CONES DIDN'T WORK. Twelve textured cones scattered on a ring give the
// eye a countable set of separate solids at a measurable spacing — which reads
// as props placed on a stage, not as landscape. Real distance reads as
// *overlapping silhouettes* at different depths, with the further ones paler.
// Two continuous ridgelines deliver that directly, and cost less: a couple of
// hundred triangles in two draw calls instead of an instanced cone mesh with a
// canvas-gradient texture.
//
// The material is deliberately UNLIT (`MeshBasicMaterial`). At a kilometre-plus,
// shading detail is invisible, and an unlit flat colour is the one thing that
// makes aerial perspective predictable: the rendered pixel is exactly
// `mix(ridgeColor, fogColor, fogFactor)`. That predictability is the direct
// answer to the earlier saga where two rounds of darkening the mountain texture
// produced no visible change, because linear fog had saturated it to ~99% fog
// colour regardless of albedo.

import * as THREE from 'three';
import { generateRidgeProfile, RIDGE_BASE_Y_M, type EnvironmentConfig } from './environment-config';
import type { TrackFn } from './track';

export interface MountainsHandle {
  meshes: THREE.Mesh[];
}

/**
 * Build one strip mesh per ridge layer. Each strip is a triangle band between
 * the crest polyline and a base line carried below the horizon, so the ridge
 * meets the skyline with no sliver of sky beneath it.
 */
export function buildMountains(scene: THREE.Scene, cfg: EnvironmentConfig, track: TrackFn): MountainsHandle {
  const meshes: THREE.Mesh[] = [];

  cfg.ridges.layers.forEach((layer, layerIndex) => {
    const crest = generateRidgeProfile(cfg, layerIndex);
    const n = crest.length;

    // Two vertices per sample: crest and base.
    const positions = new Float32Array(n * 2 * 3);
    for (let i = 0; i < n; i++) {
      const p = crest[i];
      positions[i * 6 + 0] = p.x;
      positions[i * 6 + 1] = p.y;
      positions[i * 6 + 2] = p.z;
      positions[i * 6 + 3] = p.x;
      positions[i * 6 + 4] = RIDGE_BASE_Y_M;
      positions[i * 6 + 5] = p.z;
    }

    // Two triangles per gap, wound so the strip faces the shooter at the origin.
    const indices: number[] = [];
    for (let i = 0; i < n - 1; i++) {
      const c0 = i * 2;
      const b0 = i * 2 + 1;
      const c1 = (i + 1) * 2;
      const b1 = (i + 1) * 2 + 1;
      indices.push(c0, b0, b1, c0, b1, c1);
    }

    const geo = track(new THREE.BufferGeometry());
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setIndex(indices);

    const mat = track(
      new THREE.MeshBasicMaterial({
        color: layer.colorHex,
        // DoubleSide so a winding mistake can never produce an invisible ridge —
        // this is a silhouette a kilometre away, the back faces cost nothing.
        side: THREE.DoubleSide,
        // Fog is the whole point: it is what separates the layers in depth.
        fog: true,
      }),
    );

    const mesh = new THREE.Mesh(geo, mat);
    // Behind everything except the sky dome (-1). No depth writes needed at this
    // distance, but leave depth testing on so nothing odd happens if a future
    // range puts geometry out here.
    mesh.renderOrder = 0;
    mesh.frustumCulled = false;
    scene.add(mesh);
    meshes.push(mesh);
  });

  return { meshes };
}
