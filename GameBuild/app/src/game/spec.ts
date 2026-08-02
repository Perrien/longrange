// rifle-ammo-store S3 — spec types + band clamping. A "spec" is the small,
// serializable description of a configured rifle or ammo load (what the Store
// build screen controls and what a save file stores, post-v3 — S4). Turning a
// spec into everything the rest of the app needs (believed values, geometry,
// hidden-truth ranges) is catalog.ts's job (resolve*ForSpec); this module only
// defines the shape and clamps it to the cartridge's authored bands.
import cartridgesData from './cartridges.data.json';
import { clamp } from './ballistic-derivation';

// Duplicated (not imported) from catalog.ts's `AmmoGrade` to avoid a circular
// import — catalog.ts's S3 additions import FROM spec.ts, not the reverse.
// Structurally identical, so both are interchangeable at every call site.
export type AmmoGrade = 'match' | 'bulk';

/** A configured rifle: which cartridge, how long a barrel, which twist. Twist
 *  is inches-per-turn as a plain number (1:8 → `8`), not the old `"1:8.0"`
 *  string — nothing needs to parse it anymore (see `twistMForSpec`). */
export interface RifleSpec {
  cartridgeId: string;
  barrelLengthIn: number;
  twistIn: number;
}

/** A configured ammo load: bullet weight + profile (i7, form factor) + grade.
 *  `i7` is meaningless for .22 LR (D8 — G1, no SD/form-factor apparatus) and is
 *  ignored by `resolveLoadSpec` for rimfire cartridges; `presetId`, when set,
 *  is REQUIRED for rimfire (there is no weight/i7 slider to hand-build from)
 *  and optional everywhere else (a preset's sliders can still be nudged, which
 *  clears it — D17). */
export interface LoadSpec {
  cartridgeId: string;
  weightGr: number;
  i7: number;
  grade: AmmoGrade;
  presetId?: string;
}

// --- Raw cartridge data access (shared with catalog.ts's resolvers) ---------

interface RangeGr {
  min: number;
  max: number;
}

export interface CartridgeParamsV2 {
  name: string;
  class: string;
  dIn: number;
  capacityGrH2O: number;
  velocityCurve: { a: number; kAnchored: number; anchorWeightGr: number; anchorMvFps: number };
  presetsOnly: boolean;
  weightRangeGr: RangeGr | null;
  i7Range: RangeGr | null;
  barrelBandIn: RangeGr;
  referenceBarrelIn: number;
  fpsPerIn: number;
  n: number;
  twistOptionsInPerTurn: number[];
  barrelLifeRounds: number;
  barrelToBarrelMvSdFps: number;
  precisionMoa: { nominal: number; sd: number };
}

export interface GradeParamsV2 {
  perShotMvSdMps: { nominal: number; sd: number };
  lotShiftBaseMps: number;
  lotBcVarFraction: number;
  perShotBcSdFraction: number;
  mvOptimism: number;
  bcOptimism: number;
}

export interface PresetV2 {
  id: string;
  cartridgeId: string;
  name: string;
  grade: AmmoGrade;
  dragModel: 'G1' | 'G7';
  weightGr: number;
  i7?: number;
  trueBc?: number;
  lengthMOverride?: number;
  mvFpsOverride?: number;
  oracleLoadId: string | null;
}

const CARTRIDGES = cartridgesData.cartridges as unknown as Record<string, CartridgeParamsV2>;
const GRADES = cartridgesData.grades as unknown as Record<AmmoGrade, GradeParamsV2>;
const PRESETS = cartridgesData.presets as unknown as PresetV2[];
const PRESETS_BY_ID = new Map(PRESETS.map((p) => [p.id, p]));

/** All 10 cartridge ids, in cartridges.data.json's authored order. */
export const CARTRIDGE_IDS_V2: string[] = Object.keys(CARTRIDGES);

/** cartridges.data.json's own `catalogVersion` (2) — stamps every spec-built
 *  RifleInstance/AmmoLot's `catalogVersion` field (S4, D2/D10) so a future data
 *  revision can tell which ranges an instance's draws were rolled under. NOT
 *  the same counter as the old (soon-deleted) catalog.data.json's `catalogVersion`. */
export const CARTRIDGES_CATALOG_VERSION: number = cartridgesData.catalogVersion;

export function cartridgeParams(cartridgeId: string): CartridgeParamsV2 {
  const c = CARTRIDGES[cartridgeId];
  if (!c) throw new Error(`spec: unknown cartridge '${cartridgeId}'`);
  return c;
}

export function gradeParams(grade: AmmoGrade): GradeParamsV2 {
  const g = GRADES[grade];
  if (!g) throw new Error(`spec: unknown grade '${grade}'`);
  return g;
}

