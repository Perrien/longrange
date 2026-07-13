// IndexedDB SaveStore adapter (task 0.8) — deliberately thin: all logic
// (validation, migration, serialization) lives in the tested core modules;
// this file only moves bytes in and out of IDB. Verified in-browser (owner
// checks) since node/vitest has no IndexedDB.

import { openDB, type IDBPDatabase } from 'idb';
import type { SaveStore } from './save-store';
import { stampUpdated } from './save-store';
import { validateSaveShape, type SaveData } from './schema';
import { migrateSave } from './migrations';

const DB_NAME = 'longrange';
const DB_VERSION = 1;
const STORE_SAVE = 'save';
const STORE_META = 'meta';
const KEY_CURRENT = 'current';

function open(): Promise<IDBPDatabase> {
  return openDB(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains(STORE_SAVE)) db.createObjectStore(STORE_SAVE);
      if (!db.objectStoreNames.contains(STORE_META)) db.createObjectStore(STORE_META);
    },
  });
}

export class IdbSaveStore implements SaveStore {
  async load(): Promise<SaveData | null> {
    const db = await open();
    try {
      const raw: unknown = await db.get(STORE_SAVE, KEY_CURRENT);
      if (raw === undefined || raw === null) return null;
      validateSaveShape(raw);
      return migrateSave(raw);
    } finally {
      db.close();
    }
  }

  async save(data: SaveData): Promise<void> {
    const db = await open();
    try {
      await db.put(STORE_SAVE, stampUpdated(data), KEY_CURRENT);
    } finally {
      db.close();
    }
  }
}

/** Belt-and-suspenders durability (build-plan §7): request persistent storage
 * and report state for the debug screen. Installed home-screen PWAs are exempt
 * from Safari's 7-day eviction regardless; this is the extra layer. */
export async function requestPersistence(): Promise<{
  persisted: boolean | 'unsupported';
  usage?: number;
  quota?: number;
}> {
  if (typeof navigator === 'undefined' || !navigator.storage) return { persisted: 'unsupported' };
  const persisted = navigator.storage.persist ? await navigator.storage.persist() : false;
  const estimate = navigator.storage.estimate ? await navigator.storage.estimate() : {};
  return { persisted, usage: estimate.usage, quota: estimate.quota };
}
