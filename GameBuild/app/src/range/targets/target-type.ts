// Target types — the "what is being shot at" half of the target system
// (Design/archive/target-system-plan.md §1, task T1).
//
// A TargetType describes the TARGET ONLY: its outline, its scoring zones, its
// face art, its mass model and its default size. It deliberately says nothing
// about how the target is held up or how it reacts to a hit — that is the MOUNT's
// job (`mount-type.ts`, task T1b), because the same silhouette can hang on chains,
// bolt to a stake or sit on a hinged stem and behave differently in each case.
// The codebase already worked this way before the abstraction existed:
// `elr-range-config.ts`'s `mountFor()` picks a mount per STATION and
// `ELRRangeScene` derives the reaction from it (`swings: st.mount !== 'stake'`).
//
// ── COORDINATE FRAME ───────────────────────────────────────────────────────────
// Outlines and zones are authored in the target's WIDTH-NORMALISED LOCAL FRAME:
//
//   X ∈ [−0.5, +0.5] exactly   (the outline spans the full width by definition)
//   Y ∈ [−aspect/2, +aspect/2] (aspect = height ÷ width)
//   +x right, +y up, origin at the outline's bounding-box centre.
//
// Multiply by `widthM` to get metres. The frame is ISOTROPIC, which is the point:
// a circle stays a circle, a distance is a distance, and the bullet-radius term in
// the hit test (T2) is a plain scaled length. The plan originally specified a
// normalised bounding box (x AND y in ±0.5); that frame is anisotropic for any
// non-square target, so an authored circle — e.g. the IDPA head zone — would
// silently become an ellipse and the bullet radius would skew with aspect.
//
// The anisotropic box still exists, but ONLY as the texture mapping: the C++ paint
// buffer uses `u = 0.5 + x/width`, `v = 0.5 + y/height` (steel_target.cpp) and
// `plate-geometry.ts` matches it. `toUnitBox()` in `target-geometry.ts` is the
// single conversion, so that frame never leaks into geometry or scoring.
//
// This file holds the TYPES and their validation; the geometry those functions
// operate on lives in `target-geometry.ts`. Pure: no THREE, no engine, no DOM.

import {
  aspectOf,
  bounds,
  NORMALISE_TOL,
  outlinePolygon,
  pointInOutline,
  zoneSamplePoints,
} from './target-geometry';

/** A mount id. Kept as a plain string alias to avoid a circular import with
 *  `mount-type.ts`; that module's registry is what validates membership, and
 *  `validateTargetType` only checks internal consistency (default ∈ compatible). */
export type MountId = string;

/** How mass and inertia are computed for the reaction physics. Maps onto the C++
 *  `SteelTarget`'s `is_oval` flag, which already branches ellipse vs rectangle
 *  (`calculateMassAndInertia`). An irregular silhouette takes `'rect'`: it
 *  overstates mass by the bounding-box fill factor, which is conservative (a
 *  heavier plate swings less) and is the closer of the two available models. */
export type MassModel = 'oval' | 'rect';

export interface Point {
  x: number;
  y: number;
}

/** The target's outline. `disc` and `rect` are generated from `aspect`; `polygon`
 *  carries an explicit closed ring (no repeated final point). */
export type TargetShape =
  | { kind: 'disc' }
  | { kind: 'rect' }
  | { kind: 'polygon'; points: readonly Point[] };

/** A scoring-zone (or drawn-shape) primitive, in the width-normalised frame. The
 *  same three primitives serve hit testing (`game/target-hit.ts`, T2) and face art
 *  (`FaceLayer`, T6b) so a drawn ring and a scored zone can never describe
 *  different geometry. */
export type ZoneShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'rect'; cx: number; cy: number; halfW: number; halfH: number }
  | { kind: 'polygon'; points: readonly Point[] };

/** One scoring zone. Zones are authored BEST-FIRST: the hit test returns the
 *  first zone containing the impact, so a centre zone must precede the ring that
 *  encloses it. */
