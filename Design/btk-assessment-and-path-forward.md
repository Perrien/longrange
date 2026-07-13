# BallisticsToolkit — Engine Assessment & Path-Forward Options

`Status: DECIDED — web/PWA on BTK (Option A)`  ·  `Date: 2026-07-10`  ·  `Phase: 1 → 2 bridge`

> This is a **design/decision document**, not a Wiki reference article. It records
> what the bundled `BallisticsToolkit/` (BTK) project provides, how it maps to our
> factor taxonomy, and the options for using it as we move toward Phase 2.
>
> **Decision (2026-07-10):** proceed on the **web/PWA path (Option A)**, building on
> the BTK skeleton. Driven by the owner's device constraint (§4): iPad + iPhone,
> no paid Apple account, no weekly re-signing. Execution plan lives in
> [`phase-2-plan.md`](./archive/phase-2-plan.md) *(archived; superseded by
> [`build-plan.md`](./build-plan.md))*.

## TL;DR

The `BallisticsToolkit/` folder in this repo is a mature, MIT-licensed ballistics
engine + simulation suite (C++17 → WebAssembly, vanilla JS + Three.js front-ends).
**It already implements ~80% of the modeling and "shooting experience" we've been
designing** — point-mass solver, atmosphere, spin drift, aero jump, Miller
stability, a Monte-Carlo dispersion→hit-probability model, an evolving curl-noise
wind field, and interactive steel-target + F-Class front-ends out to 1 mile.

What it does **not** have splits in two:
- **Bucket A — fidelity features we specifically want:** custom/measured drag
  models (CDM/McDrag), bullet **core & shape** modeling (weight/CG/moments of
  inertia), Coriolis, and incline/angle fire.
- **Bucket B — the *game*:** economy/gear shop, **per-instance hidden truth**
  (unit-to-unit rifle/ammo variation you must discover), a **DOPE-building/truing**
  loop, and a **mission/campaign** structure.

