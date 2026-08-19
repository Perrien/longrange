# LongRange — Long-Range Rifle Shooting Simulation Game

A simulation-leaning game about long-range rifle shooting, built as an installable **web/PWA** in
**TypeScript + React + Three.js + Vite** on top of an owned **C++/WASM** ballistics core. The player's
core challenge is **building a correct firing solution** — reading range, wind, air density, angle, and
the rifle/ammo characteristics, then dialing or holding the right correction *before* taking the shot.
The shot itself is the payoff; the puzzle is everything that comes before it.

We lean **more toward simulation than arcade**: the underlying model should expose as many real-world
ballistic factors as possible, and knowledge learned in-game should transfer to reality. The project
owner is **new to long-range shooting**, so the Wiki doubles as a learning resource; explanations build
from first principles.

**Hard constraints** (binding on everything, detailed in `Design/feature-catalog.md` §0): runs
installable and offline on iPad/iPhone with **no paid Apple developer account and no re-signing**;
client-side persistence with no required backend; **MIL and MOA equally**, metric and imperial both;
**no money economy**; **no hunting or animals** — steel and human silhouettes only.

---

## Current phase

**Phase 2 — building the game on the BallisticsToolkit engine.** Phase 1 (domain documentation)
established the factor set; a mature, MIT-licensed ballistics engine — `BallisticsToolkit/` (BTK) — was
then found to already implement ~80% of the modeling and shooting experience we were designing, so the
project pivoted to building on it. The staged increment plan is retired as an ordered roadmap
(2026-07-21): increments 0–2 shipped in order, and everything since has run as one feature at a time.

**Progress (updated 2026-08-13):**

- **Build:** the dial-or-hold shot loop, hidden-truth model, zeroing flow, computed DOPE, both truing
  levers, the parametric rifle/ammo catalog (10 cartridges), four ranges, and a reactive-steel target
  system are shipped. `Design/feature-catalog.md` holds the full built record.
- **Wiki:** groups **A (Foundations)** and **B (the projectile)** drafted (articles 1–10), plus
  `range-estimation` and `mil-dots-subtensions` pulled forward to support the ranging mechanic — 12
  articles. Every claim source-cited by PDF page; formulas verified. Gap register in `Wiki/_gaps.md`.
- **Process:** the project moved onto the standard design scaffold on 2026-08-13 — `Design/Tickets/` as
  the backlog, `Title-Case-Hyphenated` names, the five skills below, and the archive routine in
  `Design/Execution-Protocol.md` §11.

**Data sourcing is hybrid.** Primary ground truth is the owner's PDFs (Litz, McCoy, FM 23-10), cited by
PDF page. For gaps those books don't cover, the owner supplies deep-research reports, which are ingested
into `Documentation/` as **clearly-marked secondary sources**, spot-checked, and cited as external
references — never mixed with the primary books.

## Design decisions locked in

- **Fidelity:** simulation-first. Model the major factors faithfully; make as many factors *available*
  as possible even if some are simplified for play.
- **Game pillars:** (1) precision & scoring, (2) missions/scenarios, (3) progression (gear/optics/ammo,
  difficulty).
- **Shipping target:** an installable web/PWA. Native Swift was ruled out by the free-Apple-account
  provisioning expiry — see `Design/btk-assessment-and-path-forward.md`.
- **Stack & reuse:** keep the validated C++/WASM physics core, extended in an owned `GameBuild/engine/`
  copy; **pristine `BallisticsToolkit/` is never modified and serves as the golden-vector oracle.** The
  app is TypeScript + React + Three.js (plain, no react-three-fiber) + Vite PWA, Zustand state, IndexedDB
  via `idb`, deployed to GitHub Pages. Decided in `Design/build-plan.md` §2.
- **Persistence:** client-side (IndexedDB), per-device, with export/import.
- **No money economy:** handloads are balanced by load-development effort, not currency. Barrel life is
  an optional soft resource the owner leans toward omitting — see the ticket
  `Decision-Include-Barrel-Life`.
- **Scope model:** one configurable optic, no scope catalog — magnification range, canted-base toggle,
  three reticle patterns; FFP first, SFP later.
- **When the game and a cited Wiki article disagree, the article and its source is the arbiter** (or the
  discrepancy is logged and escalated). This is how the engine gets validated.

---

## Document map — who wins on what

