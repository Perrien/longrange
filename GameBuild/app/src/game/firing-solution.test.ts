// Pure firing-solution math tests (task 1.4b; vecToWind/averageEffectiveWind
// added task 1.7a). No WASM — all deterministic.
import { describe, it, expect } from 'vitest';
import {
  windToVec,
  vecToWind,
  averageEffectiveWind,
  requiredCorrectionRad,
  centerOffsetM,
  discHit,
} from './firing-solution';
import { milToRad, moaToRad } from '../units/angle';

describe('firing-solution/windToVec', () => {
  const S = 5; // m/s

  it('9 o’clock (270°) blows left-to-right: +x, z≈0 (matches loads.json fixture)', () => {
    const w = windToVec(S, 270);
    expect(w.x).toBeCloseTo(S, 6);
    expect(w.y).toBe(0);
    expect(w.z).toBeCloseTo(0, 6);
  });

  it('12 o’clock (0°) is a headwind: +z, x≈0', () => {
    const w = windToVec(S, 0);
    expect(w.z).toBeCloseTo(S, 6);
    expect(w.x).toBeCloseTo(0, 6);
  });

  it('3 o’clock (90°) blows right-to-left: -x, z≈0', () => {
    const w = windToVec(S, 90);
    expect(w.x).toBeCloseTo(-S, 6);
    expect(w.z).toBeCloseTo(0, 6);
  });

  it('6 o’clock (180°) is a tailwind: -z, x≈0', () => {
    const w = windToVec(S, 180);
    expect(w.z).toBeCloseTo(-S, 6);
    expect(w.x).toBeCloseTo(0, 6);
  });

  it('45° splits between crossrange and downrange', () => {
    const w = windToVec(S, 45);
    expect(w.x).toBeCloseTo(-S * Math.SQRT1_2, 6);
    expect(w.z).toBeCloseTo(S * Math.SQRT1_2, 6);
  });
});

describe('firing-solution/vecToWind (task 1.7a, D6 — inverse of windToVec)', () => {
  const S = 7; // m/s

  it('round-trips windToVec at every cardinal clock direction', () => {
    for (const clockDeg of [0, 90, 180, 270, 45, 135, 225, 315]) {
      const back = vecToWind(windToVec(S, clockDeg));
      expect(back.speedMps).toBeCloseTo(S, 9);
      // Direction can wrap 0≡360; compare via the shortest angular distance.
      const diff = Math.abs(((back.directionDeg - clockDeg + 540) % 360) - 180);
      expect(diff).toBeLessThan(1e-6);
    }
  });

  it('a near-zero vector (calm) reports speed 0, direction 0 (no undefined atan2)', () => {
    const w = vecToWind({ x: 0, y: 0, z: 0 });
    expect(w.speedMps).toBe(0);
    expect(w.directionDeg).toBe(0);
  });

  it('ignores the vertical (y) component', () => {
    const a = vecToWind({ x: 3, y: 0, z: 4 });
    const b = vecToWind({ x: 3, y: 999, z: 4 });
    expect(b.speedMps).toBeCloseTo(a.speedMps, 9);
    expect(b.directionDeg).toBeCloseTo(a.directionDeg, 9);
  });
});

describe('firing-solution/averageEffectiveWind (task 1.7a, D6)', () => {
  it('falls back to the mean alone when there are no gust samples', () => {
    const mean = windToVec(6, 90);
    const eff = averageEffectiveWind(mean, 1, []);
    expect(eff.speedMps).toBeCloseTo(6, 9);
    expect(eff.directionDeg).toBeCloseTo(90, 6);
  });

  it('gustScale=0 collapses to the mean regardless of the samples (Steady identity)', () => {
    const mean = windToVec(4, 0);
    const gusts = [
      { x: 50, y: 0, z: 50 },
      { x: -50, y: 0, z: -50 },
    ];
    const eff = averageEffectiveWind(mean, 0, gusts);
    expect(eff.speedMps).toBeCloseTo(4, 9);
    expect(eff.directionDeg).toBeCloseTo(0, 6);
  });

  it('averages symmetric gusts about the mean back to the mean (they cancel)', () => {
    const mean = windToVec(5, 0);
    const gusts = [
      { x: 2, y: 0, z: 1 },
      { x: -2, y: 0, z: -1 },
    ];
    const eff = averageEffectiveWind(mean, 1, gusts);
    expect(eff.speedMps).toBeCloseTo(5, 9);
    expect(eff.directionDeg).toBeCloseTo(0, 6);
  });

  it('a one-sided gust shifts the effective wind off the dialed mean', () => {
    const mean = windToVec(5, 0); // headwind, x≈0
    const gusts = [{ x: 3, y: 0, z: 0 }]; // pure crossrange gust
    const eff = averageEffectiveWind(mean, 1, gusts);
    expect(eff.speedMps).toBeGreaterThan(5);
    expect(eff.directionDeg).not.toBeCloseTo(0, 3);
  });
});

