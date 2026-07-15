// Increment-1 game loads (task 1.4b). One rifle (6.5 CM) + two factory loads:
// a match (low-SD) and a bulk (high-SD). No hidden truth in Increment 1 — the box
// values ARE true, so a load's solve input is exactly its box ballistics.
//
// Single source of truth for ballistics: the validation oracle fixture
// (validation/loads.json `si` block — the authoritative solve input, same source
// the golden-vector + match-sim harnesses use). This file layers the game-only
// dispersion specs (loads.data.json) on top, so app and validation never drift.
// Spin is intentionally NOT baked here (keeps this module engine-free); the shot
// resolver derives spinRateRadPerSec via the bridge's spinRateFromTwist at solve
// time from `twistM`.
import type { Dispersion, Load } from '../engine-bridge/types';
import { moaToRad } from '../units/angle';
import { inchesToMeters } from '../units/length';
import oracle from '../../../validation/loads.json';
import gameLoadsData from './loads.data.json';

export interface GameLoad {
  id: string;
  name: string;
  /** Box-true SI ballistics (no spin — added at solve time from twistM). */
  load: Load;
  /** Per-shot sampling spec for the engine hit-sim. */
  dispersion: Dispersion;
  /** Barrel twist (m/turn) — drives spin drift (center) and the hit-sim's spin. */
  twistM: number;
}

export const DEFAULT_GAME_LOAD_ID = '65cm-140-match';

/** Fixed scope zero for Increment 1 ("given a provided zero"; build-plan §5.1).
 * Set to 300 yd for testing (owner, 2026-07-14): a rack sits exactly at the zero,
 * so nearer racks need hold-under and farther racks need hold-over — exercising
 * corrections in both directions. Note the constant is SI metres. */
export const SCOPE_ZERO_RANGE_M = 300 * 0.9144; // 300 yd = 274.32 m

/** Scope height over bore (task 1.6a, D1): 2" for every game-path solve. Zeros
 * and reports come-ups against the line of sight instead of the bore line. */
export const SIGHT_HEIGHT_M = inchesToMeters(2);

function asDragModel(value: string): Load['dragModel'] {
  if (value !== 'G1' && value !== 'G7') {
    throw new Error(`game/loads: unsupported drag model '${value}'`);
  }
  return value;
}

function toDispersion(d: (typeof gameLoadsData.loads)[number]['dispersion']): Dispersion {
  return {
    mvSdMps: d.mvSdMps,
    bcSdFraction: d.bcSdFraction,
    rifleAccuracyRad: moaToRad(d.rifleAccuracyMoa), // stored as MOA (sourced), used as rad
    scopeCantRad: d.scopeCantRad,
    windSpeedSdMps: d.windSpeedSdMps,
    headwindSdMps: d.headwindSdMps,
    updraftSdMps: d.updraftSdMps,
  };
}

const oracleSiById = new Map(oracle.loads.map((l) => [l.id, l.si]));

export const GAME_LOADS: GameLoad[] = gameLoadsData.loads.map((gl) => {
  const si = oracleSiById.get(gl.baseLoadId);
  if (!si) {
    throw new Error(`game/loads: '${gl.id}' baseLoadId '${gl.baseLoadId}' not in loads.json`);
  }
  return {
    id: gl.id,
    name: gl.name,
    load: {
      massKg: si.massKg,
      diameterM: si.diameterM,
      lengthM: si.lengthM,
      bc: si.bc,
      dragModel: asDragModel(si.dragModel),
      muzzleVelocityMps: si.muzzleVelocityMps,
    },
    dispersion: toDispersion(gl.dispersion),
    twistM: si.twistM,
  };
});

export function getGameLoad(id: string): GameLoad {
  const load = GAME_LOADS.find((l) => l.id === id);
  if (!load) throw new Error(`game/loads: unknown load id '${id}'`);
  return load;
}
