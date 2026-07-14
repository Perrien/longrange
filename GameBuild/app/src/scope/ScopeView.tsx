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

import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { RangeScene, PLATE_THICKNESS_M } from '../range/RangeScene';
import { useGameStore, ZOOM_MIN, ZOOM_MAX } from '../state/store';
import { SCOPE_BASE_FOV_DEG, fovRadForMag } from './scope-projection';
import { buildReticle, MAJOR_HALF_PX } from './reticle';
import { solveTrajectory, spinRateFromTwist, speedOfSound, type AtmosphereInput, type Load } from '../engine-bridge';
import { AudioManager } from '../audio/audio-manager';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { createScatterSimulator, type ScatterSimulator } from '../engine-bridge/match-sim';
import { createSteelReaction, type SteelReaction } from '../engine-bridge/steel-target';
import { initImpactFx, emitImpact, updateImpactFx, disposeImpactFx } from './impact-fx';
import type { BtkModule } from '../engine-bridge/types';
import { resolveShot, type ShotPlate } from '../game/shot';
import { windToVec } from '../game/firing-solution';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, SCOPE_ZERO_RANGE_M } from '../game/loads';

const EYE_HEIGHT_M = 1.6; // matches the Range A look-around

/** Fixed ISA atmosphere for Increment 1 (matches validation/loads.json conditions). */
const ISA_ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

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

