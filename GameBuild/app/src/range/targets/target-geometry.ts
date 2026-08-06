// Unit-frame geometry for the target system (task T1, split out of
// `target-type.ts` to keep each file's job singular). Pure functions on points and
// rings in the target's WIDTH-NORMALISED LOCAL FRAME — the frame is documented in
// `target-type.ts`'s header, which is the file that defines what a target IS.
//
// This is the module the rest of the system leans on: T2's zone hit test, T3b's
// SVG flattener and T4's outline triangulation all need the containment and
// distance helpers without needing the type definitions.

import type { Point, TargetShape, ZoneShape } from './target-type';

/** Normalisation/boundary tolerance. Loose enough for hand-traced SVG art (the
 *  digitised stroke centre-line is not exact), tight enough that a genuinely
 *  un-normalised outline — e.g. still in viewBox pixels — fails. */
export const NORMALISE_TOL = 1e-3;
/** Perimeter samples used to test a circle/polygon against an outline. */
export const PERIMETER_SAMPLES = 64;

const HALF = 0.5;

/**
 * Width-normalised → unit box (the texture/UV frame): y is divided by aspect so
 * both axes land in ±0.5. THE ONLY place the anisotropic frame is produced —
 * see the header. `plate-geometry.ts` then maps that to
 * `u = halfCentre + x·0.5, v = 0.5 + y`.
 */
export function toUnitBox(p: Point, aspect: number): Point {
  return { x: p.x, y: p.y / aspect };
}

/** Unit box → width-normalised. Inverse of `toUnitBox`. */
export function fromUnitBox(p: Point, aspect: number): Point {
  return { x: p.x, y: p.y * aspect };
}

/** The outline as an explicit closed ring in the width-normalised frame, for
 *  containment tests and (in T4) triangulation. `segments` only affects `disc`. */
export function outlinePolygon(
  shape: TargetShape,
  aspect: number,
  segments = PERIMETER_SAMPLES,
): readonly Point[] {
  const halfH = (HALF * aspect) / 1;
  switch (shape.kind) {
    case 'polygon':
      return shape.points;
    case 'rect':
      return [
        { x: -HALF, y: -halfH },
        { x: HALF, y: -halfH },
        { x: HALF, y: halfH },
        { x: -HALF, y: halfH },
      ];
    case 'disc': {
      // A disc is round, so its aspect is 1 by construction (asserted in
      // validateTargetType) — an ellipse would be a distinct shape kind.
      const pts: Point[] = [];
      for (let i = 0; i < segments; i++) {
        const a = (2 * Math.PI * i) / segments;
        pts.push({ x: HALF * Math.cos(a), y: HALF * Math.sin(a) });
      }
      return pts;
    }
  }
}

/** Even-odd ray cast. Points exactly on an edge are not guaranteed either way —
 *  use `pointInOutline` for containment decisions that must be stable. */
export function pointInPolygon(p: Point, ring: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i];
    const b = ring[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Shortest distance from a point to a segment. */
export function distanceToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.hypot(p.x - a.x, p.y - a.y);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

/** Shortest distance from a point to a closed ring's boundary. */
export function distanceToRing(p: Point, ring: readonly Point[]): number {
  let best = Infinity;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const d = distanceToSegment(p, ring[j], ring[i]);
    if (d < best) best = d;
  }
  return best;
}

/**
 * Containment with an explicit boundary tolerance: inside the ring, OR within
 * `tol` of it.
 *
 * The tolerance is not slop — it is what makes the question well-posed for the
 * two cases that actually occur. A zone can legitimately BE the outline (the
 * IDPA −3 zone is the silhouette itself), and a bare ray cast on a ring's own
 * vertices is undefined; and hand-traced art puts zone edges a fraction of a
 * pixel outside the traced outline. Both must pass; a zone genuinely poking out
 * must not.
 */
export function pointInOutline(p: Point, ring: readonly Point[], tol = NORMALISE_TOL): boolean {
  return pointInPolygon(p, ring) || distanceToRing(p, ring) <= tol;
}

/** Sample points on a zone's boundary, plus its centre — enough to catch a zone
 *  that pokes outside the outline anywhere. */
export function zoneSamplePoints(shape: ZoneShape, samples = PERIMETER_SAMPLES): Point[] {
  switch (shape.kind) {
    case 'circle': {
      const pts: Point[] = [{ x: shape.cx, y: shape.cy }];
      for (let i = 0; i < samples; i++) {
        const a = (2 * Math.PI * i) / samples;
        pts.push({ x: shape.cx + shape.r * Math.cos(a), y: shape.cy + shape.r * Math.sin(a) });
      }
      return pts;
    }
    case 'rect':
      return [
        { x: shape.cx, y: shape.cy },
        { x: shape.cx - shape.halfW, y: shape.cy - shape.halfH },
        { x: shape.cx + shape.halfW, y: shape.cy - shape.halfH },
        { x: shape.cx + shape.halfW, y: shape.cy + shape.halfH },
        { x: shape.cx - shape.halfW, y: shape.cy + shape.halfH },
      ];
    case 'polygon':
      return shape.points.map((p) => ({ ...p }));
  }
}

