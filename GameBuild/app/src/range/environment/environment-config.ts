// Pure data + math for the environment module (Stage 2 of
// Design/archive/test-range-environment-plan.md). No THREE/DOM — deterministic
// placement generation from a seed, so it's fully covered by node-env vitest
// (pattern: range-a-config.ts). terrain.ts/trees.ts/etc. consume this; they own
// all the THREE.* geometry/material/instancing.

/**
 * Injected clearance geometry — how a range decides where the ground must stay
 * flat and where vegetation may not stand (Stage 2b of
 * `Design/archive/mil-zero-range-plan.md`).
 *
 * The built-in model below is a SINGLE straight lane (`laneHalfWidthM` +
 * `zFlatToM`), which is all the Test Range needed. The Wooded Zero Range instead
 * has a FAN of corridors that each terminate just past their own target — the
 * property that lets woods close in behind each near station.
 *
 * Rather than teach this module about fans (and duplicate geometry that
 * `wooded-zero-config.ts` already implements and tests), a range may inject its
 * own predicates. The environment module stays generic and knows nothing about
 * either shape.
 *
 * When `clearance` is absent, everything behaves exactly as before.
 */
export interface TerrainClearance {
  /** Ground height along a cleared corridor at radius `r` from the shooter (m).
   *  This is what makes a raised firing point possible: the corridor floor
   *  descends from the knoll crest instead of being flat at 0. */
  floorY(r: number): number;
  /** Whether (x, z) is inside a cleared corridor — terrain flat, no vegetation.
   *  `inflateM` pads the corridor by a canopy radius so a trunk placed just
   *  outside the edge cannot lean back over a sight line. */
  insideCorridor(x: number, z: number, inflateM?: number): boolean;
  /** Radius around the shooter that stays clear of vegetation (m). */
  shooterClearM: number;
}

