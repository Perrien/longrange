// Task 0.9 — touch-aiming spike. PURPOSE: prove scope aiming feels controllable
// on the iPad (the last existential risk). Not the real scope pipeline (that's
// task 1.3) — a minimal scene + input model we can tune.
//
// Feel model:
//  - Drag sensitivity is 1:1 with the visible field of view (rad-per-pixel =
//    fov/screenHeight), so the world tracks the finger identically at any zoom;
//    the sensitivity slider scales from there. Automatically ∝ 1/magnification.
//  - Hand wobble: ~1 MOA-class slow drift (two incommensurate sines per axis +
//    a 4 s breathing cycle on pitch) added to the aimed direction; the player
//    rides it, as with a real rifle. Toggleable for comparison.
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
const WOBBLE_RAD = 0.00015; // ~0.5 MOA component amplitude → ~1 MOA-class total

interface ShotResult {
  hit: boolean;
  offMilH: number;
  offMilV: number;
}

export function AimSpike() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [mag, setMag] = useState(8);
  const [sens, setSens] = useState(1.0);
  const [wobbleOn, setWobbleOn] = useState(true);
  const [shots, setShots] = useState<{ hits: number; total: number; last?: ShotResult }>({
    hits: 0,
    total: 0,
  });

  // Loop-visible mutable state (React state is for the HUD only).
  const stateRef = useRef({ yaw: 0, pitch: 0, mag: 8, sens: 1.0, wobbleOn: true, t: 0 });
  stateRef.current.mag = mag;
  stateRef.current.sens = sens;
  stateRef.current.wobbleOn = wobbleOn;

  const fireRef = useRef<() => void>(() => {});

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
    function wobble(t: number): { yaw: number; pitch: number } {
      if (!st.wobbleOn) return { yaw: 0, pitch: 0 };
      return {
        yaw: WOBBLE_RAD * (Math.sin(0.31 * t) + 0.5 * Math.sin(0.83 * t + 1.7)),
        pitch:
          WOBBLE_RAD * (Math.sin(0.23 * t + 0.9) + 0.5 * Math.sin(0.71 * t + 0.3)) +
          0.00008 * Math.sin((2 * Math.PI * t) / 4), // breathing
      };
    }

    function aimQuaternion(t: number): THREE.Quaternion {
      const w = wobble(t);
      const q = new THREE.Quaternion();
      q.setFromEuler(new THREE.Euler(-(st.pitch + w.pitch), -(st.yaw + w.yaw), 0, 'YXZ'));
      return q;
    }

    fireRef.current = () => {
      // Shot goes exactly where the (wobbling) crosshair points — feel spike, no ballistics.
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
    };

    let raf = 0;
    let last = performance.now();
    function frame(now: number) {
      st.t += (now - last) / 1000;
      last = now;
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
          <input type="checkbox" checked={wobbleOn} onChange={(e) => setWobbleOn(e.target.checked)} /> wobble (~1 MOA)
        </label>
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
