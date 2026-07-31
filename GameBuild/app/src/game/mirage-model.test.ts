import { describe, it, expect } from 'vitest';
import {
  MIRAGE_LAYER_FRACS,
  MIRAGE_MPH_TO_YARDS_PER_SEC,
  MIRAGE_HEAT_RISE_YD_PER_S,
  MIRAGE_DRIFT_RATE_SCALE,
  MIRAGE_WIND_FADE_SPEED_MPH,
  zeroMirageLayerState,
  zeroMirageLayerStates,
  advanceLayer,
  layerFade,
  perLayerNorm,
  zoomIntensity,
  layerScale,
  layerAnchor,
  aimRayIntersection,
  viewPitchRad,
  packMirageLayerUniforms,
} from './mirage-model';

// === Layered atmosphere (wind-system-btk-port W4/W5) ========================
// The task 1.7c/1.7d single-layer model's tests (`advanceMirageDrift`,
// `mirageIntensity`) were removed here alongside their implementation once
// `scope/Mirage.ts` no longer referenced it (W5) — see `mirage-model.ts`'s
// file header.

describe('mirage-model/zeroMirageLayerState(s)', () => {
  it('starts every axis at rest', () => {
    const s = zeroMirageLayerState();
    expect(s.smoothedWindMph).toEqual({ x: 0, y: 0, z: 0 });
    expect(s.driftYd).toEqual({ x: 0, y: 0, z: 0 });
  });

  it('zeroMirageLayerStates returns one independent state per LAYER_FRACS entry by default', () => {
    const states = zeroMirageLayerStates();
    expect(states).toHaveLength(MIRAGE_LAYER_FRACS.length);
    // Independence: mutating one must not affect the others (no shared object refs).
    states[0].driftYd.x = 999;
    expect(states[1].driftYd.x).toBe(0);
  });
});

describe('mirage-model/advanceLayer — P13 (yards/mph unit convention)', () => {
  it('a 10 mph pure crosswind produces the expected yards of drift after 1 s (driftRateScale=1 isolates the exact conversion from the W6 tuning multiplier)', () => {
    // alpha=0 isolates the drift-conversion math from EMA convergence speed:
    // the smoothed wind is already exactly 10 mph and stays there.
    const state = { smoothedWindMph: { x: 10, y: 0, z: 0 }, driftYd: { x: 0, y: 0, z: 0 } };
    const next = advanceLayer(state, { x: 10, y: 0, z: 0 }, 1, 0, MIRAGE_HEAT_RISE_YD_PER_S, 1);
    expect(next.driftYd.x).toBeCloseTo(10 * MIRAGE_MPH_TO_YARDS_PER_SEC, 9); // ≈4.8889 yd
    expect(next.driftYd.x).toBeCloseTo(4.888888889, 6);
  });

  it('dead calm advances only the vertical (heat-rise) drift, scaled by the default driftRateScale', () => {
    const state = zeroMirageLayerState();
    const next = advanceLayer(state, { x: 0, y: 0, z: 0 }, 2);
    expect(next.driftYd.x).toBe(0);
    expect(next.driftYd.z).toBe(0);
    expect(next.driftYd.y).toBeCloseTo(MIRAGE_HEAT_RISE_YD_PER_S * 2 * MIRAGE_DRIFT_RATE_SCALE, 9);
  });

  it('a headwind accumulates z drift independently of x, scaled by the default driftRateScale', () => {
    const state = { smoothedWindMph: { x: 0, y: 0, z: 8 }, driftYd: { x: 0, y: 0, z: 0 } };
    const next = advanceLayer(state, { x: 0, y: 0, z: 8 }, 1, 0);
    expect(next.driftYd.x).toBe(0);
    expect(next.driftYd.z).toBeCloseTo(8 * MIRAGE_MPH_TO_YARDS_PER_SEC * MIRAGE_DRIFT_RATE_SCALE, 9);
  });

  it('MIRAGE_DRIFT_RATE_SCALE (W6 owner tuning) is the .4 factor settled on after iterating .55 → .2 → .4', () => {
    expect(MIRAGE_DRIFT_RATE_SCALE).toBeCloseTo(0.4, 9);
  });

  it('driftRateScale linearly scales BOTH the wind-driven and heat-rise terms together', () => {
    const state = { smoothedWindMph: { x: 10, y: 0, z: 0 }, driftYd: { x: 0, y: 0, z: 0 } };
    const atHalf = advanceLayer(state, { x: 10, y: 0, z: 0 }, 1, 0, MIRAGE_HEAT_RISE_YD_PER_S, 0.5);
    const atFull = advanceLayer(state, { x: 10, y: 0, z: 0 }, 1, 0, MIRAGE_HEAT_RISE_YD_PER_S, 1);
    expect(atHalf.driftYd.x).toBeCloseTo(atFull.driftYd.x * 0.5, 9);
    expect(atHalf.driftYd.y).toBeCloseTo(atFull.driftYd.y * 0.5, 9); // heat-rise term too
  });

  it('the EMA converges toward a constant input over repeated frames', () => {
    // alpha=0.01/frame: (1-0.01)^n decays to ~2e-9 by n=2000, well past any
    // tolerance this assertion could care about.
    let state = zeroMirageLayerState();
    for (let i = 0; i < 2000; i++) state = advanceLayer(state, { x: 12, y: 0, z: -6 }, 1 / 60);
    expect(state.smoothedWindMph.x).toBeCloseTo(12, 3);
    expect(state.smoothedWindMph.z).toBeCloseTo(-6, 3);
  });

  it('dtSec=0 leaves drift unchanged but still applies the EMA step', () => {
    const state = { smoothedWindMph: { x: 0, y: 0, z: 0 }, driftYd: { x: 5, y: 5, z: 5 } };
    const next = advanceLayer(state, { x: 100, y: 0, z: 0 }, 0);
    expect(next.driftYd).toEqual({ x: 5, y: 5, z: 5 });
    expect(next.smoothedWindMph.x).toBeGreaterThan(0); // EMA still moved toward the sample
  });
});

