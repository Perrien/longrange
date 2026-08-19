# Build-Plan Prompt — LongRange (web/PWA long-range shooting simulation)

> ⚠ **ARCHIVED (2026-07-13).** This prompt was executed and its deliverable exists:
> [`../build-plan.md`](../build-plan.md). Kept for provenance only. Relative links
> below were written for `Design/` and are stale.

> **What this file is.** A self-contained task prompt for a strong, repo-aware planning
> model. Hand it this file. Its job is to **produce a comprehensive build plan** for the
> LongRange game — **not to write the game.** It has read access to this repository.
>
> Companion input: [`feature-catalog.md`](./feature-catalog.md) is the authoritative
> "what." This prompt governs the "how it should decide" and the deliverable.

---

## Role & objective

You are a principal software architect. Produce a **comprehensive, actionable build
plan** for **LongRange**, a simulation-leaning long-range rifle shooting game shipped as
an installable **web/PWA**, built on (or informed by) the bundled **BallisticsToolkit
(BTK)** engine.

**You will not write the application.** Your single deliverable is a written plan that a
**separate AI coding agent** will execute. Optimize the plan to be executed by that agent
(and followed by a solo, non-expert owner who will steer it).

You have full latitude on everything **above the ballistics engine** — framework,
rendering approach, language, and whether to **extend BTK in place, port selected pieces
to a new stack, or rebuild from scratch** — subject only to the hard constraints below.

## Read first (in this order)

1. `CLAUDE.md` — project context, phase, and conventions.
2. `Design/feature-catalog.md` — **the authoritative feature set**, the hard
   constraints (§0), the correctness/validation rules (§L), and an explicit list of what
   is *your* call (§K). This is the spec you plan against.
3. `Design/btk-assessment-and-path-forward.md` — inventory of the existing BTK engine and
   front-ends, the ~3.4k-line portable C++ physics core vs. the ~37.6k-line JS
   presentation split, and the deployment reality that fixed the web/PWA decision.
4. `BallisticsToolkit/` — **the existing codebase.** Inspect it directly to judge reuse:
   `README.md`, `CMakeLists.txt`, `build_web.sh`, `src/` and `include/` (esp.
   `ballistics/`, `physics/`, `match/`, `rendering/`, `bindings.cpp`), and the
   `web/steel-sim/` front-end. Do **not** rely solely on the assessment doc — verify its
   load-bearing claims against the actual code (e.g. single-threaded WASM / no
   SharedArrayBuffer, the build/deploy path, how the WASM API is bound and called).
5. `Design/phase-2-plan.md` and `Design/game-design.md` — **reference only.** The prior
   M0–M5 milestone ordering is **not binding**; you re-derive sequencing.
6. `Wiki/Home.md` and the articles — the ballistics **correctness spec** and the teaching
   material; `Documentation/source-map.md`, `sources.md`, `_gaps.md` — source coverage
   (relevant to the no-oracle features in feature-catalog §L).

## Non-negotiable constraints

These are fixed inputs from `feature-catalog.md §0`. **Do not re-litigate them.** Any
architecture you propose must satisfy **all** of them:

1. Runs well on **iPad and iPhone**, installable to the home screen, **launches offline**.
2. **No paid Apple Developer account and no periodic re-signing/re-provisioning.** (This
   is why native iOS was ruled out.)
3. **Client-side persistence, no required backend**; schema-versioned save with
   **export/import to JSON**; leave a clean seam for optional future cloud sync.
4. **Simulation-first fidelity**; in-game knowledge must transfer to reality.
5. **Correctness is validated** against the Wiki + primary sources, with BTK usable as a
   golden-vector oracle for the factors it implements (see §L of the catalog).
6. **MIL and MOA equally; metric and imperial**, with conversions.
7. **No money economy.** 8. **No hunting/animals** (steel + human silhouettes only).

## What you decide (and how)

Decide, and justify, everything in `feature-catalog.md §K`:

