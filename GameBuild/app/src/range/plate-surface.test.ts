// Tests for the plate surface atlas + material (target-surface TS-B). Runs in
// node — DataArrayTexture/material construction touches no GL until rendered.
// The shader patch itself is applied against a mock shader object here (the
// real compile is exercised visually / on device); the anchor guard failing
// loudly on a three upgrade is part of what's under test.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  PLATE_TEXTURE_SIZE,
  PLATE_TILE_WIDTH,
  PLATE_TILE_HEIGHT,
  PLATE_LAYER_BYTES,
  layerByteOffset,
  hexToRgb,
  fillLayerRgb,
  createPlateSurface,
  createPlateMaterial,
} from './plate-surface';
import { RANGE_A_RACKS } from './range-a-config';

describe('plate surface atlas', () => {
  it('tiles match the engine paint buffer: (2·size) × size RGBA', () => {
    // Pinned by TS-A BufferMatchesConstructorSize — writeLayer copies an engine
    // getTexture() buffer byte-for-byte, so these must agree.
    expect(PLATE_TILE_WIDTH).toBe(PLATE_TEXTURE_SIZE * 2);
    expect(PLATE_TILE_HEIGHT).toBe(PLATE_TEXTURE_SIZE);
    expect(PLATE_LAYER_BYTES).toBe(PLATE_TILE_WIDTH * PLATE_TILE_HEIGHT * 4);
    expect(layerByteOffset(3)).toBe(3 * PLATE_LAYER_BYTES);
  });

  it('converts hex paint colors to byte channels', () => {
    expect(hexToRgb(0xf0f0ea)).toEqual({ r: 240, g: 240, b: 234 });
    expect(hexToRgb(0xe0731d)).toEqual({ r: 224, g: 115, b: 29 });
  });

  it('fills each layer with its own opaque paint color', () => {
    const surface = createPlateSurface([0xff0000, 0x00ff00]);
    const img = surface.texture.image;
    expect(img.width).toBe(PLATE_TILE_WIDTH);
    expect(img.height).toBe(PLATE_TILE_HEIGHT);
    expect(img.depth).toBe(2);

    const data = img.data as Uint8Array;
    // First and last texel of layer 0 = red, opaque.
    expect([data[0], data[1], data[2], data[3]]).toEqual([255, 0, 0, 255]);
    const lastTexel = PLATE_LAYER_BYTES - 4;
    expect([data[lastTexel], data[lastTexel + 1], data[lastTexel + 2], data[lastTexel + 3]]).toEqual([255, 0, 0, 255]);
    // First texel of layer 1 = green.
    const l1 = layerByteOffset(1);
    expect([data[l1], data[l1 + 1], data[l1 + 2], data[l1 + 3]]).toEqual([0, 255, 0, 255]);
    surface.dispose();
  });

  it('tags the texture for sRGB byte colors, no flip, linear filtering', () => {
    const surface = createPlateSurface([0xf0f0ea]);
    expect(surface.texture.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(surface.texture.flipY).toBe(false);
    expect(surface.texture.minFilter).toBe(THREE.LinearFilter);
    expect(surface.texture.magFilter).toBe(THREE.LinearFilter);
    surface.dispose();
  });

  it('writeLayer overwrites exactly one layer and queues a partial upload', () => {
    const surface = createPlateSurface([0x101010, 0x202020]);
    const incoming = new Uint8Array(PLATE_LAYER_BYTES).fill(9);
    surface.writeLayer(1, incoming);

    const data = surface.texture.image.data as Uint8Array;
    expect(data[layerByteOffset(1)]).toBe(9);
    expect(data[layerByteOffset(2) - 1]).toBe(9);
    // Layer 0 untouched.
    expect(data[0]).toBe(0x10);
    // Partial-upload path: only layer 1 marked (plus the needsUpdate flag).
    expect(Array.from(surface.texture.layerUpdates)).toEqual([1]);
    surface.dispose();
  });

  it('fillLayerRgb targets the requested layer only', () => {
    const data = new Uint8Array(PLATE_LAYER_BYTES * 2);
    fillLayerRgb(data, 1, 0x0000ff);
    expect(data[0]).toBe(0); // layer 0 untouched
    expect([data[layerByteOffset(1)], data[layerByteOffset(1) + 2]]).toEqual([0, 255]);
  });
});

describe('plate material patch', () => {
  const mockShader = () => ({
    uniforms: {} as Record<string, { value: unknown }>,
    vertexShader: 'void main() {\n#include <uv_vertex>\n}',
    fragmentShader: 'void main() {\n\tvec4 diffuseColor = vec4( diffuse, opacity );\n\t#include <map_fragment>\n}',
  });

  it('injects the atlas sampler, per-instance layer attribute, and edge-gray branch', () => {
    const surface = createPlateSurface([0xf0f0ea]);
    const material = createPlateMaterial(surface.texture);
    expect(material).toBeInstanceOf(THREE.MeshStandardMaterial);

    const shader = mockShader();
    // three passes a renderer arg too; the patch ignores it.
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);

    expect(shader.uniforms.plateMapArray?.value).toBe(surface.texture);
    expect(shader.vertexShader).toContain('attribute float instanceTargetIndex;');
    expect(shader.vertexShader).toContain('vPlateUv = uv;');
    expect(shader.fragmentShader).toContain('uniform sampler2DArray plateMapArray;');
    expect(shader.fragmentShader).toContain('texture( plateMapArray, vec3( vPlateUv, vPlateLayer ) )');
    // The stock diffuse line and map sampling are gone (replaced, not doubled).
    expect(shader.fragmentShader).not.toContain('vec4 diffuseColor = vec4( diffuse, opacity );');
    expect(shader.fragmentShader).not.toContain('#include <map_fragment>');
    // Cache key is stable so every plate mesh shares one program.
    expect(material.customProgramCacheKey()).toBe('plate-surface-v1');
    surface.dispose();
  });

  it('fails LOUDLY if a three upgrade moves the shader anchors', () => {
    const surface = createPlateSurface([0xf0f0ea]);
    const material = createPlateMaterial(surface.texture);
    const broken = { uniforms: {}, vertexShader: 'void main() {}', fragmentShader: 'void main() {}' };
    expect(() => (material.onBeforeCompile as unknown as (s: unknown) => void)(broken)).toThrow(/anchors moved/);
    surface.dispose();
  });
});

describe('range config paint colors', () => {
  it('leaves every rack on the default paint (no per-rack override set)', () => {
    for (const r of RANGE_A_RACKS) {
      expect(r.paintColor).toBeUndefined();
    }
  });
});
