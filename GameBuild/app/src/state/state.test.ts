// Task 1.1 unit tests: dial math (MIL + MOA), scope/budget/reset actions, and
// settings round-trip through persistence. Pure — no React, no browser.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  linearSubtension,
  subtensionMmInch,
  milToRad,
  moaToRad,
  yardsToMeters,
} from '../units';
import { MemorySaveStore } from '../persistence';
import type { ShotResult } from '../game/shot';
import {
  useGameStore,
  defaultSession,
  defaultSettings,
  defaultScore,
  defaultInventory,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_WIND_PRESET,
  settingsToSave,
  saveToSettings,
  storeToSave,
  loadSettingsInto,
  persistSettingsOnChange,
} from './index';

/** Build a minimal ShotResult for scoring tests (impact geometry doesn't matter here). */
const shotResult = (hitPlateId: number | null): ShotResult => ({
  impact: { x: 0, y: 0 },
  distanceM: 300,
  hitPlateId,
  aimedPlateId: hitPlateId,
});

// Reset the singleton store before each test.
beforeEach(() => {
  useGameStore.setState({
    session: defaultSession(),
    settings: defaultSettings(),
    score: defaultScore(),
    inventory: defaultInventory(),
  });
});

describe('dial math — angular click → linear subtension at range', () => {
  it('0.1 MRAD click at 100 m = 10 mm', () => {
    expect(linearSubtension(milToRad(0.1), 100)).toBeCloseTo(0.01, 12); // metres
    expect(subtensionMmInch(milToRad(0.1), 100).mm).toBeCloseTo(10, 9);
  });

  it('1/4 MOA click at 100 yd ≈ 0.262 in', () => {
    const inch = subtensionMmInch(moaToRad(0.25), yardsToMeters(100)).inch;
    expect(inch).toBeCloseTo(0.262, 3);
  });

  it('1 MIL at 1000 m = 1 m (mil-relation sanity)', () => {
    expect(linearSubtension(milToRad(1), 1000)).toBeCloseTo(1.0, 9);
  });
});

describe('scope dialing', () => {
  it('dials elevation in 0.1-mrad detents (default MIL turret)', () => {
    const st = useGameStore.getState();
    expect(st.session.scope.clickRad).toBeCloseTo(MIL_CLICK_RAD, 15);
    st.dialElevationClicks(3);
    const elev = useGameStore.getState().session.scope.elevationRad;
    expect(elev).toBeCloseTo(3 * MIL_CLICK_RAD, 15);
    // 0.3 mrad @ 300 m = 90 mm.
    expect(subtensionMmInch(elev, 300).mm).toBeCloseTo(90, 9);
  });

  it('negative clicks dial down; windage tracks separately', () => {
    const st = useGameStore.getState();
    st.dialElevationClicks(5);
    st.dialElevationClicks(-2);
    st.dialWindageClicks(4);
    const scope = useGameStore.getState().session.scope;
    expect(scope.elevationRad).toBeCloseTo(3 * MIL_CLICK_RAD, 15);
    expect(scope.windageRad).toBeCloseTo(4 * MIL_CLICK_RAD, 15);
  });

  it('supports a 1/4-MOA turret after switching click size', () => {
    const st = useGameStore.getState();
    st.setClickRad(MOA_CLICK_RAD);
    st.dialElevationClicks(1);
    const elev = useGameStore.getState().session.scope.elevationRad;
    expect(elev).toBeCloseTo(moaToRad(0.25), 15);
    // one 1/4-MOA click at 100 yd ≈ 0.262 in.
    expect(subtensionMmInch(elev, yardsToMeters(100)).inch).toBeCloseTo(0.262, 3);
  });

  it('clamps zoom to the optic range', () => {
    const st = useGameStore.getState();
    st.setZoom(1000);
    expect(useGameStore.getState().session.scope.magnification).toBe(ZOOM_MAX);
    st.setZoom(0);
    expect(useGameStore.getState().session.scope.magnification).toBe(ZOOM_MIN);
    st.setZoom(12);
    expect(useGameStore.getState().session.scope.magnification).toBe(12);
  });
});