export interface EnvironmentConfig {
  seed: number;
  terrain: {
    /** Optional fan-of-corridors clearance model; see `TerrainClearance`. When
     *  set, it REPLACES `laneHalfWidthM`/`laneBlendM`/`zFlatToM`/`zBlendM`. */
    clearance?: TerrainClearance;
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
  /**
   * Aerial perspective (Stage 3, plan §9.5). `FogExp2`, not `THREE.Fog`.
   *
   * The linear fog this replaces is a smoothstep between `near` and `far`, and
   * the mountain ring at 1000–1350 m sat deep in its saturated tail — 75 % fog
   * colour at the near edge, 99.6 % at the far. That is why two rounds of
   * darkening the mountain texture produced no visible change: the rendered
   * pixel was almost pure fog colour regardless of albedo. Exponential-squared
   * falloff is gentle where it matters and never saturates, so distant geometry
   * keeps its own colour showing through the haze.
   *
   * `density` 7.45e-4 puts the 200 m target board at ~2 % fog (so board contrast,
   * plan §5.2, is untouched) and the ridge at 43–64 % (a real gradient).
   */
  fog: { colorHex: number; density: number };
  /**
   * Sun + sky fill (Stage 3, plan §9.1).
   *
   * `sunElevationDeg`/`sunAzimuthDeg` are stated as ANGLES, not a position
   * vector, because the angles are what the design reasoning is about — the
   * elevation has to stay low to rake the terrain, and the azimuth has to stay
   * BEHIND the firing line or every target board is lit edge-on. A raw
   * `position.set(x, y, z)` hides both constraints. Azimuth is measured from
   * downrange, + = right, so negative-and-past-90 is behind-left of the shooter.
   */
  lighting: {
    sunElevationDeg: number;
    sunAzimuthDeg: number;
    sunHex: number;
    sunIntensity: number;
    hemiSkyHex: number;
    hemiGroundHex: number;
    hemiIntensity: number;
    /** Near-field shadow map (plan §9.2). Omit to leave shadows off. */
    shadows?: {
      mapSize: number;
      /** Half-extent of the orthographic shadow frustum (m). Covers the near
       *  field only; past it the aerial perspective has taken over anyway. */
      extentM: number;
      /** Depth-buffer bias. At a 14° sun over near-flat ground this is the
       *  difference between grounded shadows and the whole lane striped with
       *  acne — and it must be tuned AT the final sun angle. */
      normalBias: number;
      bias: number;
    };
  };
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
  /**
   * Distant mountains as overlapping RIDGE SILHOUETTES (Stage 4b, plan §9.4),
   * replacing a ring of discrete instanced cones.
   *
   * Real distance reads as *overlapping silhouettes*, not as separate objects
   * you can count. A ring of cones gives the eye individual solids at a
   * measurable spacing, which reads as scenery props; two continuous ridgelines
   * at different depths, the far one paler, reads as landscape. It is also
   * cheaper — two strips of a couple of hundred triangles versus an instanced
   * cone mesh.
   */
  ridges: {
    /** Half-width of the arc the ridges span, in degrees either side of
     *  downrange. Wide enough that turning the scope never runs off the end. */
    halfArcDeg: number;
    /** Near-to-far. Later layers should be further, lower and paler. */
    layers: Array<{
      distanceM: number;
      heightMinM: number;
      heightMaxM: number;
      /** Flat silhouette colour. Unlit on purpose: at a kilometre-plus, shading
       *  detail is invisible and only gets in the way of aerial perspective
       *  doing the work. Fog then blends this toward the sky. */
      colorHex: number;
      /** Crest samples across the arc. ~80 is smooth at scope magnifications. */
      segments: number;
    }>;
  };
  /**
   * Wind-driven canopy sway (Stage 5, plan §9.6/§7.3). See `wind-sway.ts` — the
   * canopies read the same wind the bullet does, so movement is information
   * rather than decoration.
   */
  windSway: {
    /** Half-width (m) of the sampled field box, either side of the sight line. */
    halfWidthM: number;
    /** How far downrange (m) the sampled box reaches. */
    depthM: number;
    /** Height (m) at which the wind is sampled — canopy height, not ground. */
    sampleHeightM: number;
    /** Deflection per (m/s) per (height^2). Bend is quadratic in height above
     *  the trunk base, so crowns move and trunks do not. */
    bendScale: number;
    /** Hard cap on local deflection (m). Guards the corridor clearance: trees are
     *  placed with a canopy-radius margin off every sight line, and an
     *  unbounded bend at high wind could lean a crown into one. */
    maxBendM: number;
    /** Sway oscillation rate (rad/s) for the per-instance breathing term. */
    swayHz: number;
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

/**
 * Sun direction as a unit vector, from the scene origin toward the sun.
 *
 * Azimuth is measured from downrange (−z), positive to the right, so the world
 * mapping is `x = sin(az)`, `z = −cos(az)` in the horizontal plane.
 *
 * The sign of the resulting `z` is the thing worth checking when retuning:
 * **positive z means the sun is behind the firing line**, which is what keeps
 * target boards lit rather than silhouetted. Anything that puts the sun in front
 * of the shooter lights every board edge-on (plan §9.1).
 */
export function sunDirection(cfg: EnvironmentConfig): { x: number; y: number; z: number } {
  const el = (cfg.lighting.sunElevationDeg * Math.PI) / 180;
  const az = (cfg.lighting.sunAzimuthDeg * Math.PI) / 180;
  const horizontal = Math.cos(el);
  return { x: horizontal * Math.sin(az), y: Math.sin(el), z: -horizontal * Math.cos(az) };
}

/**
 * How directly a target board is lit, in [−1, 1]: the dot product of the sun
 * direction with a board's normal (which points back at the shooter, +z).
 * 1 = full-on, 0 = edge-on, negative = backlit.
 */
export function boardIllumination(cfg: EnvironmentConfig): number {
  return sunDirection(cfg).z;
}

/** Shadow length as a multiple of object height, at the configured sun
 *  elevation. Purely diagnostic — used to size the shadow frustum and to keep
 *  the tuning honest in tests. */
export function shadowLengthFactor(cfg: EnvironmentConfig): number {
  return 1 / Math.tan((cfg.lighting.sunElevationDeg * Math.PI) / 180);
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
  const { reliefAmpM: amp, hill, laneHalfWidthM, laneBlendM, zFlatToM, zBlendM, clearance } = cfg.terrain;

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

  // Injected fan-of-corridors model (Stage 2b). The corridor FLOOR is the base
  // height everywhere — radially symmetric, so the raised firing point exists
  // off the lanes too and there is no cliff at a corridor edge. Relief and hills
  // are then added only OUTSIDE the corridors, faded in across a short shoulder
  // so the transition isn't a crease.
  //
  // The floor is authoritative inside a corridor: `Design/archive/mil-zero-range-plan.md`
  // §2.2 proves the sight lines clear it, and those proofs assume exactly this
  // profile with nothing added on top.
  if (clearance) {
    const EDGE_BLEND_M = 4;
    return (x: number, z: number) => {
      const r = Math.hypot(x, z);
      const base = clearance.floorY(r);
      if (clearance.insideCorridor(x, z)) return base;
      // Distance-to-edge is approximated by probing the inflated predicate: if
      // the point is still clear when corridors are padded by the blend width,
      // it is at least that far out and gets full relief.
      const mask = clearance.insideCorridor(x, z, EDGE_BLEND_M) ? 0.5 : 1;
      return base + mask * (relief(x, z) + hillBump(x, z));
    };
  }

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
  clearance?: TerrainClearance,
  canopyRadiusM = 0,
): { x: number; z: number } | null {
  // Injected fan model (Stage 2b): reject against the real corridors instead of
  // a uniform |x| rule. `allowOnLane` is meaningless here — corridor TERMINATION
  // already lets vegetation sit behind a near target, correctly and
  // automatically, which is exactly the hack `allowOnLane` existed to fake.
  //
  // Returns null if no clear point was found: with a fan there is no safe
  // "push it sideways" fallback (sideways from one lane is into another), so the
  // caller drops the item rather than placing it on a sight line. A dropped tree
  // is invisible; a tree on a sight line is a bug you can shoot into.
  if (clearance) {
    for (let attempt = 0; attempt < 60; attempt++) {
      const band = bands[Math.floor(rand() * bands.length)];
      const x = band.xMin + rand() * (band.xMax - band.xMin);
      const z = band.zMin + rand() * (band.zMax - band.zMin);
      if (Math.hypot(x, z) < clearance.shooterClearM) continue;
      if (!clearance.insideCorridor(x, z, canopyRadiusM)) return { x, z };
    }
    return null;
  }

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

/** How many distinct canopy shapes exist per species (`trees.ts` builds this
 *  many merged geometries for each kind). Three is enough to break the eye's
 *  pattern detection without multiplying draw calls meaningfully. */
export const TREE_VARIANTS_PER_KIND = 3;

export interface TreePlacement {
  kind: 'conifer' | 'deciduous';
  x: number;
  z: number;
  y: number;
  /**
   * Uniform scale. Retained for compatibility and as the basis of the two axis
   * scales below; renderers should prefer `scaleXZ`/`scaleY`.
   */
  scale: number;
  /** Horizontal scale (canopy breadth). */
  scaleXZ: number;
  /**
   * Vertical scale, drawn INDEPENDENTLY of `scaleXZ`.
   *
   * Uniform-only scaling is the single biggest reason a procedural forest reads
   * as synthetic: every tree is provably the same object at a different size, and
   * the eye picks that up immediately. Letting height and breadth vary separately
   * produces spindly and squat trees from the same geometry.
   */
  scaleY: number;
  rotationY: number;
  /** Small lean off vertical (rad), about the X and Z axes. Real trees are not
   *  plumb; a few degrees is enough to kill the "planted by a script" look. */
  tiltX: number;
  tiltZ: number;
  /** Which canopy geometry to use — `0 .. TREE_VARIANTS_PER_KIND - 1`. */
  variantIndex: number;
  tintIndex: number;
}

/** Draws `coniferCount` + `deciduousCount` trees inside `cfg.trees.bands`,
 *  rejecting any point inside the lane's clear corridor. */
/** Canopy radius used to pad corridor rejection so a trunk placed just outside
 *  an edge cannot lean its canopy back over a sight line. Matches the widest
 *  canopy geometry in `trees.ts` (1.6 m) at the top of the scale range. */
export const TREE_CANOPY_RADIUS_M = 1.5;

export function generateTreePlacements(cfg: EnvironmentConfig): TreePlacement[] {
  const rand = mulberry32(cfg.seed);
  const sampler = makeTerrainSampler(cfg);
  const { bands, scaleRange, palette, coniferCount, deciduousCount } = cfg.trees;
  const { clearance } = cfg.terrain;
  const minAbsX = cfg.terrain.laneHalfWidthM + cfg.terrain.laneBlendM;

  /** Max lean off vertical (rad) — ~4°. */
  const MAX_TILT_RAD = 0.07;
  /** How far height and breadth may diverge from the base scale. */
  const ASPECT_SPREAD = 0.22;

  const placeOne = (kind: 'conifer' | 'deciduous'): TreePlacement | null => {
    const p = drawClearOfLane(rand, bands, minAbsX, clearance, TREE_CANOPY_RADIUS_M);
    if (!p) return null;
    const scale = scaleRange[0] + rand() * (scaleRange[1] - scaleRange[0]);
    // Height and breadth diverge in OPPOSITE directions from the base scale, so
    // a tree is either tall-and-narrow or short-and-broad rather than merely
    // bigger. Same silhouette budget, far more apparent variety.
    const aspect = (rand() * 2 - 1) * ASPECT_SPREAD;
    return {
      kind,
      x: p.x,
      z: p.z,
      y: sampler(p.x, p.z),
      scale,
      scaleXZ: scale * (1 - aspect),
      scaleY: scale * (1 + aspect),
      rotationY: rand() * Math.PI * 2,
      tiltX: (rand() * 2 - 1) * MAX_TILT_RAD,
      tiltZ: (rand() * 2 - 1) * MAX_TILT_RAD,
      variantIndex: Math.floor(rand() * TREE_VARIANTS_PER_KIND),
      tintIndex: Math.floor(rand() * palette.length),
    };
  };

  const placements: TreePlacement[] = [];
  for (let i = 0; i < coniferCount; i++) {
    const p = placeOne('conifer');
    if (p) placements.push(p);
  }
  for (let i = 0; i < deciduousCount; i++) {
    const p = placeOne('deciduous');
    if (p) placements.push(p);
  }
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
  const { clearance } = cfg.terrain;
  const minAbsX = cfg.terrain.laneHalfWidthM + cfg.terrain.laneBlendM;

  // Bushes/rocks are low, so they only need their own footprint of clearance,
  // not a tree's canopy radius.
  const BUSH_RADIUS_M = 0.8;
  const placeInBands = (): ScatterPlacement | null => {
    const p = drawClearOfLane(rand, bands, minAbsX, clearance, BUSH_RADIUS_M);
    if (!p) return null;
    return { x: p.x, z: p.z, y: sampler(p.x, p.z), scale: 0.6 + rand() * 0.8, rotationY: rand() * Math.PI * 2 };
  };
  const drawMany = (n: number): ScatterPlacement[] => {
    const out: ScatterPlacement[] = [];
    for (let i = 0; i < n; i++) {
      const p = placeInBands();
      if (p) out.push(p);
    }
    return out;
  };
  const bushes = drawMany(cfg.cover.bushCount);
  const rocks = drawMany(cfg.cover.rockCount);

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

/** One sampled point on a ridge crest, in world metres. */
export interface RidgePoint {
  x: number;
  y: number;
  z: number;
}

/** How far below the horizon a ridge strip is carried down (m). The ridges sit
 *  ~1 km out, well past the end of the terrain mesh, so their base has to reach
 *  below the eye's horizon or a sliver of sky shows underneath them. */
export const RIDGE_BASE_Y_M = -40;

/**
 * The crest polyline for one ridge layer — a 1-D profile swept across the arc at
 * a fixed distance.
 *
 * Height is a sum of sinusoids with seeded phases (the same trick the terrain
 * relief uses) rather than interpolated value noise: it is smooth by
 * construction, cheap, and has no sampling artefacts at the low segment counts a
 * distant silhouette needs. Octave frequencies are deliberately non-integer so
 * the profile never repeats across the arc.
 */
export function generateRidgeProfile(cfg: EnvironmentConfig, layerIndex: number): RidgePoint[] {
  const layer = cfg.ridges.layers[layerIndex];
  const rand = mulberry32(cfg.seed + 10 + layerIndex);
  const octaves = [
    { freq: 1.0, amp: 1.0 },
    { freq: 2.3, amp: 0.5 },
    { freq: 4.7, amp: 0.28 },
    { freq: 9.1, amp: 0.15 },
  ].map((o) => ({ ...o, phase: rand() * Math.PI * 2 }));
  const ampTotal = octaves.reduce((s, o) => s + o.amp, 0);

  const halfArc = (cfg.ridges.halfArcDeg * Math.PI) / 180;
  const points: RidgePoint[] = [];
  for (let i = 0; i < layer.segments; i++) {
    const t = i / (layer.segments - 1);
    let sum = 0;
    for (const o of octaves) sum += o.amp * Math.sin(o.freq * t * Math.PI * 2 + o.phase);
    const n = (sum / ampTotal + 1) / 2; // -> [0, 1]
    const azimuth = -halfArc + t * 2 * halfArc;
    points.push({
      x: layer.distanceM * Math.sin(azimuth),
      y: layer.heightMinM + n * (layer.heightMaxM - layer.heightMinM),
      z: -layer.distanceM * Math.cos(azimuth),
    });
  }
  return points;
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
