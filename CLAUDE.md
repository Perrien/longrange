# LongRange — Long-Range Rifle Shooting Simulation Game

## What this is

A simulation-leaning game about long-range rifle shooting. The player's core
challenge is **building a correct firing solution** — reading range, wind, air
density, angle, and the rifle/ammo characteristics, then dialing or holding the
right correction *before* taking the shot. The shot itself is the payoff; the
puzzle is everything that comes before it.

We lean **more toward simulation than arcade**: the underlying model should
expose as many real-world ballistic factors as possible, and knowledge learned
in-game should transfer to reality.

## Current phase

**Phase 2 — building the game (on the BallisticsToolkit engine).** Phase 1 (domain
documentation) established the factor set; a mature, MIT-licensed ballistics engine
— `BallisticsToolkit/` (BTK) — was then found to already implement ~80% of the
modeling and "shooting experience" we were designing. The project has **pivoted to
building the game on BTK, shipped as a web/PWA** (chosen so it runs on iPad/iPhone
with no paid Apple account and no weekly re-signing).

**Build plan produced (2026-07-13) — start here.** The *what* is consolidated in
`Design/feature-catalog.md` (authoritative feature set + hard constraints + validation
rules). The *how* is now decided in **`Design/build-plan.md`**: keep the C++/WASM
physics core (extended in an owned `GameBuild/engine/` copy; pristine `BallisticsToolkit/` stays
the golden-vector oracle) and build the game fresh as a TypeScript + React + Three.js +
Vite PWA. Execution is broken into verified, session-sized tasks for a coding agent
under **`Design/execution/`** — agents doing build work start at
`Design/execution/execution-protocol.md` and `Design/execution/PROGRESS.md`.
Superseded docs live in `Design/archive/`.

The project owner is **new to long-range shooting**, so the Wiki doubles as a
learning resource; explanations build from first principles. The Wiki is now a
**demand-driven support layer** (see Working agreement), no longer a precondition
to building.

**Progress (updated 2026-07-14):**
- **Wiki:** groups **A (Foundations)** and **B (the projectile)** drafted (articles
  1–10), plus **range-estimation** and **mil-dots-subtensions** pulled forward from
  §4 to support the ranging mechanic (12 articles total). Every claim source-cited
  (PDF pages); formulas verified. Gap register in `Wiki/_gaps.md` (MV SD/ES gap
  closed; BC-variance N3 now modeled in BTK).
- **Design/build:** the device constraint fixes a **web/PWA** shipping target that
  reuses the BTK ballistics engine. The full feature set is consolidated in
  `Design/feature-catalog.md`; **`Design/build-plan.md` (2026-07-13) decides the
  architecture, stack, reuse strategy, and sequencing**, with session-sized execution
  task docs under `Design/execution/`. Superseded docs (earlier M0–M5 plan, game-design
  vision, the build-plan prompt) are archived in `Design/archive/`.
- **Build execution** (live state in `Design/execution/PROGRESS.md` — authoritative):
  **Increment 0 COMPLETE** (offline PWA on iPad, durable saves, oracle-gated engine in
  CI, native tests, touch-aim feel; tagged `inc0-complete`). **Increment 1 in progress**
  — 1.1 game-state, 1.2 Range A scene, 1.3 scope pipeline (FFP MIL/MOA reticle), 1.4
  firing-solution + hit-sim all DONE and owner-signed on device; **1.5 (reactive steel +
  audio)** underway per `Design/execution/increment-1.5-plan.md`: **1.5a** (steel swing/
  rotate via the C++ SteelTarget) and **1.5d** (distance-delayed audio: report always,
  hit-only steel ping, energy-scaled, no miss sound) built + **owner-confirmed on device**;
  **1.5c** (impact marks + dust + reactive chains) in progress — **Commit 1 (pooled
  camera-facing sprite dust puffs, colour-keyed by hit/miss; ground-miss projection)
  built + owner-confirmed on device**, reactive chains are Commit 2; **1.5b** (in-scope
  bullet trace) still TODO. Test scope zero currently 300 yd (owner, for hold over/under
  testing).

