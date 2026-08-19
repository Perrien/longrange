# mouse-release-fire — desktop trigger on mouse-button release

Status: **APPROVED 2026-08-07, in progress.**

## Context

On desktop the shot loop currently needs two separate gestures: drag on the sight
picture with the mouse to aim, then move the cursor to the bottom-right **FIRE**
button and press it. Aiming and firing are the same physical act in reality, and
splitting them means the aim is always disturbed (or at best abandoned) before the
shot breaks. The owner wants the mouse button itself to be the trigger: aim with the
mouse, **release to fire**.

The whole aim path is one ~50-line block in `ScopeView.tsx:877-929`, and
`PointerEvent.pointerType` is already available there but never read — so this is a
mouse-only branch on an existing handler, not new input architecture. iOS/iPad is
untouched: the new path is gated on a keyboard key that a touch-only device cannot
produce.

### Decisions locked with the owner (2026-08-07)

| # | Decision |
|---|---|
| D1 | **`F` is the trigger condition.** On any range, if the left mouse button is released while `F` is held, the shot fires. `F` is read **at the moment of release** — let `F` go before releasing and nothing happens. No Settings toggle: the key *is* the safety, so the feature is inert until deliberately used and nothing needs persisting. |
| D2 | **`F`-held is the only thing that matters** — drag or click, it fires. No movement threshold, no dead-zone, no minimum hold time. Conversely a mouse release **without** `F` never fires, however far it dragged. So there are exactly two ways to fire: the existing FIRE button, or `F` + a left-button release on the sight picture. |
| D3 | **The right mouse button is not part of this.** It has no role in the app today (the drag handlers never read `e.button`, so a right-drag already aims), and it gains none here — only `button === 0` can fire. No cancel gesture, no context-menu handling. |
| D4 | **Breath hold is out of scope.** The owner keeps wobble off, so `F` does not touch `holdingRef`, and the HOLD button is unchanged. |
| D5 | No touch/device detection. `pointerType === 'mouse'` gates the trigger; the arming key gates everything else. |

## Approach