describe('mirage-model/layerFade', () => {
  it('is 1 at dead calm', () => {
    expect(layerFade({ x: 0, y: 0, z: 0 })).toBeCloseTo(1, 9);
  });

  it('hits 0 at (and past) the fade speed', () => {
    expect(layerFade({ x: MIRAGE_WIND_FADE_SPEED_MPH, y: 0, z: 0 })).toBeCloseTo(0, 9);
    expect(layerFade({ x: MIRAGE_WIND_FADE_SPEED_MPH * 2, y: 0, z: 0 })).toBe(0); // clamped, not negative
  });

  it('is still visible at the wind slider\'s 20 mph max (W6 owner tuning: fade ceiling raised from 15 to 25 mph)', () => {
    expect(layerFade({ x: 20, y: 0, z: 0 })).toBeGreaterThan(0);
    expect(layerFade({ x: 20, y: 0, z: 0 })).toBeCloseTo(1 - 20 / MIRAGE_WIND_FADE_SPEED_MPH, 9);
  });

  it('is the horizontal (x,z) magnitude only — ignores vertical wind', () => {
    const a = layerFade({ x: 0, y: 0, z: 6 });
    const b = layerFade({ x: 0, y: 999, z: 6 });
    expect(a).toBeCloseTo(b, 9);
  });

  it('is monotonically decreasing with horizontal speed', () => {
    const values = [0, 3, 7, 12, 15].map((s) => layerFade({ x: s, y: 0, z: 0 }));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });
});

describe('mirage-model/perLayerNorm — P20', () => {
  it('keeps the summed RMS constant as the active-layer count changes', () => {
    const allThree = perLayerNorm(1, [1, 1, 1]);
    const oneOnly = perLayerNorm(1, [1, 0, 0]);
    // 3 active layers each at 1/sqrt(3): summed RMS = sqrt(3*(1/sqrt(3))^2) = 1.
    // 1 active layer at 1/sqrt(1) = 1: summed RMS = 1. Both equal the base.
    expect(Math.sqrt(3) * allThree).toBeCloseTo(1, 9);
    expect(oneOnly).toBeCloseTo(1, 9);
    expect(oneOnly).toBeGreaterThan(allThree); // isolating one layer shows it at full strength, not dimmed
  });

  it('does not divide by zero when every mask entry is 0', () => {
    expect(Number.isFinite(perLayerNorm(1, [0, 0, 0]))).toBe(true);
  });

  it('defaults to MIRAGE_DEFAULT_LAYER_MASK (all layers on) when no mask is passed', () => {
    expect(perLayerNorm(1)).toBeCloseTo(perLayerNorm(1, [1, 1, 1]), 9);
  });
});

