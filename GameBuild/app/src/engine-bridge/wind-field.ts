// Wind field bridge (task 1.7a) — the ONLY code that touches the
// WindGenerator/WindPresets embind handles and their `.delete()` rules (mirrors
// match-sim.ts's lifecycle discipline; build-plan §3; execution-protocol §9).
//
// Backend reality (increment-1.7-plan.md): `WindGenerator` is ZERO-MEAN curl
// turbulence — no mean-wind term, no direction term. Every BTK preset
// (`Zero, Dead, Calm, Moderate, Strong, Extra Strong, Switchy, Turbulent,
// Shear, Gusty`) describes gustiness/character only. To get a directional wind
// with realistic gust character, the caller must superpose this field's sample
// onto a separate mean-wind vector (done in ScopeView's `solveAt`, D2/D3b) —
// this file only wraps the field itself, never invents a mean.
import { setupZeroedSimulator } from './index';
import type {
  AtmosphereInput,
  BtkModule,
  EWindField,
  Load,
  SolveOptions,
  TrajectoryTable,
  Vec3,
  WindVec,
} from './types';

const DEFAULT_DT = 0.001;

/** A live wind field the app can sample/advance without ever touching the raw
 * embind handle. `sample` builds a temp Vector3D, reads the result, and deletes
 * both before returning a plain `{x,y,z}` — never leaks a handle to the caller. */
export interface WindField {
  /** Advance the field's internal (monotonic) clock to `currentTimeS`. */
  advance(currentTimeS: number): void;
  /** Sample the field at a world position (engine axes: x=crossrange, y=up,
   * z=-downrange). Returns a plain vector — this is the gust CONTRIBUTION only
   * (zero-mean turbulence), not a directional wind; the caller adds the mean. */
  sample(pos: Vec3): Vec3;
  currentTime(): number;
  /** Idempotent — safe to call more than once. */
  delete(): void;
}

// Internal escape hatch: `WindField` deliberately hides the raw embind handle
// from every ordinary caller ("never leak a handle" — every other bridge file's
// rule). `solveTrajectoryField` below is the one exception (simulateWithWind
// needs the real EWindField), so the handle rides along under a module-private
// symbol key rather than being added to the public interface.
const RAW_FIELD = Symbol('rawWindField');
interface WindFieldInternal extends WindField {
  [RAW_FIELD]: EWindField;
}

/**
 * Build a named turbulence field bounded by `[minCorner, maxCorner]` (world m;
 * a box that should cover every point the bullet/markers will sample — see
 * `RANGE_A_GROUND` in range-a-config.ts for the extents ScopeView reuses).
 * `presetName` must be one of `listWindPresets(module)`; the C++ factory throws
 * on an unknown name, so validate at the call site (D3's store note) before
 * calling this.
 */
export function createWindField(
  module: BtkModule,
  presetName: string,
  minCorner: Vec3,
  maxCorner: Vec3,
): WindField {
  const min = new module.Vector3D(minCorner.x, minCorner.y, minCorner.z);
  const max = new module.Vector3D(maxCorner.x, maxCorner.y, maxCorner.z);
  let field: EWindField;
  try {
    field = module.WindPresets.getPreset(presetName, min, max);
  } finally {
    min.delete();
    max.delete();
  }

  let deleted = false;
  const wrapper: WindFieldInternal = {
    advance(currentTimeS: number): void {
      field.advanceTime(currentTimeS);
    },
    sample(pos: Vec3): Vec3 {
      const v = field.sample(pos.x, pos.y, pos.z); // COPIED handle → delete
      const out: Vec3 = { x: v.x, y: v.y, z: v.z };
      v.delete();
      return out;
    },
    currentTime(): number {
      return field.getCurrentTime();
    },
    delete(): void {
      if (deleted) return;
      deleted = true;
      field.delete();
    },
    [RAW_FIELD]: field,
  };
  return wrapper;
}

/** The full set of real BTK preset names (D3 — the raw picker shows these
 * verbatim, not a simplified dial). Reads the live `StringVector` once and
 * deletes it (task 1.7a pre-step 0 confirmed this is a heap-allocated embind
 * collection, not a plain array). */
export function listWindPresets(module: BtkModule): string[] {
  const v = module.WindPresets.listPresets();
  try {
    const n = v.size();
    const names: string[] = [];
    for (let i = 0; i < n; i++) names.push(v.get(i));
    return names;
  } finally {
    v.delete();
  }
}

/**
 * Solve a full trajectory THROUGH the field (the `simulate(dist, dt, maxT,
 * field)` overload — bound as `simulateWithWind`), zeroed against `meanWind` so
 * the field solve shares the exact same launch state as the ordinary mean solve
 * (`solveTrajectory` in index.ts) — required for the D2 superposition to be a
 * meaningful "field minus zero-wind" delta. Mirrors `solveTrajectory` row-by-row;
 * duplicated (not shared) because the inner loop reads a different simulate call.
 */
export function solveTrajectoryField(
  module: BtkModule,
  load: Load,
  atmosphere: AtmosphereInput,
  meanWind: WindVec,
  field: WindField,
  opts: SolveOptions,
): TrajectoryTable {
  const dt = opts.dt ?? DEFAULT_DT;
  const sightHeightM = opts.sightHeightM ?? 0;
  const { sim, owned } = setupZeroedSimulator(module, load, atmosphere, meanWind, opts.zeroRangeM, dt, sightHeightM);
  const rawField = (field as WindFieldInternal)[RAW_FIELD];

  try {
    sim.simulateWithWind(opts.maxRangeM * 1.05, dt, 10.0, rawField);
    const trajectory = sim.getTrajectory(); // reference — do NOT delete

    const rows: TrajectoryTable = [];
    for (let range = opts.stepM; range <= opts.maxRangeM + 1e-6; range += opts.stepM) {
      const point = trajectory.atDistance(range);
      if (!point) continue;
      const state = point.getState();
      const pos = state.getPosition();
      rows.push({
        rangeM: point.getDistance(),
        dropM: pos.y - sightHeightM,
        windageM: pos.x,
        velocityMps: point.getVelocity(),
        timeOfFlightS: point.getTime(),
        energyJ: point.getKineticEnergy(),
      });
      pos.delete();
      state.delete();
      point.delete();
    }
    return rows;
  } finally {
    for (const handle of owned) handle.delete();
  }
}

/** Sample the field (+ optional mean) at N evenly-spaced points along the
 * straight eye→target line (target assumed at `(0, 0, -rangeM)` — engine
 * convention). Reused by: (a) 1.7a's own "zero-mean" sanity test, (b) 1.7b's
 * effective-wind HUD readout / marker sampling. Returns gust-only vectors
 * (caller adds the mean, same D2 pattern as everywhere else in this file). */
export function sampleFieldColumn(field: WindField, eye: Vec3, rangeM: number, samples: number): Vec3[] {
  const target: Vec3 = { x: 0, y: 0, z: -rangeM };
  const out: Vec3[] = [];
  const n = Math.max(1, samples);
  for (let i = 0; i < n; i++) {
    // Midpoint sampling (avoids double-counting the eye/target endpoints).
    const t = (i + 0.5) / n;
    out.push(
      field.sample({
        x: eye.x + (target.x - eye.x) * t,
        y: eye.y + (target.y - eye.y) * t,
        z: eye.z + (target.z - eye.z) * t,
      }),
    );
  }
  return out;
}

