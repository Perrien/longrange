// Wooded Zero Range layout — Stage 1 of `Design/archive/mil-zero-range-plan.md`.
// Pure config: no THREE, no engine, no store. Given the entry-time unit system,
// produce the fixed physical layout of the fanned four-station paper bay —
// stations at 25/50/100/200 in the active unit, the knoll floor profile, the
// per-station backer board + lane marker, and the shooting corridors the terrain
// and vegetation must keep clear.
//
// Follows `sight-in-config.ts`'s D3 entry-snapshot contract: the whole layout is
// fixed by the unit system at range entry, so `snapshotWoodedZero` is called ONCE
// on entry and the result held. A later `unitsPrimary` flip does not mutate a
// held snapshot; it only produces a new one on the next entry.
//
// THE INVARIANT THIS FILE EXISTS TO PROTECT (plan §8): a yard is shorter than a
// metre at every nominal distance (200 yd = 182.88 m < 200 m), so the METRIC
// layout's corridors are a strict superset of the imperial layout's. The world —
// terrain, forest, corridors — is therefore ALWAYS built from the metric station
// set, and imperial targets simply sit short on the same lane axes. Nothing is
// regenerated and the forest is identical in both unit modes. `buildCorridors`
// takes no unit argument for exactly this reason; if it ever grows one, the
// invariant is broken and the woods will shift between modes.

import { getRangeDefinition } from './ranges';
import { yardsToMeters } from '../units/length';
import { moaToRad } from '../units/angle';
import type { DisplayUnits } from '../units/display';

/** MIL travels with metric (m), MOA with imperial (yd) — the units/display
 *  pairing, same as the original sight-in bay. */
export type WoodedZeroUnitSystem = 'metric' | 'imperial';

// ---------------------------------------------------------------------------
// Fixed physical parameters (plan §2.2, §5)
// ---------------------------------------------------------------------------

/** Knoll crest height above the target plane (m). Deliberately LOW: it clears
 *  every occlusion (plan §4) while keeping the sight-line fan shallow enough
 *  that the forward face can out-run it. */
export const KNOLL_CREST_M = 1.5;

/** Prone eye height above the ground the shooter lies on (m). */
export const EYE_ABOVE_GROUND_M = 0.2;

/** Shooter eye height above the target plane (m) — the number every sight line
 *  is drawn from. */
export const EYE_Y_M = KNOLL_CREST_M + EYE_ABOVE_GROUND_M; // 1.70

/** Target face centre height above the target plane (m). Matches the original
 *  bay's `TARGET_CENTER_Y_M` so the two ranges feel alike. */
export const TARGET_CENTER_Y_M = 1.0;

/** Eye minus target centre (m) — the drop across every sight line, and the term
 *  that converts LOS range to ground run. */
export const SIGHT_DROP_M = EYE_Y_M - TARGET_CENTER_Y_M; // 0.70

/** Knoll forward-face grade (rise/run). MUST exceed the steepest sight line —
 *  1.60° (2.8%) to the 25 m station — or the ground falls away more slowly than
 *  the line of sight and the shooter fires into his own hill. 10% leaves margin
 *  that grows monotonically with range (plan §2.2). */
export const KNOLL_GRADE = 0.1;

/**
 * Target face sizes — sized so ONE GRID SQUARE IS EXACTLY ONE ANGULAR UNIT at the
 * face's design distance. Both faces are a 22-cell grid (1-cell border + 20).
 *
 * MIL is exact for free: 44 cm / 22 = 2 cm per cell, and 1 mil at 100 m is 10 cm
 * BY DEFINITION, so a cell is exactly 0.2 mil.
 *
 * MOA is NOT free, and the original 22 in face got it wrong (owner, on device
 * 2026-07-26: "at MOA they're off... not by a lot but definitely off"). A 22 in
 * face gives 1 in per cell, which relies on the shooter's shorthand that an inch
 * equals a MOA at 100 yd. It does not: 1 MOA at 100 yd is 1.0472 in, so an inch
 * is only 0.9549 MOA. Each cell was 4.5% small, and the error ACCUMULATES — by
 * the reticle's 10 MOA mark the grid had drifted almost half a MOA, which is
 * exactly the widening mismatch visible in the scope.
 *
 * So the MOA face is derived rather than authored: 22 cells x (100 yd x 1 MOA).
 * That is 23.04 in, not 22 in — and it is the MORE physically correct target,
 * since real "true MOA" targets are printed with 1.047 in squares for precisely
 * this reason.
 */
