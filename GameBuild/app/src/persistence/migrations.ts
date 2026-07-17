// Forward migrations (task 0.8; build-plan §6). Every schema bump adds an
// entry `n: (save) => saveAtN+1` and a fixture save to the test corpus.
// Imports and loads both run through `migrateSave` after shape validation.

import { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE, type SaveData } from './schema';

type Migration = (save: SaveData) => SaveData;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 → v2 (Increment 2, task 2.1a): introduce the hidden-truth record arrays
  // (empty — the player owns no gear until the catalog lands in task 2.2) and
  // carry three durable settings into persistence (D5), defaulted from
  // DEFAULT_SAVE when the v1 save didn't have them. `windRealism` handling is
  // left intact — it stays an optional field, defaulted at load by
  // `saveToSettings`, so it is deliberately not touched here.
  1: (save) => ({
    ...save,
    schemaVersion: 2,
    rifles: [],
    ammoLots: [],
    settings: {
      ...save.settings,
      sensitivity: save.settings.sensitivity ?? DEFAULT_SAVE.settings.sensitivity,
      traceEnabled: save.settings.traceEnabled ?? DEFAULT_SAVE.settings.traceEnabled,
      windMarkerStyle:
        save.settings.windMarkerStyle ?? DEFAULT_SAVE.settings.windMarkerStyle,
    },
  }),
};

export function migrateSave(save: SaveData): SaveData {
  let current = save;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const step = migrations[current.schemaVersion];
    if (!step) {
      throw new Error(
        `no migration from schema v${current.schemaVersion} — corrupt save or missing migration`,
      );
    }
    current = step(current);
  }
  return current;
}
