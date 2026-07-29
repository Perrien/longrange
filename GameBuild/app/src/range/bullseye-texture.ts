// Bullseye plate face — originally step P2 of `Design/archive/elr-probe-plan.md`,
// now the plate face the ELR Range uses.
//
// Pure: builds the RGBA bytes for one plate-atlas layer, no THREE and no DOM, so
// the ring geometry is unit-testable. `ELRRangeScene` hands the result to the
// EXISTING `PlateSurface.writeLayer()` — the plate paint/chip system is reused
// unmodified.
//
// UV CONVENTION (pinned by the TS-A native tests, see `plate-geometry.ts`): a
// plate layer is a 2:1 tile holding BOTH caps. The front cap occupies u ∈ [0, 0.5]
// centred at (0.25, 0.5); the back cap u ∈ [0.5, 1] centred at (0.75, 0.5). Within
// a half, the disc edge is at Δu = ±0.25 and Δv = ±0.5 — so the disc is a CIRCLE
// in UV space but an ELLIPSE in texel space, and normalising radius per-axis is
// what keeps the rings actually concentric rather than egg-shaped.

import {
  PLATE_TILE_WIDTH,
  PLATE_TILE_HEIGHT,
  PLATE_LAYER_BYTES,
  hexToRgb,
} from './plate-surface';
import { RING_FRACTIONS, PLATE_HEX, RING_HEX } from './elr-range-config';

/**
 * Ring boundaries as fractions of the plate RADIUS.
 *
 * `RING_FRACTIONS` are diameters relative to the plate diameter, and a texel's
 * normalised radius is already relative to the plate radius — the two happen to be
 * the same numbers, but only because both are ratios. Named separately so the
 * relationship is stated rather than assumed.
 */
export const CENTRE_EDGE = RING_FRACTIONS.centre;
export const MIDDLE_EDGE = RING_FRACTIONS.middle;

/**
 * Colour at a normalised radius `r` (0 at the aim point, 1 at the plate edge).
 *
 * WHITE / BLUE / WHITE. A red centre was specced and rejected: red and the ring
 * blue are both ~0.3 luminance, so they differ only in hue, and hue is the first
 * thing distance takes. (Recorded here because the config file that used to carry
 * this note was the deleted probe's.)
 */
export function ringColorAt(r: number): number {
  if (r <= CENTRE_EDGE) return PLATE_HEX;
  if (r <= MIDDLE_EDGE) return RING_HEX;
  return PLATE_HEX;
}

/** Normalised radius of a texel within its cap, per the UV convention above.
 *  Returns >1 for texels outside the disc (never sampled by the cap geometry). */
export function texelRadius(x: number, y: number): number {
  const halfW = PLATE_TILE_WIDTH / 2;
  // Which cap this texel belongs to; both are drawn identically, so a hit shows
  // the same face whichever side the shot came from.
  const cx = x < halfW ? halfW / 2 : halfW + halfW / 2;
  const cy = PLATE_TILE_HEIGHT / 2;
  // Per-axis normalisation: the disc spans a quarter of the tile width but a full
  // half of its height. Dividing both by the same number would give ellipses.
  const dx = (x + 0.5 - cx) / (halfW / 2);
  const dy = (y + 0.5 - cy) / (PLATE_TILE_HEIGHT / 2);
  return Math.hypot(dx, dy);
}

/**
 * Build one plate-atlas layer carrying the bullseye.
 *
 * Every texel is opaque, including those outside the disc — the cap geometry never
 * samples them, but leaving them transparent would make a stray sample read as a
 * hole rather than as steel.
 */
export function buildBullseyeLayer(): Uint8Array {
  const data = new Uint8Array(PLATE_LAYER_BYTES);
  const plate = hexToRgb(PLATE_HEX);
  const ring = hexToRgb(RING_HEX);
  for (let y = 0; y < PLATE_TILE_HEIGHT; y++) {
    for (let x = 0; x < PLATE_TILE_WIDTH; x++) {
      const r = texelRadius(x, y);
      const c = r > CENTRE_EDGE && r <= MIDDLE_EDGE ? ring : plate;
      const i = (y * PLATE_TILE_WIDTH + x) * 4;
      data[i] = c.r;
      data[i + 1] = c.g;
      data[i + 2] = c.b;
      data[i + 3] = 255;
    }
  }
  return data;
}
