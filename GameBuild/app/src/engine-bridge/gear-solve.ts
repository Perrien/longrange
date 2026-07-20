// Gear-driven solve seam (task 2.3b, D2/D6) — the ONE place hidden truth enters a
// solve. `resolveTruth` turns a stored rifle instance + ammo lot (their draws)
// into the TRUE ballistics the engine flies (impact + trace), alongside the
// BELIEVED (box) ballistics the player's DOPE / HUD come-up is built from, plus
// the rifle's hidden bore/scope zero offset.
//
// GUARDRAIL (§4.8 / catalog §0): this module lives in engine-bridge/ (outside the
// no-leak guard scan), so it MAY import game/hidden-truth + game/catalog — but it
// returns ONLY numbers: two trajectory tables + an angular offset. It never
// returns (or lets a caller read) the `TrueBallistics` object, so no component
// can pull a true MV/BC/precision through it.
//
// Determinism (§5 of the plan): `solveGear` is a pure function of (records,
// ranges, conditions) — no Date.now / global RNG — so export/import (2.8) and
// truing (2.5) reproduce.
import type { RifleInstance, AmmoLot } from '../persistence';
import {
  resolveTruth,
  resolveRifleTruth,
  type RifleTruthRanges,
  type LotTruthRanges,
  type TrueBallistics,
} from '../game/hidden-truth';
import { believedLoad, lotTrueBaseMvMps, catalogTwistM } from '../game/catalog';
import { solveTrajectory, spinRateFromTwist } from './index';
import { createScatterSimulator, type ScatterSimulator } from './match-sim';
import type { AtmosphereInput, BtkModule, Dispersion, Load, TrajectoryTable, WindVec } from './types';

export interface GearSolveInput {
  /** The owned rifle instance (its draws → hidden truth). */
  rifle: RifleInstance;
  /** The owned ammo lot (its draws → hidden truth). */
  lot: AmmoLot;
  /** Catalog ranges the truth is mapped through (from game/catalog adapters). */
  rifleRanges: RifleTruthRanges;
  lotRanges: LotTruthRanges;
  atmosphere: AtmosphereInput;
  wind: WindVec;
  /** Range (m) the rifle is zeroed at (the stored physical-fact zero, else the
   *  cartridge default — the caller decides, D2/D8). */
  zeroRangeM: number;
  maxRangeM: number;
  stepM: number;
  /** Scope height over bore (m); defaults to bore-line (0) like solveTrajectory. */
  sightHeightM?: number;
  dt?: number;
}

export interface GearSolveResult {
  /** Trajectory flown with the TRUE MV/BC — feeds impact + the in-scope trace. */
  trueTable: TrajectoryTable;
  /** Trajectory the player BELIEVES (box MV/BC) — feeds DOPE / HUD come-up. */
  believedTable: TrajectoryTable;
  /** The rifle's hidden bore/scope zero offset (rad): h = windage, v = elevation.
   *  A plain number pair — never the TrueBallistics object (§4.8). */
  zeroOffsetRad: { h: number; v: number };
}

/** The true (hidden) solve Load for a (rifle, lot): believed geometry + true MV
 *  (base + summed offset) + true BC + spin from twist. Internal — the returned
 *  `truth` never leaves this module (§4.8). */
function trueLoadOf(
  rifle: RifleInstance,
  lot: AmmoLot,
  rifleRanges: RifleTruthRanges,
  lotRanges: LotTruthRanges,
): { load: Load; truth: TrueBallistics; twistM: number } {
  const truth = resolveTruth(rifle, rifleRanges, lot, lotRanges);
  const believed = believedLoad(lot.catalogId);
  const twistM = catalogTwistM(rifle.catalogId);
  const trueMvMps = lotTrueBaseMvMps(lot.catalogId) + truth.totalMvOffsetMps;
  const load: Load = {
    massKg: believed.massKg,
    diameterM: believed.diameterM,
    lengthM: believed.lengthM,
    dragModel: believed.dragModel,
    bc: truth.lot.trueBc,
    muzzleVelocityMps: trueMvMps,
    spinRateRadPerSec: spinRateFromTwist(trueMvMps, twistM),
  };
  return { load, truth, twistM };
}

