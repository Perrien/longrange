# ELR Range — Dressing & Scatter Targets — Exploration

Status: **CLOSED 2026-08-11**
Started: 2026-08-10 · via /explore · closed 2026-08-11
IDs: **S** = scope · **I** = implementation · **U** = UI/UX

> Scope in the owner's words (invocation): *"the ELR range is a bit bare, it has the
> ground, trees and required targets but the ground has a hard, flat cut off line,
> breaking that up and introducing background mountains and clouds similar to the Test
> Range and Wooded Zero. Also I'd like some of the mud patches from those also. The
> range has a series of wind socks/flags that are currently behind trees, we need to
> move them or unblock them. Lastly I'd like to include a handful of random targets
> through the area. Random poppers, gongs, IDPA and IDPA hostage, etc. These should be
> at random places on the range, not tied to specific existing targets or distances."*

## Design summary

ELR is a working instrument and a bare-looking one: the grass plane ends in a hard visible line at
3000 m, there is no sky dome, ridgeline, cloud or mud, the six wind flags sit behind trees, and the
only steel is the two measurement ladders. This work is **primarily visual credibility, judged by
eye** — the range must keep doing its job (*"verify and update the DOPE"*) while looking like a place.

Alongside it, one substantive addition: **21 sprinkled steel targets** at real physical sizes,
unsigned, whose distance the player learns only by committing — making them a DOPE-table
interpolation exercise at odd ranges like 837 m, not a reticle-ranging one.

The horizon, undulation and mud asks all need a ground profile the shared `environment/` module
already has a seam for, and ELR's own long-range machinery is the more general of the two worlds. So
the decision is to **generalise the shared module first, promoting ELR's pieces into it, then land the
dressing on top** — which turns range #3 into a config file. That refactor **waits for range #3's own
exploration**, because a second real range is what proves the generalisation.

Lighting and target visibility are fixed in the same pass: ELR runs the *pre-fix* version of the
shared light rig, and its plates read grey because of a `metalness: 0.3` that reflects nothing.

## Grounding

Facts established by reading the code, 2026-08-10. Every claim anchored.
**Anchors re-verified 2026-08-11 on session resume — all still point at what is claimed below;
no drift.**

- `range/ELRRangeScene.ts:112` (`this.addLights(); this.addGround(); this.addGroundCover();`)
  — **ELR does not use the shared environment module at all.** It hand-rolls lights,
  ground, trees and grass.
- `range/environment/index.ts:47` (`export function buildEnvironment`) — the shared module
  the Test Range and Wooded Zero both use: sky dome, ridge silhouettes, drifting clouds,
  bushes/rocks, the dirt apron, shadows, canopy sway.
- `range/ELRRangeScene.ts:132` (`new THREE.PlaneGeometry(GROUND_WIDTH_M, GROUND_LENGTH_M, …)`)
  — one 1400 × 3000 m grass plane, nothing beyond its edge. No sky dome either:
  `ELRRangeScene.ts:109` sets `scene.background = new THREE.Color(SKY_HEX)`.
- `range/elr-range-config.ts:234` (`FOG_DENSITY = 1.7e-4`) — at 3000 m that is only
  ~23 % fog, so the plane's far edge is plainly visible. **That is the hard cut-off line.**
- `range/environment/terrain.ts:69` (`basePath: 'textures/dirt/Ground082S_1K-JPG'`) — a 3×
  oversize dirt plane at `y = −0.15`, *under* the grass. It both extends the world past the
  grass edge **and** shows through wherever terrain relief dips below −0.15 m. Nothing else
  in the repo is named mud or patch.
- `range/elr-range-config.ts:61` (`export function groundY(r: number)`) — ELR ground height
  is a function of **downrange distance only**. There is no lateral relief, so the dirt
  show-through mechanism cannot produce a single patch on ELR as it stands.
- `range/wind-markers-config.ts:96` (`ELR_WIND_MARKERS`) — 6 markers at a constant 9 yd
  lateral offset, occlusion-solved **against gong stations only**.
- `range/elr-range-config.ts:290` (`solveLayout`) — culls trees off the 8 station sight
  lines (`cullTreeIndices`). **Nothing culls trees off a wind-marker sight line.** That is
  the blocked-flags bug.
- `range/targets/placements.ts:309` (`getTargetPlacements`) +
  `range/test-range-targets.ts:87` (`buildTestRangePlates`) — the data-driven Target ×
  Mount path (poppers, IDPA, hostage, dueling tree, popper star). ELR builds plates
  bespoke instead: `ELRRangeScene.ts:177` (`addPlates`), one disc `InstancedMesh`, no
  `meshFor`.
- `range/elr-range-config.ts:101-103` (`PLATE_HEX = 0xf2efe6`, `PANEL_HEX = 0x2a2a28`) and
  `range/bullseye-texture.ts:44` (`ringColorAt`) — the high-line plate face is
  **white / blue ring / white**, hung against a near-black backer panel. The low line has
  no panel at all (`ELRRangeScene.ts:268`: *"the plate hangs in front of open hillside"*).

### How "random" placement is already done in this codebase (found 2026-08-11)

- There is **one shared PRNG**: `mulberry32` (`environment/environment-config.ts:227`), used by
  the trees (`elr-range-trees.ts:38`), the grass (`elr-range-cover.ts:148`) and every shared
  scatter/ridge/cloud generator (`environment-config.ts:400/467/538/576`, `index.ts:86`, each on
  `cfg.seed + k` so the streams stay independent).
- Every one of those uses a **constant seed**, and the reason is written down:
  `elr-range-trees.ts:20` — *"Fixed seed — the layout must be identical on every entry and every
  device."* Nothing in the app currently re-rolls scenery between sessions, and `Math.random()`
  appears only in per-frame effects (recoil jitter, flag phase, dust sampling).
- Trees are the reason it must be fixed *for trees specifically*: `MAX_TREES` is generated once
  and the scene draws a **prefix**, with station offsets solved against the FULL field
  (`elr-range-trees.ts:13-17`), so a changing field would invalidate solved sight lines.
- The authored path is JSON: `targets/placements.data.json` via `getTargetPlacements`
  (`placements.ts:309`), and its header states the split explicitly — *"AUTHORED placements are
  data; computed layouts stay code"*, naming ELR's runtime `solveLayout` as the reason ELR
  cannot be static data.

### Why the plate renders light grey while its sign renders bright white

Answered from the code, prompted by the owner's screenshot (2026-08-10). Three
multiplicative losses on the plate; **none of them apply to the sign**:

1. `range/plate-surface.ts:210` (`new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.6 })`)
   — metalness scales *diffuse* albedo by `(1 − metalness) = 0.7`, and routes the other
   30 % into a specular lobe. **This scene has no environment map**, so that 30 % reflects
   nothing and is simply lost. A painted plate is a dielectric anyway, so `0.3` is not
   physically defensible here.
