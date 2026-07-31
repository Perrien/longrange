// IDPA silhouette target type (Design/archive/target-system-plan.md, task T7).
//
// Transcribed from `Documentation/Targets/idpa-target.svg` — the owner's spec of
// record. The SVG's path/circle attributes are embedded here VERBATIM as string
// constants and flattened by `svg-outline.ts` at module load, so:
//
//   • the outline, the four scoring zones and the rasterised face all derive from
//     ONE source, and cannot drift apart;
//   • the sync test is exact STRING EQUALITY against the spec file rather than a
//     tolerance comparison of hand-copied numbers. Edit the art without editing this
//     file (or the reverse) and `idpa.test.ts` fails.
//
// `public/targets/idpa-target.svg` is a byte-identical copy of the same file, for the
// rasteriser to fetch; a test asserts they match, because two copies that can diverge
// silently is exactly the problem this design avoids elsewhere.

import { flattenOutline, localCircle, localPolygon, toLocal } from './svg-outline';
import type { TargetType } from './target-type';

// ── verbatim from Documentation/Targets/idpa-target.svg ────────────────────────
// viewBox 423 × 694, stated total height 30.75 in.

/** Outer silhouette — also the −3 scoring zone. */
export const IDPA_OUTLINE_D =
  'M145,15 L278.25,15 L278.25,143 L360.75,143.5 L408.25,215.25 L408.25,566.25 L348,678.75 L74,678.75 L15,566.25 L15,214.75 L62.5,143.5 L144.75,143.25 Z';

/** Inner scoring zone — the −1 boundary. */
export const IDPA_MINUS1_D =
  'M148,148 L275,147.75 L338.25,218 L338.25,431.75 L274.5,537.75 L148.25,537.75 L84.75,432 L84.75,217.75 Z';

/** Head centre zone (−0). */
export const IDPA_HEAD_CIRCLE = { cx: 211.55, cy: 90.55, r: 41.2 } as const;
/** Body centre zone (−0). */
export const IDPA_BODY_CIRCLE = { cx: 211.53, cy: 300.95, r: 84.05 } as const;

/** Fill colours, verbatim from the spec's `fill`/`stroke` attributes. */
export const IDPA_COLORS = {
  /** IDPA-TAN body. */
  face: 0xb4946e,
  /** The −1 zone's slightly lighter fill. */
  inner: 0xc5a88a,
  /** The −0 centres. */
  centre: 0xdbc6b3,
  /** Boundary lines. */
  line: 0x1a1a1a,
} as const;

/** Stated overall height (in), for the dimensional cross-check in the test. */
export const IDPA_HEIGHT_IN = 30.75;

/**
 * The shoulder line, in spec pixels — the y of the outermost shoulder vertices
 * (`408.25,215.25`'s inboard neighbours at `360.75,143.5` and `62.5,143.5`).
 *
 * Exported because the Test Range stages this target by SHOULDER height (owner:
 * 5 ft at the shoulders), so the placement's `centreYM` has to be derived from it.
 * A comment claiming the height would not have caught the 4.22 ft it was actually
 * drawn at; a test against this constant does.
 */
export const IDPA_SHOULDER_PX_Y = 143.5;

// ── derived geometry ──────────────────────────────────────────────────────────

const flat = flattenOutline(IDPA_OUTLINE_D);

/** The drawing's reference frame — every zone normalises against the OUTLINE's box. */
export const IDPA_FRAME = flat.frame;
/** Closed CCW ring in the width-normalised local frame. */
export const IDPA_OUTLINE = flat.points;
/** height ÷ width, computed from the outline (≈ 1.688). */
export const IDPA_ASPECT = flat.aspect;

/** Shoulder height above the target's CENTRE, in width-normalised local units.
 *  × `widthM` for metres. */
export const IDPA_SHOULDER_LOCAL_Y = toLocal(
  { x: IDPA_FRAME.cxPx, y: IDPA_SHOULDER_PX_Y },
  IDPA_FRAME,
).y;

/**
 * An 18″-wide IDPA silhouette.
 *
 * MOUNT: `bolt-stake` by default (owner, 2026-07-30) — bolted, so it takes paint and
 * scores but does not swing. `chain-beam` is also permitted, so hanging one later is a
 * placement edit and no new code.
 *
 * ZONES are authored BEST-FIRST, which is what the hit test walks: the two −0 centres,
 * then −1, then the silhouette itself as −3. `defaultZoneId` is `minus-3`, so a hit
 * inside the outline but outside every ring scores −3 rather than missing.
 *
 * FACE STACK is `fill → zones → image`, in that order deliberately. The zone strokes
 * sit BENEATH the artwork, so they are invisible when the SVG loads and become a
 * legible fallback when it does not — one code path, no fallback branch. (The plan
 * listed `zones` last; that would draw them on top of the art, doubling every line.)
 */
export const IDPA_SILHOUETTE: TargetType = {
  id: 'idpa-silhouette',
  name: 'IDPA silhouette',
  shape: { kind: 'polygon', points: IDPA_OUTLINE },
  aspect: IDPA_ASPECT,
  zones: [
    {
      id: 'head-0',
      label: 'Head −0',
      shape: localCircle(IDPA_HEAD_CIRCLE.cx, IDPA_HEAD_CIRCLE.cy, IDPA_HEAD_CIRCLE.r, IDPA_FRAME),
    },
    {
      id: 'body-0',
      label: 'Body −0',
      shape: localCircle(IDPA_BODY_CIRCLE.cx, IDPA_BODY_CIRCLE.cy, IDPA_BODY_CIRCLE.r, IDPA_FRAME),
    },
    { id: 'minus-1', label: '−1', shape: localPolygon(IDPA_MINUS1_D, IDPA_FRAME) },
    { id: 'minus-3', label: '−3', shape: { kind: 'polygon', points: IDPA_OUTLINE } },
  ],
  defaultZoneId: 'minus-3',
  // A silhouette is not an ellipse; the bounding-box tensor is the closer of the two
  // models the C++ offers, and overstating mass is the conservative direction.
  massModel: 'rect',
  paint: {
    palette: {
      face: IDPA_COLORS.face,
      inner: IDPA_COLORS.inner,
      centre: IDPA_COLORS.centre,
      line: IDPA_COLORS.line,
    },
    layers: [
      { kind: 'fill', color: '$face' },
      // Drawn from the type's OWN zones, so the fallback art cannot disagree with what
      // scores. Painted in the spec's own fills, bottom-up: −1, then the two centres.
      {
        kind: 'zones',
        style: {
          'head-0': { fill: '$centre', stroke: '$line', strokeWidthFrac: 0.006 },
          'body-0': { fill: '$centre', stroke: '$line', strokeWidthFrac: 0.006 },
          'minus-1': { fill: '$inner', stroke: '$line', strokeWidthFrac: 0.006 },
        },
      },
      { kind: 'image', artId: 'idpa', fit: 'bbox' },
    ],
  },
  defaultWidthM: 0.4572, // 18"
  compatibleMounts: ['bolt-stake', 'chain-beam'],
  defaultMount: 'bolt-stake',
};
