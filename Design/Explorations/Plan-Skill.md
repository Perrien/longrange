# /plan Skill — Exploration

Status: **CLOSED 2026-08-11**
Started: 2026-08-11 · via /explore · closed 2026-08-11
IDs: **S** = scope · **I** = implementation · **U** = UI/UX

> Scope in the owner's words (invocation): *"I want to create a new `/plan` skill. This should be
> based primarily on how we've been writing plans for this project… Plans will primarily be built
> from explore sessions… The headliner things about this plan skill is the plan will be delivered
> to a junior programmer so as many decisions as possible are already resolved and implementation
> details have been verified in the code base. prefactoring should be a facet of it. It should lean
> towards keeping the owner in the loop on the build and stops after any significant changes have
> been made for an owner verification test that involve some kind of UI confirmation that the build
> is working as expected, debug panels are an acceptable way to do this if no direct UI component is
> affected yet. I'd also like to look into the execution-protocol.md and see if that's something
> that can/should be rolled into the plan or kept as a separate document. And, if separate, can we
> design a new, general one that is not as tailored to this specific project or web development in
> general (something that would cover future web projects, xcode, etc)."*

**Notes-file location chosen:** `Design/Explore/` — the project's exploration folder, even though the
artifact under discussion is a global skill. Precedent: `Design/retrospective.md` is likewise a
portable artifact kept in this repo.

---

## Grounding

Facts established by reading, 2026-08-11. Every claim anchored.

- **A plan skill already exists and covers much of the ask.**
  `~/.claude/skills/write-plan/SKILL.md:3` (`description: Turn a finished grilling session into a
  plan a cheaper model can execute without judgment calls…`) — 187 lines, writes
  `Design/Plans/<Feature-Slug>.md`. It already carries: the executor-asymmetry framing
  (`:17` — *"A capable model writes this plan. A cheaper one executes it."*), *Confirm, don't
  recall* with fragment-carrying anchors (`:41`), *Close every decision* with a
  weasel-word list (`:52`), verification handles with mandatory Where/Positive/Negative
  (`:80`), task **Files / Done when / Do not** (`:72`), and a full template (`:101`).
  **What it does NOT have:** an explore-session input path (it reads *grilling*, `:9`), any
  mention of prefactoring, and any stack-neutral execution rules.
- **Installed skills:** `domain-modeling`, `explore`, `grill-with-docs`, `grilling`, `write-plan`
  (`~/.claude/skills/`). All the plan-adjacent ones set `disable-model-invocation: true`
  (`write-plan/SKILL.md:4`, `explore/SKILL.md:4`), i.e. slash-command-only.
- **The genericized protocol is already promised but does not exist.**
  `Design/retrospective.md:10` — *"the genericized protocol is packaged as a reusable skill so it
  can be installed into a new project rather than copy-pasted and re-derived."* No such skill is
  installed.
