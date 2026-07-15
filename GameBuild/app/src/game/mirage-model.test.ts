import { describe, it, expect } from 'vitest';
import { advanceMirageDrift, mirageIntensity, MIRAGE_ZERO_DRIFT, MIRAGE_HEAT_RISE_MPS } from './mirage-model';

describe('mirage/advanceMirageDrift (task 1.7c)', () => {
  it('dead calm (x=0, z=0) only advances the heat-rise (y) term', () => {
    const d1 = advanceMirageDrift(MIRAGE_ZERO_DRIFT, { x: 0, z: 0 }, 1.0);
    expect(d1.x).toBe(0);
    expect(d1.z).toBe(0);
    expect(d1.y).toBeCloseTo(MIRAGE_HEAT_RISE_MPS, 12);
  });

  it('a steady crosswind accumulates x drift linearly over repeated frames', () => {
    let d = MIRAGE_ZERO_DRIFT;
    for (let i = 0; i < 10; i++) d = advanceMirageDrift(d, { x: 2, z: 0 }, 0.5);
    // 10 steps * 2 m/s * 0.5 s = 10 m
    expect(d.x).toBeCloseTo(10, 9);
    expect(d.z).toBe(0);
  });

  it('a headwind accumulates z drift independently of x', () => {
    const d = advanceMirageDrift(MIRAGE_ZERO_DRIFT, { x: 3, z: -4 }, 2.0);
    expect(d.x).toBeCloseTo(6, 9);
    expect(d.z).toBeCloseTo(-8, 9);
  });

  it('dt=0 leaves every axis unchanged', () => {
    const prev = { x: 5, y: 5, z: 5 };
    const d = advanceMirageDrift(prev, { x: 100, z: -100 }, 0);
    expect(d).toEqual(prev);
  });

  it('a custom heat-rise constant is honored (owner-tuning knob, 1.7d)', () => {
    const d = advanceMirageDrift(MIRAGE_ZERO_DRIFT, { x: 0, z: 0 }, 3.0, 0.1);
    expect(d.y).toBeCloseTo(0.3, 9);
  });
});

describe('mirage/mirageIntensity (task 1.7c)', () => {
  it('equals baseIntensity exactly at 1x zoom (fovDeg === baseFovDeg)', () => {
    expect(mirageIntensity(24, 24, 0.35, 3.0)).toBeCloseTo(0.35, 12);
  });

  it('grows as the FOV narrows (zooming in)', () => {
    const at1x = mirageIntensity(24, 24, 0.35, 3.0);
    const at2x = mirageIntensity(12, 24, 0.35, 3.0); // 2x magnification -> half the FOV
    expect(at2x).toBeGreaterThan(at1x);
    expect(at2x).toBeCloseTo(0.7, 9); // 24/12 * 0.35
  });

  it('is capped so extreme zoom cannot warp the UV sample unboundedly', () => {
    const atExtremeZoom = mirageIntensity(0.5, 24, 0.35, 3.0); // 48x -> would be 16.8 uncapped
    expect(atExtremeZoom).toBe(3.0);
  });

  it('returns 0 for a non-positive fovDeg (defensive, should never happen in practice)', () => {
    expect(mirageIntensity(0, 24)).toBe(0);
    expect(mirageIntensity(-5, 24)).toBe(0);
  });

  it('is monotonically decreasing as fovDeg grows (zooming out)', () => {
    const values = [6, 12, 24, 48].map((fov) => mirageIntensity(fov, 24, 0.35, 3.0));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });
});
