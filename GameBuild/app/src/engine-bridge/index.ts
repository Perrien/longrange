// Typed engine bridge — the ONLY code that touches embind objects and their
// `.delete()` memory rules (build-plan §3; execution-protocol §9). The app calls
// these typed functions and never sees a raw handle.
//
// Coordinate convention (engine): X=crossrange(+right), Y=vertical(+up),
// Z=-downrange, so a target R metres downrange is at (0, 0, -R).
import { loadBtkModule } from './wasm-module';
import type {
  AtmosphereInput,
  BtkModule,
  DragFunctionValue,
  EBullet,
  ESimulator,
  Load,
  SolveOptions,
  TrajectoryTable,
  WindVec,
  ZeroResult,
} from './types';

export type {
  AtmosphereInput,
  Load,
  SolveOptions,
  TrajectoryRow,
  TrajectoryTable,
  WindVec,
  ZeroResult,
} from './types';

const DEFAULT_DT = 0.001;
const ZERO_MAX_ITERATIONS = 50;
const ZERO_TOLERANCE_M = 1e-5;

/** Spin rate (rad/s) from muzzle velocity and twist length (m/turn):
 * one turn per `twistM` of travel → 2π·v/twist. Engine-adjacent physics, kept
 * here so components never derive it inline. Matches validation/match-check.mjs. */
export function spinRateFromTwist(muzzleVelocityMps: number, twistM: number): number {
  return (2 * Math.PI * muzzleVelocityMps) / twistM;
}

function dragValue(module: BtkModule, model: Load['dragModel']): DragFunctionValue {
  return model === 'G1' ? module.DragFunction.G1 : module.DragFunction.G7;
}

/** Speed of sound (m/s) for an atmosphere — used to delay the steel ping by
 * sound-travel time (task 1.5d). Builds and releases a throwaway Atmosphere. */
export function speedOfSound(module: BtkModule, atmosphere: AtmosphereInput): number {
  const atmos = new module.Atmosphere(
    atmosphere.temperatureK,
    atmosphere.altitudeM,
    atmosphere.humidity,
    atmosphere.pressurePa ?? 0,
  );
  const c = atmos.getSpeedOfSound();
  atmos.delete();
  return c;
}

/**
 * Configure a simulator with the load/atmosphere/wind and solve the zeroed
 * launch state for `zeroRangeM`. Returns the simulator (caller must delete it
 * and all handles in `owned`). `computeZero` leaves the simulator reset to the
 * zeroed initial state with a cleared trajectory.
 */
/** Exported (task 1.7a) so wind-field.ts's field solve can share the exact same
 * zeroing path as the mean solve — the field solve and the mean solve must
 * start from the same launch state for the superposition (D2) to be meaningful. */
export function setupZeroedSimulator(
  module: BtkModule,
  load: Load,
  atmosphere: AtmosphereInput,
  wind: WindVec,
  zeroRangeM: number,
  dt: number,
  sightHeightM: number,
): { sim: ESimulator; owned: { delete(): void }[] } {
  const bullet = new module.Bullet(
    load.massKg,
    load.diameterM,
    load.lengthM,
    load.bc,
    dragValue(module, load.dragModel),
  );
  const atmos = new module.Atmosphere(
    atmosphere.temperatureK,
    atmosphere.altitudeM,
    atmosphere.humidity,
    atmosphere.pressurePa ?? 0,
  );
  const windVec = new module.Vector3D(wind.x, wind.y, wind.z);
  const calmVec = new module.Vector3D(0, 0, 0);
  // Zero to the LINE OF SIGHT (sightHeightM above the muzzle) at the zero range,
  // not the bore line (task 1.6a). sightHeightM=0 keeps the bore-line behavior
  // the golden-vector oracle and the 0.4 debug table depend on.
  const target = new module.Vector3D(0, sightHeightM, -zeroRangeM);
  const sim = new module.BallisticsSimulator();
  const owned = [bullet, atmos, windVec, calmVec, target, sim];

  sim.setInitialBullet(bullet);
  sim.setAtmosphere(atmos);

  // The zero is a FIXED bore-to-reticle relationship, never something the physics
  // silently re-solves for whatever wind happens to be live. computeZero() finds
  // pitch AND yaw that null the miss at the target — if the current wind is loaded
  // first, it finds a yaw that cancels that wind's drift at the zero range, which
  // means live wind stops affecting POI at that exact distance every time it's
  // (re)computed. Solving against calm air instead keeps yaw pinned to the bore
  // line, so wind never gets invisibly compensated away. If a player deliberately
  // zeroes while wind is blowing, that's their dialed correction (captured as
  // `playerZero` at confirm time, ScopeView's `confirmZero`) — a conscious choice
  // the game never overrides, not a physics auto-correction.
  sim.setWind(calmVec);

  // computeZero returns a COPIED bullet handle — delete it immediately; the
  // simulator retains the zeroed state internally (and resets to it).
  const zeroed = sim.computeZero(
    load.muzzleVelocityMps,
    target,
    dt,
    ZERO_MAX_ITERATIONS,
    ZERO_TOLERANCE_M,
    load.spinRateRadPerSec ?? 0,
  );
  zeroed.delete();

  // Now load the REAL wind for the flight the caller is about to simulate —
  // computeZero's resetToInitial() doesn't touch wind_, so this sticks.
  sim.setWind(windVec);

  return { sim, owned };
}

