// In-memory SaveStore — backs unit tests (node has no IndexedDB) and serves as
// a last-resort runtime fallback. Behavior mirrors the idb adapter exactly:
// validate+migrate on load, stamp on save.

import type { SaveStore } from './save-store';
import { stampUpdated } from './save-store';
import { validateSaveShape, type SaveData } from './schema';
import { migrateSave } from './migrations';

export class MemorySaveStore implements SaveStore {
  private data: string | null = null;

  async load(): Promise<SaveData | null> {
    if (this.data === null) return null;
    const parsed: unknown = JSON.parse(this.data);
    validateSaveShape(parsed);
    return migrateSave(parsed);
  }

  async save(data: SaveData): Promise<void> {
    this.data = JSON.stringify(stampUpdated(data));
  }
}
