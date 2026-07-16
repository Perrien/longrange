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
import { RangeScene, PLATE_THICKNESS_M, setChainInstance } from '../range/RangeScene';
import { RANGE_A_GROUND } from '../range/range-a-config';
import { WIND_MARKERS, type MarkerStyle } from '../range/wind-markers-config';
import { initWindMarkers, updateWindMarkers, disposeWindMarkers } from './WindMarkers';
import { initMirage, renderSceneWithMirage, disposeMirage, MIRAGE_REFERENCE_DISTANCE_M } from './Mirage';
import { useGameStore, ZOOM_MIN, ZOOM_MAX, MIL_CLICK_RAD, MOA_CLICK_RAD, DEFAULT_WIND_PRESET } from '../state/store';
import { SCOPE_BASE_FOV_DEG, fovRadForMag } from './scope-projection';
import { buildReticle, MAJOR_HALF_PX } from './reticle';
import { solveTrajectory, spinRateFromTwist, speedOfSound, type AtmosphereInput, type Load } from '../engine-bridge';
import { AudioManager } from '../audio/audio-manager';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { createScatterSimulator, type ScatterSimulator } from '../engine-bridge/match-sim';
import { createSteelReaction, type SteelReaction } from '../engine-bridge/steel-target';
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
import type { BtkModule, TrajectoryTable } from '../engine-bridge/types';
import { resolveShot, type ShotPlate } from '../game/shot';
import { windToVec, averageEffectiveWind } from '../game/firing-solution';
import { superposeWind, gustScaleFor } from '../game/wind-superposition';
import { GUST_REFERENCE_MPS } from '../game/wind-field-config';
import { callImpact, type ImpactCall } from '../game/impact-call';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, SCOPE_ZERO_RANGE_M, SIGHT_HEIGHT_M } from '../game/loads';
import {
  clockToDeg,
  degToClock,
  mphToMps,
  systemLabel,
  formatAngleForDisplay,
  formatSpeedForDisplay,
  formatDistanceForDisplay,
  formatOffsetForDisplay,
  formatClockPosition,
} from '../units';
import { DopePanel } from './DopePanel';

const EYE_HEIGHT_M = 1.6; // matches the Range A look-around

// A low miss resolves on the far target plane BELOW ground level; place its dust
// where the round actually lands by projecting the sight ray onto the grass.
const GROUND_Y_M = 0; // RangeScene grass lane height
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
const RECOIL_PITCH_VEL = 0.05; // muzzle-rise impulse (~3 mrad peak)
const RECOIL_YAW_VEL = 0.012; // random sideways kick
const RESIDUAL_SHIFT_RAD = 0.0001; // ±0.1 mrad POA shift (follow-through)
const HOLD_STEADY_FACTOR = 0.15; // wobble multiplier during a good breath hold
const BREATH_DEPLETE_S = 10;
const BREATH_RECOVER_S = 5;
const BREATH_COMFORT = 0.3; // below this remaining fraction the hold degrades
const BREATH_DEBT_FACTOR = 1.5; // wobble multiplier out of air (oxygen debt)

