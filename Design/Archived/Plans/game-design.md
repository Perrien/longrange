# LongRange — Game Design (the "game" layer)

`Status: ARCHIVED (2026-07-13)`  ·  `Date: 2026-07-10`

> ⚠ **ARCHIVED.** Superseded by [`../feature-catalog.md`](../feature-catalog.md);
> sequencing by [`../build-plan.md`](../build-plan.md). Relative links below were
> written for `Design/` and are stale.

> ⚠ **Superseded by [`feature-catalog.md`](./feature-catalog.md)** as the authoritative
> feature set (2026-07-13). This doc remains useful for vision and rationale, but where
> the two differ, the catalog wins. Milestone mappings and open-decision framing here are
> background — priority/sequencing/v1-cut are delegated to the planning model
> ([`build-plan-prompt.md`](./build-plan-prompt.md)).

> Fleshes out the **game** side (Bucket B) of the Phase-2 build. Sits above the
> ballistics engine and complements [`phase-2-plan.md`](./phase-2-plan.md)
> (milestones/architecture) and [`btk-assessment-and-path-forward.md`](./btk-assessment-and-path-forward.md)
> (engine decision). Where this doc and the plan's v1 scope disagree, note it in
> §11 — this captures the full vision; the plan bounds what ships first.

## 1. Player fantasy & core loop

You are a precision shooter solving a distance problem. No hunting, no animals.
The satisfaction is *building the correct firing solution*, then watching reactive
steel confirm it. Core loop:

**Pick rifle + ammo → know your gear (zero + DOPE) → face a target (range it, read
wind, account for angle & air) → dial or hold → send it → reactive feedback →
correct within a shot budget.**

The reactive steel from BTK's steel-sim is the felt payoff and the direction we're
keeping — expanded with more target types and environments.

## 2. Arsenal — rifles

A spectrum spanning the whole difficulty/range ladder:

- **Rimfire plinkers** — .22 LR (short-range precision, wind-sensitive at surprising
  distances; a great teacher).
- **Intermediate / tactical** — .223/5.56, 6.5 Creedmoor, .308 Win (the classic
  learning cartridges; .308 walls out around transonic ~1000 yd).
- **Magnums** — .300 Win Mag, .338 Lapua (reach to ~a mile; the "mile gun").
- **ELR / anti-materiel** — .375/.408 CheyTac, **.50 BMG** (supersonic past 2000 yd;
  the tools for the extreme ranges). *Upper bound: anti-materiel, not artillery.*

Each rifle carries **per-instance hidden variation** (MV offset, zero offset,
inherent precision) per the plan's M2 hidden-truth model — so copies differ and
must be learned. Cartridge choice is meaningful because each has a range band where
it stays supersonic (ties to the transonic discussion in the Wiki drag articles).

## 3. Ammo & handloading

- **Off-the-shelf:** several factory loads per cartridge, each with box specs (MV,
  BC) and a realistic (higher) shot-to-shot **SD**. Convenient, instant, adequate
  for most shots.
- **Handloads:** author a load — **custom bullet shape + core** (via the M4 McDrag /
  bullet editor) and **powder charge** — tuned to a specific rifle for low SD.

### Why handloads aren't a "win button" (the balance answer)

No money economy. Handloads are balanced by realistic friction, not price:

1. **They must be *developed*.** A handload is only low-SD if you do the workup
   (vary charge, chronograph, find the node). A poorly developed load shoots
   **worse** than factory. The effort/skill is the cost.
2. **They're per-rifle.** A load tuned to one barrel isn't optimal in another — no
   universal god-load.
3. **Wind is untouched.** Lower SD tightens *vertical* dispersion only; the wind
   call (horizontal, the real skill) is unaffected. So handloads matter mainly for
   the *hardest* shots (small target, extreme range); factory ammo suffices for
   most missions. Handloading = **end-game ELR optimization**, not a default.

**Framing:** the true currency is *skill*; no ammo quality buys a wind call. A great
handload is also a **learning tool** — it removes your gear's vertical contribution
so you can isolate wind.

