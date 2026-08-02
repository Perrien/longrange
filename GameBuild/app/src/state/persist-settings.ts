// Save persistence wiring (task 1.1; extended 2.1a; broadened 2.2b to carry gear).
//
// The store's persisted state is bridged to the SaveStore seam (task 0.8). As of
// schema v2 the save carries: settings (`unitsPrimary`, `windRealism`,
// `sensitivity`, `traceEnabled`, `windMarkerStyle`, and — as of the W6
// close-out, owner decision 2026-07-31, superseding D9 — `mirageStrength`)
// AND the inventory (`rifles[]`/`ammoLots[]` + `activeRifleId?`/`activeLotId?`,
// task 2.2b/D10).
//
// FIX (task 2.2b): before this, the wiring projected only settings onto
// DEFAULT_SAVE, so persisting a settings change wrote empty gear arrays and wiped
// owned gear. The save now merges settings + live inventory (`storeToSave`), and
// the subscription fires on a change to EITHER slice.
//
// Pure mappers (settingsToSave / saveToSettings / storeToSave / saveToInventory)
// are unit-tested; the async load/subscribe wiring is thin glue for the app shell.

import { DEFAULT_SAVE, type SaveData, type SaveStore } from '../persistence';
import { LOT_ROUNDS_BY_GRADE, lotNumberFromId } from '../game/acquire';
import type { GameStore, InventoryState, SettingsState, DopeState, ChronoState } from './store';

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
      mirageStrength: settings.mirageStrength,
    },
  };
}

/** Project the full persisted store state (settings + inventory + dope) onto a
 *  SaveData. This is what the app actually writes — carrying gear so a settings
 *  change can't wipe it (task 2.2b), and now confirmed DOPE nodes (task 2.4a). */
export function storeToSave(
  state: Pick<GameStore, 'settings' | 'inventory' | 'dope' | 'chrono'>,
  base: SaveData = DEFAULT_SAVE,
): SaveData {
  return {
    ...settingsToSave(state.settings, base),
    rifles: state.inventory.rifles,
    ammoLots: state.inventory.ammoLots,
    activeRifleId: state.inventory.activeRifleId,
    activeLotId: state.inventory.activeLotId,
    lastLotIdByCartridge: state.inventory.lastLotIdByCartridge,
    dopeNodes: state.dope.nodes,
    chronoSummaries: state.chrono.summaries,
  };
}

/** Apply a loaded SaveData back onto settings, preserving store-only fields.
 *  Each optional field defaults when absent (a save written before it existed):
 *  `windRealism` → 'steady'; the four carry-overs (`sensitivity`,
 *  `traceEnabled`, `windMarkerStyle`, `mirageStrength`) → the current store
 *  value — the same fallback a pre-`mirageStrength` save (before the W6
 *  close-out) gets, defaulting it to `defaultSettings()`'s `'medium'`. */
export function saveToSettings(save: SaveData, current: SettingsState): SettingsState {
  return {
    ...current,
    unitsPrimary: save.settings.unitsPrimary,
    windRealism: save.settings.windRealism ?? 'steady',
    sensitivity: save.settings.sensitivity ?? current.sensitivity,
    traceEnabled: save.settings.traceEnabled ?? current.traceEnabled,
    windMarkerStyle: save.settings.windMarkerStyle ?? current.windMarkerStyle,
    mirageStrength: save.settings.mirageStrength ?? current.mirageStrength,
  };
}

/** Extract the inventory from a loaded SaveData, backfilling the P2 fields any
 *  pre-P2 record lacks: rifles get `acquiredAt`/`lifetimeShotCount`; lots get
 *  `roundsRemaining`/`acquiredAt` and a STABLE unique `[A-Z][0-9][0-9]` code
 *  (deterministic from the lot id, so it's the same on every load). Records that
 *  already carry the fields are left untouched. */
export function saveToInventory(save: SaveData): InventoryState {
  const rifles = (save.rifles ?? []).map((r) => ({
    ...r,
    acquiredAt: r.acquiredAt ?? 0,
    lifetimeShotCount: r.lifetimeShotCount ?? 0,
  }));
  // Preserve any codes already assigned so backfilled ones don't collide with them.
  const taken = new Set<string>();
  for (const l of save.ammoLots ?? []) if (l.lotNumber) taken.add(l.lotNumber);
  const ammoLots = (save.ammoLots ?? []).map((l) => {
    let lotNumber = l.lotNumber;
    if (!lotNumber) {
      lotNumber = lotNumberFromId(l.id, taken);
      taken.add(lotNumber);
    }
    return {
      ...l,
      lotNumber,
      roundsRemaining: l.roundsRemaining ?? LOT_ROUNDS_BY_GRADE[l.spec.grade],
      acquiredAt: l.acquiredAt ?? 0,
    };
  });
  return {
    rifles,
    ammoLots,
    activeRifleId: save.activeRifleId ?? null,
    activeLotId: save.activeLotId ?? null,
    lastLotIdByCartridge: save.lastLotIdByCartridge ?? {},
  };
}

/** Extract the DOPE slice from a loaded SaveData (task 2.4a). A save predating
 *  the field simply lacks `dopeNodes`, so it defaults to an empty book. */
export function saveToDope(save: SaveData): DopeState {
  return { nodes: save.dopeNodes ?? [] };
}

/** Extract the chrono slice from a loaded SaveData (task 2.4e). Only the summaries
 *  persist; `deployed`/`current` are session-only and reset on load. */
export function saveToChrono(save: SaveData): ChronoState {
  return { deployed: false, current: null, summaries: save.chronoSummaries ?? [] };
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
  st.applyDope(saveToDope(save));
  st.applyChrono(saveToChrono(save));
}

/** Persist the save whenever settings, inventory, the DOPE book, OR the chrono
 *  summaries change. Returns the unsubscribe handle. (Kept the historical name;
 *  it now persists the full save.) */
export function persistSettingsOnChange(store: StoreApi, saveStore: SaveStore): () => void {
  return store.subscribe((state, prev) => {
    if (
      state.settings !== prev.settings ||
      state.inventory !== prev.inventory ||
      state.dope !== prev.dope ||
      // Only summaries persist — per-shot appends to the live string mutate
      // `chrono.current` (not `.summaries`), so they don't trigger an IDB write.
      state.chrono.summaries !== prev.chrono.summaries
    ) {
      void saveStore.save(storeToSave(state));
    }
  });
}
