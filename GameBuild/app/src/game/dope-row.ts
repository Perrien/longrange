// Shared DOPE row formatter (task 1.6d, step 1): turns one solved trajectory
// row into the display fields both the 0.4 debug DropTable and the in-scope
// DopePanel show — range, come-up, and wind hold, each in both MIL/MOA and
// metric/imperial (catalog §0.6). Extracted so the two screens can't drift
// from each other or hand-derive the angle math themselves (guardrail §4.4:
// all angle/length math goes through the units service, and now through this
// one shared row-format path).

import { asMilMoa, type MilMoa } from '../units/angle';
import { metersToYards, metersToCentimeters, metersToInches } from '../units/length';
import { mpsToFps } from '../units/velocity';
import { joulesToFootPounds } from '../units/energy';
import type { TrajectoryRow } from '../engine-bridge/types';
import type { ComeUpStation } from './dope-book';

/** Small-angle-free correction angle (rad) subtended at the shooter for a
 *  linear offset (drop or windage) at a given range — `atan2`, not the
 *  linearized mil-relation, so it stays exact at close range too. */
export const angleAtRange = (offsetM: number, rangeM: number): number => Math.atan2(offsetM, rangeM);

/** Transonic band of a row's retained velocity (DOPE book page 2, owner
 *  2026-07-27). The bullet is stable well above the speed of sound, grows
 *  unstable through the transonic zone, and is unreliable subsonic:
 *   - `supersonic` — Mach > 1.2
 *   - `transonic`  — 1.0 < Mach ≤ 1.2 (onset of instability; flagged)
 *   - `subsonic`   — Mach ≤ 1.0 (distinct, stronger mark)
 *  Only classifiable when a speed of sound is supplied (else `undefined`). */
export type TransonicBand = 'supersonic' | 'transonic' | 'subsonic';

const TRANSONIC_ONSET_MACH = 1.2;

export function transonicBand(mach: number): TransonicBand {
  if (mach <= 1.0) return 'subsonic';
  if (mach <= TRANSONIC_ONSET_MACH) return 'transonic';
  return 'supersonic';
}

/**
 * Mach-state marking for a COMMITTED target (ELR build spec task 10).
 *
 * Returns the text to show beside the engagement, or `null` when there is
 * nothing worth saying. Built on `transonicBand` rather than re-deriving the
 * thresholds, so the in-scope marking and the DOPE card can never disagree
 * about where transonic starts.
 *
 * ⚠️ **`'TRANSONIC'` is deliberately bare — do not add "dispersion opens" or any
 * equivalent.** The drag rise through Mach 1 IS modelled, so the trajectory is
 * right; the group opening is NOT (the engine's only scatter sources are MV SD,
 * BC SD and rifle precision, none of which know the bullet's Mach number). A
 * label promising wider groups would describe physics the game does not
 * simulate. See `Wiki/_gaps.md` N4 and `Design/feature-catalog.md` §A.
 *
 * The subsonic string may name a consequence because that one is real and
 * already modelled: past Mach 1 the round has lost the energy and the flat
 * trajectory that make the shot worth taking. Nothing is GATED either way —
 * every station stays shootable (owner, 2026-07-29).
 */
export function machStateLabel(mach: number): string | null {
  switch (transonicBand(mach)) {
    case 'subsonic':
      return 'SUBSONIC — past effective range';
    case 'transonic':
      return 'TRANSONIC';
    default:
      return null;
  }
}

/** Nearest row to a target range (m), or `undefined` if none within `tolM`.
 *  Shared by both DOPE surfaces to map a uniform solve grid onto the exact ladder
 *  stations (the grid is stepped by the ladder's base gap, so a station's row sits
 *  well within the default tolerance). Pure. */
export function nearestRow<T extends { rangeM: number }>(
  rows: readonly T[],
  rangeM: number,
  tolM = 0.5,
): T | undefined {
  let best: T | undefined;
  let bestErr = Infinity;
  for (const r of rows) {
    const err = Math.abs(r.rangeM - rangeM);
    if (err < bestErr) {
      bestErr = err;
      best = r;
    }
  }
  return best && bestErr < tolM ? best : undefined;
}

