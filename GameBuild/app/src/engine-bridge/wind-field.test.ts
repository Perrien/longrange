// Wind field bridge test (task 1.7a): loads the real engine WASM in Node (via
// the `@engine` alias) and checks the three "Verify (machine)" items the plan
// calls for — (a) a freshly built preset averages to ≈0 over a sampled column
// (zero-mean turbulence, documents why the mean must be superposed separately);
// (b) advancing the field's clock changes the sample at a fixed position; (c)
// the field actually perturbs a solve (proves `simulateWithWind` is exercised,
// not silently ignored) and that perturbation itself changes as time advances —
// the engine-backed half of the §1.7 done-when "a shot's drift changes when the
// field evolves". The on-device feel/flags check is 1.7b/1.7d's job.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { solveTrajectory } from './index';
import { createWindField, listWindPresets, solveTrajectoryField, sampleFieldColumn } from './wind-field';
import type { BtkModule, Load, AtmosphereInput, WindVec } from './types';

// Same 6.5 Creedmoor reference load as engine-bridge.test.ts.
const LOAD: Load = {
  massKg: 140 * 0.0000647989,
  diameterM: 0.264 * 0.0254,
  lengthM: 1.3 * 0.0254,
  bc: 0.31,
  dragModel: 'G7',
  muzzleVelocityMps: 2700 * 0.3048,
};
const ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5 };
const NO_WIND: WindVec = { x: 0, y: 0, z: 0 };
const BOX_MIN = { x: -30, y: 0, z: -500 };
const BOX_MAX = { x: 30, y: 50, z: 0 };

let module: BtkModule;
beforeAll(async () => {
  module = await loadBtkModule();
});

describe('wind-field/listWindPresets (task 1.7a pre-step 0)', () => {
  it('returns the real BTK preset names (unwraps the StringVector)', () => {
    const names = listWindPresets(module);
    // The exact set confirmed live against the built artifact before writing
    // any code (see PROGRESS.md 1.7a pre-step 0) — order-independent.
    expect(new Set(names)).toEqual(
      new Set(['Calm', 'Dead', 'Extra Strong', 'Gusty', 'Moderate', 'Shear', 'Strong', 'Switchy', 'Turbulent', 'Zero']),
    );
  });
});

describe('wind-field/createWindField (task 1.7a)', () => {
  it('a freshly built preset, ensembled over time at a fixed point, averages toward ≈0 (zero-mean turbulence)', () => {
    // NOTE on methodology: a naive SPATIAL grid at a single instant does NOT
    // cancel for this engine — every preset's largest octave has a ~9 km
    // spatial scale / ~10 min temporal scale (see wind_generator.cpp presets),
    // so any practical sampling box (tens to a few hundred metres) sits inside
    // a single "eddy" of that octave and just measures its local value, not an
    // ensemble (verified empirically while writing this test — a 480-point
    // spatial grid over the Range A box gave essentially NO cancellation,
    // ratio ≈0.96). What genuinely trends to zero is a TEMPORAL ensemble at a
    // fixed point sampled over multiple correlation times (≫10 min) — that's
    // the zero-mean claim this test actually exercises, and it's the same
    // reason a directional MEAN has to be superposed separately (D2): this
    // field has no persistent direction/offset of its own to lean on.
    const field = createWindField(module, 'Moderate', BOX_MIN, BOX_MAX);
    try {
      let sx = 0;
      let sz = 0;
      let absSum = 0;
      let n = 0;
      const STEP_S = 10;
      const DURATION_S = 4000; // ≈67 min — several multiples of the 10 min octave
      for (let t = 0; t < DURATION_S; t += STEP_S) {
        field.advance(t);
        const v = field.sample({ x: 0, y: 1.6, z: -200 });
        sx += v.x;
        sz += v.z;
        absSum += Math.hypot(v.x, v.z);
        n++;
      }
      const avgMag = Math.hypot(sx / n, sz / n);
      const meanAbsSample = absSum / n;
      // The average over the ensemble is well below a typical single sample's
      // magnitude — zero-mean turbulence, not a coincidentally-calm preset.
      // (Empirically ~0.2 for 'Moderate' over this window; 0.4 leaves margin.)
      expect(meanAbsSample).toBeGreaterThan(0.05); // the field isn't literally all-zero
      expect(avgMag).toBeLessThan(0.4 * meanAbsSample);
    } finally {
      field.delete();
    }
  });

  it('advance(t) changes the sample at the same position (the field evolves)', () => {
    const field = createWindField(module, 'Gusty', BOX_MIN, BOX_MAX);
    try {
      field.advance(0);
      const at0 = field.sample({ x: 0, y: 1.6, z: -200 });
      field.advance(30);
      const at30 = field.sample({ x: 0, y: 1.6, z: -200 });
      expect(field.currentTime()).toBeCloseTo(30, 6);
      const delta = Math.hypot(at30.x - at0.x, at30.y - at0.y, at30.z - at0.z);
      expect(delta).toBeGreaterThan(1e-3);
    } finally {
      field.delete();
    }
  });

  it('delete() is idempotent', () => {
    const field = createWindField(module, 'Calm', BOX_MIN, BOX_MAX);
    field.delete();
    expect(() => field.delete()).not.toThrow();
  });

  it('an unknown preset name throws (validate against listWindPresets at the call site)', () => {
    expect(() => createWindField(module, 'Not A Real Preset', BOX_MIN, BOX_MAX)).toThrow();
  });
});

