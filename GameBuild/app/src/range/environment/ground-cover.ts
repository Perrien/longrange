// Bush/rock/grass-tuft instancing for the environment module (Stage 3 of
// Design/Plans/test-range-environment-plan.md). Three InstancedMeshes, one
// per kind — matches the counts in `cfg.cover`, so this is still ~3 draw
// calls even at a few hundred grass tufts.

import * as THREE from 'three';
import { loadPbrMaterial } from './texture-loader';
import type { ScatterPlacement, ScatterPlacements } from './environment-config';
import type { TrackFn } from './track';

export interface GroundCoverHandle {
  meshes: THREE.Object3D[];
}

const BUSH_SINK_M = 0.1;
const ROCK_SINK_FRACTION = 0.3;

// Darker slice of the tree palette reads as undergrowth without a separate
// config knob. Brightened alongside the tree palette (owner feedback
// 2026-07-21 round 2: foliage under this lighting rig read as "very dark,
// nearly black" — see test-range-config.ts's `trees.palette` comment).
const BUSH_PALETTE = [0x4a7a2e, 0x5f9440, 0x4f8a30];

function writeScatterInstances(
  mesh: THREE.InstancedMesh,
  placements: ScatterPlacement[],
  sinkM: number,
  scaleMul: (s: number) => THREE.Vector3,
): void {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const up = new THREE.Vector3(0, 1, 0);

  placements.forEach((p, i) => {
    pos.set(p.x, p.y - sinkM, p.z);
    quat.setFromAxisAngle(up, p.rotationY);
    m.compose(pos, quat, scaleMul(p.scale));
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = placements.length;
}

function buildBushMesh(placements: ScatterPlacement[], rand: () => number, track: TrackFn): THREE.InstancedMesh {
  const geo = track(new THREE.IcosahedronGeometry(0.5, 1));
  // No `vertexColors: true` — tint comes entirely from InstancedMesh.setColorAt
  // below; the geometry has no `color` attribute, so that flag would multiply
  // every vertex by an unbound (zero) attribute and render solid black (same
  // bug as the tree canopy — see trees.ts).
  // No `flatShading` — IcosahedronGeometry already carries smooth spherical
  // normals, so leaving it off interpolates shading across faces instead of
  // the hard per-triangle facet look (matches the tree-canopy fix, same
  // owner feedback 2026-07-21).
  const material = track(new THREE.MeshStandardMaterial({ roughness: 1 }));
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(placements.length, 1));
  const color = new THREE.Color();
  placements.forEach((_, i) => {
    color.set(BUSH_PALETTE[Math.floor(rand() * BUSH_PALETTE.length)]);
    mesh.setColorAt(i, color);
  });
  writeScatterInstances(mesh, placements, BUSH_SINK_M, (s) => new THREE.Vector3(s, s * 0.65, s));
  return mesh;
}

/** Rock vertices are jittered once per unit geometry (±15%, seeded), then every
 *  instance reuses that single jittered shape at its own scale/rotation — a
 *  believable irregular boulder without a per-instance geometry cost. */
function buildJitteredRockGeometry(rand: () => number): THREE.BufferGeometry {
  const geo = new THREE.IcosahedronGeometry(0.4, 1);
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const jitter = 1 + (rand() * 2 - 1) * 0.15;
    pos.setXYZ(i, pos.getX(i) * jitter, pos.getY(i) * jitter, pos.getZ(i) * jitter);
  }
  pos.needsUpdate = true;
  geo.computeVertexNormals();
  return geo;
}

