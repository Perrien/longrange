# LongRange — Build Plan

`Status: draft 1 — for owner review`  ·  `Date: 2026-07-13`  ·  `Produced per: archive/build-plan-prompt.md`

> **What this is.** The comprehensive build plan for LongRange: recommended stack,
> engine-reuse strategy, target architecture, feature sequencing, and validation
> discipline. Written for two audiences: an **AI coding agent** that will execute it,
> and the **owner** (solo, non-expert) who will steer. The authoritative feature set is
> [`feature-catalog.md`](./feature-catalog.md); this plan decides the *how* and *when*.
>
> Claims about BTK below were **verified against the code on 2026-07-13**, not taken
> from prose. Where this plan supersedes `phase-2-plan.md` / `game-design.md`, that is
> intentional (they are archived under [`archive/`](./archive/README.md));
> discrepancies are noted in §5.8.
>
> **Execution layer (added 2026-07-13).** This plan is executed via
> [`execution/`](./execution/): the agent's working rules are
> [`execution/execution-protocol.md`](./execution/execution-protocol.md); state lives
> in [`execution/PROGRESS.md`](./execution/PROGRESS.md); each increment is broken
> into session-sized, individually-verified tasks. Increments 0 and 1 are **complete**
> (tagged `inc0-complete` / `inc1-complete`; their per-task plan docs were removed once
> closed — history lives in `PROGRESS.md` and git tags). **The staged, in-order
> increment plan was retired 2026-07-21** — see `feature-catalog.md`'s intro and
> CLAUDE.md's Working agreement. Increment 2's detailed plan is archived at
> [`archive/increment-2.md`](./archive/increment-2.md); Increments 3–6's coarse
> breakdown is at [`archive/increments-3-6.md`](./archive/increments-3-6.md).
> `Design/feature-catalog.md` now decides what gets built next.
> The executing agent starts with the protocol, not with this document's §11.

---

## 1. Executive summary

**Stack:** TypeScript + **React** (UI/HUD/menus) + **Three.js** (3D scene, plain
imperative — no react-three-fiber) + **Vite** (build) + **vite-plugin-pwa/Workbox**
(installable offline PWA) + **Zustand** (game state) + **IndexedDB via `idb`**
(persistence). Deployed as a static site to **GitHub Pages** via the existing
Emscripten CI pattern.

**Reuse posture — "keep the physics, rebuild the shell":**

- **Keep the C++/WASM ballistics engine as-is and extend it in place** for the
  Bucket-A physics (custom drag, McDrag, bullet core/shape → full stability, Coriolis,
  incline). The engine source is copied into a new `GameBuild/engine/` directory that we own;
  the pristine `BallisticsToolkit/` checkout stays untouched as the **golden-vector
  oracle**.
- **Rebuild the presentation and game layer fresh** in TypeScript/React/Three.js,
  **salvaging steel-sim aggressively** (target physics is already C++ behind embind;
  mirage/scope/wind-marker shaders and scene patterns port over as reference code).
  The existing ~37.6k lines of vanilla JS are desktop-mouse-oriented (pointer lock),
  load Three.js from a CDN (breaks offline), and have no types — they are a quarry,
  not a foundation.
- **All Bucket-B game systems are new code** (hidden truth, DOPE/truing, missions,
  progression, persistence): this is the bulk of the work and was never in BTK.

**Shape of the build:** seven increments (0–6). Increment 0 proves the four premises
(WASM build, PWA-on-iPad, durable saves, validation harness, touch aiming). Increment
1 is the **first shippable slice**: a playable KD steel range with the full
dial-or-hold shot loop, offline on an iPad. Increment 2 adds the game's identity
(hidden truth + zeroing + computed DOPE + truing + reticle ranging). Increments 3–6
layer missions/UKD/incline, fidelity depth (Coriolis, temp-sensitive MV, weather),
the ELR/handloading endgame (CDM/McDrag + bullet editor + canted base), and content/
polish. The four **no-oracle Bucket-A features** each carry a **spec-article gate**:
the Wiki correctness article is written from the in-hand sources immediately before
implementation, and the implementation is validated against it (catalog §L).

**Why this path:** every hard constraint (§0 of the catalog) is satisfied by a static
web/PWA; among web options, keeping the validated ~3.5k-line C++ core eliminates
port risk in the one layer where correctness is the product's soul, keeps Monte-Carlo
dispersion fast, and preserves BTK-as-oracle cleanly. The runner-up — porting the
physics to TypeScript for a single-language repo — loses on those three points and
wins only on toolchain simplicity, which pinned-emsdk CI already tames (§2).

---

## 2. Options & decision rationale

### 2.1 What was verified in the code (load-bearing facts)

These were checked directly against `BallisticsToolkit/` on 2026-07-13:

- **Physics core is ~3.55k lines of portable C++17** (`src/ballistics/`, `src/physics/`,
  `src/match/`, `src/rendering/`, `src/bindings.cpp` — `wc -l` total 3,551), SI units
  internally, RK2 **midpoint** integration confirmed at `src/ballistics/simulator.cpp:420`
  (`timeStep`: half-step acceleration → full-step update).
- **Single-threaded WASM, no SharedArrayBuffer/pthreads** — grep across `src/`,
  `include/`, `web/`, `CMakeLists.txt` finds none; the module is built with embind,
  `-s MODULARIZE=1 -s EXPORT_NAME='BallisticsToolkit'`. **No COOP/COEP headers needed
  ⇒ GitHub Pages hosting works.**
- **Drag is already a Cd-vs-Mach table lookup** (`interpolateCd(mach, drag_type)` over
  `{mach, cd}` tables, `simulator.cpp:17–117`). **Custom drag models are a natural
  extension** (add a per-bullet table), not a rewrite — better than the assessment doc
  implied.
