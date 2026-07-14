# LongRange — Feature Catalog (the complete "what")

`Status: draft 1`  ·  `Date: 2026-07-13`

> **Purpose.** A single, complete list of everything the game should eventually do —
> the *what*, not the *how* or the *when*. This document is written to be handed to a
> planning model that will decide architecture, framework, port/rebuild strategy, and
> **feature priority / dependencies / sequencing** (see
> [`build-plan-prompt.md`](./archive/build-plan-prompt.md) — the prompt that drove it;
> its output is [`build-plan.md`](./build-plan.md)).
>
> It deliberately does **not** prescribe milestones or a v1 cut. The existing M0–M5
> ordering in [`phase-2-plan.md`](./archive/phase-2-plan.md) is **reference, not binding**;
> the planning model re-derives sequencing from this catalog and the constraints below.
>
> Companion docs: [`game-design.md`](./archive/game-design.md) (vision/rationale, archived),
> [`phase-2-plan.md`](./archive/phase-2-plan.md) (prior milestone plan, archived),
> [`btk-assessment-and-path-forward.md`](./btk-assessment-and-path-forward.md) (engine
> inventory + the deployment reality), and [`../Wiki/Home.md`](../Wiki/Home.md) (the
> ballistics correctness spec + teaching source).

## How to read this

Each item is tagged:

- **[FIXED]** — an owner constraint the planning model **may not override**. These are
  non-negotiable inputs.
- **[PREF]** — the owner's stated lean. The model may weigh it against effort/design,
  but should flag explicitly if it recommends departing.
- **[MODEL]** — explicitly the planning model's call (scope, ordering, or approach).

Items without a tag are simply features in the full vision — desired, priority TBD by
the model.

"*exists in BTK*" marks capability already present in the bundled BallisticsToolkit
engine/front-ends; "*Bucket A*" marks a fidelity extension not yet in BTK; the rest is
new game-layer work ("Bucket B"). See the assessment doc for the full inventory.

---

## 0. Hard constraints (non-negotiable) — [FIXED]

These bound every architecture and framework decision. They are *why* the project
exists in its chosen form; the model must satisfy all of them.

1. **Target devices:** must run well on **iPad and iPhone**, installable to the home
   screen, and **launch offline**.
2. **No paid Apple Developer account; no weekly re-signing.** This is the constraint
   that ruled out sideloaded native iOS. Any proposed stack must deploy to the target
   devices without an Apple paid account and without periodic re-provisioning.
3. **Client-side persistence, no required backend.** All game state (progression,
   inventory, DOPE, settings) lives on-device, schema-versioned, with **export/import
   to a JSON file** for backup / device transfer / profile sharing. Leave a clean seam
   for optional future cloud sync, but v-anything must work with zero server.
4. **Simulation-first fidelity.** Model the real factors faithfully; **in-game
   knowledge must transfer to reality.** Where gameplay and a cited Wiki article
   disagree, the article + its source is the arbiter (or the discrepancy is logged).
5. **Correctness is validated, not asserted.** The [`../Wiki/`](../Wiki/Home.md)
   articles + their primary sources (Litz, McCoy, FM 23-10) are the behavioral spec;
   BTK is a runnable second implementation usable as a **golden-vector oracle**. The
   build must preserve a way to validate trajectory outputs against these.
6. **Angular units:** cover **MIL and MOA equally**, with conversions side-by-side.
   **Units:** support both **metric and imperial**, with conversions.
7. **No money economy** (design principle — access is skill-gated, not purchased).
8. **No hunting, no animals.** Targets are steel + human silhouettes only.

---

## A. Ballistics & physics fidelity

The factor set the simulation must expose. Cross-referenced to the Wiki correctness
spec.

**Already modeled (BTK, keep + validate):**

- Point-mass trajectory — drop, drift, **time of flight**, retained velocity/energy
  (RK2 point-mass integrator, SI internally). *exists*
- **G1 / G7 drag** by ballistic coefficient. *exists* —
  [drag-and-drag-models](../Wiki/drag-and-drag-models.md),
  [ballistic-coefficient](../Wiki/ballistic-coefficient.md)
