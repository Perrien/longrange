// Tree silhouette variety tests — Stage 4a of
// `Design/archive/mil-zero-range-plan.md`.
//
// The forest's synthetic look came from one silhouette repeated with uniform
// scale. These assert the properties that fix it actually hold across the whole
// placement set, since "looks varied" is not something a device check reliably
// catches — repetition is obvious in a screenshot but easy to talk yourself out
// of, and easy to regress silently when placement code changes.
import { describe, expect, it } from 'vitest';
import { generateTreePlacements, TREE_VARIANTS_PER_KIND } from './environment-config';
import { WOODED_ZERO_ENVIRONMENT } from '../wooded-zero-environment';
import { TEST_RANGE_ENVIRONMENT } from '../test-range-config';

const CONFIGS = [
  ['wooded zero', WOODED_ZERO_ENVIRONMENT],
  ['test range', TEST_RANGE_ENVIRONMENT],
] as const;

describe.each(CONFIGS)('%s — canopy variety', (_name, cfg) => {
  const trees = generateTreePlacements(cfg);

  it('uses every canopy variant, for both species', () => {
    for (const kind of ['conifer', 'deciduous'] as const) {
      const used = new Set(trees.filter((t) => t.kind === kind).map((t) => t.variantIndex));
      expect(used.size).toBe(TREE_VARIANTS_PER_KIND);
    }
  });

  it('spreads variants roughly evenly — no variant is a rarity', () => {
    const counts = Array.from({ length: TREE_VARIANTS_PER_KIND }, (_, v) =>
      trees.filter((t) => t.variantIndex === v).length,
    );
    const expected = trees.length / TREE_VARIANTS_PER_KIND;
    for (const c of counts) expect(c).toBeGreaterThan(expected * 0.6);
  });

  it('keeps every variant index in range', () => {
    for (const t of trees) {
      expect(t.variantIndex).toBeGreaterThanOrEqual(0);
      expect(t.variantIndex).toBeLessThan(TREE_VARIANTS_PER_KIND);
      expect(Number.isInteger(t.variantIndex)).toBe(true);
    }
  });
});

describe.each(CONFIGS)('%s — non-uniform scale', (_name, cfg) => {
  const trees = generateTreePlacements(cfg);

  it('scales height and breadth INDEPENDENTLY', () => {
    // The single biggest tell of a procedural forest is uniform scaling: every
    // tree is provably the same object at a different size.
    const differing = trees.filter((t) => Math.abs(t.scaleY - t.scaleXZ) > 1e-9);
    expect(differing.length).toBeGreaterThan(trees.length * 0.95);
  });

  it('produces both tall-narrow and short-broad trees', () => {
    const tall = trees.filter((t) => t.scaleY > t.scaleXZ * 1.1);
    const squat = trees.filter((t) => t.scaleXZ > t.scaleY * 1.1);
    expect(tall.length).toBeGreaterThan(trees.length * 0.15);
    expect(squat.length).toBeGreaterThan(trees.length * 0.15);
  });

  it('keeps both axis scales positive and near the configured range', () => {
    const [lo, hi] = cfg.trees.scaleRange;
    for (const t of trees) {
      expect(t.scaleXZ).toBeGreaterThan(0);
      expect(t.scaleY).toBeGreaterThan(0);
      // aspect spread is +-22%, so allow that either side of the base range
      expect(t.scaleXZ).toBeLessThan(hi * 1.25);
      expect(t.scaleY).toBeLessThan(hi * 1.25);
      expect(t.scaleXZ).toBeGreaterThan(lo * 0.75);
      expect(t.scaleY).toBeGreaterThan(lo * 0.75);
    }
  });
});

describe.each(CONFIGS)('%s — lean', (_name, cfg) => {
  const trees = generateTreePlacements(cfg);

  it('leans trees off vertical, but only slightly', () => {
    const leaning = trees.filter((t) => Math.hypot(t.tiltX, t.tiltZ) > 0.005);
    expect(leaning.length).toBeGreaterThan(trees.length * 0.9);
    // A forest of drunkenly-tilted trees is worse than a plumb one; ~4 deg max.
    for (const t of trees) {
      expect(Math.abs(t.tiltX)).toBeLessThanOrEqual(0.07);
      expect(Math.abs(t.tiltZ)).toBeLessThanOrEqual(0.07);
    }
  });

  it('leans in both directions on both axes', () => {
    expect(trees.some((t) => t.tiltX > 0.01)).toBe(true);
    expect(trees.some((t) => t.tiltX < -0.01)).toBe(true);
    expect(trees.some((t) => t.tiltZ > 0.01)).toBe(true);
    expect(trees.some((t) => t.tiltZ < -0.01)).toBe(true);
  });
});

describe('determinism', () => {
  it('regenerates an identical forest from the same seed', () => {
    // Placement must stay a pure function of the config: the dual-unit superset
    // invariant (plan §8) depends on the world being reproducible.
    const a = generateTreePlacements(WOODED_ZERO_ENVIRONMENT);
    const b = generateTreePlacements(WOODED_ZERO_ENVIRONMENT);
    expect(a).toEqual(b);
  });
});
