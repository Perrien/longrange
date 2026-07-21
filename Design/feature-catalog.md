# LongRange — Feature Catalog & Build Tracker

`Status: restructured as a build tracker 2026-07-21 (was "draft 1" pre-build vision doc, 2026-07-13); built entries grouped into one Built section 2026-07-21`

> **Purpose.** The single list of every feature the game should eventually have, and
> its current build status. Each entry has a **title**, a **short description**, and
> either **Notes** (requirements / design decisions / code approach, for anything not
> yet built) or a **Built** line (completion date + the significant code changes it
> introduced — new modules, views, data-layer changes). Keep entries lean: small
> changes to an already-built feature don't need documenting here — that's what git
> history and `PROGRESS.md` task rows are for. When a feature ships, move its entry
> down into the **Built** section rather than deleting it, so this stays a complete
> map of the game. Not-built and partially-built entries stay in their category
> (§A–J) so open work is easy to scan; fully built entries live in one place at the
> bottom, grouped by the category they came from.
>
> This document used to also carry the pre-build vision brief (rationale, framework
> handoff prompt) that produced [`build-plan.md`](./build-plan.md) — that job is done.
> What's below is the live "what's built / what's left" reference. For the ballistics
> correctness spec, see [`../Wiki/Home.md`](../Wiki/Home.md); for the architecture/stack
> decisions, see `build-plan.md`; for day-to-day task state, see
> [`execution/PROGRESS.md`](./execution/PROGRESS.md) (the authoritative build log this
> catalog was condensed from, 2026-07-21).
>
> **The staged increment plan is retired as an ordered roadmap (2026-07-21).** The
> `increment-2*.md` / `increments-3-6.md` docs are no longer "build in this order" —
> **this catalog decides what gets built next.** Those docs still hold real, locked
> decisions and research data (D-numbered decisions, Done-when specs, catalog seed
> mappings), so they've moved to [`archive/`](./archive/) rather than being deleted,
> and individual entries below link into them where that detail is still needed.

---

## 0. Hard constraints — [FIXED]

Non-negotiable, binding on everything below (all currently satisfied by the shipped
architecture; still the guardrail for anything still to build):

1. Runs on **iPad/iPhone**, installable, **launches offline**. *(Satisfied — PWA since Increment 0.)*
2. **No paid Apple dev account, no re-signing.** *(Satisfied by the web/PWA choice.)*
3. **Client-side persistence, no required backend**; export/import to JSON; a clean seam
   for optional future cloud sync.
4. **Simulation-first fidelity** — in-game knowledge must transfer to reality; where
   gameplay and a cited [Wiki](../Wiki/Home.md) article disagree, the article + source wins.
5. **Correctness validated, not asserted** — Wiki + primary sources (Litz, McCoy, FM 23-10)
   are the behavioral spec; BTK is a golden-vector oracle where it already implements a factor.
6. **MIL and MOA equally**, metric and imperial both, conversions shown side-by-side.
7. **No money economy** — access is skill-gated, not purchased.
8. **No hunting, no animals** — steel + human silhouettes only.

---

## A. Ballistics & physics fidelity

#### Custom / measured drag models (CDM) + McDrag
A Cd-vs-Mach curve path plus a McDrag geometry predictor, anchored on McCoy's measured
.50 Ball M33 curve — enables honest ELR / past-a-mile.
**Not built** — planned Increment 5. No BTK oracle exists for this; the Wiki article
(`custom-drag-models.md`, unwritten) is the sole correctness arbiter and is a required
gate before implementation (catalog §L).

#### Bullet core & shape modeling → BC + full stability
Layered material densities → mass/CG/moments of inertia → feeds BC and a full
stability factor (beyond simplified Miller); makes "which core/shape" physically grounded.
**Not built** — planned Increment 5, gated on `bullet-anatomy-stability.md` (unwritten).

#### Coriolis
Well-sourced smaller addition (latitude + azimuth inputs, default-off).
**Not built** — planned Increment 3, gated on `coriolis-effect.md` (unwritten).