- **The WASM API surface is rich and game-shaped:** embind exposes `Simulator`
  (`computeZero`, `simulate` with wind-generator sampling), `Bullet`
  (`{weight, diameter, length, BC, G1|G7}` — confirming no CDM/core-shape today),
  `Atmosphere`, `WindGenerator` (curl-noise field), `match::Simulator` (Monte-Carlo with
  `mv_sd`, `bc_sd`, wind σ, rifle accuracy, scope cant → per-shot impacts, CEP, mean
  radius), steel-target reaction physics and impact detection (**in C++**, not JS).
- **CI/deploy exists and is pinned:** `.github/workflows/deploy.yml` builds with emsdk
  **4.0.17** and publishes `build-wasm/web` to GitHub Pages. `build_web.sh -s` serves
  locally.
- **The JS front-ends are not PWA-ready or touch-ready:** no manifest or service
  worker anywhere; `steel-sim.html`/`fclass-sim.html` import **Three.js 0.180.0 from
  unpkg CDN** (offline launch would fail); aiming is **pointer-lock mouse**, which does
  not exist on iPad touch. `web/` totals ~37.6k lines of untyped vanilla JS
  (steel-sim alone ~18.2k).

That last point materially changes the old "Option A — extend BTK in place" framing:
the primary device is a touch iPad, so **a new input layer and offline asset pipeline
are required no matter what**. The question is not "reuse the front-end or not" — it's
how much to salvage while rebuilding it.

### 2.2 Candidate reuse strategies

| | Engine | Presentation/game | Verdict vs. constraints |
|---|---|---|---|
| **A. Extend BTK fully in place** | keep C++/WASM | grow steel-sim's vanilla JS | Passes §0 only after retrofitting PWA/offline/touch into 18k+ untyped lines; every Bucket-B system lands in a global-heavy codebase with no types. High long-term maintenance. |
| **B. Hybrid (RECOMMENDED)** | keep C++/WASM, extend for Bucket A | new TS/React/Three app, salvage steel-sim | Passes all of §0. Zero port risk in physics; typed, testable foundation for the (much larger) game layer; oracle preserved. |
| **C. Port physics core to TypeScript** | re-port ~3.5k lines to TS | new TS app | Passes §0. One language, no Emscripten. But re-introduces correctness risk in the soul layer; Monte-Carlo (≤50k full trajectories) gets 5–10× slower or needs worker sharding; and BTK must be kept runnable as oracle *anyway*, so the toolchain never fully disappears. |
| **D. Full rebuild** | new engine | new app | Fails the spirit of §0.5 (throws away the validated second implementation) with no compensating benefit. Out. |

**Scoring against the hard constraints:** A–C all satisfy §0.1–0.8 (any static PWA
does). The decision is effort/risk/fit, then the tie-breaker.

**Tie-breaker (longevity + low maintenance, solo owner + AI agent):**

- **B** keeps the least-churn layer (physics) in its proven form; the C++ core has
  changed rarely and will change in bounded, spec-gated steps (Bucket A). The
  Emscripten toolchain is the one maintenance cost, already tamed by a pinned emsdk in
  CI; add a **native CMake test target** (§8.4) so engine tests run without a browser.
- **C**'s single-language appeal is real but buys ongoing risk: a subtle port bug in
  drag interpolation or the spin-drift fit is exactly the failure mode this project
  exists to avoid, and the perf headroom for Monte-Carlo and future fidelity work
  (McDrag, 6DOF-ish extensions) is gone.
- **A** maximizes reuse on paper but anchors years of game-layer work to an untyped,
  desktop-oriented codebase the owner would have to learn wholesale.

**Recommendation: B.** Runner-up: **C**, rejected as above. If, late in the project,
the Emscripten toolchain ever becomes untenable, C remains executable *then* — the
golden-vector harness built in Increment 0 is precisely the safety net a future port
would need. (This is the "clean seam" version of the port option: nothing in B
forecloses C later.)

### 2.3 Stack above the engine — options and picks

Scored against: iPad/iPhone PWA fit (§0.1–0.2), longevity/low churn (tie-breaker),
AI-agent familiarity (execution reality), and fit to a 3D-scene-plus-HUD game.

- **Language — TypeScript.** No serious competitor for a typed, agent-friendly,
  mainstream web codebase.
- **3D — Three.js (pinned major, vendored via npm).** Already what BTK's front-ends
  use → salvaged scene/shader code (mirage, scope DOF, wind markers, landscape) stays
  in-dialect. Largest ecosystem, stable core. Babylon.js is the runner-up (more
  batteries included, smaller community); PlayCanvas/engines with editors add churn
  and lock-in. **Use plain imperative Three.js**, not react-three-fiber: r3f adds a
  reconciler layer, version-couples React↔Three, and would make salvaged steel-sim
  code harder to translate.
- **UI framework — React.** The HUD, data book, load bench, mission select, and
  settings are classic component UI. React is the most mainstream, lowest-churn-risk,
  best-understood-by-AI-agents option; Svelte (leaner but mid-major-version churn,
  smaller ecosystem) and Vue (fine, slightly less agent-native) are runners-up.
  Vanilla TS was considered (zero framework churn) but hand-rolled reactive UI across
  a data-book/menus surface costs more than it saves. React renders the DOM overlay;
  the Three.js canvas is a single React-managed mount that the game loop owns
  imperatively. One-way data flow between them via the state store.
- **State — Zustand.** Tiny, stable, store-outside-React (the game loop and the WASM
  bridge can read/write without render coupling). Redux is heavier than needed;
  context-only gets tangled at this scale.
- **Build — Vite.** Mainstream, stable, first-class WASM/asset handling,
  `vite-plugin-pwa` (Workbox) for the service worker + manifest. **All dependencies
  vendored through npm — no CDN imports** (hard requirement for offline; BTK's current
  unpkg imports are exactly what we must not carry over).
