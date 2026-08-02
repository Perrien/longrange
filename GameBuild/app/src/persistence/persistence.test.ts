// Task 0.8 unit tests — the pure core + in-memory store. The idb adapter is
// deliberately thin and verified in-browser (node has no IndexedDB).
import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, DEFAULT_SAVE } from './schema';
import { parseSave, serializeSave } from './save-store';
import { MemorySaveStore } from './memory-store';
import { exportFileName } from './export-file';
import { cartridgeParams, specFromPreset, CARTRIDGES_CATALOG_VERSION, type RifleSpec } from '../game/spec';

// A v3 (current) save fixture's rifle spec — 6.5 CM at its reference build.
const c65 = cartridgeParams('65cm');
const RIFLE_SPEC_65CM: RifleSpec = { cartridgeId: '65cm', barrelLengthIn: c65.referenceBarrelIn, twistIn: c65.twistOptionsInPerTurn[0] };
const LOAD_SPEC_65CM_MATCH = specFromPreset('65cm-match');

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

  it('export → import reproduces a v2 save\'s content, migrated to current (v3) — serialize is pure', () => {
    const round = parseSave(serializeSave(v2Save));
    // v2 is no longer current (v3/D16 wipes gear on the bump, but v2Save's gear
    // arrays are already empty, so the only real changes are schemaVersion and
    // the new v3-introduced fields — settings survive untouched).
    expect(round).toEqual({
      ...v2Save,
      schemaVersion: 3,
      dopeNodes: [],
      chronoSummaries: [],
      activeRifleId: null,
      activeLotId: null,
    });
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
    // Migration chains all the way to current (v3) — v1's v2 step is exercised
    // en route, but a save never rests at an intermediate version.
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
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
    expect(migrated.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(migrated.settings.windRealism).toBe('realistic');
  });

  it('a v2 save migrates to current (v3) — no gear to lose, since it was already empty', () => {
    expect(parseSave(serializeSave(v2Save)).schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('DEFAULT_SAVE is itself valid and current', () => {
    const round = parseSave(serializeSave(DEFAULT_SAVE));
    expect(round.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
  });

  it('rejects a v2 save missing the required gear arrays', () => {
    const { rifles: _r, ...noRifles } = v2Save;
    expect(() => parseSave(JSON.stringify(noRifles))).toThrow(/rifles\[\] missing/);
  });

  // v3/D16 Done-when: the spec validator rejects an out-of-band field, naming it.
  it('rejects a v3 rifle spec whose barrel length is outside the cartridge band, naming the field', () => {
    const bad = {
      schemaVersion: 3,
      updatedAt: '2026-08-01T00:00:00.000Z',
      settings: { unitsPrimary: 'MIL' as const },
      rifles: [
        {
          id: 'r1',
          spec: { cartridgeId: '65cm', barrelLengthIn: 4, twistIn: RIFLE_SPEC_65CM.twistIn }, // 4" is absurdly short — out of band
          catalogVersion: CARTRIDGES_CATALOG_VERSION,
          draws: { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 },
        },
      ],
      ammoLots: [],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/spec\.barrelLengthIn out of band/);
  });

  it('rejects a v3 ammo spec whose weight is outside the cartridge band, naming the field', () => {
    const bad = {
      schemaVersion: 3,
      updatedAt: '2026-08-01T00:00:00.000Z',
      settings: { unitsPrimary: 'MIL' as const },
      rifles: [],
      ammoLots: [
        {
          id: 'l1',
          spec: { cartridgeId: '65cm', weightGr: 5, i7: LOAD_SPEC_65CM_MATCH.i7, grade: 'match' as const }, // 5 gr is absurdly light — out of band
          catalogVersion: CARTRIDGES_CATALOG_VERSION,
          draws: { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 },
        },
      ],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/spec\.weightGr out of band/);
  });

  it('rejects a rifle draw outside [0,1)', () => {
    const bad = {
      ...v2Save,
      rifles: [{ id: 'r1', catalogId: 'c1', catalogVersion: 1, draws: { mvOffset: 1.0 } }],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/normalized \[0,1\) number/);
  });

  // v3/D16 permanent migration fixture (guardrail §4.6, plan S4 Done-when): a v2
  // save carrying real gear content (task 2.1c's old catalogId-shaped rifle +
  // lot) migrates to v3 with EVERY owned-gear array wiped (rifles, ammoLots,
  // dopeNodes, chronoSummaries, active selection) and `settings` preserved
  // verbatim — silently, no error, no notice (D16: the old tier/grade axes have
  // no meaningful v3 spec to reconstruct, and the owner explicitly authorized
  // the wipe). Fed through the raw JSON.stringify path like the other
  // historical-payload fixtures above, since its rifle/lot predate `spec`.
  it('a v2 save carrying owned gear migrates to v3: gear wiped, settings preserved (D16)', () => {
    const v2WithGear = {
      schemaVersion: 2,
      updatedAt: '2026-07-17T00:00:00.000Z',
      settings: {
        unitsPrimary: 'MIL' as const,
        windRealism: 'realistic' as const,
        sensitivity: 1.5,
        traceEnabled: false,
        windMarkerStyle: 'sock' as const,
        mirageStrength: 'heavy' as const,
      },
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
      activeRifleId: 'rifle-0001',
      activeLotId: 'lot-0001',
    };
    const round = parseSave(JSON.stringify(v2WithGear));
    expect(round.schemaVersion).toBe(3);
    expect(round.rifles).toEqual([]);
    expect(round.ammoLots).toEqual([]);
    expect(round.dopeNodes).toEqual([]);
    expect(round.chronoSummaries).toEqual([]);
    expect(round.activeRifleId).toBeNull();
    expect(round.activeLotId).toBeNull();
    expect(round.settings).toEqual(v2WithGear.settings); // settings survive untouched
  });

  // Task 2.3a: a rifle whose playerZero carries the additive-optional
  // `zeroRangeM` physical fact round-trips unchanged (validated when present, no
  // version bump — 2.1 D6 pattern). Guards the zeroing flow's persisted state.
  // v3-shaped (post-S4): the old v2 catalogId fixture this test used is now
  // covered by the migration-wipe fixture above instead.
  it('a v3 save with a full playerZero (incl. zeroRangeM) round-trips unchanged', () => {
    const v3Zeroed = {
      schemaVersion: 3,
      updatedAt: '2026-07-19T00:00:00.000Z',
      settings: { unitsPrimary: 'MOA' as const },
      rifles: [
        {
          id: 'rifle-0002',
          spec: RIFLE_SPEC_65CM,
          catalogVersion: CARTRIDGES_CATALOG_VERSION,
          draws: { mvOffset: 0.4, zeroH: 0.6, zeroV: 0.55, inherentPrecision: 0.3 },
          playerZero: { elevationRad: 0.0013, windageRad: 0.0002, zeroRangeM: 91.44 },
        },
      ],
      ammoLots: [],
    };
    const round = parseSave(serializeSave(v3Zeroed));
    expect(round).toEqual(v3Zeroed);
  });

  it('rejects a non-finite playerZero.zeroRangeM', () => {
    const bad = {
      ...v2Save,
      rifles: [
        {
          id: 'r1',
          catalogId: 'c1',
          catalogVersion: 1,
          draws: { mvOffset: 0.5 },
          playerZero: { elevationRad: 0, windageRad: 0, zeroRangeM: Number.NaN },
        },
      ],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/zeroRangeM must be a finite number/);
  });

  // Task 2.4a: confirmed DOPE nodes ride the additive-optional top-level
  // `dopeNodes[]` (no version bump). A save carrying nodes round-trips unchanged
  // (validated when present, migrate-noop), and a save predating the field still
  // loads. Permanent corpus for export/import (task 2.8). v3-shaped (post-S4).
  it('a v3 save carrying dopeNodes round-trips unchanged', () => {
    const v2WithDopeNodes = {
      schemaVersion: 3,
      updatedAt: '2026-07-24T00:00:00.000Z',
      settings: { unitsPrimary: 'MIL' as const },
      rifles: [
        {
          id: 'rifle-0001',
          spec: RIFLE_SPEC_65CM,
          catalogVersion: CARTRIDGES_CATALOG_VERSION,
          draws: { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 },
        },
      ],
      ammoLots: [
        {
          id: 'lot-0001',
          spec: LOAD_SPEC_65CM_MATCH,
          catalogVersion: CARTRIDGES_CATALOG_VERSION,
          draws: { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 },
        },
      ],
      dopeNodes: [
        {
          rifleId: 'rifle-0001',
          lotId: 'lot-0001',
          distanceM: 274.32,
          elevationRad: 0.0031,
          windageRad: -0.0004,
          zeroRangeM: 91.44,
          shots: 4,
          hits: 3,
          conditions: { windSpeedMps: 2.2, windDirectionDeg: 90, tempC: 15, pressurePa: 101325 },
          confirmedAtIso: '2026-07-24T00:00:00.000Z',
        },
      ],
    };
    const round = parseSave(serializeSave(v2WithDopeNodes));
    expect(round).toEqual(v2WithDopeNodes);
  });

  it('a v2 save predating dopeNodes migrates with dopeNodes present but empty (v3/D16 wipe)', () => {
    // Was `toBeUndefined()` pre-v3: dopeNodes is additive-optional and this save
    // never had it. But the v2→v3 migration (D16) unconditionally sets
    // dopeNodes: [] for every save it upgrades (references to the wiped rifle/
    // lot ids can't survive), so a v2 save now always LANDS with an empty array,
    // not an absent field.
    const round = parseSave(serializeSave(v2Save));
    expect(round.dopeNodes).toEqual([]);
  });

  it('rejects a dope node with a non-finite distanceM', () => {
    const bad = {
      ...v2Save,
      dopeNodes: [
        {
          rifleId: 'r1',
          lotId: 'l1',
          distanceM: Number.NaN,
          elevationRad: 0,
          windageRad: 0,
          zeroRangeM: 91.44,
          shots: 3,
          hits: 3,
          conditions: { windSpeedMps: 0, windDirectionDeg: 0, tempC: 15, pressurePa: 101325 },
          confirmedAtIso: '2026-07-24T00:00:00.000Z',
        },
      ],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/distanceM must be a finite number/);
  });

  // Task 2.4e: chronograph summaries ride the additive-optional top-level
  // `chronoSummaries[]` (no version bump). A save carrying them round-trips
  // unchanged; a save predating the field still loads; a bad summary is
  // rejected. v3-shaped (post-S4): the v2→v3 migration (D16) unconditionally
  // wipes chronoSummaries along with the gear it references, so a genuine
  // "round-trips unchanged" fixture must already be current-version.
  it('a v3 save carrying chronoSummaries round-trips unchanged', () => {
    const v3WithChrono = {
      schemaVersion: 3,
      updatedAt: '2026-07-24T00:00:00.000Z',
      settings: { unitsPrimary: 'MIL' as const },
      rifles: [],
      ammoLots: [],
      chronoSummaries: [
        {
          rifleId: 'rifle-0001',
          lotId: 'lot-0001',
          shots: 8,
          avgMps: 821.3,
          sdMps: 3.4,
          minMps: 815.0,
          maxMps: 827.1,
          updatedAtIso: '2026-07-24T00:00:00.000Z',
        },
      ],
    };
    const round = parseSave(serializeSave(v3WithChrono));
    expect(round).toEqual(v3WithChrono);
  });

  it('a v2 save predating chronoSummaries migrates with chronoSummaries present but empty (v3/D16 wipe)', () => {
    // Was `toBeUndefined()` pre-v3 — see the matching dopeNodes test above for
    // why the v2→v3 migration now always lands with an empty array.
    const round = parseSave(serializeSave(v2Save));
    expect(round.chronoSummaries).toEqual([]);
  });

  it('rejects a chrono summary with a non-finite avgMps', () => {
    const bad = {
      ...v2Save,
      chronoSummaries: [
        {
          rifleId: 'r1',
          lotId: 'l1',
          shots: 3,
          avgMps: Number.NaN,
          sdMps: 3,
          minMps: 815,
          maxMps: 825,
          updatedAtIso: '2026-07-24T00:00:00.000Z',
        },
      ],
    };
    expect(() => parseSave(JSON.stringify(bad))).toThrow(/avgMps must be a finite number/);
  });
});

describe('export file name', () => {
  it('is dated and stable', () => {
    expect(exportFileName(new Date('2026-07-15T12:00:00Z'))).toBe('longrange-save-20260715.json');
  });
});
