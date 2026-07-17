// Task 2.1b tests — the hidden-truth derivation is a pure function of
// (ranges, draws). No engine, no persistence, no React.
import { describe, expect, it } from 'vitest';
import {
  bellCurveValue,
  deriveLotTruth,
  deriveRifleTruth,
  resolveLotTruth,
  resolveRifleTruth,
  resolveTruth,
  type LotTruthRanges,
  type RifleTruthRanges,
} from './hidden-truth';
import type { AmmoLot, RifleInstance } from '../persistence';

// Small inline range fixtures (the real ones come from the 2.2 catalog). Each
// field keeps nominal ≥ 3·sd where a negative would be nonsensical.
const RIFLE_RANGES: RifleTruthRanges = {
  mvOffset: { nominal: 0, sd: 5 }, // m/s
  zeroH: { nominal: 0, sd: 0.0005 }, // rad
  zeroV: { nominal: 0, sd: 0.0005 }, // rad
  inherentPrecision: { nominal: 0.0003, sd: 0.00005 }, // rad
};

const LOT_RANGES: LotTruthRanges = {
  meanMvShift: { nominal: 0, sd: 3 }, // m/s
  mvSd: { nominal: 8, sd: 1.5 }, // m/s
  bc: { nominal: 0.5, sd: 0.01 }, // BC (nominal = box BC)
  bcSd: { nominal: 0.02, sd: 0.004 }, // fraction
};

const RIFLE_DRAWS_A = { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 };
const RIFLE_DRAWS_B = { mvOffset: 0.9, zeroH: 0.2, zeroV: 0.7, inherentPrecision: 0.4 };
const LOT_DRAWS_A = { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 };

describe('bellCurveValue (D3 map)', () => {
  it('a draw of 0.5 maps to exactly the nominal', () => {
    expect(bellCurveValue({ nominal: 42, sd: 7 }, 0.5)).toBe(42);
    expect(bellCurveValue({ nominal: 0, sd: 5 }, 0.5)).toBe(0);
  });

  it('a draw of ≈0.8413 maps to ≈ +1 SD above nominal', () => {
    expect(bellCurveValue({ nominal: 0, sd: 1 }, 0.8413447)).toBeCloseTo(1, 3);
  });

  it('is monotonic: a higher draw yields a higher value', () => {
    const r = { nominal: 100, sd: 10 };
    expect(bellCurveValue(r, 0.3)).toBeLessThan(bellCurveValue(r, 0.7));
  });

  it('clamps at ±3 SD for extreme draws (0 → −3 SD, near-1 → +3 SD)', () => {
    const r = { nominal: 100, sd: 10 };
    expect(bellCurveValue(r, 0)).toBeCloseTo(70, 6); // −3 SD
    expect(bellCurveValue(r, 0.9999999999)).toBeCloseTo(130, 6); // +3 SD
  });
});

