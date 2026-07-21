// Gear-solve seam tests (task 2.3b, D2/D6). Loads the real WASM engine in Node
// (via the @engine alias, like the other engine-bridge tests) and checks that
// solveGear composes the true + believed trajectories correctly, that they
// differ (box optimism vs hidden truth), and that NO truth object leaks out.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { solveGear, createGearScatter, gearZeroOffset } from './gear-solve';
import { seedRandom } from './match-sim';
import { solveTrajectory, spinRateFromTwist } from './index';
import type { AtmosphereInput, BtkModule, WindVec } from './types';
import {
  catalogRifleRanges,
  catalogLotRanges,
  believedLoad,
  lotTrueBaseMvMps,
  catalogTwistM,
} from '../game/catalog';
import { resolveTruth } from '../game/hidden-truth';
import { yardsToMeters } from '../units/length';
import type { RifleInstance, AmmoLot } from '../persistence';

const ISA: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const CALM: WindVec = { x: 0, y: 0, z: 0 };

const RIFLE_CATALOG_ID = '65cm-custom';
const LOT_CATALOG_ID = '65cm-match';

// Known, non-0.5 draws so mvOffset + the zero offset are non-trivial.
const rifle: RifleInstance = {
  id: 'rifle-t',
  catalogId: RIFLE_CATALOG_ID,
  catalogVersion: 1,
  draws: { mvOffset: 0.8, zeroH: 0.7, zeroV: 0.3, inherentPrecision: 0.5 },
};
const lot: AmmoLot = {
  id: 'lot-t',
  catalogId: LOT_CATALOG_ID,
  catalogVersion: 1,
  draws: { meanMvShift: 0.6, mvSd: 0.5, bcError: 0.4, bcSd: 0.5 },
};

const rifleRanges = catalogRifleRanges(RIFLE_CATALOG_ID);
const lotRanges = catalogLotRanges(LOT_CATALOG_ID);
const opts = {
  zeroRangeM: yardsToMeters(100),
  maxRangeM: yardsToMeters(500),
  stepM: yardsToMeters(100),
};

