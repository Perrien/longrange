// FFP reticle geometry (task 1.3a). Structural pins: tick placement is exactly
// k·pxPerUnit, cadence puts labelled majors every 5 units, the stadia are
// symmetric, and nothing is drawn past the scope-circle radius.

import { describe, it, expect } from 'vitest';
import { buildReticle, SUBMINOR_HALF_PX, MINOR_HALF_PX, MAJOR_HALF_PX, type ReticleUnit } from './reticle';
import { fovRadForMag, pixelsPerMil, pixelsPerMoa } from './scope-projection';

const H = 900;
const RADIUS = 360; // scope-circle radius, CSS px

describe('buildReticle', () => {
  it('places ticks at exactly k · pxPerUnit and matches the projection scale', () => {
    const fov = fovRadForMag(10);
    const r = buildReticle('MIL', fov, H, RADIUS);
    expect(r.pxPerUnit).toBeCloseTo(pixelsPerMil(fov, H), 12);
    for (const t of r.ticksX) {
      expect(t.offsetPx).toBeCloseTo(t.value * r.pxPerUnit, 12);
    }
  });

  it('uses the MOA pixel scale for the MOA reticle', () => {
    const fov = fovRadForMag(12);
    expect(buildReticle('MOA', fov, H, RADIUS).pxPerUnit).toBeCloseTo(pixelsPerMoa(fov, H), 12);
  });

  it('MIL cadence: 0.2 hashes labelled every 1 to 5 mil, 0.5 hashes to 20, then 1 mil', () => {
    // Low zoom → wide MIL span (~37 mil here) so all three bands appear.
    const r = buildReticle('MIL', fovRadForMag(4.5), H, RADIUS);
    const at = (v: number) => r.ticksY.find((t) => Math.abs(t.value - v) < 1e-9);
    const pos = r.ticksX.filter((t) => t.value > 0).map((t) => t.value);
    const has = (v: number) => pos.some((p) => Math.abs(p - v) < 1e-9);

    // 0–5: labelled majors every whole mil, fine 0.2 sub-hashes between them.
    for (const v of [1, 2, 3, 4, 5]) {
      const t = at(v)!;
      expect(t.major).toBe(true);
      expect(t.label).toBe(String(v));
      expect(t.halfLengthPx).toBe(MAJOR_HALF_PX);
    }
    for (const v of [0.2, 0.4, 2.6, 4.8]) expect(has(v)).toBe(true); // 0.2 grid
    expect(has(0.1)).toBe(false); // finer than 0.2
    const fine = at(0.2)!;
    expect(fine.major).toBe(false);
    expect(fine.label).toBeUndefined();
    expect(fine.halfLengthPx).toBe(SUBMINOR_HALF_PX);

    // 5–20: hashes every 0.5, labelled only every 5.
    for (const v of [5.5, 6, 6.5, 19.5]) expect(has(v)).toBe(true);
    for (const v of [5.2, 6.3]) expect(has(v)).toBe(false); // off the 0.5 grid
    expect(at(6)!.major).toBe(false); // whole mil, but not a multiple of 5
    expect(at(6)!.halfLengthPx).toBe(MINOR_HALF_PX);
    expect(at(6)!.label).toBeUndefined();
    expect(at(6.5)!.halfLengthPx).toBe(SUBMINOR_HALF_PX);
    expect(at(10)!.label).toBe('10');

    // Beyond 20: 1-mil hashes, still labelled every 5.
    for (const v of [21, 22]) expect(has(v)).toBe(true);
    expect(has(20.5)).toBe(false);
  });

  it('is symmetric about centre with no zero tick', () => {
    const r = buildReticle('MIL', fovRadForMag(10), H, RADIUS);
    expect(r.ticksX.some((t) => t.value === 0)).toBe(false);
    const positives = r.ticksX.filter((t) => t.value > 0).map((t) => t.value).sort((a, b) => a - b);
    const negatives = r.ticksX.filter((t) => t.value < 0).map((t) => -t.value).sort((a, b) => a - b);
    expect(positives).toEqual(negatives);
  });

  it('clips ticks to the scope-circle radius', () => {
    const r = buildReticle('MIL', fovRadForMag(10), H, RADIUS);
    for (const t of r.ticksX) expect(Math.abs(t.offsetPx)).toBeLessThanOrEqual(RADIUS);
    // The next tick out would exceed the radius.
    expect((r.maxValue + 1) * r.pxPerUnit).toBeGreaterThan(RADIUS);
  });

  it('shows more ticks zoomed out and fewer zoomed in (FFP: fixed angles, growing spacing)', () => {
    const wide = buildReticle('MIL', fovRadForMag(4.5), H, RADIUS);
    const tight = buildReticle('MIL', fovRadForMag(30), H, RADIUS);
    // Zoomed in, each mil eats more pixels, so fewer fit in the circle.
    expect(tight.pxPerUnit).toBeGreaterThan(wide.pxPerUnit);
    expect(tight.maxValue).toBeLessThan(wide.maxValue);
  });

  it('MOA reticle thins with distance: every 1 to 15, every 5 to 50, every 10 beyond', () => {
    // Low zoom → wide MOA span so all three bands appear inside the circle.
    const r = buildReticle('MOA', fovRadForMag(4.5), H, RADIUS);
    const pos = r.ticksX.filter((t) => t.value > 0).map((t) => t.value).sort((a, b) => a - b);
    for (let v = 1; v <= 15; v++) expect(pos).toContain(v); // every 1 to 15
    for (const v of [16, 17, 18, 19, 21, 26, 44]) expect(pos).not.toContain(v); // thinned past 15
    for (const v of [20, 25, 30, 35, 40, 45, 50]) expect(pos).toContain(v); // every 5 to 50
    for (const v of [60, 70, 80]) expect(pos).toContain(v); // every 10 beyond 50
    for (const v of [55, 65, 75]) expect(pos).not.toContain(v); // not every 5 beyond 50
    // Majors (labelled) are multiples of 5; the 1-MOA minors are not labelled.
    expect(r.ticksX.find((t) => t.value === 3)!.label).toBeUndefined();
    expect(r.ticksX.find((t) => t.value === 20)!.label).toBe('20');
  });

  it('MOA cadence stays inside the scope circle', () => {
    const r = buildReticle('MOA', fovRadForMag(4.5), H, RADIUS);
    for (const t of r.ticksX) expect(Math.abs(t.offsetPx)).toBeLessThanOrEqual(RADIUS);
  });

  it('both units build without error across the zoom range', () => {
    for (const unit of ['MIL', 'MOA'] as ReticleUnit[]) {
      for (const mag of [4.5, 10, 20, 35]) {
        const r = buildReticle(unit, fovRadForMag(mag), H, RADIUS);
        expect(r.ticksX.length).toBeGreaterThan(0);
      }
    }
  });
});
