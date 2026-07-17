// Persistence entry point (task 0.8). Components import from here only.
export { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE, SaveValidationError } from './schema';
export type {
  SaveData,
  SaveSettings,
  RifleInstance,
  AmmoLot,
  PlayerZero,
  RifleDraws,
  LotDraws,
} from './schema';
export { serializeSave, parseSave } from './save-store';
export type { SaveStore } from './save-store';
export { MemorySaveStore } from './memory-store';
export { IdbSaveStore, requestPersistence } from './idb-store';

import type { SaveStore } from './save-store';
import { IdbSaveStore } from './idb-store';
import { MemorySaveStore } from './memory-store';

/** IDB in the browser; in-memory fallback where IDB is unavailable. */
export function createSaveStore(): SaveStore {
  if (typeof indexedDB !== 'undefined') return new IdbSaveStore();
  return new MemorySaveStore();
}
