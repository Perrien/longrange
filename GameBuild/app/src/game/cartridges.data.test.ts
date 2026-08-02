// rifle-ammo-store S1 — consistency + form-factor plausibility tests for
// cartridges.data.json. Pure data checks: nothing in the app reads this file
// yet (S2 onward wires it up), so these tests are the only thing standing
// between a transcription slip and it shipping.
import { describe, expect, it } from 'vitest';
import data from './cartridges.data.json';

type CartridgeId = keyof typeof data.cartridges;

const CARTRIDGE_IDS = Object.keys(data.cartridges) as CartridgeId[];
const GRADES = ['match', 'bulk'] as const;

// The form-factor plausibility screen (build-data-reference.md §4 / plan §S1
// done-when): this is what caught the .50 BMG BC error before the primary
// source did, by flagging an impossible i7 of 0.709. Anything with an i7 in
// or out of the catalog — a slider band edge or a preset — must clear it.
const GLOBAL_I7_MIN = 0.811;
const GLOBAL_I7_MAX = 1.437;

const REQUIRED_CARTRIDGE_FIELDS = [
  'name',
  'class',
  'dIn',
  'capacityGrH2O',
  'velocityCurve',
  'presetsOnly',
  'weightRangeGr',
  'i7Range',
  'barrelBandIn',
  'referenceBarrelIn',
  'fpsPerIn',
  'n',
  'twistOptionsInPerTurn',
  'barrelLifeRounds',
  'barrelToBarrelMvSdFps',
  'precisionMoa',
] as const;

describe('cartridges.data.json — shape', () => {
  it('ships exactly the 10 cartridges D1 requires', () => {
    expect(CARTRIDGE_IDS.sort()).toEqual(
      ['22lr', '223', '6cm', '65cm', '65prc', '308', '300wm', '300prc', '338lm', '50bmg'].sort(),
    );
    expect(data.catalogVersion).toBe(2);
  });

  it('every cartridge has every required field', () => {
    for (const id of CARTRIDGE_IDS) {
      const c = data.cartridges[id] as Record<string, unknown>;
      for (const field of REQUIRED_CARTRIDGE_FIELDS) {
        expect(c, `${id}.${field}`).toHaveProperty(field);
      }
    }
  });

  it('.22 LR is presets-only (D1): no weight/i7 slider range', () => {
    const lr = data.cartridges['22lr'];
    expect(lr.presetsOnly).toBe(true);
    expect(lr.weightRangeGr).toBeNull();
    expect(lr.i7Range).toBeNull();
  });

  it('every other cartridge is configurable with a well-formed weight and i7 band', () => {
    for (const id of CARTRIDGE_IDS) {
      if (id === '22lr') continue;
      const c = data.cartridges[id];
      expect(c.presetsOnly, id).toBe(false);
      const w = c.weightRangeGr!;
      const i7 = c.i7Range!;
      expect(w.min, `${id} weightRangeGr`).toBeLessThan(w.max);
      expect(i7.min, `${id} i7Range`).toBeLessThan(i7.max);
      expect(Number.isFinite((w.min + w.max) / 2), `${id} weight midpoint`).toBe(true);
      expect(Number.isFinite((i7.min + i7.max) / 2), `${id} i7 midpoint`).toBe(true);
      // Form-factor plausibility screen applies to the band edges too.
      expect(i7.min, `${id} i7Range.min`).toBeGreaterThanOrEqual(GLOBAL_I7_MIN);
      expect(i7.max, `${id} i7Range.max`).toBeLessThanOrEqual(GLOBAL_I7_MAX);
    }
  });

  it('every barrel band and reference barrel is finite and well-formed', () => {
    for (const id of CARTRIDGE_IDS) {
      const c = data.cartridges[id];
      expect(c.barrelBandIn.min, id).toBeLessThan(c.barrelBandIn.max);
      expect(Number.isFinite((c.barrelBandIn.min + c.barrelBandIn.max) / 2), id).toBe(true);
      expect(c.referenceBarrelIn, id).toBeGreaterThanOrEqual(c.barrelBandIn.min);
      expect(c.referenceBarrelIn, id).toBeLessThanOrEqual(c.barrelBandIn.max);
      expect(c.twistOptionsInPerTurn.length, id).toBeGreaterThan(0);
    }
  });

  it('every precision field satisfies nominal >= 3*sd (hidden-truth authoring constraint)', () => {
    for (const id of CARTRIDGE_IDS) {
      const p = data.cartridges[id].precisionMoa;
      expect(p.nominal, `${id} precisionMoa`).toBeGreaterThanOrEqual(3 * p.sd - 1e-12);
    }
  });
});

