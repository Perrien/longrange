// rifle-ammo-store S2 tests. Pure-math reproduction of the plan's §2.2 anchor
// table, the §2.2 6.5 CM factory lineup, the §3.5 recoil table, plus boundary
// behaviour and one real-engine cross-check (Miller Sg). No state/UI/persistence.
import { describe, expect, it, beforeAll } from 'vitest';
import {
  bc7FromI7,
  bulletLengthIn,
  chargeMassGr,
  clamp,
  i7FromBc7,
  millerSg,
  muzzleVelocityFps,
  recoilVelocityMps,
  sectionalDensity,
  type VelocityCurveParams,
} from './ballistic-derivation';
import { grainsToKg, fpsToMps, inchesToMeters, poundsToKg } from '../units';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule } from '../engine-bridge/types';
import cartridgeData from './cartridges.data.json';
import { RIFLE_WEIGHT_LB } from './recoil-reference';

// --- §2.1 primitives ---------------------------------------------------------

describe('sectionalDensity / bc7FromI7 / i7FromBc7 / bulletLengthIn', () => {
  it('SD matches the standard formula (65cm 140 gr anchor)', () => {
    expect(sectionalDensity(140, 0.264)).toBeCloseTo(0.28696, 4);
  });

  it('bc7FromI7 and i7FromBc7 are exact inverses', () => {
    const sd = sectionalDensity(175, 0.308);
    expect(bc7FromI7(sd, i7FromBc7(sd, 0.243))).toBeCloseTo(0.243, 12);
    expect(i7FromBc7(sd, bc7FromI7(sd, 1.085))).toBeCloseTo(1.085, 12);
  });

  it('bulletLengthIn = C * SD (jacketed lead-core class)', () => {
    const sd = sectionalDensity(175, 0.308);
    expect(bulletLengthIn(sd, 4.63)).toBeCloseTo(4.63 * sd, 12);
  });
});

// --- §2.2 velocity-curve reproduction table ----------------------------------

const CURVES: Record<string, VelocityCurveParams> = Object.fromEntries(
  Object.entries(cartridgeData.cartridges).map(([id, c]) => [
    id,
    { a: c.velocityCurve.a, kAnchored: c.velocityCurve.kAnchored, referenceBarrelIn: c.referenceBarrelIn, n: c.n },
  ]),
);

const pctDiff = (actual: number, expected: number) => ((actual - expected) / expected) * 100;

describe('muzzleVelocityFps — §2.2 anchor reproduction table (D6)', () => {
  it('reproduces the three anchor loads at 0.0% (by construction of anchored k)', () => {
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['223'], 77, 24), 2750))).toBeLessThan(0.05);
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['65cm'], 140, 26), 2710))).toBeLessThan(0.05);
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['308'], 175, 22), 2600))).toBeLessThan(0.05);
  });

  it('223 bulk under-predicts by ~6.1% — the documented, expected outlier (D9 preset override)', () => {
    const mv = muzzleVelocityFps(CURVES['223'], 55, 24);
    expect(mv).toBeCloseTo(3051, 0);
    expect(pctDiff(mv, 3250)).toBeCloseTo(-6.1, 1);
  });

  it('65cm bulk over-predicts by ~+2.0% (same weight as match — no grade axis in the curve)', () => {
    const mv = muzzleVelocityFps(CURVES['65cm'], 140, 26);
    expect(pctDiff(mv, 2657)).toBeCloseTo(2.0, 1);
  });

  it('308 bulk over-predicts by ~+2.5%', () => {
    const mv = muzzleVelocityFps(CURVES['308'], 147, 22);
    expect(pctDiff(mv, 2780)).toBeCloseTo(2.5, 1);
  });

  it('338lm and 50bmg anchors reproduce at their reference barrel', () => {
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['338lm'], 300, 28), 2720))).toBeLessThan(0.05);
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['50bmg'], 750, 32), 2800))).toBeLessThan(0.05);
  });
});

describe('muzzleVelocityFps — §2.2 6.5 CM factory lineup cross-check (within 2%)', () => {
  const doc: Record<number, number> = { 95: 3229, 120: 2906, 140: 2712, 147: 2653, 156: 2583 };

  it.each(Object.entries(doc))('weight %s gr within 2%% of the doc column', (w, docMv) => {
    const mv = muzzleVelocityFps(CURVES['65cm'], Number(w), 26);
    expect(Math.abs(pctDiff(mv, docMv))).toBeLessThan(2);
  });
});

