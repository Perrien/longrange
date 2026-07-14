// Task 0.9 — touch-aiming spike. PURPOSE: prove scope aiming feels controllable
// on the iPad (the last existential risk). Not the real scope pipeline (that's
// task 1.3) — a minimal scene + input model we can tune.
//
// Feel model:
//  - Drag sensitivity is 1:1 with the visible field of view (rad-per-pixel =
//    fov/screenHeight), so the world tracks the finger identically at any zoom;
//    the sensitivity slider scales from there. Automatically ∝ 1/magnification.
//  - Hand wobble (owner feedback, iteration 2): three layers — slow sway,
//    higher-frequency muscle tremor, and occasional random micro-jerks — all
//    scaled by a 0–2× amplitude slider (0 = off). Wobble MUST remain a
//    user-adjustable setting in the real game (logged in PROGRESS).
//  - Recoil (owner feedback, iteration 2): FIRE kicks the view up and slightly
//    sideways through a spring-damper, settling back NEAR the hold but with a
//    small random residual shift — follow-through and re-acquisition are real.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { radToMil, radToMoa, yardsToMeters } from '../units';

const RANGE_M = yardsToMeters(500); // 457.2 m
const PLATE_DIAMETER_M = 0.3048; // 12" plate
const PLATE_CENTER_Y = 1.2; // on a stand
const EYE_HEIGHT_M = 1.2;
const BASE_FOV_DEG = 24; // "1x" vertical FOV; scope FOV = BASE/mag
const MAG_MIN = 4.5;
const MAG_MAX = 35;
const WOBBLE_RAD = 0.00015; // slow-sway component amplitude (~1 MOA-class total at 1×)
const TREMOR_RAD = 0.00002; // muscle-tremor layer amplitude (halved in iter 3 — iter 2 read "manic")
// Disturbance spring-damper (shared by recoil + micro-jerks): x'' = -K·x − C·x'
const SPRING_K = 64; // ω≈8 rad/s → settles in ~0.5 s
const SPRING_C = 9; // slightly underdamped — visible overshoot on recoil
const RECOIL_PITCH_VEL = 0.05; // rad/s impulse ≈ 3 mrad peak muzzle rise
const RECOIL_YAW_VEL = 0.012; // max random sideways component
const RESIDUAL_SHIFT_RAD = 0.0001; // ±0.1 mrad POA shift after recoil (follow-through)
// Breath hold (owner idea, iter 4): press-and-hold steadies the wobble hard for
// a limited window — the respiratory pause. Physiology-honest: ~10 s of air;
// comfortable steadiness for ~the first 70%, then oxygen debt makes the hold
// WORSE than baseline until released; breath recovers in ~5 s.
const HOLD_STEADY_FACTOR = 0.15; // wobble multiplier during a good hold
const BREATH_DEPLETE_S = 10; // full breath → empty while holding
const BREATH_RECOVER_S = 5; // empty → full while released
const BREATH_COMFORT = 0.3; // below this remaining fraction, the hold degrades
const BREATH_DEBT_FACTOR = 1.5; // wobble multiplier when fully out of air

interface ShotResult {
  hit: boolean;
  offMilH: number;
  offMilV: number;
}

