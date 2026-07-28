// ELR Probe layout — step P1 of `Design/elr-probe-plan.md`.
//
// Pure config: no THREE, no engine, no store. Produces the fixed physical layout
// of a THROWAWAY 3 km diagnostic range — six 1 MIL gongs at 500 m steps on a dead
// flat plane, plus (P3) the convex rising-slope variant.
//
// This range is NOT a product. It exists to answer questions no table can settle —
// whether an 18-second shot is tense or tedious, whether 3 km reads as distance
// rather than a grey band, and whether frame time holds — before the real ELR range
// (`Design/elr-dope-range-plan.md`, capped at 2000) is built. Expect to delete it.
//
// Deliberately metric-only: the dual-unit superset invariant that
// `wooded-zero-config.ts` exists to protect is not under test here, and leaving it
// out keeps the probe small.

import { chooseOffset, offsetCandidates } from './sight-clearance';
import type { TreePlacement } from './environment/environment-config';
import { getRangeDefinition } from './ranges';

const DEG = Math.PI / 180;

/** Prone eye above the ground it lies on (m) — the flat-profile firing point. */
export const EYE_ABOVE_GROUND_M = 1.7;

/** MINIMUM gong centre above its own local ground (m) — what a small near target
 *  sits at. Bigger targets are raised so their frame clears the dirt; see
 *  `targetCenterYFor`. */
export const TARGET_CENTER_Y_M = 1.0;

/** Air under the bottom edge of a target frame (m) — enough that the posts read as
 *  posts rather than the panel growing straight out of the ground. */
export const FRAME_GROUND_CLEARANCE_M = 0.3;

/**
 * Height of a gong's centre above ITS OWN local ground (m).
 *
 * Targets are constant-ANGULAR, so their physical size grows with distance: the
 * 3000 m gong is 3 m across and its frame 6 m tall. Pinning every centre at 1.0 m
 * therefore buried the far frames — the 3000 m panel's bottom edge sat **2 m
 * underground**, and the effect scaled with distance exactly as the owner observed
 * on device (2026-07-27: "the farther targets are slightly below the ground").
 *
 * So the centre is the greater of the near-target height and whatever it takes to
 * stand the frame clear of the dirt. That is also what real ELR ranges do — a plate
 * that size cannot have its centre a metre off the deck without being half-buried,
 * so it goes on a taller stand.
 */
export function targetCenterYFor(gongDiameterM: number): number {
  const frameHalfHeight = (gongDiameterM * FRAME_HEIGHT_MULTIPLE) / 2;
  return Math.max(TARGET_CENTER_Y_M, frameHalfHeight + FRAME_GROUND_CLEARANCE_M);
}

/**
 * Gong diameter as an angle. **1 MIL at every station** (owner, 2026-07-27), so
 * the plate diameter in metres is the station number with the decimal moved:
 * 500 m → 0.50 m, 3000 m → 3.00 m.
 *
 * Constant-angular sizing is what makes the occlusion proof trivial (every
 * silhouette subtends the same angle regardless of distance) and what keeps the
 * range about the firing solution rather than marksmanship.
 */
export const GONG_ANGULAR_SIZE_RAD = 1e-3;

/** Frame around the gong, as multiples of the gong diameter. The dark panel is
 *  load-bearing, not decoration — see `PLATE_HEX` / `PANEL_HEX`. */
export const FRAME_WIDTH_MULTIPLE = 1.5;
export const FRAME_HEIGHT_MULTIPLE = 2.0;

/**
 * Bullseye rings, as fractions of the gong diameter (owner, 2026-07-27):
 * 1 MOA / 2 MOA / 3 MOA, i.e. ⅓ / ⅔ / 1 MIL. Generous to hit, but a tight group
 * still reads.
 *
 * WHITE / BLUE / WHITE, not red / blue / white. A red centre was specced first and
 * rejected on measurement: red `0xd81f26` is 0.30 luminance and the blue ring 0.32
 * — they differ only in HUE, and hue is the first thing to go at range (fog
 * desaturates, and at 10x the whole plate is ~21 px). The red centre would have
 * merged into the blue ring at exactly the distances the pattern exists to serve.
 * White on blue is 0.62 of luminance contrast: an edge that survives desaturation,
 * fog, and a handful of pixels.
 */
export const RING_FRACTIONS = { centre: 1 / 3, middle: 2 / 3, outer: 1 } as const;

/** Near-white plate face (the same value the Wooded Zero Range's boards use). */
export const PLATE_HEX = 0xf2efe6;
/** Middle ring. Mid blue, chosen between navy and a brighter blue: navy drops the
 *  plate's average luminance to 0.59, a brighter blue lifts it to 0.72 — at which
 *  point the disc crosses pale ground's luminance and the target becomes
 *  camouflage. This keeps margin on both sides. */
