// BC fitter (bc-truing-plan T1, D15 lever 2): given a come-up the player asserts
// is correct at a distance, finds the BC that reproduces it over the believed
// solve. Lives in engine-bridge/ because it drives the WASM solver — it touches
// NO hidden truth (every input is a believed/box value or a number the player
// typed), so it must never import game/hidden-truth (§4.8 guardrail).
//
// Method: come-up at a fixed distance is monotonically decreasing in BC (more
// BC → less drop → less come-up), so a bracketed bisection is both correct and
// predictable. See Design/Plans/bc-truing-plan.md §T1.
import type { AtmosphereInput, BtkModule, Load, WindVec } from './types';
import { solveTrajectory, spinRateFromTwist } from './index';
import { requiredCorrectionRad } from '../game/firing-solution';
import { milToRad } from '../units/angle';

export interface BcFitInput {
  /** Believed geometry + EFFECTIVE MV (chrono if present, else box). The `bc`
   *  field is a placeholder — every candidate solve overwrites it. */
  load: Load;
  /** Spin is re-derived per candidate via spinRateFromTwist(load.muzzleVelocityMps, twistM). */
  twistM: number;
  atmosphere: AtmosphereInput;
  wind: WindVec;
  zeroRangeM: number;
  sightHeightM: number;
  distanceM: number;
  /** The come-up the player asserts is correct at distanceM (rad, positive = up). */
  requiredElevRad: number;
  /** Plausible band (B4). Caller supplies [0.5×box, 2.0×box]. */
  bcMin: number;
  bcMax: number;
}

export type BcFitResult =
  | { ok: true; bc: number; comeUpRad: number; iterations: number }
  | {
      ok: false;
      reason: 'needs-more-bc' | 'needs-less-bc';
      achievableMinRad: number;
      achievableMaxRad: number;
    };

/** Hard iteration cap (T1): band width / 2^18 is far below any BC precision
 *  that matters. Combined with the 2 bracket evaluations, a worst-case fit is
 *  ~20 solves. */
const MAX_ITERATIONS = 18;

/** Early-exit tolerance: 0.005 mil, tighter than the table's own 0.05 mil
 *  display rounding (DopePanel), so the fit never visibly "misses". */
const TOLERANCE_RAD = milToRad(0.005);

/** Solve the believed load at a candidate BC and return its come-up (rad,
 *  positive = up) at `input.distanceM` — a single-row solve (maxRangeM = stepM
 *  = distanceM). Uses the same sign convention as the rest of the game
 *  (`requiredCorrectionRad`, `game/firing-solution.ts`) so the fitted value is
 *  directly comparable to `session.scope.elevationRad`. */
function comeUpAtBc(module: BtkModule, input: BcFitInput, bc: number): number {
  const load: Load = {
    ...input.load,
    bc,
    spinRateRadPerSec: spinRateFromTwist(input.load.muzzleVelocityMps, input.twistM),
  };
  const table = solveTrajectory(module, load, input.atmosphere, input.wind, {
    zeroRangeM: input.zeroRangeM,
    maxRangeM: input.distanceM,
    stepM: input.distanceM,
    sightHeightM: input.sightHeightM,
  });
  const row = table[table.length - 1];
  if (!row) {
    throw new Error(`bc-fit: solve produced no row at ${input.distanceM} m (bc=${bc})`);
  }
  return requiredCorrectionRad(row.dropM, row.windageM, row.rangeM).elevRad;
}

/**
 * Fit a BC (within `[bcMin, bcMax]`) whose believed come-up at `distanceM`
 * matches `requiredElevRad`. Bracketed bisection — see module doc.
 */
export function fitBc(module: BtkModule, input: BcFitInput): BcFitResult {
  // More BC → less drop → less come-up, so comeUpAtBcMax is the SMALLEST
  // achievable come-up and comeUpAtBcMin is the LARGEST.
  const comeUpAtBcMax = comeUpAtBc(module, input, input.bcMax);
  const comeUpAtBcMin = comeUpAtBc(module, input, input.bcMin);

  if (input.requiredElevRad < comeUpAtBcMax) {
    // Flatter than the best (highest) BC in band can produce.
    return {
      ok: false,
      reason: 'needs-more-bc',
      achievableMinRad: comeUpAtBcMax,
      achievableMaxRad: comeUpAtBcMin,
    };
  }
  if (input.requiredElevRad > comeUpAtBcMin) {
    // More drop than the worst (lowest) BC in band can produce.
    return {
      ok: false,
      reason: 'needs-less-bc',
      achievableMinRad: comeUpAtBcMax,
      achievableMaxRad: comeUpAtBcMin,
    };
  }

  let lo = input.bcMin; // comeUp(lo) = comeUpAtBcMin (largest)
  let hi = input.bcMax; // comeUp(hi) = comeUpAtBcMax (smallest)
  let bc = (lo + hi) / 2;
  let comeUpRad = comeUpAtBc(module, input, bc);

  let iterations = 1;
  for (; iterations <= MAX_ITERATIONS; iterations++) {
    if (Math.abs(comeUpRad - input.requiredElevRad) < TOLERANCE_RAD) break;
    if (comeUpRad > input.requiredElevRad) {
      // Too much come-up (too much drop) → need more BC.
      lo = bc;
    } else {
      // Too little come-up (too little drop) → need less BC.
      hi = bc;
    }
    bc = (lo + hi) / 2;
    comeUpRad = comeUpAtBc(module, input, bc);
  }

  return { ok: true, bc, comeUpRad, iterations: Math.min(iterations, MAX_ITERATIONS) };
}
