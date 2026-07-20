// Range-type registry tests (task 2.3a, D1).
import { describe, expect, it } from 'vitest';
import { getRangeDefinition, listRanges } from './ranges';

describe('range registry', () => {
  it('lists both ranges in landing order (range-a first)', () => {
    const ids = listRanges().map((r) => r.id);
    expect(ids).toEqual(['range-a', 'sight-in']);
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