export function ScopeView({ onExit }: { onExit?: () => void } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLCanvasElement>(null);
  const breathBarRef = useRef<HTMLDivElement>(null);

  // Reactive slices for the HUD / React controls.
  const magnification = useGameStore((s) => s.session.scope.magnification);
  const sensitivity = useGameStore((s) => s.settings.sensitivity);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const setUnitsPrimary = useGameStore((s) => s.setUnitsPrimary);
  const setSensitivity = useGameStore((s) => s.setSensitivity);
  const traceEnabled = useGameStore((s) => s.settings.traceEnabled);
  const setTraceEnabled = useGameStore((s) => s.setTraceEnabled);

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

  // Menu → range select (task 1.8a, D6). Only wired in the real player flow
  // (App passes onExit); the dev tab-strip renders <ScopeView /> with no prop,
  // so the button below is guarded by `onExit &&`. Confirm before discarding a
  // committed run; return instantly otherwise.
  const onMenu = () => {
    if (currentTarget != null) {
      if (!window.confirm('Return to range select? Your current run resets.')) return;
    }
    onExit?.(); // App wires this to resetSession() + setView('rangeSelect')
  };

  // Wind realism (task 1.7a, D1): Steady keeps 1.6's exact deterministic mean;
  // Realistic layers the curl-noise field on top (D2/D3b).
  const windRealism = useGameStore((s) => s.settings.windRealism);
  const setWindRealism = useGameStore((s) => s.setWindRealism);
  const windPreset = useGameStore((s) => s.session.windPreset);
  const setWindPreset = useGameStore((s) => s.setWindPreset);
  const windMarkerStyle = useGameStore((s) => s.settings.windMarkerStyle);
  const setWindMarkerStyle = useGameStore((s) => s.setWindMarkerStyle);
  // Mirage on/off (task 1.7c/1.7d): defaults OFF — owner feedback, 2026-07-15,
  // parked pending a clearer directional read. Store-only, like traceEnabled.
  const mirageEnabled = useGameStore((s) => s.settings.mirageEnabled);
  const setMirageEnabled = useGameStore((s) => s.setMirageEnabled);
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
  // PROGRESS deferred obs; owner-tuned default 0.75 from the 0.9 spike).
  const wobbleAmpRef = useRef(0.75);
  // Breath-hold flag: shared between the HOLD button (JSX) and the render loop.
  const holdingRef = useRef(false);

  const fireRef = useRef<() => void>(() => {});
  // Turret click sound (task 1.6c, D5): the ± buttons call this; it reaches
  // into the imperative `audio` instance created inside the effect below.
  const clickAudioRef = useRef<() => void>(() => {});
  // Commit (task 1.6c, D2): the Commit button calls this; it reaches into the
  // imperative aim state to find the plate under the crosshair right now.
  const commitRef = useRef<() => void>(() => {});

  useEffect(() => {
    const canvas = canvasRef.current!;
    const reticleCanvas = reticleRef.current!;
    const rctx = reticleCanvas.getContext('2d')!;
    const store = useGameStore.getState; // live reads inside the imperative loop

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const range = new RangeScene(scene);
    // Impact marks + hit/miss dust pools (task 1.5c) live in the same scene.
    initImpactFx(scene);
    // In-scope bullet trace (task 1.5b): a tracer comet flown per shot.
    initBulletTrace(scene);
    // Wind flags/socks (task 1.7b): built once at the store's CURRENT style;
    // `updateWindMarkers` rebuilds lazily if the player switches style later.
    initWindMarkers(scene, WIND_MARKERS, store().settings.windMarkerStyle);
    // Mirage shimmer (task 1.7c): a post-process pass between this world render
    // and the reticle's separate 2D overlay canvas (untouched by this).
    initMirage(renderer);

    const camera = new THREE.PerspectiveCamera(SCOPE_BASE_FOV_DEG / magnification, 1, 0.5, 3000);
    camera.position.set(0, EYE_HEIGHT_M, 0);

    // --- firing solution plumbing (task 1.4c) --------------------------------
    // Load the engine once; until it resolves, FIRE just recoils. The per-shot
    // scatter hit-sim (engine) and the deterministic-center solve are cached per
    // engagement (target range × wind). One fixed match load for Increment 1.
    const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
    const solveLoad: Load = {
      ...gameLoad.load,
      spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
    };
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
    const solveCache = new Map<string, { dropM: number; windageM: number; velocityMps: number; timeOfFlightS: number }>();
    // Constant ZERO-wind solve per range (task 1.7a): the no-wind baseline that
    // still captures spin drift, so "fieldSolve − zeroSolve" isolates the
    // field's own gust contribution instead of double-counting spin drift (D2).
    const zeroSolveCache = new Map<number, { dropM: number; windageM: number }>();
    const simCache = new Map<number, ScatterSimulator>();
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

    // Live reactive-steel physics for currently-swinging plates (task 1.5a). One
    // C++ SteelTarget per struck plate instance, reused for repeat hits, deleted
    // when it settles. `rest` is the plate's static instance matrix (restored on
    // settle); `baseQuat`/`scale` are its face-the-shooter rotation + size.
    const reactions = new Map<
      number,
      { reaction: SteelReaction; rest: THREE.Matrix4; baseQuat: THREE.Quaternion; scale: THREE.Vector3 }
    >();
    // Impacts land at the target only after the bullet's time of flight. The plate
    // swing + dust puff are queued here at FIRE and run when the loop clock reaches
    // their due time, so they coincide with the tracer arriving (not the trigger
    // pull). Drained in the render loop.
    const pendingImpacts: { dueAt: number; run: () => void }[] = [];

    // The ordinary constant-mean solve — UNCHANGED from 1.6 (cached per
    // range|speed|dir). This is exactly what `solveAt` returns in Steady mode.
    function meanSolveAt(rangeM: number, wind: { speedMps: number; directionDeg: number }) {
      const key = `${rangeM}|${wind.speedMps}|${wind.directionDeg}`;
      let s = solveCache.get(key);
      if (!s) {
        // Read the last row of the fine trace table (shared, cached) rather than a
        // second solve — one trajectory simulate per engagement keeps the FIRE
        // gesture light (a long main-thread stall can interrupt iOS audio).
        const table = traceTableAt(rangeM, wind);
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
          zeroRangeM: SCOPE_ZERO_RANGE_M,
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
    function solveAt(rangeM: number, wind: { speedMps: number; directionDeg: number }): SolveResult {
      const mean = meanSolveAt(rangeM, wind);
      if (store().settings.windRealism !== 'realistic') return mean;
      const field = ensureWindField();
      if (!field) return mean; // engine/field not ready yet — fall back to the mean

      const zero = zeroWindSolveAt(rangeM);
      const meanVec = windToVec(wind.speedMps, wind.directionDeg);
      const fieldTable = solveTrajectoryField(engineModule!, solveLoad, ISA_ATMOSPHERE, meanVec, field, {
        zeroRangeM: SCOPE_ZERO_RANGE_M,
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
      const eye = { x: 0, y: EYE_HEIGHT_M, z: 0 };
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
    function simAt(rangeM: number): ScatterSimulator {
      let sim = simCache.get(rangeM);
      if (!sim) {
        sim = createScatterSimulator(engineModule!, gameLoad.load, gameLoad.dispersion, rangeM, ISA_ATMOSPHERE, gameLoad.twistM);
        simCache.set(rangeM, sim);
      }
      return sim;
    }
    function traceTableAt(rangeM: number, wind: { speedMps: number; directionDeg: number }): TrajectoryTable {
      const key = `${rangeM}|${wind.speedMps}|${wind.directionDeg}`;
      let table = traceTableCache.get(key);
      if (!table) {
        const windVec = windToVec(wind.speedMps, wind.directionDeg);
        table = solveTrajectory(engineModule!, solveLoad, ISA_ATMOSPHERE, windVec, {
          zeroRangeM: SCOPE_ZERO_RANGE_M,
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
    function findAimed(): { dir: THREE.Vector3; plate: (typeof range.plates)[number] } | null {
      const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t));
      if (dir.z >= -1e-3 || range.plates.length === 0) return null;
      let aimed = range.plates[0];
      let aimedD = Infinity;
      for (const plate of range.plates) {
        const tt = -plate.distanceM / dir.z;
        const ax = camera.position.x + dir.x * tt;
        const ay = camera.position.y + dir.y * tt;
        const d = Math.hypot(ax - plate.position.x, ay - plate.position.y);
        if (d < aimedD) {
          aimedD = d;
          aimed = plate;
        }
      }
      return { dir, plate: aimed };
    }

    // Commit (task 1.6c, D2): read the plate under the crosshair right now and
    // engage it — refills the shot budget, resets dials + shot count, bumps
    // score.targetsEngaged (state/store.ts commitTarget).
    commitRef.current = () => {
      const found = findAimed();
      if (found) store().commitTarget(found.plate.instanceId, found.plate.distanceM);
    };

    // FIRE — resolve the shot from the aim, then recoil.
    fireRef.current = () => {
      // Gate on budget (task 1.6c, D2): ends the 1.4c dry-fire allowance — no
      // shot, no recoil, once the budget for the current target is spent.
      if (store().session.shotBudget <= 0) return;
      // Sample the aim BEFORE this shot's recoil kick (0.9: the bullet leaves as
      // the trigger breaks). Wobble is part of the aim; the kick below is the
      // consequence, applied after the shot is resolved.
      if (engineModule) {
        const found = findAimed();
        if (found) {
          const { dir, plate: aimed } = found;
          const rangeM = aimed.distanceM;
          const wind = store().session.wind;
          const scope = store().session.scope;
          const solved = solveAt(rangeM, wind);
          // Effective-wind readout (task 1.7b, D6): undefined in Steady mode
          // (or before the field's loaded), which the HUD reads as "nothing
          // new to show" and just displays the dialed mean instead.
          setLastEffectiveWind(solved.effectiveWind ?? null);
          const rackPlates: ShotPlate[] = range.plates
            .filter((pl) => pl.distanceM === rangeM)
            .map((pl) => ({
              instanceId: pl.instanceId,
              position: { x: pl.position.x, y: pl.position.y },
              diameterM: pl.diameterM,
            }));
          const result = resolveShot({
            eye: { x: camera.position.x, y: camera.position.y, z: camera.position.z },
            aimDir: { x: dir.x, y: dir.y, z: dir.z },
            dial: { elevRad: scope.elevationRad, windRad: scope.windageRad },
            solve: solved,
            distanceM: rangeM,
            scatter: simAt(rangeM).fire(),
            plates: rackPlates,
            bulletDiameterM: gameLoad.load.diameterM,
          });
          store().recordShot(result);
          store().decrementBudget();

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
                  let entry = reactions.get(hitPlate.instanceId);
                  if (!entry) {
                    // Non-null assertion (matches simAt's engineModule! above): this
                    // closure is only queued from inside the `if (engineModule && …)`
                    // guard, and engineModule is never reset to null once loaded — TS
                    // just can't carry that narrowing across the deferred closure.
                    const reaction = createSteelReaction(engineModule!, {
                      diameterM: hitPlate.diameterM,
                      thicknessM: PLATE_THICKNESS_M,
                      position: { x: hitPlate.position.x, y: hitPlate.position.y, z: hitPlate.position.z },
                      beamHeightM: hitPlate.beamHeightM,
                    });
                    const rest = new THREE.Matrix4();
                    range.plateMesh.getMatrixAt(hitPlate.instanceId, rest);
                    const baseQuat = new THREE.Quaternion();
                    const scale = new THREE.Vector3();
                    rest.decompose(new THREE.Vector3(), baseQuat, scale);
                    entry = { reaction, rest: rest.clone(), baseQuat, scale };
                    reactions.set(hitPlate.instanceId, entry);
                  }
                  entry.reaction.strike(impactWorld, impactVel, gameLoad.load.massKg, gameLoad.load.diameterM);
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
          const impactEnergyJ = 0.5 * gameLoad.load.massKg * solved.velocityMps * solved.velocityMps;
          playShotAudio(result.hitPlateId != null, soundDistanceM, impactEnergyJ, timeOfFlightS);

          // Impact FX (task 1.5c): a dust puff on every shot — metallic on a
          // steel hit, brown on a miss. A low miss resolves BELOW the ground on
          // the far target plane (underground → occluded by the grass), so
          // project it down the sight ray onto the grass in front, where the
          // round actually kicks up dirt. Deferred to arrival like the steel swing.
          let fxX = result.impact.x;
          let fxY = result.impact.y;
          let fxZ = impactZ;
          if (result.hitPlateId == null && fxY < GROUND_Y_M) {
            const t = (GROUND_Y_M - eyeY) / (fxY - eyeY);
            fxX = eyeX + t * (fxX - eyeX);
            fxZ = eyeZ + t * (fxZ - eyeZ);
            fxY = GROUND_Y_M + GROUND_PUFF_LIFT_M;
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
              traceTableAt(rangeM, wind),
              { x: eyeX, y: eyeY, z: eyeZ },
              result.impact,
              rangeM,
            );
            launchBulletTrace(path, st.t);
          }
        }
      }
      // Recoil kick + POA residual (feel; ported verbatim from 0.9).
      st.dist.vp -= RECOIL_PITCH_VEL; // muzzle rise (view kicks up through the negated Euler)
      st.dist.vy += (Math.random() * 2 - 1) * RECOIL_YAW_VEL;
      st.pitch += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
      st.yaw += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
    };

    // ---- reticle overlay (redraws only when zoom / size / unit change) ------
    let lastReticleKey = '';
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
      const geo = buildReticle(unit, fovRadForMag(mag), h, radiusPx);

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
    // Reused scratch for the reactive-steel pose→matrix composition (no per-frame
    // allocation).
    const reactionMat = new THREE.Matrix4();
    const reactionQuat = new THREE.Quaternion();
    const reactionPos = new THREE.Vector3();
    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      st.t += dt;
      last = now;
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
      // Reactive steel (task 1.5a): advance each swinging plate's C++ physics and
      // mirror its pose into the shared plate InstancedMesh; retire on settle.
      if (reactions.size > 0) {
        for (const [id, entry] of reactions) {
          entry.reaction.step(dt);
          const pose = entry.reaction.getPose();
          reactionPos.set(pose.position.x, pose.position.y, pose.position.z);
          // Steel orientation (relative to the world-aligned rest frame) composed
          // onto the plate's face-the-shooter rotation, at the plate's scale.
          reactionQuat.set(pose.quaternion.x, pose.quaternion.y, pose.quaternion.z, pose.quaternion.w).multiply(entry.baseQuat);
          reactionMat.compose(reactionPos, reactionQuat, entry.scale);
          range.plateMesh.setMatrixAt(id, reactionMat);
          // Redraw this plate's two chains so they track the swing (task 1.5c).
          const chains = entry.reaction.getChains();
          for (let ci = 0; ci < chains.length; ci++) {
            setChainInstance(range.chainMesh, id * 2 + ci, chains[ci].attach, chains[ci].fixed);
          }
          if (!entry.reaction.isMoving()) {
            range.plateMesh.setMatrixAt(id, entry.rest); // snap back to rest
            for (let ci = 0; ci < 2; ci++) {
              range.chainMesh.setMatrixAt(id * 2 + ci, range.chainRest[id * 2 + ci]);
            }
            entry.reaction.delete();
            reactions.delete(id);
          }
        }
        range.plateMesh.instanceMatrix.needsUpdate = true;
        range.chainMesh.instanceMatrix.needsUpdate = true;
      }
      // Wind field (task 1.7a): advance the live curl-noise field's clock once
      // per frame while in Realistic mode (monotonic — never rewound). Built
      // lazily by `ensureWindField()` the first time it's needed.
      if (store().settings.windRealism === 'realistic') {
        const field = ensureWindField();
        field?.advance(st.t);
      }
      // Wind flags/socks (task 1.7b): read the live local wind at each marker
      // and yaw/droop/flutter accordingly (Steady mode just shows the dialed
      // mean everywhere, since `currentWindAt` returns it unchanged there).
      updateWindMarkers(dt, st.t, store().settings.windMarkerStyle, currentWindAt);
      // Impact FX (task 1.5c): grow/fade dust puffs and recycle finished ones.
      updateImpactFx(dt);
      // Bullet trace (task 1.5b): advance the tracer, or hide it if toggled off.
      if (store().settings.traceEnabled) updateBulletTrace(st.t);
      else hideBulletTrace();
      camera.fov = SCOPE_BASE_FOV_DEG / store().session.scope.magnification;
      camera.updateProjectionMatrix();
      camera.quaternion.copy(aimQuaternion(st.t));
      // Mirage (task 1.7c, D1; toggle added 1.7d): renders in BOTH modes when
      // on, like the flags — Steady shows the dialed mean's shimmer,
      // Realistic layers the field on top. Sampled near the reference depth
      // the shimmer's feature size assumes. Defaults OFF (owner feedback,
      // 2026-07-15: the boil reads, but the crosswind DIRECTION doesn't yet)
      // — when off, skip the two-pass post-process entirely and render
      // straight to the screen, same as before 1.7c existed (also the
      // cheaper path, no offscreen pass to pay for while it's parked).
      if (store().settings.mirageEnabled) {
        const mirageWind = currentWindAt({ x: 0, y: EYE_HEIGHT_M, z: -MIRAGE_REFERENCE_DISTANCE_M });
        renderSceneWithMirage(scene, camera, {
          dt,
          fovDeg: camera.fov,
          baseFovDeg: SCOPE_BASE_FOV_DEG,
          wind: { x: mirageWind.x, z: mirageWind.z },
        });
      } else {
        renderer.render(scene, camera);
      }
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
      for (const entry of reactions.values()) entry.reaction.delete();
      reactions.clear();
      windField?.delete();
      disposeWindMarkers();
      disposeMirage();
      disposeImpactFx();
      disposeBulletTrace();
      audio.dispose();
      range.dispose();
      renderer.dispose();
      for (const sim of simCache.values()) sim.delete();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
      {/* Menu → range select (task 1.8a, D6). Top-RIGHT, not top-left: the HUD
          panel below occupies top-left. Unobtrusive utility control, same
          monospace HUD language. Only rendered in the real player flow. */}
      {onExit && (
        <button
          onClick={onMenu}
          style={{
            position: 'absolute',
            top: 'calc(8px + env(safe-area-inset-top))',
            right: 'calc(8px + env(safe-area-inset-right))',
            zIndex: 20,
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
          Menu
        </button>
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
        {/* Met/Imp unit toggle (owner-requested improvement, 2026-07-15): the
            single source of truth for every readout in this panel + the DOPE
            panel + the in-scope reticle graduations (unchanged — it already
            read `unitsPrimary`). MIL/Metric and MOA/Imperial share the same
            underlying store field; nothing new was added to the store. */}
        <div style={{ display: 'flex', gap: 2, marginBottom: 6 }}>
          <button
            onClick={() => setUnitsPrimary('MIL')}
            style={{ fontWeight: unitsPrimary === 'MIL' ? 'bold' : 'normal', opacity: unitsPrimary === 'MIL' ? 1 : 0.6 }}
          >
            Met
          </button>
          <button
            onClick={() => setUnitsPrimary('MOA')}
            style={{ fontWeight: unitsPrimary === 'MOA' ? 'bold' : 'normal', opacity: unitsPrimary === 'MOA' ? 1 : 0.6 }}
          >
            Imp
          </button>
        </div>
        <div>
          {magnification.toFixed(1)}× · {systemLabel(unitsPrimary)} · Range A
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
          sens ×{sensitivity.toFixed(2)}{' '}
          <input type="range" min={0.3} max={3} step={0.05} value={sensitivity} onChange={(e) => setSensitivity(Number(e.target.value))} />
        </label>
        <label style={{ display: 'block' }}>
          wobble{' '}
          <input
            type="range"
            min={0}
            max={2}
            step={0.05}
            defaultValue={0.75}
            onChange={(e) => (wobbleAmpRef.current = Number(e.target.value))}
          />
        </label>
        <button onClick={() => setTraceEnabled(!traceEnabled)} style={{ marginTop: 4 }}>
          trace: {traceEnabled ? 'on' : 'off'}
        </button>

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
          <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
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
            (WindState convention); the dial shows it as a clock face. */}
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
          {/* Wind realism (task 1.7a D1 toggle; 1.7b D3 adds the raw-preset
              picker in the same spot). Steady keeps 1.6's exact deterministic
              mean; Realistic layers the curl-noise field on top and exposes
              which BTK preset drives it. */}
          <div style={{ marginTop: 6 }}>
            <button onClick={() => setWindRealism(windRealism === 'steady' ? 'realistic' : 'steady')}>
              wind: {windRealism === 'steady' ? 'Steady' : 'Realistic'}
            </button>
            {windRealism === 'realistic' && (
              <select value={windPreset} onChange={(e) => setWindPreset(e.target.value)} style={{ marginLeft: 6 }}>
                {(availablePresets.length > 0 ? availablePresets : [windPreset]).map((preset) => (
                  <option key={preset} value={preset}>
                    {preset}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Wind marker style (task 1.7b step 1): flags/socks/both down the
              lane — cosmetic only, doesn't touch the ballistics. */}
          <div style={{ marginTop: 4, display: 'flex', gap: 4, alignItems: 'center' }}>
            <span style={{ opacity: 0.8 }}>markers:</span>
            {(['flag', 'sock', 'both'] as MarkerStyle[]).map((style) => (
              <button
                key={style}
                onClick={() => setWindMarkerStyle(style)}
                style={{
                  fontWeight: windMarkerStyle === style ? 'bold' : 'normal',
                  opacity: windMarkerStyle === style ? 1 : 0.6,
                }}
              >
                {style}
              </button>
            ))}
          </div>

          {/* Mirage toggle (task 1.7c/1.7d): defaults OFF — parked pending a
              clearer directional read (owner feedback, 2026-07-15). */}
          <div style={{ marginTop: 4 }}>
            <button onClick={() => setMirageEnabled(!mirageEnabled)}>mirage: {mirageEnabled ? 'on' : 'off'}</button>
          </div>
        </div>

        {/* Commit / target select (task 1.6c, D2): engage the plate under the
            crosshair — refills the shot budget for that plate. */}
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
          <div>
            target:{' '}
            {currentTarget
              ? `#${currentTarget.plateInstanceId} @ ${formatDistanceForDisplay(currentTarget.distanceM, unitsPrimary).value.toFixed(0)} ${formatDistanceForDisplay(currentTarget.distanceM, unitsPrimary).label}`
              : 'none committed'}
          </div>
          <button onClick={() => commitRef.current()} style={{ marginTop: 4 }}>
            Commit
          </button>
        </div>

        {/* Engagement HUD (task 1.6c, D2/D3): shots remaining, the last spotter
            call, and running score. */}
        <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
          <div>shots left: {shotBudget}</div>
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
        <DopePanel />
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
          fireRef.current();
        }}
        onContextMenu={(e) => e.preventDefault()}
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
          background: 'rgba(180,40,40,0.85)',
          color: '#fff',
          fontFamily: 'monospace',
          fontSize: 16,
        }}
      >
        FIRE
      </button>
    </div>
  );
}
