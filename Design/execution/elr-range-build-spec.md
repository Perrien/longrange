# ELR Range — Build Spec

**Audience:** the agent or developer building the range. This document tells you
*what to do*, not *why*. Design rationale lives in
[`../elr-dope-range-plan.md`](../elr-dope-range-plan.md); you should not need it, but
section references are given if you want it.

**Working directory for every command in this document:** `GameBuild/app`

---

## RULES — read once, follow throughout

1. **Do one task at a time, in order. STOP at the end of each task.** Do not start the
   next task until the current one's "Done when" checks all pass.
2. **Never modify anything under `BallisticsToolkit/`.** It is a read-only reference.
3. **Never modify `GameBuild/validation/vectors/golden.json`.** If a golden-vector
   check fails, you have broken the engine — fix the code, not the vectors.
4. **Never change existing behaviour of `range-a`, `test-range`, or `wooded-zero`.**
   Several tasks add optional fields; optional means existing ranges omit them and are
   provably unaffected. There are already tests asserting this — keep them passing.
5. **Every task adds tests.** A task is not done because the code compiles.
6. **Do not delete or rewrite `elr-probe-config.ts`, `elr-probe-trees.ts`, or
   `ELRProbeScene.ts`.** They are the working reference implementation. You will copy
   patterns from them. The probe gets deleted later, by someone else.
7. **If a "Done when" check fails and you cannot fix it in two attempts, STOP and
   report.** Do not loosen a test, widen a tolerance, or skip a check.
8. **Units are SI metres everywhere in code.** Only display strings use yards.
9. **Coordinate convention:** `x` = crossrange (+ right), `y` = up, `z` = **negative**
   downrange. A target 500 m downrange is at `z = -500`.
10. **NEVER run any `git` command.** Not `commit`, `add`, `branch`, `checkout`, `stash`,
    `reset`, `revert`, `clean`, `merge` or `push`. Version control is handled by the
    owner, outside this document. Leave your work uncommitted in the working tree; that
    is what is wanted. If you think a task requires a git command, you have misread it.
11. **"COMMIT" in this document never means git.** It is the in-game button that engages
    a target before firing (Tasks 8 and 9). There is no version-control step anywhere in
    this spec.
12. **Do not delete or rename files** unless a task says to. Do not "tidy up" code you
    did not write.

### What STOP means

At every **STOP**, do all of this and then wait:

1. Run the task's "Done when" checks and paste the actual output — not a summary.
2. State the test total, and the previous total, so the owner can see it went up.
3. List every file you created or changed.
4. Report anything that surprised you, even if you worked around it.
5. **Wait for the owner to say continue.** They will handle version control between
   tasks. Do not begin the next task.

### Commands you will use

| purpose | command | expected |
|---|---|---|
| typecheck | `npx tsc --noEmit` | no output |
| unit tests | `npx vitest run` | all pass, count ≥ previous |
| one test file | `npx vitest run src/range/FILE.test.ts` | all pass |
| production build | `npm run build` | ends with `dist/...` file list |
| engine oracle | `node ../validation/run.mjs` | `worst rel diff 0.000e+0` … `PASSED` |

**Baseline at the time of writing: 751 tests across 55 files, all passing.** If you
start and that is not true, STOP and report.

**Record the total after every task.** The count must go UP at each step and never down.
A count that drops means a test was deleted or silently skipped — that is a failure even
if the suite reports green.

---

## What already exists (do not rebuild these)

| thing | file | what you use from it |
|---|---|---|
| sight-line clearance + offset search | `src/range/sight-clearance.ts` | `prepareOccluders`, `chooseOffset`, `offsetCandidates`, `occludingTreeIndices` |
| tree rendering | `src/range/environment/trees.ts` | `buildTrees`, `treeUnitBounds` |
| tree palette / config | `src/range/wooded-zero-environment.ts` | `WOODED_ZERO_ENVIRONMENT` |
| deterministic RNG | `src/range/environment/environment-config.ts` | `mulberry32`, `TreePlacement`, `TREE_VARIANTS_PER_KIND` |
| plate geometry + paint | `src/range/plate-geometry.ts`, `src/range/plate-surface.ts` | `createPlateDiscGeometry`, `createPlateSurface`, `createPlateMaterial` |
| bullseye texture | `src/range/bullseye-texture.ts` | `buildBullseyeLayer` |
| steel scene contract | `src/range/steel-scene-api.ts` | `SteelSceneApi` interface |
| range registry | `src/range/ranges.ts` | `RangeDefinition`, `cameraReachFor`, `shotBudgetFor` |
| chains / signs | `src/range/RangeScene.ts` | `setChainInstance`, `PLATE_THICKNESS_M`, `makeSignTexture`, `PlateInstance` |

**Reference implementation to copy patterns from:** `src/range/ELRProbeScene.ts` and
`src/range/elr-probe-config.ts`. They already do terrain displacement, constant-angular
gongs, frames, panels, chains and signs correctly.

---

## Task list

| # | task | new files | gate |
|---|---|---|---|
| 1 | Plate-scaled clearance margin | — | tests |
| 2 | Range config module | `elr-range-config.ts` | tests |
| 3 | Tree field | `elr-range-trees.ts` | tests |
| 4 | Station solving per firing point | — | tests |
| 5 | Registry row | — | tests |
| 6 | Scene: terrain + forest | `ELRRangeScene.ts` | tests + on device |
| 7 | Scene: targets | — | on device |
| 8 | ScopeView wiring | — | on device |
| 9 | Firing-point switching | — | on device |
| 10 | Mach-state marking | — | on device |
| 11 | Wind markers | — | on device |
| 12 | Catalog entries | — | on device |