2. Light angle. `ELRRangeScene.ts:127` puts the sun at `(-318, 97, 223)`; normalised that
   is ≈ `(-0.78, 0.24, 0.55)`, and a shooter-facing plate normal is ≈ `(0, 0, 1)`, so
   **N·L ≈ 0.55**. The hemisphere fill (`ELRRangeScene.ts:125`) hits a vertical surface at
   its 50/50 sky-ground mix, not its full sky value.
3. Working the numbers through three's Lambert BRDF gives a linear reflectance ≈ 0.29 of
   albedo, which sRGB-encodes to ≈ 0.58 — i.e. **light grey, exactly as the screenshot
   shows.** The maths agrees with the picture, so this is the mechanism and not a guess.

The sign escapes all of it because it is **unlit**: `ELRRangeScene.ts:359`
(`new THREE.MeshBasicMaterial({ map: tex, transparent: true })`) renders its texel value
directly, so pure white stays pure white and only fog touches it.

Consequence worth carrying forward: **the same three losses will hit the new orange panel**
(`ELRRangeScene.ts:239` is also a lit `MeshStandardMaterial`), so an authored bright orange
will render as a duller orange, then fog pulls ~11 % toward sky at 2000 m. Renderer state
is not a factor — no tone mapping is configured (`ScopeView.tsx:442`), so nothing is
crushing highlights globally.

### The commit path already tells the player the range

Found while checking whether a scatter target could serve S2's ranging exercise:

- `scope/ScopeView.tsx:2440` renders the committed-target chip as
  `#${plateInstanceId} @ ${distance}` in the active unit. **Committing a target hands you its
  exact distance.** As it stands that defeats "range a few random steel targets as a
  test/verification" outright.
- `state/store.ts:640` (`commitTarget(plateInstanceId, distanceM, budget)`) also writes
  `session.targetDistanceM` — but that field is consumed by **nothing** outside the store and
  its tests (verified by a repo-wide grep: only `store.ts` and `state.test.ts` reference it).
  So the firing solution does **not** depend on it, and suppressing the readout does not
  break the shot loop.
- The DOPE panel is a **table** of come-ups across distances (`scope/DopePanel.tsx`,
  `game/dope-row.ts`), not a single solution for the committed target. So a player who has
  estimated a range themselves can already read their own come-up off it and dial by hand —
  **no new mechanic is needed for the ranging exercise**, and in particular the catalog's
  automated *Reticle ranging* feature (§D, planned 2.6, not built) is not a prerequisite.
- Ladder gongs carry **no range information by design**: they are constant-angular 1 MIL
  (`elr-range-config.ts:96`), so every one subtends identically. Anything meant to be ranged
  by size must therefore be a **fixed physical size**.

## Tickets folded in

**None.** This exploration ran 2026-08-10 to 2026-08-11, before `Design/Tickets/` existed (the
project moved onto the standard scaffold on 2026-08-13), so there was no backlog folder to sweep and
no ticket carries a `Picked up by:` line naming it. **Neither ticket sweep ever ran for this
exploration** — recorded plainly because `create-plan` is forbidden to sweep on its own, so nothing
downstream will notice the omission.

## ADR candidates

**None nominated by the session** — the exploration closed before the ADR-candidate step existed.

One decision is nominated **retrospectively during the 2026-08-13 restructure, not by the original
session**: **generalising the shared `environment/` module and promoting ELR's machinery into it,
rather than expanding the short-range ranges outward** (I1). It is hard to reverse, surprising without
its context, and the product of a real trade-off. `create-plan` re-applies the three-test gate rather
than trusting any nomination, so this is a flag for that gate, not a decision that one was made.

## Scope & purpose

### What this is for

- **S1 — This is PRIMARILY a visual-credibility job, not a mechanics job (owner).**
  The range already does what it was built for — *"verify and update the DOPE"* — and
  works at that. What it lacks is *"background texture that makes it good to look at."*
  So the horizon, mud, sky and cloud work is the core deliverable and is judged by eye.
- **S2 — The scatter steel IS shootable, and has a stated purpose: unknown-distance
  verification (owner).** *"I use the main targets to confirm shots and get the dope
  corrected, I can then range a few random steel targets as a test/verification."* So the
  ladder gongs stay the instrument of record; the scatter steel is where the player checks
  the trued curve against a target whose distance they had to work out themselves. They
  must therefore genuinely resolve hits and react. Variety is the other stated reason:
  *"a number of steel targets sprinkled in the range mostly just for variety."*

### Target visibility — the goal

- **S3 — The plate white must read as the SAME white as the distance sign above it (owner).**
  *"if they're white, why are they a light grey in the shot while the sign above is an
  obvious bright white? I want the target white to be the same as the sign white."* This is
  a concrete, checkable acceptance criterion, and the cause is now known — see
  *"Why the plate renders light grey"* in Grounding.
- **S4 — Lighten the scene itself, not just the steel (owner).** *"let's lighten up the
  scene itself also."* Makes the brightness work a whole-scene tuning job rather than a
  target-material one, and points at the same shared-module question the environment work
  raises (I1).

### Scatter steel — how much the player is told

- **S5 — Disclosure: LEVEL 2 — committing a scatter target reveals its exact distance
  (owner).** *"The user can commit the popper, find the distance is 837, they have to use
  the dope table to see how much hold and make sure the shot lands."* So the exercise is
  **reading and interpolating the DOPE table at an odd distance, then holding correctly** —
  NOT estimating range off the reticle. Concealing the distance, and revealing it only on a
  hit, are both rejected.
  **This requires no code change to the commit path**, and the exercise is real rather than
  nominal: centrefire DOPE rows step every **100** m/yd (`game/dope-book.ts:160`), and
  `scope/DopePanel.tsx:281` highlights only the **nearest** row. An 837 m target therefore
  highlights the 800 row and leaves the player to carry the remaining 37 m themselves.
  Two consequences that follow rather than being chosen:
  - Scatter targets get **no distance signs**. The ladder stations have them
    (`ELRRangeScene.ts:356`, `addSigns`); a signed scatter target would pre-empt the commit
    and there would be nothing to work out. This also matches *"not tied to specific existing
    targets or distances."*
  - Scatter targets are a **fixed physical size** (a real popper, gong or IDPA silhouette is),
    unlike the ladder's constant-angular 1 MIL gongs. Not needed for ranging any more under
    this disclosure level, but it is what these objects are — and it means the small ones get
    honestly hard to see far out.

### Where this stops

- **S6 — Range #3 gets its OWN exploration, and the refactor WAITS for it (owner: *"this one
  is enough"*).** This file stays about ELR. The dependency is recorded rather than implied: I1's
  generalise-the-shared-module-first decision was made *because* #3 is *"very likely next or very
  soon"*, and its payoff is that #3 becomes a config file — which cannot be verified against a
  second real case until #3's length, terrain character, firing lines and target mix are known. So
  **the refactor should not start before that session happens.** Rejected: pinning #3's spec as an
  appendix here (it deserves the same treatment, not a rushed one) and **building ELR's dressing on
  ELR's own code first and refactoring later** (which reopens I1 and does the terrain work twice).

