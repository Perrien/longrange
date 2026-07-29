import { describe, it, expect } from 'vitest';
import {
  generateGrassTuftPlacements,
  grassDensityAt,
  grassZoneFitsGround,
  rejectTuftsAtStations,
  GRASS_CLEAR_RADIUS_M,
  GRASS_FADE_M,
  GRASS_FULL_M,
  GRASS_HALF_ANGLE_DEG,
  GRASS_LATERAL_LIMIT_M,
  GRASS_SEED,
  GRASS_STATION_CLEAR_M,
  GRASS_TUFT_COUNT,
} from './elr-range-cover';
import { groundY, GROUND_WIDTH_M, GROUND_LENGTH_M } from './elr-range-config';
import { TREE_SEED } from './elr-range-trees';

const HALF_ANGLE_RAD = (GRASS_HALF_ANGLE_DEG * Math.PI) / 180;
const radiusOf = (t: { x: number; z: number }) => Math.hypot(t.x, t.z);

/** Generated ONCE. The field is 200 000 placements — regenerating it per test made
 *  this file the slowest in the suite, and per-tuft `expect()` calls in a 200 000
 *  loop are slower still, so the whole-field checks below count violations in plain
 *  JS and assert once. */
const FIELD = generateGrassTuftPlacements();
const countWhere = (pred: (t: (typeof FIELD)[number]) => boolean) => FIELD.filter(pred).length;

