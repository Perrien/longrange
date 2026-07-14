// Game-state skeleton (task 1.1; build-plan §5 Increment 1).
//
// One Zustand store holds two slices:
//   • session  — the live engagement: current range, target, wind, shot budget,
//                and scope state (dialed turret corrections + zoom).
//   • settings — player preferences: which angular unit leads, aim sensitivity.
//
// All numeric state is SI (radians, metres, m/s) to match the engine and the
// units service; presentation converts at the edges via the units module. No
// unit math is done inline here — dial stepping composes pre-built click values
// (guardrail §4.4).
//
// Actions are pure reducers over `set`; they're exercised directly in vitest
// without React. Settings persistence lives in ./persist-settings.

import { create } from 'zustand';
import { milToRad, moaToRad } from '../units';
import { yardsToMeters } from '../units';
import type { ShotResult } from '../game/shot';

export type UnitsPrimary = 'MIL' | 'MOA';

/** Wind as the player sets it: a mean speed and the direction it blows FROM.
 *  Constant for Increment 1; the curl-noise field arrives in task 1.7. */
export interface WindState {
  /** Mean wind speed, m/s. */
  speedMps: number;
  /** Direction the wind blows FROM, degrees clockwise from downrange (0 = 12 o'clock). */
  directionDeg: number;
}

/** Scope/turret state the player manipulates to build a firing solution. */
export interface ScopeState {
  /** Dialed elevation correction, radians (up positive). */
  elevationRad: number;
  /** Dialed windage correction, radians (right positive). */
  windageRad: number;
  /** Turret detent value per click, radians (e.g. 0.1 mrad or 1/4 MOA). */
  clickRad: number;
  /** Magnification (zoom), ×. Clamped to [ZOOM_MIN, ZOOM_MAX]. */
  magnification: number;
}

export interface SessionState {
  /** Active range id (Range A this increment). */
  rangeId: string;
  /** Current target distance, metres. */
  targetDistanceM: number;
  wind: WindState;
  /** Shots remaining on the current target. */
  shotBudget: number;
  scope: ScopeState;
  /** Resolved shots this engagement (task 1.4c); cleared on target switch. */
  lastShots: ShotResult[];
}

export interface SettingsState {
  /** Which angular unit leads in the UI; both are always shown (catalog §0.6). */
  unitsPrimary: UnitsPrimary;
  /** Aim sensitivity multiplier (carried from the task-0.9 aim spike; default 1.0). */
  sensitivity: number;
  /** Show the in-scope bullet trace on each shot (task 1.5b). Store-only for now
   *  (not in save schema v1 — like `sensitivity`; see persist-settings.ts). */
  traceEnabled: boolean;
}

// --- Constants / defaults ---------------------------------------------------

/** MIL turret detent: 0.1 mrad per click. */
export const MIL_CLICK_RAD = milToRad(0.1);
/** MOA turret detent: 1/4 MOA per click. */
export const MOA_CLICK_RAD = moaToRad(0.25);

export const ZOOM_MIN = 4.5;
export const ZOOM_MAX = 35;
export const DEFAULT_MAGNIFICATION = 10;
export const DEFAULT_SHOT_BUDGET = 3;

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const defaultSession = (): SessionState => ({
  rangeId: 'range-a',
  targetDistanceM: yardsToMeters(100),
  wind: { speedMps: 0, directionDeg: 0 },
  shotBudget: DEFAULT_SHOT_BUDGET,
  scope: {
    elevationRad: 0,
    windageRad: 0,
    clickRad: MIL_CLICK_RAD,
    magnification: DEFAULT_MAGNIFICATION,
  },
  lastShots: [],
});

export const defaultSettings = (): SettingsState => ({
  unitsPrimary: 'MIL',
  sensitivity: 1.0,
  traceEnabled: true,
});

// --- Store ------------------------------------------------------------------

export interface GameStore {
  session: SessionState;
  settings: SettingsState;