describe('engine-bridge/gear-solve/solveGear', () => {
  let module: BtkModule;
  beforeAll(async () => {
    module = await loadBtkModule();
  });

  it('true table = an independently-built solve at MV=(base+offsets) & BC=trueBc', () => {
    const truth = resolveTruth(rifle, rifleRanges, lot, lotRanges);
    const trueMv = lotTrueBaseMvMps(LOT_CATALOG_ID) + truth.totalMvOffsetMps;
    const twistM = catalogTwistM(RIFLE_CATALOG_ID);
    const believed = believedLoad(LOT_CATALOG_ID);

    const expectedTrue = solveTrajectory(
      module,
      {
        massKg: believed.massKg,
        diameterM: believed.diameterM,
        lengthM: believed.lengthM,
        dragModel: believed.dragModel,
        bc: truth.lot.trueBc,
        muzzleVelocityMps: trueMv,
        spinRateRadPerSec: spinRateFromTwist(trueMv, twistM),
      },
      ISA,
      CALM,
      opts,
    );
    const expectedBelieved = solveTrajectory(
      module,
      { ...believed, spinRateRadPerSec: spinRateFromTwist(believed.muzzleVelocityMps, twistM) },
      ISA,
      CALM,
      opts,
    );

    const res = solveGear(module, { rifle, lot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });

    expect(res.trueTable).toEqual(expectedTrue);
    expect(res.believedTable).toEqual(expectedBelieved);
    expect(res.zeroOffsetRad).toEqual(truth.rifle.zeroOffsetRad);
    // Sanity: the true MV really is the base plus the summed hidden offset.
    expect(trueMv).toBeCloseTo(lotTrueBaseMvMps(LOT_CATALOG_ID) + truth.totalMvOffsetMps, 9);
  });

  it('believed ≠ true (box optimism): the drop differs meaningfully downrange', () => {
    // Draws that push the SAME way (slower true MV + lower true BC → more drop),
    // so the believed-vs-true gap is unambiguous rather than self-cancelling.
    const slowRifle: RifleInstance = { ...rifle, id: 'rifle-slow', draws: { mvOffset: 0.15, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 } };
    const slowLot: AmmoLot = { ...lot, id: 'lot-slow', draws: { meanMvShift: 0.15, mvSd: 0.5, bcError: 0.1, bcSd: 0.5 } };
    const res = solveGear(module, { rifle: slowRifle, lot: slowLot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });
    const lastTrue = res.trueTable[res.trueTable.length - 1];
    const lastBelieved = res.believedTable[res.believedTable.length - 1];
    // True drops well over 3 cm more than the box come-up predicts at 500 yd.
    expect(lastTrue.dropM).toBeLessThan(lastBelieved.dropM - 0.03);
  });

  it('returns numbers only — no TrueBallistics object leaks (§4.8)', () => {
    const res = solveGear(module, { rifle, lot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });
    expect(Object.keys(res).sort()).toEqual(['believedTable', 'trueTable', 'zeroOffsetRad']);
    const leaky = res as unknown as Record<string, unknown>;
    expect(leaky.rifle).toBeUndefined();
    expect(leaky.lot).toBeUndefined();
    expect(leaky.totalMvOffsetMps).toBeUndefined();
    // zeroOffsetRad is a plain number pair, not a RifleTruth.
    expect(typeof res.zeroOffsetRad.h).toBe('number');
    expect(typeof res.zeroOffsetRad.v).toBe('number');
    expect(Object.keys(res.zeroOffsetRad).sort()).toEqual(['h', 'v']);
  });

  it('a second copy of the same models zeroes/solves differently (distinct hidden truth)', () => {
    const rifle2: RifleInstance = { ...rifle, id: 'rifle-t2', draws: { mvOffset: 0.2, zeroH: 0.35, zeroV: 0.8, inherentPrecision: 0.5 } };
    const a = solveGear(module, { rifle, lot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });
    const b = solveGear(module, { rifle: rifle2, lot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });
    expect(b.zeroOffsetRad).not.toEqual(a.zeroOffsetRad);
  });

  it('gearZeroOffset matches solveGear\'s returned offset and leaks nothing else (task 2.3e)', () => {
    const res = solveGear(module, { rifle, lot, rifleRanges, lotRanges, atmosphere: ISA, wind: CALM, ...opts });
    const off = gearZeroOffset(rifle, rifleRanges);
    expect(off).toEqual(res.zeroOffsetRad);
    expect(Object.keys(off).sort()).toEqual(['h', 'v']);
  });

  it('a live crosswind still deflects the true table AT the zero range (regression: zero must never auto-compensate for wind)', () => {
    const wind: WindVec = { x: 5.8, y: 0, z: 0 }; // ~13 mph from left
    const zeroM = yardsToMeters(100);
    // Firing at the SAME distance the rifle is zeroed at is exactly the case where
    // a wind-aware zero-solve would (wrongly) find a yaw that cancels this wind's
    // drift right at that range, making POI look unaffected by wind.
    const res = solveGear(module, {
      rifle,
      lot,
      rifleRanges,
      lotRanges,
      atmosphere: ISA,
      wind,
      zeroRangeM: zeroM,
      maxRangeM: zeroM,
      stepM: zeroM,
    });
    const last = res.trueTable[res.trueTable.length - 1];
    expect(Math.abs(last.windageM)).toBeGreaterThan(0.01);
  });

  it('createGearScatter yields finite dispersed impacts and a tighter group for match vs bulk (task 2.3d)', () => {
    const bulkLot: AmmoLot = { ...lot, id: 'lot-bulk', catalogId: '65cm-bulk' };
    const matchSim = createGearScatter(module, { rifle, lot, rifleRanges, lotRanges, atmosphere: ISA, targetRangeM: 91.44 });
    const bulkSim = createGearScatter(module, {
      rifle,
      lot: bulkLot,
      rifleRanges,
      lotRanges: catalogLotRanges('65cm-bulk'),
      atmosphere: ISA,
      targetRangeM: 91.44,
    });
    try {
      const N = 150;
      // Same RNG stream for both volleys, so the ONLY difference is the gear's
      // dispersion SDs → match (lower MV/BC SD) groups strictly tighter than bulk.
      seedRandom(module, 20260719);
      for (let i = 0; i < N; i++) {
        const m = matchSim.fire();
        expect(Number.isFinite(m.x) && Number.isFinite(m.y)).toBe(true);
      }
      seedRandom(module, 20260719);
      for (let i = 0; i < N; i++) {
        const b = bulkSim.fire();
        expect(Number.isFinite(b.x) && Number.isFinite(b.y)).toBe(true);
      }
      expect(matchSim.meanRadius()).toBeLessThan(bulkSim.meanRadius());
    } finally {
      matchSim.delete();
      bulkSim.delete();
    }
  });
});
