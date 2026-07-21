// Mountains for the environment module (Stage 4 of
// Design/Plans/test-range-environment-plan.md). Ported from BTK
// environment.js:266-343: one InstancedMesh of a snow-gradient-textured cone,
// Lambert-lit so distance fog naturally turns them into hazy silhouettes at
// 1000+ m — no separate haze pass needed.

import * as THREE from 'three';
import type { MountainPlacement } from './environment-config';
import type { TrackFn } from './track';

export interface MountainsHandle {
  mesh: THREE.InstancedMesh;
}

/** Vertical gradient: brown base → grey → white snow cap (BTK
 *  environment.js:301-306). Darkened twice per owner feedback 2026-07-21 —
 *  round 1 dimmed the brown/grey stops ~25%; round 2 ("mountains need to be
 *  darker") pushed base/grey darker again and dimmed the snow cap off pure
 *  white so it doesn't blow out against the darker body below it. */
function buildSnowGradientTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;
  const gradient = ctx.createLinearGradient(0, 256, 0, 0);
  gradient.addColorStop(0, '#332b23'); // brown base
  gradient.addColorStop(0.55, '#332b23');
  gradient.addColorStop(0.8, '#4d4d4d'); // grey
  gradient.addColorStop(1, '#dcdcdc'); // snow cap (off pure white)
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 256, 256);
  return new THREE.CanvasTexture(canvas);
}

export function buildMountains(scene: THREE.Scene, placements: MountainPlacement[], track: TrackFn): MountainsHandle {
  // Unit cone with its base translated to local y=0 (THREE's default is
  // centred, spanning -0.5..+0.5) so per-instance y=0 placement sits the
  // base on the ground instead of burying half the mountain below it — same
  // convention as the tree-trunk fix earlier in Stage 3.
  const geo = track(new THREE.ConeGeometry(1, 1, 8));
  geo.translate(0, 0.5, 0);
  const texture = track(buildSnowGradientTexture());
  const material = track(new THREE.MeshLambertMaterial({ map: texture }));
  const mesh = new THREE.InstancedMesh(geo, material, Math.max(placements.length, 1));

  const m = new THREE.Matrix4();
  const pos = new THREE.Vector3();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  const up = new THREE.Vector3(0, 1, 0);
  placements.forEach((p, i) => {
    pos.set(p.x, 0, p.z);
    quat.setFromAxisAngle(up, p.rotationY);
    scaleV.set(p.radius, p.height, p.radius);
    m.compose(pos, quat, scaleV);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = placements.length;
  scene.add(mesh);

  return { mesh };
}