describe('muzzleVelocityFps — .22 LR barrel-length inversion (D7, asserted directly)', () => {
  it('a longer barrel is SLOWER for .22 LR (negative fps/inch)', () => {
    const at16 = muzzleVelocityFps(CURVES['22lr'], 40, 16);
    const at20 = muzzleVelocityFps(CURVES['22lr'], 40, 20);
    const at22 = muzzleVelocityFps(CURVES['22lr'], 40, 22);
    expect(at20).toBeLessThan(at16);
    expect(at22).toBeLessThan(at20);
  });

  it('reproduces the .22 LR anchor (40 gr @ reference 20") within 0.05%', () => {
    expect(Math.abs(pctDiff(muzzleVelocityFps(CURVES['22lr'], 40, 20), 1073))).toBeLessThan(0.05);
  });

  it('every other cartridge is faster with a longer barrel (positive fps/inch)', () => {
    for (const id of Object.keys(cartridgeData.cartridges)) {
      if (id === '22lr') continue;
      const c = CURVES[id];
      const w = cartridgeData.cartridges[id as keyof typeof cartridgeData.cartridges].velocityCurve.anchorWeightGr;
      const short = muzzleVelocityFps(c, w, c.referenceBarrelIn - 2);
      const long = muzzleVelocityFps(c, w, c.referenceBarrelIn + 2);
      expect(long, id).toBeGreaterThan(short);
    }
  });
});

// --- §3.5 recoil verification table ------------------------------------------

describe('recoilVelocityMps — §3.5 recoil verification table (D13, within 8%)', () => {
  // Rifle weights (lb) from feature-catalog.md §B's hand-built table — NOT part
  // of cartridges.data.json (the plan's own §3 tables have no weight column;
  // §3.5's intro says these "come from the existing catalog"). Only the 7
  // cartridges feature-catalog §B covers are testable here; 6mm CM/6.5 PRC/.300 PRC
  // have no sourced rifle weight yet — logged as a gap (S9's Store recoil readout
  // and S10's calibrated ScopeView both render "not yet sourced" for these three,
  // rather than a fabricated figure). `rifleLb` is asserted against the shared
  // `recoil-reference.ts` table (S9) below, so the two can't silently drift apart.
  const ROWS: { cartridgeId: string; bulletGr: number; mvFps: number; rifleLb: number; catalogVr: number }[] = [
    { cartridgeId: '22lr', bulletGr: 40, mvFps: 1073, rifleLb: 13.5, catalogVr: 0.15 },
    { cartridgeId: '223', bulletGr: 77, mvFps: 2750, rifleLb: 15.0, catalogVr: 0.89 },
    { cartridgeId: '65cm', bulletGr: 140, mvFps: 2710, rifleLb: 21.0, catalogVr: 1.1 },
    { cartridgeId: '308', bulletGr: 175, mvFps: 2600, rifleLb: 16.0, catalogVr: 1.8 },
    { cartridgeId: '300wm', bulletGr: 215, mvFps: 2820, rifleLb: 18.0, catalogVr: 2.16 },
    { cartridgeId: '338lm', bulletGr: 300, mvFps: 2720, rifleLb: 22.0, catalogVr: 2.47 },
    { cartridgeId: '50bmg', bulletGr: 750, mvFps: 2800, rifleLb: 32.0, catalogVr: 4.36 },
  ];

  it.each(ROWS)('$cartridgeId within 8% of the catalog relative-kick figure', (row) => {
    const c = cartridgeData.cartridges[row.cartridgeId as keyof typeof cartridgeData.cartridges];
    const chargeGr = chargeMassGr(
      c.capacityGrH2O,
      cartridgeData.recoil.chargeFraction,
      (cartridgeData.recoil.chargeGrOverride as Record<string, number>)[row.cartridgeId],
    );
    const vr = recoilVelocityMps(
      grainsToKg(row.bulletGr),
      fpsToMps(row.mvFps),
      grainsToKg(chargeGr),
      poundsToKg(row.rifleLb),
      cartridgeData.recoil.gasVelocityFactor,
    );
    expect(Math.abs(pctDiff(vr, row.catalogVr))).toBeLessThan(8);
  });

  it('rifleLb matches the shared recoil-reference.ts table (S9) exactly — the two must not drift apart', () => {
    for (const row of ROWS) {
      expect(RIFLE_WEIGHT_LB[row.cartridgeId]).toBe(row.rifleLb);
    }
  });

  it('6.5 CM is the calibration point: recoil grows monotonically heavier through the ladder', () => {
    const vrOf = (row: (typeof ROWS)[number]) => {
      const c = cartridgeData.cartridges[row.cartridgeId as keyof typeof cartridgeData.cartridges];
      const chargeGr = chargeMassGr(
        c.capacityGrH2O,
        cartridgeData.recoil.chargeFraction,
        (cartridgeData.recoil.chargeGrOverride as Record<string, number>)[row.cartridgeId],
      );
      return recoilVelocityMps(
        grainsToKg(row.bulletGr),
        fpsToMps(row.mvFps),
        grainsToKg(chargeGr),
        poundsToKg(row.rifleLb),
        cartridgeData.recoil.gasVelocityFactor,
      );
    };
    const vrs = ROWS.map(vrOf);
    for (let i = 1; i < vrs.length; i++) expect(vrs[i]).toBeGreaterThan(vrs[i - 1]);
  });
});

