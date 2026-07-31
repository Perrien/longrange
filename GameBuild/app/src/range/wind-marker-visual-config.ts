// Wind marker (flag/sock) VISUAL configuration — geometry, material response
// curves and animation constants ported verbatim from BTK (wind-system-btk-port
// W2/D1). Source: `BallisticsToolkit/web/steel-sim/config.js` L194–243,
// `Config.WIND_FLAG_CONFIG` / `Config.WIND_SOCK_CONFIG` (MIT license; copied
// per P22 — BTK is local-only/git-ignored and cannot be imported from).
//
// Pure data — no THREE, no DOM. Placement (WHERE markers stand: distance,
// lateral offset, ground height) lives in `wind-markers-config.ts`; this file
// is what each individual marker looks like and how it responds to wind.
//
// UNIT NOTE (P2): BTK builds these SI-metre *dimensions* through
// `Conversions.yardsToMeters`/`inchesToMeters`, but the *response-curve*
// fields (`...FlatSpeed`, `...InterpolationSpeed`) are authored directly in
// **mph** (and deg/s, rad/s) — never converted. The game's wind samples are
// m/s; `game/wind-marker-model.ts`'s consumers convert once, at the seam
// (`mpsToMph`), and everything below is used as-is against that mph value.
// Do not re-derive or rescale these constants — they are tuned against BTK's
// own on-device look.
//
// D1: geometry is BTK's own dimensions, verbatim — not re-tuned for this
// game's scale. Consequence: poles are taller (2.74 m) and flags reach
// further (1.83 m) than the pre-port markers; see wind-markers-config.ts's
// re-solved lateral offsets (W1/P11).

import { yardsToMeters, inchesToMeters } from '../units';

export interface WindFlagVisualConfig {
  /** Pole height/thickness, metres. Matches `MARKER_POLE_HEIGHT_M` in
   *  `wind-markers-config.ts` (both = `yardsToMeters(3)`) — the renderer uses
   *  each marker spec's own `poleHeightM`, not this field, so a per-ladder
   *  pole-height override (should one ever be authored) is honoured; this
   *  field exists only for a verbatim, side-by-side transcription of BTK's
   *  config object. */
  poleHeightM: number;
  poleThicknessM: number;
  /** Flag cloth: hinge (root) width, metres. */
  baseWidthM: number;
  /** Flag cloth: free-tip width, metres (tapered). */
  tipWidthM: number;
  /** Flag cloth: length from hinge to tip, metres. */
  lengthM: number;
  thicknessM: number;
  /** Vertex columns along the length (drives the `segmentT` attribute). */
  segments: number;
  /** Degrees from vertical at dead calm (never fully limp). */
  minAngle: number;
  /** Degrees from vertical, fully extended/horizontal. */
  maxAngle: number;
  /** mph at which the angle response reaches `maxAngle` (P2: mph, not m/s). */
  flatSpeed: number;
  /** Concave response exponent (<1 → light wind moves the flag most). */
  responseExp: number;
  /** Max angle slew rate, deg/s (D7/P10 — BTK declares this but its shader
   *  path never reads it; the game's renderer is what actually applies it,
   *  via `smoothAngle`). */
  angleInterpolationSpeed: number;
  /** Max direction slew rate, rad/s (D7/P10; applied via `smoothYaw`). */
  directionInterpolationSpeed: number;
  /** Flap frequency at 0 mph, Hz. */
  flapFrequencyBase: number;
  /** Additional flap frequency per mph, Hz/mph. */
  flapFrequencyScale: number;
  /** Flap ripple amplitude at the free edge, metres. */
  flapAmplitude: number;
  /** Spatial wave periods along the flag's length (dimensionless — cycles per
   *  full length, not a physical wavelength in metres). */
  waveLength: number;
  /** Steady furl (roll of the cloth about its own length axis), root→tip,
   *  radians, at full wind strength. */
  furlBase: number;
  /** Travelling furl flutter layered on top of `furlBase`, radians. */
  furlWave: number;
}

/** BTK's `WIND_FLAG_CONFIG`, verbatim (config.js L194–219). */
export const FLAG_CONFIG: WindFlagVisualConfig = {
  poleHeightM: yardsToMeters(3.0),
  poleThicknessM: inchesToMeters(2.0),
  baseWidthM: inchesToMeters(18),
  tipWidthM: inchesToMeters(6),
  lengthM: yardsToMeters(2.0),
  thicknessM: yardsToMeters(0.02),
  segments: 32,
  minAngle: 1.0,
  maxAngle: 90.0,
  flatSpeed: 20.0,
  responseExp: 0.7,
  angleInterpolationSpeed: 30.0,
  directionInterpolationSpeed: 1.0,
  flapFrequencyBase: 0.5,
  flapFrequencyScale: 0.25,
  flapAmplitude: yardsToMeters(0.15),
  waveLength: 1.5,
  furlBase: 0.75,
  furlWave: 0.55,
};

export interface WindSockVisualConfig {
  poleHeightM: number;
  poleThicknessM: number;
  /** Tapered tube length, mouth to tail, metres. */
  sockLengthM: number;
  /** Wide (intake) end radius, metres. */
  sockMouthRadiusM: number;
  /** Narrow (trailing) end radius, metres. */
  sockTailRadiusM: number;
  /** Pole-top swivel → mouth, metres. */
  stringLengthM: number;
  radialSegments: number;
  lengthSegments: number;
  /** Degrees from vertical at dead calm (a slight droop, never limp). */
  minAngle: number;
  maxAngle: number;
  flatSpeed: number;
  responseExp: number;
  angleInterpolationSpeed: number;
  directionInterpolationSpeed: number;
  /** Idle swing frequency at 0 mph, Hz. */
  swayFrequencyBase: number;
  /** Additional swing frequency per mph, Hz/mph. */
  swayFrequencyScale: number;
  /** Swing amplitude at full strength, degrees. */
  swayAmplitude: number;
}

/** BTK's `WIND_SOCK_CONFIG`, verbatim (config.js L221–243). Ported for use in
 *  W3 (the sock renderer); transcribed here alongside `FLAG_CONFIG` per the
 *  W2 task list so both configs land together. */
export const SOCK_CONFIG: WindSockVisualConfig = {
  poleHeightM: yardsToMeters(3.0),
  poleThicknessM: inchesToMeters(2.0),
  sockLengthM: yardsToMeters(1.1),
  sockMouthRadiusM: yardsToMeters(0.19),
  sockTailRadiusM: yardsToMeters(0.085),
  stringLengthM: yardsToMeters(0.14),
  radialSegments: 16,
  lengthSegments: 8,
  minAngle: 2.0,
  maxAngle: 90.0,
  flatSpeed: 20.0,
  responseExp: 0.7,
  angleInterpolationSpeed: 30.0,
  directionInterpolationSpeed: 1.0,
  swayFrequencyBase: 0.4,
  swayFrequencyScale: 0.12,
  swayAmplitude: 7.0,
};
