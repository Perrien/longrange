// Tests for the plate disc geometry (target-surface TS-B). Pure Three.js
// BufferGeometry math — runs in the node test env (no DOM/GL). The load-bearing
// invariant is the UV convention pinned by the TS-A native paint tests: the
// shooter-facing (+Z) cap samples the RIGHT texture half with the exact
// local-(x,y) → (u,v) mapping the C++ drawImpactOnTexture uses, so an engine
// splat renders at the true impact point on the plate face.

import { describe, it, expect } from 'vitest';
import { createPlateDiscGeometry } from './plate-geometry';

const SEGMENTS = 40;

function vertices(geo: ReturnType<typeof createPlateDiscGeometry>) {
  const pos = geo.getAttribute('position');
  const uv = geo.getAttribute('uv');
  const out: { x: number; y: number; z: number; u: number; v: number }[] = [];
  for (let i = 0; i < pos.count; i++) {
    out.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i), u: uv.getX(i), v: uv.getY(i) });
  }
  return out;
}

describe('plate disc geometry', () => {
  const geo = createPlateDiscGeometry(SEGMENTS);
  const verts = vertices(geo);
  const caps = verts.filter((v) => v.u >= 0);
  const rim = verts.filter((v) => v.u < 0);

  it('builds two cap fans + a rim (segments × 12 vertices), unit-sized', () => {
    expect(verts).toHaveLength(SEGMENTS * 12);
    for (const v of verts) {
      // Thickness ±0.5, radius ≤ 0.5 (unit disc; instance scale sizes it).
      expect(Math.abs(v.z)).toBeCloseTo(0.5, 9);
      expect(Math.hypot(v.x, v.y)).toBeLessThanOrEqual(0.5 + 1e-6);
    }
    // Rim vertices sit exactly on the radius.
    for (const v of rim) expect(Math.hypot(v.x, v.y)).toBeCloseTo(0.5, 6);
  });

  it('marks the rim untextured with UV (−1,−1)', () => {
    expect(rim).toHaveLength(SEGMENTS * 6);
    for (const v of rim) {
      expect(v.u).toBe(-1);
      expect(v.v).toBe(-1);
    }
  });

  it('maps the shooter-facing (+Z) cap to the RIGHT texture half, downrange cap to the LEFT', () => {
    for (const v of caps) {
      if (v.z > 0) {
        expect(v.u).toBeGreaterThanOrEqual(0.5);
        expect(v.u).toBeLessThanOrEqual(1);
      } else {
        expect(v.u).toBeGreaterThanOrEqual(0);
        expect(v.u).toBeLessThanOrEqual(0.5);
      }
    }
  });

  it('matches the engine paint mapping exactly: u = halfCenter + x·0.5, v = 0.5 + y', () => {
    // The C++ paints at u = 0.5 + x/width within the struck half
    // (drawImpactOnTexture; TS-A OffsetHitMapsLocalXYToTexel). For the unit
    // disc that compresses to the per-half mapping below — every cap vertex
    // must sit on it or the splat would render displaced from the impact.
    for (const v of caps) {
      const halfCenter = v.z > 0 ? 0.75 : 0.25;
      expect(v.u).toBeCloseTo(halfCenter + v.x * 0.5, 6);
      expect(v.v).toBeCloseTo(0.5 + v.y, 6);
    }
  });

  it('winds every face OUTWARD so FrontSide shows the correct cap', () => {
    // Regression for the TS-C iter-1 owner bug (2026-07-18): BTK's fan orders
    // front-faced inward (harmless under its DoubleSide material) — with our
    // FrontSide material that culled the shooter-facing painted cap at rest,
    // so splats only showed mid-swing (mirrored) and "vanished" on settle.
    const pos = geo.getAttribute('position');
    const uv = geo.getAttribute('uv');
    for (let t = 0; t < pos.count; t += 3) {
      const ax = pos.getX(t), ay = pos.getY(t), az = pos.getZ(t);
      const bx = pos.getX(t + 1), by = pos.getY(t + 1), bz = pos.getZ(t + 1);
      const cx = pos.getX(t + 2), cy = pos.getY(t + 2), cz = pos.getZ(t + 2);
      // Face normal from vertex order: (B−A) × (C−A).
      const ux = bx - ax, uy = by - ay, uz = bz - az;
      const vx = cx - ax, vy = cy - ay, vz = cz - az;
      const nx = uy * vz - uz * vy;
      const ny = uz * vx - ux * vz;
      const nz = ux * vy - uy * vx;
      if (uv.getX(t) >= 0) {
        // Cap triangle: front must point along the cap's own z (outward).
        expect(Math.sign(nz)).toBe(Math.sign(az));
        expect(Math.abs(nz)).toBeGreaterThan(Math.hypot(nx, ny));
      } else {
        // Rim triangle: front must point radially away from the axis.
        const mx = (ax + bx + cx) / 3;
        const my = (ay + by + cy) / 3;
        expect(nx * mx + ny * my).toBeGreaterThan(0);
        expect(Math.abs(nz)).toBeLessThan(1e-9);
      }
    }
  });

  it("puts the viewer's right (+X) at high u and up (+Y) at high v on the shooter face", () => {
    const face = caps.filter((v) => v.z > 0);
    const rightmost = face.reduce((a, b) => (b.x > a.x ? b : a));
    const topmost = face.reduce((a, b) => (b.y > a.y ? b : a));
    expect(rightmost.u).toBeCloseTo(1.0, 6);
    expect(topmost.v).toBeCloseTo(1.0, 6);
  });
});