export const RING_HEX = 0x2f6fd0;
/**
 * Dark backer panel. **Load-bearing, not decoration.** Fog costs bright objects
 * far more contrast than dark ones, so a white plate on pale ground is the WORST
 * combination available (contrast under 0.05 at 3000 m — it effectively
 * disappears). On a dark panel it holds at ~0.40 regardless of what ground colour a
 * later biome picks, which also decouples the target palette from the ground
 * palette — two decisions that should never have been entangled.
 */
export const PANEL_HEX = 0x2a2a28;

/** Mid neutral ground — deliberately neither pale nor dark, so the plate can be
 *  judged on its own merits before a biome is chosen. */
export const GROUND_HEX = 0x8a8577;

/**
 * Ground plane extent (m).
 *
 * WIDTH was 300 and read as a ribbon rather than terrain (owner, on device
 * 2026-07-27) — 300 m across 3 km of depth is a 1:10 sliver, and its side edges sit
 * only ±2.9° off the sight line at the far station, well inside the scope's own
 * field at low magnification. 1200 m puts the edges past ±11°, so they leave the
 * picture entirely and the ground reads as ground.
 */
export const GROUND_WIDTH_M = 1200;
export const GROUND_LENGTH_M = 3100;

/**
 * Downrange distance (m) of a terrain-plane vertex, from its LOCAL y.
 *
 * `PlaneGeometry` is built in XY spanning ±length/2, then rotated −90° about X and
 * pushed to `z = −length/2`, which maps local +Y to world −Z. So the vertex at
 * `localY = −length/2` sits at the shooter and `+length/2` at the far end:
 *
 *     downrange = localY + length / 2
 *
 * EXTRACTED AND TESTED BECAUSE IT WAS WRONG ONCE. The first version wrote
 * `-localY - length/2 + length/2`, which collapses to `-localY`, and with an
 * `Math.abs()` on top became `|localY|` — a V-shaped valley, high at BOTH ends and
 * zero in the middle. On the slope variant that put 53 m of hill where the shooter
 * stands, burying the 11.7 m camera 41 m underground; the visible symptom was a
 * narrow band of terrain with the targets floating above it.
 */
export function groundLocalYToDownrangeM(localY: number, lengthM: number): number {
  return localY + lengthM / 2;
}

// ---------------------------------------------------------------------------
// Probe B — the rising-slope variant (plan §3.3)
// ---------------------------------------------------------------------------

/** Bluff height above the deck datum for Probe B (m); eye sits `EYE_ABOVE_GROUND_M`
 *  above that. Probe A uses 0. */
export const SLOPE_BLUFF_HEIGHT_M = 10;

/** Ground height at the far station for Probe B (m). */
export const SLOPE_RISE_M = 200;

/** Distance the rise is measured over (m). */
export const SLOPE_SPAN_M = 3000;

/**
 * Probe B ground profile — **CONVEX, and that is the entire point.**
 *
 * The intuition is that raising the far targets spreads them out vertically. On a
 * LINEAR slope that is simply false: every target on a straight line through space
 * subtends nearly the same elevation angle from a fixed eye, so adjacent stations
 * differ by 0.041° against a 0.143° requirement — and it is 0.041° whether the hill
 * rises 50 m or 300 m, because the effect is a ratio and a straight line holds the
 * ratio constant.
 *
 * A convex profile breaks the ratio. At a 200 m rise the stations spread from
 * −0.59° to +3.61° and the worst pair clears by +0.532°, on a SINGLE straight lane
 * with no azimuth fan at all.
 *
 * Convexity also buys sight-line clearance for free: **the chord between any two
 * points on a convex curve lies above the curve**, so no intervening ground can
 * rise into a sight line. Clearance to the 3000 m gong runs 26–56 m through the
 * middle of the range; on the linear profile it collapses to 1.18 m at r = 2950.
 */
export function slopeGroundY(r: number): number {
  const t = Math.min(1, Math.max(0, r / SLOPE_SPAN_M));
  return SLOPE_RISE_M * t * t;
}

/** Which probe variant a scene is built for. */
export type ProbeVariant = 'flat' | 'slope';

/**
 * Read the probe variant from a URL query string, e.g. `?range=elr-probe&probe=slope`.
 *
 * Deliberately a URL parameter and NOT a second registry row or a store field. Both
 * probes share one station list and one config; duplicating a registry row would
 * duplicate that list, and a store field would put throwaway diagnostic state into
 * the save schema. A query param keeps the whole thing contained to the probe, which
 * is the right blast radius for something built to be deleted.
 *
 * Anything unrecognised falls back to `flat`, so a typo lands on the baseline rather
 * than an empty scene.
 */
