import { describe, it, expect } from 'vitest';
import {
  groundY,
  groundInvariantHolds, eyeYFor, stationsFor, targetCenterAboveGroundM,
  LOW_STATIONS_M, HIGH_STATIONS_M, SLOPE_RISE_M, SLOPE_SPAN_M,
  TARGET_CENTER_Y_M, FRAME_GROUND_CLEARANCE_M, GROUND_LENGTH_M,
  solveLayout, OFFSET_CAP_MRAD,
  mountFor, rackPlateCenterAboveGroundM, rackBeamHeightM,
  RACK_WIDTH_MULTIPLE, RACK_HEIGHT_MULTIPLE, RACK_CHAIN_DROP_MULTIPLE,
  stakePlateCenterAboveGroundM,
  STAKE_MAX_RANGE_M, STAKE_HEIGHT_M, STAKE_TARGET_TOP_GAP_M,
} from './elr-range-config';
import { generateRangeTreePlacements, MAX_TREES } from './elr-range-trees';
import { occludingTreeIndices, marginForPlate } from './sight-clearance';
import { sunDirection } from './environment/environment-config';
import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';

describe('groundY', () => {
  it('starts at zero and rises to the full rise at the span', () => {
    expect(groundY(0)).toBeCloseTo(0, 9);
    expect(groundY(SLOPE_SPAN_M)).toBeCloseTo(SLOPE_RISE_M, 9);
  });

  it('clamps outside the span rather than running away', () => {
    expect(groundY(-500)).toBeCloseTo(0, 9);
    expect(groundY(SLOPE_SPAN_M * 3)).toBeCloseTo(SLOPE_RISE_M, 9);
  });

  it('is CONVEX — the chord lies above the curve', () => {
    // This is the property that gives sight-line clearance. If it ever became
    // linear or concave, far targets would sit behind intervening ground.
    for (const [a, b] of [[200, 1000], [500, 1500], [1000, 2000]]) {
      const mid = (a + b) / 2;
      const chordAtMid = (groundY(a) + groundY(b)) / 2;
      expect(chordAtMid).toBeGreaterThan(groundY(mid));
    }
  });

  it('rises monotonically', () => {
    let prev = -Infinity;
    for (let r = 0; r <= SLOPE_SPAN_M; r += 50) {
      expect(groundY(r)).toBeGreaterThanOrEqual(prev);
      prev = groundY(r);
    }
  });
});

// The bug that produced a visible seam across the terrain on the first build, and
// three consequences nobody would connect to it by looking.
describe('the terrain invariant — the rise must not clamp inside the drawn ground', () => {
  it('keeps the clamp outside the ground', () => {
    expect(groundInvariantHolds()).toBe(true);
    expect(SLOPE_SPAN_M).toBeGreaterThanOrEqual(GROUND_LENGTH_M);
  });

  it('has no curvature crease anywhere the player can see', () => {
    // A clamp shows up as the slope going from steep to flat in one step. Sample the
    // gradient and require it to change smoothly.
    const step = 25;
    let prevSlope = null as number | null;
    let worstJump = 0;
    for (let r = step; r < GROUND_LENGTH_M; r += step) {
      const slope = (groundY(r) - groundY(r - step)) / step;
      if (prevSlope !== null) worstJump = Math.max(worstJump, Math.abs(slope - prevSlope));
      prevSlope = slope;
    }
    // A true clamp jumps by the full terminal gradient in one step (~0.13). A smooth
    // parabola changes by ~2*rise*step/span^2 per step, which is tiny.
    expect(worstJump).toBeLessThan(0.01);
  });

  it('puts the skyline at the FAR EDGE, so no terrain hides behind its own crest', () => {
    const eye = eyeYFor('high');
    let best = -Infinity;
    let bestR = 0;
    for (let r = 50; r < GROUND_LENGTH_M; r += 5) {
      const a = Math.atan((groundY(r) - eye) / r);
      if (a > best) { best = a; bestR = r; }
    }
    // Within one sample of the far edge. If the rise clamped early, this would sit at
    // the clamp point and everything past it would be invisible.
    expect(GROUND_LENGTH_M - bestR).toBeLessThanOrEqual(10);
  });

  it('leaves real hillside behind the farthest gong, not sky', () => {
    // The white-plate-on-dark-panel contrast design assumes hillside as the backdrop.
    // First build left the 2000 m gong 2.4 mrad below the skyline — two plate-widths,
    // i.e. silhouetted. Require a genuine backdrop.
    const eye = eyeYFor('high');
    let skyline = -Infinity;
    for (let r = 50; r < GROUND_LENGTH_M; r += 5) {
      skyline = Math.max(skyline, Math.atan((groundY(r) - eye) / r));
    }
    const losRangeM: number = HIGH_STATIONS_M[HIGH_STATIONS_M.length - 1];
    const gong = losRangeM / 1000;
    let run = losRangeM;
    let y = 0;
    for (let pass = 0; pass < 3; pass++) {
      y = groundY(run) + targetCenterAboveGroundM(gong);
      const dy = y - eye;
      run = Math.sqrt(Math.max(0, losRangeM * losRangeM - dy * dy));
    }
    const backdropMrad = (skyline - Math.atan((y - eye) / run)) * 1000;
    expect(backdropMrad).toBeGreaterThan(10); // gong itself is 1 mrad
  });
});

