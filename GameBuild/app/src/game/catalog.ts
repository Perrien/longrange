// Gear catalog (task 2.2a). Typed loader over catalog.data.json + the two
// adapters that turn catalog entries into the 2.1b hidden-truth ranges, plus the
// believed (box) Load the player's DOPE is built from.
//
// Scope (D2): the catalog is ADDITIVE and, in Increment 2.2, consumed only by the
// dev TruthInspector — it does NOT change how the live shot loop solves. Wiring
// the selected instance's true ballistics into the solve, and the zeroing flow,
// land in 2.3.
//
// Believed vs. true (D6): `believedMvMps`/`believedBc` are the advertised box
// values the player sees; the true base MV (`lotTrueBaseMvMps`) + the hidden
// ranges (rifle mvOffset / lot meanMvShift / trueBc spread) are what the engine
// eventually solves. `believedBc` is authored in the load's OWN drag model
// (advertised BC in that model if published, else = trueBc so the optimism lives
// in MV only) — never a G1 number fed into a G7 solve.
//
// Encapsulation: this file (in game/) legitimately holds both believed and true
// data. The player-facing `AmmoLoad`/`RifleModel` types expose ONLY believed +
// geometry + display attrs; true values are reachable solely through
// `catalogLotRanges` / `lotTrueBaseMvMps`, which engine-bridge / the dev inspector
// call — the Store UI never does.
import type { Load } from '../engine-bridge/types';
import type { LotTruthRanges, RifleTruthRanges } from './hidden-truth';
import { moaToRad } from '../units/angle';
import { inchesToMeters } from '../units/length';
import { fpsToMps } from '../units/velocity';
import { grainsToKg } from '../units/mass';
import catalogData from './catalog.data.json';
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
  type CartridgeParamsV2,
  type LoadSpec,
  type RifleSpec,
} from './spec';

/** The catalog version every acquired record is stamped with (D10). */
export const CATALOG_VERSION = catalogData.catalogVersion;

export type RifleTier = 'hunting' | 'factoryMatch' | 'custom';
export type AmmoGrade = 'match' | 'bulk';

const TIER_LABEL: Record<RifleTier, string> = {
  hunting: 'Hunting',
  factoryMatch: 'Factory Match',
  custom: 'Custom',
};

/** Player-facing rifle model (one per cartridge × tier). No hidden truth. */
export interface RifleModel {
  catalogId: string; // e.g. "65cm-custom"
  cartridgeId: string; // "65cm"
  cartridgeName: string; // "6.5 Creedmoor"
  tier: RifleTier;
  name: string; // "6.5 Creedmoor — Custom"
  className: string;
  twist: string;
  twistGating: string; // display only (D7 — not enforced)
  barrelLengthIn: number;
  weightLb: number;
  recoilFtLb: number;
  barrelLifeRounds: number;
}

/** Player-facing ammo load (one per cartridge × grade). Believed values + the
 *  geometry/drag needed to build a solve Load — NO hidden true MV/BC. */
export interface AmmoLoad {
  catalogId: string; // e.g. "65cm-match"
  cartridgeId: string;
  cartridgeName: string;
  grade: AmmoGrade;
  product: string;
  dragModel: 'G1' | 'G7';
  massKg: number;
  diameterM: number;
  lengthM: number;
  believedMvMps: number;
  believedBc: number;
}

type RawCartridge = (typeof catalogData.cartridges)['65cm'];

function rawCartridge(cartridgeId: string): RawCartridge {
  const all = catalogData.cartridges as Record<string, RawCartridge>;
  const c = all[cartridgeId];
  if (!c) throw new Error(`catalog: unknown cartridge '${cartridgeId}'`);
  return c;
}

function asDragModel(v: string): 'G1' | 'G7' {
  if (v !== 'G1' && v !== 'G7') throw new Error(`catalog: unsupported drag model '${v}'`);
  return v;
}

const RIFLE_TIERS = catalogData.rifleTiers as RifleTier[];
const GRADES = catalogData.grades as AmmoGrade[];

/** All acquirable rifles (4 cartridges × 3 tiers = 12) and ammo (4 × 2 = 8). */
export const RIFLE_MODELS: RifleModel[] = [];
export const AMMO_LOADS: AmmoLoad[] = [];

