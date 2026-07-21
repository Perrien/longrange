// Tests for the Test Range placeholder config (Stage 1 of
// Design/Plans/test-range-environment-plan.md). Pure data — node test env, no
// Three.js/DOM.

import { describe, it, expect } from 'vitest';
import { TEST_RANGE_GONG, TEST_RANGE_GROUND } from './test-range-config';
import { WIND_MARKERS, MARKER_OFFSET_YARDS } from './wind-markers-config';
import { yardsToMeters, inchesToMeters } from '../units';

describe('Test Range gong', () => {
  it('is a 12" gong at 100 yd', () => {
    expect(TEST_RANGE_GONG.gongDiameterM).toBeCloseTo(inchesToMeters(12), 9);
    expect(TEST_RANGE_GONG.distanceM).toBeCloseTo(yardsToMeters(100), 9);
  });

  it('fits the rack and hangs below the beam', () => {
    expect(TEST_RANGE_GONG.gongDiameterM).toBeLessThan(TEST_RANGE_GONG.rackWidthM);
    expect(TEST_RANGE_GONG.plateCenterYM + TEST_RANGE_GONG.gongDiameterM / 2).toBeLessThan(
      TEST_RANGE_GONG.beamHeightM,
    );
  });
});

describe('Test Range ground + wind-marker fit', () => {
  it('keeps exactly the 100-yd wind marker under the lane-length filter', () => {
    const surviving = WIND_MARKERS.filter((m) => m.distanceM <= TEST_RANGE_GROUND.laneLengthM - 10);
    expect(surviving.map((m) => m.distanceYards)).toEqual([100]);
  });

  it('fits the surviving marker laterally inside the lane', () => {
    expect(yardsToMeters(MARKER_OFFSET_YARDS)).toBeLessThan(TEST_RANGE_GROUND.laneWidthM / 2);
  });
});
