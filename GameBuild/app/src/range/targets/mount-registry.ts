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

/**
 * A hostage paddle clamped so it flips between two positions when struck —
 * the top (head-level) paddle. A 2-stop `flip` cycle is exactly a binary
 * left/right toggle (`flip.ts`'s `strikeFlip` wraps `% 2`).
 *
 * `xOffsetM: 0.35` is a placeholder swing distance, to be tuned against the
 * owner's reference art once the assembly is visible on device — it only
 * needs to clear the head without leaving the sight picture.
 */
const HOSTAGE_CLAMP_2WAY: MountType = {
  id: 'hostage-clamp-2way',
  name: 'Hostage clamp (2-way)',
  reaction: 'flip',
  furniture: 'pivot-post',
  needsBeamHeight: false,
  flip: {
    positions: [
      { id: 'left', xOffsetM: 0 },
      { id: 'right', xOffsetM: 0.35 },
    ],
    transitionS: 0.3,
  },
};

/**
 * A hostage paddle clamped behind the silhouette's window, alternating sides
 * each time it returns to centre — the centre (torso-level) paddle. Real
 * hardware always swings the same direction; the owner explicitly asked for
 * the alternating version instead ("this is not reality"). Authoring
 * `'center'` twice in the cycle is what produces the alternation with no
 * extra state (`flip.ts`'s header).
 *
 * ── WHY ±0.33 m, AND NOT A NUMBER TO TASTE ────────────────────────────────
 * The swung stops MUST put the whole paddle OUTSIDE the backing silhouette's
 * outline. This is not cosmetics; it is what makes the paddle hittable at all.
 * `game/shot.ts` walks the rack in order and takes the FIRST plate whose zones
 * the impact breaks, with no depth or occlusion concept — so while the paddle
 * overlaps the silhouette's torso, every shot aimed at it resolves against the
 * silhouette's `body-0`/`minus-1` instead and the paddle can never be struck
 * again. (At the rest stop it IS reachable, because the silhouette's `window`
 * is an `isHole` zone that misses cleanly and falls through to the paddle.)
 * That is exactly the defect the owner reported on device, 2026-08-06: "the
 * first shot hits and it flips to a side correctly but then it is no longer
 * able to be hit again", together with "it only flips behind the main body
 * rather than out to its side". One geometry fix, both symptoms.
 *
 * The derivation, against the shipped sizes:
 *   silhouette half-width  = 0.4572 / 2 = 0.2286 m  (18″, full width at torso
 *                            level — the outline's sides run straight there)
 *   paddle radius          = 0.1524 / 2 = 0.0762 m  (6″)
 *   minimum clear offset   = 0.2286 + 0.0762 = 0.3048 m  ← A HARD FLOOR
 *
 * 0.33 m clears that by 2.5 cm (~1″). It was 0.36 m (5.5 cm) for one round;
 * the owner judged that too far out on device and asked for it "dialed back
 * just a bit", so the clearance margin — not the swing — is what shrank.
 *
 * ⚠️ DO NOT go below ~0.315 m without changing the hit test first. Between
 * 0.3048 and here there is nothing but bullet radius: a shot lands on whichever
 * of the two plates it breaks FIRST, and the silhouette is authored first, so
 * closing the gap re-opens the unhittable-paddle bug from the inner edge
 * inward. If a tighter swing is ever wanted, the honest way is to make the hit
 * loop respect depth — this paddle already sits 5 cm in front of the backing
 * plate (`zNudgeM`), it is simply render-only today.
 *
 * The top paddle needs none of this (0.175 m already clears the much narrower
 * head/neck outline), which is why it stayed re-hittable and this one did not.
 */
const HOSTAGE_CLAMP_3WAY: MountType = {
  id: 'hostage-clamp-3way',
  name: 'Hostage clamp (3-way, alternating)',
  reaction: 'flip',
  furniture: 'pivot-post',
  needsBeamHeight: false,
  flip: {
    positions: [
      { id: 'center', xOffsetM: 0 },
      { id: 'right', xOffsetM: 0.33 },
      { id: 'center', xOffsetM: 0 },
      { id: 'left', xOffsetM: -0.33 },
    ],
    transitionS: 0.3,
  },
};

/** Every mount the game knows about. */
const REGISTERED: readonly MountType[] = [
  CHAIN_BEAM,
  BOLT_STAKE,
  HINGE_STEM,
  HOSTAGE_CLAMP_2WAY,
  HOSTAGE_CLAMP_3WAY,
];

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
