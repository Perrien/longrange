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
| `D16-raw-zero-error.md` | Raw off-the-shelf zero error — a new rifle+scope carries 5–35 MOA of pointing error the player must find and remove. Decision doc; built 2026-07-26. | `../execution/PROGRESS.md` owner decisions log, 2026-07-26 |

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

**`D16-raw-zero-error.md` is archived with ONE consequence still unbuilt.** Its §47
item 1 — the DOPE book always rendering with a *"not zeroed"* / *"not chronoed"*
status note, so the player knows an unzeroed table is provisional — needs the Data
Book UI (task 2.4f), which does not exist yet. The offset model and the off-paper
visibility handling shipped; the player-facing explanation did not. That is carried
forward in `../execution/PROGRESS.md` under Deferred observations, and should be
picked up with 2.4f rather than rediscovered.

Also worth knowing before re-reading it: the doc's zeroing-workflow section
describes a 25 yd station as something that "may be a new range feature". It since
became one — the Wooded Zero Range (`mil-zero-range-plan.md`) has 25/50/100/200,
and its backer boards are mark surfaces precisely so a 35 MOA first shot still
leaves a visible hole.

## ELR range plan + build spec (archived 2026-07-29)

`elr-dope-range-plan.md` (from `Design/`) and `elr-range-build-spec.md` (from
`Design/execution/`) moved here once the ELR range shipped. **Unlike most of this
folder these are not superseded — they were EXECUTED**, and the range they describe
is live content. They are archived because the work is done, not because it was
abandoned.

Both carry a status banner explaining what shipped and what did not. In short:
tasks 1–10 built and owner-signed on device; **task 11 (wind markers) deferred** by
the owner pending more wind design; **task 12 (catalog entries) blocked** on missing
bullet geometry — Prompt D in `../bullet-catalog/catalog-data-research-prompts.md`
is written and ready to run. The §5.4 scope elevation-travel model was never started
and is still a prerequisite for the holdover lesson the range was built around.

⚠ **The build spec contains two statements that the built code contradicts** — Task
10's Done-when names the wrong station for a 6.5 CM transonic reading, and Task 7's
frames-and-panels turned out to apply to the high line only. Both are called out in
its banner. Trust `../feature-catalog.md` and the code over this spec.

Cross-links *between these two files* were rewritten (both ends moved together);
every other relative link in them follows the folder convention above and is stale.

## Completed plan doc (archived 2026-07-31)

`target-system-plan.md` — moved from `Design/Plans/` on completion. **Executed, not
superseded:** all 16 tasks built and every on-device owner check passed
(2026-07-30/31). It builds the three-axis target abstraction — **Target × Mount ×
Group**, producing `PlateInstance[]` — that `../feature-catalog.md` §F needed for the
steel-target menagerie and the human-silhouette / IDPA zone scoring entries, proved
out on the Test Range. Live record: `../feature-catalog.md` §F and the "Target
system" rows in `../execution/PROGRESS.md`.

Worth re-reading it for the boundaries it deliberately drew, which are easy to
re-litigate wrongly: **Range A and ELR were intentionally not migrated** to authored
placement data (ELR's layout solves sight clearance against a runtime tree field and
*cannot* be static; Range A's computed ladder would lose its BTK authored-inputs
derivation) — the shared abstraction is Target × Mount × `PlateInstance`, **not** the
placement source, so authored placements are data while computed layouts stay code.
It also records the characterization guards (T0) that pin plate geometry, `discHit`
truth and the two-sided paint invariant as the regression baseline.

Note this one is a **link-safe move**: `Design/Plans/` and `Design/archive/` sit at
the same depth, so its `../feature-catalog.md` / `../execution/*` links still
resolve — unlike the docs above that came from `Design/execution/`.

⚠ Its **execution rules are stale**: it was run under the retired "stop and confirm
after every task" (§2.8) and hard ~400-line size limit (§3). Those were replaced
2026-07-31 by plan-declared pause points — `../execution/execution-protocol.md` §2b.
A banner at the top of the file says so.
