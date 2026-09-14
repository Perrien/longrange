# Roadmap — Swift Migration

> Produced by `/a-roadmap` from the exploration `Native-Swift-Port` (closed 2026-09-08), plus two
> structural questions answered live in this session (repo/package layout, oracle-harness mechanics)
> and one sequencing correction (the four-range catalog descoped from V0.6).
>
> This is not a plan `a-create-plan` output can skip — it exists so `a-create-plan` can be pointed at
> one version's entry below instead of the source exploration.

## Tech Stack

**Already settled** (`Design/Explorations/Native-Swift-Port.md`):
- Swift, native macOS + iOS, one Xcode project, **one multiplatform app target** — model code and
  SwiftUI views together, `#if os(iOS)`/`#if os(macOS)` only where behavior genuinely diverges
  (CoreMotion vs. mouse/trackpad). Paid Apple Developer account committed. *(S1, S3, and this session's
  layout decision.)*
- Physics: full Swift port of the ~3.5k-line core (integrator, atmosphere, drag tables, spin drift,
  Monte-Carlo dispersion, steel-target reaction physics). No C++ ships, and none touches the Swift
  toolchain at all — `GameBuild/engine/` + pristine `BallisticsToolkit/` are run **once, offline**, to
  export golden-vector fixture files (JSON/CSV) checked into the repo; XCTest asserts the Swift port
  against those fixtures within tolerance. Same pattern as `GameBuild/validation/` for the WASM build.
  *(I1, this session's harness decision.)*
- Rendering: SceneKit. *(I2 — flagged: verify SceneKit's current support status before writing the
  first SceneKit code, since that read has a knowledge cutoff.)*
- State: one `@Observable` class as a single app-wide store, mirroring today's one-Zustand-store shape.
  *(I3 — implies a minimum deployment target of iOS 17 / macOS 14, the Observation framework's floor.)*
- Persistence: SwiftData, local-only; CloudKit stays an available-later opt-in, never enabled in this
  ladder. *(I7, Non-goal 2.)*
- Testing: XCTest throughout, including translated fixtures from the existing TS test suites for logic
  with a documented bug-fix history. *(I8.)*
- UI: mirrors today's screen/nav breakdown (Settings, scope/range view, DOPE panel), adapted into
  SwiftUI idioms, not redesigned. *(U4.)*

**Standing constraints** (apply to every version, never assigned to one):
- Motion/accelerometer aiming is iOS-only; Mac always keeps mouse/trackpad pointer-aim. *(Non-goal 1.)*
- No cross-device save sync in this ladder. *(Non-goal 2.)*
- Nothing built should assume the app is permanently single-device/no-networking in a way that would
  block re-adding multiplayer via GameKit/Multipeer later. *(Forward reference — the note now on
  `Feature-Peer-To-Peer-Multiplayer`.)*
- Success is judged by "easier to grok and change," not "owner works independently" — a lens for close
  calls, not a checklist item. *(S5.)*

**Blocking prerequisite, before V0.1 starts (not a version — a doc fix):** `CLAUDE.md` and
`Design/btk-assessment-and-path-forward.md` currently state the web/PWA-vs-native decision as *locked*
the other way. Writing Swift code under that standing text is executing against a contradicted doc. The
ADR the exploration nominated ("Reversing the web/PWA-vs-native decision") must be written and both docs
corrected before or as part of V0.1 — flag this to whoever runs `a-create-plan` on V0.1.

---

## Version Ladder

**V0.1 — Physics port, oracle-validated**
Port the ~3.5k-line C++ physics core to Swift: point-mass trajectory integrator, atmosphere, drag
tables, spin drift, Monte-Carlo dispersion, steel-target reaction physics. *(I1, quoted: "No C++ ships
in the native app. The existing C++ engine and pristine BallisticsToolkit become the validation oracle
for the Swift port, the same golden-vector-diff pattern already used for the WASM build.")* Concretely:
run the existing engine once to export reference trajectories (drop/drift/TOF/velocity for known loads)
as fixture files; a Swift XCTest target asserts the ported physics against those fixtures within a
defined numeric tolerance. No app, no UI — headless. Checkable artifact: the fixture-diff test suite
passes.

Sized honestly this came to 10–11 tasks and 4–5 owner stops when `a-create-plan` scoped it — over that
skill's split thresholds — so V0.1 is itself three plan-level parts, each ending in a fixture-diff test
suite the owner can run and read the result of (headless, so "operate" means "run XCTest," not a UI):

1. `Swift-Physics-Port-1-Foundation-And-Harness` (**written, DRAFT**) — the blocking doc-fix + `ADR-0002`
   (`CLAUDE.md` and `btk-assessment-and-path-forward.md` corrected to match the reversal), the
   `GameBuild/swift/LongRange.xcodeproj` scaffold, the math-helper port (vector/quaternion/
   conversions/random/simplex-noise), and a fixture-loading test proving a Swift test target can read
   `GameBuild/validation/vectors/golden.json` (36 cases / 660 rows, verified count — the
   `README-native-matrix.md` figure of 636 is stale).
2. `Swift-Physics-Port-2-Trajectory-Core` (not yet written) — atmosphere, drag tables, the point-mass
   integrator, spin drift, and the wind field, checked against the *existing* `golden.json` oracle,
   which already exercises exactly this path.
3. `Swift-Physics-Port-3-Dispersion-And-Steel` (not yet written) — Monte-Carlo dispersion
   (`getRadialStandardDeviation`, `match/simulator.cpp` + `match/match.cpp`) and steel-target reaction
   physics (`rendering/steel_target.cpp`), both needing new fixture-export tooling since no golden
   vectors cover them today.

V0.1 as a whole is "done" — and V0.2 can start — only once part 3 ships. Parts 2 and 3 are authored one
at a time, each in its own fresh `a-create-plan` session, once the part before it has shipped.

**V0.2 — Core dial-or-hold shot loop (cutover version)**
One hardcoded rifle/ammo preset, one simple test range, SceneKit scene. Touch-drag aiming is the default
and, at this point, the only input — *(U3: "Default aiming mode on iOS is touch-drag, matching today's
only mode... every existing precision mechanic was tuned against touch-drag.")* Target resolution uses
the ported `aim-pick.ts` logic directly — *(I8: "same algorithm, same edge-case behavior, existing unit
tests translated to XCTest as a correctness oracle, explanatory comments carried forward"* —
specifically its elliptical crosshair-hit test and angular-vs-linear target-pick rule). Firing routes
through the V0.1-validated Swift physics; hit/miss is the observable result. State lives in the single
`@Observable` store (I3). Screen/nav shell follows U4's mirror-don't-redesign principle, established
here and carried forward by reference for every later version. **This is "working" per S4** ("'Working'
means the core dial-or-hold shot loop running natively — not full parity with every currently shipped
web feature") — **the moment this version runs, the web/PWA build is retired** *(S3: "The web/PWA build
is retired entirely once native ships; this is a full replacement, not a second parallel track")* and
the blocking-prerequisite ADR/doc fix above must already be in place.

**V0.3 — Motion aiming (iOS only)**
CoreMotion tilt-and-shift aiming, coexisting with touch-drag as a settings toggle — *(I4: "Motion aiming
coexists with touch-drag as a selectable mode... not a replacement... Motion aiming also needs a
calibration step: the phone does not need to be held vertically — the player holds it at whatever
natural angle they prefer, and calibration records that hold as the neutral/zero-tilt reference.")*
Calibration/recenter is available on demand, any time, not once per session *(I5)*, via an on-screen
button near the reticle, visible only in motion mode *(U1)*, confirmed by both a haptic tap and a visual
flash *(U2)*. Motion aiming gets its own sensitivity slider, separate from the existing drag-gain slider
*(I6)*. If CoreMotion permission is denied or unavailable, fall back to touch-drag with the toggle
disabled and an explanation, pointing at Settings *(I9)*. Constrained to iOS — Mac is untouched by this
version *(Non-goal 1)*.

**V0.4 — Persistence, zeroing, computed DOPE**
Bring in SwiftData for the first time — first real need for state that outlives a session (a saved
rifle/ammo profile) *(I7: "Persistence via SwiftData, local-only... available later without a rewrite
since SwiftData supports it as an opt-in")*. Rebuild the zeroing flow and computed DOPE natively.

**V0.5 — Truing + cartridge catalog**
Both truing levers (depends on V0.4's DOPE data to true against) and the 10-cartridge catalog, rebuilt
natively.

**V0.6 — One simple range + reactive steel**
A single, deliberately simple range — 3–4 targets at varying distances, not the full four-range
catalog. Reactive-steel target physics, mirage, impact calls, and recoil feedback port directly with
their existing bug-fix history and tests, same rule as V0.2's aim-pick *(I8, the remainder:
"`game/mirage-model.ts`, `game/impact-call.ts`, `game/recoil.ts`, `scope/steel-reactions.ts`... same
algorithm, same edge-case behavior, existing unit tests translated to XCTest as a correctness oracle")*.

**Deferred beyond this ladder:**
- The full four-range catalog (Range B, C-ELR, etc.) — flagged this session as needing real redesign
  work, not a port; `Feature-Range-C-ELR` already notes its own plan needs a rewrite. Not sized or
  sequenced here — likely needs its own exploration before it gets a version.
- Cross-device iCloud/CloudKit save sync — confirmed non-goal, not ticketed (owner declined at close of
  `Native-Swift-Port`). Still a real want; still untracked outside this document.
- Peer-to-peer multiplayer — out of scope of the exploration entirely; `Feature-Peer-To-Peer-Multiplayer`
  ticket already carries a note that its PeerJS/WebRTC premise is obsolete and it needs a native
  transport (GameKit/Multipeer) whenever it's picked up.

**Still open, blocking nothing above but worth tracking:** whether "hidden-truth" (per-instance
rifle/ammo variation) — already shipped on web per `CLAUDE.md`'s Progress section — is expected back
somewhere in V0.4–V0.6; S4's rebuild list doesn't name it. Not resolved here; flag it to whoever plans
V0.4.

---

Point `a-create-plan` at **V0.1's entry above**, not at `Native-Swift-Port.md` — everything it needs
(the physics scope, the fixture-harness approach, the "headless, no UI" boundary) is already quoted into
that entry. V0.1 is now three parts (see above) — point it at the lowest-numbered
`Swift-Physics-Port-*` part with no plan file yet, per `a-create-plan`'s own resume rules for a split
already under way.