describe('mirage-model/zoomIntensity', () => {
  it('equals baseIntensity exactly at 1x zoom (fovDeg === baseFovDeg)', () => {
    expect(zoomIntensity(24, 24, 0.025, 2.0)).toBeCloseTo(0.025, 12);
  });

  it('grows as the FOV narrows (zooming in) and is capped', () => {
    const at1x = zoomIntensity(24, 24, 0.025, 2.0);
    const at2x = zoomIntensity(12, 24, 0.025, 2.0);
    expect(at2x).toBeGreaterThan(at1x);
    const atExtreme = zoomIntensity(0.1, 24, 0.025, 2.0); // uncapped would be 6.0
    expect(atExtreme).toBe(2.0);
  });

  it('is monotonically decreasing as fovDeg grows', () => {
    const values = [6, 12, 24, 48].map((fov) => zoomIntensity(fov, 24, 0.025, 2.0));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeLessThanOrEqual(values[i - 1]);
  });

  it('returns 0 for a non-positive fovDeg (defensive)', () => {
    expect(zoomIntensity(0, 24)).toBe(0);
    expect(zoomIntensity(-1, 24)).toBe(0);
  });
});

describe('mirage-model/layerScale', () => {
  it('grows linearly with depth fraction', () => {
    const a = layerScale(1000, 0.5, 24);
    const b = layerScale(1000, 1.0, 24);
    expect(b).toBeCloseTo(a * 2, 9);
  });

  it('matches the BTK formula distance*frac*tan(fov/2)*2 exactly', () => {
    const distanceYd = 1200;
    const frac = 0.8;
    const fovDeg = 24;
    const expected = distanceYd * frac * Math.tan((fovDeg * Math.PI) / 180 / 2) * 2;
    expect(layerScale(distanceYd, frac, fovDeg)).toBeCloseTo(expected, 9);
  });

  it('is 0 at frac=0 (the eye itself)', () => {
    expect(layerScale(1000, 0, 24)).toBe(0);
  });
});

describe('mirage-model/layerAnchor', () => {
  it('scales every axis of the intersection point by frac', () => {
    const a = layerAnchor({ x: 10, y: 2, z: -500 }, 0.5);
    expect(a).toEqual({ x: 5, y: 1, z: -250 });
  });

  it('frac=1 returns the intersection point itself', () => {
    const point = { x: 3, y: -1, z: -777 };
    expect(layerAnchor(point, 1)).toEqual(point);
  });

  it('frac=0 collapses to the origin', () => {
    // toBeCloseTo per-axis, not toEqual: frac*negativeAxis is -0 in IEEE 754,
    // which toEqual (Object.is semantics) treats as distinct from +0.
    const a = layerAnchor({ x: 3, y: -1, z: -777 }, 0);
    expect(a.x).toBeCloseTo(0, 9);
    expect(a.y).toBeCloseTo(0, 9);
    expect(a.z).toBeCloseTo(0, 9);
  });
});

// === Renderer-facing pure helpers (wind-system-btk-port W5) =================

describe('mirage-model/aimRayIntersection — P16', () => {
  const cameraPositionM = { x: 0, y: 1.6, z: 0 };
  const dirDownrange = { x: 0, y: 0, z: -1 }; // straight downrange, level

  it('uses the aimed target distance when there is one, ignoring the fallback', () => {
    const { distanceYd } = aimRayIntersection(cameraPositionM, dirDownrange, 500, 9999);
    expect(distanceYd).toBeCloseTo(500 / 0.9144, 6);
  });

  it('falls back to the range lane length when nothing is aimed (null)', () => {
    const { distanceYd } = aimRayIntersection(cameraPositionM, dirDownrange, null, 300);
    expect(distanceYd).toBeCloseTo(300 / 0.9144, 6);
  });

  it('the returned point is cameraPosition + dir*distance, converted to yards', () => {
    const { pointYd, distanceYd } = aimRayIntersection(cameraPositionM, dirDownrange, 100, 9999);
    expect(pointYd.x).toBeCloseTo(cameraPositionM.x / 0.9144, 6);
    expect(pointYd.y).toBeCloseTo(cameraPositionM.y / 0.9144, 6);
    expect(pointYd.z).toBeCloseTo((cameraPositionM.z - 100) / 0.9144, 6);
    expect(distanceYd).toBeCloseTo(100 / 0.9144, 6);
  });

  it('a distance of exactly 0 (aimed at something at the eye) is honored, not treated as "nothing aimed"', () => {
    // Regression guard for a `??` vs `||` mistake: 0 is a valid aimed distance.
    const { distanceYd } = aimRayIntersection(cameraPositionM, dirDownrange, 0, 500);
    expect(distanceYd).toBe(0);
  });
});