## Design decisions locked in

- **Fidelity:** Simulation-first. Model the major factors faithfully; make as
  many factors *available* as possible even if some are simplified for play.
- **Game pillars:** (1) Precision & scoring, (2) Missions/scenarios, (3)
  Progression (gear/optics/ammo, difficulty).
- **Angular units:** Cover **MIL and MOA equally**, with conversions side-by-side.
- **Units:** Document both metric and imperial; show conversions.
- **Shipping target (fixed):** an installable **web/PWA** that runs on iPad/iPhone
  offline with no paid Apple account and no re-signing; native Swift ruled out by the
  free-Apple-account provisioning expiry. See `Design/btk-assessment-and-path-forward.md`.
- **Stack & reuse (DECIDED 2026-07-13, `Design/build-plan.md` §2):** keep the validated
  C++/WASM physics core, extended for Bucket A in an owned `GameBuild/engine/` copy; pristine
  `BallisticsToolkit/` is never modified and serves as the **golden-vector oracle**.
  The game app is built fresh: **TypeScript + React + Three.js (plain) + Vite PWA**,
  Zustand state, IndexedDB via `idb`, deployed to GitHub Pages. Tie-broken on longevity
  + low maintenance. *(Supersedes both "locked to Option A — extend in place" and the
  brief 2026-07-13 "reopened" status.)*
- **Persistence:** client-side (IndexedDB), per-device, with export/import; no required
  backend.
- **No money economy:** handloads balanced by load-development effort, not currency.
  Barrel life is an **optional** soft resource (owner leans omit early). See
  `Design/feature-catalog.md` §C2/§G.
- **Scope model:** one configurable optic (no scope catalog) — magnification range,
  canted-base toggle, 3 reticle patterns; both FFP and SFP in the full set (**owner
  leans FFP first**, SFP later). See `Design/feature-catalog.md` §C3.
- **No hunting / animals**; steel + human silhouettes (head/torso, IDPA-style) only.

## Open questions / next discussions

1. ~~**Data sourcing:**~~ **Resolved — hybrid.** Primary ground truth is the
   owner's PDFs (Litz, McCoy, FM 23-10), cited by PDF page. For gaps those books
   don't cover, the owner supplies **deep-research reports** (e.g. Gemini), which
   I ingest into `Documentation/` as *clearly-marked secondary sources*, decode/
   spot-check, and cite as external references — never mixed with the primary
   books. Tracked in `Wiki/_gaps.md`.
2. ~~**Feature priority & v1 cut:**~~ **Resolved — `Design/build-plan.md` §5.** Seven
   increments; the first shippable slice is Increment 1 (KD steel range, dial-or-hold
   shot loop). The four no-oracle Bucket-A features carry spec-article gates (catalog §L).
3. ~~**Target platform / tech stack.**~~ **Resolved.** Platform: installable web/PWA.
   Stack & reuse: see "Design decisions locked in" above / `Design/build-plan.md` §2.
4. New candidate factors (barrel harmonics, thermal soak, BC variance) — logged in
   `Wiki/_gaps.md` (N1–N3); **N3 (BC variance) now modeled in BTK.**

## Repository structure

