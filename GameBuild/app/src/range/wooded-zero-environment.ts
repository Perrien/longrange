// Environment tuning for the Wooded Zero Range — Stage 2b of
// `Design/archive/mil-zero-range-plan.md`. Pure data + the injected clearance
// geometry; no THREE.
//
// This is the config half of the range. It reuses the SHARED environment module
// (`range/environment/`) unchanged, and hands it a `TerrainClearance` built from
// the already-tested corridor functions in `wooded-zero-config.ts` — so the fan
// geometry has exactly one implementation, and the environment module stays
// generic (it never learns what a "fan" is).
//
// Stage 3 replaces the lighting/fog here with the low morning sun + aerial
// perspective; Stage 4 the trees and mountains. The values below are the CURRENT
// shared look, deliberately, so Stage 2b's device check is about the bay's
// geometry and not confounded by an art change landing at the same time.

import {
  CORRIDOR_OVERRUN_M,
  SHOOTER_CLEAR_M,
  buildCorridors,
  corridorFloorY,
  insideAnyCorridor,
} from './wooded-zero-config';
import type { EnvironmentConfig, TerrainClearance } from './environment/environment-config';

/** The corridors the world is cleared against — always metric, so the imperial
 *  layout rides inside them as a subset (plan §8). Built once at module load;
 *  they are a fixed property of the range. */
const CORRIDORS = buildCorridors();

/** Ground radius the range extends to (m) — the far corridor plus room for the
 *  woods to close in behind the 200 m station. */
export const WOODED_ZERO_REACH_M = Math.max(...CORRIDORS.map((c) => c.reachM));

export const WOODED_ZERO_CLEARANCE: TerrainClearance = {
  floorY: corridorFloorY,
  insideCorridor: (x, z, inflateM = 0) => insideAnyCorridor(x, z, CORRIDORS, inflateM),
  shooterClearM: SHOOTER_CLEAR_M,
};

/**
 * Tree bands. Unlike the Test Range's, these do NOT need hand-tuned x-clearance:
 * corridor termination does that work correctly and automatically, so the bands
 * can simply cover the whole field and let rejection carve the lanes out. That
 * is the practical payoff of the terminating-wedge model — the Test Range needed
 * three tuning rounds and an `allowOnLane` escape hatch to get trees to appear
 * behind its target; here it falls out of the geometry.
 */
const TREE_BANDS = [
  // Whole field, near to far. Rejection removes the four lanes.
  { xMin: -180, xMax: 180, zMin: -320, zMax: -20 },
  // Extra weight behind the 200 m station so misses vanish into woods rather
  // than flying on over open ground (the Test Range's >=40 m rule).
  { xMin: -120, xMax: 120, zMin: -420, zMax: -250 },
  // NEAR-STATION BACKDROP (added Stage 4a, 2026-07-26). Without this the 25 m
  // and 50 m stations had literally ZERO trees within 60 m behind them, and the
  // "each station sits in its own pocket of forest" idea (plan §3.2) was not
  // actually delivered — it only looked delivered because a point-sample test
  // asked whether a tree COULD stand there, not whether one DID.
  //
  // Why the big first band does not cover it: bands are sampled uniformly by
  // area, and this pocket is ~4% of that band's footprint, of which corridor
  // rejection removes most. Giving it its own band buys it a full share of the
  // draws. It reaches left of the 25 m lane because the wedge between adjacent
  // near lanes is too narrow for a canopy — the woods sit just OUTSIDE the fan
  // and still read as backdrop at this distance.
  { xMin: -45, xMax: 10, zMin: -125, zMax: -32 },
];

