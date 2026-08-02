// Task 2.2a tests — the catalog resolves, its derived hidden-truth ranges are
// well-formed for the 2.1b model, and its believed 6.5 CM box values match the
// golden-vector oracle (D2 consistency). Pure data + mapping; no store/UI/engine.
import { describe, expect, it } from 'vitest';
import { moaToRad } from '../units/angle';
import {
  AMMO_LOADS,
  CATALOG_VERSION,
  RIFLE_MODELS,
  believedLoad,
  believedLoadForSpec,
  catalogLotRanges,
  catalogRifleRanges,
  catalogTwistM,
  getAmmoLoad,
  getRifleModel,
  isUnlocked,
  lotRangesForSpec,
  lotTrueBaseMvMps,
  PRESETS,
  resolveLoadSpec,
  resolveRifleSpec,
  rifleRangesForSpec,
  trueBaseMvForSpec,
  twistMForSpec,
  type RifleTier,
} from './catalog';
import { deriveLotTruth, deriveRifleTruth, type FieldRange } from './hidden-truth';
import { specFromPreset, type RifleSpec } from './spec';
import oracle from '../../../validation/loads.json';

describe('catalog shape', () => {
  it('exposes 12 rifles (4 cartridges × 3 tiers) and 8 ammo loads (× 2 grades)', () => {
    expect(RIFLE_MODELS).toHaveLength(12);
    expect(AMMO_LOADS).toHaveLength(8);
    expect(CATALOG_VERSION).toBe(1);
  });

  it('every rifle/ammo resolves by id and carries only believed/display data', () => {
    for (const m of RIFLE_MODELS) expect(getRifleModel(m.catalogId)).toBe(m);
    for (const a of AMMO_LOADS) {
      expect(getAmmoLoad(a.catalogId)).toBe(a);
      expect(a.dragModel === 'G1' || a.dragModel === 'G7').toBe(true);
      // Player-facing type must not leak truth fields.
      expect(a).not.toHaveProperty('trueBc');
      expect(a).not.toHaveProperty('trueBaseMvMps');
    }
  });

  it('each cartridge has all three rifle tiers, precision tightening hunting → custom', () => {
    for (const cartridgeId of ['22lr', '223', '65cm', '308']) {
      const tiers: RifleTier[] = ['hunting', 'factoryMatch', 'custom'];
      const prec = tiers.map(
        (t) => catalogRifleRanges(`${cartridgeId}-${t}`).inherentPrecision.nominal,
      );
      expect(prec[0]).toBeGreaterThan(prec[1]); // hunting looser than factory match
      expect(prec[1]).toBeGreaterThan(prec[2]); // factory match looser than custom
    }
  });

  it('everything is freely acquirable in 2.2 (D4 stub)', () => {
    expect(isUnlocked('65cm-custom')).toBe(true);
  });
});