**Optional soft resource — barrel life:** hot magnums/.50s erode throats; accuracy
degrades with round count; replacing a barrel is the only sink. Discourages
"biggest gun + max load for everything," rewards matching cartridge to task. No cash.
*(Decision in §11 — include or omit for v1.)*

## 4. Scope & reticle (one configurable optic — no separate catalog)

**Decision:** *no scope "bank"/shop parallel to rifles and ammo.* With no money
economy a scope catalog adds little; instead the player uses **one configurable
scope** whose *attributes* expose every mechanic that matters — far less content,
same depth:

- **Magnification range** — one generous variable-power range (≈ **4.5–35×**)
  covering plinking through ELR. Higher power aids target ID and mil-ranging, but
  usable magnification is capped by **mirage** (increases with zoom — already
  modeled in BTK) and narrower field of view, so "more ×" is a tradeoff, not a free
  win. *(Could split into two ranges — e.g. a 5–25× general + a 7–35× ELR — if we
  want more realism; one broad range is the simpler default.)*
- **Canted base — on/off toggle.** The meaningful **ELR elevation gate**: a mile+
  needs a huge come-up (~30+ MRAD / 100+ MOA) that can exceed the scope's internal
  elevation travel. With a canted base you can dial that far; without one you "run
  out of up" around ~1 mile. Clean, teachable gear constraint.
- **Reticle — 3 options** spanning the dial↔hold workflow:
  1. **Fine / minimal** — dialing-focused, uncluttered.
  2. **Mil / MOA hash (mil-dot style)** — ranging + moderate holdover.
  3. **Christmas-tree / BDC grid** — holdover-heavy, fast wind/elevation holds.
