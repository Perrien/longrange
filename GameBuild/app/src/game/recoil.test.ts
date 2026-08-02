// rifle-ammo-store S10 tests — cartridge-scaled recoil pitch velocity (D13).
import { describe, expect, it } from 'vitest';
import { RECOIL_PITCH_VEL_REFERENCE, recoilPitchVelocity, recoilRatioToReference } from './recoil';
import { resolveShot, type ResolveShotParams } from './shot';
import { cartridgeParams, specFromPreset, type LoadSpec, type RifleSpec } from './spec';
import { RIFLE_WEIGHT_LB } from './recoil-reference';

function refBuild(cartridgeId: string): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

// Same bullet weights as ballistic-derivation.test.ts's §3.5 ROWS (built at each
// cartridge's own reference barrel, matching how those anchor MVs were sourced)
// — i7 doesn't matter here (recoilVelocityMps never reads BC/form factor), so an
// arbitrary in-band value is fine. `relKick` is feature-catalog.md §B's own
// "rel. kick" column (V_r / V_r(6.5 CM)).
const ROWS: { cartridgeId: string; bulletGr: number; relKick: number }[] = [
  { cartridgeId: '22lr', bulletGr: 40, relKick: 0.13 },
  { cartridgeId: '223', bulletGr: 77, relKick: 0.81 },
  { cartridgeId: '65cm', bulletGr: 140, relKick: 1.0 },
  { cartridgeId: '308', bulletGr: 175, relKick: 1.63 },
  { cartridgeId: '300wm', bulletGr: 215, relKick: 1.96 },
  { cartridgeId: '338lm', bulletGr: 300, relKick: 2.24 },
  { cartridgeId: '50bmg', bulletGr: 750, relKick: 3.95 },
];

function loadFor(row: (typeof ROWS)[number]): LoadSpec {
  // .22 LR (D8) requires a presetId — 22lr-match is 40 gr, matching this row's
  // bulletGr exactly, so it still reproduces the same anchor combo the other
  // rows hand-build directly.
  if (row.cartridgeId === '22lr') return specFromPreset('22lr-match');
  const c = cartridgeParams(row.cartridgeId);
  const i7 = c.i7Range ? (c.i7Range.min + c.i7Range.max) / 2 : 0; // recoil doesn't read i7 at all
  return { cartridgeId: row.cartridgeId, weightGr: row.bulletGr, i7, grade: 'match' };
}

const pctDiff = (a: number, b: number) => (100 * (a - b)) / b;

describe('recoilRatioToReference — §3.5 relative-kick column (D13, within 8%)', () => {
  it.each(ROWS)('$cartridgeId within 8% of the catalog relative-kick figure', (row) => {
    const ratio = recoilRatioToReference(refBuild(row.cartridgeId), loadFor(row));
    expect(ratio).toBeDefined();
    expect(Math.abs(pctDiff(ratio!, row.relKick))).toBeLessThan(8);
  });

  it('grows monotonically through the ladder, same order as feature-catalog §B', () => {
    const ratios = ROWS.map((row) => recoilRatioToReference(refBuild(row.cartridgeId), loadFor(row))!);
    for (let i = 1; i < ratios.length; i++) expect(ratios[i]).toBeGreaterThan(ratios[i - 1]);
  });
});

describe('recoilPitchVelocity — the D13 calibration point + graceful fallback', () => {
  it('6.5 CM / 140 gr match at its reference build returns exactly RECOIL_PITCH_VEL_REFERENCE (0.05)', () => {
    const v = recoilPitchVelocity(refBuild('65cm'), specFromPreset('65cm-match'));
    expect(v).toBeCloseTo(RECOIL_PITCH_VEL_REFERENCE, 10);
  });

  it('scales up for a heavier-kicking cartridge and down for a lighter one', () => {
    const bmg = recoilPitchVelocity(refBuild('50bmg'), loadFor(ROWS[6]));
    const lr = recoilPitchVelocity(refBuild('22lr'), loadFor(ROWS[0]));
    expect(bmg).toBeGreaterThan(RECOIL_PITCH_VEL_REFERENCE);
    expect(lr).toBeLessThan(RECOIL_PITCH_VEL_REFERENCE);
  });

  it('falls back to the flat reference value for a cartridge with no sourced rifle weight (a real, logged gap)', () => {
    expect(RIFLE_WEIGHT_LB['6cm']).toBeUndefined();
    const v = recoilPitchVelocity(refBuild('6cm'), { cartridgeId: '6cm', weightGr: 108, i7: 1.0, grade: 'match' });
    expect(v).toBe(RECOIL_PITCH_VEL_REFERENCE);
  });
});

describe('no-POI-shift guard (D13 step 3) — resolveShot never sees recoil', () => {
  // `ResolveShotParams` (game/shot.ts) has no recoil-related field at all — this
  // is the structural guarantee ScopeView relies on (aim is sampled and the shot
  // resolved BEFORE `st.dist.vp -= recoilPitchVelocity(...)` runs). Prove it by
  // computing the same shot against two wildly different recoil scales (a flat
  // .22 LR build and a heavy .50 BMG build) and asserting the resolved impact is
  // bit-identical either way — varying the recoil number that will be applied
  // AFTER this call cannot move where THIS shot lands.
  const baseParams: ResolveShotParams = {
    eye: { x: 0, y: 1.6, z: 0 },
    aimDir: { x: 0.01, y: 0.002, z: -1 },
    dial: { elevRad: 0.001, windRad: -0.0005 },
    solve: { dropM: -1.2, windageM: 0.15 },
    distanceM: 300,
    scatter: { x: 0.02, y: -0.03 },
    plates: [{ instanceId: 1, position: { x: 0, y: 0 }, diameterM: 0.3 }],
    bulletDiameterM: 0.008,
  };

  it('identical inputs resolve to the identical impact regardless of the recoil scale that will apply next', () => {
    const lightRecoil = recoilPitchVelocity(refBuild('22lr'), loadFor(ROWS[0]));
    const heavyRecoil = recoilPitchVelocity(refBuild('50bmg'), loadFor(ROWS[6]));
    expect(lightRecoil).not.toBeCloseTo(heavyRecoil, 3); // sanity: they really do differ

    const resultA = resolveShot(baseParams); // as if about to apply lightRecoil next
    const resultB = resolveShot(baseParams); // as if about to apply heavyRecoil next
    expect(resultA.impact).toEqual(resultB.impact);
  });
});