describe('cartridges.data.json — grades (§3.3)', () => {
  it('both grades present with every field, nominal >= 3*sd on the SD-valued field', () => {
    for (const g of GRADES) {
      const grade = data.grades[g];
      expect(grade.perShotMvSdMps.nominal, g).toBeGreaterThanOrEqual(3 * grade.perShotMvSdMps.sd - 1e-12);
      expect(grade.lotShiftBaseMps, g).toBeGreaterThan(0);
      expect(grade.lotBcVarFraction, g).toBeGreaterThan(0);
      expect(grade.perShotBcSdFraction, g).toBeGreaterThan(0);
      expect(grade.mvOptimism, g).toBeGreaterThan(0);
      expect(grade.bcOptimism, g).toBeGreaterThan(0);
    }
  });

  it('bulk is looser than match on every scatter/optimism axis', () => {
    const m = data.grades.match;
    const b = data.grades.bulk;
    expect(b.perShotMvSdMps.nominal).toBeGreaterThan(m.perShotMvSdMps.nominal);
    expect(b.lotShiftBaseMps).toBeGreaterThan(m.lotShiftBaseMps);
    expect(b.lotBcVarFraction).toBeGreaterThan(m.lotBcVarFraction);
    expect(b.perShotBcSdFraction).toBeGreaterThan(m.perShotBcSdFraction);
    expect(b.mvOptimism).toBeGreaterThan(m.mvOptimism);
    expect(b.bcOptimism).toBeGreaterThan(m.bcOptimism);
  });

  it('§1b flagged constant: per-shot BC scatter ships at the researched 0.8%/2.5%, not the older 0.5%/1.5%', () => {
    expect(data.grades.match.perShotBcSdFraction).toBeCloseTo(0.008, 6);
    expect(data.grades.bulk.perShotBcSdFraction).toBeCloseTo(0.025, 6);
  });

  it('the lot-shift reference cartridge exists and matches the 65cm capacity it was fitted to', () => {
    expect(data.lotShiftReference.cartridgeId).toBe('65cm');
    expect(data.lotShiftReference.capacityGrH2O).toBe(data.cartridges['65cm'].capacityGrH2O);
  });
});

describe('cartridges.data.json — length classes (§3.4) and recoil', () => {
  it('every non-rimfire, non-bmg cartridge is covered by exactly one length class', () => {
    const covered = new Map<string, string>();
    for (const [className, cls] of Object.entries(data.lengthClasses)) {
      for (const id of cls.cartridgeIds) {
        expect(covered.has(id), `${id} double-covered`).toBe(false);
        covered.set(id, className);
      }
    }
    for (const id of CARTRIDGE_IDS) {
      expect(covered.has(id), `${id} has a length class`).toBe(true);
    }
  });

  it('recoil constants are authored (D13)', () => {
    expect(data.recoil.chargeFraction).toBeCloseTo(0.8, 6);
    expect(data.recoil.gasVelocityFactor).toBeCloseTo(1.5, 6);
    expect(data.recoil.chargeGrOverride['22lr']).toBe(0.9); // rimfire authored (D12)
  });
});

describe('cartridges.data.json — presets (D18)', () => {
  it('carries the 8 shipped loads plus the 2 oracle-only loads (338lm, 50bmg)', () => {
    expect(data.presets).toHaveLength(10);
    const ids = data.presets.map((p) => p.id).sort();
    expect(ids).toEqual(
      [
        '22lr-match',
        '22lr-bulk',
        '223-match',
        '223-bulk',
        '65cm-match',
        '65cm-bulk',
        '308-match',
        '308-bulk',
        '338lm-300-match',
        '50bmg-661-m33',
      ].sort(),
    );
  });

  it('every preset references a known cartridge and grade', () => {
    for (const p of data.presets) {
      expect(CARTRIDGE_IDS, p.id).toContain(p.cartridgeId as CartridgeId);
      expect(GRADES, p.id).toContain(p.grade as (typeof GRADES)[number]);
    }
  });

  it("every preset's weight lies inside its cartridge's band (D1's presets-only .22 LR excepted)", () => {
    for (const p of data.presets) {
      const c = data.cartridges[p.cartridgeId as CartridgeId];
      if (c.presetsOnly) continue; // .22 LR: no weight slider to be inside
      expect(p.weightGr, p.id).toBeGreaterThanOrEqual(c.weightRangeGr!.min);
      expect(p.weightGr, p.id).toBeLessThanOrEqual(c.weightRangeGr!.max);
    }
  });

  it("every preset's i7 lies inside its cartridge's band and the global plausibility screen (G7 presets only)", () => {
    for (const p of data.presets) {
      if (p.dragModel !== 'G7') continue; // .22 LR is G1 — i7/BC7 does not apply (D8)
      const c = data.cartridges[p.cartridgeId as CartridgeId];
      expect(p.i7, p.id).toBeGreaterThanOrEqual(c.i7Range!.min);
      expect(p.i7, p.id).toBeLessThanOrEqual(c.i7Range!.max);
      expect(p.i7, p.id).toBeGreaterThanOrEqual(GLOBAL_I7_MIN);
      expect(p.i7, p.id).toBeLessThanOrEqual(GLOBAL_I7_MAX);
    }
  });

  it('.22 LR presets carry an authored G1 BC and no i7 (D8)', () => {
    const rimfirePresets = data.presets.filter((p) => p.cartridgeId === '22lr');
    expect(rimfirePresets).toHaveLength(2);
    for (const p of rimfirePresets) {
      expect(p.dragModel).toBe('G1');
      expect(p.trueBc).toBeGreaterThan(0);
      expect('i7' in p).toBe(false);
    }
  });

  it('oracle-pinned presets carry a measured lengthMOverride (D9)', () => {
    const oraclePinned = data.presets.filter((p) => p.oracleLoadId);
    // The 4 shipped-load anchors (22lr/223/65cm/308 match) + the 2 oracle-only loads.
    expect(oraclePinned).toHaveLength(6);
    for (const p of oraclePinned) {
      expect(p.lengthMOverride, p.id).toBeGreaterThan(0);
    }
  });

  it('only .223 bulk and 22lr bulk carry an mvFpsOverride — every other preset trusts the derived curve', () => {
    const overridden = data.presets.filter((p) => 'mvFpsOverride' in p).map((p) => p.id);
    expect(overridden.sort()).toEqual(['22lr-bulk', '223-bulk'].sort());
  });

  it('the .223 bulk MV override matches the §2.2 documented box value (3250 fps)', () => {
    const b = data.presets.find((p) => p.id === '223-bulk')!;
    expect(b.mvFpsOverride).toBe(3250);
  });
});
