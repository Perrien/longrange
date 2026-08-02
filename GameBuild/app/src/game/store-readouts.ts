// rifle-ammo-store S9 — pure readout-assembly for the Store build screen (D17).
// Every derived number the Rifle/Ammo tabs show comes from here, as a pure
// function of (module, rifleSpec, loadSpec): no React, no store, no DOM — the
// plan's own Done-when calls out "a component test on the pure readout-assembly
// function is enough — do not test the canvas" (S9 §Done when).
//
// Believed values only (guardrail §4.8 / catalog.ts's own encapsulation rule):
// every number here is either genuinely public (SD/BC7/length are direct
// functions of the player's own slider values, not hidden truth) or the
// believed/box figure catalog.ts already exposes (`resolveLoadSpec`,
// `believedLoadForBuild`, `gradeParams`'s authored per-grade table — never
// `lotRangesForSpec`/`trueBaseMvForSpec`, which are truth-facing and reserved
// for engine-bridge / the dev inspector).
import type { BtkModule } from '../engine-bridge/types';
import { effectiveRangeYdForSpec } from '../engine-bridge/effective-range';
import {
  believedLoadForBuild,
  isRimfireCartridge,
  resolveLoadSpec,
  resolveRifleSpec,
  type AmmoLoadForSpec,
  type RifleModelForSpec,
} from './catalog';
import { chargeMassGr, millerSg, recoilVelocityMps, sectionalDensity } from './ballistic-derivation';
import {
  cartridgeParams,
  gradeParams,
  RECOIL_CONSTANTS,
  specFromPreset,
  type LoadSpec,
  type RifleSpec,
} from './spec';
import { RECOIL_REFERENCE_CARTRIDGE_ID, RECOIL_REFERENCE_PRESET_ID, RIFLE_WEIGHT_LB } from './recoil-reference';
import { grainsToKg, metersToInches, mpsToFps, poundsToKg } from '../units';

/** Miller Sg's owner-set marginal threshold (D14) — display only, never blocks
 *  a build and never implies a dispersion consequence (feature-catalog §817). */
export const SG_MARGINAL_BELOW = 1.4;

export interface RifleReadouts {
  model: RifleModelForSpec;
  /** MV (fps) at the CURRENTLY selected ammo, solved at THIS rifle's actual
   *  barrel length (`believedLoadForBuild`, S8/S9) — the number that makes the
   *  barrel-length slider visibly do something, unlike the box's fixed
   *  reference-barrel figure. */
  derivedMvFpsAtCurrentLoad: number;
  barrelLifeRounds: number;
  precisionMoa: { nominal: number; sd: number };
  /** Recoil pitch velocity relative to the 6.5 CM / 140 gr match reference
   *  build (D13's calibration point) — 1.00 there, growing with cartridge +
   *  the CURRENTLY selected bullet weight (a heavier bullet kicks harder on
   *  the same platform). `undefined` when this cartridge has no sourced rifle
   *  weight yet (`recoil-reference.ts` — 6mm CM / 6.5 PRC / .300 PRC, a real,
   *  logged gap, not silently defaulted to 1.00 or omitted without a trace). */
  recoilRelativeToReference: number | undefined;
}

export interface AmmoReadouts {
  load: AmmoLoadForSpec;
  /** Sectional density — a direct function of the player's own weight slider,
   *  not hidden truth. */
  sd: number;
  /** BC7 (G7 cartridges) — the BELIEVED (box-optimistic) figure, matching
   *  `AmmoLoadForSpec.believedBc`; `undefined` for rimfire (D8, G1 + no i7
   *  apparatus — `load.believedBc` is still the right number to show there,
   *  it's simply not a BC7). Kept as its own field so callers don't have to
   *  know which cartridges are rimfire to read the ammo tab correctly. */
  bc7: number | undefined;
  bulletLengthIn: number;
  /** Same barrel-aware MV as `RifleReadouts.derivedMvFpsAtCurrentLoad` —
   *  surfaced again here since the Ammo tab is the natural place to read "what
   *  does THIS bullet do," same underlying number, not a second computation. */
  derivedMvFps: number;
  /** The grade's authored nominal per-shot MV SD (fps) — an advertised-class
   *  figure (match vs. bulk), not a specific lot's hidden true spread. */
  perShotMvSdFps: number;
  /** Last supersonic station (yd), rounded to the cartridge's ladder cadence —
   *  `effectiveRangeYdForSpec` (S8), solved against THIS build. */
  supersonicReachYd: number;
  sg: number;
  sgMarginal: boolean;
}

