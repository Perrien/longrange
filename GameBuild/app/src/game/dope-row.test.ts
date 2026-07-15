import { describe, expect, it } from 'vitest';
import { angleAtRange, formatDopeRow } from './dope-row';
import { metersToYards, metersToCentimeters, metersToInches, mpsToFps, milToRad } from '../units';
import type { TrajectoryRow } from '../engine-bridge/types';

const row = (partial: Partial<TrajectoryRow>): TrajectoryRow => ({
  rangeM: 300,
  dropM: 0,
  windageM: 0,
  velocityMps: 700,
  timeOfFlightS: 0.5,
  energyJ: 1000,
  ...partial,
});

describe('angleAtRange (task 1.6d)', () => {
  it('1 m offset at 1000 m ≈ 1 mil (mil-relation sanity, matches state.test.ts)', () => {
    expect(angleAtRange(1, 1000)).toBeCloseTo(milToRad(1), 6);
  });

  it('is exact atan2, not the linearized approximation, at close range', () => {
    // At 10 m with a 1 m offset the small-angle approximation (0.1 rad) already
    // diverges from atan2 by a measurable amount — confirm we use the exact form.
    const exact = Math.atan2(1, 10);
    expect(angleAtRange(1, 10)).toBeCloseTo(exact, 12);
    expect(angleAtRange(1, 10)).not.toBeCloseTo(0.1, 4);
  });
});

describe('formatDopeRow (task 1.6d)', () => {
  it('a zero-offset row (at the zero range) has zero come-up and wind hold', () => {
    const out = formatDopeRow(row({ rangeM: 300, dropM: 0, windageM: 0 }));
    expect(out.dropMilMoa.mil).toBe(0);
    expect(out.dropMilMoa.moa).toBe(0);
    expect(out.windMilMoa.mil).toBe(0);
    expect(out.rangeYd).toBeCloseTo(metersToYards(300), 9);
  });

  it('converts drop/windage into dual-unit linear + angular fields', () => {
    const out = formatDopeRow(row({ rangeM: 1000, dropM: -1, windageM: 0.5, velocityMps: 800 }));
    expect(out.dropCm).toBeCloseTo(metersToCentimeters(-1), 9);
    expect(out.dropIn).toBeCloseTo(metersToInches(-1), 9);
    expect(out.dropMilMoa.mil).toBeCloseTo(-1, 2); // ~1 mil for 1 m @ 1000 m
    expect(out.windCm).toBeCloseTo(metersToCentimeters(0.5), 9);
    expect(out.windIn).toBeCloseTo(metersToInches(0.5), 9);
    expect(out.windMilMoa.mil).toBeCloseTo(0.5, 2);
    expect(out.velocityFps).toBeCloseTo(mpsToFps(800), 9);
  });

  it('two independent calls on the same row produce identical rows (deterministic, no hidden state)', () => {
    const r = row({ rangeM: 500, dropM: -2.3, windageM: 0.8, velocityMps: 650 });
    expect(formatDopeRow(r)).toEqual(formatDopeRow(r));
  });
});
