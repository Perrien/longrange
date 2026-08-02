// Task 2.2a tests, rewritten onto specs at S7 (rifle-ammo-store): the old
// enumerated id API (RIFLE_MODELS/AMMO_LOADS/getRifleModel/getAmmoLoad/
// believedLoad/lotTrueBaseMvMps/catalogTwistM/catalogRifleRanges/
// catalogLotRanges/RifleTier) and catalog.data.json are deleted (D2 — rifle
// tiers are gone); every check below now exercises the spec-based resolver
// that's been the app's only gear resolver since S4. Coverage is preserved
// wherever the old concept still applies (well-formed hidden-truth ranges,
// believed-vs-true, oracle consistency); the tier-specific test (three
// precision tiers per cartridge) is dropped outright — D2 removed tiers, there
// is nothing left to assert.
import { describe, expect, it } from 'vitest';
import { moaToRad } from '../units/angle';
import {
  CATALOG_VERSION,
  believedLoadForSpec,
  isUnlocked,
  lotRangesForSpec,
  PRESETS,
  resolveLoadSpec,
  resolveRifleSpec,
  rifleRangesForSpec,
  trueBaseMvForSpec,
  twistMForSpec,
} from './catalog';
import { deriveLotTruth, deriveRifleTruth, type FieldRange } from './hidden-truth';
import { cartridgeParams, specFromPreset, CARTRIDGE_IDS_V2, type RifleSpec } from './spec';
import oracle from '../../../validation/loads.json';

/** Default (reference-barrel, first-twist-option) spec for a cartridge — used
 *  throughout where the test just needs "a rifle of this cartridge", not a
 *  specific build. */
function defaultRifleSpecFor(cartridgeId: string): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

const c65 = cartridgeParams('65cm');
const RIFLE_SPEC_65CM: RifleSpec = { cartridgeId: '65cm', barrelLengthIn: c65.referenceBarrelIn, twistIn: c65.twistOptionsInPerTurn[0] };

describe('catalog shape', () => {
  it('exposes 10 cartridges and stamps the current cartridges.data.json version', () => {
    expect(CARTRIDGE_IDS_V2).toHaveLength(10);
    expect(CATALOG_VERSION).toBe(2);
  });

  it('every cartridge resolves a rifle spec and carries only believed/display data', () => {
    for (const cartridgeId of CARTRIDGE_IDS_V2) {
      const m = resolveRifleSpec(defaultRifleSpecFor(cartridgeId));
      expect(m.cartridgeId).toBe(cartridgeId);
      expect(m).not.toHaveProperty('tier'); // D2 — tiers are gone
    }
  });

  it('every preset resolves a load spec and carries only believed/display data', () => {
    for (const p of PRESETS) {
      const a = resolveLoadSpec(specFromPreset(p.id));
      expect(a.dragModel === 'G1' || a.dragModel === 'G7').toBe(true);
      // Player-facing type must not leak truth fields.
      expect(a).not.toHaveProperty('trueBc');
      expect(a).not.toHaveProperty('trueBaseMvMps');
    }
  });

  it('everything is freely acquirable in 2.2 (D4 stub)', () => {
    expect(isUnlocked('65cm')).toBe(true);
  });
});