/** The rifle spec's currently configured MV, solved against `loadSpec` at this
 *  rifle's actual barrel length (S8's `believedLoadForBuild`) — shared by both
 *  tabs' readouts so it's computed once per call site, not twice. */
function derivedMvFps(rifleSpec: RifleSpec, loadSpec: LoadSpec): number {
  return mpsToFps(believedLoadForBuild(rifleSpec, loadSpec).muzzleVelocityMps);
}

/** Recoil pitch velocity (m/s) for a build, using its CURRENTLY selected bullet
 *  weight/MV — same formula `game/recoil.ts` (S10) will wrap in a calibrated,
 *  ScopeView-facing function; this is the Store's own uncalibrated reading,
 *  expressed as a ratio so it doesn't need to agree on units with S10. */
function recoilVelocityForBuild(rifleSpec: RifleSpec, loadSpec: LoadSpec, rifleLb: number): number {
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

// The reference build (D13): 6.5 CM / 140 gr match at ITS reference barrel +
// first twist option — a fixed point, computed once at module load (pure
// inputs, no reason to recompute per call).
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
  throw new Error('store-readouts: recoil reference cartridge has no sourced rifle weight — cannot calibrate');
}
const REFERENCE_VR_MPS = recoilVelocityForBuild(REFERENCE_RIFLE_SPEC, REFERENCE_LOAD_SPEC, REFERENCE_RIFLE_LB);

function recoilRelativeToReference(rifleSpec: RifleSpec, loadSpec: LoadSpec): number | undefined {
  const rifleLb = RIFLE_WEIGHT_LB[rifleSpec.cartridgeId];
  if (rifleLb == null) return undefined;
  return recoilVelocityForBuild(rifleSpec, loadSpec, rifleLb) / REFERENCE_VR_MPS;
}

/** Assemble every Rifle-tab readout for the current (rifleSpec, loadSpec) build. */
export function rifleReadouts(rifleSpec: RifleSpec, loadSpec: LoadSpec): RifleReadouts {
  const c = cartridgeParams(rifleSpec.cartridgeId);
  return {
    model: resolveRifleSpec(rifleSpec),
    derivedMvFpsAtCurrentLoad: derivedMvFps(rifleSpec, loadSpec),
    barrelLifeRounds: c.barrelLifeRounds,
    precisionMoa: c.precisionMoa,
    recoilRelativeToReference: recoilRelativeToReference(rifleSpec, loadSpec),
  };
}

/** Assemble every Ammo-tab readout for the current (rifleSpec, loadSpec) build.
 *  Needs the engine module for the supersonic-reach solve (S8). */
export function ammoReadouts(module: BtkModule, rifleSpec: RifleSpec, loadSpec: LoadSpec): AmmoReadouts {
  const c = cartridgeParams(rifleSpec.cartridgeId);
  const load = resolveLoadSpec(loadSpec);
  const grade = gradeParams(loadSpec.grade);
  const rimfire = isRimfireCartridge(loadSpec.cartridgeId);
  const sd = sectionalDensity(loadSpec.weightGr, c.dIn);
  const mvFps = derivedMvFps(rifleSpec, loadSpec);
  const lengthIn = metersToInches(load.lengthM);
  const sg = millerSg(loadSpec.weightGr, c.dIn, lengthIn, rifleSpec.twistIn, mvFps);
  return {
    load,
    sd,
    bc7: rimfire ? undefined : load.believedBc,
    bulletLengthIn: lengthIn,
    derivedMvFps: mvFps,
    perShotMvSdFps: mpsToFps(grade.perShotMvSdMps.nominal),
    supersonicReachYd: effectiveRangeYdForSpec(module, rifleSpec, loadSpec),
    sg,
    sgMarginal: sg < SG_MARGINAL_BELOW,
  };
}
