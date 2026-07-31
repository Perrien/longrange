// Save schema (task 0.8; build-plan §6). v1 persisted settings only. v2
// (Increment 2, task 2.1a) adds the hidden-truth record arrays — `rifles[]`
// (instances) and `ammoLots[]` — and carries three durable player settings into
// persistence (D5). Every bump ships a migration (migrations.ts) + a fixture
// save in the test corpus (persistence.test.ts), per guardrail §4.6.
//
// Validation is hand-rolled structural checking (no JSON-Schema dependency —
// protocol §3): every import is validated BEFORE migration/apply.

export const CURRENT_SCHEMA_VERSION = 2;

export interface SaveSettings {
  /** Which angular unit leads in the UI; both are always shown (catalog §0.6). */
  unitsPrimary: 'MIL' | 'MOA';
  /** Steady vs. Realistic wind (task 1.7a, D1). Optional/additive — an older
   *  save (or a fixture predating 1.7) simply has it absent, and `saveToSettings`
   *  defaults it to 'steady'. The v1→v2 migration leaves this handling intact. */
  windRealism?: 'steady' | 'realistic';
  /** Durable player settings carried into persistence at the v2 bump (D5).
   *  Optional so a pre-v2 save (which lacks them) still passes shape-validation,
   *  which runs BEFORE migration; the v1→v2 migration fills them from
   *  DEFAULT_SAVE, and `saveToSettings` defaults them when otherwise absent. */
  sensitivity?: number;
  traceEnabled?: boolean;
  windMarkerStyle?: 'flag' | 'sock' | 'both';
  /** Mirage strength preset (task 1.7c; on/off → four-way in W6). Added
   *  additive-optional AFTER the v2 bump (owner decision 2026-07-31,
   *  superseding D9's "store-only") — same handling as `windRealism`: no
   *  migration entry needed (see `migrations.ts`'s NOTE), a save predating it
   *  simply omits the field, and `saveToSettings` defaults it to the current
   *  store value (`defaultSettings()`'s `'medium'` on a fresh store). */
  mirageStrength?: 'off' | 'light' | 'medium' | 'heavy';
}

/** Normalized [0,1) draws keyed BY FIELD NAME (D1). These are the stored
 *  identity of an instance — NOT the truth and NOT an RNG seed: they map to
 *  truth on demand via game/hidden-truth.ts (task 2.1b). Keying by name (not a
 *  positional array) means a new hidden field later is just a new key — nothing
 *  existing reshuffles. Reading a bare `0.42` is meaningless without the mapping
 *  + catalog ranges, which is the intended (soft) spoiling-resistance bar. */
export type RifleDraws = Record<string, number>; // e.g. { mvOffset, zeroH, zeroV, inherentPrecision }
export type LotDraws = Record<string, number>; //   e.g. { meanMvShift, mvSd, bcError, bcSd }

/** Pre-sketched optional field (D6) — the confirmed player zero correction,
 *  populated by the zeroing flow in task 2.3. Additive-optional: validated only
 *  when present, so it needs no schema bump when 2.3 lands (and 2.3 may extend
 *  this shape with range/conditions the same additive way). */
export interface PlayerZero {
  elevationRad: number;
  windageRad: number;
  /** SI distance the zero was confirmed at (task 2.3, D5) — a physical fact,
   *  stored in meters (its display flips MIL⇄MOA without moving the zero, D3).
   *  Additive-optional: a playerZero written before 2.3 lacks it, so it is
   *  validated only when present — no schema bump (2.1 D6 pattern). */
  zeroRangeM?: number;
}

/** Where an effective MV/BC value came from (DOPE book, P2/D15). `box` = catalog
 *  default; `chrono` = measured MV; `trued` = fitted BC from a confirmed hold;
 *  `provisional` = carried forward from a prior lot on Replenish, unverified. */
export type EffectiveSource = 'box' | 'chrono' | 'trued' | 'provisional';

/** The lot's effective ballistics — what actually drives its believed DOPE, with
 *  a source tag per value (P2). Empty/box until a chrono (MV) or a confirmed hold
 *  (BC) supersedes it. Additive-optional; validated only when present. */
export interface EffectiveParams {
  mvMps?: number;
  bc?: number;
  mvSource: EffectiveSource;
  bcSource: EffectiveSource;
  /** ISO timestamp of the last BC fit (bc-truing-plan T4, D15's re-true loop).
   *  Additive-optional, no version bump; absent means "unknown, don't warn" —
   *  a save from before this field existed, or a BC that's never been trued.
   *  Compared against the lot's `ChronoSummary.updatedAtIso` to flag a BC fitted
   *  before the most recent chrono (stale, but never invalidated — D15: last
   *  write wins). */
  bcSetAt?: string;
}

