import {
  chooseOffset,
  offsetCandidates,
  prepareOccluders,
  occludingTreeIndices,
  marginForPlate,
  type Occluder,
} from './sight-clearance';
import type { TreePlacement } from './environment/environment-config';

/** Firing point identity. */
export type FiringPoint = 'low' | 'high';

// --- terrain ---------------------------------------------------------------
/** Ground extent, centred on x = 0, spanning z ∈ [0, −GROUND_LENGTH_M]. */
export const GROUND_WIDTH_M = 1400;
export const GROUND_LENGTH_M = 3000;
/** Total rise of the convex slope over SLOPE_SPAN_M. */
export const SLOPE_RISE_M = 200;
export const SLOPE_SPAN_M = 3000;
/**
 * Ground colour shown until (or unless) the grass texture loads.
 *
 * Only a FALLBACK since 2026-07-29 — the ground is the Wooded Zero Range's grass
 * PBR material now, and this is what an offline-first load failure degrades to
 * (`environment/texture-loader.ts`). Held at that range's own fallback value so
 * the two degrade identically instead of one going dark olive.
 */
export const GROUND_HEX = 0x7d9450;
/**
 * Metres of ground per grass-texture tile.
 *
 * The same 8 m the Wooded Zero Range uses, and it must stay the same: apparent
 * blade scale is what makes two ranges read as the same place, and it is set
 * entirely by this number. On a 1400 × 3000 m ground that is a 175 × 375 repeat,
 * which mipmapping and the loader's 4× anisotropy carry — the alternative, a
 * bigger tile to cut the repeat count, would make the grass at the low line look
 * like a different species.
 */
export const GROUND_TEXTURE_TILE_M = 8;

/**
 * Convex ground profile. `r` is downrange distance in metres, POSITIVE.
 *
 * ⚠️ **`SLOPE_SPAN_M` must be >= `GROUND_LENGTH_M`.** This function CLAMPS `t` at 1,
 * so past the span the ground goes flat — and the slope does not ease off, it stops
 * dead. That is a curvature discontinuity, and it renders as a hard crease straight
 * across the terrain.
 *
 * Worse, on a convex hill the crease lands exactly at the SKYLINE: apparent ground
 * angle peaks where the rise stops and falls away beyond it, so everything past the
 * crease hides behind it. First build had span 2100 inside a 2300 m ground: a visible
 * seam, 200 m of terrain and its trees hidden, and the 2000 m gong left with **2.4
 * mrad** of hillside behind it — effectively silhouetted against sky, which breaks the
 * white-plate-on-dark-backdrop contrast the target design assumes.
 *
 * With span 3000 >= length 3000 the clamp never falls inside the drawn ground, and the
 * 2000 m gong gets **22.6 mrad** of hillside behind it. `groundInvariantHolds()` guards
 * this; there is a test.
 */
export function groundY(r: number): number {
  const t = Math.min(1, Math.max(0, r / SLOPE_SPAN_M));
  return SLOPE_RISE_M * t * t;
}

/**
 * The terrain invariant: the convex rise must not clamp inside the drawn ground.
 * Exported so it can be asserted rather than remembered.
 */
export function groundInvariantHolds(): boolean {
  return SLOPE_SPAN_M >= GROUND_LENGTH_M;
}

// --- firing points ---------------------------------------------------------
export const EYE_ABOVE_GROUND_M = 1.7;
/** How far the high line stands above local ground (m). */
export const HIGH_LINE_PLATFORM_M = 8;

/** Eye height above the world datum for a firing point (m). */
export function eyeYFor(point: FiringPoint): number {
  return (point === 'high' ? HIGH_LINE_PLATFORM_M : 0) + EYE_ABOVE_GROUND_M;
}

// --- ladders ---------------------------------------------------------------
/** Rimfire ladder, shot from the low line (m). */
export const LOW_STATIONS_M = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const;
/** Centrefire ladder, shot from the high line (m). */
export const HIGH_STATIONS_M = [250, 500, 750, 1000, 1250, 1500, 1750, 2000] as const;

export function stationsFor(point: FiringPoint): readonly number[] {
  return point === 'low' ? LOW_STATIONS_M : HIGH_STATIONS_M;
}

// --- targets ---------------------------------------------------------------
/** Gongs are constant-angular: 1 MIL. Diameter (m) = losRangeM / 1000. */
export const GONG_ANGULAR_SIZE_RAD = 1e-3;
export const FRAME_WIDTH_MULTIPLE = 1.5;
export const FRAME_HEIGHT_MULTIPLE = 2.0;
export const FRAME_GROUND_CLEARANCE_M = 0.3;
export const TARGET_CENTER_Y_M = 1.0;
export const PLATE_HEX = 0xf2efe6;
export const RING_HEX = 0x2f6fd0;
export const PANEL_HEX = 0xff7a1a;
export const RING_FRACTIONS = { centre: 1 / 3, middle: 2 / 3, outer: 1 } as const;

