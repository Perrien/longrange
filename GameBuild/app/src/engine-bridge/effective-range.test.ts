// Derived effective range tests (rifle-ammo-store S8, D15). Loads the real
// WASM engine in Node, like the other engine-bridge tests (gear-solve.test.ts,
// bc-fit.test.ts) — this function calls solveTrajectory internally, so there's
// no meaningful way to test it without the engine.
import { describe, it, expect, beforeAll, beforeEach } from 'vitest';
import { loadBtkModule } from './wasm-module';
import {
  effectiveRangeYdForSpec,
  effectiveRangeSolveCount,
  clearEffectiveRangeCache,
} from './effective-range';
import { believedLoadForBuild } from '../game/catalog';
import { cartridgeParams } from '../game/spec';
import type { BtkModule } from './types';
import type { RifleSpec, LoadSpec } from '../game/spec';

const c223 = cartridgeParams('223');
const c22lr = cartridgeParams('22lr');

function rifleSpec(cartridgeId: string, barrelLengthIn: number): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn, twistIn: c.twistOptionsInPerTurn[0] };
}

function loadSpec223(weightGr: number, i7: number): LoadSpec {
  return { cartridgeId: '223', weightGr, i7, grade: 'match' };
}

describe('engine-bridge/effective-range/effectiveRangeYdForSpec (S8, D15)', () => {
  let module: BtkModule;
  beforeAll(async () => {
    module = await loadBtkModule();
  });
  beforeEach(() => {
    clearEffectiveRangeCache();
  });

  it('monotonic in BC: higher i7 (worse form factor, lower BC) → shorter reach', () => {
    const rifle = rifleSpec('223', c223.referenceBarrelIn);
    // Spread wide enough that each step clears a full 100 yd ladder cadence —
    // a narrower spread can tie post-rounding without the underlying (pre-
    // round) crossing point actually failing to move.
    const i7Samples = [1.0, 1.15, 1.3, c223.i7Range!.max];
    const ranges = i7Samples.map((i7) => effectiveRangeYdForSpec(module, rifle, loadSpec223(77, i7)));
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]).toBeLessThanOrEqual(ranges[i - 1]);
    }
    expect(ranges[ranges.length - 1]).toBeLessThan(ranges[0]);
  });

  it('monotonic in barrel length: longer barrel → longer reach (centrefire)', () => {
    const load = loadSpec223(77, 1.0);
    const barrels = [c223.barrelBandIn.min, c223.referenceBarrelIn, c223.barrelBandIn.max];
    const ranges = barrels.map((barrelLengthIn) => effectiveRangeYdForSpec(module, rifleSpec('223', barrelLengthIn), load));
    for (let i = 1; i < ranges.length; i++) {
      expect(ranges[i]).toBeGreaterThanOrEqual(ranges[i - 1]);
    }
    expect(ranges[ranges.length - 1]).toBeGreaterThan(ranges[0]);
  });

  it('barrel-length inversion EXCEPT .22 LR: a longer barrel gives it a LOWER muzzle velocity', () => {
    // The only real .22 LR data available (D8: no hand-built rimfire loads,
    // just the 2 shipped presets) is standard-velocity, which is genuinely
    // subsonic at EVERY barrel length in the band (~1096 fps at 16", vs ICAO
    // SL's ~1116 fps speed of sound — confirmed against muzzleVelocityFps
    // directly) — so effectiveRangeYdForSpec correctly returns 0 yd across
    // the whole barrel band and can't demonstrate the inversion at the
    // yardage level (there's no supersonic phase to shorten). The inversion
    // itself is real and already asserted at the derivation level in
    // ballistic-derivation.test.ts; this checks it still reaches
    // believedLoadForBuild/effectiveRangeYdForSpec correctly wired, not
    // re-litigating the curve math.
    const load: LoadSpec = { cartridgeId: '22lr', weightGr: 40, i7: 0, grade: 'match', presetId: '22lr-match' };
    const barrels = [c22lr.barrelBandIn.min, c22lr.referenceBarrelIn, c22lr.barrelBandIn.max];
    const mvs = barrels.map(
      (barrelLengthIn) => believedLoadForBuild(rifleSpec('22lr', barrelLengthIn), load).muzzleVelocityMps,
    );
    for (let i = 1; i < mvs.length; i++) {
      expect(mvs[i]).toBeLessThan(mvs[i - 1]); // longer barrel → SLOWER, the rimfire inversion
    }

    // And the yardage-level function stays well-behaved (0, not negative/NaN)
    // for a round with no supersonic phase, at every barrel in the band.
    const ranges = barrels.map((barrelLengthIn) => effectiveRangeYdForSpec(module, rifleSpec('22lr', barrelLengthIn), load));
    for (const r of ranges) expect(r).toBe(0);
  });

  it('a heavy .223 build reaches meaningfully further than a light one (same rifle)', () => {
    const rifle = rifleSpec('223', c223.referenceBarrelIn);
    const light = effectiveRangeYdForSpec(module, rifle, loadSpec223(c223.weightRangeGr!.min, 1.0));
    const heavy = effectiveRangeYdForSpec(module, rifle, loadSpec223(c223.weightRangeGr!.max, 1.0));
    // The old per-cartridge constant expressed exactly one .223 reach (600 yd)
    // regardless of bullet weight — this is the behaviour that couldn't show.
    expect(heavy).toBeGreaterThan(light + 100);
  });

  it('rounds down to the cartridge ladder cadence: a century for centrefire', () => {
    const rifle = rifleSpec('223', c223.referenceBarrelIn);
    const yd = effectiveRangeYdForSpec(module, rifle, loadSpec223(77, 1.0));
    expect(yd % 100).toBe(0);
    expect(yd).toBeGreaterThan(0);
  });

  it('caches by (rifleSpec, loadSpec): no solve is issued twice for the same pair', () => {
    const rifle = rifleSpec('223', c223.referenceBarrelIn);
    const load = loadSpec223(77, 1.0);
    expect(effectiveRangeSolveCount()).toBe(0);
    const a = effectiveRangeYdForSpec(module, rifle, load);
    expect(effectiveRangeSolveCount()).toBe(1);
    const b = effectiveRangeYdForSpec(module, rifle, load);
    expect(effectiveRangeSolveCount()).toBe(1); // second call hit the cache
    expect(b).toBe(a);

    // A genuinely different pair DOES solve again.
    effectiveRangeYdForSpec(module, rifle, loadSpec223(90, 1.0));
    expect(effectiveRangeSolveCount()).toBe(2);
  });

  it('a heavier .223 stays supersonic well past 600 yd, and .308 stops short of 1000 (owner check preview)', () => {
    // Sanity-checks the plan's own "what the owner checks" numbers before they
    // hand-verify on device: .223 match's real supersonic limit is ~865 yd
    // (past the old 600 yd cap); .308's is short of the old 1000 yd cap.
    const c308 = cartridgeParams('308');
    const rifle223 = rifleSpec('223', c223.referenceBarrelIn);
    const yd223 = effectiveRangeYdForSpec(module, rifle223, loadSpec223(77, 1.085)); // ~308-match's implied i7 shape, close to the shipped 77gr TMK
    expect(yd223).toBeGreaterThan(600);

    const rifle308 = rifleSpec('308', c308.referenceBarrelIn);
    const load308: LoadSpec = { cartridgeId: '308', weightGr: 175, i7: 1.085, grade: 'match' };
    const yd308 = effectiveRangeYdForSpec(module, rifle308, load308);
    expect(yd308).toBeLessThan(1000);
  });
});
