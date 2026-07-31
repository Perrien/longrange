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
import type { AmmoLot, RifleInstance, PlayerZero, DopeNode, ChronoSummary, EffectiveSource } from '../persistence';
import { upsertNode, removeNode, pruneNodesForRifle, pruneNodesForLot } from '../game/dope-book';
import { mergeChronoString, findChronoSummary, pruneChronoForRifle, pruneChronoForLot } from '../game/chrono';
import {
  buildAmmoLot,
  buildRifleInstance,
  cryptoRng,
  newId,
  type AcquireOptions,
} from '../game/acquire';
import type { FiringPoint } from '../range/elr-range-config';

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

/** Mirage strength preset (wind-system-btk-port W6, D9) — replaces the 1.7c/
 *  1.7d on/off boolean now that the layered port (W5) reads as directional.
 *  `'off'` skips the post-process pass entirely (same cheap path the old
 *  `false` took); the other three map to BTK's own `MIRAGE_LEVEL_SCALE`
 *  intensity multiplier (`scope/Mirage.ts`'s `MIRAGE_STRENGTH_SCALE`, kept
 *  next to the renderer's other tuning constants rather than here). */
export type MirageStrength = 'off' | 'light' | 'medium' | 'heavy';

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
  /** Which ELR firing line the player is standing on (build spec task 9).
   *
   *  Session-only, and deliberately NOT persisted: it is a per-visit stance,
   *  not a durable preference, and it means nothing on any other range.
   *  Defaults to `'high'` — the centrefire ladder is what the range is for, and
   *  it is the point the scene was wired to before switching existed.
   *
   *  A sight line is defined by the eye it starts from, so changing this
   *  re-solves the whole layout (`solveLayout`) and the scene must be rebuilt.
   *  The forest is seed-deterministic, so only the stations and eye height move. */
  firingPoint: FiringPoint;
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
  /**
   * Hits broken down by the zone struck (task T2), e.g.
   * `{ 'head-0': 2, 'minus-1': 5 }`. `'plate'` for legacy round plates.
   *
   * Counted on exactly the same condition as `hits` — the shot struck the
   * COMMITTED plate — so `sum(zoneHits) === hits` always holds and the two cannot
   * tell different stories. Recorded only; no points math and no HUD read it yet
   * (that is deliberately out of scope, plan §7).
   */
  zoneHits: Record<string, number>;
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
  /** Mirage heat-shimmer post-process strength (task 1.7c; Off/Light/Medium/
   *  Heavy replaced the on/off boolean in W6). Persisted (schema v2, see
   *  `persist-settings.ts`) like `sensitivity`/`traceEnabled`/`windMarkerStyle`
   *  — **owner decision 2026-07-31, after the W6 on-device tuning pass**:
   *  defaults `'medium'` and now survives a relaunch, superseding D9 (which
   *  had it store-only, defaulting `'off'`, pending exactly this call). */
  mirageStrength: MirageStrength;
}

// --- Constants / defaults ---------------------------------------------------

/** MIL turret detent: 0.1 mrad per click. */
export const MIL_CLICK_RAD = milToRad(0.1);
/** MOA turret detent: 1/4 MOA per click. */
export const MOA_CLICK_RAD = moaToRad(0.25);

/**
 * Clicks moved by the coarse (`++` / `−−`) turret buttons.
 *
 * ELR come-ups are large — 12 MIL is 120 single clicks, which is tedious rather
 * than interesting — so the dial gets a coarse step alongside the fine one.
 *
 * **20 is 2 MIL *and* 5 MOA**, because 20 × 0.1 mrad = 2 mrad and 20 × 0.25 MOA =
 * 5 MOA. That is a coincidence of the two detent sizes rather than a design, but it
 * is a convenient one: the coarse step is a single click COUNT, so it needs no unit
 * branch and cannot drift between the two systems. Both are also round numbers a
 * shooter would actually think in.
 */
export const COARSE_CLICKS = 20;