describe('deriveRifleTruth / deriveLotTruth', () => {
  it('is deterministic — same draws produce identical truth', () => {
    expect(deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_A)).toEqual(
      deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_A),
    );
    expect(deriveLotTruth(LOT_RANGES, LOT_DRAWS_A)).toEqual(
      deriveLotTruth(LOT_RANGES, LOT_DRAWS_A),
    );
  });

  it('different draws produce differing truth', () => {
    const a = deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_A);
    const b = deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_B);
    expect(b.mvOffsetMps).not.toBe(a.mvOffsetMps);
    expect(b.zeroOffsetRad.h).not.toBe(a.zeroOffsetRad.h);
  });

  it('all-0.5 draws yield exactly the nominal for every field', () => {
    const r = deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_A);
    expect(r.mvOffsetMps).toBe(RIFLE_RANGES.mvOffset.nominal);
    expect(r.zeroOffsetRad.h).toBe(RIFLE_RANGES.zeroH.nominal);
    expect(r.zeroOffsetRad.v).toBe(RIFLE_RANGES.zeroV.nominal);
    expect(r.inherentPrecisionRad).toBe(RIFLE_RANGES.inherentPrecision.nominal);

    const l = deriveLotTruth(LOT_RANGES, LOT_DRAWS_A);
    expect(l.meanMvShiftMps).toBe(LOT_RANGES.meanMvShift.nominal);
    expect(l.mvSdMps).toBe(LOT_RANGES.mvSd.nominal);
    expect(l.trueBc).toBe(LOT_RANGES.bc.nominal); // bcError draw → bc range
    expect(l.bcSdFraction).toBe(LOT_RANGES.bcSd.nominal);
  });

  it('every field stays within ±3 SD of nominal across the whole draw range', () => {
    const within = (v: number, { nominal, sd }: { nominal: number; sd: number }) => {
      expect(v).toBeGreaterThanOrEqual(nominal - 3 * sd - 1e-9);
      expect(v).toBeLessThanOrEqual(nominal + 3 * sd + 1e-9);
    };
    // Sweep, including the exact 0 boundary and a near-1 value.
    for (const draw of [0, 0.01, 0.1, 0.25, 0.5, 0.75, 0.9, 0.99, 0.999999]) {
      const r = deriveRifleTruth(RIFLE_RANGES, {
        mvOffset: draw,
        zeroH: draw,
        zeroV: draw,
        inherentPrecision: draw,
      });
      within(r.mvOffsetMps, RIFLE_RANGES.mvOffset);
      within(r.zeroOffsetRad.h, RIFLE_RANGES.zeroH);
      within(r.zeroOffsetRad.v, RIFLE_RANGES.zeroV);
      within(r.inherentPrecisionRad, RIFLE_RANGES.inherentPrecision);

      const l = deriveLotTruth(LOT_RANGES, {
        meanMvShift: draw,
        mvSd: draw,
        bcError: draw,
        bcSd: draw,
      });
      within(l.meanMvShiftMps, LOT_RANGES.meanMvShift);
      within(l.mvSdMps, LOT_RANGES.mvSd);
      within(l.trueBc, LOT_RANGES.bc);
      within(l.bcSdFraction, LOT_RANGES.bcSd);
    }
  });

  it('adding a new draw key does not change existing fields (D1 stability)', () => {
    const withExtra = { ...RIFLE_DRAWS_A, someFutureField: 0.7 };
    expect(deriveRifleTruth(RIFLE_RANGES, withExtra)).toEqual(
      deriveRifleTruth(RIFLE_RANGES, RIFLE_DRAWS_A),
    );
  });
});

describe('resolveTruth seam (task 2.1c — the engine-bridge boundary)', () => {
  const rifleA: RifleInstance = {
    id: 'r-a',
    catalogId: 'rifle-6.5cm',
    catalogVersion: 1,
    draws: RIFLE_DRAWS_A,
  };
  const rifleB: RifleInstance = {
    id: 'r-b',
    catalogId: 'rifle-6.5cm',
    catalogVersion: 1,
    draws: RIFLE_DRAWS_B,
  };
  const lot: AmmoLot = {
    id: 'l-a',
    catalogId: 'lot-match',
    catalogVersion: 1,
    draws: LOT_DRAWS_A,
  };

  it('resolveRifleTruth/resolveLotTruth equal deriving from the record draws', () => {
    expect(resolveRifleTruth(rifleA, RIFLE_RANGES)).toEqual(
      deriveRifleTruth(RIFLE_RANGES, rifleA.draws),
    );
    expect(resolveLotTruth(lot, LOT_RANGES)).toEqual(deriveLotTruth(LOT_RANGES, lot.draws));
  });

  it('distinct instances differ, and each field stays within ±3 SD of nominal', () => {
    const a = resolveRifleTruth(rifleA, RIFLE_RANGES);
    const b = resolveRifleTruth(rifleB, RIFLE_RANGES);
    expect(b.mvOffsetMps).not.toBe(a.mvOffsetMps);
    // ...but both remain inside the catalog range.
    for (const t of [a, b]) {
      expect(Math.abs(t.mvOffsetMps - RIFLE_RANGES.mvOffset.nominal)).toBeLessThanOrEqual(
        3 * RIFLE_RANGES.mvOffset.sd + 1e-9,
      );
    }
  });

  it('resolveTruth sums the two hidden MV contributors (catalog §D)', () => {
    const t = resolveTruth(rifleA, RIFLE_RANGES, lot, LOT_RANGES);
    expect(t.totalMvOffsetMps).toBe(t.rifle.mvOffsetMps + t.lot.meanMvShiftMps);
  });
});
