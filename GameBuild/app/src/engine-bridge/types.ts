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

/** A plain 3-vector of numbers (world SI meters/mps), no native handle. */
export interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A plain quaternion of numbers, no native handle. */
export interface Quat {
  x: number;
  y: number;
  z: number;
  w: number;
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
  /** Scope height above the bore (m). Default 0 (bore-line zero/drop — matches
   * the golden-vector oracle and the 0.4 debug table, which pass none). Task 1.6a. */
  sightHeightM?: number;
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

/** Per-shot dispersion spec fed to the engine's MatchSimulator (the "hit-sim").
 * All SI. These are the load/rifle sampling parameters — box ballistics live in
 * `Load`. Wind SDs and cant are 0 in Increment 1 (mean wind is applied in the
 * deterministic center; gusts arrive in 1.7). */
export interface Dispersion {
  /** Muzzle-velocity standard deviation (m/s), Gaussian, 3σ-clipped. */
  mvSdMps: number;
  /** BC standard deviation as a FRACTION of nominal BC (e.g. 0.005 = 0.5%). */
  bcSdFraction: number;
  /** Rifle/shooter accuracy: angular dispersion cone DIAMETER (rad). */
  rifleAccuracyRad: number;
  /** Scope-cant range (rad); random cant uniform in [-x, +x]. */
  scopeCantRad: number;
  /** Crosswind speed SD (m/s). */
  windSpeedSdMps: number;
  /** Head/tail wind SD (m/s). */
  headwindSdMps: number;
  /** Up/down draft SD (m/s). */
  updraftSdMps: number;
}

/** A single sampled impact at the target plane, meters about the aim center;
 * +x = right, +y = up (same axes as world +X/+Y). */
export interface ScatterShot {
  x: number;
  y: number;
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

export interface EQuaternion extends EmbindHandle {
  w: number;
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
  /** Field-driven overload (task 1.7a): samples `field` at each integration step
   * and OVERWRITES the simulator's internal wind — i.e. flies the field only,
   * ignoring any `setWind` mean (see increment-1.7-plan.md "Backend reality" #4).
   * Bound in bindings.cpp as `simulateWithWind` (a `simulate` overload in C++). */
  simulateWithWind(maxDistanceM: number, dt: number, maxTimeS: number, field: EWindField): void;
  /** Returns a REFERENCE (return_value_policy::reference) → must NOT delete. */
  getTrajectory(): ETrajectory;
  /** Returns a COPIED Bullet handle (no reference policy) → must delete. */
  getInitialBullet(): EBullet;
  resetToInitial(): void;
}

/** The C++ curl-noise wind field (btk::physics::WindGenerator), obtained ONLY via
 * `WindPresets.getPreset(name, minCorner, maxCorner)` (task 1.7a). It is
 * ZERO-MEAN turbulence — no direction/mean-speed term — so the mean wind is
 * superposed in JS (see engine-bridge/wind-field.ts). `sample` returns a COPIED
 * Vector3D handle → must `.delete()`. */
export interface EWindField extends EmbindHandle {
  advanceTime(currentTimeS: number): void;
  /** COPY → delete. */
  sample(xM: number, yM: number, zM: number): EVector3D;
  getCurrentTime(): number;
}

/** `register_vector<std::string>` wrapper — a heap-allocated embind collection,
 * NOT a plain array; must `.delete()` after reading (verified live against the
 * built artifact, task 1.7a pre-step 0). */
export interface EStringVector extends EmbindHandle {
  size(): number;
  get(index: number): string;
}

/** The C++ rigid-body steel target (btk::rendering::SteelTarget). Used by the
 * reactive-steel bridge (task 1.5a) to swing/rotate a struck plate from the
 * bullet's impact impulse, and (target-surface TS-C) as the plate's persistent
 * impact-paint store — `hit()` paints a splat into the target's RGBA buffer,
 * which the game mirrors into the plate's atlas layer. Getters that return math
 * types return COPIES (no embind reference policy in bindings.cpp) → their
 * handles must be `.delete()`d. */
export interface ESteelTarget extends EmbindHandle {
  addChainAnchor(localAttachment: EVector3D, worldFixed: EVector3D): void;
  hit(bullet: EBullet): void;
  timeStep(dt: number): void;
  /** COPY → delete. */
  getCenterOfMass(): EVector3D;
  /** COPY → delete. */
  getOrientation(): EQuaternion;
  /** COPY → delete. */
  localToWorld(local: EVector3D): EVector3D;
  isMoving(): boolean;
  /** Paint + metal colors (bytes). embind exposes the full 6-arg signature. */
  setColors(paintR: number, paintG: number, paintB: number, metalR: number, metalG: number, metalB: number): void;
  /** Refill the paint buffer with the current paint color. */
  initializeTexture(): void;
  /** Clear recorded impacts AND refill the buffer with clean paint. */
  clearImpacts(): void;
  /** ZERO-COPY view of the paint buffer on the WASM heap (typed_memory_view) —
   * fresh per call; memory growth detaches old views, so copy out immediately. */
  getTexture(): Uint8Array;
}

/** Opaque embind enum value (e.g. DragFunction.G7). */
export interface DragFunctionValue {
  readonly value: number;
}

/** A `value_object` result from MatchSimulator.fireShot() — a plain JS object,
 * NOT a handle (nothing to delete). Impact positions are meters at the target
 * plane about the aim center; +x right, +y up. */
export interface ESimulatedShot {
  impactX: number;
  impactY: number;
  score: number;
  isX: boolean;
  actualMv: number;
  actualBc: number;
  windDownrange: number;
  windCrossrange: number;
  windVertical: number;
  releaseAngleH: number;
  releaseAngleV: number;
  impactVelocity: number;
  scopeCant: number;
}

/** Statistics over the shots fired so far. `getMatch()` on the simulator returns
 * a COPIED handle (no reference policy in bindings.cpp) → must `.delete()`. */
export interface EMatch extends EmbindHandle {
  /** RMS radius of the group (m). */
  getMeanRadius(): number;
  /** Extreme-spread group size (m). */
  getGroupSize(): number;
  getRadialStandardDeviation(): number;
  getHitCount(): number;
}

/** Opaque target handle. Ring geometry is irrelevant to the game (steel is
 * hit/miss) — a dummy oversized target is used so scoring never clips. */
export type ETarget = EmbindHandle;

/** The match "hit-sim": zeros once about the target, then samples per-shot
 * dispersion (MV SD, BC SD, rifle cone, cant, wind variance) on each fireShot. */
export interface EMatchSimulator extends EmbindHandle {
  fireShot(): ESimulatedShot;
  /** Returns a COPIED Match handle → caller must `.delete()`. */
  getMatch(): EMatch;
  clearShots(): void;
  getShotCount(): number;
}

export interface BtkModule {
  Vector3D: new (x: number, y: number, z: number) => EVector3D;
  Bullet: {
    /** Box bullet (no flight state). */
    new (
      weightKg: number,
      diameterM: number,
      lengthM: number,
      bc: number,
      drag: DragFunctionValue,
    ): EBullet;
    /** Flight-state bullet: copies `base` and sets world position/velocity/spin.
     * Used to hand the C++ steel target an impact bullet (task 1.5a). */
    new (base: EBullet, position: EVector3D, velocity: EVector3D, spinRateRadPerSec: number): EBullet;
  };
  Atmosphere: new (
    temperatureK: number,
    altitudeM: number,
    humidity: number,
    pressurePa: number,
  ) => EAtmosphere;
  BallisticsSimulator: new () => ESimulator;
  /** Target(name, ring10..ring5, xRing, description) — diameters in m. */
  Target: new (
    name: string,
    ring10M: number,
    ring9M: number,
    ring8M: number,
    ring7M: number,
    ring6M: number,
    ring5M: number,
    xRingM: number,
    description: string,
  ) => ETarget;
  MatchSimulator: new (
    bullet: EBullet,
    nominalMvMps: number,
    target: ETarget,
    targetRangeM: number,
    atmosphere: EAtmosphere,
    mvSdMps: number,
    bcSdFraction: number,
    windSpeedSdMps: number,
    headwindSdMps: number,
    updraftSdMps: number,
    rifleAccuracyRad: number,
    scopeCantRad: number,
    timestepS: number,
    twistRateM: number,
  ) => EMatchSimulator;
  DragFunction: { G1: DragFunctionValue; G7: DragFunctionValue };
  /** Deterministic seed for the global RNG (reproducible groups). */
  Random: { seed(value: number): void };
  /** SteelTarget(width, height, thickness, isOval, position, normal, textureSize). */
  SteelTarget: new (
    widthM: number,
    heightM: number,
    thicknessM: number,
    isOval: boolean,
    position: EVector3D,
    normal: EVector3D,
    textureSize: number,
  ) => ESteelTarget;
  /** Curl-noise wind field generator (task 1.7a). Only ever obtained via
   * `WindPresets.getPreset` in practice; the bare constructor (a zero-component,
   * always-zero field) is unused by the bridge but kept for type completeness. */
  WindGenerator: new () => EWindField;
  /** Factory for named turbulence presets — see increment-1.7-plan.md "Backend
   * reality": every preset is character (gustiness) only, no mean/direction. */
  WindPresets: {
    /** @throws if `name` is not one of `listPresets()`. */
    getPreset(name: string, minCorner: EVector3D, maxCorner: EVector3D): EWindField;
    listPresets(): EStringVector;
    hasPreset(name: string): boolean;
  };
}

/** The Emscripten MODULARIZE factory (default export of the WASM module). */
export type BtkModuleFactory = (moduleArg?: Record<string, unknown>) => Promise<BtkModule>;
