// Range-type registry (task 2.3a, D1). A small, expandable description of each
// range the game offers: its identity, its unit character, which scene builder
// renders it, whether it is zeroable, and (for sight-in-style bays) its fixed
// physical stations. Future ranges (2.4 DOPE range, 2.7 Range B, a later field
// range) plug in as one more row here + a scene builder — no rewrite.
//
// This file is PURE config: no THREE, no engine, no store. The scene branch that
// consumes `sceneType` lives in ScopeView (2.3c); the sight-in stations are
// turned into an SI layout by `range/sight-in-config.ts` (2.3c). Range A keeps
// building its own ladder in `range-a-config.ts` — its `stations` here are empty
// (it is not a fixed-station bay).

/** Which scene builder renders a range. */
export type RangeSceneType = 'steel-racks' | 'sight-in' | 'test-range';

/** How a range relates to units. `both` = works in either system (the world is
 *  laid out off `unitsPrimary` at entry, D3); the other values are reserved for
 *  future ranges that are inherently one system or unit-agnostic. */
export type UnitCharacter = 'both' | 'yards' | 'meters' | 'agnostic';

/** One fixed target station on a sight-in-style range. `nominalDistance` is read
 *  in the range's active unit (yd under MOA/imperial, m under MIL/metric) and
 *  converted to SI at range entry (D3). `side` is a lateral placement hint:
 *  −1 = left of shooter centre, 0 = centre, +1 = right (D4). */
export interface RangeStation {
  nominalDistance: number;
  side: -1 | 0 | 1;
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
  /** Whether the zeroing flow (2.3d) is available on this range. */
  zeroable: boolean;
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
  zeroable: false,
  stations: [],
};

// 50 left of centre, 100 centre, 200 right (D4). Distances are in the active
// unit at entry; the SI conversion + physical offsets are 2.3c's job.
const SIGHT_IN: RangeDefinition = {
  id: 'sight-in',
  name: 'Zero Range',
  shortLabel: 'Zero Range — sight in',
  unitCharacter: 'both',
  sceneType: 'sight-in',
  zeroable: true,
  stations: [
    { nominalDistance: 50, side: -1 },
    { nominalDistance: 100, side: 0 },
    { nominalDistance: 200, side: 1 },
  ],
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
  zeroable: false, // zeroing flow is hard-wired to the sight-in scene
  stations: [],
};

/** Every range, in landing-screen order. */
const RANGES: readonly RangeDefinition[] = [RANGE_A, SIGHT_IN, TEST_RANGE];

const BY_ID = new Map(RANGES.map((r) => [r.id, r]));

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
