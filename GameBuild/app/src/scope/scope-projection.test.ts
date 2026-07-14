// Scope projection invariants (task 1.3a). The ranging mechanic (Increment 2)
// leans on these, so they are pinned hard:
//   1. A 1-mil subtension spans exactly 1/1000 of the range at the target plane.
//   2. FFP: a known target reads the SAME mils/MOA on the reticle at every zoom
//      (the projection is exact under the linear model, and agrees with the real
//      perspective camera's tan projection to < 0.1% at scope FOVs).

import { describe, it, expect } from 'vitest';
import {
  fovRadForMag,
  pixelsPerRadian,
  pixelsPerMil,
  pixelsPerMoa,
  angularSizeRad,
  subtendedMil,
  subtendedMoa,
  worldSizeToPixels,
} from './scope-projection';
import { linearSubtension, milToRad, milToMoa } from '../units';

const H = 900; // a viewport height, CSS px

describe('mil-relation anchor (ranging ground truth)', () => {
  it('1 mil subtends exactly 1/1000 of the range at the target plane', () => {
    for (const distM of [45.72, 228.6, 457.2, 914.4]) {
      expect(linearSubtension(milToRad(1), distM)).toBeCloseTo(distM / 1000, 12);
      // and the projection's own subtension agrees: a target 1/1000 of range = 1 mil.
      expect(subtendedMil(distM / 1000, distM)).toBeCloseTo(1, 12);
    }
  });

  it('subtendedMoa is subtendedMil converted through the units service', () => {
    expect(subtendedMoa(0.3048, 457.2)).toBeCloseTo(milToMoa(subtendedMil(0.3048, 457.2)), 12);
  });
});

describe('pixel scale', () => {
  it('mil and MOA pixel scales hold the exact 1 mil = 3.43774677 MOA ratio', () => {
    const fov = fovRadForMag(10);
    expect(pixelsPerMil(fov, H) / pixelsPerMoa(fov, H)).toBeCloseTo(3.43774677, 6);
  });

  it('pixels-per-radian scales linearly with magnification (narrower FOV → more px/rad)', () => {
    expect(pixelsPerRadian(fovRadForMag(30), H) / pixelsPerRadian(fovRadForMag(10), H)).toBeCloseTo(3, 12);
  });
});

describe('FFP invariant — same subtension in mils at any zoom', () => {
  // A 12" plate at 500 yd, and a 6" plate at 100 yd, across the zoom range.
  const cases = [
    { sizeM: 0.3048, distM: 457.2 },
    { sizeM: 0.1524, distM: 91.44 },
  ];

  it('worldSizeToPixels / pixelsPerMil equals the true subtension at 10x AND 30x (exact, linear model)', () => {
    for (const { sizeM, distM } of cases) {
      const trueMil = subtendedMil(sizeM, distM);
      for (const mag of [4.5, 10, 18, 30, 35]) {
        const fov = fovRadForMag(mag);
        expect(worldSizeToPixels(sizeM, distM, fov, H) / pixelsPerMil(fov, H)).toBeCloseTo(trueMil, 10);
      }
    }
  });

  it('the reticle-mils reading is identical at 10x and 30x', () => {
    for (const { sizeM, distM } of cases) {
      const at = (mag: number) => {
        const fov = fovRadForMag(mag);
        return worldSizeToPixels(sizeM, distM, fov, H) / pixelsPerMil(fov, H);
      };
      expect(at(10)).toBeCloseTo(at(30), 12);
    }
  });

  // Prove the linear reticle agrees with the REAL camera (tan/gnomonic) projection
  // the world is rendered with, so the on-screen plate lines up with the hashes.
  // A centred feature of angular size α spans (H)·tan(α/2)/tan(fov/2) px on a
  // perspective camera; the linear reticle mil = H·0.001/fov. Their ratio must be
  // the true mil reading, and must be zoom-stable, to < 0.1%.
  it('agrees with the perspective (tan) projection at scope FOVs, both zooms, < 0.1%', () => {
    const platePxTan = (sizeM: number, distM: number, fov: number): number =>
      H * Math.tan(angularSizeRad(sizeM, distM) / 2) / Math.tan(fov / 2);
    for (const { sizeM, distM } of cases) {
      const trueMil = subtendedMil(sizeM, distM);
      const readAt = (mag: number) => {
        const fov = fovRadForMag(mag);
        return platePxTan(sizeM, distM, fov) / pixelsPerMil(fov, H);
      };
      const r10 = readAt(10);
      const r30 = readAt(30);
      expect(Math.abs(r10 - trueMil) / trueMil).toBeLessThan(1e-3);
      expect(Math.abs(r30 - trueMil) / trueMil).toBeLessThan(1e-3);
      expect(Math.abs(r10 - r30) / trueMil).toBeLessThan(1e-3);
    }
  });
});
