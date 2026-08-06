// The windowed IDPA silhouette — the backing plate of the hostage-target
// assembly (Design/Plans, "IDPA Hostage/No-Shoot Paddle Targets"). Identical to
// `IDPA_SILHOUETTE` except for one added zone: a circular WINDOW cut in the
// upper chest, where the centre hostage paddle (`hostage-paddle.ts`, mounted on
// `hostage-clamp-3way`) sits when swung to its `'center'` stop.
//
// Deliberately a SEPARATE type rather than a modification of `idpa.ts`'s
// shipped `IDPA_SILHOUETTE` — that type is tested by exact string equality
// against its SVG spec, and other placements already depend on its exact
// zone set. This type imports its geometry constants instead, so the two can
// never silently diverge.
//
// WHY THE WINDOW IS A ZONE, NOT A HOLE IN THE OUTLINE MESH: hit resolution
// (`game/shot.ts`, `game/target-hit.ts`) has no Z-depth/occlusion concept
// between overlapping plates — it tests each plate's zones independently. A
// shot into the window that misses the (possibly absent, possibly
// smaller-than-the-hole) centre paddle must miss this plate cleanly rather
// than fall through to the silhouette's own scoring zones, which is exactly
// what `isHole` (`target-type.ts`) exists for. No mesh geometry or occlusion
// subsystem is involved.
//
// The window's screen position is authored BEST-FIRST, ahead of every other
// zone, matching `target-type.ts`'s "first zone containing the impact wins"
// contract.
//
// ── THE FACE (owner, on device 2026-08-06) ────────────────────────────────────
// PLAIN WHITE, no artwork: "remove the artwork from this one (the cardboard
// brown and zones lines) main body should be just white". So no `image` layer
// and no `zones` layer — the scoring zones still exist and still score, they
// are simply not drawn. This type keeps IMPORTING `idpa.ts`'s geometry (that is
// the whole reason it is a separate type rather than a copy) while sharing none
// of its palette.
//
// The window is a `cut` layer, i.e. a REAL hole: "the center hole in the main
// target should be a visible hole where the bckground can be seen". Previously
// it was a near-black `$void` fill, which is what read as "just a black spot".
// The shots-go-through half of that request was already true — `isHole` — and is
// now the same shape by construction, since a `cut` can only name an `isHole`
// zone (`validateTargetType`).

import { localCircle, localPolygon } from './svg-outline';
import {
  IDPA_ASPECT,
  IDPA_BODY_CIRCLE,
  IDPA_FRAME,
  IDPA_HEAD_CIRCLE,
  IDPA_MINUS1_D,
  IDPA_OUTLINE,
} from './idpa';
import type { TargetType } from './target-type';

/**
 * Window centre/radius, in the SAME spec-pixel frame as `IDPA_HEAD_CIRCLE`/
 * `IDPA_BODY_CIRCLE` (viewBox 423×694). CONCENTRIC with the body-0 circle
 * (owner, on device: "it should line up with the center circle in the
 * target") and about double the radius of the first pass (35 → 70 px) — still
 * well inside body-0's own 84.05 px radius, so the window reads as a large
 * aperture nested inside the −0 ring rather than crossing it.
 */
export const IDPA_HOSTAGE_WINDOW_CIRCLE = {
  cx: IDPA_BODY_CIRCLE.cx,
  cy: IDPA_BODY_CIRCLE.cy,
  r: 70,
} as const;

/** Plain white — the whole face (owner: "main body should be just white"). */
export const IDPA_HOSTAGE_FACE_HEX = 0xffffff;

export const IDPA_HOSTAGE_SILHOUETTE: TargetType = {
  id: 'idpa-hostage-silhouette',
  name: 'IDPA hostage silhouette',
  shape: { kind: 'polygon', points: IDPA_OUTLINE },
  aspect: IDPA_ASPECT,
  zones: [
    {
      id: 'window',
      label: 'Window',
      isHole: true,
      shape: localCircle(
        IDPA_HOSTAGE_WINDOW_CIRCLE.cx,
        IDPA_HOSTAGE_WINDOW_CIRCLE.cy,
        IDPA_HOSTAGE_WINDOW_CIRCLE.r,
        IDPA_FRAME,
      ),
    },
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
  massModel: 'rect',
  paint: {
    palette: { face: IDPA_HOSTAGE_FACE_HEX },
    layers: [
      { kind: 'fill', color: '$face' },
      // LAST, as any cut must be: it removes what earlier layers put down, so a
      // layer added after it would fill the window back in.
      { kind: 'cut', zoneIds: ['window'] },
    ],
  },
  defaultWidthM: 0.4572, // 18" — same as the plain IDPA silhouette.
  compatibleMounts: ['bolt-stake', 'chain-beam'],
  defaultMount: 'bolt-stake',
};
