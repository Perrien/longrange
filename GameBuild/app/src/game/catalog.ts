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
import catalogData from './catalog.data.json';

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

// --- Adapters to the 2.1b hidden-truth model --------------------------------

/** Hidden ranges for a rifle model (the tier's precision band + design-set zero
 *  offset). `mvOffset`/`zeroH`/`zeroV` are signed deltas centred on 0. */
export function catalogRifleRanges(rifleCatalogId: string): RifleTruthRanges {
  const m = getRifleModel(rifleCatalogId);
  const c = rawCartridge(m.cartridgeId);
  const prec = c.rifle.inherentPrecisionMoa[m.tier];
  const zeroSd = catalogData.designSet.zeroOffsetSdMrad;
  return {
    mvOffset: { nominal: 0, sd: c.rifle.barrelToBarrelMvSpreadMps },
    zeroH: { nominal: 0, sd: zeroSd },
    zeroV: { nominal: 0, sd: zeroSd },
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