describe('shot budget', () => {
  it('decrements and floors at zero', () => {
    const st = useGameStore.getState();
    st.selectTarget(yardsToMeters(300), 3);
    st.decrementBudget();
    st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(1);
    st.decrementBudget();
    st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(0);
  });
});

describe('target select / reset', () => {
  it('selectTarget sets distance, refills budget, and zeroes the dials', () => {
    const st = useGameStore.getState();
    st.dialElevationClicks(7);
    st.dialWindageClicks(3);
    st.decrementBudget();
    st.selectTarget(yardsToMeters(500), 3);
    const s = useGameStore.getState().session;
    expect(s.targetDistanceM).toBeCloseTo(yardsToMeters(500), 9);
    expect(s.shotBudget).toBe(3);
    expect(s.scope.elevationRad).toBe(0);
    expect(s.scope.windageRad).toBe(0);
  });

  it('resetSession restores defaults but leaves settings alone', () => {
    const st = useGameStore.getState();
    st.setUnitsPrimary('MOA');
    st.dialElevationClicks(4);
    st.setWind({ speedMps: 5 });
    st.resetSession();
    const state = useGameStore.getState();
    expect(state.session.scope.elevationRad).toBe(0);
    expect(state.session.wind.speedMps).toBe(0);
    expect(state.settings.unitsPrimary).toBe('MOA'); // settings untouched
  });
});

describe('scoring & engagement (task 1.6b, D2)', () => {
  it('commitTarget sets currentTarget, resets shot count, refills budget, bumps targetsEngaged', () => {
    const st = useGameStore.getState();
    st.dialElevationClicks(4);
    st.decrementBudget();
    st.commitTarget(7, yardsToMeters(300));
    const s = useGameStore.getState().session;
    expect(s.currentTarget).toEqual({ plateInstanceId: 7, distanceM: yardsToMeters(300) });
    expect(s.shotsAtCurrentTarget).toBe(0);
    expect(s.shotBudget).toBe(3);
    expect(s.scope.elevationRad).toBe(0);
    expect(s.lastShots).toEqual([]);
    expect(useGameStore.getState().score.targetsEngaged).toBe(1);
  });

  it('a hit on the first shot after commit counts as a first-round hit', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, yardsToMeters(300));
    st.recordShot(shotResult(7));
    const score = useGameStore.getState().score;
    expect(score.hits).toBe(1);
    expect(score.firstRoundHits).toBe(1);
    expect(score.shotsFired).toBe(1);
  });

  it('a miss then a hit counts the hit but not as a first-round hit', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, yardsToMeters(300));
    st.recordShot(shotResult(null)); // miss
    st.recordShot(shotResult(7)); // hit on shot 2
    const score = useGameStore.getState().score;
    expect(score.hits).toBe(1);
    expect(score.firstRoundHits).toBe(0);
    expect(score.shotsFired).toBe(2);
  });

  it('hitting a different plate than the committed one does not count as a hit', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, yardsToMeters(300));
    st.recordShot(shotResult(9)); // hit some other plate
    const score = useGameStore.getState().score;
    expect(score.hits).toBe(0);
    expect(score.firstRoundHits).toBe(0);
    expect(score.shotsFired).toBe(1);
  });

  it('counters aggregate across two committed targets', () => {
    const st = useGameStore.getState();
    st.commitTarget(1, yardsToMeters(100));
    st.recordShot(shotResult(1)); // first-round hit
    st.commitTarget(2, yardsToMeters(300));
    st.recordShot(shotResult(null)); // miss
    st.recordShot(shotResult(2)); // hit on shot 2 (not first-round)
    const score = useGameStore.getState().score;
    expect(score.targetsEngaged).toBe(2);
    expect(score.shotsFired).toBe(3);
    expect(score.hits).toBe(2);
    expect(score.firstRoundHits).toBe(1);
  });

  it('resetScore zeroes the score slice without touching session', () => {
    const st = useGameStore.getState();
    st.commitTarget(1, yardsToMeters(100));
    st.recordShot(shotResult(1));
    st.resetScore();
    const state = useGameStore.getState();
    expect(state.score).toEqual(defaultScore());
    expect(state.session.currentTarget).toEqual({ plateInstanceId: 1, distanceM: yardsToMeters(100) });
  });
});

