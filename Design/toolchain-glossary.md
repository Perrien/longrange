# Toolchain Glossary

Plain-language reference for every piece of technology in this project. One entry per
tool: **what it is**, **why it's here**, and **whether you need to hold it in your
head**.

This exists because the owner knows the ballistics domain well and the build toolchain
barely — a normal division of labor for a project built on a borrowed C++ engine. Nothing
in here is domain knowledge; for ballistics terms see `Wiki/Home.md`.

**"Hold this?" column:** `Yes` = you need it to make decisions · `Symptom only` = you
just need to recognize one failure signal · `No` = plumbing, the agent handles it.

---

## If you remember only five things

1. **The engine is C++; browsers can't run C++.** Emscripten compiles it to
   WebAssembly so Safari on your iPad can run it. That's the whole reason the toolchain
   is complicated.
2. **`node GameBuild/validation/run.mjs` must print `0.000e+0`.** That's the project's
   single most important health check — it means the physics hasn't changed. Anything
   else, stop and suspect the Emscripten version.
3. **Emscripten is pinned to 6.0.6** everywhere: your machine, CI, and the saved
   reference numbers. Never upgrade one without the others — and when you do bump it,
   *measure* rather than assume (see the 2026-08-07 note in `ORACLE_VERSION` for the
   procedure that worked).
4. **The game reaches your iPad through GitHub Pages, not through a file copy.** Push
   to `main` → CI builds → Pages serves it → the iPad installs it as an app.
5. **Two test suites, two different things.** `ctest` tests the C++ physics (30 tests).
   `vitest` tests the TypeScript app (1514 tests). Both must be green.

## How the pieces connect

```
28 C++ files                    the physics: trajectory, atmosphere, wind, steel
  │
  ├─ emcc (Emscripten) ──►  ballistics_toolkit_wasm.js      ← what the game uses
  │      + embind             (WebAssembly, 247,898 B)
  │                                    │
  │                          engine-bridge/index.ts          ← TypeScript talks to it
  │                                    │
  │                          React + Three.js app            ← the game you see
  │                                    │
  │                          Vite build ──► dist/ ──► GitHub Pages ──► iPad
  │
  └─ clang (normal compiler) ──►  ctest / GoogleTest         ← fast C++ tests, no browser
```

---

## The engine: getting C++ into a browser

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **C++** | The language the physics engine is written in. 28 files under `GameBuild/engine/`. | It's what BallisticsToolkit was written in. Not a choice we made. | Yes |
| **WebAssembly / WASM** | A compact binary format that browsers run at close to native speed. Think "a way to ship compiled code to a browser." | The only way to run the C++ physics in Safari. | Yes |
| **Emscripten** | A compiler that turns C++ into WebAssembly. Built on the same machinery as normal compilers, aimed at browsers instead of chips. | Converts the engine into something the game can load. | Yes |
| **`emcc`** | The Emscripten compiler command itself — a drop-in replacement for `gcc`/`clang`. | What actually does the compiling. | No |
| **`emcmake` / `emmake`** | Thin wrappers that run CMake/make using `emcc` instead of your system compiler. | Why `npm run engine:build` reads `emcmake cmake … && emmake make …`. It's an ordinary build with the compiler swapped. | No |
| **emsdk** | The **installer and version manager** for Emscripten — like `nvm` for Node or `pyenv` for Python. Not an alternative to Emscripten; it's how you get a specific version of it. The only two install routes are emsdk and Homebrew — **`pip` is not a route**, despite `emcc` being partly a Python script and Homebrew's formula depending on `python@3.14`. | **Not used locally** — `brew install emscripten` is the local route. emsdk matters for two reasons: CI uses it (`mymindstorm/setup-emsdk@v14`), and it's the only way to install a *specific older* version, which Homebrew can't do. | No |
| **embind** | Emscripten's C++↔JavaScript bridge. `GameBuild/engine/src/bindings.cpp` is a list of "expose this C++ class to JavaScript" declarations. | Without it you'd have a compiled blob with no way to call into it. | No |
| **`ballistics_toolkit_wasm.js`** | The compiled engine. One file, 247,898 B, in `GameBuild/engine/build-wasm/`. Because the build uses `SINGLE_FILE=1`, the WebAssembly is embedded inside this JavaScript file — which is why there's no separate `.wasm` file. | The artifact the app loads. Git-ignored, so a fresh clone must build it. | Symptom only — missing it gives `[engine] WASM artifact not found` |
| **`-O3 -ffast-math`** | Compiler flags. `-O3` = optimize hard. `-ffast-math` = permission to rewrite float arithmetic for speed, giving up exact reproducibility. | Speed, inherited from upstream BTK. **This is why the Emscripten version pin matters**: different compiler versions make different rewrite choices, so the same C++ can produce slightly different numbers. Measured once, on 2026-08-07: the 6.0.2 → 6.0.6 bump changed the binary but moved no result. That's a reason to check, not a reason to assume. | Yes — it's the reason for the pin |
| **float32** | 32-bit floating-point numbers (~7 significant digits) rather than 64-bit. | The engine uses them throughout, which is why saved reference values look like `0.290888` and why the zero solver can't chase precision below ~5e-6 m (see `PROGRESS.md` P9). | Symptom only |

