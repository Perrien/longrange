// Save persistence wiring (task 1.1; extended 2.1a; broadened 2.2b to carry gear).
//
// The store's persisted state is bridged to the SaveStore seam (task 0.8). As of
// schema v2 the save carries: settings (`unitsPrimary`, `windRealism`,
// `sensitivity`, `traceEnabled`, `windMarkerStyle` — `mirageEnabled` stays
// store-only, D5) AND the inventory (`rifles[]`/`ammoLots[]` + `activeRifleId?`/
// `activeLotId?`, task 2.2b/D10).
//
// FIX (task 2.2b): before this, the wiring projected only settings onto
// DEFAULT_SAVE, so persisting a settings change wrote empty gear arrays and wiped
// owned gear. The save now merges settings + live inventory (`storeToSave`), and
// the subscription fires on a change to EITHER slice.
//
// Pure mappers (settingsToSave / saveToSettings / storeToSave / saveToInventory)
// are unit-tested; the async load/subscribe wiring is thin glue for the app shell.

import { DEFAULT_SAVE, type SaveData, type SaveStore } from '../persistence';
import type { GameStore, InventoryState, SettingsState } from './store';

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

/** Project the full persisted store state (settings + inventory) onto a SaveData.
 *  This is what the app actually writes — carrying gear so a settings change can't
 *  wipe it (task 2.2b). */
export function storeToSave(
  state: Pick<GameStore, 'settings' | 'inventory'>,
  base: SaveData = DEFAULT_SAVE,
): SaveData {
  return {
    ...settingsToSave(state.settings, base),
    rifles: state.inventory.rifles,
    ammoLots: state.inventory.ammoLots,
    activeRifleId: state.inventory.activeRifleId,
    activeLotId: state.inventory.activeLotId,
  };
}

/** Apply a loaded SaveData back onto settings, preserving store-only fields.
 *  Each optional field defaults when absent (a save written before it existed):
 *  `windRealism` → 'steady'; the three carry-overs → the current store value. */
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

/** Extract the inventory from a loaded SaveData (defensive defaults for a save
 *  predating the fields). */
export function saveToInventory(save: SaveData): InventoryState {
  return {
    rifles: save.rifles ?? [],
    ammoLots: save.ammoLots ?? [],
    activeRifleId: save.activeRifleId ?? null,
    activeLotId: save.activeLotId ?? null,
  };
}

/** Zustand store handle (create()'s return): getState + subscribe. */
type StoreApi = {
  getState(): GameStore;
  subscribe(listener: (state: GameStore, prev: GameStore) => void): () => void;
};

/** Load the persisted save (if any) into the store on app start — both settings
 *  and inventory. (Kept the historical name; it now hydrates the full save.) */
export async function loadSettingsInto(store: StoreApi, saveStore: SaveStore): Promise<void> {
  const save = await saveStore.load();
  if (!save) return;
  const st = store.getState();
  st.applySettings(saveToSettings(save, st.settings));
  st.applyInventory(saveToInventory(save));
}

/** Persist the save whenever settings OR inventory change. Returns the
 *  unsubscribe handle. (Kept the historical name; it now persists the full save.) */
export function persistSettingsOnChange(store: StoreApi, saveStore: SaveStore): () => void {
  return store.subscribe((state, prev) => {
    if (state.settings !== prev.settings || state.inventory !== prev.inventory) {
      void saveStore.save(storeToSave(state));
    }
  });
}
