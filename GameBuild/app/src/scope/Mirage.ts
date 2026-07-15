// Mirage (heat-shimmer) post-process — task 1.7c. Ports the *approach* of the
// MIT-licensed reference `BallisticsToolkit/web/fclass-sim/rendering/mirage.js`
// (do NOT import; see the 1.7 plan's salvage-reference note): render the world
// to an offscreen target, then warp it onto the screen with a UV distortion
// driven by a noise field that's advected by the local wind — the classic
// wind-reading cue, since the shimmer's DRIFT direction tracks the crosswind.
//
// Deliberately a SINGLE-LAYER simplification of the reference's multi-slab
// atmosphere model (no per-layer wind EMA, no elevation falloff, no chromatic
// tint) — those are real polish but not needed for the done-when this task is
// scoped to ("shimmer drifts in the crosswind direction and intensifies as you
// zoom in"). The frame-to-frame drift accumulation and the zoom→intensity
// curve are pure, unit-tested logic in `game/mirage-model.ts`; this file owns
// only the THREE/WebGL objects, matching the existing scope/*.ts renderer
// convention (module-singleton, flat init/update/dispose exports — see
// BulletTrace.ts, WindMarkers.ts, impact-fx.ts).
//
// The 4D simplex noise below is copied VERBATIM from the reference (Stefan
// Gustavson / Ashima Arts, MIT — https://github.com/stegu/webgl-noise,
// https://github.com/ashima/webgl-noise) rather than hand-derived: this
// sandbox has no WebGL context to render-verify new GLSL math against, so the
// one piece that can't be checked any other way is reused as already-proven
// code, and only the (verifiable-by-inspection) plumbing around it is new.
//
// Sits between the world render and the reticle overlay by construction: the
// reticle is already a SEPARATE 2D `<canvas>` layered on top via CSS
// (ScopeView's `reticleRef`), untouched by this file — this pass only changes
// what ends up in the WebGL canvas underneath it.

import * as THREE from 'three';
import { advanceMirageDrift, mirageIntensity, MIRAGE_ZERO_DRIFT, type MirageDrift } from '../game/mirage-model';

// ---- tuning constants (owner feel-knobs, per plan step 3 / 1.7d) -----------
const NOISE_FREQ_X = 3.3; // 1/m — horizontal feature size
const NOISE_FREQ_Y = 2.2; // 1/m — vertical feature size (lower than X → tall "columns", matching the reference's anisotropy rationale)
const NOISE_FREQ_Z = 0.06; // 1/m — headwind churns this slowly (near-static per the reference's own reasoning)
const NOISE_FREQ_T = 0.2; // 1/s — in-place evolution rate (keeps a dead-calm view boiling, not frozen)
/** Reference downrange distance (m) the shimmer's feature size is scaled for.
 *  Real mirage is strongest near the ground close to the shooter; this single-
 *  layer simplification picks one representative depth rather than the
 *  reference's 3 depth-varying slabs. Exported so `ScopeView.tsx` can sample
 *  the local wind at roughly the same depth the shimmer is visually "at".
 *  Tunable in 1.7d. */
export const MIRAGE_REFERENCE_DISTANCE_M = 150;
/** Render-target resolution vs. the canvas's own device pixels. First lever to
 *  pull if iPad FPS can't hold the post-process pass (plan step 3) — drop this
 *  before cutting anything else. */
const RESOLUTION_SCALE = 1.0;