- **The retrospective has already done the portability triage** the invocation asks for:
  §4.1 *"Carries verbatim, any stack"* (`retrospective.md:259`), §4.2 *"Carries with the fixes"*
  (`:276`), §4.3 *"Stack-specific, needs replacing per project"* (`:285` — the gate list, the
  offline section, this project's guardrails), §4.4 an Xcode/Swift-specific list (`:295`,
  including *"`project.pbxproj` is a guardrail"* and *"Never touch signing, capabilities,
  entitlements"*).
- **`execution-protocol.md` is 406 lines and cleanly separable.** Portable: §1 document map with
  precedence (`:19`), §2b pause points (`:66`), §2c commit points + message format (`:133`),
  §2d live task checklist (`:192`), §3 task discipline (`:200`), §6 stop rules (`:297`), §7 log
  format (`:317`), §8 plan completion + archiving (`:340`), and its own changelog (`:376`).
  Project-specific: §4 guardrails (`:220` — BTK oracle, MIL/MOA, no hunting, hidden truth),
  §4b offline execution env (`:251`), §5 the gate list (`:276` — `ctest` → oracle → `vitest` →
  `tsc` → `build`), §9 C++/embind rules (`:363`).
- **The plan exemplar is `Design/Plans/mouse-release-fire.md`** (170 lines, the only live plan):
  Context (with feasibility scout) → *Decisions locked with the owner* table D1–D5 (`:20`) →
  Approach as one numbered sub-section per file, carrying **full TypeScript signatures**
  (`:38-58`) → *Explicitly not doing* (`:118`) → Verification: ordered gates with engine gates
  recorded **N/A** (`:132`) → a 12-row by-hand check table (`:142`) → pause point + a verbatim
  fenced commit message (`:159`). It has **no Tasks table** — it is a single-task plan.
- **Plan size is a known failure.** `retrospective.md:236` (§3.6 *"Plans got large"*) — ELR 66 KB,
  build spec 51 KB, rifle-ammo-store 51 KB, target-system 54 KB — *"a plan that big is no longer a
  work queue — it's a document."* Also `retrospective.md:153` (§3.1): `PROGRESS.md` reached
  **643 KB / 1354 lines** and *"exceeded the file-read limit; the agent it exists to serve can no
  longer load it."*
- **Prefactoring prior art is external, not in this project's docs.**
  `MattPocockSkills/skills/engineering/to-tickets/SKILL.md:23` — *"Look for opportunities to
  prefactor the code to make the implementation easier. 'Make the change easy, then make the easy
  change.'"* Plus its `<vertical-slice-rules>` (`:29`) and the **expand–contract** wide-refactor
  exception (`:40`). The nearest in-project equivalent is `retrospective.md:117` (§2.7
  *"Characterization guards before a refactor"* — the target-system plan's T0 pinned existing
  behaviour before introducing the abstraction).
- **The explore-session output shape is known and very closed.**
  `Design/Explore/ELR-Range-Dressing-And-Scatter-Targets.md` — 745 lines, `CLOSED 2026-08-11`,
  Grounding + S/I/U decisions each carrying its rejected alternatives, an empty Open queue, and
  Notes. Several entries are already implementation-grade (`I15` is a literal constant inventory;
  `U5` is a fixed 7-shot screenshot list).
- **Skill-writing guidance to obey:** `MattPocockSkills/skills/productivity/writing-for-agents/SKILL.md:78`
  — single source of truth, *"Duplication — the same meaning in more than one place — costs
  maintenance and tokens"*; `:39` progressive disclosure; `:74` prompt the positive rather than the
  prohibition.

---

## Scope & purpose

- **S1 — `/plan` REPLACES the installed `write-plan` skill (owner, Q1).** *"Yes, this will be a
  replacement."* One plan-authoring skill, not two: everything in `write-plan` that is still right
  gets absorbed, and `write-plan` is retired rather than left beside it. The reason it matters is
  maintenance — two skills writing to `Design/Plans/` under near-identical rules means every future
  rule change lands twice, the duplication failure `writing-for-agents:78` names.
  **Whether that is an edit-in-place or a from-scratch rewrite is explicitly the owner's
  indifference:** *"If making the necessary tweaks to write-plan is easier than rewriting, that's
  fine."* So it is a mechanics decision, recorded under Implementation, not a scope one.

- **S2 — `/plan` REFUSES a bare topic and points at `/explore` (owner, Q2).** *"Agreed, refuse the
  bare topic and point at /explore."* So the skill's first act is a **precondition check** on its
  input: are the decisions actually closed, is the Open queue empty or its remainder explicitly
  marked left-unresolved. If not, it names what is missing and stops — it does **not** interview
  (that duplicates `/explore` and reintroduces the interview `/explore` exists to own), and it does
  **not** guess-and-mark-Open (which produces a non-executable plan that looks executable).
  Accepted inputs are therefore a **closed exploration file** and **a closed session already in
  context**; a bare topic is not an input.
  **One narrow exception, so the refusal is not pedantic:** a small number of genuinely mechanical
  gaps that the *code* can answer — a file path, an existing signature, whether an export exists —
  are resolved by reading, because those were never the owner's decisions to make. Anything that is
  a judgement call goes back to `/explore`.

- **S3 — SINGLE PASS, in a fresh session. The two-pass mechanic is dropped (owner, Q3).** *"Drop the
  two-pass, single pass in a fresh session."* `write-plan:23` split the work into
  decisions-while-hot / approach-in-a-fresh-session because the decisions were the only part that
  died with the session. Under S2 that reason is gone: **the closed exploration file already IS the
  pass-1 artifact**, and a better one than a transcribed decisions table. So `/plan` reads the
  exploration, verifies against the code, and writes the whole plan in one go.
  **This also settles the tension S2 left open:** `/plan`'s expensive half is code verification,
  which wants a clean context window, so the in-context case is **allowed but not preferred**. The
  skill opens with a one-line nudge — if the exploration just closed in this session, start a fresh
  one, because the file on disk is all `/plan` needs.

- **S4 — The protocol STAYS A SEPARATE DOCUMENT from the plan, and reworking it is part of this
  job (owner, Q4).** *"We can keep the plan skill separate from the protocol, it just means we need
  to rework the protocol and decide which aspects are plan and which are protocol."*
  Rolling it in was rejected on three counts: 406 lines of boilerplate per plan, a rule change
  having to land in every live plan, and plans already being a known size failure
  (`retrospective.md:236`). It would also lose the protocol changelog
  (`execution-protocol.md:376`), which exists *"so that a plan or an archived doc written under an
  older rule can be understood rather than trusted."*
  **The decisive reason, though, is reachability:** the protocol governs sessions where `/plan` is
  never invoked. The executing agent reads the protocol and picks up the active plan; it does not
  run the planning skill. So the protocol must be a document the executor can open on its own.
  `/plan`'s relationship to it is *read it and conform*, as `write-plan:33` already requires.
  **Consequence the owner named, and it is in scope here:** the existing protocol must be reworked,
  because it currently mixes execution rules with plan-authoring rules (`execution-protocol.md:129`
  and `:135` are both *"when you write a plan…"* instructions sitting in the executor's document).

- **S5 — BOUNDARY RULE: B + C. The plan is the detailed what/order/when-to-pause; the protocol is
  guardrails that keep the plan followed and stop-and-ask when a question arises (owner, Q5).**
  In the owner's words: *"I generally don't want to be leaving any decisions to the executor, those
  should all be settled in the plan or by the owner at stop points (UI verifications)… The plan is a
  detailed list of exactly what needs to be done, in what order and when to pause for checks. The
  protocol is mostly guard rails to make sure the plan is followed and if any questions arise, stop
  and ask."* Option A (standard-vs-instance) is rejected.
  **This defeats the objection raised against B/C, and the reason is worth keeping:** the executor
  never *authors* a verification handle, it *performs* one the plan already spelled out. So the
  handle standard (Where / Positive / Negative / reads-through-to-new-code / operable-in-place) is an
  **authoring** standard and lives in the plan skill; the protocol only instructs the executor to
  perform the plan's verification exactly as written and halt. That also kills the current
  duplication between `write-plan:80` and `execution-protocol.md:96` — one home, the skill.
  **Named by the owner as protocol-side, keep:**
  - *"The protocol instructs the executor to read the entire plan, if a conflict is found stop and
    report it."*
  - §2 session ritual (`execution-protocol.md:42`) — *"most of that is appropriate"*, but **needs
    rework for the general version**.
  - §2d the live task checklist (`:192`) — *"important"*.
  **Left to settle later in this exploration:** whether §8 plan-completion/archiving (`:340`) is
  protocol behaviour or becomes an explicit final close-out task inside the plan — the owner's
  *"detailed list of exactly what needs to be done"* framing pulls it toward the plan.

- **S6 — ONE protocol file, generic when authored, EDITABLE in place per project. `/plan` assumes a
  protocol exists (owner, Q6).** *"The skill can assume that a protocol will exist. We're going to
  write that generic version and I'll be responsible for making sure future projects get it. It is
  not immutable, once in a project, it can be edited for project specific needs and not be another
  file."* So the generic-body-plus-project-declaration split is rejected, and with it any scaffolding
  step inside `/plan` — no template ships with the skill, and `/plan` does not create a protocol.
  **Delivery is the owner's job, by hand.** The accepted cost, stated rather than glossed: an
  improvement to the generic protocol does **not** propagate to projects already running an edited
  copy — the owner takes that on deliberately.
  **Design constraint this puts on the generic protocol document:** because it is written to be
  edited, the sections a project is *expected* to replace — the document map, the ordered gate list,
  the standing guardrails, the environment/toolchain quirks, the state/log/archive paths — must be
  visibly marked as fill-in-per-project, not blended into the portable prose.

- **S7 — PREFACTORING IS A MANDATORY PLAN SECTION with an explicit null, and characterization tests
  come first (owner, Q7).** *"A, mandatory section with explicit null and characterization tests
  first."* Three parts, all load-bearing:
  - **The section is mandatory and must resolve.** It either names prefactor tasks or states
    *"none needed, because X"*. The forced explicit-null is the whole mechanism: an empty section is
    visible in the file, a skipped thought is not. A bare instruction to *"look for opportunities to
    prefactor"* (`to-tickets:23`) has no completion criterion, and `writing-for-agents:46` names the
    consequence — a vague bound invites premature completion.
  - **Prefactor tasks are always ordered first.** *"Make the change easy, then make the easy
    change."*
  - **Behaviour-preserving verification, because a prefactor's check is inverted.** Nothing should
    change, so the handle cannot be *do X, see Y change*. Each prefactor task's Done-when is
    **existing tests pass unchanged**, and where the area being moved is not already covered,
    **characterization tests are written first as their own task**. Prior art in this project:
    `retrospective.md:117` (§2.7) — the target-system plan's T0 pinned existing plate geometry, hit
    truth and the two-sided paint invariant as a regression baseline *before* the abstraction landed,
    *"the difference between 'the refactor compiles' and 'the refactor preserved behaviour.'"*
  Rejected: **B**, prefactor tasks with no section (nothing distinguishes *no prefactor needed* from
  *never looked*), and **C**, a `[prefactor]` task flag (same weakness, plus vocabulary nobody needs).

- **S8 — WIDE REFACTORS USE EXPAND–CONTRACT, and the owner stop sits at CONTRACT (owner, Q8).**
  *"Include expand-contract, owner stop at contract."* A **wide refactor** — a rename or retype of a
  shared symbol whose blast radius breaks hundreds of call sites in one edit — is the named exception
  to vertical slicing, because no vertical slice of it can land green (`to-tickets:40`). The sequence:
  **expand** (add the new form beside the old so nothing breaks) → **migrate** in batches, each batch
  its own task and green because the old form still exists → **contract** (delete the old form once no
  caller remains, blocked by every migrate batch). The plan states the **batching axis** explicitly
  (per directory, per module).
  **Two additions on top of `to-tickets`:**
  - The **expand** task is where S7's characterization tests land, since the whole sequence is
    behaviour-preserving.
  - **The owner stop is at contract only**, not per batch — mid-migration states are green but
    half-migrated, so pulling the owner in to look at one buys nothing. Batches are checkpoints.
  Evidence this pattern is needed rather than theoretical: `retrospective.md:210` records a wide
  refactor sitting unplanned in the deferred graveyard — *"`RifleInstance.draws.zeroH` / `.zeroV` are
  misnomers post-D16 … not renamed because it's a schema change."*

- **S9 — OWNER STOPS: visibility trigger PLUS a ceiling of three consecutive tasks (owner, Q9).**
  *"Both, visibility trigger plus a max of three tasks."* Concretely:
  - **Every task that changes what the owner can see or feel gets an owner stop** — the visibility
    rule the protocol already has (`execution-protocol.md:88`: judged by feel, look, or on-device
    behaviour).
  - **Behaviour-preserving runs are checkpoints** (prefactor, characterization, expand, migrate
    batches) — **but never more than three consecutive tasks without an owner stop.** The ceiling is
    what stops a plumbing-heavy plan going dark.
  - **Plan completion is always an owner stop.**
  **Why the ceiling is safe here when a similar rule was retired:** `retrospective.md:189` (§3.3)
  records that *"stop and confirm with the owner after every task"* made the owner *"the bottleneck on
  work they had no view into"* — but its own lesson is *"start with more owner stops than you think
  you need and relax them — but never encode a numeric limit as a runtime interrupt."* Three is
  applied **at authoring time**, so it is a planning number, not a runtime interrupt.

- **S10 — DEBUG INSTRUMENTATION: declared per handle, DEFAULT PERMANENT, and an existing surface must
  be named first (owner, Q10).** *"C, default permanent, name the existing surface first."*
  - **Reuse before adding.** The plan must state whether an **existing** debug surface can carry the
    handle, and **name it**, before proposing a new one. This is the owner's own demonstrated
    preference: at `ELR…Scatter-Targets.md` `I13` a proposal to add a perf readout was corrected with
    *"There is an fps readout at the bottom of the page currently."*
  - **Each handle is marked permanent or temporary in the plan.** Default **permanent** — a field that
    displays real state costs nothing behind the dev flag and leaves a future session a working
    diagnostic.
  - **Temporary only for scaffolding, not readouts** — a button that forces a state the game cannot
    otherwise reach, a hardcoded override — because that kind of control misleads if it outlives the
    check. Temporary items are deleted by the plan's close-out task.
  - Building it stays inside the task's diff, per `execution-protocol.md:124` (*"part of the task and
    belongs in its diff, not an afterthought"*).
  Rejected: **A**, permanent always (across twenty plans the panel accretes into something nobody
  trusts), and **B**, removed always (deletes the one readout that just proved the feature works).

- **S11 — THE PLAN IS SELF-CONTAINED. The plan and the protocol are the ONLY documents the executor
  reads (owner, Q11).** This **rejects the cite-don't-restate recommendation outright.** In the
  owner's words: *"I worry about the plan referencing too many other documents and the executor (a
  junior remember) having to read not just the plan but a long explore session and the protocol and
  some other reference document and getting confused or slightly contradictory messages because this
  new plan is specifically changing something that was set up before. The plan and protocol should be
  the only things the executor needs to fully complete all the tasks… The executor is there to build
  the plan presented, not re-examine the reasoning behind it and examine the decision tree that got us
  here."*
  Three consequences, each closed rather than implied:
  - **No pointers out of the plan for anything the executor needs.** Not the exploration file, not the
    feature catalog, not a Wiki article, not an archived plan. If a fact is needed to execute, it is
    written in the plan. The specific hazard named is **supersession**: a plan often changes something
    an earlier document set up, so a junior reading both cannot tell which line is live.
  - **Rationale is NOT what makes a plan self-contained — instructions are.** The decision tree, the
    rejected alternatives and the derivations stay in the exploration file, which the executor never
    opens. This is what keeps self-containment from meaning *enormous*: the material that bloated the
    old plans to 51–66 KB (`retrospective.md:236`) was research and derivation, which is exactly the
    part the executor does not need.
  - **Length is accepted.** *"I realize this may make some plans quite long and if they need to be
    split into part 1 and part 2 we can look into that but I wouldn't expect them to get that long."*
    So no hard size ceiling, and splitting is a fallback rather than a rule.
  **The exploration file's role is therefore upstream-only:** input to `/plan`, and the durable record
  of *why* for the owner. It is not an execution document.

- **S12 — THE PLAN HOLDS STATE *AND* HISTORY. Nothing else exists (owner, Q12).** *"B. Each task has a
  status indicating not started / in progress / completed. The only time a note should be added is if
  material alterations to the plan had to be made to complete the step. Even a note that all tests
  passed is a complete waste as it should never move on to another task if tests fail."*
  - **The plan's task table is the single writable record of state.** No separate state file, no
    separate append-only build log, and **no `PROGRESS.md`-style companion** — the split the
    retrospective recommended at `:173` (a small `STATE.md`, an append-only `BUILDLOG.md`, a
    `DECISIONS.md`) is superseded by this, because the plan is already the document the executor must
    read.
  - **Gate results are NOT recorded anywhere.** Green is the *precondition* for advancing, so writing
    it down adds nothing — the executor never moves to the next task on a red gate. This deletes the
    current requirement that gate results (including the N/A declarations) be logged per task
    (`execution-protocol.md:52`, `CLAUDE.md` working agreement).
  - **A note is written only for a material alteration to the plan** — where the plan had to be
    departed from to complete the task. Notes are the exception, not the per-task habit.
  - **The cold-restart test is the requirement this serves** (owner, Q11): *"I should be able to stop
    the executor at some point, clear all context and tell a new agent to continue on this plan and it
    can see exactly which task was last completed and therefore which one to start now."*
  Rejected: **A**, plan-for-state plus an append-only history log (a second file to keep in step for no
  gain once gate results are gone), and **C**, keeping `PROGRESS.md` and mirroring status into the plan
  (two writable copies of the same state).

- **S13 — FIVE TASK STATUSES, and `completed` MEANS OWNER-VERIFIED (owner, Q13).** *"Blocked is a good
  addition and yes, it can include a note. awaiting owner is also good because a task may be completed
  but hasn't been verified or tested yet by owner. The task isn't actually completed until it's been
  verified."* This corrects the claim that awaiting-owner was derivable from a completed task plus a
  declared stop — that derivation conflates *done and verified* with *done but unverified*, which are
  materially different both to a resuming agent and to the owner scanning the plan.
  **The vocabulary and the lifecycle:**
  `not started` → `in progress` → (`awaiting owner` at an owner stop) → `completed`, with `blocked` as
  the halt state from `in progress`.
  - **`completed` is reserved for owner-verified work.** A task whose verification the owner has not
    performed is never `completed`.
  - **`blocked` may carry an explanatory note** — the second permitted note alongside S12's
    material-alteration note — because *why* it is blocked is information no fresh agent can recover.
  - **Who flips `awaiting owner` → `completed`**, closed as a consequence rather than asked: the
    executor writes `awaiting owner` when it halts, and changes it to `completed` only after the owner
    confirms the verification passed.

### Non-goals

Derived from the decisions above rather than asked separately; each is a thing `/plan` must not grow into.

- **No interviewing.** `/plan` never asks the owner a design question. An unsettled input is a refusal
  pointing at `/explore` (S2).
- **No code, no edits outside its own outputs.** `/plan` writes the plan file; on approval it moves the
  exploration. It does not implement, and it does not touch source.
- **No git.** Not even at approval. The owner runs every history-writing command (I3).
- **No protocol scaffolding.** `/plan` neither creates nor edits the protocol; it assumes one exists, and
  the owner installs it (S6).
- **No issue tracker, no ticket artifacts.** Tasks live in the plan. `to-tickets`' publish-to-a-tracker
  model is not adopted — it conflicts with the plan holding state (S12) and with self-containment (S11).
  The future `Design/Archived/Ticket/` folder (U3) is not a commitment made here.
- **No two-pass authoring** (S3) and **no Open Questions section** (U1).
- **No pointers out of the plan** for anything the executor needs (S11).

## Implementation

- **I1 — THE PLAN KEEPS A DECISIONS TABLE, with one-clause reasons (owner, Q14).** *"A, keep the table
  with one-clause reasons."* The exemplar is `mouse-release-fire.md:24` — *"`F` is the trigger
  condition… No Settings toggle: the key **is** the safety, so the feature is inert until deliberately
  used and nothing needs persisting."*
  **The line this draws is between a REASON and the DECISION TREE.** One clause of *why* is cheap and
  it makes a constraint stick under pressure: a junior who reads *"no Settings toggle, because the key
  itself is the safety"* leaves it alone, where one who reads only *"no Settings toggle"* may
  reasonably conclude it was an oversight and helpfully add one. The rejected alternatives, the
  measurements and the path that got there are the tree, and they stay in the exploration file the
  executor never opens (S11).
  Rejected: **B**, dissolving decisions into the tasks as bare instructions (loses the cheapest defence
  against helpful deviation), and **C**, a reasons-free table (same weakness for the same reason).

- **I2 — DELEGATE THE SEARCH, VERIFY EVERY ANCHOR FIRST-HAND (owner, Q15).** *"B, delegate the search
  but verify every anchor yourself."* `/plan` may fan out subagents to locate candidate files, existing
  patterns and prior art, but it **opens and reads every line it anchors** before writing it. Where it
  genuinely could not reach something, it says so in plain words in the task rather than writing a
  confident anchor it is guessing at — `write-plan:50`: *"An honest 'confirm this before proceeding; I
  couldn't reach it' is safe. A wrong anchor is not."*
  **Anchor format carries forward from `write-plan:45`:** `ScopeView.tsx:339`
  (`const holdingRef = useRef(false)`) — the fragment is what makes staleness self-detecting, so *"an
  anchor carrying the line it points at lets the executor confirm it's in the right place, and notice
  when it isn't."*
  Rejected: **A**, the author reading everything serially (~238 app source files; it spends the one
  window that also has to write the plan), and **C**, subagents reporting anchors the author writes down
  unverified (second-hand, and a confidently-wrong anchor is the failure the format exists to prevent).

- **I3 — GIT RULES CARRY FORWARD UNCHANGED, split across the two documents per S5.** Recorded from
  existing project precedent (`CLAUDE.md` working agreement, `execution-protocol.md:133`,
  `retrospective.md:88` §2.5 — *"144 commits later, `git log` reads as an actual build history. That is
  not the usual outcome of agent-assisted work."*), not re-asked.
  - **Protocol side (a guardrail):** the executor runs **no** git command that writes history;
    read-only `status` / `diff` / `log` is fine. The owner runs every commit and push.
  - **Plan side (the instance):** the plan declares its **commit points** on the task they follow
    (`commit` / `commit + push` / `—`), and carries the **ready-to-paste message verbatim** in a fenced
    block at that point. Placement: at every owner-verification stop, immediately before anything hard
    to unwind, after work that would hurt to redo, and always at plan completion.
  - **Message format:** `<plan-slug> <task>: <imperative summary, ≤72 chars>` plus 1–3 what-changed
    bullets. **No gate results in the message** — consistent with S12, which removes gate logging
    entirely.

- **I4 — EVERY PLAN ENDS WITH A MANDATORY CLOSE-OUT TASK (owner, Q16).** *"B, mandatory close-out task
  in every plan."* Authored by the skill with its items spelled out concretely, so the executor never
  consults the protocol to learn what *done* involves: delete the temporary debug instrumentation named
  earlier in the plan (S10), update the project's feature list at the named path, final `commit + push`
  with the message given verbatim, and move the plan file to the archive.
  **The protocol keeps one line only:** a plan is not finished until its close-out task is `completed`.
  Since the plan is now the historical record (S12), archiving the plan **is** the history-keeping step.
  This replaces `execution-protocol.md:340` (§8), two of whose four steps are already void — the
  `PROGRESS.md` update (gone under S12) and its dormant increment-boundary paragraph.
  Rejected: **A**, protocol keeps close-out (the executor would have to leave the plan to find out what
  finishing means), and **C**, splitting generic steps from plan-specific ones (the standard-vs-instance
  rule already rejected at S5, and it puts one job in two places).

- **I5 — DEFERRED OBSERVATIONS GO IN THE PLAN *AND* INTO THE PROJECT BACKLOG (owner, Q17).** *"A and
  also there should be a `Design/feature-catalog.md` it should be posted in there as a bug fix or
  situation to consider."* So an adjacent problem the executor notices but must not fix is written into
  the plan's **Deferred** section and surfaced to the owner at close-out, **and** posted into
  `Design/feature-catalog.md` as a bug-fix or situation-to-consider entry.
  **This is a better answer than the review-date proposal it replaced:** the recommendation was to
  surface items at the *next* owner stop so each got an expiry. Posting to the catalog instead gives each
  item a **destination in the backlog the project actually works from**, so it cannot be lost when the
  plan is archived — the precise mechanism `retrospective.md:204` (§3.4) says the old *Deferred
  observations* list lacked: *"deferred items need a destination and an expiry. A deferral with no review
  date is a deletion with extra steps."*
  **Generic form for the portable protocol:** the plan's Deferred section plus **the project's backlog
  document**, whose path the plan names — `Design/feature-catalog.md` is this project's instance of it.
  The executor's scope discipline is unchanged: it records, it does not fix.

- **I6 — THE BACKLOG ENTRY IS WRITTEN IMMEDIATELY, MARKED UNTRIAGED (owner, Q18).** *"B, immediately
  when found, marked untriaged."* The observation is appended to the backlog document the moment it is
  found, in a clearly-marked **found during execution, untriaged** form so it cannot be mistaken for a
  decided backlog item; the close-out task then confirms the list is there.
  **Why immediately rather than at close-out:** a plan that is abandoned or substantially rewritten
  mid-flight never reaches its close-out task, so a close-out-only write loses everything the run found.
  The cost — the executor writing to a project-wide document mid-plan — is bounded by the untriaged
  marking and by the write being pre-authorised in the plan rather than improvised.

- **I7 — EXACTLY THREE PERMITTED NOTES (owner, Q19).** *"A, three permitted notes only."* Resolves the
  contradiction between S12's *"the only time a note should be added is if material alterations to the
  plan had to be made"* and `execution-protocol.md:63`'s requirement to note where a mid-task session
  stopped. The three:
  1. **Material alteration** — the plan had to be departed from to complete the task.
  2. **Blocked** — why it is blocked.
  3. **Stopped mid-task** — where the work stopped and what remains, when a session ends inside a task.
  Each is justified identically: it records something **the code itself cannot tell you**. A fresh agent
  cannot distinguish a half-finished edit from a finished one, and with the owner holding every git
  command there may be no clean point to revert to — which is why restarting an interrupted task from the
  top (the rejected option **B**) is not safe. Everything else stays out, gate results included (S12).

- **I8 — THE GENERIC PROTOCOL'S SECTION LIST, CONFIRMED (owner, Q20: *"Yes, that holds"*).**
  **Portable body, copied verbatim into a new project:**
  1. **What this is** — the plan is the work, this protocol is the guardrails. Read the *entire* plan
     before starting. If the plan conflicts with this protocol, or with the code, stop and report.
  2. **Session ritual** — read the whole plan → mirror tasks into the live checklist → resolve any
     `in progress` or `blocked` task before starting a new one → otherwise take the first task that is
     not `completed` → do exactly what it says → run its Done-when plus the gates → update its status in
     the plan → continue, or halt at a declared pause point.
  3. **Task discipline** — one at a time, in order; implement exactly what the task says; adjacent
     problems go to Deferred plus the backlog marked untriaged; no new dependencies; no dependency
     upgrades.
  4. **Statuses and the three permitted notes** (S13, I7).
  5. **Pause points** — checkpoint: run the checks and keep going. Owner stop: mark `awaiting owner`, say
     exactly what to run and what to look for, halt. Never invent a stop the plan does not declare; never
     skip one it does.
  6. **Verification** — run the task's verification exactly as written; never weaken a check, skip a
     gate, or mark `completed` with caveats.
  7. **Stop rules**, keeping *"a blocked task recorded honestly is a success condition of this protocol,
     not a failure"* verbatim (`execution-protocol.md:314`; `retrospective.md:79` §2.4 says keep the
     sentence as written — *"the framing is the point"*).
  8. **Git** — no history-writing commands; surface the plan's commit point and its message.
  9. **Plan completion** — not finished until the close-out task is `completed`.
  **Marked fill-in-per-project, visibly flagged per S6:** the ordered **gate list** and which gates are
  conditional; the project's **guardrails**; **environment & toolchain** rules (network/offline, install
  requests, pinned versions); and **paths** (where plans live, the archive, the backlog document).
  **The Xcode/Swift specifics from `retrospective.md:308` become examples inside the fill-in blocks, not
  sections of their own:** never touch signing, capabilities, entitlements or the bundle identifier;
  `project.pbxproj` edits are owner-run the way git is; simulator-vs-device is a real owner-stop
  distinction.
  **One rule drops out as a consequence:** `retrospective.md:69` (§2.3) praised recording gates as
  **N/A** rather than omitting them, because *"an omitted gate and an inapplicable gate look identical in
  a log."* With no log at all under S12 there is nothing to protect, so the N/A-recording rule goes.
  **Gates still run; they are simply never written down.**

