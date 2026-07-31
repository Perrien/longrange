// Tests for wind marker placement (task 1.7b; per-range ladders added
// wind-system-btk-port W1). Pure data — mirrors range-a-config.test.ts's style,
// including its ray-projection occlusion check (adapted here for "does a marker
// sit in front of a farther plate/gong row").

import { describe, it, expect } from 'vitest';
import {
  RANGE_A_WIND_MARKERS,
  ELR_WIND_MARKERS,
  MARKER_OFFSET_YARDS,
  ELR_MARKER_OFFSET_YARDS,
  MARKER_POLE_HEIGHT_M,
  windMarkersFor,
} from './wind-markers-config';
import { RANGE_A_RACKS, RANGE_A_GROUND } from './range-a-config';
import {
  groundY,
  solveLayout,
  eyeYFor,
  GROUND_WIDTH_M,
  GROUND_LENGTH_M,
} from './elr-range-config';
import { generateRangeTreePlacements, MAX_TREES } from './elr-range-trees';
import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';
import { occludingTreeIndices, marginForPlate, type Occluder } from './sight-clearance';
import { yardsToMeters } from '../units';

// Swept radius of pole + flag as a single occluding circle (P11): under D1 the
// pole is 2.74 m tall and the flag reaches ~1.83 m downwind of it, so 0.15 m
// (the pre-D1 "pole only" figure) badly understates it. 2.0 m is the value the
// plan calls out and what the offline re-solve (see wind-markers-config.ts's
// MARKER_OFFSET_YARDS / ELR_MARKER_OFFSET_YARDS comments) was solved against.
const MARKER_RADIUS_M = 2.0;

describe('windMarkersFor', () => {
  it('resolves range-a, elr and null', () => {
    expect(windMarkersFor('range-a')).toBe(RANGE_A_WIND_MARKERS);
    expect(windMarkersFor('elr')).toBe(ELR_WIND_MARKERS);
    expect(windMarkersFor(null)).toEqual([]);
  });
});

describe('Range A wind markers', () => {
  it('has 5 markers at 100/200/300/400/500 yd, ascending', () => {
    expect(RANGE_A_WIND_MARKERS).toHaveLength(5);
    expect(RANGE_A_WIND_MARKERS.map((m) => m.distanceYards)).toEqual([100, 200, 300, 400, 500]);
    for (let i = 1; i < RANGE_A_WIND_MARKERS.length; i++) {
      expect(RANGE_A_WIND_MARKERS[i].distanceM).toBeGreaterThan(RANGE_A_WIND_MARKERS[i - 1].distanceM);
    }
  });

  it('every marker distance matches SI = yards × 0.9144 and an existing rack', () => {
    for (const m of RANGE_A_WIND_MARKERS) {
      expect(m.distanceM).toBeCloseTo(yardsToMeters(m.distanceYards), 9);
      expect(RANGE_A_RACKS.some((r) => r.distanceYards === m.distanceYards)).toBe(true);
    }
  });

  it('is planted flat (groundYM = 0) — Range A has no terrain rise', () => {
    for (const m of RANGE_A_WIND_MARKERS) expect(m.groundYM).toBe(0);
  });

  it('is offset well to one side of the firing line (not on the centreline)', () => {
    for (const m of RANGE_A_WIND_MARKERS) {
      expect(m.xOffsetM).toBeCloseTo(yardsToMeters(MARKER_OFFSET_YARDS), 9);
      expect(Math.abs(m.xOffsetM)).toBeGreaterThan(3); // clearly off-centre
    }
  });

  it('sits inside the Range A ground strip (not off the mapped world)', () => {
    for (const m of RANGE_A_WIND_MARKERS) {
      expect(Math.abs(m.xOffsetM)).toBeLessThan(RANGE_A_GROUND.laneWidthM / 2);
      expect(m.distanceM).toBeLessThan(RANGE_A_GROUND.laneLengthM);
    }
  });

  it('carries BTK\'s own pole height (D1: 3 yd)', () => {
    expect(MARKER_POLE_HEIGHT_M).toBeCloseTo(yardsToMeters(3), 9);
    for (const m of RANGE_A_WIND_MARKERS) expect(m.poleHeightM).toBeCloseTo(yardsToMeters(3), 9);
  });

  // Regression guard (plan 1.7b step 1; RE-SOLVED wind-system-btk-port W1/P11
  // under D1's bigger swept radius). Two checks, both via the eye→point
  // ray-projection technique range-a-config.test.ts already uses for berms:
  //  (a) a marker doesn't physically overlap the plate spread of the rack at
  //      its OWN distance (it stands beside that rack, not inside it);
  //  (b) a marker's pole (ground → top) never crosses in front of a FARTHER
  //      rack's plate row, at the point the sight ray reaches that rack.
  // Change the rack ladder (widths/offsets) OR the marker geometry (pole
  // height, swept radius) and this forces MARKER_OFFSET_YARDS to be re-checked,
  // same discipline as X_OFFSET_YARDS.
  it('no marker overlaps its own rack, or occludes a farther rack\'s plate row', () => {
    const EYE_Y = 1.6;
    const MARGIN_M = 0.3; // clearance beyond the physical footprint

    for (const marker of RANGE_A_WIND_MARKERS) {
      // (a) same-distance physical overlap.
      const ownRack = RANGE_A_RACKS.find((r) => r.distanceYards === marker.distanceYards);
      expect(ownRack).toBeDefined();
      if (ownRack) {
        const halfSpan = ownRack.rackWidthM / 2 + MARKER_RADIUS_M;
        expect(Math.abs(marker.xOffsetM - ownRack.xOffsetM)).toBeGreaterThanOrEqual(halfSpan);
      }

      // (b) farther-rack occlusion, sampled at the marker's base and pole top.
      for (const rack of RANGE_A_RACKS) {
        if (rack.distanceM <= marker.distanceM) continue; // only farther racks matter
        const maxPlateD = Math.max(...rack.plates.map((p) => p.diameterM));
        for (const markerY of [0, marker.poleHeightM]) {
          const t = rack.distanceM / marker.distanceM; // where the ray crosses rack's plane
          const rayX = marker.xOffsetM * t;
          const rayY = EYE_Y + (markerY - EYE_Y) * t;
          const withinX = Math.abs(rayX - rack.xOffsetM) < rack.rackWidthM / 2 + MARGIN_M;
          const withinY = Math.abs(rayY - rack.plateCenterYM) < maxPlateD / 2 + MARGIN_M;
          expect(withinX && withinY).toBe(false);
        }
      }
    }
  });
});

