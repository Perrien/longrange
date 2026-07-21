// Lighting for the environment module (Stage 2 of
// Design/Plans/test-range-environment-plan.md). No shadow-map config — the
// renderer never enables `shadowMap` (verified against ScopeView.tsx), so all
// `castShadow`/`receiveShadow` flags would be inert; skip them entirely.

import * as THREE from 'three';

export interface LightingHandle {
  lights: THREE.Object3D[];
}

export function buildLighting(scene: THREE.Scene): LightingHandle {
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x5a6b46, 0.9);
  const sun = new THREE.DirectionalLight(0xfff2dc, 1.5);
  sun.position.set(-250, 350, 150);

  scene.add(hemi);
  scene.add(sun);

  return { lights: [hemi, sun] };
}