### Non-goals

All confirmed by the owner, in their words.

- **S7 — Trajectory clearance stays exactly as it is.** *"clearance rules shouldn't change.
  nothing new."* No trajectory-vs-canopy collision; a round passes through a canopy as it
  does today. Carries forward the owner's 2026-07-28 call that trees ship as scenery first
  (catalog §D).
- **S8 — No spotter cam.** *"a future thing, nothing today."*
- **S9 — Scatter targets do no scoring.** *"it's a simple hit/miss."* They register through
  the existing engagement tracking; no MOA/range-weighted points, no first-round-hit
  probability (those need the mission runner, catalog §F).
- **S10 — Range A is untouched.** *"Range A stays as is. Not changing anything there."*
- **S11 — NO NET INCREASE IN TREES (owner).** *"I am asking for more steel targets on the
  range but not more trees."* `MAX_TREES = 4000` (`elr-range-trees.ts:18`) is a ceiling, not
  a starting point. The dressing work adds horizon, sky, cloud and ground interest — not
  vegetation.

### Two different things both called "clearance" — pinned terms

The owner used the word in both senses in one answer, and they are different features:

- **Trajectory clearance** — whether the bullet's *arc* misses an obstacle. **S7: unchanged,
  nothing new.**
- **Sight clearance** — whether there is an unobstructed *line of sight* from the eye to a
  target or marker. This is `range/sight-clearance.ts` + `solveLayout`'s `cullTreeIndices`.
  **Extended, and tree removal is explicitly authorised as the tool:** *"If trees need to be
  removed to ensure clearance to all the targets (and wind socks), that's fine."* That
  settles the wind-marker question in favour of culling, and extends the same rule to the new
  scatter targets. Note this composes with S11: culling only ever *reduces* the tree count.

---

## Implementation

### The shared-module refactor

- **I1 — Generalise `environment/` first, then put ELR on it (owner).** The deciding fact is the
  owner's: **range #3 is *"very likely next or very soon"***, not eventual.
  Direction of travel, stated once so it isn't re-litigated: **ELR's machinery is the more
  general of the two worlds (see the evidence below), so its long-range pieces get promoted INTO
  the shared module — the Test Range and Wooded Zero are not "expanded outward."** The owner's own
  framing of the alternative (*"expand the test and wooded zeroing out to farther distances"*) is
  explicitly rejected: that generalises the weaker model. Also rejected: leaving the shared module
  alone and building ELR's dressing bespoke, which does the terrain work twice.
  Pieces to promote: a radial `floorY` ground profile (the seam already exists as
  `TerrainClearance.floorY`), tapered-sector ground cover, a scale-free tree field, a skirt that
  follows the profile instead of a flat apron, and solve-and-cull sight clearance as a
  capability. ELR then becomes a config plus its ladder; range #3 becomes a config file.
  **Accepted cost:** the horizon/mud/flags/scatter-target asks land *after* the refactor, so the
  range looks unchanged for a while; and ELR's July-2026 on-device tuning must be carried across
  deliberately (the inventory in I19).

**The evidence I1 rests on — how far apart the two worlds actually are (measured):**

- **The shared *renderers* already scale by configuration, not by rewrite.** Sky dome radius,
  ridge distance/height/colour, cloud field box, fog density and the wind-sway sample box are
  all `EnvironmentConfig` values. Nothing in `sky.ts`, `mountains.ts`, `clouds.ts` or
  `lighting.ts` caps distance. **The shipped numbers are short-range; the code is not.**
- **The shared terrain model already has the seam ELR needs.**
  `TerrainClearance.floorY(r)` is documented (`environment-config.ts:26-28`) as *"Ground height
  along a cleared corridor at radius `r` from the shooter… what makes a raised firing point
  possible."* ELR's convex rise **is** a `floorY(r)`. Wooded Zero already injects one. ELR's
  terrain is expressible in the shared model today; it isn't only because ELR was built first.
- **Four things genuinely do NOT scale:** the dirt apron's flat-plane assumption
  (`terrain.ts:79`, `y = −0.15`); `generateTreePlacements`' band-rectangle model;
  `generateScatterPlacements`' rectangular near-field grass zone; and the *clearance
  philosophy* — shared clears corridors and rejects vegetation inside them, ELR moves the
  target and culls the few trees still blocking (`solveLayout`).
- **ELR's machinery is the MORE general of the two.** The analytic radial profile, the
  offset-search sight clearance (`sight-clearance.ts`) and the tapered-sector ground cover are
  the long-range answers; band rectangles over a flat baseline are the short-range one. So
  *"expand the test and wooded zeroing out to farther distances"* means generalising the
  **weaker** model. The stronger direction of travel is the reverse.
- **`sight-clearance.ts` is already shared-shaped**, not ELR-shaped: it is written against the
  shared `TreePlacement` type and imports `environment/environment-config`. It simply has one
  consumer today.
