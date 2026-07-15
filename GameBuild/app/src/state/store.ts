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

/** Wind realism mode (task 1.7a, D1). 'steady' keeps the bullet flying through
 *  exactly the dialed mean (byte-identical to 1.6, deterministic — the owner's
 *  test harness); 'realistic' layers a curl-noise field's deviation on top of
 *  that mean (D2/D3b), so the dial becomes a guideline the player must read
 *  off flags/mirage rather than ground truth. */
export type WindRealism = 'steady' | 'realistic';

/** Wind marker visual style (task 1.7b, plan step 1 — "owner picks flags vs
 *  socks vs both"). Same literal union as `range/wind-markers-config.ts`'s
 *  `MarkerStyle` — declared locally (not imported) so `state/` doesn't depend
 *  on `range/`, matching how `units/display.ts` duplicates `UnitsPrimary`
 *  rather than importing it from here. */
export type MarkerStyle = 'flag' | 'sock' | 'both';

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

/** The specific plate the player has committed to engaging (task 1.6b, D2).
 *  `null` before the player has committed to any plate this session. */
export interface CommittedTarget {
  /** The plate's instance id (matches `PlateInstance.instanceId` / `ShotResult.hitPlateId`). */
  plateInstanceId: number;
  /** Distance to the committed plate, metres. */
  distanceM: number;
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
  /** The plate committed to via `commitTarget` (D2); null until the player commits. */
  currentTarget: CommittedTarget | null;
  /** Shots fired at `currentTarget` since the last commit. */
  shotsAtCurrentTarget: number;
  /** Raw BTK wind-turbulence preset name (task 1.7a, D3) — one of
   *  `WindPresets.listPresets()` (e.g. 'Moderate', 'Gusty', 'Switchy'…).
   *  Session-only (not persisted, unlike `settings.windRealism`): it's a
   *  per-engagement choice, not a durable player preference. Only meaningful
   *  in Realistic mode; validated against the live preset list at use-site
   *  (a bad/stale value must never crash the field build). */
  windPreset: string;
}

/** Session-scoped scoring counters (D2). Session-only for Increment 1 — not
 *  persisted (folds into the save at the Increment-2 schema-v2 bump). */
export interface ScoreState {
  /** Shots that struck the committed plate. */
  hits: number;
  /** Total shots fired (any outcome). */
  shotsFired: number;
  /** Hits that were the first shot fired after committing to their plate. */
  firstRoundHits: number;
  /** Number of `commitTarget` calls this session. */
  targetsEngaged: number;
}

export interface SettingsState {
  /** Which angular unit leads in the UI; both are always shown (catalog §0.6). */
  unitsPrimary: UnitsPrimary;
  /** Aim sensitivity multiplier (carried from the task-0.9 aim spike; default 1.0). */
  sensitivity: number;
  /** Show the in-scope bullet trace on each shot (task 1.5b). Store-only for now
   *  (not in save schema v1 — like `sensitivity`; see persist-settings.ts). */
  traceEnabled: boolean;
  /** Steady vs. Realistic wind (task 1.7a, D1). Persisted — additive optional
   *  field on save schema v1, defaulting to 'steady' on load (see
   *  persist-settings.ts / persistence/schema.ts); this is a durable player
   *  preference, unlike the per-engagement `session.windPreset`. */
  windRealism: WindRealism;
  /** Flag / sock / both (task 1.7b). Store-only (not in save schema v1 — like
   *  `sensitivity`/`traceEnabled`): a cosmetic session preference, not a
   *  durable one. */
  windMarkerStyle: MarkerStyle;
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
/** Default raw BTK preset for Realistic mode (task 1.7a, D3) — "a moderate
 *  preset name" per the plan; 'Moderate' is literally one of the 10 real
 *  `WindPresets.listPresets()` names (owner-confirmed 2026-07-15). */
export const DEFAULT_WIND_PRESET = 'Moderate';

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
  currentTarget: null,
  shotsAtCurrentTarget: 0,
  windPreset: DEFAULT_WIND_PRESET,
});

export const defaultSettings = (): SettingsState => ({
  unitsPrimary: 'MIL',
  sensitivity: 1.0,
  traceEnabled: true,
  windRealism: 'steady',
  windMarkerStyle: 'flag',
});

export const defaultScore = (): ScoreState => ({
  hits: 0,
  shotsFired: 0,
  firstRoundHits: 0,
  targetsEngaged: 0,
});

