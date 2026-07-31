// Mirage (heat-shimmer) post-process — REWRITTEN wholesale wind-system-btk-
// port W5 (D2: "a full faithful port, replacing the current one wholesale —
// the incremental approach is what failed in 1.7c") from BTK's
// `fclass-sim/rendering/mirage.js` `MirageEffect`. Renders the world to an
// offscreen target, then warps it onto the screen with a UV distortion driven
// by THREE decorrelated depth-layered slabs of a shared 4D noise field — near
// slabs read as big soft blobs, far slabs as crisp small features, without
// any explicit blur, and each slab's own wind sample gives the shimmer's
// drift direction the classic wind-reading cue.
//
// The frame-to-frame per-layer state (EMA wind, accumulated drift) and the
// zoom/fade/normalization math are pure, unit-tested logic in
// `game/mirage-model.ts` (the "=== Layered atmosphere ===" section, W4); this
// file owns only the THREE/WebGL objects, matching the existing scope/*.ts
// renderer convention (module-singleton, flat init/update/dispose exports —
// see BulletTrace.ts, WindMarkers.ts, impact-fx.ts). Per P16/P19, the aim-ray
// intersection and the per-layer random-depth wind SAMPLING happen in
// ScopeView.tsx (which already owns `findAimed`/`findAimedTarget` and
// `windAtForMarkers`); this file consumes the resulting mph samples and owns
// the EMA/drift state + all GPU-facing plumbing.
//
// The 4D simplex noise below is copied VERBATIM from BTK (Stefan Gustavson /
// Ashima Arts, MIT — https://github.com/stegu/webgl-noise,
// https://github.com/ashima/webgl-noise), unchanged from the pre-port
// single-layer file: this sandbox has no WebGL context to render-verify new
// GLSL math against, so the one piece that can't be checked any other way is
// reused as already-proven code.
//
// Sits between the world render and the reticle overlay by construction: the
// reticle is already a SEPARATE 2D `<canvas>` layered on top via CSS
// (ScopeView's `reticleRef`), untouched by this file — this pass only changes
// what ends up in the WebGL canvas underneath it.

import * as THREE from 'three';
import {
  advanceLayer,
  zoomIntensity,
  packMirageLayerUniforms,
  zeroMirageLayerStates,
  MIRAGE_LAYER_FRACS,
  MIRAGE_DEFAULT_LAYER_MASK,
  type MirageLayerState,
  type Vec3,
} from '../game/mirage-model';

// ---- tuning constants, BTK verbatim (owner feel-knobs, re-tuned on device W6) ----
const NOISE_FREQ_X = 3; // 1/yd — horizontal feature size
const NOISE_FREQ_Y = 2; // 1/yd — vertical feature size (lower than X → tall "columns")
const NOISE_FREQ_Z = 0.05; // 1/yd — headwind churns this slowly (near-static)
const NOISE_FREQ_T = 0.2; // 1/s — in-place evolution rate (keeps a dead-calm view boiling)
const SPATIAL_DISTORTION_SCALE = 0.003; // UV displacement scale, how far the image warbles
const SHADING_INTENSITY_SCALE = 1.0; // chromatic edge-tint multiplier
const SHADING_MAX_STRENGTH = 0.85; // clamp on the tint mix amount

/** Height/line-of-sight elevation falloff (P17): mirage is full at/below
 *  `ELEV_FULL_DEG`, then fades on an e-folding width of `ELEV_FALLOFF_DEG` as
 *  the sight tilts up into the sky. BTK verbatim defaults, tuned against a
 *  1000 yd F-class frame — expect these to need re-tuning on device (W6) for
 *  Range A's 100–500 yd targets and the ELR range's steep near-line sight
 *  angles. UNIFORMS, not shader literals (the plan's explicit P17
 *  instruction), so a debug control can retune them live without a shader
 *  recompile. */
export const MIRAGE_ELEV_FULL_DEG = 0.08;
export const MIRAGE_ELEV_FALLOFF_DEG = 0.14;

/** Render-target resolution vs. the canvas's own device pixels. First lever to
 *  pull if iPad FPS can't hold the post-process pass (P15) — drop this before
 *  cutting `MSAA_SAMPLES`. */
const RESOLUTION_SCALE = 1.0;

/** MSAA sample count for the offscreen target (P15). The canvas itself is
 *  `antialias: true`, but a plain WebGLRenderTarget is single-sampled by
 *  default — without this, every plate/pole edge gets visibly jaggier the
 *  moment mirage turns on, which reads as "the picture got worse" and is
 *  easily mistaken for the shimmer itself. WebGL2-only; harmless on WebGL1
 *  (three silently ignores `samples` there). Second perf lever after
 *  `RESOLUTION_SCALE` (P15). */
const MSAA_SAMPLES = 4;

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

const NUM_LAYERS = MIRAGE_LAYER_FRACS.length;

