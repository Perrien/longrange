import { describe, it, expect } from 'vitest';
import {
  generateRangeTreePlacements, isPlaceable, MAX_TREES, TREE_SEED,
} from './elr-range-trees';
import {
  groundY, GROUND_WIDTH_M, GROUND_LENGTH_M, FIRING_POINT_CLEAR_RADIUS_M,
} from './elr-range-config';
import { TREE_VARIANTS_PER_KIND } from './environment/environment-config';

describe('generateRangeTreePlacements', () => {
  it('returns exactly the requested count', () => {
    for (const n of [0, 250, 1000, MAX_TREES]) {
      expect(generateRangeTreePlacements(n, 4)).toHaveLength(n);
    }
  });

  it('is deterministic across calls', () => {
    expect(generateRangeTreePlacements(500, 4)).toEqual(generateRangeTreePlacements(500, 4));
  });

  // LOAD-BEARING: offsets are solved against the full field, so every smaller
  // draw count must be a strict prefix or targets end up behind trees.
  it('makes every smaller count a prefix of the full field', () => {
    const full = generateRangeTreePlacements(MAX_TREES, 4);
    for (const n of [250, 500, 1000, 2000]) {
      expect(full.slice(0, n)).toEqual(generateRangeTreePlacements(n, 4));
    }
  });

  it('stands every tree ON the convex ground, not on a flat plane', () => {
    const trees = generateRangeTreePlacements(1000, 4);
    for (const t of trees) expect(t.y).toBeCloseTo(groundY(-t.z), 9);
    const ys = trees.map((t) => t.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it('keeps the firing points clear and puts trees everywhere else', () => {
    const trees = generateRangeTreePlacements(2000, 4);
    for (const t of trees) {
      expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(FIRING_POINT_CLEAR_RADIUS_M);
    }
    // There is NO cleared lane — prove the centre is populated.
    expect(trees.some((t) => Math.abs(t.x) < 20)).toBe(true);
  });

  it('stays inside the drawn ground', () => {
    for (const t of generateRangeTreePlacements(2000, 4)) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(GROUND_WIDTH_M / 2);
      expect(t.z).toBeLessThanOrEqual(0);
      expect(t.z).toBeGreaterThanOrEqual(-GROUND_LENGTH_M);
    }
  });

  it('emits indices the renderer can use', () => {
    for (const t of generateRangeTreePlacements(500, 4)) {
      expect(t.variantIndex).toBeGreaterThanOrEqual(0);
      expect(t.variantIndex).toBeLessThan(TREE_VARIANTS_PER_KIND);
      expect(t.tintIndex).toBeGreaterThanOrEqual(0);
      expect(t.tintIndex).toBeLessThan(4);
      expect(t.scaleXZ).toBeGreaterThan(0);
      expect(t.scaleY).toBeGreaterThan(0);
    }
  });

  it('pins the seed, so the range is the same on every device', () => {
    expect(TREE_SEED).toBe(20260728);
  });
});

describe('isPlaceable', () => {
  it('rejects the firing-point ring and accepts the sight line', () => {
    expect(isPlaceable(0, -(FIRING_POINT_CLEAR_RADIUS_M - 1))).toBe(false);
    expect(isPlaceable(0, -(FIRING_POINT_CLEAR_RADIUS_M + 1))).toBe(true);
    expect(isPlaceable(0, -1000)).toBe(true);
  });
});