/** A specific rifle the player owns (v2). Truth = map(draws, catalog ranges);
 *  `catalogVersion` stamps the ranges the draws were rolled under (D2). */
export interface RifleInstance {
  id: string;
  catalogId: string;
  catalogVersion: number;
  draws: RifleDraws;
  playerZero?: PlayerZero;
  /** Epoch-ms acquisition time (P2). Additive-optional: a pre-P2 record lacks it
   *  and the loader backfills 0 (unknown). */
  acquiredAt?: number;
  /** Rounds ever fired through this rifle copy (P2). Additive-optional; loader
   *  backfills 0. */
  lifetimeShotCount?: number;
}

/** A specific ammo lot the player owns (v2). */
export interface AmmoLot {
  id: string;
  catalogId: string;
  catalogVersion: number;
  draws: LotDraws;
  /** Human-facing lot code `[A-Z][0-9][0-9]` (P2), non-sequential. Additive-
   *  optional: the loader assigns a stable unique one to any record lacking it. */
  lotNumber?: string;
  /** Rounds left in the lot (P2). Additive-optional; loader backfills the default
   *  lot size. Decrements as the lot is fired. */
  roundsRemaining?: number;
  /** Epoch-ms acquisition time (P2). Additive-optional; loader backfills 0. */
  acquiredAt?: number;
  /** Effective (discovered/overridden) MV/BC with source tags (P2). Absent = pure
   *  box values. Written by chrono (MV), truing (BC), and Replenish carry-forward. */
  effective?: EffectiveParams;
}

/** A confirmed DOPE node (task 2.4a, D2/D5) — a physical fact the player
 *  recorded: the dials they actually held at a station, the group behind it, and
 *  the conditions at confirm. Belongs to a rifle+lot PAIRING (keyed by both ids),
 *  so it lives in a top-level `dopeNodes[]` array, not under one record. The
 *  angular dials are relative to the rifle's stored zero (`playerZero` sits UNDER
 *  the dial, so it is excluded by construction — see store `confirmZero`).
 *
 *  Additive-optional (2.1 D6 / 2.3a pattern): `dopeNodes?` is validated only when
 *  present and needs NO schema-version bump — a save predating 2.4a simply omits
 *  it and the loader defaults to `[]`. */
export interface DopeNode {
  rifleId: string;
  lotId: string;
  /** SI distance of the station actually shot (a physical fact, meters). */
  distanceM: number;
  /** Measured dials at confirm, radians, relative to the stored zero. */
  elevationRad: number;
  windageRad: number;
  /** The zero reference (SI distance) the come-up is against — self-describing so
   *  the data book can flag the node stale if the rifle is later re-zeroed. */
  zeroRangeM: number;
  /** The confirming group: shots fired since the last elevation-dial change, and
   *  how many struck the engaged plate. */
  shots: number;
  hits: number;
  /** Conditions snapshotted at confirm (the ISA numbers used + wind). */
  conditions: {
    windSpeedMps: number;
    windDirectionDeg: number;
    tempC: number;
    pressurePa: number;
  };
  confirmedAtIso: string;
}

/** A chronograph summary for a rifle+lot pairing (task 2.4e, D10) — the measured
 *  muzzle-velocity statistics the player has recorded, merged across strings
 *  (Welford). `avgMps`/`sdMps` are ESTIMATES of the lot's true mean/SD (the box
 *  gives neither honestly), improving with shot count; never the hidden truth.
 *  Additive-optional (`chronoSummaries?`), no schema-version bump — a save
 *  predating 2.4e omits it and the loader defaults to `[]`. */
export interface ChronoSummary {
  rifleId: string;
  lotId: string;
  /** Total chrono'd shots merged into this summary. */
  shots: number;
  /** Running mean + sample SD (Welford-combined across strings), m/s. */
  avgMps: number;
  sdMps: number;
  /** Extreme spread bounds (ES = maxMps − minMps), m/s. */
  minMps: number;
  maxMps: number;
  updatedAtIso: string;
}