describe('ELR wind markers', () => {
  it('has 6 markers at 250/500/750/1000/1500/2000 m, ascending — a subset of the high line', () => {
    expect(ELR_WIND_MARKERS).toHaveLength(6);
    expect(ELR_WIND_MARKERS.map((m) => m.distanceM)).toEqual([250, 500, 750, 1000, 1500, 2000]);
    for (let i = 1; i < ELR_WIND_MARKERS.length; i++) {
      expect(ELR_WIND_MARKERS[i].distanceM).toBeGreaterThan(ELR_WIND_MARKERS[i - 1].distanceM);
    }
  });

  it('plants every marker ON the sloped terrain — groundYM = groundY(distance)', () => {
    for (const m of ELR_WIND_MARKERS) {
      expect(m.groundYM).toBeCloseTo(groundY(m.distanceM), 9);
    }
    // Not flat like Range A: the far markers really do sit higher than the near ones.
    expect(ELR_WIND_MARKERS[ELR_WIND_MARKERS.length - 1].groundYM).toBeGreaterThan(
      ELR_WIND_MARKERS[0].groundYM,
    );
  });

  it('carries BTK\'s own pole height (D1: 3 yd), same as Range A', () => {
    for (const m of ELR_WIND_MARKERS) expect(m.poleHeightM).toBeCloseTo(yardsToMeters(3), 9);
  });

  it('is offset well to one side of the firing line, inside the drawn ground', () => {
    for (const m of ELR_WIND_MARKERS) {
      expect(m.xOffsetM).toBeCloseTo(yardsToMeters(ELR_MARKER_OFFSET_YARDS), 9);
      expect(Math.abs(m.xOffsetM)).toBeGreaterThan(3);
      expect(Math.abs(m.xOffsetM)).toBeLessThan(GROUND_WIDTH_M / 2);
      expect(m.distanceM).toBeLessThanOrEqual(GROUND_LENGTH_M);
    }
  });

  // THE POINT OF THE EXERCISE (P11): re-solved against the ACTUAL solved
  // station layout, from BOTH firing points — the low line only reaches 500 m,
  // so only markers at or below that distance can possibly occlude a low-line
  // station; every marker can occlude a farther high-line station.
  it('occludes no station\'s gong bearing from either firing point', () => {
    const trees = generateRangeTreePlacements(MAX_TREES, WOODED_ZERO_ENVIRONMENT.trees.palette.length);
    const low = solveLayout('low', trees);
    const high = solveLayout('high', trees);
    const allStations = [...low.stations, ...high.stations];
    const eyeLow = { x: 0, y: eyeYFor('low'), z: 0 };
    const eyeHigh = { x: 0, y: eyeYFor('high'), z: 0 };

    for (const marker of ELR_WIND_MARKERS) {
      const z = -Math.sqrt(Math.max(0, marker.distanceM ** 2 - marker.xOffsetM ** 2));
      const occluder: Occluder = {
        x: marker.xOffsetM,
        z,
        radiusM: MARKER_RADIUS_M,
        topY: marker.groundYM + marker.poleHeightM,
      };

      // (a) same-distance physical overlap, either line.
      for (const s of allStations) {
        if (Math.abs(s.losRangeM - marker.distanceM) > 1e-6) continue;
        const sep = Math.hypot(occluder.x - s.x, occluder.z - s.z);
        expect(sep).toBeGreaterThanOrEqual(occluder.radiusM + s.frameWidthM / 2 + 0.3);
      }

      // (b) farther-station occlusion from both eyes.
      for (const s of allStations) {
        if (s.losRangeM <= marker.distanceM) continue;
        for (const eye of [eyeLow, eyeHigh]) {
          const hits = occludingTreeIndices(
            eye,
            { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
            [occluder],
            marginForPlate(s.gongDiameterM / 2),
          );
          expect(hits).toHaveLength(0);
        }
      }
    }
  });
});