// --- Miller Sg — cross-checked against the real engine ----------------------

describe('millerSg — cross-checked against the engine (within 1%, 6.5 CM 140 gr @ 1:8)', () => {
  let module: BtkModule;
  beforeAll(async () => {
    module = await loadBtkModule();
  });

  it('agrees with Bullet.computeMillerStabilityFactorCorrected at ICAO sea level', () => {
    const weightGr = 140;
    const dIn = 0.264;
    const lengthIn = 1.392; // oracle-measured (65cm-140-match)
    const twistIn = 8;
    const mvFps = 2710;

    const ours = millerSg(weightGr, dIn, lengthIn, twistIn, mvFps);
    expect(ours).toBeCloseTo(1.618, 2); // sanity anchor (also matches plan §3.4's own 1.62 reference case)

    const bullet = new module.Bullet(
      grainsToKg(weightGr),
      inchesToMeters(dIn),
      inchesToMeters(lengthIn),
      0.326,
      module.DragFunction.G7,
    );
    try {
      // ICAO sea level: 288.15 K, 101325 Pa — Miller's own calibration reference
      // is 519 R / 29.92 inHg, so the atmospheric correction term is itself ≈1
      // here, which is what lets the plan's atmosphere-free display formula
      // agree with the engine's atmosphere-corrected one within 1% (see the
      // module's doc comment on millerSg).
      const engineSg = bullet.computeMillerStabilityFactorCorrected(
        twistIn,
        fpsToMps(mvFps),
        288.15,
        101325,
      );
      expect(Math.abs((ours - engineSg) / engineSg) * 100).toBeLessThan(1);
    } finally {
      bullet.delete();
    }
  });
});

// --- Boundary behaviour (clamp) ----------------------------------------------

describe('clamp — boundary behaviour (weight/i7/barrel clamped to band)', () => {
  it('weight clamps to the 65cm cartridge band', () => {
    const band = cartridgeData.cartridges['65cm'].weightRangeGr!;
    expect(clamp(9999, band.min, band.max)).toBe(band.max);
    expect(clamp(-10, band.min, band.max)).toBe(band.min);
    expect(clamp((band.min + band.max) / 2, band.min, band.max)).toBe((band.min + band.max) / 2);
  });

  it('i7 clamps to the 223 cartridge band', () => {
    const band = cartridgeData.cartridges['223'].i7Range!;
    expect(clamp(0, band.min, band.max)).toBe(band.min);
    expect(clamp(5, band.min, band.max)).toBe(band.max);
  });

  it('barrel length clamps to the 308 cartridge band', () => {
    const band = cartridgeData.cartridges['308'].barrelBandIn;
    expect(clamp(1, band.min, band.max)).toBe(band.min);
    expect(clamp(99, band.min, band.max)).toBe(band.max);
  });
});
