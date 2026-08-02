// Scope view — the real scope pipeline (task 1.3b; build-plan §5 Increment 1).
//
// A second render pass: the Range A world (RangeScene, task 1.2) seen through a
// magnified camera, a circular scope mask, and an exact FFP hash reticle drawn
// on a 2D overlay from the pure geometry in ./reticle + ./scope-projection.
//
// FFP guarantee (the load-bearing bit for Increment 2 ranging): the reticle is
// engraved in fixed ANGLES, so a target of known size subtends the SAME mils at
// every zoom — the reticle and the world image both scale together. The pixel
// scale comes from scope-projection, unit-tested in 1.3a.
//
// Touch feel is carried verbatim from the owner-tuned task-0.9 aim spike: drag
// aim at 1:1 with the visible FOV (∝ 1/mag), a three-layer hand wobble scaled by
// an amplitude slider, a press-and-hold breath mechanic on a limited air budget,
// and a spring-damper recoil kick on FIRE. No ballistics/impact yet — the shot
// just recoils; the firing solution + hit-sim arrive in tasks 1.4/1.5.
//
// Zoom and the MIL/MOA reticle are wired to the Zustand store (session.scope /
// settings.unitsPrimary); sensitivity reads/writes settings. World axes match
// the scene: +X right, +Y up, downrange −Z, shooter at the origin.

import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RangeScene, type PlateInstance } from '../range/RangeScene';
import { RANGE_A_GROUND } from '../range/range-a-config';
import { TestRangeScene } from '../range/TestRangeScene';
import { ELRRangeScene } from '../range/ELRRangeScene';
import { projectMissToGround, FLAT_GROUND } from './miss-projection';
import {
  FrameTimer,
  FRAME_BUDGET_MS,
  readDepthBits,
  RenderCostMeter,
  headroomVerdict,
  type SceneCost,
} from './perf-hud';
import { pickAimedPlate, resolveTargetPlate } from './aim-pick';

import type { SteelSceneApi } from '../range/steel-scene-api';
import { WoodedZeroScene } from '../range/WoodedZeroScene';
import { snapshotWoodedZero } from '../range/wooded-zero-config';
import type { PaperBayScene, PaperTargetInstance } from '../range/paper-bay-scene';
import { cameraReachFor, getRangeDefinition, shotBudgetFor } from '../range/ranges';
import { solveGear, createGearScatter, gearZeroOffset } from '../engine-bridge/gear-solve';
import { gearSolveContext, type GearSolveContext } from '../game/active-gear';
import { recommendedZeroM } from '../game/zero-distance';
import { windMarkersFor } from '../range/wind-markers-config';
import { initWindMarkers, updateWindMarkers, disposeWindMarkers } from './WindMarkers';
import { initMirage, renderSceneWithMirage, disposeMirage, MIRAGE_STRENGTH_SCALE } from './Mirage';
import { MIRAGE_LAYER_FRACS, aimRayIntersection, viewPitchRad, type Vec3 } from '../game/mirage-model';
import {
  useGameStore,
  ZOOM_MIN,
  ZOOM_MAX,
  MIL_CLICK_RAD,
  MOA_CLICK_RAD,
  COARSE_CLICKS,
  DEFAULT_WIND_PRESET,
} from '../state/store';
import { SCOPE_BASE_FOV_DEG, fovRadForMag } from './scope-projection';
import { buildReticle, MAJOR_HALF_PX } from './reticle';
import { solveTrajectory, spinRateFromTwist, speedOfSound, type AtmosphereInput, type Load } from '../engine-bridge';
import { AudioManager } from '../audio/audio-manager';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { describeThrown } from '../engine-bridge/describe-thrown';
import { PhaseTimer } from './phase-timer';
import { machStateLabel } from '../game/dope-row';
import { createScatterSimulator, type ScatterSimulator } from '../engine-bridge/match-sim';
import { createSteelReaction } from '../engine-bridge/steel-target';
import { createSteelReactions, type SteelReactionController } from './steel-reactions';
import {
  createWindField,
  listWindPresets,
  solveTrajectoryField,
  sampleFieldColumn,
  type WindField,
} from '../engine-bridge/wind-field';
import { initImpactFx, emitImpact, updateImpactFx, disposeImpactFx } from './impact-fx';
import {
  initBulletTrace,
  launchBulletTrace,
  updateBulletTrace,
  hideBulletTrace,
  disposeBulletTrace,
} from './BulletTrace';
import { buildTracePath } from '../game/trace-path';
import type { BtkModule, TrajectoryTable, ScatterSample } from '../engine-bridge/types';
import { resolveShot, type ShotPlate } from '../game/shot';
import { windToVec, averageEffectiveWind, requiredCorrectionRad } from '../game/firing-solution';
import { RECOIL_PITCH_VEL_REFERENCE, recoilPitchVelocity } from '../game/recoil';
import { superposeWind, gustScaleFor } from '../game/wind-superposition';
import { GUST_REFERENCE_MPS } from '../game/wind-field-config';
import { callImpact, type ImpactCall } from '../game/impact-call';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, DEFAULT_GAME_LOAD_CARTRIDGE_ID, SIGHT_HEIGHT_M } from '../game/loads';
import {
  clockToDeg,
  degToClock,
  mphToMps,
  mpsToMph,
  formatAngleForDisplay,
  formatSpeedForDisplay,
  formatDistanceForDisplay,
  formatOffsetForDisplay,
  formatClockPosition,
} from '../units';
import { DopePanel } from './DopePanel';
import { ChronoPanel } from './ChronoPanel';

const EYE_HEIGHT_M = 1.6; // matches the Range A look-around

/** Wooded Zero Range ambient breeze (plan §7.3). Light enough that it does not
 *  meaningfully smear a group — ~1 m/s full-value at 100 m is a few millimetres
 *  of drift — but real, so the canopy movement Stage 5 drives from it is telling
 *  the truth. Full-value (3 o'clock) so the effect is visible rather than hidden
 *  in a head/tail component. */
const WOODED_ZERO_WIND_MPS = 1.1;
const WOODED_ZERO_WIND_DEG = 90;

// A low miss resolves on the far target plane BELOW ground level; place its dust
// where the round actually lands by projecting the sight ray onto the grass.
const GROUND_Y_M = 0; // RangeScene grass lane height
/** How far downrange a low miss is tracked before giving up on finding ground.
 *  Past the longest range in the game, so it never truncates a real strike. */
const GROUND_PROJECTION_MAX_M = 3200;
const GROUND_PUFF_LIFT_M = 0.12; // sit the dust just above the grass, not half-buried

/** Fine trajectory sampling for the bullet-trace arc (task 1.5b). */
const TRACE_SAMPLES = 32;

/** Fixed ISA atmosphere for Increment 1 (matches validation/loads.json conditions). */
const ISA_ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

// --- wind field (task 1.7a, D1/D2/D3b) --------------------------------------
// Sampling box for the curl-noise field: reuses the Range A ground extents
// (plan step 4 — "crossrange ±~30 m, vertical 0..~50 m, downrange 0..~500 m")
// so the field covers every point the bullet or (in 1.7b) the flags can query.
const WIND_FIELD_MIN = { x: -RANGE_A_GROUND.laneWidthM / 2, y: 0, z: -RANGE_A_GROUND.laneLengthM };
const WIND_FIELD_MAX = { x: RANGE_A_GROUND.laneWidthM / 2, y: 50, z: 0 };
/** Points sampled along the eye→target line for the D6 effective-wind readout. */
const EFFECTIVE_WIND_SAMPLES = 8;

/** `solveAt`'s return shape (task 1.7a): unchanged in Steady mode (no
 *  `effectiveWind` key — byte-identical object shape to 1.6); Realistic mode
 *  adds the D6 readout the HUD will display once 1.7b builds it. */
interface SolveResult {
  dropM: number;
  windageM: number;
  velocityMps: number;
  timeOfFlightS: number;
  /** D6 — the wind the bullet actually saw + what it cost in windage. Present
   *  only in Realistic mode, once the field has loaded. `windOffsetRad` is the
   *  RAW angular correction (not pre-converted to mil/MOA) so the HUD can
   *  format it through the same Met/Imp toggle as every other readout
   *  (task 1.6e); negative = drift was right (hold/dial left), matching
   *  `firing-solution.ts`'s `requiredCorrectionRad` sign convention. */
  effectiveWind?: { speedMps: number; directionDeg: number; windOffsetRad: number };
}

// --- feel model constants (ported verbatim from task-0.9 AimSpike) ----------
const WOBBLE_RAD = 0.00015; // slow-sway amplitude
const TREMOR_RAD = 0.00002; // muscle-tremor layer
const SPRING_K = 64; // recoil/jerk spring: ω≈8 rad/s
const SPRING_C = 9; // slightly underdamped
// Cartridge-scaled recoil (rifle-ammo-store S10, D13): RECOIL_PITCH_VEL_REFERENCE
// (0.05, "~3 mrad peak") is now imported from game/recoil.ts rather than declared
// here — it's both the flat fallback (no active gear, or a cartridge with no
// sourced rifle weight yet) AND the calibration point recoilPitchVelocity() holds
// 6.5 CM/140 gr match at, so there's exactly one 0.05 in the codebase. The actual
// per-shot pitch impulse is read from the active gear at fire time (currentRecoil,
// below) — see fireSteel/fireSightIn.
const RECOIL_YAW_VEL_REFERENCE = 0.012; // random sideways kick, at the same 6.5 CM reference point; scales with the same factor as pitch (D13 step 4)
const RESIDUAL_SHIFT_RAD = 0.0001; // ±0.1 mrad POA shift (follow-through)
const HOLD_STEADY_FACTOR = 0.15; // wobble multiplier during a good breath hold
const BREATH_DEPLETE_S = 10;
const BREATH_RECOVER_S = 5;
const BREATH_COMFORT = 0.3; // below this remaining fraction the hold degrades
const BREATH_DEBT_FACTOR = 1.5; // wobble multiplier out of air (oxygen debt)

