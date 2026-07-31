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
  defaultDope,
  defaultChrono,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  COARSE_CLICKS,
  DEFAULT_SHOT_BUDGET,
  ZOOM_MIN,
  ZOOM_MAX,
  DEFAULT_WIND_PRESET,
  settingsToSave,
  saveToSettings,
  storeToSave,
  saveToInventory,
  loadSettingsInto,
  persistSettingsOnChange,
} from './index';
import type { DopeNode } from '../persistence';
import type { SaveData } from '../persistence';
import { DEFAULT_LOT_ROUNDS } from '../game/acquire';

/** Build a minimal ShotResult for scoring tests (impact geometry doesn't matter here).
 *  `zoneId` defaults to the legacy `'plate'`; pass one to exercise `score.zoneHits`. */
const shotResult = (hitPlateId: number | null, zoneId = 'plate'): ShotResult => ({
  impact: { x: 0, y: 0 },
  distanceM: 300,
  hitPlateId,
  aimedPlateId: hitPlateId,
  hitZone: hitPlateId === null ? null : { instanceId: hitPlateId, zoneId, localX: 0, localY: 0 },
});

/** Build a DopeNode for store tests. */
const dopeNode = (partial: Partial<DopeNode> = {}): DopeNode => ({
  rifleId: 'rifle-1',
  lotId: 'lot-1',
  distanceM: yardsToMeters(300),
  elevationRad: 0.003,
  windageRad: 0,
  zeroRangeM: yardsToMeters(100),
  shots: 3,
  hits: 3,
  conditions: { windSpeedMps: 0, windDirectionDeg: 0, tempC: 15, pressurePa: 101325 },
  confirmedAtIso: '2026-07-24T00:00:00.000Z',
  ...partial,
});