**Out of scope for this document:** the scope elevation-travel model. It is a separate
prerequisite (plan §5.4) and is specced elsewhere.

---

# Task 1 — Plate-scaled clearance margin

**Goal.** The clearance margin is currently a flat 2.0 m at every distance. At 50 m a
1 MIL gong is 5 cm, so 2 m demands a corridor forty times the plate. Make the margin
scale with the plate, with a floor.

**File:** `src/range/sight-clearance.ts` (edit), `src/range/sight-clearance.test.ts` (edit)

### Steps

1. In `sight-clearance.ts`, **keep** `DEFAULT_MARGIN_M = 2.0` exactly as it is. Other
   code uses it and existing tests assert against it.

2. Add these exports **below** `DEFAULT_MARGIN_M`:

```ts
/** Minimum clearance regardless of plate size (m). */
export const MIN_MARGIN_M = 0.5;

/** Margin as a multiple of the plate's radius. */
export const MARGIN_PLATE_RADII = 2;

/**
 * Clearance margin for a plate of radius `radiusM`.
 * Scales with the plate, floored so tiny near plates still get real air around them.
 */
export function marginForPlate(radiusM: number): number {
  return Math.max(MIN_MARGIN_M, MARGIN_PLATE_RADII * radiusM);
}
```

3. Do **not** change any existing function signature. `marginForPlate` is called by the
   caller, which then passes the result as the existing `marginM` argument.

### Tests to add

Append to `src/range/sight-clearance.test.ts`:

```ts
describe('marginForPlate', () => {
  it('scales with the plate above the floor', () => {
    expect(marginForPlate(1.0)).toBeCloseTo(2.0, 9);   // 2000 m gong
    expect(marginForPlate(0.5)).toBeCloseTo(1.0, 9);   // 1000 m gong
  });

  it('applies the floor to small near plates', () => {
    expect(marginForPlate(0.025)).toBeCloseTo(0.5, 9); // 50 m gong, 5 cm across
    expect(marginForPlate(0)).toBeCloseTo(0.5, 9);
  });

  it('never returns less than the floor, for any radius', () => {
    for (const r of [0, 0.001, 0.1, 1, 5]) {
      expect(marginForPlate(r)).toBeGreaterThanOrEqual(MIN_MARGIN_M);
    }
  });
});
```

Add `marginForPlate`, `MIN_MARGIN_M`, `MARGIN_PLATE_RADII` to the existing import block
at the top of that test file.

### Done when

- [ ] `npx vitest run src/range/sight-clearance.test.ts` — all pass, 3 new tests
- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — every test passes, and the total is STRICTLY GREATER than before this task

**STOP.**

---

# Task 2 — Range config module

**Goal.** One pure module holding every constant and derived value for the range. No
THREE.js, no DOM, no rendering — so it is fully unit-testable.

**New file:** `src/range/elr-range-config.ts`
**New file:** `src/range/elr-range-config.test.ts`

### Steps

1. Create `src/range/elr-range-config.ts` with exactly these exports:

```ts
/** Firing point identity. */
export type FiringPoint = 'low' | 'high';

// --- terrain ---------------------------------------------------------------
/** Ground extent, centred on x = 0, spanning z ∈ [0, −GROUND_LENGTH_M]. */
export const GROUND_WIDTH_M = 1400;
export const GROUND_LENGTH_M = 2300;
/** Total rise of the convex slope over SLOPE_SPAN_M. */
export const SLOPE_RISE_M = 140;
export const SLOPE_SPAN_M = 2100;
export const GROUND_HEX = 0x6d7355;

/** Convex ground profile. r is downrange distance in metres, POSITIVE. */
export function groundY(r: number): number {
  const t = Math.min(1, Math.max(0, r / SLOPE_SPAN_M));
  return SLOPE_RISE_M * t * t;
}

// --- firing points ---------------------------------------------------------
export const EYE_ABOVE_GROUND_M = 1.7;
/** How far the high line stands above local ground (m). */
export const HIGH_LINE_PLATFORM_M = 8;

/** Eye height above the world datum for a firing point (m). */
export function eyeYFor(point: FiringPoint): number {
  return (point === 'high' ? HIGH_LINE_PLATFORM_M : 0) + EYE_ABOVE_GROUND_M;
}

// --- ladders ---------------------------------------------------------------
/** Rimfire ladder, shot from the low line (m). */
export const LOW_STATIONS_M = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500] as const;
/** Centrefire ladder, shot from the high line (m). */
export const HIGH_STATIONS_M = [250, 500, 750, 1000, 1250, 1500, 1750, 2000] as const;

export function stationsFor(point: FiringPoint): readonly number[] {
  return point === 'low' ? LOW_STATIONS_M : HIGH_STATIONS_M;
}

// --- targets ---------------------------------------------------------------
/** Gongs are constant-angular: 1 MIL. Diameter (m) = losRangeM / 1000. */
export const GONG_ANGULAR_SIZE_RAD = 1e-3;
export const FRAME_WIDTH_MULTIPLE = 1.5;
export const FRAME_HEIGHT_MULTIPLE = 2.0;
export const FRAME_GROUND_CLEARANCE_M = 0.3;
export const TARGET_CENTER_Y_M = 1.0;
export const PLATE_HEX = 0xf2efe6;
export const RING_HEX = 0x2f6fd0;
export const PANEL_HEX = 0x2a2a28;
export const RING_FRACTIONS = { centre: 1 / 3, middle: 2 / 3, outer: 1 } as const;

/** Target centre height ABOVE LOCAL GROUND, so the frame's bottom edge clears it. */
export function targetCenterAboveGroundM(gongDiameterM: number): number {
  const frameHalfHeight = (gongDiameterM * FRAME_HEIGHT_MULTIPLE) / 2;
  return Math.max(TARGET_CENTER_Y_M, frameHalfHeight + FRAME_GROUND_CLEARANCE_M);
}

// --- placement search ------------------------------------------------------
/** Lateral offset cap, ANGULAR. 35 mrad = 9 m at 250 m, 70 m at 2000 m.
 *  Measured across 8 forest seeds: 25 mrad leaves too many stations blocked on the
 *  low line; 35 brings the residual cull down to a handful of trees. */
export const OFFSET_CAP_MRAD = 35;
/** Candidate offsets evaluated per station. */
export const OFFSET_SAMPLES = 61;
/** Trees are excluded within this radius of either firing point (m). */
export const FIRING_POINT_CLEAR_RADIUS_M = 30;

// --- scene -----------------------------------------------------------------
export const FOG_DENSITY = 1.7e-4;
export const SKY_HEX = 0xdfe3e8;
export const CAMERA_NEAR_M = 10;
export const CAMERA_FAR_M = 12000;
```

