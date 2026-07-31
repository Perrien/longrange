// Tests for the target system's unit-frame geometry (task T1). Pure point/ring
// math — the containment and distance helpers that T2's hit test, T3b's SVG
// flattener and T4's triangulation all build on.

import { describe, it, expect } from 'vitest';
import {
  aspectOf,
  bounds,
  distanceToRing,
  distanceToSegment,
  fromUnitBox,
  outlinePolygon,
  pointInOutline,
  pointInPolygon,
  toUnitBox,
  zoneSamplePoints,
} from './target-geometry';
import type { Point } from './target-type';

// The real IDPA outline, used here for the aspect/unit-box assertions. Kept in
// sync with `target-type.test.ts`'s copy by the ONE thing that matters: both are
// transcribed from Documentation/Targets/idpa-target.svg, and T7 replaces both
// with the real module.
const IDPA_ASPECT = 663.75 / 393.25;

describe('frame conversion', () => {
  it('round-trips width-normalised ↔ unit box', () => {
    const p = { x: 0.31, y: 0.94 };
    const back = fromUnitBox(toUnitBox(p, 1.7), 1.7);
    expect(back.x).toBeCloseTo(p.x, 12);
    expect(back.y).toBeCloseTo(p.y, 12);
  });

  it('squeezes a tall target into the unit box on y only (the texture frame)', () => {
    // A silhouette's top edge sits at y = aspect/2 locally and must land at
    // v-extreme 0.5 in the unit box, matching plate-geometry's `v = 0.5 + y`.
    const top = toUnitBox({ x: 0, y: IDPA_ASPECT / 2 }, IDPA_ASPECT);
    expect(top.y).toBeCloseTo(0.5, 12);
    expect(top.x).toBe(0);
  });

  it('leaves a square target unchanged', () => {
    expect(toUnitBox({ x: 0.4, y: -0.25 }, 1)).toEqual({ x: 0.4, y: -0.25 });
  });
});

describe('outline + containment helpers', () => {
  it('generates a unit-width disc ring', () => {
    const ring = outlinePolygon({ kind: 'disc' }, 1, 8);
    expect(ring).toHaveLength(8);
    for (const p of ring) expect(Math.hypot(p.x, p.y)).toBeCloseTo(0.5, 12);
  });

  it('generates a rect ring that spans the full width and aspect-scaled height', () => {
    const ring = outlinePolygon({ kind: 'rect' }, 2.5);
    const b = bounds(ring);
    expect([b.minX, b.maxX]).toEqual([-0.5, 0.5]);
    expect([b.minY, b.maxY]).toEqual([-1.25, 1.25]);
    expect(aspectOf(ring)).toBeCloseTo(2.5, 12);
  });

  it('ray-casts points in and out of a concave ring', () => {
    // An L shape: the notch is what a convex-only test would get wrong.
    const L: Point[] = [
      { x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0 },
      { x: 0, y: 0 }, { x: 0, y: 0.5 }, { x: -0.5, y: 0.5 },
    ];
    expect(pointInPolygon({ x: -0.25, y: -0.25 }, L)).toBe(true);
    expect(pointInPolygon({ x: -0.25, y: 0.25 }, L)).toBe(true);
    expect(pointInPolygon({ x: 0.25, y: -0.25 }, L)).toBe(true);
    expect(pointInPolygon({ x: 0.25, y: 0.25 }, L)).toBe(false); // the notch
    expect(pointInPolygon({ x: 0.75, y: 0 }, L)).toBe(false);
  });

  it('samples a zone boundary plus its centre', () => {
    const pts = zoneSamplePoints({ kind: 'circle', cx: 0.1, cy: -0.2, r: 0.05 }, 16);
    expect(pts).toHaveLength(17);
    expect(pts[0]).toEqual({ x: 0.1, y: -0.2 });
    for (const p of pts.slice(1)) expect(Math.hypot(p.x - 0.1, p.y + 0.2)).toBeCloseTo(0.05, 12);
  });

  it('measures aspect from a bounding box', () => {
    expect(aspectOf([{ x: -0.5, y: -1 }, { x: 0.5, y: 1 }])).toBeCloseTo(2, 12);
  });
});

describe('boundary-tolerant containment', () => {
  const square: Point[] = [
    { x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 },
  ];

  it('measures distance to a segment, including past both ends', () => {
    const a = { x: 0, y: 0 };
    const b = { x: 1, y: 0 };
    expect(distanceToSegment({ x: 0.5, y: 0.25 }, a, b)).toBeCloseTo(0.25, 12); // perpendicular
    expect(distanceToSegment({ x: -1, y: 0 }, a, b)).toBeCloseTo(1, 12); // before a
    expect(distanceToSegment({ x: 2, y: 0 }, a, b)).toBeCloseTo(1, 12); // past b
    expect(distanceToSegment({ x: 0, y: 0 }, a, a)).toBe(0); // degenerate segment
  });

  it('measures distance to the nearest edge of a ring', () => {
    expect(distanceToRing({ x: 0, y: 0 }, square)).toBeCloseTo(0.5, 12);
    expect(distanceToRing({ x: 0.49, y: 0 }, square)).toBeCloseTo(0.01, 12);
    expect(distanceToRing({ x: 0.6, y: 0 }, square)).toBeCloseTo(0.1, 12);
  });

  it('accepts a point ON the boundary, which a bare ray cast cannot decide', () => {
    // This is the case that matters: a zone coincident with the outline (the IDPA
    // −3 zone IS the silhouette), whose own vertices land exactly on the ring.
    for (const v of square) expect(pointInOutline(v, square)).toBe(true);
    expect(pointInOutline({ x: 0.5, y: 0 }, square)).toBe(true);
  });

  it('still REJECTS a point genuinely outside — the tolerance is not slop', () => {
    // Guards the guard: if this ever passes, every zone-outside-outline check in
    // the validator has silently stopped working.
    expect(pointInOutline({ x: 0.5 + 1e-2, y: 0 }, square)).toBe(false);
    expect(pointInOutline({ x: 0.6, y: 0.6 }, square)).toBe(false);
    // Just inside the tolerance passes, just outside it does not.
    expect(pointInOutline({ x: 0.5 + 9e-4, y: 0 }, square)).toBe(true);
    expect(pointInOutline({ x: 0.5 + 1.1e-3, y: 0 }, square)).toBe(false);
  });
});