## Building and testing the engine

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **CMake** | A build configurator. You describe the project once in `CMakeLists.txt`; CMake generates the actual build files for whatever compiler you're using. | Lets the same C++ build two ways — for the browser and for your Mac — from one description. | No |
| **`CMakeCache.txt`** | CMake's saved configuration inside a build folder. Contains **absolute paths**. | Why you must never copy `build-wasm/` or `build-native/` between machines — regenerate instead. | Symptom only |
| **Native build** | The same C++ compiled for your Mac with a normal compiler, no Emscripten. Lives in `build-native/`. Excludes `bindings.cpp` (browser-only). | Lets the physics be tested in seconds without a browser or a WASM build. This is how several engine bugs (P8, P9, T10) were diagnosed and fixed without touching Emscripten at all. | Yes |
| **GoogleTest** | The C++ testing framework the engine's tests are written in. Installed via `brew install googletest`. | The tests in `GameBuild/engine/tests/` need it to compile. | No |
| **`ctest`** | CMake's test runner. Runs the GoogleTest suite. Currently **30 tests**. | The C++-side gate. Run it whenever engine source changes. | Yes |

## The validation layer — the project's safety net

This is the most important part of the repo to understand, because it's what lets you
change the engine without silently breaking the ballistics.

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **BallisticsToolkit / BTK** | The original MIT-licensed engine this project builds on. Lives in `BallisticsToolkit/`, never modified, git-ignored. | The **oracle** — the reference implementation you compare against. Reproducible via `git clone` + `checkout 29d43c1`, so it needs no backup. | Yes |
| **Golden vectors** | 660 rows across 36 cases of saved trajectory numbers in `GameBuild/validation/vectors/golden.json` — 6 loads × 3 atmospheres × 2 winds. Generated from pristine BTK. | The frozen "correct answers." Committed to git so CI can check against them without needing BTK. | Yes |
| **`run.mjs`** | The check. Runs your engine, compares every number to the golden vectors, prints the worst difference. | **The single most important command in the project.** `0.000e+0` means nothing in the physics moved. | Yes |
| **`ORACLE_VERSION`** | A text file recording exactly what the golden vectors are valid for: BTK commit `29d43c1`, tolerance 1e-4, and the Emscripten versions — generated under 6.0.2, verified identical under 6.0.6. | The provenance record. If BTK's commit or the tolerance changes, the vectors need regenerating. A compiler bump needs *measuring*: if it still reads `0.000e+0`, only this file's note changes. | Yes |
| **Tolerance 1e-4** | How much difference `run.mjs` will accept before failing. | Deliberately loose, but the *actual* result is `0.000e+0`. That exact-zero baseline is the valuable part — it lets you prove an engine change moved nothing at all, rather than arguing about how small a difference is acceptable. | Yes |
| **`match-check.mjs`** | Diffs your owned engine copy against pristine BTK directly. Needs BTK present, so it runs locally, never in CI. | Confirms `GameBuild/engine/` hasn't drifted from the original. | No |
| **`native-matrix.cpp`** | Builds the full golden matrix twice natively — once from pristine BTK, once from your engine — and diffs them. | Lets an engine change be cleared **without a WASM rebuild**, which matters when Emscripten isn't available. Built during P9; the reusable win from that session. | Yes |
| **Oracle patch** | A minimal build-only change to pristine BTK, recorded in `ORACLE_VERSION`. | Currently **none**. If one ever exists, the oracle's identity has changed. | No |

