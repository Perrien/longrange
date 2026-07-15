// Tests for wind marker placement (task 1.7b). Pure data — mirrors
// range-a-config.test.ts's style, including its ray-projection occlusion check
// (adapted here for "does a marker sit in front of a farther plate row").

import { describe, it, expect } from 'vitest';
import { WIND_MARKERS, MARKER_OFFSET_YARDS } from './wind-markers-config';
import { RANGE_A_RACKS, RANGE_A_GROUND } from './range-a-config';
import { yardsToMeters } from '../units';

describe('wind marker placement', () => {
  it('has 5 markers at 100/200/300/400/500 yd, ascending', () => {
    expect(WIND_MARKERS).toHaveLength(5);
    expect(WIND_MARKERS.map((m) => m.distanceYards)).toEqual([100, 200, 300, 400, 500]);
    for (let i = 1; i < WIND_MARKERS.length; i++) {
      expect(WIND_MARKERS[i].distanceM).toBeGreaterThan(WIND_MARKERS[i - 1].distanceM);
    }
  });

  it('every marker distance matches SI = yards × 0.9144 and an existing rack', () => {
    for (const m of WIND_MARKERS) {
      expect(m.distanceM).toBeCloseTo(yardsToMeters(m.distanceYards), 9);
      expect(RANGE_A_RACKS.some((r) => r.distanceYards === m.distanceYards)).toBe(true);
    }
  });

  it('is offset well to one side of the firing line (not on the centreline)', () => {
    for (const m of WIND_MARKERS) {
      expect(m.xOffsetM).toBeCloseTo(yardsToMeters(MARKER_OFFSET_YARDS), 9);
      expect(Math.abs(m.xOffsetM)).toBeGreaterThan(3); // clearly off-centre
    }
  });

  it('sits inside the Range A ground strip (not off the mapped world)', () => {
    for (const m of WIND_MARKERS) {
      expect(Math.abs(m.xOffsetM)).toBeLessThan(RANGE_A_GROUND.laneWidthM / 2);
      expect(m.distanceM).toBeLessThan(RANGE_A_GROUND.laneLengthM);
    }
  });

  // Regression guard (plan 1.7b step 1: "offset... so they never occlude a
  // plate row"; "add a regression test that no marker sits on a plate
  // bearing"). Two checks, both via the eye→point ray-projection technique
  // range-a-config.test.ts already uses for berms:
  //  (a) a marker doesn't physically overlap the plate spread of the rack at
  //      its OWN distance (it stands beside that rack, not inside it);
  //  (b) a marker's pole (ground → top) never crosses in front of a FARTHER
  //      rack's plate row, at the point the sight ray reaches that rack.
  // Change the rack ladder (widths/offsets) and this forces MARKER_OFFSET_YARDS
  // to be re-checked, same discipline as X_OFFSET_YARDS.
  it('no marker overlaps its own rack, or occludes a farther rack\'s plate row', () => {
    const EYE_Y = 1.6;
    const MARGIN_M = 0.3; // clearance beyond the physical footprint
    const MARKER_RADIUS_M = 0.15; // pole + flag/sock, generously

    for (const marker of WIND_MARKERS) {
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
