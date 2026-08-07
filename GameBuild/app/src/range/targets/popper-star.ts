// The popper star — a rotating 5-arm carrier with fold-back plates and a hub reset
// switch (`Design/Plans/popper-star.md`).
//
// A SIMPLIFIED Texas star. The real thing drops its plates out of a cradle, and the
// lost mass unbalances the wheel so it accelerates; the owner asked for "a bit more
// basic" (plan §8), so this is a constant-rate motor carrying plates that FOLD BACK
// on a hinge and latch there until the hub plate is shot.
//
// ── WHAT IS ACTUALLY NEW HERE ─────────────────────────────────────────────────────
// The fall is not new: `targets/knockdown.ts` already integrates a rod pivoting about
// one end, latches it, and rises at a constant mechanical rate, and its
// `downDwellS: Infinity` case already means "never auto-reset" (see
// `STAR_LATCH_UNTIL_RESET`). The reset is not new either: `resetDownTargets(groupId)`
// has stood a whole piece of furniture up since the poppers shipped.
//
// What IS new is that the plate's REST FRAME is a function of time. Every reaction in
// the game so far poses a plate against a frozen rest matrix; a star arm's rest matrix
// moves every frame, which makes this the first target whose hit-testable position is
// continuously animated. That is why the kinematics live here, pure and tested, rather
// than inside the scene or the reaction controller where nothing can reach them —
// the same reasoning `knockdown.ts`'s header gives for itself.
//
// ── WHY THE HUB IS DERIVED AND NEVER AUTHORED TWICE ──────────────────────────────
// Five evenly-spaced arm vectors sum to zero, so the hub is EXACTLY the centroid of
// the five authored plate positions (`starHubFrom`), and each plate's arm angle and
// radius fall out of `atan2`/`hypot` against it (`starArmOf`). So the placement data
// carries the five plate positions and nothing else — no hub coordinate that could
// drift out of step with them. This is `TestRangeScene.addTreePost`'s idiom ("recover
// the post x from the mount's own stops") applied to a ring.
//
// Pure: no THREE, no engine, no DOM, no clock.

import { inchesToMeters } from '../../units';
import type { KnockdownSpec, StarArmSpec } from './mount-type';
import type { TargetType } from './target-type';

// --- the carrier ---------------------------------------------------------------

/** Owner: "5 evenly spaced arms". */
export const STAR_ARM_COUNT = 5;

/** Angle between adjacent arms (rad) — 72°, by "evenly spaced". */
export const STAR_ARM_PITCH_RAD = (2 * Math.PI) / STAR_ARM_COUNT;

/**
 * Owner: "each one 60 cm long". This is the PLATE-CENTRE radius — the plate is
 * mounted at the end of the arm, so its centre sits at the arm's tip.
 *
 * Already SI, so there is no unit conversion to route through `units/` here.
 */
export const STAR_ARM_LENGTH_M = 0.6;

/** Owner: 1 revolution in 10 seconds. */
export const STAR_PERIOD_S = 10;

/** Derived from `STAR_PERIOD_S`, never typed as a literal. */
export const STAR_OMEGA_RAD_S = (2 * Math.PI) / STAR_PERIOD_S;

// --- the plates ---------------------------------------------------------------

/** Owner: "Each plate is 10\"". */
export const STAR_PLATE_WIDTH_M = inchesToMeters(10); // 0.254

/** Owner: "In the center is a 12\" plate". */
export const STAR_HUB_PLATE_WIDTH_M = inchesToMeters(12); // 0.3048

/**
 * Outer radius of everything the star sweeps — arm plus plate radius. This is the
 * footprint every clearance check uses (plan §3.3: the angular gap the star is
 * placed in, and the no-hill-corridor check).
 */
export const STAR_SWEPT_RADIUS_M = STAR_ARM_LENGTH_M + STAR_PLATE_WIDTH_M / 2; // 0.727