- **I9 — FILE LOCATION, NAMING AND THE PLAN-LEVEL STATUS LINE. Closed from existing precedent, not
  asked.** Plans are written to `Design/Plans/<Feature-Slug>.md`, title case and hyphenated, as
  `write-plan:13` and `mouse-release-fire.md` already do. The status line runs
  `DRAFT — not yet approved` → `APPROVED <date>` (U1) → the file moves to
  `Design/Archived/Plan/yyyymmdd-<Feature-Slug>.md` at close-out (U3, U4). Per-task status is separate and
  lives in the task table (S13).

- **I10 — THE PLAN'S SECTION LIST. Derived from the settled decisions; no section exists that one of them
  does not require.**
  1. **Title + status line** (I9).
  2. **Context** — why this is wanted, then the feasibility scout: what exists that this builds on, with
     anchors and fragments.
  3. **Decisions** — the table with one-clause reasons (I1).
  4. **Prefactoring** — the mandatory section, tasks or an explicit *none needed, because X* (S7).
  5. **Approach** — one sub-section per file in dependency order, carrying full signatures and the rules
     they enforce, so the executor **types it rather than designs it** (`mouse-release-fire.md:38-58` is
     the exemplar). This is where self-containment (S11) actually gets paid for.
  6. **Explicitly not doing** — the adjacent things to leave alone, each with the decision that rules it
     out.
  7. **Tasks** — the table plus one entry each (I11), ending with the mandatory close-out task (I4).
  8. **Deferred** — empty at authoring; the executor appends here and to the backlog (I5, I6).

