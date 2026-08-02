// rifle-ammo-store S10 — cartridge-scaled recoil pitch velocity (D13). Replaces
// ScopeView's single hardcoded `RECOIL_PITCH_VEL = 0.05` (today: every cartridge
// kicks identically) with a real per-build number: `V_r` from
// `ballistic-derivation.ts`'s `recoilVelocityMps`, calibrated so the 6.5 CM /
// 140 gr match build reproduces exactly today's felt kick.
//
// Shares its raw (uncalibrated) computation with `game/store-readouts.ts`'s
// (S9) Store recoil readout via `recoilRatioToReference` — both read the same
// number, just presented differently (a display ratio there, a calibrated
// physical velocity here), so the Store's "recoil kick relative to 6.5 CM"
// figure and what the player actually feels in ScopeView can't drift apart.
//
// ⚠ Point of impact is NOT touched here (D13) — this module only ever produces
// a velocity number for ScopeView's existing spring-damper feel model to
// consume; aim is sampled before the kick is applied, unchanged (ScopeView.tsx,
// `fireSteel`/`fireSightIn`).
import { chargeMassGr, recoilVelocityMps } from './ballistic-derivation';
import { believedLoadForBuild } from './catalog';
import {
  cartridgeParams,
  RECOIL_CONSTANTS,
  specFromPreset,
  type LoadSpec,
  type RifleSpec,
} from './spec';
import { RECOIL_REFERENCE_CARTRIDGE_ID, RECOIL_REFERENCE_PRESET_ID, RIFLE_WEIGHT_LB } from './recoil-reference';
import { grainsToKg, poundsToKg } from '../units';

/** The D13 calibration point: 6.5 CM / 140 gr match returns exactly this —
 *  ScopeView's own `RECOIL_PITCH_VEL` constant before this task, now imported
 *  from here instead of re-declared, so there is exactly one 0.05 in the
 *  codebase. Also doubles as the graceful fallback `recoilPitchVelocity`
 *  returns when a cartridge has no sourced rifle weight yet (the same real,
 *  logged gap `recoilRatioToReference`/S9's Store readout hit — 6mm CM,
 *  6.5 PRC, .300 PRC) or when there's no active gear at all: reverting to
 *  today's flat feel is the honest choice, not a guessed per-cartridge number. */
export const RECOIL_PITCH_VEL_REFERENCE = 0.05;

/** Raw (uncalibrated) recoil pitch velocity, m/s, for a specific build —
 *  bullet mass + charge mass at THIS rifle's actual barrel-length MV
 *  (`believedLoadForBuild`, S8), divided by the rifle's mass. Not exported:
 *  every caller wants either the calibrated absolute value
 *  (`recoilPitchVelocity`) or the reference-relative ratio
 *  (`recoilRatioToReference`), never this number on its own. */
function rawRecoilVelocityMps(rifleSpec: RifleSpec, loadSpec: LoadSpec, rifleLb: number): number {
  const c = cartridgeParams(rifleSpec.cartridgeId);
  const build = believedLoadForBuild(rifleSpec, loadSpec);
  const chargeGr = chargeMassGr(
    c.capacityGrH2O,
    RECOIL_CONSTANTS.chargeFraction,
    (RECOIL_CONSTANTS.chargeGrOverride as Record<string, number>)[rifleSpec.cartridgeId],
  );
  return recoilVelocityMps(
    build.massKg,
    build.muzzleVelocityMps,
    grainsToKg(chargeGr),
    poundsToKg(rifleLb),
    RECOIL_CONSTANTS.gasVelocityFactor,
  );
}

// The reference build (D13): 6.5 CM / 140 gr match at its reference barrel +
// first twist option — a fixed point, computed once at module load.
const REFERENCE_RIFLE_SPEC: RifleSpec = (() => {
  const c = cartridgeParams(RECOIL_REFERENCE_CARTRIDGE_ID);
  return {
    cartridgeId: RECOIL_REFERENCE_CARTRIDGE_ID,
    barrelLengthIn: c.referenceBarrelIn,
    twistIn: c.twistOptionsInPerTurn[0],
  };
})();
const REFERENCE_LOAD_SPEC: LoadSpec = specFromPreset(RECOIL_REFERENCE_PRESET_ID);
const REFERENCE_RIFLE_LB = RIFLE_WEIGHT_LB[RECOIL_REFERENCE_CARTRIDGE_ID];
if (REFERENCE_RIFLE_LB == null) {
  throw new Error('recoil: calibration reference cartridge has no sourced rifle weight — cannot calibrate');
}
const REFERENCE_RAW_VR_MPS = rawRecoilVelocityMps(REFERENCE_RIFLE_SPEC, REFERENCE_LOAD_SPEC, REFERENCE_RIFLE_LB);
const CALIBRATION_SCALE = RECOIL_PITCH_VEL_REFERENCE / REFERENCE_RAW_VR_MPS;

/**
 * Recoil pitch velocity for a build, calibrated so the 6.5 CM / 140 gr match
 * reference build returns exactly `RECOIL_PITCH_VEL_REFERENCE` (0.05, today's
 * felt kick) — ScopeView reads this instead of a flat constant (S10 step 1/2).
 * Falls back to the same flat reference value when the cartridge has no
 * sourced rifle weight (a real, logged gap — see `recoil-reference.ts`) so an
 * unsupported cartridge still kicks like something, not nothing.
 */
export function recoilPitchVelocity(rifleSpec: RifleSpec, loadSpec: LoadSpec): number {
  const rifleLb = RIFLE_WEIGHT_LB[rifleSpec.cartridgeId];
  if (rifleLb == null) return RECOIL_PITCH_VEL_REFERENCE;
  return rawRecoilVelocityMps(rifleSpec, loadSpec, rifleLb) * CALIBRATION_SCALE;
}

/**
 * Uncalibrated ratio to the 6.5 CM / 140 gr match reference build — 1.00
 * there, growing with cartridge + bullet weight. Shared with
 * `game/store-readouts.ts`'s (S9) Store recoil readout so the two numbers
 * can't drift apart; `undefined` for a cartridge with no sourced rifle weight.
 */
export function recoilRatioToReference(rifleSpec: RifleSpec, loadSpec: LoadSpec): number | undefined {
  const rifleLb = RIFLE_WEIGHT_LB[rifleSpec.cartridgeId];
  if (rifleLb == null) return undefined;
  return rawRecoilVelocityMps(rifleSpec, loadSpec, rifleLb) / REFERENCE_RAW_VR_MPS;
}
