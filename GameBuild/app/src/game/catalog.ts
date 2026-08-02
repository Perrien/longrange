// Gear catalog (task 2.2a; S7 rifle-ammo-store: the enumerated id API is
// removed; S8 removes the last reader of the old `catalog.data.json`, so the
// file itself is deleted too). `isRimfireCartridge` plus the S3 spec-based
// resolver are now the ONLY way the game turns a build (rifle spec / load
// spec) into believed values, geometry, or hidden-truth ranges; effective
// range is a per-(rifle, load) physics solve — `engine-bridge/effective-range.ts`.
//
// Believed vs. true (D6): `believedMvMps`/`believedBc` are the advertised box
// values the player sees; the true base MV (`trueBaseMvForSpec`) + the hidden
// ranges (rifle mvOffset / lot meanMvShift / trueBc spread) are what the engine
// eventually solves. `believedBc` is authored in the load's OWN drag model
// (advertised BC in that model if published, else = trueBc so the optimism lives
// in MV only) — never a G1 number fed into a G7 solve.
//
// Encapsulation: this file (in game/) legitimately holds both believed and true
// data. The player-facing `AmmoLoadForSpec`/`RifleModelForSpec` types expose
// ONLY believed + geometry + display attrs; true values are reachable solely
// through `rifleRangesForSpec`/`lotRangesForSpec`/`trueBaseMvForSpec`, which
// engine-bridge / the dev inspector call — the Store UI never does.
import type { Load } from '../engine-bridge/types';
import type { LotTruthRanges, RifleTruthRanges } from './hidden-truth';
import { moaToRad } from '../units/angle';
import { inchesToMeters } from '../units/length';
import { fpsToMps } from '../units/velocity';
import { grainsToKg } from '../units/mass';
import {
  bc7FromI7,
  bulletLengthIn,
  muzzleVelocityFps,
  sectionalDensity,
  type VelocityCurveParams,
} from './ballistic-derivation';
import {
  cartridgeParams,
  findPreset,
  gradeParams,
  lengthClassCFor,
  LOT_SHIFT_REFERENCE,
  PRESETS,
  CARTRIDGES_CATALOG_VERSION,
  type CartridgeParamsV2,
  type LoadSpec,
  type RifleSpec,
} from './spec';

/** The catalog version every acquired record is stamped with (D10) — S7: now
 *  reads `cartridges.data.json` (via spec.ts), not the deleted id catalog. */
export const CATALOG_VERSION = CARTRIDGES_CATALOG_VERSION;

export type AmmoGrade = 'match' | 'bulk';

/** Future progression seam (D4): everything is freely acquirable in 2.2. */
export function isUnlocked(_catalogId: string): boolean {
  return true;
}

/** Whether a cartridge is rimfire — drives the recommended zero distance
 *  (task 2.3, D8: rimfire zeroes at 50, centrefire at 100). Derived from the
 *  catalog class string so a future rimfire cartridge is covered automatically.
 *  S7: reads `cartridges.data.json` (via `cartridgeParams`), covers all 10. */
export function isRimfireCartridge(cartridgeId: string): boolean {
  return cartridgeParams(cartridgeId).class.toLowerCase().includes('rimfire');
}

// --- Adapters to the 2.1b hidden-truth model --------------------------------

/**
 * Raw off-the-shelf pointing error, 5–35 MOA (D16, LOCKED with owner 2026-07-26).
 *
 * Deliberately large: 5 MOA is ~1.3″ at 25 yd, 35 MOA is ~9.2″ at 25 yd and ~37″
 * at 100 — off a normal target entirely, which is exactly WHY zeroing starts at
 * 25. The floor of 5 MOA means a fresh rifle is never accidentally usable.
 */
export const RAW_ZERO_OFFSET_RANGE = { minRad: moaToRad(5), maxRad: moaToRad(35) };