describe('derived hidden-truth ranges (2.1b compatibility)', () => {
  const near0 = (v: number) => Math.abs(v) < 1e-12;

  it('signed delta fields are centred on 0; non-negative fields keep nominal ≥ 3·sd', () => {
    const nonNeg = (r: FieldRange, ctx: string) =>
      expect(r.nominal, ctx).toBeGreaterThanOrEqual(3 * r.sd - 1e-12);

    for (const cartridgeId of CARTRIDGE_IDS_V2) {
      const r = rifleRangesForSpec(defaultRifleSpecFor(cartridgeId));
      expect(near0(r.mvOffset.nominal)).toBe(true); // barrel offset ~ N(0, ·)
      expect(r.mvOffset.sd).toBeGreaterThan(0);
      nonNeg(r.inherentPrecision, `${cartridgeId} inherentPrecision`);
    }
    for (const p of PRESETS) {
      const r = lotRangesForSpec(specFromPreset(p.id));
      expect(near0(r.meanMvShift.nominal)).toBe(true); // lot shift ~ N(0, ·)
      nonNeg(r.mvSd, `${p.id} mvSd`);
      nonNeg(r.bc, `${p.id} bc`);
      nonNeg(r.bcSd, `${p.id} bcSd`);
    }
  });

  it('fed through deriveXTruth: 0.5 draws → nominal; extremes stay finite & in ±3 SD', () => {
    const r = rifleRangesForSpec(RIFLE_SPEC_65CM);
    const mid = deriveRifleTruth(r, { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 });
    expect(mid.mvOffsetMps).toBe(0);
    expect(mid.inherentPrecisionRad).toBe(r.inherentPrecision.nominal);

    const hot = deriveRifleTruth(r, { mvOffset: 0.999999, zeroH: 0, zeroV: 1, inherentPrecision: 0 });
    expect(Number.isFinite(hot.mvOffsetMps)).toBe(true);
    expect(hot.mvOffsetMps).toBeLessThanOrEqual(3 * r.mvOffset.sd + 1e-9);
    expect(hot.inherentPrecisionRad).toBeGreaterThanOrEqual(
      r.inherentPrecision.nominal - 3 * r.inherentPrecision.sd - 1e-12,
    );

    const lr = lotRangesForSpec(specFromPreset('65cm-match'));
    const lot = deriveLotTruth(lr, { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 });
    expect(lot.meanMvShiftMps).toBe(0);
    expect(lot.trueBc).toBe(lr.bc.nominal);
    expect(lot.bcSdFraction).toBe(lr.bcSd.nominal); // sd 0 → fixed design value
  });

  it('bulk ammo is looser than match on per-shot SD and lot shift (same cartridge)', () => {
    // Only the 4 originally-shipped cartridges currently carry BOTH grades as
    // presets (D18 — presets are what we already hold); the other 6 are
    // hand-build-only or single-grade (338lm match-only, 50bmg bulk-only).
    for (const cartridgeId of ['22lr', '223', '65cm', '308']) {
      const match = lotRangesForSpec(specFromPreset(`${cartridgeId}-match`));
      const bulk = lotRangesForSpec(specFromPreset(`${cartridgeId}-bulk`));
      expect(bulk.mvSd.nominal).toBeGreaterThan(match.mvSd.nominal);
      expect(bulk.meanMvShift.sd).toBeGreaterThan(match.meanMvShift.sd);
    }
  });

  it('gives every rifle the D16 raw pointing error: 5-35 MOA, never a free zero', () => {
    // Replaces the old ~1 MOA per-axis normal draw. The point of D16 is that a
    // brand-new rifle is ALWAYS meaningfully off — an independent normal centred
    // on zero regularly rolled a near-perfect rifle, which made "you must zero
    // before the rifle is usable" only sometimes true.
    const MOA = moaToRad(1);
    for (const cartridgeId of CARTRIDGE_IDS_V2) {
      const r = rifleRangesForSpec(defaultRifleSpecFor(cartridgeId));
      expect(r.zeroOffset.minRad / MOA).toBeCloseTo(5, 6);
      expect(r.zeroOffset.maxRad / MOA).toBeCloseTo(35, 6);
      expect(r.zeroOffset.minRad).toBeGreaterThan(0); // hard floor: never free
    }
  });

  it('keeps the raw offset in RADIANS (regression: the 1000x mrad unit bug)', () => {
    // The original bug read `zeroOffsetSdMrad` raw as radians, putting a fresh
    // rifle tens of degrees off. Guard the magnitude, not the old field.
    const r = rifleRangesForSpec(RIFLE_SPEC_65CM);
    expect(r.zeroOffset.maxRad).toBeLessThan(0.02); // ~35 MOA = 0.0102 rad
    // Worst case at 25 m is ~25 cm — big, but on the backer board, not in orbit.
    expect(r.zeroOffset.maxRad * 25).toBeLessThan(0.30);
  });
});

