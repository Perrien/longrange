// Pure wind-marker model (task 1.7b) — the yaw/droop/speed math behind flags
// and socks. Kept framework-, DOM- and THREE-free so it unit-tests in the node
// vitest env (mirrors the model/renderer split in impact-fx-model.ts ÷
// impact-fx.ts, audio-model.ts ÷ audio-manager.ts). The renderer
// (scope/WindMarkers.ts) consumes these; it owns the meshes + geometry.
//
// World/engine axes already match (x=crossrange/+right, y=up, z=-downrange —
// see ScopeView's header comment and the 1.7a wind-field bridge), so a sampled
// wind vector can be used directly as a THREE.js direction with no axis flip.

export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Horizontal wind speed (m/s) — the (x,z) magnitude only. Increment 1 doesn't
 *  model a vertical wind component, so `y` is ignored everywhere here. */
export function horizontalSpeed(vec: Vec3): number {
  return Math.hypot(vec.x, vec.z);
}

/**
 * Yaw angle (radians) that points a THREE object's local +Z (forward) axis
 * along the wind vector's horizontal direction (a Y-axis Euler rotation θ maps
 * local +Z to world `(sin θ, 0, cos θ)`, so θ = atan2(x, z)). A flag/sock
 * "yaws to the local wind direction" (D2) by using this as its group rotation.
 * A calm (near-zero) vector has no defined direction — returns 0 rather than
 * an undefined/NaN angle so a becalmed marker just holds its last heading
 * (the renderer smooths toward this with `smoothYaw`, so it settles gently).
 */
export function yawFromWind(vec: Vec3): number {
  if (horizontalSpeed(vec) < 1e-6) return 0;
  return Math.atan2(vec.x, vec.z);
}

/**
 * A saturating 0..1 "how gusty does this feel" factor: 0 at dead calm,
 * trending toward (but never reaching) 1 as speed grows. Drives a flag/sock's
 * droop→extend angle and flutter amplitude — a rendering FEEL curve, not
 * physics (unrelated to the D3b `gustScale` used in the actual ballistics
 * superposition). `referenceMps` is the speed at which the curve is ~63% of
 * the way to fully extended (1 − 1/e).
 */
export function speedFactor(speedMps: number, referenceMps: number): number {
  if (speedMps <= 0 || referenceMps <= 0) return 0;
  return 1 - Math.exp(-speedMps / referenceMps);
}

/** Shortest signed angular difference `b − a`, wrapped to `(-π, π]`. */
function shortestAngleDelta(a: number, b: number): number {
  let d = (b - a) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

/**
 * Exponentially smooth a heading toward `target` at `rate` (1/s), taking the
 * shortest way around the circle. Without this, a marker would snap instantly
 * whenever the sampled field direction jumps between frames (the curl field is
 * noisy sample-to-sample); this gives it a ~1/rate second settle instead.
 * `rate·dt` is clamped to [0,1] so a large `dt` (e.g. a stalled frame) can't
 * overshoot past the target.
 */
export function smoothYaw(current: number, target: number, rate: number, dt: number): number {
  const delta = shortestAngleDelta(current, target);
  const step = Math.min(1, Math.max(0, rate * dt));
  return current + delta * step;
}