/**
 * Radial gap between the hub plate's rim and an arm plate's inner rim (m).
 *
 * Load-bearing, not decorative: `game/shot.ts` walks the rack in order and takes the
 * FIRST plate whose zones an impact breaks, with no occlusion concept. Two plates
 * that overlap in projection make the later one permanently unhittable — the defect
 * `mount-registry.ts`'s `HOSTAGE_CLAMP_3WAY` docstring is a war story about. A
 * positive gap here is what proves the hub plate and the arms can never be confused.
 */
export const STAR_HUB_CLEARANCE_M =
  STAR_ARM_LENGTH_M - STAR_PLATE_WIDTH_M / 2 - STAR_HUB_PLATE_WIDTH_M / 2; // 0.3206

// --- the metalwork ------------------------------------------------------------

/** 3″ diameter, matching `DUELING_TREE_POST_RADIUS_M`: a post carrying five arms is
 *  heavier than one standing alone (the scene's shared `POST_RADIUS_M` is 2″). */
export const STAR_POST_RADIUS_M = 0.0381;

/** 1.5″ diameter. The dueling tree's arms were left undrawn for being a few pixels
 *  at 80 yd; these are `starArmMeshLengthM` = 0.47 m long and will read clearly. */
export const STAR_ARM_RADIUS_M = 0.019;

/** The hub boss the arms radiate from. Smaller than the 12″ hub plate's radius
 *  (0.1524 m), so the plate hides it from the firing line. */
export const STAR_HUB_BOSS_RADIUS_M = 0.1;

/** Boss depth along Z (m). */
export const STAR_HUB_BOSS_LENGTH_M = 0.06;

/**
 * ── THE DEPTH STACK ──────────────────────────────────────────────────────────────
 *
 * Offsets from the PLATE PLANE (m), negative = downrange, away from the shooter.
 * Owner, on device 2026-08-07: *"The stake should be the farthest thing away from the
 * shooter. Then the arms. In front of the arms is the center and the spinning
 * targets."*
 *
 * So, nearest the shooter first: **plates → arms → boss → post.**
 *
 * WHAT MAKES THIS SUBTLE, and why it is a named stack rather than three scattered
 * literals: the ordering depends on each part's own RADIUS, not just its centre. The
 * post originally sat at offset 0 — nominally "level with the plates" — and its 3.8 cm
 * radius put its front face 3.8 cm PROUD of them, so a 1.2 m post drew in front of the
 * whole star. Each constant below is chosen so a part's front face clears the back face
 * of whatever sits in front of it, and `popper-star.test.ts` asserts the resulting
 * order by computing those faces from the radii — the only form of the check that
 * cannot drift when a radius changes.
 *
 * Boss/post interpenetration is expected and correct: they are a hub bolted to a post,
 * and two solid cylinders meeting reads as a joint. Only COPLANAR FLAT surfaces
 * z-fight, which is what these offsets keep apart — the same flicker the owner reported
 * for the hostage centre paddle ("looks like it's drawing on the same surface…
 * pixelated") and which `test-hostage-center`'s `zNudgeM` exists to fix.
 */

/** Arms: front face 1.1 cm downrange of the plates' back face. Also keeps a folding
 *  plate from sweeping through its own arm. */
export const STAR_ARM_Z_OFFSET_M = -0.03;

/** Hub boss: entirely behind the plate plane, so the 12″ hub plate hides it. */
export const STAR_HUB_BOSS_Z_OFFSET_M = -0.06;

/**
 * Post: the farthest thing from the shooter. Front face at `-0.09 + 0.0381 = -0.0519`,
 * behind the arms' back face at `-0.049`.
 *
 * Was 0 until the owner reported the post drawing in front of everything. Not merely
 * cosmetic at that value: it occluded the centre plate the player has to shoot to reset
 * the star.
 */
export const STAR_POST_Z_OFFSET_M = -0.09;