describe('believed vs. true (D6) and oracle consistency (D2)', () => {
  const ANCHORS: { presetId: string; oracleId: string; mvPctTolerance: number }[] = [
    // 3 of the 4 anchors are D6's anchor loads themselves (k solved to pass
    // through them exactly, S1/S2) — MV should reproduce very tightly. 22lr
    // isn't one of the anchored loads the curve was solved through (S1: it
    // carries its own mvFpsOverride instead, D9), so its derived-vs-box gap is
    // real and larger; documented at S1, not a regression here.
    { presetId: '22lr-match', oracleId: '22lr-40-standard', mvPctTolerance: 0.5 },
    { presetId: '223-match', oracleId: '223-77-match', mvPctTolerance: 0.1 },
    { presetId: '65cm-match', oracleId: '65cm-140-match', mvPctTolerance: 0.1 },
    { presetId: '308-match', oracleId: '308-175-match', mvPctTolerance: 0.1 },
  ];

  it.each(ANCHORS)(
    '$presetId reproduces the golden-vector geometry exactly (D9) and believed MV within tolerance',
    ({ presetId, oracleId, mvPctTolerance }) => {
      const si = oracle.loads.find((l) => l.id === oracleId)!.si;
      const believed = believedLoadForSpec(specFromPreset(presetId));
      // toBeCloseTo, not toBe: massKg is computed (grainsToKg(weightGr)), so it
      // can land a float-ULP off the oracle's stored literal even though both
      // represent the identical physical value (e.g. 0.0025919564 vs
      // ...63999999996) — 9 digits is far tighter than anything physically
      // meaningful here (sub-nanogram / sub-nanometer).
      expect(believed.massKg).toBeCloseTo(si.massKg, 9);
      expect(believed.diameterM).toBeCloseTo(si.diameterM, 9);
      expect(believed.lengthM).toBeCloseTo(si.lengthM, 9); // D9: oracle-pinned length override
      expect(believed.dragModel).toBe(si.dragModel);
      // MV is DERIVED (the anchored velocity curve), not copied — D6 anchors k
      // so it reproduces the box MV within a tight tolerance, not bit-exact.
      const mvPctDiff = Math.abs(((believed.muzzleVelocityMps - si.muzzleVelocityMps) / si.muzzleVelocityMps) * 100);
      expect(mvPctDiff).toBeLessThan(mvPctTolerance);
    },
  );

  it('believed BC is authored in the load\'s own drag model (no cross-model BC)', () => {
    for (const p of PRESETS) {
      const believed = believedLoadForSpec(specFromPreset(p.id));
      expect(believed.dragModel).toBe(p.dragModel);
      expect(believed.bc).toBeGreaterThan(0);
    }
  });

  it('true base MV is defined and positive for every preset', () => {
    for (const p of PRESETS) expect(trueBaseMvForSpec(specFromPreset(p.id))).toBeGreaterThan(0);
  });
});

// =============================================================================
// rifle-ammo-store S3/S9 — spec-based resolver behaviour (tier-free rifle
// builds, weight/i7/grade ammo builds). These describe blocks predate S7 and
// are unaffected by the old-API deletion; kept as-is.