// Reset the singleton store before each test.
beforeEach(() => {
  useGameStore.setState({
    session: defaultSession(),
    settings: defaultSettings(),
    score: defaultScore(),
    inventory: defaultInventory(),
    dope: defaultDope(),
    chrono: defaultChrono(),
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

  // The coarse turret step (++/--) is a click COUNT, so it must land on exactly
  // 2 MIL and exactly 5 MOA without a unit branch. If either detent size ever
  // changes, this is where that assumption breaks.
  it('COARSE_CLICKS is exactly 2 MIL and exactly 5 MOA', () => {
    expect(COARSE_CLICKS * MIL_CLICK_RAD).toBeCloseTo(milToRad(2), 12);
    expect(COARSE_CLICKS * MOA_CLICK_RAD).toBeCloseTo(moaToRad(5), 12);
  });

  it('dialing a coarse step up then down returns to where it started', () => {
    const s = useGameStore.getState();
    s.dialElevationClicks(COARSE_CLICKS);
    expect(useGameStore.getState().session.scope.elevationRad).toBeCloseTo(milToRad(2), 12);
    s.dialElevationClicks(-COARSE_CLICKS);
    expect(useGameStore.getState().session.scope.elevationRad).toBeCloseTo(0, 12);
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
  // The DEFAULT is unlimited (owner 2026-07-29), but the mechanism still works
  // for any range that sets a finite budget in its registry row — so this is
  // driven with an explicit finite budget rather than the default.
  it('decrements and floors at zero when a range sets a finite budget', () => {
    const st = useGameStore.getState();
    st.selectTarget(yardsToMeters(300), 3);
    st.decrementBudget();
    st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(1);
    st.decrementBudget();
    st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(0);
  });

  it('is unlimited by default, so a shot can never be refused for budget', () => {
    expect(DEFAULT_SHOT_BUDGET).toBe(Infinity);
    const st = useGameStore.getState();
    st.commitTarget(1, 500);
    for (let i = 0; i < 50; i++) st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(Infinity);
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
    expect(s.shotBudget).toBe(3);   // explicit budget passed above
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
    st.decrementBudget();
    st.commitTarget(7, yardsToMeters(300));
    const s = useGameStore.getState().session;
    expect(s.currentTarget).toEqual({ plateInstanceId: 7, distanceM: yardsToMeters(300) });
    expect(s.shotsAtCurrentTarget).toBe(0);
    expect(s.shotBudget).toBe(DEFAULT_SHOT_BUDGET);
    expect(s.lastShots).toEqual([]);
    expect(useGameStore.getState().score.targetsEngaged).toBe(1);
  });

  // Committing used to zero the turret. It must not: commit-preferred aim
  // resolution makes COMMIT the way you HOLD a target through a big holdover, so
  // resetting the dial would throw away the very solution the player committed to
  // protect. Real turrets do not spring back when you look at another target.
  // THE PROBE'S DEAD FIRE BUTTON. The scene granted 999 shots at mount, but the
  // COMMIT button called commitTarget with no budget, so the store default (3)
  // silently replaced it — and three shots later firing stopped for good,
  // independent of gear. Budget is now a property of the RANGE and every commit
  // path forwards it.
  it('an explicit undefined budget behaves exactly like omitting it', () => {
    const st = useGameStore.getState();
    st.commitTarget(1, 500, undefined);
    expect(useGameStore.getState().session.shotBudget).toBe(DEFAULT_SHOT_BUDGET);
  });

  it('an explicit budget survives commit, and re-committing keeps granting it', () => {
    const st = useGameStore.getState();
    st.commitTarget(1, 500, 999);
    expect(useGameStore.getState().session.shotBudget).toBe(999);
    st.decrementBudget();
    st.decrementBudget();
    expect(useGameStore.getState().session.shotBudget).toBe(997);
    // The case that broke: a second commit must not fall back to the default.
    st.commitTarget(2, 1000, 999);
    expect(useGameStore.getState().session.shotBudget).toBe(999);
  });

  it('commitTarget PRESERVES the dialled elevation and windage', () => {
    const st = useGameStore.getState();
    st.dialElevationClicks(120); // 12 MIL — an ELR come-up
    st.dialWindageClicks(-15);
    const before = useGameStore.getState().session.scope;
    st.commitTarget(7, yardsToMeters(1500));
    const after = useGameStore.getState().session.scope;
    expect(after.elevationRad).toBe(before.elevationRad);
    expect(after.windageRad).toBe(before.windageRad);
    expect(after.elevationRad).toBeCloseTo(milToRad(12), 12);
  });

  it('re-committing to a different target still keeps the dial', () => {
    const st = useGameStore.getState();
    st.dialElevationClicks(60);
    st.commitTarget(1, yardsToMeters(500));
    st.commitTarget(2, yardsToMeters(1000));
    expect(useGameStore.getState().session.scope.elevationRad).toBeCloseTo(milToRad(6), 12);
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

  it('tallies hits by zone, and the tally always sums to hits (task T2)', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, yardsToMeters(100));
    st.recordShot(shotResult(7, 'head-0'));
    st.recordShot(shotResult(7, 'minus-1'));
    st.recordShot(shotResult(7, 'minus-1'));
    st.recordShot(shotResult(null)); // miss: no zone
    st.recordShot(shotResult(9, 'head-0')); // wrong plate: not a hit, so not tallied
    const score = useGameStore.getState().score;
    expect(score.zoneHits).toEqual({ 'head-0': 1, 'minus-1': 2 });
    // The invariant that keeps `zoneHits` and `hits` from telling different
    // stories — asserted rather than assumed, because they are incremented in two
    // separate expressions.
    const summed = Object.values(score.zoneHits).reduce((a, b) => a + b, 0);
    expect(summed).toBe(score.hits);
    expect(score.hits).toBe(3);
    expect(score.shotsFired).toBe(5);
  });

  it('starts and resets with an empty zone tally', () => {
    expect(useGameStore.getState().score.zoneHits).toEqual({});
    const st = useGameStore.getState();
    st.commitTarget(1, yardsToMeters(100));
    st.recordShot(shotResult(1, 'plate'));
    expect(useGameStore.getState().score.zoneHits).toEqual({ plate: 1 });
    useGameStore.getState().resetScore();
    expect(useGameStore.getState().score.zoneHits).toEqual({});
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

describe('DOPE nodes (task 2.4a)', () => {
  const rng = () => 0.5;

  it('confirmNode adds a node; re-confirming the same station replaces it (D5)', () => {
    const st = useGameStore.getState();
    st.confirmNode(dopeNode({ elevationRad: 0.003 }));
    st.confirmNode(dopeNode({ elevationRad: 0.005 })); // same rifle+lot+station
    const nodes = useGameStore.getState().dope.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].elevationRad).toBe(0.005);
  });

  it('deleteNode removes the matching station only', () => {
    const st = useGameStore.getState();
    st.confirmNode(dopeNode({ distanceM: yardsToMeters(300) }));
    st.confirmNode(dopeNode({ distanceM: yardsToMeters(500) }));
    st.deleteNode('rifle-1', 'lot-1', yardsToMeters(300));
    const nodes = useGameStore.getState().dope.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].distanceM).toBeCloseTo(yardsToMeters(500), 9);
  });

  it('deleteRifle cascades: its nodes are pruned in the same update', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    st.confirmNode(dopeNode({ rifleId: rid, distanceM: yardsToMeters(300) }));
    st.confirmNode(dopeNode({ rifleId: 'other-rifle', distanceM: yardsToMeters(300) }));
    st.deleteRifle(rid);
    const nodes = useGameStore.getState().dope.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].rifleId).toBe('other-rifle');
  });

  it('deleteLot cascades: its nodes are pruned in the same update', () => {
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng });
    st.confirmNode(dopeNode({ lotId: lid }));
    st.confirmNode(dopeNode({ lotId: 'other-lot', distanceM: yardsToMeters(500) }));
    st.deleteLot(lid);
    const nodes = useGameStore.getState().dope.nodes;
    expect(nodes).toHaveLength(1);
    expect(nodes[0].lotId).toBe('other-lot');
  });

  it('resetSession leaves the DOPE book alone (nodes are not session state)', () => {
    const st = useGameStore.getState();
    st.confirmNode(dopeNode());
    st.resetSession();
    expect(useGameStore.getState().dope.nodes).toHaveLength(1);
  });

  it('storeToSave carries dopeNodes', () => {
    const st = useGameStore.getState();
    st.confirmNode(dopeNode());
    const save = storeToSave(useGameStore.getState());
    expect(save.dopeNodes).toHaveLength(1);
  });

  it('a confirmNode change triggers a persist, and reload rehydrates the book', async () => {
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    useGameStore.getState().confirmNode(dopeNode({ distanceM: yardsToMeters(400) }));
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    const before = useGameStore.getState().dope;
    // Cold relaunch: clear the book, then hydrate from the store.
    useGameStore.setState({ dope: defaultDope() });
    expect(useGameStore.getState().dope.nodes).toHaveLength(0);
    await loadSettingsInto(useGameStore, store);
    expect(useGameStore.getState().dope).toEqual(before);
  });
});

