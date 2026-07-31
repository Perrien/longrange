// BC fitter tests (bc-truing-plan T1). Loads the real WASM engine in Node, like
// the other engine-bridge tests (gear-solve.test.ts).
import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { solveTrajectory, spinRateFromTwist } from './index';
import { fitBc, type BcFitInput } from './bc-fit';
import { requiredCorrectionRad } from '../game/firing-solution';
import { believedLoad, catalogTwistM } from '../game/catalog';
import { milToRad } from '../units/angle';
import { yardsToMeters } from '../units/length';
import type { AtmosphereInput, BtkModule, Load, WindVec } from './types';

const ISA: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const CALM: WindVec = { x: 0, y: 0, z: 0 };

const RIFLE_CATALOG_ID = '65cm-custom';
const LOT_CATALOG_ID = '65cm-match';
const ZERO_RANGE_M = yardsToMeters(100);
const DISTANCE_M = 800;

describe('engine-bridge/bc-fit/fitBc', () => {
  let module: BtkModule;
  let boxLoad: Load;
  let twistM: number;
  let bcMin: number;
  let bcMax: number;
  let baseInput: Omit<BcFitInput, 'requiredElevRad'>;

  beforeAll(async () => {
    module = await loadBtkModule();
    boxLoad = believedLoad(LOT_CATALOG_ID);
    twistM = catalogTwistM(RIFLE_CATALOG_ID);
    bcMin = boxLoad.bc * 0.5;
    bcMax = boxLoad.bc * 2.0;
    baseInput = {
      load: boxLoad,
      twistM,
      atmosphere: ISA,
      wind: CALM,
      zeroRangeM: ZERO_RANGE_M,
      sightHeightM: 0,
      distanceM: DISTANCE_M,
      bcMin,
      bcMax,
    };
  });

  /** Independently solve the believed load at a given BC and return its
   *  come-up (rad) at DISTANCE_M, via the exact same seam the game's DOPE
   *  table uses (requiredCorrectionRad) — this is the "ground truth" the
   *  fitter is checked against, without reaching into its internals. */
  function independentComeUp(bc: number): number {
    const load: Load = {
      ...boxLoad,
      bc,
      spinRateRadPerSec: spinRateFromTwist(boxLoad.muzzleVelocityMps, twistM),
    };
    const table = solveTrajectory(module, load, ISA, CALM, {
      zeroRangeM: ZERO_RANGE_M,
      maxRangeM: DISTANCE_M,
      stepM: DISTANCE_M,
      sightHeightM: 0,
    });
    const row = table[table.length - 1];
    return requiredCorrectionRad(row.dropM, row.windageM, row.rangeM).elevRad;
  }

  it('round-trip: fitting the come-up of a known BC recovers that BC within 1e-3', () => {
    const targetBc = boxLoad.bc * 1.15; // inside the band, distinct from box
    const requiredElevRad = independentComeUp(targetBc);
    const result = fitBc(module, { ...baseInput, requiredElevRad });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bc).toBeCloseTo(targetBc, 3);
      expect(Math.abs(result.comeUpRad - requiredElevRad)).toBeLessThan(milToRad(0.01));
    }
  });

  it('monotonicity: come-up strictly decreases as BC increases across the band', () => {
    const samples = [bcMin, bcMin + (bcMax - bcMin) * 0.25, boxLoad.bc, bcMin + (bcMax - bcMin) * 0.75, bcMax];
    const comeUps = samples.map(independentComeUp);
    for (let i = 1; i < comeUps.length; i++) {
      expect(comeUps[i]).toBeLessThan(comeUps[i - 1]);
    }
  });

  it('identity: asserting exactly the current table value returns the current (box) BC', () => {
    const requiredElevRad = independentComeUp(boxLoad.bc);
    const result = fitBc(module, { ...baseInput, requiredElevRad });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.bc).toBeCloseTo(boxLoad.bc, 3);
    }
  });

  it('rejects a hold flatter than the best BC in band can produce (needs-more-bc)', () => {
    const comeUpAtBcMax = independentComeUp(bcMax);
    // Ask for meaningfully less come-up than even the flattest (highest-BC) trajectory gives.
    const requiredElevRad = comeUpAtBcMax - milToRad(1);
    const result = fitBc(module, { ...baseInput, requiredElevRad });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('needs-more-bc');
      expect(result.achievableMinRad).toBeLessThan(result.achievableMaxRad);
    }
  });

  it('rejects a hold with more drop than the worst BC in band can produce (needs-less-bc)', () => {
    const comeUpAtBcMin = independentComeUp(bcMin);
    // Ask for meaningfully more come-up than even the draggiest (lowest-BC) trajectory gives.
    const requiredElevRad = comeUpAtBcMin + milToRad(1);
    const result = fitBc(module, { ...baseInput, requiredElevRad });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe('needs-less-bc');
      expect(result.achievableMinRad).toBeLessThan(result.achievableMaxRad);
    }
  });

  it('iteration count stays under the cap for a mid-band target', () => {
    const requiredElevRad = independentComeUp(boxLoad.bc * 1.3);
    const result = fitBc(module, { ...baseInput, requiredElevRad });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.iterations).toBeLessThanOrEqual(18);
    }
  });
});
