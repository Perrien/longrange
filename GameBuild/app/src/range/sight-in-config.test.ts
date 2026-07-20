// Sight-in layout tests (task 2.3c, D3/D4/D7).
import { describe, expect, it } from 'vitest';
import {
  snapshotSightIn,
  MOA_TARGET_SIZE_M,
  MIL_TARGET_SIZE_M,
  LATERAL_OFFSET_M,
} from './sight-in-config';
import { yardsToMeters } from '../units/length';

describe('snapshotSightIn (D3/D4/D7)', () => {
  it('metric (MIL): 50/100/200 m stations, MIL art, 44 cm face', () => {
    const l = snapshotSightIn('MIL');
    expect(l.system).toBe('metric');
    expect(l.artVariant).toBe('mil');
    expect(l.targetSizeM).toBe(MIL_TARGET_SIZE_M);
    expect(l.stations.map((s) => s.distanceM)).toEqual([50, 100, 200]);
    expect(l.stations.map((s) => s.nominalDistance)).toEqual([50, 100, 200]);
  });

  it('imperial (MOA): 50/100/200 yd stations (SI), MOA art, 22 in face', () => {
    const l = snapshotSightIn('MOA');
    expect(l.system).toBe('imperial');
    expect(l.artVariant).toBe('moa');
    expect(l.targetSizeM).toBeCloseTo(MOA_TARGET_SIZE_M, 10);
    expect(l.targetSizeM).toBeCloseTo(0.5588, 10);
    expect(l.stations[0].distanceM).toBeCloseTo(yardsToMeters(50), 10);
    expect(l.stations[1].distanceM).toBeCloseTo(yardsToMeters(100), 10);
    expect(l.stations[2].distanceM).toBeCloseTo(yardsToMeters(200), 10);
  });

  it('lays targets out 50-left / 100-centre / 200-right (D4)', () => {
    const l = snapshotSightIn('MIL');
    const byNominal = new Map(l.stations.map((s) => [s.nominalDistance, s.xOffsetM]));
    expect(byNominal.get(50)).toBe(-LATERAL_OFFSET_M);
    expect(byNominal.get(100)).toBe(0);
    expect(byNominal.get(200)).toBe(LATERAL_OFFSET_M);
  });

  it('the two variants are different physical sizes (D7 size split)', () => {
    expect(snapshotSightIn('MIL').targetSizeM).not.toBeCloseTo(snapshotSightIn('MOA').targetSizeM, 3);
  });

  it('a held snapshot is stable across a later units flip (D3)', () => {
    // Snapshot metric, then "flip" by taking a new imperial snapshot: the first
    // object is unchanged (pure value — a flip cannot mutate a held layout).
    const metric = snapshotSightIn('MIL');
    const before = JSON.stringify(metric);
    snapshotSightIn('MOA'); // a mid-session flip re-derives; must not touch `metric`
    expect(JSON.stringify(metric)).toBe(before);
    expect(metric.targetSizeM).toBe(MIL_TARGET_SIZE_M);
  });
});
