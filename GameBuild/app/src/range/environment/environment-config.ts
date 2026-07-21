// Pure data + math for the environment module (Stage 2 of
// Design/Plans/test-range-environment-plan.md). No THREE/DOM — deterministic
// placement generation from a seed, so it's fully covered by node-env vitest
// (pattern: range-a-config.ts). terrain.ts/trees.ts/etc. consume this; they own
// all the THREE.* geometry/material/instancing.

export interface EnvironmentConfig {
  seed: number;
  terrain: {
    /** Total ground extent, centred on x=0, z ∈ [0, −lengthM]. */
    widthM: number;
    lengthM: number;
    /** Corridor where height ≡ 0 (the shot lane). */
    laneHalfWidthM: number;
    /** Smoothstep shoulder width blending the corridor into the relief. */
    laneBlendM: number;
    /** How far downrange (metres, positive) the corridor stays flat regardless
     *  of x — keeps the shooter-to-target line and the rack/gong footing flat.
     *  Beyond this, relief is allowed even directly on the sight line (x=0),
     *  so a hill/backdrop can sit visibly straight ahead instead of only off
     *  to the sides. */
    zFlatToM: number;
    /** Smoothstep shoulder (metres) unlocking relief past `zFlatToM`. */
    zBlendM: number;
    /** Rolling-relief amplitude. */
    reliefAmpM: number;
    hill: { xM: number; zM: number; radiusM: number; heightM: number };
  };
  sky: { horizonHex: number; midHex: number; zenithHex: number; domeRadiusM: number };
  fog: { colorHex: number; nearM: number; farM: number };
  trees: {
    coniferCount: number;
    deciduousCount: number;
    bands: Array<{ xMin: number; xMax: number; zMin: number; zMax: number; allowOnLane?: boolean }>;
    scaleRange: [number, number];
    /** Canopy tint hexes. */
    palette: number[];
  };
  cover: {
    bushCount: number;
    rockCount: number;
    grassTuftCount: number;
    grassZoneM: number;
    /** Radius (metres, from the shooter at x=0,z=0) inside which no grass
     *  tuft is allowed. Needs to be generous, not precise — at any scope
     *  magnification, a tuft a few metres from the eye fills the whole sight
     *  picture and hides the target entirely (owner feedback 2026-07-21:
     *  "nothing in the view of the target"). */
    shooterClearM: number;
  };
  mountains: {
    count: number;
    distMinM: number;
    distMaxM: number;
    heightMinM: number;
    heightMaxM: number;
    widthToHeight: number;
  };
  clouds: {
    count: number;
    heightMinM: number;
    heightMaxM: number;
    fieldHalfWidthM: number;
    fieldZNearM: number;
    fieldZFarM: number;
    baseSizeM: number;
    fadeMarginM: number;
  };
}

/** Standard mulberry32 32-bit PRNG — deterministic, fast, good enough spread
 *  for placement scatter (not cryptographic). */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function smoothstep(edge0: number, edge1: number, t: number): number {
  const x = Math.min(1, Math.max(0, (t - edge0) / (edge1 - edge0)));
  return x * x * (3 - 2 * x);
}

/** Terrain height at world (x, z), metres. Flat (EXACTLY 0, by construction)
 *  inside the shooter-to-target box: `|x| <= laneHalfWidthM` AND `|z| <=
 *  zFlatToM`. Outside that box — off to the sides (as before) OR straight
 *  ahead past `zFlatToM` (so hills/backdrop read directly behind the target,
 *  not just to the sides) — relief is unlocked. terrain.ts, the tree/scatter
 *  placements, and the sight line all share this one sampler. */
export function makeTerrainSampler(cfg: EnvironmentConfig): (x: number, z: number) => number {
  const { reliefAmpM: amp, hill, laneHalfWidthM, laneBlendM, zFlatToM, zBlendM } = cfg.terrain;

  // BTK environment.js:955-967, rescaled to metres.
  const relief = (x: number, z: number) =>
    Math.sin(x * 0.045) * Math.cos(z * 0.045) * 0.45 * amp +
    Math.sin(x * 0.11 + 1.5) * Math.cos(z * 0.11 + 2.3) * 0.3 * amp +
    Math.sin(x * 0.23 + 3.7) * Math.cos(z * 0.23 + 4.2) * 0.25 * amp;

  const hillBump = (x: number, z: number) => {
    const dx = x - hill.xM;
    const dz = z - hill.zM;
    return hill.heightM * Math.exp(-(dx * dx + dz * dz) / (hill.radiusM * hill.radiusM));
  };

  const xMask = (x: number) => smoothstep(laneHalfWidthM, laneHalfWidthM + laneBlendM, Math.abs(x));
  const zMask = (z: number) => smoothstep(zFlatToM, zFlatToM + zBlendM, Math.abs(z));

  return (x: number, z: number) => Math.max(xMask(x), zMask(z)) * (relief(x, z) + hillBump(x, z));
}

