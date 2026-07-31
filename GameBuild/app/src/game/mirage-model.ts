// Mirage (heat-shimmer) pure math — wind-system-btk-port W4/W5. A faithful
// multi-slab port of BTK's `fclass-sim/rendering/mirage.js` `MirageEffect`
// (MIT, copied per P22 — BTK is local-only/git-ignored and cannot be imported
// from), replacing the original task 1.7c/1.7d single-layer simplification
// wholesale (D2: "the incremental approach is what failed in 1.7c" — its
// exports, `MirageDrift`/`advanceMirageDrift`/`mirageIntensity`/etc., lived
// here through W4 so `scope/Mirage.ts` kept compiling until its own rewrite
// in W5; both are gone now that the renderer no longer references them. See
// git history / `Design/execution/PROGRESS.md`'s W2–W5 rows if the old
// single-layer approach is ever worth re-reading).
//
// `scope/Mirage.ts` owns the GPU-facing plumbing and consumes everything
// below; this file is pure (no THREE, no DOM) so it unit-tests in the node
// vitest env. See BTK's `mirage.js` own header comment for the full design
// rationale (repeated below only where it changes in this port).
//
// P13 — THE UNIT CONVENTION THAT MATTERS MOST IN THIS FILE (D8): everything
// below works in YARDS and MPH, exactly like BTK's own fclass-sim (which
// samples wind via `sampleWindAtThreeJsPosition` — yards in, mph out) and
// UNLIKE the rest of this game, which is SI (metres, m/s) end to end. Convert
// ONCE, at the renderer's seam (`scope/Mirage.ts`, W5): world positions
// metres→yards on the way in, sampled wind m/s→mph on the way in. Every BTK
// constant below is then used completely verbatim, with no re-derivation.
// Silently mixing metre positions with these yard-tuned constants would
// rescale feature size by 1.094× and wind advection by 2.24× — wrong in a way
// that looks plausible on screen and is hard to diagnose by eye (see the
// plan's P13 entry for the full failure-mode description).
//
// The random per-layer depth SAMPLE POSITION is deliberately NOT computed
// here (P19): picking a random point in a layer's depth range uses
// `Math.random()`, which must stay at the renderer seam so this module stays
// deterministic and testable, and so nothing non-deterministic can drift into
// anything the shot solve reads (execution-protocol §4.8 — hidden-truth /
// determinism discipline). The renderer picks the sample position and calls
// `windAt` itself; this module only consumes the resulting mph sample.

/** A 3-vector. Units are NOT fixed by the type — read the field/parameter name
 *  at each call site (`...Mph`, `...Yd`) the way the rest of this file does. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** Far-edge depth fraction of each atmosphere slab, BTK verbatim
 *  (`MirageEffect.LAYER_FRACS`) — the first slab spans 0→0.5, the second
 *  0.5→0.8, the third 0.8→1.0 (the target's own depth). */
export const MIRAGE_LAYER_FRACS: readonly number[] = [0.5, 0.8, 1.0];

/** Default per-layer enable mask (all on) — BTK's own `DEBUG_LAYER_MASK`
 *  default. Kept as a parameter default, not baked into `perLayerNorm`
 *  itself (the plan's W4 instruction), so W6 can wire a debug control that
 *  isolates one slab without touching this module. */
export const MIRAGE_DEFAULT_LAYER_MASK: readonly number[] = [1, 1, 1];

/** Per-frame EMA weight on a new wind sample, BTK verbatim
 *  (`WIND_SMOOTHING_ALPHA`). Small — the smoothed wind converges over roughly
 *  `1/alpha` frames/samples, one random-depth sample per layer per frame. */
export const MIRAGE_WIND_SMOOTHING_ALPHA = 0.01;

/** Constant vertical (heat-rise) advection, yards/second, BTK verbatim
 *  (`HEAT_RISE_SPEED`) — real mirage is convective heat rising off the
 *  ground; wind only leans that rise sideways, it doesn't replace it. */
export const MIRAGE_HEAT_RISE_YD_PER_S = 1.0;

/** Exact mph→yards/second conversion, BTK verbatim (`MPH_TO_YARDS_PER_SEC`) —
 *  1 mph = 1760 yd / 3600 s. */
