// Pure wind-marker model (task 1.7b; extended wind-system-btk-port W2 with
// BTK's flag response curve) — the angle/direction/flutter math behind the
// flags and socks. Kept framework-, DOM- and THREE-free so it unit-tests in
// the node vitest env (mirrors the model/renderer split in impact-fx-model.ts
// ÷ impact-fx.ts, audio-model.ts ÷ audio-manager.ts). The renderer
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

/** Horizontal wind speed (m/s) — the (x,z) magnitude only. The marker/flag
 *  model doesn't use a vertical wind component, so `y` is ignored everywhere
 *  here (matches BTK: both `WindFlagFactory`/`WindSockFactory` read only the
 *  horizontal components of the sampled vector). */
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
 *
 * P1 (wind-system-btk-port): BTK's own ported flag shader computes its
 * direction differently — `windDir = atan2(-wind.z, wind.x)`, then displaces
 * the tip along `(cosDir, -sinDir)`. Substituting shows that expands to
 * `(wind.x, wind.z)/|wind|` — i.e. BTK's tip points along the wind vector
 * itself. Rotating this function's local-+Z-forward convention by `θ =
 * yawFromWind(wind)` maps to the SAME world direction: `(sin θ, cos θ) =
 * (wind.x, wind.z)/|wind|`, by the definition of atan2. The two formulas are
 * algebraically different parametrizations of the identical rotation — this
 * is why the ported flag shader (`scope/WindMarkers.ts`'s
 * `computeDeformedPosition`) standardizes on THIS function for its
 * `instanceDirRad`, rather than re-deriving BTK's own `windDir` (a deliberate
 * D6 deviation: one direction convention in the codebase, not two). See
 * `wind-marker-model.test.ts`'s P1 guard for the two anchor cases (crosswind →
 * tip toward +x; headwind → tip toward +z, back toward the shooter).
 */
export function yawFromWind(vec: Vec3): number {
  if (horizontalSpeed(vec) < 1e-6) return 0;
  return Math.atan2(vec.x, vec.z);
}

/**
 * A saturating 0..1 "how gusty does this feel" factor: 0 at dead calm,
 * trending toward (but never reaching) 1 as speed grows. Drives the (interim,
 * pre-W3) sock's droop→extend angle — a rendering FEEL curve, not physics
 * (unrelated to the D3b `gustScale` used in the actual ballistics
 * superposition). `referenceMps` is the speed at which the curve is ~63% of
 * the way to fully extended (1 − 1/e).
 *
 * Superseded for the FLAG by `markerAngleDeg` (BTK's own concave response
 * curve, wind-system-btk-port W2) — kept here because the sock renderer still
 * uses it until it's ported in W3.
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

/** Clamp to [0, 1]. */
function clamp01(v: number): number {
  return Math.min(1, Math.max(0, v));
}

/**
 * BTK's concave angle-response curve (wind-system-btk-port W2/D1 — ported
 * verbatim from `WindFlagFactory`'s/`WindSockFactory`'s shared shape):
 * `angle = minAngle + (maxAngle − minAngle) · clamp(speedMph/flatSpeed, 0, 1)
 * ^ responseExp`. `responseExp < 1` is concave — light wind moves the marker
 * most, flattening out as it approaches `flatSpeed`. Units: `speedMph` and
 * `curve.flatSpeed` are BOTH mph (P2 — convert once at the caller's seam via
 * `mpsToMph`, never inline); `curve.minAngle`/`maxAngle` and the return value
 * are degrees.
 */
export interface AngleResponseCurve {
  /** Degrees from vertical at dead calm. */
  minAngle: number;
  /** Degrees from vertical, fully extended. */
  maxAngle: number;
  /** mph at which the response reaches `maxAngle`. */
  flatSpeed: number;
  /** Concave (<1) response exponent. */
  responseExp: number;
}

export function markerAngleDeg(speedMph: number, curve: AngleResponseCurve): number {
  const frac = curve.flatSpeed > 0 ? clamp01(speedMph / curve.flatSpeed) : speedMph > 0 ? 1 : 0;
  const span = curve.maxAngle - curve.minAngle;
  return curve.minAngle + span * Math.pow(frac, curve.responseExp);
}

/** BTK's flap/sway frequency curve: `base + speedMph · scale` (Hz). Ported
 *  verbatim (wind-system-btk-port W2) — `speedMph` is mph, `base`/`scale` are
 *  Hz and Hz/mph respectively (P2). */
export function flapFrequencyHz(speedMph: number, base: number, scale: number): number {
  return base + speedMph * scale;
}

const TWO_PI = Math.PI * 2;

/** Wrap any real value into `[0, 2π)`. */
function wrapTwoPi(x: number): number {
  const w = x % TWO_PI;
  return w < 0 ? w + TWO_PI : w;
}

/**
 * Accumulate a flap/sway wave phase by one frame: `phase + freqHz·dt·2π`,
 * wrapped to `[0, 2π)`. BTK accumulates phase incrementally rather than using
 * `sin(freq · t)` directly specifically to avoid a large jump when `freq`
 * changes between frames (a `time × frequency` formula would discontinuously
 * jump in phase the instant the wind speed — and therefore freq — changes;
 * accumulation carries the phase continuously through it). Ported verbatim
 * from `WindFlagFactory.updateAll`/`WindSockFactory.updateTransforms`.
 */
export function advanceWavePhase(phase: number, freqHz: number, dt: number): number {
  return wrapTwoPi(phase + freqHz * dt * TWO_PI);
}

/**
 * Rate-limited (slew) smoothing toward `target`: steps by at most
 * `ratePerSecond · dt`, then clamps to the target — never overshoots, and
 * (unlike `smoothYaw`) has no circular wraparound, since it smooths a bounded
 * linear quantity (a droop/lift angle in degrees, not a heading around a
 * compass). Ported verbatim from `WindSockFactory.updateTransforms`'s
 * `angleStep = sign(diff) · min(|diff|, speed·dt)` (D7, wind-system-btk-port
 * W2) — the smoothing BTK's own config declared
 * (`flagAngleInterpolationSpeed`/`sockAngleInterpolationSpeed`, both 30 deg/s)
 * but whose flag shader path never actually applied. Applied to BOTH the flag
 * and the sock (D7) via this shared function, matching BTK's already-equal
 * flag/sock constants.
 */
export function smoothAngle(current: number, target: number, ratePerSecond: number, dt: number): number {
  const diff = target - current;
  const maxStep = Math.max(0, ratePerSecond * dt);
  const step = Math.sign(diff) * Math.min(Math.abs(diff), maxStep);
  return current + step;
}