Per topic, not a ranking. A document can be the authority on one thing and irrelevant to another.

| Topic | Authority |
|---|---|
| What the code actually does | **The code**, over every document. An archived document that contradicts it carries a banner saying so. |
| Ballistics correctness | **The `Wiki/` article and its cited source** — over the game, over BTK, over any plan. |
| Terminology | **`Design/Glossary.md`** is the arbiter. Nothing overrides it. |
| What to build next | **`Design/Tickets/`** — sole authority; nothing else claims this. |
| A feature's design | **The exploration** beats the ticket that fed it. |
| Task order and content | **The active plan** beats its exploration. |
| Architectural rationale | **An ADR** in `Design/Decisions/` beats any plan or exploration, which are transient by design. |
| The game's full feature map, design notes for unbuilt features, and the built history | **`Design/feature-catalog.md`** — a planning input, never an execution authority, and no longer the backlog. |
| Architecture, stack, reuse strategy | **`Design/build-plan.md`** — likewise a planning input. |
| Anything archived | **Never wins.** Reference only. |

**Two conflicts resolve to a stop, not a winner:**

- **A plan versus `Design/Execution-Protocol.md`** — stop and report it. Never pick silently.
- **A plan versus an ADR** — stop. The correct resolution is to write a superseding ADR and mark the old
  one `superseded by ADR-NNNN`. Letting a plan quietly override a recorded decision is how the reasoning
  gets lost.

*Exploration beats ticket* holds only because an exploration that folds a ticket in must **answer** the
question that ticket poses. A ticket whose question was left unanswered is still the live authority.

---

## How work flows

**Explore → plan → build, and each has a skill.** The skills carry the rules; this is only the map.

1. **`/explore`** — a serial interview that settles scope, approach and UI into
   `Design/Explorations/<Feature-Name>.md`. It folds in the tickets it answers.
2. **`/create-plan`** — turns a **closed** exploration into a self-contained plan at
   `Design/Plans/<Feature-Name>.md`, written so a junior developer executes it without a judgment call.
   A plan lands as `DRAFT` and stops. **Approval is the owner's separate act, and approval is not
   permission to start building.**
3. **Building** runs from the plan and `Design/Execution-Protocol.md`, and nothing else. A plan that
   points you at a third document for something you need is a defect to report.

Three more skills fire from plain conversation, not a command: **`create-ticket`** (file one ticket),
**`decision`** (record an ADR), **`glossary`** (pin down a term).

---

## File naming

Explorations, plans and tickets are all **title case, hyphenated**: `Shot-History-Panel.md`.

**Tickets carry a type prefix, and there are exactly four types:**

| Prefix | What it is |
|---|---|
| `Bug-` | The code does something other than what it's meant to. |
| `Feature-` | Something the project doesn't do yet and should. |
| `Decision-` | A question with no answer yet that must be answered before something can be built. |
| `Chore-` | Work with no user-visible change — maintenance, cleanup, filling in blanks. |

So: `Bug-Scope-Drift-On-Reload.md`, `Feature-Shot-History-Panel.md`,
`Decision-Metric-Or-Imperial-First.md`, `Chore-Complete-Execution-Protocol.md`.

**"Observation" is not a type — it is a status.** An untriaged observation is still a Bug or a Feature.

**Names are unique across the whole project, and are never changed.** Not when the item is archived, not
ever. The name is the only handle anything has on it. *(Documents archived before 2026-08-13 keep their
old kebab-case names — `popper-star-plan`, `increment-2.4-plan` — for the same reason.)*

### The ticket shape

The whole of it. A ticket is not a spec — the moment one needs depth, it gets picked up by an
exploration, which is what explorations are for.

```md
# <Title>

Status: open | untriaged
Filed: <yyyy-mm-dd>
Picked up by: <Exploration-Name>        ← added when an exploration folds it in

One to three sentences. What the problem or the wanted thing is.
```

`open` means a human has assessed it and it's waiting to be picked up. `untriaged` means an agent filed
it on its own initiative and nobody has looked yet. **Only the owner promotes `untriaged` to `open`.**

A ticket is a **file** by default and a **folder** when it has supporting documents or data — a
screenshot, a log, a dataset. In folder form the body file is named after the folder:
`Bug-Scope-Drift-On-Reload/Bug-Scope-Drift-On-Reload.md`. A file can be promoted to a folder later.