// Floor is 1× (true unaided-eye view), not 0× — see scope-projection.ts's
// SCOPE_MAG_MIN comment (FOV = BASE_FOV / magnification is infinite at 0×).
export const ZOOM_MIN = 1.0;
export const ZOOM_MAX = 35;
export const DEFAULT_MAGNIFICATION = 10;
/**
 * Shots granted per engagement. **Unlimited** (owner, 2026-07-29).
 *
 * COMMIT is kept — engaging a target is what scores a first-round hit and what
 * `resolveTargetPlate` keys off — but the three-shot cap is gone: the player
 * takes as many as they want at a station. The cap was pacing, and pacing is
 * the wrong tool on a DOPE range whose whole purpose is shoot-observe-adjust.
 *
 * `Infinity` rather than a big finite number, so nothing has to be tuned later
 * and `decrementBudget` stays a no-op by construction. A range may still set a
 * FINITE `shotBudget` in the registry and the spend gate will honour it — the
 * mechanism is intact, only the default changed. The HUD hides the counter
 * whenever the budget is not finite (see ScopeView): "shots left: Infinity"
 * reads as a bug.
 */
export const DEFAULT_SHOT_BUDGET = Infinity;
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
  firingPoint: 'high',
});

export const defaultSettings = (): SettingsState => ({
  unitsPrimary: 'MIL',
  sensitivity: 1.0,
  traceEnabled: true,
  windRealism: 'steady',
  windMarkerStyle: 'flag',
  mirageStrength: 'medium',
});

export const defaultScore = (): ScoreState => ({
  hits: 0,
  shotsFired: 0,
  firstRoundHits: 0,
  targetsEngaged: 0,
  zoneHits: {},
});

/** Owned gear + active loadout (task 2.2b). Persisted in the v2 save (the arrays
 *  ride the schema-v2 `rifles[]`/`ammoLots[]`; the active ids are additive-optional
 *  fields, D10). The catalog + hidden-truth derivation stay OUT of the store —
 *  it holds only the persisted records (id + catalogId + catalogVersion + draws).
 *  In 2.2 the active selection is inert on the live solve (D2); it drives the
 *  solve from 2.3. */
export interface InventoryState {
  rifles: RifleInstance[];
  ammoLots: AmmoLot[];
  activeRifleId: string | null;
  activeLotId: string | null;
}

export const defaultInventory = (): InventoryState => ({
  rifles: [],
  ammoLots: [],
  activeRifleId: null,
  activeLotId: null,
});

/** Confirmed DOPE nodes (task 2.4a). A dedicated slice (not folded into
 *  inventory) so its lifecycle — confirm, delete, cascade-prune on gear delete —
 *  stays legible. Persisted via the top-level `dopeNodes[]` save field; the
 *  persistence subscription (persist-settings.ts) watches this slice explicitly.
 *  Nodes reference both a rifle and a lot id, so they belong to the pairing, not
 *  to either record — hence a flat array here. */
export interface DopeState {
  nodes: DopeNode[];
}

export const defaultDope = (): DopeState => ({ nodes: [] });

/** Chronograph state (task 2.4e, D10). `deployed` + the live `current` string are
 *  SESSION-ONLY (a reload resets them); only `summaries` (per rifle+lot, Welford-
 *  merged) persist. The current string is tied to one rifle+lot so switching gear
 *  mid-string auto-commits it (see `logChronoReading`). */
export interface ChronoState {
  deployed: boolean;
  current: { rifleId: string; lotId: string; readings: number[] } | null;
  summaries: ChronoSummary[];
}

export const defaultChrono = (): ChronoState => ({ deployed: false, current: null, summaries: [] });

// --- Store ------------------------------------------------------------------

export interface GameStore {
  session: SessionState;
  settings: SettingsState;
  score: ScoreState;
  inventory: InventoryState;
  dope: DopeState;
  chrono: ChronoState;

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
  /** Set the active range id (range select, task 1.8). */
  setRangeId(id: string): void;
  /** Move between the ELR range's low and high firing lines (build spec task 9).
   *  The scene must be rebuilt on change — the layout is solved per eye. */
  setFiringPoint(point: FiringPoint): void;

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
  /** Mirage strength preset (task 1.7c; W6). Persisted (schema v2); defaults
   *  `'medium'`. */
  setMirageStrength(strength: MirageStrength): void;
  /** Merge a partial settings patch (used by persistence hydration). */
  applySettings(patch: Partial<SettingsState>): void;