// --- Store ------------------------------------------------------------------

export interface GameStore {
  session: SessionState;
  settings: SettingsState;
  score: ScoreState;

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
  /** Set the raw BTK turbulence preset name (task 1.7a, D3). Session-only;
   *  the caller (ScopeView) is responsible for validating against the live
   *  `listWindPresets()` before building a field from it. */
  setWindPreset(preset: string): void;

  // Budget / target
  /** Decrement the shot budget by one, floored at zero. */
  decrementBudget(): void;
  /** Record a resolved shot's result (task 1.4c); also scores it against
   *  `currentTarget` (task 1.6b, D2). */
  recordShot(result: ShotResult): void;
  /** Switch to a target: sets distance, resets dials to zero, refills budget. */
  selectTarget(distanceM: number, budget?: number): void;
  /** Commit to engaging a specific plate (D2): sets `currentTarget`, resets the
   *  per-target shot count + dials, refills the shot budget, clears `lastShots`,
   *  and bumps `score.targetsEngaged`. This is the "new target" boundary. */
  commitTarget(plateInstanceId: number, distanceM: number, budget?: number): void;
  /** Reset the whole session to defaults (settings untouched); also resets score. */
  resetSession(): void;
  /** Reset just the scoring counters. */
  resetScore(): void;

  // Settings
  setUnitsPrimary(u: UnitsPrimary): void;
  setSensitivity(s: number): void;
  setTraceEnabled(enabled: boolean): void;
  /** Steady vs. Realistic wind (task 1.7a, D1). Persisted (see persist-settings.ts). */
  setWindRealism(mode: WindRealism): void;
  /** Flag / sock / both (task 1.7b). Store-only, not persisted. */
  setWindMarkerStyle(style: MarkerStyle): void;
  /** Merge a partial settings patch (used by persistence hydration). */
  applySettings(patch: Partial<SettingsState>): void;
}

export const useGameStore = create<GameStore>()((set) => ({
  session: defaultSession(),
  settings: defaultSettings(),
  score: defaultScore(),

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

  setWindPreset: (preset) =>
    set((s) => ({ session: { ...s.session, windPreset: preset } })),

  decrementBudget: () =>
    set((s) => ({
      session: { ...s.session, shotBudget: Math.max(0, s.session.shotBudget - 1) },
    })),

  recordShot: (result) =>
    set((s) => {
      const shotsAtCurrentTarget = s.session.shotsAtCurrentTarget + 1;
      const isHit =
        s.session.currentTarget != null &&
        result.hitPlateId === s.session.currentTarget.plateInstanceId;
      const isFirstRoundAtTarget = shotsAtCurrentTarget === 1;
      return {
        session: {
          ...s.session,
          lastShots: [...s.session.lastShots, result],
          shotsAtCurrentTarget,
        },
        score: {
          ...s.score,
          shotsFired: s.score.shotsFired + 1,
          hits: s.score.hits + (isHit ? 1 : 0),
          firstRoundHits: s.score.firstRoundHits + (isHit && isFirstRoundAtTarget ? 1 : 0),
        },
      };
    }),

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

  commitTarget: (plateInstanceId, distanceM, budget = DEFAULT_SHOT_BUDGET) =>
    set((s) => ({
      session: {
        ...s.session,
        targetDistanceM: distanceM,
        currentTarget: { plateInstanceId, distanceM },
        shotsAtCurrentTarget: 0,
        shotBudget: budget,
        scope: { ...s.session.scope, elevationRad: 0, windageRad: 0 },
        lastShots: [],
      },
      score: { ...s.score, targetsEngaged: s.score.targetsEngaged + 1 },
    })),

  resetSession: () => set({ session: defaultSession(), score: defaultScore() }),

  resetScore: () => set({ score: defaultScore() }),

  setUnitsPrimary: (u) => set((s) => ({ settings: { ...s.settings, unitsPrimary: u } })),

  setSensitivity: (sensitivity) =>
    set((s) => ({ settings: { ...s.settings, sensitivity } })),

  setTraceEnabled: (traceEnabled) =>
    set((s) => ({ settings: { ...s.settings, traceEnabled } })),

  setWindRealism: (windRealism) =>
    set((s) => ({ settings: { ...s.settings, windRealism } })),

  setWindMarkerStyle: (windMarkerStyle) =>
    set((s) => ({ settings: { ...s.settings, windMarkerStyle } })),

  applySettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),
}));
