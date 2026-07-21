// Gradient sky dome for the environment module (Stage 2 of
// Design/Plans/test-range-environment-plan.md). Replaces the flat
// `scene.background` color with a horizon/mid/zenith dome and switches
// distance fog on — fog color is set equal to the dome's horizon color so
// fogged geometry dissolves into the sky rather than a mismatched grey wall.

import * as THREE from 'three';
import type { EnvironmentConfig } from './environment-config';
import type { TrackFn } from './track';

export interface SkyHandle {
  mesh: THREE.Mesh;
}

const VERTEX_SHADER = `
  varying float vWorldY;
  void main() {
    vec4 worldPosition = modelMatrix * vec4(position, 1.0);
    vWorldY = normalize(worldPosition.xyz).y;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform vec3 horizonColor;
  uniform vec3 midColor;
  uniform vec3 zenithColor;
  varying float vWorldY;
  void main() {
    float t = clamp(vWorldY, 0.0, 1.0);
    vec3 color = t < 0.35
      ? mix(horizonColor, midColor, smoothstep(0.0, 0.35, t))
      : mix(midColor, zenithColor, smoothstep(0.35, 1.0, t));
    gl_FragColor = vec4(color, 1.0);
  }
`;

export function buildSky(scene: THREE.Scene, cfg: EnvironmentConfig, track: TrackFn): SkyHandle {
  const geo = track(new THREE.SphereGeometry(cfg.sky.domeRadiusM, 32, 15));
  const mat = track(
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        horizonColor: { value: new THREE.Color(cfg.sky.horizonHex) },
        midColor: { value: new THREE.Color(cfg.sky.midHex) },
        zenithColor: { value: new THREE.Color(cfg.sky.zenithHex) },
      },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
    }),
  );
  const mesh = new THREE.Mesh(geo, mat);
  mesh.renderOrder = -1;
  mesh.frustumCulled = false;
  scene.add(mesh);

  scene.background = null; // the dome covers everything
  scene.fog = new THREE.Fog(cfg.fog.colorHex, cfg.fog.nearM, cfg.fog.farM);

  return { mesh };
}
