// Range A view (task 1.2). Mounts a canvas, builds the RangeScene, and runs a
// render loop with a frame-time / FPS HUD — the readout that lets the owner
// verify the "< 16 ms on iPad (or throttled devtools)" done-when. Input here is
// a deliberately minimal look-around (drag to pan, slider to zoom) just so the
// whole range can be inspected; the real scope pipeline, wobble, and touch feel
// arrive in task 1.3 (reusing the task-0.9 aim spike). No ballistics yet.
import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RangeScene } from './RangeScene';

const EYE_HEIGHT_M = 1.6;
const BASE_FOV_DEG = 26; // "1×" vertical FOV; view FOV = BASE / mag
const MAG_MIN = 1;
const MAG_MAX = 20;

export function RangeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fpsRef = useRef<HTMLSpanElement>(null);
  const [mag, setMag] = useState(1.5);
  const magRef = useRef(mag);
  magRef.current = mag;

  useEffect(() => {
    const canvas = canvasRef.current!;
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    const scene = new THREE.Scene();
    const range = new RangeScene(scene);

    const camera = new THREE.PerspectiveCamera(BASE_FOV_DEG / magRef.current, 1, 0.5, 3000);
    camera.position.set(0, EYE_HEIGHT_M, 0);

    // Look-around state (yaw left/right, pitch up/down), clamped to the range.
    const look = { yaw: 0, pitch: -0.01 };
    function applyLook() {
      camera.quaternion.setFromEuler(new THREE.Euler(look.pitch, look.yaw, 0, 'YXZ'));
    }
    applyLook();

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

    // Drag to look; sensitivity tracks the visible FOV so it feels 1:1 at any zoom.
    let dragging = false;
    let lastX = 0;
    let lastY = 0;
    function radPerPixel() {
      return ((BASE_FOV_DEG / magRef.current) * (Math.PI / 180)) / canvas.clientHeight;
    }
    function onDown(e: PointerEvent) {
      dragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    }
    function onMove(e: PointerEvent) {
      if (!dragging) return;
      const rpp = radPerPixel();
      look.yaw -= (e.clientX - lastX) * rpp; // drag right → pan view right
      look.pitch -= (e.clientY - lastY) * rpp;
      look.yaw = Math.max(-Math.PI / 3, Math.min(Math.PI / 3, look.yaw));
      look.pitch = Math.max(-0.15, Math.min(0.25, look.pitch));
      lastX = e.clientX;
      lastY = e.clientY;
      applyLook();
    }
    function onUp() {
      dragging = false;
    }
    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);

    // Render loop with a smoothed frame-time readout.
    let raf = 0;
    let last = performance.now();
    let emaMs = 16;
    let hudAccum = 0;
    function frame(now: number) {
      const dt = now - last;
      last = now;
      emaMs = emaMs * 0.9 + dt * 0.1;
      hudAccum += dt;
      if (hudAccum > 250 && fpsRef.current) {
        hudAccum = 0;
        fpsRef.current.textContent = `${emaMs.toFixed(1)} ms · ${(1000 / emaMs).toFixed(0)} fps`;
      }
      camera.fov = BASE_FOV_DEG / magRef.current;
      camera.updateProjectionMatrix();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      range.dispose();
      renderer.dispose();
    };
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
      <canvas
        ref={canvasRef}
        style={{ width: '100%', height: '100%', display: 'block', touchAction: 'none' }}
      />
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
          Range A · 50–500 yd · <span ref={fpsRef}>— ms</span>
        </div>
        <label style={{ display: 'block', marginTop: 4 }}>
          zoom ×{mag.toFixed(1)}{' '}
          <input
            type="range"
            min={MAG_MIN}
            max={MAG_MAX}
            step={0.5}
            value={mag}
            onChange={(e) => setMag(Number(e.target.value))}
          />
        </label>
        <div style={{ opacity: 0.7, fontSize: 12 }}>drag to look · scene preview (no scope yet)</div>
      </div>
    </div>
  );
}
