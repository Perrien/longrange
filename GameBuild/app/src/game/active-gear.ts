// Active-gear solve context (task 2.3c2, D2/D8). Turns a selected rifle instance
// + ammo lot into everything `engine-bridge/gear-solve.solveGear` needs: the
// catalog truth-ranges, the load geometry (bullet diameter), the zero range to
// solve at, and the stored player zero. Centralises the zero-range POLICY (the
// rifle's confirmed `playerZero.zeroRangeM` if zeroed, else the cartridge default
// via `recommendedZeroM`) so both the sight-in fire path (2.3c2) and the Range A
// gear integration (2.3d) share one source.
//
// Pure + state-free: it takes the resolved records (from `store.inventory`, which
// the caller reads) — it never imports `state/`, keeping the dependency direction
// state → game → units/persistence.
import type { RifleInstance, AmmoLot } from '../persistence';
import type { RifleTruthRanges, LotTruthRanges } from './hidden-truth';
import type { DisplayUnits } from '../units/display';
import {
  getRifleModel,
  catalogRifleRanges,
  catalogLotRanges,
  believedLoad,
} from './catalog';
import { recommendedZeroM } from './zero-distance';

export interface GearSolveContext {
  rifle: RifleInstance;
  lot: AmmoLot;
  rifleRanges: RifleTruthRanges;
  lotRanges: LotTruthRanges;
  /** Bullet diameter (m) — load geometry, for the splat/hit-test radius. */
  bulletDiameterM: number;
  /** Bullet mass (kg) — load geometry, for steel impulse + impact-audio energy
   *  (task 2.3e). Public box data, not truth. */
  bulletMassKg: number;
  /** Range (m) to zero the solve at: the stored confirmed zero if the rifle has
   *  one, else the cartridge default (D8). */
  zeroRangeM: number;
  /** The stored player zero correction (rad); {0,0} if the rifle is unzeroed. */
  playerZero: { elevationRad: number; windageRad: number };
}

/** Build the gear-solve context for an active (rifle, lot) pairing. */
export function gearSolveContext(
  rifle: RifleInstance,
  lot: AmmoLot,
  unitsPrimary: DisplayUnits,
): GearSolveContext {
  const rifleModel = getRifleModel(rifle.catalogId);
  const pz = rifle.playerZero;
  const load = believedLoad(lot.catalogId);
  return {
    rifle,
    lot,
    rifleRanges: catalogRifleRanges(rifle.catalogId),
    lotRanges: catalogLotRanges(lot.catalogId),
    bulletDiameterM: load.diameterM,
    bulletMassKg: load.massKg,
    zeroRangeM: pz?.zeroRangeM ?? recommendedZeroM(rifleModel.cartridgeId, unitsPrimary),
    // Only the correction (elevation/windage) — zeroRangeM is exposed separately.
    playerZero: pz
      ? { elevationRad: pz.elevationRad, windageRad: pz.windageRad }
      : { elevationRad: 0, windageRad: 0 },
  };
}
