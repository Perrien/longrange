// Forward migrations (task 0.8; build-plan §6). Every schema bump adds an
// entry `n: (save) => saveAtN+1` and a fixture save to the test corpus.
// Imports and loads both run through `migrateSave` after shape validation.

import { CURRENT_SCHEMA_VERSION, type SaveData } from './schema';

type Migration = (save: SaveData) => SaveData;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // v1 is current — no migrations yet. Increment 2 adds `1: v1toV2`.
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
