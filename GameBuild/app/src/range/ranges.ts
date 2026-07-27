// Range-type registry (task 2.3a, D1). A small, expandable description of each
// range the game offers: its identity, its unit character, which scene builder
// renders it, whether it is zeroable, and (for sight-in-style bays) its fixed
// physical stations. Future ranges (2.4 DOPE range, 2.7 Range B, a later field
// range) plug in as one more row here + a scene builder — no rewrite.
//
// This file is PURE config: no THREE, no engine, no store. The scene branch that
// consumes `sceneType` lives in ScopeView (2.3c); a paper bay's stations are
// turned into an SI layout by its config (e.g. `range/wooded-zero-config.ts`).
// Range A keeps
// building its own ladder in `range-a-config.ts` — its `stations` here are empty
// (it is not a fixed-station bay).

/** Which scene builder renders a range. */
export type RangeSceneType = 'steel-racks' | 'test-range' | 'wooded-zero';

/** What a shot on this range hits. This is a CAPABILITY, deliberately separate
 *  from `sceneType` (which only picks a scene builder): the paper-bay fire path,
 *  zeroing flow, Clean and Inspect in ScopeView are generic over any paper bay,
 *  and gating them on a concrete `sceneType` is what forced the
 *  `sceneType === 'sight-in'` tests that this field replaces. A fourth paper bay
 *  should cost a registry row, not another disjunction at every gate.
 *  See `Design/archive/mil-zero-range-plan.md` §7.2. */
export type TargetKind = 'paper' | 'steel';

/** How a range relates to units. `both` = works in either system (the world is
 *  laid out off `unitsPrimary` at entry, D3); the other values are reserved for
 *  future ranges that are inherently one system or unit-agnostic. */
export type UnitCharacter = 'both' | 'yards' | 'meters' | 'agnostic';

/** One fixed target station on a sight-in-style range. `nominalDistance` is read
 *  in the range's active unit (yd under MOA/imperial, m under MIL/metric) and
 *  converted to SI at range entry (D3). `side` is a lateral placement hint:
 *  −1 = left of shooter centre, 0 = centre, +1 = right (D4).
 *
 *  `azimuthDeg` is the precise bearing from downrange (+ = right) used by fanned
 *  bays like the Wooded Zero Range, where `side`'s three buckets are too coarse.
 *  Optional: the original sight-in bay leaves it undefined and keeps using
 *  `side` × a fixed lateral offset. */
export interface RangeStation {
  nominalDistance: number;
  side: -1 | 0 | 1;
  azimuthDeg?: number;
}

/** The identity of a range. */
export interface RangeDefinition {
  id: string;
  /** Short name for HUD/headers. */
  name: string;
  /** Full label shown on the range-select card. */
  shortLabel: string;
  unitCharacter: UnitCharacter;
  sceneType: RangeSceneType;
  /** What shots hit here — drives the paper-bay fire path, Clean and Inspect.
   *  Distinct from `zeroable`, which answers a different question (may a zero be
   *  STORED here); a range could in principle be one without the other. */
  targetKind: TargetKind;
  /** Whether the zeroing flow (2.3d) is available on this range. */
  zeroable: boolean;
  /**
   * Whether downrange wind flags/socks are planted.
   *
   * A capability rather than another `sceneType` test (the pattern `targetKind`
   * replaced — see `paper-bay-scene.ts`). Off on ranges that are about
   * fundamentals rather than reading a field: the Test Range is a calm sandbox,
   * and the Wooded Zero Range carries only a token breeze that moves the tree
   * tops and does not meaningfully move the bullet, so a row of flags would
   * advertise a wind-reading problem the player is not being asked to solve
   * (owner, 2026-07-26).
   */
  windMarkers: boolean;
  /** Fixed stations for a sight-in bay; empty for a steel range (which builds its
   *  own rack ladder). */
  stations: RangeStation[];
}

const RANGE_A: RangeDefinition = {
  id: 'range-a',
  name: 'Range A',
  shortLabel: 'Range A — 50 to 500 yd steel',
  unitCharacter: 'both',
  sceneType: 'steel-racks',
  targetKind: 'steel',
  zeroable: false,
  windMarkers: true,
  stations: [],
};

// Test Range (2026-07-21): 100-yd wooded sandbox. Prototype for the environment
// system (terrain/trees/sky/mountains/clouds) that will later be applied to the
// other ranges, and the permanent proving ground for new target types.
const TEST_RANGE: RangeDefinition = {
  id: 'test-range',
  name: 'Test Range',
  shortLabel: 'Test Range — 100 yd wooded',
  unitCharacter: 'both',
  sceneType: 'test-range',
  targetKind: 'steel',
  zeroable: false, // steel sandbox — no paper face to group on
  windMarkers: false, // calm sandbox: a flag reading zero wind is just clutter
  stations: [],
};

// Wooded Zero Range (2026-07-26): a fanned four-station paper bay at
// 25/50/100/200 in the active unit, set in the wooded environment rather than a
// grass strip, shot from a low knoll so no station occludes another. Full
// geometry rationale, the dual-unit superset invariant, and the scenery spec are
// in `Design/archive/mil-zero-range-plan.md`.
//
// Azimuths are SHARED between the metric and imperial layouts — they are a
// property of the range, not of the unit system. Distances convert; bearings do
// not. See `wooded-zero-config.ts` for why that keeps the world buildable once.
const WOODED_ZERO: RangeDefinition = {
  id: 'wooded-zero',
  name: 'Wooded Zero',
  shortLabel: 'Wooded Zero — 25/50/100/200 sight-in',
  unitCharacter: 'both',
  sceneType: 'wooded-zero',
  targetKind: 'paper',
  zeroable: true,
  windMarkers: false, // token breeze only — see the field doc on RangeDefinition
  stations: [
    { nominalDistance: 25, side: -1, azimuthDeg: -6.0 },
    { nominalDistance: 50, side: -1, azimuthDeg: -2.0 },
    { nominalDistance: 100, side: 1, azimuthDeg: 1.5 },
    { nominalDistance: 200, side: 1, azimuthDeg: 4.5 },
  ],
};

/** Every range shown on the landing screen, in order.
 *
 *  NOT simply "every range": `RangeSelect` renders one card per entry and D8
 *  forbids grayed-out "coming soon" slots, so a range must only appear here once
 *  it has a scene builder. `WOODED_ZERO` is resolvable by id (its config and
 *  tests need it) but stays off this list until Stage 2b gives it a scene —
 *  otherwise selecting its card falls through ScopeView's scene branch to the
 *  steel `RangeScene`, and the player gets Range A's world under a Wooded Zero
 *  label. */
const RANGES: readonly RangeDefinition[] = [RANGE_A, TEST_RANGE, WOODED_ZERO];

/** Ranges that exist but are not yet on the landing screen. Merged into the id
 *  lookup so config/tests resolve them normally. Empty since Stage 2b gave
 *  `WOODED_ZERO` its scene — kept because the next range under construction will
 *  want it, and because the guard test above depends on the distinction. */
const UNLISTED: readonly RangeDefinition[] = [];

const BY_ID = new Map([...RANGES, ...UNLISTED].map((r) => [r.id, r]));

/** All ranges (range-select renders one card each — future ranges appear here
 *  automatically). */
export function listRanges(): readonly RangeDefinition[] {
  return RANGES;
}

/** Resolve a range by id; throws on an unknown id (a programming error, not a
 *  user-facing case). */
export function getRangeDefinition(id: string): RangeDefinition {
  const r = BY_ID.get(id);
  if (!r) throw new Error(`ranges: unknown range id '${id}'`);
  return r;
}