  // Inventory / loadout (task 2.2b)
  /** Acquire a rifle instance from a catalog model id. Rolls hidden draws (opts.rng
   *  or platform crypto) and appends a NEW instance — acquiring the same model
   *  twice yields two distinct instances. Returns the new instance's id. */
  acquireRifle(catalogId: string, opts?: Partial<AcquireOptions>): string;
  /** Acquire an ammo lot from a catalog load id (same semantics as acquireRifle). */
  acquireLot(catalogId: string, opts?: Partial<AcquireOptions>): string;
  /** Consume one round for a fired shot (P2): +1 to the rifle's `lifetimeShotCount`,
   *  −1 (floored at 0) from the lot's `roundsRemaining`, in one atomic set. Called by
   *  the fire paths on every shot fired with real gear (chrono shots included). No-op
   *  for an unknown rifle/lot id (e.g. the box-true fallback with no owned lot). */
  consumeRound(rifleId: string, lotId: string): void;
  /** Set the active rifle instance (by record id, or null to clear). */
  selectRifle(instanceId: string | null): void;
  /** Set the active ammo lot (by record id, or null to clear). */
  selectLot(lotId: string | null): void;
  /** Remove an owned rifle instance (owner QoL, 2026-07-19). Destroys its hidden
   *  draws + any confirmed zero permanently (a re-acquire rolls a NEW instance).
   *  Clears the active selection if it pointed at the deleted rifle. Persists
   *  via the existing inventory→save wiring. No-op for an unknown id. */
  deleteRifle(instanceId: string): void;
  /** Remove an owned ammo lot (same semantics as deleteRifle). */
  deleteLot(lotId: string): void;
  /** Replenish a lot (P4): append a NEW lot of the same ammo (fresh hidden draws,
   *  new `[A-Z][0-9][0-9]` code, full round count). `carryForward` copies the
   *  source lot's discovered MV/BC into the new lot as **provisional** (unverified
   *  until this lot is chronographed / hold-confirmed, D15); false starts it on box.
   *  If the source lot was the active one, the new lot becomes active (seamless
   *  continue when a lot runs dry). Returns the new lot's id, or null if the source
   *  is unknown. */
  replenishLot(sourceLotId: string, carryForward: boolean): string | null;
  /** Store the confirmed zero for a rifle instance (task 2.3, D5/D6): writes its
   *  `playerZero` (elevation/windage correction + the SI distance it was confirmed
   *  at). Persists via the existing inventory→save wiring. No-op for an unknown id. */
  setPlayerZero(rifleId: string, zero: PlayerZero): void;
  /** Confirm the current turret as (part of) a rifle's zero (task 2.3d, D5/D6).
   *  Because `resolveShot` applies the stored zero as a baseline UNDER the dial
   *  (`applied = aim + dial + playerZero`), the turret after any confirm is dialed
   *  RELATIVE to the stored zero — so a confirm must COMPOSE (`new = old + dial`),
   *  never replace (replacing dropped the old baseline and shifted the very next
   *  shot by exactly that amount — the 2026-07-19 re-confirm bug).
   *
   *  `requiredRad` is the come-up HANDOFF (fidelity fix, same day): the trajectory
   *  correction the solve demanded at the confirmed distance under the rifle's OLD
   *  zero reference. That part of the dial is absorbed by the NEW trajectory zero
   *  (`zeroRangeM`), not the angular baseline, so it is subtracted:
   *  `pz_new = pz_old + dial − required` — leaving `playerZero` a pure bore-offset
   *  corrector. Defaults to {0,0} (no reference change). Composes, stamps
   *  `zeroRangeM`, and resets the turret to 0/0 in one atomic set. No-op for an
   *  unknown id. */
  confirmZero(
    rifleId: string,
    zeroRangeM: number,
    requiredRad?: { elevRad: number; windRad: number },
  ): void;
  /** Replace the whole inventory (used by persistence hydration). */
  applyInventory(inventory: InventoryState): void;
  /** Set a lot's effective BC from an asserted-hold fit (D15 lever 2, bc-truing-plan
   *  T2/"Update BC"). Writes `effective.bc` + `bcSource` + `bcSetAt` (T4 — the
   *  timestamp the re-true signal compares against a later chrono), leaving the MV
   *  side (`mvMps`/`mvSource`) byte-identical — the two truing levers are independent
   *  and neither invalidates the other (D15). The caller decides `source` per D13:
   *  `'trued'` when a `ChronoSummary` exists for the rifle+lot, `'provisional'`
   *  otherwise (a BC fit with no chrono behind it is provisional no matter what).
   *  No-op for an unknown lot id. */
  setLotEffectiveBc(lotId: string, bc: number, source: EffectiveSource, nowIso: string): void;