export function findPreset(presetId: string): PresetV2 {
  const p = PRESETS_BY_ID.get(presetId);
  if (!p) throw new Error(`spec: unknown preset '${presetId}'`);
  return p;
}

export function presetsForCartridge(cartridgeId: string): PresetV2[] {
  return PRESETS.filter((p) => p.cartridgeId === cartridgeId);
}

export { PRESETS };

/** Global length-class table (§3.4, D9) — exported for ballistic-derivation
 *  callers that need a cartridge's `C` constant without going through catalog.ts. */
export function lengthClassCFor(cartridgeId: string): number {
  for (const cls of Object.values(cartridgesData.lengthClasses)) {
    if ('cartridgeIds' in cls && (cls.cartridgeIds as string[]).includes(cartridgeId)) {
      return (cls as { C: number }).C;
    }
  }
  throw new Error(`spec: no length class covers cartridge '${cartridgeId}'`);
}

export const RECOIL_CONSTANTS = cartridgesData.recoil;
export const LOT_SHIFT_REFERENCE = cartridgesData.lotShiftReference;

// --- Clamping (S2's `clamp`, applied per-field against the authored bands) --

/** Clamp a rifle spec's barrel length to the cartridge's authored band. Twist
 *  is a discrete list (D3), not a continuous clamp — an off-list value snaps to
 *  the nearest option rather than being scaled. */
export function clampRifleSpec(spec: RifleSpec): RifleSpec {
  const c = cartridgeParams(spec.cartridgeId);
  const barrelLengthIn = clamp(spec.barrelLengthIn, c.barrelBandIn.min, c.barrelBandIn.max);
  const twistIn = c.twistOptionsInPerTurn.includes(spec.twistIn)
    ? spec.twistIn
    : nearest(spec.twistIn, c.twistOptionsInPerTurn);
  return { cartridgeId: spec.cartridgeId, barrelLengthIn, twistIn };
}

/** Clamp a load spec's weight/i7 to the cartridge's authored band. Rimfire
 *  (presetsOnly) cartridges have no weight/i7 band — passed through unchanged
 *  (resolveLoadSpec ignores both fields for G1 cartridges anyway, D8). */
export function clampLoadSpec(spec: LoadSpec): LoadSpec {
  const c = cartridgeParams(spec.cartridgeId);
  if (c.presetsOnly || !c.weightRangeGr || !c.i7Range) return { ...spec };
  return {
    ...spec,
    weightGr: clamp(spec.weightGr, c.weightRangeGr.min, c.weightRangeGr.max),
    i7: clamp(spec.i7, c.i7Range.min, c.i7Range.max),
  };
}

/** Build a LoadSpec from a named preset (D17 — preset chips snap the ammo
 *  sliders). `i7` is 0 for rimfire presets (G1, unused by resolveLoadSpec). */
export function specFromPreset(presetId: string): LoadSpec {
  const p = findPreset(presetId);
  return { cartridgeId: p.cartridgeId, weightGr: p.weightGr, i7: p.i7 ?? 0, grade: p.grade, presetId: p.id };
}

function nearest(v: number, options: number[]): number {
  return options.reduce((best, opt) => (Math.abs(opt - v) < Math.abs(best - v) ? opt : best));
}

// --- Default builds (a representative rifle+load per cartridge) ------------
//
// Used to open a freshly-tapped BuildScreen at a sensible starting point, and
// (rifle-ammo-store S12) to give the Store's cartridge-list overview and its
// effective-range figure something concrete to solve against before the
// player has configured anything themselves.

/** Default rifle build for a freshly opened build screen: the cartridge's
 *  reference barrel length and its first listed twist option. */
export function defaultRifleSpec(cartridgeId: string): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

/** Default ammo build: the first MATCH preset if this cartridge has one, else
 *  the first preset of any grade, else (no shipped preset — 6mm CM / 6.5 PRC /
 *  .300 WM / .300 PRC) a hand-built load at the velocity curve's own anchor
 *  weight (a representative bullet the cartridge's `k` was fitted against) and
 *  the middle of the i7 band. Rimfire (D8) always has a preset, so the
 *  no-preset branch never fires for it. */
export function defaultLoadSpec(cartridgeId: string): LoadSpec {
  const presets = presetsForCartridge(cartridgeId);
  const preset = presets.find((p) => p.grade === 'match') ?? presets[0];
  if (preset) return specFromPreset(preset.id);
  const c = cartridgeParams(cartridgeId);
  return {
    cartridgeId,
    weightGr: c.velocityCurve.anchorWeightGr,
    i7: (c.i7Range!.min + c.i7Range!.max) / 2,
    grade: 'match',
  };
}
