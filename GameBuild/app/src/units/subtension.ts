// Angular → linear subtension: the linear span a scope angle covers at a target
// distance. This is the core "dial/hold math" — one turret click or reticle hash
// is an angle; what it's worth on target depends on distance.
//
// Uses the small-angle mil-relation (arc ≈ angle × distance), the convention in
// Wiki/mil-dots-subtensions.md (the mil-relation and MOA "≈1 in @100 yd" rules of
// thumb both assume this linearization). Bridges the angle and length modules so
// neither the store nor a component does this geometry inline (guardrail §4.4).

import { metersToMillimeters, metersToInches } from './length';

/**
 * Linear span (meters) that an angle (radians) subtends at a distance (meters).
 * Small-angle: e.g. 0.1 mrad at 100 m = 0.01 m (10 mm).
 */
export const linearSubtension = (angleRad: number, distanceM: number): number =>
  angleRad * distanceM;

/** A subtension expressed in both metric (mm) and imperial (inches). */
export interface Subtension {
  mm: number;
  inch: number;
}

/** The linear value of an angle at range, in both mm and inches (dual display). */
export const subtensionMmInch = (angleRad: number, distanceM: number): Subtension => {
  const m = linearSubtension(angleRad, distanceM);
  return { mm: metersToMillimeters(m), inch: metersToInches(m) };
};
