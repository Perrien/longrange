# Execution Protocol — how the coding agent works this plan

`Status: active`  ·  `Date: 2026-07-13`  ·  `Addendum: 2026-07-21 — increment plan retired as ordered roadmap`  ·  `Audience: the executing AI coding agent`

> **Read this first, every session.** This file defines *how* you work. *What* to
> build is defined by [`../build-plan.md`](../build-plan.md) (architecture &
> decisions) and the increment task docs in this folder. You execute **one task at a
> time**, verify it, log it, and stop at any red flag. You do not improvise
> architecture.
>
> **2026-07-21 addendum:** the owner retired the staged, in-order increment plan as
> the build roadmap after Increment 2 was largely built. `Design/feature-catalog.md`
> now decides what to build next — it is not tied to increment sequencing. The
> increment task docs referenced below (`increment-2*.md`, `increments-3-6.md`)
> moved to `Design/archive/`; they still hold real, locked decisions (D-numbered
> decisions, Done-when specs) and are linked from the relevant `feature-catalog.md`
> entry when that feature is picked up — read the rest of this protocol (task
> verification, stop rules, PROGRESS.md discipline) against **whichever feature the
> owner asks for**, substituting "the feature-catalog entry + its linked archive doc
> (if any)" everywhere below that says "the increment doc."

---

## 1. Document map (what is authoritative for what)

| Question | Authority |
|---|---|
| Project context, conventions | `/CLAUDE.md` |
| What the game must do (features, hard constraints) | `Design/feature-catalog.md` |
| Architecture, stack, reuse strategy, increment goals | `Design/build-plan.md` |
| **Your current work queue** | `Design/feature-catalog.md` (the staged increment plan is retired as an ordered roadmap, 2026-07-21 — old increment docs are archived at `Design/archive/increment-*.md`, still linked from individual catalog entries for locked decisions) |
| What's done / in flight / blocked | `Design/execution/PROGRESS.md` |
| Ballistics correctness (formulas, behavior) | `Wiki/*.md` articles + their cited sources — **the article always wins over code, including BTK** |

If two documents conflict: feature-catalog beats build-plan on *what*; build-plan
beats increment docs on *architecture*; increment docs beat both on *task order*.
When you find a conflict, **stop and log it** (§6) rather than picking silently.

## 2. Session ritual (every work session)

1. Read `PROGRESS.md`. Identify the current increment and the first task whose
   status is not `DONE`.
2. Read that task's entry in the increment doc **in full**, including its *Done
   when* and *Stop if* lists.
3. If the previous session left a task `IN PROGRESS` or `BLOCKED`, resume/resolve
   that first — never start a new task past a blocked one.
4. Do the task. Small steps; run checks as you go.
5. Run the task's **verification** exactly as written. All green → mark `DONE` in
   `PROGRESS.md` with date + one-line note + commit hash. Anything red → §6.
6. **Always update `PROGRESS.md` at the end of every task** (owner rule, 2026-07-13),
   whatever the outcome — `DONE`, `BLOCKED`, `AWAITING OWNER`, or `IN PROGRESS`. The
   task row's status/date/commit/note must reflect reality before you stop. This is
   not optional and not only for the DONE case.
7. Commit with message `inc<N>/task<M>: <summary>` (one task = one commit unless the
   task doc says otherwise).
8. **STOP after each task and confirm with the owner before starting the next one**
   (owner rule, 2026-07-13). Never auto-advance from one task to the next — not even
   when the next task is unblocked and obvious. Report what was done + what's next,
   and wait for the owner's go-ahead. This applies to every task boundary (0.0 → 0.1
   → … → 0.10, and across all increments).
9. If the session must end mid-task, set the task `IN PROGRESS` in `PROGRESS.md`
   with a note describing exactly where you stopped and what remains.

## 3. Task discipline

- **One task at a time, in order — and stop at every task boundary** (see §2.8).
  Tasks within an increment are ordered by dependency; do not reorder or parallelize
  unless the doc marks tasks `[parallel-ok]`. Do not begin the next task until the
  owner confirms.