export interface SaveData {
  schemaVersion: number;
  updatedAt: string; // ISO timestamp
  settings: SaveSettings;
  /** Owned rifle instances (v2). Empty until the gear catalog lands (task 2.2). */
  rifles: RifleInstance[];
  /** Owned ammo lots (v2). Empty until the gear catalog lands (task 2.2). */
  ammoLots: AmmoLot[];
  /** Active loadout selection (task 2.2b, D10) — additive-optional, no version
   *  bump (2.1 D6 pattern); validated when present, defaulted to null on load. */
  activeRifleId?: string | null;
  activeLotId?: string | null;
  /** Confirmed DOPE nodes (task 2.4a) — additive-optional, no version bump;
   *  validated when present, defaulted to `[]` on load. */
  dopeNodes?: DopeNode[];
  /** Chronograph summaries per rifle+lot (task 2.4e) — additive-optional, no
   *  version bump; validated when present, defaulted to `[]` on load. */
  chronoSummaries?: ChronoSummary[];
}

export const DEFAULT_SAVE: SaveData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  updatedAt: new Date(0).toISOString(),
  settings: {
    unitsPrimary: 'MIL',
    windRealism: 'steady',
    sensitivity: 1.0,
    traceEnabled: true,
    windMarkerStyle: 'flag',
    mirageStrength: 'medium',
  },
  rifles: [],
  ammoLots: [],
  activeRifleId: null,
  activeLotId: null,
  dopeNodes: [],
  chronoSummaries: [],
};

export class SaveValidationError extends Error {}

function fail(msg: string): never {
  throw new SaveValidationError(`invalid save: ${msg}`);
}

/** Every value of a `draws` map must be a normalized number in [0, 1) (D1). */
function validateDraws(draws: unknown, ctx: string): void {
  if (typeof draws !== 'object' || draws === null) fail(`${ctx}.draws missing`);
  for (const [k, v] of Object.entries(draws as Record<string, unknown>)) {
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 0 || v >= 1)
      fail(`${ctx}.draws.${k} must be a normalized [0,1) number`);
  }
}

function validatePlayerZero(pz: unknown, ctx: string): void {
  if (typeof pz !== 'object' || pz === null) fail(`${ctx}.playerZero not an object`);
  const o = pz as Record<string, unknown>;
  if (typeof o.elevationRad !== 'number' || !Number.isFinite(o.elevationRad))
    fail(`${ctx}.playerZero.elevationRad must be a finite number`);
  if (typeof o.windageRad !== 'number' || !Number.isFinite(o.windageRad))
    fail(`${ctx}.playerZero.windageRad must be a finite number`);
  // zeroRangeM (task 2.3): additive-optional, validated only when present.
  if (
    o.zeroRangeM !== undefined &&
    (typeof o.zeroRangeM !== 'number' || !Number.isFinite(o.zeroRangeM))
  )
    fail(`${ctx}.playerZero.zeroRangeM must be a finite number when present`);
}

function finiteNumber(v: unknown, ctx: string): void {
  if (typeof v !== 'number' || !Number.isFinite(v)) fail(`${ctx} must be a finite number`);
}

function validateRifle(r: unknown, i: number): void {
  const ctx = `rifles[${i}]`;
  if (typeof r !== 'object' || r === null) fail(`${ctx} not an object`);
  const o = r as Record<string, unknown>;
  if (typeof o.id !== 'string') fail(`${ctx}.id missing`);
  if (typeof o.catalogId !== 'string') fail(`${ctx}.catalogId missing`);
  if (typeof o.catalogVersion !== 'number' || !Number.isInteger(o.catalogVersion))
    fail(`${ctx}.catalogVersion must be an integer`);
  validateDraws(o.draws, ctx);
  if (o.playerZero !== undefined) validatePlayerZero(o.playerZero, ctx);
  // P2 additive-optional fields — validated only when present.
  if (o.acquiredAt !== undefined) finiteNumber(o.acquiredAt, `${ctx}.acquiredAt`);
  if (o.lifetimeShotCount !== undefined) finiteNumber(o.lifetimeShotCount, `${ctx}.lifetimeShotCount`);
}

const EFFECTIVE_SOURCES = new Set(['box', 'chrono', 'trued', 'provisional']);