describe('wind field (task 1.7a, D1/D3)', () => {
  it('defaults to steady realism + the Moderate preset', () => {
    const s = useGameStore.getState();
    expect(s.settings.windRealism).toBe('steady');
    expect(s.session.windPreset).toBe(DEFAULT_WIND_PRESET);
  });

  it('setWindRealism toggles the persisted setting; setWindPreset sets the session-only preset', () => {
    const st = useGameStore.getState();
    st.setWindRealism('realistic');
    st.setWindPreset('Gusty');
    const state = useGameStore.getState();
    expect(state.settings.windRealism).toBe('realistic');
    expect(state.session.windPreset).toBe('Gusty');
  });

  it('resetSession restores the default preset but leaves settings.windRealism alone', () => {
    const st = useGameStore.getState();
    st.setWindRealism('realistic');
    st.setWindPreset('Switchy');
    st.resetSession();
    const state = useGameStore.getState();
    expect(state.session.windPreset).toBe(DEFAULT_WIND_PRESET);
    expect(state.settings.windRealism).toBe('realistic'); // settings untouched
  });
});

describe('wind markers (task 1.7b)', () => {
  it('defaults to the flag style', () => {
    expect(useGameStore.getState().settings.windMarkerStyle).toBe('flag');
  });

  it('setWindMarkerStyle updates the setting and is not reset by resetSession', () => {
    const st = useGameStore.getState();
    st.setWindMarkerStyle('sock');
    expect(useGameStore.getState().settings.windMarkerStyle).toBe('sock');
    st.resetSession();
    expect(useGameStore.getState().settings.windMarkerStyle).toBe('sock'); // settings untouched

    st.setWindMarkerStyle('both');
    expect(useGameStore.getState().settings.windMarkerStyle).toBe('both');
  });
});

describe('range select (task 1.8)', () => {
  it('setRangeId sets the active range; resetSession restores range-a', () => {
    const st = useGameStore.getState();
    st.setRangeId('range-b');
    expect(useGameStore.getState().session.rangeId).toBe('range-b');
    st.resetSession();
    expect(useGameStore.getState().session.rangeId).toBe('range-a');
  });
});

