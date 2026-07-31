// Which target is the crosshair on? (extracted 2026-07-27 from ScopeView's
// `findAimed`, so the rule is testable rather than buried in an effect.)
//
// Pure — no THREE, no DOM.
//
// THE RULE IS ANGULAR, AND THAT IS THE WHOLE POINT. The original compared the
// LINEAR miss at each plate's own distance, which is systematically biased toward
// near plates: the same angular error subtends more metres the further out you go.
//
// Found on the ELR probe. Dialled onto the 1000 m gong and holding 8 MIL for the
// 1500 m one, the linear rule scored:
//
//     500 m plate  → 11.38 m   ← picked (wrong)
//    1500 m plate  → 12.00 m
//
// so the shot resolved against the 500 m plate, the impact landed 5.5 m above the
// ground on the z = −500 plane, and — being above ground, so ScopeView's
// project-onto-the-dirt fallback never ran — the dust puff hung in mid-air. In
// angle the same shot reads 22.8 mrad and 8.0 mrad, picking the 1500 m plate,
// which is what a shooter would say and what the ballistics then solve for.
//
// The bias was present on every range; only an ELR holdover made it large enough
// to see. Where candidate plates sit at similar distances the two rankings agree,
// so near-field behaviour is unchanged.

export interface AimPoint {
  x: number;
  y: number;
}

export interface AimablePlate {
  distanceM: number;
  position: AimPoint;
  /** Plate diameter (m), used to size the "the crosshair is ON this one" test in
   *  `resolveTargetPlate`. Optional so callers that only need `pickAimedPlate`
   *  need not supply it. */
  diameterM?: number;
  /** Plate HEIGHT (m). Omitted ⇒ `diameterM`, i.e. round or square — which is every
   *  plate on every range before the target system. A tall silhouette must supply it,
   *  or the "crosshair is on it" test only covers a disc of its width and its head
   *  becomes unselectable (see `crosshairIsOnPlate`). */
  heightM?: number;
  /** Instance id, matched against the committed target. */
  instanceId?: number;
}

/**
 * How close the crosshair must come to a DIFFERENT plate before it steals the
 * engagement from the committed one, as a multiple of that plate's angular radius.
 *
 * 2× radius means "the crosshair is on it, or just off its edge".
 */
export const SWITCH_RADII = 2;

/**
 * Floor on that test (rad). Constant-angular gongs are 1 MIL across, so 2× radius
 * is only 1 mrad — fine, but Range A's small near plates subtend far less and would
 * become fiddly to select without a floor.
 */
export const SWITCH_FLOOR_RAD = 1.5e-3;

export interface AimDirection {
  x: number;
  y: number;
  z: number;
}

/** Where the aim ray crosses the vertical plane at `distanceM` downrange. */
export function rayPointAtDistance(
  eye: AimPoint,
  dir: AimDirection,
  distanceM: number,
): AimPoint {
  const t = -distanceM / dir.z;
  return { x: eye.x + dir.x * t, y: eye.y + dir.y * t };
}

/** Angular distance (radians) from the aim ray to a plate's centre, measured at
 *  that plate's range. This is the quantity "nearest the crosshair" means. */
export function angularMissRad(eye: AimPoint, dir: AimDirection, plate: AimablePlate): number {
  const p = rayPointAtDistance(eye, dir, plate.distanceM);
  return Math.hypot(p.x - plate.position.x, p.y - plate.position.y) / plate.distanceM;
}

/**
 * The plate the crosshair is nearest, or null when the ray is not pointing
 * downrange (`dir.z >= 0`) or there is nothing to shoot at.
 *
 * Ties resolve to the FIRST plate in the list, which keeps the pick stable frame
 * to frame rather than flickering between two equally-close targets.
 */
export function pickAimedPlate<T extends AimablePlate>(
  eye: AimPoint,
  dir: AimDirection,
  plates: readonly T[],
): T | null {
  if (dir.z >= -1e-3 || plates.length === 0) return null;
  let best = plates[0];
  let bestMiss = Number.POSITIVE_INFINITY;
  for (const plate of plates) {
    const miss = angularMissRad(eye, dir, plate);
    if (miss < bestMiss) {
      bestMiss = miss;
      best = plate;
    }
  }
  return best;
}

/** How close the crosshair must get to `plate` to claim the engagement (rad).
 *
 *  Isotropic — the round-plate case, and the horizontal component of the general one. */
export function switchThresholdRad(plate: AimablePlate): number {
  const angularRadius = plate.diameterM ? plate.diameterM / 2 / plate.distanceM : 0;
  return Math.max(SWITCH_RADII * angularRadius, SWITCH_FLOOR_RAD);
}