/** Solve a full trajectory and sample it at `stepM` intervals to `maxRangeM`. */
export function solveTrajectory(
  module: BtkModule,
  load: Load,
  atmosphere: AtmosphereInput,
  wind: WindVec,
  opts: SolveOptions,
): TrajectoryTable {
  const dt = opts.dt ?? DEFAULT_DT;
  const sightHeightM = opts.sightHeightM ?? 0;
  const { sim, owned } = setupZeroedSimulator(module, load, atmosphere, wind, opts.zeroRangeM, dt, sightHeightM);

  try {
    // Simulate a little past the last sample so atDistance can interpolate it.
    sim.simulate(opts.maxRangeM * 1.05, dt, 10.0);
    const trajectory = sim.getTrajectory(); // reference — do NOT delete

    const rows: TrajectoryTable = [];
    for (let range = opts.stepM; range <= opts.maxRangeM + 1e-6; range += opts.stepM) {
      const point = trajectory.atDistance(range);
      if (!point) continue;
      const state = point.getState(); // copied Bullet handle
      const pos = state.getPosition(); // copied Vector3D handle
      rows.push({
        rangeM: point.getDistance(),
        // Line-of-sight-relative: -sightHeightM at the muzzle (bullet starts below
        // the crosshair), 0 at the zero range, negative past it (needs come-up).
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

/** Solve just the zeroed launch angles for a load/atmosphere at a range. `wind`
 *  no longer influences the result — `setupZeroedSimulator` always solves the
 *  zero against calm air (see its comment) — kept in the signature only because
 *  it's threaded through to the shared setup helper. */
export function computeZero(
  module: BtkModule,
  load: Load,
  atmosphere: AtmosphereInput,
  wind: WindVec,
  zeroRangeM: number,
  dt: number = DEFAULT_DT,
): ZeroResult {
  const { sim, owned } = setupZeroedSimulator(module, load, atmosphere, wind, zeroRangeM, dt, 0);
  try {
    // The simulator was reset to the zeroed initial bullet; read its launch angles.
    const initial: EBullet = sim.getInitialBullet(); // copied handle → delete
    const result: ZeroResult = {
      elevationRad: initial.getElevationAngle(),
      windageRad: initial.getAzimuthAngle(),
    };
    initial.delete();
    return result;
  } finally {
    for (const handle of owned) handle.delete();
  }
}

export interface EngineBridge {
  solveTrajectory(load: Load, atmosphere: AtmosphereInput, wind: WindVec, opts: SolveOptions): TrajectoryTable;
  computeZero(load: Load, atmosphere: AtmosphereInput, wind: WindVec, zeroRangeM: number, dt?: number): ZeroResult;
}

/** Load the WASM engine and return a bridge with the module bound in. */
export async function createEngineBridge(): Promise<EngineBridge> {
  const module = await loadBtkModule();
  return {
    solveTrajectory: (load, atmosphere, wind, opts) =>
      solveTrajectory(module, load, atmosphere, wind, opts),
    computeZero: (load, atmosphere, wind, zeroRangeM, dt) =>
      computeZero(module, load, atmosphere, wind, zeroRangeM, dt),
  };
}