- **Focal plane — FFP vs. SFP** (First / Second Focal Plane): whether reticle
  subtensions track magnification. **FFP** — holds & mil-ranging correct at *any*
  zoom (why it's preferred for long range). **SFP** — subtensions true only at one
  magnification (usually max), so ranging/holding at other powers needs correction —
  a genuine gotcha the game can teach. **v1: FFP-only** — subtensions are invariant
  (a mil is always a mil), so there's no magnification-dependent correction to
  thread through the holdover/ranging code, and it's the long-range norm. SFP is
  added later as a budget/hunting-scope realism option built around its
  mag-dependent gotcha.

Dialing (turrets) and reticle holdover are **both** supported; reticle + focal-plane
choice shapes the holdover workflow. Matching a MIL/MOA scope to MIL/MOA DOPE is
part of the literacy the game teaches.

## 5. Ranges & environments

Two categories, both built on the steel-sim look-and-feel.

### 5a. Practice ranges — Known Distance (learn & build DOPE)

Structured, labeled, fixed increments. Purpose: zero, build DOPE, learn dialing &
holdover.

- **Range A:** targets every **50 yd out to 500**.
- **Range B:** targets every **100 yd out to 1000**.
- **Range C:** targets at **500 / 1000 / 1500 / 2000 / 2500** (ELR).

These directly support the workflow: pick zero range, confirm come-ups at each
node, watch the solver true to your data.

### 5b. Mission ranges — Unknown Distance (apply it)

Less structured, field-realistic:

- Targets **not labeled by distance**, **not at set increments**, irregularly placed.
- **Terrain & angle:** e.g. shooter partway up a valley side, targets **above and
  below** their position → incline/decline shooting (cosine correction).
- **Ranging:** either **known-size** targets (estimate range via mil-dots) or a
  **laser rangefinder** available.

### Environments (variety beyond BTK's single look)

- **Mountains** (steep angles, thin air, switchy valley wind)
- **Light forest** (wind reads harder, obscured targets)
- **Grassland hills** (rolling, mixed distances)
- **Desert** (heat mirage, long open sightlines, thermal effects)

## 6. Targets

- **Reactive steel — keep and expand.** BTK's swinging steel is the winner. Add
  types: poppers, dueling trees, plate racks, swingers/spinners, dropping plates,
  and no-shoot/hostage plates for discipline.
- **Human silhouettes** — head & **torso**, realistic or **IDPA-style** scoring
  zones. **No animals / no hunting** (drop BTK's boar/prairie-dog modes).
- **Sizing in MOA/MRAD** so difficulty normalizes across range; physical size still
  matters for mil-ranging.
- **Known-size ranging props (scenery that doubles as ranging references).** Scatter
  everyday objects of standard, memorable size around the ranges so the player can
  **mil-range** off them: **cars, park benches, trash cans, signage, doorways/
  windows**, plus the human silhouettes (torso ~1 m; breastbone-to-head ≈ 19″; head
  ≈ 10″). This is grounded in real doctrine — FM 23-10 explicitly lists vehicles,
  doorways, windows, street width (~10 ft lane), and even soda machines as ranging
  references (see [`../Wiki/range-estimation.md`](../Wiki/range-estimation.md) and
  [`../Wiki/mil-dots-subtensions.md`](../Wiki/mil-dots-subtensions.md)). Each prop
  carries its true dimensions in metadata so a reticle read yields an honest range.

## 7. The firing-solution workflow (the heart)

The moment the whole game orbits. Example the owner described: *rifle zeroed at 300
yd, need a 550-yd shot with crosswind.*

1. **Range** the target (known → mil-dot ranging; or laser).
2. **Pull up the DOPE chart** for this rifle+ammo: read the come-up for 550 yd off
   the 300-yd zero, plus the crosswind hold.
3. **Account for** angle (cosine) and current air density if it deviates from the
   DOPE baseline.
4. **Dial or hold**, using the scope's turrets/reticle.
5. **Send, spot, correct** within the shot budget.

Supporting UI: DOPE chart viewer, wind indicators (flags/socks/mirage), rangefinder
or reticle-ranging overlay, angle readout, dial/hold HUD.

## 8. Progression (no purchases)

- **Skill-gated unlock ladder:** master fundamentals on KD ranges (zero, DOPE,
  dialing) → unlock field mission ranges and longer-range gear/cartridges.
- **Free-play sandbox** alongside it: any unlocked range/gear available for practice.
- Progression = *personal skill and records*, not currency. *(Model choice in §11.)*

## 9. Scoring & metrics

- **Steel:** hit/miss, time-to-hit, points weighted by target MOA & range.
- **Silhouettes:** zone scoring (IDPA-style / head-vs-torso).
- **Headline metric: first-round-hit probability** — the meaningful long-range
  measure, and the thing good prep should maximize.

## 10. Mapping to the Phase-2 milestones

| Game element | Milestone |
|---|---|
| KD practice ranges, reactive steel, zeroing, DOPE, solution workflow | **M1–M2** |
| Rifle/ammo **catalog** (factory), scopes/reticles | **M1/M3** |
| Mission (UKD) ranges: angle, ranging, environment variety | **M3** |
| Expanded reactive target types + human silhouettes | **M3/M5** |
| **Handloading + custom bullet shape/core** (depends on custom-drag engine) | **M4** |
| More environments/content, barrel-life resource (if adopted) | **M4/M5** |

**Note on handloading:** it depends on the M4 engine work (custom drag / bullet
editor), so **v1 ships factory ammo only**; the handloading fantasy arrives with the
fidelity phase. Worth confirming that's acceptable (§11).

## 11. Open decisions

1. **Economy:** confirm **no money economy** (recommended). Adopt **barrel life** as
   an optional soft resource, or omit for v1?
2. **Progression model:** skill-gated unlock ladder, pure sandbox, or both
   (recommended: both)?
3. **Handloading timing:** accept that it lands in **M4** (factory-only v1), or pull
   a simplified version earlier?
4. **Reactive target priority:** which new steel types are v1 vs. later content?
5. **Environment count for v1:** how many of the four biomes ship first (recommend
   1–2, e.g. grassland + mountains, then expand)?
6. **Silhouette scoring:** IDPA-style zones, simple head/torso hit, or both?
7. **Scope magnification:** one broad range (~4.5–35×, recommended) or two
   selectable ranges (general + ELR)?
8. **Focal plane:** ✅ **FFP-only for v1** (invariant subtensions = simpler to
   implement correctly + the long-range norm); **SFP added later** as a
   budget/hunting-scope realism option built around its mag-dependent gotcha.