export function probeVariantFromSearch(search: string): ProbeVariant {
  const v = new URLSearchParams(search).get('probe');
  return v === 'slope' ? 'slope' : 'flat';
}

/** Ground height at radius `r` for a variant. Probe A is a plane at 0; Probe B
 *  starts on the bluff and follows the convex profile. */
export function groundYFor(variant: ProbeVariant, r: number): number {
  return variant === 'flat' ? 0 : slopeGroundY(r);
}

/** Shooter eye height above the world datum for a variant (m). */
export function eyeYFor(variant: ProbeVariant): number {
  return (variant === 'slope' ? SLOPE_BLUFF_HEIGHT_M : 0) + EYE_ABOVE_GROUND_M;
}

// ---------------------------------------------------------------------------
// Stations
// ---------------------------------------------------------------------------

export interface ElrProbeStation {
  /** Line-of-sight range in SI metres — the ballistic range, and what the solver
   *  must receive. NOT the ground run. */
  losRangeM: number;
  /** Nominal distance for HUD labels (metres; the probe is metric-only). */
  nominalDistance: number;
  /** Bearing from downrange, + = right (deg). Zero for Probe B, which separates
   *  its stations vertically instead. */
  azimuthDeg: number;
  /** Horizontal distance from the shooter to the target (m). */
  groundRunM: number;
  x: number;
  y: number;
  z: number;
  /** Sight-line angle from horizontal (deg; negative = looking down). */
  elevationDeg: number;
  /** Gong diameter (m) — constant-angular, so it grows with distance. */
  gongDiameterM: number;
  frameWidthM: number;
  frameHeightM: number;
  markerText: string;
}

export interface ElrProbeLayout {
  variant: ProbeVariant;
  eyeYM: number;
  stations: ElrProbeStation[];
  ground: { widthM: number; lengthM: number };
}

/**
 * Build the probe layout for a variant.
 *
 * **Probe A must be fanned; a straight line cannot see its own far end.** On flat
 * ground the sight line to the 3000 m gong passes 1.117 m high at r = 2500 m while
 * the 2500 m gong's top edge is at 2.250 m — it blocks, as does every adjacent pair
 * down to 1000/1500. The ±1.5° fan (0.6° steps) clears the worst pair by +0.457°
 * against a 0.143° requirement.
 *
 * **Probe B uses a single lane on purpose** — the convex slope separates the
 * stations in elevation instead, which is the hypothesis under test.
 */
export function snapshotElrProbe(variant: ProbeVariant = 'flat'): ElrProbeLayout {
  const eyeYM = eyeYFor(variant);
  const stations = getRangeDefinition('elr-probe').stations.map((s) => {
    const losRangeM = s.nominalDistance;
    const azimuthDeg = variant === 'slope' ? 0 : (s.azimuthDeg ?? 0);
    // Ground run is solved FROM the line-of-sight range, so the number handed to
    // the solver is the one the scope actually sees (the Wooded Zero Range's §3.3
    // convention, which matters far more here than it did at 200 m).
    //
    // On a slope this is mildly circular: the target's HEIGHT depends on the ground
    // where it stands, which is its GROUND RUN, which depends on the height. Reading
    // the ground at `losRangeM` instead — the first version — left every gong
    // floating slightly off the terrain (0.14 m at the worst station), which is
    // exactly the "ground and targets don't meet" the owner saw.
    //
    // Three fixed-point passes settle it: the terrain gradient is at most 13 %, so
    // each pass shrinks the error by an order of magnitude and the residual is well
    // under a millimetre. Flat ground converges on the first pass by construction.
    const gongDiameterM = GONG_ANGULAR_SIZE_RAD * losRangeM;
    const centreAboveGroundM = targetCenterYFor(gongDiameterM);
    let groundRunM = losRangeM;
    let targetY = centreAboveGroundM;
    for (let pass = 0; pass < 3; pass++) {
      targetY = groundYFor(variant, groundRunM) + centreAboveGroundM;
      const d = targetY - eyeYM;
      groundRunM = Math.sqrt(Math.max(0, losRangeM * losRangeM - d * d));
    }
    const dy = targetY - eyeYM;
    const a = azimuthDeg * DEG;
    return {
      losRangeM,
      nominalDistance: s.nominalDistance,
      azimuthDeg,
      groundRunM,
      x: groundRunM * Math.sin(a),
      y: targetY,
      z: -groundRunM * Math.cos(a),
      elevationDeg: Math.asin(dy / losRangeM) / DEG,
      gongDiameterM,
      frameWidthM: gongDiameterM * FRAME_WIDTH_MULTIPLE,
      frameHeightM: gongDiameterM * FRAME_HEIGHT_MULTIPLE,
      markerText: `${s.nominalDistance} M`,
    };
  });

  return {
    variant,
    eyeYM,
    stations,
    ground: { widthM: GROUND_WIDTH_M, lengthM: GROUND_LENGTH_M },
  };
}

