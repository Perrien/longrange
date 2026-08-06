// Plate surface atlas + material (target-surface task TS-B) — every plate's
// visible surface is one layer of a shared `THREE.DataArrayTexture`, so
// per-plate paint color (this task) and engine-painted impact marks (TS-C)
// live in ONE place and ride the plate's instance matrix for free. Ported from
// BallisticsToolkit steel-sim `SteelTarget.js` (initializeMergedMesh /
// createInstancedMaterial, MIT), adapted: sRGB color space (our byte colors are
// sRGB values, matching how the old `MeshStandardMaterial.color` plates
// rendered; BTK tagged its atlas linear), our plate metalness/roughness, and
// partial layer uploads via `addLayerUpdate` so a hit re-sends one 512 KB layer
// instead of the whole atlas (no impact-time hitch on iPad).
//
// Layer layout matches the engine paint buffer (pinned by TS-A native tests):
// each layer is (2·PLATE_TEXTURE_SIZE) × PLATE_TEXTURE_SIZE RGBA — left half
// the engine's "front" (downrange) face, right half the shooter-facing one.
// Layer index == plate `instanceId` (the geometry carries a matching
// per-instance `instanceTargetIndex` attribute).

import * as THREE from 'three';
import { STEEL_PAINT_TEXTURE_SIZE } from '../engine-bridge/steel-target';

/** Atlas tiles are sized from the engine paint-buffer constant (single source of
 * truth) so `writeLayer` accepts a C++ `getTexture()` buffer byte-for-byte. */
export const PLATE_TEXTURE_SIZE = STEEL_PAINT_TEXTURE_SIZE;
export const PLATE_TILE_WIDTH = PLATE_TEXTURE_SIZE * 2;
export const PLATE_TILE_HEIGHT = PLATE_TEXTURE_SIZE;
export const PLATE_LAYER_BYTES = PLATE_TILE_WIDTH * PLATE_TILE_HEIGHT * 4;

/** Rim color for the untextured plate edge (shader flat-gray branch). */
const EDGE_GRAY = 0.55;

/** Byte offset of a layer's first texel in the atlas buffer. */
export function layerByteOffset(layer: number): number {
  return layer * PLATE_LAYER_BYTES;
}

/** 0xRRGGBB → byte channels. */
export function hexToRgb(hex: number): { r: number; g: number; b: number } {
  return { r: (hex >> 16) & 0xff, g: (hex >> 8) & 0xff, b: hex & 0xff };
}

/** Fill one layer with a solid opaque paint color. */
export function fillLayerRgb(data: Uint8Array, layer: number, hex: number): void {
  const { r, g, b } = hexToRgb(hex);
  const start = layerByteOffset(layer);
  for (let i = 0; i < PLATE_LAYER_BYTES; i += 4) {
    data[start + i] = r;
    data[start + i + 1] = g;
    data[start + i + 2] = b;
    data[start + i + 3] = 255;
  }
}

export interface PlateSurface {
  /** The shared texture array — feed to `createPlateMaterial`. */
  texture: THREE.DataArrayTexture;
  /** Overwrite one plate's layer (an engine `getTexture()` RGBA buffer, TS-C)
   * and queue a partial GPU upload of just that layer. */
  writeLayer(layer: number, rgba: ArrayLike<number>): void;
  /**
   * Register authored ART for a layer (task T4): a face image, drawn scoring rings,
   * anything that is not flat paint. Stores it as that layer's BASE and draws it.
   *
   * A layer with no base behaves exactly as before, which is what keeps every
   * shipped range on the identical code path — see `writeEngineLayer`.
   */
  setBaseLayer(layer: number, rgba: ArrayLike<number>): void;
  /**
   * Write an engine paint buffer, preserving any authored art underneath.
   *
   * THE DEFECT THIS FIXES (T4b applies it): `writeLayer` overwrites a layer
   * wholesale, and the ELR Range writes its bullseye rings through that same layer
   * — so the rings were wiped by the first hit. Compositing keeps them.
   *
   * The rule: a texel the engine left at the plate's paint colour is untouched
   * ground, so the base shows through; anything else is a chip the engine painted,
   * so the engine wins. That works for arbitrarily complex art because the base is
   * only ever consulted where the engine says no chip landed.
   *
   * With NO base registered this is byte-for-byte `writeLayer` — asserted by test,
   * because that equivalence is what makes T4 safe for Range A and the ELR Range.
   */
  writeEngineLayer(layer: number, rgba: ArrayLike<number>, paintHex: number): void;
  dispose(): void;
}