/** Axis-aligned bounds of a point set. */
export function bounds(
  pts: readonly Point[],
): { minX: number; maxX: number; minY: number; maxY: number } {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const p of pts) {
    if (p.x < minX) minX = p.x;
    if (p.x > maxX) maxX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, maxX, minY, maxY };
}

/** Aspect implied by a point set — height ÷ width of its bounding box. What
 *  `TargetType.aspect` is validated against, and what T3b will compute when it
 *  flattens an SVG outline. */
export function aspectOf(pts: readonly Point[]): number {
  const b = bounds(pts);
  return (b.maxY - b.minY) / (b.maxX - b.minX);
}

// --- zone containment (task T2) ---------------------------------------------

/** A zone as an explicit ring. Circles have no exact ring, so they are handled
 *  analytically by `pointInZone`/`distanceToZoneBoundary` instead. */
function zoneRing(shape: Exclude<ZoneShape, { kind: 'circle' }>): readonly Point[] {
  if (shape.kind === 'polygon') return shape.points;
  return [
    { x: shape.cx - shape.halfW, y: shape.cy - shape.halfH },
    { x: shape.cx + shape.halfW, y: shape.cy - shape.halfH },
    { x: shape.cx + shape.halfW, y: shape.cy + shape.halfH },
    { x: shape.cx - shape.halfW, y: shape.cy + shape.halfH },
  ];
}

/** Segments used to polygonise a circular HOLE. Coarser than
 *  `PERIMETER_SAMPLES` would be wasteful and finer is invisible: a 6″ window at
 *  60 yd is a few dozen pixels across, and every segment costs two rim triangles
 *  in the wall. */
export const HOLE_SEGMENTS = 48;

/** Signed area of a ring; positive = counter-clockwise in this y-up frame. */
export function ringSignedArea(ring: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return a / 2;
}

/**
 * A target's HOLE rings (`TargetType.holeZoneIds`) as explicit closed rings in the
 * width-normalised frame, wound CLOCKWISE.
 *
 * Winding is the load-bearing part, and it does double duty. `ShapeUtils.
 * triangulateShape` wants holes wound opposite to the contour, and
 * `plate-outline-geometry.ts` derives each rim quad's facing from its ring's
 * direction — so a CW hole ring gets a wall facing INTO the hole for free, using
 * the same code as the outline's outward-facing rim. Hand a CCW ring to either and
 * you get an inside-out wall and a triangulation that fills the hole in.
 *
 * Takes the zones rather than the whole type so it stays a pure ring function; the
 * `isHole` agreement is `validateTargetType`'s job.
 */
export function holeRings(
  zones: readonly { id: string; shape: ZoneShape }[],
  holeZoneIds: readonly string[] | undefined,
  segments = HOLE_SEGMENTS,
): Point[][] {
  if (!holeZoneIds || holeZoneIds.length === 0) return [];
  const byId = new Map(zones.map((z) => [z.id, z]));
  return holeZoneIds.map((id) => {
    const zone = byId.get(id);
    if (!zone) throw new Error(`target-geometry: holeZoneIds names unknown zone '${id}'`);
    const ring = ringFor(zone.shape, segments);
    // Normalise to CW regardless of how the zone happened to be authored — a
    // zone's winding is nobody's concern when it is only being hit-tested, so it
    // cannot be assumed here.
    return ringSignedArea(ring) > 0 ? ring.slice().reverse() : ring;
  });
}

/** Any zone shape as an explicit ring; circles are polygonised. */
function ringFor(shape: ZoneShape, segments: number): Point[] {
  if (shape.kind === 'circle') {
    const pts: Point[] = [];
    for (let i = 0; i < segments; i++) {
      const a = (2 * Math.PI * i) / segments;
      pts.push({ x: shape.cx + shape.r * Math.cos(a), y: shape.cy + shape.r * Math.sin(a) });
    }
    return pts;
  }
  return zoneRing(shape).map((p) => ({ ...p }));
}

/** Is the point strictly inside the zone? (No tolerance — see `zoneBroken`.) */
export function pointInZone(p: Point, shape: ZoneShape): boolean {
  if (shape.kind === 'circle') {
    return Math.hypot(p.x - shape.cx, p.y - shape.cy) <= shape.r;
  }
  return pointInPolygon(p, zoneRing(shape));
}

/** Shortest distance from the point to the zone's boundary (0 if on it). */
export function distanceToZoneBoundary(p: Point, shape: ZoneShape): number {
  if (shape.kind === 'circle') {
    return Math.abs(Math.hypot(p.x - shape.cx, p.y - shape.cy) - shape.r);
  }
  return distanceToRing(p, zoneRing(shape));
}

/**
 * Does a bullet of radius `bulletR` (same frame) touch this zone?
 *
 * Inside, OR within a bullet radius of the boundary — the LINE-BREAK convention
 * `discHit` already uses ("the bullet radius is added to the plate radius so an
 * edge graze counts", `firing-solution.ts`), generalised to any shape. Applied to
 * zones as well as the outline, it means a shot cutting a scoring line is awarded
 * the better zone, which is what IDPA scoring actually does.
 */
export function zoneBroken(p: Point, shape: ZoneShape, bulletR: number): boolean {
  return pointInZone(p, shape) || distanceToZoneBoundary(p, shape) <= bulletR;
}