/** One DOPE row's display fields — both unit systems, ready to render. */
export interface DopeRow {
  rangeM: number;
  rangeYd: number;
  /** Vertical come-up (linear), cm/in. Positive to display "hold under" —
   *  callers show the sign as the engine reports it (negative = below LOS). */
  dropCm: number;
  dropIn: number;
  /** Vertical come-up (angular): the correction to dial/hold, both units. */
  dropMilMoa: MilMoa;
  windCm: number;
  windIn: number;
  /** Wind hold (angular), both units. */
  windMilMoa: MilMoa;
  velocityMps: number;
  velocityFps: number;
  timeOfFlightS: number;
  /** Kinetic energy at the target, both unit systems (J / ft·lbf). */
  energyJ: number;
  energyFtLb: number;
  /** Retained velocity as a Mach number, and its transonic band — present only
   *  when a speed of sound was supplied to `formatDopeRow` (page 2 wants it; the
   *  in-scope strip and the debug DropTable don't, so they omit it). */
  machNumber?: number;
  transonic?: TransonicBand;
}

/** Optional context for the richer page-2 columns. Omitted by the in-scope strip
 *  and the debug DropTable, which don't show Mach/transonic. */
export interface DopeRowContext {
  /** Speed of sound (m/s) for the row's atmosphere — enables the Mach/transonic
   *  fields. From `engine-bridge` `speedOfSound(module, atmosphere)`. */
  speedOfSoundMps?: number;
}

/** Format one solved trajectory row (`engine-bridge.solveTrajectory` output)
 *  into the shared DOPE display fields. Pure — no store, no DOM. */
export function formatDopeRow(row: TrajectoryRow, ctx: DopeRowContext = {}): DopeRow {
  const machNumber =
    ctx.speedOfSoundMps && ctx.speedOfSoundMps > 0 ? row.velocityMps / ctx.speedOfSoundMps : undefined;
  return {
    rangeM: row.rangeM,
    rangeYd: metersToYards(row.rangeM),
    dropCm: metersToCentimeters(row.dropM),
    dropIn: metersToInches(row.dropM),
    dropMilMoa: asMilMoa(angleAtRange(row.dropM, row.rangeM)),
    windCm: metersToCentimeters(row.windageM),
    windIn: metersToInches(row.windageM),
    windMilMoa: asMilMoa(angleAtRange(row.windageM, row.rangeM)),
    velocityMps: row.velocityMps,
    velocityFps: mpsToFps(row.velocityMps),
    timeOfFlightS: row.timeOfFlightS,
    energyJ: row.energyJ,
    energyFtLb: joulesToFootPounds(row.energyJ),
    machNumber,
    transonic: machNumber === undefined ? undefined : transonicBand(machNumber),
  };
}

/** A come-up-table row plus whether it's past the cartridge's effective range. */
export interface ComeUpDisplayRow extends DopeRow {
  beyondEffective: boolean;
}

/**
 * Assemble the come-up reference table: map each candidate station onto its solved
 * row, formatted, tagged with its beyond-effective flag — stopping ONE ROW PAST the
 * transonic→subsonic wall (include the first subsonic station, then break) so the
 * table shows where the cartridge runs out without trailing off into deep-subsonic
 * lob. `ctx.speedOfSoundMps` must be supplied or nothing is classified as subsonic
 * and the table runs to the last station. Pure. */
export function assembleComeUp(
  solvedTable: readonly TrajectoryRow[],
  stations: readonly ComeUpStation[],
  ctx: DopeRowContext = {},
): ComeUpDisplayRow[] {
  const out: ComeUpDisplayRow[] = [];
  // Does this load have a supersonic phase AT ALL? Decided from the first row,
  // and it is what makes the trim below meaningful.
  //
  // The wall exists because a centrefire round going subsonic has reached the end
  // of its useful trajectory — there is nothing worth tabling past it. A RIMFIRE
  // round never had that phase: both catalog .22 LR loads leave the muzzle at
  // ~1060–1070 fps against a ~1118 fps speed of sound, i.e. subsonic by design,
  // which is exactly why match shooters buy them. Applying the wall to those
  // trimmed the card to a SINGLE ROW (owner, on device 2026-07-29) — the first
  // station is already subsonic, so it pushed one row and broke immediately.
  // That made the rimfire ladder useless for the one thing it exists to do.
  let startedSupersonic: boolean | undefined;
  for (const st of stations) {
    const r = nearestRow(solvedTable, st.stationM);
    if (!r) continue;
    const dr = formatDopeRow({ ...r, rangeM: st.stationM }, ctx);
    if (startedSupersonic === undefined) startedSupersonic = dr.transonic !== 'subsonic';
    out.push({ ...dr, beyondEffective: st.beyondEffective });
    // Include the first subsonic row, then stop — but only for a load that was
    // supersonic to begin with. With no speed of sound in `ctx` the band is
    // undefined, `startedSupersonic` is true and the break never fires, exactly
    // as before.
    if (startedSupersonic && dr.transonic === 'subsonic') break;
  }
  return out;
}
