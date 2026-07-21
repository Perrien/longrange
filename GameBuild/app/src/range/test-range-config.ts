// Test Range config (Stage 1 of Design/Plans/test-range-environment-plan.md) —
// pure data, no THREE, mirroring range-a-config.ts's style. A single placeholder
// target: a 12" gong hung at 100 yd on a rack authored with Range A's frame
// numbers (RACK_HEIGHT_YARDS 1.2, PLATE_CENTER_FRACTION 0.5).

import { yardsToMeters, inchesToMeters } from '../units';
import type { EnvironmentConfig } from './environment/environment-config';

export const TEST_RANGE_GONG = {
  rackId: 'test-gong-100',
  distanceYards: 100,
  distanceM: yardsToMeters(100), // 91.44
  gongInches: 12,
  gongDiameterM: inchesToMeters(12), // 0.3048
  xOffsetM: 0, // dead centre — this is a test lane
  rackWidthM: yardsToMeters(1.5),
  beamHeightM: yardsToMeters(1.2), // 1.0973
  plateCenterYM: yardsToMeters(1.2) * 0.5, // 0.5486
  paintColor: 0xf0f0ea, // RangeScene PLATE_COLOR default
} as const;

export const TEST_RANGE_GROUND = {
  laneWidthM: yardsToMeters(35),
  /** 140 yd: long enough that the 100-yd wind marker passes ScopeView's
   *  `distanceM <= laneLen − 10` filter, short enough that 200 yd doesn't. */
  laneLengthM: yardsToMeters(140), // 128.0
} as const;

/** Owner spec (2026-07-21): hills/relief must never intrude on a ~10 yd wide,
 *  100 yd long corridor running straight down the sight line to the target.
 *  Named here (independent of `terrain.laneHalfWidthM`/`zFlatToM`, which are
 *  wider/deeper than this minimum) so `environment-config.test.ts` can assert
 *  the literal spec directly against the terrain sampler, not just against
 *  whatever those tuning knobs happen to be set to. */
export const NO_HILL_CORRIDOR = {
  halfWidthM: yardsToMeters(5), // 10 yd wide
  lengthM: TEST_RANGE_GONG.distanceM, // 100 yd — matches the gong exactly
} as const;

