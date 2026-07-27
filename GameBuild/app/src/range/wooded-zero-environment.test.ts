// Wooded Zero environment tests — Stage 2b of `Design/archive/mil-zero-range-plan.md`.
//
// The thing worth testing here is NOT the art tuning (counts, palettes, fog) —
// that is owner-judged on device. It is that the injected fan clearance actually
// governs the shared environment module: terrain flat and at the right height
// along every sight line, and not one tree, bush or rock standing where it could
// block a shot.
//
// This is exactly the class of bug the Test Range hit repeatedly (three rounds of
// "nothing behind the target", plus a terrain sampler that was off by half the
// lane length and put a bump at the target). Those were all found by eye on
// device. These assertions find them in CI instead.
import { describe, expect, it } from 'vitest';
import {
  generateScatterPlacements,
  generateTreePlacements,
  makeTerrainSampler,
  TREE_CANOPY_RADIUS_M,
} from './environment/environment-config';
import { WOODED_ZERO_ENVIRONMENT, WOODED_ZERO_CLEARANCE, WOODED_ZERO_REACH_M } from './wooded-zero-environment';
import { TEST_RANGE_ENVIRONMENT } from './test-range-config';
import {
  corridorFloorY,
  sightLineY,
  snapshotWoodedZero,
  buildCorridors,
  insideAnyCorridor,
} from './wooded-zero-config';

const layout = snapshotWoodedZero('MIL');
const corridors = buildCorridors();
const sampler = makeTerrainSampler(WOODED_ZERO_ENVIRONMENT);

describe('injected clearance governs the shared terrain sampler', () => {
  it('reproduces the knoll profile exactly along every sight line', () => {
    // The plan's clearance proofs (§2.2) assume the corridor floor is EXACTLY
    // `corridorFloorY(r)` with no relief added. If relief leaks in, the sight
    // lines are no longer guaranteed to clear.
    for (const s of layout.stations) {
      const ux = s.x / s.groundRunM;
      const uz = s.z / s.groundRunM;
      for (let r = 0; r <= s.groundRunM; r += 1) {
        expect(sampler(ux * r, uz * r)).toBeCloseTo(corridorFloorY(r), 10);
      }
    }
  });

  it('keeps the ground below every sight line the whole way to the target', () => {
    for (const s of layout.stations) {
      const ux = s.x / s.groundRunM;
      const uz = s.z / s.groundRunM;
      for (let r = 0; r <= s.groundRunM; r += 0.5) {
        expect(sightLineY(s, r)).toBeGreaterThan(sampler(ux * r, uz * r));
      }
    }
  });

  it('puts the ground at zero under every target, so the boards sit right', () => {
    for (const s of layout.stations) expect(sampler(s.x, s.z)).toBeCloseTo(0, 10);
  });

  it('raises the firing point to the knoll crest', () => {
    expect(sampler(0, 0)).toBeCloseTo(1.5, 10);
  });

  it('still has relief out on the flanks', () => {
    let sawRelief = false;
    for (let x = -180; x <= 180; x += 20) {
      for (let z = -400; z <= -40; z += 40) {
        if (!insideAnyCorridor(x, z, corridors, 6) && Math.abs(sampler(x, z)) > 0.2) sawRelief = true;
      }
    }
    expect(sawRelief).toBe(true);
  });
});

