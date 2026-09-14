# Native Swift Port — Exploration

Status: **CLOSED 2026-09-08**
Started: 2026-09-08 · via /a-explore
IDs: **S** = scope · **I** = implementation · **U** = UI/UX

## Grounding
- `CLAUDE.md` locked decision: "Shipping target: an installable web/PWA. Native Swift was ruled out
  by the free-Apple-account provisioning expiry."
- `Design/btk-assessment-and-path-forward.md` §4 (`Status: DECIDED — web/PWA on BTK`, 2026-07-10): free
  Apple account → sideloaded iOS/iPadOS apps get a 7-day provisioning profile, then must be re-signed
  from Xcode. Web/PWA has no such expiry. **Mac is exempt** — a locally-signed Mac app runs indefinitely
  with no paid account. The doc's own recommendation: "Option B (native Swift) becomes the recommendation
  only if the project accepts going Mac-only, or later opts to pay $99/yr for an Apple-only product."
- `Design/build-plan.md` §1–2: current shipped stack is TypeScript + React + Three.js + Vite PWA +
  Zustand + IndexedDB, built on the owned `GameBuild/engine/` copy of the C++/WASM ballistics core (BTK
  pristine copy stays the golden-vector oracle).
- `GameBuild/app/src` is ~232 TypeScript files today — dial-or-hold shot loop, zeroing, computed DOPE,
  both truing levers, the 10-cartridge catalog, four ranges, reactive steel — all live in the current
  stack (`CLAUDE.md` Progress section).
- The C++/WASM physics core (~3.5k lines, oracle-validated) is stack-agnostic and was always flagged as
  the part that ports cleanly to Swift regardless of platform choice.
- No ADR exists yet for the original web-vs-native call — it lives only as a planning input in
  `build-plan.md` / `btk-assessment-and-path-forward.md`, not as a `Design/Decisions/` record.

## Tickets folded in
- none.

## Scope & purpose
- **S1** — The $99/yr Apple Developer account is a **firm commitment** for this exploration, covering
  both Mac and iOS. This removes the 7-day free-account provisioning expiry that originally ruled native
  out (`btk-assessment-and-path-forward.md` §4) — native iOS/iPadOS is back on the table on equal footing
  with Mac.
- **S2** — Two driving goals: (1) move the codebase to a language/stack the owner is more comfortable in
  than the current TS/React/Three.js web stack; (2) add iPhone accelerometer/motion input (tilt and
  shift) as an aiming method on iOS — a capability the web stack cannot provide and that
  `btk-assessment-and-path-forward.md` §4 already flagged as the strongest native-exclusive win.
- Current aiming is pointer-based only, confirmed at `scope/ScopeView.tsx:983` (`const pointers = new
  Map<...>`) — single-pointer drag to pan/aim, two-pointer pinch to zoom, plus a desktop keyboard+mouse
  trigger (`scope/mouse-trigger.ts`). There is no motion/gyro input today anywhere in the codebase.
- **S3** — The web/PWA build is retired entirely once native ships; this is a full replacement, not a
  second parallel track. Reason: maintaining two front ends against one physics core is ongoing duplicate
  work for a solo owner, and it would undercut goal (1) (moving to a stack the owner is more comfortable
  in) to keep maintaining the one being left.
- **S4** — "Working" means the core dial-or-hold shot loop running natively — not full parity with every
  currently shipped web feature. The cutover to native (and retirement of web) happens once that core
  loop works, and the rest of the catalog (zeroing, DOPE, truing, cartridges, ranges, reactive steel)
  gets rebuilt natively afterward. Reason: waiting for full parity before starting would delay both
  driving goals by the entire length of the port; a solo owner can tolerate a temporarily smaller feature
  set.
- **S5** — Success is **not** "the owner can work independently" — outside help will still be needed
  either way, that's a constant. Success is: small changes are easier to make, and the overall
  structure is easier to grok, in the native Swift codebase than in the current TS/React one.