- **Persistence — IndexedDB via `idb`** (~1kB, stable wrapper). LocalStorage is too
  small/fragile for saves; raw IndexedDB is needlessly painful. Schema-versioned save
  + JSON export/import (§6).
- **Tests — Vitest** (unit, TS side) + the **golden-vector harness** (Node, runs both
  WASM builds) + **CTest/GoogleTest native build** for C++ unit tests. Playwright
  later if UI regressions warrant it.

---

## 3. Target architecture

```
┌────────────────────────────────────────────────────────────────┐
│ PWA shell — manifest + Workbox service worker                  │
│   precaches: app bundle, WASM, textures/models/audio (vendored)│
├────────────────────────────────────────────────────────────────┤
│ React UI layer (DOM overlay)                                   │
│   HUD (dial/hold, wind, shot budget) · data book / DOPE viewer │
│   load bench · mission select · settings · onboarding/teaching │
├────────────────────────────────────────────────────────────────┤
│ Game core (TypeScript, framework-free modules)                 │
│   state store (Zustand): inventory, progression, session       │
│   hidden-truth model (per-instance bias; lot truth)            │
│   DOPE/truing service (nodes → MV + BC/drag-scale levers)      │
│   mission runner · scoring (incl. first-round-hit prob)        │
│   units service (MIL/MOA, metric/imperial — one converter)     │
├────────────────────────────────────────────────────────────────┤
│ Scene layer (Three.js, imperative)                             │
│   range scenes (KD/UKD, biomes) · scope pipeline (reticle, zoom,│
│   DOF, mirage shader) · wind markers · steel/silhouette targets │
│   touch input (drag-pan, pinch-zoom, fire) · impact FX · audio │
├────────────────────────────────────────────────────────────────┤
│ Engine bridge (TS)                                             │
│   typed façade over embind API; owns WASM lifecycle; runs      │
│   Monte-Carlo + batch solves in a Web Worker                   │
├────────────────────────────────────────────────────────────────┤
│ GameBuild/engine/ — C++17 → WASM (owned copy of BTK core + Bucket A)     │
│   RK2 point-mass solver · G1/G7 + custom Cd(Mach) drag · ISA   │
│   atmosphere · curl-noise wind · spin drift · aero jump ·      │
│   Miller Sg (+ full Sg later) · Coriolis · incline · McDrag ·  │
│   Monte-Carlo dispersion · steel reaction + impact detection   │
├────────────────────────────────────────────────────────────────┤
│ Persistence (idb/IndexedDB) — schema-versioned save,           │
│   JSON export/import, navigator.storage.persist()              │
└────────────────────────────────────────────────────────────────┘
        ▲ validated against ▼
  pristine BallisticsToolkit/ (oracle vectors) · McCoy .50 M33 ·
  Litz worked examples · Wiki spec articles
```

**Interfaces (the load-bearing seams):**

- **Engine bridge.** One TS module (`engine-bridge/`) is the *only* code that touches
  embind objects. It exposes typed functions (`solveTrajectory(load, atmos, wind,
  angle) → TrajectoryTable`, `computeZero(...)`, `runDispersion(...) → HitStats`,
  `sampleWind(t, x)`), handles WASM instantiation, and hides embind memory rules
  (`.delete()`), which are easy to leak from casual call sites. Monte-Carlo and
  DOPE-table batch solves run in a **Web Worker** (single-threaded WASM is fine — the
  worker keeps the UI thread smooth; instantiate a second module instance there).
- **Hidden truth boundary.** The game core computes *effective* load/rifle parameters
  (true MV = catalog MV + instance offset + temp shift; true BC = lot truth) and
  passes only resolved numbers to the engine bridge. The engine never knows about
  hidden truth; the UI never sees true values, only the player's observed/trued ones.
- **Units.** Engine is SI-only (as BTK is today). Exactly one TS units service
  converts at the UI boundary, always able to render MIL+MOA and metric+imperial
  side-by-side (§0.6). No unit math scattered in components.
