// Tests for the Range A layout config (task 1.2). Pure data — runs in the node
// test env (no Three.js / DOM). Verifies the ladder shape and the invariants the
// scene and later shot loop rely on.

import { describe, it, expect } from 'vitest';
import { RANGE_A_RACKS, RANGE_A_GROUND } from './range-a-config';
import { yardsToMeters, inchesToMeters, radToMoa } from '../units';

const maxPlate = (r: (typeof RANGE_A_RACKS)[number]) =>
  Math.max(...r.plates.map((p) => p.diameterM));

describe('Range A rack ladder', () => {
  it('has one rack every 50 yd from 50 → 500 (10 racks)', () => {
    expect(RANGE_A_RACKS).toHaveLength(10);
    expect(RANGE_A_RACKS.map((r) => r.distanceYards)).toEqual([
      50, 100, 150, 200, 250, 300, 350, 400, 450, 500,
    ]);
  });

  it('is ordered near → far with SI distance = yards × 0.9144', () => {
    for (let i = 1; i < RANGE_A_RACKS.length; i++) {
      expect(RANGE_A_RACKS[i].distanceM).toBeGreaterThan(RANGE_A_RACKS[i - 1].distanceM);
    }
    const r250 = RANGE_A_RACKS.find((r) => r.distanceYards === 250)!;
    expect(r250.distanceM).toBeCloseTo(yardsToMeters(250), 9);
    expect(r250.distanceM).toBeCloseTo(228.6, 6);
  });

  it('every rack carries its plates largest-first, no smaller than 2″', () => {
    for (const r of RANGE_A_RACKS) {
      expect(r.plates.length).toBeGreaterThanOrEqual(2);
      for (let i = 1; i < r.plates.length; i++) {
        expect(r.plates[i].diameterM).toBeLessThan(r.plates[i - 1].diameterM);
      }
      for (const p of r.plates) {
        // BTK's physical floor: no plate smaller than 2″ anywhere (no coins).
        expect(p.inches).toBeGreaterThanOrEqual(2);
      }
    }
  });

  it('carries 5 plates on every rack (matching BTK near racks)', () => {
    for (const r of RANGE_A_RACKS) expect(r.plates.length).toBe(5);
  });

  it('sizes plates from the AUTHORED BTK steel-sim ladder', () => {
    for (const r of RANGE_A_RACKS) {
      for (const p of r.plates) {
        // diameter comes from the nominal inch size…
        expect(p.diameterM).toBeCloseTo(inchesToMeters(p.inches), 9);
        // …and MOA is derived metadata (plate ⌀ over range).
        expect(p.moa).toBeCloseTo(radToMoa(p.diameterM / r.distanceM), 9);
      }
      // Angular band sanity: every plate between ~0.6 MOA (hard, far) and ~12
      // MOA (easy, near) — wider than the old scheme now that a close 50-yd rack
      // (big MOA) and sub-MOA far plates (BTK 300 yd carries a 2″) both exist.
      for (const p of r.plates) {
        expect(p.moa).toBeGreaterThan(0.6);
        expect(p.moa).toBeLessThan(12);
      }
    }
    // BTK-exact sets where BTK defines the distance; grown ladders elsewhere:
    const inchesAt = (yd: number) =>
      RANGE_A_RACKS.find((r) => r.distanceYards === yd)!.plates.map((p) => p.inches);
    expect(inchesAt(100)).toEqual([6, 5, 4, 3, 2]); // = BTK 100 yd
    expect(inchesAt(200)).toEqual([6, 5, 4, 3, 2]); // = BTK 200 yd
    expect(inchesAt(400)).toEqual([8, 6, 5, 4, 3]); // BTK 400 yd tops at 8″
    expect(inchesAt(500)).toEqual([12, 10, 8, 6, 4]); // ⊂ BTK 500 yd {12,10,8,6,4,2}
    // Physical size still grows near → far (BTK's "chips near, gongs far").
    const near = RANGE_A_RACKS[0];
    const far = RANGE_A_RACKS[RANGE_A_RACKS.length - 1];
    expect(maxPlate(far)).toBeGreaterThan(maxPlate(near));
    // And the near rack is human-scale, not coins: smallest plate ≥ 2″ (~5 cm).
    expect(Math.min(...near.plates.map((p) => p.diameterM))).toBeGreaterThanOrEqual(0.0508);
  });

  it('rack frame is AUTHORED, independent of plate size (BTK model)', () => {
    // Fixed rack width ladder in yards (1.5 → 3), NOT derived from the plates.
    const widthYd = (yd: number) =>
      RANGE_A_RACKS.find((r) => r.distanceYards === yd)!.rackWidthM / yardsToMeters(1);
    expect(widthYd(100)).toBeCloseTo(1.5, 9);
    expect(widthYd(400)).toBeCloseTo(2, 9);
    expect(widthYd(500)).toBeCloseTo(3, 9);
    // Beam height is a constant authored frame (same for every rack).
    const beams = RANGE_A_RACKS.map((r) => r.beamHeightM);
    for (const b of beams) expect(b).toBeCloseTo(beams[0], 9);
    // Plates hang at ~half the beam height (dropped from ~0.73×).
    for (const r of RANGE_A_RACKS) {
      expect(r.plateCenterYM / r.beamHeightM).toBeCloseTo(0.5, 9);
    }
  });

  it('beam clears the tallest plate; berm is a low, WIDE mound (not a wall)', () => {
    for (const r of RANGE_A_RACKS) {
      const plateTop = r.plateCenterYM + maxPlate(r) / 2;
      expect(r.beamHeightM).toBeGreaterThan(plateTop);
      // steel-sim proportions: base spans ≈ 2× rack width, height ≈ rack height.
      expect(r.berm.baseHalfWidthM).toBeGreaterThan(r.rackWidthM / 2);
      // low + wide: the base is much broader than the mound is tall.
      const baseWidth = 2 * r.berm.baseHalfWidthM;
      expect(baseWidth).toBeGreaterThan(2 * r.berm.heightM);
      // still just clears the beam so it reads as a backstop.
      expect(r.berm.heightM).toBeGreaterThan(r.beamHeightM);
    }
  });

  it('rack is wide enough to spread its plates without overlap', () => {
    for (const r of RANGE_A_RACKS) {
      const sumD = r.plates.reduce((s, p) => s + p.diameterM, 0);
      expect(r.rackWidthM).toBeGreaterThan(sumD);
    }
  });

  // Regression guard for the owner-reported bug: farther racks hidden behind (or
  // grazing the crest of) nearer berms. With the low-wide berms + solved fan
  // offsets, every plate row either misses a nearer berm laterally or clears its
  // crest by ≥ CREST_MARGIN so racks read as distinct, not stacked. Change the
  // berm/plate sizing and this fails → re-solve X_OFFSET_YARDS.
  it('no plate row is occluded by, or grazing, a nearer berm crest (1.6 m eye)', () => {
    const EYE_Y = 1.6;
    const SAMPLES = 7;
    const CREST_MARGIN = 0.25; // metres of clearance above the near berm top
    for (let i = 0; i < RANGE_A_RACKS.length; i++) {
      const ri = RANGE_A_RACKS[i];
      for (let k = 0; k < SAMPLES; k++) {
        // sample across the plate row at plate-centre height
        const sx = ri.xOffsetM + ri.rackWidthM * (k / (SAMPLES - 1) - 0.5);
        for (let j = 0; j < i; j++) {
          const rj = RANGE_A_RACKS[j];
          const t = rj.distanceM / ri.distanceM; // where the ray crosses berm j
          const rayX = sx * t;
          const rayY = EYE_Y + (ri.plateCenterYM - EYE_Y) * t;
          const withinX = Math.abs(rayX - rj.xOffsetM) < rj.berm.baseHalfWidthM;
          const belowCrest = rayY < rj.berm.heightM + CREST_MARGIN;
          expect(withinX && belowCrest).toBe(false);
        }
      }
    }
  });
});

describe('Range A ground', () => {
  it('extends past the 500-yd rack and its berm', () => {
    const far = RANGE_A_RACKS[RANGE_A_RACKS.length - 1];
    expect(RANGE_A_GROUND.laneLengthM).toBeGreaterThan(
      far.distanceM + far.berm.behindM + far.berm.depthM / 2,
    );
  });
});
