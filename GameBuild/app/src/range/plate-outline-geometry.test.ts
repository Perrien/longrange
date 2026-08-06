// Tests for non-round plate geometry (task T4). Pure BufferGeometry math — node
// test env, no DOM/GL.
//
// Both real silhouettes are exercised (IDPA and popper, flattened from the specs by
// T3b), because the properties that matter — no self-overlap on a non-convex ring,
// outward winding on every rim edge — are only interesting on shapes that are
// actually non-convex. A square would pass a broken implementation.

import { describe, it, expect } from 'vitest';
import type * as THREE from 'three';
import {
  createPlateOutlineGeometry,
  triangulateOutline,
  triangulatedArea,
} from './plate-outline-geometry';
import { flattenOutline } from './targets/svg-outline';
import { bounds } from './targets/target-geometry';
import type { Point } from './targets/target-type';

const IDPA_D =
  'M145,15 L278.25,15 L278.25,143 L360.75,143.5 L408.25,215.25 L408.25,566.25 L348,678.75 L74,678.75 L15,566.25 L15,214.75 L62.5,143.5 L144.75,143.25 Z';
const POPPER_D =
  'M70,10 A30,30 0 0,1 100,40 L100,104.3 A60,60 0 0,1 110,201 L100,430 L40,430 L30,201 A60,60 0 0,1 40,104.3 L40,40 A30,30 0 0,1 70,10 Z';

const IDPA = flattenOutline(IDPA_D);
const POPPER = flattenOutline(POPPER_D);
const SQUARE: Point[] = [
  { x: -0.5, y: -0.5 }, { x: 0.5, y: -0.5 }, { x: 0.5, y: 0.5 }, { x: -0.5, y: 0.5 },
];

/** Shoelace area of a ring. */
function ringArea(ring: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return Math.abs(a / 2);
}

function verts(geo: THREE.BufferGeometry) {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const out: { x: number; y: number; z: number; u: number; v: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), u: uv.getX(i), v: uv.getY(i) });
  }
  return out;
}

/** Face normal from a triangle's vertex order: (B−A) × (C−A). */
function faceNormal(
  pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute,
  t: number,
): { x: number; y: number; z: number } {
  const ax = pos.getX(t), ay = pos.getY(t), az = pos.getZ(t);
  const ux = pos.getX(t + 1) - ax, uy = pos.getY(t + 1) - ay, uz = pos.getZ(t + 1) - az;
  const vx = pos.getX(t + 2) - ax, vy = pos.getY(t + 2) - ay, vz = pos.getZ(t + 2) - az;
  return { x: uy * vz - uz * vy, y: uz * vx - ux * vz, z: ux * vy - uy * vx };
}

describe('triangulation covers the outline exactly', () => {
  for (const [name, o] of [['IDPA', IDPA], ['popper', POPPER]] as const) {
    it(`${name}: triangle areas sum to the ring area (no gaps, no overlap)`, () => {
      // THE non-convex check. A centroid fan over a reflex vertex produces
      // overlapping triangles, so the sum would EXCEED the ring area; a dropped
      // triangle would fall short. Equality pins both.
      const faces = triangulateOutline(o.points);
      expect(faces.length).toBe(o.points.length - 2); // a simple polygon's fan count
      expect(triangulatedArea(o.points, faces)).toBeCloseTo(ringArea(o.points), 9);
    });
  }

  it('a convex square triangulates too (the trivial case still works)', () => {
    const faces = triangulateOutline(SQUARE);
    expect(triangulatedArea(SQUARE, faces)).toBeCloseTo(1, 12);
  });
});