```
LongRange/
├── CLAUDE.md          ← this file: project context & conventions
├── BallisticsToolkit/ ← the engine we build on (C++/WASM + Three.js; MIT). ~80% of the model. Pristine oracle; local-only (git-ignored).
├── GameBuild/         ← the buildable product (all site/code folders live here; only this + Design/ are pushed)
│   ├── engine/        ← owned copy of the BTK C++/WASM core (extended for Bucket A); native tests
│   ├── app/           ← the PWA: TypeScript + React + Three.js + Vite (created in task 0.4)
│   └── validation/    ← golden-vector harness + fixtures (oracle diff vs BallisticsToolkit/)
├── Design/            ← Phase-2 decisions & plans
│   ├── feature-catalog.md                  ← AUTHORITATIVE feature set + hard constraints + validation rules
│   ├── build-plan.md                       ← AUTHORITATIVE architecture / stack / reuse / sequencing plan
│   ├── btk-assessment-and-path-forward.md  ← engine assessment + web/PWA decision (evidence record)
│   ├── execution/                          ← the coding agent's working layer (START HERE for build work)
│   │   ├── execution-protocol.md           ← agent working rules, guardrails, stop rules, offline-env rules
│   │   ├── PROGRESS.md                     ← task state, environment capabilities, owner install queue
│   │   ├── increment-0/1/2.md              ← detailed, verified task docs
│   │   └── increments-3-6.md               ← coarse breakdowns + just-in-time planning procedure
│   └── archive/                            ← superseded docs (phase-2-plan, game-design, build-plan-prompt)
├── Documentation/     ← GROUND TRUTH: source articles, PDFs, datasets
│   ├── README.md
│   ├── sources.md     ← manifest of sources + quality/OCR notes
│   ├── source-map.md  ← article → source PDF-page routing table
│   └── *.pdf / *.txt  ← Litz, McCoy, FM 23-10 (+ a secondary MV-stats report)
└── Wiki/              ← synthesized reference notes (learning + correctness spec)
    ├── Home.md        ← master index of all articles (start here)
    ├── _Template.md   ← copy this to start a new article
    ├── _gaps.md       ← circle-back register: source gaps, candidate factors, Phase-2 engine tasks
    └── *.md           ← the articles (12 written; see Home.md for status)
```

### Documentation/ — ground truth

Primary sources only: PDFs, saved articles, manufacturer data, papers,
datasets. This is what the Wiki cites. We do not edit source material; we
summarize and reference it from the Wiki.

### Wiki/ — our reference notes

A collection of interlinked, cross-referenced Markdown articles, one topic per
file. Originally the heart of Phase 1; now a **demand-driven support layer** for the
Phase-2 build — the owner's learning resource, the **correctness spec** the engine
is validated against, and the source material for in-game teaching.

**Conventions:**
- One concept per file. Filenames are `kebab-case.md`
  (e.g. `ballistic-coefficient.md`).
- Start every article from `_Template.md` so structure stays consistent.
- **Cross-link generously** using relative Markdown links:
  `[Ballistic Coefficient](./ballistic-coefficient.md)`.
- Every factual claim, formula, or number cites a source in `Documentation/`
  (or a clearly-marked external reference) in the article's **Sources** section.
- **Cite by PDF page number** (the coordinate our extraction tooling uses), not
  printed book pages. Printed-page offsets live in
  `Documentation/source-map.md` for readers with the physical books.
- **Figures:** cite them as text descriptions (e.g. "Fig 2.7, Litz PDF p.33");
  do not extract images into the Wiki.
- When MIL and MOA both apply, show both.
- Keep a short status tag at the top of each article: `Status: stub | drafting
  | needs-sources | reviewed`.

## Working agreement

- **Phase 2 is active; build on BTK.** The old "stay in Phase 1 until the whole
  factor set is documented" rule is **retired** — the engine exists and has already
  made most modeling choices. Do not treat exhaustive Wiki coverage as a gate to
  building.
- **Wiki is demand-driven:** write or upgrade an article when a milestone, a game
  mechanic, or a validation need calls for it (as `range-estimation` was pulled
  forward for the ranging mechanic). Prioritize v1 + teaching topics; let the rest
  grow lazily. See `Wiki/Home.md` for the Phase-2 writing priority.
- New factors/articles still get a line in `Wiki/Home.md`; source gaps and Phase-2
  engine tasks are logged in `Wiki/_gaps.md`.
- **When the game and a cited article disagree, the article + its source is the
  arbiter** (or the discrepancy is logged) — this is how we validate the engine.
- Prefer clarity for a newcomer over jargon; define terms on first use and link
  to the glossary.