interface Band {
  xMin: number;
  xMax: number;
  zMin: number;
  zMax: number;
  /** Skips the lane x-clearance rejection for this band. Only safe for a
   *  band that sits entirely well behind the target (z more negative than
   *  the target plus a buffer) — the uniform `minAbsX` clearance rule
   *  otherwise keeps ALL vegetation at least `minAbsX` off-axis everywhere,
   *  which reads as "nothing behind the target" through a centred scope
   *  (owner feedback 2026-07-21 round 2: "still nothing behind the target or
   *  in range of the scope, have to scroll around to find anything") — a
   *  tree at a given x-offset subtends a LARGER angle from the sight line
   *  the closer it is, so this band must stay a good distance downrange to
   *  read as a backdrop instead of a close, off-centre wall. */
  allowOnLane?: boolean;
}

/** Draws a point inside one of `bands`, retrying (bounded) until it clears
 *  `minAbsX` — belt + suspenders alongside the lane-mask-is-zero-in-corridor
 *  guarantee, since a tree/bush/rock must never render ON the flat lane.
 *  Bands flagged `allowOnLane` are exempt: they're trusted to sit safely
 *  behind the target, so a point drawn there is accepted immediately. */
function drawClearOfLane(
  rand: () => number,
  bands: readonly Band[],
  minAbsX: number,
): { x: number; z: number } {
  let x = 0;
  let z = 0;
  let allowed = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    const band = bands[Math.floor(rand() * bands.length)];
    x = band.xMin + rand() * (band.xMax - band.xMin);
    z = band.zMin + rand() * (band.zMax - band.zMin);
    allowed = !!band.allowOnLane;
    if (allowed || Math.abs(x) >= minAbsX) break;
  }
  if (!allowed && Math.abs(x) < minAbsX) x = x < 0 ? -minAbsX : minAbsX; // pathological-PRNG safety net
  return { x, z };
}

export interface TreePlacement {
  kind: 'conifer' | 'deciduous';
  x: number;
  z: number;
  y: number;
  scale: number;
  rotationY: number;
  tintIndex: number;
}

/** Draws `coniferCount` + `deciduousCount` trees inside `cfg.trees.bands`,
 *  rejecting any point inside the lane's clear corridor. */
export function generateTreePlacements(cfg: EnvironmentConfig): TreePlacement[] {
  const rand = mulberry32(cfg.seed);
  const sampler = makeTerrainSampler(cfg);
  const { bands, scaleRange, palette, coniferCount, deciduousCount } = cfg.trees;
  const minAbsX = cfg.terrain.laneHalfWidthM + cfg.terrain.laneBlendM;

  const placeOne = (kind: 'conifer' | 'deciduous'): TreePlacement => {
    const { x, z } = drawClearOfLane(rand, bands, minAbsX);
    return {
      kind,
      x,
      z,
      y: sampler(x, z),
      scale: scaleRange[0] + rand() * (scaleRange[1] - scaleRange[0]),
      rotationY: rand() * Math.PI * 2,
      tintIndex: Math.floor(rand() * palette.length),
    };
  };

  const placements: TreePlacement[] = [];
  for (let i = 0; i < coniferCount; i++) placements.push(placeOne('conifer'));
  for (let i = 0; i < deciduousCount; i++) placements.push(placeOne('deciduous'));
  return placements;
}

export interface ScatterPlacement {
  x: number;
  z: number;
  y: number;
  scale: number;
  rotationY: number;
}

export interface ScatterPlacements {
  bushes: ScatterPlacement[];
  rocks: ScatterPlacement[];
  grassTufts: ScatterPlacement[];
}

/** Bushes/rocks scatter in the same bands as the trees (lane-clear, same
 *  rejection rule); grass tufts are the one thing allowed IN the lane, near
 *  the shooter (`z ∈ [0, −grassZoneM]`), outside a `shooterClearM` radius —
 *  generous, not precise, since up close ANY tuft can fill the whole sight
 *  picture at higher scope magnification. */
export function generateScatterPlacements(cfg: EnvironmentConfig): ScatterPlacements {
  const rand = mulberry32(cfg.seed + 1); // distinct stream from the trees
  const sampler = makeTerrainSampler(cfg);
  const { bands } = cfg.trees;
  const minAbsX = cfg.terrain.laneHalfWidthM + cfg.terrain.laneBlendM;

  const placeInBands = (): ScatterPlacement => {
    const { x, z } = drawClearOfLane(rand, bands, minAbsX);
    return { x, z, y: sampler(x, z), scale: 0.6 + rand() * 0.8, rotationY: rand() * Math.PI * 2 };
  };
  const bushes = Array.from({ length: cfg.cover.bushCount }, placeInBands);
  const rocks = Array.from({ length: cfg.cover.rockCount }, placeInBands);

  const SHOOTER_CLEAR_M = cfg.cover.shooterClearM;
  const { laneHalfWidthM } = cfg.terrain;
  const { grassZoneM, grassTuftCount } = cfg.cover;
  const grassTufts: ScatterPlacement[] = [];
  for (let i = 0; i < grassTuftCount; i++) {
    let x = 0;
    let z = 0;
    for (let attempt = 0; attempt < 50; attempt++) {
      x = (rand() * 2 - 1) * laneHalfWidthM;
      z = -rand() * grassZoneM;
      if (Math.hypot(x, z) >= SHOOTER_CLEAR_M) break;
    }
    // Pathological-PRNG safety net (mirrors drawClearOfLane's): push straight
    // down-range, which always clears the shooter regardless of x since
    // hypot(x, -SHOOTER_CLEAR_M) >= SHOOTER_CLEAR_M for any x.
    if (Math.hypot(x, z) < SHOOTER_CLEAR_M) z = -SHOOTER_CLEAR_M;
    grassTufts.push({ x, z, y: sampler(x, z), scale: 0.7 + rand() * 0.7, rotationY: rand() * Math.PI * 2 });
  }

  return { bushes, rocks, grassTufts };
}