/** Target centre height ABOVE LOCAL GROUND, so the frame's bottom edge clears it. */
export function targetCenterAboveGroundM(gongDiameterM: number): number {
  const frameHalfHeight = (gongDiameterM * FRAME_HEIGHT_MULTIPLE) / 2;
  return Math.max(TARGET_CENTER_Y_M, frameHalfHeight + FRAME_GROUND_CLEARANCE_M);
}

// --- low-line racks --------------------------------------------------------
//
// Owner call, 2026-07-29, after seeing the rimfire ladder on device: the near
// stations read as tiny discs on enormous stilts. A 1 MIL gong at 50 m is 5 cm
// across, so a 2 m panel-and-posts frame is forty plate-widths of furniture
// around the target. The low line therefore gets Range A's hanging-rack model —
// beam, two legs, plate on chains, nothing behind it — and the HIGH line keeps
// its frames and dark backer panels untouched.
//
// Why the split rather than racks everywhere: the panel is decision D4 and its
// contrast advantage was MEASURED (white plate at 2000 m reads 0.196 on open
// ground vs 0.632 on the dark panel). Fog is 11 % at 2000 m and negligible at
// 500, so the panel earns its keep on the high line and only adds clutter on
// the low one. Owner accepted the one cost: 250 m is a shared station and now
// renders two different ways depending on which line you stand on.

/**
 * The rack is CONSTANT-ANGULAR, like the gong it holds.
 *
 * A fixed 1 m beam was tried first and failed at the near stations (owner, on
 * device 2026-07-29: *"the 500 is looking great, it's the closer 50–150 where
 * the rack is too narrow and too tall"*). The arithmetic says why. Rack width
 * scales with the gong but a fixed height does not, so the aspect ratio runs
 * away as the gong shrinks: at 500 m the rack is 0.75 m wide and 1.0 m tall, a
 * comfortable 1.33:1, but at 50 m it is 7.5 cm wide and still 1.0 m tall —
 * **13:1**, a needle. Worse, at 50 m a 1 m rack subtends 20 mrad against the
 * gong's 1 mrad, so the furniture owns a third of the sight picture.
 *
 * Scaling the whole rack off the gong fixes both at once and makes every
 * station identical through the scope, which is the same reason the gongs are
 * 1 MIL everywhere. The multiples below are chosen to leave the 500 m rack
 * EXACTLY as it was — 0.75 × 1.00 m — since that is the one the owner liked.
 */
/** Rack width as a multiple of the gong diameter — same 1.5 as the high-line frame. */
export const RACK_WIDTH_MULTIPLE = FRAME_WIDTH_MULTIPLE;
/** Beam height as a multiple of the gong diameter. 2.0 × 0.5 m = the 1.0 m beam
 *  the 500 m station already had. */
export const RACK_HEIGHT_MULTIPLE = FRAME_HEIGHT_MULTIPLE;
/** Chain from the beam down to the gong's TOP edge, as a multiple of the gong.
 *  0.12 × 0.5 m = the 0.06 m chain the 500 m station already had. */
export const RACK_CHAIN_DROP_MULTIPLE = 0.12;

/** Beam height above local ground for a low-line rack (m). */
export function rackBeamHeightM(gongDiameterM: number): number {
  return gongDiameterM * RACK_HEIGHT_MULTIPLE;
}

/**
 * Gong centre above local ground for a low-line rack.
 *
 * The plate HANGS, so its centre is measured DOWN from the beam, not up from
 * the ground: `beam − chain − radius`. A fixed fraction of beam height (what
 * Range A does) does not survive constant-angular gongs — at 500 m the gong is
 * 0.5 m across, and Range A's 0.5 fraction would put its top edge ABOVE the
 * beam it is supposed to be hanging from.
 *
 * Every term scales with the gong, so this reduces to a constant multiple —
 * but it is written out because the three parts are the physical model and the
 * next person to change one should see what it does to the other two.
 */
export function rackPlateCenterAboveGroundM(gongDiameterM: number): number {
  return (
    rackBeamHeightM(gongDiameterM) -
    gongDiameterM * RACK_CHAIN_DROP_MULTIPLE -
    gongDiameterM / 2
  );
}

