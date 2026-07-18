// Gear acquisition (task 2.2b). Turns a catalog entry into an owned instance by
// rolling a per-field normalized draw for each hidden field (2.1 D4: draws are
// rolled at acquisition, stored as the instance's identity, mapped to truth on
// demand via 2.1b). The RNG is injected (`() => number` in [0,1)) so tests are
// deterministic; production passes `cryptoRng()` (platform `crypto`, no deps).
//
// The draw-field lists MUST match the keys `deriveRifleTruth`/`deriveLotTruth`
// read in game/hidden-truth.ts — note the lot's `bcError` draw maps through the
// `bc` range, so it's spelled `bcError` here, not `bc`.
import type { AmmoLot, RifleInstance } from '../persistence';
import { CATALOG_VERSION, getAmmoLoad, getRifleModel } from './catalog';

/** Rifle hidden-field draw keys (→ deriveRifleTruth). */
export const RIFLE_DRAW_FIELDS = ['mvOffset', 'zeroH', 'zeroV', 'inherentPrecision'] as const;
/** Lot hidden-field draw keys (→ deriveLotTruth; `bcError` maps to the `bc` range). */
export const LOT_DRAW_FIELDS = ['meanMvShift', 'mvSd', 'bcError', 'bcSd'] as const;

/** Roll one normalized [0,1) draw per field. Defensively clamps a misbehaving
 *  rng into the [0,1) the save schema requires. */
export function rollDraws(fields: readonly string[], rng: () => number): Record<string, number> {
  const draws: Record<string, number> = {};
  for (const f of fields) {
    const v = rng();
    draws[f] = v < 0 ? 0 : v >= 1 ? 0.999999999 : v;
  }
  return draws;
}

export interface AcquireOptions {
  /** Draw source in [0,1). */
  rng: () => number;
  /** Unique record id. */
  id: string;
  /** Catalog version the draws were rolled under (D2/D10); defaults to current. */
  catalogVersion?: number;
}

/** Build an owned rifle instance from a catalog model id (validates the id). */
export function buildRifleInstance(catalogId: string, opts: AcquireOptions): RifleInstance {
  getRifleModel(catalogId); // throws on an unknown model id
  return {
    id: opts.id,
    catalogId,
    catalogVersion: opts.catalogVersion ?? CATALOG_VERSION,
    draws: rollDraws(RIFLE_DRAW_FIELDS, opts.rng),
  };
}

/** Build an owned ammo lot from a catalog load id (validates the id). */
export function buildAmmoLot(catalogId: string, opts: AcquireOptions): AmmoLot {
  getAmmoLoad(catalogId); // throws on an unknown load id
  return {
    id: opts.id,
    catalogId,
    catalogVersion: opts.catalogVersion ?? CATALOG_VERSION,
    draws: rollDraws(LOT_DRAW_FIELDS, opts.rng),
  };
}

/** Platform-crypto draw source in [0,1) (no deps; used in production acquire). */
export function cryptoRng(): () => number {
  return () => {
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    return buf[0] / 2 ** 32; // [0, 1)
  };
}

/** A unique record id (`prefix-<uuid>`). */
export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}