// =============================================================================
// rifle-ammo-store S3/S4/S7 — spec-based resolver. Originally landed additively
// alongside the old id API (S3, D19); as of S4 it's what every solve/UI reader
// in the app actually calls, and as of S7 it's the ONLY gear resolver left —
// the id API above (`RifleModel`/`AmmoLoad`/`getRifleModel`/`getAmmoLoad`/
// `believedLoad`/`lotTrueBaseMvMps`/`catalogTwistM`/`catalogRifleRanges`/
// `catalogLotRanges`/`RifleTier`) is deleted (D2 — rifle tiers are gone).
//
// Encapsulation (unchanged from the old id API): resolveRifleSpec/
// resolveLoadSpec expose ONLY believed values + display-neutral geometry. True
// values are reachable solely through rifleRangesForSpec/lotRangesForSpec/
// trueBaseMvForSpec, which engine-bridge and the dev inspector call — the Store
// must never import those.
//
// Believed vs. true (D6/D10 — resolved here, not left ambiguous): the derived
// velocity curve (`muzzleVelocityFps`) reproduces the plan's §2.2 table, whose
// column is explicitly the shipped loads' BOX (believed/advertised) MV — cross-
// checked against catalog.data.json's `boxMvMps`, not `trueBaseMvMps`, for the
// three anchor loads. So `trueBaseMv = believedMv / (1 + grade.mvOptimism)`,
// inverting D10's stated `believedMv = trueBaseMv * (1 + mvOptimism)` — the two
// are algebraically the same relationship, just solved for the unknown the
// curve doesn't directly give us. Every `mvFpsOverride` in cartridges.data.json
// (D9/§2.2's .223 bulk outlier, plus 22lr-bulk) is therefore a BELIEVED-MV
// override, not a true one; see that file's `grades._note` and its 22lr-bulk
// comment for the worked justification.

/** Player-facing rifle model resolved from a spec — no hidden truth, no tier
 *  (D2 removes tiers; one rifle per cartridge, configured by barrel + twist). */
export interface RifleModelForSpec {
  cartridgeId: string;
  cartridgeName: string;
  name: string;
  className: string;
  barrelLengthIn: number;
  twistIn: number;
  barrelLifeRounds: number;
  precisionMoa: { nominal: number; sd: number };
}

/** Player-facing ammo load resolved from a spec — believed values + the
 *  geometry needed to build a solve Load. NO hidden true MV/BC (same
 *  encapsulation rule as `AmmoLoad`). */
export interface AmmoLoadForSpec {
  cartridgeId: string;
  cartridgeName: string;
  grade: AmmoGrade;
  /** Preset product name, or a generated description for a hand-built load
   *  (S6: `"6.5 CM · 140 gr · i7 0.93 · Match"`). */
  product: string;
  presetId?: string;
  dragModel: 'G1' | 'G7';
  massKg: number;
  diameterM: number;
  lengthM: number;
  believedMvMps: number;
  believedBc: number;
  weightGr: number;
  /** Undefined for rimfire (D8 — i7/BC7 does not apply to .22 LR). */
  i7?: number;
}

function velocityCurveParamsFor(c: CartridgeParamsV2): VelocityCurveParams {
  return { a: c.velocityCurve.a, kAnchored: c.velocityCurve.kAnchored, referenceBarrelIn: c.referenceBarrelIn, n: c.n };
}

/** Resolve a RifleSpec into its player-facing display shape. Pure function of
 *  the spec + cartridges.data.json — assumes an already-clamped spec (S9's
 *  sliders clamp on every move via `clampRifleSpec`; this does not re-clamp). */
export function resolveRifleSpec(spec: RifleSpec): RifleModelForSpec {
  const c = cartridgeParams(spec.cartridgeId);
  return {
    cartridgeId: spec.cartridgeId,
    cartridgeName: c.name,
    name: `${c.name} — ${spec.barrelLengthIn}" 1:${spec.twistIn}`,
    className: c.class,
    barrelLengthIn: spec.barrelLengthIn,
    twistIn: spec.twistIn,
    barrelLifeRounds: c.barrelLifeRounds,
    precisionMoa: c.precisionMoa,
  };
}

/** Internal shape shared by every LoadSpec-consuming export below, so the
 *  believed/true derivation (D6/D9/D10) is computed exactly once per call
 *  rather than re-implemented per function. Not exported — callers get the
 *  player-facing (`resolveLoadSpec`/`believedLoadForSpec`) or truth-facing
 *  (`lotRangesForSpec`/`trueBaseMvForSpec`) projections of this. */
interface ResolvedLoadV2 {
  dragModel: 'G1' | 'G7';
  massKg: number;
  diameterM: number;
  lengthM: number;
  trueBc: number;
  trueBaseMvMps: number;
  believedBc: number;
  believedMvMps: number;
  product: string;
  presetId?: string;
}