export const MIRAGE_MPH_TO_YARDS_PER_SEC = 1760 / 3600;

/** Per-layer attenuation ceiling: a slab fades to 0 by this horizontal wind
 *  speed (mph), BTK verbatim (`WIND_FADE_SPEED_MPH`) — strong wind mixes the
 *  air and washes the shimmer out. */
export const MIRAGE_WIND_FADE_SPEED_MPH = 15.0;

/** Per-layer noise weight at 1× zoom, pre-normalization, BTK verbatim
 *  (`BASE_INTENSITY`). */
export const MIRAGE_LAYERED_BASE_INTENSITY = 0.025;

/** Ceiling on the zoom-driven intensity growth, BTK verbatim
 *  (`ZOOM_INTENSITY_CAP`) — without it, high magnification would warp the UV
 *  sample so far off-pixel the image would tear rather than shimmer. */
export const MIRAGE_LAYERED_ZOOM_INTENSITY_CAP = 2.0;

/** One atmosphere slab's persistent state, carried frame to frame. */
export interface MirageLayerState {
  /** EMA-smoothed wind sample for this layer, mph (x=cross, y=vertical,
   *  z=head — the game's own engine axes, matching BTK's coordinate note). */
  smoothedWindMph: Vec3;
  /** Accumulated noise-space drift for this layer, yards (x=cross,
   *  y=vertical+heat-rise, z=head) — advects the shared 4D noise field so the
   *  pattern appears carried by the wind (Taylor's frozen-turbulence idea). */
  driftYd: Vec3;
}

/** A single slab at rest: no wind sampled yet, no drift accumulated. */
export function zeroMirageLayerState(): MirageLayerState {
  return { smoothedWindMph: { x: 0, y: 0, z: 0 }, driftYd: { x: 0, y: 0, z: 0 } };
}

/** One state per slab in `MIRAGE_LAYER_FRACS`, all at rest — the renderer's
 *  starting point on `initMirage`. */
export function zeroMirageLayerStates(count: number = MIRAGE_LAYER_FRACS.length): MirageLayerState[] {
  return Array.from({ length: count }, zeroMirageLayerState);
}

/**
 * Advance one atmosphere slab's EMA-smoothed wind and accumulated drift by
 * one frame, given a single wind sample (mph) already taken at a random
 * depth within the slab's range (P19 — the random pick stays in the
 * renderer, so this function is deterministic and fully unit-testable). EMA
 * at `alpha` converges the smoothed wind toward the slab's average over
 * `1/alpha` samples. Drift accumulates the smoothed wind (converted to
 * yards/second) plus a constant heat-rise term on the vertical (y) axis only.
 * Ported verbatim from `MirageEffect.update`'s per-layer loop body.
 */
export function advanceLayer(
  state: MirageLayerState,
  sampleMph: Vec3,
  dtSec: number,
  alpha: number = MIRAGE_WIND_SMOOTHING_ALPHA,
  heatRiseYdPerS: number = MIRAGE_HEAT_RISE_YD_PER_S,
): MirageLayerState {
  const sw = state.smoothedWindMph;
  const smoothedWindMph: Vec3 = {
    x: sw.x * (1 - alpha) + sampleMph.x * alpha,
    y: sw.y * (1 - alpha) + sampleMph.y * alpha,
    z: sw.z * (1 - alpha) + sampleMph.z * alpha,
  };

  const d = state.driftYd;
  const driftYd: Vec3 = {
    x: d.x + smoothedWindMph.x * MIRAGE_MPH_TO_YARDS_PER_SEC * dtSec,
    y: d.y + smoothedWindMph.y * MIRAGE_MPH_TO_YARDS_PER_SEC * dtSec + heatRiseYdPerS * dtSec,
    z: d.z + smoothedWindMph.z * MIRAGE_MPH_TO_YARDS_PER_SEC * dtSec,
  };

  return { smoothedWindMph, driftYd };
}

/**
 * Per-layer attenuation: 1 at dead calm, fading linearly to 0 by
 * `fadeSpeedMph` horizontal wind speed (mph) — BTK verbatim
 * (`Math.max(0, Math.min(1, 1 - horizSpeed/fadeSpeed))`).
 */