/**
 * Drawn length of one arm (m): hub centre out to the plate's INNER rim, which is
 * where the fold hinge is. Deliberately not the full `STAR_ARM_LENGTH_M` — an arm
 * drawn to the plate's centre would stick out through its face.
 *
 * The same number as `starHingeRadiusM`, and delegates to it rather than restating the
 * formula: the arm ends exactly where the hinge is, and if that ever stopped being
 * true the plate would visibly fold about a point it is not attached to.
 */
export function starArmMeshLengthM(plateWidthM: number = STAR_PLATE_WIDTH_M): number {
  return starHingeRadiusM(STAR_ARM_LENGTH_M, plateWidthM);
}

// --- the fold ------------------------------------------------------------------

/**
 * `KnockdownSpec.downDwellS` for a star arm: it NEVER auto-resets.
 *
 * Owner: "The plates at the end stay down when shot. The center plate resets and
 * raises any targets that are down." `stepKnockdown`'s `down` phase advances on
 * `since >= cfg.downDwellS`, which `Infinity` makes unreachable, so the plate latches
 * until something calls `resetKnockdown` — i.e. until the hub plate is struck (or
 * COMMIT starts a fresh engagement). `validateMountType`'s `downDwellS >= 0` accepts
 * it, so this needs no new field and no new physics.
 */
export const STAR_LATCH_UNTIL_RESET = Number.POSITIVE_INFINITY;

/**
 * The `KnockdownSpec` a star arm's fold runs on.
 *
 * `stemLengthM` is the plate's own WIDTH, not a mount stem length. The hinge is at one
 * rim and the plate is a uniform disc, so the rod in `θ̈ = (3g/2L)·sin θ` has its mass
 * centre at L/2 — exactly the uniform-rod-about-one-end model `stepKnockdown` already
 * solves. For a 10″ plate that is `3g/(2·0.254) ≈ 58 rad/s²`, so it snaps back in
 * about a quarter second rather than sagging over.
 *
 * `downDwellS` is not a parameter: it is always `STAR_LATCH_UNTIL_RESET`. That is the
 * whole "stays down when shot" requirement, and making it settable would be inviting
 * someone to break it.
 */
export function starFoldCfg(spec: StarArmSpec, plateWidthM: number): KnockdownSpec {
  return {
    fallAngleDeg: spec.fallAngleDeg,
    downDwellS: STAR_LATCH_UNTIL_RESET,
    resetRateDegS: spec.resetRateDegS,
    stemLengthM: plateWidthM,
  };
}

/** Radius (m) at which an arm's fold hinge sits — the plate's INNER rim. The plate
 *  folds about a line here, tangential to the carrier, so the outer rim swings
 *  downrange. Also the length of the drawn arm (`starArmMeshLengthM`). */
export function starHingeRadiusM(
  radiusM: number = STAR_ARM_LENGTH_M,
  plateWidthM: number = STAR_PLATE_WIDTH_M,
): number {
  return radiusM - plateWidthM / 2;
}

/**
 * Moment arm (m) for `seedFallRate` on a star arm: how far OUTWARD along the arm an
 * impact landed, measured from the hinge line.
 *
 * Radial, not vertical — that is the whole difference from a ground popper, whose
 * moment arm is height above a hinge at its base. A hit on the hinge line imparts no
 * rotation, one at the outer rim imparts the most, and one inboard of the hinge
 * clamps to zero (`seedFallRate` also clamps, so this is belt-and-braces).
 */
export function starFoldMomentArmM(
  hinge: { x: number; y: number },
  impact: { x: number; y: number },
  radialUnit: { dx: number; dy: number },
): number {
  return Math.max(
    0,
    (impact.x - hinge.x) * radialUnit.dx + (impact.y - hinge.y) * radialUnit.dy,
  );
}

// --- kinematics ---------------------------------------------------------------