/**
 * `barrelInOverride` (S8): the velocity curve is a function of barrel length,
 * but `resolveLoadSpec`/`believedLoadForSpec` (the "box" values every player-
 * facing readout uses) intentionally always solve it at the CARTRIDGE's
 * reference barrel — same convention as a real ammo box, which prints MV from
 * a fixed test barrel, not from whatever rifle the round eventually fires in.
 * `believedLoadForBuild` (below) is the one caller that passes the ACTUAL
 * configured rifle's barrel length instead, for `effective-range.ts`'s solve —
 * a deliberately different, barrel-SPECIFIC concept from the box figure. An
 * `mvFpsOverride` preset (D9's oracle-pinned/outlier loads) ignores this
 * entirely either way — it's pinned regardless of barrel, by design. */
function resolveLoadInternal(spec: LoadSpec, barrelInOverride?: number): ResolvedLoadV2 {
  const c = cartridgeParams(spec.cartridgeId);
  const grade = gradeParams(spec.grade);
  const preset = spec.presetId ? findPreset(spec.presetId) : undefined;
  const curve = velocityCurveParamsFor(c);
  const diameterM = inchesToMeters(c.dIn);
  const barrelIn = barrelInOverride ?? c.referenceBarrelIn;

  if (c.presetsOnly) {
    // .22 LR (D8): G1, no SD/i7 apparatus — a presetId carrying an authored
    // true BC is mandatory. Never feed a G1 number into a G7 solve.
    if (!preset) throw new Error(`catalog: rimfire cartridge '${spec.cartridgeId}' requires a presetId (D8)`);
    if (preset.trueBc == null)
      throw new Error(`catalog: preset '${preset.id}' has no authored trueBc (required for G1 cartridges)`);
    const massKg = grainsToKg(preset.weightGr);
    const sd = sectionalDensity(preset.weightGr, c.dIn);
    const lengthM = preset.lengthMOverride ?? inchesToMeters(bulletLengthIn(sd, lengthClassCFor(spec.cartridgeId)));
    const believedMvMps =
      preset.mvFpsOverride != null
        ? fpsToMps(preset.mvFpsOverride)
        : fpsToMps(muzzleVelocityFps(curve, preset.weightGr, barrelIn));
    const trueBaseMvMps = believedMvMps / (1 + grade.mvOptimism);
    const trueBc = preset.trueBc;
    const believedBc = trueBc * (1 + grade.bcOptimism);
    return {
      dragModel: 'G1',
      massKg,
      diameterM,
      lengthM,
      trueBc,
      trueBaseMvMps,
      believedBc,
      believedMvMps,
      product: preset.name,
      presetId: preset.id,
    };
  }

  const weightGr = spec.weightGr;
  const i7 = spec.i7;
  const sd = sectionalDensity(weightGr, c.dIn);
  const trueBc = bc7FromI7(sd, i7);
  const massKg = grainsToKg(weightGr);
  // D9: an oracle-pinned preset keeps its measured length; everything else
  // (including a preset's own bulk sibling, which is deliberately NOT
  // oracle-pinned — §0.1's repaired defect) derives length from SD*C.
  const lengthM = preset?.lengthMOverride ?? inchesToMeters(bulletLengthIn(sd, lengthClassCFor(spec.cartridgeId)));
  const believedMvMps =
    preset?.mvFpsOverride != null
      ? fpsToMps(preset.mvFpsOverride)
      : fpsToMps(muzzleVelocityFps(curve, weightGr, barrelIn));
  const trueBaseMvMps = believedMvMps / (1 + grade.mvOptimism);
  const believedBc = trueBc * (1 + grade.bcOptimism);
  const product = preset ? preset.name : `${c.name} · ${weightGr} gr · i7 ${i7.toFixed(3)} · ${spec.grade}`;
  return {
    dragModel: 'G7',
    massKg,
    diameterM,
    lengthM,
    trueBc,
    trueBaseMvMps,
    believedBc,
    believedMvMps,
    product,
    presetId: preset?.id,
  };
}

