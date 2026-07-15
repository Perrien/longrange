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
import type { TrajectoryRow } from '../engine-bridge/types';

/** Small-angle-free correction angle (rad) subtended at the shooter for a
 *  linear offset (drop or windage) at a given range — `atan2`, not the
 *  linearized mil-relation, so it stays exact at close range too. */
export const angleAtRange = (offsetM: number, rangeM: number): number => Math.atan2(offsetM, rangeM);

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
}

/** Format one solved trajectory row (`engine-bridge.solveTrajectory` output)
 *  into the shared DOPE display fields. Pure — no store, no DOM. */
export function formatDopeRow(row: TrajectoryRow): DopeRow {
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
  };
}
