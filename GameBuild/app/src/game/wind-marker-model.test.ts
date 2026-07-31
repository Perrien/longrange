// Pure wind-marker model tests (task 1.7b; extended wind-system-btk-port W2).
// No engine, no THREE.
import { describe, it, expect } from 'vitest';
import {
  horizontalSpeed,
  yawFromWind,
  smoothYaw,
  markerAngleDeg,
  flapFrequencyHz,
  advanceWavePhase,
  smoothAngle,
  swayWindFactor,
  type Vec3,
} from './wind-marker-model';

describe('wind-marker-model/horizontalSpeed', () => {
  it('is the (x,z) magnitude, ignoring y', () => {
    expect(horizontalSpeed({ x: 3, y: 999, z: 4 })).toBeCloseTo(5, 9);
    expect(horizontalSpeed({ x: 0, y: 0, z: 0 })).toBe(0);
  });
});

describe('wind-marker-model/yawFromWind', () => {
  it('points along +Z (downrange headwind) at yaw 0', () => {
    expect(yawFromWind({ x: 0, y: 0, z: 5 })).toBeCloseTo(0, 9);
  });

  it('points along +X (crosswind from the left) at yaw +π/2', () => {
    expect(yawFromWind({ x: 5, y: 0, z: 0 })).toBeCloseTo(Math.PI / 2, 9);
  });

  it('points along -X at yaw -π/2', () => {
    expect(yawFromWind({ x: -5, y: 0, z: 0 })).toBeCloseTo(-Math.PI / 2, 9);
  });

  it('points along -Z (tailwind) at yaw ±π', () => {
    expect(Math.abs(yawFromWind({ x: 0, y: 0, z: -5 }))).toBeCloseTo(Math.PI, 9);
  });

  it('a calm (near-zero) vector returns 0, not NaN', () => {
    expect(yawFromWind({ x: 0, y: 0, z: 0 })).toBe(0);
    expect(yawFromWind({ x: 1e-9, y: 0, z: -1e-9 })).toBe(0);
  });

  it('ignores the vertical component', () => {
    const a = yawFromWind({ x: 2, y: 0, z: 3 });
    const b = yawFromWind({ x: 2, y: 500, z: 3 });
    expect(b).toBeCloseTo(a, 9);
  });
});

describe('wind-marker-model/yawFromWind — P1 guard (ported flag tip displacement)', () => {
  // scope/WindMarkers.ts's ported flag shader displaces its tip along world
  // (sin(dirRad), cos(dirRad)) for dirRad = yawFromWind(wind) — see that
  // function's P1 doc comment for the full algebraic equivalence to BTK's own
  // windDir formula. This test pins the two anchor cases the plan's P1 pitfall
  // names directly, phrased as tip displacement rather than raw yaw.
  function tipDisplacementDirection(wind: Vec3): { x: number; z: number } {
    const dir = yawFromWind(wind);
    return { x: Math.sin(dir), z: Math.cos(dir) };
  }

  it('wind from 9 o\'clock ({x:+5,z:0}) displaces the tip toward +x', () => {
    const d = tipDisplacementDirection({ x: 5, y: 0, z: 0 });
    expect(d.x).toBeCloseTo(1, 9);
    expect(d.z).toBeCloseTo(0, 9);
  });

  it('headwind from 12 o\'clock ({x:0,z:+5}) displaces the tip toward +z (back toward the shooter)', () => {
    const d = tipDisplacementDirection({ x: 0, y: 0, z: 5 });
    expect(d.x).toBeCloseTo(0, 9);
    expect(d.z).toBeCloseTo(1, 9);
  });
});

describe('wind-marker-model/swayWindFactor', () => {
  it('is 0 at dead calm', () => {
    expect(swayWindFactor(0, 12)).toBe(0);
  });

  it('scales with wind and saturates to 1 at/after windFullMph', () => {
    const a = swayWindFactor(3, 12);
    const b = swayWindFactor(9, 12);
    expect(b).toBeGreaterThan(a);
    expect(swayWindFactor(12, 12)).toBeCloseTo(1, 9);
    expect(swayWindFactor(30, 12)).toBeCloseTo(1, 9); // clamped, not >1
  });

  it('is linear in speed below windFullMph (BTK: a plain ratio, not a curve)', () => {
    expect(swayWindFactor(6, 12)).toBeCloseTo(0.5, 9);
  });
});