export interface TargetZone {
  id: string;
  label: string;
  shape: ZoneShape;
}

/** A colour: either a literal `0xRRGGBB` or a `'$slot'` reference into the
 *  type's palette. Palette slots are what make recolouring a data edit — a
 *  placement can override `{ face: 0xffffff }` without touching this module. */
export type ColorRef = number | `$${string}`;

export interface DrawShape {
  shape: ZoneShape;
  fill?: ColorRef;
  stroke?: ColorRef;
  /** Stroke width in width-normalised units, so it scales with the target. */
  strokeWidthFrac?: number;
}

export interface ZoneStyle {
  fill?: ColorRef;
  stroke?: ColorRef;
  strokeWidthFrac?: number;
}

/**
 * One layer of the target's face, composited bottom-first.
 *
 * `zones` draws the type's OWN zone shapes, so scoring rings cannot drift from
 * what actually scores. `image` is provided artwork; if it fails to load the
 * rasteriser skips just that layer, which is why a legible `fill`/`zones` pair
 * underneath doubles as the fallback instead of needing a separate code path.
 */
export type FaceLayer =
  | { kind: 'fill'; color: ColorRef }
  | { kind: 'image'; artId: string; fit: 'bbox' | 'contain' }
  | { kind: 'shapes'; items: readonly DrawShape[] }
  | { kind: 'zones'; style: Record<string, ZoneStyle> };

export interface TargetPaint {
  /** Named colour slots, referenced as `'$name'`. */
  palette: Record<string, number>;
  layers: readonly FaceLayer[];
}

export interface TargetType {
  id: string;
  name: string;
  shape: TargetShape;
  /** height ÷ width of the real target; 1 for a disc/square. Cached here because
   *  scenes and the placement loader need it constantly — but VALIDATED against
   *  the outline (`validateTargetType`), so it can never disagree with geometry. */
  aspect: number;
  /** Best-first (see `TargetZone`). */
  zones: readonly TargetZone[];
  /** The zone a hit inside the outline but outside every other zone falls back
   *  to; must be one of `zones`. Conventionally the outline zone itself. */
  defaultZoneId: string;
  massModel: MassModel;
  paint: TargetPaint;
  /** Width (m) a placement gets if it does not specify one. */
  defaultWidthM: number;
  compatibleMounts: readonly MountId[];
  defaultMount: MountId;
}

// --- validation -------------------------------------------------------------

const HALF = 0.5;

/** Every `'$slot'` reference reachable from a face layer stack. */
function paletteRefs(paint: TargetPaint): string[] {
  const refs: string[] = [];
  const take = (c: ColorRef | undefined) => {
    if (typeof c === 'string') refs.push(c.slice(1));
  };
  for (const layer of paint.layers) {
    if (layer.kind === 'fill') take(layer.color);
    if (layer.kind === 'shapes')
      for (const it of layer.items) {
        take(it.fill);
        take(it.stroke);
      }
    if (layer.kind === 'zones')
      for (const st of Object.values(layer.style)) {
        take(st.fill);
        take(st.stroke);
      }
  }
  return refs;
}

/**
 * Throw on anything structurally wrong with a target type. Called at
 * registration (`registry.ts`), so a malformed type fails at import rather than
 * at render — the same "throw on a programming error" stance
 * `getRangeDefinition` takes.
 *
 * Deliberately NOT checked here: outline self-intersection. It matters for T4's
 * triangulation and belongs with the code that triangulates, where a failure is
 * actionable; asserting it here would only report it further from the fix.
 */