export function layerFade(smoothedWindMph: Vec3, fadeSpeedMph: number = MIRAGE_WIND_FADE_SPEED_MPH): number {
  if (fadeSpeedMph <= 0) return 0;
  const horizSpeed = Math.hypot(smoothedWindMph.x, smoothedWindMph.z);
  return Math.min(1, Math.max(0, 1 - horizSpeed / fadeSpeedMph));
}

/**
 * Per-layer intensity normalization (P20): keeps the RMS of the SUMMED
 * layer contributions constant as the active-layer count changes (e.g. a
 * debug mask that isolates one slab) — `baseIntensity / sqrt(Σ mask²)`. BTK
 * verbatim; floored to avoid a divide-by-zero when every mask entry is 0.
 * `mask` is a parameter (not a module constant), per the plan's W4
 * instruction, so a debug control (W6) can pass a mask that isolates one
 * layer without this module needing to know about debug UI at all.
 */
export function perLayerNorm(baseIntensity: number, mask: readonly number[] = MIRAGE_DEFAULT_LAYER_MASK): number {
  let maskSqSum = 0;
  for (const m of mask) maskSqSum += m * m;
  return baseIntensity / Math.sqrt(Math.max(maskSqSum, 1e-6));
}

/**
 * Zoom-driven base intensity, BEFORE per-layer normalization and before any
 * strength-preset multiplier (W6 applies `× intensityScale` at the call
 * site, matching BTK's own `baseIntensity = zoomIntensity * this.
 * intensityScale` split) — a fixed physical air disturbance subtends a
 * bigger fraction of a narrower FOV, so a smaller `fovDeg` (more zoomed in)
 * reads a stronger shimmer. Capped so extreme zoom can't warp the UV sample
 * absurdly far off-pixel. `baseFovDeg` is the scope's 1×-magnification FOV —
 * passed in rather than imported, since `game/` does not depend on `scope/`
 * (P18: the game's own base FOV is 24°, BTK's reference scope's is 30° —
 * this function doesn't care which, it just takes whatever the caller's
 * actual base FOV is).
 */
export function zoomIntensity(
  fovDeg: number,
  baseFovDeg: number,
  baseIntensity: number = MIRAGE_LAYERED_BASE_INTENSITY,
  cap: number = MIRAGE_LAYERED_ZOOM_INTENSITY_CAP,
): number {
  if (fovDeg <= 0) return 0;
  return Math.min((baseFovDeg / fovDeg) * baseIntensity, cap);
}

/**
 * World scale (yards) a layer's noise pattern spans edge-to-edge in the
 * viewport, at depth fraction `frac` of the aim-ray intersection distance —
 * grows linearly with depth, so a fixed-physical-size feature appears
 * `1/frac` larger in the viewport at shallower (nearer) slabs than deeper
 * (farther) ones, without any explicit blur. BTK verbatim: `distance · frac ·
 * tan(fov/2) · 2`.
 */
export function layerScale(distanceYd: number, frac: number, fovDeg: number): number {
  const halfFovRad = ((fovDeg * Math.PI) / 180) * 0.5;
  return distanceYd * frac * Math.tan(halfFovRad) * 2;
}

/**
 * World-space noise anchor (yards) for a layer at depth fraction `frac` —
 * the slab's far edge along the line of sight, scaled off the aim-ray
 * intersection point (`intersectionYd`, already in yards — the renderer's
 * job to compute, W5/P16). BTK verbatim: `intersection × frac` per axis.
 */
export function layerAnchor(intersectionYd: Vec3, frac: number): Vec3 {
  return { x: intersectionYd.x * frac, y: intersectionYd.y * frac, z: intersectionYd.z * frac };
}

// === Renderer-facing pure helpers (wind-system-btk-port W5) =================
// Not present in BTK's `MirageEffect` (which reads its own `intersection`
// object off a bespoke "range box" raycast, `scope.js` L890-965 — a fixed
// rectangular volume specific to fclass-sim's own scope rig). P16 directs a
// different, game-appropriate source instead: reuse `findAimed()`/
// `findAimedTarget()`'s aimed-target distance when there is one, else the
// range's own lane length. These two helpers are the pure (WebGL-free) half
// of that wiring — `ScopeView.tsx` supplies the aim direction/camera position/
// distances, computed from THREE objects it already owns.