  // DOPE nodes (task 2.4a)
  /** Confirm a DOPE node: replace-by-station (D5 — a re-confirm at the same
   *  rifle+lot+distance overwrites the prior node), else append. Persists via the
   *  dope→save wiring. */
  confirmNode(node: DopeNode): void;
  /** Delete the confirmed node at a rifle+lot+station (station matched within the
   *  book's SI epsilon). No-op if none matches. */
  deleteNode(rifleId: string, lotId: string, distanceM: number): void;
  /** Replace the whole DOPE slice (used by persistence hydration). */
  applyDope(dope: DopeState): void;

  // Chronograph (task 2.4e)
  /** Deploy/stow the chronograph. While deployed, each fired shot logs a reading. */
  setChronoDeployed(on: boolean): void;
  /** Log a per-shot muzzle-velocity reading for the active rifle+lot. If the live
   *  string belongs to a different pairing, it is auto-committed to the summaries
   *  first, then a fresh string starts. Session-only until committed. */
  logChronoReading(rifleId: string, lotId: string, mps: number): void;
  /** Commit (Welford-merge) the live string into the persisted per-rifle+lot
   *  summary and clear it — the "new string" button. No-op if the string is empty. */
  commitChronoString(nowIso: string): void;
  /** Replace the whole chrono slice (used by persistence hydration). */
  applyChrono(chrono: ChronoState): void;
}

/** Set a lot's effective MV from a chronograph average (D15 lever 1, chrono → MV).
 *  Preserves any existing BC side; a lot with no `effective` yet gets `bcSource:
 *  'box'`. Pure — returns a new array. */
function withLotEffectiveMv(lots: AmmoLot[], lotId: string, avgMps: number): AmmoLot[] {
  return lots.map((l) =>
    l.id === lotId
      ? { ...l, effective: { ...(l.effective ?? { bcSource: 'box' as const }), mvMps: avgMps, mvSource: 'chrono' as const } }
      : l,
  );
}

/** Set a lot's effective BC from an asserted-hold fit (D15 lever 2, confirm-hold
 *  → BC / bc-truing-plan T2). Preserves any existing MV side untouched (the
 *  levers are independent — a BC fit never touches MV); a lot with no
 *  `effective` yet gets `mvSource: 'box'`. Stamps `bcSetAt` (T4, D15's re-true
 *  loop) so a later chrono can be compared against it. Pure — returns a new array. */
function withLotEffectiveBc(
  lots: AmmoLot[],
  lotId: string,
  bc: number,
  source: EffectiveSource,
  nowIso: string,
): AmmoLot[] {
  return lots.map((l) =>
    l.id === lotId
      ? { ...l, effective: { ...(l.effective ?? { mvSource: 'box' as const }), bc, bcSource: source, bcSetAt: nowIso } }
      : l,
  );
}

