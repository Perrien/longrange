// Impact call (task 1.6c, step 1): describe a resolved shot's impact relative
// to the engaged plate's centre as a clock-face call ("high-right, 1–2
// o'clock") — the kind of call a spotter would make. Pure geometry so the
// clock math stays out of ScopeView's JSX (execution-protocol §4.4 spirit:
// keep angle/length math in tested modules, not inline in components).
//
// The plate centre is passed in explicitly (not read from the store) so this
// stays pure and reusable — the caller decides which plate to call against
// (the committed target once 1.6c2 lands; the aimed plate in the meantime).

import { radToDeg, degToClock } from '../units/angle';
import { metersToMillimeters, metersToInches } from '../units/length';
import type { ShotResult } from './shot';
import type { PlanePoint } from './firing-solution';

export interface ImpactCall {
  /** Whether the shot struck the plate it was called against (mirrors `ShotResult.hitPlateId != null`
   *  when the caller passes the hit plate's own centre; a miss on a rack still gets a directional call
   *  relative to whichever plate centre the caller supplies). */
  hit: boolean;
  /** Clock position (1–12) of the impact relative to the plate centre, viewed face-on
   *  (12 = up, 3 = right, 6 = down, 9 = left — matches the wind-dial convention in `units/angle`). */
  clock: number;
  /** Offset from plate centre, formatted for display (both units, e.g. "38 mm / 1.5 in"). */
  distanceLabel: string;
}

/** Round a fractional clock position (0–12) to a whole hour, wrapping 0 to 12. */
function roundClock(clock: number): number {
  const rounded = Math.round(clock);
  return rounded === 0 ? 12 : rounded;
}

/**
 * Call a resolved shot against a plate centre: hit/miss plus the clock-face
 * direction and linear distance of the impact from that centre.
 *
 * `plateCenter` is the world x/y of the plate the call is made against (the
 * committed target, or — before a target is committed — the plate the shot
 * was aimed at). A dead-centre impact (offset ~0) reports clock 12 by
 * convention rather than an undefined direction.
 */
export function callImpact(result: ShotResult, plateCenter: PlanePoint): ImpactCall {
  const dx = result.impact.x - plateCenter.x;
  const dy = result.impact.y - plateCenter.y;
  const offsetM = Math.hypot(dx, dy);

  const clock = offsetM < 1e-6 ? 12 : roundClock(degToClock(radToDeg(Math.atan2(dx, dy))));

  const mm = metersToMillimeters(offsetM);
  const inch = metersToInches(offsetM);
  const distanceLabel = `${mm.toFixed(0)} mm / ${inch.toFixed(1)} in`;

  return { hit: result.hitPlateId != null, clock, distanceLabel };
}
