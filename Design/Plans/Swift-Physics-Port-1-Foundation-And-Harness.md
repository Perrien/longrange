# Swift Physics Port — 1: Foundation And Harness

Status: **APPROVED 2026-09-08**

## Parts

For the owner and the next authoring session — not for the executor.

1. `Swift-Physics-Port-1-Foundation-And-Harness` — doc-fix + ADR, Xcode/SwiftPM scaffold, math-helper
   port, fixture-loading scaffold against the existing golden-vector oracle. ← this part
2. `Swift-Physics-Port-2-Trajectory-Core` — atmosphere, drag tables, the point-mass integrator, spin
   drift, and the wind field, checked against `GameBuild/validation/vectors/golden.json`.
3. `Swift-Physics-Port-3-Dispersion-And-Steel` — Monte-Carlo dispersion (radial SD/CEP) and
   steel-target reaction physics, both needing new fixture-export tooling.

| Exploration ID | Part |
|---|---|
| I1 (harness slice: no C++ ships, existing engine + BTK become the oracle) | 1 |
| I1 (trajectory slice: integrator, atmosphere, drag tables, spin drift, wind) | 2 |
| I1 (dispersion + steel slice) | 3 |

## Context

The owner is moving the game off the web/PWA stack (TypeScript + React + Three.js) onto native Swift
(macOS + iOS), per the exploration `Native-Swift-Port` (closed 2026-09-08) and `ADR-0002`. Two driving
goals: a language/stack the owner finds easier to maintain than the current one, and iPhone
accelerometer/motion aiming (CoreMotion), which the web stack cannot provide. This is a full
replacement — the web/PWA build is retired once the native core dial-or-hold shot loop reaches parity
(`Design/Plans/Roadmap-Swift-Migration.md` V0.2) — but that cutover is a later part of this ladder, not
this one. This part only lays the foundation: the doc correction the reversal requires, the project
skeleton, the portable math layer everything else depends on, and proof that a Swift test target can
read the existing validation oracle.

**What already exists that this builds on:**
- The ballistics core the port targets lives in `GameBuild/engine/` (owned copy of BTK), verified by
  listing: `src/ballistics/{simulator,trajectory}.cpp` (836 lines), `src/physics/atmosphere.cpp` (95
  lines), `src/physics/wind_generator.cpp` (472 lines), `src/rendering/{impact_detector,steel_target}.cpp`
  (682 + 759 lines), `src/match/{match,simulator,target,targets}.cpp` (469 lines), and
  `include/math/{vector,quaternion,conversions,random,simplex_noise}.h` (1,560 lines total). Pristine
  `BallisticsToolkit/` is the same shape and is git-ignored/local-only; it is never modified.
- `GameBuild/validation/run.mjs` (`run.mjs:1-17`, header comment) already runs a 36-case × per-load
  matrix (6 loads × 3 atmospheres × 2 wind cases, `loads.json`) through the OWNED WASM engine and diffs
  every row against `GameBuild/validation/vectors/golden.json` — generated once from pristine BTK — at
  `1e-4` relative tolerance. `GameBuild/validation/README-native-matrix.md` claims 636 rows, but this
  session counted the committed file directly and got **36 cases, 660 rows** — the README is stale; the
  fixture-loading test (Approach §9) asserts the verified number, not the doc's. This part's test proves
  a Swift test target can read that same committed file; Part 2 does the real physics comparison.
- No Monte-Carlo-dispersion or steel-target fixtures exist yet — `getRadialStandardDeviation` lives in
  `GameBuild/engine/src/match/match.cpp:97`, and steel-target reaction physics in
  `GameBuild/engine/src/rendering/steel_target.cpp`. Part 3 builds new fixture-export tooling for these;
  nothing in this part depends on them.
- `GameBuild/engine/tests/test_conversions.cpp` is the only existing native test file covering a math
  helper in scope for this part (the rest — vector, quaternion, random, simplex-noise — have no
  dedicated C++ test file today).
