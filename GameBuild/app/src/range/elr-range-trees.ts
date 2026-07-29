import {
  mulberry32,
  TREE_VARIANTS_PER_KIND,
  type TreePlacement,
} from './environment/environment-config';
import {
  GROUND_WIDTH_M,
  GROUND_LENGTH_M,
  FIRING_POINT_CLEAR_RADIUS_M,
  groundY,
} from './elr-range-config';

/**
 * Trees are generated ONCE at this size; the scene draws a prefix. Station
 * offsets are solved against the FULL field, so any smaller draw count is a
 * strict subset and every sight line stays clear.
 */
export const MAX_TREES = 4000;

/** Fixed seed — the layout must be identical on every entry and every device. */
export const TREE_SEED = 20260728;

const SCALE_MIN = 0.75;
const SCALE_MAX = 1.6;
const ASPECT_SPREAD = 0.22;
const MAX_TILT_RAD = 0.07;
const CONIFER_FRACTION = 0.65;

/** Both firing points sit at z ≈ 0; keep canopy out of both cameras. */
export function isPlaceable(x: number, z: number): boolean {
  return Math.hypot(x, z) >= FIRING_POINT_CLEAR_RADIUS_M;
}

export function generateRangeTreePlacements(
  count: number,
  paletteSize: number,
): TreePlacement[] {
  const rand = mulberry32(TREE_SEED);
  const placements: TreePlacement[] = [];
  const halfWidth = GROUND_WIDTH_M / 2;
  const maxAttempts = count * 12;

  for (let attempt = 0; attempt < maxAttempts && placements.length < count; attempt++) {
    const x = (rand() * 2 - 1) * halfWidth;
    const z = -rand() * GROUND_LENGTH_M;
    if (!isPlaceable(x, z)) continue;

    const scale = SCALE_MIN + rand() * (SCALE_MAX - SCALE_MIN);
    placements.push({
      kind: rand() < CONIFER_FRACTION ? 'conifer' : 'deciduous',
      x,
      z,
      y: groundY(-z),
      scale,
      scaleXZ: scale * (1 + (rand() * 2 - 1) * ASPECT_SPREAD),
      scaleY: scale * (1 + (rand() * 2 - 1) * ASPECT_SPREAD),
      rotationY: rand() * Math.PI * 2,
      tiltX: (rand() * 2 - 1) * MAX_TILT_RAD,
      tiltZ: (rand() * 2 - 1) * MAX_TILT_RAD,
      variantIndex: Math.floor(rand() * TREE_VARIANTS_PER_KIND),
      tintIndex: Math.floor(rand() * Math.max(1, paletteSize)),
    });
  }
  return placements;
}