- **Atmosphere:** temperature, pressure, humidity, altitude, speed of sound (ISA). *exists*
- **Wind:** evolving multi-octave **curl-noise wind field**, sampled along the path. *exists*
- **Spin drift** (Litz empirical, continuous along trajectory). *exists*
- **Aerodynamic / crosswind jump** (Litz muzzle figure generalized downrange). *exists*
- **Gyroscopic stability** — corrected Miller Sg + ideal-twist solver. *exists* —
  [gyroscopic-stability](../Wiki/gyroscopic-stability.md),
  [barrel-twist-rate](../Wiki/barrel-twist-rate.md)
- **Transonic behavior** — cartridges have a range band where they stay supersonic;
  crossing transonic degrades both accuracy and drag-model reliability. *(partially
  emergent from the solver; see truing note in §D)*
- **Dispersion → hit probability** — Monte-Carlo (up to 50k), CEP, mean radius, radial
  SD; driven by MV SD, BC SD, wind σ, and rifle angular precision. *exists*

**Fidelity extensions the owner wants (Bucket A — not in BTK):**

- **Custom / measured drag models (CDM)** — a Cd-vs-Mach curve path, plus a **McDrag**
  geometry predictor; anchor/validate on McCoy's measured **.50 Ball M33** curve.
  Enables honest ELR / .50-past-a-mile.
- **Bullet core & shape modeling** — layered material densities → weight, center of
  gravity, moments of inertia (Ip, It) → feed BC and a **full** stability factor
  (beyond simplified Miller). Makes "which core/shape" a physically grounded choice.
- **Coriolis** — well-sourced smaller addition.
- **Incline / decline (angle) fire** — launch/target elevation, cosine correction;
  needed for valley/field missions.
- **Temperature sensitivity of muzzle velocity — [owner request].** Ammunition MV
  shifts with propellant temperature (warm powder burns faster → higher MV → less drop;
  cold → the reverse). Each load carries a **temp-sensitivity characteristic**
  (temp-sensitive vs. temp-stable powders), so a DOPE card trued on a warm day goes off
  on a cold one — a realistic reason to re-confirm and a reward for temp-stable match
  ammo. Distinct from the *air-density* temperature effect on drag (§A atmosphere): this
  acts at the muzzle, that acts downrange. Feeds the hidden-truth ammo model (§D) and
  interacts with the weather conditions (§E5).

## B. The firing-solution shot loop (the heart)

The moment the whole game orbits.

- **Core loop:** pick rifle+ammo → know your gear (zero + DOPE) → face a target
  (range it, read wind, account for angle & air density) → **dial or hold** → send →
  reactive feedback → correct within a shot budget.
- **Two correction methods, player-selectable per shot:** (1) **dial** the turrets
  (elevation + windage), or (2) **hold** over/under and for wind using the reticle.
- **Adjustable wind** (speed + direction) so each target must be re-solved.
- **Supporting UI:** DOPE chart viewer, wind indicators (flags / socks / mirage),
  rangefinder or reticle-ranging overlay, angle readout, dial/hold HUD showing current
  values, shot result, and remaining shots in the budget.
- **[CANDIDATE / deferred — not scheduled]** In-reticle **bullet-flight trace** (watch
  the projectile arc through the scope, spotter/observation aid). Owner decision
  2026-07-14: log now, schedule in a later increment. Intended fidelity: **per-shot
  true path** (the trace follows that shot's sampled MV/dispersion so the visible arc
  matches the actual impact) — not a nominal cue. Caveat: the engine's `MatchSimulator`
  returns only the impact point, so this needs an engine/bridge call that returns the
  *sampled* per-shot trajectory; task 1.4 does not build or preserve it.

## C. Gear systems

### C1. Rifles / cartridges
A spectrum spanning the whole difficulty/range ladder:

- **Rimfire** — .22 LR (short-range precision, surprisingly wind-sensitive; a teacher).
- **Intermediate / tactical** — .223/5.56, 6.5 Creedmoor, .308 Win (transonic wall
  ~1000 yd).
- **Magnums** — .300 Win Mag, .338 Lapua (reach to ~a mile).
- **ELR / anti-materiel** — .375/.408 CheyTac, **.50 BMG** (supersonic past 2000 yd).
  *Upper bound: anti-materiel, not artillery.*

Each cartridge is meaningful because it has a range band where it stays supersonic.
Each rifle carries **per-instance hidden variation** (see §D).

### C2. Ammunition
- **Factory catalog** — several loads per cartridge, each with box specs (MV, BC), a
  realistic (higher) shot-to-shot **SD**, and a **temperature-sensitivity rating** (§A)
  — off-the-shelf loads run the range from temp-stable match to temp-sensitive bulk.
  Convenient, adequate for most shots.
