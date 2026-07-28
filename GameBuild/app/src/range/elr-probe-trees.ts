// Tree placement for the ELR probe's headroom measurement (step P13).
//
// THE QUESTION THIS EXISTS TO ANSWER. The probe's empty scene reads 17 ms on the
// iPad — but that is vsync-capped, so it could be 8 ms of work with half a frame
// spare or 16.9 ms with none. Those two answers imply wildly different tree
// budgets for a 2 km wooded range, and no amount of staring at a capped number
// separates them. So: put a controllable number of real trees in the scene and
// find where the device actually falls over.
//
// It reuses the Wooded Zero Range's `buildTrees` renderer rather than drawing
// anything new, because measuring a stand-in would answer the wrong question —
// the budget has to be in units of the trees the real range will actually use
// (same geometry, same variants, same material, same instancing).
//
// `buildTrees` reads only `cfg.trees.palette` off the EnvironmentConfig; every
// other placement decision comes from the `TreePlacement[]` handed to it. That
// is why this file can supply placements for the probe's convex slope without
// constructing a whole environment config for terrain it does not share.

import {
  mulberry32,
  TREE_VARIANTS_PER_KIND,
  type TreePlacement,
} from './environment/environment-config';
import { GROUND_WIDTH_M, GROUND_LENGTH_M } from './elr-probe-config';

/** Ramp steps for the on-device sweep. 0 re-measures the empty baseline without
 *  a reload, which matters — the baseline and the loaded reading have to come
 *  from the same session to be comparable. */
export const TREE_COUNT_STEPS = [0, 250, 500, 1000, 2000, 4000] as const;

/**
 * The field is generated ONCE at this size and every ramp step draws a prefix of
 * it. That prefix-stability is load-bearing, not an optimisation: target offsets
 * are solved against the FULL field, so every smaller step is a strict subset and
 * the sight lines stay clear at every setting. Re-solving per step would make the
 * gongs jump around as you ramp, which would wreck both the perf comparison and
 * the composition you are trying to judge.
 */
export const MAX_TREES = 4000;

/**
 * Nothing right on top of the shooter — a canopy through the camera would
 * dominate fill rate and flatter or ruin the reading depending on where you
 * happened to be looking.
 *
 * This is now the ONLY exclusion. There was a 45 m cleared lane and a 25 m ring
 * around each gong, which made the range a mown corridor and — worse — made the
 * sight-clearance study circular: it reported zero occluders everywhere because
 * the trees had been kept out of the sight lines by construction. The owner's
 * call after seeing 4000 trees on device was that no swaths are needed, so the
 * trees now go everywhere and the TARGETS move to suit them
 * (`sight-clearance.ts`), which is the honest version of the problem.
 */
export const SHOOTER_CLEAR_RADIUS_M = 30;

const SCALE_MIN = 0.75;
const SCALE_MAX = 1.6;
const ASPECT_SPREAD = 0.22;
const MAX_TILT_RAD = 0.07;
const CONIFER_FRACTION = 0.65;

export interface ProbeTreeOptions {
  /** Ground height (m) at a downrange distance — the probe's own profile, so
   *  trees sit on the convex slope rather than on an imaginary flat plane. */
  groundY: (downrangeM: number) => number;
  /** Palette length, so `tintIndex` stays in range for the renderer. */
  paletteSize: number;
  seed?: number;
}

/** True if a candidate point is somewhere a tree is allowed to stand. */
export function isPlaceable(x: number, z: number): boolean {
  return Math.hypot(x, z) >= SHOOTER_CLEAR_RADIUS_M;
}

/**
 * Deterministic tree placements across the probe's ground.
 *
 * Deterministic on purpose: a frame-time comparison between 500 and 1000 trees
 * is only meaningful if the 500 are the same 500 both times. A reseeded field
 * would move the measurement around for reasons that have nothing to do with
 * count.
 *
 * Rejection sampling with a bounded attempt budget rather than a solver — if the
 * clear zones ever leave nowhere to stand, this returns fewer trees instead of
 * spinning, and the readout showing fewer than requested is itself the signal.
 */
export function generateProbeTreePlacements(
  count: number,
  opts: ProbeTreeOptions,
): TreePlacement[] {
  const rand = mulberry32(opts.seed ?? 90210);
  const placements: TreePlacement[] = [];
  const halfWidth = GROUND_WIDTH_M / 2;
  const maxAttempts = count * 12;

  for (let attempt = 0; attempt < maxAttempts && placements.length < count; attempt++) {
    const x = (rand() * 2 - 1) * halfWidth;
    const z = -rand() * GROUND_LENGTH_M;
    if (!isPlaceable(x, z)) continue;

    const scale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN);
    placements.push({
      kind: rand() < CONIFER_FRACTION ? 'conifer' : 'deciduous',
      x,
      z,
      y: opts.groundY(-z),
      scale,
      scaleXZ: scale * (1 + (rand() * 2 - 1) * ASPECT_SPREAD),
      scaleY: scale * (1 + (rand() * 2 - 1) * ASPECT_SPREAD),
      rotationY: rand() * Math.PI * 2,
      tiltX: (rand() * 2 - 1) * MAX_TILT_RAD,
      tiltZ: (rand() * 2 - 1) * MAX_TILT_RAD,
      variantIndex: Math.floor(rand() * TREE_VARIANTS_PER_KIND),
      tintIndex: Math.floor(rand() * Math.max(1, opts.paletteSize)),
    });
  }
  return placements;
}