describe('mirage-model/viewPitchRad', () => {
  it('is 0 for a level aim direction', () => {
    expect(viewPitchRad(0)).toBeCloseTo(0, 9);
  });

  it('is negative when looking down (a near, lower plate)', () => {
    expect(viewPitchRad(-0.3)).toBeLessThan(0);
    expect(viewPitchRad(-0.3)).toBeCloseTo(Math.asin(-0.3), 9);
  });

  it('is positive when looking up', () => {
    expect(viewPitchRad(0.3)).toBeGreaterThan(0);
  });

  it('clamps defensively past ±1 rather than returning NaN', () => {
    expect(Number.isNaN(viewPitchRad(1.0001))).toBe(false);
    expect(viewPitchRad(1.0001)).toBeCloseTo(Math.PI / 2, 6);
    expect(viewPitchRad(-1.0001)).toBeCloseTo(-Math.PI / 2, 6);
  });
});

describe('mirage-model/packMirageLayerUniforms', () => {
  const states = [
    { smoothedWindMph: { x: 0, y: 0, z: 0 }, driftYd: { x: 1, y: 2, z: 3 } },
    // MIRAGE_WIND_FADE_SPEED_MPH itself (not a hardcoded 15) — faded out at/past the fade speed by definition.
    { smoothedWindMph: { x: MIRAGE_WIND_FADE_SPEED_MPH, y: 0, z: 0 }, driftYd: { x: 4, y: 5, z: 6 } },
    { smoothedWindMph: { x: 3, y: 0, z: 0 }, driftYd: { x: 7, y: 8, z: 9 } },
  ];
  const intersectionYd = { x: 10, y: 2, z: -1000 };
  const distanceYd = 1000;
  const fovDeg = 24;

  it('holds one entry per layer, index-aligned with the input states', () => {
    const packed = packMirageLayerUniforms(states, intersectionYd, distanceYd, fovDeg, 0.05);
    expect(packed.offsetsYd).toHaveLength(3);
    expect(packed.scalesYd).toHaveLength(3);
    expect(packed.driftsYd).toHaveLength(3);
    expect(packed.intensities).toHaveLength(3);
  });

  it('offsets/scales match layerAnchor/layerScale exactly, per layer', () => {
    const packed = packMirageLayerUniforms(states, intersectionYd, distanceYd, fovDeg, 0.05);
    for (let i = 0; i < 3; i++) {
      const frac = MIRAGE_LAYER_FRACS[i];
      expect(packed.offsetsYd[i]).toEqual(layerAnchor(intersectionYd, frac));
      expect(packed.scalesYd[i]).toBeCloseTo(layerScale(distanceYd, frac, fovDeg), 9);
    }
  });

  it('drifts are passed through from state untouched', () => {
    const packed = packMirageLayerUniforms(states, intersectionYd, distanceYd, fovDeg, 0.05);
    expect(packed.driftsYd).toEqual([states[0].driftYd, states[1].driftYd, states[2].driftYd]);
  });

  it('intensity is 0 for a fully-faded (windy) layer and positive for a calm one', () => {
    const packed = packMirageLayerUniforms(states, intersectionYd, distanceYd, fovDeg, 0.05);
    expect(packed.intensities[1]).toBeCloseTo(0, 9); // wind == fade speed
    expect(packed.intensities[0]).toBeGreaterThan(0); // dead calm
  });

  it('a mask entry of 0 zeroes that layer only', () => {
    const packed = packMirageLayerUniforms(states, intersectionYd, distanceYd, fovDeg, 0.05, [1, 0, 1]);
    expect(packed.intensities[1]).toBe(0);
    expect(packed.intensities[0]).toBeGreaterThan(0);
    expect(packed.intensities[2]).toBeGreaterThan(0);
  });
});
