// Tree instancing for the environment module. Stage 4a of
// `Design/archive/mil-zero-range-plan.md` replaced the single-silhouette forest
// with per-species shape VARIANTS, independent height/breadth scaling, a small
// per-tree lean, and baked canopy shading.
//
// WHAT WAS WRONG BEFORE. Every conifer was the identical 3-cone stack and every
// broadleaf the identical 4-icosahedron blob, varied only by UNIFORM scale and
// Y rotation. That is the main reason the woods read as synthetic: the eye
// detects "one object repeated" almost instantly, and no amount of palette
// tuning hides it. Uniform scaling in particular makes the repetition obvious,
// because every tree is provably the same shape at a different size.
//
// Draw-call cost: one InstancedMesh per (kind, variant) for canopies plus one
// trunk mesh per kind — 3x2 + 2 = 8 total for a ~300-tree forest. The previous
// version used 4. Placement stays a single deterministic pass.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { loadPbrMaterial } from './texture-loader';
import { TREE_VARIANTS_PER_KIND, type EnvironmentConfig, type TreePlacement } from './environment-config';
import type { TrackFn } from './track';

export interface TreesHandle {
  meshes: THREE.Object3D[];
}

const SINK_M = 0.2; // trunk base sinks slightly so no visible gap over uneven terrain

/** How dark the underside/interior of a canopy goes, relative to its lit top.
 *  This is cheap fake self-shadowing — real shadow maps do not help inside a
 *  canopy, and it is what stops a tree reading as a flat cut-out. */
const CANOPY_SHADE_FLOOR = 0.55;

interface ConiferTier {
  radius: number;
  height: number;
  y: number;
}

/** Three conifer silhouettes: a classic spruce, a tall narrow fir, and a squat
 *  wind-shaped tree. Kept as tier tables so the shapes stay readable. */
const CONIFER_VARIANTS: ConiferTier[][] = [
  [
    { radius: 1.6, height: 2.6, y: 3.2 },
    { radius: 1.25, height: 2.2, y: 4.6 },
    { radius: 0.85, height: 1.8, y: 5.9 },
  ],
  [
    { radius: 1.25, height: 2.8, y: 3.0 },
    { radius: 1.05, height: 2.5, y: 4.6 },
    { radius: 0.8, height: 2.2, y: 6.1 },
    { radius: 0.5, height: 1.8, y: 7.4 },
  ],
  [
    { radius: 1.95, height: 2.4, y: 2.6 },
    { radius: 1.4, height: 2.0, y: 3.9 },
  ],
];

interface Blob {
  r: number;
  x: number;
  y: number;
  z: number;
}

/** Three broadleaf crowns: the original clump, a tall narrow crown, and a broad
 *  spreading one. */
const DECIDUOUS_VARIANTS: Blob[][] = [
  [
    { r: 1.6, x: 0, y: 3.8, z: 0 },
    { r: 1.3, x: 0.9, y: 3.8, z: 0 },
    { r: 1.2, x: -0.7, y: 3.8, z: 0.6 },
    { r: 1.0, x: 0.2, y: 3.8, z: -0.9 },
  ],
  [
    { r: 1.15, x: 0, y: 4.0, z: 0 },
    { r: 1.0, x: 0.4, y: 4.9, z: 0.2 },
    { r: 0.85, x: -0.3, y: 5.6, z: -0.2 },
  ],
  [
    { r: 1.5, x: 0, y: 3.4, z: 0 },
    { r: 1.35, x: 1.4, y: 3.5, z: 0.3 },
    { r: 1.3, x: -1.3, y: 3.4, z: -0.4 },
    { r: 1.1, x: 0.3, y: 3.3, z: 1.4 },
    { r: 1.05, x: -0.4, y: 3.6, z: -1.3 },
  ],
];

/**
 * Bake a vertical shade gradient into the geometry's `color` attribute: dark at
 * the canopy base, full brightness at the top, with downward-facing surfaces
 * pushed darker still.
 *
 * GOTCHA THIS DELIBERATELY AVOIDS. `trees.ts` previously carried a comment about
 * `vertexColors: true` with no bound `color` attribute rendering solid black —
 * the shader multiplies every vertex by an unbound (zero) attribute. That is why
 * this function ALWAYS writes the attribute, and why the material only sets
 * `vertexColors` when it is called. The per-tree palette tint still arrives
 * separately via `InstancedMesh.setColorAt`; THREE multiplies instance colour by
 * vertex colour, so the two compose as tint x shade.
 */
function bakeCanopyShading(geo: THREE.BufferGeometry): THREE.BufferGeometry {
  geo.computeBoundingBox();
  const bbox = geo.boundingBox!;
  const minY = bbox.min.y;
  const spanY = Math.max(1e-6, bbox.max.y - minY);

  const pos = geo.attributes.position;
  const normal = geo.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    const heightFrac = (pos.getY(i) - minY) / spanY;
    // Downward-facing surfaces are the ones a sky-dominated fill would leave
    // dark in reality, so bias them further down.
    const facing = normal ? Math.max(0, -normal.getY(i)) : 0;
    const shade = CANOPY_SHADE_FLOOR + (1 - CANOPY_SHADE_FLOOR) * heightFrac * (1 - 0.45 * facing);
    colors[i * 3] = shade;
    colors[i * 3 + 1] = shade;
    colors[i * 3 + 2] = shade;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return geo;
}