/** Resolve a LoadSpec into its player-facing display shape (believed + geometry only). */
export function resolveLoadSpec(spec: LoadSpec): AmmoLoadForSpec {
  const c = cartridgeParams(spec.cartridgeId);
  const r = resolveLoadInternal(spec);
  return {
    cartridgeId: spec.cartridgeId,
    cartridgeName: c.name,
    grade: spec.grade,
    product: r.product,
    presetId: r.presetId,
    dragModel: r.dragModel,
    massKg: r.massKg,
    diameterM: r.diameterM,
    lengthM: r.lengthM,
    believedMvMps: r.believedMvMps,
    believedBc: r.believedBc,
    weightGr: spec.weightGr,
    i7: c.presetsOnly ? undefined : spec.i7,
  };
}

/** Hidden ranges for a rifle spec (D16's raw zero offset, per-cartridge
 *  barrel-to-barrel MV spread + inherent precision from `cartridges.data.json`). */
export function rifleRangesForSpec(spec: RifleSpec): RifleTruthRanges {
  const c = cartridgeParams(spec.cartridgeId);
  return {
    mvOffset: { nominal: 0, sd: fpsToMps(c.barrelToBarrelMvSdFps) },
    zeroOffset: RAW_ZERO_OFFSET_RANGE,
    inherentPrecision: { nominal: moaToRad(c.precisionMoa.nominal), sd: moaToRad(c.precisionMoa.sd) },
  };
}

/** Hidden ranges for a load spec. D11: lot-to-lot MV shift scales with case
 *  capacity relative to the 65 CM reference (52.5 gr H2O) the base constants
 *  were fitted at. `bc.nominal` is the TRUE bc, not believed. */
export function lotRangesForSpec(spec: LoadSpec): LotTruthRanges {
  const c = cartridgeParams(spec.cartridgeId);
  const grade = gradeParams(spec.grade);
  const r = resolveLoadInternal(spec);
  const lotShiftMps = grade.lotShiftBaseMps * Math.sqrt(c.capacityGrH2O / LOT_SHIFT_REFERENCE.capacityGrH2O);
  return {
    meanMvShift: { nominal: 0, sd: lotShiftMps },
    mvSd: { nominal: grade.perShotMvSdMps.nominal, sd: grade.perShotMvSdMps.sd },
    bc: { nominal: r.trueBc, sd: r.trueBc * grade.lotBcVarFraction },
    bcSd: { nominal: grade.perShotBcSdFraction, sd: 0 },
  };
}

/** The believed (box) solve Load for a spec — advertised MV + BC in the load's
 *  drag model. This is what the player's DOPE is built from. */
export function believedLoadForSpec(spec: LoadSpec): Load {
  const r = resolveLoadInternal(spec);
  return {
    massKg: r.massKg,
    diameterM: r.diameterM,
    lengthM: r.lengthM,
    bc: r.believedBc,
    dragModel: r.dragModel,
    muzzleVelocityMps: r.believedMvMps,
  };
}

/** The honest base MV for a spec (measured average, before rifle/lot hidden
 *  draws). Truth-side: engine-bridge / dev inspector only. */
export function trueBaseMvForSpec(spec: LoadSpec): number {
  return resolveLoadInternal(spec).trueBaseMvMps;
}

/** The believed solve Load for a configured BUILD (S8) — like
 *  `believedLoadForSpec`, but the muzzle velocity is solved at the RIFLE's
 *  actual configured barrel length, not the cartridge's fixed reference
 *  barrel. Deliberately a different number from the box MV `believedLoadForSpec`
 *  returns (same distinction a real barrel-length chart draws): this is what
 *  `engine-bridge/effective-range.ts` solves against, since a shorter/longer
 *  barrel genuinely changes how far the load stays supersonic. An
 *  `mvFpsOverride` preset (D9) is unaffected by barrel length either way. */
export function believedLoadForBuild(rifleSpec: RifleSpec, loadSpec: LoadSpec): Load {
  const r = resolveLoadInternal(loadSpec, rifleSpec.barrelLengthIn);
  return {
    massKg: r.massKg,
    diameterM: r.diameterM,
    lengthM: r.lengthM,
    bc: r.believedBc,
    dragModel: r.dragModel,
    muzzleVelocityMps: r.believedMvMps,
  };
}

/** Barrel twist as meters/turn — `RifleSpec.twistIn` is already a plain
 *  inches-per-turn number, nothing to parse. */
export function twistMForSpec(spec: RifleSpec): number {
  return inchesToMeters(spec.twistIn);
}

export { PRESETS };