export const WOODED_ZERO_ENVIRONMENT: EnvironmentConfig = {
  seed: 20260726,
  terrain: {
    widthM: 460,
    lengthM: 520,
    // Injected fan model — this is what replaces the single-lane box below.
    clearance: WOODED_ZERO_CLEARANCE,
    // Retained because `EnvironmentConfig` still requires them, and the
    // tree-band `minAbsX` fallback reads them. They are INERT while `clearance`
    // is set; kept at plausible values rather than 0 so that if someone ever
    // removes `clearance` the range degrades to a sane single lane instead of
    // a zero-width one.
    laneHalfWidthM: 16,
    laneBlendM: 12,
    zFlatToM: 220,
    zBlendM: 40,
    reliefAmpM: 2.2,
    // Well off to the right and far enough back that it reads as a low rise on
    // the horizon rather than a wall behind the 200 m station.
    hill: { xM: 120, zM: -390, radiusM: 70, heightM: 6 },
  },
  // Early-morning sky: warmer and paler at the horizon than the midday dome,
  // so the low sun has something consistent to sit in.
  sky: { horizonHex: 0xe6dcc8, midHex: 0xa8c4e0, zenithHex: 0x5688c4, domeRadiusM: 1500 },
  // Aerial perspective (plan §9.5). Density chosen so the 200 m board sits at
  // ~2% fog — board contrast (§5.2) must not be eaten by haze — while the
  // 1000-1350 m ridge sits at 43-64%.
  fog: { colorHex: 0xe6dcc8, density: 7.45e-4 },
  // Morning sun BEHIND the firing line (plan §9.1). The AZIMUTH is the
  // load-bearing number: anything in front of the shooter lights every target
  // board edge-on, which silently defeats the no-berm board contrast of §5.2.
  //
  // Elevation raised 14 -> 24 deg on owner feedback (2026-07-26, on device: "make
  // the sun a bit higher, an hour or so later, it's a bit darker than I'd like").
  // The sun climbs roughly 10-13 deg/hour at mid-latitudes, so this is about an
  // hour later. Shadows shorten from 4.0x to 2.25x object height — still clearly
  // raking, nowhere near the flat ~54 deg midday rig this replaced — and board
  // illumination barely moves (0.557 -> 0.524). Intensity lifted with it
  // (sun 1.35 -> 1.6, hemi 0.55 -> 0.75) and the key warmed off deep orange,
  // since a higher sun is less reddened.
  lighting: {
    sunElevationDeg: 24,
    sunAzimuthDeg: -125,
    sunHex: 0xffe3ba,
    sunIntensity: 1.6,
    hemiSkyHex: 0x93b4e0,
    hemiGroundHex: 0x4a5236,
    hemiIntensity: 0.75,
    shadows: { mapSize: 2048, extentM: 100, normalBias: 0.08, bias: -0.0005 },
  },
  trees: {
    coniferCount: 190,
    deciduousCount: 120,
    bands: TREE_BANDS,
    scaleRange: [0.8, 1.35],
    palette: [0x4a7a2e, 0x5f9440, 0x74a850, 0x9fc978, 0x86b860],
  },
  cover: { bushCount: 70, rockCount: 30, grassTuftCount: 140, grassZoneM: 34, shooterClearM: SHOOTER_CLEAR_M },
  // Two overlapping ridgelines (Stage 4b). The far one is lower, paler and
  // further, so aerial perspective separates them into distinct depths instead
  // of one flat cut-out. Both sit inside the 1500 m sky dome and the 3000 m
  // camera far plane. At the configured fog density they land at roughly 49%
  // and 69% haze — a real gradient, which is exactly what the old linear fog
  // could not produce.
  ridges: {
    halfArcDeg: 70,
    layers: [
      { distanceM: 1100, heightMinM: 90, heightMaxM: 250, colorHex: 0x5d6b7a, segments: 96 },
      { distanceM: 1430, heightMinM: 60, heightMaxM: 170, colorHex: 0x8493a3, segments: 80 },
    ],
  },
  // Canopy sway driven by the SAME wind the bullet gets (Stage 5, plan §9.6).
  // Quadratic in height above the trunk base, so crowns move and trunks do not
  // — which is both how a tree behaves and what the owner asked for (§7.3:
  // "the very light wind just affecting tree tops is fine").
  windSway: {
    halfWidthM: 250,
    depthM: 450,
    sampleHeightM: 8,
    bendScale: 0.0016,
    maxBendM: 0.8,
    swayHz: 1.1,
  },
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

/** Sanity value used by the scene + tests: how far past the last target the
 *  cleared ground runs. */
export const WOODED_ZERO_OVERRUN_M = CORRIDOR_OVERRUN_M;