/**
 * Final UV-displacement multiplier — separate from `intensity` (the
 * zoom-driven curve in `game/mirage-model.ts`, O(0.1–3), a dimensionless
 * "how strong" ratio) on purpose, matching the reference's own two-stage
 * design (`layerIntensity` × a separate `SPATIAL_DISTORTION_SCALE = 0.003`).
 * `intensity` alone is NOT a UV offset — UV space only spans [0,1], so
 * treating a value near 1–3 as a raw offset makes the shader sample
 * completely unrelated parts of the source texture rather than subtly
 * warping it, which is exactly the "solid green/blue blobs, no scene detail"
 * bug the owner's on-device screenshot showed. This constant converts the
 * dimensionless intensity into an actual small UV nudge. Set to the
 * reference's own tuned value (0.003) for the same reason
 * `game/mirage-model.ts`'s `MIRAGE_BASE_INTENSITY`/`MIRAGE_INTENSITY_CAP` were
 * — a real, presumably-already-eyeballed number beats guessing again from a
 * sandbox with no WebGL to render-check against. Still tunable in 1.7d.
 */
const SPATIAL_DISTORTION_SCALE = 0.003;

// Simplex 4D noise (Gustavson/Ashima, MIT) — verbatim port, see file header.
const SIMPLEX_4D_GLSL = `
  vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  float mod289(float x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
  vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
  float permute(float x) { return mod289(((x*34.0)+1.0)*x); }
  vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }
  float taylorInvSqrt(float r) { return 1.79284291400159 - 0.85373472095314 * r; }

  vec4 grad4(float j, vec4 ip) {
    const vec4 ones = vec4(1.0, 1.0, 1.0, -1.0);
    vec4 p, s;
    p.xyz = floor(fract(vec3(j) * ip.xyz) * 7.0) * ip.z - 1.0;
    p.w = 1.5 - dot(abs(p.xyz), ones.xyz);
    s = vec4(lessThan(p, vec4(0.0)));
    p.xyz = p.xyz + (s.xyz * 2.0 - 1.0) * s.www;
    return p;
  }

  float snoise(vec4 v) {
    const vec4 C = vec4( 0.138196601125011,
                         0.276393202250021,
                         0.414589803375032,
                        -0.447213595499958);

    vec4 i  = floor(v + dot(v, vec4(0.309016994374947451)));
    vec4 x0 = v - i + dot(i, C.xxxx);

    vec4 i0;
    vec3 isX = step(x0.yzw, x0.xxx);
    vec3 isYZ = step(x0.zww, x0.yyz);
    i0.x = isX.x + isX.y + isX.z;
    i0.yzw = 1.0 - isX;
    i0.y += isYZ.x + isYZ.y;
    i0.zw += 1.0 - isYZ.xy;
    i0.z += isYZ.z;
    i0.w += 1.0 - isYZ.z;

    vec4 i3 = clamp(i0, 0.0, 1.0);
    vec4 i2 = clamp(i0 - 1.0, 0.0, 1.0);
    vec4 i1 = clamp(i0 - 2.0, 0.0, 1.0);

    vec4 x1 = x0 - i1 + C.xxxx;
    vec4 x2 = x0 - i2 + C.yyyy;
    vec4 x3 = x0 - i3 + C.zzzz;
    vec4 x4 = x0 + C.wwww;

    i = mod289(i);
    float j0 = permute(permute(permute(permute(i.w) + i.z) + i.y) + i.x);
    vec4 j1 = permute(permute(permute(permute(
               i.w + vec4(i1.w, i2.w, i3.w, 1.0))
             + i.z + vec4(i1.z, i2.z, i3.z, 1.0))
             + i.y + vec4(i1.y, i2.y, i3.y, 1.0))
             + i.x + vec4(i1.x, i2.x, i3.x, 1.0));

    vec4 ip = vec4(1.0/294.0, 1.0/49.0, 1.0/7.0, 0.0);
    vec4 p0 = grad4(j0,   ip);
    vec4 p1 = grad4(j1.x, ip);
    vec4 p2 = grad4(j1.y, ip);
    vec4 p3 = grad4(j1.z, ip);
    vec4 p4 = grad4(j1.w, ip);

    vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
    p0 *= norm.x;
    p1 *= norm.y;
    p2 *= norm.z;
    p3 *= norm.w;
    p4 *= taylorInvSqrt(dot(p4,p4));

    vec3 m0 = max(0.6 - vec3(dot(x0,x0), dot(x1,x1), dot(x2,x2)), 0.0);
    vec2 m1 = max(0.6 - vec2(dot(x3,x3), dot(x4,x4)), 0.0);
    m0 = m0 * m0;
    m1 = m1 * m1;
    return 49.0 * (dot(m0*m0, vec3(dot(p0,x0), dot(p1,x1), dot(p2,x2)))
                 + dot(m1*m1, vec2(dot(p3,x3), dot(p4,x4))));
  }
`;

