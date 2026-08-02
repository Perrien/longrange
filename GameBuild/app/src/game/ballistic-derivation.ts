// rifle-ammo-store S2 — pure ballistic derivation math (§2.1 of
// Design/Plans/rifle-ammo-store-plan.md). Every function here is a pure
// function of explicit arguments: no engine, no state, no React, no import of
// cartridges.data.json — same discipline as game/hidden-truth.ts. Callers
// (game/spec.ts's resolve*ForSpec, S3) supply the cartridge's authored
// parameters; this module just does the arithmetic.
//
//   sectional density   SD  = w_gr / (7000 · d_in²)
//   ballistic coeff.    BC7 = SD / i7                          i7 = profile slider
//   bullet length       L   = C · SD                           C by construction class
//   muzzle velocity     MV  = k · w_gr^(−a) · (L_bbl / L_ref)^n
//   charge mass         m_c = chargeFraction · capacity_gr      (rimfire: authored override)
//   recoil velocity     V_r = (m_b·v + m_c·gasFactor·v) / m_rifle
//   Miller stability    Sg  (from L, twist, d, w, v)            display only (D14)
//
// Inputs/outputs for the weight/barrel/i7 formulas are in the SAME native
// units cartridges.data.json authors them in (grains, inches, fps, dimensionless
// i7) — conversion to SI for the engine happens at the call site via `units/`
// (guardrail §4.4), never inline here. `recoilVelocityMps` is the one exception:
// it's engine/hidden-truth-facing, so it takes SI (kg, m/s) directly.

/** Clamp `v` into `[min, max]`. The one shared boundary-behaviour primitive —
 *  weight/i7/barrel sliders all clamp to their cartridge's authored band through
 *  this (S3's clampRifleSpec/clampLoadSpec are the call sites; tested here
 *  directly against representative bands per S2's own done-when). */
export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

/** Sectional density (grains, inches → dimensionless lb/in²-equivalent SD). */
export function sectionalDensity(weightGr: number, dIn: number): number {
  return weightGr / (7000 * dIn * dIn);
}

/** G7 ballistic coefficient from sectional density and the profile slider `i7`
 *  (form factor — lower i7 is sleeker). */
export function bc7FromI7(sd: number, i7: number): number {
  return sd / i7;
}

/** Inverse of `bc7FromI7` — the implied form factor for a known SD/BC7 pair.
 *  Used to compile presets (S1) and by the form-factor plausibility screen. */
export function i7FromBc7(sd: number, bc7: number): number {
  return sd / bc7;
}

/** Bullet length (inches) from sectional density and the construction class's
 *  `C` constant (§3.4). Bypassed by D9 for oracle-pinned presets, which carry a
 *  measured `lengthMOverride` instead. */
export function bulletLengthIn(sd: number, lengthClassC: number): number {
  return lengthClassC * sd;
}

/** The velocity-curve parameters a cartridge authors in cartridges.data.json
 *  (native units: fps, inches). */
export interface VelocityCurveParams {
  a: number;
  kAnchored: number;
  referenceBarrelIn: number;
  n: number;
}

/** Muzzle velocity (fps) from the anchored curve (D6/D7): `k · w^(−a) ·
 *  (L/L_ref)^n`. `k` was solved so this reproduces the cartridge's anchor load
 *  bit-exact at (anchorWeightGr, referenceBarrelIn) — see ballistic-derivation.test.ts's
 *  §2.2 reproduction table. */
export function muzzleVelocityFps(
  params: VelocityCurveParams,
  weightGr: number,
  barrelIn: number,
): number {
  return (
    params.kAnchored *
    Math.pow(weightGr, -params.a) *
    Math.pow(barrelIn / params.referenceBarrelIn, params.n)
  );
}

/** Charge mass (grains) — D12: `chargeFraction · capacity`, except rimfire,
 *  which authors an explicit override (cartridges.data.json `recoil.chargeGrOverride`). */
export function chargeMassGr(
  capacityGrH2O: number,
  chargeFraction: number,
  overrideGr?: number,
): number {
  return overrideGr ?? capacityGrH2O * chargeFraction;
}

/** Recoil (muzzle-rise) velocity, SI (D13): `(m_bullet·v + m_charge·gasFactor·v) /
 *  m_rifle`. Unlike the formulas above, this is engine/hidden-truth-facing, so
 *  it takes SI mass (kg) and velocity (m/s) directly — the grains→kg conversion
 *  happens at the call site via `units/mass`. Does NOT touch point of impact
 *  (D13/S10 guard) — this is a display/feel quantity only. */
export function recoilVelocityMps(
  bulletMassKg: number,
  mvMps: number,
  chargeMassKg: number,
  rifleMassKg: number,
  gasVelocityFactor: number,
): number {
  return (bulletMassKg * mvMps + chargeMassKg * gasVelocityFactor * mvMps) / rifleMassKg;
}

/**
 * Miller gyroscopic stability factor, display-only (D14) — the SAME formula as
 * the engine's `Bullet::computeMillerStabilityFactorCorrected`, minus the
 * atmospheric (temperature/pressure) term: the plan's derivation chain lists
 * Sg as a function of (L, twist, d, w, v) only, with no atmosphere input at the
 * build screen. Cross-checked in ballistic-derivation.test.ts against the real
 * engine call at ICAO sea level, where the atmospheric correction factor is
 * itself ≈1 (Miller's calibration reference is 519 °R / 29.92 inHg — ICAO SL is
 * 288.15 K = 518.67 °R / 101325 Pa = 29.9212 inHg), so the two agree within the
 * task's 1% bar without needing atmosphere plumbed into the Store's build screen.
 *
 *   Sg_base = 30·w_gr / (t_cal² · d_in³ · l_cal · (1 + l_cal²))     t_cal = twist_in/d_in, l_cal = L_in/d_in
 *   Sg = Sg_base · (v_fps / 2800)^(1/3)
 */
export function millerSg(
  weightGr: number,
  dIn: number,
  lengthIn: number,
  twistIn: number,
  mvFps: number,
): number {
  const lCalibers = lengthIn / dIn;
  const tCalibers = twistIn / dIn;
  const denominator = tCalibers * tCalibers * dIn * dIn * dIn * lCalibers * (1 + lCalibers * lCalibers);
  if (denominator === 0) return 0;
  const sgBase = (30 * weightGr) / denominator;
  return sgBase * Math.cbrt(mvFps / 2800);
}
