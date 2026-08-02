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

#### Transonic dispersion — group opening through Mach 1
The drag RISE through transonic is already modelled (it is in the G7 curve the engine
integrates), so trajectories bend correctly and come-ups are right. What is **not**
modelled is the *dispersion*: as a bullet decelerates through Mach 1 its shock wave
moves back over the boat tail, the centre of pressure shifts abruptly, and — because a
spinning bullet is always coning slightly — each round takes that kick at a different
point in its precession cycle. Real groups open up, unpredictably. The engine's only
scatter sources are **MV SD, BC SD and rifle precision, none of which know the bullet's
Mach number**, so a round arriving at Mach 0.9 gets exactly the same angular scatter as
one arriving at Mach 2.5.

**Consequence, and why it is worth fixing:** going transonic currently costs the player
nothing. The sharpest case is rimfire — high-velocity .22 LR leaves at Mach 1.12 and is
subsonic by 50 m, shoots flatter than standard velocity (29.4 vs 34.6 MIL at 500 m), and
would therefore be a straight upgrade in game, while in reality competitors buy
*subsonic* match ammo precisely because HV groups worse. Shipping HV rimfire before this
exists would teach the reverse of the truth. Same mechanism sets the ELR range's Mach 1.2
threshold (1.2, not 1.0, because the trouble starts while still supersonic).

**Not built — research first, then implement. Deliberately left alone for now (owner,
2026-07-29).** Interim policy, also owner's call: **no range or station is gated** — the
player may shoot anything at any distance — and the honesty burden sits on the **DOPE
book**, which marks transonic rows amber and subsonic rows red with a footnote saying the
model is least trustworthy there. Shipped 2026-07-29 (`scope/DopePanel.tsx`).
Blocks two catalog additions (HV .22 LR, .22 WMR — see `archive/elr-dope-range-plan.md` §13.4).
Any in-game label must say the bare word `TRANSONIC` and **must not claim dispersion
opens**, since it does not. Tracked as **N4** in `Wiki/_gaps.md`.

#### Temperature sensitivity of muzzle velocity
Per-load temp-sensitivity characteristic (temp-stable vs. temp-sensitive powders) so a
DOPE card trued on a warm day drifts on a cold one — distinct from air-density's effect
on drag. Feeds the hidden-truth ammo model (§D) and interacts with weather (§E).
**Not built** — planned Increment 4.

---

## B. The firing-solution shot loop (the heart)