/** Half-diagonal of a station's frame as seen from the firing point (rad) — the
 *  quantity the occlusion check compares against angular separation. Constant
 *  across stations by construction, since the frame scales with the gong. */
export function frameHalfDiagonalRad(station: ElrProbeStation): number {
  return (
    Math.hypot(station.frameWidthM / 2, station.frameHeightM / 2) / station.losRangeM
  );
}

/** Full angular separation between two stations (deg), combining azimuth and
 *  elevation. Two stations clear when this exceeds the sum of their frame
 *  half-diagonals. */
export function angularSeparationDeg(a: ElrProbeStation, b: ElrProbeStation): number {
  return Math.hypot(a.azimuthDeg - b.azimuthDeg, a.elevationDeg - b.elevationDeg);
}

/** Height of the sight line to `station` at ground radius `r` (m). */
export function sightLineY(layout: ElrProbeLayout, station: ElrProbeStation, r: number): number {
  const t = station.groundRunM === 0 ? 0 : r / station.groundRunM;
  return layout.eyeYM + (station.y - layout.eyeYM) * t;
}

// ---------------------------------------------------------------------------
// Target placement among trees (P14) — the stations move to suit the forest.
// ---------------------------------------------------------------------------

/**
 * How far off the centre line a station may be pushed, in MILLIRADIANS.
 *
 * Angular rather than metric, for the same reason the gongs are 1 MIL: a fixed
 * metric offset is a huge swing up close and an imperceptible nudge far out,
 * which is backwards — the far stations are where the shooting is interesting.
 * 25 mrad is 6 m at 250 m and 50 m at 2000 m, and costs about two 20x fields of
 * view of traverse to sweep.
 *
 * 25 sits on the knee measured across 8 forest seeds at 4000 trees: below it the
 * search runs out of room (10 mrad still leaves ~9.5 trees needing removal),
 * above it each extra field of view of traverse buys about one tree. Targets
 * further out than this stop being interesting to find and start being tiring.
 */
export const OFFSET_CAP_MRAD = 25;

/** Candidate offsets per station. Fine enough to find a gap, coarse enough that
 *  the search stays trivial at scene-build time. */
const OFFSET_SAMPLES = 61;

/**
 * Re-site every station at the lateral offset where the forest most nearly
 * leaves it in the clear.
 *
 * INVERTS THE USUAL ORDER. The obvious approach — place targets, then cut the
 * trees in the way — makes a range look surveyed and costs a corridor. Here the
 * distances are fixed (they are the whole point of a DOPE range) and the lateral
 * position is free, so the trees keep their ground and the targets move. What
 * comes out is irregular, tucked-into-the-terrain placement, and the left-right
 * traverse the owner asked for arrives as a side effect rather than as a pattern
 * anyone had to author.
 *
 * `groundRunM` is what gets handed to the search, not `losRangeM`: the station's
 * x/z are built from the horizontal run, and passing the slant range would place
 * every target slightly too far out.
 */
export function withSolvedOffsets(
  layout: ElrProbeLayout,
  trees: readonly TreePlacement[],
): ElrProbeLayout {
  const eye = { x: 0, y: layout.eyeYM, z: 0 };
  const stations = layout.stations.map((st) => {
    const capM = (OFFSET_CAP_MRAD / 1000) * st.groundRunM;
    const candidates = offsetCandidates(capM, (2 * capM) / (OFFSET_SAMPLES - 1));
    const picked = chooseOffset(
      eye,
      st.groundRunM,
      st.y,
      st.gongDiameterM / 2,
      trees,
      { candidates },
    );
    // Express the result as an azimuth so the rest of the layout — occlusion
    // checks, sight lines, sign placement — keeps working off one representation
    // rather than gaining a second, parallel notion of "sideways".
    const azimuthDeg =
      (Math.asin(Math.max(-1, Math.min(1, picked.offsetM / st.groundRunM))) * 180) / Math.PI;
    const a = (azimuthDeg * Math.PI) / 180;
    return {
      ...st,
      azimuthDeg,
      x: st.groundRunM * Math.sin(a),
      z: -st.groundRunM * Math.cos(a),
    };
  });
  return { ...layout, stations };
}