describe('resolveRifleSpec (S3)', () => {
  it('resolves a rifle spec to a tier-free, believed-only shape', () => {
    const spec: RifleSpec = { cartridgeId: '65cm', barrelLengthIn: 24, twistIn: 8 };
    const m = resolveRifleSpec(spec);
    expect(m.cartridgeId).toBe('65cm');
    expect(m.barrelLengthIn).toBe(24);
    expect(m.twistIn).toBe(8);
    expect(m.precisionMoa.nominal).toBeGreaterThan(0);
    expect(m).not.toHaveProperty('tier'); // D2 — tiers are gone
  });

  it('twistMForSpec needs no string parsing (nothing to compare against, since the old id API is gone)', () => {
    // Old 65cm rifles were all "1:8.0" — twistIn=8 is that same rate as a plain number.
    expect(twistMForSpec({ cartridgeId: '65cm', barrelLengthIn: 26, twistIn: 8 })).toBeCloseTo(0.2032, 9); // 8" in meters
  });
});

describe('resolveLoadSpec (S3) — G7 preset shape', () => {
  it('a G7 preset resolves with i7 present and the right drag model', () => {
    const load = resolveLoadSpec(specFromPreset('308-match'));
    expect(load.dragModel).toBe('G7');
    expect(load.i7).toBeCloseTo(1.085, 6);
    expect(load.weightGr).toBe(175);
    expect(load.product).toBe('Federal Gold Medal Match 175 gr SMK');
  });

  it('a hand-built (non-preset) load gets a generated description', () => {
    const load = resolveLoadSpec({ cartridgeId: '65cm', weightGr: 130, i7: 1.0, grade: 'match' });
    expect(load.presetId).toBeUndefined();
    expect(load.product).toContain('130 gr');
    expect(load.product).toContain('i7 1.000');
  });
});

describe('resolveLoadSpec (S3) — .22 LR (G1, D8)', () => {
  it('requires a presetId for a rimfire cartridge', () => {
    expect(() => resolveLoadSpec({ cartridgeId: '22lr', weightGr: 40, i7: 0, grade: 'match' })).toThrow();
  });

  it('resolves with no i7 and G1 drag model', () => {
    const load = resolveLoadSpec(specFromPreset('22lr-match'));
    expect(load.dragModel).toBe('G1');
    expect(load.i7).toBeUndefined();
  });

  it('never crosses a G1 BC into believedLoadForSpec\'s G7 field blindly (dragModel travels with bc)', () => {
    const load = believedLoadForSpec(specFromPreset('22lr-bulk'));
    expect(load.dragModel).toBe('G1');
    expect(load.bc).toBeCloseTo(0.12 * 1.08, 6); // trueBc 0.12 * (1 + bulk bcOptimism 0.08)
  });
});

describe('old-catalog regression guard (S7): the 4 originally-shipped bulk presets', () => {
  // catalog.data.json is deleted at S7 (D2) — these are its bulk-load values,
  // FROZEN here as literal constants (captured 2026-08-02, before deletion) so
  // the "Stop if a solve's numeric output moves" guard (S3/S4/S7's shared
  // regression concern) still has something permanent to check against. The
  // match presets don't need this treatment — they're oracle-pinned, and the
  // golden-vector fixture (`validation/loads.json`) is itself the permanent
  // anchor (see the describe block above).
  const pctDiff = (actual: number, expected: number) => ((actual - expected) / expected) * 100;

  const OLD_BULK: {
    presetId: string;
    massKg: number;
    lengthM: number;
    believedMvMps: number;
    expectedMvPctDiff: number;
  }[] = [
    { presetId: '22lr-bulk', massKg: 0.0026, lengthM: 0.0114554, believedMvMps: 326.136, expectedMvPctDiff: 0 },
    { presetId: '223-bulk', massKg: 0.0036, lengthM: 0.024892, believedMvMps: 990.6, expectedMvPctDiff: 0 },
    { presetId: '65cm-bulk', massKg: 0.0091, lengthM: 0.0353568, believedMvMps: 809.9736, expectedMvPctDiff: 2.0 },
    { presetId: '308-bulk', massKg: 0.0095, lengthM: 0.031496, believedMvMps: 847.344, expectedMvPctDiff: 2.5 },
  ];

  it.each(OLD_BULK)(
    '$presetId: mass matches the old catalog to ~1% (hand-rounded there, exact here); length REPAIRS the shared-length defect (§0.1)',
    ({ presetId, massKg, lengthM, believedMvMps, expectedMvPctDiff }) => {
      const newLoad = resolveLoadSpec(specFromPreset(presetId));

      // Old bulk massKg was HAND-ROUNDED (e.g. .0026 for a 40 gr bullet, not
      // the exact grainsToKg(40)=0.0025919564 the match load used) — so "match
      // old exactly" only holds to ~1%, not to oracle precision. The new value
      // is the more precise one (exact grains conversion), not a regression.
      expect(Math.abs(pctDiff(newLoad.massKg, massKg))).toBeLessThan(1.5);
      // The defect: old bulk length === old match length for the same cartridge,
      // even though the bulk bullet is a different weight (except .22 LR, where
      // both grades really are 40 gr — no defect to repair there, so skip it).
      if (presetId !== '22lr-bulk') {
        expect(newLoad.lengthM).not.toBeCloseTo(lengthM, 4);
      }
      expect(Math.abs(pctDiff(newLoad.believedMvMps, believedMvMps) - expectedMvPctDiff)).toBeLessThan(0.2);
    },
  );
});