// Environment tuning (Stage 2). Owner feedback round 1 (2026-07-21, on-device):
// the hill sat off to the side (x=45) and was invisible without turning — the
// lane's flat corridor previously forced x=0 flat all the way to z=-500, so
// nothing could rise directly behind the target. Fixed via `zFlatToM`/
// `zBlendM`: the corridor now stays flat only out to just past the gong
// (rack/chains still sit on flat ground), and relief unlocks beyond that even
// on the sight line. Owner feedback round 2 (2026-07-21, on-device screenshot):
// centering it at close range (zM=-230, height 14) made it read as a wall
// covering the target — through a scope's narrow FOV, a centered hill barely
// tapers across the frame (you only ever see its near-flat top), so the only
// real lever is HOW TALL it looks, i.e. height/distance. Owner feedback round 3
// (2026-07-21: "no discernible change" after round-2's dial-back, then:
// "just adjust so none of the hills interfere with the ~10 yard wide 100 yard
// long corridor to the target") — kept the current flat-corridor-plus-z-unlock
// approach (no architecture change) and (a) formalized the corridor as
// `NO_HILL_CORRIDOR` above, tested directly against the sampler so it's
// guaranteed regardless of how `laneHalfWidthM`/`zFlatToM` get tuned, and
// (b) pushed the hill much smaller/farther still — `zM=-340` (≈250 m clear of
// the 100-yd corridor's far edge, well past even its 3-radius falloff) and
// `heightM=4` (≈12 mil peak seen from the shooter, vs. round 2's ≈21 mil and
// round 1's ≈61 mil) — so it reads as a low rise on the horizon. Behind-target
// tree band starts at z = −135 m (gong at −91.4 m, ≥ 40 m clear so misses
// visually disappear into the woods, no berm needed) — unaffected by this
// change (tree placement still needs its own x-clearance from the lane,
// independent of z). Mountains at 1000–1350 m sit inside the fog far (1400)
// so they read as hazy silhouettes, and inside the camera far (3000); their
// fan is still centered on the full width and may want the same "narrow
// toward centre" treatment once Stage 4 renders them. All numbers are tuning
// starting points — see plan §2.9.
export const TEST_RANGE_ENVIRONMENT: EnvironmentConfig = {
  seed: 1337,
  terrain: {
    widthM: 400,
    lengthM: 500,
    laneHalfWidthM: 16,
    laneBlendM: 12,
    zFlatToM: 115,
    zBlendM: 35,
    reliefAmpM: 2.0,
    hill: { xM: 0, zM: -340, radiusM: 50, heightM: 4 },
  },
  sky: { horizonHex: 0xcfe0ee, midHex: 0x9ec2e4, zenithHex: 0x5f93c9, domeRadiusM: 1500 },
  // farM raised 1400→2000 (owner feedback 2026-07-21, "still too bright" after
  // two rounds of texture darkening had zero visible effect on the
  // mountains — the tell, same as the earlier canopy bug, that something
  // else was fully overriding the material color). Root cause: THREE.Fog is
  // linear-smoothstep(nearM, farM, dist), and the mountain ring (1000-1350 m)
  // sat deep in that curve's saturated tail at farM=1400 — ~75% fog-color at
  // the near edge, ~99.6% at the far edge — so the rendered pixel was almost
  // pure fog color (a pale sky blue) regardless of the mountain texture's
  // actual albedo. Raising farM to 2000 (mountains unchanged, still
  // comfortably inside both the new fog far and the 3000 m camera far) moves
  // them to ~43%/~71% fog instead — a real haze gradient with the darkened
  // texture now actually visible, not a wash. Clouds ignore scene.fog
  // entirely (own ShaderMaterial, ported from BTK) and the sky dome sets
  // `fog: false`, so neither is affected; terrain/trees (max z ±500/430) are
  // nowhere near either far value, so their look is unchanged.
  fog: { colorHex: 0xcfe0ee, nearM: 180, farM: 2000 },
  trees: {
    coniferCount: 110,
    deciduousCount: 80,
    bands: [
      { xMin: -170, xMax: -20, zMin: -430, zMax: -15 }, // left woods
      { xMin: 20, xMax: 170, zMin: -430, zMax: -15 }, // right woods
      { xMin: -170, xMax: 170, zMin: -430, zMax: -135 }, // behind-target block
      // Owner feedback 2026-07-21 (round 2): "still nothing behind the target
      // or in range of the scope, have to scroll around to find anything" —
      // the three bands above ALL go through drawClearOfLane's uniform
      // minAbsX (28 m) x-clearance rule, so every tree everywhere sits at
      // least 28 m off the sight line. For a tree at a fixed x-offset, its
      // angle off the boresight is atan(x/z) — bigger the closer it is — so
      // that clearance rule leaves a permanent gap dead centre when the scope
      // is aimed at the target, no matter how the other bands are tuned.
      // This band is exempt (`allowOnLane`) and sits well behind the gong
      // (91.44 m) with a ≥45 m buffer, so a small cluster reliably lands
      // near x=0 as visible backdrop without ever standing between the
      // shooter and the target.
      { xMin: -40, xMax: 40, zMin: -280, zMax: -140, allowOnLane: true }, // centred backdrop cluster
    ],
    scaleRange: [0.8, 1.3],
    // Brightened 2026-07-21 (owner feedback round 2, on-device screenshot):
    // the original palette (0x2d5016 etc.) rendered near-black under this
    // lighting rig — flat-shaded canopy faces pointed away from the sun
    // (DirectionalLight at x=-250,y=350,z=150) get little more than the
    // hemisphere fill, which crushes dark albedos toward black. Rather than
    // retune the whole scene's lighting (risking every other already-approved
    // element), pushed the albedo itself much lighter so it stays a visible
    // green even on shadow-side faces.
    palette: [0x4a7a2e, 0x5f9440, 0x74a850, 0x9fc978, 0x86b860], // dark→light greens (mixed forest)
  },
  // Grass tufts sit near the shooter as foreground dressing (they're the one
  // thing allowed in the lane), but at ANY scope magnification a tuft a few
  // metres from the eye fills the whole sight picture and hides the target
  // entirely (owner feedback 2026-07-21: "nothing in the view of the
  // target"). shooterClearM is deliberately generous rather than precise —
  // a big empty circle around the shooter, well past point-blank — and the
  // count is cut back to match so the remaining band doesn't read as a wall
  // of grass either.
  cover: { bushCount: 60, rockCount: 25, grassTuftCount: 140, grassZoneM: 34, shooterClearM: 18 },
  mountains: { count: 12, distMinM: 1000, distMaxM: 1350, heightMinM: 120, heightMaxM: 260, widthToHeight: 1.4 },
  clouds: {
    count: 24,
    heightMinM: 220,
    heightMaxM: 380,
    fieldHalfWidthM: 900,
    fieldZNearM: 100,
    fieldZFarM: -1300,
    baseSizeM: 90,
    fadeMarginM: 120,
  },
};