for (const cartridgeId of Object.keys(catalogData.cartridges)) {
  const c = rawCartridge(cartridgeId);
  for (const tier of RIFLE_TIERS) {
    RIFLE_MODELS.push({
      catalogId: `${cartridgeId}-${tier}`,
      cartridgeId,
      cartridgeName: c.name,
      tier,
      name: `${c.name} — ${TIER_LABEL[tier]}`,
      className: c.class,
      twist: c.twist,
      twistGating: c.twistGating,
      barrelLengthIn: c.rifle.barrelLengthIn,
      weightLb: c.rifle.weightLb,
      recoilFtLb: c.rifle.recoilFtLb,
      barrelLifeRounds: c.rifle.barrelLifeRounds,
    });
  }
  for (const grade of GRADES) {
    const l = c.loads[grade];
    AMMO_LOADS.push({
      catalogId: `${cartridgeId}-${grade}`,
      cartridgeId,
      cartridgeName: c.name,
      grade,
      product: l.product,
      dragModel: asDragModel(l.dragModel),
      massKg: l.massKg,
      diameterM: c.caliberDiameterM,
      lengthM: l.lengthM,
      believedMvMps: l.boxMvMps,
      believedBc: l.believedBc,
    });
  }
}

const RIFLE_BY_ID = new Map(RIFLE_MODELS.map((m) => [m.catalogId, m]));
const AMMO_BY_ID = new Map(AMMO_LOADS.map((a) => [a.catalogId, a]));

export function getRifleModel(catalogId: string): RifleModel {
  const m = RIFLE_BY_ID.get(catalogId);
  if (!m) throw new Error(`catalog: unknown rifle model '${catalogId}'`);
  return m;
}

export function getAmmoLoad(catalogId: string): AmmoLoad {
  const a = AMMO_BY_ID.get(catalogId);
  if (!a) throw new Error(`catalog: unknown ammo load '${catalogId}'`);
  return a;
}

/** Future progression seam (D4): everything is freely acquirable in 2.2. */
export function isUnlocked(_catalogId: string): boolean {
  return true;
}

/** Whether a cartridge is rimfire — drives the recommended zero distance
 *  (task 2.3, D8: rimfire zeroes at 50, centrefire at 100). Derived from the
 *  catalog class string so a future rimfire cartridge is covered automatically. */
export function isRimfireCartridge(cartridgeId: string): boolean {
  return rawCartridge(cartridgeId).class.toLowerCase().includes('rimfire');
}

/** The cartridge's design-set effective range in YARDS (task 2.4a, D7) — the
 *  cap on the DOPE-ladder's stations (`game/dope-book.ts` `ladderStationsM`).
 *  Authored in yd (D7 provisional: .22 LR 200, .223 600, .308 1000, 6.5 CM 1200);
 *  the ladder converts to the active display unit. Truth-neutral. */
export function catalogEffectiveRangeYd(cartridgeId: string): number {
  return rawCartridge(cartridgeId).effectiveRangeYd;
}

/** Barrel twist as a rate in meters/turn, parsed from the rifle's twist string
 *  (e.g. "1:8.0" → one turn per 8 inches → inchesToMeters(8)). Drives spin drift
 *  in the solve + the hit-sim's spin (task 2.3b). Truth-neutral geometry, not a
 *  hidden value. */
export function catalogTwistM(rifleCatalogId: string): number {
  const m = getRifleModel(rifleCatalogId);
  const parts = m.twist.split(':').map((s) => Number(s.trim()));
  const [turns, inches] = parts;
  if (parts.length !== 2 || !Number.isFinite(turns) || !Number.isFinite(inches) || turns === 0)
    throw new Error(`catalog: cannot parse twist '${m.twist}' for '${rifleCatalogId}'`);
  return inchesToMeters(inches / turns);
}

// --- Adapters to the 2.1b hidden-truth model --------------------------------

/**
 * Raw off-the-shelf pointing error, 5–35 MOA (D16, LOCKED with owner 2026-07-26).
 *
 * Deliberately large: 5 MOA is ~1.3″ at 25 yd, 35 MOA is ~9.2″ at 25 yd and ~37″
 * at 100 — off a normal target entirely, which is exactly WHY zeroing starts at
 * 25. The floor of 5 MOA means a fresh rifle is never accidentally usable.
 *
 * This supersedes the previous `designSet.zeroOffsetSdMrad` (~1 MOA SD, drawn
 * independently per axis). That value is left in the catalog data for provenance
 * but is no longer read.
 */
export const RAW_ZERO_OFFSET_RANGE = { minRad: moaToRad(5), maxRad: moaToRad(35) };

/** Hidden ranges for a rifle model (the tier's precision band + the D16 raw zero
 *  offset). `mvOffset` is a signed delta centred on 0. */
export function catalogRifleRanges(rifleCatalogId: string): RifleTruthRanges {
  const m = getRifleModel(rifleCatalogId);
  const c = rawCartridge(m.cartridgeId);
  const prec = c.rifle.inherentPrecisionMoa[m.tier];
  // Zero offset is the D16 raw off-the-shelf pointing error (RAW_ZERO_OFFSET_RANGE,
  // 5–35 MOA polar) — no longer the old per-axis `designSet.zeroOffsetSdMrad` normal
  // draw (that field stays in the catalog data for provenance but is not read here).
  return {
    mvOffset: { nominal: 0, sd: c.rifle.barrelToBarrelMvSpreadMps },
    zeroOffset: RAW_ZERO_OFFSET_RANGE,
    inherentPrecision: { nominal: moaToRad(prec.nom), sd: moaToRad(prec.sd) },
  };
}

