// Mount-type registry + the reaction-mode resolver (task T1b).
//
// The resolver is the load-bearing piece: `reactionModeOf` is what lets the new
// mount system and the shipped `PlateInstance.swings` flag coexist, so the three
// live steel ranges keep their exact behaviour with ZERO lines changed in their
// config or scene code. A plate with no `mountId` falls back to `swings`, which is
// how Range A, the Test Range, the Wooded Zero Range and the ELR Range all
// continue to work.

import {
  validateMountType,
  type MountType,
  type MountedPlate,
  type ReactionMode,
} from './mount-type';
import {
  CHAIN_ANCHOR_ANGLE_RAD,
  CHAIN_OUTWARD_OFFSET_M,
  CHAIN_SPLAY_FRACTION,
} from '../../engine-bridge/steel-target';

/**
 * A plate hung on chains from a rack beam — the shipped behaviour of Range A, the
 * Test Range, and the ELR Range's rack and panel stations.
 *
 * The anchor values are IMPORTED from `engine-bridge/steel-target.ts` rather than
 * re-typed, so this mount cannot drift from the geometry the reaction physics and
 * the drawn rest chains actually use. (`chainOutwardOffsetFor()`'s small-plate
 * clamp still applies per plate — it exists because a 5 cm absolute offset is 100 %
 * of a 5 cm ELR gong, and it stays a per-plate concern rather than a mount one.)
 */
const CHAIN_BEAM: MountType = {
  id: 'chain-beam',
  name: 'Chain-hung on a rack beam',
  reaction: 'swing',
  furniture: 'beam-rack',
  needsBeamHeight: true,
  anchor: {
    angleRad: CHAIN_ANCHOR_ANGLE_RAD,
    outwardOffsetM: CHAIN_OUTWARD_OFFSET_M,
    splayFraction: CHAIN_SPLAY_FRACTION,
  },
};

/**
 * Bolted to a stake or post — the ELR Range's 50–150 m stations, and the mount the
 * stake-mounted IDPA silhouette uses (T9b).
 *
 * Bolted steel still takes paint and still registers hits; it simply never enters
 * the swing physics. On the ELR range this was also the fix for a real defect (a
 * 5 cm gong whose chain geometry degenerated and buzzed forever), so "bolted" is
 * both physically right for a stake and the safe mode for a very small plate.
 */
const BOLT_STAKE: MountType = {
  id: 'bolt-stake',
  name: 'Bolted to a stake',
  reaction: 'bolted',
  furniture: 'stake',
  needsBeamHeight: false,
};

/**
 * Welded to a hinged stem that topples when struck and resets itself (task T6).
 *
 * The numbers are hardware properties, not tuning knobs to taste:
 *  - `fallAngleDeg: 80` — a real popper lies down against a stop, not flat on the
 *    ground; 80° reads as "down" from the firing line while keeping the plate's face
 *    visible enough that its accumulated marks are not hidden.
 *  - `downDwellS: 2.5` — long enough to read as a scored knockdown, short enough that
 *    a two-popper array is re-engageable without waiting on it.
 *  - `resetRateDegS: 60` — ~1.3 s to come back up, the pace of a pull-cable reset.
 *  - `stemLengthM: 1.0` — pivot-to-plate-centre for the 42″ popper spec, which stands
 *    its body circle roughly a metre above the base.
 */
const HINGE_STEM: MountType = {
  id: 'hinge-stem',
  name: 'Hinged stem (knockdown)',
  reaction: 'knockdown',
  furniture: 'hinge-stem',
  needsBeamHeight: false,
  knockdown: { fallAngleDeg: 80, downDwellS: 2.5, resetRateDegS: 60, stemLengthM: 1.0 },
};

/** Every mount the game knows about. */
const REGISTERED: readonly MountType[] = [CHAIN_BEAM, BOLT_STAKE, HINGE_STEM];

for (const m of REGISTERED) validateMountType(m);

const BY_ID = new Map(REGISTERED.map((m) => [m.id, m]));
if (BY_ID.size !== REGISTERED.length) {
  const seen = new Set<string>();
  const dupe = REGISTERED.find((m) => seen.size === seen.add(m.id).size);
  throw new Error(`targets/mount-registry: duplicate mount id '${dupe?.id}'`);
}

/** All registered mounts, in registration order. */
export function listMountTypes(): readonly MountType[] {
  return REGISTERED;
}

/** Resolve a mount by id; throws on an unknown id. */
export function getMountType(id: string): MountType {
  const m = BY_ID.get(id);
  if (!m) {
    const known = REGISTERED.map((r) => r.id).join(', ');
    throw new Error(`targets/mount-registry: unknown mount id '${id}' — known: ${known}`);
  }
  return m;
}

/** Whether an id resolves, for callers validating without throwing (the placement
 *  loader reports every bad entry rather than dying on the first). */
export function hasMountType(id: string): boolean {
  return BY_ID.has(id);
}

/**
 * How a plate reacts to a hit.
 *
 * THE COMPATIBILITY SEAM. New targets carry a `mountId` and the mount decides;
 * every plate built before this system has no `mountId` and falls through to the
 * shipped `swings` flag, whose semantics are reproduced exactly:
 *
 *   `swings === false` → bolted   (ELR stake stations)
 *   omitted or true    → swing    (everything else)
 *
 * That fallback is why T1b changes no range config and no scene builder — and the
 * test asserts it against every plate `RANGE_A_RACKS` and both ELR firing-point
 * layouts actually produce, rather than against a hand-written example.
 */
export function reactionModeOf(plate: MountedPlate): ReactionMode {
  if (plate.mountId !== undefined) return getMountType(plate.mountId).reaction;
  return plate.swings === false ? 'bolted' : 'swing';
}