describe('settings persistence round-trip', () => {
  it('maps settings → SaveData → settings (unitsPrimary persisted)', () => {
    const settings = {
      unitsPrimary: 'MOA' as const,
      sensitivity: 1.5,
      traceEnabled: true,
      windRealism: 'steady' as const,
      windMarkerStyle: 'flag' as const,
      mirageEnabled: false,
    };
    const save = settingsToSave(settings);
    expect(save.settings.unitsPrimary).toBe('MOA');
    const back = saveToSettings(save, defaultSettings());
    expect(back.unitsPrimary).toBe('MOA');
  });

  it('maps settings → SaveData → settings (windRealism persisted, task 1.7a)', () => {
    const settings = {
      unitsPrimary: 'MIL' as const,
      sensitivity: 1.0,
      traceEnabled: true,
      windRealism: 'realistic' as const,
      windMarkerStyle: 'flag' as const,
      mirageEnabled: false,
    };
    const save = settingsToSave(settings);
    expect(save.settings.windRealism).toBe('realistic');
    const back = saveToSettings(save, defaultSettings());
    expect(back.windRealism).toBe('realistic');
  });

  it('windRealism defaults to steady when absent from an older save', () => {
    const back = saveToSettings(
      {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        settings: { unitsPrimary: 'MIL' },
        rifles: [],
        ammoLots: [],
      },
      defaultSettings(),
    );
    expect(back.windRealism).toBe('steady');
  });

  it('round-trips through the SaveStore and hydrates the store', async () => {
    const store = new MemorySaveStore();
    // App-shell wiring: persist on change, then simulate reload into a fresh store.
    const unsub = persistSettingsOnChange(useGameStore, store);
    useGameStore.getState().setUnitsPrimary('MOA');
    // let the async save settle
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    // Fresh store defaults to MIL, then hydrates from the SaveStore.
    useGameStore.setState({ settings: defaultSettings() });
    expect(useGameStore.getState().settings.unitsPrimary).toBe('MIL');
    await loadSettingsInto(useGameStore, store);
    expect(useGameStore.getState().settings.unitsPrimary).toBe('MOA');
  });

  it('persists and rehydrates the schema-v2 carry-over settings end-to-end (task 2.1d wiring)', async () => {
    // Mirrors the real bootstrap (main.tsx): subscribe, mutate several settings,
    // then simulate a cold relaunch (fresh defaults → hydrate from the store).
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    const st = useGameStore.getState();
    st.setUnitsPrimary('MOA');
    st.setSensitivity(2.25);
    st.setTraceEnabled(false);
    st.setWindMarkerStyle('sock');
    st.setMirageEnabled(true); // store-only — must NOT survive a relaunch
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    useGameStore.setState({ settings: defaultSettings() });
    await loadSettingsInto(useGameStore, store);
    const back = useGameStore.getState().settings;
    expect(back.unitsPrimary).toBe('MOA');
    expect(back.sensitivity).toBe(2.25);
    expect(back.traceEnabled).toBe(false);
    expect(back.windMarkerStyle).toBe('sock');
    expect(back.mirageEnabled).toBe(false); // not persisted → back to default
  });

  it('carries sensitivity, traceEnabled, and windMarkerStyle into the save (schema v2, D5)', () => {
    const settings = {
      unitsPrimary: 'MOA' as const,
      sensitivity: 1.75,
      traceEnabled: false,
      windRealism: 'realistic' as const,
      windMarkerStyle: 'both' as const,
      mirageEnabled: false,
    };
    const save = settingsToSave(settings);
    expect(save.settings.sensitivity).toBe(1.75);
    expect(save.settings.traceEnabled).toBe(false);
    expect(save.settings.windMarkerStyle).toBe('both');
    // Round-trips back through the loader.
    const back = saveToSettings(save, defaultSettings());
    expect(back.sensitivity).toBe(1.75);
    expect(back.traceEnabled).toBe(false);
    expect(back.windMarkerStyle).toBe('both');
  });

  it('the carried-over settings default from the store when absent (pre-v2 save)', () => {
    const back = saveToSettings(
      {
        schemaVersion: 1,
        updatedAt: new Date(0).toISOString(),
        settings: { unitsPrimary: 'MIL' },
        rifles: [],
        ammoLots: [],
      },
      defaultSettings(),
    );
    expect(back.sensitivity).toBe(1.0);
    expect(back.traceEnabled).toBe(true);
    expect(back.windMarkerStyle).toBe('flag');
  });

  it('mirageEnabled is intentionally NOT persisted (store-only until it ships, D5)', () => {
    const save = settingsToSave({
      unitsPrimary: 'MIL',
      sensitivity: 2.0,
      traceEnabled: false,
      windRealism: 'steady',
      windMarkerStyle: 'flag',
      mirageEnabled: true,
    });
    expect('mirageEnabled' in save.settings).toBe(false);
  });
});

describe('mirage toggle (task 1.7c/1.7d)', () => {
  it('defaults to OFF (owner feedback, 2026-07-15: direction not legible yet, parked for later)', () => {
    expect(useGameStore.getState().settings.mirageEnabled).toBe(false);
  });

  it('setMirageEnabled updates the setting, is not reset by resetSession, and is not persisted', () => {
    const st = useGameStore.getState();
    st.setMirageEnabled(true);
    expect(useGameStore.getState().settings.mirageEnabled).toBe(true);
    st.resetSession();
    expect(useGameStore.getState().settings.mirageEnabled).toBe(true); // settings untouched

    const save = settingsToSave(useGameStore.getState().settings);
    expect('mirageEnabled' in save.settings).toBe(false);

    st.setMirageEnabled(false);
    expect(useGameStore.getState().settings.mirageEnabled).toBe(false);
  });
});

