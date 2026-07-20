// Shot resolution (task 1.4c): compose the deterministic center (1.4b) with the
// engine scatter (1.4a) into a single impact on the target plane, and decide
// hit/miss against the rack's steel. Pure and framework-free so it unit-tests
// without React/THREE; ScopeView gathers the inputs (aim ray, dial, solve,
// scatter, plates) and calls resolveShot, then records the result.
//
// "Hold" is not a separate input: the reticle is screen-fixed, so the player
// holds over/into-wind by pointing the whole scope — the crosshair's aim
// direction relative to the target plate IS the hold, and it flows in via aimDir.
import type { ScatterShot } from '../engine-bridge/types';
import {
  centerOffsetM,
  discHit,
  requiredCorrectionRad,
  type Correction,
  type PlanePoint,
} from './firing-solution';

/** A minimal plate: its world centre on the rack plane and its diameter. */
export interface ShotPlate {
  instanceId: number;
  position: PlanePoint; // world x,y at the rack plane (z = -distanceM)
  diameterM: number;
}

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

export interface ShotResult {
  /** Impact point on the target plane (world x,y). */
  impact: PlanePoint;
  /** Downrange distance of the target plane (m). */
  distanceM: number;
  /** instanceId of the plate hit, or null for a miss. */
  hitPlateId: number | null;
  /** instanceId of the plate the shot was aimed at (nearest the crosshair). */
  aimedPlateId: number | null;
}

export interface ResolveShotParams {
  /** Eye/muzzle position (world m); shooter at origin, eye at ~1.6 m. */
  eye: Vec3;
  /** Sight-line forward direction at trigger break; z must be < 0 (downrange). */
  aimDir: Vec3;
  /** Dialed turret correction (elevation up, windage right), rad. */
  dial: Correction;
  /** Trajectory at distanceM (zeroed at the scope zero, with the mean wind). */
  solve: { dropM: number; windageM: number };
  /** Target-plane downrange distance (m). */
  distanceM: number;
  /** One sampled dispersion offset from the engine hit-sim (m about center). */
  scatter: ScatterShot;
  /** Plates in the target rack (coplanar at distanceM). */
  plates: ShotPlate[];
  bulletDiameterM: number;
  /** The rifle's hidden bore/scope zero offset (rad): h = windage, v = elevation
   *  (task 2.3b, D6). Extra correction the player must supply — a fresh rifle has
   *  a non-zero offset and so misses until zeroed. Defaults to {0,0} (Increment-1
   *  box-true behaviour: a "provided zero" rifle). Arrives as a plain number pair
   *  from `engine-bridge/gear-solve`; never rendered (§4.8). */
  zeroOffsetRad?: { h: number; v: number };
  /** The player's confirmed zero correction (rad), a stored baseline added to
   *  whatever the player dials/holds (task 2.3b, D6). Defaults to {0,0} (no zero
   *  stored yet). After zeroing this cancels the bore offset at all ranges. */
  playerZero?: { elevationRad: number; windageRad: number };
}

function nearestPlate(pt: PlanePoint, plates: ShotPlate[]): ShotPlate | null {
  let best: ShotPlate | null = null;
  let bestD = Infinity;
  for (const plate of plates) {
    const d = Math.hypot(pt.x - plate.position.x, pt.y - plate.position.y);
    if (d < bestD) {
      bestD = d;
      best = plate;
    }
  }
  return best;
}

/**
 * Resolve one shot to an impact point + hit/miss. The group centers where the
 * player's applied correction (dialed turret + aim-as-hold) meets the required
 * firing solution; the engine scatter is added about that center.
 */
export function resolveShot(p: ResolveShotParams): ShotResult {
  // Where the crosshair (sight line) crosses the target plane z = -distanceM.
  const t = -p.distanceM / p.aimDir.z; // aimDir.z < 0 → t > 0
  const crosshair: PlanePoint = {
    x: p.eye.x + p.aimDir.x * t,
    y: p.eye.y + p.aimDir.y * t,
  };

  // Aimed plate = the plate the crosshair is nearest; it defines the intended
  // point of aim. Falls back to the crosshair itself if the rack is empty.
  const aimed = nearestPlate(crosshair, p.plates);
  const center: PlanePoint = aimed ? aimed.position : crosshair;

  // Aim-as-hold: the crosshair's angular offset from the aimed plate's center.
  const aimError: Correction = {
    elevRad: Math.atan2(crosshair.y - center.y, p.distanceM),
    windRad: Math.atan2(crosshair.x - center.x, p.distanceM),
  };
  // applied = aim + dial + stored player zero (the zero baseline adds to what the
  // player applies this shot); requiredEff = trajectory correction + the rifle's
  // bore/scope zero offset (the offset is extra correction the shot needs). D6.
  const playerZero = p.playerZero ?? { elevationRad: 0, windageRad: 0 };
  const zeroOffset = p.zeroOffsetRad ?? { h: 0, v: 0 };
  const applied: Correction = {
    elevRad: aimError.elevRad + p.dial.elevRad + playerZero.elevationRad,
    windRad: aimError.windRad + p.dial.windRad + playerZero.windageRad,
  };
  const required = requiredCorrectionRad(p.solve.dropM, p.solve.windageM, p.distanceM);
  const requiredEff: Correction = {
    elevRad: required.elevRad + zeroOffset.v,
    windRad: required.windRad + zeroOffset.h,
  };
  const offset = centerOffsetM(applied, requiredEff, p.distanceM);

  const impact: PlanePoint = {
    x: center.x + offset.x + p.scatter.x,
    y: center.y + offset.y + p.scatter.y,
  };

  // A wide shot can catch a neighbouring plate, so test the whole rack.
  let hit: ShotPlate | null = null;
  for (const plate of p.plates) {
    if (discHit(impact, plate.position, plate.diameterM, p.bulletDiameterM)) {
      hit = plate;
      break;
    }
  }

  return {
    impact,
    distanceM: p.distanceM,
    hitPlateId: hit ? hit.instanceId : null,
    aimedPlateId: aimed ? aimed.instanceId : null,
  };
}
