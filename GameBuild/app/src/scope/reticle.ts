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

/** A cadence band: place a tick every `step` units until the subtension reaches
 *  `until`, then the next band takes over (bands are consulted in order). Lets a
 *  reticle thin out with distance from centre. */
interface CadenceBand {
  readonly until: number;
  readonly step: number;
}

/** Tick cadence per unit. A labelled major falls on every `majorEvery` units.
 *  MIL: 1-mil hashes all the way, label every 5. MOA: 1-MOA hashes to 15, then
 *  every 5 to 50, then every 10 beyond (owner-tuned — a flat 1-MOA cadence was
 *  too noisy at low zoom); label every 5. */
const CADENCE: Record<ReticleUnit, { bands: readonly CadenceBand[]; majorEvery: number }> = {
  MIL: { bands: [{ until: Infinity, step: 1 }], majorEvery: 5 },
  MOA: {
    bands: [
      { until: 15, step: 1 },
      { until: 50, step: 5 },
      { until: Infinity, step: 10 },
    ],
    majorEvery: 5,
  },
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

/** Positive tick subtension values in increasing order, walking the cadence
 *  bands, stopping once a tick would fall outside the scope circle. */
function axisValues(bands: readonly CadenceBand[], maxValue: number): number[] {
  const out: number[] = [];
  let v = 0;
  for (const band of bands) {
    while (v + band.step <= band.until + 1e-9) {
      v += band.step;
      if (v > maxValue) return out;
      out.push(v);
    }
  }
  return out;
}

function buildAxis(
  pxPerUnit: number,
  maxOffsetPx: number,
  bands: readonly CadenceBand[],
  majorEvery: number,
): Tick[] {
  const ticks: Tick[] = [];
  const maxValue = maxOffsetPx / pxPerUnit;
  // Positive values from the cadence; mirror each to the negative side (skip 0 —
  // the centre is the crosshair, drawn separately).
  for (const value of axisValues(bands, maxValue)) {
    const major = value % majorEvery === 0;
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
  const { bands, majorEvery } = CADENCE[unit];
  const ticksX = buildAxis(pxPerUnit, maxOffsetPx, bands, majorEvery);
  const ticksY = buildAxis(pxPerUnit, maxOffsetPx, bands, majorEvery);
  const maxValue = ticksX.reduce((m, t) => Math.max(m, Math.abs(t.value)), 0);
  return { unit, pxPerUnit, ticksX, ticksY, maxValue };
}
