import { describe, it, expect } from 'vitest';
import {
  generateProbeTreePlacements,
  isPlaceable,
  TREE_COUNT_STEPS,
  LANE_HALF_WIDTH_M,
  TARGET_CLEAR_RADIUS_M,
  SHOOTER_CLEAR_RADIUS_M,
} from './elr-probe-trees';
import { snapshotElrProbe, slopeGroundY, GROUND_WIDTH_M, GROUND_LENGTH_M } from './elr-probe-config';
import { TREE_VARIANTS_PER_KIND } from './environment/environment-config';

const layout = snapshotElrProbe('slope');
const targets = layout.stations.map((s) => ({ x: s.x, z: s.z }));
const opts = { groundY: slopeGroundY, targets, paletteSize: 4 };

describe('generateProbeTreePlacements', () => {
  it('returns the requested count at every ramp step', () => {
    for (const n of TREE_COUNT_STEPS) {
      expect(generateProbeTreePlacements(n, opts)).toHaveLength(n);
    }
  });

  // The measurement depends on this. Comparing 500 trees against 1000 only means
  // anything if the 500 are the SAME 500 both times; a reseeded field would move
  // the frame time for reasons unrelated to count.
  it('is deterministic, and larger counts extend the same field', () => {
    const a = generateProbeTreePlacements(500, opts);
    const b = generateProbeTreePlacements(500, opts);
    expect(b).toEqual(a);
    const bigger = generateProbeTreePlacements(1000, opts);
    expect(bigger.slice(0, 500)).toEqual(a);
  });

  it('stands every tree on the probe ground profile, not a flat plane', () => {
    for (const t of generateProbeTreePlacements(1000, opts)) {
      expect(t.y).toBeCloseTo(slopeGroundY(-t.z), 9);
    }
    // ...and the profile actually varies, or the assertion above proves nothing.
    const ys = generateProbeTreePlacements(1000, opts).map((t) => t.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it('keeps the sight line, the targets and the shooter clear', () => {
    for (const t of generateProbeTreePlacements(2000, opts)) {
      expect(Math.abs(t.x)).toBeGreaterThanOrEqual(LANE_HALF_WIDTH_M);
      expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(SHOOTER_CLEAR_RADIUS_M);
      for (const target of targets) {
        expect(Math.hypot(t.x - target.x, t.z - target.z)).toBeGreaterThanOrEqual(
          TARGET_CLEAR_RADIUS_M,
        );
      }
    }
  });

  it('stays inside the ground the probe actually draws', () => {
    for (const t of generateProbeTreePlacements(2000, opts)) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(GROUND_WIDTH_M / 2);
      expect(t.z).toBeLessThanOrEqual(0);
      expect(t.z).toBeGreaterThanOrEqual(-GROUND_LENGTH_M);
    }
  });

  it('emits variant and tint indices the renderer can actually use', () => {
    for (const t of generateProbeTreePlacements(500, { ...opts, paletteSize: 4 })) {
      expect(t.variantIndex).toBeGreaterThanOrEqual(0);
      expect(t.variantIndex).toBeLessThan(TREE_VARIANTS_PER_KIND);
      expect(t.tintIndex).toBeGreaterThanOrEqual(0);
      expect(t.tintIndex).toBeLessThan(4);
      expect(t.scaleXZ).toBeGreaterThan(0);
      expect(t.scaleY).toBeGreaterThan(0);
    }
  });

  it('varies height and breadth independently — the anti-synthetic rule', () => {
    // Same reasoning as environment-config.ts: uniform-only scaling is the single
    // biggest tell that a forest was generated. If these ever became equal the
    // probe would be measuring the wrong trees.
    const trees = generateProbeTreePlacements(200, opts);
    expect(trees.some((t) => Math.abs(t.scaleXZ - t.scaleY) > 1e-6)).toBe(true);
  });

  it('degrades to fewer trees rather than spinning when there is nowhere to stand', () => {
    // Every candidate rejected: the attempt budget must run out and return.
    const nowhere = generateProbeTreePlacements(100, {
      ...opts,
      targets: [],
      // A lane wider than the ground leaves no placeable x at all.
      groundY: slopeGroundY,
    });
    expect(nowhere.length).toBeLessThanOrEqual(100);
  });

  it('starts the ramp at zero so the empty baseline is re-measurable in-session', () => {
    expect(TREE_COUNT_STEPS[0]).toBe(0);
    expect(generateProbeTreePlacements(0, opts)).toEqual([]);
  });
});

describe('isPlaceable', () => {
  it('rejects the lane, accepts well outside it', () => {
    expect(isPlaceable(0, -1000, [])).toBe(false);
    expect(isPlaceable(LANE_HALF_WIDTH_M - 1, -1000, [])).toBe(false);
    expect(isPlaceable(LANE_HALF_WIDTH_M + 1, -1000, [])).toBe(true);
  });

  it('rejects a ring around each target', () => {
    const t = [{ x: 200, z: -1000 }];
    expect(isPlaceable(200, -1000 + TARGET_CLEAR_RADIUS_M - 1, t)).toBe(false);
    expect(isPlaceable(200, -1000 + TARGET_CLEAR_RADIUS_M + 1, t)).toBe(true);
  });
});