/**
 * The shipped carrier spec. Lives here rather than only in `mount-registry.ts` so the
 * kinematics functions below have a default that cannot disagree with the mount —
 * `STAR_ARM` imports this exact object.
 *
 * `fallAngleDeg: 80` / `resetRateDegS: 60` are the shipped `HINGE_STEM` values: a
 * real knockdown lies against a stop rather than flat (which also keeps its
 * accumulated marks visible from the firing line), and a reset takes about a second
 * and a half at a pull-cable's pace.
 */
export const STAR_ARM_SPEC: StarArmSpec = {
  periodS: STAR_PERIOD_S,
  sense: -1, // clockwise as seen by the shooter — see `starCarrierRotationZ`
  fallAngleDeg: 80,
  resetRateDegS: 60,
};

/**
 * The carrier's rotation about world +Z at scene time `timeS` (rad).
 *
 * ── WHY CLOCKWISE IS NEGATIVE ────────────────────────────────────────────────────
 * The shooter is at +Z looking downrange (−Z). `Rz(+θ)` takes +X → +Y, i.e. right →
 * up, which from the shooter's side of the plane is COUNTER-clockwise. So a
 * shooter-clockwise star needs a negative rotation, which is what `sense: -1` means.
 *
 * This is the value the scene writes straight into `group.rotation.z` for the drawn
 * arms, while `starArmOffsetM` positions the plates. Both are pure functions of the
 * same `timeS`, which is what guarantees the plates cannot drift off their arms —
 * there is no second clock to fall out of step with.
 */
export function starCarrierRotationZ(
  timeS: number,
  spec: StarArmSpec = STAR_ARM_SPEC,
): number {
  return (spec.sense * (2 * Math.PI) * timeS) / spec.periodS;
}

/**
 * An arm's angle at `timeS`, given its angle at t = 0 (rad).
 *
 * ANGLE CONVENTION: measured CLOCKWISE FROM STRAIGHT UP as the shooter sees it, so
 * `dx = R·sin φ`, `dy = R·cos φ` (φ = 0 is straight up, φ = 90° is straight right).
 * Increasing φ is therefore clockwise motion.
 *
 * The minus sign is the bridge between the two conventions: `Rz(θ)` maps a point at
 * angle φ to angle φ − θ (expand `Rz(θ)·(sin φ, cos φ)`), so with a negative θ
 * (clockwise, above) φ increases. Getting this sign wrong slides every plate off its
 * arm in the opposite direction, which is why a test asserts the two agree.
 */
export function starArmAngleAt(
  restAngleRad: number,
  timeS: number,
  spec: StarArmSpec = STAR_ARM_SPEC,
): number {
  return restAngleRad - starCarrierRotationZ(timeS, spec);
}

/** Arm `i`'s angle at `timeS` (rad). Arm 0 points straight up at t = 0. */
export function starArmAngleRad(
  i: number,
  timeS: number,
  spec: StarArmSpec = STAR_ARM_SPEC,
): number {
  return starArmAngleAt(i * STAR_ARM_PITCH_RAD, timeS, spec);
}

/**
 * The offset from the hub to a point at `radiusM` along an arm at angle `angleRad`.
 *
 * Pass `radiusM = 1` for the arm's outward RADIAL UNIT VECTOR, which is what the fold
 * hinge's axis and moment arm are measured against.
 */
export function starArmOffsetAt(
  angleRad: number,
  radiusM: number = STAR_ARM_LENGTH_M,
): { dx: number; dy: number } {
  return { dx: radiusM * Math.sin(angleRad), dy: radiusM * Math.cos(angleRad) };
}

/** Arm `i`'s plate centre at `timeS`, as an offset from the hub. */
export function starArmOffsetM(
  i: number,
  timeS: number,
  radiusM: number = STAR_ARM_LENGTH_M,
  spec: StarArmSpec = STAR_ARM_SPEC,
): { dx: number; dy: number } {
  return starArmOffsetAt(starArmAngleRad(i, timeS, spec), radiusM);
}