/** Build the atlas with one layer per plate, each filled with that plate's
 * paint color (instanceId order). */
export function createPlateSurface(paintColors: readonly number[]): PlateSurface {
  const count = paintColors.length;
  const data = new Uint8Array(PLATE_LAYER_BYTES * count);
  for (let layer = 0; layer < count; layer++) {
    fillLayerRgb(data, layer, paintColors[layer]);
  }

  const texture = new THREE.DataArrayTexture(data, PLATE_TILE_WIDTH, PLATE_TILE_HEIGHT, count);
  texture.format = THREE.RGBAFormat;
  texture.type = THREE.UnsignedByteType;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.flipY = false;
  // Byte colors here are sRGB values (0xf0f0ea etc.) — tag them so plates render
  // exactly like the previous material.color did. (BTK deviation, see header.)
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true; // first upload = the whole atlas

  /** Authored art per layer, kept so an engine write can composite over it rather
   *  than erase it. Absent for every plate on every shipped range. */
  const bases = new Map<number, Uint8Array>();

  const upload = (layer: number): void => {
    texture.addLayerUpdate(layer); // partial upload: only this layer re-sends
    texture.needsUpdate = true;
  };

  /**
   * Request a FULL re-upload of every layer.
   *
   * THE BUG THIS FIXES (owner, on device 2026-07-31): the Test Range gong rendered
   * BLACK until its first hit, then went to plate colour. Cause: three's
   * `DataArrayTexture` path calls `texStorage3D` to ALLOCATE and then, if
   * `layerUpdates` is non-empty, uploads ONLY those layers
   * (`WebGLTextures`, the `isDataArrayTexture` branch) — every other layer is left
   * undefined. The atlas is created with a full upload pending, but async
   * `setBaseLayer` calls for the arted plates landed BEFORE the first render and
   * narrowed that upload to layers 1–3, so layer 0 never got data. It only appeared
   * once a hit queued layer 0 explicitly.
   *
   * So a base-layer write must never narrow the pending upload. It clears the queue
   * and asks for everything. That is cheap: base layers are written a handful of times
   * at scene load, and the partial-upload optimisation exists for HIT-time writes,
   * where the texture has provably been fully uploaded already (a frame has rendered).
   */
  const uploadAll = (): void => {
    texture.clearLayerUpdates();
    texture.needsUpdate = true;
  };

  return {
    texture,
    writeLayer(layer: number, rgba: ArrayLike<number>): void {
      data.set(rgba, layerByteOffset(layer));
      upload(layer);
    },
    setBaseLayer(layer: number, rgba: ArrayLike<number>): void {
      if (rgba.length !== PLATE_LAYER_BYTES)
        throw new Error(
          `plate-surface: base layer must be ${PLATE_LAYER_BYTES} bytes, got ${rgba.length}`,
        );
      const copy = new Uint8Array(PLATE_LAYER_BYTES);
      copy.set(rgba as ArrayLike<number>);
      bases.set(layer, copy);
      data.set(copy, layerByteOffset(layer));
      uploadAll();
    },
    writeEngineLayer(layer: number, rgba: ArrayLike<number>, paintHex: number): void {
      const base = bases.get(layer);
      if (!base) {
        // No art on this layer ⇒ the pre-T4 path, unchanged.
        data.set(rgba, layerByteOffset(layer));
        upload(layer);
        return;
      }
      const { r, g, b } = hexToRgb(paintHex);
      const start = layerByteOffset(layer);
      for (let i = 0; i < PLATE_LAYER_BYTES; i += 4) {
        // Still the plate's paint colour ⇒ the engine chipped nothing here, so the
        // art shows through. Anything else is a chip and the engine wins.
        const src = rgba[i] === r && rgba[i + 1] === g && rgba[i + 2] === b ? base : rgba;
        data[start + i] = src[i];
        data[start + i + 1] = src[i + 1];
        data[start + i + 2] = src[i + 2];
        data[start + i + 3] = src[i + 3];
      }
      upload(layer);
    },
    dispose(): void {
      bases.clear();
      texture.dispose();
    },
  };
}

