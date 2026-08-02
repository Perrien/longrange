// Forward migrations (task 0.8; build-plan §6). Every schema bump adds an
// entry `n: (save) => saveAtN+1` and a fixture save to the test corpus.
// Imports and loads both run through `migrateSave` after shape validation.

import { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE, type SaveData } from './schema';

type Migration = (save: SaveData) => SaveData;

/** migrations[n] upgrades a version-n save to version n+1. */
const migrations: Record<number, Migration> = {
  // NOTE: additive-optional fields (playerZero, zeroRangeM, dopeNodes,
  // chronoSummaries — 2.1 D6 / 2.3a / 2.4a / 2.4e) need NO migration entry: a save
  // predating them simply omits the field, shape-validation skips it (validated
  // only when present), and the loader defaults it (e.g. `saveToChrono` → []).
  // Only a structural change that an old save can't satisfy warrants a version
  // bump + a migration here.
  //
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

  // v2 → v3 (rifle-ammo-store S4, D16): RifleInstance.spec/AmmoLot.spec replace
  // catalogId — NOT additive-optional (a record has one shape), so unlike every
  // other bump in this file this one can't just default a missing field. Owned
  // gear built under the old id catalog has no meaningful spec to construct (the
  // rifle-tier/ammo-grade axes it was built from no longer exist), so per D16
  // (owner's explicit, confirmed 2026-08-01 choice — single-user project, no
  // in-app notice/warning/confirmation) the wipe is silent: every owned-gear
  // array clears, along with DOPE nodes, chrono history and the active
  // selection, which all reference rifle/lot ids that no longer exist.
  // `settings` is untouched — it carries no gear-shaped data.
  2: (save) => ({
    ...save,
    schemaVersion: 3,
    rifles: [],
    ammoLots: [],
    dopeNodes: [],
    chronoSummaries: [],
    activeRifleId: null,
    activeLotId: null,
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
