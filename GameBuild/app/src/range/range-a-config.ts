// Range A layout config (task 1.2; build-plan §5 Increment 1).
//
// Pure, SI-unit description of the known-distance steel range: one rack every
// 50 yd from 50 → 500. Plates are sized PHYSICALLY, per BTK's steel-sim ladder
// (owner decision 2026-07-14 REVISED 2026-07-15: the earlier constant-MOA
// scheme made near plates coin-sized — a 1 MOA plate at 50 yd is ½″; no real
// range hangs that). BTK's design (web/steel-sim/config.js): fixed inch sizes
// per rack, spanning roughly ~6 MOA (confidence) down to ~1 MOA (challenge) at
// each distance, with a 2″ physical floor. Where BTK defines our distance we
// take a 3-plate subset of its exact set; between, we interpolate in the same
// spirit. MOA is carried as DERIVED metadata (HUD/scoring, Increment 2 ranging
// uses the known physical size). No hidden truth: these are true target sizes.
//
// This module does NO Three.js and NO DOM work, so it is unit-tested directly
// (RangeScene consumes it to build geometry). All lengths are metres; all unit
// conversions go through the units service (guardrail §4.4).

import { yardsToMeters, inchesToMeters, radToMoa } from '../units';

/** A single steel plate on a rack. */
export interface PlateSpec {
  /** Nominal plate size, inches (the value on the range card; BTK-style). */
  inches: number;
  /** DERIVED angular size at this rack's distance, MOA (HUD/scoring metadata). */
  moa: number;
  /** Plate diameter, metres (= inches × 0.0254; round plates). */
  diameterM: number;
}

/** One target rack at a fixed distance, with its catch berm behind it. */
export interface RackSpec {
  /** Stable id, e.g. "rack-250". */
  id: string;
  /** Distance downrange, whole yards (the label on the range sign). */
  distanceYards: number;
  /** Distance downrange, metres (SI; = yards × 0.9144). */
  distanceM: number;
  /** Lateral offset of the rack centre from the firing line, metres (+ = right). */
  xOffsetM: number;
  /** Overall rack width the plates are spread across, metres. */
  rackWidthM: number;
  /** Height of the top beam above ground, metres (posts run ground → beam). */
  beamHeightM: number;
  /** Height of every plate's centre above ground, metres. */
  plateCenterYM: number;
  /** Plates, left → right, largest first. */
  plates: PlateSpec[];
  /** Catch berm behind the rack. */
  berm: BermSpec;
}

/** Sand berm behind a rack that stops missed shots. Low + wide, matching
 *  steel-sim Berm.js proportions (base ≈ 2× rack width, height ≈ rack height). */
export interface BermSpec {
  /** World half-width of the berm BASE, metres (the unit berm's X-scale; the
   *  flat top is half this). Base spans ±this about the rack centre. */
  baseHalfWidthM: number;
  /** Height, metres (~1.1× the rack/beam height — a low mound, not a wall). */
  heightM: number;
  /** Depth downrange, metres. */
  depthM: number;
  /** How far downrange of the rack line the berm centre sits, metres. */
  behindM: number;
}

/** Physical plate ladder, inches, largest → smallest per rack — BTK steel-sim
 *  sizing (config.js TARGET_RACKS_CONFIG). Where BTK defines the distance we
 *  use a subset of its exact set (100: 6,5,4,3,2 · 200: 6,5,4,3,2 · 250:
 *  6,5,4,3 · 300: 6,4,3,2 · 400: 8,6,4,3 · 500: 12,10,8,6,4,2); 50/150/350/450
 *  are interpolated in the same spirit. Floor: nothing smaller than 2″ (BTK's
 *  smallest chip anywhere). Angular difficulty tightens near → far, roughly
 *  ~7→2 MOA on the big plate and ~4→1 MOA on the small one. */
const PLATE_INCHES: Record<number, readonly number[]> = {
  50: [4, 3, 2],
  100: [6, 4, 2],
  150: [6, 4, 3],
  200: [6, 5, 3],
  250: [6, 5, 4],
  300: [6, 4, 3],
  350: [8, 6, 4],
  400: [8, 6, 4],
  450: [10, 8, 6],
  500: [12, 8, 6],
};

/** The ten rack distances, yards. */
const DISTANCES_YARDS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const;

// Lateral fan (yards, + = right). SOLVED offline (greedy, capped to a realistic
// lane) so that no rack's plate row is occluded by any nearer berm as seen from
// the 1.6 m firing-eye, AND every far plate row clears the nearest berm crest by
// ≥ 0.3 m (so racks read as distinct, not stacked on a crest). Guarded by the
// occlusion test in range-a-config.test.ts — change the berm/plate sizing and
// that test forces these to be re-solved.
const X_OFFSET_YARDS: Record<number, number> = {
  50: 0,
  100: 4,
  150: -5,
  200: -9.5,
  250: 0,
  300: 2.5,
  350: -3,
  400: -6,
  450: 7,
  500: 11.5, // re-solved 2026-07-15: 12″ top plate widened the rack; at 10.5 its left edge grazed the 450-yd berm
};

/** Plate centre height above ground, metres (~chest height on the stand). */
const PLATE_CENTER_Y_M = 0.9;

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

function buildRack(yards: number): RackSpec {
  const distanceM = yardsToMeters(yards);
  const plates: PlateSpec[] = PLATE_INCHES[yards].map((inches) => {
    const diameterM = inchesToMeters(inches);
    return {
      inches,
      diameterM,
      moa: radToMoa(diameterM / distanceM), // small-angle: plate ⌀ over range
    };
  });
  const maxD = Math.max(...plates.map((p) => p.diameterM));

  // Rack scales with its plates (so a 1 MOA near rack isn't a giant empty frame)
  // but is floored wide enough that its catch berm still reads as a broad mound.
  const rackWidthM = clamp(maxD * 5.5, 1.2, yardsToMeters(3));

  // Beam sits just above the tallest plate; posts run ground → beam.
  const beamHeightM = PLATE_CENTER_Y_M + maxD / 2 + 0.12;

  // Low, wide catch berm (steel-sim Berm.js proportions): base ≈ 2× rack width
  // (baseHalfWidth = 1.1× rack width → base spans ±1.1× about centre), height
  // ≈ 1.1× the rack height. A broad mound, deliberately NOT a wall.
  const berm: BermSpec = {
    baseHalfWidthM: rackWidthM * 1.1,
    heightM: beamHeightM * 1.1,
    depthM: yardsToMeters(3),
    behindM: yardsToMeters(2),
  };

  return {
    id: `rack-${yards}`,
    distanceYards: yards,
    distanceM,
    xOffsetM: yardsToMeters(X_OFFSET_YARDS[yards]),
    rackWidthM,
    beamHeightM,
    plateCenterYM: PLATE_CENTER_Y_M,
    plates,
    berm,
  };
}

/** The Range A rack ladder: 10 racks at 50 → 500 yd, near → far. */
export const RANGE_A_RACKS: readonly RackSpec[] = DISTANCES_YARDS.map(buildRack);

/** Ground-strip dimensions (metres) sized to comfortably contain all racks. */
export const RANGE_A_GROUND = {
  /** Green firing-lane strip width, metres. */
  laneWidthM: yardsToMeters(70),
  /** Green firing-lane length downrange, metres (past the 500-yd rack). */
  laneLengthM: yardsToMeters(560),
  /** Brown backdrop width, metres. */
  backdropWidthM: yardsToMeters(1200),
  /** Brown backdrop length, metres. */
  backdropLengthM: yardsToMeters(1600),
} as const;
