# Increment 0 — Foundations & proofs (task doc)

`Goal:` retire every existential risk before building the game. See
[`../build-plan.md`](../build-plan.md) §5 Increment 0 for rationale.
`Protocol:` [`execution-protocol.md`](./execution-protocol.md) — one task at a
time, verify, log in [`PROGRESS.md`](./PROGRESS.md).

**Increment exit checklist — ALL GREEN, increment complete 2026-07-13:**

- [x] Installed PWA cold-launches offline on the iPad and shows an engine-computed
      drop table (MIL+MOA, m+yd). *(0.6, owner-confirmed on device)*
- [x] A save survives PWA relaunch; JSON export→import round-trips. *(0.8,
      owner-confirmed: iPad force-quit/relaunch + second-browser import)*
- [x] Golden-vector diff runs in CI and is green; a deliberate break makes it red.
      *(0.7: CI green owner-confirmed; negative test verified — perturbed vector
      → exit 1)*
- [x] Native `ctest` suite runs without Emscripten installed. *(0.3 locally;
      also runs in CI's emsdk-free native job)*
- [x] OWNER CHECK passed: touch aiming judged controllable. *(0.9, five
      iterations; owner verdict "Controllable", wobble default 0.75)*

---

## Task 0.0 — Environment preflight (offline environment; see protocol §4b)

**Do:** Probe and record what this environment can actually do. Test each cheaply
and record PASS/FAIL in a new *Environment capabilities* table in `PROGRESS.md`:
(a) general internet (`curl -sI https://registry.npmjs.org` or equivalent);
(b) npm registry (`npm ping`); (c) git remote (`git ls-remote origin`);
(d) emsdk/emcc already installed? (`emcc --version`); (e) CMake ≥ 3.16, a C++17
compiler, Node ≥ LTS, Python 3 (`--version` each). For every FAIL that a task in
this increment needs, add an entry to the *Owner install queue* in `PROGRESS.md`
with exact commands (emsdk 4.0.17 per `BallisticsToolkit/.github/workflows/
deploy.yml`; `npm install` in `GameBuild/app/` once it exists; GoogleTest — see 0.3; git
push access). Batch them so the owner can do one install session.

**Done when:** capabilities table filled in; owner install queue written (or
empty because everything passed).
**Stop if:** nothing — this task cannot fail, only report.

## Task 0.1 — Prove the pristine BTK build

> **Toolchain decision (owner, 2026-07-13):** the 4.0.17 pin is replaced by
> **Emscripten 6.0.2 from the internal brew mirror** — newer is preferred; what
> matters is ONE recorded version used everywhere (local + root `ci.yml` + vector
> generation). If BTK does not compile under 6.0.2, apply minimal build-only
> patches per protocol §4.1 (as amended): `-Werror` warning fixes, linker-flag
> renames, dropping the vestigial `USE_WEBGL2`/`FULL_ES3` flags are all allowed;
> anything touching numerical code paths or optimization flags (`-O3`,
> `-ffast-math`) is not — escalate instead. Golden vectors (task 0.7) must be
> generated under this same toolchain.

**Do:** Ensure Emscripten **6.0.2** is available (owner-installed if 0.0 flagged
it). From `BallisticsToolkit/`, run `./build_web.sh -s`.
- **With internet:** open `http://localhost:8001/steel-sim/steel-sim.html`; fire a
  few shots. (steel-sim pulls Three.js from unpkg at page load — a BTK defect we
  fix in our own app, never in BTK.)
- **Offline (expected here):** steel-sim will fail to load. Instead open
  `http://localhost:8001/ballistic-calc/ballistic-calc.html` — it is CDN-free —
  and compute a trajectory; that fully proves the C++→WASM toolchain, which is
  this task's purpose. Note in `PROGRESS.md` that the steel-sim visual check was
  skipped for offline reasons (owner may run it once on a normal connection,
  optional).

**Done when:** the WASM build completes and ballistic-calc (or steel-sim, if
online) computes results from the locally built module.
**Stop if:** the build fails on the pinned emsdk — escalate before trying other
versions.

## Task 0.2 — Create `GameBuild/engine/` (owned copy of the BTK core)

**Do:** Create top-level `GameBuild/engine/`. Copy from `BallisticsToolkit/`: `src/`,
`include/`, `CMakeLists.txt`; copy `LICENSE` → `GameBuild/engine/LICENSE.BTK` and add an
attribution note in a new `GameBuild/engine/README.md` (what was copied, from which commit).
Do **not** copy `web/` — and therefore **delete the `copy_web_files` custom
target** from `GameBuild/engine/CMakeLists.txt` (it is `ALL` and would break every build
without `web/`; `GameBuild/engine/` is our owned copy, so editing its CMake is normal work,
not an oracle patch). Leave the C++ sources unchanged. Note: `SINGLE_FILE=1`
means the build emits a single `.js` with the WASM embedded — that satisfies this
task; whether to switch to a separate `.wasm` (smaller, streaming-compilable —
better for the PWA) is decided at task 0.4 and logged either way. Record the
source commit hash — it becomes `GameBuild/validation/ORACLE_VERSION` in task 0.7. Build
WASM: `mkdir GameBuild/engine/build-wasm && cd GameBuild/engine/build-wasm && emcmake cmake .. &&
emmake make -j`.

**Done when:** `GameBuild/engine/build-wasm/` emits a loadable `ballistics_toolkit_wasm.js`
module; a plain `emmake make` succeeds with no missing-directory errors;
`BallisticsToolkit/` is untouched (`git status` clean there).
**Stop if:** you feel the urge to "clean up" the C++ while copying. Don't —
CMake build plumbing is the only thing this task may change.

## Task 0.3 — Native build + first CTest suite

**Do:** Add a native (non-Emscripten) CMake path to `GameBuild/engine/CMakeLists.txt`
(guard the embind/emscripten flags behind `if(EMSCRIPTEN)`; exclude
`bindings.cpp` from the native target). Add GoogleTest — **offline note (protocol
§4b):** `FetchContent` needs the network; prefer `find_package(GTest)` against an
owner-installed copy, or have the owner drop a pinned googletest source tarball
into `GameBuild/engine/third_party/` and use `add_subdirectory`. Queue whichever for the
owner if 0.0 flagged no internet. Then `GameBuild/engine/tests/` with first tests: (a) `Conversions` round-trips
(yards↔m, MOA↔mrad↔rad, °F↔K); (b) ISA atmosphere spot values (15 °C sea level →
ρ≈1.225 kg/m³, speed of sound ≈340.3 m/s); (c) `computeZero` converges for a 6.5 CM
load at 100 m and the zeroed trajectory passes within tolerance of the aim point.

**Done when:** `cmake -B build-native && cmake --build build-native && ctest
--test-dir build-native` is green with no Emscripten in PATH; WASM build still
works.
**Stop if:** guarding the flags requires restructuring source files — escalate
with a proposal first.

## Task 0.4 — Walking-skeleton app + typed engine bridge

**Do:** Scaffold `GameBuild/app/` with Vite + React + TypeScript (npm; pinned deps: react,
three, zustand, idb, vite-plugin-pwa, vitest — exact versions recorded in
`PROGRESS.md`). **Offline note (protocol §4b):** `npm install` needs the registry
— write the complete `package.json` (all deps, exact pinned versions) first, then
queue a single `npm install` for the owner if 0.0 flagged no registry access;
verify with `npm ls --depth=0` before proceeding. Create `GameBuild/app/src/engine-bridge/`: loads the `GameBuild/engine/` WASM module
(modularized `BallisticsToolkit()` factory), exposes
`solveTrajectory(load, atmosphere, windVec, opts) → TrajectoryTable` and
`computeZero(...)`; **all embind `.delete()` calls live here**. Create
`GameBuild/app/src/units/` (MIL/MOA/metric/imperial conversion service) with Vitest tests.
Add a debug screen: inputs for a load, renders a drop/windage table at 100 m steps
in **MIL and MOA, metric and imperial side-by-side**.

> **Engine-artifact wiring (owner decision, 2026-07-13):** keep `SINGLE_FILE=1`
> (revisit only at 1.8's precache audit). Import the artifact via a Vite
> `resolve.alias` `@engine` → `../engine/build-wasm/ballistics_toolkit_wasm.js`,
> with `server.fs.allow` extended to `GameBuild/engine/`; the raw specifier lives
> in exactly one bridge file. Vitest inherits the alias from `vite.config.ts`.
> `GameBuild/validation/run.mjs` uses a plain relative `import()` (no Vite).
> Because the artifact is git-ignored: add `engine:build` npm script + a precheck
> in `dev`/`test` that fails with "run `npm run engine:build`" when it's missing.

**Done when:** `npm run dev` shows the debug table; for the 6.5 CM reference load
(pick box values; record them in `GameBuild/validation/loads.json`) the table matches
pristine BTK's ballistic-calc output for identical inputs (manually compare ≥5
rows; note them in the commit message); vitest green.
**Stop if:** you need engine API not exposed by embind — log it; do not hack around
via `Module` internals.

## Task 0.5 — CI: build + test + deploy skeleton

**Do:** `.github/workflows/ci.yml` at repo root: (1) native ctest; (2) WASM build
(**pinned to the same Emscripten version used locally — 6.0.2 per the task 0.1
decision**); (3) vitest; (4) `npm run build`; (5) deploy `GameBuild/app/dist` to GitHub
Pages on `main`. Base-path config for Pages.

**Done when:** CI green on a PR; the deployed URL serves the debug screen.
**Offline note:** CI itself runs on GitHub's infrastructure (has internet) — the
workflow file is written locally; if `git push` fails from this environment,
queue the push for the owner (protocol §4b.6) and have them report the CI result.

## Task 0.6 — PWA: manifest, service worker, offline

**Do:** vite-plugin-pwa: manifest (name, icons incl. `apple-touch-icon`,
`display: standalone`), Workbox precache of the full build **including the .wasm**
(check `globPatterns` covers it) — nothing loaded from any CDN (`grep -r
"unpkg\|cdn" GameBuild/app/src GameBuild/app/index.html` must be empty). iOS meta tags,
`viewport-fit=cover`.

**Done when:** on desktop: Lighthouse PWA installable check passes; DevTools
offline → reload works. On the iPad: Add to Home Screen → airplane mode → cold
launch shows the debug table. (This iPad step is an OWNER CHECK if the agent has
no device access.)

## Task 0.7 — Golden-vector harness v0

**Do:** Create `GameBuild/validation/`: `ORACLE_VERSION` (BTK base commit from 0.2 **plus
the list of any `oracle-patch:` commits and the Emscripten version — vectors are
only valid for that exact combination**);
`loads.json` (≥6 loads: .22 LR subsonic, .223, 6.5 CM, .308, .338 LM, .50 BMG —
box-realistic values, cite where they came from) × 3 atmospheres (ISA sea level;
hot/high; cold/dense) × wind cases (none; 10 mph full-value). `run.mjs` (Node):
loads **both** WASM builds (pristine BTK's and `GameBuild/engine/`'s), solves each case,
compares drop, windage, spin drift, TOF, retained velocity at 100 yd steps to max
supersonic range. Tolerance: relative ≤ 1e-4 (they're the same code today — expect
near-bit-equal; investigate anything larger). Wire into CI. Commit the generated
oracle vectors (`GameBuild/validation/vectors/*.json`) so future diffs don't depend on
rebuilding pristine BTK.

**Done when:** `node GameBuild/validation/run.mjs` green locally and in CI; **negative
test:** temporarily perturb one G7 Cd table entry in `GameBuild/engine/`, confirm the harness
fails, revert.
**Stop if:** outputs differ beyond tolerance already — that means the 0.2 copy
diverged; find out why before anything else.

## Task 0.8 — Durable save v1 + export/import

**Do:** `GameBuild/app/src/persistence/`: `SaveStore` interface (get/put/export/import/
migrate); IndexedDB impl via `idb` (db `longrange`, stores `save`, `meta`);
`schemaVersion: 1` = settings only for now. Call
`navigator.storage.persist()` on first run; show result + `storage.estimate()` on
the debug screen. Export = versioned JSON via share-sheet/download; import =
validate (JSON Schema) → migrate → apply. Vitest: round-trip, reject-invalid,
migration no-op v1→v1.

**Done when:** change a setting → kill app → relaunch → setting persists (desktop
+ iPad PWA); export file re-imports on a second browser profile and reproduces
state; vitest green.

## Task 0.9 — Touch-aiming spike (design-critical)

**Do:** Minimal Three.js scene in the app (flat ground plane, one 12″ plate at
500 yd scale, skybox color): scope overlay (circular mask + crosshair),
one-finger drag pans the view with sensitivity ∝ 1/magnification, pinch zoom
4.5–35×, on-screen fire button, a simulated hand wobble (~1 MOA slow drift) that
the player rides. Desktop fallback: mouse drag + wheel. Add a sensitivity slider.

**Done when:** OWNER CHECK — on the iPad, the owner can keep the crosshair on the
plate at 25× and press fire without wrenching the aim off, and calls it
"controllable". Record the chosen sensitivity curve values in the log.
**Stop if:** owner says it fights them — iterate here (this task may loop);
do NOT proceed to Increment 1 with unresolved aim feel.

## Task 0.10 — Increment exit

**Do:** Run the exit checklist at the top of this file; fix anything red; update
`PROGRESS.md` (`Current increment: 1`, add Increment-1 task rows from
[`increment-1.md`](./increment-1.md)); tag the repo `inc0-complete`.

**Done when:** checklist all green; owner has explicitly signed off in the
decisions log.