/**
 * The FOLD HINGE AXIS for an arm at `angleRad` — the unit vector tangential to the
 * carrier, perpendicular to the arm.
 *
 * ── WHY THIS EXISTS AS ITS OWN FUNCTION ─────────────────────────────────────────
 * The first implementation folded every plate about the carrier frame's fixed X axis,
 * on the reasoning that doing the fold in the carrier's frame made the hinge tangential
 * "for free". It does not: X is only tangential for the arm that happens to be
 * vertical. Measured against a 10″ plate at an 80° latch, folding about X gave
 *
 *     arm 0 (  0°): correct
 *     arm 1 ( 72°): 31 mm sideways off the hinge line, only 39 mm of the 125 mm downrange
 *     arm 2 (144°): 50 mm sideways and **+101 mm — folding TOWARD the shooter**
 *     arm 3 (216°): 50 mm sideways and **+101 mm — toward the shooter**
 *     arm 4 (288°): 31 mm sideways, 39 mm downrange
 *
 * i.e. two of the five plates folded the wrong way. About this axis all five fold
 * identically 125 mm downrange with zero sideways drift, which is what
 * `popper-star.test.ts` asserts for every arm rather than for one.
 *
 * `(cos φ, −sin φ)` is `(sin φ, cos φ)` — the radial direction — turned a quarter turn.
 * The sign pairs with `Rx(−α)`'s convention in `poseKnockdown`: with `r × t = −ẑ`,
 * Rodrigues gives `r_rot = r·cos θ + ẑ·sin θ`, so a NEGATIVE angle is what carries the
 * outer rim to −z, i.e. downrange.
 */
export function starArmTangentUnit(angleRad: number): { dx: number; dy: number } {
  return { dx: Math.cos(angleRad), dy: -Math.sin(angleRad) };
}

/**
 * The hub centre, recovered from a group's plate positions.
 *
 * EXACT for evenly-spaced arms: `Σ (sin φᵢ, cos φᵢ) = 0` over a full ring, so the
 * centroid is the hub with no residual. Throws on an empty list — a star with no
 * arms is a programming error, not a degenerate case worth a fallback.
 */
export function starHubFrom(
  positions: readonly { x: number; y: number }[],
): { x: number; y: number } {
  if (positions.length === 0) throw new Error('popper-star: starHubFrom needs at least one arm');
  let x = 0;
  let y = 0;
  for (const p of positions) {
    x += p.x;
    y += p.y;
  }
  return { x: x / positions.length, y: y / positions.length };
}

/**
 * One arm's rest angle and radius, recovered from its plate position and the hub.
 *
 * `restAngleRad` is normalised to `[0, 2π)` so it round-trips to `i · 72°` rather
 * than to `atan2`'s signed range — which matters only for legibility and for
 * `starArmIndexOf`, since `sin`/`cos` do not care.
 *
 * Note the argument order `atan2(dx, dy)`, not the usual `atan2(y, x)`: the angle is
 * measured from +Y toward +X (see `starArmAngleAt`).
 */
export function starArmOf(
  hub: { x: number; y: number },
  plate: { x: number; y: number },
): { restAngleRad: number; radiusM: number } {
  const dx = plate.x - hub.x;
  const dy = plate.y - hub.y;
  const a = Math.atan2(dx, dy);
  return { restAngleRad: a < 0 ? a + 2 * Math.PI : a, radiusM: Math.hypot(dx, dy) };
}

/** Which arm a rest angle belongs to, `0 … STAR_ARM_COUNT-1`. For diagnostics and
 *  tests; the pose math works from the angle directly and never needs an index. */
export function starArmIndexOf(restAngleRad: number): number {
  return Math.round(restAngleRad / STAR_ARM_PITCH_RAD) % STAR_ARM_COUNT;
}

