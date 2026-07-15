// Settings persistence wiring (task 1.1).
//
// The store's `settings` slice is bridged to the SaveStore seam (task 0.8).
// IMPORTANT — schema scope: save schema v1 (persistence/schema.ts) persists
// `unitsPrimary` and, as of task 1.7a, `windRealism` (an additive OPTIONAL v1
// field — no version bump, see schema.ts). `sensitivity`/`traceEnabled` are
// still store-only: they live in the running session but are NOT written to
// disk until schema v2 adds fields for them (Increment 2 owns the v2 bump +
// migration + fixture, per guardrail §4.6 and the schema.ts note). See
// PROGRESS.md "Deferred observations".
//
// Pure mappers (settingsToSave / saveToSettings) are unit-tested; the async
// load/subscribe wiring is thin glue for the app shell.

import { DEFAULT_SAVE, type SaveData, type SaveStore } from '../persistence';
import type { GameStore, SettingsState } from './store';

/** Project the store's settings onto a SaveData (only the v1-persisted fields). */
export function settingsToSave(settings: SettingsState, base: SaveData = DEFAULT_SAVE): SaveData {
  return {
    ...base,
    settings: { unitsPrimary: settings.unitsPrimary, windRealism: settings.windRealism },
  };
}

/** Apply a loaded SaveData back onto settings, preserving store-only fields.
 *  `windRealism` defaults to 'steady' when absent (a save written before 1.7,
 *  or any save that simply never set it — the field is optional). */
export function saveToSettings(save: SaveData, current: SettingsState): SettingsState {
  return {
    ...current,
    unitsPrimary: save.settings.unitsPrimary,
    windRealism: save.settings.windRealism ?? 'steady',
  };
}

/** Zustand store handle (create()'s return): getState + subscribe. */
type StoreApi = {
  getState(): GameStore;
  subscribe(listener: (state: GameStore, prev: GameStore) => void): () => void;
};

/** Load persisted settings (if any) into the store on app start. */
export async function loadSettingsInto(store: StoreApi, saveStore: SaveStore): Promise<void> {
  const save = await saveStore.load();
  if (save) store.getState().applySettings(saveToSettings(save, store.getState().settings));
}

/** Persist settings to the SaveStore whenever the settings slice changes.
 *  Returns the unsubscribe handle. */
export function persistSettingsOnChange(store: StoreApi, saveStore: SaveStore): () => void {
  return store.subscribe((state, prev) => {
    if (state.settings !== prev.settings) {
      void saveStore.save(settingsToSave(state.settings));
    }
  });
}