The reusable physics is small and portable (~3.4k lines of C++ math); the bulk
(~37.6k lines of JS) is stack-specific presentation. **Recommended path (given the
owner's iPad/iPhone + no-paid-Apple-account constraint): build on the web stack as
a PWA (Option A)** — the only route that runs hassle-free on all target devices,
reusing the validated engine as-is. Native Swift (Option B) fits only if the
project goes **Mac-only** or later accepts a paid Apple account. See §4 for the
deciding deployment reality.

## 1. What BTK is

- **Stack:** C++17 compiled to WebAssembly (Emscripten); front-ends in vanilla JS
  + Three.js/WebGL; auto-deployed to GitHub Pages. Client-side only, no server.
- **License:** MIT (see `BallisticsToolkit/LICENSE`) — free to reuse, port, copy.
- **Integrator:** point-mass trajectory, 2nd-order Runge–Kutta (RK2 midpoint), SI
  units internally.
- **Size (verified 2026-07-10):**
  - Portable physics core (`ballistics/`, `physics/`, `match/`): **~3,355 lines C++**.
  - Math helpers (`include/math/`): ~1,560 lines.
  - Target-reaction physics (`rendering/`): ~1,977 lines C++.
  - Web/UI/3D presentation (`web/**/*.js`): **~37,654 lines JS** ← the bulk, and
    the most stack-specific.

**Read of the split:** the part with real value (validated ballistics math) is a
few thousand lines and portable to any language. The large JS layer is rendering,
input, HUD, and scene — which we'd rebuild in whatever stack we choose regardless.

## 2. Capability inventory vs. our factor taxonomy

| Factor / mechanic (our Wiki) | BTK status |
|---|---|
| Point-mass trajectory / drop / [time of flight](../Wiki/) | ✅ RK2 point-mass solver |
| [Drag models](../Wiki/drag-and-drag-models.md) G1 / G7 | ✅ both; retardation-curve form |
| [Ballistic coefficient](../Wiki/ballistic-coefficient.md) | ✅ G1 **or** G7 BC per bullet |
| [Air density](../Wiki/) — temp / pressure / humidity / altitude | ✅ ISA atmosphere + speed of sound |
| Wind deflection | ✅ **evolving curl-noise field**, sampled along path |
| Spin drift | ✅ Litz empirical, continuous along trajectory |
| Aerodynamic (crosswind) jump | ✅ Litz muzzle figure generalized downrange |
| [Gyroscopic stability](../Wiki/gyroscopic-stability.md) / [twist](../Wiki/barrel-twist-rate.md) | ✅ corrected Miller SG + ideal-twist solver |
| [MV](../Wiki/muzzle-velocity.md) SD → vertical dispersion | ✅ `mv_sd` in Monte-Carlo |
| BC variance (gaps **N3**) | ✅ `bc_sd` in Monte-Carlo (per-shot BC) |
| Rifle/shooter precision (angular) | ✅ `rifle_accuracy` (rad), + scope cant |
| Dispersion cone → **hit probability** | ✅ Monte-Carlo (≤50k), CEP / mean radius / radial SD |
| Target size in **MOA/MRAD** | ✅ steel racks explicitly 2 / 1.5 / 1 / 0.5 MOA |
| Ranges to **1 mile (1760 yd)** | ✅ steel rack + wind flags at 1760 yd |
| Match scoring / competition | ✅ F-Class sim, sighters, AI wind-readers, remote play |
| Custom / measured drag (CDM, McDrag) | ❌ **absent** (grep-confirmed) |
| Bullet **cores / material / CG / moments of inertia** | ❌ **absent** — bullet is `{wt, dia, len, BC}` |
| Coriolis | ❌ absent |
| Incline / angle (uphill-downhill) fire | ❌ absent (flat range) |
| Economy / gear shop / inventory | ❌ absent |
| **Per-instance hidden truth** (unit variation) | ❌ absent (only *random* spread, no fixed unknown bias) |
| **DOPE-building / truing** loop | ❌ absent (auto-zeros; hands you rangefinder + BDC) |
| Mission / scenario / campaign | ❌ absent (sandbox + matches) |

## 3. The ~20% gap

### Bucket A — fidelity features we want

1. **Custom / measured drag models.** BTK is G1/G7-BC only (`DragFunction` enum).
   Our discussed CDM / McDrag path (author a Cd-vs-Mach curve from geometry;
   anchor to McCoy's measured **.50 Ball M33** curve) is a clean extension point,
   not a rewrite. See [drag article open question](../Wiki/drag-and-drag-models.md).
2. **Bullet core & shape modeling.** Needed for the "steel core vs. lead vs.
   tungsten → same shape, different weight/CG/stability" idea. Requires a bullet
   builder that integrates layered material densities → mass, CG, and moments of
   inertia (`Ip`, `It`) → feeds BC and a **full** stability factor (BTK's Miller SG
   uses the simplified length/mass form that assumes normal construction).
3. **Coriolis** and **incline/angle fire** — smaller, well-documented additions
   (both already have source routing in `Documentation/source-map.md`).

### Bucket B — the game scaffolding

4. **Economy / gear shop / inventory** — buy rifles, optics, ammo.
5. **Per-instance hidden truth** — the subtle-but-central one. BTK models the
   *random* shot-to-shot spread (the cone) well, but has **no persistent
   fixed-but-unknown per-copy bias** ("*this* rifle shoots 30 fps slow and 0.3 mil
   left"). That bias is what makes "3 copies of Rifle X differ" and drives the
   discovery gameplay.
6. **DOPE-building / truing loop** — zero, then shoot a data book, solver trues to
   your confirmed nodes; consistency (MV SD) sets how many shots to trust a node.
7. **Mission / campaign** — hit an X-MOA target at Y range within 2–3 shots,
   adjust for conditions, progression/unlocks (our pillars 2 & 3).

## 4. Stack consideration — web/WASM vs. native Swift

Owner leans toward native Swift on preference, but has a **hard deployment
constraint** (see below) that tilts the decision toward web.

**What the web/C++ stack gives that native Swift doesn't:**
- Zero-install distribution (a URL), runs on any device with a browser.
- **No provisioning expiry** on iPhone/iPad (the decisive factor — see below).
- Trivial sharing + the existing **peer-to-peer remote multiplayer**.
- The engine already exists and is validated in this stack.

**What native Swift gives (and whether it matters for this game):**
- **Haptics** (recoil/trigger feel) and **motion/gyro aiming** — genuinely
  native-only and nice; the strongest native-exclusive wins here.
- **iCloud/CloudKit cloud saves** — the one clear *easier* win (free cross-device
  sync, no backend) — but Apple-only and needs a paid account.
- Metal/RealityKit rendering, ProMotion — nice but **not decisive**: the physics
  is cheap and Three.js/WebGL renders this scene fine.
- App Store distribution; long-term product intent.

**Key fact that de-risks a port:** the ballistics is **pure math** (~3.4k lines)
and ports cleanly to Swift. The stack-specific weight is the ~37.6k-line JS
presentation layer — which we don't want to carry over anyway.

### Deployment reality (verified 2026-07-10) — the decisive constraint

Owner wants this on **iPad (at least), possibly iPhone**, and does **not** have a
paid Apple Developer account. That combination rules native iOS/iPadOS in/out:

- **Free Apple account (personal team):** sideloaded apps get a **7-day
  provisioning profile**, then won't launch until re-deployed from Xcode (also
  capped at ~3 sideloaded app IDs). This is the "reload every week" pain.
- **The only fixes all cost $99/yr:** paid + Xcode (~1-yr profiles), TestFlight
  (90-day builds), or App Store (permanent). *(AltStore can auto-refresh the
  7-day cert over Wi-Fi, but it's a fragile band-aid, still fundamentally 7-day.)*
- **Mac is exempt** — a locally-signed Mac app runs indefinitely. So **Mac-only
  native = no problem; iPad native = the weekly pain unless paid.**
- **Web has no such restriction** — runs on iPad/iPhone Safari with no expiry and
  no Apple account.

**PWA middle path (recommended if going web):** BTK is already a static web app;
adding a **manifest + service worker** makes it a Progressive Web App that installs
to the iPad/iPhone home screen, launches full-screen, and works offline — **no
expiry, no account, one codebase.** What you give up vs. native is haptics + gyro
aiming, and saves stay per-device (`localStorage`/`IndexedDB`) unless a
backend-as-a-service is added later.

**Conclusion:** the owner's three wants — iPad + phone, no weekly re-signing, no
paid account — and native Swift are **mutually exclusive today**. Web (as a PWA)
is the only option that satisfies all three. Native Swift only fits if the project
goes **Mac-only**, or the haptics/motion polish is judged worth $99/yr and an
Apple-only product.

## 5. Options going forward

**Option A — Build on BTK in place (extend the web app).**
Add Buckets A & B to the existing C++/JS codebase.
- ➕ Fastest to a playable build; reuses everything as-is.
- ➖ Commits to a stack the owner doesn't prefer; inherits ~37.6k lines of JS we'd
  have to learn/maintain; more code than we need.

*Hosting & persistence (verified 2026-07-10):* fully viable for self-hosting on
**GitHub Pages** — BTK already ships a GitHub Actions workflow
(`.github/workflows/deploy.yml`) that compiles C++→WASM in CI and publishes the
static `build-wasm/web` output. Nothing runs server-side at runtime: the WASM +
JS execute entirely in the browser (README: *"client-side only, no server
required"*), so "GitHub has no server-side code" is a non-issue — the compile is a
one-time CI step, the game runs on the client. Specifics:
- **No cross-origin-isolation needed.** BTK uses single-threaded WASM (no
  `SharedArrayBuffer`/threads) — confirmed by the absence of COOP/COEP headers.
  That's the one header GitHub Pages can't set, and BTK doesn't require it, so
  nothing breaks. `.wasm` is served with the correct MIME type by Pages.
- **`web/_headers` is ignored by GitHub Pages** (Netlify/Cloudflare syntax) but
  only sets caching + basic hardening — nothing functional. Wanting those headers
  is the *only* reason to prefer Cloudflare Pages / Netlify (also free static
  hosts) over GitHub Pages.
- **Only external dependency is optional multiplayer** — F-Class remote play uses
  the free PeerJS broker + WebRTC (a third-party service, not hosted server code);
  droppable entirely for a personal single-player build.
- **⚠ Persistence is client-side only.** With no backend, all game state —
  progression, economy, saved rifles/ammo, and **DOPE** (Bucket B) — must live in
  `localStorage`/`IndexedDB`/cookies. BTK already uses cookie-based settings
  persistence. Trade-off: **saves are per-browser/per-device, no cloud sync**
  unless a backend-as-a-service is added later. Since Bucket B assumes persistent
  state, design saves around client storage from the start. *(This same
  constraint applies to any static-hosted web build, including a from-scratch
  rebuild on this skeleton.)*
- Doesn't even require publishing: `./build_web.sh -s` runs the whole app from
  `localhost`; any static host works identically.

**Option B — Reference + port the physics core to Swift (RECOMMENDED).**
Treat BTK as a spec and test oracle. Port/borrow the ~3.4k-line physics core (and
the math helpers as needed) into native Swift; rebuild presentation in SwiftUI/
Metal/RealityKit; build Buckets A & B fresh in Swift.
- ➕ Matches owner's stack preference; keeps only the validated math; clean slate
  for our features; BTK stays runnable as a **validation oracle** (generate
  expected drop/drift/TOF and check the Swift port against it).
- ➖ Porting + native rendering is real work; lose the free web distribution and
  the existing multiplayer (recoverable later via GameKit, etc.).

**Option C — Strip BTK down to a headless engine and wrap it.**
Keep the C++ core, compile it for Apple platforms (or keep WASM), discard the JS,
call it from a Swift/native shell.
- ➕ Reuses the exact validated C++ (no port risk); avoids re-deriving the math.
- ➖ C++/Swift interop friction; still not "native"; owner not keen on C++.

**Recommendation (updated 2026-07-10, given the deployment constraint in §4):**
the iPad/iPhone + no-paid-account requirement tilts the choice to **Option A,
built as a PWA** — it's the only path that runs hassle-free on all the target
devices, and it reuses the already-validated engine as-is. Option B (native Swift)
becomes the recommendation **only if** the project accepts going **Mac-only**, or
later opts to pay $99/yr for an Apple-only product (where haptics, gyro aiming, and
CloudKit sync would pay off). Option C (wrapped C++) stays the fallback if a native
route is chosen but the physics proves fiddly to port.

*(The earlier draft recommended Option B on portability grounds alone; the §4
deployment reality supersedes that for the owner's stated device needs.)*

## 6. Validation strategy (regardless of option)

BTK is a gift for correctness: it's a runnable second implementation.
- Generate reference tables from BTK (drop, drift, spin drift, TOF, retained
  velocity) for known loads and diff our port against them.
- Cross-check both against **McCoy's measured .50 Ball M33** curve and Litz worked
  examples already cited in the Wiki — closing the loop between ground-truth
  sources, BTK, and our engine.

## 7. Impact on Phase-1 artifacts (if a path is chosen)

- `_gaps.md`: mark **N3 (BC variance)** as *modeled in BTK*; reclassify
  **custom-drag** and **bullet-core/CG** from "open question" to concrete Phase-2
  engine tasks; add Coriolis + incline as "available in reference sources, absent
  in BTK."
- `Home.md`: note the engine reference exists; the fidelity decision (BC+G7 vs.
  CDM) in [drag-and-drag-models](../Wiki/drag-and-drag-models.md) now has a
  reference implementation to weigh against.
- Phase-2 open question **#3 (tech stack)**: this doc is the input to that call.

## 8. Open decisions

1. **Stack:** native Swift (Option B) vs. web-in-place (A) vs. wrapped C++ (C)?
2. **Fidelity scope for v1:** ship on **BC + G7** (like BTK) and add **CDM/McDrag**
   later, or build custom-drag in from the start (needed for honest ELR/.50)?
3. **Bullet authoring depth:** expose a full **shape + core editor** (McDrag +
   computed CG/moments), or start with BC/weight presets and add the editor later?
4. **How much of Bucket B is v1:** is the first milestone the *DOPE-building +
   single-mission* loop, or the full economy/campaign?
