// Tests for the SVG outline parser + flattener (task T3b).
//
// Both real specs are exercised: the IDPA silhouette (straight segments only) and
// the popper (four circular arcs, and a non-convex waist). The arc tests check
// against the TRUE circle rather than against recorded output, so they would catch a
// wrong centre-parameterisation rather than just a changed one.

import { describe, it, expect } from 'vitest';
import {
  flattenOutline,
  localCircle,
  localPolygon,
  parsePath,
  signedArea,
  svgFrameOf,
  toCcw,
  toLocal,
} from './svg-outline';
import { bounds } from './target-geometry';
import type { Point } from './target-type';

// Verbatim from Documentation/Targets/idpa-target.svg (viewBox 423×694, 30.75" tall).
const IDPA_D =
  'M145,15 L278.25,15 L278.25,143 L360.75,143.5 L408.25,215.25 L408.25,566.25 L348,678.75 L74,678.75 L15,566.25 L15,214.75 L62.5,143.5 L144.75,143.25 Z';
const IDPA_MINUS1_D =
  'M148,148 L275,147.75 L338.25,218 L338.25,431.75 L274.5,537.75 L148.25,537.75 L84.75,432 L84.75,217.75 Z';

// Verbatim from Documentation/Targets/idpa-popper.svg (viewBox 140×440, 42" tall).
const POPPER_D = `M70,10
       A30,30 0 0,1 100,40
       L100,104.3
       A60,60 0 0,1 110,201
       L100,430
       L40,430
       L30,201
       A60,60 0 0,1 40,104.3
       L40,40
       A30,30 0 0,1 70,10
       Z`;

describe('parsePath', () => {
  it('parses an all-straight closed path', () => {
    const pts = parsePath(IDPA_D);
    expect(pts).toHaveLength(12);
    expect(pts[0]).toEqual({ x: 145, y: 15 });
    expect(pts[11]).toEqual({ x: 144.75, y: 143.25 });
  });

  it('treats a repeated coordinate pair after M as an implicit L', () => {
    expect(parsePath('M0,0 10,0 10,10 Z')).toEqual([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
    ]);
  });

  it('drops a duplicated closing vertex so the ring has no zero-length edge', () => {
    const pts = parsePath('M0,0 L10,0 L10,10 L0,0 Z');
    expect(pts).toHaveLength(3);
  });

  it('handles comma, space and newline separators identically', () => {
    const a = parsePath('M0,0 L10,0 L10,10 Z');
    const b = parsePath('M 0 0\n  L 10 0\n  L 10 10\nZ');
    expect(a).toEqual(b);
  });

  it('names an unsupported command instead of dropping it', () => {
    // A silently-skipped curve yields a plausible but WRONG silhouette that passes
    // every other check — the reason this throws.
    expect(() => parsePath('M0,0 C1,1 2,2 3,3 Z')).toThrow(/unsupported path command 'C'/);
    expect(() => parsePath('M0,0 l10,0 Z')).toThrow(/unsupported path command 'l'/);
  });

  it('rejects an unclosed path and a degenerate one', () => {
    expect(() => parsePath('M0,0 L10,0')).toThrow(/not closed/);
    expect(() => parsePath('M0,0 L10,0 Z')).toThrow(/only 2 point\(s\)/);
  });

  it('rejects a missing coordinate rather than reading undefined as 0', () => {
    expect(() => parsePath('M0,0 L10 Z')).toThrow(/'L' expected a number/);
  });
});

