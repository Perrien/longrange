// Headless-three geometry tests for the ported BTK flag cloth
// (wind-system-btk-port W2), in the style of `plate-outline-geometry.test.ts`
// — pure BufferGeometry math, node test env, no DOM/GL. Only
// `createFlagGeometry` is exercised here: everything else in WindMarkers.ts
// (texture/material/instanced mesh) touches `document.createElement('canvas')`
// and isn't unit-testable outside a browser — that's the owner's on-device
// check at the W2 stop.
import { describe, it, expect } from 'vitest';
import { createFlagGeometry } from './WindMarkers';
import { FLAG_CONFIG } from '../range/wind-marker-visual-config';

describe('WindMarkers/createFlagGeometry', () => {
  const geo = createFlagGeometry(FLAG_CONFIG);

  it('emits 4 vertices per segment column (front top/bottom, back top/bottom)', () => {
    const pos = geo.getAttribute('position');
    expect(pos.count).toBe(FLAG_CONFIG.segments * 4);
  });

  it('index count matches front + back + top-edge + bottom-edge triangle strips', () => {
    const idx = geo.getIndex();
    expect(idx).not.toBeNull();
    const columnPairs = FLAG_CONFIG.segments - 1;
    // 2 tris front + 2 back + 2 top edge + 2 bottom edge = 8 tris/pair, 3 indices/tri.
    expect(idx!.count).toBe(columnPairs * 8 * 3);
  });

  it('segmentT runs 0 -> 1 across the columns and is constant within a column', () => {
    const segmentT = geo.getAttribute('segmentT');
    expect(segmentT.getX(0)).toBeCloseTo(0, 9);
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    for (let k = 0; k < 4; k++) {
      expect(segmentT.getX(lastColumnStart + k)).toBeCloseTo(1, 9);
    }

    let prev = -Infinity;
    for (let col = 0; col < FLAG_CONFIG.segments; col++) {
      const base = col * 4;
      const t = segmentT.getX(base);
      for (let k = 1; k < 4; k++) {
        expect(segmentT.getX(base + k)).toBeCloseTo(t, 9); // constant within the column
      }
      expect(t).toBeGreaterThanOrEqual(prev); // monotonic across columns
      prev = t;
    }
  });

  it('tapers from baseWidthM at the hinge to tipWidthM at the tip', () => {
    // toBeCloseTo(..., 6): positions are stored in a Float32BufferAttribute
    // (Three requires it), so this compares a float32-rounded value against
    // a float64 literal — exact-to-9-places would fail on the rounding alone.
    const pos = geo.getAttribute('position');
    // Column 0 = hinge: top/front vertex (index 0) is at +halfBaseWidth.
    expect(pos.getY(0)).toBeCloseTo(FLAG_CONFIG.baseWidthM / 2, 6);
    // Last column = tip.
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    expect(pos.getY(lastColumnStart)).toBeCloseTo(FLAG_CONFIG.tipWidthM / 2, 6);
  });

  it('spans local X from 0 (hinge) to lengthM (tip), undeformed', () => {
    const pos = geo.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(0, 9);
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    expect(pos.getX(lastColumnStart)).toBeCloseTo(FLAG_CONFIG.lengthM, 6);
  });

  it('has an explicit bounding sphere covering the flag\'s max 3D extent, ×1.1 margin (P7)', () => {
    expect(geo.boundingSphere).not.toBeNull();
    const halfMaxWidth = Math.max(FLAG_CONFIG.baseWidthM, FLAG_CONFIG.tipWidthM) * 0.5;
    const expectedRadius =
      Math.sqrt(FLAG_CONFIG.lengthM ** 2 + halfMaxWidth ** 2 + FLAG_CONFIG.flapAmplitude ** 2) * 1.1;
    expect(geo.boundingSphere!.radius).toBeCloseTo(expectedRadius, 6);
    expect(geo.boundingSphere!.center.length()).toBe(0);
  });
});
