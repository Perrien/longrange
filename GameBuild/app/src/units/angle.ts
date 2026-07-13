// Angular unit conversions for scope corrections and ranging.
// Radians is the base unit (matches the engine, which works in SI/radians).
//
// Refs: Wiki/mil-dots-subtensions.md, Wiki/range-estimation.md.
//   1 mrad (MIL) = 0.001 rad
//   1 MOA       = 1/60 degree = π/10800 rad
//   ⇒ 1 mrad ≈ 3.43774677 MOA ; 1 MOA ≈ 0.29088821 mrad
//
// GUARDRAIL (execution-protocol §4.4): all angular unit math goes through this
// module — never inline in components.

const MOA_PER_RAD = 10800 / Math.PI;
const RAD_PER_MOA = Math.PI / 10800;

// --- from radians ---
export const radToMil = (rad: number): number => rad * 1000;
export const radToMoa = (rad: number): number => rad * MOA_PER_RAD;
export const radToDeg = (rad: number): number => (rad * 180) / Math.PI;

// --- to radians ---
export const milToRad = (mil: number): number => mil / 1000;
export const moaToRad = (moa: number): number => moa * RAD_PER_MOA;
export const degToRad = (deg: number): number => (deg * Math.PI) / 180;

// --- direct (via radians, exact) ---
export const milToMoa = (mil: number): number => radToMoa(milToRad(mil));
export const moaToMil = (moa: number): number => radToMil(moaToRad(moa));

/** Both angular representations of a correction expressed in radians. */
export interface MilMoa {
  mil: number;
  moa: number;
}

/** Convert a radian correction into both MIL and MOA (for dual-unit display). */
export const asMilMoa = (rad: number): MilMoa => ({
  mil: radToMil(rad),
  moa: radToMoa(rad),
});
