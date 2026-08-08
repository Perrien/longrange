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

/**
 * What a hit does to the target, given how it is mounted.
 *
 * `'star-arm'` and `'reset-switch'` are the popper star's pair
 * (`Design/archive/popper-star-plan.md`). They are separate modes rather than one because
 * they are genuinely different behaviours on one machine: the arm plate falls, the
 * hub plate is bolted and re-arms the arms.
 */
export type ReactionMode =
  | 'swing'
  | 'bolted'
  | 'knockdown'
  | 'flip'
  | 'star-arm'
  | 'reset-switch';

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
  | 'star-hub'
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

/**
 * Rotating-carrier behaviour, consumed by the star branch of `scope/steel-reactions.ts`
 * and by the kinematics in `targets/popper-star.ts`.
 *
 * WHY THE PERIOD LIVES ON THE MOUNT and not on the target: the arm is the mount. A
 * plate does not know it is turning; the thing holding it does — the same split that
 * puts a chain's anchor geometry and a popper's latch angle here.
 *
 * There is deliberately NO `downDwellS`. A star arm never resets itself (owner: the
 * plates "stay down when shot"), so the dwell is not a tuning knob — the reaction
 * builds its `KnockdownSpec` with `STAR_LATCH_UNTIL_RESET`, and offering a field here
 * would only invite it to be set to something that quietly breaks that rule.
 */
export interface StarArmSpec {
  /** Seconds per revolution of the carrier. */
  periodS: number;
  /** Rotation sense SEEN BY THE SHOOTER: -1 = clockwise, +1 = counter-clockwise.
   *  The shooter looks down −Z, so their clockwise is a NEGATIVE rotation about
   *  world +Z — see `popper-star.ts`'s `starCarrierRotationZ`. */
  sense: 1 | -1;
  /** Angle off the arm's rest plane at which a struck plate latches folded (deg). */
  fallAngleDeg: number;
  /** Reset rise rate (deg/s) — a reset actuator is mechanical, so constant. */
  resetRateDegS: number;
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
  star?: StarArmSpec;
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
  // A star arm's motion is entirely in its spec, so it cannot be omitted; and its
  // fold is built from `StarArmSpec` + `STAR_LATCH_UNTIL_RESET`, so a `knockdown`
  // spec here would be a second, contradictory source for the same behaviour.
  if (m.reaction === 'star-arm' && !m.star)
    throw new Error(`${where}: a 'star-arm' mount needs a star spec`);
  if (m.reaction !== 'star-arm' && m.star)
    throw new Error(`${where}: only a 'star-arm' mount can carry a star spec`);
  if (m.reaction === 'star-arm' && m.knockdown)
    throw new Error(`${where}: a 'star-arm' mount cannot carry a knockdown spec`);
  // A reset switch is bolted steel that happens to re-arm a group. It has no motion
  // of its own, so any reaction spec on it is an authoring error.
  if (m.reaction === 'reset-switch' && m.knockdown)
    throw new Error(`${where}: a 'reset-switch' mount cannot carry a knockdown spec`);
  if (m.reaction === 'reset-switch' && m.anchor)
    throw new Error(`${where}: a 'reset-switch' mount cannot carry anchor geometry`);
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
  if (m.star) {
    const s = m.star;
    // A zero or negative period is a division by zero in `starCarrierRotationZ`, and
    // a non-finite one poses every plate at NaN — invisible until the star vanishes.
    if (!(s.periodS > 0) || !Number.isFinite(s.periodS))
      throw new Error(`${where}: star periodS must be a finite number > 0, got ${s.periodS}`);
    if (s.sense !== 1 && s.sense !== -1)
      throw new Error(`${where}: star sense must be 1 or -1, got ${s.sense}`);
    // Same bounds the knockdown latch takes: a fold past 90° would carry the plate
    // back up the other side, and a zero-rate reset would never finish rising.
    if (!(s.fallAngleDeg > 0 && s.fallAngleDeg <= 90))
      throw new Error(`${where}: star fallAngleDeg must be in (0, 90]`);
    if (!(s.resetRateDegS > 0)) throw new Error(`${where}: star resetRateDegS must be > 0`);
  }
}
