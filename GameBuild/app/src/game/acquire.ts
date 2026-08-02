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
import { cartridgeParams, CARTRIDGES_CATALOG_VERSION, type LoadSpec, type RifleSpec } from './spec';

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
  /** Epoch-ms acquisition time (P2). Defaults to 0 in the builder; the store's
   *  acquire actions pass `Date.now()`. */
  acquiredAt?: number;
  /** Lot numbers already in use (P2) — a new lot's `[A-Z][0-9][0-9]` code is
   *  generated unique against these. Defaults to empty (the first lot). */
  existingLotNumbers?: ReadonlySet<string>;
}

/** Rounds in a freshly-acquired lot (P2). A TESTING value — real lot sizes will
 *  scale to a few hundred / up to ~1000; this becomes per-catalog later.
 *
 *  Raised 20 → 100 (owner, 2026-07-29): 20 rounds does not survive building a
 *  come-up table across an 18-station range, and replenishing mid-session is
 *  friction with no teaching value at this stage. A real box is 20 and a real
 *  case is 500–1000, so 100 stays inside the plausible range while it lasts a
 *  full DOPE session. */
export const DEFAULT_LOT_ROUNDS = 100;

const EMPTY_LOT_NUMBERS: ReadonlySet<string> = new Set();

/**
 * A non-sequential `[A-Z][0-9][0-9]` lot code (D52, H05, …) derived DETERMINISTIC-
 * ally from the lot id (owner 2026-07-27: realism, not counted up). Deterministic
 * from the id means a save reloads to the same codes with no RNG/Date dependency;
 * an FNV-1a hash makes it look random. Probes the full 2600-code space on
 * collision, so it always returns a code unused in `taken` when one exists. */
export function lotNumberFromId(id: string, taken: ReadonlySet<string> = EMPTY_LOT_NUMBERS): string {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  h = h >>> 0;
  // Over 2600 consecutive n, (n%26, ⌊n/26⌋%100) is a bijection onto all 26×100
  // codes, so this finds a free one if the space isn't full.
  for (let attempt = 0; attempt < 2600; attempt++) {
    const n = (h + attempt) >>> 0;
    const letter = String.fromCharCode(65 + (n % 26));
    const num = Math.floor(n / 26) % 100;
    const code = `${letter}${String(num).padStart(2, '0')}`;
    if (!taken.has(code)) return code;
  }
  return `Z${String(h % 100).padStart(2, '0')}`; // space exhausted (unreachable in practice)
}

/** Build an owned rifle instance from a build spec (S4 — replaces the old
 *  catalog-model-id builder; validates the spec's cartridge id). */
export function buildRifleInstance(spec: RifleSpec, opts: AcquireOptions): RifleInstance {
  cartridgeParams(spec.cartridgeId); // throws on an unknown cartridge
  return {
    id: opts.id,
    spec,
    catalogVersion: opts.catalogVersion ?? CARTRIDGES_CATALOG_VERSION,
    draws: rollDraws(RIFLE_DRAW_FIELDS, opts.rng),
    acquiredAt: opts.acquiredAt ?? 0,
    lifetimeShotCount: 0,
  };
}

/** Build an owned ammo lot from a build spec (S4 — replaces the old
 *  catalog-load-id builder; validates the spec's cartridge id). */
export function buildAmmoLot(spec: LoadSpec, opts: AcquireOptions): AmmoLot {
  cartridgeParams(spec.cartridgeId); // throws on an unknown cartridge
  return {
    id: opts.id,
    spec,
    catalogVersion: opts.catalogVersion ?? CARTRIDGES_CATALOG_VERSION,
    draws: rollDraws(LOT_DRAW_FIELDS, opts.rng),
    lotNumber: lotNumberFromId(opts.id, opts.existingLotNumbers),
    roundsRemaining: DEFAULT_LOT_ROUNDS,
    acquiredAt: opts.acquiredAt ?? 0,
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
