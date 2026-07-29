// Ground cover for the ELR Range — grass tuft placement.
//
// Pure: no THREE, so the placement rules are unit-testable. The MESH comes from
// the shared `environment/ground-cover.ts` (`buildGrassTuftMesh`), reused
// unmodified — the tuft geometry, the dark-base/light-tip vertex gradient and the
// unlit material are all the Wooded Zero Range's, which is the point: the owner
// asked for that range's ground look, not a second one that resembles it.
//
// Why this file exists rather than `generateScatterPlacements`: the shared
// generator is driven by an `EnvironmentConfig` (lane half-width, corridor
// clearance, terrain sampler), and the ELR Range has none of that — it has a
// single straight lane over an analytic convex profile. Same reason
// `elr-range-trees.ts` exists next to the shared tree generator.
//
// SHAPE OF THE FIELD, and why the first version was wrong (owner, on device
// 2026-07-29: *"the tufts only show close to the shooter but die off quickly"*).
// v1 scattered a fixed count uniformly over an 80 × 100 m RECTANGLE. Two faults,
// and neither was the terrain — the ground climbs 0.14 m over 80 m and the tufts
// were sitting on it correctly:
//
//   1. **80 m was far too shallow.** It was sized off "when does a tuft stop being
//      worth drawing", which is the wrong question on a range where the near ground
//      is most of the picture. The low line alone shoots to 500 m.
//   2. **A uniform field ends in a HARD LINE.** Any constant-density region has a
//      visible boundary wherever it stops, and grass that stops dead across the
//      whole view reads as a rendering fault rather than as the edge of a field.
//
// So the field is now a SECTOR — full density out to `GRASS_FULL_M`, then density
// falling linearly to zero at `GRASS_FADE_M`. The taper is the whole point: the
// last hundred metres thin out, so there is no edge to see. Constant density (not
// constant screen density) is also what a real field has: a patch of ground
// subtends less screen area with distance, so uniform ground density is what makes
// the grass look uniformly dense to the eye.

import { mulberry32 } from './environment/environment-config';
import type { ScatterPlacement } from './environment/environment-config';
import { groundY, GROUND_WIDTH_M, GROUND_LENGTH_M } from './elr-range-config';

/** Fixed seed — the tufts must land identically on every entry and every device,
 *  for the same reason the forest does (`TREE_SEED`). A distinct stream from the
 *  trees so adding or removing a tree cannot reshuffle the grass. */
export const GRASS_SEED = 20260729;

/** Out to here the field is at full density (m).
 *
 *  Covers the low line's first three stations outright (50/100/150) and most of
 *  the ground the prone eye actually looks across. */
export const GRASS_FULL_M = 150;

/** Density falls linearly from `GRASS_FULL_M` to zero here (m).
 *
 *  **2500 m (owner, 2026-07-29 — "extend it out to 2500 and see how that looks").**
 *  Past the 2000 m far station, so grass thins out under the entire centrefire
 *  ladder rather than stopping inside it.
 *
 *  ⚠️ **THIS IS THE EXPENSIVE KNOB, and not linearly so.** Sector area grows as r²
 *  while the taper only falls as r, so tufts-per-band keeps CLIMBING out to about
 *  ⅔ of the fade before it turns over — the count does not level off just because
 *  the density does. 500 → 1000 → 2500 m costs 11 000 → 37 000 → ~200 000 tufts.
 *  If this needs to reach further again, the lever to reach for is the SHAPE of
 *  `grassDensityAt` (a squared taper roughly halves the count for the same reach),
 *  not another increase here.
 *
 *  What it trades visually: a 0.21 m tuft subtends 0.084 mrad at 2500 m, far under
 *  a pixel at any magnification. Sub-pixel unlit tufts are the one thing that can
 *  look WORSE than no grass — they shimmer as the scope pans. The taper keeps that
 *  band sparse, but if speckle shows on device the fix is to dim tufts with distance
 *  or light them so fog pulls them into the ground — NOT to pull this number back
 *  in, which would also cost the near-field reach that made it look right. */