export const MOA_TARGET_SIZE_M = 22 * yardsToMeters(100) * moaToRad(1); // 0.58517 m = 23.04 in
export const MIL_TARGET_SIZE_M = 0.44; // 44 cm -> 2 cm cells -> exactly 0.2 mil at 100 m

// Backer board sizing — CONSTANT PHYSICAL SIZE at every station (owner, on
// device 2026-07-26: "the board holding the target is comically large at the
// 200 meter mark. The boards should all be the same size").
//
// This reverses the original constant-angular-subtension rule, which scaled the
// board with range so each station filled the same fraction of the sight
// picture. That reasoning was sound on paper and wrong in the scope: a 2.4 m
// frame around a 44 cm target at 200 m reads as absurd, and real ranges use one
// frame size everywhere. Equal boards also turn out to IMPROVE the occlusion
// margins (§4), because the far boards shrink faster than the near ones grow.

/** Board width as a multiple of the paper face. */
export const BOARD_WIDTH_MULTIPLE = 1.5;

/** Lane-marker plate height as a multiple of the paper face. The plate sits in
 *  a band ABOVE the paper, not overlapping it — see `boardLayoutFor`. */
export const MARKER_PLATE_MULTIPLE = 0.4;

/** Corridor half-width floor (m) and angular growth (rad). Half-width is
 *  `max(floor, growth × r)`: wide enough near the shooter for the muzzle and the
 *  near boards, widening downrange so the 200 m frame still has air around it. */
export const CORRIDOR_MIN_HALF_WIDTH_M = 1.8;
export const CORRIDOR_HALF_ANGLE_RAD = 0.012;

/** How far past its own target a corridor stays clear (m). Beyond this the
 *  corridor ENDS — which is what lets woods close in behind each near station
 *  while the far lanes stay open. This single rule does the work that a much
 *  wider azimuth fan otherwise would (plan §3.2). */
export const CORRIDOR_OVERRUN_M = 10;

/** No vegetation inside this radius of the shooter (m). */
export const SHOOTER_CLEAR_M = 18;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface WoodedZeroStation {
  /** Line-of-sight range in SI metres — the ballistic range, NOT the ground run.
   *  This is what the scope sees, what a rangefinder returns, and what must be
   *  handed to the solver (plan §3.3). */
  losRangeM: number;
  /** Nominal distance in the active unit (25/50/100/200) — for HUD labels. */
  nominalDistance: number;
  /** Bearing from downrange, + = right (deg). Shared across unit systems. */
  azimuthDeg: number;
  /** Horizontal distance from the shooter to the target (m). */
  groundRunM: number;
  /** World position of the target face centre (m). */
  x: number;
  y: number;
  z: number;
  /** Depression of the sight line below horizontal (deg, negative = down). */
  elevationDeg: number;
  /** Backer board width (m) — identical at every station. */
  boardWidthM: number;
  /** Backer board height (m) — taller than it is wide, by the plate band. */
  boardHeightM: number;
  /** Board centre height (m). Sits ABOVE the target centre by half the plate
   *  band, so the paper stays centred on `TARGET_CENTER_Y_M` while the plate
   *  clears it. The aim point must not move: every occlusion and sight-line
   *  proof in the plan is drawn from a target centre at exactly 1.0 m. */
  boardCenterYM: number;
  /** Lane-marker number plate height (m). */
  markerPlateM: number;
  /** Unit abbreviation for the lane-marker plate — matches the original Zero
   *  Range's distance signs so the two bays read alike. */
  unitLabel: 'M' | 'YD';
  /** Full plate text, e.g. `"100 YD"`. */
  markerText: string;
}