Every feature originally tracked in this category is built — see `### B.` in the
[Built](#built) section below (cartridge-scaled recoil, rifle-ammo-store S10, closed
this category out 2026-08-02).

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
.300 Win Mag, .338 Lapua, .50 BMG — the reach-to-a-mile and anti-materiel end of the
spectrum (upper bound: anti-materiel, not artillery).
**Built** — 2026-08-02, folded into the "Gear catalog architecture" entry below
(rifle-ammo-store S1/S9): all three ship as full parametric builds, not a separate
progression tier. `.375/.408 CheyTac` was never added to the researched ladder and
remains out of scope.

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
Fits the model to the player's confirmed reality. Two independent levers, each moving one
value: **chronograph sets effective MV** (the only thing that ever does), and a BC fit sets
**effective BC/drag-scale**, with MV held at its current effective value (chrono if one exists
else box). The levers never swap roles; neither invalidates the other; whichever was written
last is current ("last write wins"). A single fit can't separate an MV error from a BC error,
so a BC fit made before chronographing dumps that residual onto BC and stays **provisional**
until the curve is chrono-anchored (D13). Re-truing after a new chrono is a manual re-fit,
flagged by a "chrono is newer than your BC" signal rather than auto-recomputed (D15).
**Both levers built** — lever 1 (chrono → MV) **2026-07-27** via the DOPE-first plan (step 3);
lever 2 (BC) **2026-07-31** via [`archive/bc-truing-plan.md`](./archive/bc-truing-plan.md), as an
**asserted-hold fit** (`engine-bridge/bc-fit.ts` bracketed bisection + the in-scope DOPE panel's
"Update BC" dialog + `state/store.ts`'s `setLotEffectiveBc`) — **not** via a confirmed downrange
node, which still doesn't exist (see the node/confidence system below, still not built). D15
frames a future confirmed node as a *second producer* of the same `effective.bc` value once
that system is built — this ships the first producer. Lever decisions locked: D11–D13
(2026-07-21), D14 (2026-07-24), **D15 (2026-07-26, supersedes D11's no-chrono path)** — see
[`Plans/D15-two-lever-truing-independent.md`](./Plans/D15-two-lever-truing-independent.md),
[`archive/increment-2.4-plan.md`](./archive/increment-2.4-plan.md) §8, and
[`archive/increment-2.md`](./archive/increment-2.md) §2.5.

#### Exposed effective MV/BC + manual override ("manual truing")
Surface the two values currently driving the believed DOPE table (effective MV, BC)
directly in the table/Data Book — starting at box values, then updating as the
chronograph feeds MV and a BC fit feeds BC (see Solver truing, above) — and let
the player hand-edit either value directly. This is the classic field technique: notice
the actual required holdover differs from the card (card says 5 MOA at some range, but
you're actually holding 5.25) and nudge BC (or MV) until the computed table matches.
**MV/BC readout: built** (DOPE-first plan step 2/`DopeBookScreen.tsx`'s status chips — value +
source tag, `(box)`/`(chrono)`/`(trued)`/`(provisional)`). **Standalone manual-nudge field: not
built, and no longer planned as a stopgap** — resolved 2026-07-31 (`archive/dope-first-plan.md`
step 5 close-out): the BC-truing "Update BC" dialog's editable, pre-filled come-up field
already gives the player the equivalent hand-truing control (assert the number you're actually
holding, the game fits BC to it) without a second, separate raw-BC input. D14's overwrite rule
(below) would still apply if a raw manual-BC field is ever added on top of a future confirmed-
node system, but nothing currently builds one. **D14 locked with owner 2026-07-24** (see
[`archive/increment-2.4-plan.md`](./archive/increment-2.4-plan.md) §8): a confirmed
node's auto-fit always overwrites a manual MV/BC override — manual edits are an
unmeasured placeholder, useful for previewing/hand-truing between confirmed nodes, but
never outrank real measured data.

#### Tabulated DOPE cards
Freeze the trued curve into a static come-up table/turret tape for a baseline
condition, run off it without invoking the solver each shot (like a printed DOPE card);
honest tradeoff — the card drifts as conditions deviate from its baseline.
**Not built** — planned Increment 4, after truing exists to freeze.

#### Starter / factory data card
An engine-generated "factory card" the player can copy and then true into their own
profile — a real-world onramp and anti-grind valve.
**Not built** — unscheduled (no increment assigned yet; optional).

#### Spotter cam (target-side camera for calling shots at distance)
A small secondary view alongside the scope, fed by a camera set a few yards off the
**committed** target and pointed at it — so the player can see exactly where a round
landed on the face. The Zero Range already solves this for paper with **Inspect**
(a head-on close-up of the engaged target, 2.3 D10); the spotter cam is the steel and
long-range answer to the same problem.

The motivating fact is angular: a hit splat on a 1 MIL gong at 1500–2000 m is a few
tenths of a mrad across, well under the scope's own resolution at usable
magnification — so "did I hit centre or clip the edge?" is unanswerable from the
firing point no matter how far you zoom. Without it the far half of an ELR range gives
hit/miss and nothing else, which is not enough to true a DOPE curve against.

**Requires a committed target** (owner, 2026-07-27) — and that is the point rather
than a limitation: it gives *commit* a concrete reward, so past ~1000 m the player
naturally declares a target before working it. That dovetails with the
commit-preferred aim resolution (`scope/aim-pick.ts`), which also wants a commitment
at distance for a different reason.

Open questions for whenever this is picked up: whether the cam is always-on or
toggled; whether it shows a live view or only a freeze-frame on impact (cheaper, and
arguably better — you want to study the hit, not watch the plate swing); whether it
is diegetic (a real camera the player "places", possibly a purchasable) or simply a
range facility; and what it costs to render a second view per frame on iPad.

**Not built** — unscheduled, logged 2026-07-27 from the ELR probe. Relevant prior art
in-repo: `Design/archive/mil-zero-range-plan.md` §7.1 (Inspect), `range/plate-surface.ts`
(hit marks already live in the plate's own texture, so the data the cam would show
already exists).

#### Trajectory clearance — "line of sight is not the bullet's path"

At long range the bullet arcs far above your sight line, so an obstruction you can see
*over* is not necessarily one the bullet clears. Measured apex above the line of sight,
target-zeroed at ICAO sea level, no wind (computed 2026-07-28 against the engine):

| station | 6.5 CM | .338 LM | .50 BMG | apex occurs at |
|---|---|---|---|---|
| 500 m | 0.6 m | 0.6 m | 0.5 m | ~52% downrange |
| 1000 m | 3.5 m | 3.1 m | 2.9 m | ~55% |
| 1500 m | 12.3 m | 9.9 m | 9.6 m | ~58% |
| 2000 m | **32.1 m** | 25.8 m | 26.0 m | ~60% |

So a 2000 m shot is **32 m above the sight line** as it passes the 1200 m mark. Fire
through a slot in a treeline and the round leaves the slot climbing and comes down
through the canopy beyond it. Real shooters call this overhead clearance; it is a live
concern shooting under bridges, through windows, or over berms and spectators.

Three reasons this is worth keeping: the difficulty ladder is **produced by physics
rather than authored** (500 m ignores trees, 1000 m clears a bush, 1500 m a mature tree,
2000 m needs 30 m of room); it gives flatter cartridges a **reason to exist beyond wind**
(the .50 apexes 6 m lower than the 6.5 at 2000 m); and almost no shooting game models it,
so it is differentiating as well as correct.

**Not built** — logged 2026-07-28 during ELR range design. **Owner decision the same day:
trees ship as SCENERY first**, so the composition (firing over a treeline at 1500/2000)
can be judged before paying for the mechanic. Building it needs (a) trajectory-vs-canopy
collision — nothing in the app does path-obstacle collision today, the engine's
`rendering/impact_detector` is unused from TS — and (b) feedback for a strike the player
cannot see, 1200 m away and 30 m up, which is the point at which **spotter cam stops
being optional**. Prerequisite ordering: spotter cam, then this.

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

#### Range C — ELR (250-step ladder to 2000)
**Not built — but de-risked and next up.** Superseded in scope by
[`archive/elr-dope-range-plan.md`](./archive/elr-dope-range-plan.md): **250 m/yd steps to 2000**, not
500-steps to 2500. 2000 is where the engine is validated (oracle to 1800, extendable by
data edit) *and* where the .50 BMG is still supersonic (M1.0 at 2267 m); the scope's
elevation-travel ceiling is designed in as the lesson, met by **holdover** rather than a
gear gate (2000 m needs 23.02 MIL against a 20 MIL flat base).

A throwaway 3 km **probe was built and answered on device** (2026-07-28; archived at
[`archive/elr-probe-plan.md`](./archive/elr-probe-plan.md) §5.0), so the expensive unknowns
are now settled rather than assumed: an 18 s time of flight is **fine** (no compression
mechanic needed), the iPad holds **60 fps** at 3 km with `near = 10 m`, the depth buffer is
**24-bit** (no two-pass split), trace/impact/ping all read at **2000 m**, and the range sits
on a **convex rising slope** — which retires both the 12 m bluff and the ±1.5° fan, since the
slope buys the angular separation on its own on a single straight lane.

The plan doc still needs a rewrite against those findings before build. **The probe code is
deleted (2026-07-29)** — both probe ranges (flat and slope) and their config/scene/tests went
with it, once the real ELR range had its own tested equivalents (`elr-range-config.ts` carries
the convex `groundY` profile and the LOS→ground-run fixed-point solve; `sight-clearance.ts`
carries the occlusion search). What the probe left behind and the ELR range still uses:
`bullseye-texture.ts`, `scope/perf-hud.ts`, `scope/miss-projection.ts`, `scope/phase-timer.ts`,
and the `eyeHeightM` / `groundYAt` capabilities on `SteelSceneApi`. The probe's findings live
on in [`archive/elr-probe-plan.md`](./archive/elr-probe-plan.md) §5.0.

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

#### Wind-reading renderers — flags/socks + layered heat mirage
Instanced lit-cloth wind flags, a rigid-body wind sock, and a depth-layered heat-shimmer
post-process the player reads wind speed/direction from at each station — the visual
half of "wind is adjustable so every target re-solves," above.
**Built** — shipped flat/unlit as part of Increment 1 (2026-07-16, task 1.7), mirage OFF
by default (owner feedback: didn't read as directional). **Faithfully re-ported from BTK
2026-07-31** (`Design/Plans/wind-system-btk-port-plan.md`, W1–W7, owner-confirmed on
device — see `execution/PROGRESS.md`'s W1–W7 rows for the full trail): instanced
shader-deformed flag cloth + rigid-body sock (`scope/WindMarkers.ts`), and a three
depth-layered noise-slab mirage (`scope/Mirage.ts` + `game/mirage-model.ts`) replacing
the old flat single layer. Mirage ships with an Off/Light/Medium/Heavy strength preset
(`state/store.ts` `mirageStrength`, **defaults Medium and persists across launches**,
owner decision 2026-07-31 after seeing the tuned version on device) and an
on-device-tuned drift rate, wind-fade ceiling, and elevation falloff —
the last needed a range-specific retune (ELR's rising terrain puts a valid far target's
sight line meaningfully above level, which the flat-range-tuned falloff read as "panned
into the sky" and killed almost entirely past 750 m). **Deferred, per the plan's §7:**
mirage as a readable wind-call instrument (a HUD hook off BTK's own
`getSmoothedWindVector()`) — porting the effect makes this possible, wiring it to a
mechanic is a separate design question.

#### In-scope bullet-flight trace
Watch the projectile's true sampled arc through the scope as it flies to impact
(per-shot, not a nominal cue).
**Built** — 2026-07-14 (task 1.5b, owner-confirmed on device). Was logged as
deferred in the original vision brief, then brought forward into Increment 1 — this
entry corrects that.

#### Cartridge-scaled recoil
Muzzle-rise/lateral kick scaled per cartridge (was a single flat constant — a .22 LR
and a .50 BMG used to kick identically) — the real payoff is self-spotting emerging
for free: a .22/6.5 CM barely moves, a .50 loses the target entirely.
**Built** — 2026-08-02 (rifle-ammo-store S10, owner-confirmed on device). New
`game/recoil.ts`: `recoilPitchVelocity(rifleSpec, loadSpec)` — real `recoilVelocityMps`
(bullet + charge mass at the build's actual-barrel MV) calibrated so 6.5 CM/140 gr
match returns exactly today's felt kick; falls back to that flat value with no active
gear or a cartridge with no sourced rifle weight. `ScopeView.tsx`'s lateral kick scales
by the same factor; the POA residual does not (a shooter effect, not a physics one).
Point of impact unaffected by construction — aim is still sampled before the kick.
Shares its core with the Store's own recoil-relative-to-6.5CM readout
(`game/store-readouts.ts`, S9) so the two can't drift apart. **Self-spotting and
follow-up-shot recovery remain the surviving follow-ons** — not built; this only makes
the muzzle-rise feel and the resulting sight-picture loss cartridge-accurate.

### C. Gear systems

#### Gear catalog architecture — parametric rifle + ammo builders, 10 cartridges
Data-driven rifle/ammo catalog, rebuilt from the ground up around two parametric
builders (D1–D20) rather than an enumerated tier list: a **rifle** is barrel length
(1″ steps, per-cartridge band) + twist (a discrete per-cartridge option list) — no more
hunting/factoryMatch/custom tiers; an **ammo load** is bullet weight (1 gr steps) +
profile (`i7`, the G7 form factor — sleek ↔ blunt) + grade (match/bulk), with named
presets that snap both. Covers **all 10 cartridges** the project ever researched (.22 LR,
.223, 6mm Creedmoor, 6.5 Creedmoor, 6.5 PRC, .308, .300 Win Mag, .300 PRC, .338 Lapua,
.50 BMG) — closes the "only 4 of 7 shipped" gap this entry used to describe, and adds 3
more (6mm CM, 6.5 PRC, .300 PRC) beyond the original research ladder.
**Built** — 2026-08-02 (`Design/archive/rifle-ammo-store-plan.md`, tasks S1–S11, all
owner-confirmed on device). `game/cartridges.data.json` (per-cartridge velocity-curve
params + slider bands, replacing the old enumerated `catalog.data.json`, deleted at S8),
`game/ballistic-derivation.ts` (pure MV/BC/length/recoil/Sg formulas), `game/spec.ts` +
`catalog.ts`'s spec resolver (believed values + hidden-truth ranges from a
`RifleSpec`/`LoadSpec` pair), `engine-bridge/effective-range.ts` (derived, cached
per-build supersonic reach — replaces an authored per-cartridge constant), `game/recoil.ts`
(cartridge-scaled recoil, §B above), `shell/StoreScreen.tsx` + `shell/BuildScreen.tsx`
(cartridge list → two-tab build screen with live derived readouts and preset chips,
D17), save schema v3 (`RifleInstance.spec`/`AmmoLot.spec` replace the old catalog id).
Validated by `GameBuild/validation/derived-space-check.mjs` (`npm run validate:derived`,
S11) — sweeps each cartridge's weight/`i7` bands and asserts MV/BC/supersonic-reach
trends hold everywhere, not just at the 6 oracle-pinned preset loads the golden-vector
harness covers. Miller `Sg` is surfaced with a marginal band (< 1.4) and never blocks a
build (D14) — see the gap register below. Also folds in the former "Magnum & ELR
cartridge tier" entry (above) — those three cartridges are no longer a separate
progression tier, just three more entries in the same parametric system.

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
trees/bushes/rocks/grass tufts, mountains, drifting clouds) ahead of
retrofitting it onto the DOPE range (§E "Shared range-environment rendering
system"). Plan (archived, completed): `Design/archive/
test-range-environment-plan.md`.
**Built** — 2026-07-22 (all 4 plan stages, owner-confirmed on device; plan
CLOSED). `range/TestRangeScene.ts`, `range/environment/*` (`terrain.ts`,
`sky.ts`, `lighting.ts`, `trees.ts`, `ground-cover.ts`, `mountains.ts`,
`clouds.ts`, `index.ts`'s `buildEnvironment` orchestrator), dev harness in
`range/RangeView.tsx` + a "Test Range" tab in `debug/DevTools.tsx`. Also picked
up two scope-wide changes along the way (outside this plan's own scope, made
while tuning the Test Range): scope zoom floor lowered 4.5×→1× (true
unaided-eye view; `scope-projection.ts`/`state/store.ts`), and the FFP reticle
now drops all hash marks/labels below 3× magnification, keeping just the
crosshair (`scope/reticle.ts`'s `RETICLE_HASH_MIN_MAG`) — both apply to every
range, not just the Test Range. See `Design/execution/PROGRESS.md` for the full
iteration log (multiple owner feedback rounds per stage, including a couple of
real rendering bugs found along the way: an unbound vertex-color attribute that
was silently zeroing canopy/bush color, and fog saturation washing out the
distant mountains regardless of their texture).

#### Wooded Zero Range (25/50/100/200, fanned, elevated firing point)
Owner-requested 2026-07-26. The zeroing range — four paper stations at
25/50/100/200 in the active unit, fanned across
10.5° of azimuth and shot from a low knoll so no station occludes another, set
in the wooded environment rather than a bare strip. **Replaces the original grass
Zero Range** (50/100/200), which was intentionally deleted (2026-07-26, owner) —
this bay is the better one and is now the single canonical zeroing surface.
Inherits the zeroing flow,
Clean and Inspect from the (now-generalized) paper-bay path via a new `targetKind: 'paper'`
capability rather than reimplementing them. Also carries the first real upgrade
pass on the shared environment module (low morning sun, near-field shadow map,
tree silhouette variety, ridgeline mountains, aerial-perspective fog,
wind-driven vegetation). Plan: `Design/archive/mil-zero-range-plan.md` (5 stages).

Key locked results, all verified numerically in the plan: shooter elevation is
ballistically free (`error ≈ g·H²/(4v₀²)`, *independent of target distance* —
10 m of elevation shifts impact 0.36 mm); the metric layout's corridors are a
strict superset of the imperial one (a yard is shorter than a metre at every
nominal distance), so the world is built once and both unit systems share it;
and the knoll needs a *short steep* forward face, not a tall one, or it grazes
its own 25 m sight line.

**BUILT — all 5 stages, owner-confirmed on device 2026-07-26.** Plan archived at
`Design/archive/mil-zero-range-plan.md`; live build record in
`Design/execution/PROGRESS.md`. Also carries **D16** (raw 5–35 MOA off-the-shelf
zero error, `Design/archive/D16-raw-zero-error.md`) and the **true-MOA target
face** fix — the MOA grid was sized on the "1 inch = 1 MOA at 100 yd" shorthand
and was 4.5% small per square, drifting ~0.45 MOA off the reticle by the 10 mark;
it now derives from `22 × 100 yd × 1 MOA`. That fix applies to the original Zero
Range too, which had the same error.

**Stages 1–2b** — 2026-07-26.
Stage 1: registry + pure config + corridor model (`range/ranges.ts` gained a
`targetKind` capability and an optional `RangeStation.azimuthDeg`; new
`range/wooded-zero-config.ts`). Stage 2a: `range/paper-bay-scene.ts` extracts
the `PaperBayScene` interface and ScopeView re-gates onto `targetKind`, so the
zeroing flow, Clean and Inspect are inherited rather than duplicated; eye height
became a per-bay property. Stage 2b: `range/WoodedZeroScene.ts` +
`range/wooded-zero-environment.ts`, and the shared environment module gained an
optional injected `terrain.clearance` so a range can supply its own corridor
geometry (the Test Range's single-lane model is untouched and asserted so).
The range is now on the landing screen and shootable. 54 tests across
`wooded-zero-config.test.ts`, `wooded-zero-environment.test.ts` and
`paper-bay-scene.test.ts`.

**Stages 3–5** — the scenery upgrade proper, landed in the SHARED environment
module so the Test Range inherits it (owner: "Test range is fine, keep the
changes"): low morning sun at 24° behind the firing line + FogExp2 aerial
perspective + near-field shadow map (3), tree silhouette variety (4a), ridgeline
mountains replacing the instanced cones (4b), and wind-driven canopy sway driven
by the same wind sampler the bullet reads (5).

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
