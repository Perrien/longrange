// Tree instancing for the environment module (Stage 3 of
// Design/Plans/test-range-environment-plan.md). Four InstancedMeshes total —
// conifer trunk/canopy, deciduous trunk/canopy — so a ~190-tree forest costs
// four draw calls, not 190. Canopies are pre-merged into one BufferGeometry
// per kind (three cones for conifers, four lumpy icosahedra for deciduous) so
// each tree is still a single instance.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadPbrMaterial } from './texture-loader';
import type { EnvironmentConfig, TreePlacement } from './environment-config';
import type { TrackFn } from './track';

export interface TreesHandle {
  meshes: THREE.Object3D[];
}

const SINK_M = 0.2; // trunk base sinks slightly so no visible gap over uneven terrain

function buildConiferCanopyGeometry(): THREE.BufferGeometry {
  const tiers = [
    { radius: 1.6, height: 2.6, y: 3.2 },
    { radius: 1.25, height: 2.2, y: 4.6 },
    { radius: 0.85, height: 1.8, y: 5.9 },
  ];
  const cones = tiers.map(({ radius, height, y }) => {
    const geo = new THREE.ConeGeometry(radius, height, 7);
    geo.translate(0, y, 0);
    return geo;
  });
  return mergeGeometries(cones);
}

function buildDeciduousCanopyGeometry(): THREE.BufferGeometry {
  const blobs = [
    { r: 1.6, x: 0, z: 0 },
    { r: 1.3, x: 0.9, z: 0 },
    { r: 1.2, x: -0.7, z: 0.6 },
    { r: 1.0, x: 0.2, z: -0.9 },
  ];
  const shapes = blobs.map(({ r, x, z }) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    geo.translate(x, 3.8, z);
    return geo;
  });
  return mergeGeometries(shapes);
}

export function buildTrees(
  scene: THREE.Scene,
  cfg: EnvironmentConfig,
  placements: TreePlacement[],
  track: TrackFn,
): TreesHandle {
  const { palette } = cfg.trees;
  const conifers = placements.filter((p) => p.kind === 'conifer');
  const deciduous = placements.filter((p) => p.kind === 'deciduous');

  const bark = track(
    loadPbrMaterial({
      basePath: 'textures/bark/Bark012_1K-JPG',
      repeat: [1, 2],
      fallbackColor: 0x4a3728,
    }),
  );

  // CylinderGeometry is centred on its own origin by default (spans
  // -height/2..+height/2); translate up by half its height so the base sits
  // at local y=0 — that's the same origin the placement matrix's `pos` uses,
  // so the trunk actually stands on the ground instead of half-burying itself
  // and leaving a gap below the canopy.
  const coniferTrunkHeight = 2.2;
  const coniferTrunkGeo = track(new THREE.CylinderGeometry(0.12, 0.18, coniferTrunkHeight, 7));
  coniferTrunkGeo.translate(0, coniferTrunkHeight / 2, 0);
  const coniferTrunkMesh = new THREE.InstancedMesh(coniferTrunkGeo, bark.material, Math.max(conifers.length, 1));
  const coniferCanopyGeo = track(buildConiferCanopyGeometry());
  // NOTE: no `vertexColors: true` here — the per-tree tint comes entirely
  // from InstancedMesh.setColorAt below (instance color, applied
  // independent of this flag). Setting `vertexColors: true` with no
  // geometry `color` attribute made the shader multiply every vertex by an
  // unbound (zero) attribute, rendering solid black regardless of palette or
  // instance tint (owner feedback 2026-07-21: canopy stayed "way too dark"
  // even after a full palette brightening pass produced zero visible
  // change — the tell that a value was being multiplied by zero, not just
  // under-lit).
  // No `flatShading` — ConeGeometry/IcosahedronGeometry already carry smooth
  // analytic normals (a cone's slant surface, an icosahedron's spherical
  // push-out), so leaving shading smooth interpolates across faces instead
  // of forcing the hard per-triangle facet look (owner feedback 2026-07-21:
  // "is it possible to smooth the edges without significant changes in the
  // geometry?") — no vertex/index changes needed, purely a shading flag.
  const coniferCanopyMat = track(new THREE.MeshStandardMaterial({ roughness: 1 }));
  const coniferCanopyMesh = new THREE.InstancedMesh(coniferCanopyGeo, coniferCanopyMat, Math.max(conifers.length, 1));

  const deciduousTrunkHeight = 2.6;
  const deciduousTrunkGeo = track(new THREE.CylinderGeometry(0.14, 0.2, deciduousTrunkHeight, 7));
  deciduousTrunkGeo.translate(0, deciduousTrunkHeight / 2, 0);
  const deciduousTrunkMesh = new THREE.InstancedMesh(deciduousTrunkGeo, bark.material, Math.max(deciduous.length, 1));
  const deciduousCanopyGeo = track(buildDeciduousCanopyGeometry());
  const deciduousCanopyMat = track(new THREE.MeshStandardMaterial({ roughness: 1 }));
  const deciduousCanopyMesh = new THREE.InstancedMesh(
    deciduousCanopyGeo,
    deciduousCanopyMat,
    Math.max(deciduous.length, 1),
  );

  writeInstances(coniferTrunkMesh, coniferCanopyMesh, conifers, palette);
  writeInstances(deciduousTrunkMesh, deciduousCanopyMesh, deciduous, palette);

  const meshes = [coniferTrunkMesh, coniferCanopyMesh, deciduousTrunkMesh, deciduousCanopyMesh];
  meshes.forEach((m) => {
    m.count = m === coniferTrunkMesh || m === coniferCanopyMesh ? conifers.length : deciduous.length;
    scene.add(m);
  });

  return { meshes };
}

function writeInstances(
  trunkMesh: THREE.InstancedMesh,
  canopyMesh: THREE.InstancedMesh,
  placements: TreePlacement[],
  palette: number[],
): void {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const tint = new THREE.Color();

  placements.forEach((p, i) => {
    pos.set(p.x, p.y - SINK_M, p.z);
    quat.setFromAxisAngle(new THREE.Vector3(0, 1, 0), p.rotationY);
    scaleV.set(p.scale, p.scale, p.scale);
    m.compose(pos, quat, scaleV);
    trunkMesh.setMatrixAt(i, m);
    canopyMesh.setMatrixAt(i, m);
    tint.set(palette[p.tintIndex % palette.length]);
    canopyMesh.setColorAt(i, tint);
  });

  trunkMesh.instanceMatrix.needsUpdate = true;
  canopyMesh.instanceMatrix.needsUpdate = true;
  if (canopyMesh.instanceColor) canopyMesh.instanceColor.needsUpdate = true;
}