const FRAGMENT_SHADER = `
  #define NUM_LAYERS ${NUM_LAYERS}

  uniform sampler2D tDiffuse;
  uniform vec4  noiseFreq;                    // (x, y, z, t) per-axis frequency
  uniform float noiseTime;                    // elapsed seconds, drives the t axis
  uniform float spatialScale;                 // UV displacement multiplier
  uniform float shadingScale;                 // chromatic tint multiplier
  uniform vec3  layerOffsets[NUM_LAYERS];     // world-space anchor (yards) per layer
  uniform float layerScales[NUM_LAYERS];      // viewport world width (yards) per layer
  uniform vec3  layerDrifts[NUM_LAYERS];      // accumulated wind drift (cross, vertical, head) yards
  uniform float layerIntensities[NUM_LAYERS]; // per-layer noise weight (zoom * fade / sqrt(N))
  uniform float viewPitch;                    // elevation of view center (radians, +up)
  uniform float vFovRad;                      // vertical field of view (radians)
  uniform float elevFullDeg;                  // P17: full-strength elevation ceiling (deg)
  uniform float elevFalloffDeg;               // P17: e-folding width of the fade above it (deg)

  varying vec2 vUv;

  ${SIMPLEX_4D_GLSL}

  // Standard linear->sRGB opto-electronic transfer function (identical to
  // three.js's own internal sRGBTransferOETF, ShaderChunk/colorspace_pars_
  // fragment.glsl.js) — built-in materials get this applied automatically via
  // the colorspace_fragment chunk when rendering to the canvas, but a bespoke
  // ShaderMaterial like this one does NOT get it for free. Pass 1 (world ->
  // offscreen target) leaves tDiffuse holding LINEAR-space colour; without
  // this encode on the FINAL write (P14), writing it straight to the screen
  // framebuffer under-brightens every pixel (the browser displays raw linear
  // values as if they were already sRGB) — the "like I'm wearing sunglasses"
  // darkening the owner reported on-device, 2026-07-15. Do NOT instead set
  // renderer.outputColorSpace — that would double-encode the non-mirage
  // path, which never goes through this shader.
  vec3 linearToSRGB(vec3 c) {
    return mix(pow(c, vec3(0.41666)) * 1.055 - vec3(0.055), c * 12.92, vec3(lessThanEqual(c, vec3(0.0031308))));
  }

  void main() {
    vec2 uv = vUv;

    float totalDistortion = 0.0;

    // One 4D noise sample per layer. The three spatial axes are advected by
    // their wind drivers (cross→x, vertical+heat→y, head→z); the fourth axis
    // is the shared clock so the field evolves in place. Layers are
    // decorrelated by their distinct world-space z (downrange) anchors,
    // which sit far beyond the noise correlation length.
    float tCoord = noiseTime * noiseFreq.w;
    for (int i = 0; i < NUM_LAYERS; i++) {
      vec4 noisePos = vec4(
        ((uv.x - 0.5) * layerScales[i] + layerOffsets[i].x - layerDrifts[i].x) * noiseFreq.x,
        ((uv.y - 0.5) * layerScales[i] + layerOffsets[i].y - layerDrifts[i].y) * noiseFreq.y,
        (layerOffsets[i].z - layerDrifts[i].z) * noiseFreq.z,
        tCoord
      );

      float n = snoise(noisePos);
      totalDistortion += n * layerIntensities[i];
    }

    // Height falloff: this pixel's line-of-sight elevation is the view-center
    // pitch plus its vertical offset across the FOV. Mirage is full when the
    // sight grazes the deck, then tapers off exponentially as it tilts up
    // into the sky — a gradual fade with no hard edge, so the sky band above
    // the target thins away smoothly instead of cutting off at a line.
    float elevDeg = (viewPitch + (uv.y - 0.5) * vFovRad) * 57.2957795;
    float elevAtten = exp(-max(elevDeg - elevFullDeg, 0.0) / max(elevFalloffDeg, 0.0001));
    totalDistortion *= elevAtten;

    // Mirage refracts light vertically (rising hot air = vertical n-gradient).
    vec2 distortedUv = uv + vec2(0.0, totalDistortion) * spatialScale;
    // Defensive clamp: keeps an extreme-zoom excursion from sampling past the
    // render target's edge and smearing the border pixel across the frame.
    distortedUv = clamp(distortedUv, vec2(0.001), vec2(0.999));

    vec4 color = texture2D(tDiffuse, distortedUv);

    // Chromatic edge tint scales with total distortion magnitude.
    float tintStrength = clamp(abs(totalDistortion) * shadingScale, 0.0, ${SHADING_MAX_STRENGTH.toFixed(3)});
    color.rgb = mix(color.rgb, color.rgb * vec3(0.85, 0.9, 1.0), tintStrength);

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
  layerStates: MirageLayerState[];
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

function zeroLayerVectorArray(): THREE.Vector3[] {
  return Array.from({ length: NUM_LAYERS }, () => new THREE.Vector3(0, 0, 0));
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
    samples: MSAA_SAMPLES, // P15
  });

  const quadCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const quadScene = new THREE.Scene();
  const material = new THREE.ShaderMaterial({
    uniforms: {
      tDiffuse: { value: target.texture },
      noiseFreq: { value: new THREE.Vector4(NOISE_FREQ_X, NOISE_FREQ_Y, NOISE_FREQ_Z, NOISE_FREQ_T) },
      noiseTime: { value: 0 },
      spatialScale: { value: SPATIAL_DISTORTION_SCALE },
      shadingScale: { value: SHADING_INTENSITY_SCALE },
      layerOffsets: { value: zeroLayerVectorArray() },
      layerScales: { value: new Array(NUM_LAYERS).fill(0) },
      layerDrifts: { value: zeroLayerVectorArray() },
      layerIntensities: { value: new Array(NUM_LAYERS).fill(0) },
      viewPitch: { value: 0 },
      vFovRad: { value: 0 },
      elevFullDeg: { value: MIRAGE_ELEV_FULL_DEG },
      elevFalloffDeg: { value: MIRAGE_ELEV_FALLOFF_DEG },
    },
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    depthTest: false,
    depthWrite: false,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
  quadScene.add(quad);

  mirage = {
    renderer,
    target,
    quadScene,
    quadCamera,
    material,
    quad,
    layerStates: zeroMirageLayerStates(),
    elapsed: 0,
    width,
    height,
  };
}

/** Everything `ScopeView.tsx` computes per frame and hands to the renderer —
 *  the aim-ray intersection (P16) and one wind sample per layer, already
 *  taken at a random depth within that layer's slab (P19: the random pick
 *  lives in the caller, not here, so this module stays deterministic given
 *  its inputs). */
export interface MirageFrameParams {
  dt: number;
  fovDeg: number;
  baseFovDeg: number;
  /** Aim-ray intersection point, yards (`aimRayIntersection`'s `pointYd`). */
  intersectionYd: Vec3;
  /** Aim-ray intersection distance, yards (`aimRayIntersection`'s `distanceYd`). */
  distanceYd: number;
  /** `viewPitchRad(dir.y)` — elevation of the aim direction, radians, +up. */
  viewPitchRad: number;
  /** One wind sample per `MIRAGE_LAYER_FRACS` entry, mph, already taken at a
   *  random depth within that layer's own slab range. */
  layerSamplesMph: Vec3[];
  /** Strength-preset multiplier (Off/Light/Medium/Heavy, W6). Defaults to 1
   *  (Medium-equivalent) until W6 wires the control. */
  intensityScale?: number;
  /** Per-layer debug isolation mask (W6). Defaults to all layers on. */
  layerMask?: readonly number[];
}

/**
 * Render `scene`/`camera` through the mirage post-process instead of directly
 * to the screen: pass 1 renders the world into the offscreen target, pass 2
 * warps that texture onto the screen through the layered noise shader. Call
 * once per frame in place of the old `renderer.render(scene, camera)`. No-op
 * (caller should just not call this before `initMirage`) if not yet
 * initialized.
 */
export function renderSceneWithMirage(scene: THREE.Scene, camera: THREE.PerspectiveCamera, params: MirageFrameParams): void {
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

  // Advance each slab's EMA wind + drift (pure, unit-tested in
  // game/mirage-model.ts), then pack the four per-layer uniform arrays.
  for (let i = 0; i < mirage.layerStates.length; i++) {
    mirage.layerStates[i] = advanceLayer(mirage.layerStates[i], params.layerSamplesMph[i], params.dt);
  }
  mirage.elapsed += params.dt;

  const baseIntensity = zoomIntensity(params.fovDeg, params.baseFovDeg) * (params.intensityScale ?? 1);
  const mask = params.layerMask ?? MIRAGE_DEFAULT_LAYER_MASK;
  const packed = packMirageLayerUniforms(
    mirage.layerStates,
    params.intersectionYd,
    params.distanceYd,
    params.fovDeg,
    baseIntensity,
    mask,
  );

  const u = mirage.material.uniforms;
  const layerOffsets = u.layerOffsets.value as THREE.Vector3[];
  const layerScales = u.layerScales.value as number[];
  const layerDrifts = u.layerDrifts.value as THREE.Vector3[];
  const layerIntensities = u.layerIntensities.value as number[];
  for (let i = 0; i < NUM_LAYERS; i++) {
    layerOffsets[i].set(packed.offsetsYd[i].x, packed.offsetsYd[i].y, packed.offsetsYd[i].z);
    layerScales[i] = packed.scalesYd[i];
    layerDrifts[i].set(packed.driftsYd[i].x, packed.driftsYd[i].y, packed.driftsYd[i].z);
    layerIntensities[i] = packed.intensities[i];
  }
  u.noiseTime.value = mirage.elapsed;
  u.viewPitch.value = params.viewPitchRad;
  u.vFovRad.value = (params.fovDeg * Math.PI) / 180;

  // Pass 2: offscreen target -> screen, warped. The fullscreen quad covers
  // every pixel, so no explicit clear is needed first (matches BTK's own
  // `apply()`).
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
