// Length / distance conversions. Meters is the base unit (matches the engine).
// Exact international definitions: 1 yd = 0.9144 m, 1 ft = 0.3048 m,
// 1 in = 0.0254 m. Inverses use exact division (not the engine's rounded
// display constants) so the presentation layer stays precise.
//
// GUARDRAIL (execution-protocol §4.4): all length unit math goes through this
// module — never inline in components.

const M_PER_YARD = 0.9144;
const M_PER_FOOT = 0.3048;
const M_PER_INCH = 0.0254;

// --- to meters ---
export const yardsToMeters = (yd: number): number => yd * M_PER_YARD;
export const feetToMeters = (ft: number): number => ft * M_PER_FOOT;
export const inchesToMeters = (inch: number): number => inch * M_PER_INCH;

// --- from meters ---
export const metersToYards = (m: number): number => m / M_PER_YARD;
export const metersToFeet = (m: number): number => m / M_PER_FOOT;
export const metersToInches = (m: number): number => m / M_PER_INCH;
export const metersToCentimeters = (m: number): number => m * 100;
export const metersToMillimeters = (m: number): number => m * 1000;

/** Both linear representations of a distance expressed in meters. */
export interface MetricImperialLength {
  meters: number;
  yards: number;
}

/** Convert a distance in meters into both metric and imperial (dual display). */
export const asMetricImperialDistance = (m: number): MetricImperialLength => ({
  meters: m,
  yards: metersToYards(m),
});
