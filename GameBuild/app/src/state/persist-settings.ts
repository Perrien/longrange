// Settings persistence wiring (task 1.1; extended task 2.1a).
//
// The store's `settings` slice is bridged to the SaveStore seam (task 0.8).
// Schema scope (persistence/schema.ts): as of schema v2 (task 2.1a) persistence
// carries `unitsPrimary`, `windRealism` (optional/additive since 1.7a), and the
// three durable player prefs `sensitivity`, `traceEnabled`, `windMarkerStyle`
// (D5). `mirageEnabled` stays store-only until the feature ships (D5) — so it is
// deliberately NOT mapped here.
//
// NOTE (task 2.2): this path projects settings onto `base` (DEFAULT_SAVE by
// default), so it does NOT itself carry the v2 `rifles[]`/`ammoLots[]` arrays —
// harmless while the player owns no gear, but when gear acquisition lands in 2.2
// the persist path must merge onto the current on-disk save (or persist the gear
// arrays alongside settings) so a settings change doesn't wipe owned gear.
//
// Pure mappers (settingsToSave / saveToSettings) are unit-tested; the async
// load/subscribe wiring is thin glue for the app shell.

import { DEFAULT_SAVE, type SaveData, type SaveStore } from '../persistence';
import type { GameStore, SettingsState } from './store';

/** Project the store's settings onto a SaveData (the schema-v2 persisted fields). */
export function settingsToSave(settings: SettingsState, base: SaveData = DEFAULT_SAVE): SaveData {
  return {
    ...base,
    settings: {
      unitsPrimary: settings.unitsPrimary,
      windRealism: settings.windRealism,
      sensitivity: settings.sensitivity,
      traceEnabled: settings.traceEnabled,
      windMarkerStyle: settings.windMarkerStyle,
    },
  };
}

/** Apply a loaded SaveData back onto settings, preserving store-only fields.
 *  Each optional field defaults when absent (a save written before it existed):
 *  `windRealism` → 'steady'; the three carry-overs → the current store value
 *  (i.e. the defaults for a fresh store). */
export function saveToSettings(save: SaveData, current: SettingsState): SettingsState {
  return {
    ...current,
    unitsPrimary: save.settings.unitsPrimary,
    windRealism: save.settings.windRealism ?? 'steady',
    sensitivity: save.settings.sensitivity ?? current.sensitivity,
    traceEnabled: save.settings.traceEnabled ?? current.traceEnabled,
    windMarkerStyle: save.settings.windMarkerStyle ?? current.windMarkerStyle,
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
