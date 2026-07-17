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
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_WIND_PRESET,
  settingsToSave,
  saveToSettings,
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
