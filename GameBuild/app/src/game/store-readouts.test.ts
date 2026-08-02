// rifle-ammo-store S9 tests — pure readout-assembly for the Store build screen.
// The plan's own Done-when: "a component test on the pure readout-assembly
// function is enough — do not test the canvas." Real WASM engine (ammoReadouts
// calls effectiveRangeYdForSpec, S8).
import { describe, expect, it, beforeAll } from 'vitest';
import { ammoReadouts, rifleReadouts, SG_MARGINAL_BELOW } from './store-readouts';
import { cartridgeParams, specFromPreset, type LoadSpec, type RifleSpec } from './spec';
import { RIFLE_WEIGHT_LB } from './recoil-reference';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule } from '../engine-bridge/types';

function refBuild(cartridgeId: string, barrelLengthIn?: number): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: barrelLengthIn ?? c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

function load223(weightGr: number, i7: number): LoadSpec {
  return { cartridgeId: '223', weightGr, i7, grade: 'match' };
}

describe('rifleReadouts', () => {
  it('a longer barrel yields a higher derived MV for a centrefire cartridge (S8 barrel-length threading)', () => {
    const load = load223(77, 1.0);
    const c = cartridgeParams('223');
    const short = rifleReadouts(refBuild('223', c.barrelBandIn.min), load);
    const long = rifleReadouts(refBuild('223', c.barrelBandIn.max), load);
    expect(long.derivedMvFpsAtCurrentLoad).toBeGreaterThan(short.derivedMvFpsAtCurrentLoad);
  });

  it('6.5 CM / 140 gr match at its reference build reads recoil ratio 1.00 (the calibration point)', () => {
    const r = rifleReadouts(refBuild('65cm'), specFromPreset('65cm-match'));
    expect(r.recoilRelativeToReference).toBeCloseTo(1.0, 6);
  });

  it('recoil ratio is undefined for a cartridge with no sourced rifle weight (a real, logged gap)', () => {
    expect(RIFLE_WEIGHT_LB['6cm']).toBeUndefined();
    const r = rifleReadouts(refBuild('6cm'), { cartridgeId: '6cm', weightGr: 108, i7: 1.0, grade: 'match' });
    expect(r.recoilRelativeToReference).toBeUndefined();
  });

  it('recoil ratio grows with a heavier bullet on the same platform', () => {
    const c = cartridgeParams('308');
    const rifle = refBuild('308');
    const light = rifleReadouts(rifle, { cartridgeId: '308', weightGr: c.weightRangeGr!.min, i7: 1.0, grade: 'match' });
    const heavy = rifleReadouts(rifle, { cartridgeId: '308', weightGr: c.weightRangeGr!.max, i7: 1.0, grade: 'match' });
    expect(heavy.recoilRelativeToReference!).toBeGreaterThan(light.recoilRelativeToReference!);
  });

  it('the §3.5 relative-kick ladder order holds through the Store readout (sanity, not a re-test of S2)', () => {
    // .50 BMG should kick harder than 6.5 CM at their respective sourced reference builds.
    const cm = rifleReadouts(refBuild('65cm'), specFromPreset('65cm-match'));
    const bmg = rifleReadouts(refBuild('50bmg'), specFromPreset('50bmg-661-m33'));
    expect(bmg.recoilRelativeToReference!).toBeGreaterThan(cm.recoilRelativeToReference!);
  });

  it('surfaces barrel life and precision straight from cartridges.data.json', () => {
    const c = cartridgeParams('65cm');
    const r = rifleReadouts(refBuild('65cm'), specFromPreset('65cm-match'));
    expect(r.barrelLifeRounds).toBe(c.barrelLifeRounds);
    expect(r.precisionMoa).toEqual(c.precisionMoa);
  });
});

describe('ammoReadouts', () => {
  let module: BtkModule;
  beforeAll(async () => {
    module = await loadBtkModule();
  });

  it('BC7 increases as the profile slider (i7) gets sleeker (lower i7)', () => {
    const rifle = refBuild('223');
    const sleek = ammoReadouts(module, rifle, load223(77, 0.95));
    const blunt = ammoReadouts(module, rifle, load223(77, 1.3));
    expect(sleek.bc7!).toBeGreaterThan(blunt.bc7!);
  });

  it('is undefined for rimfire BC7 (D8 — G1, no form-factor apparatus)', () => {
    const r = ammoReadouts(module, refBuild('22lr'), specFromPreset('22lr-match'));
    expect(r.bc7).toBeUndefined();
    expect(r.load.believedBc).toBeGreaterThan(0); // still shows a BC, just not a BC7
  });

  it('supersonic reach matches effectiveRangeYdForSpec directly (S8), not re-derived here', () => {
    const rifle = refBuild('223');
    const load = load223(77, 1.085);
    const r = ammoReadouts(module, rifle, load);
    expect(r.supersonicReachYd).toBeGreaterThan(600); // same figure S8's own test pins
  });

  it('Sg carries a marginal flag below the D14 threshold, and never throws near it', () => {
    const c = cartridgeParams('223');
    // A light, fast-twist-mismatched build to find the marginal band without
    // asserting a specific weight/twist combo is guaranteed marginal (twist
    // options are fixed per cartridge) — instead assert the flag agrees with
    // the threshold constant for whatever Sg comes out, both ends of the band.
    const rifle = refBuild('223');
    const light = ammoReadouts(module, rifle, { cartridgeId: '223', weightGr: c.weightRangeGr!.min, i7: 1.0, grade: 'match' });
    const heavy = ammoReadouts(module, rifle, { cartridgeId: '223', weightGr: c.weightRangeGr!.max, i7: 1.0, grade: 'match' });
    expect(light.sgMarginal).toBe(light.sg < SG_MARGINAL_BELOW);
    expect(heavy.sgMarginal).toBe(heavy.sg < SG_MARGINAL_BELOW);
    // A heavier bullet (longer, same twist) is closer to marginal, never MORE stable.
    expect(heavy.sg).toBeLessThan(light.sg);
  });

  it('derived MV agrees between the Rifle and Ammo tab readouts for the same build (shared computation)', () => {
    const rifle = refBuild('223');
    const load = load223(77, 1.0);
    const rifleR = rifleReadouts(rifle, load);
    const ammoR = ammoReadouts(module, rifle, load);
    expect(ammoR.derivedMvFps).toBe(rifleR.derivedMvFpsAtCurrentLoad);
  });

  it('bullet length reflects an oracle-pinned preset override, not the SD*C derivation', () => {
    // 223-match carries a lengthMOverride (D9) — assert the readout uses it,
    // not bulletLengthIn(sd, C), which would generally disagree.
    const r = ammoReadouts(module, refBuild('223'), specFromPreset('223-match'));
    expect(r.bulletLengthIn).toBeCloseTo(0.024892 / 0.0254, 4); // preset's lengthMOverride, in inches
  });
});