describe('chronograph (task 2.4e)', () => {
  const rng = () => 0.5;

  it('setChronoDeployed toggles the deploy flag', () => {
    const st = useGameStore.getState();
    expect(st.chrono.deployed).toBe(false);
    st.setChronoDeployed(true);
    expect(useGameStore.getState().chrono.deployed).toBe(true);
  });

  it('logChronoReading builds the live string for a pairing without touching summaries', () => {
    const st = useGameStore.getState();
    st.logChronoReading('r1', 'l1', 820);
    st.logChronoReading('r1', 'l1', 824);
    const c = useGameStore.getState().chrono;
    expect(c.current).toEqual({ rifleId: 'r1', lotId: 'l1', readings: [820, 824] });
    expect(c.summaries).toHaveLength(0); // not persisted until committed
  });

  it('switching gear mid-string auto-commits the old string, then starts fresh', () => {
    const st = useGameStore.getState();
    st.logChronoReading('r1', 'l1', 820);
    st.logChronoReading('r1', 'l1', 824);
    st.logChronoReading('r2', 'l2', 900); // different pairing → auto-commit r1/l1
    const c = useGameStore.getState().chrono;
    expect(c.summaries).toHaveLength(1);
    expect(c.summaries[0]).toMatchObject({ rifleId: 'r1', lotId: 'l1', shots: 2, avgMps: 822 });
    expect(c.current).toEqual({ rifleId: 'r2', lotId: 'l2', readings: [900] });
  });

  it('commitChronoString merges the live string into the summary and clears it', () => {
    const st = useGameStore.getState();
    st.logChronoReading('r1', 'l1', 818);
    st.logChronoReading('r1', 'l1', 822);
    st.commitChronoString('2026-07-24T00:00:00.000Z');
    const c = useGameStore.getState().chrono;
    expect(c.current).toBeNull();
    expect(c.summaries).toHaveLength(1);
    expect(c.summaries[0]).toMatchObject({ rifleId: 'r1', lotId: 'l1', shots: 2, avgMps: 820 });
    // A second string for the same pairing merges (running total grows).
    st.logChronoReading('r1', 'l1', 826);
    st.commitChronoString('2026-07-24T00:01:00.000Z');
    expect(useGameStore.getState().chrono.summaries[0].shots).toBe(3);
  });

  it('committing a chrono string writes the lot effective MV (chrono → MV, D15 lever 1)', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng: () => 0.5 });
    const lid = st.acquireLot('65cm-match', { rng: () => 0.5 });
    st.logChronoReading(rid, lid, 800);
    st.logChronoReading(rid, lid, 810);
    st.commitChronoString('2026-07-27T00:00:00.000Z');
    const lot = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    expect(lot.effective?.mvMps).toBeCloseTo(805, 6); // avg of 800, 810
    expect(lot.effective?.mvSource).toBe('chrono');
    expect(lot.effective?.bcSource).toBe('box'); // BC side untouched
  });

  it('a gear switch mid-string commits it AND writes the prior lot effective MV', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng: () => 0.5 });
    const lid = st.acquireLot('65cm-match', { rng: () => 0.5 });
    st.logChronoReading(rid, lid, 790);
    st.logChronoReading(rid, lid, 800);
    st.logChronoReading('other-rifle', 'other-lot', 900); // switch → auto-commit rid/lid
    const lot = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    expect(lot.effective?.mvMps).toBeCloseTo(795, 6);
    expect(lot.effective?.mvSource).toBe('chrono');
  });

  it('deleteRifle / deleteLot cascade-prune chrono summaries', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    st.logChronoReading(rid, lid, 820);
    st.logChronoReading('other', 'other', 900);
    st.commitChronoString('iso'); // commits the CURRENT string ('other'/'other')
    // Put rid/lid's string back and commit it too.
    st.logChronoReading(rid, lid, 820);
    st.commitChronoString('iso');
    expect(useGameStore.getState().chrono.summaries).toHaveLength(2);
    st.deleteRifle(rid);
    expect(useGameStore.getState().chrono.summaries.some((s) => s.rifleId === rid)).toBe(false);
  });

  it('resetSession leaves the chrono record alone', () => {
    const st = useGameStore.getState();
    st.logChronoReading('r1', 'l1', 820);
    st.commitChronoString('iso');
    st.resetSession();
    expect(useGameStore.getState().chrono.summaries).toHaveLength(1);
  });

  it('storeToSave carries chronoSummaries', () => {
    const st = useGameStore.getState();
    st.logChronoReading('r1', 'l1', 820);
    st.commitChronoString('iso');
    expect(storeToSave(useGameStore.getState()).chronoSummaries).toHaveLength(1);
  });

  it('committing persists; reload rehydrates summaries and resets deployed/current', async () => {
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    const st = useGameStore.getState();
    st.setChronoDeployed(true);
    st.logChronoReading('r1', 'l1', 820);
    st.logChronoReading('r1', 'l1', 824);
    st.commitChronoString('2026-07-24T00:00:00.000Z'); // summaries change → persist
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    // Cold relaunch: fresh chrono, then hydrate.
    useGameStore.setState({ chrono: defaultChrono() });
    await loadSettingsInto(useGameStore, store);
    const c = useGameStore.getState().chrono;
    expect(c.summaries).toHaveLength(1);
    expect(c.summaries[0].shots).toBe(2);
    expect(c.deployed).toBe(false); // session-only — reset on load
    expect(c.current).toBeNull();
  });
});