Extract the trigger decision into a pure, DOM-free module and pin it with tests —
the established pattern in this directory (`scope/aim-pick.ts` + `aim-pick.test.ts`,
`scope/turret-view.ts`, both extracted precisely so a rule "is testable rather than
buried in an effect"). `ScopeView.tsx` then only feeds it events. The aiming maths
itself is not touched.

### 1. New: `GameBuild/app/src/scope/mouse-trigger.ts` (pure — no THREE, no DOM, no React)

A two-boolean state machine:

```ts
export interface MouseTriggerState {
  armed: boolean;     // F is held
  leftDown: boolean;  // left button went down on the sight picture
}
export const ARM_KEY = 'KeyF'; // e.code — physical key, layout-independent

export function initialMouseTrigger(): MouseTriggerState;
/** keydown/keyup. Ignores the arm key when a modifier is held (Cmd/Ctrl+F stays
 *  the browser's) or when the event came from a text field; keyup ALWAYS disarms. */
export function onArmKey(s, e: { code: string; down: boolean; modifiers: boolean; editableTarget: boolean }): MouseTriggerState;
export function onTriggerPointerDown(s, e: { pointerType: string; button: number }): MouseTriggerState;
/** The only place `fire` can become true. */
export function onTriggerPointerUp(s, e: { pointerType: string; button: number }): { state: MouseTriggerState; fire: boolean };
/** window blur / tab hidden — clears `armed` so a key-up lost to a focus change
 *  cannot leave the rifle armed. */
export function disarm(s): MouseTriggerState;
```

Rules:
- `fire` is true only when `pointerType === 'mouse'` **and** `button === 0` **and**
  `leftDown` **and** `armed`. Nothing about movement enters the decision (D2), and
  armed-ness is read **at release**, not at press.
- `leftDown` exists so a release can only fire if we saw its matching press on the
  sight picture — a stray `pointerup` cannot discharge the rifle.
- Non-mouse pointer types (`touch`, `pen`) never fire and never mutate state.

### 2. New: `GameBuild/app/src/scope/mouse-trigger.test.ts`

Table-style unit tests, per `aim-pick.test.ts`. Cases: armed release fires; armed
release fires with no movement at all (D2); unarmed release never fires; `F` released
between press and release does not fire; `F` pressed *after* the mouse went down
still fires (armed-ness is read at release); right and middle buttons never fire
(D3); `touch`/`pen` never fire; a release with no matching press never fires;
`Cmd+F` and a keydown from a text field do not arm; `keyup` disarms even through a
guard; `disarm()` after blur blocks a subsequent release.

### 3. `GameBuild/app/src/scope/ScopeView.tsx`

- Component scope, near `holdingRef` (`:339`): `const triggerRef = useRef(initialMouseTrigger())`
  and `const [armed, setArmed] = useState(false)` (the indicator only).
- Mirror the existing FIRE-button guard into a ref so the key path behaves
  identically to the button: `outOfRoundsRef`, synced in a one-line effect from
  `outOfRounds` (`:267`).
- **New small effect** (`[]` deps) for window-level `keydown` / `keyup` / `blur`
  and `document` `visibilitychange` → `onArmKey` / `disarm`, mirroring into
  `setArmed`. The app has **zero keyboard listeners today**, so this is the first
  one; it must not `preventDefault` (plain `f` has no default action) and must
  skip `input` / `textarea` / `select` / `contenteditable` targets — text fields
  exist in `SettingsScreen.tsx`, `DopePanel.tsx`, `BuildScreen.tsx`. Removed on
  unmount.
- Inside the mount-once render effect, two of the existing handlers at `:891-920`
  each gain one line (`onPointerMove` and the aiming maths are untouched):
  - `onPointerDown` → `triggerRef.current = onTriggerPointerDown(...)`.
  - `onPointerUp` → run `onTriggerPointerUp`; if `fire && !outOfRoundsRef.current`,
    call the existing `fireRef.current()` (`:341`, bound at `:1514` to `fireSteel`
    or `fireSightIn`). **No new guards** — the five early-returns inside
    `fireSteel` (`:1053-1080`) and their `setFireBlocked` diagnostics apply
    unchanged, so a blocked key-fire explains itself in the same red banner as a
    blocked button press.
- **ARMED indicator** (so the mode is legible and a dead `F` is self-diagnosing):
  while `armed`, the FIRE button's `border` (`:2394`) goes amber (`#ffd24a`) and a
  small monospace `ARMED · RELEASE TO FIRE` chip renders directly above it, in the
  existing bottom-right column styling. It can only appear when a keyboard is
  present, so no device check is needed and touch layout is unaffected.

### 4. `GameBuild/app/src/shell/SettingsScreen.tsx` — discoverability only

One read-only hint row using the existing `Row({label, hint, children})` primitive
(`:31`) with no control: label `Desktop trigger`, hint "Hold **F** and release the
left mouse button to fire — the FIRE button still works too." No state, no store
field, no schema change.

### Explicitly not doing

- **No persisted setting** → no `SettingsState` field, no `defaultSettings()`
  change, no `SaveSettings` field, no `persist-settings.ts` mapper edits, no
  `CURRENT_SCHEMA_VERSION` bump, no migration, no persistence fixtures. D1 makes
  the arming key the safety, so there is nothing to switch off. If a toggle is
  wanted later it is the standard four-layer addition (store → schema →
  `persist-settings` → one `Seg` row) and additive-optional, so still no migration.
- No drag/click distinction, no movement threshold, no click-to-fire without `F` (D2).
- Nothing involving the right mouse button, and no `contextmenu` handling (D3).
- No changes to the aiming maths, the pointer bookkeeping, pinch/wheel zoom, or
  `onPointerMove`.
- No pointer lock / free-look mode.
- No keyboard binding for HOLD (D4), and `holdingRef` is not touched.
- `range/RangeView.tsx` (the DevTools preview harness, its own drag at `:73-103`)
  is out of scope.

## Verification

**Gates, run from `GameBuild/app/` in this order** (engine source untouched, so
`ctest` and `GameBuild/validation/run.mjs` are **N/A** — recorded as such in
`PROGRESS.md`, not skipped silently):

1. `npx vitest run` — includes the new `mouse-trigger.test.ts`
2. `npx tsc --noEmit`
3. `npm run build`

**By hand in the browser (`npm run dev`, desktop, mouse):**

| Check | Expected |
|---|---|
| Left-drag with `F` **up** | Aims. Nothing fires, no matter how far or how it ends. No ARMED chip. |
| Hold `F` | FIRE button ring turns amber, `ARMED · RELEASE TO FIRE` chip appears. |
| `F` down → left-drag onto a plate → release | One shot, at the aim point held at release. Trace/impact/audio as normal. |
| `F` down → single left click, no drag | One shot (D2). |
| Left-press → drag → press `F` mid-drag → release | One shot — `F` is read at release. |
| `F` down → left-press → **release `F`** → release mouse | No shot. Chip gone. |
| Hold `F`, `Alt-Tab` / switch tab, come back, click | No shot — blur disarmed it. |
| FIRE button, `F` never touched | Fires exactly as before. |
| `F` down with an empty lot | FIRE reads `EMPTY`; the release does nothing, same as the button. |
| Typing `f` in a Settings text field | Does not arm. |
| Every range (steel KD, ELR, paper sight-in bay) | Works the same — the shared `fireRef` covers both fire paths. |
| iPad / touch: drag, pinch-zoom, FIRE, HOLD | Completely unchanged. |

**Pause point:** owner verification after the table above, then a **commit** with:

```
mouse-release-fire: fire on mouse-button release when F is held

- Desktop trigger: hold F, aim with the mouse, release the left button to fire; the FIRE button still works unchanged.
- A release without F never fires, so glassing the range with the mouse is free.
- New pure scope/mouse-trigger.ts state machine with unit tests; no persisted setting and no schema change.
```

Then update `Design/execution/PROGRESS.md` (gate results incl. the two N/A engine
gates) and add the feature to `Design/feature-catalog.md` as built-with-date.