/** mph→yd/s's length counterpart: exact yards-per-metre (1 yd = 0.9144 m). */
const YARDS_PER_METER = 1 / 0.9144;

/**
 * Where the aim ray currently lands, and how far — the mirage's world anchor
 * (P16). `aimedDistanceM` is the aimed target's distance if there is one
 * (`findAimed()`/`findAimedTarget()`'s plate/target `.distanceM`); pass
 * `null` when nothing is aimed and `fallbackDistanceM` (the range's own lane
 * length) is used instead, so the mirage always has SOME depth to anchor to
 * even with the crosshair off any target.
 *
 * Inputs are METRES (the game's own units, matching `camera.position` and a
 * THREE direction vector's own components) — this function IS the D8 seam:
 * everything it returns is YARDS, matching every other export in this file.
 */
export function aimRayIntersection(
  cameraPositionM: Vec3,
  dirUnit: Vec3,
  aimedDistanceM: number | null,
  fallbackDistanceM: number,
): { pointYd: Vec3; distanceYd: number } {
  const distanceM = aimedDistanceM ?? fallbackDistanceM;
  const pointM: Vec3 = {
    x: cameraPositionM.x + dirUnit.x * distanceM,
    y: cameraPositionM.y + dirUnit.y * distanceM,
    z: cameraPositionM.z + dirUnit.z * distanceM,
  };
  return {
    pointYd: {
      x: pointM.x * YARDS_PER_METER,
      y: pointM.y * YARDS_PER_METER,
      z: pointM.z * YARDS_PER_METER,
    },
    distanceYd: distanceM * YARDS_PER_METER,
  };
}

/**
 * Elevation of the aim direction, radians, +up — BTK verbatim
 * (`scope.js`: `Math.asin(clamp(fwd.y, -1, 1))`). A unit direction vector's
 * own `y` component IS the sine of its elevation above/below the horizontal,
 * so this is a one-line asin, clamped defensively against float noise pushing
 * `dirY` a hair outside `[-1, 1]` (which would make `asin` return `NaN`).
 */
export function viewPitchRad(dirY: number): number {
  return Math.asin(Math.min(1, Math.max(-1, dirY)));
}

/** Every per-layer value the mirage shader needs, packed into plain arrays —
 *  index-aligned with `MIRAGE_LAYER_FRACS`/`states`. The renderer copies these
 *  straight into its THREE uniform arrays (`Vector3.set(...)` etc.); kept as
 *  plain data here (not THREE types) so the packing logic itself is
 *  unit-testable without a WebGL context. */
export interface MirageLayerUniforms {
  offsetsYd: Vec3[];
  scalesYd: number[];
  driftsYd: Vec3[];
  intensities: number[];
}

/**
 * Pack every layer's world anchor/scale/drift/intensity for one frame — the
 * pure half of BTK's `MirageEffect.update`'s per-layer loop (the impure half,
 * sampling wind at a random depth per layer, stays in the renderer per P19).
 * `baseIntensity` is the caller's already-computed `zoomIntensity(...) ×
 * intensityScale` (W6's strength preset multiplies in at the call site,
 * matching BTK's own `zoomIntensity × this.intensityScale` split — this
 * function doesn't need to know a preset exists).
 */
export function packMirageLayerUniforms(
  states: readonly MirageLayerState[],
  intersectionYd: Vec3,
  distanceYd: number,
  fovDeg: number,
  baseIntensity: number,
  mask: readonly number[] = MIRAGE_DEFAULT_LAYER_MASK,
  fracs: readonly number[] = MIRAGE_LAYER_FRACS,
): MirageLayerUniforms {
  const norm = perLayerNorm(baseIntensity, mask);
  const offsetsYd: Vec3[] = [];
  const scalesYd: number[] = [];
  const driftsYd: Vec3[] = [];
  const intensities: number[] = [];

  for (let i = 0; i < states.length; i++) {
    const frac = fracs[i];
    offsetsYd.push(layerAnchor(intersectionYd, frac));
    scalesYd.push(layerScale(distanceYd, frac, fovDeg));
    driftsYd.push(states[i].driftYd);
    intensities.push(norm * layerFade(states[i].smoothedWindMph) * (mask[i] ?? 1));
  }

  return { offsetsYd, scalesYd, driftsYd, intensities };
}
