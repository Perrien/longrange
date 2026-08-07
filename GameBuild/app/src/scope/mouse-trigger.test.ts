import { describe, it, expect } from 'vitest';
import {
  ARM_KEY,
  disarm,
  initialMouseTrigger,
  onArmKey,
  onTriggerPointerCancel,
  onTriggerPointerDown,
  onTriggerPointerUp,
  type MouseTriggerState,
} from './mouse-trigger';

// Sequence helpers. The rule is a state machine, so almost every test reads as
// "play these events, did the rifle fire" — `play` returns how many shots the
// sequence produced, which is the only thing a caller acts on.

type Step =
  | { kind: 'key'; down: boolean; code?: string; modifiers?: boolean; editableTarget?: boolean }
  | { kind: 'down'; pointerType?: string; button?: number }
  | { kind: 'up'; pointerType?: string; button?: number }
  | { kind: 'cancel' }
  | { kind: 'blur' };

/** F down / F up. */
const armDown = (over: Partial<Extract<Step, { kind: 'key' }>> = {}): Step => ({
  kind: 'key',
  down: true,
  ...over,
});
const armUp = (over: Partial<Extract<Step, { kind: 'key' }>> = {}): Step => ({
  kind: 'key',
  down: false,
  ...over,
});
/** Left mouse press / release, unless overridden. */
const press = (over: Partial<Extract<Step, { kind: 'down' }>> = {}): Step => ({ kind: 'down', ...over });
const release = (over: Partial<Extract<Step, { kind: 'up' }>> = {}): Step => ({ kind: 'up', ...over });
const cancel: Step = { kind: 'cancel' };
const blur: Step = { kind: 'blur' };

function play(steps: Step[]): { shots: number; state: MouseTriggerState } {
  let state = initialMouseTrigger();
  let shots = 0;
  for (const step of steps) {
    if (step.kind === 'key') {
      state = onArmKey(state, {
        code: step.code ?? ARM_KEY,
        down: step.down,
        modifiers: step.modifiers ?? false,
        editableTarget: step.editableTarget ?? false,
      });
    } else if (step.kind === 'down') {
      state = onTriggerPointerDown(state, {
        pointerType: step.pointerType ?? 'mouse',
        button: step.button ?? 0,
      });
    } else if (step.kind === 'up') {
      const out = onTriggerPointerUp(state, {
        pointerType: step.pointerType ?? 'mouse',
        button: step.button ?? 0,
      });
      state = out.state;
      if (out.fire) shots++;
    } else if (step.kind === 'cancel') {
      state = onTriggerPointerCancel(state);
    } else {
      state = disarm(state);
    }
  }
  return { shots, state };
}

const shotsFrom = (steps: Step[]) => play(steps).shots;

describe('the arm key + release rule (D1, D2)', () => {
  it('fires when the left button is released with the arm key held', () => {
    expect(shotsFrom([armDown(), press(), release()])).toBe(1);
  });

  it('fires on a bare click — there is no movement or hold-time requirement (D2)', () => {
    // Nothing in this module can even see movement; the test exists to pin that
    // the owner's "drag or click, if F was down, fire" is what the rule says.
    expect(shotsFrom([armDown(), press(), release()])).toBe(1);
  });

  it('never fires without the arm key, however the mouse is used', () => {
    expect(shotsFrom([press(), release()])).toBe(0);
    expect(shotsFrom([press(), release(), press(), release()])).toBe(0);
  });

  it('reads the arm key at RELEASE, not at press', () => {
    // Armed mid-drag → fires.
    expect(shotsFrom([press(), armDown(), release()])).toBe(1);
    // Came off the trigger before releasing → does not.
    expect(shotsFrom([armDown(), press(), armUp(), release()])).toBe(0);
  });

  it('fires once per release while the key is held down', () => {
    expect(shotsFrom([armDown(), press(), release(), press(), release(), press(), release()])).toBe(3);
  });

  it('does not fire on a release it never saw the press for', () => {
    expect(shotsFrom([armDown(), release()])).toBe(0);
    // …and the stale release does not prime the next one either.
    expect(play([armDown(), release()]).state.leftDown).toBe(false);
  });
});