- **Handloading** — author a load: **custom bullet shape + core** (depends on the
  Bucket A bullet editor / McDrag) and **powder charge**, tuned to a specific rifle for
  low SD. Balanced *not* by price but by realistic friction:
  - Must be *developed* (vary charge, chronograph, find the node); a poor workup shoots
    worse than factory.
  - Per-rifle (no universal god-load).
  - Only reduces *vertical* dispersion — the **wind call is untouched**, so handloads
    matter mainly for the hardest shots (small/extreme). Handloading = **end-game ELR
    optimization**, not a default win button. Also a *learning tool* (removes gear's
    vertical contribution so you can isolate wind).

### C3. Optic — one configurable scope (no scope catalog) — [PREF]
With no money economy, a scope "shop" adds little; one configurable scope exposes every
mechanic that matters:

- **Magnification range** ≈ **4.5–35×** (plinking → ELR). More × aids target ID and
  mil-ranging but is capped by **mirage** (grows with zoom, already modeled) and
  narrower FOV — a tradeoff, not a free win. *(Could split into two ranges later.)*
- **Canted base — on/off toggle.** The **ELR elevation gate**: a mile+ needs ~30+ MRAD
  / 100+ MOA of come-up that can exceed internal elevation travel; a canted base lets
  you dial that far, otherwise you "run out of up" ~1 mile.
- **Reticle — 3 patterns:** (1) fine/minimal (dialing-focused); (2) mil/MOA hash
  (ranging + moderate holdover); (3) Christmas-tree / BDC grid (holdover-heavy).
- **Focal plane — FFP and SFP.** FFP: holds & mil-ranging correct at any zoom. SFP:
  subtensions true only at one magnification — a genuine gotcha to teach.
  **[PREF]** owner leans FFP first (invariant subtensions are simpler to implement
  correctly and are the long-range norm); SFP as a later budget/hunting-scope option.

## D. Hidden truth & the DOPE loop (the game's identity)

The mechanic that distinguishes this from a ballistic calculator.

- **Per-instance hidden truth.** Each rifle *copy* gets fixed unknown biases (MV
  offset, zero offset, inherent angular precision); each ammo *lot* gets a true
  mean-MV shift + SD + true BC (+ BC SD). These are the **fixed unknowns** the player
  discovers, distinct from the **random per-shot spread** (the irreducible cone) the
  engine already models. Buying a second copy of the same rifle behaves differently and
  must be re-zeroed / re-DOPE'd.
- **Zeroing flow** — fire a group at a known distance, center the zero on the group
  (teaches "don't chase individual shots").
- **Computed DOPE (primary).** The WASM solver generates baseline come-ups for any load
  + condition on the fly (no hand-authored charts). This mirrors real modern practice —
  handheld solvers like the **Kestrel 5700 Elite with Applied Ballistics**, the
  **Garmin Foretrex 701**, or apps (**Hornady 4DOF**, **Strelok Pro**). Computed
  solutions are standard, most trustworthy while supersonic, confirmed by shooting near
  transonic.
- **Tabulated DOPE — also available (owner request).** The player can **freeze the
  trued curve into a static come-up table / card** for a baseline condition and shoot
  off *that* without invoking the solver each shot — the way a shooter runs off a
  printed **DOPE card**, an armband data book, or a **custom "come-up" turret tape**
  (etched elevation dial). Purpose: relaxed longer-range plinking without pulling up the
  in-game computer for every shot. Realistic tradeoff to teach: a frozen table drifts as
  air density / angle deviate from its baseline, so it's convenient but not always
  exact. Both modes coexist; the computer is for solving, the card is for running.
- **Solver truing to confirmed nodes — two levers.** A **node** is a distance at which
  the player has confirmed the true correction by shooting it (`range, true come-up,
  N shots`). The solver adjusts its model to pass through the player's nodes, so
  *untested* ranges shift toward this rifle+ammo's reality too. Matching real
  methodology, truing uses **two levers on two ends of the curve**:
  1. **Effective muzzle velocity** — trued from a **near/mid node** (dominates the
     near-to-mid trajectory).
  2. **Effective BC / drag scale** — trued from a **far node** near transonic
     (dominates the far end; advertised BC is often optimistic and varies with the
     barrel's stability). *(This is why truing needs a near + a far node — it is not
     MV-only.)*
