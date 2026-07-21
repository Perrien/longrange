// Clouds for the environment module (Stage 4 of
// Design/Plans/test-range-environment-plan.md). Ported from BTK
// environment.js:345-518 (build) + 737-793 (update): a single InstancedMesh
// of billboards, each a per-instance-seeded procedural puffy-cloud shader —
// no image textures, no separate mesh per cloud. Drifts with the dialed MEAN
// wind (locked decision — no engine wind-field dependency, so clouds respond
// the instant the player dials wind) and wraps toroidally inside its field
// box so the sky stays uniformly populated instead of blowing out of view.

import * as THREE from 'three';
import {
  cloudEdgeOpacity,
  getCloudField,
  wrapToField,
  type CloudPlacement,
  type EnvironmentConfig,
} from './environment-config';
import type { TrackFn } from './track';

export interface CloudsHandle {
  mesh: THREE.InstancedMesh;
  update(dt: number, windVec: { x: number; y: number; z: number }): void;
}

// 5-octave value noise → puffy-silhouette alpha. Ported verbatim from BTK
// environment.js:403-428 (`cloudHash`/`cloudNoise`/`cloudFbm`/`cloudAlpha`),
// minus the `#include <logdepthbuf_*>` lines (this renderer has no log depth
// buffer) — and no `customDepthMaterial` port, since this scene casts no
// shadows.
const NOISE_GLSL = `
  float cloudHash(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123); }
  float cloudNoise(vec2 p){
    vec2 i = floor(p); vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    float a = cloudHash(i);
    float b = cloudHash(i + vec2(1.0, 0.0));
    float c = cloudHash(i + vec2(0.0, 1.0));
    float d = cloudHash(i + vec2(1.0, 1.0));
    return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
  }
  float cloudFbm(vec2 p){
    float v = 0.0; float a = 0.5;
    for (int k = 0; k < 5; k++){ v += a * cloudNoise(p); p = p * 2.0 + 7.3; a *= 0.5; }
    return v;
  }
  // Puffy cloud coverage in [0,1] over uv in [0,1], unique per seed.
  float cloudAlpha(vec2 uv, float seed){
    vec2 so = vec2(seed * 13.7, seed * 7.1);
    float n = cloudFbm(uv * 4.5 + so);
    vec2 c = uv - 0.5;
    c.y *= 1.7; // clouds are wider than tall
    float radial = 1.0 - smoothstep(0.16, 0.5, length(c));
    float density = radial * (0.45 + n);
    return smoothstep(0.32, 0.66, density); // softer edges
  }
`;

// No true camera-facing billboard math — matches BTK, which places these
// with an identity rotation and relies on `side: DoubleSide` so a fixed quad
// (facing the game's roughly-fixed -Z sight line) stays visible either way.
const VERTEX_SHADER = `
  attribute float aSeed;
  attribute float aOpacity;
  varying vec2 vUv;
  varying float vSeed;
  varying float vOpacity;
  void main(){
    vUv = uv;
    vSeed = aSeed;
    vOpacity = aOpacity;
    gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  varying vec2 vUv;
  varying float vSeed;
  varying float vOpacity;
  uniform float uOpacity;
  ${NOISE_GLSL}
  void main(){
    float a = cloudAlpha(vUv, vSeed);
    if (a <= 0.001) discard;
    // Soft white with subtle bright-range variation so it isn't a flat,
    // blown-out fill (stays light — no dark shading).
    float shade = cloudFbm(vUv * 3.0 + vec2(vSeed * 7.1, vSeed * 13.7));
    vec3 col = vec3(0.88 + 0.12 * shade);
    gl_FragColor = vec4(col, a * uOpacity * vOpacity);
  }
`;

interface CloudInstance {
  position: THREE.Vector3;
  sizeM: number;
  driftFactor: number;
}

export function buildClouds(
  scene: THREE.Scene,
  cfg: EnvironmentConfig,
  placements: CloudPlacement[],
  track: TrackFn,
): CloudsHandle {
  const geo = track(new THREE.PlaneGeometry(1, 0.55));
  const count = Math.max(placements.length, 1);
  const field = getCloudField(cfg);

  const seeds = new Float32Array(count);
  const opacities = new Float32Array(count);
  placements.forEach((p, i) => {
    seeds[i] = p.seed;
    opacities[i] = cloudEdgeOpacity(p.x, p.z, field, cfg.clouds.fadeMarginM);
  });
  geo.setAttribute('aSeed', new THREE.InstancedBufferAttribute(seeds, 1));
  const opacityAttr = new THREE.InstancedBufferAttribute(opacities, 1);
  opacityAttr.setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute('aOpacity', opacityAttr);

  const material = track(
    new THREE.ShaderMaterial({
      uniforms: { uOpacity: { value: 0.82 } },
      vertexShader: VERTEX_SHADER,
      fragmentShader: FRAGMENT_SHADER,
      transparent: true,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );

  const mesh = new THREE.InstancedMesh(geo, material, count);
  // Clouds drift/wrap far from their initial bounds — disable frustum culling
  // so the stale bounding volume doesn't pop whole batches out of existence.
  mesh.frustumCulled = false;
  mesh.renderOrder = 1; // sky dome is -1 (draws first); both depthWrite:false

  const instances: CloudInstance[] = placements.map((p) => ({
    position: new THREE.Vector3(p.x, p.y, p.z),
    sizeM: p.sizeM,
    driftFactor: p.driftFactor,
  }));

  const m = new THREE.Matrix4();
  const quat = new THREE.Quaternion();
  const scaleV = new THREE.Vector3();
  instances.forEach((c, i) => {
    scaleV.set(c.sizeM, c.sizeM, 1);
    m.compose(c.position, quat, scaleV);
    mesh.setMatrixAt(i, m);
  });
  mesh.instanceMatrix.needsUpdate = true;
  mesh.count = placements.length;
  scene.add(mesh);

  return {
    mesh,
    update(dt, windVec) {
      instances.forEach((c, i) => {
        c.position.x = wrapToField(c.position.x + windVec.x * c.driftFactor * dt, field.centerX, field.halfWidthM);
        c.position.z = wrapToField(c.position.z + windVec.z * c.driftFactor * dt, field.centerZ, field.halfLengthM);
        opacities[i] = cloudEdgeOpacity(c.position.x, c.position.z, field, cfg.clouds.fadeMarginM);
        scaleV.set(c.sizeM, c.sizeM, 1);
        m.compose(c.position, quat, scaleV);
        mesh.setMatrixAt(i, m);
      });
      opacityAttr.needsUpdate = true;
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