---

## Reference design documents by name, never by path

**Tickets, explorations and plans are referred to by name.** Write *"the ticket
`Bug-Scope-Drift-On-Reload`"* — never `Design/Tickets/Bug-Scope-Drift-On-Reload.md`.

To find one, **glob the name**: `**/Bug-Scope-Drift-On-Reload*`. One call, and it either finds the item
where it currently lives or tells you it's genuinely gone.

This is why a ticket can be promoted from file to folder, and why anything can be archived, without
breaking a single reference. A stored path fails the other way: it rots silently, pointing at nothing
while still looking valid. Loud failure over quiet failure is the entire reason for the rule.

**Code is the opposite** — cite it by `path:line` *with the fragment it points at*, e.g.
`ScopeView.tsx:339` (`const holdingRef = useRef(false)`), so a stale anchor announces itself. **Wiki
articles and source PDFs are cited by path and page**, since they are stable published references. Three
different rules for three different things; all are hard.

---

## Where the durable records live

Both are created **lazily** — only when there is something real to put in them. Neither is pre-created
empty.

- **`Design/Decisions/`** — ADRs, sequentially numbered `0001-slug.md`. An ADR records that a decision
  *was made*, and why, in as little as one paragraph. Written only when a decision is hard to reverse,
  surprising without context, **and** the result of a real trade-off.
- **`Design/Glossary.md`** — the project's canonical **domain** vocabulary. One or two sentences each,
  devoid of implementation detail. Written the moment a term is resolved. *(Not to be confused with
  `Design/toolchain-glossary.md`, which is the opposite: plain-language explanations of the build tools
  for the owner.)*

---

## `LocalOnly/` — project files that never leave this machine

A root-level folder, beside `Design/` and the source tree. It is **excluded from the repository**, and it
exists for anything that genuinely belongs to this project but must not be published: private notes,
credentials and keys, client or licensed material, raw captures, personal scratch data, screenshots that
show more than they should.

**Nothing tracked may depend on it.** No source file, test, fixture, plan or task may read a path inside
`LocalOnly/`. It does not exist in any other clone or on any other machine, so anything that reaches into
it works here and breaks everywhere else — and breaks silently, because the folder's absence looks like a
missing file rather than a design error. If the build needs a file, that file does not belong in
`LocalOnly/`.

**It is not part of the design structure.** Nothing in it is archived, catalogued, referenced by name, or
picked up by an exploration. Explorations, plans and tickets are tracked documents and stay in `Design/`;
`LocalOnly/` is a drawer, not a document store.

**Don't file things there on your own initiative.** Read from it or write to it when asked — otherwise
leave it alone. If something you're about to write looks too sensitive to commit, say so and ask, rather
than quietly routing it out of the repository.

---

## Repository structure

```
LongRange/
├── CLAUDE.md          ← this file: project context & conventions
├── BallisticsToolkit/ ← the engine we build on (C++/WASM + Three.js; MIT). Pristine oracle; local-only, git-ignored
├── GameBuild/         ← the buildable product
│   ├── engine/        ← owned copy of the BTK C++/WASM core (extended for Bucket A); native tests
│   ├── app/           ← the PWA: TypeScript + React + Three.js + Vite
│   └── validation/    ← golden-vector harness + fixtures (oracle diff vs BallisticsToolkit/)
├── Design/
│   ├── Execution-Protocol.md               ← how the coding agent works a plan: gates, guardrails, statuses, stop rules, archive routine
│   ├── Tickets/                            ← THE BACKLOG. Sole authority on what to build next
│   ├── Explorations/                       ← live /explore sessions, one per feature
│   ├── Plans/                              ← the ACTIVE plan(s) — one of the two documents an executing agent reads
│   ├── Decisions/                          ← ADRs (created on the first one)
│   ├── Glossary.md                         ← canonical domain vocabulary (created on the first term)
│   ├── feature-catalog.md                  ← design record: the full feature map, design notes for unbuilt work, and the built history
│   ├── build-plan.md                       ← architecture / stack / reuse plan (planning input)
│   ├── btk-assessment-and-path-forward.md  ← engine assessment + web/PWA decision (evidence record)
│   ├── toolchain-glossary.md               ← plain-language reference: every tool in the stack, and whether the owner needs to hold it
│   ├── bullet-catalog/                     ← cartridge/rifle research data (seed JSON + readable values)
│   └── Archived/                           ← Plans/ · Explorations/ · Tickets/ · ArchivedCatalog.md · PROGRESS.md (retired build log — do not read, 643 KB)
├── Documentation/     ← GROUND TRUTH: source PDFs, datasets, sources.md manifest, source-map.md page routing (local-only, git-ignored)
├── Wiki/              ← synthesized reference notes: the learning resource AND the correctness spec (local-only, git-ignored)
│   ├── Home.md        ← master index of all articles (start here)
│   ├── _gaps.md       ← circle-back register: source gaps, candidate factors, engine tasks
│   └── *.md           ← the articles
└── LocalOnly/         ← the owner's private drawer (see above)
```