describe('nothing is planted where it could block a shot', () => {
  const trees = generateTreePlacements(WOODED_ZERO_ENVIRONMENT);
  const scatter = generateScatterPlacements(WOODED_ZERO_ENVIRONMENT);

  it('places a real forest', () => {
    // Rejection drops candidates rather than shoving them sideways, so the count
    // is allowed to come in under the requested figure — but not by much, or the
    // bands are wrong and the range will look bald.
    const requested = WOODED_ZERO_ENVIRONMENT.trees.coniferCount + WOODED_ZERO_ENVIRONMENT.trees.deciduousCount;
    expect(trees.length).toBeGreaterThan(requested * 0.6);
  });

  it('keeps every tree clear of every corridor, canopy included', () => {
    for (const t of trees) {
      expect(insideAnyCorridor(t.x, t.z, corridors, TREE_CANOPY_RADIUS_M)).toBe(false);
    }
  });

  it('keeps every bush and rock clear too', () => {
    for (const p of [...scatter.bushes, ...scatter.rocks]) {
      expect(insideAnyCorridor(p.x, p.z, corridors)).toBe(false);
    }
  });

  it('keeps vegetation out of the shooter clearing', () => {
    for (const t of trees) {
      expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(WOODED_ZERO_CLEARANCE.shooterClearM);
    }
  });

  it('sits every tree on the terrain it was placed on', () => {
    for (const t of trees.slice(0, 40)) expect(t.y).toBeCloseTo(sampler(t.x, t.z), 10);
  });

  // Counts trees visually behind a station: 10-60 m further out along its own
  // bearing, within 20 m laterally of that bearing.
  const backdropCount = (stationIndex: number): number => {
    const s = layout.stations[stationIndex];
    const ux = s.x / s.groundRunM;
    const uz = s.z / s.groundRunM;
    return trees.filter((t) => {
      const r = Math.hypot(t.x, t.z);
      if (r < s.groundRunM + 10 || r > s.groundRunM + 60) return false;
      return Math.abs(t.x * -uz - t.z * ux) < 20;
    }).length;
  };

  it('puts a real WALL of woods behind the near stations, not a token tree', () => {
    // The whole reason the fan can stay narrow (plan §3.2): each station should
    // sit in its own pocket of forest. This asserts DENSITY, not existence —
    // the earlier `> 0` version passed on PRNG luck while the 25 m and 50 m
    // stations actually had ZERO trees within 60 m behind them, which Stage 4a
    // exposed the moment the placement stream shifted. A point-sample "could a
    // tree stand here" test is not the same question as "does one".
    expect(backdropCount(0)).toBeGreaterThan(8); // 25 m
    expect(backdropCount(1)).toBeGreaterThan(8); // 50 m
    expect(backdropCount(2)).toBeGreaterThan(5); // 100 m
  });

  it('keeps the 200 m station clearer behind, on purpose', () => {
    // Its heavy tree block sits further back (z < -250) so misses vanish into
    // woods rather than clipping trunks — the Test Range's >=40 m rule.
    expect(backdropCount(3)).toBeLessThan(backdropCount(0));
  });
});

describe('the Test Range is unaffected by the clearance change', () => {
  // The shared module is used by an already-owner-signed range. The new code
  // path must be entirely opt-in.
  it('leaves the Test Range on the single-lane model', () => {
    expect(TEST_RANGE_ENVIRONMENT.terrain.clearance).toBeUndefined();
  });

  it('still places its trees and keeps its lane corridor flat', () => {
    const trees = generateTreePlacements(TEST_RANGE_ENVIRONMENT);
    expect(trees.length).toBe(
      TEST_RANGE_ENVIRONMENT.trees.coniferCount + TEST_RANGE_ENVIRONMENT.trees.deciduousCount,
    );
    const testSampler = makeTerrainSampler(TEST_RANGE_ENVIRONMENT);
    // `toBeCloseTo`, not `toBe(0)` — the sampler legitimately returns -0 for some
    // inputs (a masked product), and Object.is treats -0 and +0 as different.
    for (let z = 0; z >= -100; z -= 5) expect(testSampler(0, z)).toBeCloseTo(0, 10);
  });
});

describe('range extent', () => {
  it('reaches past the farthest station', () => {
    const farthest = Math.max(...layout.stations.map((s) => s.groundRunM));
    expect(WOODED_ZERO_REACH_M).toBeGreaterThan(farthest);
  });

  it('runs the ground well past the last corridor', () => {
    expect(layout.ground.lengthM).toBeGreaterThan(WOODED_ZERO_REACH_M);
  });
});