#### Incline / decline (angle) fire
Launch/target elevation with real gravity decomposition (default-off); needed for
valley/field missions.
**Not built** — planned Increment 3, gated on `angle-incline-shooting.md` (unwritten).

#### Temperature sensitivity of muzzle velocity
Per-load temp-sensitivity characteristic (temp-stable vs. temp-sensitive powders) so a
DOPE card trued on a warm day drifts on a cold one — distinct from air-density's effect
on drag. Feeds the hidden-truth ammo model (§D) and interacts with weather (§E).
**Not built** — planned Increment 4.

---

## B. The firing-solution shot loop (the heart)

*(no open items — both features currently planned for this category are built; see the Built section.)*

---

## C. Gear systems

#### Reticle pattern library (Christmas-tree / BDC-grid + custom-authoring workflow)
A second reticle pattern beyond today's MIL/MOA hash — a Christmas-tree (windage-hold
grid) and/or BDC-grid (vertical holdover stadia) pattern — plus a repeatable way to
author further patterns, including owner-designed ones.
**Not built** — planned Increment 6, after FFP (per the owner's stated lean; carries
forward the "not yet built" note on the Configurable optic entry in the Built section,
§C). **Notes:** the current reticle (`scope/reticle.ts`, drawn in
`scope/ScopeView.tsx`) is **vector Canvas-2D**, not a texture — tick positions are
recomputed every zoom change from angular math (`pxPerUnit` in
`scope/scope-projection.ts`), which is what keeps FFP subtensions exact at any
magnification (4.5–35×). Recommended authoring approach for new patterns, including a
self-designed Christmas tree: define it as a **list of line/point coordinates in mil
(or MOA) offsets from center** — e.g. "cross-hair spans, then a horizontal hold bar at
-2 mil elevation running ±4 mil windage, another at -4 mil running ±3 mil…" — the same
shape the existing MIL/MOA cadence table takes, so it inherits the exact scaling math
for free. A raster **PNG could be made to auto-scale** (treat it as a sprite whose
world-size is driven by the same `pxPerUnit` factor as the ticks), but that needs new
texture-loading code the renderer doesn't have today, and raster art will blur/alias at
the top of a 35× zoom range in a way vector lines never do — not recommended given the
zoom range. Practical workflow: sketch the design at a known reference size (e.g. "20
mil wide, 30 mil tall from center") in any tool (SVG, Illustrator, even a dimensioned
sketch on a mil-grid), then hand off the segment endpoints as mil-offset coordinates for
a developer to add as a new pattern entry alongside `CADENCE` in `reticle.ts`.

#### Magnum & ELR cartridge tier
.300 Win Mag, .338 Lapua, .375/.408 CheyTac, .50 BMG — the reach-to-a-mile and
anti-materiel end of the spectrum (upper bound: anti-materiel, not artillery).
**Not built** — planned as progression tiers in Increments 3 (magnums) and 5 (ELR/.50).
Starting data for these three (rifle-model attrs, hidden ranges, believed vs. true
MV/BC) already exists in [`bullet-catalog/catalog-seed.json`](./bullet-catalog/catalog-seed.json)
/ [`catalog-starting-values.md`](./bullet-catalog/catalog-starting-values.md) — it just
hasn't been trimmed into `game/catalog.data.json` yet (only 4 of the 7 researched
cartridges are shipped).

#### Handloading
Author a load — custom bullet shape/core (needs the Bucket A bullet editor) + powder
charge — tuned to a specific rifle for low SD. Must be developed (vary charge,
chronograph, find the node); per-rifle; reduces vertical dispersion only (wind call
untouched) — end-game ELR optimization, not a default win button.
**Not built** — planned Increment 5.

---

## D. Hidden truth & the DOPE loop (the game's identity)