// --- near-station stakes ---------------------------------------------------
//
// Owner call, 2026-07-29, after looking at 50 / 100 / 150 m on device. Even a
// constant-angular rack loses at the very near stations, and the 50 m one is
// the proof: the gong is 5 cm, so the rack is 7.5 cm wide and its two legs are
// each nearly a third of that. The furniture reads as a structure with a dot in
// it rather than as a target on a stand.
//
// So the first three stations get a STAKE instead: one post out of the ground,
// with the plate and its label mounted on the FRONT of it. This is what a small
// rimfire plate actually sits on, and it removes the leg-versus-plate contest
// entirely — there is only one pole and it hides behind the target.
//
// Unlike the rack, the stake is a FIXED PHYSICAL SIZE, not constant-angular.
// That is deliberate and it is the owner's instruction: real range furniture is
// the same 12 inches whether you are looking at it from 50 m or 150 m. It also
// keeps the near plates well clear of the dirt, which the pure angular rack did
// not (at 50 m it put the plate centre 6.9 cm up; the stake puts it at 25 cm).

/** Stations at or inside this range use a stake, not a rack (m). */
export const STAKE_MAX_RANGE_M = 150;
/** Stake height above local ground — 12 inches. */
export const STAKE_HEIGHT_M = 0.3048;
/** Gap from the top of the stake down to the gong's TOP edge — 1 inch. */
export const STAKE_TARGET_TOP_GAP_M = 0.0254;

/**
 * Gong centre above local ground for a stake station.
 *
 * Measured DOWN from the top of the post, so the plate hangs the same inch below
 * the label at every stake station regardless of how big the gong is:
 * `stake − gap − radius`.
 */
export function stakePlateCenterAboveGroundM(gongDiameterM: number): number {
  return STAKE_HEIGHT_M - STAKE_TARGET_TOP_GAP_M - gongDiameterM / 2;
}

/** How a station is mounted. Depends on the LINE and, on the low line, the range. */
export function mountFor(point: FiringPoint, losRangeM: number): 'stake' | 'rack' | 'panel' {
  if (point !== 'low') return 'panel';
  return losRangeM <= STAKE_MAX_RANGE_M ? 'stake' : 'rack';
}

// --- placement search ------------------------------------------------------
/** Lateral offset cap, ANGULAR. 35 mrad = 9 m at 250 m, 70 m at 2000 m.
 *  Measured across 8 forest seeds: 25 mrad leaves too many stations blocked on the
 *  low line; 35 brings the residual cull down to a handful of trees. */
export const OFFSET_CAP_MRAD = 35;
/** Candidate offsets evaluated per station. */
export const OFFSET_SAMPLES = 61;
/** Trees are excluded within this radius of either firing point (m). */
export const FIRING_POINT_CLEAR_RADIUS_M = 30;

// --- scene -----------------------------------------------------------------
// Ceiling from D10: adopting the shared rig's 7.45e-4 puts 89% haze on the
// 2000 m gong and deletes the range's whole job. Within that ceiling the exact
// value is a tuned dial — lowered 1.7e-4 -> 1.19e-4 (-30%, owner call
// 2026-08-19, after seeing the rig on device): ~11% -> ~5.5% haze at 2000 m.
export const FOG_DENSITY = 1.19e-4;
export const SKY_HEX = 0xe6dcc8;
export const CAMERA_NEAR_M = 10;
export const CAMERA_FAR_M = 12000;

// --- station solving -------------------------------------------------------

export interface ElrStation {
  /** Line-of-sight range (m) — the ballistic range. Hand THIS to the solver. */
  losRangeM: number;
  /** Nominal distance for labels (m). */
  nominalDistance: number;
  /** Horizontal distance from firing point to target (m). */
  groundRunM: number;
  /** World position of the gong centre. */
  x: number;
  y: number;
  z: number;
  gongDiameterM: number;
  frameWidthM: number;
  /** Height of the structure ABOVE ITS LOCAL GROUND (m). For a panel this is the
   *  frame height and the panel is centred on the gong; for a rack it is the
   *  beam height and the rack stands on the dirt. */
  frameHeightM: number;
  /** How this station is mounted: `'stake'` at 50–150 m, `'rack'` at 200–500 m,
   *  `'panel'` on the whole high line. */
  mount: 'stake' | 'rack' | 'panel';
  /** World Y of the top of the structure — a stake's post top, a rack's beam, or
   *  a panel frame's upper edge. The chains anchor here in all three cases, and
   *  it is what gets pushed as the occluder top. */
  beamY: number;
  /** Trees still blocking after the search — should be 0 or very small. */
  occluders: number;
  markerText: string;
}

export interface ElrLayout {
  point: FiringPoint;
  eyeYM: number;
  stations: ElrStation[];
  /**
   * Indices into the tree array of trees that must NOT be drawn — the handful
   * still blocking a sight line after the search has done its best.
   *
   * Measured across 8 forest seeds: mean 2.6, worst 5, out of 4000. That is the
   * design intent — individual trees removed, never a cleared corridor.
   */
  cullTreeIndices: number[];
}

