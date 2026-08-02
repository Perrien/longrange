// Derived effective range (rifle-ammo-store S8, D15). Replaces the old
// per-cartridge AUTHORED `effectiveRangeYd` constant (catalog.data.json /
// catalog.ts's now-deleted `catalogEffectiveRangeYd`) with a genuine per-
// (rifle, load) physics solve: the last station at which the BELIEVED
// trajectory, solved at ICAO sea level, is still supersonic. Barrel length and
// bullet BC now visibly move the number — the authored constant could not
// express either (every 6.5 CM build shared one number regardless of barrel
// or bullet choice).
//
// Cached by (rifleSpec, loadSpec) — this runs on every gear change, DOPE-book
// open and DOPE-panel refresh (S8 plan text), and a physics solve isn't free.
import type { AtmosphereInput, BtkModule, Load, WindVec } from './types';
import { solveTrajectory, spinRateFromTwist, speedOfSound } from './index';
import { believedLoadForBuild, isRimfireCartridge, twistMForSpec } from '../game/catalog';
import { RIMFIRE_STEPS } from '../game/dope-book';
import type { RifleSpec, LoadSpec } from '../game/spec';
import { yardsToMeters, metersToYards } from '../units/length';

/** ICAO sea level (D15 — no altitude/temperature axis; the definition pins
 *  this exact atmosphere). Same numbers as the DOPE book's own reference-table
 *  solve (`DopeBookScreen`/`DopePanel`'s `ISA_ATMOSPHERE`), so "effective
 *  range" and "what the reference table actually shows" never disagree. */
export const ICAO_SEA_LEVEL: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

const CALM: WindVec = { x: 0, y: 0, z: 0 };

// Solve resolution (m) and hard ceiling (m). 3000 m mirrors DEFAULT_MAX_TIME_S's
// own "every catalog load past 3 km, with room to spare" margin (engine-bridge/
// index.ts) — a .50 BMG can stay supersonic well past 2000 m, so the ceiling
// has to clear that with margin. 25 m keeps the sample count (~120) small
// without rounding the crossing point further than `roundDownToCadence` will
// collapse it anyway.
const STEP_M = 25;
const MAX_RANGE_M = 3000;
const ZERO_RANGE_M = yardsToMeters(100); // arbitrary — Mach crossing doesn't depend on the zero

/** Round a solved effective range (yd) DOWN to the cartridge's own DOPE-ladder
 *  cadence (S8 step 1) — centrefire's centuries, or the rimfire fine set. */
function roundDownToCadence(yd: number, isRimfire: boolean): number {
  if (isRimfire) {
    let last = 0;
    for (const s of RIMFIRE_STEPS) {
      if (s > yd) break;
      last = s;
    }
    return last;
  }
  return Math.floor(yd / 100) * 100;
}

/** Stable cache key for a (rifleSpec, loadSpec) pair — every field that can
 *  change the solved trajectory, nothing that can't (S8 step 2). */
function specKey(rifleSpec: RifleSpec, loadSpec: LoadSpec): string {
  return [
    rifleSpec.cartridgeId,
    rifleSpec.barrelLengthIn,
    rifleSpec.twistIn,
    loadSpec.cartridgeId,
    loadSpec.weightGr,
    loadSpec.i7,
    loadSpec.grade,
    loadSpec.presetId ?? '',
  ].join('|');
}

const cache = new Map<string, number>();
// Cache-instrumentation for the S8 done-when ("no solve is issued twice for
// the same spec pair") — incremented only on an actual cache MISS, so a test
// can assert it stays at 1 across repeat calls with the same build.
let solveCount = 0;

/** Test-only: reset both the memo cache and the solve counter (each test
 *  should start from a clean slate). */
export function clearEffectiveRangeCache(): void {
  cache.clear();
  solveCount = 0;
}

/** Test-only: how many times the underlying trajectory solve has actually
 *  run since the last `clearEffectiveRangeCache()` — NOT the same as the
 *  number of `effectiveRangeYdForSpec` calls, which may be higher (cache hits
 *  don't re-solve). */
export function effectiveRangeSolveCount(): number {
  return solveCount;
}

/**
 * Core solve, uncached: the last station (yd, rounded down to `isRimfire`'s
 * ladder cadence) at which `load` (already resolved to a specific barrel/
 * twist) is still supersonic (Mach ≥ 1.0) at ICAO sea level (D15). Takes a
 * raw engine `Load` + twist rather than a (RifleSpec, LoadSpec) pair, so it
 * also serves callers with no catalog spec to resolve — see
 * `effectiveRangeYdForLoad` (DopePanel's no-gear box-true fallback, which
 * solves a hand-built `GameLoad`, not a spec).
 */
function solveEffectiveRangeYd(module: BtkModule, load: Load, twistM: number, isRimfire: boolean): number {
  const spinRateRadPerSec = spinRateFromTwist(load.muzzleVelocityMps, twistM);
  const table = solveTrajectory(
    module,
    { ...load, spinRateRadPerSec },
    ICAO_SEA_LEVEL,
    CALM,
    { zeroRangeM: ZERO_RANGE_M, maxRangeM: MAX_RANGE_M, stepM: STEP_M },
  );
  solveCount++;

  const speedOfSoundMps = speedOfSound(module, ICAO_SEA_LEVEL);
  // Velocity is monotonically decreasing along a normal ballistic flight, so
  // the first subsonic row marks the crossing — no need to scan the rest.
  let lastSupersonicM = 0;
  for (const row of table) {
    if (row.velocityMps / speedOfSoundMps < 1.0) break;
    lastSupersonicM = row.rangeM;
  }

  return roundDownToCadence(metersToYards(lastSupersonicM), isRimfire);
}

/**
 * The last station (yd, rounded down to the cartridge's own ladder cadence)
 * at which the BELIEVED trajectory is still supersonic (Mach ≥ 1.0), solved
 * at ICAO sea level (D15). Memoized per (rifleSpec, loadSpec) pair.
 */
export function effectiveRangeYdForSpec(module: BtkModule, rifleSpec: RifleSpec, loadSpec: LoadSpec): number {
  const key = specKey(rifleSpec, loadSpec);
  const cached = cache.get(key);
  if (cached !== undefined) return cached;

  const load = believedLoadForBuild(rifleSpec, loadSpec);
  const twistM = twistMForSpec(rifleSpec);
  const isRimfire = isRimfireCartridge(loadSpec.cartridgeId);
  const result = solveEffectiveRangeYd(module, load, twistM, isRimfire);
  cache.set(key, result);
  return result;
}

/**
 * Uncached variant for callers with no catalog spec to key a cache on — e.g.
 * DopePanel's no-active-gear box-true fallback, which solves a hand-built
 * `GameLoad` (game/loads.ts) rather than a resolved (RifleSpec, LoadSpec).
 * This path only runs while no rifle+lot is equipped, so the lack of a memo
 * cache doesn't matter in practice.
 */
export function effectiveRangeYdForLoad(module: BtkModule, load: Load, twistM: number, isRimfire: boolean): number {
  return solveEffectiveRangeYd(module, load, twistM, isRimfire);
}
