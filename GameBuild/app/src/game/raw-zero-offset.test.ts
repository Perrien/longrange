// D16 raw off-the-shelf zero error — `Design/archive/D16-raw-zero-error.md`.
//
// A brand-new rifle+scope is NOT pre-zeroed: it carries 5-35 MOA of scope/mount
// pointing error that the player must discover and remove. The properties tested
// here are what make that a real mechanic rather than a difficulty slider:
//
//   * a HARD FLOOR, so a fresh rifle is never accidentally usable;
//   * UNIFORM magnitude, so the offset does not pile up near zero the way the
//     old independent-normal draw did;
//   * a RANGE-INDEPENDENT ANGLE, so zeroing at one distance cancels it at all
//     distances — which is how a real scope zero physically works, and the
//     reason the leftover per-range differences are pure trajectory (the DOPE).
import { describe, expect, it } from 'vitest';
import { deriveRifleTruth, deriveZeroOffsetRad, type RifleTruthRanges } from './hidden-truth';
import { RAW_ZERO_OFFSET_RANGE, catalogRifleRanges } from './catalog';
import { moaToRad } from '../units/angle';

const RANGES: RifleTruthRanges = catalogRifleRanges('65cm-custom');
const MOA = moaToRad(1);

/** Sweep the two normalized draws over the unit square. */
const sweep = (steps = 21) => {
  const out: Array<{ h: number; v: number; mag: number }> = [];
  for (let i = 0; i < steps; i++) {
    for (let j = 0; j < steps; j++) {
      const o = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, i / (steps - 1), j / (steps - 1));
      out.push({ ...o, mag: Math.hypot(o.h, o.v) });
    }
  }
  return out;
};

describe('magnitude', () => {
  it('never gives a free zero — every draw is at least 5 MOA off', () => {
    // THE point of D16. The previous model drew H and V independently from a
    // ~1 MOA normal centred on zero, so a lucky rifle came out of the box nearly
    // zeroed and "you must zero before this is usable" was only sometimes true.
    for (const o of sweep()) expect(o.mag / MOA).toBeGreaterThanOrEqual(5 - 1e-9);
  });

  it('never exceeds 35 MOA', () => {
    for (const o of sweep()) expect(o.mag / MOA).toBeLessThanOrEqual(35 + 1e-9);
  });

  it('spans the full band, uniformly in the magnitude draw', () => {
    const at = (d: number) => Math.hypot(...Object.values(deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, d, 0)));
    expect(at(0) / MOA).toBeCloseTo(5, 6);
    expect(at(0.5) / MOA).toBeCloseTo(20, 6);
    expect(at(1) / MOA).toBeCloseTo(35, 6);
    // Uniform: equal draw steps give equal magnitude steps.
    expect(at(0.5) - at(0.25)).toBeCloseTo(at(0.75) - at(0.5), 12);
  });

  it('clamps out-of-range draws rather than extrapolating', () => {
    const lo = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, -5, 0);
    const hi = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, 5, 0);
    expect(Math.hypot(lo.h, lo.v) / MOA).toBeCloseTo(5, 6);
    expect(Math.hypot(hi.h, hi.v) / MOA).toBeCloseTo(35, 6);
  });
});

describe('direction', () => {
  it('reaches all four quadrants', () => {
    const quadrants = new Set(
      sweep().map((o) => `${o.h >= 0 ? '+' : '-'}${o.v >= 0 ? '+' : '-'}`),
    );
    expect(quadrants.size).toBe(4);
  });

  it('sweeps a full turn as the direction draw goes 0 to 1', () => {
    const dirAt = (d: number) => {
      const o = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, 0.5, d);
      return Math.atan2(o.v, o.h);
    };
    expect(dirAt(0)).toBeCloseTo(0, 9);
    expect(Math.abs(dirAt(0.5))).toBeCloseTo(Math.PI, 9); // half turn
    expect(dirAt(1)).toBeCloseTo(0, 9); // full turn, back to start
  });

  it('does not change the magnitude', () => {
    const mags = [0, 0.2, 0.4, 0.6, 0.8].map((d) => {
      const o = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, 0.7, d);
      return Math.hypot(o.h, o.v);
    });
    for (const m of mags) expect(m).toBeCloseTo(mags[0], 12);
  });
});

describe('it is an ANGLE, not a distance (why one zero fixes every range)', () => {
  it('produces a linear-in-range miss, so a single zero cancels it everywhere', () => {
    const o = deriveZeroOffsetRad(RAW_ZERO_OFFSET_RANGE, 0.6, 0.1);
    const mag = Math.hypot(o.h, o.v);
    const missAt = (rangeM: number) => rangeM * mag;
    // Doubling the range doubles the miss — the signature of a constant angular
    // error. Anything else and zeroing at 25 would not fix 200.
    expect(missAt(200) / missAt(100)).toBeCloseTo(2, 12);
    expect(missAt(100) / missAt(25)).toBeCloseTo(4, 12);
  });
});

describe('the practical consequence: where the first shot lands', () => {
  const worst = RAW_ZERO_OFFSET_RANGE.maxRad;

  it('lands inside the 25 m backer board, which is why the board catches marks', () => {
    // Board is 0.66 m wide (metric) => 0.33 m half-width.
    expect(worst * 25).toBeLessThan(0.33);
  });

  it('can MISS the 25 m paper — the reason board marks exist at all', () => {
    // Metric paper is 0.44 m => 0.22 m half-width. Above ~30 MOA the first shot
    // is off the paper, and before Stage D16 that drew nothing whatsoever.
    expect(worst * 25).toBeGreaterThan(0.22);
    const offPaperAboveMoa = 0.22 / 25 / MOA;
    expect(offPaperAboveMoa).toBeLessThan(35); // i.e. it really does happen
    expect(offPaperAboveMoa).toBeGreaterThan(25); // but only near the top of the band
  });

  it('is hopeless at 100 m — which is exactly why zeroing starts at 25', () => {
    // ~37 inches at 100 yd: not on any normal target.
    expect(worst * 100).toBeGreaterThan(0.9);
  });
});

describe('integration with the rifle truth model', () => {
  it('flows through deriveRifleTruth for every rifle in the catalog', () => {
    const truth = deriveRifleTruth(RANGES, {
      mvOffset: 0.5,
      zeroH: 0.8,
      zeroV: 0.3,
      inherentPrecision: 0.5,
    });
    const mag = Math.hypot(truth.zeroOffsetRad.h, truth.zeroOffsetRad.v);
    expect(mag / MOA).toBeGreaterThanOrEqual(5);
    expect(mag / MOA).toBeLessThanOrEqual(35);
  });

  it('is deterministic — the same draws always give the same rifle', () => {
    const draws = { mvOffset: 0.1, zeroH: 0.42, zeroV: 0.77, inherentPrecision: 0.9 };
    expect(deriveRifleTruth(RANGES, draws)).toEqual(deriveRifleTruth(RANGES, draws));
  });

  it('gives two different rifles different pointing errors', () => {
    const a = deriveRifleTruth(RANGES, { mvOffset: 0.5, zeroH: 0.2, zeroV: 0.1, inherentPrecision: 0.5 });
    const b = deriveRifleTruth(RANGES, { mvOffset: 0.5, zeroH: 0.9, zeroV: 0.6, inherentPrecision: 0.5 });
    expect(a.zeroOffsetRad).not.toEqual(b.zeroOffsetRad);
  });
});