- No ADR existed yet for the original web-vs-native call before this session; `ADR-0002` (written with
  this part, per the exploration's ADR candidate) is now that record, and both `CLAUDE.md` and
  `Design/btk-assessment-and-path-forward.md` contradict it in their current committed text — the
  roadmap flagged this as blocking before any Swift code is written, so it is this plan's first task.

## Decisions (2026-09-08)

| # | Decision |
|---|---|
| D1 | Paid Apple Developer account is committed, covering Mac and iOS — removes the 7-day free-account provisioning expiry that originally ruled native out. *(S1.)* Binds T1's wording and makes T2's iOS-capable project setup meaningful rather than speculative. |
| D2 | Full replacement, not a parallel track — the web/PWA build is retired at the V0.2 cutover, not maintained alongside native indefinitely. *(S3.)* This is why the contradicted CLAUDE.md/assessment-doc text gets corrected now rather than left until the cutover actually happens: leaving it would mean executing native work against a doc that still calls native "ruled out." |
| D3 | One Xcode project, one multiplatform app target — physics/model code and (later) SwiftUI views live in the same target, not split into a separate framework or SwiftPM package. *(I3, this ladder's layout decision.)* Binds T2 and T3: every Swift file this part adds goes directly into the `LongRange` app target. |
| D4 | Minimum deployment target iOS 17 / macOS 14 — the floor for the `@Observable` state-management approach this ladder commits to at V0.2. *(I3, implied.)* Binds T2's project settings. |
| D5 | No C++ ships in the native app. `GameBuild/engine/` and pristine `BallisticsToolkit/` are run offline to produce fixture files checked into the repo; Swift/XCTest is checked against those fixtures, never against a live C++ call. *(I1, harness slice.)* Binds T4: this part reuses the *existing* `GameBuild/validation/vectors/golden.json` rather than inventing a new export path, since Part 2's needs are already covered by it. |
| D6 | Logic with a documented correctness/bug-fix history gets its existing unit tests translated to XCTest directly. *(I8.)* Where no C++ test exists for a ported file — true for `vector.h`, `quaternion.h`, `random.h` in this part — write new XCTest characterization tests instead: pin down the Swift port's behavior at values worked by hand, since there is no existing test to translate. `conversions.h` has `test_conversions.cpp`; that one translates directly. **Exception: `simplex_noise.h`** gets no new characterization test in this part — its only meaningful correctness check is bit-similarity to the C++ output, which Part 2's wind-field fixtures already prove; a hand-picked characterization value here would just be a second, weaker copy of that same check, written before the oracle that actually matters is in place. |
| D7 | Project layout: `GameBuild/swift/LongRange.xcodeproj`, sibling to `engine/`, `app/`, `validation/` (matches the existing `GameBuild/` structure). App target `LongRange`, unit test target `LongRangeTests`. Bundle identifier `com.longrange.LongRange` is a **placeholder** — the owner's real reverse-DNS/Apple Developer Team ID is not recorded anywhere in this project's documents, and is out of scope until an actual TestFlight/App Store submission, which is well beyond this ladder. Filed as a Deferred ticket at close-out. |

## Tickets closed by this plan

none — closed in the final part.

## Prefactoring

None needed. Every file this part touches is either brand new Swift code, a brand-new Xcode project, or
a documentation correction — nothing existing is being restructured or moved.

## Approach

Four things land, in dependency order: the doc correction the reversal requires, the Xcode project
skeleton, the portable math layer, and a fixture-loading test proving a Swift test target can read the
existing validation oracle. Nothing here writes ballistics logic — that starts in Part 2.

### 1. `CLAUDE.md`

Three edits, each replacing an exact block:

**Edit A** — replace the hard-constraints line at `CLAUDE.md:14-17` (`**Hard constraints** (binding on
everything... runs installable and offline on iPad/iPhone with **no paid Apple developer account and
no re-signing**...`) with:

```
**Hard constraints** (binding on everything, detailed in `Design/feature-catalog.md` §0): runs
installable and offline on iPad/iPhone and Mac; client-side persistence with no required backend;
**MIL and MOA equally**, metric and imperial both; **no money economy**; **no hunting or animals** —
steel and human silhouettes only.
```

(The no-paid-account clause is dropped outright — `ADR-0002` reverses it, D1.)

**Edit B** — replace the Shipping-target bullet at `CLAUDE.md:52-53` (`- **Shipping target:** an
installable web/PWA. Native Swift was ruled out by the free-Apple-account provisioning expiry — see
`Design/btk-assessment-and-path-forward.md`.`) with:

```
- **Shipping target:** native macOS + iOS (Swift), replacing the web/PWA build. Reversed 2026-09-08 —
  see `ADR-0002` and the exploration `Native-Swift-Port`. The paid Apple Developer account this depends
  on is now committed, removing the free-account 7-day provisioning expiry that originally ruled native
  out. **The web/PWA build remains the live shipped product until the native core dial-or-hold shot
  loop reaches parity** (`Roadmap-Swift-Migration` V0.2) — this is a staged cutover, not a switch
  flipped today.
```

**Edit C** — at `CLAUDE.md:54-57` (the Stack & reuse bullet), append one sentence after the existing
text (`...Decided in `Design/build-plan.md` §2.`), keeping everything before it verbatim:

```
Superseded by `ADR-0002` as of the native cutover — neither the C++ engine nor pristine BTK is ported
away; both become the Swift port's validation oracle, the same role they play for the web build today.
```

### 2. `Design/btk-assessment-and-path-forward.md`

**Edit A** — replace the status line at line 3 (`` `Status: DECIDED — web/PWA on BTK (Option A)`  ·
`Date: 2026-07-10`  ·  `Phase: 1 → 2 bridge` ``) with:

```
`Status: SUPERSEDED by ADR-0002 (2026-09-08)` · `Date: 2026-07-10` · `Phase: 1 → 2 bridge`
```

**Edit B** — after the existing `> **Decision (2026-07-10):**...` blockquote block (ending `...archived;
superseded by [`build-plan.md`](./build-plan.md))*.`, around line 13), insert a new blockquote line:

```
>
> **Superseded 2026-09-08 by `ADR-0002`:** the owner committed to a paid Apple Developer account,
> removing the device constraint this decision was driven by. See the exploration `Native-Swift-Port`
> and `Design/Plans/Roadmap-Swift-Migration.md`. §4 and §5 below are kept as historical record —
> unchanged.
```

**Edit C** — after the "Conclusion" paragraph in §4 (ending `...where haptics, gyro aiming, and CloudKit
sync would pay off). Option C (wrapped C++) stays the fallback if a native route is chosen but the
physics proves fiddly to port.`), add one line:

```
**Superseded 2026-09-08:** the paid-account premise this conclusion rests on no longer holds — see
`ADR-0002`.
```

**Do not** rewrite §1–§3, §5–§8, or the TL;DR — they remain accurate as a record of BTK's capability
inventory and the Bucket A/B gap analysis, which `ADR-0002` does not touch.

### 3. New: `GameBuild/swift/LongRange.xcodeproj`

A new Xcode project, sibling to `engine/`, `app/`, `validation/` under `GameBuild/` (D7). Create it with
Xcode's "App" template, multiplatform (D3 — the destinations are iOS and macOS, one target, not two):

- **Project name:** `LongRange`. **App target:** `LongRange` (multiplatform: macOS + iOS destinations
  in the one target, per D3). **Test target:** `LongRangeTests` (unit test bundle, XCTest, added via
  Xcode's own "add test target" flow so it is wired into the scheme automatically).
- **Interface:** SwiftUI (required by the template even though no view code is written in this part —
  Xcode's multiplatform App template always generates a default `ContentView`/`App` entry point; leave
  the generated placeholder `ContentView.swift` and `LongRangeApp.swift` untouched, since Part 2 is
  where real UI-adjacent decisions start, if any — V0.1 stays headless per the roadmap).
- **Deployment target:** iOS 17.0, macOS 14.0 (D4 — the `Observation` framework floor this ladder
  commits to at V0.2; setting it now avoids a later project-settings change).
- **Bundle identifier:** `com.longrange.LongRange` (D7 — explicit placeholder, ticketed in Deferred).
- **Language:** Swift, no Core Data / no CloudKit checkboxes ticked (SwiftData arrives at V0.4, D7 of
  `Roadmap-Swift-Migration`, not here).
- Add a `Physics/` group (plain filesystem folder, referenced by the Xcode project) inside the
  `LongRange` target for every file task 3 onward creates — `GameBuild/swift/LongRange/Physics/`. This
  keeps the ported math/physics code visibly separate from the generated SwiftUI scaffold inside the one
  target (D3: one target, but folder grouping still matters for navigability).
- Commit the `.xcodeproj` package itself (all its contents except `xcuserdata/`, which Xcode's default
  `.gitignore` template already excludes — verify a `.gitignore` exists inside the `.xcodeproj` bundle
  or add one covering `xcuserdata/` and `project.xcworkspace/xcuserdata/`).

Then edit `CLAUDE.md`'s repository-structure tree (`CLAUDE.md:225-228`, the `GameBuild/` block) — change
the closing `└── validation/` line to `├──` and add one new line after it:

```
│   ├── engine/        ← owned copy of the BTK C++/WASM core (extended for Bucket A); native tests
│   ├── app/           ← the PWA: TypeScript + React + Three.js + Vite (retired at native cutover, ADR-0002)
│   ├── validation/    ← golden-vector harness + fixtures (oracle diff vs BallisticsToolkit/)
│   └── swift/         ← the native Swift port (ADR-0002): LongRange.xcodeproj, physics-first, no UI until V0.2
```

**Do not** add SwiftData, CloudKit capabilities, signing team selection, or any entitlement beyond what
the App template generates by default — those are later versions' decisions (D7 of
`Roadmap-Swift-Migration` for SwiftData; signing is untouched until an actual TestFlight/App Store push,
out of scope for this whole ladder as currently planned).

### 4. New: `GameBuild/swift/LongRange/Physics/Vector2D.swift`, `Vector3D.swift`

Direct port of `GameBuild/engine/include/math/vector.h` (439 lines, read in full this session). Two
`struct`s, `Equatable`, mirroring every member 1:1 — no renaming, since Part 2/3 code and its tests will
call these by the same names as the C++ header to keep the mental map matching (I8's reasoning, applied
here even though vector.h itself carries no bug-fix history):

- `Vector2D`: stored `var x: Float`, `var y: Float`. `init()` (zero), `init(_ x: Float, _ y: Float)`.
  Operators `+`, `-` (binary and unary), `*(Float)`, `*(Vector2D)` (element-wise), `/(Float)`,
  `/(Vector2D)` (element-wise), `+(Float)`, `-(Float)`, and compound `+=`, `-=`, `*=(Float)`,
  `/=(Float)`. Methods `magnitude() -> Float`, `normalized() -> Vector2D` (returns `Vector2D()` if
  magnitude is `0`, exactly as `vector.h:163-169`), `dot(_:) -> Float`, `lerp(_:_:) -> Vector2D`. Free
  functions `*(Float, Vector2D)`, `+(Float, Vector2D)`, `-(Float, Vector2D)` for the left-hand-scalar
  cases (`vector.h:190-194`).
- `Vector3D`: same shape plus `z: Float`, plus `cross(_:) -> Vector3D` (`vector.h:390`) and the
  free function `lerp(_ a: Vector3D, _ b: Vector3D, _ t: Float) -> Vector3D` (`vector.h:438`, alternative
  free-function syntax — port both the method and the free function, since callers in later parts use
  either form in the C++ source).
- Swift has no `constexpr`; drop it silently — every one of these is a pure value computation, so plain
  `func`/computed-property is the direct equivalent. Do not add `@inlinable` or any other attribute not
  asked for here.
- No existing C++ test covers `vector.h` (confirmed this session). Per D6, add
  `LongRangeTests/VectorTests.swift` with hand-worked characterization values: `Vector3D(3,4,0)
  .magnitude() == 5`; `Vector3D(1,0,0).cross(Vector3D(0,1,0)) == Vector3D(0,0,1)`;
  `Vector2D(2,0).normalized() == Vector2D(1,0)`; `Vector3D().lerp(Vector3D(2,4,6), 0.5) ==
  Vector3D(1,2,3)`. Four assertions is enough — this is a baseline, not exhaustive coverage.

### 5. New: `GameBuild/swift/LongRange/Physics/Quaternion.swift`

Direct port of `GameBuild/engine/include/math/quaternion.h` (228 lines, read in full this session). One
`struct Quaternion` with stored `var w, x, y, z: Float`:

- `init()` → identity (`w=1,x=0,y=0,z=0`), `init(_ w: Float, _ x: Float, _ y: Float, _ z: Float)`.
- `static func fromAxisAngle(_ axis: Vector3D, _ angle: Float) -> Quaternion` (`quaternion.h:44-50`).
- `static let identity = Quaternion(1, 0, 0, 0)` (or a computed static var — either is fine, since
  nothing here is a judgment call about behavior).
- `*(Quaternion) -> Quaternion` (Hamilton product, `quaternion.h:63-67`, copy the exact term order) and
  `*=`.
- `magnitude() -> Float`, `magnitudeSquared() -> Float`.
- `mutating func normalize()` (in place, `1e-8` guard exactly as `quaternion.h:91-102`) and
  `normalized() -> Quaternion` (non-mutating copy).
- `conjugate() -> Quaternion`.
- `rotate(_ v: Vector3D) -> Vector3D` — port the optimized cross-product form at `quaternion.h:125-133`
  verbatim (do not substitute the textbook `q*v*q⁻¹` triple-product form; they're equivalent but the
  point of a direct port is not re-deriving).
- `func toRotationMatrix() -> [Float]` returning a 9-element column-major array (Swift has no raw
  `float[9]` out-param convention; a `[Float]` of count 9, or a `(Float,Float,...)` 9-tuple, is the
  direct equivalent — pick the array, since it's what a caller building a `SCNMatrix4` in a later
  version will want to iterate).
- `slerp(_ other: Quaternion, _ t: Float) -> Quaternion` — port `quaternion.h:175-206` verbatim,
  including the `0.9995` linear-interpolation short-circuit for near-identical quaternions.
- `mutating func integrateAngularVelocity(_ angularVelocity: Vector3D, dt: Float)` — port
  `quaternion.h:214-225` verbatim, including the `1e-8` no-op guard.
- No existing C++ test covers `quaternion.h` (confirmed this session). Per D6, add
  `LongRangeTests/QuaternionTests.swift` with hand-worked characterization values:
  `Quaternion.identity.rotate(Vector3D(1,0,0)) == Vector3D(1,0,0)`;
  `Quaternion.fromAxisAngle(Vector3D(0,0,1), .pi/2).rotate(Vector3D(1,0,0))` is approximately
  `Vector3D(0,1,0)` (accuracy `1e-5`); `Quaternion.identity.slerp(Quaternion.identity, 0.5) ==
  Quaternion.identity`. Three assertions is enough.

### 6. New: `GameBuild/swift/LongRange/Physics/Conversions.swift`

Direct, mechanical port of every `static constexpr float` function in
`GameBuild/engine/include/math/conversions.h` (351 lines; ~100 one-line unit-conversion formulas,
grep-verified this session at `conversions.h:25-296` for the full name list — length, velocity, mass,
temperature, angle, pressure, acceleration, force, energy, density, area, angular-velocity groups). Port
every function 1:1 into `enum Conversions` (no cases — a pure namespace, matching how the C++ class is
used as a static-only holder) with `static func` and the **exact same name and exact same multiplying
constant**, copied character-for-character from the header, not re-derived or rounded differently.
`test_conversions.cpp` (44 lines, read this session) is the correctness oracle for the subset it covers
— translate it directly (D6): `DistanceRoundTrip`, `AngleRoundTripAndAnchors`,
`TemperatureRoundTripAndAnchors`, same `EXPECT_NEAR` tolerances, as three `XCTAssertEqual(..., accuracy:)`
tests in `LongRangeTests/ConversionsTests.swift`.

**Do not** invent conversions the header doesn't have, and do not skip any group for brevity — a caller
in Part 2 or 3 reaching for a function this task silently dropped is exactly the failure mode a
mechanical 1:1 port exists to prevent.

### 7. New: `GameBuild/swift/LongRange/Physics/BTKRandom.swift`

Port of `GameBuild/engine/include/math/random.h` (80 lines, read in full this session — the whole
file). C++'s `Random` wraps a shared, seedable `std::mt19937`; Swift's standard library has no seedable
global generator, so this task adds one rather than approximating with `SystemRandomNumberGenerator`
(which cannot be seeded, and this port needs `seed(_:)` for reproducible tests):

- `struct SplitMix64: RandomNumberGenerator` — the standard 64-bit SplitMix64 generator (`state
  += 0x9E3779B97F4A7C15`, then the two xor-shift-multiply mix steps), seeded from a `UInt64`. This is a
  well-known, five-line algorithm — implement it directly, don't pull in a package for it.
- `enum BTKRandom` mirroring `Random`'s static surface 1:1: `static func seed()` (time-based, using
  `DispatchTime.now().uptimeNanoseconds` as the seed source — the direct Swift equivalent of
  `random.h:15-19`'s `high_resolution_clock`), `static func seed(_ value: UInt32)`, `static func
  next() -> UInt32`, `static func nextFloat() -> Float` (`[0, 1)`), `static func uniform(_ min: Float, _
  max: Float) -> Float`, `static func uniformInt(_ min: Int, _ max: Int) -> Int`, `static func
  normal(mean: Float = 0, stddev: Float = 1) -> Float`, `static func shuffle<T>(_ array: inout [T])`.
- Backing state: `static var generator = SplitMix64(seed: ...)` behind a lock or `@MainActor`/serial
  queue is **not required for this part** — the C++ original has no thread-safety either (a bare
  `static std::mt19937`), so match that: a plain `static var`, no synchronization added.
- `normal(mean:stddev:)` needs a normal-distribution sample from a uniform generator: use the
  Box-Muller transform (two uniform samples → one normal sample) — a standard, well-documented
  technique, not a judgment call.
- No existing C++ test covers `random.h` (confirmed this session — `tests/` has no `test_random.cpp`).
  Per D6, write new XCTest characterization tests in `LongRangeTests/BTKRandomTests.swift`: seeding with
  the same value twice produces the same sequence from `next()`; `uniform(min:max:)` output stays in
  range across many samples; `normal()`'s sample mean over a large N is within a loose tolerance of the
  requested `mean`. These pin today's Swift behavior as the baseline — they are not required to match
  the C++ output bit-for-bit, since nothing downstream checks that (Monte-Carlo fixtures in Part 3 check
  statistical properties, not RNG-stream equality).

### 8. New: `GameBuild/swift/LongRange/Physics/SimplexNoise.swift`

Port of `GameBuild/engine/include/math/simplex_noise.h` (462 lines). **Unlike the other math files,
this one must be translated line-by-line from the permutation tables and gradient-selection logic
outward** — not re-implemented from a different simplex-noise reference implementation — because Part
2's wind-field fixtures (`GameBuild/validation/vectors/golden.json`'s wind cases) depend on
`WindGenerator` producing bit-similar output within the existing `1e-4` relative tolerance
(`run.mjs:28`), and `WindGenerator` samples this class. Getting a *different but valid* simplex-noise
algorithm here would pass this part's own checks (there are none needed for this file in Part 1 beyond
compiling) and fail Part 2's oracle diff for a reason that would look like a wind-model bug rather than
a noise-implementation mismatch.

- `class SimplexNoise` (a class, not a struct — the C++ version holds a permutation table that later
  callers may want to construct once and share, matching reference semantics) with `noise1D(_ x: Float)
  -> Float`, `noise2D(_ x: Float, _ y: Float) -> Float`, `noise3D(_ x: Float, _ y: Float, _ z: Float) ->
  Float`, `noise4D(_ x: Float, _ y: Float, _ z: Float, _ w: Float) -> Float` — same four public methods
  as `simplex_noise.h:33,62,128,264`, same internal permutation/gradient tables, copied verbatim.
- This part adds no fixture check for it (there is no existing noise-specific C++ test either) — Part 2
  is where its correctness actually gets proven, via the wind-field rows in `golden.json`. Note this
  explicitly in the task's own notes so Part 2's author doesn't assume it was already validated here.

### 9. New: `GameBuild/swift/LongRangeTests/GoldenFixtureLoadTests.swift`

Proves the test target can read `GameBuild/validation/vectors/golden.json` — the file this session
verified directly (not the `README-native-matrix.md` count, which is stale): **36 cases, 660 rows
total**, each row shaped `{rangeM, dropM, windageM, velocityMps, timeOfFlightS}` per case
`{loadId, atmosphere, wind, rows}` (verified via `python3 -c "import json; ..."` against the committed
file this session).

- Add `GameBuild/validation/vectors/golden.json` to the `LongRangeTests` target's **Copy Bundle
  Resources** build phase (Xcode: drag the file into the test target, uncheck "copy items if needed" is
  not relevant since it's outside the project folder — use "create folder references" or add via
  "Add Files to..." with the target membership checkbox on `LongRangeTests` only, **not** `LongRange`).
  This bundles the committed file into the `.xctest` bundle; it is never duplicated into the project
  folder and never edited by anything in `GameBuild/swift/`.
- `struct GoldenRow: Decodable { let rangeM, dropM, windageM, velocityMps, timeOfFlightS: Double }`,
  `struct GoldenCase: Decodable { let loadId, atmosphere, wind: String; let rows: [GoldenRow] }`,
  `struct GoldenFile: Decodable { let cases: [GoldenCase] }` — field names match the JSON exactly (no
  `CodingKeys` needed).
- One test, `testLoadsCommittedGoldenVectors()`: locate the resource via `Bundle(for: Self.self)
  .url(forResource: "golden", withExtension: "json")`, decode it with `JSONDecoder`, and assert
  `cases.count == 36` and `cases.reduce(0) { $0 + $1.rows.count } == 660`.

**Verification handle for this task's owner stop** (see Tasks below) reads this test's output directly
— see T4.

**Do not** write any physics comparison logic here (no `rowDiff`, no tolerance check) — this task only
proves the file loads and parses with the right shape. Part 2 is where the numbers get compared against
a Swift-computed trajectory.

## Explicitly not doing

- **Any SwiftUI/UI code beyond the Xcode App template's own generated files.** V0.1 is headless per the
  roadmap (`Roadmap-Swift-Migration` V0.2 is where the shot loop and its screen appear); touching
  `ContentView.swift` now would be scope creep with nothing to verify it against yet.
- **Real code signing, a real bundle identifier, or any distribution step.** `com.longrange.LongRange`
  is a placeholder (D7); nothing in this ladder submits to TestFlight or the App Store.
- **Porting any ballistics logic** — atmosphere, drag tables, the trajectory integrator, spin drift,
  the wind field's *sampling* logic (only `SimplexNoise`, its dependency, is ported here), Monte-Carlo
  dispersion, or steel-target reaction physics. All of that is Parts 2 and 3.
- **Retiring `GameBuild/app/`.** The web/PWA build keeps shipping and keeps working throughout this
  entire ladder until the V0.2 cutover; nothing in this part touches it.
- **SwiftData or any persistence.** Arrives at V0.4 per the roadmap.

## Tasks

| # | Task | Status | Then | Commit | Note |
|---|---|---|---|---|---|
| T1 | Correct the contradicted locked decision in `CLAUDE.md` and `btk-assessment-and-path-forward.md` | not started | continue | — | |
| T2 | Xcode project scaffold: `LongRange.xcodeproj`, App + Tests targets | not started | continue | — | |
| T3 | Port math helpers (Vector2D/3D, Quaternion, Conversions, BTKRandom, SimplexNoise) + characterization tests | not started | checkpoint | commit | |
| T4 | Fixture-loading test against `golden.json`; close out | not started | **owner stop** | commit + push | |

**T1 — Correct the contradicted locked decision**

- **Files:** `CLAUDE.md` (edit), `Design/btk-assessment-and-path-forward.md` (edit)
- **Done when:**
  - The three `CLAUDE.md` edits (Approach §1, Edits A–C) and three `btk-assessment-and-path-forward.md`
    edits (Approach §2, Edits A–C) are applied exactly as specified.
  - `grep -n "no paid Apple developer account" CLAUDE.md` returns no matches.
  - `grep -c "ADR-0002" CLAUDE.md Design/btk-assessment-and-path-forward.md` reports at least 1 for
    each file.
- **Do not:** touch `Design/feature-catalog.md`, `Design/build-plan.md`, or §1–§3/§5–§8 of the
  assessment doc — they remain accurate and unrelated to this reversal.

**T2 — Xcode project scaffold**

- **Files:** `GameBuild/swift/LongRange.xcodeproj/**` (new), `GameBuild/swift/LongRange/LongRangeApp.swift`
  (new, template-generated), `GameBuild/swift/LongRange/ContentView.swift` (new, template-generated),
  `GameBuild/swift/LongRangeTests/` (new, template-generated test target scaffold), `CLAUDE.md` (edit —
  repository-structure tree only)
- **Done when:**
  - `xcodebuild -project GameBuild/swift/LongRange.xcodeproj -scheme LongRange -destination 'platform=macOS' build`
    exits 0.
  - `xcodebuild -project GameBuild/swift/LongRange.xcodeproj -scheme LongRange -destination 'platform=macOS' test`
    exits 0 (the template's own placeholder test, if any, passes).
  - `CLAUDE.md`'s `GameBuild/` tree block includes the new `swift/` line exactly as given in Approach §3.
  - Bundle identifier is `com.longrange.LongRange`; deployment targets are iOS 17.0 / macOS 14.0.
- **Do not:** enable SwiftData, CloudKit, or any other capability; select a signing team; add a Swift
  Package dependency; edit the generated `ContentView.swift`/`LongRangeApp.swift` beyond what the
  template produces.

**T3 — Port math helpers**

- **Files:** `GameBuild/swift/LongRange/Physics/Vector2D.swift`, `Vector3D.swift`, `Quaternion.swift`,
  `Conversions.swift`, `BTKRandom.swift`, `SimplexNoise.swift` (all new); `GameBuild/swift/LongRangeTests/
  VectorTests.swift`, `QuaternionTests.swift`, `ConversionsTests.swift`, `BTKRandomTests.swift` (all new)
- **Done when:**
  - `xcodebuild ... test` passes, including all four new test files.
  - `ConversionsTests` has exactly the three cases translated from `test_conversions.cpp`
    (`DistanceRoundTrip`, `AngleRoundTripAndAnchors`, `TemperatureRoundTripAndAnchors`), same tolerances.
  - Every function/type named in Approach §4–§8 exists with the specified signature.
  - `Conversions.swift` contains a function for every `static constexpr float` function in
    `conversions.h` — spot-check by comparing function counts (`grep -c "static constexpr float"
    GameBuild/engine/include/math/conversions.h` vs. `grep -c "static func" .../Conversions.swift`;
    they must match).
- **Do not:** add characterization tests for `SimplexNoise` (D6's carve-out — Part 2's fixtures are its
  real check); re-derive any conversion constant instead of copying it verbatim; add thread-safety to
  `BTKRandom` that `random.h` itself doesn't have.

**T4 — Fixture-loading test; close out**

- **Files:** `GameBuild/swift/LongRangeTests/GoldenFixtureLoadTests.swift` (new), plus whatever Xcode
  project-file changes result from adding the bundled resource
- **Done when:**
  - `xcodebuild ... test` passes, including `testLoadsCommittedGoldenVectors()` asserting `cases.count
    == 36` and total row count `== 660`.
  - Every item in this plan's Deferred section (below) has a corresponding ticket in
    `Design/Tickets/`, `Status: untriaged`.
  - The untriaged-ticket count in `Design/Tickets/` is reported as one line in this task's completion
    note.
  - `commit + push` with the message below.
  - Per `Design/Execution-Protocol.md`'s archive routine: **do not** archive anything and **do not**
    close any tickets — this is part 1 of 3; the exploration `Native-Swift-Port` stays live as the
    design source for Parts 2 and 3, and this plan closes no tickets (Tickets closed by this plan:
    none).
- **Verification handle** — `permanent`:
  - **Where:** Xcode's Test navigator (⌘6) or `xcodebuild test` console output, test
    `GoldenFixtureLoadTests.testLoadsCommittedGoldenVectors()`.
  - **Positive:** run the test target → the test passes and the console reports the file was found and
    decoded (a `print` or the assertion itself naming `36` cases / `660` rows).
  - **Negative:** temporarily rename `golden.json` to something else in a scratch copy of the project
    (not committed) → the test fails with a "resource not found" error rather than silently reporting 0
    cases. This proves the test is reading the real bundled file, not a hardcoded pass.
  - **Reads:** `GoldenFile`/`GoldenCase`/`GoldenRow` decoding in `GoldenFixtureLoadTests.swift`, which in
    turn depends on the actual bundled `golden.json` — delete the resource reference and the test breaks.

```
swift-physics-port-1 T4: land the Xcode project skeleton and math-helper port, prove the fixture oracle loads

- ADR-0002 reverses the web/PWA-vs-native decision; CLAUDE.md and the assessment doc corrected to match
- new GameBuild/swift/LongRange.xcodeproj: multiplatform App target, no UI work yet (headless, per V0.1)
- Vector2D/3D, Quaternion, Conversions, BTKRandom, SimplexNoise ported from GameBuild/engine/include/math/
- LongRangeTests reads the committed golden-vector oracle (36 cases / 660 rows) — Part 2 does the real diff
```

## Deferred

- Replace the placeholder bundle identifier `com.longrange.LongRange` (D7) with the owner's real
  reverse-DNS identifier and Apple Developer Team ID before any TestFlight/App Store submission. File as
  `Chore-Set-Real-Apple-Bundle-Identifier`, `Status: untriaged`.
