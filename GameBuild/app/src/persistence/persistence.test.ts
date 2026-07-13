// Task 0.8 unit tests — the pure core + in-memory store. The idb adapter is
// deliberately thin and verified in-browser (node has no IndexedDB).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE } from './schema';
import { parseSave, serializeSave } from './save-store';
import { MemorySaveStore } from './memory-store';
import { exportFileName } from './export-file';

const validSave = {
  schemaVersion: 1,
  updatedAt: '2026-07-15T00:00:00.000Z',
  settings: { unitsPrimary: 'MOA' as const },
};

describe('save round-trip', () => {
  it('memory store saves and loads (stamping updatedAt)', async () => {
    const store = new MemorySaveStore();
    expect(await store.load()).toBeNull();
    // Compare against the clock, not the fixture: fixture dates carry no
    // guaranteed relation to "now" (this assertion originally failed because
    // the fixture timestamp was accidentally in the future).
    const before = Date.now();
    await store.save(validSave);
    const loaded = await store.load();
    expect(loaded).not.toBeNull();
    expect(loaded!.settings.unitsPrimary).toBe('MOA');
    expect(loaded!.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(Date.parse(loaded!.updatedAt)).toBeGreaterThanOrEqual(before);
    expect(loaded!.updatedAt).not.toBe(validSave.updatedAt); // stamp actually happened
  });

  it('export → import reproduces the save (modulo nothing — serialize is pure)', () => {
    const round = parseSave(serializeSave(validSave));
    expect(round).toEqual(validSave);
  });
});

describe('import validation (untrusted input)', () => {
  it('rejects non-JSON', () => expect(() => parseSave('not json{')).toThrow(/not valid JSON/));
  it('rejects non-objects', () => expect(() => parseSave('42')).toThrow(/not an object/));
  it('rejects missing schemaVersion', () =>
    expect(() => parseSave('{"settings":{}}')).toThrow(/schemaVersion/));
  it('rejects future schema versions with a helpful message', () =>
    expect(() =>
      parseSave(JSON.stringify({ ...validSave, schemaVersion: CURRENT_SCHEMA_VERSION + 1 })),
    ).toThrow(/newer than this app supports/));
  it('rejects bad settings', () =>
    expect(() =>
      parseSave(JSON.stringify({ ...validSave, settings: { unitsPrimary: 'FURLONGS' } })),
    ).toThrow(/unitsPrimary/));
});

describe('migration', () => {
  it('v1 → v1 is a no-op', () => {
    expect(parseSave(serializeSave(validSave)).schemaVersion).toBe(1);
  });
  it('DEFAULT_SAVE is itself valid and current', () => {
    const round = parseSave(serializeSave(DEFAULT_SAVE));
    expect(round.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });
});

describe('export file name', () => {
  it('is dated and stable', () => {
    expect(exportFileName(new Date('2026-07-15T12:00:00Z'))).toBe('longrange-save-20260715.json');
  });
});