/**
 * Yaw (rad) that turns a target to face the firing point.
 *
 * A `PlaneGeometry` faces its local +Z, and a group yawed by `y` maps local +Z
 * to `(sin y, cos y)`. The direction from the target back to the shooter at the
 * origin is `(-x, -z)`, so the yaw is `atan2(-x, -z)`.
 *
 * BUG THIS FIXES (owner, on device 2026-07-26): the scene used `atan2(x, -z)`,
 * which is `+azimuth` instead of `-azimuth` — so every board was yawed the WRONG
 * WAY and the visible error was *twice* the station's azimuth. Worst at the 25 m
 * station (12°), which is exactly where it was reported. Derived here from the
 * positions rather than from the azimuth so it stays correct even if the
 * placement convention changes, and so it can be unit-tested without THREE.
 */
export function facingYawRad(station: Pick<WoodedZeroStation, 'x' | 'z'>): number {
  return Math.atan2(-station.x, -station.z);
}

/** Board geometry for a given paper face. Identical at every station — only the
 *  unit variant (MIL vs MOA face) changes it. */
export function boardLayoutFor(faceSizeM: number): {
  widthM: number;
  heightM: number;
  centerYM: number;
  plateM: number;
} {
  const widthM = faceSizeM * BOARD_WIDTH_MULTIPLE;
  const plateM = faceSizeM * MARKER_PLATE_MULTIPLE;
  // The paper occupies a square region of side `widthM`, centred on the target
  // centre; the plate band is stacked on top of that region.
  return {
    widthM,
    heightM: widthM + plateM,
    centerYM: TARGET_CENTER_Y_M + plateM / 2,
    plateM,
  };
}

/** A cleared shooting corridor: a wedge along one lane bearing that ENDS a short
 *  way past its own target. Terrain is flat inside it and vegetation is excluded
 *  from it. */
export interface Corridor {
  azimuthRad: number;
  /** Ground radius (m) past which this corridor no longer applies. */
  reachM: number;
}

export interface WoodedZeroLayout {
  system: WoodedZeroUnitSystem;
  /** Which delivered art file to raster (`zeroing-target-<variant>.svg`). */
  artVariant: 'moa' | 'mil';
  targetSizeM: number;
  stations: WoodedZeroStation[];
  /** Always built from the METRIC station set — see the file header. */
  corridors: Corridor[];
  ground: { widthM: number; lengthM: number };
}

// ---------------------------------------------------------------------------
// Geometry
// ---------------------------------------------------------------------------

const DEG = Math.PI / 180;

/** Ground run for a given line-of-sight range (m). */
export function groundRunForLosRange(losRangeM: number): number {
  return Math.sqrt(losRangeM * losRangeM - SIGHT_DROP_M * SIGHT_DROP_M);
}

/** Terrain height of the corridor floor at ground radius `r` (m): the knoll
 *  crest, falling at `KNOLL_GRADE` until it meets the target plane. */
export function corridorFloorY(r: number): number {
  return Math.max(0, KNOLL_CREST_M - KNOLL_GRADE * r);
}

/** Height of the sight line to `station` at ground radius `r` (m). */
export function sightLineY(station: WoodedZeroStation, r: number): number {
  return EYE_Y_M + (TARGET_CENTER_Y_M - EYE_Y_M) * (r / station.groundRunM);
}

/** Corridor half-width at ground radius `r` (m). */
export function corridorHalfWidth(r: number): number {
  return Math.max(CORRIDOR_MIN_HALF_WIDTH_M, CORRIDOR_HALF_ANGLE_RAD * r);
}

/** Perpendicular distance from world (x, z) to a corridor's axis (m). */
export function perpendicularDistance(x: number, z: number, azimuthRad: number): number {
  // Unit axis in (x, z) is (sin a, −cos a); perpendicular distance is the
  // magnitude of the 2-D cross product with that axis.
  return Math.abs(x * -Math.cos(azimuthRad) - z * Math.sin(azimuthRad));
}

/**
 * Whether world (x, z) lies inside ANY shooting corridor. Terrain must be flat
 * here and vegetation must not be placed here.
 *
 * `inflateM` pads every corridor — pass a tree's canopy radius so a trunk placed
 * just outside the edge doesn't lean its canopy back over the sight line.
 *
 * The `r > c.reachM` early-out is the load-bearing line: it is what makes the
 * woods able to close in behind each near station.
 */
