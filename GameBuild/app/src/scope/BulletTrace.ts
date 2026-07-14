// In-scope bullet trace (task 1.5b) — a glowing tracer comet that flies the
// shot's arc in real time. Ports the *look* of BallisticsToolkit fclass-sim
// `rendering/ballistics.js` (a soft glow sprite following the trajectory over its
// time of flight), re-expressed as a short fading trail behind a glow head so it
// reads as a tracer streak.
//
// Geometry + timing are pure (game/trace-path.ts, unit-tested); this file owns
// only the THREE objects. Built lazily via initBulletTrace(scene) so importing is
// DOM-free. The trail is an additive vertex-coloured line (tail dim → head bright,
// so additive blending fades the tail); the head is a soft glow sprite. World axes
// match the scene: +X right, +Y up, downrange −Z.

import * as THREE from 'three';
import { traceHeadAt, traceDurationS, type TracePath } from '../game/trace-path';

const MAX_POINTS = 64; // trail window is time-limited, so it never needs many
const TRAIL_S = 0.15; // seconds of flight shown behind the head
const FADE_S = 0.2; // fade-out after the head reaches the impact
const HEAD_SIZE_M = 0.08; // glow sprite world size (grows with distance via sizeAttenuation)
const TRAIL_COLOR = new THREE.Color(1.0, 0.75, 0.45); // warm copper tracer

/** Soft radial glow, white→transparent (tinted by the sprite/line colour). */
function createGlowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, 'rgba(255,255,255,0.9)');
  g.addColorStop(0.25, 'rgba(255,235,200,0.5)');
  g.addColorStop(0.6, 'rgba(255,220,170,0.15)');
  g.addColorStop(1, 'rgba(255,220,170,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

interface TraceState {
  scene: THREE.Scene;
  texture: THREE.CanvasTexture;
  line: THREE.Line;
  lineMaterial: THREE.LineBasicMaterial;
  positions: Float32Array;
  colors: Float32Array;
  head: THREE.Sprite;
  headMaterial: THREE.SpriteMaterial;
  // Active flight, if any.
  path: TracePath | null;
  launchAtS: number;
}

let fx: TraceState | null = null;

/** Build the tracer objects (hidden) and add them to the scene. Idempotent. */
export function initBulletTrace(scene: THREE.Scene): void {
  if (fx) return;
  const texture = createGlowTexture();

  const geometry = new THREE.BufferGeometry();
  const positions = new Float32Array(MAX_POINTS * 3);
  const colors = new Float32Array(MAX_POINTS * 3);
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  geometry.setDrawRange(0, 0);
  const lineMaterial = new THREE.LineBasicMaterial({
    vertexColors: true,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const line = new THREE.Line(geometry, lineMaterial);
  line.frustumCulled = false;
  line.renderOrder = 3; // over dust (2) and decals (1)
  line.visible = false;
  scene.add(line);

  const headMaterial = new THREE.SpriteMaterial({
    map: texture,
    color: TRAIL_COLOR,
    transparent: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const head = new THREE.Sprite(headMaterial);
  head.scale.set(HEAD_SIZE_M, HEAD_SIZE_M, 1);
  head.renderOrder = 3;
  head.visible = false;
  scene.add(head);

  fx = {
    scene,
    texture,
    line,
    lineMaterial,
    positions,
    colors,
    head,
    headMaterial,
    path: null,
    launchAtS: 0,
  };
}

/** Start a tracer along `path`, timestamped at `nowS` (the loop clock). */
export function launchBulletTrace(path: TracePath, nowS: number): void {
  if (!fx) return;
  fx.path = path;
  fx.launchAtS = nowS;
  fx.lineMaterial.opacity = 1;
  fx.headMaterial.opacity = 1;
}

/** Advance the active tracer to loop time `nowS`. No-op when idle. */
export function updateBulletTrace(nowS: number): void {
  if (!fx || !fx.path) return;
  const path = fx.path;
  const elapsed = nowS - fx.launchAtS;
  const duration = traceDurationS(path);

  if (elapsed >= duration + FADE_S) {
    // Done — retire.
    fx.line.visible = false;
    fx.head.visible = false;
    fx.path = null;
    return;
  }

  // Trail window: from (elapsed − TRAIL_S) up to the head at `elapsed`.
  const headT = Math.min(elapsed, duration);
  const tailT = Math.max(0, headT - TRAIL_S);
  const win: { x: number; y: number; z: number }[] = [traceHeadAt(path, tailT)];
  for (let i = 0; i < path.points.length; i++) {
    if (path.times[i] > tailT && path.times[i] < headT) win.push(path.points[i]);
  }
  win.push(traceHeadAt(path, headT));

  const count = Math.min(win.length, MAX_POINTS);
  for (let j = 0; j < count; j++) {
    const p = win[j];
    fx.positions[j * 3 + 0] = p.x;
    fx.positions[j * 3 + 1] = p.y;
    fx.positions[j * 3 + 2] = p.z;
    // Brightness ramps 0 (tail) → 1 (head); additive blending fades the tail out.
    const u = count > 1 ? j / (count - 1) : 1;
    fx.colors[j * 3 + 0] = TRAIL_COLOR.r * u;
    fx.colors[j * 3 + 1] = TRAIL_COLOR.g * u;
    fx.colors[j * 3 + 2] = TRAIL_COLOR.b * u;
  }
  fx.line.geometry.setDrawRange(0, count);
  (fx.line.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
  (fx.line.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  fx.line.visible = true;

  const headPos = win[count - 1];
  fx.head.position.set(headPos.x, headPos.y, headPos.z);
  fx.head.visible = true;

  // After arrival, fade the streak out over FADE_S.
  const fade = elapsed <= duration ? 1 : Math.max(0, 1 - (elapsed - duration) / FADE_S);
  fx.lineMaterial.opacity = fade;
  fx.headMaterial.opacity = fade;
}

/** Hide any in-flight tracer immediately (e.g. the toggle is switched off). */
export function hideBulletTrace(): void {
  if (!fx) return;
  fx.line.visible = false;
  fx.head.visible = false;
  fx.path = null;
}

/** Tear down all tracer resources. Idempotent. */
export function disposeBulletTrace(): void {
  if (!fx) return;
  fx.scene.remove(fx.line);
  fx.scene.remove(fx.head);
  fx.line.geometry.dispose();
  fx.lineMaterial.dispose();
  fx.headMaterial.dispose();
  fx.texture.dispose();
  fx = null;
}
