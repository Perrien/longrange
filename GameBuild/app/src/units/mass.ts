// Mass conversions. Kilograms is the base unit (matches the engine).
// Exact international definition: 1 gr (grain) = 0.00006479891 kg — the same
// constant GameBuild/validation/loads.json's `si` blocks were hand-converted
// with, so round-tripping a preset's authored weightGr through here reproduces
// the golden-vector fixture's massKg exactly.
//
// GUARDRAIL (execution-protocol §4.4): all mass unit math goes through this
// module — never inline in components.

const KG_PER_GRAIN = 0.00006479891;

// --- to kilograms ---
export const grainsToKg = (gr: number): number => gr * KG_PER_GRAIN;

// --- from kilograms ---
export const kgToGrains = (kg: number): number => kg / KG_PER_GRAIN;