- **Consistency sets confidence.** With high MV SD, one impact is a noisy sample — more
  shots are needed to trust a node; low-SD match ammo confirms a node in fewer shots.
  This surfaces the cone math and makes good gear valuable.
- **Starter data (optional).** An engine-generated "factory card" the player can copy
  and then true into their own saved profile — a real-world onramp and anti-grind valve.
- **Reticle ranging.** Every target carries a known physical size; the player measures
  apparent size against reticle subtensions to estimate range
  (`Range_m = size_m × 1000 ÷ mils`, or `size_in × 95.5 ÷ MOA`). FFP makes the read true
  at any zoom. Learn/verify it on labeled KD ranges; it becomes necessary on UKD
  missions. — [range-estimation](../Wiki/range-estimation.md),
  [mil-dots-subtensions](../Wiki/mil-dots-subtensions.md)

## E. Ranges & environments

### E1. Practice ranges — Known Distance (learn & build DOPE)
Structured, labeled, fixed increments. Zero, build DOPE, learn dialing & holdover.
- **Range A:** targets every **50 yd out to 500**.
- **Range B:** targets every **100 yd out to 1000**.
- **Range C (ELR):** **500 / 1000 / 1500 / 2000 / 2500**.

### E2. Mission ranges — Unknown Distance (apply it)
- Targets **not labeled** by distance, **not at set increments**, irregularly placed.
- **Terrain & angle:** e.g. shooter partway up a valley side, targets above and below →
  incline/decline (cosine).
- **Ranging:** known-size targets (mil-dot) **or** a laser rangefinder.

### E3. Environments — [owner: all four in the full set]
- **Mountains** (steep angles, thin air, switchy valley wind)
- **Light forest** (harder wind reads, obscured targets)
- **Grassland hills** (rolling, mixed distances)
- **Desert** (heat mirage, long open sightlines, thermal effects)

### E4. Known-size ranging props
Scenery that doubles as ranging references, each carrying true dimensions in metadata:
**cars, park benches, trash cans, signage, doorways/windows**, plus the human
silhouettes. Grounded in FM 23-10 doctrine (vehicles, doorways, windows, ~10 ft lane
width, etc.). — [range-estimation](../Wiki/range-estimation.md)

### E5. Weather & light conditions — [owner request]
Selectable conditions beyond wind, each with honest effects (not just visual mood) so
reading the day is part of the puzzle:

- **Clear & windless** — baseline; strong sun drives **mirage** (already modeled),
  which aids wind reading but limits usable magnification.
- **Cloudy / overcast** — flatter, diffuse light; **less mirage** (weaker thermals), so
  you lose that wind-reading cue and lean more on flags/socks; changes target contrast
  and apparent target ID.
- **Drizzle / rain** — reduced visibility and target contrast; cooler, more humid, often
  lower-pressure air → **denser air → more drop/drift** (ties to the atmosphere model in
  §A); heavier precip further degrades sighting. *(Direct aerodynamic effect of raindrops
  on the bullet is negligible and can be omitted; the honest effects are air density +
  visibility.)*
- **Night with range lighting** — low-light shooting on lit ranges: artificial,
  directional light, harder target ID and reticle-ranging, **no mirage** cue. Teaches
  low-light fundamentals. *(Optional / lower priority — nice-to-have.)*

These interact with the biomes (§E3) — e.g. desert heat maximizes mirage; a cold
overcast mountain morning suppresses it and stacks denser air on top of thinner
altitude air. Conditions should be selectable in free-play and set (or randomized) per
mission.

## F. Targets & scoring

- **Reactive steel — keep and expand.** BTK's swinging steel is the felt payoff. Add
  poppers, dueling trees, plate racks, swingers/spinners, dropping plates, and
  **no-shoot / hostage** plates for discipline.