describe('grassDensityAt', () => {
  // THE FIX FOR THE HARD EDGE (owner, on device 2026-07-29). A uniform field ends
  // in a visible line; this is what makes the last stretch thin out instead.
  it('is full out to the full-density radius and zero past the fade', () => {
    expect(grassDensityAt(0)).toBe(1);
    expect(grassDensityAt(GRASS_FULL_M)).toBe(1);
    expect(grassDensityAt(GRASS_FADE_M)).toBe(0);
    expect(grassDensityAt(GRASS_FADE_M + 100)).toBe(0);
  });

  it('falls monotonically across the fade, reaching half at the midpoint', () => {
    expect(grassDensityAt((GRASS_FULL_M + GRASS_FADE_M) / 2)).toBeCloseTo(0.5, 9);
    let prev = 1;
    for (let r = GRASS_FULL_M; r <= GRASS_FADE_M; r += 10) {
      const d = grassDensityAt(r);
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });
});

describe('generateGrassTuftPlacements', () => {
  it('returns exactly the requested count, defaulting to the configured one', () => {
    expect(FIELD).toHaveLength(GRASS_TUFT_COUNT);
    for (const n of [0, 1, 400]) expect(generateGrassTuftPlacements(n)).toHaveLength(n);
  });

  it('is deterministic across calls', () => {
    expect(generateGrassTuftPlacements(300)).toEqual(generateGrassTuftPlacements(300));
  });

  // THE CONSTRAINT THAT MATTERS AT THE NEAR END. A tuft inside this radius fills the
  // sight picture at magnification — the reason the Wooded Zero Range clears 18 m too.
  it('keeps every tuft outside the firing-point clear radius', () => {
    expect(countWhere((t) => radiusOf(t) < GRASS_CLEAR_RADIUS_M)).toBe(0);
  });

  it('stays inside the sector, downrange of the shooter, and on the drawn ground', () => {
    expect(countWhere((t) => radiusOf(t) > GRASS_FADE_M)).toBe(0);
    expect(countWhere((t) => t.z >= 0)).toBe(0);
    expect(countWhere((t) => Math.abs(Math.atan2(t.x, -t.z)) > HALF_ANGLE_RAD + 1e-9)).toBe(0);
    // The lateral clip: past 1657 m the ±25° sector would hang off the side of a
    // 1400 m-wide world, so no tuft may sit outside the terrain.
    expect(countWhere((t) => Math.abs(t.x) > GRASS_LATERAL_LIMIT_M)).toBe(0);
    expect(countWhere((t) => Math.abs(t.x) > GROUND_WIDTH_M / 2)).toBe(0);
  });

  it('actually exercises the lateral clip at this reach', () => {
    // Guards the clip against becoming dead code: if the fade or the half-angle
    // ever shrink back inside the ground, this test says so instead of the clip
    // silently never firing.
    expect(GRASS_FADE_M * Math.sin(HALF_ANGLE_RAD)).toBeGreaterThan(GRASS_LATERAL_LIMIT_M);
    expect(countWhere((t) => Math.abs(t.x) > GRASS_LATERAL_LIMIT_M * 0.95)).toBeGreaterThan(0);
  });

  // THE REGRESSION. v1 stopped at 80 m and the cutoff was plainly visible on device.
  it('carries grass far past the old 80 m cutoff, out to the far station and beyond', () => {
    expect(countWhere((t) => radiusOf(t) > 80)).toBeGreaterThan(0);
    expect(countWhere((t) => radiusOf(t) > 2000)).toBeGreaterThan(0);
    expect(countWhere((t) => radiusOf(t) > GRASS_FADE_M * 0.9)).toBeGreaterThan(0);
    // And a real share of the field is beyond the old edge, not a token few.
    expect(countWhere((t) => radiusOf(t) > 80) / FIELD.length).toBeGreaterThan(0.5);
  });

  it('thins out with distance rather than ending in a step', () => {
    // Tufts per m² of annulus, sampled across the fade. Density must be falling —
    // a uniform field would hold roughly constant and then stop dead.
    //
    // Bands are FRACTIONS of the fade span, not fixed metres, so this test keeps
    // its meaning when the fade distance is retuned (it has been: 500 → 1000 → 2500).
    const span = GRASS_FADE_M - GRASS_FULL_M;
    const at = (f: number) => GRASS_FULL_M + f * span;
    const bandDensity = (fromM: number, toM: number) => {
      const n = countWhere((t) => radiusOf(t) >= fromM && radiusOf(t) < toM);
      const area = HALF_ANGLE_RAD * (toM * toM - fromM * fromM); // sector annulus
      return n / area;
    };
    const full = bandDensity(50, GRASS_FULL_M);
    const mid = bandDensity(at(0.4), at(0.6)); // ~50 % density
    const far = bandDensity(at(0.8), GRASS_FADE_M); // ~10 % density
    expect(mid).toBeLessThan(full * 0.7);
    expect(far).toBeLessThan(mid * 0.5);
    expect(far).toBeGreaterThan(0); // still populated — no cliff
  });

  it('holds the full-density band at the Wooded Zero Range\'s density', () => {
    const inBand = countWhere(
      (t) => radiusOf(t) >= GRASS_CLEAR_RADIUS_M && radiusOf(t) < GRASS_FULL_M,
    );
    const area = HALF_ANGLE_RAD * (GRASS_FULL_M ** 2 - GRASS_CLEAR_RADIUS_M ** 2);
    expect(inBand / area).toBeGreaterThan(0.15);
    expect(inBand / area).toBeLessThan(0.3);
  });

  it('sits every tuft ON the convex ground, not on a flat plane', () => {
    expect(countWhere((t) => Math.abs(t.y - groundY(-t.z)) > 1e-9)).toBe(0);
    // groundY(2500) is 139 m, so over this field the tufts climb a real hillside.
    // (Reduce, not Math.max(...spread) — 200 000 arguments overflows the stack.)
    const highest = FIELD.reduce((m, t) => Math.max(m, t.y), 0);
    expect(highest).toBeGreaterThan(100);
  });

  it('fills both sides of the sector', () => {
    expect(countWhere((t) => Math.atan2(t.x, -t.z) < -HALF_ANGLE_RAD * 0.9)).toBeGreaterThan(0);
    expect(countWhere((t) => Math.atan2(t.x, -t.z) > HALF_ANGLE_RAD * 0.9)).toBeGreaterThan(0);
  });

  it('varies scale and rotation, so the tufts are not a stamped grid', () => {
    const tufts = generateGrassTuftPlacements(200);
    const scales = tufts.map((t) => t.scale);
    expect(Math.min(...scales)).toBeGreaterThanOrEqual(0.7);
    expect(Math.max(...scales)).toBeLessThanOrEqual(1.4);
    expect(new Set(scales).size).toBeGreaterThan(150);
    for (const t of tufts) {
      expect(t.rotationY).toBeGreaterThanOrEqual(0);
      expect(t.rotationY).toBeLessThanOrEqual(Math.PI * 2);
    }
  });

  it('draws from a different stream than the trees, so one cannot reshuffle the other', () => {
    expect(GRASS_SEED).not.toBe(TREE_SEED);
  });
});

describe('rejectTuftsAtStations', () => {
  const stations = [
    { x: 3, z: -50 },
    { x: -12, z: -150 },
  ];

  it('drops tufts at the foot of a target and keeps everything else', () => {
    const kept = rejectTuftsAtStations(FIELD, stations);
    const violations = kept.filter((t) =>
      stations.some((s) => Math.hypot(t.x - s.x, t.z - s.z) < GRASS_STATION_CLEAR_M),
    );
    expect(violations).toHaveLength(0);
    // A handful, not a swathe — the clearing must not read as mown ground.
    expect(FIELD.length - kept.length).toBeGreaterThan(0);
    expect(FIELD.length - kept.length).toBeLessThan(FIELD.length * 0.02);
  });

  it('is a no-op with no stations, and honours an explicit radius', () => {
    const tufts = generateGrassTuftPlacements(500);
    expect(rejectTuftsAtStations(tufts, [])).toHaveLength(500);
    const tight = rejectTuftsAtStations(tufts, stations, 1);
    const wide = rejectTuftsAtStations(tufts, stations, 20);
    expect(wide.length).toBeLessThanOrEqual(tight.length);
  });
});

describe('grassZoneFitsGround', () => {
  it('holds — tufts would otherwise float past the edge of the drawn ground', () => {
    expect(grassZoneFitsGround()).toBe(true);
    expect(GRASS_FADE_M).toBeLessThanOrEqual(GROUND_LENGTH_M);
    expect(GRASS_LATERAL_LIMIT_M).toBeLessThanOrEqual(GROUND_WIDTH_M / 2);
  });
});