describe('setLotEffectiveBc (bc-truing-plan T2, D15 lever 2)', () => {
  it('writes bc + source, leaving mvMps/mvSource byte-identical', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng: () => 0.5 });
    const lid = st.acquireLot('65cm-match', { rng: () => 0.5 });
    st.logChronoReading(rid, lid, 800);
    st.logChronoReading(rid, lid, 810);
    st.commitChronoString('2026-07-31T00:00:00.000Z'); // effective.mvMps = 805, mvSource: 'chrono'
    const before = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!.effective;

    st.setLotEffectiveBc(lid, 0.251, 'trued');

    const lot = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    expect(lot.effective?.bc).toBeCloseTo(0.251, 9);
    expect(lot.effective?.bcSource).toBe('trued');
    expect(lot.effective?.mvMps).toBe(before?.mvMps);
    expect(lot.effective?.mvSource).toBe(before?.mvSource);
  });

  it('creates the effective object on a lot that has none, with mvSource: box', () => {
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng: () => 0.5 });
    expect(useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!.effective).toBeUndefined();

    st.setLotEffectiveBc(lid, 0.243, 'provisional');

    const lot = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    expect(lot.effective?.bc).toBeCloseTo(0.243, 9);
    expect(lot.effective?.bcSource).toBe('provisional');
    expect(lot.effective?.mvSource).toBe('box');
    expect(lot.effective?.mvMps).toBeUndefined();
  });

  it('is a no-op for an unknown lot id', () => {
    const before = useGameStore.getState().inventory.ammoLots;
    useGameStore.getState().setLotEffectiveBc('no-such-lot', 0.3, 'trued');
    expect(useGameStore.getState().inventory.ammoLots).toEqual(before);
  });

  it('survives a save/load round trip', async () => {
    const store = new MemorySaveStore();
    const unsub = persistSettingsOnChange(useGameStore, store);
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng: () => 0.5 });
    st.setLotEffectiveBc(lid, 0.257, 'provisional'); // inventory change → persist
    await new Promise((r) => setTimeout(r, 0));
    unsub();

    // Cold relaunch: fresh inventory, then hydrate.
    useGameStore.setState({ inventory: defaultInventory() });
    await loadSettingsInto(useGameStore, store);
    const lot = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    expect(lot.effective?.bc).toBeCloseTo(0.257, 9);
    expect(lot.effective?.bcSource).toBe('provisional');
  });
});

