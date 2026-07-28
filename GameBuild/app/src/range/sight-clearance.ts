// Can the shooter actually SEE the target through the woods?
//
// The ELR range is a wooded hillside, not a mown lane (owner, 2026-07-28: at 4000
// trees "there's still plenty of open ground left for targets without carving out
// swaths"). That is a nicer range and a harder placement problem: a target tucked
// into natural ground is only a target if the sight line to it happens to be
// clear, and at 2 km a single mid-range conifer can hide a 2 m gong completely.
//
// This is the fan-vs-occlusion problem from the probe, inverted. There the
// question was "where do the TARGETS go so they do not hide each other"; here it
// is "where do they go so the TREES do not hide them" — same geometry, and the
// same rule that a margin has to be measured rather than eyeballed.
//
// THE TEST IS A CONE, NOT A RAY. Sighting a ray from eye to target centre would
// happily accept a tree covering all but the middle pixel of the plate. What has
// to stay clear is the plate's whole shadow volume: the cone from the eye out to
// the plate disc, widening linearly with distance. A tree anywhere inside that
// cone hides part of the target.
//
// HEIGHT MATTERS AS MUCH AS PLAN POSITION, and it is the part that is easy to
// forget. On a rising convex slope the sight line to a distant target climbs, so
// a tree standing 800 m out on a low part of the hill can sit directly under the
// sight line and block nothing at all. Testing plan distance alone would reject
// it and cost a tree for no reason. Both tests, always.

import { treeUnitBounds } from './environment/trees';
import type { TreePlacement } from './environment/environment-config';

/** A point in world space. Z is negative downrange, matching the scene. */
export interface Point3 {
  x: number;
  y: number;
  z: number;
}

/** A target to be seen: centre position plus the radius that must stay visible. */
export interface SightTarget {
  position: Point3;
  /** Half the plate's width — the cone is sized to clear the WHOLE plate. */
  radiusM: number;
}

/**
 * Extra clearance beyond the plate edge (m at the target).
 *
 * Not decoration. A plate whose edge exactly grazes a canopy is technically
 * visible and practically unshootable — you cannot call a miss you cannot see,
 * and impact splash outside the plate is most of the feedback at long range.
 * One plate-width of surrounding air is the difference between "in view" and
 * "usable".
 */
export const DEFAULT_MARGIN_M = 2.0;

export interface OccluderBounds {
  /** Canopy radius (m) after scaling. */
  radiusM: number;
  /** Height of the canopy top above the tree's own ground point (m). */
  topM: number;
}

/** Scaled bounds for a placement, from the geometry that actually gets drawn. */
export function boundsOf(tree: TreePlacement): OccluderBounds {
  const unit = treeUnitBounds(tree.kind, tree.variantIndex);
  return { radiusM: unit.radius * tree.scaleXZ, topM: unit.top * tree.scaleY };
}

/**
 * A tree flattened to just what an occlusion test needs: where it stands, how
 * wide it is, and how high its crown reaches in WORLD height.
 *
 * PRECOMPUTED FOR A REASON. `chooseOffset` evaluates ~61 candidate offsets per
 * station, and each candidate walks the whole forest twice. Deriving bounds
 * inside those loops meant `treeUnitBounds` — array maps and `Math.max` — ran
 * roughly 2.9 million times for one 6-station solve: measured at **470 ms on
 * desktop, so ~1.4 s on an iPad**, paid every time the range loads. Hoisting it
 * to once per tree is the entire fix; the geometry is unchanged.
 */
export interface Occluder {
  x: number;
  z: number;
  /** Canopy radius (m), already scaled. */
  radiusM: number;
  /** Absolute world height of the crown top (m) — ground height already added. */
  topY: number;
}

/** Flatten a forest once, before any searching. */
export function prepareOccluders(trees: readonly TreePlacement[]): Occluder[] {
  const out: Occluder[] = new Array(trees.length);
  for (let i = 0; i < trees.length; i++) {
    const t = trees[i];
    const unit = treeUnitBounds(t.kind, t.variantIndex);
    out[i] = {
      x: t.x,
      z: t.z,
      radiusM: unit.radius * t.scaleXZ,
      topY: t.y + unit.top * t.scaleY,
    };
  }
  return out;
}