export const useGameStore = create<GameStore>()((set, get) => ({
  session: defaultSession(),
  settings: defaultSettings(),
  score: defaultScore(),
  inventory: defaultInventory(),
  dope: defaultDope(),
  chrono: defaultChrono(),

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

  setRangeId: (id) => set((s) => ({ session: { ...s.session, rangeId: id } })),

  // Switching lines is a MOVE, not a setting: the player is physically
  // somewhere else, looking at a different ladder. So the committed target and
  // the shots against it are cleared — the plate you engaged from the high line
  // may not even exist on the low one, and keeping the commitment would leave a
  // stale instanceId pointing into a rebuilt scene's plate array.
  setFiringPoint: (point) =>
    set((s) =>
      s.session.firingPoint === point
        ? s
        : {
            session: {
              ...s.session,
              firingPoint: point,
              currentTarget: null,
              shotsAtCurrentTarget: 0,
              lastShots: [],
            },
          },
    ),

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
      // Same gate as `hits`, so sum(zoneHits) === hits by construction. A hit
      // always carries a zone (`'plate'` at minimum), but fall back rather than
      // asserting — a dropped counter is not worth breaking a shot over.
      const zoneId = isHit ? (result.hitZone?.zoneId ?? null) : null;
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
          zoneHits:
            zoneId === null
              ? s.score.zoneHits
              : { ...s.score.zoneHits, [zoneId]: (s.score.zoneHits[zoneId] ?? 0) + 1 },
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

  /**
   * Engage a target. Refills the shot budget, resets the group, bumps
   * `targetsEngaged` — and **leaves the turret exactly where the player set it**.
   *
   * It used to zero elevation and windage here. That was defensible when COMMIT
   * was purely "start a fresh engagement", but it is wrong now for two reasons
   * (owner, 2026-07-27):
   *
   *   1. **Commit-preferred aim resolution** (`scope/aim-pick.ts`) means committing
   *      is how you *hold* a target through a holdover. Dialling 12 MIL and then
   *      committing so the shot resolves correctly would throw the 12 MIL away —
   *      the two features would actively fight each other.
   *   2. **Real turrets do not spring back when you look at something else.** The
   *      dial is a physical setting; only zeroing (which composes the dial into the
   *      stored zero, `setPlayerZero`) legitimately returns it to 0.
   *
   * The group state (`shotsAtCurrentTarget`, `lastShots`) still resets, because
   * that genuinely belongs to the previous target.
   */
  commitTarget: (plateInstanceId, distanceM, budget) =>
    set((s) => ({
      session: {
        ...s.session,
        targetDistanceM: distanceM,
        currentTarget: { plateInstanceId, distanceM },
        shotsAtCurrentTarget: 0,
        // `?? DEFAULT_SHOT_BUDGET` rather than a parameter default, so passing an
        // explicit `undefined` (what `shotBudgetFor` returns for a range with no
        // opinion) behaves identically to omitting it. The distinction matters:
        // callers now forward a range's budget through, and it is frequently
        // undefined.
        shotBudget: budget ?? DEFAULT_SHOT_BUDGET,
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

  setMirageStrength: (mirageStrength) =>
    set((s) => ({ settings: { ...s.settings, mirageStrength } })),

  applySettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

  acquireRifle: (catalogId, opts) => {
    const id = opts?.id ?? newId('rifle');
    const instance = buildRifleInstance(catalogId, {
      rng: opts?.rng ?? cryptoRng(),
      id,
      catalogVersion: opts?.catalogVersion,
      acquiredAt: opts?.acquiredAt ?? Date.now(),
    });
    set((s) => ({ inventory: { ...s.inventory, rifles: [...s.inventory.rifles, instance] } }));
    return id;
  },

  acquireLot: (catalogId, opts) => {
    const id = opts?.id ?? newId('lot');
    // Generate the lot's [A-Z][0-9][0-9] code unique against the ones already owned.
    const existingLotNumbers = new Set(
      get().inventory.ammoLots.map((l) => l.lotNumber).filter((n): n is string => typeof n === 'string'),
    );
    const lot = buildAmmoLot(catalogId, {
      rng: opts?.rng ?? cryptoRng(),
      id,
      catalogVersion: opts?.catalogVersion,
      acquiredAt: opts?.acquiredAt ?? Date.now(),
      existingLotNumbers,
    });
    set((s) => ({ inventory: { ...s.inventory, ammoLots: [...s.inventory.ammoLots, lot] } }));
    return id;
  },

  consumeRound: (rifleId, lotId) =>
    set((s) => ({
      inventory: {
        ...s.inventory,
        rifles: s.inventory.rifles.map((r) =>
          r.id === rifleId ? { ...r, lifetimeShotCount: (r.lifetimeShotCount ?? 0) + 1 } : r,
        ),
        ammoLots: s.inventory.ammoLots.map((l) =>
          l.id === lotId ? { ...l, roundsRemaining: Math.max(0, (l.roundsRemaining ?? 0) - 1) } : l,
        ),
      },
    })),

  replenishLot: (sourceLotId, carryForward) => {
    const src = get().inventory.ammoLots.find((l) => l.id === sourceLotId);
    if (!src) return null;
    const id = newId('lot');
    const existingLotNumbers = new Set(
      get().inventory.ammoLots.map((l) => l.lotNumber).filter((n): n is string => typeof n === 'string'),
    );
    // A new physical lot: fresh hidden draws (its OWN true MV/BC), new code, full count.
    const base = buildAmmoLot(src.catalogId, {
      rng: cryptoRng(),
      id,
      catalogVersion: src.catalogVersion,
      acquiredAt: Date.now(),
      existingLotNumbers,
    });
    const se = src.effective;
    const carry = carryForward && !!se && (se.mvMps != null || se.bc != null);
    const lot: AmmoLot = carry
      ? {
          ...base,
          effective: {
            ...(se!.mvMps != null ? { mvMps: se!.mvMps } : {}),
            ...(se!.bc != null ? { bc: se!.bc } : {}),
            mvSource: 'provisional',
            bcSource: 'provisional',
          },
        }
      : base;
    set((s) => ({
      inventory: {
        ...s.inventory,
        ammoLots: [...s.inventory.ammoLots, lot],
        // Continue seamlessly if the source lot was active (e.g. it just ran dry).
        activeLotId: s.inventory.activeLotId === sourceLotId ? id : s.inventory.activeLotId,
      },
    }));
    return id;
  },

  selectRifle: (instanceId) =>
    set((s) => ({ inventory: { ...s.inventory, activeRifleId: instanceId } })),

  selectLot: (lotId) => set((s) => ({ inventory: { ...s.inventory, activeLotId: lotId } })),

  deleteRifle: (instanceId) =>
    set((s) => ({
      inventory: {
        ...s.inventory,
        rifles: s.inventory.rifles.filter((r) => r.id !== instanceId),
        activeRifleId: s.inventory.activeRifleId === instanceId ? null : s.inventory.activeRifleId,
      },
      // Cascade (task 2.4a): a deleted rifle's confirmed nodes go with it, in the
      // same atomic set — no window where a node points at a gone rifle.
      dope: { ...s.dope, nodes: pruneNodesForRifle(s.dope.nodes, instanceId) },
      // Cascade (task 2.4e): drop the rifle's chrono summaries + a live string it owns.
      chrono: {
        ...s.chrono,
        summaries: pruneChronoForRifle(s.chrono.summaries, instanceId),
        current: s.chrono.current?.rifleId === instanceId ? null : s.chrono.current,
      },
    })),

  deleteLot: (lotId) =>
    set((s) => ({
      inventory: {
        ...s.inventory,
        ammoLots: s.inventory.ammoLots.filter((l) => l.id !== lotId),
        activeLotId: s.inventory.activeLotId === lotId ? null : s.inventory.activeLotId,
      },
      dope: { ...s.dope, nodes: pruneNodesForLot(s.dope.nodes, lotId) },
      chrono: {
        ...s.chrono,
        summaries: pruneChronoForLot(s.chrono.summaries, lotId),
        current: s.chrono.current?.lotId === lotId ? null : s.chrono.current,
      },
    })),

  setPlayerZero: (rifleId, zero) =>
    set((s) => ({
      inventory: {
        ...s.inventory,
        rifles: s.inventory.rifles.map((r) =>
          r.id === rifleId ? { ...r, playerZero: { ...zero } } : r,
        ),
      },
    })),

  confirmZero: (rifleId, zeroRangeM, requiredRad) =>
    set((s) => {
      if (!s.inventory.rifles.some((r) => r.id === rifleId)) return s;
      const req = requiredRad ?? { elevRad: 0, windRad: 0 };
      const { elevationRad, windageRad } = s.session.scope;
      return {
        inventory: {
          ...s.inventory,
          rifles: s.inventory.rifles.map((r) =>
            r.id === rifleId
              ? {
                  ...r,
                  playerZero: {
                    elevationRad: (r.playerZero?.elevationRad ?? 0) + elevationRad - req.elevRad,
                    windageRad: (r.playerZero?.windageRad ?? 0) + windageRad - req.windRad,
                    zeroRangeM,
                  },
                }
              : r,
          ),
        },
        session: {
          ...s.session,
          scope: { ...s.session.scope, elevationRad: 0, windageRad: 0 },
        },
      };
    }),

  applyInventory: (inventory) => set({ inventory }),

  setLotEffectiveBc: (lotId, bc, source, nowIso) =>
    set((s) => ({
      inventory: { ...s.inventory, ammoLots: withLotEffectiveBc(s.inventory.ammoLots, lotId, bc, source, nowIso) },
    })),

  confirmNode: (node) =>
    set((s) => ({ dope: { ...s.dope, nodes: upsertNode(s.dope.nodes, node) } })),

  deleteNode: (rifleId, lotId, distanceM) =>
    set((s) => ({
      dope: { ...s.dope, nodes: removeNode(s.dope.nodes, rifleId, lotId, distanceM) },
    })),

  applyDope: (dope) => set({ dope }),

  setChronoDeployed: (on) => set((s) => ({ chrono: { ...s.chrono, deployed: on } })),

  logChronoReading: (rifleId, lotId, mps) =>
    set((s) => {
      const cur = s.chrono.current;
      // Same pairing → append to the live string.
      if (cur && cur.rifleId === rifleId && cur.lotId === lotId) {
        return {
          chrono: {
            ...s.chrono,
            current: { ...cur, readings: [...cur.readings, mps] },
          },
        };
      }
      // Gear switched with an in-progress string → commit it, then start fresh.
      const hadString = !!(cur && cur.readings.length);
      const summaries = hadString
        ? mergeChronoString(s.chrono.summaries, cur!.rifleId, cur!.lotId, cur!.readings, new Date().toISOString())
        : s.chrono.summaries;
      // The committed pairing's lot now has a measured MV → its effective MV (D15
      // lever 1), so the believed DOPE/come-up recomputes off the chrono, not box.
      const committed = hadString ? findChronoSummary(summaries, cur!.rifleId, cur!.lotId) : undefined;
      const ammoLots = committed
        ? withLotEffectiveMv(s.inventory.ammoLots, cur!.lotId, committed.avgMps)
        : s.inventory.ammoLots;
      return {
        chrono: { ...s.chrono, summaries, current: { rifleId, lotId, readings: [mps] } },
        inventory: { ...s.inventory, ammoLots },
      };
    }),

  commitChronoString: (nowIso) =>
    set((s) => {
      const cur = s.chrono.current;
      if (!cur || cur.readings.length === 0) return s;
      const summaries = mergeChronoString(s.chrono.summaries, cur.rifleId, cur.lotId, cur.readings, nowIso);
      // Chrono → effective MV (D15 lever 1): the come-up now solves off the measured
      // average, not box.
      const committed = findChronoSummary(summaries, cur.rifleId, cur.lotId);
      const ammoLots = committed
        ? withLotEffectiveMv(s.inventory.ammoLots, cur.lotId, committed.avgMps)
        : s.inventory.ammoLots;
      return {
        chrono: { ...s.chrono, summaries, current: null },
        inventory: { ...s.inventory, ammoLots },
      };
    }),

  applyChrono: (chrono) => set({ chrono }),
}));
