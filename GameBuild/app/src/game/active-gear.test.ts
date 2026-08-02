// Active-gear solve-context tests (task 2.3c2, D2/D8).
import { describe, expect, it } from 'vitest';
import { gearSolveContext } from './active-gear';
import { believedLoadForSpec } from './catalog';
import { cartridgeParams, specFromPreset, type RifleSpec } from './spec';
import { recommendedZeroM } from './zero-distance';
import type { RifleInstance, AmmoLot } from '../persistence';

const c65 = cartridgeParams('65cm');
const RIFLE_65CM: RifleSpec = { cartridgeId: '65cm', barrelLengthIn: c65.referenceBarrelIn, twistIn: c65.twistOptionsInPerTurn[0] };
const LOAD_65CM_MATCH = specFromPreset('65cm-match');

const rifle = (playerZero?: RifleInstance['playerZero']): RifleInstance => ({
  id: 'r1',
  spec: RIFLE_65CM,
  catalogVersion: 1,
  draws: { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 },
  playerZero,
});
const lot: AmmoLot = {
  id: 'l1',
  spec: LOAD_65CM_MATCH,
  catalogVersion: 1,
  draws: { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 },
};

describe('gearSolveContext (D2/D8)', () => {
  it('supplies catalog ranges + bullet diameter from the load geometry', () => {
    const ctx = gearSolveContext(rifle(), lot, 'MIL');
    expect(ctx.bulletDiameterM).toBe(believedLoadForSpec(LOAD_65CM_MATCH).diameterM);
    expect(ctx.bulletMassKg).toBe(believedLoadForSpec(LOAD_65CM_MATCH).massKg);
    expect(ctx.rifleRanges.zeroOffset).toBeDefined();
    expect(ctx.lotRanges.bc).toBeDefined();
  });

  it('an unzeroed rifle falls back to the cartridge default zero (centrefire → 100)', () => {
    const ctx = gearSolveContext(rifle(), lot, 'MOA');
    expect(ctx.zeroRangeM).toBeCloseTo(recommendedZeroM('65cm', 'MOA'), 10);
    expect(ctx.playerZero).toEqual({ elevationRad: 0, windageRad: 0 });
  });

  it('a zeroed rifle uses its stored zero range + correction', () => {
    const pz = { elevationRad: 0.0012, windageRad: -0.0003, zeroRangeM: 182.88 };
    const ctx = gearSolveContext(rifle(pz), lot, 'MIL');
    expect(ctx.zeroRangeM).toBe(182.88);
    expect(ctx.playerZero).toEqual({ elevationRad: 0.0012, windageRad: -0.0003 });
  });
});