describe('inventory / loadout (task 2.2b)', () => {
  // Deterministic draw source so acquires are reproducible in tests.
  const rng = () => 0.5;

  it('acquireRifle appends an instance and returns its id; twice → two instances', () => {
    const st = useGameStore.getState();
    const id1 = st.acquireRifle('65cm-custom', { rng });
    const id2 = st.acquireRifle('65cm-custom', { rng });
    const inv = useGameStore.getState().inventory;
    expect(inv.rifles).toHaveLength(2);
    expect(id1).not.toBe(id2);
    expect(inv.rifles.map((r) => r.id)).toEqual([id1, id2]);
    expect(inv.rifles[0].catalogId).toBe('65cm-custom');
    expect(inv.rifles[0].draws.mvOffset).toBe(0.5);
  });

  it('acquireLot appends a lot; selectRifle/selectLot set the active ids', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('308-factoryMatch', { rng });
    const lid = st.acquireLot('308-match', { rng });
    st.selectRifle(rid);
    st.selectLot(lid);
    const inv = useGameStore.getState().inventory;
    expect(inv.ammoLots).toHaveLength(1);
    expect(inv.activeRifleId).toBe(rid);
    expect(inv.activeLotId).toBe(lid);
    st.selectRifle(null);
    expect(useGameStore.getState().inventory.activeRifleId).toBeNull();
  });

  it('resetSession leaves inventory alone (gear is not session state)', () => {
    const st = useGameStore.getState();
    st.acquireRifle('22lr-hunting', { rng });
    st.resetSession();
    expect(useGameStore.getState().inventory.rifles).toHaveLength(1);
  });

  it('deleteRifle removes the instance and clears the active selection if it was active', () => {
    const st = useGameStore.getState();
    const keep = st.acquireRifle('65cm-custom', { rng });
    const drop = st.acquireRifle('65cm-custom', { rng });
    st.selectRifle(drop);
    st.deleteRifle(drop);
    const inv = useGameStore.getState().inventory;
    expect(inv.rifles.map((r) => r.id)).toEqual([keep]);
    expect(inv.activeRifleId).toBeNull(); // active pointed at the deleted rifle
    // Deleting a NON-active rifle leaves the selection alone; unknown id no-ops.
    st.selectRifle(keep);
    st.deleteRifle('no-such-rifle');
    expect(useGameStore.getState().inventory.activeRifleId).toBe(keep);
    expect(useGameStore.getState().inventory.rifles).toHaveLength(1);
  });

  it('deleteLot removes the lot and clears the active selection if it was active', () => {
    const st = useGameStore.getState();
    const keep = st.acquireLot('65cm-match', { rng });
    const drop = st.acquireLot('65cm-bulk', { rng });
    st.selectLot(drop);
    st.deleteLot(drop);
    const inv = useGameStore.getState().inventory;
    expect(inv.ammoLots.map((l) => l.id)).toEqual([keep]);
    expect(inv.activeLotId).toBeNull();
  });
});