describe('derived hidden-truth ranges (2.1b compatibility)', () => {
  const near0 = (v: number) => Math.abs(v) < 1e-12;

  it('signed delta fields are centred on 0; non-negative fields keep nominal ≥ 3·sd', () => {
    const nonNeg = (r: FieldRange, ctx: string) =>
      expect(r.nominal, ctx).toBeGreaterThanOrEqual(3 * r.sd - 1e-12);

    for (const m of RIFLE_MODELS) {
      const r = catalogRifleRanges(m.catalogId);
      expect(near0(r.mvOffset.nominal)).toBe(true); // barrel offset ~ N(0, ·)
      expect(r.mvOffset.sd).toBeGreaterThan(0);
      nonNeg(r.inherentPrecision, `${m.catalogId} inherentPrecision`);
    }
    for (const a of AMMO_LOADS) {
      const r = catalogLotRanges(a.catalogId);
      expect(near0(r.meanMvShift.nominal)).toBe(true); // lot shift ~ N(0, ·)
      nonNeg(r.mvSd, `${a.catalogId} mvSd`);
      nonNeg(r.bc, `${a.catalogId} bc`);
      nonNeg(r.bcSd, `${a.catalogId} bcSd`);
    }
  });

  it('fed through deriveXTruth: 0.5 draws → nominal; extremes stay finite & in ±3 SD', () => {
    const r = catalogRifleRanges('65cm-custom');
    const mid = deriveRifleTruth(r, { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 });
    expect(mid.mvOffsetMps).toBe(0);
    expect(mid.inherentPrecisionRad).toBe(r.inherentPrecision.nominal);

    const hot = deriveRifleTruth(r, { mvOffset: 0.999999, zeroH: 0, zeroV: 1, inherentPrecision: 0 });
    expect(Number.isFinite(hot.mvOffsetMps)).toBe(true);
    expect(hot.mvOffsetMps).toBeLessThanOrEqual(3 * r.mvOffset.sd + 1e-9);
    expect(hot.inherentPrecisionRad).toBeGreaterThanOrEqual(
      r.inherentPrecision.nominal - 3 * r.inherentPrecision.sd - 1e-12,
    );

    const lr = catalogLotRanges('65cm-match');
    const lot = deriveLotTruth(lr, { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 });
    expect(lot.meanMvShiftMps).toBe(0);
    expect(lot.trueBc).toBe(lr.bc.nominal);
    expect(lot.bcSdFraction).toBe(lr.bcSd.nominal); // sd 0 → fixed design value
  });

  it('bulk ammo is looser than match on per-shot SD and lot shift (same cartridge)', () => {
    for (const cartridgeId of ['22lr', '223', '65cm', '308']) {
      const match = catalogLotRanges(`${cartridgeId}-match`);
      const bulk = catalogLotRanges(`${cartridgeId}-bulk`);
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
    for (const m of RIFLE_MODELS) {
      const r = catalogRifleRanges(m.catalogId);
      expect(r.zeroOffset.minRad / MOA).toBeCloseTo(5, 6);
      expect(r.zeroOffset.maxRad / MOA).toBeCloseTo(35, 6);
      expect(r.zeroOffset.minRad).toBeGreaterThan(0); // hard floor: never free
    }
  });

  it('keeps the raw offset in RADIANS (regression: the 1000x mrad unit bug)', () => {
    // The original bug read `zeroOffsetSdMrad` raw as radians, putting a fresh
    // rifle tens of degrees off. Guard the magnitude, not the old field.
    const r = catalogRifleRanges('65cm-custom');
    expect(r.zeroOffset.maxRad).toBeLessThan(0.02); // ~35 MOA = 0.0102 rad
    // Worst case at 25 m is ~25 cm — big, but on the backer board, not in orbit.
    expect(r.zeroOffset.maxRad * 25).toBeLessThan(0.30);
  });
});

describe('believed vs. true (D6) and oracle consistency (D2)', () => {
  it("6.5 CM match believed box Load equals the golden-vector oracle si block", () => {
    const si = oracle.loads.find((l) => l.id === '65cm-140-match')!.si;
    const believed = believedLoad('65cm-match');
    expect(believed.massKg).toBe(si.massKg);
    expect(believed.diameterM).toBe(si.diameterM);
    expect(believed.lengthM).toBe(si.lengthM);
    expect(believed.bc).toBe(si.bc);
    expect(believed.dragModel).toBe(si.dragModel);
    expect(believed.muzzleVelocityMps).toBe(si.muzzleVelocityMps);
  });

  it('believed BC is authored in the load\'s own drag model (no cross-model BC)', () => {
    for (const a of AMMO_LOADS) {
      const believed = believedLoad(a.catalogId);
      expect(believed.dragModel).toBe(a.dragModel);
      expect(believed.bc).toBeGreaterThan(0);
    }
  });

  it('true base MV is defined and positive for every load', () => {
    for (const a of AMMO_LOADS) expect(lotTrueBaseMvMps(a.catalogId)).toBeGreaterThan(0);
  });
});

// =============================================================================
// rifle-ammo-store S3 — spec-based resolver. The old-vs-new diff test below is
// the plan's own S3 done-when: for the 8 shipped presets, the new resolver must
// reproduce today's catalog.data.json geometry exactly and its believed MV
// within §2.2's tolerances. Old tests above are UNCHANGED (per S3 done-when).

const pctDiff = (actual: number, expected: number) => ((actual - expected) / expected) * 100;

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

  it('twistMForSpec needs no string parsing and matches the old id API for the same twist', () => {
    // Old 65cm rifles are all "1:8.0" — the new spec's twistIn=8 must agree.
    expect(twistMForSpec({ cartridgeId: '65cm', barrelLengthIn: 26, twistIn: 8 })).toBeCloseTo(
      catalogTwistM('65cm-custom'),
      9,
    );
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

describe('old-vs-new diff test (S3 done-when): the 8 shipped presets vs today\'s catalog.data.json', () => {
  // Geometry (mass/diameter) must match EXACTLY — both derive from the same
  // grains/inches conversions. Length matches exactly ONLY for the 4 oracle-
  // pinned match presets (D9); the 4 bulk presets are EXPECTED to differ — that
  // is the §0.1 defect (shared match length) this plan repairs, not a bug here.
  const MATCHES: { presetId: string; oldCatalogId: string }[] = [
    { presetId: '22lr-match', oldCatalogId: '22lr-match' },
    { presetId: '223-match', oldCatalogId: '223-match' },
    { presetId: '65cm-match', oldCatalogId: '65cm-match' },
    { presetId: '308-match', oldCatalogId: '308-match' },
  ];

  it.each(MATCHES)('$presetId: geometry + believed MV match today\'s oracle-anchored load', ({ presetId, oldCatalogId }) => {
    const oldLoad = getAmmoLoad(oldCatalogId);
    const spec = specFromPreset(presetId);
    const newLoad = resolveLoadSpec(spec);

    expect(newLoad.massKg).toBeCloseTo(oldLoad.massKg, 9);
    expect(newLoad.diameterM).toBeCloseTo(oldLoad.diameterM, 9);
    expect(newLoad.lengthM).toBeCloseTo(oldLoad.lengthM, 9); // D9: exact, oracle-pinned
    expect(Math.abs(pctDiff(newLoad.believedMvMps, oldLoad.believedMvMps))).toBeLessThan(0.1);
  });

  const BULK: { presetId: string; oldCatalogId: string; expectedMvPctDiff: number }[] = [
    { presetId: '22lr-bulk', oldCatalogId: '22lr-bulk', expectedMvPctDiff: 0 }, // mvFpsOverride = old box exactly
    { presetId: '223-bulk', oldCatalogId: '223-bulk', expectedMvPctDiff: 0 }, // mvFpsOverride = old box exactly
    { presetId: '65cm-bulk', oldCatalogId: '65cm-bulk', expectedMvPctDiff: 2.0 }, // §2.2 documented
    { presetId: '308-bulk', oldCatalogId: '308-bulk', expectedMvPctDiff: 2.5 }, // §2.2 documented
  ];

  it.each(BULK)(
    '$presetId: mass/diameter match old exactly; length REPAIRS the shared-length defect (§0.1)',
    ({ presetId, oldCatalogId, expectedMvPctDiff }) => {
      const oldLoad = getAmmoLoad(oldCatalogId);
      const spec = specFromPreset(presetId);
      const newLoad = resolveLoadSpec(spec);

      // Old bulk massKg was HAND-ROUNDED (e.g. .0026 for a 40 gr bullet, not
      // the exact grainsToKg(40)=0.0025919564 the match load used) — so "match
      // old exactly" only holds to ~1%, not to oracle precision. The new value
      // is the more precise one (exact grains conversion), not a regression.
      expect(Math.abs(pctDiff(newLoad.massKg, oldLoad.massKg))).toBeLessThan(1.5);
      expect(newLoad.diameterM).toBeCloseTo(oldLoad.diameterM, 9);
      // The defect: old bulk length === old match length for the same cartridge,
      // even though the bulk bullet is a different weight (except .22 LR, where
      // both grades really are 40 gr — no defect to repair there, so skip it).
      if (presetId !== '22lr-bulk') {
        expect(newLoad.lengthM).not.toBeCloseTo(oldLoad.lengthM, 4);
      }
      expect(Math.abs(pctDiff(newLoad.believedMvMps, oldLoad.believedMvMps) - expectedMvPctDiff)).toBeLessThan(0.2);
    },
  );
});

describe('rifleRangesForSpec / lotRangesForSpec (S3) — well-formed hidden-truth ranges', () => {
  it('every cartridge\'s rifle ranges satisfy the FieldRange authoring constraints', () => {
    for (const id of ['22lr', '223', '6cm', '65cm', '65prc', '308', '300wm', '300prc', '338lm', '50bmg']) {
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
