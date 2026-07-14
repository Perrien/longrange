// Bullet-trace path (task 1.5b) — the pure geometry + timing behind the in-scope
// tracer. Kept framework-/THREE-free so it unit-tests in the node vitest env; the
// BulletTrace renderer (scope/BulletTrace.ts) consumes a TracePath and animates a
// glow comet along it.
//
// The 1.4 solve already returns the full TrajectoryTable; the trace walks that
// SAME table (no new physics — plan §2). Each table row is mapped onto the
// straight muzzle→impact chord and bowed by the trajectory's own drop/windage
// curvature, with the terminal point pinned exactly to the resolved impact — so
// the tracer arcs like the real path yet ends on the hit (plan 1.5b: "trace
// endpoint === impact point"). Time-of-flight comes straight from the table.

import type { TrajectoryRow } from '../engine-bridge/types';
import type { Vec3 } from './shot';
import type { PlanePoint } from './firing-solution';

export interface TracePath {
  /** World-metre points, muzzle → impact; `points[0]` is the muzzle, the last is
   *  exactly the resolved impact. */
  points: Vec3[];
  /** Seconds since launch for each point (monotonic; `times[0] === 0`). */
  times: number[];
}

/**
 * Build the world-space tracer path for a shot. `table` is the fine trajectory
 * sampling (its last row at `distanceM`), `eye` the muzzle, `impact` the resolved
 * impact on the target plane at `z = -distanceM`.
 */
export function buildTracePath(
  table: TrajectoryRow[],
  eye: Vec3,
  impact: PlanePoint,
  distanceM: number,
): TracePath {
  const impactWorld: Vec3 = { x: impact.x, y: impact.y, z: -distanceM };
  const points: Vec3[] = [{ x: eye.x, y: eye.y, z: eye.z }];
  const times: number[] = [0];

  const n = table.length;
  if (n === 0 || distanceM === 0) {
    points.push(impactWorld);
    times.push(n > 0 ? table[n - 1].timeOfFlightS : 0);
    return { points, times };
  }

  // Bow each point off the muzzle→impact chord by the trajectory's deviation from
  // its own straight reference (drop/windage minus the linear part), so both ends
  // carry zero bow: the muzzle stays at the eye and the last point at the impact.
  const dropLast = table[n - 1].dropM;
  const windLast = table[n - 1].windageM;
  for (let i = 0; i < n; i++) {
    const row = table[i];
    const f = row.rangeM / distanceM;
    points.push({
      x: eye.x + f * (impactWorld.x - eye.x) + (row.windageM - f * windLast),
      y: eye.y + f * (impactWorld.y - eye.y) + (row.dropM - f * dropLast),
      z: eye.z + f * (impactWorld.z - eye.z),
    });
    times.push(row.timeOfFlightS);
  }
  // Pin the terminal point exactly on the resolved impact (float-exact endpoint).
  points[points.length - 1] = impactWorld;
  return { points, times };
}

/**
 * Interpolate the tracer head position at `elapsedS` seconds since launch,
 * clamped to the path ends (muzzle before launch, impact at/after arrival).
 */
export function traceHeadAt(path: TracePath, elapsedS: number): Vec3 {
  const { points, times } = path;
  const last = points.length - 1;
  if (elapsedS <= 0) return points[0];
  if (elapsedS >= times[last]) return points[last];
  // Find the segment [i, i+1] straddling elapsedS (times is monotonic).
  let i = 0;
  while (i < last && times[i + 1] < elapsedS) i++;
  const span = times[i + 1] - times[i] || 1;
  const u = (elapsedS - times[i]) / span;
  const a = points[i];
  const b = points[i + 1];
  return {
    x: a.x + (b.x - a.x) * u,
    y: a.y + (b.y - a.y) * u,
    z: a.z + (b.z - a.z) * u,
  };
}

/** Total flight time of the path (seconds). */
export function traceDurationS(path: TracePath): number {
  return path.times[path.times.length - 1];
}