describe('saveToInventory P2 backfill (pre-P2 records get the new fields)', () => {
  const preP2Save = (): SaveData => ({
    schemaVersion: 2,
    updatedAt: new Date(0).toISOString(),
    settings: { unitsPrimary: 'MIL' },
    rifles: [{ id: 'r1', catalogId: '65cm-custom', catalogVersion: 1, draws: { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 } }],
    ammoLots: [
      { id: 'l1', catalogId: '65cm-match', catalogVersion: 1, draws: { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 } },
      { id: 'l2', catalogId: '65cm-bulk', catalogVersion: 1, draws: { meanMvShift: 0.5, mvSd: 0.5, bcError: 0.5, bcSd: 0.5 } },
    ],
  });

  it('backfills rifle acquiredAt + lifetimeShotCount', () => {
    const inv = saveToInventory(preP2Save());
    expect(inv.rifles[0].acquiredAt).toBe(0);
    expect(inv.rifles[0].lifetimeShotCount).toBe(0);
  });

  it('backfills lot roundsRemaining/acquiredAt and assigns a unique [A-Z][0-9][0-9] code', () => {
    const inv = saveToInventory(preP2Save());
    for (const l of inv.ammoLots) {
      expect(l.roundsRemaining).toBe(DEFAULT_LOT_ROUNDS);
      expect(l.acquiredAt).toBe(0);
      expect(l.lotNumber).toMatch(/^[A-Z]\d{2}$/);
    }
    expect(inv.ammoLots[0].lotNumber).not.toBe(inv.ammoLots[1].lotNumber); // distinct
  });

  it('assigns the same codes on every load (deterministic, stable)', () => {
    const a = saveToInventory(preP2Save()).ammoLots.map((l) => l.lotNumber);
    const b = saveToInventory(preP2Save()).ammoLots.map((l) => l.lotNumber);
    expect(a).toEqual(b);
  });

  it('preserves an already-assigned code and never collides a backfilled one against it', () => {
    const save = preP2Save();
    // Pin l1 to whatever l2 WOULD be assigned, forcing the backfill to dodge it.
    const l2code = saveToInventory(preP2Save()).ammoLots[1].lotNumber!;
    save.ammoLots[0].lotNumber = l2code;
    const inv = saveToInventory(save);
    expect(inv.ammoLots[0].lotNumber).toBe(l2code); // preserved
    expect(inv.ammoLots[1].lotNumber).not.toBe(l2code); // dodged the collision
  });
});

