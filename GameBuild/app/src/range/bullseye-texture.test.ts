import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  buildBullseyeLayer,
  ringColorAt,
  texelRadius,
  CENTRE_EDGE,
  MIDDLE_EDGE,
} from './bullseye-texture';
import { PLATE_TILE_WIDTH, PLATE_TILE_HEIGHT, PLATE_LAYER_BYTES, hexToRgb, createPlateSurface } from './plate-surface';
import { PLATE_HEX, RING_HEX } from './elr-range-config';

const texelAt = (data: Uint8Array, x: number, y: number) => {
  const i = (y * PLATE_TILE_WIDTH + x) * 4;
  return { r: data[i], g: data[i + 1], b: data[i + 2], a: data[i + 3] };
};

describe('ringColorAt', () => {
  it('is white at the aim point, blue in the middle band, white at the edge', () => {
    expect(ringColorAt(0)).toBe(PLATE_HEX);
    expect(ringColorAt(CENTRE_EDGE / 2)).toBe(PLATE_HEX);
    expect(ringColorAt((CENTRE_EDGE + MIDDLE_EDGE) / 2)).toBe(RING_HEX);
    expect(ringColorAt(0.9)).toBe(PLATE_HEX);
  });

  it('puts the boundaries at exactly 1/3 and 2/3 of the radius (1 and 2 MOA)', () => {
    expect(CENTRE_EDGE).toBeCloseTo(1 / 3, 9);
    expect(MIDDLE_EDGE).toBeCloseTo(2 / 3, 9);
    expect(ringColorAt(CENTRE_EDGE)).toBe(PLATE_HEX); // inclusive lower edge
    expect(ringColorAt(CENTRE_EDGE + 1e-9)).toBe(RING_HEX);
    expect(ringColorAt(MIDDLE_EDGE)).toBe(RING_HEX);
    expect(ringColorAt(MIDDLE_EDGE + 1e-9)).toBe(PLATE_HEX);
  });
});

describe('texelRadius', () => {
  it('is 0 at each cap centre', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    const cy = PLATE_TILE_HEIGHT / 2;
    expect(texelRadius(halfW / 2 - 0.5, cy - 0.5)).toBeCloseTo(0, 6);
    expect(texelRadius(halfW + halfW / 2 - 0.5, cy - 0.5)).toBeCloseTo(0, 6);
  });

  // The bug this prevents: the disc spans a QUARTER of the tile width but a HALF
  // of its height, so normalising both axes by the same number yields ellipses and
  // the "rings" come out as ovals.
  it('normalises per-axis, so the rings are circles and not ovals', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    const cx = halfW / 2 - 0.5;
    const cy = PLATE_TILE_HEIGHT / 2 - 0.5;
    const horizontalEdge = texelRadius(cx + halfW / 2, cy);
    const verticalEdge = texelRadius(cx, cy + PLATE_TILE_HEIGHT / 2);
    expect(horizontalEdge).toBeCloseTo(1, 3);
    expect(verticalEdge).toBeCloseTo(1, 3);
    expect(horizontalEdge).toBeCloseTo(verticalEdge, 3);
  });

  it('treats the two caps identically — a hit reads the same from either side', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    for (const dy of [0, 10, -10]) {
      const y = PLATE_TILE_HEIGHT / 2 + dy;
      expect(texelRadius(halfW / 4, y)).toBeCloseTo(texelRadius(halfW + halfW / 4, y), 9);
    }
  });
});