/**
 * Closest approach of a point to a segment, in plan view.
 *
 * Returns the perpendicular distance and the parameter `t` along eye→target.
 * `t` is clamped to [0,1] for the distance, but reported unclamped so callers
 * can tell "beside the line" from "behind the shooter" or "past the target" —
 * neither of which can occlude anything.
 */
export function planApproach(
  eye: Point3,
  target: Point3,
  px: number,
  pz: number,
): { distanceM: number; t: number } {
  const dx = target.x - eye.x;
  const dz = target.z - eye.z;
  const lenSq = dx * dx + dz * dz;
  if (lenSq < 1e-9) return { distanceM: Math.hypot(px - eye.x, pz - eye.z), t: 0 };
  const tRaw = ((px - eye.x) * dx + (pz - eye.z) * dz) / lenSq;
  const tClamped = Math.min(1, Math.max(0, tRaw));
  const cx = eye.x + dx * tClamped;
  const cz = eye.z + dz * tClamped;
  return { distanceM: Math.hypot(px - cx, pz - cz), t: tRaw };
}

/** Radius of the sight cone at parameter `t` — zero at the eye, plate + margin
 *  at the target. */
export function coneRadiusAt(t: number, targetRadiusM: number, marginM: number): number {
  return t * (targetRadiusM + marginM);
}

/**
 * Does this tree hide any part of the target from this eye?
 *
 * Three conditions, all required:
 *   1. it stands BETWEEN eye and target (0 < t < 1) — a tree behind the target
 *      or behind the shooter is irrelevant;
 *   2. its canopy overlaps the cone in plan;
 *   3. its canopy top actually reaches UP into the cone at that point.
 */
export function occluderBlocks(
  eye: Point3,
  target: SightTarget,
  o: Occluder,
  marginM: number = DEFAULT_MARGIN_M,
): boolean {
  const { distanceM, t } = planApproach(eye, target.position, o.x, o.z);
  if (t <= 0 || t >= 1) return false;

  const cone = coneRadiusAt(t, target.radiusM, marginM);
  if (distanceM > o.radiusM + cone) return false;

  // Height of the sight line at this point, and the bottom of the cone there.
  const lineY = eye.y + (target.position.y - eye.y) * t;
  return o.topY > lineY - cone;
}

/** Single-placement convenience wrapper — readable at call sites and in tests.
 *  Bulk callers must go through `prepareOccluders` (see `Occluder`). */
export function treeOccludes(
  eye: Point3,
  target: SightTarget,
  tree: TreePlacement,
  marginM: number = DEFAULT_MARGIN_M,
): boolean {
  return occluderBlocks(eye, target, prepareOccluders([tree])[0], marginM);
}

/** Indices of every tree that hides part of the target. */
export function occludingTreeIndices(
  eye: Point3,
  target: SightTarget,
  trees: readonly TreePlacement[] | readonly Occluder[],
  marginM: number = DEFAULT_MARGIN_M,
): number[] {
  const occluders = asOccluders(trees);
  const hits: number[] = [];
  for (let i = 0; i < occluders.length; i++) {
    if (occluderBlocks(eye, target, occluders[i], marginM)) hits.push(i);
  }
  return hits;
}

/** Accept either shape at the boundary, so callers that already prepared their
 *  forest do not pay for it twice and callers that have not still work. */
function asOccluders(
  trees: readonly TreePlacement[] | readonly Occluder[],
): readonly Occluder[] {
  if (trees.length === 0) return [];
  return 'topY' in trees[0] ? (trees as readonly Occluder[]) : prepareOccluders(trees as readonly TreePlacement[]);
}

/**
 * How much room to spare the tightest tree leaves, in metres at the target plane.
 *
 * Positive means clear, and bigger is better sited. Negative means blocked, and
 * the magnitude says by how much — which is what lets a search prefer "nearly
 * clear" over "buried", instead of treating every blocked position as equally bad.
 */