2. **Do not** add a station type or a layout builder yet. That is Task 4.

### Tests to add

Create `src/range/elr-range-config.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  groundY, eyeYFor, stationsFor, targetCenterAboveGroundM,
  LOW_STATIONS_M, HIGH_STATIONS_M, SLOPE_RISE_M, SLOPE_SPAN_M,
  TARGET_CENTER_Y_M, FRAME_GROUND_CLEARANCE_M, GROUND_LENGTH_M,
} from './elr-range-config';

describe('groundY', () => {
  it('starts at zero and rises to the full rise at the span', () => {
    expect(groundY(0)).toBeCloseTo(0, 9);
    expect(groundY(SLOPE_SPAN_M)).toBeCloseTo(SLOPE_RISE_M, 9);
  });

  it('clamps outside the span rather than running away', () => {
    expect(groundY(-500)).toBeCloseTo(0, 9);
    expect(groundY(SLOPE_SPAN_M * 3)).toBeCloseTo(SLOPE_RISE_M, 9);
  });

  it('is CONVEX — the chord lies above the curve', () => {
    // This is the property that gives sight-line clearance. If it ever became
    // linear or concave, far targets would sit behind intervening ground.
    for (const [a, b] of [[200, 1000], [500, 1500], [1000, 2000]]) {
      const mid = (a + b) / 2;
      const chordAtMid = (groundY(a) + groundY(b)) / 2;
      expect(chordAtMid).toBeGreaterThan(groundY(mid));
    }
  });

  it('rises monotonically', () => {
    let prev = -Infinity;
    for (let r = 0; r <= SLOPE_SPAN_M; r += 50) {
      expect(groundY(r)).toBeGreaterThanOrEqual(prev);
      prev = groundY(r);
    }
  });
});

describe('firing points', () => {
  it('puts the high line above the low line', () => {
    expect(eyeYFor('high')).toBeGreaterThan(eyeYFor('low'));
  });

  it('puts the low line at standing/prone eye height', () => {
    expect(eyeYFor('low')).toBeCloseTo(1.7, 9);
  });
});

describe('ladders', () => {
  it('gives the low line 10 stations at 50 m steps to 500', () => {
    expect(stationsFor('low')).toEqual([50, 100, 150, 200, 250, 300, 350, 400, 450, 500]);
  });

  it('gives the high line 8 stations at 250 m steps to 2000', () => {
    expect(stationsFor('high')).toEqual([250, 500, 750, 1000, 1250, 1500, 1750, 2000]);
  });

  it('shares the 250 m station between both lines', () => {
    expect(LOW_STATIONS_M).toContain(250);
    expect(HIGH_STATIONS_M).toContain(250);
  });

  it('keeps every station inside the drawn ground', () => {
    for (const d of [...LOW_STATIONS_M, ...HIGH_STATIONS_M]) {
      expect(d).toBeLessThanOrEqual(GROUND_LENGTH_M);
    }
  });
});

describe('targetCenterAboveGroundM', () => {
  it('uses the standard height for small near gongs', () => {
    expect(targetCenterAboveGroundM(0.05)).toBeCloseTo(TARGET_CENTER_Y_M, 9);
  });

  it('raises big far gongs so the frame bottom stays clear of the ground', () => {
    const gong = 2.0; // 2000 m station
    const centre = targetCenterAboveGroundM(gong);
    const frameBottom = centre - (gong * 2.0) / 2;
    expect(frameBottom).toBeGreaterThanOrEqual(FRAME_GROUND_CLEARANCE_M - 1e-9);
  });

  it('never returns less than the standard height', () => {
    for (const d of [0.01, 0.05, 0.5, 1, 2]) {
      expect(targetCenterAboveGroundM(d)).toBeGreaterThanOrEqual(TARGET_CENTER_Y_M);
    }
  });
});
```

### Done when

- [ ] `npx vitest run src/range/elr-range-config.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — every test passes, and the total is STRICTLY GREATER than before this task

**STOP.**

---

# Task 3 — Tree field

**Goal.** A deterministic forest across the range's ground, generated once at full
density. Every smaller count must be a prefix of it.

**New file:** `src/range/elr-range-trees.ts`
**New file:** `src/range/elr-range-trees.test.ts`

### Steps

1. Create `src/range/elr-range-trees.ts`. Copy the structure of
   `src/range/elr-probe-trees.ts` and change what the comments below say.

```ts
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
```

> **Common mistake.** `y: groundY(-z)` — `z` is negative downrange, `groundY` takes a
> positive distance. Writing `groundY(z)` puts every tree at ground height 0 and the
> forest floats or sinks on the slope.

### Tests to add

Create `src/range/elr-range-trees.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import {
  generateRangeTreePlacements, isPlaceable, MAX_TREES, TREE_SEED,
} from './elr-range-trees';
import {
  groundY, GROUND_WIDTH_M, GROUND_LENGTH_M, FIRING_POINT_CLEAR_RADIUS_M,
} from './elr-range-config';
import { TREE_VARIANTS_PER_KIND } from './environment/environment-config';