- Who hits the problem, and when: the owner alone (solo project) — while developing/maintaining the
  codebase (stack comfort, goal 1), and while playing on iPhone (motion aiming, goal 2). Not asked as a
  separate question; inferred directly from the project being solo and the two stated goals.

## Non-goals
- Motion/accelerometer aiming is **iOS-only**. Mac keeps mouse/trackpad pointer-aim, matching today's
  desktop behavior — there is no Mac equivalent of tilt input, since a trackpad has no motion to sense
  and inventing a substitute gesture would not be "porting" the capability.
- Cross-device save sync (iCloud/CloudKit) is a non-goal for now. Saves stay per-device for the initial
  cutover, same as today's IndexedDB. Candidate for its own ticket later (see Notes).

## Implementation
- **I1** — Full Swift port of the physics core (~3.5k lines: trajectory integrator, atmosphere, drag
  tables, spin drift, Monte-Carlo dispersion, steel-target reaction physics). No C++ ships in the native
  app. The existing C++ engine (`GameBuild/engine/`) and pristine `BallisticsToolkit/` become the
  validation oracle for the Swift port, the same golden-vector-diff pattern already used for the WASM
  build (`GameBuild/validation/`). Chosen over wrapping C++ via Swift/C++ interop (rejected — still
  carries C++ in the shipped app, real interop friction, and the owner was already on record as "not
  keen on C++" per `btk-assessment-and-path-forward.md` §5 Option C) and over a partial/hybrid port
  (rejected — leaves some C++ in the app short-term, against goal 1's "grok the whole structure").
- **I2** — Rendering via **SceneKit** for the 3D range scene (trace, steel targets, mirage, wind markers,
  reticle overlay). Chosen over RealityKit (rejected — ECS model built for AR/VisionOS, a different
  mental model than the current Three.js scene graph, working against goal 1) and raw Metal (rejected —
  hand-building what SceneKit already gives, for a scene already established as cheap to render).
  SceneKit's node/mesh/camera/material graph maps closely onto how the scene is structured today.
- **I3** — State management: **one `@Observable` class as a single app-wide store**, mirroring the shape
  of today's single Zustand store (`state/store.ts`) rather than scattering state across many local
  `@State`/`@StateObject` properties per view. Chosen for goal 1: same architecture, new syntax, rather
  than relearning the architecture and the language at the same time.
- **I4** — Motion aiming **coexists** with touch-drag as a selectable mode (a settings toggle, alongside
  the other player-facing options already in `shell/SettingsScreen.tsx`), not a replacement. Chosen
  because motion aiming is a different physical activity (holding the phone up, tilting it) that won't
  suit every situation (couch play, fine adjustment at high zoom), and a toggle is cheap once both input
  paths exist. Motion aiming also needs a **calibration step**: the phone does not need to be held
  vertically — the player holds it at whatever natural angle they prefer, and calibration records that
  hold as the neutral/zero-tilt reference that subsequent tilt is measured against.
- **I5** — Calibration/recenter is available **on demand, any time** (not a one-time per-session step) —
  a recenter action the player can trigger whenever posture shifts, the phone changes hands, etc.
  Rejected a session-start-only calibration because it would force a session restart just to recalibrate
  after any position change.
- **I6** — Motion aiming gets its **own separate sensitivity slider** (tilt-degrees-to-mrad gain),
  distinct from the existing "Aim sensitivity" drag-gain slider (`shell/SettingsScreen.tsx:137`,
  pixels-to-mrad). Rejected sharing one value — the two are different physical units, and a comfortable
  drag gain implies nothing about a comfortable tilt gain.
- **I7** — Persistence via **SwiftData**, local-only (CloudKit sync left off, per the non-goal above but
  available later without a rewrite since SwiftData supports it as an opt-in). Chosen over plain
  Codable JSON files (closer to today's IndexedDB-blob approach, but less idiomatic — most native Swift
  learning material assumes SwiftData, which matters for goal 1) and over UserDefaults (not suited to
  structured game-save data like rifles/ammo/DOPE cards).
- **I8** — Logic with a documented correctness/bug-fix history (`scope/aim-pick.ts`'s elliptical
  crosshair-hit test and angular-vs-linear target-pick rule, `game/mirage-model.ts`, `game/impact-call.ts`,
  `game/recoil.ts`, `scope/steel-reactions.ts`, and any other file with a similar "found on device, here's
  the bug it fixes" comment) is **ported directly**: same algorithm, same edge-case behavior, existing
  unit tests translated to XCTest as a correctness oracle, explanatory comments carried forward. Rejected
  re-deriving these fresh from domain rules alone — that risks silently reintroducing the exact bugs the
  comments document. This also serves goal 1: matching TS/Swift implementations aid the mental map rather
  than obscure it.
- **I9** — If CoreMotion permission is denied or motion data is unavailable, **fall back gracefully**:
  disable the motion toggle, show why (permission denied), and point at the Settings app to re-enable.
  Touch-drag remains the reliable default; declining an optional feature never blocks play.
- **What could invalidate I2 (SceneKit):** as of this session, SceneKit is still shipped and functional
  on macOS/iOS, but Apple's newer-feature investment has visibly shifted to RealityKit for several years
  running. Not a reason to change the choice now (I2's reasoning — scene-graph parity with Three.js for
  goal 1 — still holds), but the plan-writer should do a fresh currency check on SceneKit's support
  status before implementation starts, since this session's knowledge has a cutoff.

## UI / UX
- **U1** — Recenter/calibrate control is an **on-screen button**: a small persistent icon near the
  reticle, visible only when motion mode is active. Chosen over a hardware-button shortcut or a gesture
  — discoverable without documentation, and doesn't compete with volume-button or double-tap conventions
  other interactions might want later.
- **U2** — Recenter confirmation is **both** a haptic tap and a brief visual flash on the reticle.
  Haptics are a native-only win worth using; pairing with a visual cue covers players with haptics or
  sound disabled.
- **U3** — Default aiming mode on iOS is **touch-drag**, matching today's only mode. Motion is an opt-in
  the player deliberately switches on in Settings, not something they're dropped into on first launch —
  every existing precision mechanic was tuned against touch-drag, and it works in any physical posture.
- **U4** — Overall screen structure and navigation flow (Settings, the scope/range view, the DOPE panel,
  etc.) is **mirrored** from today's breakdown, adapted into SwiftUI idioms rather than redesigned.
  Consistent with I3 (state store) and I8 (bug-fixed logic) — redesigning the flow at the same time as
  changing the language would conflate two different kinds of change, making it harder to tell a
  translation error from a new design flaw.

## ADR candidates
- Reversing the web/PWA-vs-native decision — hard to reverse (real engineering cost either way),
  surprising without context (contradicts a decision already on record in two documents), and the result
  of a real trade-off (device reach/distribution model vs. owner stack comfort + Apple-native
  capabilities). `a-create-plan` writes it if this exploration lands on "port."

## Open — queued, in ask order
- (empty)

## Notes
- Owner's self-assessed unfamiliarity with the current web stack is a real driver here, separate from
  the device/provisioning question — worth tracking as its own factor rather than folding it silently
  into the account decision.
- `Feature-Peer-To-Peer-Multiplayer` (open, deferred) plans to port BTK's PeerJS/WebRTC approach — that
  premise no longer holds once the web build is retired (S3); the ticket's *goal* (remote head-to-head
  play) still stands, just needs a native transport (e.g. GameKit/Multipeer) when it's picked up. Owner
  chose to leave it for its own exploration later rather than fold it in now. At closing, add this as a
  note on the ticket itself (the one ticket-file edit still pending from this session).