describe('buildBullseyeLayer', () => {
  const data = buildBullseyeLayer();

  it('fills exactly one plate-atlas layer', () => {
    expect(data.length).toBe(PLATE_LAYER_BYTES);
  });

  it('is fully opaque, including outside the disc', () => {
    for (let i = 3; i < data.length; i += 4) expect(data[i]).toBe(255);
  });

  it('paints white at both cap centres', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    const cy = Math.floor(PLATE_TILE_HEIGHT / 2);
    const white = hexToRgb(PLATE_HEX);
    for (const cx of [Math.floor(halfW / 2), Math.floor(halfW + halfW / 2)]) {
      const t = texelAt(data, cx, cy);
      expect({ r: t.r, g: t.g, b: t.b }).toEqual(white);
    }
  });

  it('paints blue in the middle band on both caps', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    const cy = Math.floor(PLATE_TILE_HEIGHT / 2);
    const blue = hexToRgb(RING_HEX);
    // Half-way between the two ring edges, along +u.
    const midR = (CENTRE_EDGE + MIDDLE_EDGE) / 2;
    for (const cx of [halfW / 2, halfW + halfW / 2]) {
      const x = Math.round(cx + midR * (halfW / 2));
      const t = texelAt(data, x, cy);
      expect({ r: t.r, g: t.g, b: t.b }).toEqual(blue);
    }
  });

  it('produces three bands along a radius — white, blue, white', () => {
    const halfW = PLATE_TILE_WIDTH / 2;
    const cx = halfW / 2;
    const cy = Math.floor(PLATE_TILE_HEIGHT / 2);
    const seen: string[] = [];
    for (let f = 0; f <= 0.95; f += 0.02) {
      const t = texelAt(data, Math.round(cx + f * (halfW / 2)), cy);
      const key = `${t.r},${t.g},${t.b}`;
      if (seen[seen.length - 1] !== key) seen.push(key);
    }
    const white = Object.values(hexToRgb(PLATE_HEX)).join(',');
    const blue = Object.values(hexToRgb(RING_HEX)).join(',');
    expect(seen).toEqual([white, blue, white]);
  });

  it('uses only the two authored colours — no interpolation artefacts', () => {
    const allowed = new Set([
      Object.values(hexToRgb(PLATE_HEX)).join(','),
      Object.values(hexToRgb(RING_HEX)).join(','),
    ]);
    for (let i = 0; i < data.length; i += 4) {
      expect(allowed.has(`${data[i]},${data[i + 1]},${data[i + 2]}`)).toBe(true);
    }
  });

  it('the blue band covers roughly the area it should (1/3 of the disc)', () => {
    // Ring area fraction = (2/3)^2 - (1/3)^2 = 1/3 of the disc. Counting texels is
    // a cheap end-to-end check that the radius maths is right, not just the edges.
    const blue = hexToRgb(RING_HEX);
    let ringTexels = 0;
    let discTexels = 0;
    for (let y = 0; y < PLATE_TILE_HEIGHT; y++) {
      for (let x = 0; x < PLATE_TILE_WIDTH; x++) {
        if (texelRadius(x, y) > 1) continue;
        discTexels++;
        const t = texelAt(data, x, y);
        if (t.r === blue.r && t.g === blue.g && t.b === blue.b) ringTexels++;
      }
    }
    expect(discTexels).toBeGreaterThan(0);
    expect(ringTexels / discTexels).toBeCloseTo(1 / 3, 2);
  });
});

// --- the first-hit wipe, and its fix (task T4b) -------------------------------
// The defect: `ELRRangeScene` wrote the bullseye through `writeLayer`, and a hit
// then overwrote that same layer wholesale with the engine's paint buffer — so the
// rings were erased by the first shot on every station. These tests reproduce the
// old behaviour and pin the new one, using the REAL ring art rather than a fixture.