export function insideAnyCorridor(
  x: number,
  z: number,
  corridors: readonly Corridor[],
  inflateM = 0,
): boolean {
  const r = Math.hypot(x, z);
  for (const c of corridors) {
    if (r > c.reachM) continue;
    if (perpendicularDistance(x, z, c.azimuthRad) <= corridorHalfWidth(r) + inflateM) return true;
  }
  return false;
}

/** Whether vegetation may stand at world (x, z). */
export function isPlantable(
  x: number,
  z: number,
  corridors: readonly Corridor[],
  canopyRadiusM = 0,
): boolean {
  if (Math.hypot(x, z) < SHOOTER_CLEAR_M) return false;
  return !insideAnyCorridor(x, z, corridors, canopyRadiusM);
}

/** Half-diagonal of a station's board as seen from the firing point (rad) — the
 *  quantity the occlusion check compares against angular separation. Measured
 *  about the TARGET centre (the aim point), not the board centre, since that is
 *  what the sight lines are drawn to. */
export function boardHalfDiagonalRad(station: WoodedZeroStation): number {
  const up = station.boardCenterYM + station.boardHeightM / 2 - TARGET_CENTER_Y_M;
  const down = TARGET_CENTER_Y_M - (station.boardCenterYM - station.boardHeightM / 2);
  return Math.hypot(station.boardWidthM / 2, Math.max(up, down)) / station.losRangeM;
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

function buildStations(system: WoodedZeroUnitSystem, faceSizeM: number): WoodedZeroStation[] {
  const metric = system === 'metric';
  const board = boardLayoutFor(faceSizeM);
  const unitLabel: 'M' | 'YD' = metric ? 'M' : 'YD';
  return getRangeDefinition('wooded-zero').stations.map((s) => {
    const azimuthDeg = s.azimuthDeg ?? 0;
    const losRangeM = metric ? s.nominalDistance : yardsToMeters(s.nominalDistance);
    const groundRunM = groundRunForLosRange(losRangeM);
    const a = azimuthDeg * DEG;
    return {
      losRangeM,
      nominalDistance: s.nominalDistance,
      azimuthDeg,
      groundRunM,
      x: groundRunM * Math.sin(a),
      y: TARGET_CENTER_Y_M,
      z: -groundRunM * Math.cos(a),
      elevationDeg: -Math.asin(SIGHT_DROP_M / losRangeM) / DEG,
      boardWidthM: board.widthM,
      boardHeightM: board.heightM,
      boardCenterYM: board.centerYM,
      markerPlateM: board.plateM,
      unitLabel,
      markerText: `${s.nominalDistance} ${unitLabel}`,
    };
  });
}

/**
 * The corridors the world is cleared against. ALWAYS metric — see the file
 * header's superset invariant. Deliberately takes no unit-system argument so it
 * cannot accidentally be made unit-dependent.
 */
export function buildCorridors(): Corridor[] {
  return buildStations('metric', MIL_TARGET_SIZE_M).map((s) => ({
    azimuthRad: s.azimuthDeg * DEG,
    reachM: s.groundRunM + CORRIDOR_OVERRUN_M,
  }));
}

/**
 * Snapshot the Wooded Zero layout for the active unit system (D3). Call ONCE on
 * range entry and hold the result.
 */
export function snapshotWoodedZero(unitsPrimary: DisplayUnits): WoodedZeroLayout {
  const metric = unitsPrimary === 'MIL';
  const system: WoodedZeroUnitSystem = metric ? 'metric' : 'imperial';
  const targetSizeM = metric ? MIL_TARGET_SIZE_M : MOA_TARGET_SIZE_M;
  const stations = buildStations(system, targetSizeM);
  const corridors = buildCorridors();
  const maxReachM = Math.max(...corridors.map((c) => c.reachM));

  return {
    system,
    artVariant: metric ? 'mil' : 'moa',
    targetSizeM,
    stations,
    corridors,
    ground: { widthM: 400, lengthM: maxReachM + 300 },
  };
}
