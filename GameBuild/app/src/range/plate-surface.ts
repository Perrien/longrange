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

  return {
    texture,
    writeLayer(layer: number, rgba: ArrayLike<number>): void {
      data.set(rgba, layerByteOffset(layer));
      texture.addLayerUpdate(layer); // partial upload: only this layer re-sends
      texture.needsUpdate = true;
    },
    dispose(): void {
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

/** Standard material patched to take its diffuse color from the plate's atlas
 * layer (per-instance `instanceTargetIndex` attribute selects the layer; rim
 * faces carry UV (−1,−1) and render flat gray). Lighting model untouched. */
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
