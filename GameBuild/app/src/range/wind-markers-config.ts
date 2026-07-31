// Wind marker (flag/sock) placement config (task 1.7b; per-range ladders added
// wind-system-btk-port W1). Pure data — no THREE, no DOM — mirroring
// range-a-config.ts so the scene builder (scope/WindMarkers.ts) and its test
// both consume/verify the same authored positions.
//
// Placement rule (plan 1.7b step 1): ~5–6 markers down the lane, offset to the
// side so they never sit in front of (occlude) a farther plate row. Rather than
// solving a per-distance fan like the racks (that fan exists because rack PLATES
// themselves must clear each other's berms), markers just need one constant
// lateral offset large enough to clear every rack/gong at every distance —
// solved offline per ladder (see the occlusion regression tests, which pin the
// same ray-projection check `range-a-config.test.ts` / `elr-range-config.ts`
// use for berms/trees) at a generous constant. Change a rack/station ladder and
// that test forces a re-check of its ladder's offset constant.
//
// Markers are per RANGE, not global (wind-system-btk-port W1, fixing a live bug:
// the ELR range used to inherit Range A's flat `groundYM: 0` markers, planting
// them buried in its sloped hillside — see the plan's P5/P6).

import { yardsToMeters } from '../units';
import { groundY as elrGroundY } from './elr-range-config';

export type MarkerStyle = 'flag' | 'sock' | 'both';

/** Which per-range marker ladder to plant. `null` = no markers on this range. */
export type WindMarkerSetId = 'range-a' | 'elr';

/** One wind marker (flag/sock) planted beside the lane at a fixed distance. */
export interface WindMarkerSpec {
  /** Stable id, e.g. "wind-marker-300". */
  id: string;
  /** Distance downrange, whole yards (Range A) or metres (ELR) — the label
   *  unit; matches a rack/station distance on that range's ladder. */
  distanceYards: number;
  /** Distance downrange, metres. */
  distanceM: number;
  /** Lateral offset from the firing line, metres (+ = right). */
  xOffsetM: number;
  /** Pole height, metres (ground → top mount point). */
  poleHeightM: number;
  /** Local ground height AT THIS MARKER's distance, metres — the terrain the
   *  marker is planted ON (0 on Range A's flat strip; the ELR slope elsewhere).
   *  The renderer's root position is `(xOffsetM, groundYM, -distanceM)`. */
  groundYM: number;
}

/** Pole height, metres. BTK's own dimension (D1, wind-system-btk-port): a 3 yd
 *  pole — copied now (not deferred to the W2 visual-config port) because the
 *  occlusion offsets below are solved against it; changing it later requires
 *  re-solving both ladders' offsets, same discipline as the offsets themselves. */
export const MARKER_POLE_HEIGHT_M = yardsToMeters(3);

// --- Range A ladder ----------------------------------------------------------

/** Five markers, matching five of the ten rack distances (plan: "e.g. 100/200/
 *  300/400/500 yd"). */
const RANGE_A_MARKER_DISTANCES_YARDS = [100, 200, 300, 400, 500] as const;

/** Constant lateral offset, yards (+ = right of the firing line). RE-SOLVED
 *  wind-system-btk-port W1 (P11) under D1's bigger pole/flag geometry — the old
 *  9 yd (solved for a 0.15 m swept radius) no longer clears: a ~2.0 m swept
 *  radius (2.74 m pole + 1.83 m flag reach) fails from 9 up to 10 yd and only
 *  clears again at 10.5 yd. 12 yd sits mid-band (10.5–30+ yd all clear) rather
 *  than right on the new edge. See the regression test in
 *  wind-markers-config.test.ts. */
export const MARKER_OFFSET_YARDS = 12;

export const RANGE_A_WIND_MARKERS: readonly WindMarkerSpec[] = RANGE_A_MARKER_DISTANCES_YARDS.map(
  (yards) => ({
    id: `wind-marker-${yards}`,
    distanceYards: yards,
    distanceM: yardsToMeters(yards),
    xOffsetM: yardsToMeters(MARKER_OFFSET_YARDS),
    poleHeightM: MARKER_POLE_HEIGHT_M,
    groundYM: 0,
  }),
);

// --- ELR ladder ----------------------------------------------------------------

/** Six markers, a subset of the high line's 8-station ladder (250/500/750/
 *  1000/1500/2000 m — skips 1250/1750), planted on the sloped terrain. Solved
 *  offline (wind-system-btk-port W1, P11): brute-forced against the ACTUAL
 *  solved station layout for both the low and high firing points (constant
 *  lateral offset, no candidate from 5–15 yd blocks a farther station's gong
 *  from either eye — 9 yd sits mid-band, well clear of the 15.5 yd failure
 *  edge). See PROGRESS.md for the scratch-script method (never left in
 *  GameBuild — 1.7b/P11 discipline). */
const ELR_MARKER_DISTANCES_M = [250, 500, 750, 1000, 1500, 2000] as const;

/** Constant lateral offset, yards (+ = right of the firing line), for the ELR
 *  ladder. Distinct from Range A's — solved independently, not assumed to
 *  transfer (D1/P11). */
export const ELR_MARKER_OFFSET_YARDS = 9;

export const ELR_WIND_MARKERS: readonly WindMarkerSpec[] = ELR_MARKER_DISTANCES_M.map((m) => ({
  id: `wind-marker-${m}`,
  distanceYards: m, // ELR is metric-native; this field is metres here, matching the station label.
  distanceM: m,
  xOffsetM: yardsToMeters(ELR_MARKER_OFFSET_YARDS),
  poleHeightM: MARKER_POLE_HEIGHT_M,
  groundYM: elrGroundY(m),
}));

/** Resolve a range's marker ladder by id. */
export function windMarkersFor(id: WindMarkerSetId | null): readonly WindMarkerSpec[] {
  if (id === 'range-a') return RANGE_A_WIND_MARKERS;
  if (id === 'elr') return ELR_WIND_MARKERS;
  return [];
}

/** Default marker style (plan 1.7b step 1: "owner picks flags vs socks vs
 *  both... defaulting to flags"). */
export const DEFAULT_MARKER_STYLE: MarkerStyle = 'flag';
