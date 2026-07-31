// Popper target type (Design/Plans/target-system-plan.md, task T8).
//
// Transcribed from `Documentation/Targets/idpa-popper.svg` — the owner's spec of
// record — the same way `idpa.ts` handles the silhouette: the path is embedded VERBATIM
// and flattened by `svg-outline.ts`, so outline, zone and face all derive from one
// source and the sync test is exact string equality.
//
// NOT A ROUND HEAD. The plan first described this as an "8″ round popper head"; the
// spec is a 42″ full-height silhouette — head arc R3″, an R6″ body circle centred
// 27.375″ up, pinching to 8″ at the waist before tapering to a 6″ base. Two
// consequences: it needs the ARC flattener (its authored line endpoints span only 8″;
// the body arcs bulge to the true 12″), and its waist pinch makes the ring NON-CONVEX,
// so it needs real triangulation rather than a centroid fan.

import { flattenOutline, localCircle } from './svg-outline';
import type { TargetType } from './target-type';

// ── verbatim from Documentation/Targets/idpa-popper.svg ────────────────────────
// viewBox 140 × 440, stated overall height 42 in (10 px per inch).

/** The popper silhouette. Whitespace-normalised to one line; the sync test
 *  normalises the spec file the same way before comparing. */
export const POPPER_OUTLINE_D =
  'M70,10 A30,30 0 0,1 100,40 L100,104.3 A60,60 0 0,1 110,201 L100,430 L40,430 L30,201 A60,60 0 0,1 40,104.3 L40,40 A30,30 0 0,1 70,10 Z';

/** The spec's R6″ reference circle — the body's widest ring, drawn as an aim
 *  reference. Art only: it is NOT a scoring zone (see the face stack below). */
export const POPPER_REFERENCE_CIRCLE = { cx: 70, cy: 156.25, r: 60 } as const;

/** Line colour, verbatim from the spec's `stroke`. */
export const POPPER_LINE_HEX = 0x1a1a1a;
/**
 * Face colour. NOT from the spec — the drawing is `fill="none"` line art, so it
 * carries no face colour at all. This is the shipped steel paint (`RangeScene`'s
 * `PLATE_COLOR`), which keeps a popper looking like the rest of the range's steel.
 */
export const POPPER_FACE_HEX = 0xf0f0ea;

/** Stated dimensions (in), for the dimensional cross-checks in the test. */
export const POPPER_DIMS = {
  heightIn: 42,
  /** The R6″ body circle ⇒ 12″ at its widest, which is the outline's true width. */
  widthIn: 12,
  /** Where the body arcs pinch in before the taper. */
  waistIn: 8,
  baseIn: 6,
  bodyRadiusIn: 6,
  headRadiusIn: 3,
} as const;

// ── derived geometry ──────────────────────────────────────────────────────────

const flat = flattenOutline(POPPER_OUTLINE_D);

/** The drawing's reference frame — the reference circle normalises against it. */
export const POPPER_FRAME = flat.frame;
/** Closed CCW ring in the width-normalised local frame (arcs flattened). */
export const POPPER_OUTLINE = flat.points;
/** height ÷ width, computed from the flattened outline (≈ 3.5 = 42″ ÷ 12″). */
export const POPPER_ASPECT = flat.aspect;

/**
 * A 12″-wide, 42″-tall steel popper on a hinged stem.
 *
 * MOUNT: `hinge-stem` ONLY. A popper is welded to its stem — hanging one on chains or
 * bolting it rigid is not a thing that exists, and the placement loader enforces that
 * rather than letting a data file describe an impossible target.
 *
 * ZONES: one, the silhouette. A popper scores by falling over, not by where it was hit,
 * so subdividing it would invent a scoring scheme the hardware does not have.
 *
 * FACE STACK: `fill` then a `shapes` layer drawing the spec's R6″ reference circle.
 * That circle is deliberately ART, not a zone — it is an aim reference, and it is also
 * the concrete demonstration of owner decision 9's "or you drawing circle hit areas":
 * a drawn overlay needs no asset, no fetch, and no scoring change.
 */
export const POPPER: TargetType = {
  id: 'popper',
  name: 'Steel popper',
  shape: { kind: 'polygon', points: POPPER_OUTLINE },
  aspect: POPPER_ASPECT,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'polygon', points: POPPER_OUTLINE } }],
  defaultZoneId: 'plate',
  // A pinched silhouette is not an ellipse; the bounding-box tensor is the closer of
  // the two models the C++ offers, and overstating mass is the conservative direction
  // for a knockdown (a heavier plate falls more reluctantly).
  massModel: 'rect',
  paint: {
    palette: { face: POPPER_FACE_HEX, line: POPPER_LINE_HEX },
    layers: [
      { kind: 'fill', color: '$face' },
      {
        kind: 'shapes',
        items: [
          {
            shape: localCircle(
              POPPER_REFERENCE_CIRCLE.cx,
              POPPER_REFERENCE_CIRCLE.cy,
              POPPER_REFERENCE_CIRCLE.r,
              POPPER_FRAME,
            ),
            stroke: '$line',
            strokeWidthFrac: 0.012,
          },
        ],
      },
    ],
  },
  defaultWidthM: 0.3048, // 12"
  compatibleMounts: ['hinge-stem'],
  defaultMount: 'hinge-stem',
};