describe('arc flattening', () => {
  it('puts every flattened point on the true circle', () => {
    // A half-circle of r=30 centred at (70,40): 'M40,40 A30,30 0 0,1 100,40'.
    const pts = parsePath('M40,40 A30,30 0 0,1 100,40 Z');
    expect(pts.length).toBeGreaterThan(8); // actually subdivided, not a single chord
    for (const p of pts) {
      expect(Math.hypot(p.x - 70, p.y - 40)).toBeCloseTo(30, 6);
    }
  });

  it('honours the sweep flag by going the other way round', () => {
    const cw = parsePath('M40,40 A30,30 0 0,1 100,40 Z');
    const ccw = parsePath('M40,40 A30,30 0 0,0 100,40 Z');
    // Same endpoints, opposite bulge: one arcs to larger y, the other to smaller.
    const midCw = cw[Math.floor(cw.length / 2)];
    const midCcw = ccw[Math.floor(ccw.length / 2)];
    expect(Math.sign(midCw.y - 40)).toBe(-Math.sign(midCcw.y - 40));
    for (const p of [...cw, ...ccw]) expect(Math.hypot(p.x - 70, p.y - 40)).toBeCloseTo(30, 6);
  });

  it('turns in the sweep flag\'s direction for EVERY endpoint orientation', () => {
    // A single endpoint pair is not enough: the raw sweep angle is already correctly
    // signed for some orientations, so one case can pass while the normalisation is
    // broken. (It did — a mutation that dropped the `!sweep` branch passed the test
    // above.) Sweeping several orientations, in both endpoint orders, pins it.
    const arcs: [string, string][] = [
      ['M40,40', '100,40'], // horizontal chord, left→right
      ['M100,40', '40,40'], // …and right→left
      ['M70,10', '70,70'], // vertical chord, top→bottom
      ['M70,70', '70,10'], // …and bottom→top
      ['M50,20', '90,60'], // diagonal
      ['M90,60', '50,20'],
    ];
    /** Total signed turn of a polyline: sign tells which way the arc curves. */
    const turn = (pts: { x: number; y: number }[]): number => {
      let t = 0;
      for (let i = 1; i < pts.length - 1; i++) {
        const ax = pts[i].x - pts[i - 1].x;
        const ay = pts[i].y - pts[i - 1].y;
        const bx = pts[i + 1].x - pts[i].x;
        const by = pts[i + 1].y - pts[i].y;
        t += ax * by - ay * bx;
      }
      return t;
    };
    for (const [start, end] of arcs) {
      const s1 = parsePath(`${start} A30,30 0 0,1 ${end} Z`);
      const s0 = parsePath(`${start} A30,30 0 0,0 ${end} Z`);
      // sweep=1 and sweep=0 must curve in OPPOSITE directions, always.
      expect(Math.sign(turn(s1))).toBe(-Math.sign(turn(s0)));
      // And sweep=1 must always curve the same way, whatever the orientation —
      // that consistency is exactly what the angle normalisation guarantees.
      expect(Math.sign(turn(s1))).toBe(Math.sign(turn(parsePath('M40,40 A30,30 0 0,1 100,40 Z'))));
    }
  });

  it('honours the large-arc flag', () => {
    const small = parsePath('M40,40 A30,30 0 0,1 70,10 Z');
    const large = parsePath('M40,40 A30,30 0 1,1 70,10 Z');
    expect(large.length).toBeGreaterThan(small.length);
  });

  it('lands exactly on the authored endpoint', () => {
    // Pinned rather than left to accumulate rounding, so a closed path closes.
    const pts = parsePath('M40,40 A30,30 0 0,1 100,40 Z');
    expect(pts[pts.length - 1]).toEqual({ x: 100, y: 40 });
  });

  it('degrades a zero-radius arc to a straight line, per the spec', () => {
    const pts = parsePath('M0,0 A0,0 0 0,1 10,0 L10,10 Z');
    expect(pts).toEqual([{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }]);
  });

  it('scales up radii too small to span the endpoints, instead of producing NaN', () => {
    const pts = parsePath('M0,0 A1,1 0 0,1 100,0 Z');
    for (const p of pts) {
      expect(Number.isFinite(p.x)).toBe(true);
      expect(Number.isFinite(p.y)).toBe(true);
    }
  });
});

describe('winding normalisation', () => {
  it('measures signed area with CCW positive in a y-up frame', () => {
    const ccw = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }, { x: 0, y: 1 }];
    expect(signedArea(ccw)).toBeCloseTo(1, 12);
    expect(signedArea([...ccw].reverse())).toBeCloseTo(-1, 12);
  });

  it('forces CCW regardless of the source direction, preserving the shape', () => {
    const cw = [{ x: 0, y: 1 }, { x: 1, y: 1 }, { x: 1, y: 0 }, { x: 0, y: 0 }];
    const fixed = toCcw(cw);
    expect(signedArea(fixed)).toBeGreaterThan(0);
    expect(Math.abs(signedArea(fixed))).toBeCloseTo(Math.abs(signedArea(cw)), 12);
    // Same vertex set, just reordered — no point invented or lost.
    expect(new Set(fixed.map((p) => `${p.x},${p.y}`))).toEqual(
      new Set(cw.map((p) => `${p.x},${p.y}`)),
    );
  });

  it('leaves an already-CCW ring untouched', () => {
    const ccw = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }];
    expect(toCcw(ccw)).toEqual(ccw);
  });
});