/** Hidden ranges for an ammo lot. `meanMvShift` is a signed delta centred on 0;
 *  `bc` is centred on the true BC with a lot-to-lot spread; `bcSd` (per-shot BC
 *  scatter) is a fixed design value. */
export function catalogLotRanges(ammoCatalogId: string): LotTruthRanges {
  const a = getAmmoLoad(ammoCatalogId);
  const raw = rawCartridge(a.cartridgeId).loads[a.grade];
  return {
    meanMvShift: { nominal: 0, sd: raw.lotMeanShiftSdMps },
    mvSd: { nominal: raw.perShotMvSd.nom, sd: raw.perShotMvSd.sd },
    bc: { nominal: raw.trueBc, sd: (raw.trueBc * raw.lotBcVarPct) / 100 },
    bcSd: { nominal: catalogData.designSet.perShotBcSdFraction[a.grade], sd: 0 },
  };
}

/** The honest base MV (measured average) before per-instance/lot draws — the
 *  base onto which rifle `mvOffset` + lot `meanMvShift` are added to get the true
 *  MV. Truth-side: used by engine-bridge / the dev inspector, never the Store. */
export function lotTrueBaseMvMps(ammoCatalogId: string): number {
  const a = getAmmoLoad(ammoCatalogId);
  return rawCartridge(a.cartridgeId).loads[a.grade].trueBaseMvMps;
}

/** The believed (box) solve Load — advertised MV + BC in the load's drag model.
 *  This is what the player's DOPE is built from. */
export function believedLoad(ammoCatalogId: string): Load {
  const a = getAmmoLoad(ammoCatalogId);
  return {
    massKg: a.massKg,
    diameterM: a.diameterM,
    lengthM: a.lengthM,
    bc: a.believedBc,
    dragModel: a.dragModel,
    muzzleVelocityMps: a.believedMvMps,
  };
}

// =============================================================================
// rifle-ammo-store S3 — spec-based resolver (ADDITIVE, D19). Everything below
// is new: it reads cartridges.data.json via game/spec.ts and turns a
// RifleSpec/LoadSpec into the same kinds of shapes the id-API functions above
// produce. Nothing above this line is touched; no existing call site changes
// until S5/S6. The old id API and catalog.data.json are deleted last (S7).
//
// Encapsulation (unchanged from the id API, re-affirmed here): resolveRifleSpec
// /resolveLoadSpec expose ONLY believed values + display-neutral geometry. True
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

function resolveLoadInternal(spec: LoadSpec): ResolvedLoadV2 {
  const c = cartridgeParams(spec.cartridgeId);
  const grade = gradeParams(spec.grade);
  const preset = spec.presetId ? findPreset(spec.presetId) : undefined;
  const curve = velocityCurveParamsFor(c);
  const diameterM = inchesToMeters(c.dIn);

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
        : fpsToMps(muzzleVelocityFps(curve, preset.weightGr, c.referenceBarrelIn));
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
      : fpsToMps(muzzleVelocityFps(curve, weightGr, c.referenceBarrelIn));
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

/** Hidden ranges for a rifle spec (mirrors `catalogRifleRanges`, D16's raw zero
 *  offset unchanged). */
export function rifleRangesForSpec(spec: RifleSpec): RifleTruthRanges {
  const c = cartridgeParams(spec.cartridgeId);
  return {
    mvOffset: { nominal: 0, sd: fpsToMps(c.barrelToBarrelMvSdFps) },
    zeroOffset: RAW_ZERO_OFFSET_RANGE,
    inherentPrecision: { nominal: moaToRad(c.precisionMoa.nominal), sd: moaToRad(c.precisionMoa.sd) },
  };
}

/** Hidden ranges for a load spec (mirrors `catalogLotRanges`). D11: lot-to-lot
 *  MV shift scales with case capacity relative to the 65 CM reference (52.5 gr
 *  H2O) the base constants were fitted at. `bc.nominal` is the TRUE bc (matches
 *  the id-API's own convention — see `catalogLotRanges` above), not believed. */
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

/** The believed (box) solve Load for a spec — mirrors `believedLoad`. */
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

/** The honest base MV for a spec (before rifle/lot hidden draws) — mirrors
 *  `lotTrueBaseMvMps`. Truth-side: engine-bridge / dev inspector only. */
export function trueBaseMvForSpec(spec: LoadSpec): number {
  return resolveLoadInternal(spec).trueBaseMvMps;
}

/** Barrel twist as meters/turn — mirrors `catalogTwistM`, but with nothing to
 *  parse: `RifleSpec.twistIn` is already a plain number. */
export function twistMForSpec(spec: RifleSpec): number {
  return inchesToMeters(spec.twistIn);
}

export { PRESETS };
