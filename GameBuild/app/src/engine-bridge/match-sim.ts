// Scatter (per-shot dispersion) side of the engine bridge — wraps the C++
// MatchSimulator ("BTK hit-sim"). Kept separate from index.ts's deterministic
// solve because it is a distinct concern (stochastic sampling) and to keep each
// file small. Like index.ts, this is the ONLY place that touches these embind
// handles and their `.delete()` rules (build-plan §3; execution-protocol §9).
//
// The MatchSimulator zeros ONCE about the target and, per fireShot(), samples:
// MV SD, BC SD, rifle-accuracy cone, scope cant, and wind VARIANCE. It takes no
// mean wind and no aim/dial — those live in the deterministic center (1.4b). So
// its impact (x, y) is scatter about the aim center at the target plane.
import type {
  AtmosphereInput,
  BtkModule,
  Dispersion,
  DragFunctionValue,
  EMatchSimulator,
  Load,
  ScatterShot,
} from './types';

const DEFAULT_DT = 0.001;

function dragValue(module: BtkModule, model: Load['dragModel']): DragFunctionValue {
  return model === 'G1' ? module.DragFunction.G1 : module.DragFunction.G7;
}

/** Seed the engine's global RNG for reproducible groups. The live game does NOT
 * call this (clock-seeded → varied groups); the validation harness and tests do. */
export function seedRandom(module: BtkModule, value: number): void {
  module.Random.seed(value >>> 0);
}

/** A per-engagement scatter simulator. Construct once for a (load, dispersion,
 * range, atmosphere) — it zeros internally — then call `fire()` per shot and
 * `delete()` when the engagement (target/wind/load) changes. */
export interface ScatterSimulator {
  /** One dispersed impact at the target plane, m about center (+x right, +y up). */
  fire(): ScatterShot;
  /** RMS radius (m) of all shots fired so far. */
  meanRadius(): number;
  /** Number of shots fired so far. */
  shotCount(): number;
  /** Release all native handles. Call exactly once. */
  delete(): void;
}

/**
 * Build a scatter simulator. Mean wind is intentionally NOT passed (MatchSimulator
 * models wind variance only); the deterministic center owns mean-wind drift.
 */
export function createScatterSimulator(
  module: BtkModule,
  load: Load,
  dispersion: Dispersion,
  targetRangeM: number,
  atmosphere: AtmosphereInput,
  twistM: number,
): ScatterSimulator {
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
  // Dummy oversized single-ring target: rings large enough that no impact ever
  // clips a boundary. Steel is hit/miss (tested in TS against plate discs), so
  // this target's score is ignored — only impactX/impactY are read.
  const BIG_M = 1000;
  const target = new module.Target(
    'dummy',
    BIG_M,
    BIG_M,
    BIG_M,
    BIG_M,
    BIG_M,
    BIG_M,
    BIG_M,
    'oversized scoring target (ignored; steel is hit/miss)',
  );
  const sim: EMatchSimulator = new module.MatchSimulator(
    bullet,
    load.muzzleVelocityMps,
    target,
    targetRangeM,
    atmos,
    dispersion.mvSdMps,
    dispersion.bcSdFraction,
    dispersion.windSpeedSdMps,
    dispersion.headwindSdMps,
    dispersion.updraftSdMps,
    dispersion.rifleAccuracyRad,
    dispersion.scopeCantRad,
    DEFAULT_DT,
    twistM,
  );

  // The simulator copies bullet/target/atmosphere into its own members, so the
  // input handles can be released now; only `sim` must outlive construction.
  bullet.delete();
  atmos.delete();
  target.delete();

  let deleted = false;
  return {
    fire(): ScatterShot {
      const shot = sim.fireShot(); // value_object → plain JS object, no delete
      return { x: shot.impactX, y: shot.impactY };
    },
    meanRadius(): number {
      const match = sim.getMatch(); // COPIED handle → delete
      const r = match.getMeanRadius();
      match.delete();
      return r;
    },
    shotCount(): number {
      return sim.getShotCount();
    },
    delete(): void {
      if (deleted) return;
      deleted = true;
      sim.delete();
    },
  };
}
