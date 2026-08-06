// Flip/reposition state machine — a hostage-paddle mount's reaction.
//
// WHY THIS IS TS AND NOT C++, same reasoning as `knockdown.ts`: a hostage paddle
// swinging to its next clamp position is not emergent physics, it is a fixed set
// of hardware stops advanced one at a time by a hit. There is nothing for a rigid
// body solver to discover.
//
// The owner's requested behaviour for the centre paddle — shoot it in the centre
// and it swings right; shoot it on the right and it returns to centre; shoot it
// in the centre again and it swings LEFT this time, alternating — is not actually
// "3 positions plus a remembered side." It is a plain repeating cycle,
// [centre, right, centre, left], advanced by `index = (index + 1) % stopCount`.
// Authoring `'center'` twice in a mount's `FlipSpec.positions` reproduces the
// alternation with zero extra state. The top paddle's binary left/right flip is
// the same cycle with only 2 stops.
//
// Pure: no THREE, no engine, no RNG, no clock. Deterministic in (state, stopCount).

export interface FlipState {
  /** Index into the mount's `FlipSpec.positions`. */
  index: number;
}

export function restFlipState(): FlipState {
  return { index: 0 };
}

/** Advance to the next stop, wrapping around. `stopCount` is the mount's
 *  `FlipSpec.positions.length`. */
export function strikeFlip(state: FlipState, stopCount: number): FlipState {
  return { index: (state.index + 1) % stopCount };
}

/** Force a target back to its rest stop immediately. */
export function resetFlip(): FlipState {
  return restFlipState();
}