export function AimSpike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mag, setMag] = useState(8);
  const [sens, setSens] = useState(1.0);
  const [wobbleAmp, setWobbleAmp] = useState(1.0); // 0 = off … 2 = shaky day
  const [shots, setShots] = useState<{ hits: number; total: number; last?: ShotResult }>({
    hits: 0,
    total: 0,
  });

  // Loop-visible mutable state (React state is for the HUD only).
  const stateRef = useRef({
    yaw: 0,
    pitch: 0,
    mag: 8,
    sens: 1.0,
    wobbleAmp: 1.0,
    t: 0,
    // spring-damper disturbance channel (recoil + micro-jerks)
    dist: { y: 0, p: 0, vy: 0, vp: 0 },
    nextJerkAt: 2,
    // breath hold
    holding: false,
    breath: 1,
  });
  stateRef.current.mag = mag;
  stateRef.current.sens = sens;
  stateRef.current.wobbleAmp = wobbleAmp;

  const fireRef = useRef<() => void>(() => {});
  const breathBarRef = useRef<HTMLDivElement>(null); // updated imperatively in the frame loop

  useEffect(() => {
    const canvas = canvasRef.current!;
    const st = stateRef.current;

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x9fc4e8); // sky
    scene.fog = new THREE.Fog(0x9fc4e8, 600, 1600);

    const camera = new THREE.PerspectiveCamera(BASE_FOV_DEG / st.mag, 1, 0.1, 2000);
    camera.position.set(0, EYE_HEIGHT_M, 0);

    scene.add(new THREE.HemisphereLight(0xffffff, 0x556b2f, 1.0));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
    sun.position.set(-200, 400, -100);
    scene.add(sun);

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4000, 4000),
      new THREE.MeshLambertMaterial({ color: 0x8a9a5b }),
    );
    ground.rotation.x = -Math.PI / 2;
    scene.add(ground);

    // 12" steel plate at 500 yd, facing the shooter, on a simple stand.
    const plate = new THREE.Mesh(
      new THREE.CylinderGeometry(PLATE_DIAMETER_M / 2, PLATE_DIAMETER_M / 2, 0.012, 48),
      new THREE.MeshLambertMaterial({ color: 0xf5f5f0 }),
    );
    plate.rotation.x = Math.PI / 2;
    plate.position.set(0, PLATE_CENTER_Y, -RANGE_M);
    scene.add(plate);
    const stand = new THREE.Mesh(
      new THREE.BoxGeometry(0.05, PLATE_CENTER_Y, 0.05),
      new THREE.MeshLambertMaterial({ color: 0x5a4632 }),
    );
    stand.position.set(0, PLATE_CENTER_Y / 2, -RANGE_M - 0.03);
    scene.add(stand);

    // Parallax/context posts every 100 m, offset to the side.
    const postMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    for (let d = 100; d <= 400; d += 100) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.5, 0.1), postMat);
      post.position.set(-4, 0.75, -d);
      scene.add(post);
    }

    const raycaster = new THREE.Raycaster();

    function resize() {
      const w = canvas.clientWidth;
      const h = canvas.clientHeight;
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    }
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    // ---- input ----
    const pointers = new Map<number, { x: number; y: number }>();
    let pinchDist = 0;

    function radPerPixel(): number {
      const fovRad = (BASE_FOV_DEG / st.mag) * (Math.PI / 180);
      return (st.sens * fovRad) / canvas.clientHeight;
    }

    function onPointerDown(e: PointerEvent) {
      canvas.setPointerCapture(e.pointerId);
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        pinchDist = Math.hypot(a.x - b.x, a.y - b.y);
      }
    }
    function onPointerMove(e: PointerEvent) {
      const prev = pointers.get(e.pointerId);
      if (!prev) return;
      const cur = { x: e.clientX, y: e.clientY };
      if (pointers.size === 1) {
        const rpp = radPerPixel();
        st.yaw += (cur.x - prev.x) * rpp; // drag right → aim right (FPS-style; flip sign here if map-style feels better)
        st.pitch += (cur.y - prev.y) * rpp;
        st.pitch = Math.max(-0.5, Math.min(0.5, st.pitch));
      }
      pointers.set(e.pointerId, cur);
      if (pointers.size === 2) {
        const [a, b] = [...pointers.values()];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (pinchDist > 0) {
          setMag((m) => Math.max(MAG_MIN, Math.min(MAG_MAX, m * (d / pinchDist))));
        }
        pinchDist = d;
      }
    }
    function onPointerUp(e: PointerEvent) {
      pointers.delete(e.pointerId);
      pinchDist = 0;
    }
    function onWheel(e: WheelEvent) {
      e.preventDefault();
      setMag((m) => Math.max(MAG_MIN, Math.min(MAG_MAX, m * (e.deltaY < 0 ? 1.1 : 1 / 1.1))));
    }
    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    // ---- wobble + render loop ----
    // Three layers, all scaled by the amplitude slider (0 disables everything):
    // slow sway (ride-able), muscle tremor (fast, small), and micro-jerks
    // (random kicks through the spring-damper — see frame()).
    // Breath-hold steadiness multiplier: hard steady while air lasts, degrading
    // past the comfort threshold to worse-than-baseline (oxygen debt).
    function steadyFactor(): number {
      if (!st.holding) return 1;
      if (st.breath >= BREATH_COMFORT) return HOLD_STEADY_FACTOR;
      const debt = 1 - st.breath / BREATH_COMFORT; // 0 at comfort edge → 1 empty
      return HOLD_STEADY_FACTOR + debt * (BREATH_DEBT_FACTOR - HOLD_STEADY_FACTOR);
    }

    function wobble(t: number): { yaw: number; pitch: number } {
      const a = st.wobbleAmp * steadyFactor();
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
      const q = new THREE.Quaternion();
      q.setFromEuler(
        new THREE.Euler(
          -(st.pitch + w.pitch + st.dist.p),
          -(st.yaw + w.yaw + st.dist.y),
          0,
          'YXZ',
        ),
      );
      return q;
    }

    fireRef.current = () => {
      // Shot goes exactly where the (wobbling) crosshair points — feel spike, no ballistics.
      // Sampled BEFORE the recoil impulse below disturbs the view.
      raycaster.set(
        camera.position,
        new THREE.Vector3(0, 0, -1).applyQuaternion(aimQuaternion(st.t)).normalize(),
      );
      const hitPlate = raycaster.intersectObject(plate, false)[0];
      // Angular offset from plate center (for the readout), from the aim ray at plate range.
      const dir = raycaster.ray.direction;
      const scale = RANGE_M / -dir.z;
      const xAt = dir.x * scale;
      const yAt = EYE_HEIGHT_M + dir.y * scale;
      const offMilH = radToMil(xAt / RANGE_M);
      const offMilV = radToMil((yAt - PLATE_CENTER_Y) / RANGE_M);
      const result: ShotResult = { hit: !!hitPlate, offMilH, offMilV };
      setShots((s) => ({ hits: s.hits + (result.hit ? 1 : 0), total: s.total + 1, last: result }));
      // Feedback: flash the plate on hit.
      const mat = plate.material as THREE.MeshLambertMaterial;
      if (result.hit) {
        mat.color.set(0xff8c00);
        setTimeout(() => mat.color.set(0xf5f5f0), 250);
      }
      // Recoil: muzzle rise + random sideways kick through the spring-damper,
      // plus a small permanent POA shift — the scope does NOT return exactly.
      st.dist.vp -= RECOIL_PITCH_VEL;
      st.dist.vy += (Math.random() * 2 - 1) * RECOIL_YAW_VEL;
      st.pitch += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
      st.yaw += (Math.random() * 2 - 1) * RESIDUAL_SHIFT_RAD;
    };

    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      const dt = Math.min((now - last) / 1000, 0.05);
      st.t += dt;
      last = now;
      // Integrate the disturbance spring-damper (recoil + micro-jerks).
      st.dist.vy += (-SPRING_K * st.dist.y - SPRING_C * st.dist.vy) * dt;
      st.dist.vp += (-SPRING_K * st.dist.p - SPRING_C * st.dist.vp) * dt;
      st.dist.y += st.dist.vy * dt;
      st.dist.p += st.dist.vp * dt;
      // Breath dynamics.
      st.breath = st.holding
        ? Math.max(0, st.breath - dt / BREATH_DEPLETE_S)
        : Math.min(1, st.breath + dt / BREATH_RECOVER_S);
      if (breathBarRef.current) {
        breathBarRef.current.style.width = `${(st.breath * 100).toFixed(0)}%`;
        breathBarRef.current.style.background =
          st.holding && st.breath < BREATH_COMFORT ? '#c33' : '#4a9';
      }
      // Random micro-jerks (the "erratic" layer) — every 3–7 s, half the iter-2
      // strength (owner: iter 2 read "manic"); scaled by the wobble slider and
      // suppressed/amplified by the breath-hold factor like the rest.
      if (st.wobbleAmp > 0 && st.t >= st.nextJerkAt) {
        const k = 0.002 * st.wobbleAmp * steadyFactor();
        st.dist.vy += (Math.random() * 2 - 1) * k;
        st.dist.vp += (Math.random() * 2 - 1) * k;
        st.nextJerkAt = st.t + 3 + Math.random() * 4;
      }
      camera.fov = BASE_FOV_DEG / st.mag;
      camera.updateProjectionMatrix();
      camera.quaternion.copy(aimQuaternion(st.t));
      renderer.render(scene, camera);
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
      renderer.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const last = shots.last;
  return (
    <div style={{ position: 'relative', width: '100%', height: '100dvh', background: '#000' }}>
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
      {/* Scope mask + crosshair (visual only; exact reticle arrives in task 1.3) */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          pointerEvents: 'none',
          background:
            'radial-gradient(circle at center, transparent 0 40vmin, rgba(0,0,0,0.97) 42vmin)',
        }}
      />
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        <div style={{ position: 'absolute', left: '50%', top: '50%', width: 1, height: '80vmin', background: '#111', transform: 'translate(-0.5px,-50%)' }} />
        <div style={{ position: 'absolute', left: '50%', top: '50%', height: 1, width: '80vmin', background: '#111', transform: 'translate(-50%,-0.5px)' }} />
      </div>
      {/* HUD */}
      <div style={{ position: 'absolute', top: 8, left: 8, color: '#e8eef4', fontFamily: 'monospace', fontSize: 14, background: 'rgba(26,34,44,0.75)', padding: '6px 10px', borderRadius: 6 }}>
        <div>{mag.toFixed(1)}× · 12″ plate @ 500 yd · {shots.hits}/{shots.total} hits</div>
        {last && (
          <div>
            last: {last.hit ? 'HIT' : 'miss'} · {last.offMilH >= 0 ? 'R' : 'L'}
            {Math.abs(last.offMilH).toFixed(2)} / {last.offMilV >= 0 ? 'U' : 'D'}
            {Math.abs(last.offMilV).toFixed(2)} mil ({radToMoa(Math.abs(last.offMilH) / 1000).toFixed(1)}/
            {radToMoa(Math.abs(last.offMilV) / 1000).toFixed(1)} MOA)
          </div>
        )}
        <label style={{ display: 'block', marginTop: 4 }}>
          sens ×{sens.toFixed(2)}{' '}
          <input type="range" min={0.3} max={3} step={0.05} value={sens} onChange={(e) => setSens(Number(e.target.value))} />
        </label>
        <label style={{ display: 'block' }}>
          wobble ×{wobbleAmp.toFixed(2)}{' '}
          <input type="range" min={0} max={2} step={0.05} value={wobbleAmp} onChange={(e) => setWobbleAmp(Number(e.target.value))} />
          {wobbleAmp === 0 ? ' (off)' : ''}
        </label>
      </div>
      {/* HOLD (breath) — left thumb; press and hold to steady, watch your air */}
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
          onPointerDown={() => (stateRef.current.holding = true)}
          onPointerUp={() => (stateRef.current.holding = false)}
          onPointerLeave={() => (stateRef.current.holding = false)}
          onPointerCancel={() => (stateRef.current.holding = false)}
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
        onClick={() => fireRef.current()}
        style={{
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