- **Size limit:** if a task turns out to need > ~400 changed lines or touches > ~10
  files, stop — split it into sub-tasks in `PROGRESS.md` (`task 3a, 3b…`), get each
  verified separately.
- **Scope limit:** implement exactly what the task says. Adjacent improvements you
  notice go into `PROGRESS.md` under *Deferred observations* — not into the diff.
- **No new dependencies** beyond those the build-plan names (React, Three.js
  pinned, Zustand, idb, Vite + vite-plugin-pwa, Vitest, Workbox) without owner
  approval logged in `PROGRESS.md`. Never load anything from a CDN at runtime.
- **No dependency upgrades** (npm, emsdk, Three.js) unless a task explicitly says
  so. Pins are pins.

## 4. Standing guardrails (never violate; these encode the hard constraints)

1. **`BallisticsToolkit/` physics is immutable; the build may be minimally patched.**
   (Amended 2026-07-13, owner decision.) All engine work happens in `GameBuild/engine/`.
   To keep the oracle *buildable on the current toolchain*, you MAY change, in BTK:
   `CMakeLists.txt` / build flags, `bindings.cpp`, and mechanical warning fixes
   (e.g. new-clang `-Werror` complaints) — provided the change **cannot alter
   computed results** (removing `-ffast-math` or `-O3`, or editing any expression
   in `src/ballistics|physics|match|rendering`, DOES alter results — forbidden;
   escalate instead). Every such patch: its own commit prefixed `oracle-patch:`,
   listed in `GameBuild/validation/ORACLE_VERSION` under the base commit, and after any
   patch re-run the McCoy/Litz source cross-checks to confirm the oracle still
   matches ground truth.
2. **Never edit golden vectors or loosen tolerances** in `GameBuild/validation/` to make a
   failing check pass. A failing vector diff means the code is wrong (or, rarely, a
   real discrepancy to escalate — §6).
3. **Engine changes must keep the baseline oracle diff green.** Bucket-A features
   are additive and default-off; with them off, `GameBuild/engine/` output must match pristine
   BTK within the stated tolerance.
4. **All UI shows MIL and MOA, metric and imperial**, via the units service only.
   No unit math inline in components (catalog §0.6).
5. **No hunting/animals content; no money economy** (catalog §0.7–0.8). Do not port
   Boar/PrairieDog code.
6. **Persistence:** every save-schema change bumps `schemaVersion` and ships a
   migration + a fixture save added to the migration test corpus.
7. **Offline is sacred:** anything the app needs at runtime is bundled and
   precached. If you add an asset, add it to the precache manifest and re-verify
   offline launch.
8. **Hidden truth stays hidden:** true values never appear in UI, logs, or debug
   output visible in normal play (a dev-flag screen is fine).
9. **Correctness beats code:** where the game and a cited Wiki article disagree,
   the article + source is the arbiter; log the discrepancy (working agreement in
   `CLAUDE.md`).

## 4b. Offline execution environment (READ CAREFULLY)

**Assume you have NO internet access.** You have full local file/tool access, but
downloads (package registries, git clones, SDK installers, CDNs) may fail. The
owner can perform installs for you. Rules:

1. **Never assume a download will work.** Before any step that needs the network
   (emsdk install, `npm install`/`npm add`, CMake `FetchContent`, `git clone`,
   `git push`, fetching a URL), **test cheaply first** (e.g. attempt the single
   smallest fetch, or check `PROGRESS.md`'s *Environment capabilities* table from
   task 0.0).
2. **If it fails: do not retry workarounds** (mirrors, curl tricks, copying code
   from memory in place of a real dependency). Set the task `AWAITING OWNER` and
   write an exact, copy-pasteable install request in `PROGRESS.md` under
   *Owner install queue*: what to install, the exact command(s), the expected
   resulting path/version, and which task is waiting on it.
