// Pure superposition math for Realistic-mode wind (task 1.7a, D2/D3b). No
// engine, no THREE, no React — just the arithmetic that combines three already-
// solved trajectories (mean / zero-wind / field) into one drop+windage pair, and
// the proportional gust-scale knob. Extracted from ScopeView's `solveAt` so the
// "Steady ⇒ byte-identical to 1.6" and "gustScale=0 ⇒ no field contribution"
// identities are unit-testable without React/THREE/the engine.
//
// Backend reality (increment-1.7-plan.md, D2): `WindGenerator` is zero-mean
// turbulence, so "field minus zero-wind" is the pure gust CONTRIBUTION at a
// given point in time — the deviation the mean solve doesn't already capture.
// Superposing that (scaled) onto the ordinary mean solve gives the total the
// bullet actually flew through, while keeping Steady mode's mean solve exact.

/** The two axes a solved trajectory row needs for shot resolution — a subset of
 *  engine-bridge's `TrajectoryRow` (drop + windage only; velocity/TOF come from
 *  the mean solve unchanged, per D2). */
export interface DropWindage {
  dropM: number;
  windageM: number;
}

export interface SuperposeInput {
  /** The ordinary constant-mean solve (today's 1.6 behavior). */
  mean: DropWindage;
  /** Constant ZERO-wind solve at the same range (the no-wind baseline; still
   *  captures spin drift) — the field solve minus this isolates the field's
   *  own contribution instead of double-counting spin drift. */
  zero: DropWindage;
  /** The field-driven solve (`simulateWithWind`, zeroed against the same mean),
   *  sampled at the current field time — NOT cached, it must change as the
   *  field evolves (task 1.7a step 4). */
  field: DropWindage;
  /** Proportional gust scale (D3b): `meanSpeedMps / GUST_REFERENCE_MPS`, clamped
   *  at 0 so a 0 mph mean is dead calm regardless of the chosen preset. */
  gustScale: number;
}

/**
 * `total = meanSolve + gustScale × (fieldSolve − zeroSolve)` (D2's exact
 * formula, both axes). When `gustScale === 0` this reduces to `mean` exactly —
 * the Steady-mode identity (1.7a's own "Steady ⇒ byte-identical to 1.6" check).
 */
export function superposeWind(input: SuperposeInput): DropWindage {
  return {
    dropM: input.mean.dropM + input.gustScale * (input.field.dropM - input.zero.dropM),
    windageM: input.mean.windageM + input.gustScale * (input.field.windageM - input.zero.windageM),
  };
}

/** `gustScale = meanSpeedMps / referenceMps`, clamped at 0 (D3b) — a 0 mph mean
 *  (or a momentary negative from float noise) is dead calm, never a negative
 *  (inverted) gust. */
export function gustScaleFor(meanSpeedMps: number, referenceMps: number): number {
  return Math.max(0, meanSpeedMps) / referenceMps;
}