describe('bullseye survives a hit (task T4b)', () => {
  /** An engine-style buffer: uniform plate paint, with a chip at one texel. */
  function engineBuffer(chipTexel: number): Uint8Array {
    const buf = new Uint8Array(PLATE_LAYER_BYTES);
    const p = hexToRgb(PLATE_HEX);
    for (let i = 0; i < PLATE_LAYER_BYTES; i += 4) {
      buf[i] = p.r;
      buf[i + 1] = p.g;
      buf[i + 2] = p.b;
      buf[i + 3] = 255;
    }
    // Engine chips reveal metal — deliberately not the paint colour.
    const o = chipTexel * 4;
    buf[o] = 0x8c;
    buf[o + 1] = 0x8c;
    buf[o + 2] = 0x8c;
    buf[o + 3] = 255;
    return buf;
  }

  /** A texel inside the blue band, found from the ring geometry itself. */
  function blueTexelIndex(): number {
    for (let y = 0; y < PLATE_TILE_HEIGHT; y++) {
      for (let x = 0; x < PLATE_TILE_WIDTH; x++) {
        const r = texelRadius(x, y);
        if (r > CENTRE_EDGE + 0.05 && r < MIDDLE_EDGE - 0.05) return y * PLATE_TILE_WIDTH + x;
      }
    }
    throw new Error('no blue texel found — ring geometry changed');
  }

  const blueIdx = blueTexelIndex();
  const blue = hexToRgb(RING_HEX);

  it('REPRODUCES the old defect: writeLayer erases the rings', () => {
    // Kept so a revert to `writeLayer` fails loudly instead of silently regressing
    // a shipped range's appearance.
    const s = createPlateSurface([PLATE_HEX]);
    s.writeLayer(0, buildBullseyeLayer());
    s.writeLayer(0, engineBuffer(4));
    const data = s.texture.image.data as Uint8Array;
    expect(data[blueIdx * 4]).not.toBe(blue.r); // blue gone
    s.dispose();
  });

  it('keeps the rings when the art is a BASE layer and the hit composites', () => {
    const s = createPlateSurface([PLATE_HEX]);
    s.setBaseLayer(0, buildBullseyeLayer());
    s.writeEngineLayer(0, engineBuffer(4), PLATE_HEX);
    const data = s.texture.image.data as Uint8Array;
    expect([data[blueIdx * 4], data[blueIdx * 4 + 1], data[blueIdx * 4 + 2]]).toEqual([
      blue.r, blue.g, blue.b,
    ]);
    // …and the splat still landed.
    expect([data[4 * 4], data[4 * 4 + 1], data[4 * 4 + 2]]).toEqual([0x8c, 0x8c, 0x8c]);
    s.dispose();
  });

  it('lets a splat chip THROUGH the blue ring, not just around it', () => {
    // The rings must not become armour: a hit inside the blue band has to mark it.
    const s = createPlateSurface([PLATE_HEX]);
    s.setBaseLayer(0, buildBullseyeLayer());
    s.writeEngineLayer(0, engineBuffer(blueIdx), PLATE_HEX);
    const data = s.texture.image.data as Uint8Array;
    expect([data[blueIdx * 4], data[blueIdx * 4 + 1]]).toEqual([0x8c, 0x8c]);
    s.dispose();
  });

  it('survives repeat hits', () => {
    const s = createPlateSurface([PLATE_HEX]);
    s.setBaseLayer(0, buildBullseyeLayer());
    for (const t of [4, 9, 400]) s.writeEngineLayer(0, engineBuffer(t), PLATE_HEX);
    const data = s.texture.image.data as Uint8Array;
    expect(data[blueIdx * 4]).toBe(blue.r);
    s.dispose();
  });
});

// --- wiring guard -------------------------------------------------------------

describe('ELR + shot-loop wiring uses the compositing path (task T4b)', () => {
  // A SOURCE-TEXT check, deliberately, and only because the alternative is nothing:
  // `ELRRangeScene` needs a THREE scene and a 2D canvas, so it cannot be
  // constructed in the node test env (`vite.config.ts` sets environment: 'node',
  // and adding `canvas` is forbidden by execution-protocol §3). The composite logic
  // itself is properly unit-tested above; this guards only the WIRING — that the
  // scene registers art as a base and the shot loop composites rather than
  // overwrites. Without it, a revert to `writeLayer` would be caught only by an
  // owner looking at a plate on device.
  const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');

  it('ELRRangeScene registers the bullseye as a BASE layer, not a plain write', () => {
    const src = read('./ELRRangeScene.ts');
    expect(src).toContain('setBaseLayer');
    expect(src).not.toMatch(/plateSurface\.writeLayer\(/);
  });

  it('the reaction controller writes engine buffers through writeEngineLayer', () => {
    // Moved here from ScopeView by T5's extraction — the paint write now lives with
    // the rest of the reaction lifecycle. (This guard failing on that move is the
    // brittleness a source-text test buys; it is still cheaper than no check.)
    const src = read('../scope/steel-reactions.ts');
    expect(src).toContain('writeEngineLayer');
    expect(src).not.toMatch(/plateSurface\.writeLayer\(/);
  });

  it('ScopeView no longer touches the plate surface directly', () => {
    // It delegates to the controller, so neither call should appear.
    const src = read('../scope/ScopeView.tsx');
    expect(src).not.toMatch(/plateSurface\.writeLayer\(/);
    expect(src).not.toMatch(/plateSurface\.writeEngineLayer\(/);
  });
});