function buildConiferCanopy(variant: number): THREE.BufferGeometry {
  const cones = CONIFER_VARIANTS[variant].map(({ radius, height, y }) => {
    const geo = new THREE.ConeGeometry(radius, height, 7);
    geo.translate(0, y, 0);
    return geo;
  });
  return bakeCanopyShading(mergeGeometries(cones));
}

function buildDeciduousCanopy(variant: number): THREE.BufferGeometry {
  const shapes = DECIDUOUS_VARIANTS[variant].map(({ r, x, y, z }) => {
    const geo = new THREE.IcosahedronGeometry(r, 1);
    geo.translate(x, y, z);
    return geo;
  });
  return bakeCanopyShading(mergeGeometries(shapes));
}

export function buildTrees(
  scene: THREE.Scene,
  cfg: EnvironmentConfig,
  placements: TreePlacement[],
  track: TrackFn,
  /** Optional wind sway — patches the canopy material so crowns bend with the
   *  real wind field (Stage 5). Trunks are left alone: a swaying trunk base
   *  would separate from the ground. */
  sway?: { patch(material: THREE.Material): void },
): TreesHandle {
  const { palette } = cfg.trees;
  const meshes: THREE.Object3D[] = [];

  const bark = track(
    loadPbrMaterial({
      basePath: 'textures/bark/Bark012_1K-JPG',
      repeat: [1, 2],
      fallbackColor: 0x4a3728,
    }),
  );

  // No `flatShading` — ConeGeometry/IcosahedronGeometry already carry smooth
  // analytic normals, so leaving shading smooth interpolates across faces
  // instead of forcing a hard facet look (owner request 2026-07-21).
  const canopyMaterial = track(new THREE.MeshStandardMaterial({ roughness: 1, vertexColors: true }));
  // One shared material across every (kind, variant) mesh, so a single patch
  // animates the whole forest.
  sway?.patch(canopyMaterial);

  const buildKind = (
    kind: 'conifer' | 'deciduous',
    trunkHeight: number,
    trunkRadii: [number, number],
    canopyFor: (variant: number) => THREE.BufferGeometry,
  ) => {
    const all = placements.filter((p) => p.kind === kind);

    // CylinderGeometry is centred on its own origin; translate up by half its
    // height so the base sits at local y=0 — the same origin the placement
    // matrix uses, so the trunk stands on the ground rather than half-burying
    // itself and leaving a gap below the canopy.
    const trunkGeo = track(new THREE.CylinderGeometry(trunkRadii[0], trunkRadii[1], trunkHeight, 7));
    trunkGeo.translate(0, trunkHeight / 2, 0);
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, bark.material, Math.max(all.length, 1));
    writeMatrices(trunkMesh, all);
    trunkMesh.count = all.length;
    scene.add(trunkMesh);
    meshes.push(trunkMesh);

    for (let v = 0; v < TREE_VARIANTS_PER_KIND; v++) {
      const forVariant = all.filter((p) => p.variantIndex === v);
      const geo = track(canopyFor(v));
      const mesh = new THREE.InstancedMesh(geo, canopyMaterial, Math.max(forVariant.length, 1));
      writeMatrices(mesh, forVariant);
      writeTints(mesh, forVariant, palette);
      mesh.count = forVariant.length;
      scene.add(mesh);
      meshes.push(mesh);
    }
  };

  buildKind('conifer', 2.2, [0.12, 0.18], buildConiferCanopy);
  buildKind('deciduous', 2.6, [0.14, 0.2], buildDeciduousCanopy);

  return { meshes };
}

/** Compose position + yaw + lean + non-uniform scale for each placement. */
function writeMatrices(mesh: THREE.InstancedMesh, placements: TreePlacement[]): void {
  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const euler = new THREE.Euler();
  const scaleV = new THREE.Vector3();

  placements.forEach((p, i) => {
    pos.set(p.x, p.y - SINK_M, p.z);
    // YXZ so the lean is applied in world-ish terms after the yaw, which keeps
    // a leaning tree leaning the same way regardless of which way it faces.
    euler.set(p.tiltX, p.rotationY, p.tiltZ, 'YXZ');
    quat.setFromEuler(euler);
    scaleV.set(p.scaleXZ, p.scaleY, p.scaleXZ);
    m.compose(pos, quat, scaleV);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
}

function writeTints(mesh: THREE.InstancedMesh, placements: TreePlacement[], palette: number[]): void {
  const tint = new THREE.Color();
  placements.forEach((p, i) => {
    tint.set(palette[p.tintIndex % palette.length]);
    mesh.setColorAt(i, tint);
  });
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}