/**
 * Is the crosshair ON this plate, allowing for its actual SHAPE?
 *
 * THE BUG THIS FIXES (owner, on device 2026-07-31): "on the poppers the bottom and
 * middle circle accept hits and fall but the head area doesn't. Shots pass clean
 * through them." The switch test sized itself off `diameterM` alone — a CIRCLE of the
 * plate's width. That is right for every round plate, but a 42″ popper is 3.5× taller
 * than wide: its head sits 11.7 mrad above centre while 2× its angular *width* radius
 * is only 6.7 mrad. So aiming at the head never met the threshold, the auto-committed
 * gong kept the engagement, the shot resolved on the gong's plane, and the popper was
 * never hit-tested at all.
 *
 * The test is therefore ELLIPTICAL: the miss is normalised by the plate's own angular
 * half-extent on each axis. For a round plate (`heightM` omitted or equal to
 * `diameterM`) both denominators collapse to `switchThresholdRad`, so this reduces to
 * the previous circular test EXACTLY — every shipped range is unchanged.
 */
export function crosshairIsOnPlate(
  eye: AimPoint,
  dir: AimDirection,
  plate: AimablePlate,
): boolean {
  const p = rayPointAtDistance(eye, dir, plate.distanceM);
  const dxRad = Math.abs(p.x - plate.position.x) / plate.distanceM;
  const dyRad = Math.abs(p.y - plate.position.y) / plate.distanceM;
  const halfW = (plate.diameterM ?? 0) / 2;
  const halfH = (plate.heightM ?? plate.diameterM ?? 0) / 2;
  const xLimit = Math.max((SWITCH_RADII * halfW) / plate.distanceM, SWITCH_FLOOR_RAD);
  const yLimit = Math.max((SWITCH_RADII * halfH) / plate.distanceM, SWITCH_FLOOR_RAD);
  return Math.hypot(dxRad / xLimit, dyRad / yLimit) <= 1;
}

/**
 * Which plate this shot is against — COMMIT-PREFERRED (owner, 2026-07-27).
 *
 * `pickAimedPlate` alone cannot answer this, and no distance metric can. Holdover
 * and wind hold *deliberately* put the crosshair off the target, so "nearest the
 * crosshair" answers "what am I pointing at" when the question is "what am I
 * shooting at". Measured on the probe: engaging the 1000 m gong with 6 MIL of
 * elevation and 6 MIL of wind hold, the nearest-by-angle plate is the 1500 m one.
 * Windage is what does it — the stations are stacked vertically but fanned
 * laterally, so holding into wind walks the crosshair toward a neighbour's bearing.
 *
 * So: **once a target is committed, it keeps the engagement until the crosshair is
 * actually ON a different one.**
 *
 * WHY A "ON ANOTHER PLATE" TEST AND NOT A CONE. A cone wide enough to survive a
 * 12 MIL hold would be ~15 mrad, but adjacent probe stations are only 5–10 mrad
 * apart — such a cone would swallow the neighbour and make switching impossible.
 * Sizing the test off the *candidate's own angular size* has no such conflict: a
 * hold of any magnitude keeps the commitment (the crosshair is nowhere near another
 * plate), while deliberately putting the crosshair on a different plate switches
 * immediately. That is exactly "swing around and shoot whatever" up close, and
 * "declare your target" once you are holding for distance.
 *
 * With nothing committed it degrades to `pickAimedPlate`, so casual play is
 * unchanged and no range needs a commit step it did not have before.
 *
 * KNOWN LIMIT, accepted (owner, 2026-07-27): a very large PURE-windage hold can
 * still park the crosshair on a neighbouring plate, which then takes the
 * engagement. Elevation hold never can — every gong centre is at the same height,
 * so holding up moves away from all of them at once — and any elevation at all
 * breaks the coincidence. Parked rather than solved (it was found on a range with
 * wind switched off); if it ever bites, the fix is a switch threshold that shrinks
 * as applied hold grows, not a wider one.
 */
export function resolveTargetPlate<T extends AimablePlate>(
  eye: AimPoint,
  dir: AimDirection,
  plates: readonly T[],
  committedInstanceId: number | null | undefined,
): T | null {
  if (dir.z >= -1e-3 || plates.length === 0) return null;

  const committed =
    committedInstanceId == null
      ? undefined
      : plates.find((p) => p.instanceId === committedInstanceId);
  if (!committed) return pickAimedPlate(eye, dir, plates);

  // Is the crosshair sitting on some OTHER plate? Take the closest such candidate,
  // so overlapping targets resolve to the one actually under the crosshair.
  let claimant: T | undefined;
  let claimantMiss = Number.POSITIVE_INFINITY;
  for (const plate of plates) {
    if (plate === committed) continue;
    if (!crosshairIsOnPlate(eye, dir, plate)) continue;
    // Rank surviving claimants by angular miss to centre, so overlapping targets
    // resolve to the one actually under the crosshair.
    const miss = angularMissRad(eye, dir, plate);
    if (miss < claimantMiss) {
      claimantMiss = miss;
      claimant = plate;
    }
  }
  return claimant ?? committed;
}