describe('firing points', () => {
  it('puts the high line above the low line', () => {
    expect(eyeYFor('high')).toBeGreaterThan(eyeYFor('low'));
  });

  it('puts the low line at standing/prone eye height', () => {
    expect(eyeYFor('low')).toBeCloseTo(1.7, 9);
  });
});

describe('ladders', () => {
  it('gives the low line 10 stations at 50 m steps to 500', () => {
    expect(stationsFor('low')).toEqual([50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
  });

  it('gives the high line 8 stations at 250 m steps to 2000', () => {
    expect(stationsFor('high')).toEqual([250, 500, 750, 1000, 1250, 1500, 1750, 2000]);
  });

  it('shares the 250 m station between both lines', () => {
    expect(LOW_STATIONS_M).toContain(250);
    expect(HIGH_STATIONS_M).toContain(250);
  });

  it('keeps every station inside the drawn ground', () => {
    for (const d of [...LOW_STATIONS_M, ...HIGH_STATIONS_M]) {
      expect(d).toBeLessThanOrEqual(GROUND_LENGTH_M);
    }
  });
});

describe('targetCenterAboveGroundM', () => {
  it('uses the standard height for small near gongs', () => {
    expect(targetCenterAboveGroundM(0.05)).toBeCloseTo(TARGET_CENTER_Y_M, 9);
  });

  it('raises big far gongs so the frame bottom stays clear of the ground', () => {
    const gong = 2.0; // 2000 m station
    const centre = targetCenterAboveGroundM(gong);
    const frameBottom = centre - (gong * 2.0) / 2;
    expect(frameBottom).toBeGreaterThanOrEqual(FRAME_GROUND_CLEARANCE_M - 1e-9);
  });

  it('never returns less than the standard height', () => {
    for (const d of [0.01, 0.05, 0.5, 1, 2]) {
      expect(targetCenterAboveGroundM(d)).toBeGreaterThanOrEqual(TARGET_CENTER_Y_M);
    }
  });
});

describe('solveLayout', () => {
  const trees = generateRangeTreePlacements(MAX_TREES, 4);

  for (const point of ['low', 'high'] as const) {
    describe(`${point} line`, () => {
      const layout = solveLayout(point, trees);

      it('places every station in the ladder', () => {
        expect(layout.stations.map((s) => s.losRangeM)).toEqual([...stationsFor(point)]);
      });

      it('preserves the LINE-OF-SIGHT range at every station', () => {
        for (const s of layout.stations) {
          const dy = s.y - layout.eyeYM;
          expect(Math.hypot(s.groundRunM, dy)).toBeCloseTo(s.losRangeM, 3);
          expect(s.groundRunM).toBeLessThanOrEqual(s.losRangeM + 1e-6);
        }
      });

      it('keeps the world position consistent with the ground run', () => {
        for (const s of layout.stations) {
          expect(Math.hypot(s.x, s.z)).toBeCloseTo(s.groundRunM, 3);
          expect(s.z).toBeLessThan(0);
        }
      });

      it('sizes every gong at exactly 1 MIL', () => {
        for (const s of layout.stations) {
          expect(s.gongDiameterM).toBeCloseTo(s.losRangeM / 1000, 9);
        }
      });

      // The two mounts clear the ground for different reasons, so they are
      // asserted differently. A PANEL is centred on its gong and the whole frame
      // must float clear of the dirt. A RACK stands ON the dirt by design — its
      // legs run ground → beam — so what has to clear is the hanging PLATE.
      it('keeps every gong and structure clear of the ground', () => {
        for (const s of layout.stations) {
          const localGround = groundY(s.groundRunM);
          if (s.mount === 'stake' || s.mount === 'rack') {
            const plateBottom = s.y - s.gongDiameterM / 2;
            expect(plateBottom).toBeGreaterThan(localGround);
            // and the plate really sits BELOW the top of the post, not through it
            expect(s.y + s.gongDiameterM / 2).toBeLessThanOrEqual(s.beamY + 1e-9);
          } else {
            const frameBottom = s.y - s.frameHeightM / 2;
            expect(frameBottom).toBeGreaterThanOrEqual(localGround + FRAME_GROUND_CLEARANCE_M - 1e-6);
          }
        }
      });

      it('keeps lateral offset inside the angular cap', () => {
        for (const s of layout.stations) {
          expect(Math.abs(s.x) / s.groundRunM).toBeLessThanOrEqual(OFFSET_CAP_MRAD / 1000 + 1e-9);
        }
      });

      // THE POINT OF THE WHOLE EXERCISE. Note this is "clear AFTER culling", not
      // "clear with no culling" — see the note below the test block.
      it('leaves every station clear once the culled trees are removed', () => {
        const kept = trees.filter((_, i) => !layout.cullTreeIndices.includes(i));
        const eye = { x: 0, y: layout.eyeYM, z: 0 };
        for (const s of layout.stations) {
          const blocking = occludingTreeIndices(
            eye,
            { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
            kept,
            marginForPlate(s.gongDiameterM / 2),
          );
          expect(blocking).toHaveLength(0);
        }
      });

      // Individual trees, never a corridor. Measured across 8 forest seeds:
      // mean 2.6 culled, worst 5, out of 4000.
      it('culls only a handful of trees', () => {
        expect(layout.cullTreeIndices.length).toBeLessThanOrEqual(15);
      });

      // A near frame really does hide a far gong, so stations are solved near to
      // far with each placed frame added as an occluder. Without that ordering
      // every forest seed put at least one low-line station behind another frame.
      it('never puts a station behind another station\'s frame', () => {
        const eye = { x: 0, y: layout.eyeYM, z: 0 };
        // `beamY` is the top of the structure for BOTH mounts — a rack's beam or
        // a panel frame's upper edge — and is what `solveLayout` pushes as the
        // occluder. Deriving it as `y + frameHeight/2` here is the panel formula
        // and models a rack ~0.19 m taller than it is, which invents blockages.
        const frames = layout.stations.map((s) => ({
          x: s.x,
          z: s.z,
          radiusM: s.frameWidthM / 2,
          topY: s.beamY,
        }));
        layout.stations.forEach((s, i) => {
          const others = frames.filter((_, j) => j !== i);
          const blocking = occludingTreeIndices(
            eye,
            { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
            others,
            marginForPlate(s.gongDiameterM / 2),
          );
          expect(blocking).toHaveLength(0);
        });
      });
    });
  }

  it('is deterministic', () => {
    const a = solveLayout('high', trees).stations.map((s) => s.x);
    const b = solveLayout('high', trees).stations.map((s) => s.x);
    expect(a).toEqual(b);
  });

  it('gives DIFFERENT offsets from the two lines for the shared 250 m station', () => {
    // A sight line is defined by the eye it starts from, so the two lines solve
    // independently. If these were identical, the solver is ignoring eye height.
    const low = solveLayout('low', trees).stations.find((s) => s.losRangeM === 250)!;
    const high = solveLayout('high', trees).stations.find((s) => s.losRangeM === 250)!;
    expect(low.losRangeM).toBe(high.losRangeM);
    expect(low.y).not.toBeCloseTo(high.y, 6);
  });
});

it('has a tree field the scene can draw without regenerating', () => {
  // The scene must generate ONCE and solve against the same array.
  const treesForScene = generateRangeTreePlacements(MAX_TREES, 4);
  const layout = solveLayout('high', treesForScene);
  expect(treesForScene).toHaveLength(MAX_TREES);
  expect(layout.stations).toHaveLength(8);
});

describe('low-line racks (owner, 2026-07-29)', () => {
  const trees = generateRangeTreePlacements(MAX_TREES, 4);
  const racks = () => solveLayout('low', trees).stations.filter((s) => s.mount === 'rack');

  it('mounts stakes near, racks beyond, and panels on the whole high line', () => {
    expect(mountFor('low', 50)).toBe('stake');
    expect(mountFor('low', STAKE_MAX_RANGE_M)).toBe('stake');
    expect(mountFor('low', STAKE_MAX_RANGE_M + 50)).toBe('rack');
    expect(mountFor('high', 250)).toBe('panel');
    // The high line never gets a stake, even at its nearest station.
    expect(mountFor('high', 50)).toBe('panel');

    const low = solveLayout('low', trees).stations;
    expect(low.filter((s) => s.mount === 'stake').map((s) => s.losRangeM)).toEqual([50, 100, 150]);
    expect(low.filter((s) => s.mount === 'rack').map((s) => s.losRangeM))
      .toEqual([200, 250, 300, 350, 400, 450, 500]);
    for (const s of solveLayout('high', trees).stations) expect(s.mount).toBe('panel');
  });

  it('stands every rack beam at its own gong-scaled height above local ground', () => {
    for (const s of racks()) {
      expect(s.beamY - groundY(s.groundRunM)).toBeCloseTo(rackBeamHeightM(s.gongDiameterM), 6);
    }
  });

  // The plate HANGS. A fixed fraction of beam height (Range A's model) breaks
  // on constant-angular gongs: at 500 m the gong is 0.5 m across, and a 0.5
  // fraction would put its top edge above the beam it hangs from.
  it('hangs the gong below the beam at every rack station, including the largest', () => {
    for (const s of racks()) {
      const chain = s.gongDiameterM * RACK_CHAIN_DROP_MULTIPLE;
      expect(s.y + s.gongDiameterM / 2).toBeLessThanOrEqual(s.beamY - chain + 1e-9);
      expect(s.y - s.gongDiameterM / 2).toBeGreaterThan(groundY(s.groundRunM));
    }
  });

  it('measures the drop from the beam down, not up from the ground', () => {
    // 500 m gong is 0.5 m: 1.00 − 0.060 − 0.250 = 0.690
    expect(rackPlateCenterAboveGroundM(0.5)).toBeCloseTo(0.69, 9);
    // 50 m gong is 0.05 m: 0.10 − 0.006 − 0.025 = 0.069
    expect(rackPlateCenterAboveGroundM(0.05)).toBeCloseTo(0.069, 9);
  });

  it('sizes the rack at 1.5 gong widths, same as the high-line frame', () => {
    for (const s of racks()) {
      expect(s.frameWidthM).toBeCloseTo(s.gongDiameterM * RACK_WIDTH_MULTIPLE, 9);
    }
  });

  // THE FIX for "too narrow and too tall" at 50–150 m. A fixed beam height with a
  // gong-scaled width ran the aspect ratio from 1.33:1 at 500 m to 13:1 at 50 m.
  // Scaling the whole rack holds it constant, so every station looks the same.
  it('holds the rack aspect ratio constant across the whole ladder', () => {
    const aspects = racks().map((s) => s.frameHeightM / s.frameWidthM);
    const expected = RACK_HEIGHT_MULTIPLE / RACK_WIDTH_MULTIPLE;
    for (const a of aspects) expect(a).toBeCloseTo(expected, 9);
    expect(Math.max(...aspects) - Math.min(...aspects)).toBeLessThan(1e-9);
  });

  // The 500 m rack is the one the owner signed off on device. Pin its actual
  // dimensions so a future multiple change cannot silently move it.
  it('leaves the 500 m rack exactly as it was — 0.75 m wide, 1.00 m tall', () => {
    const s = solveLayout('low', trees).stations.find((st) => st.losRangeM === 500)!;
    expect(s.frameWidthM).toBeCloseTo(0.75, 9);
    expect(s.frameHeightM).toBeCloseTo(1.0, 9);
    expect(s.beamY - groundY(s.groundRunM)).toBeCloseTo(1.0, 6);
  });

  // The complaint in numbers: at 50 m a 1 m rack subtended 20 mrad against the
  // gong's 1 mrad. Constant-angular furniture keeps it proportionate.
  it('keeps rack furniture from swamping the sight picture', () => {
    for (const s of racks()) {
      expect((s.frameHeightM / s.groundRunM) * 1000).toBeLessThan(3);
    }
  });

  // The high line is the one place the measured D4 contrast advantage bites,
  // so it must NOT have quietly inherited the rack model.
  it('leaves the high line on frames that scale with the gong', () => {
    for (const s of solveLayout('high', trees).stations) {
      expect(s.frameHeightM).toBeCloseTo(s.gongDiameterM * 2.0, 9);
      expect(s.beamY).toBeCloseTo(s.y + s.frameHeightM / 2, 9);
    }
  });

  it('still solves the low line clear once culled trees are removed', () => {
    const layout = solveLayout('low', trees);
    const kept = trees.filter((_, i) => !layout.cullTreeIndices.includes(i));
    const eye = { x: 0, y: layout.eyeYM, z: 0 };
    for (const s of layout.stations) {
      const blocking = occludingTreeIndices(
        eye,
        { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
        kept,
        marginForPlate(s.gongDiameterM / 2),
      );
      expect(blocking).toHaveLength(0);
    }
    expect(layout.cullTreeIndices.length).toBeLessThanOrEqual(15);
  });
});

describe('near-station stakes (owner, 2026-07-29)', () => {
  const trees = generateRangeTreePlacements(MAX_TREES, 4);
  const stakes = () => solveLayout('low', trees).stations.filter((s) => s.mount === 'stake');

  it('covers exactly the first three stations', () => {
    expect(stakes().map((s) => s.losRangeM)).toEqual([50, 100, 150]);
  });

  // Deliberately NOT constant-angular. Real range furniture is 12 inches whether
  // you look at it from 50 m or 150 m, and the owner asked for a fixed post.
  it('stands a fixed 12 inches at every stake station', () => {
    for (const s of stakes()) {
      expect(s.frameHeightM).toBeCloseTo(STAKE_HEIGHT_M, 9);
      expect(s.beamY - groundY(s.groundRunM)).toBeCloseTo(STAKE_HEIGHT_M, 6);
    }
  });

  it('hangs the gong top exactly one inch below the post top', () => {
    for (const s of stakes()) {
      const gap = s.beamY - (s.y + s.gongDiameterM / 2);
      expect(gap).toBeCloseTo(STAKE_TARGET_TOP_GAP_M, 6);
    }
  });

  it('measures the plate down from the post top, so the gap never changes', () => {
    // 50 m gong 0.05: 0.3048 − 0.0254 − 0.025 = 0.2544
    expect(stakePlateCenterAboveGroundM(0.05)).toBeCloseTo(0.2544, 9);
    // 150 m gong 0.15: 0.3048 − 0.0254 − 0.075 = 0.2044
    expect(stakePlateCenterAboveGroundM(0.15)).toBeCloseTo(0.2044, 9);
  });

  // The whole point: one post hiding behind the plate, not two legs framing it.
  // The 50 m rack was 7.5 cm wide with legs each ~a third of that.
  it('is no wider than the gong, so the post cannot bracket the plate', () => {
    for (const s of stakes()) {
      expect(s.frameWidthM).toBeCloseTo(s.gongDiameterM, 9);
    }
  });

  // The angular rack put the 50 m plate 6.9 cm off the dirt. A fixed post lifts
  // it clear, which also buys headroom against future ground dressing (§13.10).
  it('lifts the near plates well clear of the ground', () => {
    for (const s of stakes()) {
      expect(s.y - s.gongDiameterM / 2 - groundY(s.groundRunM)).toBeGreaterThan(0.1);
    }
  });

  it('still solves every stake station clear of the forest', () => {
    const layout = solveLayout('low', trees);
    const kept = trees.filter((_, i) => !layout.cullTreeIndices.includes(i));
    const eye = { x: 0, y: layout.eyeYM, z: 0 };
    for (const s of layout.stations.filter((st) => st.mount === 'stake')) {
      const blocking = occludingTreeIndices(
        eye,
        { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
        kept,
        marginForPlate(s.gongDiameterM / 2),
      );
      expect(blocking).toHaveLength(0);
    }
  });
});

describe('ELR light rig reads the shared 24 deg / -125 deg sun', () => {
  it('sunDirection(WOODED_ZERO_ENVIRONMENT) scaled by 400 matches the new hardcoded position', () => {
    // Mechanical check that the 24 deg rig is actually in effect. 14 deg / -125
    // deg x 400 reproduces the OLD hardcoded (-318, 97, 223); this asserts the
    // new one.
    const dir = sunDirection(WOODED_ZERO_ENVIRONMENT);
    const SUN_DISTANCE_M = 400;
    expect(dir.x * SUN_DISTANCE_M).toBeCloseTo(-299.3, 1);
    expect(dir.y * SUN_DISTANCE_M).toBeCloseTo(162.7, 1);
    expect(dir.z * SUN_DISTANCE_M).toBeCloseTo(209.6, 1);
  });
});