describe('wind-marker-model/smoothYaw', () => {
  it('rate·dt=0 leaves the heading unchanged', () => {
    expect(smoothYaw(0.5, 2.0, 3, 0)).toBe(0.5);
  });

  it('rate·dt>=1 snaps exactly to the target', () => {
    expect(smoothYaw(0.5, 2.0, 10, 1)).toBeCloseTo(2.0, 9);
  });

  it('moves partway toward the target for a fractional step', () => {
    const y = smoothYaw(0, Math.PI / 2, 1, 0.5); // step = 0.5
    expect(y).toBeCloseTo(Math.PI / 4, 9);
  });

  it('takes the SHORT way around the ±π wraparound', () => {
    // current near +170°, target near -170°: short way is +20° (through ±180°),
    // not the long way back through 0°.
    const current = (170 * Math.PI) / 180;
    const target = (-170 * Math.PI) / 180;
    const y = smoothYaw(current, target, 10, 1); // full step → lands exactly on target (wrapped)
    // Normalize both to compare on the circle.
    const norm = (a: number) => ((a % (2 * Math.PI)) + 2 * Math.PI) % (2 * Math.PI);
    expect(norm(y)).toBeCloseTo(norm(target), 6);
    // A half-step should move toward +180°, i.e. increase past 170°, not drop toward 0.
    const half = smoothYaw(current, target, 1, 0.5);
    expect(half).toBeGreaterThan(current);
  });
});

describe('wind-marker-model/markerAngleDeg', () => {
  const curve = { minAngle: 1, maxAngle: 90, flatSpeed: 20, responseExp: 0.7 };

  it('0 mph -> minAngle', () => {
    expect(markerAngleDeg(0, curve)).toBeCloseTo(1, 9);
  });

  it('flatSpeed mph -> maxAngle, and stays clamped there beyond it', () => {
    expect(markerAngleDeg(20, curve)).toBeCloseTo(90, 9);
    expect(markerAngleDeg(40, curve)).toBeCloseTo(90, 9);
  });

  it('is monotonically increasing between 0 and flatSpeed', () => {
    const a = markerAngleDeg(2, curve);
    const b = markerAngleDeg(8, curve);
    const c = markerAngleDeg(15, curve);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('responseExp < 1 puts more travel in the low end than a linear (exp=1) response', () => {
    const linear = { ...curve, responseExp: 1 };
    expect(markerAngleDeg(5, curve)).toBeGreaterThan(markerAngleDeg(5, linear));
  });

  it('a zero flatSpeed does not divide by zero (defensive; not a real config)', () => {
    expect(markerAngleDeg(0, { ...curve, flatSpeed: 0 })).toBeCloseTo(1, 9);
    expect(markerAngleDeg(5, { ...curve, flatSpeed: 0 })).toBeCloseTo(90, 9);
  });
});

describe('wind-marker-model/flapFrequencyHz', () => {
  it('is base at 0 mph and increases linearly with speed', () => {
    expect(flapFrequencyHz(0, 0.5, 0.25)).toBeCloseTo(0.5, 9);
    expect(flapFrequencyHz(10, 0.5, 0.25)).toBeCloseTo(3.0, 9);
  });
});

describe('wind-marker-model/advanceWavePhase', () => {
  it('accumulates phase proportional to freq·dt·2π', () => {
    const p = advanceWavePhase(0, 1, 0.25); // 1 Hz for a quarter second -> quarter turn
    expect(p).toBeCloseTo(Math.PI / 2, 9);
  });

  it('wraps into [0, 2π)', () => {
    const p = advanceWavePhase(Math.PI * 1.9, 1, 0.5); // pushes well past 2π
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThan(2 * Math.PI);
  });

  it('a zero-length step leaves phase unchanged', () => {
    expect(advanceWavePhase(0, 0, 0)).toBe(0);
    expect(advanceWavePhase(1.23, 5, 0)).toBeCloseTo(1.23, 9);
  });
});

describe('wind-marker-model/smoothAngle', () => {
  it('rate·dt=0 leaves the value unchanged', () => {
    expect(smoothAngle(10, 50, 30, 0)).toBe(10);
  });

  it('steps at exactly rate·dt toward the target', () => {
    expect(smoothAngle(10, 50, 30, 1)).toBeCloseTo(40, 9); // 30 deg/s * 1s = 30 deg step
  });

  it('never overshoots — clamps to the target once the step would exceed the remaining distance', () => {
    expect(smoothAngle(10, 50, 30, 2)).toBeCloseTo(50, 9); // unclamped step (60) would overshoot
    expect(smoothAngle(80, 20, 30, 10)).toBeCloseTo(20, 9); // large dt still stops at target
  });

  it('moves toward the target from either side', () => {
    expect(smoothAngle(0, 10, 30, 0.1)).toBeGreaterThan(0);
    expect(smoothAngle(10, 0, 30, 0.1)).toBeLessThan(10);
  });

  it('converges monotonically toward the target across repeated frame-sized steps', () => {
    let v = 0;
    const target = 90;
    let prev = -Infinity;
    for (let i = 0; i < 10; i++) {
      v = smoothAngle(v, target, 30, 1 / 60);
      expect(v).toBeGreaterThanOrEqual(prev);
      expect(v).toBeLessThanOrEqual(target);
      prev = v;
    }
  });
});
