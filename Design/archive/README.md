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

## Completed plan docs (archived 2026-07-26)

Three more docs moved from `Design/Plans/` on completion — same reason as
`test-range-environment-plan.md` above: **executed to completion, not
superseded.**

| File | What it was | Where the live record is |
|---|---|---|
| `mil-zero-range-plan.md` | The Wooded Zero Range — a fanned four-station paper bay at 25/50/100/200 shot from a low knoll, plus the first real upgrade pass on the shared environment module (low morning sun, near-field shadows, tree silhouette variety, ridgeline mountains, aerial-perspective fog, wind-driven canopy sway). Five stages, all built. | `../feature-catalog.md` §E "Wooded Zero Range"; `../execution/PROGRESS.md` "Wooded Zero Range" rows |
| `2.4a-computed-dope-data-model.md` | Computed-DOPE nodes / confidence tiers / ladder rules + persistence. Pure data + rules; no UI. | `../execution/PROGRESS.md` row 2.4a |
| `2.4e-chronograph.md` | Chronograph — records true per-shot muzzle velocity per rifle+lot, so the player's MV figure is an *estimate* that tightens with sample size. | `../execution/PROGRESS.md` row 2.4e |

**Worth reading `mil-zero-range-plan.md` for, specifically:** it records several
results that were expensive to derive and are easy to get wrong again —

- shooter elevation above the targets is **ballistically free**
  (`error ≈ g·H²/(4v₀²)`, *independent of target distance*), which is what let the
  bay solve occlusion with a knoll instead of a wide target spread;
- a yard is shorter than a metre at every nominal distance, so the **metric
  layout's corridors are a strict superset of the imperial one's** — the world is
  built once and both unit systems ride inside it;
- the knoll needs a **short steep** forward face, not a tall one, or it grazes its
  own 25 m sight line;
- the sun must stay **behind the firing line**, or every target board is lit
  edge-on — which silently defeats the no-berm board-contrast plan.

It also keeps the superseded rules rather than deleting them (the
constant-angular-size boards, the linear-fog tuning), because knowing *why* an
approach was abandoned is the part that stops it being retried.

⚠ Same caveat as above: relative links inside these files were written for
`Design/Plans/` and are not updated — `../feature-catalog.md` now resolves
differently. References to them from source comments and from `feature-catalog.md`
/ `PROGRESS.md` WERE updated to the new `Design/archive/` paths.
