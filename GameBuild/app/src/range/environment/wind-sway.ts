// Wind-driven canopy sway — Stage 5 of `Design/archive/mil-zero-range-plan.md`.
//
// THE POINT. This game is about reading wind. Vegetation that sways to a
// decorative sine wave is a lie the player could learn from, so the canopies
// here are driven by the SAME wind the bullet gets: the scene hands us the very
// sampler ScopeView uses for its wind markers, which on a steel range is
// `mean + gustScale x field.sample(p)` and on a paper bay is the dialled mean —
// in both cases exactly what the shot solve receives. If those two ever diverge,
// this feature stops being worth having.
//
// WHAT MOVES. Bend is QUADRATIC in height above the trunk base, so the crown
// moves and the lower trunk barely does — a cantilever, which is both how a tree
// actually behaves and what the owner asked for (plan §7.3: "the very light wind
// just affecting tree tops is fine"). It is also physically honest in a second
// way: wind speed genuinely increases with height above ground, so a breeze that
// barely stirs the grass can still visibly work a 10 m canopy.
//
// Grass is deliberately NOT swayed. Plan §9.6 originally gave tufts a HIGHER
// bend factor; §7.3 superseded that, and a tuft thrashing under a 1 m/s breeze
// that the crown barely notices would contradict the height story above.
//
// HOW. One small RGBA `DataTexture` holds the wind vector over a coarse grid of
// the near field, refreshed a few times a second on the CPU. The canopy material
// is patched via `onBeforeCompile` to look the instance's world position up in
// that texture and bend accordingly. Instancing is preserved — the lookup uses
// `instanceMatrix[3].xyz`, so there is still one draw call per (kind, variant).

import * as THREE from 'three';
import type { EnvironmentConfig } from './environment-config';

export interface WindSwayHandle {
  /** Patch a material so its vertices bend with the wind field. */
  patch(material: THREE.Material): void;
  /** Refresh the field texture + advance the sway clock. */
  update(timeS: number, sampleWindAt: (p: { x: number; y: number; z: number }) => WindVec): void;
  dispose(): void;
}

interface WindVec {
  x: number;
  y: number;
  z: number;
}

/** Grid resolution per axis. Coarse on purpose — this drives a visual bend, not
 *  a ballistic solve, and 16x16 over a few hundred metres is already finer than
 *  the eye can resolve in canopy movement. */
const GRID = 16;

/** Wind speed (m/s) that maps to full deflection in the texture encoding.
 *  Components are stored as `(v / SPEED_RANGE + 1) / 2` in [0,1]. */
const SPEED_RANGE_MPS = 12;

/** Seconds between CPU refreshes of the field texture. The sway PHASE animates
 *  every frame in the shader; only the underlying field is throttled, so this is
 *  invisible. */
const REFRESH_INTERVAL_S = 0.2;

