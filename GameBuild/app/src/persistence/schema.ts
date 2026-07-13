// Save schema v1 (task 0.8; build-plan §6). Settings only for now — rifles,
// lots, DOPE arrive with schema v2 in Increment 2 (each bump ships a migration
// + a fixture save in the test corpus).
//
// Validation is hand-rolled structural checking (no JSON-Schema dependency —
// protocol §3): every import is validated BEFORE migration/apply.

export const CURRENT_SCHEMA_VERSION = 1;

export interface SaveSettings {
  /** Which angular unit leads in the UI; both are always shown (catalog §0.6). */
  unitsPrimary: 'MIL' | 'MOA';
}

export interface SaveData {
  schemaVersion: number;
  updatedAt: string; // ISO timestamp
  settings: SaveSettings;
}

export const DEFAULT_SAVE: SaveData = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
  updatedAt: new Date(0).toISOString(),
  settings: { unitsPrimary: 'MIL' },
};

export class SaveValidationError extends Error {}

function fail(msg: string): never {
  throw new SaveValidationError(`invalid save: ${msg}`);
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
}