export function clearanceMarginM(
  eye: Point3,
  target: SightTarget,
  trees: readonly TreePlacement[] | readonly Occluder[],
  marginM: number = DEFAULT_MARGIN_M,
): number {
  let worst = Infinity;
  for (const tree of asOccluders(trees)) {
    const { distanceM, t } = planApproach(eye, target.position, tree.x, tree.z);
    if (t <= 0 || t >= 1) continue;
    const lineY = eye.y + (target.position.y - eye.y) * t;
    const cone = coneRadiusAt(t, target.radiusM, marginM);
    // Only trees tall enough to reach the corridor are candidates for "tightest".
    if (tree.topY <= lineY - cone) continue;
    // Convert the plan gap into metres AT THE TARGET, so gaps at different
    // distances are comparable: a 3 m gap 200 m out is a far bigger hole in the
    // view than a 3 m gap just short of the plate.
    const gap = distanceM - tree.radiusM - cone;
    const atTarget = t > 1e-6 ? gap / t : gap;
    if (atTarget < worst) worst = atTarget;
  }
  return worst;
}

export interface OffsetSearch {
  /** Candidate lateral offsets (m). Sign is world +x = right. */
  candidates: number[];
  /** Which side this station should sit on, if a rhythm is being imposed.
   *  `null` lets the forest decide. */
  side?: 'left' | 'right' | 'centre' | null;
}

export interface PlacedStation {
  offsetM: number;
  clearanceM: number;
  occluders: number;
}

/**
 * Pick the lateral offset at which the existing forest most nearly leaves the
 * target in the clear.
 *
 * WHY SEARCH INSTEAD OF AUTHORING THE OFFSETS. A DOPE range's DISTANCES are
 * fixed — they are the whole point — so the only free parameter is how far left
 * or right a station sits. Letting the trees choose that produces exactly the
 * irregular, tucked-into-the-terrain placement the owner asked for, and it does
 * it without carving corridors: the winning offset is usually one where the
 * sight line already threads a natural gap. The alternative — author a tidy
 * centre/left/right rhythm and then cut whatever is in the way — makes the range
 * look surveyed and costs far more trees.
 *
 * Ranks by fewest occluders first, then by widest clearance. Those disagree: a
 * position with one distant trunk clipping the cone edge can score a better
 * margin than a genuinely open one. Occluder count is what the player actually
 * experiences, so it wins the tie-break.
 */
export function chooseOffset(
  eye: Point3,
  distanceM: number,
  targetHeightY: number,
  targetRadiusM: number,
  trees: readonly TreePlacement[] | readonly Occluder[],
  search: OffsetSearch,
  marginM: number = DEFAULT_MARGIN_M,
): PlacedStation {
  // Flatten ONCE, not once per candidate — see `Occluder`.
  const occluders = asOccluders(trees);
  let best: PlacedStation | null = null;
  for (const offsetM of search.candidates) {
    if (search.side === 'left' && offsetM > 0) continue;
    if (search.side === 'right' && offsetM < 0) continue;
    // Offsets are lateral, so the DOWNRANGE distance must be preserved: a station
    // is defined by its range, and sliding it sideways along a fixed z would make
    // the 2000 m target 2001 m away. Solve z from the hypotenuse instead.
    const z = -Math.sqrt(Math.max(0, distanceM * distanceM - offsetM * offsetM));
    const target: SightTarget = {
      position: { x: offsetM, y: targetHeightY, z },
      radiusM: targetRadiusM,
    };
    const blocked = occludingTreeIndices(eye, target, occluders, marginM).length;
    const clearanceM = clearanceMarginM(eye, target, occluders, marginM);
    const candidate: PlacedStation = { offsetM, clearanceM, occluders: blocked };
    if (
      best === null ||
      candidate.occluders < best.occluders ||
      (candidate.occluders === best.occluders && candidate.clearanceM > best.clearanceM)
    ) {
      best = candidate;
    }
  }
  // `candidates` is never empty in practice; returning a defined result keeps
  // callers from having to handle a null they cannot act on anyway.
  return best ?? { offsetM: 0, clearanceM: -Infinity, occluders: trees.length };
}

/** Evenly spaced candidate offsets across a lane, excluding nothing — the search
 *  decides, not the generator. */
export function offsetCandidates(maxOffsetM: number, stepM: number): number[] {
  const out: number[] = [];
  for (let o = -maxOffsetM; o <= maxOffsetM + 1e-9; o += stepM) out.push(Math.round(o * 100) / 100);
  return out;
}
