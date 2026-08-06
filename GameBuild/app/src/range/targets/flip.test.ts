// Tests for the flip state machine — a hostage-paddle mount's reaction.
//
// The load-bearing property is the alternation: a mount that authors its rest
// stop's id twice in the cycle (`[center, right, center, left]`) must actually
// alternate sides on successive returns to centre, with no state beyond the
// plain index `strikeFlip` advances.

import { describe, it, expect } from 'vitest';
import { resetFlip, restFlipState, strikeFlip, type FlipState } from './flip';

describe('restFlipState / resetFlip', () => {
  it('start at stop 0', () => {
    expect(restFlipState()).toEqual({ index: 0 });
  });

  it('reset returns to stop 0 from anywhere', () => {
    expect(resetFlip()).toEqual({ index: 0 });
  });
});

describe('strikeFlip — binary toggle (2 stops)', () => {
  it('alternates left/right forever', () => {
    let s: FlipState = restFlipState();
    const seen: number[] = [s.index];
    for (let i = 0; i < 5; i++) {
      s = strikeFlip(s, 2);
      seen.push(s.index);
    }
    expect(seen).toEqual([0, 1, 0, 1, 0, 1]);
  });
});

describe('strikeFlip — alternating 4-phase cycle (centre paddle)', () => {
  // positions: [0]=center, [1]=right, [2]=center, [3]=left
  it('goes center -> right -> center -> left -> center -> right, matching the owner spec', () => {
    let s: FlipState = restFlipState();
    const seen: number[] = [s.index];
    for (let i = 0; i < 6; i++) {
      s = strikeFlip(s, 4);
      seen.push(s.index);
    }
    expect(seen).toEqual([0, 1, 2, 3, 0, 1, 2]);
  });

  it('every visit to index 2 (the second "center" stop) is bracketed by right then left', () => {
    // Confirms the alternation is real: consecutive "center" hits do not send
    // the paddle to the SAME side twice in a row.
    let s: FlipState = restFlipState();
    const sides: number[] = [];
    for (let i = 0; i < 8; i++) {
      s = strikeFlip(s, 4);
      if (s.index === 1 || s.index === 3) sides.push(s.index);
    }
    expect(sides).toEqual([1, 3, 1, 3]);
  });

  it('resetting mid-cycle goes straight back to stop 0, not the nearest "center"', () => {
    let s: FlipState = restFlipState();
    s = strikeFlip(s, 4); // -> right (1)
    s = strikeFlip(s, 4); // -> center (2)
    s = strikeFlip(s, 4); // -> left (3)
    expect(resetFlip()).toEqual({ index: 0 });
  });
});
