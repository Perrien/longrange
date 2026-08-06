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
  PLATE_ALPHA_TEST,
  PLATE_FACE_CUTS_ENABLED,
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

describe('base-layer compositing (task T4)', () => {
  const PAINT = 0xf0f0ea;
  const CHIP = 0x8c8c8c; // engine metal-ish, deliberately not the paint colour

  /** An engine-style buffer: all paint, with a chip at one texel. */
  function engineBuffer(chipTexel: number): Uint8Array {
    const buf = new Uint8Array(PLATE_LAYER_BYTES);
    const p = hexToRgb(PAINT);
    for (let i = 0; i < PLATE_LAYER_BYTES; i += 4) {
      buf[i] = p.r;
      buf[i + 1] = p.g;
      buf[i + 2] = p.b;
      buf[i + 3] = 255;
    }
    const c = hexToRgb(CHIP);
    const o = chipTexel * 4;
    buf[o] = c.r;
    buf[o + 1] = c.g;
    buf[o + 2] = c.b;
    buf[o + 3] = 255;
    return buf;
  }

  /** Art: a distinctive colour everywhere. */
  function artBuffer(hex: number): Uint8Array {
    const buf = new Uint8Array(PLATE_LAYER_BYTES);
    fillLayerRgb(buf, 0, hex);
    return buf;
  }

  it('with NO base registered, writeEngineLayer is byte-identical to writeLayer', () => {
    // THE guarantee that makes T4 safe for Range A and the ELR Range: neither calls
    // setBaseLayer, so both keep the exact pre-T4 behaviour.
    const incoming = engineBuffer(17);
    const viaWrite = createPlateSurface([PAINT, PAINT]);
    const viaEngine = createPlateSurface([PAINT, PAINT]);
    viaWrite.writeLayer(1, incoming);
    viaEngine.writeEngineLayer(1, incoming, PAINT);
    expect(viaEngine.texture.image.data).toEqual(viaWrite.texture.image.data);
    // …including the partial-upload bookkeeping.
    expect(Array.from(viaEngine.texture.layerUpdates)).toEqual(
      Array.from(viaWrite.texture.layerUpdates),
    );
    viaWrite.dispose();
    viaEngine.dispose();
  });

  it('setBaseLayer draws the art and leaves other layers alone', () => {
    const s = createPlateSurface([PAINT, PAINT]);
    s.setBaseLayer(1, artBuffer(0xff0000));
    const data = s.texture.image.data as Uint8Array;
    expect([data[layerByteOffset(1)], data[layerByteOffset(1) + 1]]).toEqual([255, 0]);
    expect(data[0]).toBe(hexToRgb(PAINT).r); // layer 0 untouched
    s.dispose();
  });

  it('setBaseLayer requests a FULL upload, never a partial one', () => {
    // THE BUG (owner, on device 2026-07-31): the Test Range gong rendered BLACK until
    // its first hit. three's DataArrayTexture path calls texStorage3D to ALLOCATE and
    // then, if `layerUpdates` is non-empty, uploads ONLY those layers — everything
    // else is left undefined. Async `setBaseLayer` calls for the arted plates landed
    // before the first render and narrowed the pending full upload to layers 1–3, so
    // layer 0 never got data.
    const s = createPlateSurface([PAINT, PAINT, PAINT]);
    const before = s.texture.version;
    s.setBaseLayer(1, artBuffer(0xff0000));
    expect(Array.from(s.texture.layerUpdates)).toEqual([]);
    // `needsUpdate` is setter-only in three; the version bump is what it drives, and
    // what tells the renderer to re-upload.
    expect(s.texture.version).toBeGreaterThan(before);
    s.dispose();
  });

  it('setBaseLayer CLEARS a partial upload queued before it', () => {
    // The exact sequence that broke: a queued partial, then a base write. The base
    // write must widen the upload back to everything, not add to the queue.
    const s = createPlateSurface([PAINT, PAINT, PAINT]);
    s.writeEngineLayer(2, engineBuffer(3), PAINT); // queues layer 2
    expect(Array.from(s.texture.layerUpdates)).toEqual([2]);
    s.setBaseLayer(1, artBuffer(0xff0000));
    expect(Array.from(s.texture.layerUpdates)).toEqual([]);
    s.dispose();
  });

  it('keeps hit-time writes PARTIAL — the optimisation that matters', () => {
    // By the time a hit lands, a frame has rendered and the texture is fully uploaded,
    // so a 512 KB per-layer write is safe and avoids a whole-atlas re-send at impact.
    const s = createPlateSurface([PAINT, PAINT, PAINT]);
    s.writeEngineLayer(2, engineBuffer(3), PAINT);
    expect(Array.from(s.texture.layerUpdates)).toEqual([2]);
    s.dispose();
  });

  it('preserves art wherever the engine left paint, and shows the chip where it did not', () => {
    // This is the ELR bullseye fix in miniature: rings survive a hit, the splat
    // still lands.
    const s = createPlateSurface([PAINT]);
    s.setBaseLayer(0, artBuffer(0x2f6fd0)); // the ELR mid-blue ring colour
    s.writeEngineLayer(0, engineBuffer(42), PAINT);
    const data = s.texture.image.data as Uint8Array;
    const art = hexToRgb(0x2f6fd0);
    const chip = hexToRgb(CHIP);
    // Texel 0: engine left paint → art shows through.
    expect([data[0], data[1], data[2]]).toEqual([art.r, art.g, art.b]);
    // Texel 42: engine chipped → the chip wins.
    expect([data[42 * 4], data[42 * 4 + 1], data[42 * 4 + 2]]).toEqual([chip.r, chip.g, chip.b]);
    s.dispose();
  });

  it('accumulates chips across repeat writes without losing the art', () => {
    const s = createPlateSurface([PAINT]);
    s.setBaseLayer(0, artBuffer(0x2f6fd0));
    s.writeEngineLayer(0, engineBuffer(10), PAINT);
    // A later buffer carries BOTH chips, as the engine's does (it accumulates).
    const two = engineBuffer(10);
    const c = hexToRgb(CHIP);
    two[20 * 4] = c.r;
    two[20 * 4 + 1] = c.g;
    two[20 * 4 + 2] = c.b;
    s.writeEngineLayer(0, two, PAINT);
    const data = s.texture.image.data as Uint8Array;
    const art = hexToRgb(0x2f6fd0);
    expect([data[10 * 4], data[10 * 4 + 1]]).toEqual([c.r, c.g]);
    expect([data[20 * 4], data[20 * 4 + 1]]).toEqual([c.r, c.g]);
    expect([data[30 * 4], data[30 * 4 + 1]]).toEqual([art.r, art.g]);
    s.dispose();
  });

  it('composites against the plate colour it is TOLD, not the layer fill', () => {
    // The engine is given each plate's own paintColorHex, so the comparison colour
    // is a parameter rather than an assumption about the atlas.
    const s = createPlateSurface([0x000000]); // atlas filled black, paint is not
    s.setBaseLayer(0, artBuffer(0x00ff00));
    s.writeEngineLayer(0, engineBuffer(5), PAINT);
    const data = s.texture.image.data as Uint8Array;
    expect([data[0], data[1], data[2]]).toEqual([0, 255, 0]); // art, not black
    s.dispose();
  });

  it('rejects a base layer of the wrong size', () => {
    const s = createPlateSurface([PAINT]);
    expect(() => s.setBaseLayer(0, new Uint8Array(16))).toThrow(/must be \d+ bytes/);
    s.dispose();
  });

  it('keeps a CUT texel cut, even where the engine painted a chip over it', () => {
    // A hostage window is alpha 0 in the base. The engine paints splats with a
    // radius, so a hit just outside the rim spills opaque texels into the hole —
    // a hole that scabs shut when shot near is worse than no hole at all. The
    // engine buffer is always alpha 255 (`steel_target.cpp`), so a 0 can only
    // come from the authored cut, which makes "base alpha 0 wins" unambiguous.
    const s = createPlateSurface([PAINT]);
    const base = artBuffer(0x2f6fd0);
    base[7 * 4 + 3] = 0; // texel 7 is inside the window
    s.setBaseLayer(0, base);
    s.writeEngineLayer(0, engineBuffer(7), PAINT); // …and the engine chips exactly there
    const data = s.texture.image.data as Uint8Array;
    expect(data[7 * 4 + 3]).toBe(0); // still a hole
    expect(data[8 * 4 + 3]).toBe(255); // its neighbour is untouched steel
    s.dispose();
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
    expect(material.customProgramCacheKey()).toContain('plate-surface-v2');
    surface.dispose();
  });

  it('with face cuts ON, carries the atlas ALPHA into diffuseColor and arms alphaTest', () => {
    // How a face gets a real see-through hole (a hostage target's window): the
    // cut pass in `face-raster.ts` writes alpha 0, three's `alphatest_fragment`
    // — which sits just below the line patched here — discards it. Without the
    // `* plateTexel.a` term the hole renders as an opaque texel of whatever
    // colour happened to be underneath, which is the "just a black spot" bug.
    const surface = createPlateSurface([0xf0f0ea]);
    const material = createPlateMaterial(surface.texture, { faceCuts: true });
    expect(material.alphaTest).toBe(PLATE_ALPHA_TEST);
    // Discard, NOT blend: a sorted transparent pass for every plate on every
    // range would be the cost of serving one window.
    expect(material.transparent).toBe(false);

    const shader = mockShader();
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);
    expect(shader.fragmentShader).toContain('opacity * plateTexel.a');
    // The rim branch keeps plain opacity — a hole is authored on the FACE, and a
    // rim that vanished with it would show the plate's own back through the gap.
    expect(shader.fragmentShader).toContain(`vec4( ${0.55}, ${0.55}, ${0.55}, opacity )`);
    surface.dispose();
  });

  it('with face cuts OFF, emits NO alphaTest and never inspects the texel alpha', () => {
    // THE PERFORMANCE KILL SWITCH (owner, on device 2026-08-06: ~10 FPS, on Range A
    // too, which loads no hostage target). `alphaTest > 0` makes three emit a
    // `discard`, which costs a GPU its early-Z fast path for the whole draw. Off
    // must therefore mean no alphaTest AT ALL, not a threshold nothing trips —
    // three keys the shader define off `alphaTest > 0`, so 0 is what removes the
    // discard from the compiled program.
    const surface = createPlateSurface([0xf0f0ea]);
    const material = createPlateMaterial(surface.texture, { faceCuts: false });
    expect(material.alphaTest).toBe(0);

    const shader = mockShader();
    (material.onBeforeCompile as unknown as (s: unknown) => void)(shader);
    expect(shader.fragmentShader).not.toContain('plateTexel');
    expect(shader.fragmentShader).not.toContain('opacity * ');
    // Still samples the atlas for COLOUR — only the alpha handling changes.
    expect(shader.fragmentShader).toContain('texture( plateMapArray, vec3( vPlateUv, vPlateLayer ) )');
    surface.dispose();
  });

  it('gives the two branches DIFFERENT program cache keys', () => {
    // They are different programs. Sharing a cache entry would hand one branch the
    // other's compiled shader — a hole that renders solid, or a discard that was
    // supposed to be gone.
    const surface = createPlateSurface([0xf0f0ea]);
    const cut = createPlateMaterial(surface.texture, { faceCuts: true });
    const solid = createPlateMaterial(surface.texture, { faceCuts: false });
    expect(cut.customProgramCacheKey()).not.toBe(solid.customProgramCacheKey());
    surface.dispose();
  });

  it('defaults to the kill switch, so the scenes get whichever way it is thrown', () => {
    const surface = createPlateSurface([0xf0f0ea]);
    const material = createPlateMaterial(surface.texture);
    expect(material.alphaTest).toBe(PLATE_FACE_CUTS_ENABLED ? PLATE_ALPHA_TEST : 0);
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