- **The plumbing blast radius of remaking ELR is small — smaller than a grep suggests.**
  `elr-range-config.ts` is imported by `state/store.ts`, `targets/target-type.ts`,
  `targets/mount-type.ts` and `bullseye-texture.ts` — but `store.ts:31` takes only the
  `FiringPoint` *type*, the two `targets/` hits are **comments**, and only
  `bullseye-texture.ts:23` takes real values (`RING_FRACTIONS`, `PLATE_HEX`, `RING_HEX`).
  **The real cost of a rebuild is RE-TUNING, not re-plumbing:** ELR's look was settled over
  several on-device rounds in July 2026 (stake vs rack vs panel at the near stations, the grass
  field's shape and reach, tree density, the 35 mrad offset cap). Those numbers survive a
  refactor only if carried across deliberately — enumerated in I19.

### Ground undulation

- **I2 — The owner's ground-undulation request IS the first step of I1, not a patch to it.**
  The owner's words: *"it's currently a plane that curves up, very flat, very predictable. Is it
  possible to introduce some noise to its surface (smooth undulations in the ground a few
  hundred meters in size at least)? That would help with the flatness of the area and allow
  areas of the underlying texture to poke through."*
  **The shared sampler already does exactly this.** `makeTerrainSampler`
  (`environment-config.ts:248`) adds `relief(x, z)` — three sinusoid octaves scaled by
  `reliefAmpM` — on top of `clearance.floorY(r)`, masked flat inside corridors. So: inject ELR's
  convex rise as `floorY`, and the undulation is inherited rather than invented. The only gap is
  **wavelength**: the shared octaves have periods of **140 m / 57 m / 27 m**
  (`2π/0.045`, `2π/0.11`, `2π/0.23`), and the owner asked for *"a few hundred meters at
  least"* — so one or two longer octaves get added (e.g. `0.008` → 785 m, `0.018` → 349 m).
  Relief is also what makes the mud patches possible at all — see **I5**.

**Constraints on the undulation, measured:**

- **Ballistic ranges do NOT move.** `solveLayout` derives `groundRunM` *from* `losRangeM`
  (`elr-range-config.ts:289-291`: *"never the other way round, or the ballistic range is
  wrong"*), so stations stay at exactly 250 / 500 / … / 2000 m line-of-sight. Relief changes
  only *where on the ground* a station sits.
- **Sight-line headroom is the binding constraint, and it is tiny near the shooter.** Computed
  at the midpoint of each line: low line eye 1.7 m → 50 m stake, **≈ 0.96 m**; high line eye
  9.7 m → 250 m station, **≈ 5.2 m**; high line → 2000 m station, **≈ 27 m**. So amplitude must
  be ≲ 0.5 m inside ~100 m, may reach a few metres by 500 m, and can run to 10–15 m by 2000 m
  without threatening the far lines.
- **Terrain is NOT an occluder today.** `sight-clearance.ts` considers only trees and placed
  frames. So either the amplitude is ramped so relief *cannot* break a line (cheap), or terrain
  joins the occluder set (expensive, and it would have to re-enter the offset search).
- **One API signature has to change.** `SteelSceneApi.groundYAt(downrangeM)` is **1-D**
  (`steel-scene-api.ts:31`) and feeds miss-dust placement. With lateral relief, a miss 20 m left
  of the lane at 1500 m would draw its dust at centre-lane height. It becomes 2-D, touching
  `steel-scene-api.ts` and `scope/miss-projection.ts`.

- **I3 — Undulation shape: a distance-ramped amplitude (owner).** Flat at the firing
  line, growing to ~a couple of metres by 500 m and 10–15 m by 2000 m, with the long octaves
  from I2. Rejected — **the shared corridor mask alone**: it delivers full amplitude the
  moment the shoulder is crossed, which would put ~10 m of relief at 300 m where the
  measurements above give only ~5.2 m of headroom. Rejected — **a uniform amplitude sized to the
  tightest constraint** (~0.5 m): trivially safe but invisible at 2000 m over a 785 m wavelength,
  so it fails the stated goal. The ramp also makes a sight-line break *arithmetically impossible*
  rather than merely unlikely, which is what lets terrain stay out of the occluder set.

### Horizon, sky and the world's edge

- **I4 — Horizon: ridges + sky dome + clouds, and the ground extension is now IN SCOPE (owner;
  revised by I1, I2 and I5).** Build **ridges + gradient sky dome + clouds**. The ridge strips are
  carried down to `y = −40` (`environment-config.ts:524` `RIDGE_BASE_Y_M`), so they fill every
  angle below their crest and the sky beyond the grass edge is genuinely covered; what would
  otherwise survive is a **seam** where grass meets ridge at 23 % haze.
  **Extending the drawn ground past 3000 m is no longer deferred.** It was deferred earlier for
  exactly one reason — *"it touches the ground under a signed-off range"* — and I1 + I2
  rebuild that ground anyway, so the objection is gone. I5's profile-following dirt layer is the
  thing that delivers it: the skirt and the mud patches are the same mechanism. A ground edge at
  ~6000 m sits at ~65 % haze and the seam effectively vanishes.
  **Still rejected — heavier fog**: at ρ = 2.6e-4 the 2000 m gong goes from 11 % to
  24 % haze, which fights I6's entire purpose.

**The horizon numbers, and why the shared ones cannot be copied.** Derived 2026-08-10; these are
the load-bearing values for I4 and every one of them differs from the shared config by more than a
tuning nudge.

- **ELR's own skyline is 3.63° above horizontal** (high line: eye 9.7 m, convex ground reaching
  200 m at 3000 m). From the low line, 3.78°.
- A background ridge is visible above that only if its crest exceeds
  **`H > 9.7 + 0.0634 × distance`** — 263 m at 4 km, **327 m at 5 km**, 390 m at 6 km,
  517 m at 8 km.
- Target values: ridges at roughly **5 km and 7.5 km with crests around 400–1000 m**. Both sit
  inside the 12 000 m camera far plane (`ranges.ts:193`).
- Fog (FogExp2, `1 − exp(−(d·ρ)²)` at ρ = 1.7e-4): **23 % at 3000 m**, 51 % at 5 km, 65 % at
  6 km, 84 % at 8 km.
- **Sky dome radius ~11 000 m.** The shared 1500 m sits inside the range. The dome is a
  `BackSide` sphere with `depthWrite: false`, `fog: false`, `renderOrder: -1`
  (`sky.ts:39-56`), so the radius only needs to stay inside the camera far plane.
- **Clouds must be re-scaled, not re-used.** The shared field is ±900 m wide, z +100 → −1300,
  heights **220–380 m** — inside the range *and below the far terrain*, which reaches 200 m.
  ELR wants heights ~600–1200 m and a field kilometres across.
- **The dirt apron does not transfer AS A FLAT PLANE.** It sits at `y = −0.15`
  (`terrain.ts:79`); ELR's ground rises immediately, so a planar apron would be buried within
  metres of the firing line. **I5 is the resolution:** it becomes profile-following at
  `floorY(r) − 0.15`, which serves as both the world-extending skirt and the mud-patch
  mechanism.

### Mud patches

- **I5 — Mud patches: the dirt layer becomes PROFILE-FOLLOWING, and the show-through mechanism
  is kept as-is.** The owner's own wording settled it: undulation *"would help with the flatness
  of the area and allow areas of the underlying texture to poke through"* — i.e. the owner is
  asking for exactly the mechanism the other two ranges already have, not for independently
  authored patches, and not for a splat map.
  It works once the baseline stops being flat: put the dirt surface at **`floorY(r) − 0.15`**
  (following the profile, no relief applied) and the grass at `floorY(r) + relief(x, z)`. Dirt
  then shows wherever `relief < −0.15`, exactly as on the Test Range and Wooded Zero. This is
  the concrete form of "the flat apron becomes profile-following" — one of the four
  non-scaling items listed under I1 — and it does **two** jobs: the mud patches, *and* the skirt
  that extends the world past the grass edge, which is what the ground-extension half of I4
  wanted.
  **A splat map is therefore not needed.** Consequence accepted rather than overlooked: patch
  density is a *consequence* of relief amplitude, not an independent dial, so I3's ramp means
  **no mud patches near the firing line** — which is also how it reads in reality.

### Lighting and plate materials

- **I6 — The backer panel becomes BRIGHT ORANGE (owner, 2026-08-10).** This replaces the
  measured near-black `PANEL_HEX = 0x2a2a28`, whose recorded justification was *"white plate at
  2000 m reads 0.196 on open ground vs 0.632 on the dark panel"*. The
  owner's evidence is a device screenshot at 1250 / 1500 / 2000 m: *"the board and target
  kind of fade into the fog and grass, a white board would be easier to spot and after
  zooming in the circular target should be clearer."* Orange rather than white was the
  owner's own correction in the same breath — *"since the white steel on white board may be
  hard to see, make the board a bright orange"* — which resolves the white-on-white
  objection the near-black reasoning raised, keeping a bright, findable board AND a light plate
  that still separates from it. That reasoning's *mechanism* — the board exists to give the plate
  contrast — is therefore intact; only its colour changes.
- **I7 — Mechanism: `metalness: 0.3 → 0` on the plate material** (a painted plate is a
  dielectric), **and brighten ELR's lighting rig (owner).** Explicitly not chosen: an emissive
  floor, or an unlit plate face — so the plate stays a normally lit surface and its brightness
  comes from albedo × light, which means the fix is shared with everything else in the scene
  rather than special-cased to the steel.
- **I8 — Plates get "a bit more reflective" (owner) = LOWER ROUGHNESS, not higher
  metalness.** Read this way because higher metalness would undo I7's metalness change and, with
  no environment map in the app to reflect, would make the plate *darker*. Lowering
  `roughness: 0.6` sharpens the highlight from the single directional light. This lever is
  worth more here than it first appears: the sun sits behind the firing line and the plate
  faces the shooter, so the half-vector is favourable (**N·H ≈ 0.89**) and a tighter lobe
  really does brighten a flat shooter-facing plate rather than only glinting off curved
  geometry. Its ceiling is low, though — a dielectric is F0 ≈ 0.04 and **there is no
  environment map anywhere in the app** (verified: no `envMap` / `scene.environment` /
  `PMREMGenerator` in `scope/` or `range/`), so "reflective" has nothing but that one light
  to work with.
- **I9 — Lighting: take the shared rig's LIGHT, keep ELR's fog DENSITY (owner).** The shared
  rig's **light** — 24° sun elevation, `sunIntensity 1.6`, `hemiIntensity 0.75`, the warm
  sun/sky hexes — and its fog **colour** (`0xe6dcc8` warm cream, replacing ELR's cold
  `0xdfe3e8`). **Keep ELR's own fog DENSITY (`1.7e-4`) and its `usesShadows = false`.**
  Rejected: adopting the shared block wholesale, which would drag fog density to `7.45e-4` and
  put **89 % haze on the 2000 m gong**, deleting the range's stated job; and hand-pushing ELR's
  own numbers, which keeps a second rig alive that has already drifted. Held in reserve, not
  bought: an environment map — the real answer to "reflective", to be revisited only if this
  still reads flat on device.
  **The finding that decided it:** ELR is the *pre-fix* version of the shared rig — same
  −125° azimuth, but 14° elevation and 1.25 sun intensity, i.e. the values the shared rig
  had **before** the owner's own 2026-07-26 feedback raised them
  (`wooded-zero-environment.ts:102`: *"make the sun a bit higher, an hour or so later, it's a
  bit darker than I'd like"*). ELR never received that change. The visibility complaint behind
  S3 and S4 is that same complaint, already resolved once.

### Scatter steel — placement

- **I10 — Scatter placement: FIXED SEEDED LAYOUT, with the seed PERSISTED PER RANGE (owner).**
  A shared, range-agnostic generator draws positions from `mulberry32`
  (`environment-config.ts:227`) on a stream distinct from the trees/grass/scatter-cover seeds, so
  the layout is procedural — range #3 gets its own by config, nothing is hand-placed — but
  **identical on every entry and every device**, matching the reason already written down at
  `elr-range-trees.ts:20`. Rejected: **re-rolling per entry**, because trees are generated once
  and the scene draws a stable prefix with station offsets solved against the full field
  (`elr-range-trees.ts:13-17`), so culling a tree to clear a moving scatter target would visibly
  reshuffle the woods between visits; rejected **irregular-but-authored JSON**, because
  `placements.ts`' own header rules that computed layouts stay in code (ELR solves at runtime)
  and because authored data gives range #3 nothing to inherit.
  Because the seed is persisted rather than compiled in, a *"reshuffle the steel"* control can
  re-roll it deliberately — a decision the player makes, not a side effect of walking onto the
  range. That control is U2.
  **Where the seed lives, decided from the existing save pattern (not an owner call):** a new
  `scatterSeedByRange?: Record<string, number>` on `SaveData` (`persistence/schema.ts:182`),
  **additive-optional with NO schema-version bump, validated when present, defaulted to `{}` on
  load** — exactly the precedent `lastLotIdByCartridge` sets at `schema.ts:195-205`. **Absent
  value behaviour is explicit:** each range config carries a compile-time default seed constant,
  so a save with no entry for that range renders the authored default layout and the map is
  written only once the player actually reshuffles. This keeps the layout unit-testable without a
  save fixture.

- **I11 — The mix table: 21 targets, real physical sizes, per-type distance bands (owner).**
  Counts are the owner's (*"up the count by 2 for each"*):

  | type | mount | count | distance band |
  |---|---|---|---|
  | 10″ popper | `hinge-stem` (knockdown) | **5** | 350–900 m |
  | 18″ gong | `chain-beam` (swing) | **5** | 700–1500 m |
  | 24″ gong | `chain-beam` (swing) | **4** | 1200–2200 m |
  | IDPA silhouette (18 × 30″) | `bolt-stake` (bolted) | **4** | 450–1000 m |
  | IDPA hostage | `hostage-clamp-2way` (flip) | **3** | 400–800 m |

  Sizes are real, not angular — so a scatter target reads about **a third the apparent size of a
  ladder gong at the same distance** (10″ popper: 0.42 MIL at 600 m, 0.25 at 1000 m, 0.17 at
  1500 m; 18″ gong: 0.30 MIL at 1500 m; IDPA torso: 0.46 × 0.76 MIL at 1000 m — against the
  ladder's constant 1 MIL). The bands exist so each type lands where it is still findable through
  glass; that is why the small types stop short of the far end.
  **Excluded deliberately:** the dueling tree and the popper star — multi-plate installations that
  read as a staged prop rather than sprinkled steel, and they would drag in group/reset furniture
  ELR does not have.
  **Consequence for the machinery, not a new decision:** 21 placements, and the 3 hostages are
  2-plate assemblies (paddle + backing), so ~24 plate instances land in ELR's `instanceId` space
  and paint atlas — which is what makes the plate machinery (I17) and perf (I18) decisions
  load-bearing rather than routine.

- **I12 — The arc is a FIXED ±12° FAN, and scatter steel MAY encroach on the ladder lane
  (owner).** *"±12 is fine… if these randoms encroach on the ladder lane, that's fine. They don't
  need to strictly be outside of it."* So there is **no centreline stand-off rule** — the proposed
  4° exclusion is explicitly rejected, and a scatter target may sit inside the ±2° corridor the
  ladder stations occupy (`elr-range-config.ts:227`, ±35 mrad) and near the wind-marker line.
  ±12° reaches **±210 m at 1000 m and ±460 m at 2200 m**, so the whole fan stays inside both the
  ±25° grass sector and the ±700 m ground half-width at every distance in I11's bands — **no world
  widening is needed**, which is why the ±25°-clamped and widen-the-ground options lost.
  **The spacing rule between scatter targets is kept (owner: *"great"*):** no two scatter targets
  within **2° of each other in azimuth** unless their distances differ by **≥ 300 m**, so nothing
  stacks up or hides behind another in the sight picture.

- **I13 — Scatter steel may not OCCLUDE a ladder station, and the generator enforces it by
  REJECTION (owner: *"Correct."*).** Any drawn position whose silhouette intrudes into an
  eye→station line is discarded and re-drawn, with margin enough that the station's plate edge
  stays clear. Rejected: **no rule** (a bad seed could quietly hide a rimfire gong until someone
  notices on device) and **moving the ladder station** by adding scatter steel to `solveLayout`'s
  occluder set (which would let sprinkled steel dictate where the instrument-of-record gongs sit,
  and force re-tuning of positions already signed off).
  **The exposure is narrow, and knowing that is what keeps the check cheap:** the high line shoots
  from the 8 m platform (`HIGH_LINE_PLATFORM_M`, eye 9.7 m) at 250–2000 m
  (`elr-range-config.ts:88`) and its sight lines run 5–27 m above the intervening ground (I2's
  measurements), so a 1.3–1.7 m popper or silhouette **cannot** reach them. The low line shoots the
  rimfire ladder at 50–500 m with the eye at 1.7 m (`:86`), and I11's nearest scatter band starts
  at 350 m — so the whole risk is **a scatter target in the 350–500 m window blocking a low-line
  station.**
  This is a rejection test inside the seeded draw; it does **not** make terrain or scatter steel a
  general occluder, and it leaves both the ladder and the ±12° fan exactly as decided.

- **I14 — Clearance mechanics: PREFER NATURALLY CLEAR GROUND, CULL AT MOST 2 TREES PER SCATTER
  TARGET; WIND MARKERS ARE EXEMPT FROM THE BUDGET (owner).** The existing machinery is reused
  as-is: the cone test from eye to plate edge plus `marginForPlate` (`sight-clearance.ts:64`) and
  `occludingTreeIndices` (`:186`), the same calls `solveLayout` makes at `elr-range-config.ts:373`.
  - **Scatter targets:** the seeded draw scores each candidate by how many trees block its cone and
    takes the first candidate needing **≤ 2** culls. Closed rather than left open: **up to 24
    candidate draws per target**, and if none comes in under budget, the candidate with the
    **fewest** blockers wins (so placement never fails). Rejected: **cull-whatever-blocks-it**
    (21 cones could visibly thin a band of forest) and **zero-cull** (can fail to place all 21 in
    dense woods and needs a fallback nobody has designed).
  - **Wind markers:** same cone test, **no budget** — cull whatever blocks all 6. They are the
    range's wind instrument, and the owner authorised tree removal for them explicitly. This
    finally fixes the blocked-flags bug: today nothing culls trees off a marker sight line.
  - **Grass:** `rejectTuftsAtStations` (`ELRRangeScene.ts:171`) is extended to scatter targets too,
    for the reason already recorded there — a 0.29 m tuft can hide a small plate, and a popper is
    the smallest steel on the range.
  - **Per-line, and that is fine:** the scene is built per firing point (`ELRRangeScene.ts:105`),
    so each line computes its own cull and the woods legitimately differ between low and high —
    which is already true today. **Scatter positions themselves stay line-independent**, drawn from
    the persisted seed (I10), so only the culling is per-line.
  - Culling only ever *removes* trees, so this composes with S11 (no net increase in trees).

### Scatter steel — behaviour

- **I15 — Popper auto-reset is UNCHANGED: the existing hinge-stem behaviour (owner).**
  *"The poppers definitely should reset automatically as they currently do, that stays."* Recorded
  with its numbers so no plan re-decides them: `mount-registry.ts:84`
  (`knockdown: { fallAngleDeg: 80, downDwellS: 2.5, resetRateDegS: 60, stemLengthM: 1.0 }`) — a
  struck popper falls to 80°, lies down **2.5 s**, then rises at **60°/s** (~1.3 s). A shot cannot
  re-knock it or interrupt the rise (`knockdown.ts:136`). Committing a target also re-arms
  everything through `resetDownTargets` (`steel-reactions.ts:659`). **This closes the
  scatter-lifecycle question for poppers**; nothing group-scoped or shoot-to-reset is added.

- **I16 — Non-popper lifecycle: NOTHING NEW IS NEEDED. Closed from the code, not asked.** The
  worry was whether a scatter target could be knocked permanently out of play. It cannot:
  a chain-beam gong swings and settles on its own; a hostage paddle toggles between two stops; and
  committing a target already re-arms the whole range — `ScopeView.tsx:1151-1154` calls
  `resetDownTargets()` then `resetFlipTargets()` on every commit, deliberately for **all** steel
  rather than the committed group, *"the player is choosing what to shoot next, and leaving other
  targets face-down would silently narrow the range."* Combined with I15's 2.5 s popper dwell, every
  scatter type is self-restoring and no group or reset furniture has to be authored for ELR.

### Plate machinery

- **I17 — Plate machinery: the Test Range's multi-shape pattern, with FULL PAINT PARITY and
  PLAIN (RING-FREE) FACES on scatter steel (owner).**
  - **Shapes:** one `InstancedMesh` per target shape plus a slot map and `meshFor`, copied from
    `TestRangeScene.ts:66` / `:476` — a single global `instanceId` space, `plateMesh` kept as the
    one-shape fallback. ELR's single-disc `addPlates` (`ELRRangeScene.ts:190`) is the odd one out
    and gets brought onto the shipped pattern; this was never a real fork in the road.
  - **Paint:** every scatter plate owns its own atlas layer and accumulates splats exactly as the
    ladder gongs do. **Cost, priced not hand-waved:** a layer is `PLATE_TILE_WIDTH × PLATE_TILE_HEIGHT`
    = 512 × 256 RGBA = **0.5 MB** (`plate-surface.ts:23-26`, from `STEEL_PAINT_TEXTURE_SIZE = 256`),
    so ~24 new plate instances (the 3 hostages are 2 plates each) add **≈ 12.6 MB** of texture
    memory on iPad, against ~4 MB for the high line's 8 stations today. Rejected: **pooled layers**
    (marks would vanish on every commit, and it is machinery nothing else uses) and **no paint**
    (a 24″ gong that barely moves becomes unreadable — a visible group is most of the reward at
    1800 m).
  - **Faces:** scatter targets get **plain painted faces with NO scoring rings** — poppers and IDPA
    silhouettes use the authored art the Test Range already rasterizes
    (`TestRangeScene.ts:158`, `rasterizeFaces`), and scatter gongs are plain painted steel. Fits
    S9 (no scoring on scatter steel) and makes them read as different objects from the ladder's
    ringed bullseyes, which `ELRRangeScene.ts:186` registers as a base layer per station.

### Performance

- **I18 — Perf policy: MEASURE ON DEVICE against the existing readout, and cut by a NAMED LEVER
  ORDER (owner). No new instrumentation, no quality setting.** The owner's correction:
  *"There is an fps readout at the bottom of the page currently… It currently shows
  fps/ms/worst/depth."* Confirmed — `scope/perf-hud.ts` (`FrameTimer`, `FRAME_BUDGET_MS = 16`,
  60-frame window) rendered at `ScopeView.tsx:2689` as `fps · ms · worst · depth`. So the
  acceptance check is already on screen and **nothing gets added to the dev panel.**
  **Acceptance:** the rolling mean stays inside the project's **16 ms** gate with the far station
  in view, and `worst` shows no new hitching — the readout was built for exactly this question
  (`perf-hud.ts:10-15`).
  **If it regresses, the levers are pulled in this order:** grass tuft count first (200 000 tufts
  ≈ 1.0 M triangles, `elr-range-cover.ts:125` — it owns the triangle budget), then tree count
  (`MAX_TREES = 4000`, all of them drawn today at `ELRRangeScene.ts:104`), then cloud and ridge
  detail. Rejected: a **player-facing quality setting** (a second visual configuration to tune
  forever, and it invites *"which one is the real range"*) and **budgeting conservatively up
  front** by cutting grass/trees pre-emptively (spends signed-off July tuning against a slowdown
  that may not happen).
  Why this needs watching at all rather than being assumed fine: one wrong material choice on
  this range took the game from 60 to ~10 fps on device (`plate-surface.ts:195`), so it has a
  demonstrated cliff, not a gentle slope.

### The tuning inventory that must survive the refactor

- **I19 — "Carrying ELR's tuning across" is THIS EXACT LIST OF CONSTANTS. Closed by inventory, not
  asked.** The refactor evidence under I1 warns that the real cost of the rebuild is re-tuning, not
  re-plumbing; that warning is only actionable if the numbers are enumerated, so here they are. Every
  one was settled on device in July 2026 and **must survive the refactor unchanged unless a decision
  above changes it**:
  - **Ground & profile** (`elr-range-config.ts`): `GROUND_WIDTH_M = 1400`, `GROUND_LENGTH_M = 3000`,
    `SLOPE_RISE_M = 200`, `SLOPE_SPAN_M = 3000`, `GROUND_HEX = 0x7d9450`,
    `GROUND_TEXTURE_TILE_M = 8`.
  - **Firing points & ladders:** `EYE_ABOVE_GROUND_M = 1.7`, `HIGH_LINE_PLATFORM_M = 8`,
    `LOW_STATIONS_M = 50…500` (10 stations), `HIGH_STATIONS_M = 250…2000` (8 stations),
    `GONG_ANGULAR_SIZE_RAD = 1e-3`.
  - **Mount thresholds & furniture:** `STAKE_MAX_RANGE_M = 150` (the stake/rack switch on the low
    line), `STAKE_HEIGHT_M = 0.3048`, `STAKE_TARGET_TOP_GAP_M = 0.0254`,
    `FRAME_WIDTH_MULTIPLE = 1.5`, `FRAME_HEIGHT_MULTIPLE = 2.0`,
    `FRAME_GROUND_CLEARANCE_M = 0.3`, `TARGET_CENTER_Y_M = 1.0`,
    `RACK_CHAIN_DROP_MULTIPLE = 0.12`, `RING_FRACTIONS = {1/3, 2/3, 1}`.
  - **Placement search:** `OFFSET_CAP_MRAD = 35`, `OFFSET_SAMPLES = 61`,
    `FIRING_POINT_CLEAR_RADIUS_M = 30`.
  - **Grass field** (`elr-range-cover.ts`): `GRASS_SEED = 20260729`, `GRASS_FULL_M = 150`,
    `GRASS_FADE_M = 2500`, `GRASS_HALF_ANGLE_DEG = 25`, `GRASS_CLEAR_RADIUS_M = 18`,
    `GRASS_TUFT_COUNT = 200000`, `GRASS_STATION_CLEAR_M = 5`.
  - **Trees** (`elr-range-trees.ts`): `MAX_TREES = 4000`, `TREE_SEED = 20260728`, scale 0.75–1.6,
    `ASPECT_SPREAD = 0.22`, `MAX_TILT_RAD = 0.07`, `CONIFER_FRACTION = 0.65`.
  - **Atmosphere & camera:** `FOG_DENSITY = 1.7e-4` (kept deliberately — I9), `CAMERA_NEAR_M = 10`,
    `CAMERA_FAR_M = 12000`.
  **Deliberately changed by decisions above, so NOT carried:** `PANEL_HEX = 0x2a2a28` → bright orange
  (I6); `SKY_HEX = 0xdfe3e8` and ELR's fog *colour* → warm cream `0xe6dcc8`, plus the sun/hemi
  values → the shared rig's (I9); plate `metalness: 0.3` → 0 and lower roughness (I7, I8).

---

## UI / UX

### The committed-target chip

- **U1 — The committed-target chip NAMES THE TARGET TYPE INSTEAD OF THE INSTANCE ID (owner).**
  `ScopeView.tsx:2438-2441` renders `target: #7 @ 1250 yd` today; it becomes
  `target: popper @ 837 yd`, `target: 18″ gong @ 1250 yd`. The reason it matters here: scatter
  targets carry no distance signs (S5), so this chip is the **only** place a scatter target's
  identity and distance appear, and the ±12° fan (I12) creates exactly the case where two objects
  sit near the crosshair and you need to know which one you committed. The instance id is a
  debugging artifact that tells the player nothing.
  **This changes the LADDER's chip too** — a station reads `gong @ 1000 yd` — and that is
  accepted rather than overlooked; it is signed-off UI being deliberately edited. Rejected:
  leaving the id in place (the identity problem stays unsolved), and labelling scatter steel as
  *"scatter"* in words (it labels a thing already visible and pushes internal vocabulary into the
  HUD).

### Reshuffling the scatter steel

- **U2 — A "reshuffle" button on the ELR card in range select, and it re-rolls THE SCATTER STEEL
  ONLY (owner).** *"This range has a function and it's the stations. They stay where they
  are."* So the button writes a new scatter seed and the range loads with it; the forest, both
  firing lines' station offsets and the grass field are **not** re-rolled. The whole-range
  reshuffle (new forest + new station offsets) is explicitly rejected, and with it the idea of a
  single per-range seed driving every stream — the saved value stays scatter-specific
  (`scatterSeedByRange`, I10).
  **It fires at the ENTRY BOUNDARY, not live:** press on the card → new seed saved → range builds
  with it. Rejected: reshuffling while standing on the range, which means tearing down and
  rebuilding the scene mid-session — possible (the scene is fully disposable) but it hitches
  visibly and raises questions about the shot budget and committed target surviving it. Rejected
  too: a row in `SettingsScreen.tsx` (Settings is global, this is per-range, and the row would have
  to name the range) and **shipping no control** (the persisted seed would then buy nothing usable).
  **Cost is already paid:** entering ELR *today* generates 4000 tree placements, solves both lines'
  station offsets, computes the cull and generates 200 000 grass tufts with the near-plate rejection
  pass (`ELRRangeScene.ts:104-105`, `:171`). A reshuffle **is** a range load; changing which number
  seeds the scatter draw costs nothing extra. No timing instrumentation exists for scene build, and
  none is being added — the 16 ms in-scope gate (I18) is the measurement that matters.
  **Nothing in the save is invalidated:** DOPE nodes are keyed by rifle, lot and distance
  (`persistence/schema.ts:137`), never by target, so a new scatter layout leaves the book intact.
  The only thing it costs the player is their memory of which popper sat at 837.
  **Two honest side effects, stated rather than glossed:** because scatter clearance culls up to 2
  trees per target (I14) and rejects grass tufts at their feet, a reshuffle *does* change up to ~42
  trees and a little grass. **Station placement, however, is invariant** — and that is a required
  ordering, not a hope: stations are solved first, against the FULL unchanged tree field, then
  scatter is drawn, then trees are culled for scatter. Combined with I13 (scatter may never occlude
  a station), the ladder is untouched by the scatter seed by construction.

### How scatter steel looks

- **U3 — Scatter steel is painted in a MIX of NEON GREEN, ORANGE and WHITE; no backer panel, no
  sign (owner).** The owner's amendment to my single-orange proposal: *"a mix of bright, almost
  neon green, orange and white."* Rejected: **white like the ladder** (a white plate on open ground
  at 1500 m is the exact thing the owner flagged as fading into fog and grass) and **giving scatter
  targets backer panels** (erases the distinction, adds 21 frames of geometry, and makes sprinkled
  steel look like an instrumented station). The frame-and-panel look keeps meaning *"this is a
  measured station."*
  **This costs nothing to support:** paint colour is already per-plate — `createPlateSurface`
  takes a colour array (`plate-surface.ts:88`) and `PlateInstance.paintColor` carries it, so a
  per-target colour is a data change, not new machinery.
  **Assignment is a cycle, not a draw:** the three colours are dealt in draw order so the mix is
  even (7 / 7 / 7 across I11's 21 targets) and no seed can produce a run of one colour. Splash marks
  chip grey through whichever paint the plate carries, so a group reads on all three.

- **U4 — Sign-like brightness comes from BRIGHT ALBEDO ON THE FIXED RIG, with an emissive lift held
  in reserve for the device check (owner).** The owner asked for *"high reflectivity similar to
  the signs"*; the signs are bright because they are unlit (`ELRRangeScene.ts:359`), which was
  already ruled out for plate faces (I7). So scatter steel stays a **normally lit** surface and gets
  there on paint: with `metalness: 0` (I7) and the brighter rig (I9 — 24° sun, `sunIntensity 1.6`,
  `hemiIntensity 0.75`), running the same arithmetic as the light-grey diagnosis puts a 0.9-albedo
  plate at roughly **0.87–0.96 sRGB** — near-white, most of the way to sign brightness from albedo
  alone. **This is an estimate from that model, not a measurement; the device check is what settles
  it.**
  **Held in reserve, not bought:** an emissive lift fed from the same atlas — a small extension of
  the patch that already exists (`createPlateMaterial`, `plate-surface.ts:209`), giving sign
  brightness at any sun angle. Its side effect, known in advance: the grey splash chips glow too,
  dimmer than the paint because they are darker texels.
  **Rejected: fully unlit faces.** Brightest and cheapest, and literally the look pointed at — but
  the plate would lose all shading, so a toppling popper's face would not darken as it tilts and it
  reads as a decal rather than steel. Deliberately the same structure as the lighting decision: buy
  the cheap fix, hold the stronger one until the screenshot asks for it.

### Verifying it by eye

- **U5 — Verification is a FIXED SCREENSHOT LIST, shot by hand; no camera presets, no new
  instrumentation (owner).** The list does not change between rounds, which is the whole point
  — a by-eye criterion (S1) is only checkable if before-and-after are comparable:
  1. Skyline from the **high line**, minimum magnification — ridges, sky gradient, clouds, and the
     grass-meets-ridge seam.
  2. Skyline from the **high line**, maximum magnification — the seam again, where fog is doing the
     work.
  3. Ground at **~100 m off-lane** — undulation at the amplitude ramp's low end, and that there is
     **no mud near the firing line** (I5's accepted consequence).
  4. Ground at **~800 m off-lane** — undulation and dirt show-through where it should be visible.
  5. The **2000 m gong** — that the orange panel and plate still read through 11 % haze after the
     lighting change (I6, I9).
  6. A **scatter popper at ~400 m** — paint colour, brightness, no sign, and the knockdown.
  7. Skyline from the **low line** — the 3.78° skyline, the other eye height.
  Rejected: **free-form walk-and-tell** (how the July rounds went; nothing is comparable between
  rounds, so *"is the seam better than last time"* becomes a memory question) and **dev-panel camera
  presets** (real code for a development affordance, and it contradicts the no-new-instrumentation
  line drawn for perf in I18).

---

## Open — queued, in ask order

The queue is empty — every question raised in this exploration is answered above.

- **Left unresolved, deliberately: range #3's spec.** It gets its own /explore session (S6), and
  the shared-module refactor (I1) waits for it. Nothing else is outstanding: the ground-extension
  option is no longer deferred (I4), and the scatter-lifecycle and tuning-inventory items were
  closed from the code rather than left open (I16, I19).

---

## Notes

- The owner's own framing of the range's job — *"verify and update the DOPE"* — is worth
  holding onto as the thing none of this may degrade.
- **The "mud patches" mechanism — CONFIRMED BY THE OWNER (2026-08-11): where the grass layer
  dips, the mud layer below shows.** `terrain.ts:69-80` lays a dirt-textured plane at
  `y = −0.15` under the grass, serving as an apron past the grass edge; the grass is displaced by
  relief of ±2.0 m (`reliefAmpM`), so **everywhere the grass dips below −0.15 m the dirt plane is
  on top and wins**, mottling roughly half the off-lane ground into irregular, organically-edged
  bare earth. Nothing in the codebase is named mud, dirt-patch or splat, and no comment mentions
  the effect — so whether it was designed or discovered, it is the mechanism the owner wants, and
  I5 reproduces it on ELR rather than authoring patches. What it needs to bite on is **lateral
  relief**, which ELR has none of today (a laterally flat convex ramp) — hence I2/I3's undulation
  being the prerequisite rather than a nice-to-have.
- **Transparency is a scarred area on this codebase.** `plate-surface.ts:195-207` records
  `alphaTest` costing the game 60 → ~10 fps on device, on *every* range, because a shader that
  can `discard` loses early-Z rejection on a tile-based mobile GPU. Any new ground or scenery
  material should blend rather than discard, or avoid transparency altogether.