  // Scope / turret
  /** Dial elevation by N detents (can be negative). */
  dialElevationClicks(clicks: number): void;
  /** Dial windage by N detents (can be negative). */
  dialWindageClicks(clicks: number): void;
  /** Set the elevation correction absolutely (radians). */
  setElevationRad(rad: number): void;
  /** Set the windage correction absolutely (radians). */
  setWindageRad(rad: number): void;
  /** Set the turret detent value (radians) — e.g. switch MIL/MOA scope. */
  setClickRad(rad: number): void;
  /** Set magnification (clamped to the optic's range). */
  setZoom(mag: number): void;

  // Wind
  setWind(partial: Partial<WindState>): void;

  // Budget / target
  /** Decrement the shot budget by one, floored at zero. */
  decrementBudget(): void;
  /** Record a resolved shot's result (task 1.4c). */
  recordShot(result: ShotResult): void;
  /** Switch to a target: sets distance, resets dials to zero, refills budget. */
  selectTarget(distanceM: number, budget?: number): void;
  /** Reset the whole session to defaults (settings untouched). */
  resetSession(): void;

  // Settings
  setUnitsPrimary(u: UnitsPrimary): void;
  setSensitivity(s: number): void;
  setTraceEnabled(enabled: boolean): void;
  /** Merge a partial settings patch (used by persistence hydration). */
  applySettings(patch: Partial<SettingsState>): void;
}

export const useGameStore = create<GameStore>()((set) => ({
  session: defaultSession(),
  settings: defaultSettings(),

  dialElevationClicks: (clicks) =>
    set((s) => ({
      session: {
        ...s.session,
        scope: {
          ...s.session.scope,
          elevationRad: s.session.scope.elevationRad + clicks * s.session.scope.clickRad,
        },
      },
    })),

  dialWindageClicks: (clicks) =>
    set((s) => ({
      session: {
        ...s.session,
        scope: {
          ...s.session.scope,
          windageRad: s.session.scope.windageRad + clicks * s.session.scope.clickRad,
        },
      },
    })),

  setElevationRad: (rad) =>
    set((s) => ({
      session: { ...s.session, scope: { ...s.session.scope, elevationRad: rad } },
    })),

  setWindageRad: (rad) =>
    set((s) => ({
      session: { ...s.session, scope: { ...s.session.scope, windageRad: rad } },
    })),

  setClickRad: (rad) =>
    set((s) => ({
      session: { ...s.session, scope: { ...s.session.scope, clickRad: rad } },
    })),

  setZoom: (mag) =>
    set((s) => ({
      session: {
        ...s.session,
        scope: { ...s.session.scope, magnification: clamp(mag, ZOOM_MIN, ZOOM_MAX) },
      },
    })),

  setWind: (partial) =>
    set((s) => ({ session: { ...s.session, wind: { ...s.session.wind, ...partial } } })),

  decrementBudget: () =>
    set((s) => ({
      session: { ...s.session, shotBudget: Math.max(0, s.session.shotBudget - 1) },
    })),

  recordShot: (result) =>
    set((s) => ({
      session: { ...s.session, lastShots: [...s.session.lastShots, result] },
    })),

  selectTarget: (distanceM, budget = DEFAULT_SHOT_BUDGET) =>
    set((s) => ({
      session: {
        ...s.session,
        targetDistanceM: distanceM,
        shotBudget: budget,
        scope: { ...s.session.scope, elevationRad: 0, windageRad: 0 },
        lastShots: [],
      },
    })),

  resetSession: () => set({ session: defaultSession() }),

  setUnitsPrimary: (u) => set((s) => ({ settings: { ...s.settings, unitsPrimary: u } })),

  setSensitivity: (sensitivity) =>
    set((s) => ({ settings: { ...s.settings, sensitivity } })),

  setTraceEnabled: (traceEnabled) =>
    set((s) => ({ settings: { ...s.settings, traceEnabled } })),

  applySettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
