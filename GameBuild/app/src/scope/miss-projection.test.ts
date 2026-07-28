import { describe, it, expect } from 'vitest';
import { projectMissToGround, FLAT_GROUND, GROUND_PUFF_LIFT_M } from './miss-projection';
import { slopeGroundY, eyeYFor } from '../range/elr-probe-config';

const flatEye = { x: 0, y: 1.7, z: 0 };

describe('projectMissToGround — flat ground', () => {
  it('lands the puff short of the target when the round passes under it', () => {
    // 2 m low on the 1000 m plane: the ray meets y = 0 well before 1000 m.
    const hit = projectMissToGround(flatEye, { x: 0, y: -2, z: -1000 }, FLAT_GROUND, 3100);
    expect(hit).not.toBeNull();
    expect(hit!.z).toBeGreaterThan(-1000); // short of the target
    expect(hit!.y).toBeCloseTo(GROUND_PUFF_LIFT_M, 6);
  });

  it('matches the closed-form flat solution it replaces', () => {
    const impact = { x: 3, y: -2, z: -1000 };
    const t = (0 - flatEye.y) / (impact.y - flatEye.y);
    const expectedX = flatEye.x + t * (impact.x - flatEye.x);
    const expectedZ = flatEye.z + t * (impact.z - flatEye.z);
    const hit = projectMissToGround(flatEye, impact, FLAT_GROUND, 3100, 0.5)!;
    expect(hit.x).toBeCloseTo(expectedX, 1);
    expect(hit.z).toBeCloseTo(expectedZ, 1);
  });

  it('returns null for a round that never comes down inside the range', () => {
    expect(projectMissToGround(flatEye, { x: 0, y: 40, z: -1000 }, FLAT_GROUND, 3100)).toBeNull();
  });
});

describe('projectMissToGround — Probe B hillside', () => {
  const eye = { x: 0, y: eyeYFor('slope'), z: 0 }; // 11.7 m on the bluff
  const ground = (r: number) => slopeGroundY(r);

  // THE REASON THIS MODULE EXISTS. On a rising hill the flat-plane solve puts the
  // puff far beyond the real strike and deep underground.
  it('strikes the hillside, not the y = 0 plane far beyond it', () => {
    const impact = { x: 0, y: 60, z: -1500 }; // 1 m low on the 1500 m gong (ground 50 m)
    const hit = projectMissToGround(eye, impact, ground, 3100)!;
    expect(hit).not.toBeNull();
    // It lands ON the slope, at the slope's own height there.
    expect(hit.y).toBeCloseTo(ground(Math.abs(hit.z)) + GROUND_PUFF_LIFT_M, 1);
    // Well above the flat-ground answer, which would have been near y = 0.
    expect(hit.y).toBeGreaterThan(20);
  });

  it('a low miss lands SHORT of the target it was aimed at', () => {
    const targetR = 2000;
    const impact = { x: 0, y: ground(targetR) - 3, z: -targetR };
    const hit = projectMissToGround(eye, impact, ground, 3100)!;
    expect(Math.abs(hit.z)).toBeLessThan(targetR);
    expect(Math.abs(hit.z)).toBeGreaterThan(targetR * 0.5); // but not absurdly short
  });

  it('never reports a strike below the surface', () => {
    for (const targetR of [500, 1000, 1500, 2000, 2500, 3000]) {
      const impact = { x: 0, y: ground(targetR) - 2, z: -targetR };
      const hit = projectMissToGround(eye, impact, ground, 3100);
      if (hit) expect(hit.y).toBeGreaterThanOrEqual(ground(Math.abs(hit.z)));
    }
  });

  it('is insensitive to step size — 2 m and 0.25 m agree closely', () => {
    const impact = { x: 1, y: 40, z: -1500 };
    const coarse = projectMissToGround(eye, impact, ground, 3100, 2)!;
    const fine = projectMissToGround(eye, impact, ground, 3100, 0.25)!;
    expect(coarse.z).toBeCloseTo(fine.z, 0);
    expect(coarse.y).toBeCloseTo(fine.y, 0);
  });

  it('returns null if the shooter is somehow already underground', () => {
    const buried = { x: 0, y: -5, z: 0 };
    expect(projectMissToGround(buried, { x: 0, y: -10, z: -100 }, ground, 3100)).toBeNull();
  });
});