describe('generateRangeTreePlacements', () => {
  it('returns exactly the requested count', () => {
    for (const n of [0, 250, 1000, MAX_TREES]) {
      expect(generateRangeTreePlacements(n, 4)).toHaveLength(n);
    }
  });

  it('is deterministic across calls', () => {
    expect(generateRangeTreePlacements(500, 4)).toEqual(generateRangeTreePlacements(500, 4));
  });

  // LOAD-BEARING: offsets are solved against the full field, so every smaller
  // draw count must be a strict prefix or targets end up behind trees.
  it('makes every smaller count a prefix of the full field', () => {
    const full = generateRangeTreePlacements(MAX_TREES, 4);
    for (const n of [250, 500, 1000, 2000]) {
      expect(full.slice(0, n)).toEqual(generateRangeTreePlacements(n, 4));
    }
  });

  it('stands every tree ON the convex ground, not on a flat plane', () => {
    const trees = generateRangeTreePlacements(1000, 4);
    for (const t of trees) expect(t.y).toBeCloseTo(groundY(-t.z), 9);
    const ys = trees.map((t) => t.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeGreaterThan(10);
  });

  it('keeps the firing points clear and puts trees everywhere else', () => {
    const trees = generateRangeTreePlacements(2000, 4);
    for (const t of trees) {
      expect(Math.hypot(t.x, t.z)).toBeGreaterThanOrEqual(FIRING_POINT_CLEAR_RADIUS_M);
    }
    // There is NO cleared lane — prove the centre is populated.
    expect(trees.some((t) => Math.abs(t.x) < 20)).toBe(true);
  });

  it('stays inside the drawn ground', () => {
    for (const t of generateRangeTreePlacements(2000, 4)) {
      expect(Math.abs(t.x)).toBeLessThanOrEqual(GROUND_WIDTH_M / 2);
      expect(t.z).toBeLessThanOrEqual(0);
      expect(t.z).toBeGreaterThanOrEqual(-GROUND_LENGTH_M);
    }
  });

  it('emits indices the renderer can use', () => {
    for (const t of generateRangeTreePlacements(500, 4)) {
      expect(t.variantIndex).toBeGreaterThanOrEqual(0);
      expect(t.variantIndex).toBeLessThan(TREE_VARIANTS_PER_KIND);
      expect(t.tintIndex).toBeGreaterThanOrEqual(0);
      expect(t.tintIndex).toBeLessThan(4);
      expect(t.scaleXZ).toBeGreaterThan(0);
      expect(t.scaleY).toBeGreaterThan(0);
    }
  });

  it('pins the seed, so the range is the same on every device', () => {
    expect(TREE_SEED).toBe(20260728);
  });
});

describe('isPlaceable', () => {
  it('rejects the firing-point ring and accepts the sight line', () => {
    expect(isPlaceable(0, -(FIRING_POINT_CLEAR_RADIUS_M - 1))).toBe(false);
    expect(isPlaceable(0, -(FIRING_POINT_CLEAR_RADIUS_M + 1))).toBe(true);
    expect(isPlaceable(0, -1000)).toBe(true);
  });
});
```

### Done when

- [ ] `npx vitest run src/range/elr-range-trees.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — every test passes, and the total is STRICTLY GREATER than before this task

**STOP.**

---

# Task 4 — Station solving per firing point

**Goal.** Turn a firing point plus the tree field into a list of placed stations, each
sited where the forest leaves it clear.

**File:** `src/range/elr-range-config.ts` (append)
**File:** `src/range/elr-range-config.test.ts` (append)

### Steps

1. Append to `src/range/elr-range-config.ts`:

```ts
import {
  chooseOffset,
  offsetCandidates,
  prepareOccluders,
  occludingTreeIndices,
  marginForPlate,
  type Occluder,
} from './sight-clearance';
import type { TreePlacement } from './environment/environment-config';

export interface ElrStation {
  /** Line-of-sight range (m) — the ballistic range. Hand THIS to the solver. */
  losRangeM: number;
  /** Nominal distance for labels (m). */
  nominalDistance: number;
  /** Horizontal distance from firing point to target (m). */
  groundRunM: number;
  /** World position of the gong centre. */
  x: number;
  y: number;
  z: number;
  gongDiameterM: number;
  frameWidthM: number;
  frameHeightM: number;
  /** Trees still blocking after the search — should be 0 or very small. */
  occluders: number;
  markerText: string;
}

export interface ElrLayout {
  point: FiringPoint;
  eyeYM: number;
  stations: ElrStation[];
  /**
   * Indices into the tree array of trees that must NOT be drawn — the handful
   * still blocking a sight line after the search has done its best.
   *
   * Measured across 8 forest seeds: mean 2.6, worst 5, out of 4000. That is the
   * design intent — individual trees removed, never a cleared corridor.
   */
  cullTreeIndices: number[];
}

/**
 * Place every station for one firing point.
 *
 * `groundRunM` is solved from `losRangeM` and the height difference — never the
 * other way round, or the ballistic range is wrong.
 */
export function solveLayout(
  point: FiringPoint,
  trees: readonly TreePlacement[],
): ElrLayout {
  const eyeYM = eyeYFor(point);
  const eye = { x: 0, y: eyeYM, z: 0 };
  const treeOccluders = prepareOccluders(trees);
  // Running set: trees PLUS the frames already placed. Stations are solved
  // NEAR TO FAR and each placed frame becomes an occluder for the ones behind
  // it, because a near frame really does hide a far gong. Without this, every
  // forest seed put at least one low-line station behind another's frame.
  const occluders: Occluder[] = [...treeOccluders];
  const cull = new Set<number>();
  const stations: ElrStation[] = [];

  for (const losRangeM of stationsFor(point)) {
    const gongDiameterM = losRangeM * GONG_ANGULAR_SIZE_RAD;
    const radiusM = gongDiameterM / 2;
    const margin = marginForPlate(radiusM);

    // Settle target height against ground run: the height depends on where the
    // target sits, and where it sits depends on the height. Three passes converge.
    let groundRunM = losRangeM;
    let y = 0;
    for (let pass = 0; pass < 3; pass++) {
      y = groundY(groundRunM) + targetCenterAboveGroundM(gongDiameterM);
      const dy = y - eyeYM;
      groundRunM = Math.sqrt(Math.max(0, losRangeM * losRangeM - dy * dy));
    }

    const capM = (OFFSET_CAP_MRAD / 1000) * groundRunM;
    const candidates = offsetCandidates(capM, (2 * capM) / (OFFSET_SAMPLES - 1));
    const picked = chooseOffset(eye, groundRunM, y, radiusM, occluders, { candidates }, margin);

    const a = Math.asin(Math.max(-1, Math.min(1, picked.offsetM / groundRunM)));
    const station: ElrStation = {
      losRangeM,
      nominalDistance: losRangeM,
      groundRunM,
      x: groundRunM * Math.sin(a),
      y,
      z: -groundRunM * Math.cos(a),
      gongDiameterM,
      frameWidthM: gongDiameterM * FRAME_WIDTH_MULTIPLE,
      frameHeightM: gongDiameterM * FRAME_HEIGHT_MULTIPLE,
      occluders: picked.occluders,
      markerText: `${losRangeM} M`,
    };
    stations.push(station);

    // Any TREE still in this cone gets cut. Search against `treeOccluders`, not
    // the running set — a frame is never culled, it is moved.
    for (const i of occludingTreeIndices(
      eye,
      { position: { x: station.x, y: station.y, z: station.z }, radiusM },
      treeOccluders,
      margin,
    )) {
      cull.add(i);
    }

    // This frame now occludes every station farther out.
    occluders.push({
      x: station.x,
      z: station.z,
      radiusM: station.frameWidthM / 2,
      topY: station.y + station.frameHeightM / 2,
    });
  }
  return { point, eyeYM, stations, cullTreeIndices: [...cull].sort((p, q) => p - q) };
}
```

> **Common mistake 1.** Do not pass `losRangeM` to `chooseOffset`. It expects the
> horizontal run, because it solves `z` from it. Passing the slant range puts every
> target slightly too far away.
>
> **Common mistake 2.** Do not skip the three-pass loop. One pass leaves far targets
> floating above or sunk below the slope.

2. Move the two `import` lines to the top of the file with the others. TypeScript
   requires imports at module scope.

### Tests to add

Append to `src/range/elr-range-config.test.ts`:

Extend the existing import from `./elr-range-config` at the top of the file to also
include `solveLayout` and `OFFSET_CAP_MRAD`, then add the tree import:

```ts
import { generateRangeTreePlacements, MAX_TREES } from './elr-range-trees';

describe('solveLayout', () => {
  const trees = generateRangeTreePlacements(MAX_TREES, 4);

  for (const point of ['low', 'high'] as const) {
    describe(`${point} line`, () => {
      const layout = solveLayout(point, trees);

      it('places every station in the ladder', () => {
        expect(layout.stations.map((s) => s.losRangeM)).toEqual([...stationsFor(point)]);
      });

      it('preserves the LINE-OF-SIGHT range at every station', () => {
        for (const s of layout.stations) {
          const dy = s.y - layout.eyeYM;
          expect(Math.hypot(s.groundRunM, dy)).toBeCloseTo(s.losRangeM, 3);
          expect(s.groundRunM).toBeLessThanOrEqual(s.losRangeM + 1e-6);
        }
      });

      it('keeps the world position consistent with the ground run', () => {
        for (const s of layout.stations) {
          expect(Math.hypot(s.x, s.z)).toBeCloseTo(s.groundRunM, 3);
          expect(s.z).toBeLessThan(0);
        }
      });

      it('sizes every gong at exactly 1 MIL', () => {
        for (const s of layout.stations) {
          expect(s.gongDiameterM).toBeCloseTo(s.losRangeM / 1000, 9);
        }
      });

      it('stands every frame clear of the ground', () => {
        for (const s of layout.stations) {
          const localGround = groundY(s.groundRunM);
          const frameBottom = s.y - s.frameHeightM / 2;
          expect(frameBottom).toBeGreaterThanOrEqual(localGround + FRAME_GROUND_CLEARANCE_M - 1e-6);
        }
      });

      it('keeps lateral offset inside the angular cap', () => {
        for (const s of layout.stations) {
          expect(Math.abs(s.x) / s.groundRunM).toBeLessThanOrEqual(OFFSET_CAP_MRAD / 1000 + 1e-9);
        }
      });

      // THE POINT OF THE WHOLE EXERCISE. Note this is "clear AFTER culling", not
      // "clear with no culling" — see the note below the test block.
      it('leaves every station clear once the culled trees are removed', () => {
        const kept = trees.filter((_, i) => !layout.cullTreeIndices.includes(i));
        const eye = { x: 0, y: layout.eyeYM, z: 0 };
        for (const s of layout.stations) {
          const blocking = occludingTreeIndices(
            eye,
            { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
            kept,
            marginForPlate(s.gongDiameterM / 2),
          );
          expect(blocking).toHaveLength(0);
        }
      });

      // Individual trees, never a corridor. Measured across 8 forest seeds:
      // mean 2.6 culled, worst 5, out of 4000.
      it('culls only a handful of trees', () => {
        expect(layout.cullTreeIndices.length).toBeLessThanOrEqual(15);
      });

      // A near frame really does hide a far gong, so stations are solved near to
      // far with each placed frame added as an occluder. Without that ordering
      // every forest seed put at least one low-line station behind another frame.
      it('never puts a station behind another station\'s frame', () => {
        const eye = { x: 0, y: layout.eyeYM, z: 0 };
        const frames = layout.stations.map((s) => ({
          x: s.x,
          z: s.z,
          radiusM: s.frameWidthM / 2,
          topY: s.y + s.frameHeightM / 2,
        }));
        layout.stations.forEach((s, i) => {
          const others = frames.filter((_, j) => j !== i);
          const blocking = occludingTreeIndices(
            eye,
            { position: { x: s.x, y: s.y, z: s.z }, radiusM: s.gongDiameterM / 2 },
            others,
            marginForPlate(s.gongDiameterM / 2),
          );
          expect(blocking).toHaveLength(0);
        });
      });
    });
  }

  it('is deterministic', () => {
    const a = solveLayout('high', trees).stations.map((s) => s.x);
    const b = solveLayout('high', trees).stations.map((s) => s.x);
    expect(a).toEqual(b);
  });

  it('gives DIFFERENT offsets from the two lines for the shared 250 m station', () => {
    // A sight line is defined by the eye it starts from, so the two lines solve
    // independently. If these were identical, the solver is ignoring eye height.
    const low = solveLayout('low', trees).stations.find((s) => s.losRangeM === 250)!;
    const high = solveLayout('high', trees).stations.find((s) => s.losRangeM === 250)!;
    expect(low.losRangeM).toBe(high.losRangeM);
    expect(low.y).not.toBeCloseTo(high.y, 6);
  });
});
```

Extend the import from `./sight-clearance` in this test file to include
`occludingTreeIndices` and `marginForPlate`.

> **Why "clear after culling" and not "clear with no culling".** Zero culling is not
> achievable and was measured not to be. The convex slope only buys clearance at LONG
> range — `groundY(500)` is 7.9 m, so the first 500 m of the hill is nearly flat, and
> the low line therefore inherits the flat-ground problem the high line escapes. The
> search gets most of the way; a handful of trees still have to come out. Measured
> across 8 forest seeds: **mean 2.6, worst 5, of 4000.** That is the design intent —
> individual trees, never a swath.
>
> **If `cullTreeIndices.length` exceeds 15**, do not loosen the test. Raise
> `OFFSET_CAP_MRAD` to 45, re-run, and report the change. If it still fails, STOP and
> report.

### Done when

- [ ] `npx vitest run src/range/elr-range-config.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — every test passes, and the total is STRICTLY GREATER than before this task

**STOP.**

---

# Task 5 — Registry row

**Goal.** Make the range resolvable by id and visible on the range-select screen.

**File:** `src/range/ranges.ts` (edit), `src/range/ranges.test.ts` (edit)

### Steps

1. In `src/range/ranges.ts`, add `'elr-range'` to the `RangeSceneType` union:

```ts
export type RangeSceneType = 'steel-racks' | 'test-range' | 'wooded-zero' | 'elr-probe' | 'elr-range';
```

2. Add the definition next to the others (copy the shape of `ELR_PROBE`):

```ts
const ELR_RANGE: RangeDefinition = {
  id: 'elr-range',
  name: 'ELR Range',
  shortLabel: 'ELR Range — 50 m to 2000 m wooded',
  unitCharacter: 'both',
  sceneType: 'elr-range',
  targetKind: 'steel',
  zeroable: false,
  windMarkers: true,
  camera: { nearM: 10, farM: 12000 },
  stations: [],
};
```

3. Add it to the visible list:

```ts
const RANGES: readonly RangeDefinition[] = [RANGE_A, TEST_RANGE, WOODED_ZERO, ELR_RANGE];
```

4. Do **not** add it to `UNLISTED`. It is real content, not a diagnostic.

### ⚠️ An existing test WILL fail. This is expected — here is the exact fix.

`src/range/ranges.test.ts` currently asserts the complete landing list:

```ts
it('lists all enterable ranges in landing order (range-a first)', () => {
  const ids = listRanges().map((r) => r.id);
  expect(ids).toEqual(['range-a', 'test-range', 'wooded-zero']);
});
```

Adding a fourth range breaks it. **Update the expectation — do not delete the test, and
do not weaken it to `toContain`.** It exists to catch an accidental change to the
landing screen, and it can only do that if it lists everything:

```ts
expect(ids).toEqual(['range-a', 'test-range', 'wooded-zero', 'elr-range']);
```

If any *other* test fails at this point, you have changed an existing range. Undo and
re-read step 2 — new fields must be optional and omitted by the other ranges.

### Tests to add

Append to `src/range/ranges.test.ts`. **First extend the import at the top of that file**
— it currently imports only `getRangeDefinition` and `listRanges`:

```ts
import {
  getRangeDefinition,
  listRanges,
  cameraReachFor,
  shotBudgetFor,
  DEFAULT_CAMERA_REACH,
} from './ranges';
```

Then append:

```ts
describe('elr-range registry row', () => {
  it('resolves by id with the right kind', () => {
    const def = getRangeDefinition('elr-range');
    expect(def.sceneType).toBe('elr-range');
    expect(def.targetKind).toBe('steel');
    expect(def.zeroable).toBe(false);
    expect(def.windMarkers).toBe(true);
  });

  it('carries the reach a 2 km world needs', () => {
    const reach = cameraReachFor(getRangeDefinition('elr-range'));
    expect(reach.farM).toBeGreaterThanOrEqual(2400);
    expect(reach.nearM).toBeGreaterThanOrEqual(10);
  });

  it('appears on the range-select list', () => {
    expect(listRanges().map((r) => r.id)).toContain('elr-range');
  });

  it('uses the default shot budget, like every real range', () => {
    expect(shotBudgetFor(getRangeDefinition('elr-range'))).toBeUndefined();
  });

  it('leaves every shipped range on the default camera', () => {
    for (const id of ['range-a', 'test-range', 'wooded-zero']) {
      expect(cameraReachFor(getRangeDefinition(id))).toEqual(DEFAULT_CAMERA_REACH);
    }
  });
});
```

### Done when

- [ ] `npx vitest run src/range/ranges.test.ts` — all pass
- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — every test passes, and the total is STRICTLY GREATER than before this task
- [ ] `npm run build` — succeeds

**STOP.**

---

# Task 6 — Scene: terrain + forest

**Goal.** A scene class that draws the ground and the trees. **No targets yet** — this
task is done when you can stand at the firing point and look at an empty wooded
hillside.

**New file:** `src/range/ELRRangeScene.ts`

### Steps

1. Read `src/range/ELRProbeScene.ts` end to end before writing anything. You are
   building the same shape.

2. Create `ELRRangeScene.ts` implementing `SteelSceneApi`. For this task:
   - constructor takes `(scene: THREE.Scene, point: FiringPoint)`
   - generate the tree field once via `generateRangeTreePlacements(MAX_TREES, palette.length)`
   - solve the layout via `solveLayout(point, treeField)` and store it
   - **draw the tree field MINUS the culled trees.** `solveLayout` returns
     `cullTreeIndices`; those trees are standing in a sight line and must not be
     rendered:

     ```ts
     const cull = new Set(this.layout.cullTreeIndices);
     const drawn = this.treeField.filter((_, i) => !cull.has(i));
     ```

     Forgetting this is silent — the range looks right and one gong is behind a tree.
   - build lights, ground, and trees
   - `plates` is an **empty array**, `plateMesh` / `plateSurface` / `chainMesh` are built
     but with **zero instances** — the interface requires them to exist
   - implement `eyeHeightM` (from `layout.eyeYM`) and `groundYAt` (from `groundY`)
   - `usesShadows = false`
   - `dispose()` removes every object and disposes every tracked resource, and restores
     `scene.background` and `scene.fog` to what they were

3. Ground mesh: copy `addGround` from `ELRProbeScene.ts` exactly, changing only the
   config import and using `groundY` directly.

> **Common mistake.** The plane is built in XY and rotated into XZ, so you displace
> local **Z** using local **Y** as the downrange coordinate. Copy the probe's loop
> including its use of a local-y → downrange helper. Getting this wrong produces a
> V-shaped valley that looks plausible from the firing point.

4. Trees: call `buildTrees(scene, WOODED_ZERO_ENVIRONMENT, placements, track)`. Track
   tree resources in a **separate** array from the rest of the scene's disposables.

### Tests to add

Scene classes need THREE.js and are not unit-tested here. Instead, add to
`src/range/elr-range-config.test.ts`:

```ts
it('has a tree field the scene can draw without regenerating', () => {
  // The scene must generate ONCE and solve against the same array.
  const trees = generateRangeTreePlacements(MAX_TREES, 4);
  const layout = solveLayout('high', trees);
  expect(trees).toHaveLength(MAX_TREES);
  expect(layout.stations).toHaveLength(8);
});
```

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass
- [ ] `npm run build` — succeeds
- [ ] **On device or in a browser**: enter the range and see ground and trees, no
      targets, no errors in the console
- [ ] Frame time readout shows a number; record it

**STOP and report the frame time before continuing.**

---

# Task 7 — Scene: targets

**Goal.** Add the gongs, frames, panels, chains and signs.

**File:** `src/range/ELRRangeScene.ts` (edit)

### Steps

1. Copy `addPlates`, `addFramesAndPanels`, `addChains` and `addSigns` from
   `ELRProbeScene.ts`. Change only:
   - the config import (`elr-range-config` instead of `elr-probe-config`)
   - `this.layout.stations` now has `ElrStation` fields (same names)

2. Every gong gets the **same** bullseye layer from `buildBullseyeLayer()` — the rings
   are constant-angular, so the pattern is identical at every station.

3. `PlateInstance.distanceM` must be `station.losRangeM`, **not** `groundRunM`. The
   firing solution uses this.

4. Sign text: `station.markerText`.

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass
- [ ] `npm run build` — succeeds
- [ ] **On device**: all 8 stations visible from the high line; each gong shows
      white/blue/white rings; each has a dark panel behind it and a distance sign
- [ ] No gong is clipped by a tree
- [ ] No frame is sunk into the ground

**STOP.**

---

# Task 8 — ScopeView wiring

**Goal.** Make the range enterable and shootable.

**File:** `src/scope/ScopeView.tsx` (edit)

### Steps

1. Find the scene-branch chain (search for `sceneType === 'elr-probe'`). Add a branch
   for `'elr-range'` immediately after it, following the same pattern:

```ts
} else if (sceneType === 'elr-range') {
  const elr = new ELRRangeScene(scene, 'high'); // firing point switching is Task 9
  range = elr;
}
```

2. Do **not** set wind to zero here. This range wants wind.

3. Do **not** auto-commit a station. ("Commit" here is the in-game engage-a-target
   action — see rule 11. Nothing to do with version control.) This range is real
   content and uses the normal in-game commit flow, unlike the probe which auto-engaged
   its nearest station.

4. Camera reach comes from the registry via the existing `cameraReachFor(...)` call —
   no change needed.

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass
- [ ] **On device**: enter the range from the range-select screen, press the in-game
      COMMIT button to engage a target, FIRE, and see a trace, an impact and a hit or
      miss
- [ ] Fire at 250 m and at 2000 m; both resolve
- [ ] The `shot:` readout shows a breakdown; record the 2000 m figure

**STOP and report the shot cost before continuing.**

---

# Task 9 — Firing-point switching

**Goal.** Let the player move between the low and high lines.

### Steps

1. Add `firingPoint: 'low' | 'high'` to the session store with default `'high'`, plus a
   `setFiringPoint` action. Follow the existing pattern for a session field.

2. Add a HUD control that calls `setFiringPoint`. Place it with the other range
   controls; keep it out of the way of the FIRE button and the dial cluster.

3. On change, the scene must rebuild for the new point. The tree field is deterministic,
   so the forest is identical; only the layout and eye height change.

4. `ScopeView` reads `firingPoint` from the store when constructing `ELRRangeScene`.

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass, including a new store test for the default and the setter
- [ ] **On device**: switching to the low line drops the eye to ground level and shows
      10 stations from 50 m to 500 m
- [ ] Switching back to the high line shows 8 stations from 250 m to 2000 m
- [ ] The 250 m station is present and shootable from both

**STOP.**

---

# Task 10 — Mach-state marking

**Goal.** Tell the player when a station is past the active cartridge's effective range.

### Steps

1. The solver already returns Mach at the target. Read it from the firing solution.

2. When a target is committed, show one of:

| Mach at target | shows |
|---|---|
| ≥ 1.2 | nothing |
| 1.0 – 1.2 | `TRANSONIC` |
| < 1.0 | `SUBSONIC — past effective range` |

3. **Use exactly the word `TRANSONIC`, with no claim about dispersion.** The engine does
   not model transonic dispersion (see `Wiki/_gaps.md` N4), so any text promising wider
   groups would be false.

### Done when

- [ ] `npx vitest run` — all pass, including a unit test of the three-way threshold
      function (test it as a pure function, not through the UI)
- [ ] **On device**: with a 6.5 CM, the 1250 m station reads `TRANSONIC` and the 1500 m
      station reads `SUBSONIC`

**STOP.**

---

# Task 11 — Wind markers

**Goal.** Flags or socks along the range, since wind decides hits past 1000 m.

### Steps

1. `windMarkers: true` is already on the registry row from Task 5.

2. Follow `src/range/wind-markers-config.ts` for how the existing ranges place markers.

3. Markers must run **the length of the range**, not sit at the firing line — a marker
   at the shooter tells you nothing about the wind at 1500 m. Place one near each
   station, offset laterally so it does not enter the sight cone.

> **Verify the offset does not break clearance**: after placing markers, re-run
> `npx vitest run src/range/elr-range-config.test.ts`. If markers are modelled as
> occluders, the "finds a clear sight line" test will catch a marker in the way.

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass
- [ ] **On device**: markers visible at several distances; none obscures a gong

**STOP.**

---

# Task 12 — Catalog entries

**Goal.** Add the cartridges this range exists to exercise. **Data only — no code.**

### Steps

1. In `src/game/catalog.data.json`, add entries keyed `50bmg`, `338lm`, `300wm`,
   copying the shape of the existing `65cm` entry exactly.

2. Values come from `Design/bullet-catalog/catalog-starting-values.md`. Do not invent
   numbers. If a value is missing there, STOP and report.

3. For the rimfire ladder, add a high-velocity .22 LR and a .22 WMR entry.

4. There are no hardcoded cartridge lists anywhere — only
   `DEFAULT_GAME_LOAD_CARTRIDGE_ID`. A same-shaped entry typechecks for free.

### Done when

- [ ] `npx tsc --noEmit` — no output
- [ ] `npx vitest run` — all pass
- [ ] **On device**: each new cartridge is selectable in the loadout and produces a
      firing solution at 1000 m
- [ ] `node ../validation/run.mjs` — still `0.000e+0`

**STOP. The range is built.**

---

## Final acceptance

Run all of these in order. Every one must pass.

```
npx tsc --noEmit
npx vitest run
npm run build
node ../validation/run.mjs
```

On device:

- [ ] Both firing points reachable; each shows its own ladder
- [ ] All 18 stations (10 low + 8 high) visible and shootable
- [ ] No gong hidden by a tree at either firing point
- [ ] Frame time inside 16 ms mean on iPad
- [ ] A come-up table can be built end to end: engage each station, record the dialled
      solution, and the numbers match `../elr-dope-range-plan.md` §5.1 and §11

---

## If you get stuck

State plainly: the task number, the exact command you ran, the exact output, and what
you tried. Do not loosen a test, widen a tolerance, skip a check, or regenerate the
golden vectors.

Do not try to undo your work with git — see rule 10. Leave the working tree exactly as
it is and report. The owner can roll back from a clean checkpoint; a partial revert done
from inside a failing task is much harder to recover from than the failure itself.