- **Stack above the engine** — framework, rendering (3D) approach, language/tooling.
- **Reuse strategy** — extend BTK in place vs. port pieces vs. rebuild; and **how much of
  the C++/WASM physics core to reuse vs. re-port.** Whatever you choose, preserve a
  validation path (§L).
- **Feature priority, dependencies, and sequencing** — including the **first shippable
  slice** and each subsequent increment. Map catalog features to increments.

**Decision method:**
- Enumerate the candidate approaches (at minimum: extend-BTK-in-place, port-core-to-new-stack, full-rebuild) and the leading framework/rendering options.
- Score them against the hard constraints first (a stack that fails any constraint is
  out), then against effort, risk, and fit to the feature set.
- **Tie-breaker when candidates are close on merit: longevity and low maintenance** — a
  solo owner working with an AI agent will maintain this for years, so favor **stable,
  mainstream, large-ecosystem, low-churn** technology over novel or fast-moving options.
- **Recommend one path.** State the rationale, name the runner-up, and say why you
  rejected it. Prefer reusing the validated physics core unless you make a strong case
  otherwise; if you port it, specify how correctness is preserved.

## Deliverable

Write the plan to **`Design/build-plan.md`** (Markdown). Make it **comprehensive and
self-contained** for the executing agent. Required sections:

1. **Executive summary** — the recommended stack + reuse posture + the shape of the build,
   in a few tight paragraphs.
2. **Options & decision rationale** — the comparison above: candidate stacks/reuse
   strategies, how each fares against the constraints and the tie-breaker, the
   recommendation, and the rejected runner-up.
3. **Target architecture** — the layers (ballistics engine, game logic/state,
   presentation/3D, persistence, PWA shell), how they interface, and where the WASM (or
   ported) engine sits and is called.
4. **Engine reuse plan** — precisely what of BTK to **keep / adapt / port / drop**; if
   porting the physics, the porting and equivalence strategy; how BTK remains usable as a
   validation oracle.
5. **Feature roadmap & sequencing** — priority, dependency graph, the first shippable
   slice, and ordered increments to the full feature set. Explicitly place the four
   **no-oracle Bucket-A features** (custom/McDrag drag, bullet core/shape→BC+stability,
   Coriolis, incline/decline) with their **spec-article-as-implementation-gate** (per
   catalog §L). Flag anything you cut or simplify for the first release.
6. **Data model & persistence** — the save schema (versioned), export/import, and iOS
   storage durability approach.
7. **PWA / iOS specifics** — install UX, offline/service-worker strategy, storage
   eviction handling, audio-on-user-gesture, and any other on-device gotchas.
8. **Validation & correctness strategy** — golden-vector diffing against BTK, cross-checks
   vs. McCoy's .50 Ball M33 and Litz worked examples, and the spec-first discipline for
   the no-oracle features.
9. **Risks & mitigations.**
10. **Workspace, tooling & deployment** — repo/workspace layout, build tooling, and how it
    deploys to a free static host (GitHub Pages is the current assumption; note if you'd
    prefer another free static host and why).
11. **Immediate next steps / spikes** — the first concrete, verifiable actions for the
    coding agent (e.g. prove the BTK build, install the PWA on an iPad, confirm a save
    survives relaunch) — each with a clear success check.

**For every step in the roadmap and next-steps sections, include a verification check**
("done when …") the coding agent can confirm before moving on.

## Rules & guardrails

- **Do not write the application.** Small illustrative snippets to make a point are fine;
  implementation is the executing agent's job.
- **Ground your claims in the actual code.** Where a decision depends on how BTK is built
  or structured, verify against the files rather than trusting prose. You may build/run
  BTK locally if it sharpens the plan, but a working build is not the deliverable.
- **`feature-catalog.md` is authoritative for the "what."** If it conflicts with the older
  `phase-2-plan.md` / `game-design.md`, the catalog and this prompt win — note the
  discrepancy so it can be reconciled.
- **Surface assumptions and open decisions** the owner must make; do not silently invent
  scope or quietly cap coverage.
- Write for the two audiences: **granular and sequenced enough for an AI coding agent**,
  **explained well enough for a non-expert owner to follow and steer.**