export const GRASS_FADE_M = 2500;

/** Half-angle of the sector tufts are scattered across (deg).
 *
 *  A sector rather than a rectangle so the field widens with the view cone — a
 *  rectangle wide enough at 500 m is absurdly wide at 50 m. 25° is far more than
 *  the ±35 mrad (±2°) station fan and comfortably covers a 1× field of view, so
 *  the player cannot see the azimuth edges while shooting; they only exist to keep
 *  the instance count paying for ground that is actually looked at. */
export const GRASS_HALF_ANGLE_DEG = 25;

/**
 * Hard lateral limit on a tuft (m) — the edge of the drawn ground.
 *
 * The sector only fits inside the terrain out to `700 / sin 25° ≈ 1657 m`; past
 * that its corners would hang off the side of a 1400 m-wide world. Draws outside
 * the limit are REJECTED rather than the cone being narrowed, because a narrowing
 * cone reads as a funnel of grass leading downrange, while a square clip just looks
 * like the field ending where the ground does — which is exactly what it is.
 */
export const GRASS_LATERAL_LIMIT_M = GROUND_WIDTH_M / 2;

/**
 * Radius around the firing point kept clear of tufts (m).
 *
 * **This is an optics constraint, not a tidiness one.** The player looks through a
 * 1–20× scope: a tuft at 3 m fills the sight picture at magnification, and the
 * Wooded Zero Range clears 18 m for exactly this reason (`SHOOTER_CLEAR_M`). Held
 * at the same 18 m rather than the trees' `FIRING_POINT_CLEAR_RADIUS_M` (30 m) —
 * a tuft is 0.2 m tall and a tree is 15 m, so reusing the canopy radius would
 * strip grass out of the most visible ground on the range for no reason.
 */
export const GRASS_CLEAR_RADIUS_M = 18;

/**
 * How many tufts to place.
 *
 * Derived, not picked: it is the count that puts the FULL-density part of the
 * sector at the Wooded Zero Range's own density (~0.2 /m² over its eligible
 * ground), so the ground near the firing point reads the same on both ranges —
 * and so that changing the fade distance changes REACH only, never the look of
 * the near field.
 *
 *     ∫ 2·A(r)·r·taper(r) dr  over r ∈ [18, 2500]  ≈  930 000 m²
 *     (A = 25°, narrowing past 1657 m where the lateral clip bites)
 *
 * and 0.216 /m² of that is ~200 000. Still ONE `InstancedMesh` and ONE draw call,
 * unlit, no shadow pass — but at ~1.0 M triangles this is the first version where
 * frame time is genuinely in play rather than comfortably clear, and the instance
 * matrices are ~13 MB uploaded once at scene build. The ELR range's perf HUD
 * (`render ms · verdict · calls · tris`) exists to answer that on device.
 *
 * If it does not hold: shape `grassDensityAt` rather than shrinking the reach — a
 * squared taper keeps 2500 m for roughly half the tufts.
 */
export const GRASS_TUFT_COUNT = 200000;

/** Density at radius `r`, as a fraction of full: 1 out to `GRASS_FULL_M`, falling
 *  linearly to 0 at `GRASS_FADE_M`. Exported because the fade is the fix for the
 *  hard edge, so it is worth testing directly. */
export function grassDensityAt(r: number): number {
  if (r <= GRASS_FULL_M) return 1;
  if (r >= GRASS_FADE_M) return 0;
  return (GRASS_FADE_M - r) / (GRASS_FADE_M - GRASS_FULL_M);
}

/**
 * Scatter tufts across the near ground in front of the firing points.
 *
 * Independent of which firing point is active: both sit at the origin (the high
 * line is an elevated eye over the same spot, see `eyeYFor`), so one field serves
 * both and switching lines cannot shuffle the grass.
 *
 * `r = √u · FADE` is area-uniform within the sector — sampling `r` uniformly would
 * pile tufts up at the shooter's feet, which is where the field is least wanted.
 * The density taper is then applied as a rejection on top of that.
 */
