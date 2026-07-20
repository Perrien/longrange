// Task 2.2a tests — the catalog resolves, its derived hidden-truth ranges are
// well-formed for the 2.1b model, and its believed 6.5 CM box values match the
// golden-vector oracle (D2 consistency). Pure data + mapping; no store/UI/engine.
import { describe, expect, it } from 'vitest';
import {
  AMMO_LOADS,
  CATALOG_VERSION,
  RIFLE_MODELS,
  believedLoad,
  catalogLotRanges,
  catalogRifleRanges,
  getAmmoLoad,
  getRifleModel,
  isUnlocked,
  lotTrueBaseMvMps,
  type RifleTier,
} from './catalog';
import { deriveLotTruth, deriveRifleTruth, type FieldRange } from './hidden-truth';
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
      expect(near0(r.zeroH.nominal)).toBe(true);
      expect(near0(r.zeroV.nominal)).toBe(true);
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

  it('zero-offset SD is in RADIANS at ~1 MOA scale, not raw mrad (regression: 1000× unit bug)', () => {
    // zeroOffsetSdMrad is 0.29 mrad ≈ 1 MOA ≈ 0.00029 rad. A fresh rifle's worst-
    // case (±3σ) misalignment must stay a few cm at 100 m — NOT tens of degrees.
    const r = catalogRifleRanges('65cm-custom');
    expect(r.zeroH.sd).toBeCloseTo(0.00029, 6);
    expect(r.zeroV.sd).toBeCloseTo(0.00029, 6);
    expect(r.zeroH.sd).toBeLessThan(0.001); // << 1 mrad; would be ~0.29 rad if unconverted
    // ±3σ at 100 m is a handful of cm (on paper), not metres.
    expect(3 * r.zeroV.sd * 100).toBeLessThan(0.15);
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
