// Mirage (heat-shimmer) pure math — task 1.7c. Ported *idea*, not code, from the
// MIT-licensed reference `BallisticsToolkit/web/fclass-sim/rendering/mirage.js`
// (do NOT import — port the approach, per the 1.7 plan's salvage-reference
// note): a fullscreen post-process warps the scope image with a noise field
// that's advected by the local wind, so the shimmer's DRIFT direction is the
// classic wind-reading cue. This module holds only the frame-to-frame drift
// accumulation and the zoom→intensity curve — the parts worth unit-testing
// without a WebGL context. The actual GLSL noise (which this sandbox cannot
// render to verify) lives in `scope/Mirage.ts`, reusing the reference's
// already-proven 4D simplex function verbatim rather than hand-rolling new
// noise math nobody here can check.
//
// D1 (increment-1.7-plan.md): "Flags and mirage still render [in Steady mode],
// but they show that steady mean" — so, like `WindMarkers`, mirage is driven by
// the SAME local-wind sample as everything else (`currentWindAt` in
// `ScopeView.tsx`), not gated to Realistic mode specifically. In Steady mode
// (or a 0 mph Realistic mean) the crosswind/headwind terms are exactly zero,
// so the shimmer naturally stops drifting sideways — only the constant
// heat-rise term keeps it gently boiling in place, which is the "calms down"
// behavior the plan's owner-check describes.

/** Accumulated noise-space drift (metres), fed into the shader as a UV/world
 *  offset so the sampled noise field appears to be carried by the wind
 *  (Taylor's frozen-turbulence idea — same rationale `WindGenerator`'s
 *  advection uses, just applied to a 2D screen-space noise instead of the
 *  ballistics field). */
export interface MirageDrift {
  x: number; // crosswind-driven (screen-horizontal)
  y: number; // constant heat-rise creep (screen-vertical, wind-independent)
  z: number; // headwind-driven (churns the noise's depth/time character slowly)
}

export const MIRAGE_ZERO_DRIFT: MirageDrift = { x: 0, y: 0, z: 0 };

/**
 * Vertical rise speed (m/s) — real mirage is convective heat rising off the
 * ground; wind only leans that rise sideways, it doesn't replace it. At
 * 0.06 m/s this was ~7.5x SLOWER than even a 1 mph breeze (0.447 m/s), so the
 * drift was almost entirely horizontal at any wind at all (owner's on-device
 * report, 2026-07-15: "moving perfectly horizontal even in a 1mph breeze").
 * Set high enough that light wind still reads as mostly-vertical with a
 * slight lean, and only strong wind (catalog's ~20 mph slider ceiling) tips it
 * toward mostly-horizontal — matching the real shooter's read ("boils
 * straight up" at calm → "runs" at speed): at 1 mph the lean is
 * atan(0.447/2.0) ≈ 13° off vertical; at 10 mph ≈ 66°; at 20 mph ≈ 77°.
 * Owner-tunable in 1.7d.
 */
export const MIRAGE_HEAT_RISE_MPS = 2.0;

/** UV-displacement scale at 1× zoom (`fovDeg === baseFovDeg`), before the
 *  zoom curve and the cap. Set to the reference's own tuned `BASE_INTENSITY`
 *  value (0.025) rather than an invented number — the first-pass 0.35 (owner
 *  screenshot, 2026-07-15) was ~14x too strong even after the missing
 *  `SPATIAL_DISTORTION_SCALE` multiplier was added back (see `scope/Mirage.ts`);
 *  reusing the reference's real, presumably-already-eyeballed value is a much
 *  better starting point than guessing again from this sandbox, which has no
 *  WebGL to render-check against. Still owner-tunable in 1.7d. */
export const MIRAGE_BASE_INTENSITY = 0.025;

/** Ceiling on the zoom-driven intensity growth (mirrors the reference's own
 *  `ZOOM_INTENSITY_CAP = 2.0`, adopted for the same reason as
 *  `MIRAGE_BASE_INTENSITY` above) — without a cap, high magnification would
 *  warp the UV sample so far off-pixel the image would tear rather than
 *  shimmer. */
export const MIRAGE_INTENSITY_CAP = 2.0;

/**
 * Advance the accumulated drift by one frame. `wind` is the ALREADY-superposed
 * local wind (mean in Steady, mean+gust in Realistic — whatever `currentWindAt`
 * returned), in engine axes (x=crosswind, z=headwind, m/s). Pure accumulation,
 * so `wind = {x:0, z:0}` (dead calm) leaves `x`/`z` unchanged from `prev` and
 * only `y` (heat rise) keeps advancing — the "calms down" identity the owner
 * check exercises.
 */
export function advanceMirageDrift(
  prev: MirageDrift,
  wind: { x: number; z: number },
  dt: number,
  heatRiseMps: number = MIRAGE_HEAT_RISE_MPS,
): MirageDrift {
  return {
    x: prev.x + wind.x * dt,
    y: prev.y + heatRiseMps * dt,
    z: prev.z + wind.z * dt,
  };
}

/**
 * Zoom-dependent UV-warp intensity (ported idea from the reference's
 * `zoomFactor = BASE_FOV / fov`): a fixed physical air disturbance subtends a
 * bigger fraction of a narrower (more zoomed-in) field of view, so the same
 * real-world shimmer should warp the image MORE at high magnification. Capped
 * so extreme zoom can't warp the UV sample absurdly far off-pixel.
 * `baseFovDeg` is the scope's 1×-magnification FOV (`SCOPE_BASE_FOV_DEG` in
 * `scope/scope-projection.ts`) — passed in rather than imported, since `game/`
 * does not depend on `scope/` (the existing dependency direction is the other
 * way around; every `scope/*` module imports its pure logic from `game/`).
 */
export function mirageIntensity(
  fovDeg: number,
  baseFovDeg: number,
  baseIntensity: number = MIRAGE_BASE_INTENSITY,
  cap: number = MIRAGE_INTENSITY_CAP,
): number {
  if (fovDeg <= 0) return 0;
  return Math.min((baseFovDeg / fovDeg) * baseIntensity, cap);
}