#### DOPE nodes + confidence + chronograph + data book + range environment system
Confirm a real come-up at a distance (a **node**: physical fact + measured dials +
shots + conditions); a chronograph (any range, toggle on) measures true MV
(avg/SD/ES); a Data Book overlay shows the baseline believed curve vs. confirmed nodes
with confidence tiers, and box-vs-measured MV. Also ships a shared, config-driven range
environment (mountains/trees/textured ground, ported from BTK's `Landscape.js`) that
retrofits every existing range and dresses a new dedicated DOPE-ladder range.
**Not built** — planned 2.4, split 2.4a–f; **D1–D10 locked with owner 2026-07-20**, build
not yet started (owner paused active build 2026-07-21; the increment plan is retired as
an ordered roadmap, §K). Full decisions in
[`archive/increment-2.4-plan.md`](./archive/increment-2.4-plan.md).

#### Solver truing (two-lever: chronograph → MV, node → BC)
Fits the model to the player's confirmed reality: effective MV comes from a
chronograph reading directly (a real measurement); effective BC/drag-scale is then fit
from a confirmed node (farthest / near-transonic preferred) once MV is pinned.
Without a chronograph, a node instead solves MV alone (BC held at catalog) and stays
provisional — a single no-chrono node can't separate an MV error from a BC error. A
node's own measured value is never overwritten by a recompute; only unmeasured
distances ride the retrued curve.
**Not built** — planned 2.5. Lever-order decisions (D11–D13) locked with owner
2026-07-21 ahead of full 2.5 planning — see
[`archive/increment-2.4-plan.md`](./archive/increment-2.4-plan.md) §8 and
[`archive/increment-2.md`](./archive/increment-2.md) §2.5.

#### Tabulated DOPE cards
Freeze the trued curve into a static come-up table/turret tape for a baseline
condition, run off it without invoking the solver each shot (like a printed DOPE card);
honest tradeoff — the card drifts as conditions deviate from its baseline.
**Not built** — planned Increment 4, after truing exists to freeze.

#### Starter / factory data card
An engine-generated "factory card" the player can copy and then true into their own
profile — a real-world onramp and anti-grind valve.
**Not built** — unscheduled (no increment assigned yet; optional).

#### Reticle ranging
Measure a known-size target's apparent size against reticle subtensions to estimate
range (`size×1000÷mils` / `size_in×95.5÷MOA`); FFP keeps the read true at any zoom.
**Not built** — planned 2.6.

---

## E. Ranges & environments

#### DOPE range (dedicated ladder range)
One generous (~2 MOA) gong per century station out to the cartridge's catalog
effective range; freely available (not skill-gated); full range-environment dressing
as the showcase range.
**Not built** — planned 2.4c.

#### Range B — Known Distance (100–1000 yd), skill-gated
Unlocks after KD mastery on Range A.
**Not built** — planned 2.7.

#### Range C — ELR (500/1000/1500/2000/2500)
**Not built** — planned Increment 5.

#### Mission / UKD ranges
Unlabeled, irregularly placed targets; terrain + incline/decline; ranging via
known-size props or a laser rangefinder unlock.
**Not built** — planned Increment 3.

#### Shared range-environment rendering system
Config-driven module (sky/fog/lights/textured ground/instanced mountains/instanced
trees) ported from BTK's steel-sim `Landscape.js`, retrofit onto every range.
**Not built** — planned 2.4b (blocks the DOPE range's visual debut).

#### Four mission biomes (mountains, light forest, grassland hills, desert)
Distinct terrain/wind/visibility character per biome (thin air + switchy valley wind;
obscured targets; rolling mixed distances; heat mirage + long sightlines).
**Not built** — planned across Increment 3 (grassland, mountains) and Increment 6
(light forest, desert).

#### Known-size ranging props
Scenery doubling as ranging references with true dimensions in metadata (cars, park
benches, trash cans, signage, doorways/windows), per FM 23-10 doctrine.
**Not built** — planned Increment 3 (UKD ranges).

#### Weather & light conditions
Selectable conditions (clear/overcast/drizzle/night-lit) with honest mechanical
effects — mirage intensity, air density via the existing atmosphere model, visibility/
contrast — not just visual mood.
**Not built** — planned Increment 4.

---

## F. Targets & scoring

#### Steel target menagerie
Poppers, dueling trees, plate racks, swingers/spinners, dropping plates, hostage/
no-shoot plates for discipline.
**Not built** — planned Increment 6.

#### Human silhouettes + IDPA zone scoring
Head/torso zones; realistic or IDPA-style scoring; no-shoot plates share this scoring path.
**Not built** — planned Increment 3.

#### Scoring & first-round-hit probability
Hit/miss, time-to-hit, points weighted by target MOA & range; **first-round-hit
probability** is the headline long-range metric, computed via Monte-Carlo against the
player's trued params vs. hidden truth.
**Partially built** — basic engagement/hit tracking + shot budget shipped 2026-07-15
(task 1.6b, Increment 1). Not built: MOA/range-weighted points and the FRH-probability
headline metric, which need the mission runner — planned Increment 3.

---

## G. Missions & progression

#### Mission structure (UKD / field)
Hit an X-MOA target at Y range within a shot budget; unlabeled irregular placement;
difficulty laddered by range band + environmental uncertainty; ≥1 angled valley scenario.
**Not built** — planned Increment 3.

#### Skill-gated progression ladder
Master fundamentals on KD ranges → unlock field missions + longer-range gear/cartridges;
progression tracks personal skill/records, never currency.
**Partially built** — free-play on Range A exists today (Increment 1); the actual
gate (Range B unlock rule off recorded performance) is **not built**, planned 2.7.

#### Spotter unlock
Narrows wind uncertainty / calls corrections once unlocked.
**Not built** — planned Increment 6.

#### Barrel life (optional soft resource)
Hot magnums/.50s erode throats; accuracy degrades with round count; a new barrel is
the only sink. Owner leans **omit early** — low priority.
**Not built** — planned Increment 6, owner-optional (may stay omitted).

---

## H. Persistence & platform

#### Full export/import (v-anything)
Export/import the complete save — instances, lots, nodes, trued params, progression —
as JSON, reproducing the data book exactly on a second device.
**Not built** — planned 2.8 (exit task for the whole increment); today's export/import
only covers what schema v2 already carries.

---

## I. UI, teaching & onboarding

#### Data Book screen
Full-screen overlay: baseline believed curve vs. confirmed nodes (confidence + shot
count + conditions), a "generate a static come-up card" option, box-vs-measured MV.
**Not built** — planned 2.4f.

#### Onboarding & teaching flow
Learn-from-first-principles flow drawing on the Wiki as source material; terms defined
on first use, linked to a glossary.
**Not built** — planned Increment 6.

---

## J. Multiplayer — [PREF] deferred

Peer-to-peer remote play exists in BTK (F-Class sim, PeerJS + WebRTC) but isn't a v1
concern.
**Not built** — no increment assigned; a candidate to revisit post-core.

---

## Built

Fully shipped features, grouped by the category they came from. Small follow-on
changes to these aren't tracked here — see git history and `PROGRESS.md` task rows.

### A. Ballistics & physics fidelity

#### Core ballistics engine (point-mass trajectory, drag, atmosphere, wind, spin drift, aero jump, gyroscopic stability, dispersion/CEP)
The physics foundation: RK2 point-mass integrator, G1/G7 drag, full ISA atmosphere,
curl-noise wind field, Litz spin-drift + aero-jump, corrected-Miller gyroscopic
stability, Monte-Carlo dispersion (CEP/mean-radius/radial SD).
**Built** — 2026-07-13 (Increment 0). Inherited from BTK into an owned
`GameBuild/engine/` copy; validated by a 36-case/402-row golden-vector harness diffed
against pristine `BallisticsToolkit/`. No feature work here — this is the oracle-gated
base every other ballistics feature sits on.

### B. The firing-solution shot loop (the heart)

#### Core dial-or-hold shot loop
Pick rifle+ammo → know your gear (zero + DOPE) → face a target → dial or hold →
send → reactive feedback, within a shot budget. Player chooses dial (turrets) or hold
(reticle) per shot; wind is adjustable so every target re-solves.
**Built** — 2026-07-16 (Increment 1, tagged `inc1-complete`). Scope render pipeline +
FFP reticle (`scope/ScopeView.tsx`, `scope/scope-projection.ts`), firing-solution
plumbing (`engine-bridge/`, dispersion Monte-Carlo), reactive steel + distance-delayed
audio + impact FX, wind controls/HUD/shot-budget/scoring, DOPE side panel
(`game/dope-row.ts`).

#### In-scope bullet-flight trace
Watch the projectile's true sampled arc through the scope as it flies to impact
(per-shot, not a nominal cue).
**Built** — 2026-07-14 (task 1.5b, owner-confirmed on device). Was logged as
deferred in the original vision brief, then brought forward into Increment 1 — this
entry corrects that.

### C. Gear systems

#### Gear catalog architecture + rimfire/intermediate cartridges
Data-driven rifle/ammo catalog: cartridges, rifle grade tiers, factory ammo lots (box
MV/BC/SD), acquisition + inventory. Currently seeded with **.22 LR, .223, .308, 6.5 CM**
(rimfire → transonic-wall intermediate) across **hunting / factoryMatch / custom**
rifle grades.
**Built** — 2026-07-17 (2.2a/b, code-complete; 2.2d TruthInspector awaiting owner
sign-off). `game/catalog.data.json` + `catalog.ts`, `game/acquire.ts`, inventory store
slice + Loadout UI. Trimmed from the full 7-cartridge research set in
[`bullet-catalog/`](./bullet-catalog/) (`catalog-seed.json` + `catalog-starting-values.md`)
— the remaining 3 (magnum/ELR tier) are the §C "Magnum & ELR cartridge tier" entry above.

#### Configurable optic — FFP, one reticle, 4.5–35× zoom
Owner's one-scope decision (no scope catalog): pinch-zoom magnification, FFP reticle
with exact zoom-independent MIL/MOA subtensions.
**Built** — 2026-07-14 (task 1.3, owner-confirmed on device). `scope/scope-projection.ts`
(LINEAR/equidistant model), FFP reticle geometry, 0.9-era touch aim/wobble/breath/recoil
carried into the real pipeline.
**Not yet built:** canted-base toggle (the ELR elevation-travel gate, needed ~1 mile+,
Increment 5); a second and third reticle pattern (mil/MOA hash exists; Christmas-tree/
BDC-grid holdover reticle does not); SFP mode (Increment 6, after FFP — owner's stated lean).

### D. Hidden truth & the DOPE loop (the game's identity)

#### Per-instance hidden truth model
Each rifle copy gets fixed unknown biases (MV offset, zero offset, inherent angular
precision); each ammo lot gets a true mean-MV shift + SD + true BC (+SD) — the fixed
unknowns the player discovers, distinct from the per-shot spread the engine already models.
**Built** — 2026-07-17 (2.1, owner-confirmed on device). `game/hidden-truth.ts`
(per-field normalized draws mapped to truth on demand, no RNG seed), save schema v2,
a no-leak guard (`hidden-truth.guard.test.ts`) enforced so UI/scene code can never
import the truth module directly.

#### Zeroing flow
Fire a group at a known distance, read the true dispersion, center the zero on the
group centroid, confirm — teaches "don't chase individual shots."
**Built** — 2026-07-19 (2.3a–d, owner-confirmed on device). New sight-in range
(`range/SightInScene.ts`), `game/active-gear.ts` (gear-solve context), Confirm-zero
compose math (`pz_new = pz_old + dial − required`), don't-chase/calm hints.

#### Computed DOPE + true-vs-believed solve split
The WASM solver generates baseline come-ups on the fly from box specs (no hand-authored
charts) — the *believed* solve the player sees. Separately, the engine now also solves
the hidden-truth *true* trajectory, so an unzeroed rifle visibly misses and a zeroed one
centers, with the believed-vs-true downrange gap as the residual puzzle.
**Built** — 2026-07-19 (2.3e, code-complete, **awaiting final owner device sign-off**).
`engine-bridge/gear-solve.ts` (truth→solve seam, `solveGear()` returning both
`trueTable`/`believedTable`), Range A wired to true impact + believed `DopePanel`.

### E. Ranges & environments

#### Range A — Known Distance (50–500 yd)
Structured, labeled steel every 50 yd; the first shippable slice's home range.
**Built** — 2026-07-16 (Increment 1). `range/range-a-config.ts`, `range/RangeScene.ts`.

#### Sight-in / zeroing range
Three immobile paper targets (50/100/200) for the zeroing flow (§D).
**Built** — 2026-07-19 (2.3c). `range/SightInScene.ts` + sight-in target config/texture.

#### Test Range (environment sandbox + target proving ground)
Owner-requested side-thread, outside the numbered increment/task sequence: a
100 yd calm-wind range (no wind flags/controls — a fundamentals sandbox, not an
engagement) that doubles as the proving ground for the shared config-driven
environment module (textured terrain, sky/fog/lighting, instanced
trees/bushes/rocks/grass tufts) ahead of retrofitting it onto the DOPE range
(§E "Shared range-environment rendering system"). Plan: `Design/Plans/
test-range-environment-plan.md`.
**Built** — 2026-07-21 (all 4 plan stages code-complete). `range/TestRangeScene.ts`,
`range/environment/*` (`terrain.ts`, `sky.ts`, `lighting.ts`, `trees.ts`,
`ground-cover.ts`, `mountains.ts`, `clouds.ts`, `index.ts`'s `buildEnvironment`
orchestrator), dev harness in `range/RangeView.tsx` + a "Test Range" tab in
`debug/DevTools.tsx`. Code complete and verified (typecheck/tests/build clean)
through Stage 4 (mountains + drifting clouds, driven by the dialed wind); awaiting
owner on-device confirmation to close the plan. See `Design/execution/
PROGRESS.md` for the full iteration log.

### F. Targets & scoring

#### Reactive steel + persistent hit marks
Struck plates swing/knock down (momentum-driven); a persistent per-plate paint layer
records where hits land instead of only a transient dust puff.
**Built** — swing/reaction 2026-07-14 (task 1.5a, Increment 1); persistent paint
2026-07-18 (TS-A/B code-complete, TS-C/D code-complete — **all four awaiting final
owner sign-off on gates + device**). C++ per-target paint buffer → per-plate
`DataArrayTexture`, `range/plate-geometry.ts`, `engine-bridge/steel-target.ts`.

### H. Persistence & platform

#### Client-side save + offline PWA install
IndexedDB-backed, schema-versioned save; installable to the home screen, launches
full-screen offline; durable on iPad.
**Built** — 2026-07-13 (Increment 0), extended with a v1→v2 migration
2026-07-17 (2.1a) for rifles/lots/hidden-truth/playerZero.

### I. UI, teaching & onboarding

#### In-scope DOPE panel
Live believed come-up table for the active rifle+lot, readable mid-session.
**Built** — 2026-07-19 (2.3e). `scope/DopePanel.tsx`.

#### MIL/MOA + metric/imperial side-by-side display
**Built** for every screen that exists today (DOPE panel, HUD, scope). A full audit
across every future screen is planned as an Increment 6 task, once all screens exist.

---

## K. Explicitly the planning model's call — [MODEL]

Stack, reuse strategy, feature priority/sequencing, and what lands in the first
shippable slice were all decided in [`build-plan.md`](./build-plan.md); nothing here
reopens that.

## L. Correctness specs & validation

The Wiki is the behavioral spec; BTK is the golden-vector oracle for every factor it
already implements. The four Bucket-A extensions (§A: custom drag/McDrag, bullet core/
shape, Coriolis, incline fire) have **no BTK oracle** — their unwritten Wiki articles
are the sole correctness arbiter and are a **required gate**: no implementation task
for a gated feature may precede its article being `reviewed`. Sources are already
acquired and page-routed in [`../Documentation/source-map.md`](../Documentation/source-map.md).

## M. Deliberately out of scope

Hunting/animals; artillery-scale beyond anti-materiel; a money economy; a scope
catalog (one configurable optic instead); a required server/backend.