// onBeforeCompile anchors in three's meshphysical shader. Verified present in
// the pinned three 0.185.1; the guard below fails LOUDLY if an upgrade moves
// them (the one version-sensitive piece of this system — build-plan pins stand).
const VERTEX_ANCHOR = '#include <uv_vertex>';
const FRAGMENT_ANCHOR = 'vec4 diffuseColor = vec4( diffuse, opacity );';
const MAP_FRAGMENT = '#include <map_fragment>';

/**
 * Standard material patched to take its diffuse color from the plate's atlas
 * layer (per-instance `instanceTargetIndex` attribute selects the layer; rim
 * faces carry UV (−1,−1) and render flat gray). Lighting model untouched.
 *
 * ⚠️ NO `alphaTest`, AND THAT IS LOAD-BEARING. For one round (2026-08-06) this
 * material carried the atlas alpha into `diffuseColor` and set `alphaTest`, to give
 * a hostage target's window a see-through hole. It worked, and it cost the game 60
 * FPS → ~10 on device — *on every range*, including Range A, which has no hostage
 * target. `alphaTest` compiles a `discard` into the fragment shader, and a shader
 * that can discard cannot promise its depth ahead of shading, so the GPU turns off
 * early-Z / hidden-surface rejection for the whole draw. On a tile-based mobile GPU
 * (iPad, the shipping target) that is ruinous.
 *
 * Holes are therefore MESH geometry now — `TargetType.holeZoneIds` →
 * `plate-outline-geometry.ts`. Do not reintroduce `alphaTest`, `transparent`, or any
 * other per-fragment rejection on this material to serve a hole; there is a free way
 * to do it and this is the receipt for why the cheap-looking way is not cheap.
 */
export function createPlateMaterial(surface: THREE.DataArrayTexture): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.6 });

  material.onBeforeCompile = (shader) => {
    if (!shader.vertexShader.includes(VERTEX_ANCHOR) || !shader.fragmentShader.includes(FRAGMENT_ANCHOR)) {
      throw new Error('plate-surface: three shader anchors moved (three upgrade?) — update createPlateMaterial');
    }

    shader.uniforms.plateMapArray = { value: surface };

    shader.vertexShader =
      'attribute float instanceTargetIndex;\nvarying float vPlateLayer;\nvarying vec2 vPlateUv;\n' +
      shader.vertexShader.replace(
        VERTEX_ANCHOR,
        `${VERTEX_ANCHOR}
        vPlateLayer = instanceTargetIndex;
        vPlateUv = uv;`,
      );

    // Alpha comes from `opacity` alone and the texel is never inspected for it, so
    // three compiles no `discard` and the plate keeps its early-Z fast path. See the
    // warning on this function before changing that.
    shader.fragmentShader =
      'uniform sampler2DArray plateMapArray;\nvarying float vPlateLayer;\nvarying vec2 vPlateUv;\n' +
      shader.fragmentShader
        .replace(
          FRAGMENT_ANCHOR,
          `vec4 diffuseColor = vPlateUv.x < 0.0
            ? vec4( ${EDGE_GRAY}, ${EDGE_GRAY}, ${EDGE_GRAY}, opacity )
            : vec4( texture( plateMapArray, vec3( vPlateUv, vPlateLayer ) ).rgb, opacity );`,
        )
        .replace(MAP_FRAGMENT, '// map_fragment unused: diffuse comes from plateMapArray');
  };
  // One patched program shared by every user of this material (three would
  // otherwise key the cache on the closure identity).
  material.customProgramCacheKey = () => 'plate-surface-v1';

  return material;
}