- **I11 — THE TASK TABLE AND TASK ENTRY FORMAT. Derived.** The table's columns are **# · Task · Status ·
  Then · Commit · Note**, where *Then* is `continue` / `checkpoint` / `owner stop` (S9) and *Commit* is
  `—` / `commit` / `commit + push` (I3). Status is one of the five (S13); Note is one of the three
  permitted notes or empty (I7).
  Each task then carries, per `write-plan:72`: **Files** (the exact paths it creates or edits, and nothing
  outside that list), **Done when** (items evaluable mechanically), **Do not** (the adjacent things to
  leave alone — *"the executor's most common failure, and naming it is what prevents it"*), and at owner
  stops a **Verification handle**: **Where / Positive / Negative / Reads `<symbol>`**, marked **permanent**
  or **temporary** (S10).

- **I12 — SKILL MECHANICS: author a fresh `~/.claude/skills/plan/SKILL.md` and delete the `write-plan/`
  directory.** Owner was indifferent (S1: *"if making the necessary tweaks to write-plan is easier than
  rewriting, that's fine"*), so this is decided on which yields the cleaner file — and the changes are
  structural rather than incremental: the input path changes, the two-pass mechanic and the Open Questions
  section are removed, and prefactoring, statuses, notes, the close-out task and the deferred-observation
  route are all new. Frontmatter follows the installed siblings: `name: plan`, a description naming its
  branches, and `disable-model-invocation: true` (as `write-plan/SKILL.md:4` and `explore/SKILL.md:4` both
  set), so it is slash-command-only.

*(nothing settled yet)*

## UI / UX

- **U1 — `/plan` WRITES A DRAFT AND STOPS; APPROVAL IS A SEPARATE ACT; OPEN QUESTIONS ARE DROPPED
  (owner, Q21).** *"Agreed, DRAFT status and drop open questions."*
  - The file is written with `Status: DRAFT — not yet approved`, and `/plan` stops. Approval and starting
    to build stay separate acts, matching existing practice — `mouse-release-fire.md:3` reads
    `Status: **APPROVED 2026-08-07, in progress.**`
  - **The reply is a ten-second summary, not the plan inline** (a self-contained plan is too long to
    reproduce): the path; the **pause-point schedule** — task count, how many owner stops, where they
    fall; the prefactoring verdict (its tasks, or the explicit *none needed, because X*); the commit
    points; and **anything it could not verify in the code**, named plainly.
    The pause-point schedule is the part the owner is actually signing off on —
    `execution-protocol.md:130`: *"so the owner knows up front how many times they'll be pulled in."*
  - **Open Questions is removed as a section**, and `write-plan:186`'s instruction to report *"anything
    moved to Open Questions"* goes with it. Under S2 an unsettled input is a refusal, so a finished plan
    has none by construction. If the skill finds itself wanting one, that is the signal to stop and send
    the owner back to `/explore`.

- **U2 — ON APPROVAL, THE SOURCE EXPLORATION IS ARCHIVED (owner, Q21).** *"Once approved, the explore
  document that it was built from (if there is one) is archived."* So the approval turn does two things:
  flip the plan's status line to `APPROVED <date>`, and move the exploration file to the archive. The
  *"(if there is one)"* is the owner's own hedge — a plan built from an in-context session (S2's second
  accepted input) has no file to move.
  **This is safe precisely because of S11:** the plan is self-contained, so nothing downstream reads the
  exploration; it is the owner's rationale record, not an execution document.