### Documentation/ — ground truth

Primary sources only: PDFs, saved articles, manufacturer data, papers, datasets. This is what the Wiki
cites. We do not edit source material; we summarize and reference it from the Wiki.

### Wiki/ — our reference notes

Interlinked Markdown articles, one topic per file. Originally the heart of Phase 1; now a
**demand-driven support layer** — the owner's learning resource, the **correctness spec** the engine is
validated against, and the source material for in-game teaching. Write or upgrade an article when a
feature, a mechanic or a validation need calls for it; the four Bucket-A physics features are **gated**
on their articles reaching `reviewed` (see the ticket `Chore-Write-Bucket-A-Correctness-Spec-Articles`).

**Conventions:**

- One concept per file, `kebab-case.md` (e.g. `ballistic-coefficient.md`). Start from `_Template.md`.
- **Cross-link generously** with relative Markdown links: `[Ballistic Coefficient](./ballistic-coefficient.md)`.
- Every factual claim, formula, or number cites a source in `Documentation/` (or a clearly-marked
  external reference) in the article's **Sources** section.
- **Cite by PDF page number** — the coordinate our extraction tooling uses — not printed book pages.
  Printed-page offsets live in `Documentation/source-map.md`.
- **Figures:** cite them as text descriptions ("Fig 2.7, Litz PDF p.33"); don't extract images.
- When MIL and MOA both apply, show both.
- Keep a status tag at the top: `Status: stub | drafting | needs-sources | reviewed`.
- New articles get a line in `Wiki/Home.md`; source gaps and engine tasks are logged in `Wiki/_gaps.md`.
- Prefer clarity for a newcomer over jargon; define terms on first use and link to the glossary.

---

## Explaining the tech (owner knows the domain, not the toolchain)

The owner knows the **ballistics domain** deeply and the **build toolchain** barely. Optimize
explanations for decisions, not for completeness. Reference: `Design/toolchain-glossary.md`.

- **Lead with the consequence.** Open with what it means for the project, or what the owner has to
  decide. Mechanism comes second, and only as far as the decision needs.
- **Place every tool in the chain on first mention** — one line: what it is, what it feeds, who consumes
  its output. Not just its name.
- **Say explicitly when something is safe to ignore.** Most of the toolchain is set-and-forget.
  Distinguish "you need to understand this to decide" from "this is plumbing I'll handle — here's the one
  symptom to watch for."
- **Describe risks as symptoms, not mechanisms.** Not "float codegen may diverge" — "the oracle check
  prints something other than 0.000e+0, and drop numbers shift slightly."
- **Corrections only if they change a decision.** If a correction changes nothing actionable, cut it or
  keep it to a clause.
- **Prefer analogies to known things** over precise-but-opaque phrasing.
- **No jargon on first use without a definition in the same sentence.** This is the rule the Wiki already
  follows — it applies to conversation about the stack too, which is the one place the owner *is* the
  newcomer.
- The owner may say **"what does that mean for me"** or **"too deep"** — treat either as an instruction
  to re-answer in decision terms only.
- When a glossary entry turns out to be wrong, missing, or written at the wrong level, fix
  `Design/toolchain-glossary.md` rather than re-explaining it in conversation.

---

## Execution-time rules live elsewhere

Gates, guardrails, environment, pause points, statuses, git discipline and the archive routine are in
**`Design/Execution-Protocol.md`**. Read it before executing a plan, and before archiving anything.

**Git stays with the owner.** Never run a git command that writes history — no `commit`, `push`,
`checkout`, `reset`, `rebase`, `merge`. Read-only inspection is fine.
</content>
