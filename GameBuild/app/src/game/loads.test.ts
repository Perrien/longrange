// Game-load config tests (task 1.4b): the two Increment-1 loads build correctly
// from the oracle ballistics + dispersion data, and the match/bulk relationship
// holds. No WASM.
import { describe, it, expect } from 'vitest';
import { GAME_LOADS, getGameLoad, DEFAULT_GAME_LOAD_ID } from './loads';
import { moaToRad } from '../units/angle';
import oracle from '../../../validation/loads.json';

describe('game/loads', () => {
  it('provides exactly the two Increment-1 6.5 CM loads', () => {
    expect(GAME_LOADS.map((l) => l.id).sort()).toEqual(['65cm-140-bulk', '65cm-140-match']);
  });

  it('single-sources ballistics from the validation oracle fixture (no drift)', () => {
    const match = getGameLoad('65cm-140-match');
    const oracleSi = oracle.loads.find((l) => l.id === '65cm-140-match')!.si;
    expect(match.load.muzzleVelocityMps).toBe(oracleSi.muzzleVelocityMps);
    expect(match.load.bc).toBe(oracleSi.bc);
    expect(match.load.massKg).toBe(oracleSi.massKg);
    expect(match.load.dragModel).toBe('G7');
    expect(match.twistM).toBe(oracleSi.twistM);
    // Spin is derived at solve time, not baked into the load.
    expect(match.load.spinRateRadPerSec).toBeUndefined();
  });

  it('bulk has looser dispersion than match on every axis', () => {
    const match = getGameLoad('65cm-140-match');
    const bulk = getGameLoad('65cm-140-bulk');
    expect(bulk.dispersion.mvSdMps).toBeGreaterThan(match.dispersion.mvSdMps);
    expect(bulk.dispersion.bcSdFraction).toBeGreaterThan(match.dispersion.bcSdFraction);
    expect(bulk.dispersion.rifleAccuracyRad).toBeGreaterThan(match.dispersion.rifleAccuracyRad);
  });

  it('converts rifle accuracy from MOA to radians and zeroes cant/wind SDs (Inc-1)', () => {
    const match = getGameLoad('65cm-140-match');
    expect(match.dispersion.rifleAccuracyRad).toBeCloseTo(moaToRad(0.5), 12);
    expect(match.dispersion.scopeCantRad).toBe(0);
    expect(match.dispersion.windSpeedSdMps).toBe(0);
    expect(match.dispersion.headwindSdMps).toBe(0);
    expect(match.dispersion.updraftSdMps).toBe(0);
  });

  it('the default load id resolves', () => {
    expect(() => getGameLoad(DEFAULT_GAME_LOAD_ID)).not.toThrow();
  });
});
