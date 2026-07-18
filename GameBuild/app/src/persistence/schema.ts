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
   *  DEFAULT_SAVE, and `saveToSettings` defaults them when otherwise absent.
   *  `mirageEnabled` is deliberately NOT here — it stays store-only until the
   *  feature ships (D5). */
  sensitivity?: number;
  traceEnabled?: boolean;
  windMarkerStyle?: 'flag' | 'sock' | 'both';
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
}

/** A specific rifle the player owns (v2). Truth = map(draws, catalog ranges);
 *  `catalogVersion` stamps the ranges the draws were rolled under (D2). */
export interface RifleInstance {
  id: string;
  catalogId: string;
  catalogVersion: number;
  draws: RifleDraws;
  playerZero?: PlayerZero;
}

/** A specific ammo lot the player owns (v2). */
export interface AmmoLot {
  id: string;
  catalogId: string;
  catalogVersion: number;
  draws: LotDraws;
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
  },
  rifles: [],
  ammoLots: [],
  activeRifleId: null,
  activeLotId: null,
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
  // pre-v2) still passes. The migration/loader supplies defaults.
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
}