function validateEffective(e: unknown, ctx: string): void {
  if (typeof e !== 'object' || e === null) fail(`${ctx}.effective not an object`);
  const o = e as Record<string, unknown>;
  if (o.mvMps !== undefined) finiteNumber(o.mvMps, `${ctx}.effective.mvMps`);
  if (o.bc !== undefined) finiteNumber(o.bc, `${ctx}.effective.bc`);
  if (typeof o.mvSource !== 'string' || !EFFECTIVE_SOURCES.has(o.mvSource))
    fail(`${ctx}.effective.mvSource must be box|chrono|trued|provisional`);
  if (typeof o.bcSource !== 'string' || !EFFECTIVE_SOURCES.has(o.bcSource))
    fail(`${ctx}.effective.bcSource must be box|chrono|trued|provisional`);
  if (o.bcSetAt !== undefined && typeof o.bcSetAt !== 'string')
    fail(`${ctx}.effective.bcSetAt must be a string when present`);
}

function validateLot(l: unknown, i: number): void {
  const ctx = `ammoLots[${i}]`;
  if (typeof l !== 'object' || l === null) fail(`${ctx} not an object`);
  const o = l as Record<string, unknown>;
  if (typeof o.id !== 'string') fail(`${ctx}.id missing`);
  if (typeof o.catalogId !== 'string') fail(`${ctx}.catalogId missing`);
  if (typeof o.catalogVersion !== 'number' || !Number.isInteger(o.catalogVersion))
    fail(`${ctx}.catalogVersion must be an integer`);
  validateDraws(o.draws, ctx);
  // P2 additive-optional fields — validated only when present.
  if (o.lotNumber !== undefined && typeof o.lotNumber !== 'string')
    fail(`${ctx}.lotNumber must be a string when present`);
  if (o.roundsRemaining !== undefined) finiteNumber(o.roundsRemaining, `${ctx}.roundsRemaining`);
  if (o.acquiredAt !== undefined) finiteNumber(o.acquiredAt, `${ctx}.acquiredAt`);
  if (o.effective !== undefined) validateEffective(o.effective, ctx);
}

function validateDopeNode(n: unknown, i: number): void {
  const ctx = `dopeNodes[${i}]`;
  if (typeof n !== 'object' || n === null) fail(`${ctx} not an object`);
  const o = n as Record<string, unknown>;
  if (typeof o.rifleId !== 'string') fail(`${ctx}.rifleId missing`);
  if (typeof o.lotId !== 'string') fail(`${ctx}.lotId missing`);
  finiteNumber(o.distanceM, `${ctx}.distanceM`);
  finiteNumber(o.elevationRad, `${ctx}.elevationRad`);
  finiteNumber(o.windageRad, `${ctx}.windageRad`);
  finiteNumber(o.zeroRangeM, `${ctx}.zeroRangeM`);
  finiteNumber(o.shots, `${ctx}.shots`);
  finiteNumber(o.hits, `${ctx}.hits`);
  if (typeof o.conditions !== 'object' || o.conditions === null)
    fail(`${ctx}.conditions missing`);
  const c = o.conditions as Record<string, unknown>;
  finiteNumber(c.windSpeedMps, `${ctx}.conditions.windSpeedMps`);
  finiteNumber(c.windDirectionDeg, `${ctx}.conditions.windDirectionDeg`);
  finiteNumber(c.tempC, `${ctx}.conditions.tempC`);
  finiteNumber(c.pressurePa, `${ctx}.conditions.pressurePa`);
  if (typeof o.confirmedAtIso !== 'string') fail(`${ctx}.confirmedAtIso missing`);
}

function validateChronoSummary(c: unknown, i: number): void {
  const ctx = `chronoSummaries[${i}]`;
  if (typeof c !== 'object' || c === null) fail(`${ctx} not an object`);
  const o = c as Record<string, unknown>;
  if (typeof o.rifleId !== 'string') fail(`${ctx}.rifleId missing`);
  if (typeof o.lotId !== 'string') fail(`${ctx}.lotId missing`);
  finiteNumber(o.shots, `${ctx}.shots`);
  finiteNumber(o.avgMps, `${ctx}.avgMps`);
  finiteNumber(o.sdMps, `${ctx}.sdMps`);
  finiteNumber(o.minMps, `${ctx}.minMps`);
  finiteNumber(o.maxMps, `${ctx}.maxMps`);
  if (typeof o.updatedAtIso !== 'string') fail(`${ctx}.updatedAtIso missing`);
}

