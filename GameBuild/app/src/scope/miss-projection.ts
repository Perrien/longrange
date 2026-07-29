// Where a low miss kicks up dirt — originally step P3 of
// `Design/archive/elr-probe-plan.md`, now what the ELR Range depends on.
//
// Pure: no THREE, no DOM.
//
// A round that passes UNDER the target resolves below ground on the target plane,
// so drawing the dust puff at the resolved impact would bury it. ScopeView has
// always projected such a miss back down the sight ray onto the ground in front,
// where the round actually strikes.
//
// That projection assumed **flat ground at y = 0**, which is true of every other
// range and false for the ELR Range, whose hillside climbs to 200 m. On a
// rising slope a flat-plane solve puts the puff far past the real strike point and
// well underground — which would quietly break the impact splash on the one range
// where a slope facing you is meant to make the splash legible.
//
// So the ground is a FUNCTION of downrange distance rather than a constant, and the
// intersection is found by marching rather than solved in closed form. A convex
// profile can be crossed at more than one radius; marching from the shooter outward
// finds the FIRST crossing, which is the one that actually stops the bullet.

/** Height of the ground (m) at a downrange distance (m). */
export type GroundProfile = (downrangeM: number) => number;

/** Sit the dust just above the surface rather than half-buried in it. */
export const GROUND_PUFF_LIFT_M = 0.12;

export interface MissPoint {
  x: number;
  y: number;
  z: number;
}

/**
 * Walk the sight ray out from the shooter and return the first point where it meets
 * the ground, or `null` if it never does inside `maxDownrangeM` (a miss that flies
 * over the crest and away — correct to draw nothing for).
 *
 * `stepM` trades accuracy for work. 2 m over 3 km is 1500 samples of a couple of
 * arithmetic ops, run once per missed shot, not per frame.
 */
export function projectMissToGround(
  eye: MissPoint,
  impact: MissPoint,
  groundAt: GroundProfile,
  maxDownrangeM: number,
  stepM = 2,
): MissPoint | null {
  const dz = impact.z - eye.z;
  if (!(Math.abs(dz) > 1e-6)) return null;

  let prevR = 0;
  let prevGap = eye.y - groundAt(0);
  // Already underground at the muzzle: nothing sensible to draw.
  if (prevGap <= 0) return null;

  for (let r = stepM; r <= maxDownrangeM; r += stepM) {
    const t = r / Math.abs(dz);
    const y = eye.y + (impact.y - eye.y) * t;
    const gap = y - groundAt(r);
    if (gap <= 0) {
      // Linear interpolation between the last two samples — the ray is straight and
      // the ground is smooth, so this lands within a few centimetres.
      const f = prevGap / (prevGap - gap);
      const hitR = prevR + (r - prevR) * f;
      const ht = hitR / Math.abs(dz);
      return {
        x: eye.x + (impact.x - eye.x) * ht,
        y: groundAt(hitR) + GROUND_PUFF_LIFT_M,
        z: eye.z + (impact.z - eye.z) * ht,
      };
    }
    prevR = r;
    prevGap = gap;
  }
  return null;
}

/** The flat-ground profile every range but the ELR Range uses. */
export const FLAT_GROUND: GroundProfile = () => 0;
