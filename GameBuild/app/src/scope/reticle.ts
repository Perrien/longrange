// FFP reticle geometry (task 1.3a; build-plan §5 Increment 1).
//
// Pure layout for a first-focal-plane hash reticle in MIL or MOA. Given the
// current FOV, viewport height, and the scope-circle radius, it returns the
// pixel positions of every tick on the vertical and horizontal stadia. The
// drawing (a 2D canvas overlay) lives in ScopeView (task 1.3b); keeping the
// geometry pure makes the tick cadence and exact placement unit-testable.
//
// FFP: ticks are placed at fixed ANGLES (k·mil / k·MOA), so a target of known
// size always covers the same number of ticks at any zoom — the pixel spacing
// grows with magnification exactly as the world image does (see scope-projection
// worldSizeToPixels). Ticks stop at the scope-circle radius. Screen units are
// CSS pixels; offsets are distance from screen centre along the axis.

import { pixelsPerMil, pixelsPerMoa } from './scope-projection';

export type ReticleUnit = 'MIL' | 'MOA';

/** Tick cadence per unit: a minor tick every `step`, a labelled major every
 *  `majorEvery` steps. MIL: 1-mil hashes, label every 5. MOA: 1-MOA hashes,
 *  label every 5. */
const CADENCE: Record<ReticleUnit, { step: number; majorEvery: number }> = {
  MIL: { step: 1, majorEvery: 5 },
  MOA: { step: 1, majorEvery: 5 },
};

/** Half-length (px, perpendicular to the axis) of a minor / major tick. */
export const MINOR_HALF_PX = 5;
export const MAJOR_HALF_PX = 11;

/** One hash mark on a stadia line. */
export interface Tick {
  /** Signed subtension value in the reticle unit (…, -2, -1, 1, 2, … mil/MOA). */
  value: number;
  /** Signed distance from screen centre along the axis, CSS px (+X right / +Y up
   *  as a magnitude; the drawer chooses screen direction per axis). */
  offsetPx: number;
  /** Major ticks are longer and carry a numeric label. */
  major: boolean;
  /** Half-length of the tick perpendicular to the axis, CSS px. */
  halfLengthPx: number;
  /** Absolute value as a display string, on majors only. */
  label?: string;
}

export interface ReticleGeometry {
  unit: ReticleUnit;
  /** CSS px per reticle unit (per mil / per MOA) at the current zoom. */
  pxPerUnit: number;
  /** Ticks along the horizontal (windage) stadia, symmetric about centre. */
  ticksX: Tick[];
  /** Ticks along the vertical (elevation) stadia, symmetric about centre. */
  ticksY: Tick[];
  /** Largest subtension value drawn (fits inside the scope circle). */
  maxValue: number;
}

function buildAxis(pxPerUnit: number, maxOffsetPx: number, step: number, majorEvery: number): Tick[] {
  const ticks: Tick[] = [];
  // Whole steps whose offset fits inside the scope circle (skip 0 — the centre
  // is the crosshair, drawn separately).
  const maxK = Math.floor(maxOffsetPx / (pxPerUnit * step));
  for (let k = 1; k <= maxK; k++) {
    const value = k * step;
    const major = k % majorEvery === 0;
    const half = major ? MAJOR_HALF_PX : MINOR_HALF_PX;
    for (const sign of [1, -1] as const) {
      ticks.push({
        value: sign * value,
        offsetPx: sign * value * pxPerUnit,
        major,
        halfLengthPx: half,
        label: major ? String(value) : undefined,
      });
    }
  }
  return ticks;
}

/**
 * Build the reticle tick geometry for the current view. `maxOffsetPx` is the
 * scope-circle radius in CSS px — ticks are clipped to it.
 */
export function buildReticle(
  unit: ReticleUnit,
  fovRad: number,
  viewportHeightPx: number,
  maxOffsetPx: number,
): ReticleGeometry {
  const pxPerUnit = unit === 'MIL'
    ? pixelsPerMil(fovRad, viewportHeightPx)
    : pixelsPerMoa(fovRad, viewportHeightPx);
  const { step, majorEvery } = CADENCE[unit];
  const ticksX = buildAxis(pxPerUnit, maxOffsetPx, step, majorEvery);
  const ticksY = buildAxis(pxPerUnit, maxOffsetPx, step, majorEvery);
  const maxValue = ticksX.reduce((m, t) => Math.max(m, Math.abs(t.value)), 0);
  return { unit, pxPerUnit, ticksX, ticksY, maxValue };
}
