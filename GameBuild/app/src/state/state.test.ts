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
import {
  useGameStore,
  defaultSession,
  defaultSettings,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  ZOOM_MIN,
  ZOOM_MAX,
  settingsToSave,
  saveToSettings,
  loadSettingsInto,
  persistSettingsOnChange,
} from './index';

// Reset the singleton store before each test.
beforeEach(() => {
  useGameStore.setState({ session: defaultSession(), settings: defaultSettings() });
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

describe('settings persistence round-trip', () => {
  it('maps settings → SaveData → settings (unitsPrimary persisted)', () => {
    const settings = { unitsPrimary: 'MOA' as const, sensitivity: 1.5 };
    const save = settingsToSave(settings);
    expect(save.settings.unitsPrimary).toBe('MOA');
    const back = saveToSettings(save, defaultSettings());
    expect(back.unitsPrimary).toBe('MOA');
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

  it('sensitivity is intentionally NOT persisted under schema v1', () => {
    const save = settingsToSave({ unitsPrimary: 'MIL', sensitivity: 2.0 });
    expect('sensitivity' in save.settings).toBe(false);
  });
});
