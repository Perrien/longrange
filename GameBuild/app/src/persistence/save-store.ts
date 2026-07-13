// SaveStore seam (task 0.8; build-plan §3/§6): everything persistence-related
// goes through this interface. The IndexedDB adapter implements it for the
// app; the in-memory impl backs unit tests; a future cloud sync implements the
// same interface and nothing else changes (hard-constraint §0.3 "clean seam").

import { validateSaveShape, type SaveData } from './schema';
import { migrateSave } from './migrations';

export interface SaveStore {
  /** Load the current save (migrated), or null if none exists yet. */
  load(): Promise<SaveData | null>;
  /** Persist the save (stamps updatedAt). */
  save(data: SaveData): Promise<void>;
}

/** Serialize a save for export (stable field order via JSON default). */
export function serializeSave(data: SaveData): string {
  return JSON.stringify(data, null, 2);
}

/** Parse + validate + migrate an untrusted import payload. Throws on any problem. */
export function parseSave(json: string): SaveData {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch {
    throw new Error('invalid save: not valid JSON');
  }
  validateSaveShape(parsed);
  return migrateSave(parsed);
}

export function stampUpdated(data: SaveData): SaveData {
  return { ...data, updatedAt: new Date().toISOString() };
}