3. **After the owner reports done, verify** (version check / file exists / a
   1-line smoke command) before resuming the task.
4. **Batch requests** where predictable: if you can see the next 2–3 tasks need
   tools, queue them together so the owner does one install session.
5. **Never vendor a dependency by writing it yourself.** A pinned package the
   owner installs is correct; a hand-reconstructed approximation is a correctness
   hazard.
6. **Git remotes / CI:** GitHub Actions runs on GitHub's own infrastructure (has
   internet) — CI configs are fine. But if `git push` fails locally, queue it for
   the owner instead of debugging network.

## 5. Verification gates (run before marking any task DONE)

Minimum, in this order — the task may add more:

1. `engine` native tests: `ctest` green (when engine touched).
2. Golden-vector harness: `node GameBuild/validation/run.mjs` → zero/in-tolerance diff (when
   engine touched).
3. App unit tests: `npx vitest run` green.
4. Build: `npm run build` succeeds; for PWA-affecting tasks, offline relaunch check.
5. The task's own *Done when* items, verbatim.

Anything you cannot verify programmatically (e.g. "feels controllable on the
iPad") is an **OWNER CHECK**: mark the task `AWAITING OWNER` in `PROGRESS.md`,
tell the owner exactly what to try and what to look for, and stop that thread of
work until they respond.

## 6. Stop rules — when NOT to push forward

Stop the task, set status `BLOCKED` in `PROGRESS.md` with a clear note, and surface
to the owner when any of these happens:

- A verification check fails and the fix isn't obvious within the task's scope.
- You would need to violate a §4 guardrail to proceed.
- Two authoritative documents conflict.
- BTK/oracle output disagrees with a Wiki article or primary source.
- A task's instructions no longer match the actual code (drift) — propose a
  corrected task in the log instead of improvising.
- You're about to make an architectural choice the build-plan doesn't cover
  (new layer, new interface, new dependency, schema redesign).

**Never** "fix" a red check by weakening the check, skipping the gate, or marking
DONE with caveats. A blocked task recorded honestly is a success condition of this
protocol, not a failure.

## 7. PROGRESS.md format

Keep it terse and mechanical; it is the single source of truth for state.

```markdown
# Current increment: 0
## Increment 0
| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.1 | DONE | 2026-07-14 | abc123 | steel-sim runs locally |
| 0.2 | IN PROGRESS | 2026-07-13 | — | CMake copied; native target not building yet |
...
## Deferred observations
- (inc0/task2) build_web.sh assumes bash; fine on runner, note for docs
## Blocked / escalations
- (none)
## Owner decisions log
- 2026-07-14: owner approved pnpm
```

Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`.

## 8. Increment boundaries

An increment is finished only when: every task is `DONE` (or `SKIPPED` with owner
approval), the increment's **exit checklist** (end of each increment doc) is green,
and the owner has done the play-check on the iPad. Then:

- For Increments 1→2: proceed to the next detailed task doc.
- For Increments 3–6: first **run the just-in-time planning procedure** in
  [`../archive/increments-3-6.md`](../archive/increments-3-6.md) §JIT to produce
  `increment-N.md`, get owner sign-off on it, and only then start building. (Only
  applies if the owner explicitly asks to resume the staged plan for a later
  increment — see the 2026-07-21 addendum above; the default mode is
  feature-catalog-driven.)

## 9. Working with the C++ engine (Sonnet-specific notes)

- Prefer changing `GameBuild/engine/` via the **native build first** (`cmake -B build-native
  && ctest`) — fast, debuggable; only then rebuild WASM and re-run the vector diff.
- embind objects returned to JS must be `.delete()`d; all embind access lives in
  `GameBuild/app/src/engine-bridge/` — if you're writing embind calls anywhere else, you're
  in the wrong file.
- Keep engine diffs small and heavily commented with the Wiki article + source page
  they implement (`// per Wiki/coriolis-effect.md §2; Litz PDF p.XXX`).
