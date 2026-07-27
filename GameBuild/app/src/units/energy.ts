// Energy conversions (kinetic energy at the target). The joule is the base unit
// (the engine reports per-row energy in J). Exact: 1 ft·lbf = 1.355817948331400 J
// (1 lbf = 4.4482216152605 N × 1 ft = 0.3048 m).
//
// GUARDRAIL (execution-protocol §4.4): all energy unit math goes through this
// module — never inline in components.

const JOULES_PER_FT_LB = 4.4482216152605 * 0.3048; // 1.3558179483314004

export const footPoundsToJoules = (ftLb: number): number => ftLb * JOULES_PER_FT_LB;
export const joulesToFootPounds = (j: number): number => j / JOULES_PER_FT_LB;

/** Both representations of an energy expressed in joules (dual-unit display). */
export interface MetricImperialEnergy {
  j: number;
  ftLb: number;
}

export const asMetricImperialEnergy = (j: number): MetricImperialEnergy => ({
  j,
  ftLb: joulesToFootPounds(j),
});
