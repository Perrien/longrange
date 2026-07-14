// Range A layout config (task 1.2; build-plan §5 Increment 1).
//
// AUTHORED-INPUTS model, restructured 2026-07-14 to mirror BallisticsToolkit's
// steel-sim (web/steel-sim/config.js TARGET_RACKS_CONFIG + steel-sim.js berm
// build). BTK's design has THREE independent authored inputs per rack —
//   (1) a fixed rack frame size (width/height, in whole yards),
//   (2) an explicit list of plate sizes (inches), and
//   (3) distance/position —
// and derives ONLY the catch berm from the frame. Nothing computes plate size
// from the rack, or rack size from the plates. This module now follows that:
// `PLATE_INCHES` and `RACK_WIDTH_YARDS` are hand-authored per rack; the berm is
// derived from the (authored) rack frame; MOA is DERIVED metadata (HUD/scoring;
// Increment 2 ranging uses the known physical size). No hidden truth — these are
// true target sizes.
//
// (Supersedes the 2026-07-15 scheme where rackWidth/beam/berm were all COMPUTED
// from the largest plate — that coupled rack+berm size to the plate ladder, the
// opposite of BTK's model.)
//
// Every rack carries 5 plates (matching BTK's near racks). Plate SIZES match BTK
// where BTK defines the distance (100/200 = {6,5,4,3,2}) and grow near → far in
// the same spirit elsewhere (biggest plate 6″ out to 300, then 7/8/10/12″), each
// rack largest-first down to a 2″/3″ tail. Physical floor: nothing smaller than
// 2″ (BTK's smallest chip).
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
  /** Overall rack width the plates are spread across, metres (AUTHORED frame). */
  rackWidthM: number;
  /** Height of the top beam above ground, metres (AUTHORED frame; posts run
   *  ground → beam). Also drives the berm height. */
  beamHeightM: number;
  /** Height of every plate's centre above ground, metres. */
  plateCenterYM: number;
  /** Plates, left → right, largest first (AUTHORED list). */
  plates: PlateSpec[];
  /** Catch berm behind the rack (DERIVED from the rack frame, BTK-style). */
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

/** AUTHORED plate ladder, inches, largest → smallest per rack (mirrors BTK's
 *  steel-sim config.js `targets` arrays). Five plates on every rack; sizes are
 *  BTK-exact where BTK defines the distance (100/200), and grow near → far in the
 *  same spirit elsewhere. Floor: nothing smaller than 2″. */
const PLATE_INCHES: Record<number, readonly number[]> = {
  50: [6, 5, 4, 3, 2], //  BTK's near set
  100: [6, 5, 4, 3, 2], // = BTK 100 yd
  150: [6, 5, 4, 3, 2],
  200: [6, 5, 4, 3, 2], // = BTK 200 yd
  250: [6, 5, 4, 3, 2],
  300: [6, 5, 4, 3, 2],
  350: [7, 6, 5, 4, 3],
  400: [8, 6, 5, 4, 3], // BTK 400 yd tops at 8″
  450: [10, 8, 6, 5, 4],
  500: [12, 10, 8, 6, 4], // ⊂ BTK 500 yd {12,10,8,6,4,2}
};

/** AUTHORED rack frame width, whole yards (BTK's fixed ladder: 1.5 yd out to
 *  300, 2 yd at 400, 3 yd at 500; 350/450 interpolated). Independent of plate
 *  size — the berm is derived from this, per BTK's model. */
const RACK_WIDTH_YARDS: Record<number, number> = {
  50: 1.5,
  100: 1.5,
  150: 1.5,
  200: 1.5,
  250: 1.5,
  300: 1.5,
  350: 1.75,
  400: 2,
  450: 2.5,
  500: 3,
};

/** AUTHORED rack frame height (top beam), yards — constant across racks, as in
 *  BTK. Kept a touch above BTK's 1 yd so a chest-height plate ladder clears the
 *  beam; it also sets the (low, wide) berm height at ×1.1. */
const RACK_HEIGHT_YARDS = 1.2;

/** The ten rack distances, yards. */
const DISTANCES_YARDS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const;

// Lateral fan (yards, + = right). RE-SOLVED offline 2026-07-14 for the authored
// geometry with the dropped (0.5× beam) plate height, via /tmp/solve-fan.mjs —
// global min-max by bounded backtracking (max |offset| = 6.5 yd). Lowering the
// plates steepens the eye→plate rays, so nearly every far row must clear nearer
// berms laterally rather than over the crest; the backtracker packs all ten rows
// clear within ±6.5 yd of centre. Guarded by the occlusion test in
// range-a-config.test.ts — change the berm/plate/rack sizing or the plate height
// and that test forces these to be re-solved.
const X_OFFSET_YARDS: Record<number, number> = {
  50: 3.5,
  100: -6,
  150: -5.5,
  200: 6.5,
  250: -5.5,
  300: 6.5,
  350: 1.5,
  400: -1.5,
  450: -5.5,
  500: 6.5,
};

/** Plate centre height as a fraction of the beam height — plates hang at ~half
 *  the rack frame (dropped 2026-07-14 from ~0.73× on owner note; sits well below
 *  the beam so the frame clears the tallest plate). */
const PLATE_CENTER_FRACTION = 0.5;

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

  // AUTHORED rack frame (BTK model): width + beam height are fixed inputs, NOT
  // derived from the plates.
  const rackWidthM = yardsToMeters(RACK_WIDTH_YARDS[yards]);
  const beamHeightM = yardsToMeters(RACK_HEIGHT_YARDS);
  const plateCenterYM = beamHeightM * PLATE_CENTER_FRACTION;

  // Catch berm DERIVED from the rack frame (steel-sim.js): flat top = rack width
  // (baseHalfWidth = 1.1× rack width → base ≈ 2× rack width), height ≈ 1.1× the
  // rack height, 3 yd deep, centred 2 yd behind the rack. A broad low mound.
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
    plateCenterYM,
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