describe('firing-solution/requiredCorrectionRad', () => {
  it('drop below the sight line needs positive come-up; right drift needs left hold', () => {
    const R = 457.2; // 500 yd
    const dropM = -2.0; // 2 m below
    const windageM = 0.3; // 0.3 m right
    const req = requiredCorrectionRad(dropM, windageM, R);
    expect(req.elevRad).toBeGreaterThan(0);
    expect(req.elevRad).toBeCloseTo(Math.atan2(2.0, R), 12);
    expect(req.windRad).toBeLessThan(0);
    expect(req.windRad).toBeCloseTo(Math.atan2(-0.3, R), 12);
  });

  it('at the zero range drop≈0 gives ~zero come-up', () => {
    const req = requiredCorrectionRad(0, 0, 91.44);
    expect(req.elevRad).toBeCloseTo(0, 12);
    expect(req.windRad).toBeCloseTo(0, 12);
  });
});

describe('firing-solution/centerOffsetM', () => {
  it('applied === required groups on center (zero offset)', () => {
    const req = requiredCorrectionRad(-2.0, 0.3, 457.2);
    const off = centerOffsetM(req, req, 457.2);
    expect(off.x).toBeCloseTo(0, 12);
    expect(off.y).toBeCloseTo(0, 12);
  });

  it('one 0.1-mrad (MIL) click of over-elevation at 100 m raises impact ~10 mm', () => {
    const R = 100;
    const applied = { elevRad: milToRad(0.1), windRad: 0 };
    const required = { elevRad: 0, windRad: 0 };
    const off = centerOffsetM(applied, required, R);
    expect(off.y).toBeCloseTo(0.01, 6); // 0.1 mrad @ 100 m = 10 mm
    expect(off.x).toBeCloseTo(0, 12);
  });

  it('one 1/4-MOA click of over-elevation at 100 yd raises impact ~6.65 mm', () => {
    const R = 91.44; // 100 yd
    const applied = { elevRad: moaToRad(0.25), windRad: 0 };
    const required = { elevRad: 0, windRad: 0 };
    const off = centerOffsetM(applied, required, R);
    expect(off.y).toBeCloseTo(R * Math.tan(moaToRad(0.25)), 9);
    expect(off.y).toBeCloseTo(0.00665, 4); // ≈ 0.262 in
  });

  it('over-correcting windage right pushes the group right', () => {
    const off = centerOffsetM({ elevRad: 0, windRad: milToRad(0.5) }, { elevRad: 0, windRad: 0 }, 200);
    expect(off.x).toBeGreaterThan(0);
    expect(off.x).toBeCloseTo(200 * Math.tan(milToRad(0.5)), 9);
  });
});

describe('firing-solution/discHit', () => {
  const CENTER = { x: 1.5, y: 0.55 }; // arbitrary plate world position
  const PLATE = 0.1524; // 6"
  const BULLET = 0.0067056; // 6.5 mm

  it('a dead-center impact hits', () => {
    expect(discHit(CENTER, CENTER, PLATE, BULLET)).toBe(true);
  });

  it('just inside the plate+bullet radius hits; just outside misses', () => {
    const r = PLATE / 2 + BULLET / 2;
    expect(discHit({ x: CENTER.x + r - 1e-4, y: CENTER.y }, CENTER, PLATE, BULLET)).toBe(true);
    expect(discHit({ x: CENTER.x + r + 1e-4, y: CENTER.y }, CENTER, PLATE, BULLET)).toBe(false);
  });

  it('the bullet radius matters at the very edge', () => {
    const edge = { x: CENTER.x + PLATE / 2 + BULLET / 4, y: CENTER.y }; // past plate, within bullet radius
    expect(discHit(edge, CENTER, PLATE, BULLET)).toBe(true); // graze counts with bullet radius
    expect(discHit(edge, CENTER, PLATE, 0)).toBe(false); // point bullet would miss
  });
});