export function createWindSway(cfg: EnvironmentConfig): WindSwayHandle {
  const sway = cfg.windSway;
  const data = new Uint8Array(GRID * GRID * 4);
  // Neutral (zero wind) is the middle of the encoding, not zero.
  data.fill(128);
  const texture = new THREE.DataTexture(data, GRID, GRID, THREE.RGBAFormat);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.needsUpdate = true;

  const uniforms = {
    uWindTex: { value: texture },
    uWindOrigin: { value: new THREE.Vector2(-sway.halfWidthM, -sway.depthM) },
    uWindExtent: { value: new THREE.Vector2(sway.halfWidthM * 2, sway.depthM) },
    uTime: { value: 0 },
    uBendScale: { value: sway.bendScale },
    uMaxBendM: { value: sway.maxBendM },
    uSwayHz: { value: sway.swayHz },
    uSpeedRange: { value: SPEED_RANGE_MPS },
  };

  const patch = (material: THREE.Material) => {
    material.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, uniforms);
      shader.vertexShader = shader.vertexShader
        .replace(
          '#include <common>',
          `#include <common>
           uniform sampler2D uWindTex;
           uniform vec2 uWindOrigin;
           uniform vec2 uWindExtent;
           uniform float uTime;
           uniform float uBendScale;
           uniform float uMaxBendM;
           uniform float uSwayHz;
           uniform float uSpeedRange;`,
        )
        .replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           {
             // World position of this INSTANCE (its origin), not of this vertex —
             // the whole tree reads one wind sample, so a canopy never shears.
             #ifdef USE_INSTANCING
               vec3 instWorld = (modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
             #else
               vec3 instWorld = (modelMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
             #endif
             vec2 windUv = (instWorld.xz - uWindOrigin) / uWindExtent;
             windUv = clamp(windUv, 0.0, 1.0);
             vec2 packed = texture2D(uWindTex, windUv).rg;
             vec2 wind = (packed * 2.0 - 1.0) * uSpeedRange;

             // Quadratic in height above the trunk base: crown moves, base does
             // not. 'transformed' is still in LOCAL space here — THREE applies
             // instanceMatrix later in project_vertex — so local y is height
             // above the tree's own origin, which is what we want.
             float h = max(transformed.y, 0.0);
             float bend = min(uBendScale * h * h, uMaxBendM);

             // Per-instance phase from world position so the forest does not
             // pulse in unison, plus a gentle breathing term.
             float phase = uTime * uSwayHz + instWorld.x * 0.37 + instWorld.z * 0.29;
             float gust = 0.85 + 0.15 * sin(phase);

             transformed.xz += wind * bend * gust;
           }`,
        );
    };
    material.needsUpdate = true;
  };

  let lastRefreshS = -Infinity;

  const update: WindSwayHandle['update'] = (timeS, sampleWindAt) => {
    uniforms.uTime.value = timeS;
    if (timeS - lastRefreshS < REFRESH_INTERVAL_S) return;
    lastRefreshS = timeS;

    for (let row = 0; row < GRID; row++) {
      // Row maps to z across [-depthM, 0]; column to x across [-halfWidth, +halfWidth].
      const z = -sway.depthM + (row / (GRID - 1)) * sway.depthM;
      for (let col = 0; col < GRID; col++) {
        const x = -sway.halfWidthM + (col / (GRID - 1)) * sway.halfWidthM * 2;
        const w = sampleWindAt({ x, y: sway.sampleHeightM, z });
        const i = (row * GRID + col) * 4;
        data[i] = encode(w.x);
        data[i + 1] = encode(w.z);
        data[i + 2] = 128;
        data[i + 3] = 255;
      }
    }
    texture.needsUpdate = true;
  };

  return {
    patch,
    update,
    dispose() {
      texture.dispose();
    },
  };
}

/** Map a wind component (m/s) into a byte, centred on 128 = still. */
function encode(v: number): number {
  const n = (clamp(v, -SPEED_RANGE_MPS, SPEED_RANGE_MPS) / SPEED_RANGE_MPS + 1) / 2;
  return Math.round(n * 255);
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

/**
 * The documented speed -> bend mapping (plan §12.2).
 *
 * Exposed as a pure function so the relationship is inspectable and testable
 * rather than buried in GLSL. If canopy movement is ever to be READ as a wind
 * indicator — the thing that makes this feature worth its complexity — the
 * mapping has to be consistent and stated, not art-directed per range.
 *
 * Returns the horizontal deflection (m, in the tree's local frame before instance
 * scaling) of a canopy point `heightM` above the trunk base, at `speedMps`.
 */
export function bendDeflectionM(cfg: EnvironmentConfig, speedMps: number, heightM: number): number {
  const h = Math.max(0, heightM);
  const bend = Math.min(cfg.windSway.bendScale * h * h, cfg.windSway.maxBendM);
  return bend * clamp(speedMps, -SPEED_RANGE_MPS, SPEED_RANGE_MPS);
}

export { GRID as WIND_SWAY_GRID, SPEED_RANGE_MPS as WIND_SWAY_SPEED_RANGE_MPS };