describe('frame + normalisation', () => {
  it('normalises the outline to span exactly the full width, centred', () => {
    const { points } = flattenOutline(IDPA_D);
    const b = bounds(points);
    expect(b.minX).toBeCloseTo(-0.5, 12);
    expect(b.maxX).toBeCloseTo(0.5, 12);
    expect(b.minY + b.maxY).toBeCloseTo(0, 12); // centred in y
  });

  it('flips SVG y-down into game y-up', () => {
    const frame = svgFrameOf([{ x: 0, y: 0 }, { x: 100, y: 200 }]);
    // A point ABOVE the centre in SVG (smaller y) must land at positive local y.
    expect(toLocal({ x: 50, y: 0 }, frame).y).toBeGreaterThan(0);
    expect(toLocal({ x: 50, y: 200 }, frame).y).toBeLessThan(0);
  });

  it("matches the IDPA drawing's stated 30.75in height", () => {
    const { aspect } = flattenOutline(IDPA_D);
    expect(aspect).toBeCloseTo(1.6879, 3);
    // Implied width 30.75 / aspect ≈ 18.2" against 18" of real cardboard.
    const impliedWidthIn = 30.75 / aspect;
    expect(impliedWidthIn).toBeGreaterThan(17.8);
    expect(impliedWidthIn).toBeLessThan(18.6);
  });

  it("recovers the popper drawing's stated dimensions from its geometry", () => {
    const { points, aspect, frame } = flattenOutline(POPPER_D);
    // The drawing is 10 px per inch (420 px of outline over a stated 42" height),
    // and the flattened bbox is 120 px wide → 12.0", which is exactly the R6" body
    // circle the spec comment describes. So the stated dimensions are RECOVERED
    // from the path rather than taken on trust.
    expect(frame.widthPx).toBeCloseTo(120, 1);
    expect(aspect).toBeCloseTo(3.5, 3); // 42" ÷ 12"
    expect(42 / aspect).toBeCloseTo(12, 2);
    expect(points.length).toBeGreaterThan(20); // arcs subdivided
  });

  it('captures the arc bulge — without flattening the popper would be 8in wide', () => {
    // THE POINT OF ARC SUPPORT. The authored line endpoints only span x = 30..110
    // (80 px = 8", the waist pinch); the R6" body arcs bulge out to x = 10..130
    // (120 px = 12"). A parser that treated `A` as a straight line would produce a
    // silhouette a third too narrow and nothing else would notice.
    const authoredXs = [70, 100, 100, 110, 100, 40, 30, 40, 40, 70];
    const authoredWidth = Math.max(...authoredXs) - Math.min(...authoredXs);
    expect(authoredWidth).toBe(80);
    const flattened = flattenOutline(POPPER_D).frame.widthPx;
    expect(flattened).toBeGreaterThan(authoredWidth * 1.4);
  });

  it('gives the popper a non-convex waist — what T4 must triangulate', () => {
    // The pinch is a reflex vertex, so a centroid fan would self-overlap. Detect it
    // by finding at least one negative cross product in an otherwise CCW ring.
    const { points } = flattenOutline(POPPER_D);
    expect(signedArea(points)).toBeGreaterThan(0);
    let reflex = 0;
    for (let i = 0; i < points.length; i++) {
      const a = points[(i + points.length - 1) % points.length];
      const b = points[i];
      const c = points[(i + 1) % points.length];
      const cross = (b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x);
      if (cross < -1e-12) reflex++;
    }
    expect(reflex).toBeGreaterThan(0);
  });
});

describe('zones share the outline frame', () => {
  it('normalises an inner path against the OUTLINE, not itself', () => {
    // The bug a T1 test caught: normalising a zone against its own bbox stretches
    // it to fill the target. Against the outline's frame it stays inset.
    const { frame } = flattenOutline(IDPA_D);
    const zone = localPolygon(IDPA_MINUS1_D, frame);
    expect(zone.kind).toBe('polygon');
    const b = bounds((zone as { points: readonly Point[] }).points);
    expect(b.maxX).toBeLessThan(0.5);
    expect(b.minX).toBeGreaterThan(-0.5);
    // And it is genuinely inset, not merely inside by rounding.
    expect(b.maxX - b.minX).toBeLessThan(0.9);
  });

  it('keeps a circle circular, with the radius scaled by the outline width', () => {
    const { frame } = flattenOutline(IDPA_D);
    const head = localCircle(211.55, 90.55, 41.2, frame);
    expect(head.kind).toBe('circle');
    const c = head as { cx: number; cy: number; r: number };
    expect(c.r).toBeCloseTo(41.2 / frame.widthPx, 12);
    // The head sits ABOVE centre in the drawing, so positive local y.
    expect(c.cy).toBeGreaterThan(0);
  });

  it('rejects a non-positive circle radius', () => {
    const { frame } = flattenOutline(IDPA_D);
    expect(() => localCircle(0, 0, 0, frame)).toThrow(/circle needs r > 0/);
  });
});