describe('consumeRound (P2b — shot count + round depletion)', () => {
  const rng = () => 0.5;

  it('increments the rifle lifetime count and decrements the lot rounds', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    const lot0 = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!;
    const start = lot0.roundsRemaining!;
    st.consumeRound(rid, lid);
    const inv = useGameStore.getState().inventory;
    expect(inv.rifles.find((r) => r.id === rid)!.lifetimeShotCount).toBe(1);
    expect(inv.ammoLots.find((l) => l.id === lid)!.roundsRemaining).toBe(start - 1);
  });

  it('floors rounds at 0 (never negative) while the lifetime count keeps climbing', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    const start = useGameStore.getState().inventory.ammoLots.find((l) => l.id === lid)!.roundsRemaining!;
    for (let i = 0; i < start + 5; i++) st.consumeRound(rid, lid);
    const inv = useGameStore.getState().inventory;
    expect(inv.ammoLots.find((l) => l.id === lid)!.roundsRemaining).toBe(0);
    expect(inv.rifles.find((r) => r.id === rid)!.lifetimeShotCount).toBe(start + 5);
  });

  it('is a no-op for unknown ids', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    const before = useGameStore.getState().inventory;
    st.consumeRound('nope-rifle', 'nope-lot');
    const after = useGameStore.getState().inventory;
    expect(after.rifles.find((r) => r.id === rid)!.lifetimeShotCount).toBe(0);
    expect(after.ammoLots.find((l) => l.id === lid)!.roundsRemaining).toBe(before.ammoLots.find((l) => l.id === lid)!.roundsRemaining);
  });
});

