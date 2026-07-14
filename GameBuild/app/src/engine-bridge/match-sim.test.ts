// match-sim wrapper test (task 1.4a): loads the real engine WASM in Node (via the
// `@engine` alias) and checks the scatter simulator's wiring, .delete() paths,
// and seeded determinism. The owned-vs-pristine parity (the Done-when's 10% bound)
// is covered by validation/match-sim-check.mjs; here the subject is the bridge.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { createScatterSimulator, seedRandom } from './match-sim';
import type { BtkModule, Dispersion, Load } from './types';
import { moaToRad } from '../units/angle';

// 6.5 Creedmoor 140 gr match (mirrors validation/loads.json 65cm-140-match si).
const LOAD: Load = {
  massKg: 0.0090718474,
  diameterM: 0.0067056,
  lengthM: 0.0353568,
  bc: 0.326,
  dragModel: 'G7',
  muzzleVelocityMps: 826.008,
};
const TWIST_M = 0.2032;
const ATMOSPHERE = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const DISPERSION: Dispersion = {
  mvSdMps: 2.7,
  bcSdFraction: 0.005,
  rifleAccuracyRad: moaToRad(0.5),
  scopeCantRad: 0,
  windSpeedSdMps: 0,
  headwindSdMps: 0,
  updraftSdMps: 0,
};
const RANGE_M = 300 * 0.9144;

let module: BtkModule;
beforeAll(async () => {
  module = await loadBtkModule();
});

describe('match-sim/createScatterSimulator', () => {
  it('fires finite dispersed impacts and reports a sane mean radius', () => {
    const sim = createScatterSimulator(module, LOAD, DISPERSION, RANGE_M, ATMOSPHERE, TWIST_M);
    try {
      seedRandom(module, 12345);
      for (let i = 0; i < 50; i++) {
        const { x, y } = sim.fire();
        expect(Number.isFinite(x)).toBe(true);
        expect(Number.isFinite(y)).toBe(true);
        // 0.5 MOA + 2.7 m/s SD at 300 yd keeps impacts within a few cm of center.
        expect(Math.hypot(x, y)).toBeLessThan(0.3);
      }
      expect(sim.shotCount()).toBe(50);
      const mr = sim.meanRadius();
      expect(mr).toBeGreaterThan(0);
      expect(mr).toBeLessThan(0.3);
    } finally {
      sim.delete();
    }
  });

  it('is reproducible under an identical seed', () => {
    const a = createScatterSimulator(module, LOAD, DISPERSION, RANGE_M, ATMOSPHERE, TWIST_M);
    const b = createScatterSimulator(module, LOAD, DISPERSION, RANGE_M, ATMOSPHERE, TWIST_M);
    try {
      seedRandom(module, 777);
      const shotA = a.fire();
      seedRandom(module, 777);
      const shotB = b.fire();
      expect(shotB.x).toBe(shotA.x);
      expect(shotB.y).toBe(shotA.y);
    } finally {
      a.delete();
      b.delete();
    }
  });

  it('different seeds produce different groups (sampling is live)', () => {
    const sim = createScatterSimulator(module, LOAD, DISPERSION, RANGE_M, ATMOSPHERE, TWIST_M);
    try {
      seedRandom(module, 1);
      const s1 = sim.fire();
      seedRandom(module, 2);
      const s2 = sim.fire();
      expect(s1.x === s2.x && s1.y === s2.y).toBe(false);
    } finally {
      sim.delete();
    }
  });

  it('survives repeated create/delete without throwing (no handle leak path)', () => {
    for (let i = 0; i < 25; i++) {
      const sim = createScatterSimulator(module, LOAD, DISPERSION, RANGE_M, ATMOSPHERE, TWIST_M);
      sim.fire();
      sim.delete();
      sim.delete(); // idempotent
    }
    expect(true).toBe(true);
  });
});