const VERTEX_SHADER = `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const FRAGMENT_SHADER = `
  uniform sampler2D tDiffuse;
  uniform vec3 drift;      // accumulated (x=cross, y=heat-rise, z=head), metres
  uniform float noiseTime; // elapsed seconds
  uniform vec4 noiseFreq;  // (x, y, z, t)
  uniform float viewScale; // metres spanned edge-to-edge at the reference depth, current zoom
  uniform float intensity; // UV displacement scale (zoom-scaled, capped)

  varying vec2 vUv;

  ${SIMPLEX_4D_GLSL}

  // Standard linear->sRGB opto-electronic transfer function (identical to
  // three.js's own internal sRGBTransferOETF, ShaderChunk/colorspace_pars_
  // fragment.glsl.js) — built-in materials get this applied automatically via
  // the colorspace_fragment chunk when rendering to the canvas, but a bespoke
  // ShaderMaterial like this one does NOT get it for free. Pass 1 (world ->
  // offscreen target) leaves tDiffuse holding LINEAR-space colour; without
  // this encode, writing it straight to the screen framebuffer under-
  // brightens every pixel (the browser displays raw linear values as if they
  // were already sRGB) — the "like I'm wearing sunglasses" darkening the
  // owner reported on-device, 2026-07-15.
  vec3 linearToSRGB(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }

  void main() {
    vec4 noisePos = vec4(
      ((vUv.x - 0.5) * viewScale - drift.x) * noiseFreq.x,
      ((vUv.y - 0.5) * viewScale - drift.y) * noiseFreq.y,
      -drift.z * noiseFreq.z,
      noiseTime * noiseFreq.w
    );
    float n = snoise(noisePos);

    // Mirage refracts light vertically (rising hot air = vertical n-gradient),
    // same as the reference. intensity is a dimensionless zoom-driven
    // strength (O(0.1-3), see game/mirage-model.ts); SPATIAL_DISTORTION_SCALE
    // converts that into an actual (small) UV nudge — without it, intensity
    // alone would be a UV offset of order 1, i.e. a near-total resample of a
    // totally different part of the source image, not a warp.
    vec2 distortedUv = vUv + vec2(0.0, n) * intensity * ${SPATIAL_DISTORTION_SCALE.toFixed(6)};
    // Defensive clamp: keeps an extreme-zoom excursion from sampling past the
    // render target's edge and smearing the border pixel across the frame.
    distortedUv = clamp(distortedUv, vec2(0.001), vec2(0.999));

    vec4 color = texture2D(tDiffuse, distortedUv);
    color.rgb = linearToSRGB(color.rgb);
    gl_FragColor = color;
  }