- **Human silhouettes** — head & torso, realistic or **IDPA-style** scoring zones.
  **[FIXED]** no animals / no hunting (drop BTK's boar/prairie-dog modes).
- **Sizing in MOA/MRAD** so difficulty normalizes across range; physical size still
  drives mil-ranging.
- **Scoring:** steel hit/miss, time-to-hit, points weighted by target MOA & range;
  silhouette zone scoring. **Headline metric: first-round-hit probability** — the
  meaningful long-range measure and the thing good prep should maximize.

## G. Missions & progression

- **Mission structure (UKD / field):** hit an *X-MOA* target at *Y* range within a shot
  budget; unlabeled, irregularly placed targets; difficulty laddered by range band
  (500 → 1000 → 1 mile → ELR) and environmental uncertainty; at least one **angled
  valley** scenario.
- **Progression — [PREF] both:** a **skill-gated unlock ladder** (master fundamentals
  on KD ranges → unlock field missions and longer-range gear/cartridges) **plus** a
  **free-play sandbox** of anything unlocked. Progression = personal skill and records,
  not currency.
- **Spotter** — optional unlock that narrows wind uncertainty / calls corrections.
- **Barrel life — [PREF] owner leans omit early.** Optional soft resource: hot
  magnums/.50s erode throats, accuracy degrades with round count, replacing a barrel is
  the only sink. Discourages "biggest gun for everything." Not required; low priority.

## H. Persistence & platform

*(Governed by the hard constraints in §0.3.)*

- Client-side, schema-versioned save (IndexedDB or equivalent), durable on installed
  iOS PWAs; request persistent storage as belt-and-suspenders.
- **Export/import** the full save (rifles, ammo lots, DOPE, progression) as JSON.
- Per-device in v-anything; leave a clean seam for optional future cloud sync (BaaS).
- Installable to the home screen; launches full-screen and offline.

## I. UI, teaching & onboarding

- **DOPE data-book viewer** — the player's confirmed nodes + the trued curve, with the
  option to **generate a static come-up card / turret table** to run off (per §D).
- **Onboarding that teaches from first principles**, leveraging the Wiki as source
  material; define terms on first use; link to a glossary. The game doubles as a
  learning resource (the owner is new to long-range shooting).
- Clear presentation of MIL/MOA and metric/imperial side by side (per §0.6).

## J. Multiplayer — [PREF] deferred

- Peer-to-peer remote play exists in BTK (F-Class sim, PeerJS + WebRTC). Not a v1
  concern; a candidate to revisit post-core.

---

## K. Explicitly the planning model's call — [MODEL]

The model decides all of the following and must justify its choices against §0:

- **Stack above the engine** — framework, rendering approach, and language.
- **Reuse strategy** — extend BTK in place, port selected pieces to a new stack, or
  rebuild from scratch; and **how much of the C++/WASM engine to reuse vs. re-port**
  (the physics core is ~3.4k lines and portable; the ~37.6k-line JS front-end is the
  stack-specific bulk). Whatever the choice, preserve a validation path (§0.5).
- **Feature priority, dependencies, and sequencing** — including what constitutes the
  first shippable slice. The prior M0–M5 plan is reference only.
- **Where each feature above lands** in that sequence, and which are cut or simplified
  for the first release vs. deferred.

## L. Correctness specs & validation

- **The Wiki is the behavioral spec; BTK is a golden-vector oracle** for every factor it
  already implements (§A "already modeled"). Diff trajectory outputs (drop, drift, spin
  drift, TOF, retained velocity) against engine-generated vectors, cross-checked against
  McCoy's measured **.50 Ball M33** curve and the Litz worked examples cited in the Wiki
  (per §0.5).
- **The four Bucket-A extensions have NO BTK oracle.** Custom/McDrag drag, bullet core &
  shape → BC + full stability, Coriolis, and incline/decline fire are **absent from
  BTK**, so there is no second implementation to diff against. For these, the **Wiki
  article + its primary source is the sole correctness arbiter.**
- **Their spec articles are not yet written — but the sources are in hand.** Primary
  sources are already acquired and **page-routed** in
  [`../Documentation/source-map.md`](../Documentation/source-map.md) (Litz Ch4 incline /
  Ch7 Coriolis / Ch17–18 bullet anatomy; McCoy Ch4 McDrag & drag / §3.4 angle / §6.6 form
  factors / §8.8 Coriolis) and logged in [`../Wiki/_gaps.md`](../Wiki/_gaps.md) as
  Phase-2 engine tasks. **No source acquisition is required.**
- **[MODEL] Schedule each of these four spec articles as an implementation gate for its
  feature** — author the correctness article from the in-hand sources right before /
  alongside building that engine feature (demand-driven, per the working agreement), and
  validate the implementation against it. Writing them is **not** a precondition to the
  plan itself, only to shipping the feature they specify.

## M. Deliberately out of scope

- Hunting / animals; artillery-scale beyond anti-materiel; a money economy; a scope
  catalog (one configurable optic instead); a required server/backend for v1.
