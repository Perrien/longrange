// Range-type registry tests (task 2.3a, D1).
import { describe, expect, it } from 'vitest';
import { getRangeDefinition, listRanges } from './ranges';

describe('range registry', () => {
  it('lists all enterable ranges in landing order (range-a first)', () => {
    const ids = listRanges().map((r) => r.id);
    expect(ids).toEqual(['range-a', 'sight-in', 'test-range', 'wooded-zero']);
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
    expect(flags('range-a')).toBe(true);
    expect(flags('sight-in')).toBe(true);
    expect(flags('test-range')).toBe(false);
    expect(flags('wooded-zero')).toBe(false);
  });

  it('marks both zeroing bays as paper and both non-zero ranges as steel', () => {
    const kind = (id: string) => getRangeDefinition(id).targetKind;
    expect(kind('sight-in')).toBe('paper');
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

  it('resolves the sight-in range as a zeroable sight-in bay with 3 stations', () => {
    const r = getRangeDefinition('sight-in');
    expect(r.sceneType).toBe('sight-in');
    expect(r.zeroable).toBe(true);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations.map((s) => s.nominalDistance)).toEqual([50, 100, 200]);
  });

  it('resolves the test range as a non-zeroable test-range scene with no fixed stations', () => {
    const r = getRangeDefinition('test-range');
    expect(r.sceneType).toBe('test-range');
    expect(r.zeroable).toBe(false);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations).toHaveLength(0);
  });

  it('lays the sight-in stations out 50-left / 100-centre / 200-right (D4)', () => {
    const r = getRangeDefinition('sight-in');
    const bySide = new Map(r.stations.map((s) => [s.nominalDistance, s.side]));
    expect(bySide.get(50)).toBe(-1);
    expect(bySide.get(100)).toBe(0);
    expect(bySide.get(200)).toBe(1);
  });

  it('throws on an unknown range id', () => {
    expect(() => getRangeDefinition('nope')).toThrow(/unknown range id/);
  });
});