/**
 * Solve a (rifle, lot) pairing into its true + believed trajectory tables and the
 * rifle's zero offset. The true Load shares the load's physical geometry
 * (mass/diameter/length/drag model — facts, not hidden) with the believed Load;
 * only MV and BC differ: true MV = lot base MV + summed hidden MV offset (rifle
 * copy + lot mean shift), true BC = the lot's hidden true BC. Spin is derived from
 * the barrel twist at each Load's own MV.
 */
export function solveGear(module: BtkModule, input: GearSolveInput): GearSolveResult {
  const { load: trueLoad, truth, twistM } = trueLoadOf(
    input.rifle,
    input.lot,
    input.rifleRanges,
    input.lotRanges,
  );
  const believed = believedLoad(input.lot.catalogId);
  const believedLoadWithSpin: Load = {
    ...believed,
    spinRateRadPerSec: spinRateFromTwist(believed.muzzleVelocityMps, twistM),
  };

  const opts = {
    zeroRangeM: input.zeroRangeM,
    maxRangeM: input.maxRangeM,
    stepM: input.stepM,
    sightHeightM: input.sightHeightM,
    dt: input.dt,
  };

  const trueTable = solveTrajectory(module, trueLoad, input.atmosphere, input.wind, opts);
  const believedTable = solveTrajectory(module, believedLoadWithSpin, input.atmosphere, input.wind, opts);

  // Numbers only — the TrueBallistics object stays inside this function (§4.8).
  return { trueTable, believedTable, zeroOffsetRad: truth.rifle.zeroOffsetRad };
}

/**
 * A rifle's hidden bore/scope zero offset as a plain number pair (task 2.3e).
 * Lets the Range A fire path pass the offset to `resolveShot` without threading
 * it through the per-engagement solve caches. Numbers only — the RifleTruth
 * object stays inside this module (§4.8).
 */
export function gearZeroOffset(
  rifle: RifleInstance,
  rifleRanges: RifleTruthRanges,
): { h: number; v: number } {
  const { zeroOffsetRad } = resolveRifleTruth(rifle, rifleRanges);
  return { h: zeroOffsetRad.h, v: zeroOffsetRad.v };
}

/** Inputs for a gear scatter simulator (true per-shot dispersion). */
export interface GearScatterInput {
  rifle: RifleInstance;
  lot: AmmoLot;
  rifleRanges: RifleTruthRanges;
  lotRanges: LotTruthRanges;
  atmosphere: AtmosphereInput;
  targetRangeM: number;
}

/**
 * A per-shot scatter simulator built from the gear's TRUE dispersion — the lot's
 * MV/BC SDs + the rifle's inherent-precision cone (task 2.3d). Wind/cant SDs are
 * 0 (mean wind is the deterministic centre's job). Returns a numbers-only
 * `ScatterSimulator` (fire() → {x,y}), so no truth leaks (§4.8). Caller `.delete()`s.
 */
export function createGearScatter(module: BtkModule, input: GearScatterInput): ScatterSimulator {
  const { load, truth, twistM } = trueLoadOf(input.rifle, input.lot, input.rifleRanges, input.lotRanges);
  const dispersion: Dispersion = {
    mvSdMps: truth.lot.mvSdMps,
    bcSdFraction: truth.lot.bcSdFraction,
    rifleAccuracyRad: truth.rifle.inherentPrecisionRad,
    scopeCantRad: 0,
    windSpeedSdMps: 0,
    headwindSdMps: 0,
    updraftSdMps: 0,
  };
  return createScatterSimulator(module, load, dispersion, input.targetRangeM, input.atmosphere, twistM);
}
