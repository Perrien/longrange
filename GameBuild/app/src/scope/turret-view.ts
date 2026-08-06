// Turret-follows-view: the erector offset that makes turning a dial move the
// sight picture (plan `Design/Plans/dial-moves-view-plan.md`).
//
// On a real rifle clamped in a vise, turning the elevation turret UP tips the
// scope's erector tube up, so the sight line points DOWN relative to the bore —
// the crosshair walks down the target and the target appears to rise. The rifle
// has not moved, so the bullet still goes where it always would have; only when
// the shooter re-aims to put the crosshair back on the target does the barrel
// actually come up. That is the whole model here:
//
//     sight line = hold − sight offset
//
// Pure and framework-free (no THREE, no DOM, no React) so the sign conventions
// unit-test directly, matching `scope/scope-projection.ts`. `ScopeView` owns the
// hold angles and feeds the result to THREE; `sightLineDir` is the closed form of
// what THREE does with them, pinned to THREE itself by a parity test.
//
// All angles radians. The shot math (`game/shot.ts`) is deliberately untouched:
// rotating the sight line by the dial changes `aimError` by exactly minus the
// dial, so `applied = aimError + dial + playerZero` is unchanged and dialing
// alone cannot move an impact. `turret-view.test.ts` pins that invariant.

/** The erector's angular position relative to the bore: elevation up-positive,
 *  windage right-positive (the same sense as the store's turret values). */
export interface SightOffset {
  elevRad: number;
  windRad: number;
}

/** Time constant for the turret glide; ~3τ ≈ 80 ms to 95% of the step (owner
 *  decision 1, 2026-08-06 — a single 0.1 mil click at 10× is ~2% of screen
 *  height, and a hard cut is easy to miss). */
export const SIGHT_GLIDE_TAU_S = 0.027;

/** Snap threshold for the glide, rad — far below one click (0.1 mil = 1e-4 rad),
 *  so the eased value settles exactly instead of chasing its target forever. */
export const SIGHT_SNAP_EPS_RAD = 1e-9;

/**
 * The erector's angular position: the live turret plus whatever a Confirm Zero
 * folded into the rifle's stored zero.
 *
 * `playerZero` is included because confirming a zero is physically just
 * loosening the turret cap and re-indexing the ring to read zero — the erector
 * does not move. Leave it out and the sight picture would jump by the amount
 * just dialed at the exact moment the player presses Confirm Zero. It costs
 * nothing in shot math: `resolveShot` adds `playerZero` on the same side as
 * `dial`, so the cancellation above covers both terms identically.
 *
 * NEVER include the rifle's hidden bore/scope offset (`zeroOffsetRad`): it is
 * hidden truth (protocol §4.8) and reading it here would let a player see a
 * fresh rifle's exact misalignment on screen. It would also be wrong — that
 * offset is the *barrel* not pointing where the tube does, and the barrel is
 * not what the camera renders.
 */
export function sightOffset(
  scope: { elevationRad: number; windageRad: number },
  playerZero?: { elevationRad: number; windageRad: number } | null,
): SightOffset {
  return {
    elevRad: scope.elevationRad + (playerZero?.elevationRad ?? 0),
    windRad: scope.windageRad + (playerZero?.windageRad ?? 0),
  };
}

/**
 * Hold angles + erector offset → the two angles `ScopeView` feeds
 * `new THREE.Euler(-pitch, -yaw, 0, 'YXZ')`.
 *
 * The two axes take OPPOSITE signs, because the camera convention is not
 * symmetric: positive `pitch` looks DOWN while positive `yaw` looks RIGHT.
 * Rifle held still, player watching through the scope:
 *
 *   | You dial            | Sight line   | On screen the crosshair walks |
 *   |---------------------|--------------|-------------------------------|
 *   | Elevation UP    (+) | pitches down | DOWN  (the target rises)      |
 *   | Elevation DOWN  (−) | pitches up   | UP                            |
 *   | Windage RIGHT   (+) | yaws left    | LEFT                          |
 *   | Windage LEFT    (−) | yaws right   | RIGHT                         |
 *
 * So pitch ADDS the elevation offset and yaw SUBTRACTS the windage offset.
 */
export function sightAimAngles(
  holdPitchRad: number,
  holdYawRad: number,
  offset: SightOffset,
): { pitchRad: number; yawRad: number } {
  return {
    pitchRad: holdPitchRad + offset.elevRad,
    yawRad: holdYawRad - offset.windRad,
  };
}

/**
 * Unit sight-line direction for those angles — the closed form of applying
 * `Euler(−pitch, −yaw, 0, 'YXZ')` to the camera's forward vector `(0, 0, −1)`.
 *
 * Sanity: `pitch > 0` (looking down) gives `y < 0`; `yaw > 0` (looking right)
 * gives `x > 0`. Pinned against THREE itself in the tests so this and
 * `ScopeView.aimQuaternion` can never drift apart.
 */
export function sightLineDir(
  pitchRad: number,
  yawRad: number,
): { x: number; y: number; z: number } {
  const cp = Math.cos(pitchRad);
  return {
    x: cp * Math.sin(yawRad),
    y: -Math.sin(pitchRad),
    z: -cp * Math.cos(yawRad),
  };
}

/**
 * Frame-rate-independent exponential ease toward `target`, snapping once within
 * `SIGHT_SNAP_EPS_RAD`. The EASED value is the truth the camera renders and the
 * value every shot must resolve against — never recompute the target offset
 * inside the aim quaternion, or a shot fired mid-glide resolves against a
 * crosshair the player never saw.
 */
export function easeSightOffset(
  current: SightOffset,
  target: SightOffset,
  dtS: number,
  tauS: number = SIGHT_GLIDE_TAU_S,
): SightOffset {
  const k = 1 - Math.exp(-dtS / tauS);
  const step = (cur: number, to: number): number => {
    const next = cur + (to - cur) * k;
    return Math.abs(to - next) < SIGHT_SNAP_EPS_RAD ? to : next;
  };
  return {
    elevRad: step(current.elevRad, target.elevRad),
    windRad: step(current.windRad, target.windRad),
  };
}