/**
 * Where one drawn arm mesh sits in the CARRIER's local frame, and how far to spin it.
 *
 * Extracted from the scene so it can be tested at all: `TestRangeScene` cannot be
 * constructed in the node test env (its range sign needs a 2D canvas), and without this
 * split the claim "each arm points at its own plate" would rest on the owner's eyes.
 * That claim is worth a test — the formulas agreeing (`starCarrierRotationZ` vs
 * `starArmOffsetM`) does not by itself mean the metalwork was *placed* to match, and
 * the symptom would be plates floating beside their arms.
 *
 * `rotationZ = −angleRad` because a `CylinderGeometry` runs along +Y and
 * `Rz(θ)·(0,1,0) = (−sin θ, cos θ, 0)`, so only `θ = −φ` aims it along the arm's
 * `(sin φ, cos φ)` direction. The mesh is positioned at the arm's MIDPOINT, which is
 * where a cylinder's origin is.
 */
export function starArmMeshPose(
  restAngleRad: number,
  plateWidthM: number = STAR_PLATE_WIDTH_M,
): { x: number; y: number; z: number; rotationZ: number; lengthM: number } {
  const lengthM = starArmMeshLengthM(plateWidthM);
  const mid = starArmOffsetAt(restAngleRad, lengthM / 2);
  return {
    x: mid.dx,
    y: mid.dy,
    z: STAR_ARM_Z_OFFSET_M,
    rotationZ: -restAngleRad,
    lengthM,
  };
}

// --- the target types ---------------------------------------------------------

/**
 * Owner decision D4: "somewhat light but bright purple", chosen at the LIGHT end.
 *
 * This range's lighting rig crushes dark albedos toward black — flat-shaded faces
 * angled away from the sun get little more than the hemisphere fill, which is why
 * `TEST_RANGE_ENVIRONMENT`'s tree palette had to be brightened wholesale rather than
 * the lighting retuned. A placement can override this slot in one line if it still
 * reads wrong on device.
 */
export const STAR_PLATE_FACE_HEX = 0xc77dff;

/** The shared steel-paint white (`RangeScene`'s `PLATE_COLOR`), same provenance as
 *  `GONG_FACE_HEX`. Owner decision D6: the hub plate is ordinary steel and takes
 *  paint like any other plate; a distinct "button" colour is a palette override. */
export const STAR_HUB_PLATE_FACE_HEX = 0xf0f0ea;

/**
 * A 10″ round popper plate on a star arm.
 *
 * ONE MOUNT ONLY. Unlike the gong (which serves three mounts), this plate's whole
 * reaction — a radial hinge on a rotating carrier — is meaningless anywhere else, and
 * `placements.ts` enforces the pairing, so listing `star-arm` alone is what stops it
 * being authored onto a stake where nothing would drive it.
 */
export const STAR_POPPER: TargetType = {
  id: 'star-popper',
  name: 'Star popper plate',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'plate',
  massModel: 'oval',
  paint: {
    palette: { face: STAR_PLATE_FACE_HEX },
    layers: [{ kind: 'fill', color: '$face' }],
  },
  defaultWidthM: STAR_PLATE_WIDTH_M,
  compatibleMounts: ['star-arm'],
  defaultMount: 'star-arm',
};

/**
 * The 12″ plate at the hub. Owner: "a 12\" plate that doesn't move but acts as a
 * reset switch."
 *
 * Its zone is scored like any other plate — the reset is a property of the MOUNT
 * (`star-hub-reset`, reaction `'reset-switch'`), not of the target, so a future range
 * could bolt this same plate up as an ordinary gong.
 */
export const STAR_HUB_PLATE: TargetType = {
  id: 'star-hub-plate',
  name: 'Star hub reset plate',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'plate',
  massModel: 'oval',
  paint: {
    palette: { face: STAR_HUB_PLATE_FACE_HEX },
    layers: [{ kind: 'fill', color: '$face' }],
  },
  defaultWidthM: STAR_HUB_PLATE_WIDTH_M,
  compatibleMounts: ['star-hub-reset'],
  defaultMount: 'star-hub-reset',
};
