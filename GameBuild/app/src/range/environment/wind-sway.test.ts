// Wind-driven canopy sway tests — Stage 5 of
// `Design/archive/mil-zero-range-plan.md`.
//
// This feature only earns its complexity if canopy movement is INFORMATION —
// consistent enough that a player could eventually read wind off it. That makes
// the speed -> bend mapping a specification, not a look, so it gets tested like
// one. Plan §12.2 listed "document the bend curve" as a blocking open item;
// `bendDeflectionM` plus this file is that documentation.
import { describe, expect, it } from 'vitest';
import { bendDeflectionM, WIND_SWAY_SPEED_RANGE_MPS } from './wind-sway';
import { WOODED_ZERO_ENVIRONMENT } from '../wooded-zero-environment';
import { TEST_RANGE_ENVIRONMENT } from '../test-range-config';
import type { EnvironmentConfig } from './environment-config';

const CONFIGS: Array<[string, EnvironmentConfig]> = [
  ['wooded zero', WOODED_ZERO_ENVIRONMENT],
  ['test range', TEST_RANGE_ENVIRONMENT],
];

/** The Wooded Zero Range's ambient breeze (ScopeView's WOODED_ZERO_WIND_MPS). */
const AMBIENT_MPS = 1.1;

describe.each(CONFIGS)('%s — the speed to bend curve', (_name, cfg) => {
  it('is monotonic in wind speed', () => {
    let previous = -Infinity;
    for (let v = 0; v <= 10; v += 0.5) {
      const d = bendDeflectionM(cfg, v, 6);
      expect(d).toBeGreaterThanOrEqual(previous);
      previous = d;
    }
  });

  it('is linear in wind speed, so doubling the wind doubles the movement', () => {
    // Linearity is what makes the movement readable rather than merely pretty:
    // a player can form a stable mental mapping only if the relationship is
    // simple and stated.
    const a = bendDeflectionM(cfg, 2, 6);
    const b = bendDeflectionM(cfg, 4, 6);
    expect(b).toBeCloseTo(a * 2, 10);
  });

  it('is QUADRATIC in height — crowns move, trunks do not', () => {
    // The owner's decision (plan §7.3): "the very light wind just affecting tree
    // tops is fine". Quadratic falloff is also how a cantilever actually bends,
    // and matches the fact that real wind speed rises with height.
    const low = bendDeflectionM(cfg, 5, 2);
    const high = bendDeflectionM(cfg, 5, 4);
    expect(high).toBeCloseTo(low * 4, 6);
  });

  it('leaves the base of the tree still', () => {
    expect(bendDeflectionM(cfg, 10, 0)).toBe(0);
    expect(bendDeflectionM(cfg, 10, -3)).toBe(0); // below the origin, clamped
  });

  it('moves a crown visibly but gently at the ambient breeze', () => {
    // ~8 m crown at 1.1 m/s. Big enough to see, small enough that nobody reads
    // it as a gale.
    const d = bendDeflectionM(cfg, AMBIENT_MPS, 8);
    expect(d).toBeGreaterThan(0.05);
    expect(d).toBeLessThan(0.25);
  });

  it('barely stirs anything at grass height, even in a real wind', () => {
    // The height story has to hold at both ends, or "wind rises with height"
    // stops being the explanation for what the player sees.
    expect(bendDeflectionM(cfg, 8, 0.3)).toBeLessThan(0.01);
  });
});

describe.each(CONFIGS)('%s — safety limits', (_name, cfg) => {
  it('caps deflection so a crown cannot lean into a shooting corridor', () => {
    // Trees are placed with a canopy-radius margin off every sight line
    // (TREE_CANOPY_RADIUS_M = 1.5 m). An uncapped quadratic would blow straight
    // through that at high wind and put foliage in front of a target.
    const huge = bendDeflectionM(cfg, WIND_SWAY_SPEED_RANGE_MPS, 30);
    expect(huge).toBeLessThanOrEqual(cfg.windSway.maxBendM * WIND_SWAY_SPEED_RANGE_MPS);
    expect(cfg.windSway.maxBendM).toBeLessThan(1.5);
  });

  it('clamps wind speed to the encodable range', () => {
    // The field texture stores components as bytes over +-SPEED_RANGE, so an
    // absurd dialled wind must saturate rather than wrap.
    const atLimit = bendDeflectionM(cfg, WIND_SWAY_SPEED_RANGE_MPS, 5);
    const beyond = bendDeflectionM(cfg, WIND_SWAY_SPEED_RANGE_MPS * 10, 5);
    expect(beyond).toBeCloseTo(atLimit, 10);
  });

  it('samples the wind at canopy height, not at the ground', () => {
    expect(cfg.windSway.sampleHeightM).toBeGreaterThan(3);
  });

  it('covers the whole planted area with its sample box', () => {
    // Anything outside the box clamps to the edge sample, which would make a
    // distant treeline sway with the wrong wind.
    const bandsX = cfg.trees.bands.flatMap((b) => [Math.abs(b.xMin), Math.abs(b.xMax)]);
    const bandsZ = cfg.trees.bands.flatMap((b) => [Math.abs(b.zMin), Math.abs(b.zMax)]);
    expect(cfg.windSway.halfWidthM).toBeGreaterThanOrEqual(Math.max(...bandsX));
    expect(cfg.windSway.depthM).toBeGreaterThanOrEqual(Math.max(...bandsZ));
  });
});

describe('direction', () => {
  it('bends downwind, and reverses when the wind reverses', () => {
    const cfg = WOODED_ZERO_ENVIRONMENT;
    expect(bendDeflectionM(cfg, 3, 6)).toBeGreaterThan(0);
    expect(bendDeflectionM(cfg, -3, 6)).toBeLessThan(0);
    expect(bendDeflectionM(cfg, -3, 6)).toBeCloseTo(-bendDeflectionM(cfg, 3, 6), 10);
  });

  it('is still in dead calm', () => {
    expect(bendDeflectionM(WOODED_ZERO_ENVIRONMENT, 0, 10)).toBe(0);
  });
});