describe('confirmZero (task 2.3d — the re-confirm compose fix)', () => {
  const rng = () => 0.5;

  it('a fresh rifle: confirm stores the current turret + zeroRangeM and resets the turret', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    st.dialElevationClicks(6); // 0.6 mrad
    st.dialWindageClicks(-3); // −0.3 mrad
    st.confirmZero(rid, 91.44);
    const state = useGameStore.getState();
    const pz = state.inventory.rifles[0].playerZero!;
    expect(pz.elevationRad).toBeCloseTo(6 * MIL_CLICK_RAD, 15);
    expect(pz.windageRad).toBeCloseTo(-3 * MIL_CLICK_RAD, 15);
    expect(pz.zeroRangeM).toBe(91.44);
    expect(state.session.scope.elevationRad).toBe(0);
    expect(state.session.scope.windageRad).toBe(0);
  });

  it('a rifle with a stored zero: confirm COMPOSES the touch-up dial onto the old zero (never replaces)', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    // Prior zero (e.g. from an earlier session) — the ~0.6 mil the bug dropped.
    st.setPlayerZero(rid, { elevationRad: milToRad(0.6), windageRad: milToRad(-0.2), zeroRangeM: 91.44 });
    // Touch-up: one click each, then re-confirm on the 200 target.
    st.dialElevationClicks(1);
    st.dialWindageClicks(1);
    st.confirmZero(rid, 182.88);
    const state = useGameStore.getState();
    const pz = state.inventory.rifles[0].playerZero!;
    expect(pz.elevationRad).toBeCloseTo(milToRad(0.6) + MIL_CLICK_RAD, 15);
    expect(pz.windageRad).toBeCloseTo(milToRad(-0.2) + MIL_CLICK_RAD, 15);
    expect(pz.zeroRangeM).toBe(182.88);
    expect(state.session.scope.elevationRad).toBe(0);
    expect(state.session.scope.windageRad).toBe(0);
  });

  it('subtracts the come-up handoff: pz_new = pz_old + dial − required (fidelity fix)', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    // Zeroed at 100; the player walks to the 200 target: the dial they centre
    // with = a 0.1 mil bore touch-up + the REAL 0.5 mil come-up 100→200. The
    // come-up part belongs to the new trajectory zero, not the angular baseline.
    st.setPlayerZero(rid, { elevationRad: milToRad(0.3), windageRad: 0, zeroRangeM: 91.44 });
    st.setElevationRad(milToRad(0.6));
    st.confirmZero(rid, 182.88, { elevRad: milToRad(0.5), windRad: 0 });
    const state = useGameStore.getState();
    const pz = state.inventory.rifles[0].playerZero!;
    expect(pz.elevationRad).toBeCloseTo(milToRad(0.3) + milToRad(0.6) - milToRad(0.5), 15);
    expect(pz.windageRad).toBe(0);
    expect(pz.zeroRangeM).toBe(182.88);
    expect(state.session.scope.elevationRad).toBe(0);
  });

  it('re-confirming with no new dial keeps the zero unchanged', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    st.dialElevationClicks(4);
    st.confirmZero(rid, 91.44);
    st.confirmZero(rid, 91.44); // turret is 0/0 now — zero must not move
    const pz = useGameStore.getState().inventory.rifles[0].playerZero!;
    expect(pz.elevationRad).toBeCloseTo(4 * MIL_CLICK_RAD, 15);
    expect(pz.windageRad).toBe(0);
  });

  it('an unknown rifle id is a no-op (turret untouched)', () => {
    const st = useGameStore.getState();
    st.acquireRifle('65cm-custom', { rng });
    st.dialElevationClicks(2);
    st.confirmZero('no-such-rifle', 91.44);
    const state = useGameStore.getState();
    expect(state.inventory.rifles[0].playerZero).toBeUndefined();
    expect(state.session.scope.elevationRad).toBeCloseTo(2 * MIL_CLICK_RAD, 15);
  });
});

describe('gear persistence (task 2.2b — the DEFAULT_SAVE-wipe fix)', () => {
  const rng = () => 0.5;

  it('storeToSave carries settings AND inventory (arrays + active ids)', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    st.selectRifle(rid);
    st.selectLot(lid);
    const save = storeToSave(useGameStore.getState());
    expect(save.rifles).toHaveLength(1);
    expect(save.ammoLots).toHaveLength(1);
    expect(save.activeRifleId).toBe(rid);
    expect(save.activeLotId).toBe(lid);
    expect(save.settings.unitsPrimary).toBe('MIL');
  });

  it('a settings change does NOT wipe owned gear (the regression this fixes)', async () => {
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    const st = useGameStore.getState();
    st.acquireRifle('308-custom', { rng }); // triggers a save with gear
    st.setUnitsPrimary('MOA'); // a pure settings change — must NOT clear the gear
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    const saved = await store.load();
    expect(saved!.rifles).toHaveLength(1); // gear survived the settings write
    expect(saved!.settings.unitsPrimary).toBe('MOA');
  });

  it('acquire → persist → reload reproduces the instances + resolves the same truth', async () => {
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    const st = useGameStore.getState();
    const rid = st.acquireRifle('308-custom', { rng: () => 0.73 });
    st.selectRifle(rid);
    st.acquireLot('308-bulk', { rng: () => 0.4 });
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    const before = useGameStore.getState().inventory;
    // Simulate a cold relaunch: fresh inventory, then hydrate from the store.
    useGameStore.setState({ inventory: defaultInventory() });
    expect(useGameStore.getState().inventory.rifles).toHaveLength(0);
    await loadSettingsInto(useGameStore, store);
    const after = useGameStore.getState().inventory;
    expect(after).toEqual(before); // same draws, ids, catalogVersion, active selection
  });
});
