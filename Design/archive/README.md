# Design/archive — superseded design documents

Moved here 2026-07-13 when [`../build-plan.md`](../build-plan.md) was produced.
Kept for provenance and rationale; **nothing in this folder is binding.**

| File | What it was | Superseded by |
|---|---|---|
| `phase-2-plan.md` | Earlier M0–M5 milestone plan ("extend BTK in place") | `../build-plan.md` §5 (sequencing) and §2 (reuse decision) |
| `game-design.md` | Game-layer vision/rationale | `../feature-catalog.md` (authoritative feature set) |
| `build-plan-prompt.md` | The prompt that commissioned the build plan | Its output: `../build-plan.md` |

⚠ **Relative links inside these files were written for `Design/` and are not
updated** — e.g. `./feature-catalog.md` now means `../feature-catalog.md`.
Executing agents should not read this folder except for historical context.

## Increment plan docs (archived 2026-07-21)

`increment-2.md`, `increment-2.1-plan.md` … `increment-2.4-plan.md`, and
`increments-3-6.md` moved here from `Design/execution/` — the owner retired the
staged, in-order increment plan as the build roadmap. **They are not superseded by
a replacement document** — the decisions and data inside them (locked D-numbered
decisions, catalog research mappings, Done-when criteria) are still real and still
correct, they're just no longer being executed in sequence. `../feature-catalog.md`
is now the live "what's built / what's left" reference, and individual catalog
entries link directly into these files where a decision record or a Done-when spec
is still relevant for whenever that feature actually gets picked up. Historical
build log (what happened, when) stays in `../execution/PROGRESS.md`, which is
unaffected by this move.

⚠ Same caveat as above: internal relative links between these files (and to
`../execution/execution-protocol.md`) were written for `Design/execution/` and are
not updated.

## Completed plan docs (archived 2026-07-22)

`test-range-environment-plan.md` — moved here from `Design/Plans/` once **fully
built and owner-confirmed**, not because it was superseded. Unlike the
increment-plan docs above, this one ran to completion: all four stages (wiring +
gong, texture/terrain/sky/fog/lighting, vegetation, mountains + drifting clouds)
were built, iterated on through several owner feedback rounds each, and signed
off on device. Kept here for provenance (the locked decisions, the BTK source
line references it ports from, and the reasoning behind each tuning pass) rather
than as a live spec. `../feature-catalog.md`'s "Test Range" entry and
`../execution/PROGRESS.md`'s Stage 1–4 rows are the authoritative record of what
actually shipped; this file is the plan that was executed to get there.

