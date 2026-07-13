// Engine-bridge test (task 0.4c): loads the real engine WASM in Node (via the
// `@engine` alias inherited from vite.config.ts) and checks the bridge produces a
// physically sane trajectory. The exact ≥5-row match against pristine BTK is
// task 0.4d; here we confirm the wiring, types, and .delete() paths run.
import { describe, it, expect, beforeAll } from 'vitest';
import { createEngineBridge, type EngineBridge, type Load, type AtmosphereInput, type WindVec } from './index';

// 6.5 Creedmoor, 140 gr, 0.264" dia, ~1.30" length, G7 BC 0.310, ~2700 fps.
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

let bridge: EngineBridge;
beforeAll(async () => {
  bridge = await createEngineBridge();
});

describe('engine-bridge/solveTrajectory', () => {
  it('produces a sane drop table for a 100 m zero out to 500 m', () => {
    const table = bridge.solveTrajectory(LOAD, ATMOSPHERE, NO_WIND, {
      zeroRangeM: 100,
      maxRangeM: 500,
      stepM: 100,
    });

    expect(table.map((r) => Math.round(r.rangeM))).toEqual([100, 200, 300, 400, 500]);

    // At the 100 m zero, drop ≈ 0 (bore-line reference).
    expect(table[0].dropM).toBeCloseTo(0, 2);

    // Beyond the zero, drop is increasingly negative; velocity and energy fall;
    // time of flight rises monotonically.
    for (let i = 1; i < table.length; i++) {
      expect(table[i].dropM).toBeLessThan(table[i - 1].dropM);
      expect(table[i].velocityMps).toBeLessThan(table[i - 1].velocityMps);
      expect(table[i].timeOfFlightS).toBeGreaterThan(table[i - 1].timeOfFlightS);
      expect(table[i].energyJ).toBeLessThan(table[i - 1].energyJ);
    }

    // Sanity magnitudes: ~500 m drop for this load is on the order of a couple metres.
    expect(table[4].dropM).toBeLessThan(-1);
    expect(table[4].dropM).toBeGreaterThan(-5);
    // No crosswind → windage stays essentially zero (spin drift not modeled here).
    expect(Math.abs(table[4].windageM)).toBeLessThan(0.2);
  });

  it('a full-value crosswind pushes the bullet downwind', () => {
    const wind: WindVec = { x: 4.4704, y: 0, z: 0 }; // 10 mph from left → +x drift
    const table = bridge.solveTrajectory(LOAD, ATMOSPHERE, wind, {
      zeroRangeM: 100,
      maxRangeM: 500,
      stepM: 100,
    });
    // Windage grows with range under a steady crosswind.
    expect(table[4].windageM).toBeGreaterThan(Math.abs(table[0].windageM));
    expect(Math.abs(table[4].windageM)).toBeGreaterThan(0.1);
  });
});

describe('engine-bridge/computeZero', () => {
  it('returns a small positive launch elevation for a 100 m zero', () => {
    const z = bridge.computeZero(LOAD, ATMOSPHERE, NO_WIND, 100);
    // A few tenths of a mrad of up-angle; windage ~0 with no wind.
    expect(z.elevationRad).toBeGreaterThan(0);
    expect(z.elevationRad).toBeLessThan(0.01);
    expect(Math.abs(z.windageRad)).toBeLessThan(1e-3);
  });
});
