// The desktop trigger: when does releasing the mouse button fire the rifle?
// (mouse-release-fire, 2026-08-07.)
//
// Pure — no THREE, no DOM, no React. ScopeView feeds it plain facts off each
// event; every decision lives here so the rule unit-tests instead of hiding
// inside the mount-once render effect (same reason `aim-pick.ts` was extracted).
//
// On desktop, aiming and firing were two separate gestures: drag the sight
// picture with the mouse, then leave it to press the FIRE button — which means
// the aim is always given up before the shot breaks. Here the mouse button IS
// the trigger.
//
// THE WHOLE RULE: hold F, release the left mouse button, the shot fires.
//
//   * F is read AT THE MOMENT OF RELEASE, not at press. Press first and reach
//     for F mid-drag and it still fires; let F go before releasing and it does
//     not. That gives a natural "come off the trigger" with no extra gesture.
//   * Drag or click is irrelevant (owner, D2) — there is no movement threshold
//     and no minimum hold time. F is the only condition.
//   * A release WITHOUT F never fires, however far it dragged, so glassing the
//     range with the mouse costs nothing. F is the safety, which is why this
//     needs no setting to switch off.
//   * Left button only. The right and middle buttons fire nothing (D3).
//
// iPad/iPhone is untouched and needs no device sniffing: `pointerType` gates the
// trigger to a real mouse, and a touch-only device cannot produce the keydown
// that arms it in the first place.

export interface MouseTriggerState {
  /** The arm key is held. */
  armed: boolean;
  /** The left button went down on the sight picture. Guards against a release
   *  we never saw the press for (a captured drag that began on a HUD button, a
   *  synthetic event) discharging the rifle. */
  leftDown: boolean;
}

/**
 * The arm key, as `KeyboardEvent.code` — the PHYSICAL key, so it stays where the
 * player's left hand is regardless of keyboard layout. (`event.key` would move
 * with the layout and read `'ƒ'` under some modifier states.)
 */
export const ARM_KEY = 'KeyF';

/** Left mouse button, as `PointerEvent.button` on a down/up event. */
const LEFT_BUTTON = 0;

export function initialMouseTrigger(): MouseTriggerState {
  return { armed: false, leftDown: false };
}

/** What a keydown/keyup tells us, with the DOM already read out by the caller. */
export interface ArmKeyEvent {
  /** `KeyboardEvent.code`. */
  code: string;
  /** True for keydown, false for keyup. */
  down: boolean;
  /** Any of ctrl/meta/alt held — those combinations belong to the browser and
   *  the OS (⌘F is Find), so they must not arm. Shift is deliberately NOT
   *  counted: it changes nothing about what F means here. */
  modifiers: boolean;
  /** The event came from a text field / contenteditable, i.e. the player is
   *  typing, not shooting. */
  editableTarget: boolean;
}

/**
 * Arm or disarm from a key event.
 *
 * Asymmetric on purpose: the guards (modifiers, typing) only block ARMING.
 * A keyup on the arm key ALWAYS disarms, whatever the guards say — otherwise a
 * modifier pressed or focus moved into a text field mid-hold could swallow the
 * key-up and leave the rifle armed with nothing on screen to explain it.
 */
export function onArmKey(state: MouseTriggerState, e: ArmKeyEvent): MouseTriggerState {
  if (e.code !== ARM_KEY) return state;
  if (e.down) {
    if (e.modifiers || e.editableTarget) return state;
    return state.armed ? state : { ...state, armed: true };
  }
  return state.armed ? { ...state, armed: false } : state;
}

/** What a pointerdown/pointerup tells us. */
export interface TriggerPointerEvent {
  /** `PointerEvent.pointerType` — `'mouse'`, `'touch'` or `'pen'`. */
  pointerType: string;
  /** `PointerEvent.button` — which button changed state. */
  button: number;
}

export function onTriggerPointerDown(
  state: MouseTriggerState,
  e: TriggerPointerEvent,
): MouseTriggerState {
  if (e.pointerType !== 'mouse' || e.button !== LEFT_BUTTON) return state;
  return state.leftDown ? state : { ...state, leftDown: true };
}

/**
 * The ONE place `fire` can become true. Call it for `pointerup` only —
 * `pointercancel` has its own entry point below, because a cancelled gesture was
 * taken away from us rather than completed and must never break a shot.
 */
export function onTriggerPointerUp(
  state: MouseTriggerState,
  e: TriggerPointerEvent,
): { state: MouseTriggerState; fire: boolean } {
  if (e.pointerType !== 'mouse' || e.button !== LEFT_BUTTON) return { state, fire: false };
  const fire = state.leftDown && state.armed;
  return { state: state.leftDown ? { ...state, leftDown: false } : state, fire };
}

/**
 * `pointercancel` — an OS-level gesture or a system dialog took the pointer away
 * mid-drag. Never a shot. Forgets the button (so the next release cannot fire a
 * hold that no longer exists) but leaves the arm key alone: the player's hand is
 * still on it, and only a real key-up or a focus loss should disarm.
 *
 * Note `PointerEvent.button` is unreliable on cancel (often `-1`), which is why
 * this takes no event at all.
 */
export function onTriggerPointerCancel(state: MouseTriggerState): MouseTriggerState {
  return state.leftDown ? { ...state, leftDown: false } : state;
}

/**
 * Window blur / tab hidden. The browser stops delivering key events to a page
 * that lost focus, so a key-up that happens during a ⌘-Tab is never seen —
 * without this the rifle stays armed and the next stray click fires a shot.
 *
 * `leftDown` is cleared too: pointer capture is dropped along with focus, so the
 * matching pointerup may never arrive either.
 */
export function disarm(state: MouseTriggerState): MouseTriggerState {
  return state.armed || state.leftDown ? { armed: false, leftDown: false } : state;
}