/**
 * Place every station for one firing point.
 *
 * `groundRunM` is solved from `losRangeM` and the height difference — never the
 * other way round, or the ballistic range is wrong.
 */
export function solveLayout(
  point: FiringPoint,
  trees: readonly TreePlacement[],
): ElrLayout {
  const eyeYM = eyeYFor(point);
  const eye = { x: 0, y: eyeYM, z: 0 };
  const treeOccluders = prepareOccluders(trees);
  // Running set: trees PLUS the frames already placed. Stations are solved
  // NEAR TO FAR and each placed frame becomes an occluder for the ones behind
  // it, because a near frame really does hide a far gong. Without this, every
  // forest seed put at least one low-line station behind another's frame.
  const occluders: Occluder[] = [...treeOccluders];
  const cull = new Set<number>();
  const stations: ElrStation[] = [];

  for (const losRangeM of stationsFor(point)) {
    const gongDiameterM = losRangeM * GONG_ANGULAR_SIZE_RAD;
    const radiusM = gongDiameterM / 2;
    const margin = marginForPlate(radiusM);
    // The mount is per-STATION, not per-line: the low line runs stakes out to
    // 150 m and racks beyond it.
    const mount = mountFor(point, losRangeM);
    // A stake's plate sits an inch below the post top; a rack's hangs from a
    // gong-scaled beam; a panel's is centred on a frame tall enough to clear the
    // ground. Decided here in the pure config, NOT in the scene, because the
    // sight-clearance search solves against this height — fudging it at render
    // time would site the station against a sight line it does not have.
    const centreAboveGround =
      mount === 'stake'
        ? stakePlateCenterAboveGroundM(gongDiameterM)
        : mount === 'rack'
          ? rackPlateCenterAboveGroundM(gongDiameterM)
          : targetCenterAboveGroundM(gongDiameterM);

    // Settle target height against ground run: the height depends on where the
    // target sits, and where it sits depends on the height. Three passes converge.
    let groundRunM = losRangeM;
    let y = 0;
    for (let pass = 0; pass < 3; pass++) {
      y = groundY(groundRunM) + centreAboveGround;
      const dy = y - eyeYM;
      groundRunM = Math.sqrt(Math.max(0, losRangeM * losRangeM - dy * dy));
    }

    const capM = (OFFSET_CAP_MRAD / 1000) * groundRunM;
    const candidates = offsetCandidates(capM, (2 * capM) / (OFFSET_SAMPLES - 1));
    const picked = chooseOffset(eye, groundRunM, y, radiusM, occluders, { candidates }, margin);

    const a = Math.asin(Math.max(-1, Math.min(1, picked.offsetM / groundRunM)));
    const localGround = groundY(groundRunM);
    const frameHeightM =
      mount === 'stake'
        ? STAKE_HEIGHT_M
        : mount === 'rack'
          ? rackBeamHeightM(gongDiameterM)
          : gongDiameterM * FRAME_HEIGHT_MULTIPLE;
    // A stake hides behind its plate, so the widest thing at the station IS the
    // gong. A rack and a panel both bracket it at 1.5×.
    const frameWidthM =
      mount === 'stake' ? gongDiameterM : gongDiameterM * FRAME_WIDTH_MULTIPLE;
    const station: ElrStation = {
      losRangeM,
      nominalDistance: losRangeM,
      groundRunM,
      x: groundRunM * Math.sin(a),
      y,
      z: -groundRunM * Math.cos(a),
      gongDiameterM,
      frameWidthM,
      frameHeightM,
      mount,
      // Stakes and racks both stand ON their own ground, so their top is a
      // height above it. A panel's chain anchor is the top edge of the frame
      // around the gong.
      beamY: mount === 'panel' ? y + frameHeightM / 2 : localGround + frameHeightM,
      occluders: picked.occluders,
      markerText: String(losRangeM),
    };
    stations.push(station);

    // Any TREE still in this cone gets cut. Search against `treeOccluders`, not
    // the running set — a frame is never culled, it is moved.
    for (const i of occludingTreeIndices(
      eye,
      { position: { x: station.x, y: station.y, z: station.z }, radiusM },
      treeOccluders,
      margin,
    )) {
      cull.add(i);
    }

    // This structure now occludes every station farther out. `beamY` is the top
    // of it either way — a rack's beam, or a panel's upper edge.
    occluders.push({
      x: station.x,
      z: station.z,
      radiusM: station.frameWidthM / 2,
      topY: station.beamY,
    });
  }
  return { point, eyeYM, stations, cullTreeIndices: [...cull].sort((p, q) => p - q) };
}