function buildRockMesh(
  scene: THREE.Scene,
  placements: ScatterPlacement[],
  rand: () => number,
  track: TrackFn,
): THREE.InstancedMesh {
  const geo = track(buildJitteredRockGeometry(rand));
  const rock = track(
    loadPbrMaterial({
      basePath: 'textures/rock/Rock030_256',
      repeat: [1, 1],
      fallbackColor: 0x8a8578,
    }),
  );
  const mesh = new THREE.InstancedMesh(geo, rock.material, Math.max(placements.length, 1));
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((p, i) => {
    const scale = 0.3 + rand() * 0.9; // 0.3–1.2
    pos.set(p.x, p.y - scale * ROCK_SINK_FRACTION, p.z);
    quat.setFromAxisAngle(up, rand() * Math.PI * 2);
    scaleV.set(scale, scale, scale);
    m.compose(pos, quat, scaleV);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = placements.length;
  scene.add(mesh);
  return mesh;
}

// Owner feedback 2026-07-21 (round 2): "grass sections much better but too
// tall, about half current height would be good" — halved from round 1's
// 0.42 baseline.
const GRASS_TALLEST_BLADE_M = 0.21;

/** One flat tapered triangle (wide base, pointed tip) — reads as a blade of
 *  grass, unlike a rectangular plane which reads as a flat green card. */
function buildGrassBladeGeometry(baseWidthM: number, heightM: number): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  const hw = baseWidthM / 2;
  const positions = new Float32Array([
    -hw, 0, 0,
    hw, 0, 0,
    0, heightM, 0,
  ]);
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setIndex([0, 1, 2]);
  return geo;
}

/** A small fan of 5 tapered blades around a centre point, each facing its own
 *  compass direction — reads as a clump of grass from any angle, instead of
 *  the single flat "green square" a crossed-quad gives up close (owner
 *  feedback 2026-07-21: the previous shape was "indistinct enough to not know
 *  what they're supposed to be"). Layout is baked once into the shared
 *  geometry (every instance reuses it via InstancedMesh); dark-base/light-tip
 *  vertex-color gradient stays from the original crossed-quad version.
 */
function buildGrassTuftGeometry(): THREE.BufferGeometry {
  const blades = [
    { angle: 0, radius: 0, height: GRASS_TALLEST_BLADE_M, width: 0.05 },
    { angle: (Math.PI * 2) / 5, radius: 0.06, height: 0.17, width: 0.045 },
    { angle: (Math.PI * 4) / 5, radius: 0.06, height: 0.19, width: 0.05 },
    { angle: (Math.PI * 6) / 5, radius: 0.06, height: 0.15, width: 0.04 },
    { angle: (Math.PI * 8) / 5, radius: 0.06, height: 0.18, width: 0.045 },
  ];

  const geos = blades.map(({ angle, radius, height, width }) => {
    const blade = buildGrassBladeGeometry(width, height);
    blade.rotateY(angle);
    blade.translate(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    return blade;
  });
  const geo = mergeManyGeometriesSimple(geos);

  const posAttr = geo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const darkBase = new THREE.Color(0x2e4d16);
  const lightTip = new THREE.Color(0x9dc35a);
  for (let i = 0; i < posAttr.count; i++) {
    const t = Math.min(1, Math.max(0, posAttr.getY(i) / GRASS_TALLEST_BLADE_M)); // 0 at base, 1 at tallest tip
    const c = darkBase.clone().lerp(lightTip, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

/** Local N-geometry merge (grass tufts are the only place this file needs
 *  it) — avoids pulling in BufferGeometryUtils' full merge for a handful of
 *  single-triangle blades. */
function mergeManyGeometriesSimple(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const geo = new THREE.BufferGeometry();
  let totalPos = 0;
  let totalIdx = 0;
  for (const g of geos) {
    totalPos += g.attributes.position.array.length;
    totalIdx += g.index!.array.length;
  }
  const mergedPos = new Float32Array(totalPos);
  const mergedIndex = new Uint16Array(totalIdx);
  let posOffset = 0;
  let idxOffset = 0;
  let vertOffset = 0;
  for (const g of geos) {
    const pos = g.attributes.position.array as Float32Array;
    mergedPos.set(pos, posOffset);
    const idx = g.index!.array;
    for (let i = 0; i < idx.length; i++) mergedIndex[idxOffset + i] = idx[i] + vertOffset;
    posOffset += pos.length;
    idxOffset += idx.length;
    vertOffset += pos.length / 3;
  }
  geo.setAttribute('position', new THREE.BufferAttribute(mergedPos, 3));
  geo.setIndex(new THREE.BufferAttribute(mergedIndex, 1));
  return geo;
}

function buildGrassTuftMesh(scene: THREE.Scene, placements: ScatterPlacement[], track: TrackFn): THREE.InstancedMesh {
  const geo = track(buildGrassTuftGeometry());
  const material = track(new THREE.MeshBasicMaterial({ vertexColors: true, side: THREE.DoubleSide }));
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(placements.length, 1));
  writeScatterInstances(mesh, placements, 0, (s) => new THREE.Vector3(s, s, s));
  scene.add(mesh);
  return mesh;
}

export function buildGroundCover(
  scene: THREE.Scene,
  placements: ScatterPlacements,
  rand: () => number,
  track: TrackFn,
): GroundCoverHandle {
  const bushMesh = buildBushMesh(placements.bushes, rand, track);
  scene.add(bushMesh);
  const rockMesh = buildRockMesh(scene, placements.rocks, rand, track);
  const grassMesh = buildGrassTuftMesh(scene, placements.grassTufts, track);

  return { meshes: [bushMesh, rockMesh, grassMesh] };
}