## The app

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **TypeScript** | JavaScript with type checking — catches "you passed a string where a number goes" before the code runs. | The language the game is written in. | Yes |
| **`tsc --noEmit`** | Runs the type checker and produces no output files. Just says pass or fail. | One of the three app gates. | Symptom only |
| **React** | UI library. You describe what the screen should look like for a given state; React updates the DOM. | All menus, dials, readouts, settings screens. | No |
| **Three.js** | A 3D graphics library that wraps WebGL (the browser's 3D drawing interface). | Renders the range, targets, scope view, bullet trace, wind flags. | No |
| **Zustand** | A small state container — one shared object the whole app reads from and writes to. | Holds the current shot setup, gear, settings, hidden truth. | No |
| **IndexedDB** | A database built into every browser. Stores data on the device, survives app restarts. | Your saves. Chosen because it needs no server. | Yes |
| **`idb`** | A small library that makes IndexedDB pleasant to use (its raw interface is famously awkward). | Wraps the save/load code. | No |
| **`engine-bridge/`** | The TypeScript layer that loads the WASM engine and exposes it as normal functions. | The seam between the C++ physics and the game. Where argument-order bugs live (the C++ quaternion constructor is `(w,x,y,z)` but the bridge passes `{x,y,z,w}`). | No |

## Building and shipping the app

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **Vite** | Two things: a fast dev server (`pnpm dev`) with instant reload, and a bundler that packs everything into `dist/` for shipping. | The app's build tool. | Yes |
| **`dist/`** | The built, shippable website. Git-ignored, regenerated every build. | What gets deployed to GitHub Pages. | No |
| **vitest** | The test runner for the TypeScript side, built to share Vite's config. Currently **1514 tests across 88 files**. Default environment is `node`; `jsdom` is installed for tests that need a fake browser DOM. | The app-side gate. | Yes |
| **PWA (Progressive Web App)** | A website that can be installed to the home screen and run offline like a native app. | **The reason this project is a website at all** — it puts the game on your iPad with no paid Apple developer account and no weekly re-signing. | Yes |
| **Service worker** | A background script the browser keeps around; it caches files so the app works with no network. | Makes the game work offline on the iPad. | No |
| **`vite-plugin-pwa`** | Generates the service worker and app manifest automatically. Set to `registerType: 'prompt'`, so a new version waits for your consent rather than swapping under you. | Handles the PWA plumbing. | No |
| **Precache** | The list of files the service worker downloads up front (currently ~33 entries). | Why the app works on first offline launch. | Symptom only |
| **GitHub Actions** | GitHub's automation. `.github/workflows/ci.yml` defines three jobs: C++ tests, engine WASM + app build/tests, and deploy. | Runs every gate on every push, then publishes. | Yes |
| **GitHub Pages** | Free static website hosting from a GitHub repo. | **How the game gets to your iPad.** Push to `main` → CI builds → Pages serves → iPad installs. | Yes |

## Package management

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **Node** | A way to run JavaScript outside a browser. CI pins version 26. | Every build tool here is a Node program. | No |
| **npm / pnpm** | Package managers — they download the libraries the app depends on. `pnpm` is faster and shares one copy of each library across projects instead of duplicating them. | Currently npm; migrating to pnpm (see `NewUnit/new-machine-setup.md` §13). | Yes |
| **Lockfile** (`package-lock.json` / `pnpm-lock.yaml`) | Records the exact version of every library, including libraries-of-libraries, so every machine installs byte-identical dependencies. | Reproducible builds. Never hand-edit it. | Symptom only |
| **`node_modules/`** | The downloaded libraries. ~15,500 files. Git-ignored. | Regenerate with `pnpm install`; never copy between machines. | No |
| **`npx` / `pnpm exec`** | Runs a tool from `node_modules` without installing it globally. | Why the gates read `npx vitest run` rather than just `vitest`. | No |

## Python and PDF tooling

Entirely separate from the game — this is the `Documentation/` and `Wiki/` research
workflow. **No build step depends on any of it.**

| Term | What it is | Why it's here | Hold this? |
|---|---|---|---|
| **venv (virtual environment)** | An isolated Python installation with its own packages, at `~/venvs/general`. | Homebrew Python refuses direct installs (PEP 668 "externally managed"), so this isn't optional. | Yes |
| **pdfplumber / pdfminer.six** | Extract text and layout from PDFs that contain real text. | How every Wiki citation was pulled from Litz, McCoy, and FM 23-10. | No |
| **pypdfium2** | Renders PDF pages to images. | For pages where text extraction fails and something must be looked at. | No |
| **pillow** | Python image library. | Image handling alongside pypdfium2. | No |
| **tesseract / pytesseract** | Optical character recognition — reads text out of images. | **Not currently installed and never used.** Every citation so far came from extractable text. Optional. | No |
| **jq** | A command-line JSON processor. | Required by `~/.claude/statusline-command.sh`. Without it the status line silently prints nothing. | Symptom only |

## Symptoms → causes

| What you see | What it means |
|---|---|
| `run.mjs` prints anything but `0.000e+0` | The physics changed. First suspect: Emscripten is not 6.0.6. |
| `[engine] WASM artifact not found` | The engine hasn't been built. Run `pnpm run engine:build` (needs Emscripten on PATH). |
| `ENOTFOUND artifacts.apple.com` in CI | A corp-mirror URL leaked into the lockfile. Should be impossible after the personal-machine migration. |
| `f thrown with no message {excPtr}` | A C++ exception surfaced in the browser without its text. This exact signature was the P8 dead-FIRE-button bug. |
| `ctest` fails but `vitest` passes | The problem is in the C++ physics, not the app. |
| `vitest` fails but `ctest` passes | The problem is in the TypeScript, not the physics. |
| Build fails only in CI, never locally | Usually a version mismatch (Node, Emscripten) or a file that's git-ignored locally but expected by CI. |

---

## Sources within this repo

- `Design/build-plan.md` §2 — why this stack was chosen
- `Design/btk-assessment-and-path-forward.md` — why a web/PWA rather than native Swift
- `GameBuild/validation/ORACLE_VERSION` — the oracle's identity and regeneration rules
- `Design/execution/execution-protocol.md` §5 — the gate order
- `.github/workflows/ci.yml` — what CI actually runs, with version pins
