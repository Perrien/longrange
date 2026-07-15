// Wind marker (flag/sock) placement config (task 1.7b). Pure data — no THREE,
// no DOM — mirroring range-a-config.ts so the scene builder (scope/WindMarkers.ts)
// and its test both consume/verify the same authored positions.
//
// Placement rule (plan 1.7b step 1): ~5–6 markers down the lane, offset to the
// side so they never sit in front of (occlude) a farther plate row. Rather than
// solving a per-distance fan like the racks (that fan exists because rack PLATES
// themselves must clear each other's berms), markers just need one constant
// lateral offset large enough to clear every rack at every distance — solved
// offline (see the occlusion regression test below, which pins the same
// ray-projection check `range-a-config.test.ts` uses for berms) at a generous
// +9 yd (right of the lane). Change the rack ladder and that test forces a
// re-check of this constant, same discipline as `X_OFFSET_YARDS`.

import { yardsToMeters } from '../units';

export type MarkerStyle = 'flag' | 'sock' | 'both';

/** One wind marker (flag/sock) planted beside the lane at a fixed distance. */
export interface WindMarkerSpec {
  /** Stable id, e.g. "wind-marker-300". */
  id: string;
  /** Distance downrange, whole yards (matches a rack distance — the marker
   *  sits beside that rack, not in front of it). */
  distanceYards: number;
  /** Distance downrange, metres. */
  distanceM: number;
  /** Lateral offset from the firing line, metres (+ = right). */
  xOffsetM: number;
  /** Pole height, metres (ground → top mount point). */
  poleHeightM: number;
}

/** Five markers, matching five of the ten rack distances (plan: "e.g. 100/200/
 *  300/400/500 yd"). */
const MARKER_DISTANCES_YARDS = [100, 200, 300, 400, 500] as const;

/** Constant lateral offset, yards (+ = right of the firing line). Solved
 *  offline against every rack's plate footprint (occlusion + physical-overlap
 *  checks) — see the regression test in wind-markers-config.test.ts. */
export const MARKER_OFFSET_YARDS = 9;

/** Pole height, metres — tall enough to read against the sky/backdrop from a
 *  distance, short enough to stay a background prop, not a target. */
export const MARKER_POLE_HEIGHT_M = 2.2;

export const WIND_MARKERS: readonly WindMarkerSpec[] = MARKER_DISTANCES_YARDS.map((yards) => ({
  id: `wind-marker-${yards}`,
  distanceYards: yards,
  distanceM: yardsToMeters(yards),
  xOffsetM: yardsToMeters(MARKER_OFFSET_YARDS),
  poleHeightM: MARKER_POLE_HEIGHT_M,
}));

/** Default marker style (plan 1.7b step 1: "owner picks flags vs socks vs
 *  both... defaulting to flags"). */
export const DEFAULT_MARKER_STYLE: MarkerStyle = 'flag';
