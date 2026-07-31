// CHARACTERIZATION GUARDS — target-system task T0.
//
// These tests assert nothing new about the design. They freeze what the plate
// system does TODAY so the target-system work (T1–T10, Design/archive/target-system-plan.md)
// can prove it changed nothing: the round disc keeps its exact vertices and UVs,
// and the chain-instance indexing contract every steel scene relies on stays put.
//
// `plate-geometry.test.ts` already covers the *meaning* of the disc (UV
// convention, winding, half assignment). This file is deliberately dumber: a
// whole-buffer signature that fails on ANY vertex change, meaningful or not.
// A bare hash mismatch is useless on its own, so the count and a few sentinel
// vertices are pinned alongside it — read those first when this goes red.

import { describe, it, expect } from 'vitest';
import { createPlateDiscGeometry } from './plate-geometry';
import { RANGE_A_RACKS } from './range-a-config';

/** FNV-1a over a canonical fixed-precision rendering of the buffer. Quantised to
 *  1e-6 so the signature is stable across platforms' float formatting while still
 *  catching any real geometry edit. */
function signature(values: readonly number[]): string {
  let h = 0x811c9dc5;
  for (const value of values) {
    // Round to 1e-6 and normalise -0 to 0 before stringifying.
    const q = Math.round(value * 1e6) / 1e6 + 0;
    const s = q.toFixed(6);
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    h ^= 0x2c; // field separator, so [1,23] and [12,3] differ
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function buffers(segments: number) {
  const geo = createPlateDiscGeometry(segments);
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  return {
    count: pos.count,
    positions: Array.from(pos.array as Float32Array),
    uvs: Array.from(uv.array as Float32Array),
  };
}

describe('T0 golden: plate disc geometry is byte-stable', () => {
  // 40 is the shipped default (every scene calls createPlateDiscGeometry() bare).
  const shipped = buffers(40);

  it('has the shipped vertex count', () => {
    // segments × 12: two cap fans (3 verts each) + a rim (6 verts) per segment.
    expect(shipped.count).toBe(480);
    expect(shipped.positions).toHaveLength(480 * 3);
    expect(shipped.uvs).toHaveLength(480 * 2);
  });

  it('pins sentinel vertices (read these first if the signature fails)', () => {
    // First downrange-cap triangle: fan centre at z = −0.5, u-centre 0.25.
    expect(shipped.positions.slice(0, 3)).toEqual([0, 0, -0.5]);
    expect(shipped.uvs.slice(0, 2)).toEqual([0.25, 0.5]);
    // First shooter-facing-cap triangle starts at vertex index segments*3 = 120.
    const capStart = 120;
    expect(shipped.positions.slice(capStart * 3, capStart * 3 + 3)).toEqual([0, 0, 0.5]);
    expect(shipped.uvs.slice(capStart * 2, capStart * 2 + 2)).toEqual([0.75, 0.5]);
    // First rim vertex starts at segments*6 = 240 and carries the no-texture UV.
    const rimStart = 240;
    expect(shipped.uvs.slice(rimStart * 2, rimStart * 2 + 2)).toEqual([-1, -1]);
  });

  it('matches the golden signature for positions and UVs', () => {
    expect(signature(shipped.positions)).toBe('c3e48f19');
    expect(signature(shipped.uvs)).toBe('735c836d');
  });

  it('is deterministic and segment-count sensitive', () => {
    // Same inputs → same buffer (no RNG, no Date, no module-level mutable state).
    expect(signature(buffers(40).positions)).toBe(signature(shipped.positions));
    // A different tessellation must NOT collide with the shipped signature.
    expect(signature(buffers(24).positions)).not.toBe(signature(shipped.positions));
  });
});

describe('T0 contract: chain instances are indexed instanceId*2 + side', () => {
  // Why this is load-bearing: the reaction loop indexes `chainRest[id*2 + ci]`
  // UNCONDITIONALLY on a hit (RangeScene.addChains, TestRangeScene.addChains,
  // ELRRangeScene.addChains all write that layout, and ELR relies on it even for
  // bolted stake plates, which get a collapsed pair rather than no pair). Any
  // scene that hands out non-contiguous instanceIds — or sizes the chain mesh off
  // anything but plates.length*2 — silently reads a stale or undefined matrix.
  //
  // RangeScene cannot be constructed in the node test env (its signs need a 2D
  // canvas), so this asserts the indexing arithmetic against the real plate
  // ladder rather than against a live scene.
  const plateCount = RANGE_A_RACKS.reduce((n, rack) => n + rack.plates.length, 0);

  it('Range A still has the plate ladder these guards were written against', () => {
    expect(RANGE_A_RACKS).toHaveLength(10);
    expect(plateCount).toBe(50); // 10 racks × 5 plates
  });

  it('assigns every plate a contiguous instanceId from 0', () => {
    // Mirrors RangeScene.addPlates' `let id = 0; … id++` walk over racks→plates.
    const ids: number[] = [];
    let id = 0;
    for (const rack of RANGE_A_RACKS) for (const _ of rack.plates) ids.push(id++);
    expect(ids).toHaveLength(plateCount);
    expect(ids[0]).toBe(0);
    expect(ids[ids.length - 1]).toBe(plateCount - 1);
  });

  it('maps the plate ids onto exactly the chain slots 0..2N−1, no gaps or collisions', () => {
    const slots = new Set<number>();
    for (let id = 0; id < plateCount; id++) {
      for (let side = 0; side < 2; side++) slots.add(id * 2 + side);
    }
    expect(slots.size).toBe(plateCount * 2);
    expect(Math.min(...slots)).toBe(0);
    expect(Math.max(...slots)).toBe(plateCount * 2 - 1);
  });
});
