// Types for the engine bridge — both the public (app-facing) types and the
// minimal embind surface of the WASM module the bridge talks to.
//
// The engine is SI-only (meters, m/s, radians, kg, K, Pa). Unit conversion for
// display happens in src/units, never here (build-plan §3 "Units" seam).

// ----------------------------------------------------------------------------
// Public bridge API types
// ----------------------------------------------------------------------------

/** A resolved projectile + muzzle velocity (already SI; hidden-truth resolution
 * happens in the game core before reaching the bridge — build-plan §3). */
export interface Load {
  massKg: number;
  diameterM: number;
  lengthM: number;
  bc: number;
  dragModel: 'G1' | 'G7';
  muzzleVelocityMps: number;
  /** Optional spin (rad/s) for spin-drift; 0/undefined = no spin modeling. */
  spinRateRadPerSec?: number;
}

export interface AtmosphereInput {
  temperatureK: number;
  altitudeM: number;
  humidity: number; // 0..1
  /** Pa; undefined/0 → ISA standard pressure for the altitude. */
  pressurePa?: number;
}

/** Wind in engine Cartesian axes (m/s): x=crossrange, y=vertical, z=-downrange. */
export interface WindVec {
  x: number;
  y: number;
  z: number;
}

export interface SolveOptions {
  /** Range (m) the rifle is zeroed at. */
  zeroRangeM: number;
  /** Farthest range (m) to sample. */
  maxRangeM: number;
  /** Sampling interval (m), e.g. 100. */
  stepM: number;
  /** Integration time step (s). Default 0.001. */
  dt?: number;
}

/** One sampled row of a trajectory, all SI. Angular corrections (MIL/MOA) are
 * derived in the UI via the units service, not here. */
export interface TrajectoryRow {
  rangeM: number;
  /** Vertical position relative to the sight line (m); negative = below. */
  dropM: number;
  /** Horizontal position (m); +x = right (crossrange). */
  windageM: number;
  velocityMps: number;
  timeOfFlightS: number;
  energyJ: number;
}

export type TrajectoryTable = TrajectoryRow[];

export interface ZeroResult {
  /** Launch elevation angle above horizontal (rad). */
  elevationRad: number;
  /** Launch azimuth/windage angle (rad); +right. */
  windageRad: number;
}

// ----------------------------------------------------------------------------
// Minimal embind surface (only what the bridge uses). Every handle owns native
// memory and must be `.delete()`d unless returned by reference — that discipline
// lives entirely in index.ts.
// ----------------------------------------------------------------------------

export interface EmbindHandle {
  delete(): void;
}

export interface EVector3D extends EmbindHandle {
  x: number;
  y: number;
  z: number;
}

export interface EBullet extends EmbindHandle {
  getPosition(): EVector3D;
  getVelocity(): EVector3D;
  getTotalVelocity(): number;
  getElevationAngle(): number;
  getAzimuthAngle(): number;
}

export interface ETrajectoryPoint extends EmbindHandle {
  getTime(): number;
  getState(): EBullet;
  getDistance(): number;
  getVelocity(): number;
  getKineticEnergy(): number;
}

export interface ETrajectory extends EmbindHandle {
  atDistance(distanceM: number): ETrajectoryPoint | undefined;
  getPointCount(): number;
  getTotalDistance(): number;
}

export interface EAtmosphere extends EmbindHandle {
  getAirDensity(): number;
  getSpeedOfSound(): number;
  getTemperature(): number;
}

export interface ESimulator extends EmbindHandle {
  setInitialBullet(bullet: EBullet): void;
  setAtmosphere(atmosphere: EAtmosphere): void;
  setWind(wind: EVector3D): void;
  /** Returns a COPIED Bullet handle (no embind reference policy) → must delete. */
  computeZero(
    muzzleVelocityMps: number,
    target: EVector3D,
    dt: number,
    maxIterations: number,
    tolerance: number,
    spinRate: number,
  ): EBullet;
  simulate(maxDistanceM: number, dt: number, maxTimeS: number): void;
  /** Returns a REFERENCE (return_value_policy::reference) → must NOT delete. */
  getTrajectory(): ETrajectory;
  /** Returns a COPIED Bullet handle (no reference policy) → must delete. */
  getInitialBullet(): EBullet;
  resetToInitial(): void;
}

/** Opaque embind enum value (e.g. DragFunction.G7). */
export interface DragFunctionValue {
  readonly value: number;
}

export interface BtkModule {
  Vector3D: new (x: number, y: number, z: number) => EVector3D;
  Bullet: new (
    weightKg: number,
    diameterM: number,
    lengthM: number,
    bc: number,
    drag: DragFunctionValue,
  ) => EBullet;
  Atmosphere: new (
    temperatureK: number,
    altitudeM: number,
    humidity: number,
    pressurePa: number,
  ) => EAtmosphere;
  BallisticsSimulator: new () => ESimulator;
  DragFunction: { G1: DragFunctionValue; G7: DragFunctionValue };
}

/** The Emscripten MODULARIZE factory (default export of the WASM module). */
export type BtkModuleFactory = (moduleArg?: Record<string, unknown>) => Promise<BtkModule>;
