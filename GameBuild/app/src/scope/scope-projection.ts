// Scope projection — the exact angle↔pixel mapping the scope view and the
// FFP reticle share (task 1.3a; build-plan §5 Increment 1).
//
// This is LOAD-BEARING for Increment 2 ranging: the reticle must read TRUE
// subtensions so a player can range an unknown target by counting mils. The
// whole module is pure (no THREE, no DOM) so the projection invariants are
// unit-tested directly.
//
// Model — a LINEAR (equidistant) scope: the camera's vertical field of view maps
// linearly across the viewport height, so angle → pixels is `θ · H / fov`. Real
// first-focal-plane reticles are engraved linear-in-angle, and at scope FOVs
// (< ~3°) this is within parts-per-million of the camera's tan (gnomonic)
// projection — so the engraved reticle and the rendered world image agree on
// screen. Working linearly makes the mil-relation EXACT (no small-angle error in
// the reticle itself), which is what the ranging mechanic needs.
//
// All angles are radians, all distances metres, all screen sizes CSS pixels
// (the unit the camera's FOV spans, independent of devicePixelRatio). Angular
// unit math goes through the units service (guardrail §4.4).

import { milToRad, moaToRad, radToMil, radToMoa } from '../units';

/** Optic magnification range (catalog §C3; matches store ZOOM_MIN/MAX). Floor
 *  is 1× (true unaided-eye view) rather than 0× — FOV = BASE_FOV / magnification,
 *  so 0× is an infinite FOV (owner asked 2026-07-21 whether the floor could go
 *  to 0; 1× is the lowest value that keeps this finite and physically meaningful). */
export const SCOPE_MAG_MIN = 1.0;
export const SCOPE_MAG_MAX = 35;
/** Vertical field of view at 1×, degrees. Scope FOV = this / magnification.
 *  (Same base as the task-0.9 aim spike so feel carries over.) */
export const SCOPE_BASE_FOV_DEG = 24;

const BASE_FOV_RAD = (SCOPE_BASE_FOV_DEG * Math.PI) / 180;

/** Vertical FOV (radians) at a given magnification. FFP: reticle subtensions are
 *  independent of this, but the on-screen pixel scale is not. */
export const fovRadForMag = (magnification: number): number => BASE_FOV_RAD / magnification;

/**
 * Screen scale: CSS pixels per radian of look angle, for a viewport `H` px tall
 * whose camera vertical FOV is `fovRad`. Linear model (see file header).
 */
export const pixelsPerRadian = (fovRad: number, viewportHeightPx: number): number =>
  viewportHeightPx / fovRad;

/** CSS pixels spanned by one milliradian on the reticle (grows with zoom). */
export const pixelsPerMil = (fovRad: number, viewportHeightPx: number): number =>
  pixelsPerRadian(fovRad, viewportHeightPx) * milToRad(1);

/** CSS pixels spanned by one MOA on the reticle (grows with zoom). */
export const pixelsPerMoa = (fovRad: number, viewportHeightPx: number): number =>
  pixelsPerRadian(fovRad, viewportHeightPx) * moaToRad(1);

/**
 * Angular size (radians) subtended by a physical span at a distance — the
 * mil-relation, small-angle (arc ≈ size), matching units/subtension.ts and
 * Wiki/mil-dots-subtensions.md. Independent of zoom.
 */
export const angularSizeRad = (physicalSizeM: number, distanceM: number): number =>
  physicalSizeM / distanceM;

/** Subtension of a known target in MIL — the reticle reading used for ranging. */
export const subtendedMil = (physicalSizeM: number, distanceM: number): number =>
  radToMil(angularSizeRad(physicalSizeM, distanceM));

/** Subtension of a known target in MOA (dual-unit; catalog §0.6). */
export const subtendedMoa = (physicalSizeM: number, distanceM: number): number =>
  radToMoa(angularSizeRad(physicalSizeM, distanceM));

/**
 * On-screen CSS-pixel span of a world feature of `physicalSizeM` at `distanceM`,
 * viewed through `fovRad` on an `H`-px-tall viewport (same linear model as the
 * reticle). FFP invariant: `worldSizeToPixels / pixelsPerMil === subtendedMil`
 * for ANY fov — i.e. a target reads the same mils on the reticle at every zoom.
 */
export const worldSizeToPixels = (
  physicalSizeM: number,
  distanceM: number,
  fovRad: number,
  viewportHeightPx: number,
): number => angularSizeRad(physicalSizeM, distanceM) * pixelsPerRadian(fovRad, viewportHeightPx);