describe('which button and which pointer (D3, D5)', () => {
  it('ignores the right and middle buttons entirely', () => {
    for (const button of [1, 2, 3, 4]) {
      expect(shotsFrom([armDown(), press({ button }), release({ button })])).toBe(0);
    }
  });

  it('does not let a right-button release discharge a left-button hold', () => {
    expect(shotsFrom([armDown(), press(), release({ button: 2 })])).toBe(0);
    // The left button is still down, so its own release still fires.
    expect(shotsFrom([armDown(), press(), release({ button: 2 }), release()])).toBe(1);
  });

  it('never fires for touch or pen — iPad is untouched', () => {
    for (const pointerType of ['touch', 'pen']) {
      expect(shotsFrom([armDown(), press({ pointerType }), release({ pointerType })])).toBe(0);
    }
  });

  it('does not let a touch release discharge a mouse hold', () => {
    expect(shotsFrom([armDown(), press(), release({ pointerType: 'touch' })])).toBe(0);
  });
});

describe('arm-key guards', () => {
  it('ignores other keys', () => {
    expect(shotsFrom([armDown({ code: 'KeyG' }), press(), release()])).toBe(0);
  });

  it('does not arm on ⌘F / Ctrl+F / Alt+F — those belong to the browser', () => {
    expect(shotsFrom([armDown({ modifiers: true }), press(), release()])).toBe(0);
  });

  it('does not arm while the player is typing in a text field', () => {
    expect(shotsFrom([armDown({ editableTarget: true }), press(), release()])).toBe(0);
  });

  it('disarms on key-up even through a guard that would have blocked arming', () => {
    // Focus moved into a text field, or a modifier went down, between the F
    // press and its release. The key-up must still land or the rifle sticks armed.
    expect(shotsFrom([armDown(), armUp({ editableTarget: true }), press(), release()])).toBe(0);
    expect(shotsFrom([armDown(), armUp({ modifiers: true }), press(), release()])).toBe(0);
  });

  it('is idempotent under key repeat', () => {
    const state = play([armDown(), armDown(), armDown()]).state;
    expect(state.armed).toBe(true);
    expect(shotsFrom([armDown(), armDown(), press(), release()])).toBe(1);
  });
});

describe('a cancelled gesture', () => {
  it('is never a shot', () => {
    expect(shotsFrom([armDown(), press(), cancel])).toBe(0);
  });

  it('forgets the hold, so a later release cannot fire it', () => {
    expect(shotsFrom([armDown(), press(), cancel, release()])).toBe(0);
  });

  it('leaves the arm key alone — the hand is still on it', () => {
    const state = play([armDown(), press(), cancel]).state;
    expect(state).toEqual({ armed: true, leftDown: false });
    // So the next press/release fires without having to re-press F.
    expect(shotsFrom([armDown(), press(), cancel, press(), release()])).toBe(1);
  });
});

describe('losing focus', () => {
  it('disarms, so a click after coming back does not fire', () => {
    expect(shotsFrom([armDown(), blur, press(), release()])).toBe(0);
  });

  it('drops a hold that was in progress when focus went away', () => {
    const state = play([armDown(), press(), blur]).state;
    expect(state).toEqual({ armed: false, leftDown: false });
    // The pointerup that arrives after refocus must not fire.
    expect(shotsFrom([armDown(), press(), blur, armDown(), release()])).toBe(0);
  });

  it('re-arms normally afterwards', () => {
    expect(shotsFrom([armDown(), blur, armDown(), press(), release()])).toBe(1);
  });
});

describe('state hygiene', () => {
  it('starts unarmed with no button down', () => {
    expect(initialMouseTrigger()).toEqual({ armed: false, leftDown: false });
  });

  it('never mutates the state it is given', () => {
    const before = initialMouseTrigger();
    const frozen = Object.freeze({ ...before });
    expect(() => {
      const armedState = onArmKey(frozen, { code: ARM_KEY, down: true, modifiers: false, editableTarget: false });
      const downState = onTriggerPointerDown(armedState, { pointerType: 'mouse', button: 0 });
      onTriggerPointerUp(downState, { pointerType: 'mouse', button: 0 });
      disarm(downState);
    }).not.toThrow();
    expect(frozen).toEqual(before);
  });

  it('returns the same object when nothing changed, so callers can compare by identity', () => {
    const state = initialMouseTrigger();
    expect(onArmKey(state, { code: 'KeyG', down: true, modifiers: false, editableTarget: false })).toBe(state);
    expect(onTriggerPointerDown(state, { pointerType: 'touch', button: 0 })).toBe(state);
    expect(onTriggerPointerCancel(state)).toBe(state);
    expect(disarm(state)).toBe(state);
  });
});
