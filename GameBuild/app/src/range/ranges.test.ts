// Range-type registry tests (task 2.3a, D1).
import { describe, expect, it } from 'vitest';
import {
  getRangeDefinition,
  listRanges,
  cameraReachFor,
  shotBudgetFor,
  DEFAULT_CAMERA_REACH,
} from './ranges';

describe('range registry', () => {
  it('lists all enterable ranges in landing order (range-a first)', () => {
    const ids = listRanges().map((r) => r.id);
    expect(ids).toEqual(['range-a', 'test-range', 'wooded-zero', 'elr-range']);
  });

  it('resolves the wooded zero range by id', () => {
    expect(getRangeDefinition('wooded-zero').name).toBe('Wooded Zero');
  });

  it('declares a targetKind for every range', () => {
    for (const r of listRanges()) expect(['paper', 'steel']).toContain(r.targetKind);
  });

  it('plants wind flags only on the ranges that are about reading wind', () => {
    // Off on the two ranges whose point is something else: the Test Range is a
    // calm fundamentals sandbox, and the Wooded Zero Range carries only a token
    // breeze (owner, 2026-07-26 — "there are flags for wind, remove them").
    const flags = (id: string) => getRangeDefinition(id).windMarkers;
    expect(flags('range-a')).toBe('range-a');
    expect(flags('test-range')).toBeNull();
    expect(flags('wooded-zero')).toBeNull();
  });

  it('marks the zeroing bay as paper and both non-zero ranges as steel', () => {
    const kind = (id: string) => getRangeDefinition(id).targetKind;
    expect(kind('wooded-zero')).toBe('paper');
    expect(kind('range-a')).toBe('steel');
    expect(kind('test-range')).toBe('steel');
  });

  it('resolves Range A as a non-zeroable steel range with no fixed stations', () => {
    const r = getRangeDefinition('range-a');
    expect(r.sceneType).toBe('steel-racks');
    expect(r.zeroable).toBe(false);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations).toHaveLength(0);
  });

  it('resolves the wooded zero range as a zeroable paper bay with 4 stations', () => {
    const r = getRangeDefinition('wooded-zero');
    expect(r.sceneType).toBe('wooded-zero');
    expect(r.zeroable).toBe(true);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations.map((s) => s.nominalDistance)).toEqual([25, 50, 100, 200]);
  });

  it('resolves the test range as a non-zeroable test-range scene with no fixed stations', () => {
    const r = getRangeDefinition('test-range');
    expect(r.sceneType).toBe('test-range');
    expect(r.zeroable).toBe(false);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations).toHaveLength(0);
  });

  it('throws on an unknown range id', () => {
    expect(() => getRangeDefinition('nope')).toThrow(/unknown range id/);
  });

  describe('elr-range registry row', () => {
    it('resolves by id with the right kind', () => {
      const def = getRangeDefinition('elr-range');
      expect(def.sceneType).toBe('elr-range');
      expect(def.targetKind).toBe('steel');
      expect(def.zeroable).toBe(false);
      expect(def.windMarkers).toBe('elr');
    });

    it('carries the reach a 2 km world needs', () => {
      const reach = cameraReachFor(getRangeDefinition('elr-range'));
      expect(reach.farM).toBeGreaterThanOrEqual(2400);
      expect(reach.nearM).toBeGreaterThanOrEqual(10);
    });

    it('appears on the range-select list', () => {
      expect(listRanges().map((r) => r.id)).toContain('elr-range');
    });

    it('uses the default shot budget, like every real range', () => {
      expect(shotBudgetFor(getRangeDefinition('elr-range'))).toBeUndefined();
    });

    it('leaves every shipped range on the default camera', () => {
      for (const id of ['range-a', 'test-range', 'wooded-zero']) {
        expect(cameraReachFor(getRangeDefinition(id))).toEqual(DEFAULT_CAMERA_REACH);
      }
    });
  });
});
