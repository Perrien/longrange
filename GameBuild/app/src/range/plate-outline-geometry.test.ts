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