- **U3 — ARCHIVED DOCUMENTS GO TO `Design/Archived/{Explore,Plan,Ticket}/`, DATE-PREFIXED
  `yyyymmdd-`, NO README UPDATE (owner, Q22 + Q23).** *"Move it to Design/Archived/Explore. No update to
  README necessary."* … *"I'm going to be doing a restructure soon and I plan on having
  Design/Archived/Explore, Plan and Ticket folders. Also, as part of that move, add the date to the
  beginning of the file name in yyyymmdd format. When I go into the folder with 35 archived plans, having
  them date sorted is more helpful than alphabetical."*
  So the near-duplicate-name concern is answered by intent rather than accident: the existing
  `Design/archive/` is being **replaced** by `Design/Archived/` with three typed subfolders, and the
  owner is doing that restructure. Filenames become `yyyymmdd-<Slug>.md` so a folder listing reads as
  build history rather than alphabetically.
  **The skill and protocol therefore reference the archive by these paths:** `/plan`'s approval step moves
  the exploration to `Design/Archived/Explore/`, and the close-out task (I4) moves the plan to
  `Design/Archived/Plan/`. No README entry in either case.
  **Noted, not in scope here:** the `Ticket` folder implies a ticket-shaped artifact that does not exist
  in this workflow yet.

