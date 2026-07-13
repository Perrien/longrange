import { describe, it, expect } from 'vitest';
import {
  radToMil,
  radToMoa,
  milToRad,
  moaToRad,
  milToMoa,
  moaToMil,
  asMilMoa,
  yardsToMeters,
  metersToYards,
  inchesToMeters,
  metersToFeet,
  asMetricImperialDistance,
  fpsToMps,
  mpsToFps,
  mphToMps,
} from './index';

describe('units/angle', () => {
  it('round-trips MOA ↔ rad', () => {
    expect(radToMoa(moaToRad(1))).toBeCloseTo(1, 9);
    expect(moaToRad(radToMoa(0.005))).toBeCloseTo(0.005, 12);
  });

  it('round-trips MIL ↔ rad (1 mrad = 0.001 rad)', () => {
    expect(milToRad(1)).toBeCloseTo(0.001, 12);
    expect(radToMil(0.001)).toBeCloseTo(1, 12);
    expect(radToMil(milToRad(3.5))).toBeCloseTo(3.5, 12);
  });

  it('matches the MIL/MOA anchor constants', () => {
    // 1 mrad ≈ 3.43774677 MOA ; 1 MOA ≈ 0.29088821 mrad
    expect(milToMoa(1)).toBeCloseTo(3.43774677, 6);
    expect(moaToMil(1)).toBeCloseTo(0.29088821, 6);
  });

  it('asMilMoa gives both views of one radian correction', () => {
    const c = asMilMoa(0.001); // exactly 1 mrad
    expect(c.mil).toBeCloseTo(1, 9);
    expect(c.moa).toBeCloseTo(3.43774677, 6);
  });
});

describe('units/length', () => {
  it('round-trips yards ↔ meters and hits exact anchors', () => {
    expect(yardsToMeters(100)).toBeCloseTo(91.44, 9); // exact by definition
    expect(metersToYards(91.44)).toBeCloseTo(100, 9);
    expect(metersToYards(100)).toBeCloseTo(109.3613298, 6);
  });

  it('inches and feet anchors', () => {
    expect(inchesToMeters(1)).toBeCloseTo(0.0254, 12);
    expect(metersToFeet(0.3048)).toBeCloseTo(1, 9);
  });

  it('asMetricImperialDistance gives both views', () => {
    const d = asMetricImperialDistance(100);
    expect(d.meters).toBe(100);
    expect(d.yards).toBeCloseTo(109.3613298, 6);
  });
});

describe('units/velocity', () => {
  it('round-trips fps ↔ m/s and hits anchors', () => {
    expect(fpsToMps(2700)).toBeCloseTo(822.96, 6); // typical 6.5 CM MV
    expect(mpsToFps(fpsToMps(2700))).toBeCloseTo(2700, 6);
  });

  it('mph anchor (10 mph full-value wind)', () => {
    expect(mphToMps(10)).toBeCloseTo(4.4704, 9);
  });
});
