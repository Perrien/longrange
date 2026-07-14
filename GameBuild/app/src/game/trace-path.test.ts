// Bullet-trace path tests (task 1.5b). Pure cases (synthetic table) pin the
// endpoint===impact guarantee, the muzzle start, monotonic timing, and the
// head interpolation; one engine-backed case checks the real 500 yd time of
// flight (~0.7 s) that the tracer animates against.
import { describe, it, expect, beforeAll } from 'vitest';
import { buildTracePath, traceHeadAt, traceDurationS } from './trace-path';
import type { TrajectoryRow } from '../engine-bridge/types';
import type { Vec3 } from './shot';

const EYE: Vec3 = { x: 0, y: 1.6, z: 0 };
const DIST = 457.2; // 500 yd

// Synthetic 3-row table (curved drop + a little drift); last row at DIST.
const TABLE: TrajectoryRow[] = [
  { rangeM: 91.44, dropM: 0.02, windageM: 0.01, velocityMps: 720, timeOfFlightS: 0.13, energyJ: 2200 },
  { rangeM: 228.6, dropM: -0.1, windageM: 0.05, velocityMps: 600, timeOfFlightS: 0.35, energyJ: 1600 },
  { rangeM: DIST, dropM: -1.2, windageM: 0.15, velocityMps: 470, timeOfFlightS: 0.82, energyJ: 950 },
];

describe('trace-path/buildTracePath', () => {
  const impact = { x: 0.1, y: -0.2 };
  const path = buildTracePath(TABLE, EYE, impact, DIST);

  it('starts at the muzzle at t=0', () => {
    expect(path.points[0]).toEqual(EYE);
    expect(path.times[0]).toBe(0);
  });

  it('ends exactly on the resolved impact (endpoint === impact)', () => {
    expect(path.points[path.points.length - 1]).toEqual({ x: 0.1, y: -0.2, z: -DIST });
  });

  it('carries one point per table row plus the muzzle, with monotonic times', () => {
    expect(path.points.length).toBe(TABLE.length + 1);
    for (let i = 1; i < path.times.length; i++) {
      expect(path.times[i]).toBeGreaterThan(path.times[i - 1]);
    }
    expect(traceDurationS(path)).toBe(0.82);
  });

  it('bows off the straight muzzle→impact chord (curved, not a line)', () => {
    // Mid point's Y differs from the pure chord Y at the same downrange fraction.
    const mid = path.points[1];
    const f = TABLE[0].rangeM / DIST;
    const chordY = EYE.y + f * (impact.y - EYE.y);
    expect(Math.abs(mid.y - chordY)).toBeGreaterThan(1e-4);
  });
});

describe('trace-path/traceHeadAt', () => {
  const path = buildTracePath(TABLE, EYE, { x: 0.1, y: -0.2 }, DIST);

  it('clamps to the muzzle before launch and the impact at/after arrival', () => {
    expect(traceHeadAt(path, -1)).toEqual(EYE);
    expect(traceHeadAt(path, 5)).toEqual({ x: 0.1, y: -0.2, z: -DIST });
  });

  it('interpolates linearly within a segment', () => {
    const a = path.points[1];
    const b = path.points[2];
    const mid = traceHeadAt(path, (path.times[1] + path.times[2]) / 2);
    expect(mid.x).toBeCloseTo((a.x + b.x) / 2, 9);
    expect(mid.y).toBeCloseTo((a.y + b.y) / 2, 9);
    expect(mid.z).toBeCloseTo((a.z + b.z) / 2, 9);
  });
});

// --- engine-backed: real 500 yd flight time ---------------------------------
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { solveTrajectory, spinRateFromTwist } from '../engine-bridge';
import { windToVec } from './firing-solution';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, SCOPE_ZERO_RANGE_M } from './loads';
import type { AtmosphereInput, Load, BtkModule } from '../engine-bridge/types';

const ISA: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

describe('trace-path/time-of-flight (engine)', () => {
  let module: BtkModule;
  beforeAll(async () => {
    module = await loadBtkModule();
  });

  it('a 500 yd shot arcs to the impact in ~0.7 s', () => {
    const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
    const solveLoad: Load = {
      ...gameLoad.load,
      spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
    };
    const table = solveTrajectory(module, solveLoad, ISA, windToVec(0, 0), {
      zeroRangeM: SCOPE_ZERO_RANGE_M,
      maxRangeM: DIST,
      stepM: DIST / 32,
    });
    const path = buildTracePath(table, EYE, { x: 0, y: 0 }, DIST);
    // Terminal point is the impact regardless of the physics.
    expect(path.points[path.points.length - 1]).toEqual({ x: 0, y: 0, z: -DIST });
    // 6.5 CM at 500 yd: ~0.7 s time of flight.
    expect(traceDurationS(path)).toBeGreaterThan(0.5);
    expect(traceDurationS(path)).toBeLessThan(1.0);
  });
});