/** Structural validation of an untrusted parsed object (pre-migration). */
export function validateSaveShape(data: unknown): asserts data is SaveData {
  if (typeof data !== 'object' || data === null) fail('not an object');
  const d = data as Record<string, unknown>;
  if (typeof d.schemaVersion !== 'number' || !Number.isInteger(d.schemaVersion))
    fail('schemaVersion missing or not an integer');
  if (d.schemaVersion < 1) fail(`schemaVersion ${d.schemaVersion} < 1`);
  if (d.schemaVersion > CURRENT_SCHEMA_VERSION)
    fail(
      `schemaVersion ${d.schemaVersion} is newer than this app supports ` +
        `(${CURRENT_SCHEMA_VERSION}) — update the app before importing`,
    );
  if (typeof d.updatedAt !== 'string') fail('updatedAt missing');
  if (typeof d.settings !== 'object' || d.settings === null) fail('settings missing');
  const s = d.settings as Record<string, unknown>;
  if (s.unitsPrimary !== 'MIL' && s.unitsPrimary !== 'MOA')
    fail(`settings.unitsPrimary must be 'MIL' | 'MOA'`);
  // Additive/optional settings — validated only when present, so a save written
  // before the field existed (windRealism: pre-1.7; the three carry-overs:
  // pre-v2; mirageStrength: pre-W6-close-out) still passes. The migration/loader
  // supplies defaults.
  if (
    s.windRealism !== undefined &&
    s.windRealism !== 'steady' &&
    s.windRealism !== 'realistic'
  )
    fail(`settings.windRealism must be 'steady' | 'realistic' when present`);
  if (
    s.sensitivity !== undefined &&
    (typeof s.sensitivity !== 'number' || !Number.isFinite(s.sensitivity))
  )
    fail('settings.sensitivity must be a finite number when present');
  if (s.traceEnabled !== undefined && typeof s.traceEnabled !== 'boolean')
    fail('settings.traceEnabled must be a boolean when present');
  if (
    s.windMarkerStyle !== undefined &&
    s.windMarkerStyle !== 'flag' &&
    s.windMarkerStyle !== 'sock' &&
    s.windMarkerStyle !== 'both'
  )
    fail(`settings.windMarkerStyle must be 'flag' | 'sock' | 'both' when present`);
  if (
    s.mirageStrength !== undefined &&
    s.mirageStrength !== 'off' &&
    s.mirageStrength !== 'light' &&
    s.mirageStrength !== 'medium' &&
    s.mirageStrength !== 'heavy'
  )
    fail(`settings.mirageStrength must be 'off' | 'light' | 'medium' | 'heavy' when present`);

  // Hidden-truth record arrays (v2). Required from v2 on; a v1 save legitimately
  // lacks them (the migration adds empty arrays), so only *require* them at v2+,
  // but validate element-wise whenever present.
  if (d.schemaVersion >= 2) {
    if (!Array.isArray(d.rifles)) fail('rifles[] missing (required at schema v2)');
    if (!Array.isArray(d.ammoLots)) fail('ammoLots[] missing (required at schema v2)');
  }
  if (d.rifles !== undefined) {
    if (!Array.isArray(d.rifles)) fail('rifles must be an array when present');
    d.rifles.forEach((r, i) => validateRifle(r, i));
  }
  if (d.ammoLots !== undefined) {
    if (!Array.isArray(d.ammoLots)) fail('ammoLots must be an array when present');
    d.ammoLots.forEach((l, i) => validateLot(l, i));
  }

  // Active loadout selection (task 2.2b, D10). Additive-optional: absent on a
  // pre-2.2b save; `null` means "nothing selected"; a string is an instance id.
  if (d.activeRifleId !== undefined && d.activeRifleId !== null && typeof d.activeRifleId !== 'string')
    fail('activeRifleId must be a string or null when present');
  if (d.activeLotId !== undefined && d.activeLotId !== null && typeof d.activeLotId !== 'string')
    fail('activeLotId must be a string or null when present');

  // Confirmed DOPE nodes (task 2.4a). Additive-optional: absent on a pre-2.4a
  // save; validated element-wise whenever present. Never *required* (no version
  // bump) — the loader defaults to [].
  if (d.dopeNodes !== undefined) {
    if (!Array.isArray(d.dopeNodes)) fail('dopeNodes must be an array when present');
    d.dopeNodes.forEach((n, i) => validateDopeNode(n, i));
  }

  // Chronograph summaries (task 2.4e). Additive-optional, same discipline as
  // dopeNodes — validated element-wise when present, defaulted to [] on load.
  if (d.chronoSummaries !== undefined) {
    if (!Array.isArray(d.chronoSummaries)) fail('chronoSummaries must be an array when present');
    d.chronoSummaries.forEach((c, i) => validateChronoSummary(c, i));
  }
}