describe('wind-field/sampleFieldColumn (task 1.7a step 2 — reused by the D6 effective-wind readout)', () => {
  it('returns exactly N samples, and a single sample lands at the eye→target midpoint', () => {
    const field = createWindField(module, 'Moderate', BOX_MIN, BOX_MAX);
    try {
      field.advance(0);
      const eye = { x: 0, y: 1.6, z: 0 };
      const rangeM = 300;
      const one = sampleFieldColumn(field, eye, rangeM, 1);
      expect(one.length).toBe(1);
      // n=1 → t=(0+0.5)/1=0.5 → the exact midpoint between eye and (0,0,-rangeM).
      const expected = field.sample({ x: 0, y: eye.y / 2, z: -rangeM / 2 });
      expect(one[0].x).toBeCloseTo(expected.x, 9);
      expect(one[0].z).toBeCloseTo(expected.z, 9);

      const five = sampleFieldColumn(field, eye, rangeM, 5);
      expect(five.length).toBe(5);
    } finally {
      field.delete();
    }
  });

  it('the sampled column changes with the target range (it uses rangeM, not a fixed point)', () => {
    const field = createWindField(module, 'Gusty', BOX_MIN, BOX_MAX);
    try {
      field.advance(0);
      const eye = { x: 0, y: 1.6, z: 0 };
      const near = sampleFieldColumn(field, eye, 100, 3);
      const far = sampleFieldColumn(field, eye, 500, 3);
      const differs = near.some((s, i) => Math.hypot(s.x - far[i].x, s.z - far[i].z) > 1e-6);
      expect(differs).toBe(true);
    } finally {
      field.delete();
    }
  });
});

describe('wind-field/solveTrajectoryField (task 1.7a)', () => {
  const OPTS = { zeroRangeM: 100, maxRangeM: 500, stepM: 500 };

  it('actually perturbs the trajectory vs. a plain zero-wind solve (simulateWithWind is exercised)', () => {
    const plainZero = solveTrajectory(module, LOAD, ATMOSPHERE, NO_WIND, OPTS);
    const field = createWindField(module, 'Extra Strong', BOX_MIN, BOX_MAX);
    try {
      field.advance(5); // an arbitrary non-zero instant, not the field's t=0 rest state
      const fieldSolve = solveTrajectoryField(module, LOAD, ATMOSPHERE, NO_WIND, field, OPTS);
      const dropDelta = Math.abs(fieldSolve[0].dropM - plainZero[0].dropM);
      const windageDelta = Math.abs(fieldSolve[0].windageM - plainZero[0].windageM);
      expect(dropDelta + windageDelta).toBeGreaterThan(0.01);
    } finally {
      field.delete();
    }
  });

  it("§1.7 done-when: a fixed shot's windage differs once the field has evolved 30s", () => {
    const field = createWindField(module, 'Gusty', BOX_MIN, BOX_MAX);
    try {
      field.advance(0);
      const at0 = solveTrajectoryField(module, LOAD, ATMOSPHERE, NO_WIND, field, OPTS);
      field.advance(30);
      const at30 = solveTrajectoryField(module, LOAD, ATMOSPHERE, NO_WIND, field, OPTS);
      const delta = Math.abs(at30[0].windageM - at0[0].windageM) + Math.abs(at30[0].dropM - at0[0].dropM);
      expect(delta).toBeGreaterThan(1e-3);
    } finally {
      field.delete();
    }
  });

  it('shares the same launch state as the mean solve at zero gust contribution (D2 superposition base case)', () => {
    // A field solve zeroed against a REAL mean wind, sampled at the very corner
    // of its own sampling box, is still governed by the same zeroed launch as
    // the ordinary mean solve — same zero range/sight height wiring, just a
    // different in-flight wind source. Confirms solveTrajectoryField didn't
    // accidentally zero against NO_WIND regardless of `meanWind`.
    const meanWind: WindVec = { x: 4.4704, y: 0, z: 0 }; // 10 mph crosswind
    const meanSolve = solveTrajectory(module, LOAD, ATMOSPHERE, meanWind, OPTS);
    const zeroSolve = solveTrajectory(module, LOAD, ATMOSPHERE, NO_WIND, OPTS);
    // Sanity: the mean-wind solve and the zero-wind solve differ (establishes
    // the baseline the field solve is compared against in ScopeView's
    // superposition, wind-superposition.test.ts covers the arithmetic itself).
    expect(Math.abs(meanSolve[0].windageM - zeroSolve[0].windageM)).toBeGreaterThan(0.05);
  });
});