export function ScopeView({
  onOpenMenu,
  onOpenLoadout,
  onGoHome,
  onOpenDopeBook,
}: {
  onOpenMenu?: () => void;
  onOpenLoadout?: () => void;
  onGoHome?: () => void;
  onOpenDopeBook?: () => void;
} = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLCanvasElement>(null);
  const breathBarRef = useRef<HTMLDivElement>(null);

  // Reactive slices for the HUD / React controls. (The player settings —
  // units, sensitivity, trace, wind realism, marker style, mirage — moved to the
  // Settings screen in task 2.1d; only the readout unit `unitsPrimary` and the
  // preset-picker gate `windRealism` are still read here.)
  const magnification = useGameStore((s) => s.session.scope.magnification);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  // COARSE_CLICKS is 2 MIL and 5 MOA — the same click COUNT in both systems (see
  // its doc comment), so only the label needs the unit.
  const COARSE_LABEL = unitsPrimary === 'MIL' ? '2 MIL' : '5 MOA';

  // Turret dial (task 1.6c, D4-A solve-only): elevation/windage read for the
  // HUD readout; the ± buttons below dispatch the store actions directly.
  const elevationRad = useGameStore((s) => s.session.scope.elevationRad);
  const windageRad = useGameStore((s) => s.session.scope.windageRad);
  const dialElevationClicks = useGameStore((s) => s.dialElevationClicks);
  const dialWindageClicks = useGameStore((s) => s.dialWindageClicks);
  const setClickRad = useGameStore((s) => s.setClickRad);
  const shotBudget = useGameStore((s) => s.session.shotBudget);
  const score = useGameStore((s) => s.score);

  // Turret detent size follows the Met/Imp toggle (owner bug report,
  // 2026-07-15): `clickRad` used to default to — and stay stuck at — the MIL
  // detent (0.1 mrad) regardless of `unitsPrimary`, so an "Imperial" click was
  // really a 0.1-mrad step mislabeled in MOA (≈0.344 MOA, rounding to "0.3"
  // on screen) instead of a clean 1/4-MOA detent. Keep the store's own
  // click-size constants paired with the display unit; runs on mount too, so
  // a reload that hydrates a persisted `unitsPrimary: 'MOA'` self-corrects.
  useEffect(() => {
    setClickRad(unitsPrimary === 'MIL' ? MIL_CLICK_RAD : MOA_CLICK_RAD);
  }, [unitsPrimary, setClickRad]);

  // Wind control (task 1.6c, D6) + commit/target-select (D2).
  const windState = useGameStore((s) => s.session.wind);
  const setWind = useGameStore((s) => s.setWind);
  const currentTarget = useGameStore((s) => s.session.currentTarget);

  // Range-type (task 2.3c2): which world is loaded. Drives the HUD branch
  // (Clean-target on the sight-in bay vs Commit/engagement on the steel range)
  // and the header label; the effect reads the same off the store.
  const rangeId = useGameStore((s) => s.session.rangeId);
  const rangeDef = getRangeDefinition(rangeId);
  // ELR firing line (build spec task 9). In the scene effect's dep array, so
  // switching lines tears the world down and rebuilds it — the layout is solved
  // per eye, and the forest is seed-deterministic, so only the stations and the
  // eye height actually move. Only meaningful on the ELR range; every other
  // scene ignores it, and since it never changes there the rebuild never fires.
  const firingPoint = useGameStore((s) => s.session.firingPoint);
  const setFiringPoint = useGameStore((s) => s.setFiringPoint);
  const isElrRange = rangeDef.sceneType === 'elr-range';
  // Capability, not scene identity (Stage 2a): the paper-target HUD — Clean,
  // Inspect, the group readout and the zeroing controls — belongs to ANY paper
  // bay, so it keys off `targetKind` rather than `sceneType === 'sight-in'`.
  // See `range/paper-bay-scene.ts` and plan §7.2.
  const isSightInHud = rangeDef.targetKind === 'paper';
  // Permission to STORE a zero here (DOPE-first plan, step 1): a distinct concept
  // from the paper-grid interface above. `targetKind === 'paper'` decides whether
  // the read-the-grid HUD renders; `zeroable` decides whether Confirm Zero may
  // commit a `playerZero`. Today every paper bay is zeroable so they coincide,
  // but keeping them separate is what lets field-zeroing land on a `zeroable`
  // steel range later with no gate refactor (the confirmZero() store action is
  // already range-agnostic).
  const canZero = rangeDef.zeroable;
  // Test Range is a sandbox, not an engagement — no commit step, no shot-count
  // limit (the gong auto-commits with an unlimited budget on scene load).
  const isTestRangeHud = rangeDef.sceneType === 'test-range';
  // Sight-in inventory (task 2.3d): the active rifle drives the zero readout +
  // whether Confirm can store a zero.
  const inventory = useGameStore((s) => s.inventory);
  const activeRifle = inventory.rifles.find((r) => r.id === inventory.activeRifleId) ?? null;
  const activeLot = inventory.ammoLots.find((l) => l.id === inventory.activeLotId) ?? null;
  // Out of rounds (P2b): only bites with real gear selected — the box-true
  // fallback (no owned lot) is never round-gated. Blocks FIRE + labels it EMPTY.
  const outOfRounds = !!activeLot && (activeLot.roundsRemaining ?? 0) <= 0;
  // Running group (task 2.3d, D5): the engaged target + shot count for the
  // read-the-grid HUD (the centroid marker itself is drawn on the target face).
  // Why did the last FIRE press do nothing? `null` = it fired normally.
  //
  // Added 2026-07-27 after the probe's FIRE button died twice and TWO plausible
  // causes were fixed from static reading without either being the real one. The
  // fire path has five silent early-returns and one `if (engineModule)` that skips
  // the entire shot when the WASM module is missing or has aborted — all of which
  // look identical from the outside: a button that does nothing. This makes the
  // next occurrence self-diagnosing instead of a guessing game.
  const [fireBlocked, setFireBlocked] = useState<string | null>(null);
  // Per-shot phase breakdown (2026-07-28) — which phase of the shot causes the
  // 25–30 ms frame the probe measured on device. Set once per shot, so it reads
  // as "the last shot cost this", not as a live counter.
  const [shotMs, setShotMs] = useState<string | null>(null);
  // Mach-state marking (ELR build spec task 10): what the round will be doing
  // when it ARRIVES at the committed target. Computed once at commit, from the
  // same solve the shot will use, and cleared whenever nothing is committed.
  const [machState, setMachState] = useState<string | null>(null);
  // The store drops `currentTarget` on its own in several places — switching
  // firing lines, resetting the session. Clear the marking with it, or a stale
  // SUBSONIC label outlives the engagement it described.
  useEffect(() => {
    if (!currentTarget) setMachState(null);
  }, [currentTarget]);
  // Scene-cost readout — DIAGNOSTIC, ELR range only (it is the only scene heavy
  // enough for the answer to matter). `sceneCost` is what the 17 ms vsync-capped
  // frame time cannot tell you: how much of that frame is actual work.
  const [sceneCost, setSceneCost] = useState<SceneCost | null>(null);
  /** Clears the rolling frame-time and render-cost windows. Set by the render
   *  effect; called when something rebuilds the scene so the build hitch and the
   *  old configuration's frames do not pollute the new reading. */
  const resetPerfRef = useRef<(() => void) | null>(null);
  // Frame-time readout (owner request, 2026-07-27: "numbers would be good to see a
  // slowdown before it's too bad"). Shown on EVERY range — the point is to catch a
  // regression while it is still small, and a number you only see on one range
  // cannot do that.
  const [perf, setPerf] = useState<{ ms: number; fps: number; worst: number; bits: number } | null>(
    null,
  );
  const [sightInGroup, setSightInGroup] = useState<{
    shots: number;
    nominalDistance: number;
  } | null>(null);
  // Inspect (D10): head-on close-up of the engaged target.
  const [inspectOpen, setInspectOpen] = useState(false);

  // Wind realism (task 1.7a, D1): read only to gate the in-HUD preset picker
  // below — the Steady/Realistic toggle itself now lives in the Settings screen
  // (task 2.1d). `windPreset` is the per-engagement environment choice and
  // stays in the HUD with the wind speed/direction controls.
  const windRealism = useGameStore((s) => s.settings.windRealism);
  const windPreset = useGameStore((s) => s.session.windPreset);
  const setWindPreset = useGameStore((s) => s.setWindPreset);
  // Raw BTK preset names (task 1.7b, D3): populated once the engine loads (the
  // imperative effect below calls `setAvailablePresets` — a stable setState
  // reference, same pattern as `setLastCall`).
  const [availablePresets, setAvailablePresets] = useState<string[]>([]);
  // Last-shot spotter call (task 1.6c, D3 HUD): hit/miss + clock, set from the
  // imperative FIRE handler below via `setLastCall` (a stable setState ref).
  const [lastCall, setLastCall] = useState<ImpactCall | null>(null);
  // Last-shot effective-wind readout (task 1.7b, D6): the wind the bullet
  // actually saw (Realistic mode only) + what it cost in windage.
  const [lastEffectiveWind, setLastEffectiveWind] = useState<SolveResult['effectiveWind'] | null>(null);

  // Local feel control (wobble amplitude is not a persisted setting yet — see
  // PROGRESS deferred obs). Default 0 = steady hold on every range (owner QoL
  // request 2026-07-19, supersedes the 0.9-spike 0.75 default); the slider
  // dials the wobble back in when wanted.
  const wobbleAmpRef = useRef(0);
  // Breath-hold flag: shared between the HOLD button (JSX) and the render loop.
  const holdingRef = useRef(false);

  const fireRef = useRef<() => void>(() => {});
  // Turret click sound (task 1.6c, D5): the ± buttons call this; it reaches
  // into the imperative `audio` instance created inside the effect below.
  const clickAudioRef = useRef<() => void>(() => {});
  // Commit (task 1.6c, D2): the Commit button calls this; it reaches into the
  // imperative aim state to find the plate under the crosshair right now.
  const commitRef = useRef<() => void>(() => {});
  // Clean-target (task 2.3c2, D9): the sight-in HUD's Clean button calls this; it
  // reaches into the imperative scene to wipe the engaged target's marks.
  const cleanRef = useRef<() => void>(() => {});
  // Confirm zero (task 2.3d): stores the current turret as the rifle's zero and
  // resets the turret. Inspect (D10): returns the engaged target's face canvas.
  const confirmZeroRef = useRef<() => void>(() => {});
  const faceCanvasRef = useRef<() => HTMLCanvasElement | null>(() => null);
  const inspectCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current!;
    const reticleCanvas = reticleRef.current!;
    const rctx = reticleCanvas.getContext('2d')!;
    const store = useGameStore.getState; // live reads inside the imperative loop

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    // Range-type branch (task 2.3c2): the steel KD range (RangeScene) vs a
    // paper-bay zero range (WoodedZeroScene). Both reuse the magnified camera,
    // aim/wobble/breath/recoil, zoom, and reticle below — only the world + the
    // fire path differ. `range` is null on a paper bay and vice-versa.
    const rangeDefinition = getRangeDefinition(store().session.rangeId);
    const sceneType = rangeDefinition.sceneType;
    // Capability gate (Stage 2a): everything downstream — the aimed-target pick,
    // the fire path, marks, centroid, Clean, Inspect, the zeroing flow — works on
    // the `PaperBayScene` interface, so it is driven by `targetKind`, not by
    // which concrete bay got constructed. Only the CONSTRUCTION below still
    // switches on `sceneType`, which is that field's actual job.
    const isSightIn = rangeDefinition.targetKind === 'paper';
    let range: SteelSceneApi | null = null;
    // The ELR scene, when it IS the ELR range — typed concretely because its tree
    // count feeds the scene-cost readout and is deliberately absent from
    // `SteelSceneApi` (a diagnostic surface has no business on the other ranges).
    let elrScene: ELRRangeScene | null = null;
    let sightIn: PaperBayScene | null = null;
    if (sceneType === 'wooded-zero') {
      // Same D3 entry snapshot. Wind is NOT zeroed here (plan §7.3, owner
      // 2026-07-26): a very light steady breeze that visibly moves the tree tops
      // and is fed honestly to the solver — at ~1 m/s the drift at 100 m is a few
      // millimetres, well inside group size, so a zero taken here is still valid.
      // Deliberately not special-cased: the vegetation and the bullet must read
      // the SAME field or wind-driven scenery stops meaning anything.
      store().setWind({ speedMps: WOODED_ZERO_WIND_MPS, directionDeg: WOODED_ZERO_WIND_DEG });
      // Enter at 1× (owner 2026-07-27): the stations are close (25–200) and the
      // bay is a fanned scene you want to take in wide before zooming in to group.
      store().setZoom(1);
      sightIn = new WoodedZeroScene(scene, snapshotWoodedZero(store().settings.unitsPrimary));
    } else if (sceneType === 'test-range') {
      range = new TestRangeScene(scene);
      // It's a sandbox, not an engagement: auto-commit the one gong with an
      // unlimited budget (Infinity - 1 stays Infinity) so there's no commit
      // step and no shot-count limit — see plan Stage 1 follow-up.
      const gong = range.plates[0];
      if (gong) store().commitTarget(gong.instanceId, gong.distanceM, Number.POSITIVE_INFINITY);
      // Calm by default (owner request 2026-07-21): the Test Range is for
      // learning the fundamentals without wind in the way — no wind
      // flags/controls either (see the markerSpecs/isTestRangeHud gating below).
      store().setWind({ speedMps: 0, directionDeg: 0 });
    } else if (sceneType === 'elr-range') {
      const elr = new ELRRangeScene(scene, store().session.firingPoint);
      range = elr;
      // Held so the scene-cost readout can report how many trees are standing.
      elrScene = elr;
    } else {
      range = new RangeScene(scene);
    }
    // Impact marks + hit/miss dust pools (task 1.5c) + in-scope bullet trace
    // (task 1.5b): shared pools, harmless (they stay empty) on the sight-in bay.
    initImpactFx(scene);
    initBulletTrace(scene);
    // Wind flags/socks (task 1.7b): built once at the store's CURRENT style;
    // `updateWindMarkers` rebuilds lazily if the player switches style later.
    // Capability, not scene identity (2026-07-26): whether this range plants
    // wind flags, and which ladder, is a property of the range, not of which
    // builder drew it (wind-system-btk-port W1: each range now names its own
    // ladder via `windMarkersFor`, rather than sharing Range A's flat one
    // filtered by lane length — that filter used to fall through to Range A's
    // own lane length on the ELR range, planting its markers at `groundYM: 0`
    // while the ELR terrain rose out from under them; see the plan's P5/P6).
    const markerSpecs = windMarkersFor(rangeDefinition.windMarkers);
    initWindMarkers(scene, markerSpecs, store().settings.windMarkerStyle);
    // Mirage shimmer (task 1.7c): a post-process pass between this world render
    // and the reticle's separate 2D overlay canvas (untouched by this).
    initMirage(renderer);

    // Perf instrumentation. `readDepthBits` is a one-shot read: the whole
    // per-range camera `near` decision assumes 24 bits, and a device reporting 16
    // would make the far stations z-fight no matter what near/far are set to.
    const frameTimer = new FrameTimer();
    const renderCost = new RenderCostMeter();
    resetPerfRef.current = () => {
      frameTimer.reset();
      renderCost.reset();
    };
    const depthBits = readDepthBits(renderer.getContext());
    // Push to React a few times a second, not every frame — a 60 Hz setState would
    // itself become a measurable share of the frame time being measured.
    const PERF_PUSH_MS = 250;
    let lastPerfPush = 0;

    // Shadow map (Stage 3, plan §9.2). This is the one RENDERER-level piece of
    // the scenery upgrade, so it is opt-in per scene rather than always on:
    // enabling it costs a shadow pass on every range, while only the two scenes
    // built on the environment module actually flag any casters. Until Stage 3
    // no `castShadow` in the codebase did anything, because this was never set.
    const wantsShadows =
      (sightIn as { usesShadows?: boolean } | null)?.usesShadows ??
      (range as { usesShadows?: boolean } | null)?.usesShadows ??
      false;
    if (wantsShadows) {
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    }

    // Eye height is a property of the BAY, not a global (Stage 2a): a firing
    // point on a knoll raises the camera, the wind sampling and the mirage
    // reference together. Flat ranges — and the sight-in bay, which reports
    // exactly `EYE_HEIGHT_M` — are unchanged by this.
    // Eye height is a property of the FIRING POINT, whatever kind of scene built it.
    // Paper bays have reported it since the Wooded Zero Range's knoll; steel scenes
    // gained it for the ELR Range's raised high line. Flat ranges report nothing and
    // keep the global default, so this is a no-op for the other three ranges.
    const eyeHeightM = sightIn?.eyeHeightM ?? range?.eyeHeightM ?? EYE_HEIGHT_M;

    // Mirage's fallback anchor distance (P16): the range's own "lane length"
    // when nothing is aimed — the farthest station on this bay, so the
    // shimmer always has SOME depth to anchor to even with the crosshair off
    // any target. `RangeDefinition` has no generic lane-length field (each
    // range names its own stations instead), so this is derived from
    // whichever station list this bay actually built. 300 m is a reasonable
    // last-resort default (no plates/targets at all — shouldn't happen on a
    // real range) rather than 0, which would collapse the aim-ray intersection
    // onto the camera itself.
    const laneLengthFallbackM =
      Math.max(
        0,
        ...(range?.plates.map((p) => p.distanceM) ?? []),
        ...(sightIn?.targets.map((t) => t.distanceM) ?? []),
      ) || 300;

    // Camera reach is a property of the RANGE for the same reason eye height is
    // (`ranges.ts` `CameraReach`): the shipped 0.5/3000 was sized for a 200 m world
    // and clips a multi-kilometre one outright. Ranges that say nothing get exactly
    // the old numbers back, so this is a no-op everywhere but the ELR Range.
    const reach = cameraReachFor(rangeDefinition);
    const camera = new THREE.PerspectiveCamera(
      SCOPE_BASE_FOV_DEG / magnification,
      1,
      reach.nearM,
      reach.farM,
    );
    camera.position.set(0, eyeHeightM, 0);

    // --- firing solution plumbing (task 1.4c) --------------------------------
    // Load the engine once; until it resolves, FIRE just recoils. The per-shot
    // scatter hit-sim (engine) and the deterministic-center solve are cached per
    // engagement (target range × wind). One fixed match load for Increment 1.
    const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
    const solveLoad: Load = {
      ...gameLoad.load,
      spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
    };
    // Box-true fallback zero (no active rifle+lot): the recommended zero for the
    // default load's cartridge, read in the active unit — the DOPE-first plan's
    // (step 1) replacement for the retired 300-yd SCOPE_ZERO_RANGE_M test
    // constant. The gear path below zeroes off ctx.zeroRangeM (the rifle's stored
    // playerZero, else the cartridge default) instead, so this only bites when
    // there is no gear at all.
    const fallbackZeroRangeM = recommendedZeroM(DEFAULT_GAME_LOAD_CARTRIDGE_ID, store().settings.unitsPrimary);
    let engineModule: BtkModule | null = null;
    let speedOfSoundMps = 340.3; // ISA default until the engine reports it
    // Cached once when the engine loads (task 1.7a) — avoids re-querying (and
    // re-deleting) the embind StringVector every frame in ensureWindField().
    let validWindPresets: string[] = [];
    loadBtkModule().then((m) => {
      engineModule = m;
      speedOfSoundMps = speedOfSound(m, ISA_ATMOSPHERE);
      validWindPresets = listWindPresets(m);
      setAvailablePresets(validWindPresets); // surface the raw preset list to the HUD dropdown (D3)
    });

    // Audio (task 1.5d): fetch the clips now (no context, no sound); the first
    // FIRE tap unlocks (iOS gesture) and then plays. `playShotAudio` fires the
    // muzzle report every shot and, on a HIT only, schedules the steel ping after
    // the sound-travel delay, scaled by distance + impact energy (audio-model).
    const audio = new AudioManager();
    void audio.preload();
    // Turret click (task 1.6c, D5): a dial ± press is its own user gesture, so
    // it can unlock audio independently of FIRE (idempotent — same as playShotAudio).
    clickAudioRef.current = () => {
      void audio.unlock().then(() => audio.click());
    };
    function playShotAudio(hit: boolean, soundDistanceM: number, impactEnergyJ: number, timeOfFlightS: number) {
      void audio.unlock().then(() => {
        audio.report(); // muzzle blast — every shot, at the trigger pull
        // The steel ring is created when the bullet arrives (after the time of
        // flight) and then travels back to the shooter, so the ping lands at
        // TOF + sound-travel — after the visible impact, never before it.
        if (hit) audio.ping(soundDistanceM, speedOfSoundMps, impactEnergyJ, undefined, timeOfFlightS); // hits only
      });
    }
    // Range A gear integration (task 2.3e, D2): with an active rifle+lot, the
    // steel range flies the gear's TRUE ballistics (impact + trace), scatters
    // with its TRUE dispersion, and passes the rifle's zero offset + stored
    // player zero into resolveShot — an unzeroed rifle visibly misses. With no
    // gear (or a stale catalog id), the box-true fallback keeps Increment-1
    // behaviour (getGameLoad + fallbackZeroRangeM, no zero error).
    function steelGearCtx(): GearSolveContext | null {
      const inv = store().inventory;
      const rifle = inv.rifles.find((r) => r.id === inv.activeRifleId);
      const lot = inv.ammoLots.find((l) => l.id === inv.activeLotId);
      if (!rifle || !lot) return null;
      try {
        return gearSolveContext(rifle, lot, store().settings.unitsPrimary);
      } catch (err) {
        console.error('range A: gear context failed, using box-true fallback', err);
        return null;
      }
    }
    // Cartridge-scaled recoil (rifle-ammo-store S10, D13): the active rifle+lot's
    // pitch impulse (game/recoil.ts, calibrated so 6.5 CM/140 gr match reproduces
    // today's flat feel exactly), plus the lateral kick scaled by the SAME factor
    // (D13 step 4 — the random POA residual, RESIDUAL_SHIFT_RAD, does NOT scale;
    // that's a shooter effect, not a physics one). No active gear (or an unknown/
    // stale spec) falls back to the flat reference constants — unchanged feel.
    function currentRecoil(): { pitch: number; yaw: number } {
      const inv = store().inventory;
      const rifle = inv.rifles.find((r) => r.id === inv.activeRifleId);
      const lot = inv.ammoLots.find((l) => l.id === inv.activeLotId);
      if (!rifle || !lot) return { pitch: RECOIL_PITCH_VEL_REFERENCE, yaw: RECOIL_YAW_VEL_REFERENCE };
      try {
        const pitch = recoilPitchVelocity(rifle.spec, lot.spec);
        const scale = pitch / RECOIL_PITCH_VEL_REFERENCE;
        return { pitch, yaw: RECOIL_YAW_VEL_REFERENCE * scale };
      } catch (err) {
        console.error('recoil: gear-scaled recoil failed, using the flat reference feel', err);
        return { pitch: RECOIL_PITCH_VEL_REFERENCE, yaw: RECOIL_YAW_VEL_REFERENCE };
      }
    }
    // Cache discriminator: steel solves/sims depend on the gear identity + its
    // zero reference ('box' = no-gear fallback). A Loadout swap or a new
    // confirmed zero simply misses the cache; stale entries are harmless and
    // bounded per session.
    const gearKeyOf = (ctx: GearSolveContext | null): string =>
      ctx ? `${ctx.rifle.id}|${ctx.lot.id}|${ctx.zeroRangeM}` : 'box';
    const solveCache = new Map<string, { dropM: number; windageM: number; velocityMps: number; timeOfFlightS: number }>();
    // Constant ZERO-wind solve per range (task 1.7a): the no-wind baseline that
    // still captures spin drift, so "fieldSolve − zeroSolve" isolates the
    // field's own gust contribution instead of double-counting spin drift (D2).
    // Deliberately stays on the BOX load even with gear active (task 2.3e): the
    // gust DELTA (field − zero) is second-order in the small true-vs-believed
    // MV/BC gap, so superposing the box delta on the gear-true mean is accurate
    // to well under the DOPE gap — avoids a field-aware gear solve for now
    // (deferred refinement, logged in PROGRESS).
    const zeroSolveCache = new Map<number, { dropM: number; windageM: number }>();
    const simCache = new Map<string, ScatterSimulator>();
    // Fine per-shot trajectory sampling for the bullet trace (task 1.5b); its last
    // row matches solveAt's, so the trace arc and the impact agree at the target.
    const traceTableCache = new Map<string, TrajectoryTable>();
    // Live curl-noise wind field (task 1.7a, Realistic mode only). Built lazily
    // (once the engine + a valid preset are available) and rebuilt only when the
    // chosen preset changes — NOT on every Steady⇄Realistic toggle, since the
    // field is cheap to leave idle and expensive to keep rebuilding. Advanced
    // once per frame in the render loop below; deleted on preset change/unmount.
    let windField: WindField | null = null;
    let windFieldPreset = '';
    function ensureWindField(): WindField | null {
      if (!engineModule) return null;
      const requested = store().session.windPreset;
      // Validate against the live preset list (D3's store note): a stale/bad
      // value must never crash the field build.
      const preset = validWindPresets.includes(requested) ? requested : DEFAULT_WIND_PRESET;
      if (!windField || windFieldPreset !== preset) {
        windField?.delete();
        // Non-null assertion (matches simAt/traceTableAt's `engineModule!`
        // pattern above): `engineModule` is reassigned in the sibling
        // `loadBtkModule().then(...)` closure, so TS can't carry the `if
        // (!engineModule) return null` narrowing past the `store()` call above.
        windField = createWindField(engineModule!, preset, WIND_FIELD_MIN, WIND_FIELD_MAX);
        windFieldPreset = preset;
      }
      return windField;
    }

    // The wind at an arbitrary world point (task 1.7b, D2/D3b) — what the wind
    // markers read each frame: `meanVector + gustScale × field.sample(worldPos)`.
    // In Steady mode (or before the field/engine is ready) this is just the
    // dialed mean, so every marker shows the same reading (plan 1.7b step 2).
    function currentWindAt(worldPos: { x: number; y: number; z: number }) {
      const wind = store().session.wind;
      const meanVec = windToVec(wind.speedMps, wind.directionDeg);
      if (store().settings.windRealism !== 'realistic') return meanVec;
      const field = ensureWindField();
      if (!field) return meanVec;
      const gustScale = gustScaleFor(wind.speedMps, GUST_REFERENCE_MPS);
      const gust = field.sample(worldPos);
      return {
        x: meanVec.x + gustScale * gust.x,
        y: meanVec.y + gustScale * gust.y,
        z: meanVec.z + gustScale * gust.z,
      };
    }

    // The dialed MEAN wind as a world vector — feeds a scene's optional
    // per-frame environment animation (Test Range Stage 1's `range?.update?.()`
    // hook; Stage 4 uses it to drift clouds with the dialed wind).
    function meanWindVec() {
      const w = store().session.wind;
      return windToVec(w.speedMps, w.directionDeg);
    }

    // On the sight-in bay the flags show the dialed MEAN only (task 2.3c2, D4:
    // gusts are orthogonal — the shot uses the mean too), so markers and the
    // fired shot always agree. The steel range keeps the full field-aware read.
    const windAtForMarkers = isSightIn
      ? (_worldPos: { x: number; y: number; z: number }) => {
          const w = store().session.wind;
          return windToVec(w.speedMps, w.directionDeg);
        }
      : currentWindAt;

    // Reactive-steel lifecycle (task T5) — the two native-handle maps, the
    // create/strike branching, the per-frame step/pose/chain/settle loop and the
    // teardown all live in `scope/steel-reactions.ts` now. Built lazily on the first
    // impact, because it needs both a steel scene and the WASM module.
    let steelReactions: SteelReactionController | null = null;
    const ensureSteelReactions = (scene: SteelSceneApi): SteelReactionController | null => {
      if (!steelReactions && engineModule) {
        const mod = engineModule;
        steelReactions = createSteelReactions(scene, (spec) => createSteelReaction(mod, spec));
      }
      return steelReactions;
    };
    // Impacts land at the target only after the bullet's time of flight. The plate
    // swing + dust puff are queued here at FIRE and run when the loop clock reaches
    // their due time, so they coincide with the tracer arriving (not the trigger
    // pull). Drained in the render loop. This is SCHEDULING — when an effect
    // happens — and stays here deliberately; what the effect IS lives in the
    // controller above.
    const pendingImpacts: { dueAt: number; run: () => void }[] = [];

    // The ordinary constant-mean solve — cached per gear|range|speed|dir. This
    // is exactly what `solveAt` returns in Steady mode. With gear it reads the
    // TRUE table (task 2.3e); the box fallback is byte-identical to 1.6.
    function meanSolveAt(rangeM: number, wind: { speedMps: number; directionDeg: number }, ctx: GearSolveContext | null) {
      const key = `${gearKeyOf(ctx)}|${rangeM}|${wind.speedMps}|${wind.directionDeg}`;
      let s = solveCache.get(key);
      if (!s) {
        // Read the last row of the fine trace table (shared, cached) rather than a
        // second solve — one trajectory simulate per engagement keeps the FIRE
        // gesture light (a long main-thread stall can interrupt iOS audio).
        const table = traceTableAt(rangeM, wind, ctx);
        const row = table[table.length - 1];
        s = row
          ? { dropM: row.dropM, windageM: row.windageM, velocityMps: row.velocityMps, timeOfFlightS: row.timeOfFlightS }
          : { dropM: 0, windageM: 0, velocityMps: 0, timeOfFlightS: 0 };
        solveCache.set(key, s);
      }
      return s;
    }

    // Constant zero-wind solve at a range (task 1.7a) — cached per range only
    // (no wind axis in the key, since it's always {0,0,0}). The D2 baseline
    // subtracted from the field solve to isolate the field's own contribution.
    function zeroWindSolveAt(rangeM: number): { dropM: number; windageM: number } {
      let s = zeroSolveCache.get(rangeM);
      if (!s) {
        const table = solveTrajectory(engineModule!, solveLoad, ISA_ATMOSPHERE, { x: 0, y: 0, z: 0 }, {
          zeroRangeM: fallbackZeroRangeM,
          maxRangeM: rangeM,
          stepM: rangeM,
          sightHeightM: SIGHT_HEIGHT_M,
        });
        const row = table[table.length - 1];
        s = row ? { dropM: row.dropM, windageM: row.windageM } : { dropM: 0, windageM: 0 };
        zeroSolveCache.set(rangeM, s);
      }
      return s;
    }

    // The firing solution FIRE actually uses (task 1.7a, D1/D2/D3b/D6). Steady
    // mode returns `meanSolveAt`'s object UNCHANGED — same reference, same
    // shape, no `effectiveWind` key — so Steady is byte-identical to 1.6.
    // Realistic mode superposes the live field's gust contribution (scaled
    // proportionally to the dialed mean speed) on top of that same mean, and
    // adds the D6 effective-wind readout.
    function solveAt(rangeM: number, wind: { speedMps: number; directionDeg: number }, ctx: GearSolveContext | null): SolveResult {
      const mean = meanSolveAt(rangeM, wind, ctx);
      if (store().settings.windRealism !== 'realistic') return mean;
      const field = ensureWindField();
      if (!field) return mean; // engine/field not ready yet — fall back to the mean

      const zero = zeroWindSolveAt(rangeM);
      const meanVec = windToVec(wind.speedMps, wind.directionDeg);
      const fieldTable = solveTrajectoryField(engineModule!, solveLoad, ISA_ATMOSPHERE, meanVec, field, {
        zeroRangeM: fallbackZeroRangeM,
        maxRangeM: rangeM,
        stepM: rangeM,
        sightHeightM: SIGHT_HEIGHT_M,
      });
      const fieldRow = fieldTable[fieldTable.length - 1];
      const fieldDW = fieldRow ? { dropM: fieldRow.dropM, windageM: fieldRow.windageM } : zero;
      const gustScale = gustScaleFor(wind.speedMps, GUST_REFERENCE_MPS);
      const superposed = superposeWind({ mean, zero, field: fieldDW, gustScale });

      // D6 effective-wind readout: sample the field along the eye→target line,
      // average with the mean (scaled the same as the shot), and report both
      // the recovered speed/direction and the windage mils the field accounted
      // for (the exact quantity solveAt just added on top of the mean).
      const eye = { x: 0, y: eyeHeightM, z: 0 };
      const gustSamples = sampleFieldColumn(field, eye, rangeM, EFFECTIVE_WIND_SAMPLES);
      const effective = averageEffectiveWind(meanVec, gustScale, gustSamples);
      const windOffsetRad = Math.atan2(-(gustScale * (fieldDW.windageM - zero.windageM)), rangeM);

      return {
        dropM: superposed.dropM,
        windageM: superposed.windageM,
        velocityMps: mean.velocityMps,
        timeOfFlightS: mean.timeOfFlightS,
        effectiveWind: { speedMps: effective.speedMps, directionDeg: effective.directionDeg, windOffsetRad },
      };
    }
    function simAt(rangeM: number, ctx: GearSolveContext | null): ScatterSimulator {
      const key = `${gearKeyOf(ctx)}|${rangeM}`;
      let sim = simCache.get(key);
      if (!sim) {
        // Gear → the TRUE dispersion (lot MV/BC SDs + rifle inherent precision,
        // task 2.3e); box fallback → the Increment-1 match-load dispersion.
        sim = ctx
          ? createGearScatter(engineModule!, {
              rifle: ctx.rifle,
              lot: ctx.lot,
              rifleRanges: ctx.rifleRanges,
              lotRanges: ctx.lotRanges,
              atmosphere: ISA_ATMOSPHERE,
              targetRangeM: rangeM,
            })
          : createScatterSimulator(engineModule!, gameLoad.load, gameLoad.dispersion, rangeM, ISA_ATMOSPHERE, gameLoad.twistM);
        simCache.set(key, sim);
      }
      return sim;
    }
    function traceTableAt(rangeM: number, wind: { speedMps: number; directionDeg: number }, ctx: GearSolveContext | null): TrajectoryTable {
      const key = `${gearKeyOf(ctx)}|${rangeM}|${wind.speedMps}|${wind.directionDeg}`;
      let table = traceTableCache.get(key);
      if (!table) {
        const windVec = windToVec(wind.speedMps, wind.directionDeg);
        // Gear → the TRUE trajectory zeroed at the rifle's stored zero (else the
        // cartridge default — ctx.zeroRangeM); box fallback → the Increment-1
        // solve at the fallback recommended zero (its remaining role, task 2.3e).
        table = ctx
          ? solveGear(engineModule!, {
              rifle: ctx.rifle,
              lot: ctx.lot,
              rifleRanges: ctx.rifleRanges,
              lotRanges: ctx.lotRanges,
              atmosphere: ISA_ATMOSPHERE,
              wind: windVec,
              zeroRangeM: ctx.zeroRangeM,
              maxRangeM: rangeM,
              stepM: rangeM / TRACE_SAMPLES,
              sightHeightM: SIGHT_HEIGHT_M,
            }).trueTable
          : solveTrajectory(engineModule!, solveLoad, ISA_ATMOSPHERE, windVec, {
              zeroRangeM: fallbackZeroRangeM,
              maxRangeM: rangeM,
              stepM: rangeM / TRACE_SAMPLES,
              sightHeightM: SIGHT_HEIGHT_M,
            });
        traceTableCache.set(key, table);
      }
      return table;
    }

    // Loop-visible aim state (React state is HUD-only).
    const st = {
      yaw: 0,
      pitch: 0.008, // a hair down (eye 1.6 m, plates ~0.55 m) so plates sit in view
      t: 0,
      dist: { y: 0, p: 0, vy: 0, vp: 0 }, // spring-damper disturbance (recoil + jerks)
      nextJerkAt: 2,
      breath: 1,
    };

    // Reticle redraw cache key (zoom | size | unit). Declared here — above
    // `resize` — because `resize` must invalidate it: assigning `reticleCanvas
    // .width` clears the 2D canvas and resets its context, so any cached "already
    // drawn" state is now stale. Without this reset, the initial ResizeObserver
    // callback (which fires once, asynchronously, AFTER the first frame has drawn
    // and cached its key) wiped the reticle and the unchanged key blocked the
    // redraw — the crosshair only reappeared once a unit toggle changed the key.
    let lastReticleKey = '';
    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      const dpr = Math.min(window.devicePixelRatio, 2);
      reticleCanvas.width = Math.round(w * dpr);
      reticleCanvas.height = Math.round(h * dpr);
      rctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      lastReticleKey = ''; // force drawReticle to repaint the just-cleared canvas
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---- input: drag aim + pinch/wheel zoom (ported from the 0.9 spike) -----
    const pointers = new Map<number, { x: number; y: number }>();
    let pinch: { startDist: number; startMag: number } | null = null;
    let dragLocked = false;

    function radPerPixel(): number {
      const mag = store().session.scope.magnification;
      const fovRad = fovRadForMag(mag);
      return (store().settings.sensitivity * fovRad) / canvas.clientHeight;
    }
    function spread(): number {
      const [a, b] = [...pointers.values()];
      return Math.hypot(a.x - b.x, a.y - b.y);
    }
    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        pinch = { startDist: spread(), startMag: store().session.scope.magnification };
        dragLocked = true;
      } else if (pointers.size > 2) {
        pinch = null;
      }
    }
    function onPointerMove(e: PointerEvent) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      pointers.set(e.pointerId, cur);
      if (pointers.size === 1 && !dragLocked) {
        const rpp = radPerPixel();
        st.yaw += (cur.x - prev.x) * rpp; // drag right → aim right (FPS-style)
        st.pitch += (cur.y - prev.y) * rpp;
        st.pitch = Math.max(-0.2, Math.min(0.2, st.pitch));
        st.yaw = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, st.yaw));
      } else if (pointers.size === 2 && pinch && pinch.startDist > 0) {
        store().setZoom(pinch.startMag * (spread() / pinch.startDist)); // clamps in store
      }
    }
    function onPointerUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      if (pointers.size < 2) pinch = null;
      if (pointers.size === 0) dragLocked = false;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      store().setZoom(store().session.scope.magnification * (e.deltaY < 0 ? 1.1 : 1 / 1.1));
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---- wobble + breath (ported from the 0.9 spike) ------------------------
    function steadyFactor(): number {
      if (!holdingRef.current) return 1;
      if (st.breath >= BREATH_COMFORT) return HOLD_STEADY_FACTOR;
      const debt = 1 - st.breath / BREATH_COMFORT;
      return HOLD_STEADY_FACTOR + debt * (BREATH_DEBT_FACTOR - HOLD_STEADY_FACTOR);
    }
    function wobble(t: number): { yaw: number; pitch: number } {
      const a = wobbleAmpRef.current * steadyFactor();
      if (a === 0) return { yaw: 0, pitch: 0 };
      const swayY = WOBBLE_RAD * (Math.sin(0.31 * t) + 0.5 * Math.sin(0.83 * t + 1.7));
      const swayP =
        WOBBLE_RAD * (Math.sin(0.23 * t + 0.9) + 0.5 * Math.sin(0.71 * t + 0.3)) +
        0.00008 * Math.sin((2 * Math.PI * t) / 4); // breathing
      const tremY = TREMOR_RAD * (Math.sin(2 * Math.PI * 6.1 * t) + 0.6 * Math.sin(2 * Math.PI * 9.7 * t + 0.5));
      const tremP = TREMOR_RAD * (Math.sin(2 * Math.PI * 5.3 * t + 1.1) + 0.6 * Math.sin(2 * Math.PI * 8.9 * t));
      return { yaw: a * (swayY + tremY), pitch: a * (swayP + tremP) };
    }
    function aimQuaternion(t: number): THREE.Quaternion {
      const w = wobble(t);
      // Negated Euler + `+=` drag (0.9 convention): drag right → aim right,
      // drag down → aim down (FPS-style, owner-approved).
      return new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-(st.pitch + w.pitch + st.dist.p), -(st.yaw + w.yaw + st.dist.y), 0, 'YXZ'),
      );
    }

    // Aimed plate across all racks: the plate the sight line passes closest to
    // at that plate's own plane. Shared by FIRE and Commit (task 1.6c, D2) so
    // "commit to the plate under the crosshair" and "the plate that shot just
    // resolved against" always agree.
    function findAimed(): { dir: THREE.Vector3; plate: PlateInstance } | null {
      if (!range) return null; // steel-only; the sight-in bay uses findAimedTarget
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t));
      if (dir.z >= -1e-3 || range.plates.length === 0) return null;
      // COMMIT-PREFERRED (`scope/aim-pick.ts`): a committed target keeps the
      // engagement through any holdover, and only loses it when the crosshair is
      // actually ON a different plate. With nothing committed this is just the
      // angular nearest-pick, so swing-and-shoot is unchanged.
      const aimed = resolveTargetPlate(
        { x: camera.position.x, y: camera.position.y },
        { x: dir.x, y: dir.y, z: dir.z },
        range.plates,
        store().session.currentTarget?.plateInstanceId,
      );
      return aimed ? { dir, plate: aimed } : null;
    }

    // Commit (task 1.6c, D2): read the plate under the crosshair right now and
    // engage it — refills the shot budget, resets dials + shot count, bumps
    // score.targetsEngaged (state/store.ts commitTarget).
    commitRef.current = () => {
      // Deliberately NOT commit-preferred: COMMIT means "engage what I am pointing
      // at", so it must always re-pick by aim or the target could never be changed.
      const dirNow = new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t));
      const picked = pickAimedPlate(
        { x: camera.position.x, y: camera.position.y },
        { x: dirNow.x, y: dirNow.y, z: dirNow.z },
        range?.plates ?? [],
      );
      const found = picked ? { dir: dirNow, plate: picked } : null;
      // Pass the RANGE's budget, not the store default. Omitting it here is what
      // killed the FIRE button on the probe: the scene builder granted 999 at
      // mount, then the first press of COMMIT silently replaced it with
      // DEFAULT_SHOT_BUDGET (3), and three shots later firing stopped for good —
      // gear-independent, and invisible unless you were watching "shots left".
      if (found) {
        store().commitTarget(
          found.plate.instanceId,
          found.plate.distanceM,
          shotBudgetFor(rangeDefinition),
        );
        // Committing to a target starts a fresh engagement, so stand any knocked-down
        // steel back up (task T6). Deliberately ALL of it, not just the committed
        // plate's group: the player is choosing what to shoot next, and leaving other
        // targets face-down would silently narrow the range.
        steelReactions?.resetDownTargets();
        // Mach state at the target (task 10). Solved through the SAME cached
        // path the shot will take, so the marking cannot disagree with what
        // actually arrives. `solveAt` is per-station cached, so on a station
        // already engaged this is free; on a fresh one it pays the same solve
        // the first shot would have paid anyway.
        try {
          const solvedAtTarget = solveAt(found.plate.distanceM, store().session.wind, steelGearCtx());
          const v = solvedAtTarget.velocityMps;
          setMachState(v > 0 && speedOfSoundMps > 0 ? machStateLabel(v / speedOfSoundMps) : null);
        } catch {
          // A marking is a nicety; never let it break the engagement.
          setMachState(null);
        }
      }
    };

    // FIRE (steel range) — resolve the shot from the aim, then recoil.
    function fireSteel() {
      const blocked = (why: string | null) => setFireBlocked(why);
      if (!range) return blocked('no steel scene'); // sight-in bay uses fireSightIn
      const steel = range; // non-null alias so the deferred impact closures narrow
      // Gate on budget (task 1.6c, D2): ends the 1.4c dry-fire allowance — no
      // shot, no recoil, once the budget for the current target is spent.
      if (store().session.shotBudget <= 0) return blocked('shot budget spent — COMMIT to refill');
      // Gate on ammo (P2b): a real lot at 0 rounds can't fire (box fallback with no
      // owned lot is unaffected). The FIRE button also disables, but guard here too
      // so any fire entry point is blocked.
      {
        const inv = store().inventory;
        const lotNow = inv.ammoLots.find((l) => l.id === inv.activeLotId);
        if (lotNow && (lotNow.roundsRemaining ?? 0) <= 0) return blocked('active lot is empty');
      }
      // Sample the aim BEFORE this shot's recoil kick (0.9: the bullet leaves as
      // the trigger breaks). Wobble is part of the aim; the kick below is the
      // consequence, applied after the shot is resolved.
      if (!engineModule) {
        // The WASM module never loaded, or aborted mid-session (an Emscripten
        // abort poisons every later call). Recoil still runs below, which is why
        // this reads as a dead trigger rather than an obvious failure.
        blocked('ballistics engine not available');
      }
      try {
      if (engineModule) {
        const found = findAimed();
        if (!found) blocked('no target resolved from this aim');
        if (found) {
          const { dir, plate: aimed } = found;
          const rangeM = aimed.distanceM;
          const wind = store().session.wind;
          const scope = store().session.scope;
          // Active gear drives the solve/scatter/zero-error (task 2.3e, D2);
          // null = box-true fallback, today's Increment-1 behaviour. The load
          // geometry (mass/diameter) follows the gear too — steel impulse and
          // impact-audio energy scale with the actual cartridge.
          const gearCtx = steelGearCtx();
          const bulletMassKg = gearCtx?.bulletMassKg ?? gameLoad.load.massKg;
          const bulletDiameterM = gearCtx?.bulletDiameterM ?? gameLoad.load.diameterM;
          // Phase timing (2026-07-28). The probe measured 25–30 ms on the frame a
          // shot fires against 17–18 ms idle — a discrete blocking event, not slow
          // rendering. These marks say WHICH phase.
          const shotTimer = new PhaseTimer();
          const solved = solveAt(rangeM, wind, gearCtx);
          shotTimer.mark('solve');
          // Effective-wind readout (task 1.7b, D6): undefined in Steady mode
          // (or before the field's loaded), which the HUD reads as "nothing
          // new to show" and just displays the dialed mean instead.
          setLastEffectiveWind(solved.effectiveWind ?? null);
          const rackPlates: ShotPlate[] = range.plates
            .filter((pl) => pl.distanceM === rangeM)
            // A knocked-down target is out of play (task T6). Filtered HERE, before
            // `resolveShot`, rather than inside the hit test: it keeps `game/shot.ts`
            // free of reaction state, and it correctly removes a fallen plate from
            // the aimed-plate pick too, not just from the hit test.
            .filter((pl) => steelReactions?.isStanding(pl.instanceId) ?? true)
            .map((pl) => ({
              instanceId: pl.instanceId,
              position: { x: pl.position.x, y: pl.position.y },
              diameterM: pl.diameterM,
              typeId: pl.targetTypeId,
              heightM: pl.heightM,
            }));
          // One scatter sample — carries the shot's impact AND its true muzzle
          // velocity (2.4e); resolveShot uses {x,y}, the chrono reads mvMps.
          const shot = simAt(rangeM, gearCtx).fire();
          shotTimer.mark('scatter');
          const result = resolveShot({
            eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            aimDir: { x: dir.x, y: dir.y, z: dir.z },
            dial: { elevRad: scope.elevationRad, windRad: scope.windageRad },
            solve: solved,
            distanceM: rangeM,
            scatter: shot,
            plates: rackPlates,
            bulletDiameterM,
            // D6 zero-error terms (task 2.3e): the rifle's hidden bore offset +
            // the stored player zero; both default to 0 in the box fallback.
            zeroOffsetRad: gearCtx ? gearZeroOffset(gearCtx.rifle, gearCtx.rifleRanges) : undefined,
            playerZero: gearCtx?.playerZero,
          });
          shotTimer.mark('resolve');
          store().recordShot(result);
          store().decrementBudget();
          blocked(null); // a shot got all the way through
          // Deplete the lot + tally the rifle's lifetime count (P2b). Gear only —
          // the box fallback has no owned lot to consume.
          if (gearCtx) store().consumeRound(gearCtx.rifle.id, gearCtx.lot.id);

          // Chronograph (task 2.4e, D10): while deployed, log THIS shot's true
          // muzzle velocity (the engine's per-shot draw) for the active rifle+lot.
          // Numbers only — no truth object. Needs gear (nothing to key a box shot to).
          if (store().chrono.deployed && gearCtx) {
            store().logChronoReading(gearCtx.rifle.id, gearCtx.lot.id, shot.mvMps);
          }

          // Spotter call (task 1.6c, D3 HUD): hit/miss + clock relative to the
          // engaged plate's centre. Called against the plate the shot was aimed
          // at (`aimed`) — once 1.6c2 wires commitTarget this will be the same
          // plate whenever the player commits to the one under the crosshair.
          setLastCall(callImpact(result, { x: aimed.position.x, y: aimed.position.y }));

          // Everything that happens *at the target* — the plate swing, the dust
          // puff, the steel ring — is created only when the bullet arrives, i.e.
          // after its time of flight. Capture the fire-time eye and schedule those
          // effects at st.t + TOF so they land with the tracer, not at the trigger
          // pull. The muzzle report (below) is the one thing that fires now.
          const timeOfFlightS = Math.max(0, solved.timeOfFlightS);
          const eyeX = camera.position.x;
          const eyeY = camera.position.y;
          const eyeZ = camera.position.z;

          // Reactive steel (task 1.5a): a hit swings/rotates the struck plate.
          if (result.hitPlateId != null) {
            const hitPlate = range.plates.find((pl) => pl.instanceId === result.hitPlateId);
            if (hitPlate) {
              const impactWorld = { x: result.impact.x, y: result.impact.y, z: hitPlate.position.z };
              // Bullet velocity at impact ≈ the shooter→impact ray at the load's
              // remaining speed (mostly downrange, a little drop). Good enough for
              // the impulse; the plate hangs facing the shooter.
              const dx = impactWorld.x - eyeX;
              const dy = impactWorld.y - eyeY;
              const dz = impactWorld.z - eyeZ;
              const dlen = Math.hypot(dx, dy, dz) || 1;
              const spd = solved.velocityMps || solveLoad.muzzleVelocityMps;
              const impactVel = { x: (dx / dlen) * spd, y: (dy / dlen) * spd, z: (dz / dlen) * spd };
              pendingImpacts.push({
                dueAt: st.t + timeOfFlightS,
                run: () => {
                  // Everything that happens AT the plate — native target creation,
                  // the strike, the swing/bolted branch, the persistent mark — lives
                  // in the reaction controller (task T5). This closure only decides
                  // WHEN.
                  ensureSteelReactions(steel)?.onImpact({
                    plate: hitPlate,
                    impactWorld,
                    impactVel,
                    bulletMassKg,
                    bulletDiameterM,
                  });
                },
              });
            }
          }

          // Audio (task 1.5d): report now; on a hit, the steel ping lands at
          // TOF + sound-travel from the impact point back to the shooter, scaled by
          // distance + impact energy (½·m·v²). A miss makes no impact sound.
          const impactZ = -rangeM;
          const soundDistanceM = Math.hypot(
            result.impact.x - eyeX,
            result.impact.y - eyeY,
            impactZ - eyeZ,
          );
          const impactEnergyJ = 0.5 * bulletMassKg * solved.velocityMps * solved.velocityMps;
          playShotAudio(result.hitPlateId != null, soundDistanceM, impactEnergyJ, timeOfFlightS);

          // Impact FX (task 1.5c): a dust puff on every shot — metallic on a
          // steel hit, brown on a miss. A low miss resolves BELOW the ground on
          // the far target plane (underground → occluded by the grass), so
          // project it down the sight ray onto the grass in front, where the
          // round actually kicks up dirt. Deferred to arrival like the steel swing.
          let fxX = result.impact.x;
          let fxY = result.impact.y;
          let fxZ = impactZ;
          // Ground is a PROFILE, not a constant — flat on every range but the ELR
          // Range, whose hillside would otherwise put the puff past the real
          // strike and underground (`scope/miss-projection.ts`).
          const groundProfile = steel.groundYAt ?? FLAT_GROUND;
          if (result.hitPlateId == null && fxY < groundProfile(rangeM)) {
            const landed = projectMissToGround(
              { x: eyeX, y: eyeY, z: eyeZ },
              { x: fxX, y: fxY, z: fxZ },
              groundProfile,
              GROUND_PROJECTION_MAX_M,
            );
            // null = it never came down inside the range; leave the impact where the
            // solver put it rather than inventing a strike point.
            if (landed) {
              fxX = landed.x;
              fxY = landed.y;
              fxZ = landed.z;
            }
          }
          const puffHit = result.hitPlateId != null;
          pendingImpacts.push({
            dueAt: st.t + timeOfFlightS,
            run: () => {
              emitImpact({ impactWorld: new THREE.Vector3(fxX, fxY, fxZ), hit: puffHit });
            },
          });

          // Bullet trace (task 1.5b): fly a tracer along the fine trajectory to
          // the resolved impact (endpoint pinned to it). Toggle-gated (store-only).
          // It launches now and walks its own TOF, arriving exactly when the queued
          // impact above fires.
          if (store().settings.traceEnabled) {
            const path = buildTracePath(
              traceTableAt(rangeM, wind, gearCtx),
              { x: eyeX, y: eyeY, z: eyeZ },
              result.impact,
              rangeM,
            );
            launchBulletTrace(path, st.t);
            shotTimer.mark('trace');
          }
          // One state push per shot — cheap, and it lands on a frame that has
          // already been spent, so measuring cannot inflate what it measures.
          setShotMs(shotTimer.summary());
        }
      }
      } catch (err) {
        // Never let a shot-resolution failure take the animation loop or the
        // button with it — report it and keep the range usable.
        // `describeThrown`, not String(err): a C++ exception from the WASM core
        // is not an Error, and String() renders it `[object Object]` — which is
        // exactly what reached the owner on device, hiding a message the engine
        // had already written. Log the raw value too, so the console keeps the
        // getters the on-screen string cannot show.
        console.error('fireSteel: shot resolution threw', err);
        blocked(`shot failed: ${describeThrown(err)}`);
      }
      // Recoil kick + POA residual (feel; ported verbatim from 0.9; pitch/yaw are
      // now cartridge-scaled from the active gear, S10 — the residual stays flat,
      // it's a shooter effect, not a physics one, D13 step 4).
      const recoil = currentRecoil();
      st.dist.vp -= recoil.pitch; // muzzle rise (view kicks up through the negated Euler)
      st.dist.vy += (Math.random() * 2 - 1) * recoil.yaw;
      st.pitch += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
      st.yaw += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
    }

    // --- sight-in fire path + zeroing flow (task 2.3c2 / 2.3d) ---------------
    // Per-target running group: impacts as offsets (m) from the target centre.
    // The centroid marker is drawn on the target face; a dial change starts a new
    // group (D5) — prior splats stay, but they're excluded from the centroid.
    const groups = new Map<number, { dx: number; dy: number }[]>();
    let engagedStation = -1;
    // One true-dispersion scatter sim per station, rebuilt if the gear changes.
    const sightInSimCache = new Map<number, { sim: ScatterSimulator; key: string }>();

    // The paper target nearest the sight line at its own plane.
    function findAimedTarget(): { dir: THREE.Vector3; target: PaperTargetInstance } | null {
      if (!sightIn || sightIn.targets.length === 0) return null;
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t));
      if (dir.z >= -1e-3) return null;
      let aimed = sightIn.targets[0];
      let best = Infinity;
      for (const t of sightIn.targets) {
        const tt = -t.distanceM / dir.z;
        const ax = camera.position.x + dir.x * tt;
        const ay = camera.position.y + dir.y * tt;
        const d = Math.hypot(ax - t.position.x, ay - t.position.y);
        if (d < best) {
          best = d;
          aimed = t;
        }
      }
      return { dir, target: aimed };
    }

    // Mirage's aimed-distance input (P16): whichever aim-pick this bay uses,
    // read only the distance — `findAimed`/`findAimedTarget` already
    // recompute `dir` from `aimQuaternion(st.t)` internally (cheap, and the
    // established pattern at every other call site in this file), so this
    // stays a one-line dispatch rather than a second dir-tracking path.
    function aimedDistanceNow(): number | null {
      if (isSightIn) return findAimedTarget()?.target.distanceM ?? null;
      return findAimed()?.plate.distanceM ?? null;
    }

    // Gear-driven solve for a sight-in target (D2): the active rifle+lot's TRUE
    // trajectory (sampled fine for the tracer) + zero offset + stored player zero;
    // else the box-true fallback (believed = true, no zero error) so a fresh save
    // still shoots.
    //
    // ZERO REFERENCE (fidelity fix 2026-07-19, supersedes the same-day "zero at
    // the engaged target" fix): the solve zeros the trajectory at the rifle's
    // CURRENT zero reference — the stored `playerZero.zeroRangeM`, else the
    // cartridge default (`ctx.zeroRangeM`) — NOT at the engaged target. A rifle
    // zeroed at 100 therefore reads its real trajectory at the other stations
    // (~0.2 mil low at 50 from sight height, ~0.5 mil low at 200 from drop),
    // which is the physical behaviour the 3-station layout teaches. The
    // over-correction the old fix papered over is instead handled where it
    // belongs: Confirm subtracts the come-up between the old reference and the
    // confirmed target (see confirmZeroRef), so `playerZero` stays a pure bore-
    // offset corrector and POA=POI holds at the confirmed distance. The no-gear
    // fallback still zeros at the target itself (a friendly POA=POI loaner —
    // nothing to confirm without a rifle).
    function sightInSolve(distanceM: number, ctx: GearSolveContext | null) {
      const wind = store().session.wind;
      const windVec = windToVec(wind.speedMps, wind.directionDeg);
      const fineStep = distanceM / TRACE_SAMPLES; // fine table so the tracer arcs
      if (engineModule && ctx) {
        const res = solveGear(engineModule, {
          rifle: ctx.rifle,
          lot: ctx.lot,
          rifleRanges: ctx.rifleRanges,
          lotRanges: ctx.lotRanges,
          atmosphere: ISA_ATMOSPHERE,
          wind: windVec,
          zeroRangeM: ctx.zeroRangeM,
          maxRangeM: distanceM,
          stepM: fineStep,
          sightHeightM: SIGHT_HEIGHT_M,
        });
        const row = res.trueTable[res.trueTable.length - 1];
        return {
          table: res.trueTable,
          solve: { dropM: row?.dropM ?? 0, windageM: row?.windageM ?? 0, timeOfFlightS: row?.timeOfFlightS ?? 0 },
          zeroOffsetRad: res.zeroOffsetRad,
          playerZero: ctx.playerZero,
          bulletDiameterM: ctx.bulletDiameterM,
        };
      }
      const table = solveTrajectory(engineModule!, solveLoad, ISA_ATMOSPHERE, windVec, {
        zeroRangeM: distanceM,
        maxRangeM: distanceM,
        stepM: fineStep,
        sightHeightM: SIGHT_HEIGHT_M,
      });
      const row = table[table.length - 1];
      return {
        table,
        solve: { dropM: row?.dropM ?? 0, windageM: row?.windageM ?? 0, timeOfFlightS: row?.timeOfFlightS ?? 0 },
        zeroOffsetRad: { h: 0, v: 0 },
        playerZero: { elevationRad: 0, windageRad: 0 },
        bulletDiameterM: gameLoad.load.diameterM,
      };
    }

    // Per-shot scatter from the gear's TRUE dispersion (task 2.3d) — cached per
    // station, rebuilt if the active gear changes. {0,0} with no gear.
    function sightInScatterAt(ctx: GearSolveContext, rangeM: number, stationIndex: number): ScatterSample {
      if (!engineModule) return { x: 0, y: 0, mvMps: 0 };
      const key = `${ctx.rifle.id}|${ctx.lot.id}|${rangeM}`;
      let entry = sightInSimCache.get(stationIndex);
      if (!entry || entry.key !== key) {
        entry?.sim.delete();
        const sim = createGearScatter(engineModule, {
          rifle: ctx.rifle,
          lot: ctx.lot,
          rifleRanges: ctx.rifleRanges,
          lotRanges: ctx.lotRanges,
          atmosphere: ISA_ATMOSPHERE,
          targetRangeM: rangeM,
        });
        entry = { sim, key };
        sightInSimCache.set(stationIndex, entry);
      }
      return entry.sim.fire();
    }

    function fireSightIn() {
      // Gate on ammo (P2b): a real lot at 0 rounds can't fire (before the try, so
      // no recoil either). Box fallback (no owned lot) is unaffected.
      {
        const inv = store().inventory;
        const lotNow = inv.ammoLots.find((l) => l.id === inv.activeLotId);
        if (lotNow && (lotNow.roundsRemaining ?? 0) <= 0) return;
      }
      // Guard the whole shot resolution so a solve error can't kill the recoil.
      try {
        if (engineModule && sightIn) {
          const found = findAimedTarget();
          if (found) {
            const { dir, target } = found;
            const inv = store().inventory;
            const rifle = inv.rifles.find((r) => r.id === inv.activeRifleId);
            const lot = inv.ammoLots.find((l) => l.id === inv.activeLotId);
            // Resolve the gear context once (stale/drifted catalog id → box fallback).
            let ctx: GearSolveContext | null = null;
            if (rifle && lot) {
              try {
                ctx = gearSolveContext(rifle, lot, store().settings.unitsPrimary);
              } catch (err) {
                console.error('sight-in: gear context failed, using box-true fallback', err);
              }
            }
            const sz = sightInSolve(target.distanceM, ctx);
            const sample = ctx ? sightInScatterAt(ctx, target.distanceM, target.stationIndex) : null;
            const scatter = sample ?? { x: 0, y: 0 };
            // Chronograph (task 2.4e): log this shot's true MV when deployed with
            // gear (the gear scatter sample carries mvMps; box fallback has none).
            if (sample && rifle && lot && store().chrono.deployed) {
              store().logChronoReading(rifle.id, lot.id, sample.mvMps);
            }
            const scope = store().session.scope;
            // The target face as a single (large) disc so resolveShot centres the
            // group on it; aim-as-hold + dial + player zero vs the true solution +
            // the rifle's zero offset decide where the group lands (D6).
            const facePlate: ShotPlate = {
              instanceId: target.stationIndex,
              position: { x: target.position.x, y: target.position.y },
              diameterM: target.sizeM,
            };
            const result = resolveShot({
              eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
              aimDir: { x: dir.x, y: dir.y, z: dir.z },
              dial: { elevRad: scope.elevationRad, windRad: scope.windageRad },
              solve: sz.solve,
              distanceM: target.distanceM,
              scatter,
              plates: [facePlate],
              bulletDiameterM: sz.bulletDiameterM,
              zeroOffsetRad: sz.zeroOffsetRad,
              playerZero: sz.playerZero,
            });

            const eyeX = camera.position.x;
            const eyeY = camera.position.y;
            const eyeZ = camera.position.z;
            // Dust puff position: a below-ground miss is projected down the sight
            // ray onto the grass (same as Range A); otherwise the target plane.
            let fxX = result.impact.x;
            let fxY = result.impact.y;
            let fxZ = -target.distanceM;
            if (fxY < GROUND_Y_M) {
              const t = (GROUND_Y_M - eyeY) / (fxY - eyeY);
              fxX = eyeX + t * (fxX - eyeX);
              fxZ = eyeZ + t * (fxZ - eyeZ);
              fxY = GROUND_Y_M + GROUND_PUFF_LIFT_M;
            }
            // Paint the splat + dust puff now (paper is close — immediate feedback).
            sightIn.paintHit(target.stationIndex, result.impact.x, result.impact.y, sz.bulletDiameterM);
            emitImpact({ impactWorld: new THREE.Vector3(fxX, fxY, fxZ), hit: false });
            if (store().settings.traceEnabled) {
              const path = buildTracePath(sz.table, { x: eyeX, y: eyeY, z: eyeZ }, result.impact, target.distanceM);
              launchBulletTrace(path, st.t);
            }
            void audio.unlock().then(() => audio.report());

            // Running group + centroid (D5): accumulate this shot, recompute the
            // centroid, and overlay it on the target grid.
            let g = groups.get(target.stationIndex);
            if (!g) {
              g = [];
              groups.set(target.stationIndex, g);
            }
            g.push({ dx: result.impact.x - target.position.x, dy: result.impact.y - target.position.y });
            engagedStation = target.stationIndex;
            const cx = g.reduce((s, p) => s + p.dx, 0) / g.length;
            const cy = g.reduce((s, p) => s + p.dy, 0) / g.length;
            sightIn.setGroupCentroid(target.stationIndex, target.position.x + cx, target.position.y + cy);
            setSightInGroup({ shots: g.length, nominalDistance: target.nominalDistance });
            // Deplete the lot + tally the rifle's lifetime count (P2b) — gear only.
            if (rifle && lot) store().consumeRound(rifle.id, lot.id);
          }
        }
      } catch (err) {
        console.error('sight-in fire failed', err);
      }
      // Recoil (feel; same as the steel path, cartridge-scaled S10) — ALWAYS runs.
      const recoil = currentRecoil();
      st.dist.vp -= recoil.pitch;
      st.dist.vy += (Math.random() * 2 - 1) * recoil.yaw;
      st.pitch += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
      st.yaw += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
    }

    fireRef.current = isSightIn ? fireSightIn : fireSteel;
    // Clean-target (D9): wipe the engaged target's marks + reset its group for a
    // fresh face; falls back to cleaning all three if nothing is under the crosshair.
    cleanRef.current = () => {
      if (!sightIn) return;
      const found = findAimedTarget();
      const idx = found ? found.target.stationIndex : engagedStation;
      if (idx >= 0) {
        sightIn.cleanTarget(idx);
        groups.set(idx, []);
        if (idx === engagedStation) setSightInGroup(null);
      } else {
        sightIn.cleanAll();
      }
    };
    // Confirm zero (D5/D6): COMPOSE the current turret into the rifle's stored
    // zero, MINUS the come-up handoff, at the engaged target's distance; then
    // reset the turret and clear the group.
    //  • Compose, not replace (2026-07-19 re-confirm bug): the stored zero is a
    //    baseline under the dial (resolveShot: applied = aim + dial + playerZero),
    //    so on a rifle that already has a zero the turret only holds the touch-up.
    //  • Handoff (fidelity fix, same day): the dial the player centred with also
    //    contains the REAL trajectory correction between the old zero reference
    //    and this target (sightInSolve zeros at the old reference). That part
    //    moves into the new trajectory zero (`zeroRangeM`), not the angular
    //    baseline — so re-solve at the old reference and subtract its required
    //    correction: pz_new = pz_old + dial − required. Leaves playerZero a pure
    //    bore-offset corrector, so the other stations read their true hold.
    //    (The required term includes any dialed wind, so a wind hold at confirm
    //    time cancels cleanly rather than corrupting the zero — the calm-
    //    conditions hint stays as pedagogy, not a correctness guard.)
    // The store action does compose + subtract + turret reset atomically.
    confirmZeroRef.current = () => {
      const inv = store().inventory;
      if (!rangeDefinition.zeroable || !sightIn || engagedStation < 0 || !inv.activeRifleId) return;
      const target = sightIn.targets[engagedStation];
      if (!target) return;
      let required = { elevRad: 0, windRad: 0 };
      try {
        const rifle = inv.rifles.find((r) => r.id === inv.activeRifleId);
        const lot = inv.ammoLots.find((l) => l.id === inv.activeLotId);
        if (rifle && lot && engineModule) {
          const ctx = gearSolveContext(rifle, lot, store().settings.unitsPrimary);
          const sz = sightInSolve(target.distanceM, ctx);
          required = requiredCorrectionRad(sz.solve.dropM, sz.solve.windageM, target.distanceM);
        }
      } catch (err) {
        console.error('confirm zero: come-up handoff solve failed, storing dial as-is', err);
      }
      store().confirmZero(inv.activeRifleId, target.distanceM, required);
      groups.set(engagedStation, []);
      sightIn.clearGroupCentroid(engagedStation);
      setSightInGroup(null);
    };
    // Inspect (D10): the engaged target's face canvas for the head-on close-up.
    faceCanvasRef.current = () => (sightIn && engagedStation >= 0 ? sightIn.getFaceCanvas(engagedStation) : null);

    // Any turret dial change starts a NEW group (D5): reset the engaged target's
    // running group (prior splats stay on paper); the centroid clears until the
    // next confirming shot.
    let dialUnsub: () => void = () => {};
    if (isSightIn) {
      dialUnsub = useGameStore.subscribe((s, prev) => {
        const changed =
          s.session.scope.elevationRad !== prev.session.scope.elevationRad ||
          s.session.scope.windageRad !== prev.session.scope.windageRad;
        if (changed && engagedStation >= 0) {
          groups.set(engagedStation, []);
          sightIn?.clearGroupCentroid(engagedStation);
          setSightInGroup((g) => (g ? { ...g, shots: 0 } : g));
        }
      });
    }


    // ---- reticle overlay (redraws only when zoom / size / unit change) ------
    // (declared above `resize`, which invalidates this key — see below.)
    function drawReticle() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      const mag = store().session.scope.magnification;
      const unit = store().settings.unitsPrimary;
      const key = `${mag.toFixed(3)}|${w}|${h}|${unit}`;
      if (key === lastReticleKey) return;
      lastReticleKey = key;

      rctx.clearRect(0, 0, w, h);
      const cx = w / 2;
      const cy = h / 2;
      const radiusPx = 0.4 * Math.min(w, h); // matches the 40vmin scope mask
      const geo = buildReticle(unit, fovRadForMag(mag), h, radiusPx, mag);

      rctx.strokeStyle = 'rgba(20,20,20,0.9)';
      rctx.fillStyle = 'rgba(20,20,20,0.95)';
      rctx.lineWidth = 1;
      rctx.font = '11px monospace';

      // Crosshair stadia lines to the circle edge.
      rctx.beginPath();
      rctx.moveTo(cx, cy - radiusPx);
      rctx.lineTo(cx, cy + radiusPx);
      rctx.moveTo(cx - radiusPx, cy);
      rctx.lineTo(cx + radiusPx, cy);
      rctx.stroke();

      // Vertical (elevation) ticks: value>0 is up (screen −y).
      rctx.textAlign = 'right';
      rctx.textBaseline = 'middle';
      rctx.beginPath();
      for (const t of geo.ticksY) {
        const y = cy - t.offsetPx;
        rctx.moveTo(cx - t.halfLengthPx, y);
        rctx.lineTo(cx + t.halfLengthPx, y);
      }
      rctx.stroke();
      for (const t of geo.ticksY) {
        if (t.label) rctx.fillText(t.label, cx - MAJOR_HALF_PX - 3, cy - t.offsetPx);
      }

      // Horizontal (windage) ticks: value>0 is right (screen +x).
      rctx.textAlign = 'center';
      rctx.textBaseline = 'top';
      rctx.beginPath();
      for (const t of geo.ticksX) {
        const x = cx + t.offsetPx;
        rctx.moveTo(x, cy - t.halfLengthPx);
        rctx.lineTo(x, cy + t.halfLengthPx);
      }
      rctx.stroke();
      for (const t of geo.ticksX) {
        if (t.label) rctx.fillText(t.label, cx + t.offsetPx, cy + MAJOR_HALF_PX + 3);
      }

      // Centre aiming dot.
      rctx.beginPath();
      rctx.arc(cx, cy, 1.5, 0, Math.PI * 2);
      rctx.fill();
    }

    // ---- render loop --------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const rawDeltaMs = now - last;
      const dt = Math.min(rawDeltaMs / 1000, 0.05);
      st.t += dt;
      last = now;
      // Sample the RAW delta, not the clamped `dt` — clamping at 50 ms is what
      // keeps the physics stable through a stall, and would hide exactly the
      // stalls this readout exists to show.
      frameTimer.push(rawDeltaMs);
      if (now - lastPerfPush > PERF_PUSH_MS) {
        lastPerfPush = now;
        const sample = frameTimer.sample();
        setPerf({
          ms: sample.avgMs,
          fps: sample.fps,
          worst: sample.worstMs,
          bits: depthBits,
        });
        // Scene cost (P13). `renderer.info` is free — it is counters the renderer
        // already keeps — so this costs nothing beyond the state push it rides on.
        if (elrScene) {
          setSceneCost({
            renderMs: renderCost.meanMs(),
            drawCalls: renderer.info.render.calls,
            triangles: renderer.info.render.triangles,
            trees: elrScene.placedTreeCount,
          });
        }
      }
      // Disturbance spring-damper (recoil + micro-jerks).
      st.dist.vy += (-SPRING_K * st.dist.y - SPRING_C * st.dist.vy) * dt;
      st.dist.vp += (-SPRING_K * st.dist.p - SPRING_C * st.dist.vp) * dt;
      st.dist.y += st.dist.vy * dt;
      st.dist.p += st.dist.vp * dt;
      // Breath dynamics.
      st.breath = holdingRef.current
        ? Math.max(0, st.breath - dt / BREATH_DEPLETE_S)
        : Math.min(1, st.breath + dt / BREATH_RECOVER_S);
      if (breathBarRef.current) {
        breathBarRef.current.style.width = `${(st.breath * 100).toFixed(0)}%`;
        breathBarRef.current.style.background =
          holdingRef.current && st.breath < BREATH_COMFORT ? '#c33' : '#4a9';
      }
      // Random micro-jerks every 3–7 s, scaled by wobble + breath (0.9 iter 3).
      if (wobbleAmpRef.current > 0 && st.t >= st.nextJerkAt) {
        const k = 0.002 * wobbleAmpRef.current * steadyFactor();
        st.dist.vy += (Math.random() * 2 - 1) * k;
        st.dist.vp += (Math.random() * 2 - 1) * k;
        st.nextJerkAt = st.t + 3 + Math.random() * 4;
      }
      // Fire any impacts whose bullet has now arrived (dueAt = fire time + TOF).
      // The queue isn't strictly ordered by dueAt — a later shot at a nearer rack
      // can arrive before an earlier long shot — so scan the whole (tiny) array,
      // run the ready ones, and keep the rest.
      if (pendingImpacts.length > 0) {
        for (let i = pendingImpacts.length - 1; i >= 0; i--) {
          if (pendingImpacts[i].dueAt <= st.t) {
            pendingImpacts[i].run();
            pendingImpacts.splice(i, 1);
          }
        }
      }
      // Reactive steel (task T5): advance each swinging plate's physics, mirror the
      // pose into the scene, retire on settle. All of it in the controller.
      steelReactions?.update(dt);
      // Wind field (task 1.7a): advance the live curl-noise field's clock once
      // per frame while in Realistic mode (monotonic — never rewound). Built
      // lazily by `ensureWindField()` the first time it's needed. Skipped on the
      // sight-in bay (mean-only wind there, task 2.3c2).
      if (!isSightIn && store().settings.windRealism === 'realistic') {
        const field = ensureWindField();
        field?.advance(st.t);
      }
      // Wind flags/socks (task 1.7b): read the live local wind at each marker
      // and yaw/droop/flutter accordingly (Steady mode — and the sight-in bay —
      // just show the dialed mean everywhere via `windAtForMarkers`).
      updateWindMarkers(dt, st.t, store().settings.windMarkerStyle, windAtForMarkers);
      // Impact FX (task 1.5c): grow/fade dust puffs and recycle finished ones.
      updateImpactFx(dt);
      // Per-scene environment animation (Test Range Stage 1; no-op on
      // RangeScene/sight-in). Drives cloud drift, and from Stage 5 the
      // wind-driven vegetation. Paper bays get the same hook — the Wooded Zero
      // Range carries the full environment module, so it needs it too.
      // `windAtForMarkers` is deliberately the sampler passed for canopy sway:
      // it is already "the wind this range's shots actually experience" (the
      // full field on a steel range, the dialled mean on a paper bay, matching
      // each one's solve). Vegetation and bullet therefore read the SAME wind,
      // which is the entire justification for wind-driven scenery — see
      // `environment/wind-sway.ts`.
      range?.update?.(dt, st.t, meanWindVec(), windAtForMarkers);
      sightIn?.update?.(dt, st.t, meanWindVec(), windAtForMarkers);
      // Bullet trace (task 1.5b): advance the tracer, or hide it if toggled off.
      if (store().settings.traceEnabled) updateBulletTrace(st.t);
      else hideBulletTrace();
      camera.fov = SCOPE_BASE_FOV_DEG / store().session.scope.magnification;
      camera.updateProjectionMatrix();
      camera.quaternion.copy(aimQuaternion(st.t));
      // Mirage (task 1.7c, D1; toggle added 1.7d; layered port W5; strength
      // preset W6): renders in BOTH modes when on, like the flags — Steady
      // shows the dialed mean's shimmer, Realistic layers the field on top.
      // `mirageStrength` defaults `'medium'` and persists (owner decision
      // 2026-07-31, after the W5 layered port fixed the "doesn't read as
      // directional" complaint and the W6 tuning pass — superseding D9,
      // which had it default off/store-only) — a player can still dial it to
      // `'off'`, which skips the two-pass post-process entirely and renders
      // straight to the screen (also the cheaper path, no offscreen pass to
      // pay for while it's off).
      // Bracket the render call (P13) — this is the only cost that can be told
      // apart from vsync waiting. See `RenderCostMeter` for what it does and does
      // not measure.
      const renderStartMs = performance.now();
      const mirageStrength = store().settings.mirageStrength;
      if (mirageStrength !== 'off') {
        // P16: anchor on whatever's under the crosshair right now (else this
        // bay's lane length) — `dirNow` reuses the quaternion just set above,
        // matching `findAimed`/`findAimedTarget`'s own `(0,0,-1)`-rotate
        // convention.
        const dirNow = new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);
        const aimedM = aimedDistanceNow();
        const anchorDistanceM = aimedM ?? laneLengthFallbackM;
        const { pointYd: intersectionYd, distanceYd } = aimRayIntersection(
          camera.position,
          dirNow,
          aimedM,
          laneLengthFallbackM,
        );
        // P19: the one random pick per layer lives HERE (the renderer), never
        // in the pure model — one uniform-random depth fraction within that
        // slab's own [prevFrac, frac) range along the aim ray, sampled for
        // wind at that world position and converted m/s -> mph (D8's seam).
        // `windAtForMarkers` is the same sampler the flags/socks/vegetation
        // read, so the shimmer drifts with the SAME wind the shot solve does.
        let prevFrac = 0;
        const layerSamplesMph: Vec3[] = MIRAGE_LAYER_FRACS.map((frac) => {
          const sampleFrac = prevFrac + Math.random() * (frac - prevFrac);
          prevFrac = frac;
          const sampleDistanceM = anchorDistanceM * sampleFrac;
          const windMps = windAtForMarkers({
            x: camera.position.x + dirNow.x * sampleDistanceM,
            y: camera.position.y + dirNow.y * sampleDistanceM,
            z: camera.position.z + dirNow.z * sampleDistanceM,
          });
          return { x: mpsToMph(windMps.x), y: mpsToMph(windMps.y), z: mpsToMph(windMps.z) };
        });
        renderSceneWithMirage(scene, camera, {
          dt,
          fovDeg: camera.fov,
          baseFovDeg: SCOPE_BASE_FOV_DEG,
          intersectionYd,
          distanceYd,
          viewPitchRad: viewPitchRad(dirNow.y),
          layerSamplesMph,
          intensityScale: MIRAGE_STRENGTH_SCALE[mirageStrength],
        });
      } else {
        renderer.render(scene, camera);
      }
      renderCost.push(performance.now() - renderStartMs);
      drawReticle();
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
      pendingImpacts.length = 0;
      // Native steel handles (TS-C session lifecycle: marks live until here).
      steelReactions?.dispose();
      steelReactions = null;
      windField?.delete();
      dialUnsub();
      for (const entry of sightInSimCache.values()) entry.sim.delete();
      disposeWindMarkers();
      disposeMirage();
      disposeImpactFx();
      disposeBulletTrace();
      audio.dispose();
      range?.dispose();
      sightIn?.dispose();
      renderer.dispose();
      for (const sim of simCache.values()) sim.delete();
    };
    // `firingPoint` is the ONE thing that rebuilds the world. The effect is
    // otherwise mount-once by design (it owns the renderer, the RAF loop and
    // every native handle), and its cleanup above tears all of that down, so a
    // rebuild is safe. Adding anything else here is almost certainly a mistake.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [firingPoint]);

  // Inspect (D10): when opened, snapshot the engaged target's face canvas (art +
  // splats + centroid) into the overlay canvas, head-on and large. Read-only.
  useEffect(() => {
    if (!inspectOpen) return;
    const dest = inspectCanvasRef.current;
    const src = faceCanvasRef.current();
    if (!dest || !src) return;
    const size = Math.round(Math.min(window.innerWidth, window.innerHeight) * 0.82);
    dest.width = size;
    dest.height = size;
    const ctx = dest.getContext('2d');
    if (ctx) ctx.drawImage(src, 0, 0, size, size);
  }, [inspectOpen]);

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100dvh',
        background: '#000',
        touchAction: 'none',
        overscrollBehavior: 'none',
      }}
    >
      <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }} />
      {/* Reticle overlay (screen-fixed; does not move with the wobble). */}
      <canvas ref={reticleRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
      {/* Circular scope mask (transparent to 40vmin, matching the reticle radius). */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background: 'radial-gradient(circle at center, transparent 0 40vmin, rgba(0,0,0,0.97) 41vmin)',
        }}
      />
      {/* Top-right utility cluster (task 1.8a + 2.2c Loadout; refreshed 2026-07-27).
          Home returns to range select (App resets the run); Loadout opens the 2.2c
          gear-swap overlay (non-destructive — the session survives); Settings opens
          the 2.1d Settings overlay. Only rendered in the real player flow (App
          passes the props). */}
      {(onOpenMenu || onOpenLoadout || onGoHome || onOpenDopeBook) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(8px + env(safe-area-inset-top))',
            right: 'calc(8px + env(safe-area-inset-right))',
            zIndex: 20,
            display: 'flex',
            gap: 6,
          }}
        >
          {onGoHome && (
            <button
              onClick={onGoHome}
              aria-label="Home — range select"
              title="Home — range select"
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#e8eef4',
                background: 'rgba(26,34,44,0.75)',
                border: '1px solid rgba(232,238,244,0.4)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              Home
            </button>
          )}
          {onOpenLoadout && (
            <button
              onClick={onOpenLoadout}
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#e8eef4',
                background: 'rgba(26,34,44,0.75)',
                border: '1px solid rgba(232,238,244,0.4)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              Loadout
            </button>
          )}
          {onOpenDopeBook && (
            <button
              onClick={onOpenDopeBook}
              aria-label="DOPE book"
              title="DOPE book"
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#e8eef4',
                background: 'rgba(26,34,44,0.75)',
                border: '1px solid rgba(232,238,244,0.4)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              DOPE
            </button>
          )}
          {onOpenMenu && (
            <button
              onClick={onOpenMenu}
              style={{
                fontFamily: 'monospace',
                fontSize: 13,
                color: '#e8eef4',
                background: 'rgba(26,34,44,0.75)',
                border: '1px solid rgba(232,238,244,0.4)',
                borderRadius: 6,
                padding: '6px 10px',
                cursor: 'pointer',
                WebkitUserSelect: 'none',
                userSelect: 'none',
              }}
            >
              Settings
            </button>
          )}
        </div>
      )}
      {/* HUD */}
      <div
        style={{
          position: 'absolute',
          top: 8,
          left: 8,
          color: '#e8eef4',
          fontFamily: 'monospace',
          fontSize: 14,
          background: 'rgba(26,34,44,0.75)',
          padding: '6px 10px',
          borderRadius: 6,
          // Defensive cap (task 1.6d): this column has grown a lot across 1.6c/d
          // (turret/wind/commit/score + the DOPE panel); scroll internally rather
          // than push into the HOLD button or off-screen on shorter viewports.
          maxHeight: 'calc(100dvh - 120px)',
          overflowY: 'auto',
        }}
      >
        {/* Units (MIL/MOA), sensitivity, trace, wind realism, marker style, and
            mirage moved to the Settings screen (task 2.1d). This panel keeps the
            in-scene shooting controls: zoom, wobble feel, turret, wind
            environment, commit, and the engagement HUD. `unitsPrimary` still
            drives every readout's display system (set in Settings). */}
        <div>
          {magnification.toFixed(1)}× · {unitsPrimary} · {rangeDef.name}
        </div>
        <label style={{ display: 'block', marginTop: 4 }}>
          zoom ×{magnification.toFixed(1)}{' '}
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.5}
            value={magnification}
            onChange={(e) => useGameStore.getState().setZoom(Number(e.target.value))}
          />
        </label>
        <label style={{ display: 'block' }}>
          wobble{' '}
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            defaultValue={0}
            onChange={(e) => (wobbleAmpRef.current = Number(e.target.value))}
          />
        </label>

        {/* Turret dial (task 1.6c, D4-A solve-only): dialing changes the firing
            solution; the sight picture does not move (Option B is a future task). */}
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
          <div>
            {/* 1/4-MOA clicks (0.25, 0.75, 1.25…) round unevenly at 1 decimal
                (0.25 → "0.3" but 0.5 → "0.5"); 2 decimals keeps every click a
                clean, exact number. MIL's 0.1-mrad clicks are exact at 1. */}
            ELEV {formatAngleForDisplay(elevationRad, unitsPrimary).value.toFixed(unitsPrimary === 'MIL' ? 1 : 2)}{' '}
            {formatAngleForDisplay(elevationRad, unitsPrimary).label}
          </div>
          {/* Coarse (−−/++) sits OUTSIDE fine (−/+) so the pair reads as one
              scale running from big-down to big-up, and a mis-tap lands on the
              adjacent smaller step rather than jumping the wrong way by 2 MIL. */}
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              title={`−${COARSE_LABEL}`}
              onClick={() => {
                dialElevationClicks(-COARSE_CLICKS);
                clickAudioRef.current();
              }}
            >
              −−
            </button>
            <button
              onClick={() => {
                dialElevationClicks(-1);
                clickAudioRef.current();
              }}
            >
              −
            </button>
            <button
              onClick={() => {
                dialElevationClicks(1);
                clickAudioRef.current();
              }}
            >
              +
            </button>
            <button
              title={`+${COARSE_LABEL}`}
              onClick={() => {
                dialElevationClicks(COARSE_CLICKS);
                clickAudioRef.current();
              }}
            >
              ++
            </button>
            <span style={{ opacity: 0.6, fontSize: 11 }}>±{COARSE_LABEL}</span>
          </div>
          <div style={{ marginTop: 4 }}>
            WIND {formatAngleForDisplay(windageRad, unitsPrimary).value.toFixed(unitsPrimary === 'MIL' ? 1 : 2)}{' '}
            {formatAngleForDisplay(windageRad, unitsPrimary).label}
          </div>
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
            <button
              onClick={() => {
                dialWindageClicks(-1);
                clickAudioRef.current();
              }}
            >
              −
            </button>
            <button
              onClick={() => {
                dialWindageClicks(1);
                clickAudioRef.current();
              }}
            >
              +
            </button>
          </div>
        </div>

        {/* Wind control (task 1.6c, D6): 0–20 mph speed slider + 12-o'clock
            direction dial. `directionDeg` is the direction the wind blows FROM
            (WindState convention); the dial shows it as a clock face. Hidden on
            the Test Range (owner request 2026-07-21): it's a sandbox for the
            fundamentals, not an engagement — wind is dialed to calm on load
            (see the effect below) and the controls/flags stay out of the way. */}
        {/* ELR firing line (build spec task 9). A MOVE, not a setting: the low
            line is ground-level for the 50–500 m rimfire ladder, the high line
            stands on the slope's shoulder for the 250–2000 m centrefire one.
            Switching rebuilds the scene and drops any committed target, so it
            sits away from FIRE and the dial cluster to make it hard to hit by
            accident. Only rendered on the ELR range — no other scene has lines. */}
        {isElrRange && (
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
            <div style={{ opacity: 0.8, marginBottom: 4 }}>firing line</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {(['low', 'high'] as const).map((point) => (
                <button
                  key={point}
                  onClick={() => setFiringPoint(point)}
                  disabled={firingPoint === point}
                  style={{
                    flex: 1,
                    padding: '4px 8px',
                    opacity: firingPoint === point ? 1 : 0.65,
                    fontWeight: firingPoint === point ? 700 : 400,
                  }}
                >
                  {point === 'low' ? 'LOW 50–500' : 'HIGH 250–2000'}
                </button>
              ))}
            </div>
          </div>
        )}

        {!isTestRangeHud && (
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
            <div>
              wind {formatSpeedForDisplay(windState.speedMps, unitsPrimary).value.toFixed(unitsPrimary === 'MIL' ? 1 : 0)}{' '}
              {formatSpeedForDisplay(windState.speedMps, unitsPrimary).label}
            </div>
            <input
              type="range"
              min={0}
              max={unitsPrimary === 'MIL' ? mphToMps(20) : 20}
              step={unitsPrimary === 'MIL' ? 0.5 : 1}
              value={formatSpeedForDisplay(windState.speedMps, unitsPrimary).value}
              onChange={(e) => {
                const v = Number(e.target.value);
                setWind({ speedMps: unitsPrimary === 'MIL' ? v : mphToMps(v) });
              }}
              style={{ width: 140 }}
            />
            {/* Wind direction stays clock + degrees regardless of Met/Imp — neither
                is a metric/imperial distinction, so it's not part of the toggle. */}
            <div style={{ marginTop: 4 }}>
              dir {degToClock(windState.directionDeg).toFixed(0)} o'clock / {windState.directionDeg.toFixed(0)}°
            </div>
            <input
              type="range"
              min={1}
              max={12}
              step={1}
              value={degToClock(windState.directionDeg)}
              onChange={(e) => setWind({ directionDeg: clockToDeg(Number(e.target.value)) })}
              style={{ width: 140 }}
            />
            {/* Wind preset picker (task 1.7b, D3): the per-engagement wind
                CHARACTER, an in-scene environment control kept here with the wind
                speed/direction. The Steady/Realistic toggle + marker style + mirage
                moved to the Settings screen (task 2.1d); the picker shows only when
                Realistic is enabled there. */}
            {windRealism === 'realistic' && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, alignItems: 'center' }}>
                <span style={{ opacity: 0.8 }}>preset:</span>
                <select value={windPreset} onChange={(e) => setWindPreset(e.target.value)}>
                  {(availablePresets.length > 0 ? availablePresets : [windPreset]).map((preset) => (
                    <option key={preset} value={preset}>
                      {preset}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        {/* Sight-in bay (task 2.3c2/2.3d): read-the-grid zeroing. Dial the turret
            to centre the group, then Confirm; Clean for a fresh face; Inspect for
            a head-on close-up. */}
        {isSightInHud && (
          <>
          <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
            <div>
              Sight-in —{' '}
              {!activeRifle
                ? 'no rifle selected (Loadout)'
                : (() => {
                    const zr = activeRifle.playerZero?.zeroRangeM;
                    if (zr == null) return 'not zeroed';
                    const z = formatDistanceForDisplay(zr, unitsPrimary);
                    return `zeroed at ${z.value.toFixed(0)} ${z.label}`;
                  })()}
            </div>
            {sightInGroup ? (
              <div>
                group: {sightInGroup.shots} shot{sightInGroup.shots === 1 ? '' : 's'} · 1 square ≈{' '}
                {unitsPrimary === 'MIL'
                  ? `${(0.2 * (100 / sightInGroup.nominalDistance)).toFixed(1)} mil`
                  : `${(100 / sightInGroup.nominalDistance).toFixed(1)} MOA`}{' '}
                @ {sightInGroup.nominalDistance}
              </div>
            ) : (
              <div style={{ opacity: 0.7 }}>fire a group to begin</div>
            )}
            {sightInGroup && sightInGroup.shots > 0 && sightInGroup.shots < 3 && (
              <div style={{ color: '#e8c95a' }}>let the group build — 3+ shots before you trust the centre</div>
            )}
            {windState.speedMps > 0.5 && <div style={{ color: '#e8c95a' }}>zero in calm conditions</div>}
            <div style={{ display: 'flex', gap: 4, marginTop: 4, flexWrap: 'wrap' }}>
              <button onClick={() => confirmZeroRef.current()} disabled={!activeRifle || !sightInGroup || !canZero}>
                Confirm zero
              </button>
              <button onClick={() => setInspectOpen(true)} disabled={!sightInGroup}>
                Inspect
              </button>
              <button onClick={() => cleanRef.current()}>Clean target</button>
            </div>
          </div>
          {/* Chronograph (task 2.4e, D10): also available on the paper zeroing bay
              (owner 2026-07-27) — measuring MV belongs with load development and
              zeroing. The paper fire path already logs readings when deployed. */}
          <ChronoPanel />
          </>
        )}

        {/* Steel range engagement HUD — hidden on the sight-in bay. */}
        {!isSightInHud && (
          <>
            {/* Commit / target select (task 1.6c, D2): engage the plate under the
                crosshair — refills the shot budget for that plate. Not shown on
                the Test Range sandbox (auto-committed, unlimited budget). */}
            {!isTestRangeHud && (
              <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
                <div>
                  target:{' '}
                  {currentTarget
                    ? `#${currentTarget.plateInstanceId} @ ${formatDistanceForDisplay(currentTarget.distanceM, unitsPrimary).value.toFixed(0)} ${formatDistanceForDisplay(currentTarget.distanceM, unitsPrimary).label}`
                    : 'none committed'}
                </div>
                {/* Mach-state marking (task 10). Nothing renders when the round
                    arrives supersonic — the common case should be silent, so the
                    marking means something when it appears. Amber for transonic,
                    red for subsonic, matching the DOPE card's band colours. */}
                {currentTarget && machState && (
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 11,
                      color: machState.startsWith('SUBSONIC') ? '#e88' : '#e8c95a',
                    }}
                  >
                    {machState}
                  </div>
                )}
                <button onClick={() => commitRef.current()} style={{ marginTop: 4 }}>
                  Commit
                </button>
              </div>
            )}

            {/* Engagement HUD (task 1.6c, D2/D3): shots remaining, the last spotter
                call, and running score. Shots-remaining is hidden on the Test Range
                sandbox — there is no limit there. */}
            <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
              {/* Only when the budget is FINITE. The default is now unlimited
                  (owner 2026-07-29), and "shots left: Infinity" reads as broken —
                  the same reasoning that hid it on the Test Range. A range that
                  sets a finite budget in the registry still shows its counter. */}
              {!isTestRangeHud && Number.isFinite(shotBudget) && (
                <div>shots left: {shotBudget}</div>
              )}
              <div>
                last call:{' '}
                {lastCall
                  ? (() => {
                      const off = formatOffsetForDisplay(lastCall.offsetM, unitsPrimary);
                      return `${lastCall.hit ? 'HIT' : 'MISS'} ${lastCall.clock} o'clock (${off.value.toFixed(unitsPrimary === 'MIL' ? 0 : 1)} ${off.label})`;
                    })()
                  : '—'}
              </div>
              {/* Effective-wind readout (task 1.7b, D6): what the last shot's
                  bullet actually saw once gusts are in play — the local mean
                  speed/direction sampled along its path, plus what it cost in
                  windage. Realistic mode only; hidden until a shot's been fired. */}
              {windRealism === 'realistic' && lastEffectiveWind && (
                <div>
                  wind seen:{' '}
                  {(() => {
                    const spd = formatSpeedForDisplay(lastEffectiveWind.speedMps, unitsPrimary);
                    const clock = formatClockPosition(degToClock(lastEffectiveWind.directionDeg));
                    const off = formatAngleForDisplay(Math.abs(lastEffectiveWind.windOffsetRad), unitsPrimary);
                    const side = lastEffectiveWind.windOffsetRad < 0 ? 'L' : 'R';
                    return `~${spd.value.toFixed(0)} ${spd.label} @ ${clock} → ${off.value.toFixed(unitsPrimary === 'MIL' ? 1 : 2)} ${off.label} ${side}`;
                  })()}
                </div>
              )}
              <div>
                first-round: {score.firstRoundHits}/{score.targetsEngaged} · hits: {score.hits}/{score.shotsFired}
              </div>
            </div>

            {/* DOPE side panel (task 1.6d, D3): closed by default, stacked in this
                same left-margin column so it can never overlap the scope glass or
                the dial/fire controls — see DopePanel.tsx. */}
            <DopePanel onOpenBook={onOpenDopeBook} />

            {/* Chronograph (task 2.4e, D10): deploy to log a measured MV on every
                shot; shows measured avg/SD/ES vs the box MV. Same stacked column. */}
            <ChronoPanel />
          </>
        )}
      </div>
      {/* HOLD (breath) — left thumb */}
      <div
        style={{
          position: 'absolute',
          left: 'calc(24px + env(safe-area-inset-left))',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
          alignItems: 'center',
        }}
      >
        <div style={{ width: 84, height: 8, background: 'rgba(26,34,44,0.8)', borderRadius: 4, overflow: 'hidden' }}>
          <div ref={breathBarRef} style={{ height: '100%', width: '100%', background: '#4a9' }} />
        </div>
        <button
          onPointerDown={() => (holdingRef.current = true)}
          onPointerUp={() => (holdingRef.current = false)}
          onPointerLeave={() => (holdingRef.current = false)}
          onPointerCancel={() => (holdingRef.current = false)}
          onContextMenu={(e) => e.preventDefault()}
          style={{
            width: 84,
            height: 84,
            borderRadius: '50%',
            border: '3px solid #e8eef4',
            background: 'rgba(40,110,170,0.85)',
            color: '#fff',
            fontFamily: 'monospace',
            fontSize: 15,
            touchAction: 'none',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        >
          HOLD
        </button>
      </div>
      <button
        onPointerDown={(e) => {
          e.preventDefault();
          if (!outOfRounds) fireRef.current();
        }}
        onContextMenu={(e) => e.preventDefault()}
        disabled={outOfRounds}
        style={{
          touchAction: 'none',
          WebkitUserSelect: 'none',
          userSelect: 'none',
          position: 'absolute',
          right: 'calc(24px + env(safe-area-inset-right))',
          bottom: 'calc(24px + env(safe-area-inset-bottom))',
          width: 84,
          height: 84,
          borderRadius: '50%',
          border: '3px solid #e8eef4',
          background: outOfRounds ? 'rgba(120,120,120,0.6)' : 'rgba(180,40,40,0.85)',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: outOfRounds ? 13 : 16,
        }}
      >
        {outOfRounds ? 'EMPTY' : 'FIRE'}
      </button>

      {/* DIAGNOSTIC READOUTS — bottom-centre, stacked.
          Every corner is already taken: the HUD panel is top-left (which is where
          these first landed, on top of the range name and zoom slider), the menu
          buttons are top-right, the dial cluster bottom-left and FIRE bottom-right.
          The centre strip along the bottom is the only clear space, and it sits
          under the sight picture rather than across it. `pointerEvents: none` so
          neither readout can swallow a tap meant for the canvas. */}
      <div
        style={{
          position: 'absolute',
          left: '50%',
          transform: 'translateX(-50%)',
          bottom: 'calc(8px + env(safe-area-inset-bottom))',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 4,
          pointerEvents: 'none',
        }}
      >
        {fireBlocked && (
          <div
            style={{
              padding: '4px 10px',
              borderRadius: 6,
              background: 'rgba(90,0,0,0.65)',
              color: '#ffd0d0',
              fontSize: 12,
              maxWidth: '70vw',
              textAlign: 'center',
            }}
          >
            FIRE blocked: {fireBlocked}
          </div>
        )}
        {sceneCost && perf && (
          <div
            style={{
              padding: '3px 9px',
              borderRadius: 5,
              background: 'rgba(0,0,0,0.5)',
              color:
                headroomVerdict(sceneCost.renderMs, perf.ms) === 'over'
                  ? '#ff9b9b'
                  : headroomVerdict(sceneCost.renderMs, perf.ms) === 'tight'
                    ? '#ffd79b'
                    : '#bfe6bf',
              font: '12px/1.3 ui-monospace, Menlo, monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {`render ${sceneCost.renderMs.toFixed(1)} ms \u00b7 ${headroomVerdict(sceneCost.renderMs, perf.ms)} \u00b7 ${sceneCost.drawCalls} calls \u00b7 ${(sceneCost.triangles / 1000).toFixed(0)}k tris \u00b7 ${sceneCost.trees} trees`}
          </div>
        )}
        {shotMs && (
          <div
            style={{
              padding: '3px 9px',
              borderRadius: 5,
              background: 'rgba(0,0,0,0.5)',
              color: '#cfd8ff',
              font: '12px/1.3 ui-monospace, Menlo, monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {`shot: ${shotMs}`}
          </div>
        )}
        {perf && (
          <div
            style={{
              padding: '3px 9px',
              borderRadius: 5,
              background: 'rgba(0,0,0,0.5)',
              color: perf.ms > 33 ? '#ff9b9b' : perf.ms > FRAME_BUDGET_MS ? '#ffd79b' : '#bfe6bf',
              font: '12px/1.3 ui-monospace, Menlo, monospace',
              whiteSpace: 'nowrap',
            }}
          >
            {`${perf.fps.toFixed(0)} fps \u00b7 ${perf.ms.toFixed(1)} ms \u00b7 worst ${perf.worst.toFixed(1)} \u00b7 depth ${perf.bits || '?'}-bit`}
          </div>
        )}
      </div>

      {outOfRounds && (
        <div
          style={{
            position: 'absolute',
            right: 'calc(24px + env(safe-area-inset-right))',
            bottom: 'calc(112px + env(safe-area-inset-bottom))',
            width: 84,
            textAlign: 'center',
            fontFamily: 'monospace',
            fontSize: 10,
            color: '#e8c95a',
            WebkitUserSelect: 'none',
            userSelect: 'none',
          }}
        >
          out of rounds
        </div>
      )}
      {/* Inspect (D10): a read-only head-on close-up of the engaged target
          (grid + splats + group centroid) — dismiss to return to the scope. */}
      {inspectOpen && (
        <div
          onClick={() => setInspectOpen(false)}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 30,
            background: 'rgba(10,14,18,0.92)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12,
          }}
        >
          <canvas
            ref={inspectCanvasRef}
            style={{ maxWidth: '82vmin', maxHeight: '82vmin', background: '#fff', borderRadius: 4 }}
          />
          <button
            onClick={() => setInspectOpen(false)}
            style={{
              fontFamily: 'monospace',
              fontSize: 15,
              color: '#e8eef4',
              background: 'rgba(40,110,170,0.85)',
              border: '2px solid #e8eef4',
              borderRadius: 8,
              padding: '10px 20px',
              cursor: 'pointer',
            }}
          >
            Close
          </button>
        </div>
      )}
    </div>
  );
}