describe('createPlateOutlineGeometry', () => {
  const geo = createPlateOutlineGeometry(IDPA.points, IDPA.aspect);
  const v = verts(geo);
  const caps = v.filter((p) => p.u >= 0);
  const rim = v.filter((p) => p.u < 0);

  it('emits two caps plus a rim, at the expected counts', () => {
    const tris = IDPA.points.length - 2;
    expect(caps).toHaveLength(tris * 3 * 2); // both caps
    expect(rim).toHaveLength(IDPA.points.length * 6); // 2 triangles per edge
  });

  it('keeps thickness at ±0.5 and positions inside the width-normalised frame', () => {
    for (const p of v) {
      expect(Math.abs(p.z)).toBeCloseTo(0.5, 9);
      expect(Math.abs(p.x)).toBeLessThanOrEqual(0.5 + 1e-6);
      expect(Math.abs(p.y)).toBeLessThanOrEqual(IDPA.aspect / 2 + 1e-6);
    }
  });

  it('matches plate-geometry.ts UV convention exactly: u = halfCentre + x·0.5, v = 0.5 + y/aspect', () => {
    // Both generators feed the same C++ paint buffer through the same atlas, so a
    // divergence here renders splats displaced from the impact on one shape only.
    for (const p of caps) {
      const halfCentre = p.z > 0 ? 0.75 : 0.25;
      expect(p.u).toBeCloseTo(halfCentre + p.x * 0.5, 6);
      expect(p.v).toBeCloseTo(0.5 + p.y / IDPA.aspect, 6);
      expect(p.v).toBeGreaterThanOrEqual(-1e-6);
      expect(p.v).toBeLessThanOrEqual(1 + 1e-6);
    }
  });

  it('puts the shooter-facing cap in the RIGHT texture half and the downrange cap in the LEFT', () => {
    for (const p of caps) {
      if (p.z > 0) {
        expect(p.u).toBeGreaterThanOrEqual(0.5 - 1e-6);
      } else {
        expect(p.u).toBeLessThanOrEqual(0.5 + 1e-6);
      }
    }
  });

  it('marks every rim vertex untextured with UV (−1,−1)', () => {
    for (const p of rim) {
      expect(p.u).toBe(-1);
      expect(p.v).toBe(-1);
    }
  });

  it('winds every CAP face outward along its own z', () => {
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    let checked = 0;
    for (let t = 0; t < pos.count; t += 3) {
      if (uv.getX(t) < 0) continue; // rim, checked separately below
      const n = faceNormal(pos, t);
      const az = pos.getZ(t);
      expect(Math.sign(n.z)).toBe(Math.sign(az));
      expect(Math.abs(n.z)).toBeGreaterThan(Math.hypot(n.x, n.y));
      checked++;
    }
    expect(checked).toBe((IDPA.points.length - 2) * 2); // both caps, every triangle
  });

  it('winds every RIM face outward, away from the interior', () => {
    // Checked against the KNOWN emission order (caps first, then 6 vertices per
    // outline edge) rather than reverse-engineering the edge from the triangle —
    // an inferred edge direction is what made the first version of this test assert
    // the normal was parallel to the edge instead of perpendicular to it.
    const pos = geo.getAttribute('position');
    const rimStart = (IDPA.points.length - 2) * 3 * 2;
    for (let i = 0; i < IDPA.points.length; i++) {
      const a = IDPA.points[i];
      const b = IDPA.points[(i + 1) % IDPA.points.length];
      const ex = b.x - a.x;
      const ey = b.y - a.y;
      // For a CCW ring the interior is on the LEFT of a→b, so outward is (ey, −ex).
      const outX = ey;
      const outY = -ex;
      for (const tri of [0, 3]) {
        const n = faceNormal(pos, rimStart + i * 6 + tri);
        const len = Math.hypot(n.x, n.y, n.z);
        expect(len).toBeGreaterThan(0); // no degenerate rim triangle
        // Perpendicular to the edge…
        expect(Math.abs(n.x * ex + n.y * ey) / len).toBeLessThan(1e-6);
        // …flat in z (the rim is vertical)…
        expect(Math.abs(n.z) / len).toBeLessThan(1e-6);
        // …and pointing OUT, not in.
        expect(n.x * outX + n.y * outY).toBeGreaterThan(0);
      }
    }
  });

  it('spans the full unit box in v for a tall target', () => {
    // A silhouette must use the whole texture height, or the face art is letterboxed.
    const vs = caps.map((p) => p.v);
    expect(Math.min(...vs)).toBeCloseTo(0, 4);
    expect(Math.max(...vs)).toBeCloseTo(1, 4);
  });

  it('builds the popper too, arcs and all', () => {
    const g = createPlateOutlineGeometry(POPPER.points, POPPER.aspect);
    const b = bounds(verts(g).map((p) => ({ x: p.x, y: p.y })));
    expect(b.maxX - b.minX).toBeCloseTo(1, 6);
    expect(b.maxY - b.minY).toBeCloseTo(POPPER.aspect, 6);
  });
});