- **Persistence seam for future sync.** All saves go through a `SaveStore` interface
  (get/put/export/import/migrate). A future cloud sync implements the same interface
  — nothing else changes (§0.3's "clean seam").

---

## 4. Engine reuse plan (keep / adapt / port / drop)

**Repository move:** copy `BallisticsToolkit/{src,include,CMakeLists.txt}` into a new
top-level `GameBuild/engine/` (with its own `bindings.cpp` and CMake), which the project owns
and extends. **`BallisticsToolkit/` itself is never modified** — it remains the
pristine, runnable oracle (record its current commit hash in
`GameBuild/validation/ORACLE_VERSION`). MIT license permits the copy; keep the license and
attribution in `GameBuild/engine/`.

| BTK asset | Disposition |
|---|---|
| `src/ballistics/` + `include/ballistics/` (Bullet, Simulator, Trajectory — RK2 solver, G1/G7 Cd tables, zeroing) | **Keep** verbatim in `GameBuild/engine/`; extend for Bucket A (below) |
| `src/physics/` (ISA atmosphere + speed of sound; curl-noise WindGenerator) | **Keep** verbatim |
| `src/match/` (Monte-Carlo dispersion, targets, scoring stats) | **Keep**; extend scoring hooks for game rules (silhouette zones, FRH probability comes from hit stats) |
| `src/rendering/` (steel-target reaction physics, impact detector — C++) | **Keep**; genuinely reusable target feel |
| `src/bindings.cpp` | **Adapt**: re-export for the new façade; add bindings for each Bucket-A addition |
| `include/math/` (vectors, quaternions, conversions, simplex noise) | **Keep** |
| `web/steel-sim/` (Scope, mirage/DOF, WindFlag/WindSock, Landscape, TargetRack, HUD, audio) | **Salvage as reference**: port patterns/shaders into the TS scene layer piecemeal; do not import wholesale |
| `web/fclass-sim/` (match driver, AI wind readers, PeerJS remote) | **Defer** (multiplayer post-core, catalog §J); AI wind-reader logic is a future spotter reference |
| `web/ballistic-calc`, `load-comp`, `perf-matrix`, `hit-sim`, `target-sim`, `wind-gen` | **Keep in pristine BTK as dev/reference tools**; not player-facing |
| `web/target-gen`, Boar/PrairieDog hunting modes | **Drop** (catalog §0.8 / §M) |
| `.github/workflows/deploy.yml` (pinned emsdk 4.0.17 → Pages) | **Adapt** for the new repo layout (build engine WASM + Vite app) |

**Bucket-A extensions land in `GameBuild/engine/` C++** (each gated on its spec article, §5):

1. **Custom drag (CDM):** extend `DragFunction` with `CUSTOM`; `Bullet` gains an
   optional owned `{mach, cd}` table; `interpolateCd` already does table lookup —
   route custom tables through the same interpolator. Anchor/validate on McCoy's
   measured .50 Ball M33 curve.
2. **McDrag predictor:** new module `GameBuild/engine/src/ballistics/mcdrag.cpp` — geometry →
   Cd(Mach) table (feeds #1). Validate against McCoy Ch4 worked cases.
3. **Bullet core & shape:** new `BulletDesign` type (layered densities → mass, CG,
   Ip/It) feeding BC/form factor and a **full** stability factor; keep simplified
   Miller as the default path for catalog bullets.
4. **Coriolis:** acceleration term in `calculateAccelerationFor` given latitude +
   azimuth (off by default; mission-supplied).
5. **Incline/decline:** launch/target elevation in the solve (gravity decomposition —
   *not* just cosine-approx; the article states both and the engine does the real
   geometry, teaching why the rule of thumb drifts at angle+range).
6. **MV temperature sensitivity** (owner request, §A): **game-layer, not engine** —
   a per-load `fps-per-°F` (and metric) characteristic applied when the game core
   resolves effective MV. No C++ change.

**Oracle preservation:** golden vectors are always generated from the **pristine**
`BallisticsToolkit/` build at `ORACLE_VERSION`. `GameBuild/engine/` must match the oracle
exactly (within float tolerance) for every factor BTK implements, in every increment
— Bucket-A features must be **additive and default-off** so the baseline diff stays
clean. The four no-oracle features are validated against their spec articles instead
(§8).

---

## 5. Feature roadmap & sequencing

### 5.0 Sequencing logic

Order is driven by: (1) **prove the risky premises first** (PWA-on-iPad, touch
aiming, durable saves, WASM-in-new-shell, oracle harness — all cheap to test, fatal
if false); (2) **ship the fun loop early** (the shot loop is the payoff and the test
bed for everything else); (3) **the identity mechanics next** (hidden truth/DOPE make
it a game, not a calculator); (4) fidelity and endgame depth **after** the loop they
enrich exists; (5) each no-oracle Bucket-A feature waits for its **spec-article
gate**, scheduled just-in-time (catalog §L).

Increments are independently demoable; each ends with "done when" checks the coding
agent must satisfy before moving on.

### Increment 0 — Foundations & proofs (the premise-killers)

Goal: a walking skeleton that retires every existential risk.

- Repo restructure: `GameBuild/engine/` (owned BTK copy), `GameBuild/app/` (Vite+React+TS), `GameBuild/validation/`
  (harness + vectors), pristine `BallisticsToolkit/` untouched. CI builds engine WASM
  (pinned emsdk) + app, deploys to GitHub Pages.
- Engine WASM loads in the app; typed bridge solves a trajectory; a debug screen
  renders a drop table (MIL+MOA, metric+imperial).
- PWA: manifest + Workbox precache (incl. WASM + all vendored assets); install to
  iPad home screen; airplane-mode launch.
- Persistence smoke test: schema-versioned save v1 written via `idb`,
  `navigator.storage.persist()` requested, survives relaunch; JSON export/import
  round-trips.
- **Touch-aiming spike:** minimal Three.js scene, scope overlay, drag-to-pan with
  magnification-scaled sensitivity, pinch zoom, fire button. This is the highest
  *design* risk (steel-sim is pointer-lock mouse); prove the feel early on the iPad.
- Validation harness v0: Node script runs pristine-BTK WASM and `GameBuild/engine/` WASM on
  ~6 reference loads (.22 LR subsonic, .223, 6.5 CM, .308, .338 LM, .50 BMG) ×
  standard + non-standard atmospheres; diffs drop/drift/spin drift/TOF/retained
  velocity at 100 yd increments; CI-gated.
- Native C++ test target (plain CMake + CTest) so engine unit tests run without
  Emscripten/browser.

**Done when:** installed PWA cold-launches offline on the iPad and shows an
engine-computed drop table; a save survives relaunch and export→import; the
golden-vector diff runs in CI at zero delta; the touch spike lets the owner hold a
1-MOA-ish wobble at high zoom without frustration (owner sign-off).

### Increment 1 — First shippable slice: the KD shot loop

Goal: **a fun, complete, offline game** — small but real. Catalog: §B (all), §E1
Range A, §F (steel hit/miss + reactive plates), §C3 (subset), §A (existing factors).

- One rifle (6.5 CM) + two factory loads (match low-SD / bulk high-SD) — fixed, no
  inventory yet; **no hidden truth yet** (box values are true in this increment).
- **Range A** (steel every 50 yd to 500), reactive steel via the C++ target physics;
  ping audio (user-gesture-unlocked).
- Full shot loop: known-distance target → read wind (flags/socks + adjustable
  speed/direction) → **dial or hold** (both, per shot) → fire → spot → correct within
  a shot budget → score.
- Scope v1: FFP, 4.5–35×, one mil-hash reticle (MIL and MOA variants), turret
  dialing with proper click values, holds via reticle. Mirage shader ported from
  steel-sim (aids wind reading, degrades with zoom).
- HUD: dial state, hold readout, wind, shots remaining, hit/miss; solver screen
  (computed DOPE table for current conditions — §D "computed primary" arrives here in
  read-only form).
- Autosave settings/session.

**Done when:** on an installed, offline iPad PWA, a new player can zero-less (given
a provided zero) engage 50–500 yd steel, solve with *either* dialing or holding in
*either* MIL or MOA, and the engine-vs-oracle diff is still zero. Owner plays it and
calls the aim/fire/impact loop fun.

### Increment 2 — The identity: hidden truth, zeroing, DOPE & truing

Goal: turn the calculator into a game. Catalog: §D (all core), §C1/C2 (initial
catalog + instances), §I (data book v1).

- **Per-instance hidden truth:** rifle copies get fixed MV offset, zero offset,
  inherent precision; ammo lots get true mean-MV shift, SD, true BC (+BC SD).
  Acquiring a second copy of the same model behaves differently.
- **Zeroing flow** at known distance (group → center zero; teaches don't-chase).
- **Computed DOPE + truing:** solver baseline from box values; player confirms
  **nodes** (range, true come-up, N shots); truing adjusts **effective MV from a
  near/mid node** and **BC/drag-scale from a far node**; untested ranges shift
  accordingly. Node confidence scales with shots fired and ammo SD.
- **Reticle ranging** on KD ranges (known-size steel; `size×1000÷mils`, `×95.5÷MOA`
  both shown); labeled distances let the player learn/verify.
- **Data book v1:** confirmed nodes, trued curve vs. box curve, per rifle+ammo.
- Gear: small catalog (C1's rimfire→magnum subset: .22 LR, .223, 6.5 CM, .308),
  factory loads per §C2, inventory UI. Skill-gated unlocks begin (§G): KD mastery
  opens the next range band. **Range B** (100→1000) ships here.
- Save schema v2 (inventory, instances, lots, nodes) + migration from v1.

**Done when:** a second copy of the same rifle demonstrably needs its own
zero/DOPE; a trued profile beats box values at untested ranges; a player can
mil-range a labeled target within ~5%; export→import reproduces the full state on a
second device; schema v1 saves migrate.

### Increment 3 — The field: missions, UKD, incline, silhouettes

Goal: apply the skills where answers aren't labeled. Catalog: §E2, §E4, §G
(missions), §F (silhouettes, scoring), Bucket-A **incline/decline** + **Coriolis**.

- **[GATE] Spec articles first:** `angle-incline-shooting.md` (Litz Ch4; McCoy §3.4)
  and `coriolis-effect.md` (Litz Ch7; McCoy §8.8) authored from the in-hand,
  page-routed sources; formulas verified; then implement in `GameBuild/engine/` (default-off,
  additive), validate vs. article worked examples, then expose in gameplay.
- **UKD mission ranges:** unlabeled, irregular placement; ranging via known-size
  props (§E4 set: cars, benches, doorways, signage, silhouettes — FM 23-10-grounded
  dimensions in metadata) or an unlockable laser rangefinder.
- **Angled terrain:** at least one valley scenario (shooter elevated / targets
  above+below); angle readout in HUD; cosine rule taught, real solve used.
- **Human silhouettes** (head/torso, IDPA-style zones) with zone scoring; no-shoot
  discipline plates (§F).
- **Mission runner:** X-MOA target at Y range within a shot budget; ladder by range
  band (500 → 1000); mission-defined atmosphere/wind/latitude/azimuth.
  **Headline metric: first-round-hit probability** surfaced in results (from the
  Monte-Carlo engine given the player's trued data quality).
- Environments 1–2: **grassland hills** + **mountains** (angle + altitude/thin-air
  play; §E3). Scene-budget discipline: stylized-but-honest, iPad-GPU-first.
- Progression v1 (§G): skill gates unlock mission tiers + magnums (.300 WM, .338 LM);
  free-play sandbox of anything unlocked.

**Done when:** both spec articles exist with verified formulas and the engine
matches their worked examples (incline: matches Litz Ch4 cases; Coriolis: matches
Litz Ch7/McCoy §8.8 magnitudes within article tolerance); baseline golden-vector
diff still zero with features off; a UKD valley mission is completable using
reticle-ranging + angle correction; FRH probability reported per mission.

### Increment 4 — Reading the day: weather, temp-sensitive MV, DOPE cards

Goal: conditions become part of the puzzle. Catalog: §E5, §A temp-sensitivity, §D
tabulated DOPE, §I.

- **Weather conditions** (§E5): clear (mirage strong), overcast (mirage suppressed —
  lean on flags), rain (visibility + denser-air ballistic effect via the existing
  atmosphere model). Night/lit-range deferred to Increment 6 (owner-flagged
  nice-to-have). Selectable in free-play; set/randomized per mission.
- **MV temperature sensitivity** (game-layer): per-load fps/°F characteristic;
  powder-temp derived from mission conditions; DOPE trued warm goes off cold —
  surfaced in the data book (teaches re-confirmation; rewards temp-stable ammo).
- **Tabulated DOPE** (§D): freeze the trued curve into a static come-up card /
  turret tape for a baseline condition; run off the card without the solver; card
  drift vs. conditions is honest and visible (card vs. solver comparison view).
- Data book v2: cards, condition annotations, per-lot temp ratings (§C2).

**Done when:** the same mission on a hot vs. cold day requires different come-ups
with a temp-sensitive load and near-identical ones with temp-stable match ammo; a
generated card matches the solver at its baseline condition and diverges honestly
off-baseline; overcast missions demonstrably remove the mirage cue.

### Increment 5 — The endgame: ELR, custom drag, bullet lab, handloading

Goal: the .50-past-a-mile promise, honestly modeled. Catalog: Bucket-A **CDM/McDrag**
+ **bullet core/shape**, §C1 ELR tier, §C2 handloading, §C3 canted base, §E1 Range C.

- **[GATE] Spec articles first:** `custom-drag-models.md` (McCoy Ch4 + drag chapters;
  M33 measured curve) and `bullet-anatomy-stability.md` (Litz Ch17–18; McCoy §6.6)
  authored and verified; then implement CDM + McDrag + BulletDesign/full-Sg in
  `GameBuild/engine/` (additive, default-off), validated against the articles + the **M33
  anchor** (McDrag-predicted vs. measured curve within McCoy's stated error bands;
  trajectory from measured M33 CDM vs. McCoy's published tables).
- **ELR gear:** .375/.408 CheyTac, .50 BMG on measured/custom drag; **canted-base
  toggle** (the elevation-travel gate: dialing past ~1 mile requires it); **Range C**
  (500→2500) + transonic-band feedback.
- **Bullet lab + handloading** (§C2): shape/core editor (McDrag + computed CG/Ip/It →
  BC + full Sg); charge workup with chronograph (find the node; poor workup < factory);
  per-rifle loads; vertical-only benefit (wind untouched) — end-game optimization and
  a wind-isolation learning tool.
- Progression: ELR tier gated on mile-class mastery.

**Done when:** McDrag reproduces M33 within the article's stated tolerance and the
measured-CDM trajectory matches McCoy's tables at ELR distances; a developed handload
measurably tightens vertical but not wind; a mile+ solve is impossible without the
canted base and possible with it; G1/G7 baseline still matches the oracle exactly.

### Increment 6 — Content, teaching & polish

Goal: fill the world, round the edges. Catalog: §E3 remaining, §E5 night, §G spotter
(+ optional barrel life), §I onboarding, §F target variety.

- Environments 3–4: **light forest**, **desert** (heat-mirage max). Night/lit range
  (§E5) if still wanted.
- Target menagerie (§F): poppers, dueling trees, plate racks, swingers, dropping
  plates, hostage/no-shoots.
- **Onboarding/teaching** (§I): first-principles lesson flow drawing on the Wiki;
  glossary links; MIL/MOA + metric/imperial side-by-side everywhere (audit).
- **Spotter** unlock (§G) — narrows wind uncertainty / calls corrections (fclass AI
  wind-reader logic is reference material).
- **SFP** as the later scope option (§C3 pref honored: FFP shipped first).
- Owner-optional: **barrel life** soft resource (lean = omit; revisit here, not
  before). **Multiplayer stays deferred** (§J).

**Done when:** all four biomes playable; onboarding takes a fresh player from zero
to a completed 500 yd mission without external help; catalog §§A–I fully mapped to
shipped features or explicitly-deferred notes.

### 5.7 Cut/simplified for first release (explicit)

The first *shippable* thing is Increment 1; features deliberately absent from it:
hidden truth (Inc 2), missions/UKD (3), all four Bucket-A physics (3/5), weather
beyond wind (4), handloading/ELR (5), spotter/SFP/night/barrel-life (6),
multiplayer (deferred indefinitely). Nothing in the catalog is silently dropped;
only §J and barrel-life remain owner-optional at the end.

### 5.8 Discrepancies with prior docs (noted per prompt)

- The old M0–M5 broadly survives as Increments 0–3+5, but this plan (a) pulls the
  **touch-aiming spike** into Increment 0 (new finding: pointer-lock front-end,
  touch-first device); (b) moves **Coriolis + incline earlier** (Inc 3, with
  missions that need them) than phase-2-plan's M4; (c) splits fidelity depth into
  two increments (conditions vs. ELR/CDM); (d) replaces "trim the app to steel-sim"
  with "new app, salvage steel-sim" for the §2.1 reasons.
- `game-design.md`'s economy references are superseded by the catalog's no-money
  rule (§0.7) — already reflected here.

---

## 6. Data model & persistence

**Store:** IndexedDB (via `idb`), one DB `longrange`, object stores: `save` (the
canonical game state), `meta` (schema version, timestamps), optional `vectors`
(cached solver tables). Writes are transactional; autosave on state-changing events
(shot fired, node confirmed, purchase/unlock), debounced.

**Save schema (v1 sketch — the executing agent formalizes as TS types + JSON Schema):**

```jsonc
{
  "schemaVersion": 2,
  "createdAt": "...", "updatedAt": "...",
  "settings": { "units": "mil|moa-primary", "measure": "metric|imperial-primary", ... },
  "rifles": [{
    "instanceId": "r-...", "catalogId": "r65cm-a",
    "hiddenTruth": { "mvOffsetMps": -9.1, "zeroOffsetMrad": {"h":0.05,"v":-0.1},
                      "precisionMrad": 0.22 },          // never rendered
    "zeroState": {...}, "roundCount": 1234
  }],
  "ammoLots": [{
    "lotId": "l-...", "catalogId": "a-65cm-match",
    "hiddenTruth": { "mvMeanShiftMps": 3.2, "mvSdMps": 4.5,
                      "bcTrue": 0.301, "bcSd": 0.004, "tempSensMpsPerC": 0.35 }
  }],
  "dopeProfiles": [{ "rifleId": "...", "lotId": "...",
    "nodes": [{ "rangeM": 700, "comeUpMrad": 4.7, "shots": 5, "conditions": {...} }],
    "truedParams": { "effMvMps": ..., "dragScale": ... }, "cards": [ ... ] }],
  "progression": { "unlocks": [...], "records": {...}, "missionResults": [...] },
  "handloads": [ ... ]                                   // schema v3+, Increment 5
}
```

- **Versioning & migration:** integer `schemaVersion`; every increment that changes
  the shape ships a forward migration; import runs migrations too. CI keeps a corpus
  of old-version fixture saves that must import cleanly.
- **Export/import (§0.3):** full-state JSON; export via share-sheet
  (`navigator.share` with file fallback to download); import validates against the
  JSON Schema before applying. This is also the real backup story on iOS — surface a
  gentle periodic "export your save" nudge.
- **Hidden truth at rest:** stored client-side; a determined player can read it.
  Accept this (single-player, honesty-based); trivially obfuscate (e.g. seed +
  derivation rather than plain values) so casual inspection doesn't spoil — derive
  per-instance truth from a stored RNG seed + catalog ranges, which also shrinks the
  save.
- **iOS durability:** installed home-screen PWAs are exempt from Safari's 7-day
  script-storage eviction; additionally call `navigator.storage.persist()` and show
  storage state in settings. Export/import is the belt-and-suspenders.

---

## 7. PWA / iOS specifics

- **Install UX:** iOS has no install prompt — ship a one-time in-app "Add to Home
  Screen" walkthrough (Share → Add to Home Screen), with detection of standalone mode
  (`display-mode: standalone`) to hide it once installed. `apple-touch-icon`,
  `apple-mobile-web-app-*` meta, `viewport-fit=cover` + safe-area insets.
- **Service worker:** Workbox precache-manifest of the entire app (bundle, WASM,
  models, textures, audio — all vendored; **zero CDN/runtime-network dependencies**).
  Update flow: new SW installs in background → in-app "update ready — reload" toast
  (`skipWaiting` on user consent, never mid-session). Cache-bust via content hashes
  (Vite default).
- **Touch input (design-critical):** pointer lock doesn't exist on iPad — scope
  aiming = one-finger drag (sensitivity scaled by 1/magnification), pinch zoom,
  dedicated fire control (screen button; also keyboard/gamepad for desktop),
  long-press or two-finger tap for focus/parallax per steel-sim's refocus idea.
  External Bluetooth mouse/keyboard work in Safari as a bonus, not a requirement.
- **Audio:** WebAudio unlocked on first user gesture (iOS requirement); distance-
  delayed steel pings (salvage steel-sim's timing model); respect the mute switch
  caveats; no audio before interaction.
- **Performance:** target 60 fps on the owner's iPad; WASM solves are ms-scale
  (single trajectory) — fine on the UI thread at fire time; Monte-Carlo/batch DOPE
  tables to the worker. Keep draw calls modest (instanced targets, merged terrain);
  cap devicePixelRatio; test thermals on long sessions.
- **Storage & quota:** assets precache will be tens of MB — well under Safari PWA
  quotas; check `navigator.storage.estimate()` in the debug screen.
- **No haptics/gyro on iOS web** — accepted trade (assessment §4); don't fake them.
- **Wake lock:** request Screen Wake Lock during active shooting sessions (supported
  in recent Safari); degrade silently.

---

## 8. Validation & correctness strategy

The project's differentiator; runs continuously, not as a phase.

1. **Golden-vector oracle diffing (factors BTK implements).** `GameBuild/validation/` harness
   (Node) runs pristine-BTK WASM (at `ORACLE_VERSION`) and `GameBuild/engine/` WASM over a
   fixed matrix: ≥6 loads (.22 LR → .50 BMG) × ≥3 atmospheres × wind cases; compares
   drop, windage, spin drift, TOF, retained velocity at 100 yd steps. Tolerance:
   bit-similar is expected while `GameBuild/engine/` is unmodified; after Bucket-A additions
   (default-off), baseline runs must stay within float-noise (≤0.01%). **CI-gated on
   every engine change.**
2. **Primary-source cross-checks.** McCoy .50 M33 (drag + trajectory tables) and the
   Litz worked examples already cited in the Wiki, encoded as harness test cases with
   article-stated tolerances. These check BTK *itself* too — if oracle and source
   disagree, the source + article win and the discrepancy is logged (working
   agreement).
3. **Spec-article gates for the four no-oracle features** (catalog §L): incline,
   Coriolis (Inc 3); CDM/McDrag, bullet core/shape→BC+full-Sg (Inc 5). Discipline per
   feature: **article first** (from the page-routed, in-hand sources) → worked
   examples extracted into harness cases → implement → pass → only then exposed in
   gameplay. The article is the sole arbiter; no implementation without its article.
4. **Native C++ unit tests** (CTest target, no Emscripten): conversions, atmosphere
   values vs. ISA tables, drag interpolation edge cases, zero-solver convergence,
   Coriolis/incline math once added. Fast local loop for the agent.
5. **Game-layer tests (Vitest):** units service (MIL↔MOA↔rad, metric↔imperial —
   exhaustive, this is constraint §0.6), truing math (two-lever behavior: near node
   moves MV, far node moves drag scale), hidden-truth derivation determinism, save
   migrations (fixture corpus), ranging formulas.
6. **Play-validation:** each increment's "done when" includes owner play on the
   actual iPad — the transfer-to-reality constraint (§0.4) is ultimately judged by a
   learning player.

---

## 9. Risks & mitigations

| Risk | Likelihood/impact | Mitigation |
|---|---|---|
| Touch aiming feels bad at high zoom (game lives or dies on this) | Med / Fatal | Increment-0 spike on real iPad; sensitivity curves + optional stabilizer-breathing mechanic; owner sign-off gate |
| Emscripten/emsdk churn breaks builds years out | Med / Med | Pin emsdk (4.0.17 now) in CI + `.tool-versions`; engine changes are bounded (Bucket A then quiet); golden harness makes a future TS port (runner-up C) executable if ever needed |
| iOS Safari storage eviction eats saves | Low (installed PWA exempt) / High | Installed-PWA + `persist()` + export nudges + import validation |
| Three.js major-version churn | Med / Low | Vendored + pinned; upgrade deliberately, never transitively; plain Three (no r3f coupling) |
| Bucket-A correctness errors (no oracle) | Med / High | Spec-article gate + worked-example harness cases + additive/default-off implementation preserving baseline diff |
| Scope creep in the 3D layer (biomes, FX) | High / Med | Scene budget per increment; stylized-honest art bar; features land only with their increment |
| Solo-owner bus-factor on C++ | Med / Med | Engine stays small (~4–5k lines with Bucket A), heavily commented, spec-article-backed; AI agents handle C++ well when tests exist |
| WASM debugging friction | Med / Low | Native CTest build for logic; DWARF/source-map builds for the rare in-browser case |
| GitHub Pages limits (size/soft limits) | Low / Low | Assets are tens of MB; if ever hit, Cloudflare Pages is a drop-in static alternative (also free, adds proper headers) |

---

## 10. Workspace, tooling & deployment

```
LongRange/
├── BallisticsToolkit/        # PRISTINE — oracle only, never edited
├── GameBuild/engine/                   # owned copy of BTK core + Bucket A
│   ├── src/  include/  bindings/  tests/        # tests = native CTest
│   └── CMakeLists.txt        # emscripten + native targets
├── GameBuild/app/                      # Vite + React + TS PWA
│   ├── src/{ui,game,scene,engine-bridge,persistence,units}/
│   ├── public/               # icons, manifest assets
│   └── vite.config.ts        # vite-plugin-pwa, wasm asset handling
├── GameBuild/validation/               # golden-vector harness + fixtures
│   ├── ORACLE_VERSION        # pinned BTK commit
│   ├── vectors/  sources/    # oracle outputs; McCoy/Litz encoded cases
│   └── run.mjs
├── Design/  Documentation/  Wiki/   # unchanged roles
└── .github/workflows/ci.yml  # build engine (emsdk pinned) + app + tests + deploy
```

- **Tooling:** Node LTS + npm (or pnpm — agent's choice, document it), CMake ≥3.16,
  pinned emsdk. One `make`/`just` entry point wrapping: engine-wasm, engine-native-
  test, app-dev, app-build, validate, deploy.
- **Deployment:** **GitHub Pages** (keep) — the existing pattern already proves
  emsdk-in-CI → Pages; no COOP/COEP needed (verified single-threaded WASM). Note:
  Cloudflare Pages would honor `_headers` (caching/hardening) and is the named
  fallback; not worth switching for now.
- **Branch discipline for the agent:** small PR-sized changes; CI (build + native
  tests + Vitest + golden vectors) green before merge; `main` auto-deploys.

---

## 11. Immediate next steps (Increment-0 spikes, in order)

> These spikes were executed and closed as Increment 0 (tagged `inc0-complete`); the
> per-task plan doc was removed once complete — task history lives in
> `execution/PROGRESS.md`. This list remains as the original summary.

Each is small, concrete, and has a binary success check.

1. **Prove the BTK build.** Install pinned emsdk; `./build_web.sh -s`; open steel-sim
   locally. *Done when* steel-sim runs at `localhost:8001` from a local build.
2. **Create `GameBuild/engine/` from the BTK core** (copy `src/`, `include/`, CMake; keep MIT
   notice); build WASM unchanged. *Done when* `GameBuild/engine/` emits a loadable module whose
   drop table for a 6.5 CM reference load matches pristine BTK's ballistic-calc
   output exactly.
3. **Walking-skeleton app.** Vite+React+TS shell loads `GameBuild/engine/` WASM via the typed
   bridge; debug screen renders the drop table in MIL+MOA / m+yd. *Done when* the
   table matches step 2 and hot-reload works.
4. **PWA on the iPad.** Manifest + Workbox precache (vendored Three.js — no CDN);
   install; airplane mode; relaunch. *Done when* cold offline launch shows the
   drop-table screen on the iPad.
5. **Durable save.** `idb` save v1 + `persist()` + JSON export/import. *Done when* a
   save survives PWA relaunch and export→import round-trips byte-equal (modulo
   timestamps) on a second browser.
6. **Touch-aiming spike.** Minimal scene + scope overlay + drag/pinch/fire on iPad.
   *Done when* the owner can hold a simulated 1-MOA wobble on a 500 yd plate at 25×
   and calls it controllable.
7. **Golden-vector harness v0.** Pin `ORACLE_VERSION`; generate vectors from pristine
   BTK; diff `GameBuild/engine/` in CI. *Done when* CI fails on an intentionally-broken drag
   constant and passes when reverted.
8. **Native engine tests.** Plain-CMake CTest target + first tests (conversions,
   atmosphere ISA points, zero convergence). *Done when* `ctest` passes locally
   without Emscripten installed.

After step 8, Increment 0 is done; proceed to Increment 1 per §5.

---

## Open decisions for the owner (surfaced, not silently assumed)

1. **npm vs. pnpm** and **plain CSS vs. Tailwind** — agent's discretion unless you
   care; both pairs are churn-safe.
2. **Art bar** for the 3D ranges (stylized-clean vs. photo-leaning) — affects asset
   budget from Increment 1; plan assumes stylized-but-honest.
3. **Night/lit-range condition** (§E5) — kept, but parked in Increment 6; confirm or
   cut.
4. **Barrel life** (§G) — plan honors your lean (omit early); it re-surfaces as an
   Increment-6 question only.
5. **Obfuscate hidden truth via seed-derivation** (recommended in §6) vs. plain
   stored values — recommend seed; confirm.