export function validateTargetType(t: TargetType): void {
  const where = `targetType '${t.id}'`;
  if (!t.id) throw new Error('targetType: missing id');
  if (!(t.aspect > 0)) throw new Error(`${where}: aspect must be > 0, got ${t.aspect}`);
  if (!(t.defaultWidthM > 0))
    throw new Error(`${where}: defaultWidthM must be > 0, got ${t.defaultWidthM}`);
  if (t.shape.kind === 'disc' && Math.abs(t.aspect - 1) > NORMALISE_TOL)
    throw new Error(`${where}: a disc must have aspect 1, got ${t.aspect}`);
  if (t.shape.kind === 'polygon' && t.shape.points.length < 3)
    throw new Error(`${where}: polygon outline needs ≥3 points, got ${t.shape.points.length}`);

  const ring = outlinePolygon(t.shape, t.aspect);
  const b = bounds(ring);
  // The outline must span the full WIDTH — that is what "width-normalised" means,
  // and every zone coordinate is scaled by it.
  if (Math.abs(b.maxX - HALF) > NORMALISE_TOL || Math.abs(b.minX + HALF) > NORMALISE_TOL)
    throw new Error(
      `${where}: outline is not width-normalised (x spans ${b.minX}..${b.maxX}, expected −0.5..0.5)`,
    );
  // …and its height must agree with the declared aspect, so the cached field can
  // never lie. This is also what catches an outline left in SVG viewBox pixels.
  const measured = aspectOf(ring);
  if (Math.abs(measured - t.aspect) > NORMALISE_TOL)
    throw new Error(
      `${where}: aspect ${t.aspect} disagrees with the outline's ${measured.toFixed(6)}`,
    );
  // Centred on the origin, so `widthM`/`heightM` scaling is symmetric.
  if (Math.abs(b.minY + b.maxY) > NORMALISE_TOL)
    throw new Error(`${where}: outline is not centred in y (spans ${b.minY}..${b.maxY})`);

  if (t.zones.length === 0) throw new Error(`${where}: needs at least one zone`);
  // Identity checks BEFORE geometry, so a mis-set defaultZoneId is reported as
  // itself rather than as whatever containment failure it happens to unmask.
  const ids = new Set<string>();
  for (const z of t.zones) {
    if (ids.has(z.id)) throw new Error(`${where}: duplicate zone id '${z.id}'`);
    ids.add(z.id);
  }
  if (!ids.has(t.defaultZoneId))
    throw new Error(`${where}: defaultZoneId '${t.defaultZoneId}' is not one of its zones`);

  for (const z of t.zones) {
    if (z.shape.kind === 'circle' && !(z.shape.r > 0))
      throw new Error(`${where}: zone '${z.id}' circle needs r > 0`);
    if (z.shape.kind === 'rect' && !(z.shape.halfW > 0 && z.shape.halfH > 0))
      throw new Error(`${where}: zone '${z.id}' rect needs positive half-extents`);
    if (z.shape.kind === 'polygon' && z.shape.points.length < 3)
      throw new Error(`${where}: zone '${z.id}' polygon needs ≥3 points`);
    // A zone outside the outline can never be hit — always an authoring error.
    // Boundary-tolerant, so a zone that IS the outline (the IDPA −3) passes; see
    // `pointInOutline`.
    for (const p of zoneSamplePoints(z.shape)) {
      if (!pointInOutline(p, ring))
        throw new Error(
          `${where}: zone '${z.id}' extends outside the outline (at ${p.x.toFixed(4)},${p.y.toFixed(4)})`,
        );
    }
  }

  if (t.compatibleMounts.length === 0)
    throw new Error(`${where}: needs at least one compatible mount`);
  if (!t.compatibleMounts.includes(t.defaultMount))
    throw new Error(`${where}: defaultMount '${t.defaultMount}' is not in compatibleMounts`);

  if (t.paint.layers.length === 0) throw new Error(`${where}: face has no layers`);
  for (const slot of paletteRefs(t.paint)) {
    if (!(slot in t.paint.palette))
      throw new Error(`${where}: face references palette slot '$${slot}', which is not defined`);
  }
  // A `zones` face layer keyed by a zone that does not exist draws nothing and
  // reads as a missing ring rather than an error.
  for (const layer of t.paint.layers) {
    if (layer.kind !== 'zones') continue;
    for (const zoneId of Object.keys(layer.style)) {
      if (!ids.has(zoneId))
        throw new Error(`${where}: face 'zones' layer styles unknown zone '${zoneId}'`);
    }
  }
}