export function generateGrassTuftPlacements(count = GRASS_TUFT_COUNT): ScatterPlacement[] {
  const rand = mulberry32(GRASS_SEED);
  const halfAngleRad = (GRASS_HALF_ANGLE_DEG * Math.PI) / 180;
  const placements: ScatterPlacement[] = [];
  // ~39 % of draws survive the clear radius plus the taper, so 8× is a wide
  // margin; it exists only so a pathological PRNG cannot spin forever.
  const maxAttempts = count * 8;

  for (let attempt = 0; attempt < maxAttempts && placements.length < count; attempt++) {
    const r = Math.sqrt(rand()) * GRASS_FADE_M;
    const azimuth = (rand() * 2 - 1) * halfAngleRad;
    const keep = rand();
    if (r < GRASS_CLEAR_RADIUS_M) continue;
    if (keep > grassDensityAt(r)) continue;
    const x = r * Math.sin(azimuth);
    if (Math.abs(x) > GRASS_LATERAL_LIMIT_M) continue; // off the side of the ground
    const z = -r * Math.cos(azimuth);
    placements.push({
      x,
      z,
      y: groundY(-z), // terrain height is a function of downrange distance only
      scale: 0.7 + rand() * 0.7,
      rotationY: rand() * Math.PI * 2,
    });
  }
  return placements;
}

/**
 * Drop tufts standing at the foot of a target, so grass cannot hide a plate.
 *
 * **A real risk on the near stations, not a hypothetical.** The 50 m gong is 5 cm
 * across on a 12" stake, so its centre sits ~0.25 m up — and a tuft scales to
 * 0.29 m tall. The sight-clearance solver (`sight-clearance.ts`) only knows about
 * trees, so nothing else would catch this.
 *
 * 5 m is generous on purpose. From the prone eye at 1.7 m the sight line to a
 * 50 m stake is still 0.54 m up at 40 m downrange and 0.31 m at 48 m, so a tuft
 * only reaches the line within ~2 m of the target; anything further out passes
 * under it. Applied to every station rather than gated on distance — a uniform
 * rule needs no threshold to defend, and the far stations lie outside the field
 * anyway.
 *
 * Applied in the SCENE, against the active firing point's layout, exactly as the
 * per-line tree culling already is (`ElrLayout.cullTreeIndices`) — so the tuft
 * FIELD stays line-independent and each line removes its own handful from it.
 */
export const GRASS_STATION_CLEAR_M = 5;

export function rejectTuftsAtStations(
  placements: readonly ScatterPlacement[],
  stations: readonly { x: number; z: number }[],
  clearRadiusM = GRASS_STATION_CLEAR_M,
): ScatterPlacement[] {
  const r2 = clearRadiusM * clearRadiusM;
  return placements.filter((t) =>
    !stations.some((s) => (t.x - s.x) ** 2 + (t.z - s.z) ** 2 < r2),
  );
}

/** The tuft field must fit inside the DRAWN ground, or tufts float over nothing at
 *  the edges. Exported so it can be asserted rather than remembered.
 *
 *  Only the DOWNRANGE reach is a real constraint now — laterally the generator
 *  CLIPS to `GRASS_LATERAL_LIMIT_M` rather than trusting the sector to fit, which
 *  it stopped doing past 1657 m when the fade went to 2500. */
export function grassZoneFitsGround(): boolean {
  const lateralReachM = GRASS_FADE_M * Math.sin((GRASS_HALF_ANGLE_DEG * Math.PI) / 180);
  return (
    GRASS_FADE_M <= GROUND_LENGTH_M &&
    Math.min(lateralReachM, GRASS_LATERAL_LIMIT_M) <= GROUND_WIDTH_M / 2
  );
}
