// Task 0.8 unit tests — the pure core + in-memory store. The idb adapter is
// deliberately thin and verified in-browser (node has no IndexedDB).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE } from './schema';
import { parseSave, serializeSave } from './save-store';
import { MemorySaveStore } from './memory-store';
import { exportFileName } from './export-file';

// A current-version (v2) save — what the app actually writes to the store.
const validSave = {
  schemaVersion: 2,
  updatedAt: '2026-07-15T00:00:00.000Z',
  settings: { unitsPrimary: 'MOA' as const },
  rifles: [],
  ammoLots: [],
};

// --- Migration corpus (permanent regression fixtures; task 2.1a) -------------
// Raw historical payloads: older versions legitimately lack the v2 arrays, so
// they are plain objects fed through the string path (JSON.stringify → parseSave)
// rather than the SaveData-typed serializeSave.
//
// A v1 save written before 1.7 (no windRealism key at all).
const v1PreWind = {
  schemaVersion: 1,
  updatedAt: '2026-07-15T00:00:00.000Z',
  settings: { unitsPrimary: 'MOA' as const },
};
// A v1 save that DID set windRealism (post-1.7, pre-v2).
const v1WithWind = {
  schemaVersion: 1,
  updatedAt: '2026-07-15T00:00:00.000Z',
  settings: { unitsPrimary: 'MIL' as const, windRealism: 'realistic' as const },
};
// A fully-formed v2 save (empty gear arrays — populated content arrives in 2.1c).
const v2Save = {
  schemaVersion: 2,
  updatedAt: '2026-07-16T00:00:00.000Z',
  settings: {
    unitsPrimary: 'MIL' as const,
    windRealism: 'steady' as const,
    sensitivity: 1.5,
    traceEnabled: false,
    windMarkerStyle: 'sock' as const,
  },
  rifles: [],
  ammoLots: [],
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

  it('export → import reproduces a v2 save unchanged (serialize is pure, migrate is a no-op)', () => {
    const round = parseSave(serializeSave(v2Save));
    expect(round).toEqual(v2Save);
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

describe('migration v1 → v2 (task 2.1a)', () => {
  it('migrates a pre-1.7 v1 save: empty gear arrays + settings defaulted', () => {
    const migrated = parseSave(JSON.stringify(v1PreWind));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.rifles).toEqual([]);
    expect(migrated.ammoLots).toEqual([]);
    expect(migrated.settings.unitsPrimary).toBe('MOA'); // preserved
    // The three carry-over settings default from DEFAULT_SAVE at the bump (D5).
    expect(migrated.settings.sensitivity).toBe(1.0);
    expect(migrated.settings.traceEnabled).toBe(true);
    expect(migrated.settings.windMarkerStyle).toBe('flag');
  });

  it('leaves an existing windRealism intact through the bump', () => {
    const migrated = parseSave(JSON.stringify(v1WithWind));
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.settings.windRealism).toBe('realistic');
  });

  it('a v2 save is already current — migration is a no-op', () => {
    expect(parseSave(serializeSave(v2Save)).schemaVersion).toBe(2);
  });

  it('DEFAULT_SAVE is itself valid and current', () => {
    const round = parseSave(serializeSave(DEFAULT_SAVE));
    expect(round.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects a v2 save missing the required gear arrays', () => {
    const { rifles: _r, ...noRifles } = v2Save;
    expect(() => parseSave(JSON.stringify(noRifles))).toThrow(/rifles\[\] missing/);
  });

  it('rejects a rifle draw outside [0,1)', () => {
    const bad = {
      ...v2Save,
      rifles: [{ id: 'r1', catalogId: 'c1', catalogVersion: 1, draws: { mvOffset: 1.0 } }],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/normalized \[0,1\) number/);
  });

  // Permanent-corpus fixture with real gear content (task 2.1c) so export/import
  // (task 2.8) has an instance + lot carrying draws to reproduce later.
  it('a v2 save carrying a rifle instance + ammo lot with draws round-trips unchanged', () => {
    const v2WithGear = {
      schemaVersion: 2,
      updatedAt: '2026-07-17T00:00:00.000Z',
      settings: { unitsPrimary: 'MIL' as const },
      rifles: [
        {
          id: 'rifle-0001',
          catalogId: 'rifle-6.5cm',
          catalogVersion: 1,
          draws: { mvOffset: 0.62, zeroH: 0.5, zeroV: 0.41, inherentPrecision: 0.73 },
          playerZero: { elevationRad: 0.0021, windageRad: -0.0004 },
        },
      ],
      ammoLots: [
        {
          id: 'lot-0001',
          catalogId: 'lot-match',
          catalogVersion: 1,
          draws: { meanMvShift: 0.55, mvSd: 0.5, bcError: 0.48, bcSd: 0.5 },
        },
      ],
    };
    const round = parseSave(serializeSave(v2WithGear));
    expect(round).toEqual(v2WithGear); // validates + migrate-noop + preserves draws & playerZero
  });
});

describe('export file name', () => {
  it('is dated and stable', () => {
    expect(exportFileName(new Date('2026-07-15T12:00:00Z'))).toBe('longrange-save-20260715.json');
  });
});