describe('rifleRangesForSpec / lotRangesForSpec (S3) — well-formed hidden-truth ranges', () => {
  it('every cartridge\'s rifle ranges satisfy the FieldRange authoring constraints', () => {
    for (const id of CARTRIDGE_IDS_V2) {
      const r = rifleRangesForSpec({ cartridgeId: id, barrelLengthIn: 24, twistIn: 8 });
      expect(r.mvOffset.nominal).toBeCloseTo(0, 12);
      expect(r.mvOffset.sd).toBeGreaterThan(0);
      expect(r.inherentPrecision.nominal).toBeGreaterThanOrEqual(3 * r.inherentPrecision.sd - 1e-12);
      expect(r.zeroOffset.minRad).toBeGreaterThan(0);
    }
  });

  it('lot ranges: bulk looser than match on every axis, for a G7 preset pair', () => {
    const match = lotRangesForSpec(specFromPreset('308-match'));
    const bulk = lotRangesForSpec(specFromPreset('308-bulk'));
    expect(bulk.mvSd.nominal).toBeGreaterThan(match.mvSd.nominal);
    expect(bulk.meanMvShift.sd).toBeGreaterThan(match.meanMvShift.sd);
    expect(bulk.bcSd.nominal).toBeGreaterThan(match.bcSd.nominal);
  });

  it('D11: lot-shift SD scales with case capacity relative to the 65cm reference', () => {
    // .50 BMG (290.0 gr H2O) has a much bigger case than 6.5 CM (52.5) — its
    // lot-to-lot shift should scale up by sqrt(290/52.5) ≈ 2.35x the base.
    const bmg = lotRangesForSpec({ cartridgeId: '50bmg', weightGr: 661, i7: 1.068, grade: 'bulk' });
    const base = 13.716 * Math.sqrt(290.0 / 52.5); // grades.bulk.lotShiftBaseMps * sqrt ratio
    expect(bmg.meanMvShift.sd).toBeCloseTo(base, 6);
  });

  it('believedLoadForSpec / trueBaseMvForSpec return sane, positive values', () => {
    for (const p of PRESETS) {
      const spec = specFromPreset(p.id);
      const load = believedLoadForSpec(spec);
      expect(load.muzzleVelocityMps).toBeGreaterThan(0);
      expect(load.bc).toBeGreaterThan(0);
      expect(trueBaseMvForSpec(spec)).toBeGreaterThan(0);
      expect(trueBaseMvForSpec(spec)).toBeLessThan(load.muzzleVelocityMps); // optimism > 0 for both grades
    }
  });
});
