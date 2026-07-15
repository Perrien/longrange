// Pure wind-marker model tests (task 1.7b). No engine, no THREE.
import { describe, it, expect } from 'vitest';
import { horizontalSpeed, yawFromWind, speedFactor, smoothYaw } from './wind-marker-model';

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

describe('wind-marker-model/speedFactor', () => {
  it('is 0 at calm and non-negative speeds only', () => {
    expect(speedFactor(0, 5)).toBe(0);
    expect(speedFactor(-3, 5)).toBe(0);
  });

  it('is monotonically increasing with speed', () => {
    const a = speedFactor(1, 5);
    const b = speedFactor(3, 5);
    const c = speedFactor(10, 5);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('never reaches 1 but saturates close to it at high speed', () => {
    // (Not an arbitrarily huge speed: exp(-x) underflows to exactly 0 in
    // float64 once x ≳150, which would make `f === 1` exactly and defeat the
    // "never reaches 1" check — 50/5=10 is well within safe float range.)
    const f = speedFactor(50, 5);
    expect(f).toBeLessThan(1);
    expect(f).toBeGreaterThan(0.99);
  });

  it('is ~1-1/e (~0.632) at speed === referenceMps', () => {
    expect(speedFactor(5, 5)).toBeCloseTo(1 - 1 / Math.E, 9);
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
