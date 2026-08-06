// Mount types — the "how is it held up, and what happens when it's hit" half of
// the target system (Design/archive/target-system-plan.md §2, task T1b).
//
// Mount is a SEPARATE axis from the target (`target-type.ts`), and the reaction
// mode belongs here rather than on the target: a chain-hung plate swings, a bolted
// plate does not, a hinged stem knocks down. The same IDPA silhouette gets all
// three behaviours for free depending on how it is hung.
//
// This is not a new idea imposed on the codebase — it is what the codebase already
// does. `elr-range-config.ts`'s `mountFor(point, losRangeM)` picks
// `'stake' | 'rack' | 'panel'` PER STATION ("The mount is per-STATION, not
// per-line"), and `ELRRangeScene` derives the reaction straight from it:
// `swings: st.mount !== 'stake'`. Folding mount into the target type would have
// been a regression from that.
//
// Pure: no THREE, no engine, no DOM.

/** What a hit does to the target, given how it is mounted. */
export type ReactionMode = 'swing' | 'bolted' | 'knockdown' | 'flip';

/** The physical furniture a scene builds for this mount. `'none'` is for a target
 *  that needs no structure of its own (e.g. bolted directly to a backer panel the
 *  range already draws). */
export type MountFurniture =
  | 'beam-rack'
  | 'stake'
  | 'panel'
  | 'hinge-stem'
  | 'pivot-post'
  | 'tree-post'
  | 'none';

/** Hanging-chain geometry. Defaults come from `engine-bridge/steel-target.ts`,
 *  which stays the single source of truth for the shipped values — this type
 *  carries them so a future mount can differ without a global edit. */
export interface ChainAnchorSpec {
  /** Attach angle off vertical on the plate rim (rad). */
  angleRad: number;
  /** Inward offset of the chains' fixed beam anchors (m). */
  outwardOffsetM: number;
  /** Outward splay of the DRAWN chain's beam end, as a fraction of the attach
   *  offset — visual only, so the pair reads as a shallow trapezoid. */
  splayFraction: number;
}

/** Knockdown/reset behaviour, consumed by `knockdown.ts` (T6). */
export interface KnockdownSpec {
  /** Angle off vertical at which the target latches down (deg). */
  fallAngleDeg: number;
  /** How long it stays down before resetting (s). */
  downDwellS: number;
  /** Reset speed (deg/s) — constant, because a reset motor is mechanical rather
   *  than gravitational. */
  resetRateDegS: number;
  /** Pivot-to-target-centre length (m), the rod length in the fall equation. */
  stemLengthM: number;
}

/** Flip/reposition behaviour, consumed by `flip.ts`. A hit advances the target
 *  to its next discrete stop — a lateral reposition, not a physics reaction, so
 *  there is no fall/rest angle here the way there is for a knockdown. */
export interface FlipSpec {
  /** Discrete stops, in hit order. Index 0 is the rest/default position, and its
   *  `xOffsetM` is 0 by convention (a delta from the placement's own anchor). An
   *  id MAY repeat (e.g. `'center'` twice) to encode an alternating cycle with no
   *  extra state — see `flip.ts`. */
  positions: readonly { id: string; xOffsetM: number }[];
  /** Seconds for the cosmetic slide between stops. Purely visual — hit-testing
   *  uses the new stop immediately, it does not wait on this. */
  transitionS: number;
}

export interface MountType {
  id: string;
  name: string;
  reaction: ReactionMode;
  furniture: MountFurniture;
  /** Whether a placement MUST supply `beamHeightM`. True exactly for mounts whose
   *  chains anchor to a beam above the target. */
  needsBeamHeight: boolean;
  anchor?: ChainAnchorSpec;
  knockdown?: KnockdownSpec;
  flip?: FlipSpec;
}

/** The minimum a plate has to expose for `reactionModeOf` — kept structural so
 *  this module never imports `RangeScene` (and therefore never imports THREE).
 *  `PlateInstance` satisfies it. */
export interface MountedPlate {
  mountId?: string;
  swings?: boolean;
}

/**
 * Throw on a mount type whose fields contradict its reaction mode. Called at
 * registration, so a malformed mount fails at import rather than mid-engagement.
 */
export function validateMountType(m: MountType): void {
  const where = `mountType '${m.id}'`;
  if (!m.id) throw new Error('mountType: missing id');
  if (m.reaction === 'swing') {
    // A swinging target's chains have to anchor somewhere, and the physics needs
    // the anchor geometry — without both, `createSteelReaction` builds a target
    // that cannot hang.
    if (!m.anchor) throw new Error(`${where}: a 'swing' mount needs anchor geometry`);
    if (!m.needsBeamHeight)
      throw new Error(`${where}: a 'swing' mount must require beamHeightM`);
  }
  if (m.reaction === 'knockdown' && !m.knockdown)
    throw new Error(`${where}: a 'knockdown' mount needs a knockdown spec`);
  if (m.reaction === 'bolted' && m.knockdown)
    throw new Error(`${where}: a 'bolted' mount cannot carry a knockdown spec`);
  if (m.reaction === 'flip' && !m.flip)
    throw new Error(`${where}: a 'flip' mount needs a flip spec`);
  if (m.reaction !== 'flip' && m.flip)
    throw new Error(`${where}: only a 'flip' mount can carry a flip spec`);
  if (m.anchor) {
    const a = m.anchor;
    if (!(a.angleRad > 0)) throw new Error(`${where}: anchor angleRad must be > 0`);
    if (!(a.outwardOffsetM > 0)) throw new Error(`${where}: anchor outwardOffsetM must be > 0`);
    if (!(a.splayFraction >= 0)) throw new Error(`${where}: anchor splayFraction must be ≥ 0`);
  }
  if (m.knockdown) {
    const k = m.knockdown;
    if (!(k.fallAngleDeg > 0 && k.fallAngleDeg <= 90))
      throw new Error(`${where}: knockdown fallAngleDeg must be in (0, 90]`);
    if (!(k.downDwellS >= 0)) throw new Error(`${where}: knockdown downDwellS must be ≥ 0`);
    if (!(k.resetRateDegS > 0)) throw new Error(`${where}: knockdown resetRateDegS must be > 0`);
    if (!(k.stemLengthM > 0)) throw new Error(`${where}: knockdown stemLengthM must be > 0`);
  }
  if (m.flip) {
    const f = m.flip;
    if (f.positions.length < 2)
      throw new Error(`${where}: flip needs at least 2 positions, got ${f.positions.length}`);
    if (f.positions[0].xOffsetM !== 0)
      throw new Error(`${where}: flip position 0 (rest) must have xOffsetM 0`);
    if (!(f.transitionS > 0)) throw new Error(`${where}: flip transitionS must be > 0`);
  }
}