export function ScopeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reticleRef = useRef<HTMLCanvasElement>(null);
  const breathBarRef = useRef<HTMLDivElement>(null);

  // Reactive slices for the HUD / React controls.
  const magnification = useGameStore((s) => s.session.scope.magnification);
  const sensitivity = useGameStore((s) => s.settings.sensitivity);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const setUnitsPrimary = useGameStore((s) => s.setUnitsPrimary);
  const setSensitivity = useGameStore((s) => s.setSensitivity);

  // Local feel control (wobble amplitude is not a persisted setting yet — see
  // PROGRESS deferred obs; owner-tuned default 0.75 from the 0.9 spike).
  const wobbleAmpRef = useRef(0.75);
  // Breath-hold flag: shared between the HOLD button (JSX) and the render loop.
  const holdingRef = useRef(false);

  const fireRef = useRef<() => void>(() => {});

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
    loadBtkModule().then((m) => {
      engineModule = m;
      speedOfSoundMps = speedOfSound(m, ISA_ATMOSPHERE);
    });

    // Audio (task 1.5d): fetch the clips now (no context, no sound); the first
    // FIRE tap unlocks (iOS gesture) and then plays. `playShotAudio` fires the
    // muzzle report every shot and, on a HIT only, schedules the steel ping after
    // the sound-travel delay, scaled by distance + impact energy (audio-model).
    const audio = new AudioManager();
    void audio.preload();
    function playShotAudio(hit: boolean, soundDistanceM: number, impactEnergyJ: number) {
      void audio.unlock().then(() => {
        audio.report(); // muzzle blast — every shot
        if (hit) audio.ping(soundDistanceM, speedOfSoundMps, impactEnergyJ); // hits only
      });
    }
    const solveCache = new Map<string, { dropM: number; windageM: number; velocityMps: number }>();
    const simCache = new Map<number, ScatterSimulator>();
    // Live reactive-steel physics for currently-swinging plates (task 1.5a). One
    // C++ SteelTarget per struck plate instance, reused for repeat hits, deleted
    // when it settles. `rest` is the plate's static instance matrix (restored on
    // settle); `baseQuat`/`scale` are its face-the-shooter rotation + size.
    const reactions = new Map<
      number,
      { reaction: SteelReaction; rest: THREE.Matrix4; baseQuat: THREE.Quaternion; scale: THREE.Vector3 }
    >();

    function solveAt(rangeM: number, wind: { speedMps: number; directionDeg: number }) {
      const key = `${rangeM}|${wind.speedMps}|${wind.directionDeg}`;
      let s = solveCache.get(key);
      if (!s) {
        const windVec = windToVec(wind.speedMps, wind.directionDeg);
        const table = solveTrajectory(engineModule!, solveLoad, ISA_ATMOSPHERE, windVec, {
          zeroRangeM: SCOPE_ZERO_RANGE_M,
          maxRangeM: rangeM,
          stepM: rangeM,
        });
        const row = table[table.length - 1];
        s = row
          ? { dropM: row.dropM, windageM: row.windageM, velocityMps: row.velocityMps }
          : { dropM: 0, windageM: 0, velocityMps: 0 };
        solveCache.set(key, s);
      }
      return s;
    }
    function simAt(rangeM: number): ScatterSimulator {
      let sim = simCache.get(rangeM);
      if (!sim) {
        sim = createScatterSimulator(engineModule!, gameLoad.load, gameLoad.dispersion, rangeM, ISA_ATMOSPHERE, gameLoad.twistM);
        simCache.set(rangeM, sim);
      }
      return sim;
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

    // FIRE — resolve the shot from the aim, then recoil.
    fireRef.current = () => {
      // Sample the aim BEFORE this shot's recoil kick (0.9: the bullet leaves as
      // the trigger breaks). Wobble is part of the aim; the kick below is the
      // consequence, applied after the shot is resolved.
      if (engineModule && range.plates.length > 0) {
        const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t));
        if (dir.z < -1e-3) {
          // Aimed plate across all racks: the plate the sight line passes closest
          // to at that plate's own plane. Its rack distance is the engagement.
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
          const rangeM = aimed.distanceM;
          const wind = store().session.wind;
          const scope = store().session.scope;
          const solved = solveAt(rangeM, wind);
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

          // Reactive steel (task 1.5a): a hit swings/rotates the struck plate.
          if (result.hitPlateId != null) {
            const hitPlate = range.plates.find((pl) => pl.instanceId === result.hitPlateId);
            if (hitPlate) {
              const impactWorld = { x: result.impact.x, y: result.impact.y, z: hitPlate.position.z };
              // Bullet velocity at impact ≈ the shooter→impact ray at the load's
              // remaining speed (mostly downrange, a little drop). Good enough for
              // the impulse; the plate hangs facing the shooter.
              const dx = impactWorld.x - camera.position.x;
              const dy = impactWorld.y - camera.position.y;
              const dz = impactWorld.z - camera.position.z;
              const dlen = Math.hypot(dx, dy, dz) || 1;
              const spd = solved.velocityMps || solveLoad.muzzleVelocityMps;
              const impactVel = { x: (dx / dlen) * spd, y: (dy / dlen) * spd, z: (dz / dlen) * spd };

              let entry = reactions.get(hitPlate.instanceId);
              if (!entry) {
                const reaction = createSteelReaction(engineModule, {
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
            }
          }

          // Audio (task 1.5d): report now; on a hit, the steel ping is delayed by
          // the sound travel from the impact point back to the shooter, scaled by
          // distance + impact energy (½·m·v²). A miss makes no impact sound.
          const impactZ = -rangeM;
          const soundDistanceM = Math.hypot(
            result.impact.x - camera.position.x,
            result.impact.y - camera.position.y,
            impactZ - camera.position.z,
          );
          const impactEnergyJ = 0.5 * gameLoad.load.massKg * solved.velocityMps * solved.velocityMps;
          playShotAudio(result.hitPlateId != null, soundDistanceM, impactEnergyJ);

          // Impact FX (task 1.5c): a dust puff always (metallic on a steel hit,
          // brown on a berm/ground miss), plus a persistent scuff mark on a hit.
          emitImpact({
            impactWorld: new THREE.Vector3(result.impact.x, result.impact.y, impactZ),
            hit: result.hitPlateId != null,
          });
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
          if (!entry.reaction.isMoving()) {
            range.plateMesh.setMatrixAt(id, entry.rest); // snap back to rest
            entry.reaction.delete();
            reactions.delete(id);
          }
        }
        range.plateMesh.instanceMatrix.needsUpdate = true;
      }
      // Impact FX (task 1.5c): grow/fade dust puffs and recycle finished ones.
      updateImpactFx(dt);
      camera.fov = SCOPE_BASE_FOV_DEG / store().session.scope.magnification;
      camera.updateProjectionMatrix();
      camera.quaternion.copy(aimQuaternion(st.t));
      renderer.render(scene, camera);
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
      for (const entry of reactions.values()) entry.reaction.delete();
      reactions.clear();
      disposeImpactFx();
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
        }}
      >
        <div>
          {magnification.toFixed(1)}× · {unitsPrimary} reticle · Range A
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
        <button onClick={() => setUnitsPrimary(unitsPrimary === 'MIL' ? 'MOA' : 'MIL')} style={{ marginTop: 4 }}>
          reticle: {unitsPrimary} → {unitsPrimary === 'MIL' ? 'MOA' : 'MIL'}
        </button>
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
