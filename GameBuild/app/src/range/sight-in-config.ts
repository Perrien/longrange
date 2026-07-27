// Sight-in range layout (task 2.3c, D3/D4/D7). Pure config: given the entry-time
// unit system, produce the fixed physical layout of the sight-in bay — three
// immobile paper targets at 50 / 100 / 200 (in the active unit), the per-variant
// target size + art variant, rack height, ground + backstop dims.
//
// D3 (entry snapshot): the whole layout — including the ART VARIANT and TARGET
// SIZE — is fixed by the unit system at range entry. A later `unitsPrimary` flip
// mid-session must NOT move or resize a target; it only re-labels come-up display.
// So the caller snapshots ONCE on entry (`snapshotSightIn`) and holds the result;
// this is a pure value function, so a flip simply produces a *new* snapshot the
// next time the player walks onto the range.
//
// Stations come from the range registry (`ranges.ts`) so the 50/100/200 +
// left/centre/right layout is single-sourced. All output is SI (m); no unit math
// lives in the scene/components (guardrail §4.4).
import { getRangeDefinition } from './ranges';
import { yardsToMeters } from '../units/length';
import { moaToRad } from '../units/angle';
import type { DisplayUnits } from '../units/display';

/** MIL travels with metric (m), MOA with imperial (yd) — the units/display
 *  pairing. The sight-in bay reads its stations in the active unit. */
export type SightInUnitSystem = 'metric' | 'imperial';

/**
 * Target face sizes — sized so ONE GRID SQUARE IS EXACTLY ONE ANGULAR UNIT at the
 * face's design distance. Both faces are a 22-cell grid (1-cell border + 20).
 *
 * MIL is exact for free: 44 cm / 22 = 2 cm per cell, and 1 mil at 100 m is 10 cm
 * BY DEFINITION, so a cell is exactly 0.2 mil.
 *
 * MOA is NOT free, and the original 22 in face got it wrong (owner, on device
 * 2026-07-26: "at MOA they're off... not by a lot but definitely off"). A 22 in
 * face gives 1 in per cell, which relies on the shooter's shorthand that an inch
 * equals a MOA at 100 yd. It does not: 1 MOA at 100 yd is 1.0472 in, so an inch
 * is only 0.9549 MOA. Each cell was 4.5% small, and the error ACCUMULATES — by
 * the reticle's 10 MOA mark the grid had drifted almost half a MOA, which is
 * exactly the widening mismatch visible in the scope.
 *
 * So the MOA face is derived rather than authored: 22 cells x (100 yd x 1 MOA).
 * That is 23.04 in, not 22 in — and it is the MORE physically correct target,
 * since real "true MOA" targets are printed with 1.047 in squares for precisely
 * this reason.
 */
export const MOA_TARGET_SIZE_M = 22 * yardsToMeters(100) * moaToRad(1); // 0.58517 m = 23.04 in
export const MIL_TARGET_SIZE_M = 0.44; // 44 cm -> 2 cm cells -> exactly 0.2 mil at 100 m

/** Lateral spacing of the three targets from bore centre (m). Kept tight so all
 *  three sit within a low-magnification view and are easy to put under the
 *  crosshair (owner feedback 2026-07-19: wide spacing made it easy to fire at
 *  empty dirt). 50 sits left, 100 centre, 200 right (D4). */
export const LATERAL_OFFSET_M = 1.5;

/** Target CENTRE height above the ground (m) — the ~1 yd/m rack (D4). */
export const TARGET_CENTER_Y_M = 1.0;

export interface SightInStation {
  /** Distance downrange in SI meters (the fixed physical fact). */
  distanceM: number;
  /** Nominal distance in the active unit (50/100/200) — for HUD labels. */
  nominalDistance: number;
  /** Lateral world X of the target centre (m); − left, + right. */
  xOffsetM: number;
  /** Registry side hint this came from (−1/0/+1). */
  side: -1 | 0 | 1;
}

export interface SightInLayout {
  system: SightInUnitSystem;
  /** Which delivered art file to raster (`zeroing-target-<variant>.svg`). */
  artVariant: 'moa' | 'mil';
  /** Physical square side of the target face (m), per variant (D7). */
  targetSizeM: number;
  /** Target CENTRE height above ground (m). */
  targetCenterYM: number;
  stations: SightInStation[];
  ground: { widthM: number; lengthM: number };
  /** A simple immobile backstop panel behind each target (no berm system, D4). */
  backstop: { widthM: number; heightM: number };
}

/**
 * Snapshot the sight-in layout for the active unit system (D3). Call ONCE on
 * range entry and hold the result; a later `unitsPrimary` flip does not mutate a
 * held snapshot (it only produces a new one on the next entry).
 */
export function snapshotSightIn(unitsPrimary: DisplayUnits): SightInLayout {
  const metric = unitsPrimary === 'MIL';
  const targetSizeM = metric ? MIL_TARGET_SIZE_M : MOA_TARGET_SIZE_M;
  // Nominal distance (in the active unit) → SI meters.
  const toSI = (nominal: number) => (metric ? nominal : yardsToMeters(nominal));

  const stations: SightInStation[] = getRangeDefinition('sight-in').stations.map((s) => ({
    distanceM: toSI(s.nominalDistance),
    nominalDistance: s.nominalDistance,
    xOffsetM: s.side * LATERAL_OFFSET_M,
    side: s.side,
  }));

  const maxDistanceM = Math.max(...stations.map((s) => s.distanceM));
  return {
    system: metric ? 'metric' : 'imperial',
    artVariant: metric ? 'mil' : 'moa',
    targetSizeM,
    targetCenterYM: TARGET_CENTER_Y_M,
    stations,
    ground: { widthM: 2 * LATERAL_OFFSET_M + 20, lengthM: maxDistanceM + 20 },
    backstop: { widthM: targetSizeM * 1.8, heightM: targetSizeM * 1.8 },
  };
}
