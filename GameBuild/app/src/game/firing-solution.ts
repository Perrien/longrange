// Pure firing-solution math (task 1.4b). No engine, no THREE, no React — just the
// geometry that turns a solved trajectory + the player's dial/hold/aim into where
// the group centers at the target plane, and whether a point falls on a plate.
//
// Architecture (build-plan-approved): "engine scatter + TS deterministic center".
// The engine's MatchSimulator supplies per-shot SCATTER about center; these
// functions supply the deterministic CENTER (from dial/hold/aim vs the required
// firing solution and the mean wind) and the plate hit test. 1.4c composes them.
//
// Coordinate convention (matches the engine + scene): +x right, +y up, target
// R metres downrange at z = -R. All SI (m, rad).
import type { WindVec } from '../engine-bridge/types';

/** An angular correction pair (rad): elevation up-positive, windage right-positive. */
export interface Correction {
  elevRad: number;
  windRad: number;
}

/** A point on the target plane (m): +x right, +y up. */
export interface PlanePoint {
  x: number;
  y: number;
}

/**
 * Convert a session wind (speed + clock direction it blows FROM) to the engine's
 * "blowing toward" Cartesian vector. `directionDeg` is clockwise from downrange
 * (0 = 12 o'clock = downrange). Verified against the loads.json fixture: a wind
 * FROM 9 o'clock (270°) → +x (left-to-right), z = 0.
 */
export function windToVec(speedMps: number, directionDeg: number): WindVec {
  const rad = (directionDeg * Math.PI) / 180;
  return {
    x: -speedMps * Math.sin(rad), // from 3 o'clock → -x; from 9 → +x
    y: 0, // no vertical wind in Increment 1
    z: speedMps * Math.cos(rad), // from 12 → +z (headwind); from 6 → -z (tailwind)
  };
}

/**
 * The correction the player must apply to hit the target center, derived from the
 * trajectory's position relative to the sight line at range R. `dropM` is the
 * bullet's vertical position (negative = below the line of sight); `windageM` is
 * its horizontal position (+x = right, from wind + spin drift). To center the
 * shot the player must come UP by -dropM/R and correct the drift by -windageM/R.
 */
export function requiredCorrectionRad(dropM: number, windageM: number, rangeM: number): Correction {
  return {
    elevRad: Math.atan2(-dropM, rangeM), // drop below → positive come-up
    windRad: Math.atan2(-windageM, rangeM), // drift right → negative (hold/dial left)
  };
}

/**
 * The group center's offset from the target center at the target plane, given the
 * correction the player actually applied (dialed turret + reticle/aim hold) versus
 * the required correction. Exact (uses tan on each leg, not the small-angle
 * difference): when applied === required the offset is {0, 0} — a correct solution
 * with a centered aim groups on center.
 */
export function centerOffsetM(applied: Correction, required: Correction, rangeM: number): PlanePoint {
  return {
    x: rangeM * (Math.tan(applied.windRad) - Math.tan(required.windRad)),
    y: rangeM * (Math.tan(applied.elevRad) - Math.tan(required.elevRad)),
  };
}

/**
 * Whether an impact point falls on a circular steel plate. Coplanar plane test
 * (all plates in a rack share z = -R, and the impact is computed on that plane).
 * The bullet radius is added to the plate radius so an edge graze counts, matching
 * the engine's Target::scoreHit line-breaking convention. `impact` and
 * `plateCenter` must be expressed in the same frame.
 */
export function discHit(
  impact: PlanePoint,
  plateCenter: PlanePoint,
  plateDiameterM: number,
  bulletDiameterM: number,
): boolean {
  const dx = impact.x - plateCenter.x;
  const dy = impact.y - plateCenter.y;
  const r = plateDiameterM / 2 + bulletDiameterM / 2;
  return dx * dx + dy * dy <= r * r;
}