describe('createPlateOutlineGeometry input guards', () => {
  it('rejects too few points, a bad aspect, and clockwise winding', () => {
    expect(() => createPlateOutlineGeometry([{ x: 0, y: 0 }], 1)).toThrow(/need ≥3 outline points/);
    expect(() => createPlateOutlineGeometry(SQUARE, 0)).toThrow(/aspect must be > 0/);
    // CW winding would invert every face — caught rather than silently rendered
    // inside-out, which on a FrontSide material means an invisible plate.
    expect(() => createPlateOutlineGeometry([...SQUARE].reverse(), 1)).toThrow(
      /must be counter-clockwise/,
    );
  });
});

// --- holes (a hostage target's window) ---------------------------------------
//
// The point of this whole route: a hole that is real ABSENCE, not a transparent
// texel. The alpha/`alphaTest` version worked and cost the game 60 FPS → ~10 on
// device, because the `discard` it compiled in dropped every plate's early-Z. So
// these tests care about geometry, and about the winding that makes it correct.
describe('createPlateOutlineGeometry with holes', () => {
  /** A CW ring (opposite the outline) — what `holeRings` guarantees. */
  function cwCircle(cx: number, cy: number, r: number, segments = 32): Point[] {
    const pts: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (-2 * Math.PI * i) / segments; // negative ⇒ clockwise in y-up
      pts.push({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    }
    return pts;
  }

  const HOLE_R = 0.15;
  const hole = cwCircle(0, 0, HOLE_R);

  it('removes the hole from the triangulated area, rather than covering it', () => {
    // The sum-of-areas check the solid outline gets, with the hole subtracted: a
    // triangulation that quietly ignored the hole would come out at the full ring
    // area, and a hole punched twice (once per cap list) would undershoot.
    const faces = triangulateOutline(SQUARE, [hole]);
    const holeArea = ringArea(hole);
    const allPoints = [...SQUARE, ...hole];
    expect(triangulatedArea(allPoints, faces)).toBeCloseTo(1 - holeArea, 6);
    expect(holeArea).toBeGreaterThan(0); // the polygonised ring is not degenerate
  });

  it('leaves no cap triangle covering the hole centre', () => {
    // The property a player actually sees. Sampling the centre is the sharpest
    // version: if any triangle still spans it, the window renders solid.
    const geo = createPlateOutlineGeometry(SQUARE, 1, [hole]);
    const pos = geo.getAttribute('position');
    const inside = (t: number, px: number, py: number) => {
      // Same-side test: the point is inside iff it is on one consistent side of all
      // three edges.
      const sign = (ax: number, ay: number, bx: number, by: number) =>
        (px - bx) * (ay - by) - (ax - bx) * (py - by);
      const d1 = sign(pos.getX(t), pos.getY(t), pos.getX(t + 1), pos.getY(t + 1));
      const d2 = sign(pos.getX(t + 1), pos.getY(t + 1), pos.getX(t + 2), pos.getY(t + 2));
      const d3 = sign(pos.getX(t + 2), pos.getY(t + 2), pos.getX(t), pos.getY(t));
      return (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
    };
    // Cap triangles only — rim quads are vertical and legitimately cross x=y=0 in
    // projection. Caps are the flat-z ones.
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const flat =
        Math.abs(pos.getZ(t) - pos.getZ(t + 1)) < 1e-9 &&
        Math.abs(pos.getZ(t) - pos.getZ(t + 2)) < 1e-9;
      if (!flat) continue;
      expect(inside(t, 0, 0), `cap triangle at ${t} still covers the hole centre`).toBe(false);
    }
    geo.dispose();
  });

  it('gives the hole its own WALL, wound to face INTO the hole', () => {
    // Without a wall you would see through the plate's own shell — the window would
    // look like a bite out of a sheet rather than a bored hole. And the wall must
    // face inward: reversed, the hole reads as solid from every angle that matters.
    const solid = createPlateOutlineGeometry(SQUARE, 1);
    const holed = createPlateOutlineGeometry(SQUARE, 1, [hole]);
    // Two triangles (6 verts) per hole edge, added to the outline's own rim.
    const wallVerts = 6 * hole.length;
    const solidRimVerts = 6 * SQUARE.length;
    expect(holed.getAttribute('position').count).toBeGreaterThan(
      solid.getAttribute('position').count - solidRimVerts + wallVerts - 1,
    );

    // Facing: a wall quad's normal must point toward the hole's axis, i.e. its
    // horizontal component must oppose the vertex's own outward direction.
    const pos = holed.getAttribute('position');
    let checked = 0;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const zs = [pos.getZ(t), pos.getZ(t + 1), pos.getZ(t + 2)];
      if (Math.max(...zs) - Math.min(...zs) < 1e-9) continue; // a cap, not a wall
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      const rFromAxis = Math.hypot(cx, cy);
      if (rFromAxis > HOLE_R * 1.5) continue; // the OUTLINE's rim, not the hole's
      const n = faceNormal(pos, t);
      // Pointing inward ⇒ the normal's dot with the outward radial is negative.
      expect(n.x * cx + n.y * cy, `hole wall at ${t} faces outward`).toBeLessThan(0);
      checked++;
    }
    expect(checked, 'no hole-wall triangles were found at all').toBeGreaterThan(0);
    solid.dispose();
    holed.dispose();
  });

  it('marks hole-wall vertices as rim (UV −1,−1), so they render as bare steel', () => {
    // A bored hole shows metal on its inside, not a slice of the painted face.
    //
    // Selected per TRIANGLE, not per vertex: the hole's boundary vertices appear in
    // the caps too, at the same radius, carrying real face UVs. Only the vertical
    // (z-spanning) triangles are wall.
    const geo = createPlateOutlineGeometry(SQUARE, 1, [hole]);
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    let walls = 0;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const zs = [pos.getZ(t), pos.getZ(t + 1), pos.getZ(t + 2)];
      if (Math.max(...zs) - Math.min(...zs) < 1e-9) continue; // a cap
      const cx = (pos.getX(t) + pos.getX(t + 1) + pos.getX(t + 2)) / 3;
      const cy = (pos.getY(t) + pos.getY(t + 1) + pos.getY(t + 2)) / 3;
      if (Math.hypot(cx, cy) > HOLE_R * 1.5) continue; // the OUTLINE's rim
      for (let k = 0; k < 3; k++) {
        expect(uv.getX(t + k)).toBe(-1);
        expect(uv.getY(t + k)).toBe(-1);
      }
      walls++;
    }
    expect(walls, 'no hole-wall triangles were found at all').toBeGreaterThan(0);
    geo.dispose();
  });

  it('rejects a hole wound the SAME way as the outline', () => {
    // Winding is what earcut and the rim loop both key off. A CCW hole would fill
    // itself in AND turn its wall inside out — two silent failures, so it throws.
    const ccw = [...hole].reverse();
    expect(() => createPlateOutlineGeometry(SQUARE, 1, [ccw])).toThrow(/must be CLOCKWISE/);
  });

  it('rejects a degenerate hole rather than emitting a torn cap', () => {
    expect(() => createPlateOutlineGeometry(SQUARE, 1, [[{ x: 0, y: 0 }, { x: 0.1, y: 0 }]])).toThrow(
      /hole 0 needs ≥3 points/,
    );
  });

  it('is byte-identical to the solid geometry when no holes are passed', () => {
    // The guarantee that makes this change safe for the IDPA silhouette and the
    // popper, which have no holes and must not move.
    const before = createPlateOutlineGeometry(IDPA.points, IDPA.aspect);
    const after = createPlateOutlineGeometry(IDPA.points, IDPA.aspect, []);
    expect(after.getAttribute('position').array).toEqual(before.getAttribute('position').array);
    expect(after.getAttribute('uv').array).toEqual(before.getAttribute('uv').array);
    before.dispose();
    after.dispose();
  });
});