- **U4 — THE DATE PREFIX IS THE ARCHIVE DATE (owner, Q24).** *"A, archive date."* For a plan, the day its
  close-out task completed; for an exploration, the day the plan built from it was approved — in both
  cases the day the move is actually performed. Rejected: the creation date, which files a long-running
  plan earlier than a short one that finished before it, and has to be dug out of the document's own
  status line where it may be missing. The archive date is the one date the agent doing the move always
  knows for certain.

## Open — queued, in ask order

The queue is empty — every question raised in this exploration is answered above.

- **Left unresolved, deliberately: splitting an over-long plan into part 1 / part 2.** The owner accepted
  that self-containment may make some plans long and said *"if they need to be split into part 1 and part 2
  we can look into that but I wouldn't expect them to get that long"* (S11). So no splitting mechanism is
  designed, and `/plan` writes one file. If a plan does become unwieldy in practice, that is the trigger to
  design the split — not now.
- **Left unresolved, out of scope: the `Design/Archived/Ticket/` folder.** The owner's planned restructure
  names it (U3), but no ticket artifact exists in this workflow and none is designed here.

## Notes

- The single biggest design tension found in grounding: **`write-plan` already implements most of
  the invocation's stated headline features.** Resolved at S1 (replacement) and I12 (fresh file, old
  directory deleted).
- **`retrospective.md` is effectively the design brief for the generic protocol** and should be read
  alongside this file when the protocol is written: §4.1 (`:259`) lists what carries verbatim, §4.2
  (`:276`) what carries with fixes, §4.3 (`:285`) what must be replaced per project, §4.4 (`:295`) the
  Xcode/Swift specifics.
- **Three of the retrospective's own recommendations are superseded by decisions here**, and the protocol
  rewrite should not re-import them: the three-way state-file split (`:173`) is replaced by the plan holding
  state and history (S12); the N/A-recording rule (`:69`) drops out with the log (I8); and the
  deferred-items *expiry* fix (`:204`) is replaced by an immediate untriaged backlog entry (I5, I6).
- **This project's own `execution-protocol.md` will need rewriting to match**, not just the generic one —
  `PROGRESS.md` retires, §5's gate list becomes a fill-in block, §8 collapses to one line, and §2/§2b/§2c
  lose their plan-authoring paragraphs to the skill. That is a second piece of work this exploration
  implies but does not itself perform.
- The owner's framing worth holding onto verbatim: *"The executor is there to build the plan presented, not
  re-examine the reasoning behind it and examine the decision tree that got us here."*