export interface MountainPlacement {
  x: number;
  z: number;
  height: number;
  radius: number;
  rotationY: number;
}

/** A ring across the back of the range: z drawn straight from
 *  `[−distMaxM, −distMinM]` (so every peak clears `distMinM`, independent of
 *  x), x fanned across `±distMaxM * 0.8`. */
export function generateMountainPlacements(cfg: EnvironmentConfig): MountainPlacement[] {
  const rand = mulberry32(cfg.seed + 2);
  const { count, distMinM, distMaxM, heightMinM, heightMaxM, widthToHeight } = cfg.mountains;
  const placements: MountainPlacement[] = [];
  for (let i = 0; i < count; i++) {
    const z = -(distMinM + rand() * (distMaxM - distMinM));
    const x = (rand() * 2 - 1) * distMaxM * 0.8;
    const height = heightMinM + rand() * (heightMaxM - heightMinM);
    placements.push({ x, z, height, radius: height * widthToHeight, rotationY: rand() * Math.PI * 2 });
  }
  return placements;
}

export interface CloudPlacement {
  x: number;
  y: number;
  z: number;
  sizeM: number;
  seed: number;
  driftFactor: number;
}

/** Uniform in the cloud field box; `driftFactor` (0.8-1.2) is per-cloud so a
 *  drifting field doesn't look like one rigid sheet (Stage 4 wires the drift). */
export function generateCloudPlacements(cfg: EnvironmentConfig): CloudPlacement[] {
  const rand = mulberry32(cfg.seed + 3);
  const { count, heightMinM, heightMaxM, fieldHalfWidthM, fieldZNearM, fieldZFarM, baseSizeM } = cfg.clouds;
  const placements: CloudPlacement[] = [];
  for (let i = 0; i < count; i++) {
    placements.push({
      x: (rand() * 2 - 1) * fieldHalfWidthM,
      y: heightMinM + rand() * (heightMaxM - heightMinM),
      z: fieldZNearM + rand() * (fieldZFarM - fieldZNearM),
      sizeM: baseSizeM * (0.7 + rand() * 0.6),
      seed: rand() * 1000,
      driftFactor: 0.8 + rand() * 0.4,
    });
  }
  return placements;
}

export interface CloudField {
  centerX: number;
  halfWidthM: number;
  centerZ: number;
  halfLengthM: number;
}

/** Derives the toroidal wrap box clouds drift within from `cfg.clouds` —
 *  shared by placement generation (implicitly, via fieldZNearM/fieldZFarM)
 *  and the Stage-4 per-frame drift/wrap/fade update, so both agree on the
 *  same box without duplicating the near/far → center/half conversion. */
export function getCloudField(cfg: EnvironmentConfig): CloudField {
  const { fieldHalfWidthM, fieldZNearM, fieldZFarM } = cfg.clouds;
  return {
    centerX: 0,
    halfWidthM: fieldHalfWidthM,
    centerZ: (fieldZNearM + fieldZFarM) / 2,
    halfLengthM: (fieldZNearM - fieldZFarM) / 2,
  };
}

/** Wraps `value` into `[center - half, center + half]` — BTK
 *  environment.js's `wrapToField`, ported verbatim (a toroidal field so a
 *  cloud drifting past one edge re-enters the opposite one instead of
 *  permanently leaving the sky). */
export function wrapToField(value: number, center: number, half: number): number {
  const min = center - half;
  const span = 2 * half;
  const d = value - min;
  return ((d % span) + span) % span + min;
}

/** Opacity in [0,1] that fades to 0 within `marginM` of the field's edges, so
 *  a wrapping cloud eases out before it teleports and eases back in on the
 *  opposite side instead of popping — BTK environment.js's `cloudEdgeOpacity`,
 *  ported verbatim. */
export function cloudEdgeOpacity(x: number, z: number, field: CloudField, marginM: number): number {
  const dx = field.halfWidthM - Math.abs(x - field.centerX);
  const dz = field.halfLengthM - Math.abs(z - field.centerZ);
  const ox = Math.min(1, Math.max(0, dx / marginM));
  const oz = Math.min(1, Math.max(0, dz / marginM));
  return ox * oz;
}
