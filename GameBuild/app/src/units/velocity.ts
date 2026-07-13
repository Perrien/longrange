// Velocity conversions (muzzle / retained velocity). m/s is the base unit.
// Exact: 1 fps = 0.3048 m/s, 1 mph = 0.44704 m/s.
//
// GUARDRAIL (execution-protocol §4.4): all velocity unit math goes through this
// module — never inline in components.

const MPS_PER_FPS = 0.3048;
const MPS_PER_MPH = 0.44704;

export const fpsToMps = (fps: number): number => fps * MPS_PER_FPS;
export const mphToMps = (mph: number): number => mph * MPS_PER_MPH;

export const mpsToFps = (mps: number): number => mps / MPS_PER_FPS;
export const mpsToMph = (mps: number): number => mps / MPS_PER_MPH;

/** Both representations of a speed expressed in m/s (dual-unit display). */
export interface MetricImperialSpeed {
  mps: number;
  fps: number;
}

export const asMetricImperialSpeed = (mps: number): MetricImperialSpeed => ({
  mps,
  fps: mpsToFps(mps),
});
