# Execution Protocol — how the coding agent works a plan

`Status: active` · `Rewritten: 2026-08-11` · `Restructured onto the standard scaffold: 2026-08-13` ·
`Audience: the executing AI coding agent`

> **Read this first, every session.** This file defines *how* you work. *What* to build is defined by
> the **active plan** in [`Plans/`](./Plans/).

Rule changes are recorded in the [Changelog](#changelog) at the end. If a plan or a doc you're reading
assumes a rule that isn't in this file, this file wins — check the changelog to see when it changed.

---

## 1. What this is

**The plan is the work. This protocol is the guardrails.**

You execute **one plan at a time**. The plan says what to build, in what order, and when to pause. This
document says how to behave while doing it — and, above all, when to stop and ask instead of deciding
something yourself.

**You read exactly two documents:** the active plan, and this file. Plans are written to be
self-contained; if a plan points you at a third document for something you need to execute a task,
treat that as a defect and report it (§8).

**Read the entire plan before starting.** Not just the next task — the whole thing, including its
decisions, its *Explicitly not doing* section, and every task's *Done when*. A task read in isolation
is a task read wrong.

**If the plan conflicts with this protocol, or with the code, stop and report it.** Do not pick
silently. Picking silently is the worse failure, because it looks like progress.

**You do not make decisions.** Every judgment call was settled before the plan was written, or belongs
to the owner at a stop point. Where the plan is silent on something you need, that is a hole to
surface, not a gap to fill.

---

## 2. Project declarations

### Paths

| | |
|---|---|
| This protocol | `Design/Execution-Protocol.md` |
| Active explorations | `Design/Explorations/` |
| Active plans | `Design/Plans/` |
| Backlog — the sole authority on what to build next | `Design/Tickets/` |
| Archive | `Design/Archived/Explorations/`, `Design/Archived/Plans/`, `Design/Archived/Tickets/` — filename `<yyyymmdd>-<Name>.md`, the date of the move |
| Archive catalog | `Design/Archived/ArchivedCatalog.md` — created on the first archive |
| Architectural decisions (ADRs) | `Design/Decisions/` — created on the first ADR |
| Canonical vocabulary | `Design/Glossary.md` — created on the first resolved term |
| Project context & conventions | `/CLAUDE.md` |
| App code | `GameBuild/app/` (TypeScript + React + Three.js + Vite PWA) |
| Owned engine | `GameBuild/engine/` (C++/WASM) · embind access only in `GameBuild/app/src/engine-bridge/` |
| Golden-vector harness | `GameBuild/validation/` |
| Frozen oracle | `BallisticsToolkit/` — pristine, local-only, git-ignored |

Nothing in the `Design/` root is ever archived. Everything in `Explorations/`, `Plans/` and `Tickets/`
is. See §11.

**Three documents are for planning, not execution.** `Design/build-plan.md` (architecture, stack, reuse
strategy), `Design/feature-catalog.md` (the design record: what shipped, when, and the design notes
behind unbuilt features) and `Design/toolchain-glossary.md` are read when a plan is *authored*. You
don't consult them to execute one — the plan already carries what you need.

**`Design/Archived/PROGRESS.md` is retired.** It holds the build history of increments 0–2 and every
plan through 2026-08-07, and it is kept only as a historical record. **Do not read it** — at 643 KB it
exceeds the file-read limit — and **do not write to it.** Task state lives in the plan (§5).

### Gates

Run before any task is marked done, **in this order**. The task may add more; it may never remove one.

1. **Engine native tests** — `cmake -B build-native && ctest` in `GameBuild/engine/`. *Conditional:
   only when engine source was touched.*
2. **Golden-vector harness** — `node GameBuild/validation/run.mjs` → zero or in-tolerance diff.
   *Conditional: only when engine source was touched.*
3. **App unit tests** — `npx vitest run` — green.
4. **Types** — `npx tsc --noEmit` — clean.
5. **Build** — `npm run build` succeeds. For PWA-affecting tasks, add an offline relaunch check.
6. **The task's own *Done when* items**, verbatim.

Gates 3–5 run from `GameBuild/app/`. A conditional gate that doesn't apply simply doesn't run — you do
not record that anywhere (§5).

### Guardrails

Hard constraints. Never violate one to make progress; needing to is a stop rule (§8).

1. **`BallisticsToolkit/` physics is immutable; its *build* may be minimally patched.** All engine work
   happens in `GameBuild/engine/`. To keep the oracle buildable on the current toolchain you may change,
   in BTK: `CMakeLists.txt` / build flags, `bindings.cpp`, and mechanical warning fixes — **provided the
   change cannot alter computed results.** Removing `-ffast-math` or `-O3`, or editing any expression in
   `src/ballistics|physics|match|rendering`, does alter results and is forbidden; escalate instead. Every
   such patch gets its own commit prefixed `oracle-patch:`, a line in
   `GameBuild/validation/ORACLE_VERSION` under the base commit, and a re-run of the McCoy/Litz source
   cross-checks afterwards.
2. **Never edit golden vectors or loosen tolerances** in `GameBuild/validation/` to make a failing check
   pass. A failing vector diff means the code is wrong — or, rarely, a real discrepancy to escalate (§8).
3. **Engine changes keep the baseline oracle diff green.** New engine features are additive and
   default-off; with them off, `GameBuild/engine/` output must match pristine BTK within tolerance.
4. **All UI shows MIL and MOA, metric and imperial**, via the units service only. No unit math inline in
   components.
5. **No hunting or animals content; no money economy.** Steel and human silhouettes (head/torso,
   IDPA-style) only. Do not port BTK's Boar or PrairieDog code.
6. **Persistence:** every save-schema change bumps `schemaVersion` and ships a migration plus a fixture
   save added to the migration test corpus.
7. **Offline is sacred.** Anything the app needs at runtime is bundled and precached. If you add an
   asset, add it to the precache manifest and re-verify offline launch.
8. **Hidden truth stays hidden.** True values never appear in UI, logs, or debug output visible in
   normal play. A dev-flag screen is fine.
9. **The Wiki article is the arbiter on ballistics correctness.** Where the game and a cited
   `Wiki/*.md` article disagree, the article and its source win — including against BTK. Log the
   discrepancy and escalate (§8); don't reconcile it yourself.
10. **No new dependencies** beyond those already in use (React, Three.js pinned, Zustand, `idb`,
    Vite + `vite-plugin-pwa`, Vitest, Workbox) without owner approval. **Never load anything from a CDN
    at runtime.**
11. **No dependency upgrades** — npm, emsdk, Three.js — unless a task explicitly says so. Pins are pins.
12. **Engine working rules.** Change `GameBuild/engine/` via the native build first (fast and
    debuggable), then rebuild WASM and re-run the vector diff. embind objects returned to JS must be
    `.delete()`d, and all embind access lives in `GameBuild/app/src/engine-bridge/` — writing embind
    calls anywhere else means you're in the wrong file. Keep engine diffs small and comment each with
    the Wiki article and source page it implements: `// per Wiki/coriolis-effect.md §2; Litz PDF p.XXX`.

### Environment & toolchain

**Assume no internet access.** Full local file and tool access; downloads may fail. The toolchain is
already in place — cmake, googletest, Emscripten 6.0.6, npm (via a `cafile` fix). Two standing limits:
**network access is sandbox-gated**, and **no listening sockets** — so a dev server is not something you
can start.

1. **Never assume a download will work.** Before any step needing the network (`npm install`/`npm add`,
   emsdk install, CMake `FetchContent`, `git clone`, `git push`, fetching a URL), test cheaply first —
   attempt the single smallest fetch.
2. **If it fails, do not retry workarounds.** No mirrors, no curl tricks, and never hand-write a
   dependency in place of installing it — a pinned package the owner installs is correct; a
   reconstructed approximation is a correctness hazard. Mark the task `blocked` and give the owner an
   exact, copy-pasteable install request: what to install, the command, the expected resulting
   path/version, and which task is waiting on it.
3. **After the owner reports done, verify** — version check, file exists, or a one-line smoke command —
   before resuming.
4. **Batch requests** where predictable, so the owner does one install session.
5. **GitHub Actions has internet**, so CI configs are fine. If `git push` fails locally, that's the
   owner's to hit, not yours to debug (§9).

---

## 3. Session ritual

Every session, in order:

1. **Read the active plan in full** (§1).
2. **Mirror the plan's tasks into the live session task list** (§4).
3. **Resolve any task marked `in progress` or `blocked` first.** Never start a new task past one of
   those. An `in progress` task carries a note saying where the last session stopped — start there.
4. **Otherwise take the first task that is not `completed`.**
5. **Do exactly what the task says.** Small steps; run checks as you go.
6. **Run the task's *Done when* items and the gates** (§2), exactly as written.
7. **Update the task's status in the plan** — this is the only record of state, and it must reflect
   reality before you stop, whatever the outcome.
8. **Surface the commit point if the plan marks one here** (§9). Otherwise say nothing about git.
9. **Continue straight to the next task unless the plan declares a pause point** (§6).

If the session must end mid-task, set the task `in progress` and write the *stopped mid-task* note (§5)
describing exactly where you stopped and what remains.

---

## 4. Task discipline

- **One task at a time, in the plan's order.** Do not reorder or parallelise unless the plan marks a
  task as safe to run alongside another.
- **Implement exactly what the task says.** Its *Files* list is the boundary — nothing outside it.
- **Adjacent problems get recorded, not fixed.** When you notice a real defect the task doesn't cover:
  append it to the plan's **Deferred** section, **and file it as a ticket in `Design/Tickets/`** with
  `Status: untriaged`, using the naming convention and ticket shape in `CLAUDE.md`. Then carry on with
  the task. Helpfully fixing something nearby is the most common way an executed plan goes wrong.

  You are the only filer that writes `untriaged` — it means *no human has assessed this yet*. Do not
  promote anything to `open`; that is the owner's call.
- **The live task list is a viewport, not a record.** Mirror the plan's tasks into it and update each as
  you start and finish, so the owner can watch progress without opening files. It disappears with the
  session; the plan is the durable state.

---

## 5. Statuses and notes

| Status | Meaning |
|---|---|
| `not started` | Untouched. |
| `in progress` | Being worked, or interrupted mid-way. |
| `awaiting owner` | Work done, halted at an owner stop, verification not yet performed. |
| `blocked` | Cannot proceed. See §8. |
| `completed` | **Owner-verified.** |

**`completed` means the owner has verified it.** A task whose verification the owner hasn't performed is
`awaiting owner`, never `completed`. You change it to `completed` only after the owner confirms the
verification passed.

**Exactly three notes are permitted**, each recording something the code cannot tell you:

1. **Material alteration** — you had to depart from the plan to finish the task, and how.
2. **Blocked** — why.
3. **Stopped mid-task** — where the work stopped and what remains.

**Write nothing else.** In particular, **never record gate results.** Green is the precondition for
advancing — you do not move to the next task on a red gate — so noting that tests passed says nothing. A
conditional gate that didn't apply is likewise not recorded.

---

## 6. Pause points

**Pause points are decided when the plan is written, not while coding.** The owner signed off on their
placement when they approved the plan. Between them you run continuously: do not invent a stop the plan
doesn't declare, and do not skip one it does.

**Checkpoint** — run the checks, record nothing, keep going. A red check is not a pause point; it's a
stop rule (§8).

**Owner-verification stop** — halt and wait:

1. Mark the task `awaiting owner`.
2. Give the owner the plan's **verification handle** verbatim — where to look, what to do, what must
   change, and what must *not* change.
3. Tell them exactly what to run.
4. Stop that thread of work.

**Run the plan's verification exactly as written.** It was authored against the code; improvising a
different check is how a broken feature gets signed off. If the handle doesn't work as described, that's
a defect to report (§8), not something to substitute for.

---

## 7. Verification

- Run the gates (§2) in order, plus the task's *Done when* items verbatim.
- Anything that can't be checked programmatically — how something looks, feels, or behaves on the iPad —
  is an owner stop, not your judgment call. Where the plan distinguishes desktop from on-device, honour
  it: they are different checks.
- **Never weaken a check to get green.** Not by loosening a tolerance, not by skipping a gate, not by
  marking a task `completed` with caveats. A failing check means the code is wrong, or you've found a
  real discrepancy worth escalating.

---

## 8. Stop rules — when not to push forward

Stop the task, set it `blocked` with a note saying why, and surface it to the owner when any of these
happens:

- A check fails and the fix isn't obvious within the task's scope.
- You would have to violate a guardrail (§2) to proceed.
- The plan and this protocol conflict, or the plan and the code conflict.
- BTK or oracle output disagrees with a Wiki article or a primary source.
- **The task's instructions no longer match the actual code.** Propose a corrected task in the note
  rather than improvising around the drift.
- You're about to make an architectural choice the plan doesn't cover: a new layer, a new interface, a
  new dependency, a schema redesign.
- An owner stop's verification handle doesn't work, and you can't fix it within the task's scope.
- The plan points you at another document for something you need to execute a task.

**A blocked task recorded honestly is a success condition of this protocol, not a failure.**

---

## 9. Git

**The owner runs every git command that writes history.** You never run `commit`, `push`, `checkout`,
`reset`, `rebase`, `merge`, or anything else that changes the repository's state. Read-only inspection —
`status`, `diff`, `log` — is fine.

Your job is to surface the plan's commit points. When you reach one, say so and repeat the plan's message
verbatim in the session — the owner is watching the task list, not re-reading the plan file. If the work
drifted from what the plan predicted, the message you give in-session wins; the plan's copy was a
forecast.

**Never offer a commit on a red gate.**

---

## 10. Plan completion

**A plan is finished when its close-out task is `completed`** — every task before it `completed` (or
skipped with the owner's approval), and the owner signed off the final verification.

The close-out task lists its own steps, and they include archiving the plan, its source exploration, and
every ticket the plan closed — each by the routine in §11. Follow the close-out as written; don't add
ceremony it doesn't ask for.

---

## 11. The archive routine

The one procedure for retiring an exploration, a plan, or a ticket. Every skill and every close-out that
archives anything **invokes this rather than restating it**, so the convention can change in one place.
The routine is identical for all three item types.

**What is archivable:** nothing in the `Design/` root, everything in `Explorations/`, `Plans/` and
`Tickets/`. That is the whole rule.

**1. Move it, under the same name.** Active mirrors archived exactly, so this is always "move it one
level down": `Design/Plans/Shot-History-Panel.md` → `Design/Archived/Plans/Shot-History-Panel.md`. A
folder-form ticket moves whole, folder and all.

**Never rename.** No date prefix, no sequence number, no suffix. The name an item was created with is
the name it keeps forever, because every skill in this project resolves items by name — a rename breaks
every reference and every `[[wikilink]]` pointing at it. Chronology lives in the catalog, not in
filenames.

**2. Append one line to `Design/Archived/ArchivedCatalog.md`** — create the file if this is the first
archive. One file covers all three archive subfolders. It is strictly chronological and append-only: the
new entry goes at the bottom, and nothing is ever re-sorted or edited in place.

Three forms. **Choosing between them is mandatory, never inferred:**

- `- <yyyy-mm-dd> · <Item-Name> · executed` — it ran to completion.
- `- <yyyy-mm-dd> · <Item-Name> · superseded by <Name> — <one clause saying why>`
- `- <yyyy-mm-dd> · <Item-Name> · won't fix — <one clause>`

A plan that ran to completion and a plan that was abandoned are both "archived", and confusing them is
how a future session resurrects the wrong idea. The why-clause is the part that stops an abandoned
approach being retried, which is why superseded and won't-fix carry one and executed doesn't. One clause
— not a sentence.

A ticket closed by a completed plan names that plan: `- <yyyy-mm-dd> · <Ticket-Name> · executed — closed
by <Plan-Name>`. That is provenance, not a why-clause; it tells a future reader where the work actually
happened.

**One line per item. Never a paragraph.** Per-entry prose is exactly how this file becomes the
unreadable 600 KB progress log it exists to replace — `Design/Archived/PROGRESS.md` is that log, and it
is why this rule is hard.

**3. Ask one question: does this document contradict shipped code?**

- **No** — you're done; the catalog line was the only write. Most items land here.
- **Yes** — put a banner at the top of the document naming the exact claim and telling the reader to
  trust the code, **and** write the catalog entry as `superseded by …` with the contradiction as its
  why-clause.

The banner cannot move into the catalog instead. Its value is positional: it works by being read
*before* the false claim is read, and the reader who is about to be misled is by definition not looking
at the catalog.

---

## Changelog

Rule history. The body above is always current; this section exists so a plan or an archived doc written
under an older rule can be understood rather than trusted.

- **2026-08-13 — restructured onto the standard scaffold.** The project adopted the shared design
  structure and its five skills (`explore`, `create-plan`, `create-ticket`, `decision`, `glossary`).
  Substantive changes:
  - **This file moved** from `Design/execution/execution-protocol.md` to
    `Design/Execution-Protocol.md`, and `PROGRESS.md` moved to `Design/Archived/PROGRESS.md`. A plan
    citing the old paths means these.
  - **Folders renamed:** `Design/Explore/` → `Explorations/`, and the archive's `Plan/` / `Explore/` /
    `Ticket/` → `Plans/` / `Explorations/` / `Tickets/`.
  - **`Design/Tickets/` is now the sole authority on what to build next**, replacing
    `feature-catalog.md` in that role — the catalog's unbuilt entries were migrated to tickets the same
    day. The catalog remains as the design record and the built history, and is a planning input only.
  - **Deferred observations are now filed as tickets** with `Status: untriaged`, not appended to the
    catalog.
  - **§11, the archive routine, is new** — one procedure for all three item types, with the
    `ArchivedCatalog.md` line replacing per-item prose. It also **retires the `<yyyymmdd>-` filename
    prefix**: archived items keep the name they were created with, because everything resolves items by
    name.
  - **Naming convention changed** to `Title-Case-Hyphenated` for explorations, plans and tickets, with
    tickets carrying a `Bug-` / `Feature-` / `Decision-` / `Chore-` prefix. Existing archived documents
    keep their old kebab-case names; names are never changed.
- **2026-08-11 — rebuilt from the generic template.** Regenerated from a stack-neutral protocol
  template, keeping this project's gates, guardrails, engine rules
  and offline environment. Substantive changes, all of which invalidate the execution sections of plans
  written earlier:
  - **`PROGRESS.md` is retired.** Task state now lives in the plan itself, with five statuses
    (`not started` / `in progress` / `awaiting owner` / `blocked` / `completed`) where **`completed`
    means owner-verified**. The old §7 `PROGRESS.md` format is gone.
  - **Gate results are no longer recorded anywhere**, and with them the rule that inapplicable engine
    gates be logged as **N/A**. Green is the precondition for advancing, so there is nothing to audit.
  - **Notes are limited to exactly three cases** — material alteration, blocked reason, stopped
    mid-task. Everything else, including per-task gate numbers and completion notes, is out.
  - **Deferred observations now go to `Design/feature-catalog.md`** marked *found during execution,
    untriaged*, as well as to the plan's own Deferred section. The old *Deferred observations* list in
    `PROGRESS.md` is closed.
  - **Plan-authoring rules moved out** to the `/plan` skill: where pause points and commit points fall,
    the commit-message format, verification-handle authoring, task sizing (the ~400-line / ~10-file
    guidance), and the choice of what a task contains. This document now only tells you to *perform*
    what the plan declares.
  - **§1's document map collapsed.** You read the plan and this file. `feature-catalog.md` and
    `build-plan.md` are planning inputs, not execution authorities, so the precedence table is gone —
    plans are self-contained and a pointer out of one is now a defect to report.
  - **§8's plan-completion procedure collapsed to one line**, because the plan's own close-out task
    carries the steps. The dormant increment-boundary paragraph is deleted.
- **2026-08-09 — rewritten clean.** Restructured at current state; section anchors (§2b, §2c, §4.8,
  §4b.6, §5, §6) preserved because plans and the archive README cited them. **Added the full
  verification handle** — Where / Positive / Negative, reading through to the new code with the symbol
  named, operable in place — where the rule previously asked only for *"something the owner can
  observe"*. *Those anchors no longer exist in this file; a plan citing §2b means §6 here, §2c means §9,
  §5 means §2 Gates, §6 means §8.*
- **2026-07-31 — plan-declared pause points.** Work became driven by a plan in `Design/Plans/`. Retired
  the blanket rule *"stop and confirm with the owner after every task"*, and demoted the ~400-line /
  ~10-file limit from a mid-task hard stop to planning-time guidance. Added commit points and the live
  task checklist. Plans written before this date — e.g. `target-system-plan` — ran under
  the per-task stop and the hard size limit; their execution sections are stale, their decisions are not.
- **2026-07-21 — increment plan retired as an ordered roadmap.** `feature-catalog.md` became the live
  source for what to build next; the increment task docs moved to the archive, still linked from
  individual catalog entries for their locked decisions and Done-when specs.
- **2026-07-13 — original.** Established the document map, session ritual, guardrails, offline rules,
  gates, stop rules and `PROGRESS.md` discipline. Amended the same day to allow minimal BTK *build*
  patches while keeping physics immutable.