describe('replenishLot (P4)', () => {
  const rng = () => 0.5;

  it('appends a fresh lot of the same ammo: new id + code, full rounds, no effective on a blank replenish', () => {
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng });
    const freshId = st.replenishLot(lid, false)!;
    const inv = useGameStore.getState().inventory;
    expect(inv.ammoLots).toHaveLength(2);
    const fresh = inv.ammoLots.find((l) => l.id === freshId)!;
    const src = inv.ammoLots.find((l) => l.id === lid)!;
    expect(fresh.catalogId).toBe(src.catalogId);
    expect(fresh.id).not.toBe(src.id);
    expect(fresh.lotNumber).not.toBe(src.lotNumber);
    expect(fresh.lotNumber).toMatch(/^[A-Z]\d{2}$/);
    expect(fresh.roundsRemaining).toBe(DEFAULT_LOT_ROUNDS);
    expect(fresh.effective).toBeUndefined();
  });

  it('carries a discovered (chrono) MV forward as provisional', () => {
    const st = useGameStore.getState();
    const rid = st.acquireRifle('65cm-custom', { rng });
    const lid = st.acquireLot('65cm-match', { rng });
    st.logChronoReading(rid, lid, 800);
    st.logChronoReading(rid, lid, 810);
    st.commitChronoString('2026-07-27T00:00:00.000Z');
    const freshId = st.replenishLot(lid, true)!;
    const fresh = useGameStore.getState().inventory.ammoLots.find((l) => l.id === freshId)!;
    expect(fresh.effective?.mvMps).toBeCloseTo(805, 6); // carried from the source chrono avg
    expect(fresh.effective?.mvSource).toBe('provisional'); // but unverified on the new lot
    expect(fresh.effective?.bcSource).toBe('provisional');
  });

  it('carryForward with nothing discovered yields a plain box lot (no effective)', () => {
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng });
    const freshId = st.replenishLot(lid, true)!;
    expect(useGameStore.getState().inventory.ammoLots.find((l) => l.id === freshId)!.effective).toBeUndefined();
  });

  it('makes the new lot active when the source lot was active (seamless continue)', () => {
    const st = useGameStore.getState();
    const lid = st.acquireLot('65cm-match', { rng });
    st.selectLot(lid);
    const freshId = st.replenishLot(lid, false)!;
    expect(useGameStore.getState().inventory.activeLotId).toBe(freshId);
  });

  it('leaves the active selection alone if a different lot was active', () => {
    const st = useGameStore.getState();
    const a = st.acquireLot('65cm-match', { rng });
    const b = st.acquireLot('65cm-bulk', { rng });
    st.selectLot(b);
    st.replenishLot(a, false);
    expect(useGameStore.getState().inventory.activeLotId).toBe(b);
  });

  it('returns null for an unknown source lot', () => {
    expect(useGameStore.getState().replenishLot('nope', true)).toBeNull();
  });
});

describe('firing point (ELR build spec task 9)', () => {
  it('defaults to the high line — the centrefire ladder the range is for', () => {
    expect(defaultSession().firingPoint).toBe('high');
    expect(useGameStore.getState().session.firingPoint).toBe('high');
  });

  it('moves to the low line and back', () => {
    const st = useGameStore.getState();
    st.setFiringPoint('low');
    expect(useGameStore.getState().session.firingPoint).toBe('low');
    st.setFiringPoint('high');
    expect(useGameStore.getState().session.firingPoint).toBe('high');
  });

  // Switching lines is a MOVE. The plate committed from one line may not exist
  // on the other, and its instanceId would dangle into a rebuilt plate array.
  it('drops the committed target and its shot history on a change', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, 1000);
    expect(useGameStore.getState().session.currentTarget).not.toBeNull();
    st.setFiringPoint('low');
    const s = useGameStore.getState().session;
    expect(s.currentTarget).toBeNull();
    expect(s.shotsAtCurrentTarget).toBe(0);
    expect(s.lastShots).toEqual([]);
  });

  // Re-selecting the line you are already on must not tear the scene down —
  // the effect keys off this value, so an identity change rebuilds the world.
  it('is a no-op when the point is unchanged, keeping the commitment', () => {
    const st = useGameStore.getState();
    st.commitTarget(7, 1000);
    const before = useGameStore.getState().session;
    st.setFiringPoint('high');
    const after = useGameStore.getState().session;
    expect(after).toBe(before);
    expect(after.currentTarget).not.toBeNull();
  });

  it('leaves the rest of the session alone', () => {
    const st = useGameStore.getState();
    st.setWind({ speedMps: 4.5, directionDeg: 90 });
    st.setRangeId('elr-range');
    st.setFiringPoint('low');
    const s = useGameStore.getState().session;
    expect(s.rangeId).toBe('elr-range');
    expect(s.wind).toEqual({ speedMps: 4.5, directionDeg: 90 });
  });
});