`;

interface MirageState {
  renderer: THREE.WebGLRenderer;
  target: THREE.WebGLRenderTarget;
  quadScene: THREE.Scene;
  quadCamera: THREE.OrthographicCamera;
  material: THREE.ShaderMaterial;
  quad: THREE.Mesh;
  drift: MirageDrift;
  elapsed: number;
  width: number;
  height: number;
}

let mirage: MirageState | null = null;

function targetSizeFor(renderer: THREE.WebGLRenderer): { width: number; height: number } {
  const dpr = renderer.getPixelRatio();
  const size = new THREE.Vector2();
  renderer.getSize(size);
  return {
    width: Math.max(1, Math.round(size.x * dpr * RESOLUTION_SCALE)),
    height: Math.max(1, Math.round(size.y * dpr * RESOLUTION_SCALE)),
  };
}

/** Build the offscreen target + fullscreen quad. Idempotent — safe to call
 *  once at scene init (mirrors `initBulletTrace`/`initWindMarkers`). */
export function initMirage(renderer: THREE.WebGLRenderer): void {
  if (mirage) return;
  const { width, height } = targetSizeFor(renderer);

  const target = new THREE.WebGLRenderTarget(width, height, {
    minFilter: THREE.LinearFilter,
    magFilter: THREE.LinearFilter,
    format: THREE.RGBAFormat,
  });

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      drift: { value: new THREE.Vector3(0, 0, 0) },
      noiseTime: { value: 0 },
      noiseFreq: { value: new THREE.Vector4(NOISE_FREQ_X, NOISE_FREQ_Y, NOISE_FREQ_Z, NOISE_FREQ_T) },
      viewScale: { value: 1 },
      intensity: { value: 0 },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quadScene.add(quad);

  mirage = { renderer, target, quadScene, quadCamera, material, quad, drift: MIRAGE_ZERO_DRIFT, elapsed: 0, width, height };
}

/**
 * Render `scene`/`camera` through the mirage post-process instead of directly
 * to the screen: pass 1 renders the world into the offscreen target, pass 2
 * warps that texture onto the screen through the noise shader. Call once per
 * frame in place of the old `renderer.render(scene, camera)`. No-op (falls
 * back silently — caller should just not call this before `initMirage`) if
 * not yet initialized.
 *
 * `wind` is the ALREADY-superposed local wind (Steady: flat dialed mean;
 * Realistic: mean+gust) sampled near the target line — the same value
 * `currentWindAt` produces for the flags and the D6 effective-wind readout, so
 * the shimmer's drift direction always agrees with what the flags show (D1:
 * mirage renders in both modes, showing the steady mean in Steady — same as
 * the flags, not gated to Realistic-only).
 */
export function renderSceneWithMirage(
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  params: { dt: number; fovDeg: number; baseFovDeg: number; wind: { x: number; z: number } },
): void {
  if (!mirage) return;
  const { renderer } = mirage;

  const wanted = targetSizeFor(renderer);
  if (wanted.width !== mirage.width || wanted.height !== mirage.height) {
    mirage.target.setSize(wanted.width, wanted.height);
    mirage.width = wanted.width;
    mirage.height = wanted.height;
  }

  // Pass 1: world -> offscreen target.
  renderer.setRenderTarget(mirage.target);
  renderer.render(scene, camera);
  renderer.setRenderTarget(null);

  // Advance drift + noise clock (pure, unit-tested in game/mirage-model.ts).
  mirage.drift = advanceMirageDrift(mirage.drift, params.wind, params.dt);
  mirage.elapsed += params.dt;

  const fovRad = (params.fovDeg * Math.PI) / 180;
  const viewScale = 2 * MIRAGE_REFERENCE_DISTANCE_M * Math.tan(fovRad / 2);
  const intensity = mirageIntensity(params.fovDeg, params.baseFovDeg);

  const u = mirage.material.uniforms;
  (u.drift.value as THREE.Vector3).set(mirage.drift.x, mirage.drift.y, mirage.drift.z);
  u.noiseTime.value = mirage.elapsed;
  u.viewScale.value = viewScale;
  u.intensity.value = intensity;

  // Pass 2: offscreen target -> screen, warped. The fullscreen quad covers
  // every pixel, so no explicit clear is needed first (matches the reference's
  // own `apply()`).
  renderer.render(mirage.quadScene, mirage.quadCamera);
}

/** Tear down all mirage resources. Idempotent. */
export function disposeMirage(): void {
  if (!mirage) return;
  mirage.target.dispose();
  mirage.quad.geometry.dispose();
  mirage.material.dispose();
  mirage = null;
}
