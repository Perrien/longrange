> ## ⚠ ARCHIVED 2026-07-29 — the range was built from this; it is no longer live
>
> The ELR range **shipped** and is playable: two firing points, 18 stations, terrain,
> forest, solved placement, targets, the shot path, firing-point switching and Mach-state
> marking are all built and owner-signed on device. Execution ran from
> [`elr-range-build-spec.md`](./elr-range-build-spec.md) (also archived, alongside this).
>
> **Not built, and deliberately so:**
> - **Task 11 — wind markers along the range.** Deferred by the owner, who wants to do more
>   design work on wind first. §6 of this document is still the requirement when it resumes.
> - **Task 12 — the `.300 WM` / `.338 LM` / `.50 BMG` catalog entries.** Blocked on data, not
>   effort: `bullet-catalog/catalog-starting-values.md` carries **no bullet geometry for any
>   cartridge**, and the four shipped ones only avoided that by borrowing from the golden-vector
>   fixture, which has no `.300 WM` at all. **Prompt D** in
>   [`../bullet-catalog/catalog-data-research-prompts.md`](../bullet-catalog/catalog-data-research-prompts.md)
>   is written and ready to run. `effectiveRangeYd` additionally needs an owner decision — see
>   §13.6, which already records why no physical rule gives a defensible value.
> - **§5.4's scope elevation-travel model.** Never started; still a prerequisite for the §5
>   holdover lesson this range was designed around.
>
> **Changed on device after the spec was written** (the spec does not describe these): the
> low line's near stations use **stakes** at 50–150 m and **hanging racks** at 200–500 m, not
> the frames-and-panels the spec assumed — the high line kept panels, preserving D4's measured
> contrast. Stake plates are **bolted** and do not swing. Ammo lots are 100 rounds and the
> three-shot budget is gone (COMMIT remains). See `../execution/PROGRESS.md` for the full log.
>
> Everything below is the design record as it stood at build time. Per this folder's
> convention, **relative links inside archived files are not rewritten** except where both
> ends moved together.

# ELR DOPE Range — a wooded hillside, 50 m to 2000 m, two firing points

Status: **READY TO BUILD.** Every load-bearing assumption in this document has been
measured on device or computed against the engine. Where something is still a guess, it
says so.

Date: 2026-07-28. Supersedes the 2026-07-27 draft, archived at
[`elr-dope-range-plan-2026-07-27.md`](./elr-dope-range-plan-2026-07-27.md).

---

## 0. Why this is a rewrite rather than another revision

The 2026-07-27 draft was written before anything had been on a device. It proposed a
**12 m firing bluff**, a **±1.5° fan of lanes** across flat ground, and a **two-pass
depth split** to make 3 km renderable. A throwaway probe was then built to test those
ideas (archived at [`elr-probe-plan.md`](./elr-probe-plan.md)), and it
retired all three.

By the end, everything true about the range lived in five stacked revision banners
sitting on top of a body that contradicted them. That is a document that misleads
whoever builds from it. This rewrite folds the banners into the body and throws the
contradictions away.

**What survived from the old draft:** the effective-range arithmetic (§11), the come-up
and wind tables (§5, §6), the gong-sizing rule (§4.1), the target-colour analysis
(§4.2), the bullseye rings (§4.3), and the scope-travel lesson (§5) — all of which were
arithmetic that a device could not overturn, and did not.

**What the probe killed:** the bluff, the fan, the depth split, the "3000 m" cap, and
the assumption that a cleared lane was necessary.

---

## 1. What this range is

A **wooded hillside** rising away from the shooter, carrying two ladders of steel gongs
shot from two firing points. It is the game's DOPE range: you come here to build a
come-up table you will use everywhere else, so the distances are known, marked, and
stable.

### 1.1 The two ladders

| | firing point | steps | stations | cartridges |
|---|---|---|---|---|
| **Rimfire ladder** | low line, ground level | **50 m** to 500 | 10 | .22 LR (Center-X / CCI SV) |
| **Centrefire ladder** | high line, elevated | **250 m** to 2000 | 8 | .223 through .50 BMG |

**250 m is a shared station** — the far end of the rimfire ladder and the near end of
the centrefire one. Shoot it with both and §1.3's scaling stops being a table.

Both catalog .22 LR loads are **subsonic** (1073 and 1055 fps). Supersonic rimfire —
high-velocity .22 LR and .22 WMR — is deliberately absent: the data does not exist yet
*and* it should wait for gap N4 (§13.4).

### 1.2 Why the cap is 2000 m — trust, not reach

The .50 BMG stays supersonic to **2267 m / 2479 yd** (§11), so reach is not the limit.
Two other limits bind first, and they nearly coincide:

- the golden-vector oracle sampled the engine only to **1800 m**;
- the .50 goes **transonic at 1875 m**, past which a single G7 BC describes drag poorly
  (`Wiki/ballistic-coefficient.md`: below ~1500 fps even banded BCs struggle).

Building past both would put the least trustworthy numbers in the game at the range's
headline station.

> **The oracle limit has since been removed.** Coverage now runs to **2000 m** for the
> 6.5 CM, .223, .308, .338 LM and .50 BMG, and to **500 m** for the .22 LR. 660 rows,
> 36 cases, engine matches pristine BTK at **0.000e+0**. See
> `GameBuild/validation/ORACLE_VERSION`. **Every station on this range is now inside
> validated coverage** — which is the whole reason the cap is where it is.

2000 m is 2187 yd — comfortably ELR, a mile being 1760 yd — and it works in both unit
systems with no special case: **250→2000 is 8 stations in either unit**, and 2000 yd =
1828.8 m sits inside metric corridor #8. That preserves the invariant inherited from the
Wooded Zero Range: the world is built from the metric station set and the imperial
stations sit short on the same shared azimuths.

### 1.3 The .22 is a 4:1 scale model, not a beginner mode

Computed from the engine (ISA, 10 mph full-value crosswind; .22 zeroed 50 m, 6.5 CM
zeroed 100 m):

| | come-up | wind hold |
|---|---|---|
| **.22 LR @ 250 m** | **11.89 MIL** | **2.32 MIL** |
| 6.5 CM @ 1000 m | 10.17 MIL | 2.15 MIL |
| **.22 LR @ 300 m** | **15.75 MIL** | **2.87 MIL** |
| 6.5 CM @ 1250 m | 15.27 MIL | 3.05 MIL |

The firing solution is *the same angular problem* at a quarter of the distance. This is
why rimfire trainers exist in reality, and it is now quantified from our own engine
rather than asserted.

**Consequence for the teaching ladder: the rimfire line comes BEFORE the centrefire
one**, not beside it as an easy option. It teaches the identical skill in 500 m of
ground, with no recoil, no barrel life, and — once an effort model exists — no cost.

---

## 2. Terrain

### 2.1 A convex rising slope, and why linear does not work

Ground height rises with downrange distance on a **convex** profile (`slopeGroundY` in
`GameBuild/app/src/range/elr-probe-config.ts` is the reference implementation).

Convexity is load-bearing, not aesthetic. A **linear** slope gives roughly **0.041° of
angular separation between stations no matter how high the hill goes**, because every
target on a straight line through space subtends nearly the same elevation angle from a
fixed eye. Measured: raising a linear hill from 50 m to 300 m of rise leaves the
separation unchanged — it is a ratio, not a height. A convex profile breaks that
degeneracy and delivers **+0.532°** of clearance margin on a single straight lane.

That one property is what retired the ±1.5° fan of the old draft. The fan existed
solely to buy angular separation; the slope buys it for free, on one lane, and looks
like terrain instead of a survey.

> **The rise must keep going past the last station — a rule learned the hard way.**
> The first build used a 140 m rise over a 2100 m span inside a 2300 m ground, with
> stations to 2000. Three faults followed from that one choice, and only the first was
> obvious on screen:
>
> 1. `groundY` clamps at the span, so the slope went from 7.6° to flat **in one step** —
>    a curvature crease straight across the terrain, visible as a hard seam.
> 2. On a convex hill the apparent ground angle **peaks where the rise stops**, so the
>    crease *was* the skyline and the last 200 m of terrain — with all its trees — hid
>    behind its own crest.
> 3. Worst and least obvious: the 2000 m gong ended up **2.4 mrad below the skyline**.
>    The gong is 1 mrad. Two plate-widths of hillside behind it, i.e. effectively
>    silhouetted against sky — which quietly destroys §4.2's white-plate-on-dark-panel
>    contrast design, since that assumes hillside as the backdrop.
>
> **Two rules, both now asserted in tests:** `SLOPE_SPAN_M >= GROUND_LENGTH_M`, so the
> clamp never falls inside the drawn ground; and the ground runs **at least 1 km past
> the farthest station**, so the hill is still climbing where the far targets sit.
> Shipping values: **rise 200 m over a 3000 m span, ground 3000 m long, stations to
> 2000.** That gives the 2000 m gong **22.6 mrad** of hillside behind it and hides
> nothing.

### 2.2 The forest

Trees everywhere — no cleared lane, no cut swaths. Owner's call after seeing 4000 trees
on device: *"there's still plenty of open ground left for targets without carving out
swaths."*

Renderer is the Wooded Zero Range's existing `range/environment/trees.ts` — per-species
shape variants, independent height/breadth scaling, per-tree lean, baked canopy shading,
wind sway, ~8 draw calls. **Reused wholesale**; no new tree technology.

The only exclusion is a **30 m radius around each firing point**. A canopy through the
camera dominates fill rate and tells you nothing.

> **The convex slope is what makes a wooded range possible at all.** Solving both probe
> variants against the same 4000-tree field:
>
> | station | flat ground | convex slope |
> |---|---|---|
> | 1000 m | 4 trees in the way | **0** |
> | 1500 m | 5 | **0** |
> | 2000 m | 10 | **0** |
> | 2500 m | 12 | **0** |
> | 3000 m | 15 | **0** |
>
> A level sight line meets every tree between shooter and target; a rising one climbs
> away from the canopy. Owner on device: *"completely unusable on flat but looks great
> on convex."* The terrain does the clearing a corridor would otherwise have to do.

### 2.3 Two firing points

| line | eye height | serves |
|---|---|---|
| **low** | ~1.7 m, ground level | rimfire ladder, 50–500 m |
| **high** | elevated on the slope's shoulder | centrefire ladder, 250–2000 m |

The conflict this resolves would have been invisible until it was built: from the
elevated eye, a **50 m target sits about 12° below you**. That is a strange rimfire
stance, and it drags a real cosine error onto exactly the stations meant to teach a
clean drop. Two firing points cost one extra spawn position and no extra terrain.

**The clearance solver (§3) runs per firing point** — a sight line is defined by the eye
it starts from, so the two ladders solve independently even though they share a forest.

---

## 3. Station placement — solved, not authored

Implemented in `GameBuild/app/src/range/sight-clearance.ts` (built and tested
2026-07-28; wired into the probe and confirmed on device).

### 3.1 The clearance test

**A cone, not a ray.** Sighting a ray from eye to plate centre would happily accept a
tree covering all but the middle pixel. What must stay clear is the plate's whole shadow
volume: the cone from the eye out to the plate disc, widening linearly with distance.

**Height as well as plan position.** On a rising slope a tree 800 m out standing on low
ground sits *under* the sight line and blocks nothing. Testing plan distance alone would
cull it for free. A tree occludes only if all three hold: it stands between eye and
target, its canopy overlaps the cone in plan, **and** its crown reaches up into the cone
at that point.

**Margin.** `DEFAULT_MARGIN_M = 2.0` beyond the plate edge. A plate whose edge grazes a
canopy is technically visible and practically unshootable — you cannot call a miss you
cannot see, and splash outside the plate is most of the feedback at long range.

> ⚠️ **Fix before the rimfire ladder is built.** 2.0 m is a long-range number. At 50 m a
> 1 MIL gong is **5 cm**, so a flat 2 m margin demands a corridor forty times the plate.
> It still solves, but the rule means something different down there. Make the margin
> scale with the plate (≈2× plate radius) with a floor.

### 3.2 The offset search — the trees keep their ground, the targets move

The obvious approach is to place targets and cut whatever is in the way. That makes a
range look surveyed and costs a corridor. Invert it: **distances are fixed** (they are
the entire point of a DOPE range), so the only free parameter is lateral position.
`chooseOffset` picks, per station, the offset at which the existing forest most nearly
leaves the target clear.

What comes out is irregular, tucked-into-the-terrain placement, and the left-right
traverse arrives as a side effect rather than as a pattern anyone authored.

Two implementation details that are easy to get wrong:

- Offsets solve `z = -√(d² - offset²)`, **not** applied along a fixed z — otherwise a
  station slides off the distance it exists to teach.
- Ranking is **fewest occluders first, then widest clearance**. Those disagree: a
  position with one distant trunk clipping the cone edge can score a better margin than
  a genuinely open one. Occluder count is what the player experiences.

**The cap is angular — `OFFSET_CAP_MRAD = 25`** — for the same reason the gongs are
1 MIL. A fixed metric offset is a huge swing up close and an imperceptible nudge far
out, which is backwards: the far stations are where the shooting is interesting. 25 mrad
is 6 m at 250 m and 50 m at 2000 m.

25 sits on a measured knee (4000 trees, 8 forest seeds, trees everywhere):

| cap | m at 250 / 2000 | mean trees to cut, all stations | traverse at 20× |
|---|---|---|---|
| ±10 mrad | 2.5 / 20 | 9.5 | 1.0 fields |
| **±25 mrad** | **6 / 50** | **~6** | **~2.4 fields** |
| ±45 mrad | 11 / 90 | 4.4 | 4.3 fields |

Past the knee, each extra field of view of traverse buys about one tree, and targets
stop being interesting to find and start being tiring.

### 3.3 Two things the 18-station layout forced, that 6 stations hid

Verified 2026-07-28 by computing the full 10-low + 8-high ladder against 8 forest seeds
on this range's constants — **before** any of it was built. Both problems were invisible
on the probe's 6 stations at 500 m spacing.

**Frames occlude frames.** The solver tests trees; it does not test other targets. At
50 m spacing from a low eye, near frames blocked far gongs on **every seed tested**.
Fix: solve **near to far**, adding each placed frame to the occluder set for the
stations behind it. This is the same occlusion problem the retired fan existed to
solve — it comes back when the ladder gets dense.

**Zero culling is not achievable, and the reason is the terrain.** The convex profile
only buys clearance at *long* range: `groundY(500)` is **7.9 m**, so the first 500 m of
the hill is nearly flat, and the low line inherits exactly the flat-ground problem the
high line escapes. At a 25 mrad cap the low line left a mean of 7.2 stations blocked.

**Resolution — search, then cull.** Raise the cap to **35 mrad**, solve near-to-far with
frames as occluders, then remove the few trees still standing in a cone. Measured across
8 seeds: **mean 2.6 trees culled, worst 5, out of 4000** (0.07 %). That is the design
intent stated exactly — individual trees, never a swath.

> This corrects an over-claim. §3.4 and an earlier draft of the build spec asserted
> *zero* occluders at every station, generalising from the probe's six long-range
> stations on a steeper slope. It does not hold for a dense near ladder from a low eye.

### 3.4 Measured outcome (probe, 6 stations)

On the probe's convex slope at 4000 trees, with 6 stations at 500 m spacing from the
elevated eye, the searched offsets came out **clear at every station and every tree
density** — one occluder in the whole range, at the nearest station. §3.3 explains why
this does not generalise to the real 18-station ladder. Solved offsets from the probe, for reference: −7.9, +10.0, −1.3, −48.3, −6.2,
+39.9 m. Irregular, modest, and nobody authored them.

The rimfire ladder likewise solves to **zero occluders at every station 25–250 m** — the
near sight cone is short and narrow, so few trees fall inside it. **No cut strip is
needed for rimfire.**

> **Honesty note.** A first single-seed run reported zero culls everywhere and was
> reported internally as such. Across 8–20 seeds the real figure is 4–10 trees across
> the whole range. Still individual trees rather than a corridor — but single-seed
> results on randomised geometry are anecdotes, not measurements.

### 3.5 The layout is deterministic, and the seed is the save file

The forest is generated from a **hard-coded seed** through `mulberry32`, and
`withSolvedOffsets` is a pure function of the resulting field. Same trees and same
station offsets on every entry, every device, every reinstall, with nothing persisted.

> **Reproducible is not the same as pinned.** Any change to the generator — scale range,
> conifer fraction, ground extent, or even the *order* of `rand()` calls — reshuffles
> the forest and moves the solved offsets with it. Low stakes for DOPE, since a row is
> keyed to distance and lateral offset does not affect it, but a range the player has
> learned would quietly rearrange. **If the range should be permanent, bake the solved
> offsets into a data file rather than recomputing them.** Decide this before ship.

**Cost:** generating 4000 trees plus solving 6 stations is ~107 ms desktop, ~320 ms
iPad, paid once at range entry. (It was 470 ms / 1.4 s until `prepareOccluders` hoisted
the bounds derivation out of the candidate loops.) The full 8-station centrefire ladder
plus a 10-station rimfire ladder will run roughly ~140 ms desktop / ~420 ms iPad. If
that ever matters, a broad-phase corridor cull takes it further.

---

## 4. Targets

### 4.1 Gongs — 1 MIL / 3 MOA

One round gong per station, **1 MIL in the metric world, 3 MOA in the imperial one**.

The metric case is delightful: a mil is *defined* as 1 m at 1000 m, so the plate
diameter in metres is the station number with the decimal moved. 250 m → 0.25 m;
1500 m → 1.50 m; 2000 m → **2.00 m**. No table, no conversion, and the player can derive
it in their head — which is itself teaching material for what a mil is.

What the large plate buys is the range's stated purpose: **a miss should read as a bad
solution, not a bad hold.** At 2 MOA, marksmanship noise competed with DOPE error. At
1 MIL it does not.

> **The two unit systems are not equivalent, by 12.7 %.** 1 MIL = 3.4377 MOA, so a 3 MOA
> plate is 0.873 MIL. The MOA player gets a target both angularly smaller *and* —
> because yards are shorter than metres — physically smaller: **2.00 m at 2000 m vs
> 1.60 m at 2000 yd**. Owner accepted this as "roughly the same" (2026-07-27); the
> alternatives are worse (3.44 MOA is unusable for a MOA shooter, 0.87 MIL for a MIL
> one). Flagged rather than hidden — same class of thing as the 22-inch MOA face that
> read wrong on device (`mil-zero-range-plan.md` §5.1).

At the 2000 m cap the largest plate is 2.00 m — a 234 kg disc in ⅜″ AR500, squarely
inside what real ELR ranges hang. (The retired 3000 m plan needed 3 m / 527 kg.)

**No berms**, consistent with the Wooded Zero Range and the Test Range. A miss should
throw a visible plume and tell the player *where* it went; that splash is the primary
feedback at ELR and matters more than a catch berm.

### 4.2 Colour — white plate on a dark panel

Targets are **white** (`0xf2efe6`). Grey does not read at distance, and white is
authentic: real ELR steel is painted white, and the plate model already chips paint
through to bare metal on a hit.

**But the backdrop decides this, not the plate.** Fog blends everything toward the pale
horizon and costs *bright* objects far more contrast than dark ones:

| station | fog | white on pale ground | white on a **dark panel** | dark on pale ground |
|---|---|---|---|---|
| 1000 m | 3 % | 0.214 | **0.690** | 0.476 |
| 2000 m | 11 % | 0.196 | **0.632** | 0.437 |
| 3000 m | 23 % | 0.170 | **0.547** | 0.378 |

White steel on pale ground is the *worst* combination available — worse than a dark
plate. A white plate only wins with something dark immediately behind it. So: **white
gong on a dark charcoal backer panel** (`0x2a2a28`). Contrast then holds regardless of
biome, and the target palette stops being coupled to the ground palette.

> **The gotcha this closes.** Ship white-on-pale and the symptom is "the far targets are
> hard to see" — inviting bigger plates or thinner fog, neither of which addresses the
> cause. The Test Range config comments record three rounds of exactly this failure mode.

In a wooded range the trees help rather than hurt, which is the same finding the Wooded
Zero Range reached from the other direction (*"white against dark conifers is the
strongest read available"*). Keep the panel anyway — it makes the read independent of
what happens to be behind the plate.

### 4.3 Bullseye rings

Three concentric rings, so the plate is generous to *hit* but still rewards a tight
group.

| ring | metric | imperial | angular | fill |
|---|---|---|---|---|
| centre | ⅓ MIL | 1 MOA | 0.333 mrad | **white** `0xf2efe6` |
| middle | ⅔ MIL | 2 MOA | 0.667 mrad | **mid blue** `0x2f6fd0` |
| outer | 1 MIL | 3 MOA | 1.000 mrad | **white** `0xf2efe6` — the plate edge |

White/blue/white was an owner revision (2026-07-27) from an initial red centre, and it
fixed a real defect: red sits at 0.30 luminance against the blue ring's — too close to
separate under fog at distance. Alternating white and blue maximises the luminance step
at every boundary, which is what survives aerial perspective.

Rings are constant-angular, so **one texture serves every station** — the pattern is
identical at 250 m and 2000 m by construction.

### 4.4 Frames and signage

- Frame **1.5 × gong wide, 2.0 × gong tall**, carrying the dark panel and the rings.
  Unlike the Wooded Zero Range's constant-size boards these **scale with the gong**,
  because the gong is constant-angular — a fixed frame would be invisible at 250 m and a
  postage stamp at 2000 m.
- Frame height must clear the ground: `targetCenterYFor` raises the centre so the bottom
  edge stands clear. Pinning every centre at 1.0 m buried the far frames 2 m underground
  on the probe.
- **Distance plate** on the top edge, orange on black, sized as a fraction of the frame
  so it too stays constant-angular. Text from the active unit: `"1500 M"` / `"1500 YD"`.
- **Lane stake** beside each frame, as on the Wooded Zero Range.

### 4.5 Mach-state marking, not a binary effective-range flag

Every station is built and shootable. Stations past the active cartridge's effective
range are **marked, not removed**:

| state | condition | reads |
|---|---|---|
| supersonic | Mach ≥ 1.2 at the target | (nothing — normal) |
| **transonic** | 1.0 ≤ Mach < 1.2 | "TRANSONIC — dispersion opens" |
| **subsonic** | Mach < 1.0 | "SUBSONIC — past effective range" |

Mach at the target already comes out of the solver, so this is a display rule rather
than new physics. It is strictly more informative than the binary `beyondEffective`
flag, and it sidesteps the unresolved `effectiveRangeYd` question (§13) entirely: the
range tells the truth about *this* shot regardless of what the catalog number becomes.

> ⚠️ **The transonic label currently overstates what the engine does.** The drag rise is
> modelled, so trajectories bend correctly, but **dispersion does not open** — scatter
> comes only from MV SD, BC SD and rifle precision, none of which know about Mach. See
> `Wiki/_gaps.md` N4. Either build N4 or word the label as a warning about the model's
> limits rather than a claim about the shot.

---

## 5. The scope-travel ceiling — the lesson this range is built around

### 5.1 The numbers

Come-up from a 100 m zero, .50 BMG (the only cartridge that reaches the far half):

| station (m) | 250 | 500 | 750 | 1000 | 1250 | 1500 | 1750 | **2000** |
|---|---|---|---|---|---|---|---|---|
| **MIL** | 0.86 | 2.86 | 5.20 | 7.86 | 10.89 | 14.36 | 18.36 | **23.02** |
| MOA | 2.9 | 9.8 | 17.9 | 27.0 | 37.4 | 49.4 | 63.1 | **79.1** |
| Mach | 2.24 | 2.06 | 1.89 | 1.72 | 1.56 | 1.41 | 1.27 | **1.13** |
| TOF (s) | 0.31 | 0.66 | 1.03 | 1.44 | 1.88 | 2.38 | 2.93 | **3.54** |
| trigger → ping (s) | 1.05 | 2.13 | 3.23 | 4.37 | 5.56 | 6.79 | 8.07 | **9.42** |

Available up-elevation, taking catalog scope tiers at half total travel from a
mechanically-centred zero:

| configuration | up-elevation | reaches 2000 m (23.02 MIL)? |
|---|---|---|
| top optic (40 MRAD), flat base, dial only | 20.00 MIL | **no — 3.02 MIL short** |
| top optic, flat base, **+3 MIL holdover** | 23.00+ MIL | **yes** |
| top optic, 20 MOA base, dial only | 25.82 MIL | yes |
| mid optic (29 MRAD), flat base, +3 MIL hold | 17.50 + hold | yes |
| budget optic (16.4 MRAD), flat base, +hold | 8.20 + hold | yes, at ~15 MIL of hold |

**Holdover is the answer, and that is the better lesson.** 2000 m sits 3.02 MIL past
what a flat-based top optic can dial, so you hold the remainder. Because the reticle is
FFP, holdover capacity scales with magnification — roughly **6 MIL below centre at 35×,
10 at 20×, 21 at 10×** — so 3 MIL is available at any magnification you would shoot
from. A canted base becomes an optional convenience rather than a gate.

### 5.2 Why the ceiling still teaches, now that it is climbable

- **The lesson is a technique, not a purchase.** "Dial what you have, hold the rest" is
  the field skill. A gear gate teaches shopping.
- **It still bites, visibly.** A flat-based optic runs out at **1843 m** — *before* the
  last station — so the player meets the limit inside the range, not as trivia.
- **It scales with the player's gear.** A budget optic hits the wall at 1030 m and needs
  ~15 MIL of hold; a top optic with a 20 MOA base dials the whole ladder. Same range,
  three difficulty curves, no content duplication.
- **It exercises the reticle**, otherwise used only for ranging — which makes FFP
  subtension correctness matter.

> **Design against this gotcha:** the turret must *visibly* stop, and the HUD must say
> why and what would close the gap. A turret that silently refuses to keep turning reads
> as a bug.

### 5.3 The travel readout

When a station is engaged:

```
  2000 M     required  23.0 MIL
             dial      20.0 MIL   (20.0 turret + 0.0 base)
             hold       3.0 MIL   (reticle)
             ──────────────────────
             HOLD REQUIRED  3.0 MIL
```

The verdict line is the feature: `DIALABLE` / `HOLD REQUIRED` / `SHORT BY x.x MIL` —
and in the last case, one line saying what would close the gap. That sentence is the
range's teaching payload.

### 5.4 The travel model is a prerequisite, and it does not exist

Nothing in `GameBuild/app/src/` models turret travel, canted bases or holdover limits
today. `catalog-starting-values.md` specs the tier values and `feature-catalog.md` §C3
lists the canted-base toggle; neither is built.

Since §5 is the reason this range exists, **the travel model is a build stage, not a
detail.** Minimum shape:

```ts
interface OpticSpec {
  totalTravelMil: number;   // 16.4 | 29 | 40 by tier
  baseCantMil: number;      // 0 | 20 MOA | 40 MOA, as MIL
  reticleHoldMil: number;   // usable holdover below centre
}
// available up-elevation = totalTravelMil / 2 + baseCantMil
```

The turret must **clamp** at the limit rather than winding past it, and the clamp must
be visible. **Build and confirm it on Range A first** — a clamp bug is far easier to
find at 500 yd than at 2000 m.

---

## 6. Wind is the other ceiling, and it arrives first

At these times of flight the elevation problem is arithmetic; the wind problem is not.
.50 BMG, 10 mph (4.47 m/s) full-value crosswind:

| station (m) | 500 | 750 | 1000 | 1250 | 1500 | 1750 | **2000** |
|---|---|---|---|---|---|---|---|
| drift (m) | 0.24 | 0.55 | 1.03 | 1.68 | 2.54 | 3.65 | **5.05** |
| drift (MIL) | 0.47 | 0.74 | 1.03 | 1.34 | 1.70 | 2.09 | **2.52** |
| **gong widths** | 0.5 | 0.7 | 1.0 | 1.3 | 1.7 | 2.1 | **2.5** |

With a 1 MIL gong, drift in MIL *is* drift in target widths — another convenience of the
sizing rule. At 2000 m a 10 mph error puts the round two and a half plate-widths off;
even at 1000 m it is a full width, i.e. a clean miss.

**Wind, not elevation, decides hits past ~1000 m.** So `windMarkers: true` is mandatory,
and the markers must run the length of the range rather than sitting at the firing line.
This is the range that makes the curl-noise wind field and the flag/sock reading
mechanic earn their keep.

> **Standing issue.** The wind model has needed a circle-back for several sessions
> (`Wiki/_gaps.md`: `computeZero` bakes the live session wind into the mechanical zero,
> producing a DOPE windage column that flips sign at the zero range). This range is
> where that becomes visible rather than academic. Resolve it before or during the build.

---

## 7. Performance — measured, not estimated

All on the owner's iPad, via the probe.

| what | measured | note |
|---|---|---|
| empty 3 km scene | **60 fps, 16–17 ms** | at the vsync cap |
| `DEPTH_BITS` | **24** | so `near = 10 m` alone carries 3 km — **the two-pass depth split is dead** |
| shot cost, 500 m | 19 ms total | |
| shot cost, 2000 m | **62 ms** total (55 scatter, 6 solve) | first shot at a station only |
| shot cost, 3000 m | 86 ms (80 scatter) | |
| repeat shot, same station | **1–2 ms** | `simAt` caches per station |
| device vs native | **≈3.1×** | native measurement is a usable proxy — no deploy cycle needed to estimate |

**Renderer reach:** per-range `near = 10 m`, `far = 12000 m`. Depth precision scales
with `1/near` and is nearly independent of `far` — raising `near` from 0.5 to 10 buys
20× and costs nothing, because nothing renders inside 18 m and the reticle is a 2D
overlay. No `logarithmicDepthBuffer`, no split pass.

**Fog:** `FogExp2` at **1.7e−4**, not the 7.45e−4 the other ranges use, which would put
the 2000 m gong at 98 % fog, i.e. invisible.

**The one number still missing: the tree budget.** The probe's ramp (0 / 250 / 500 /
1000 / 2000 / 4000, with a `render X ms · verdict · N calls · Nk tris` readout) exists
to find where the device falls over, and had not been swept at the time of writing.
Until it is, treat 4000 trees over 1200 × 2100 m as *demonstrated to look right*, not as
*demonstrated to be affordable*.

> **Why the frame-time number alone could not answer this.** 17 ms at a 60 fps cap is
> equally consistent with 8 ms of work and half a frame spare, or 16.9 ms with none.
> `RenderCostMeter` brackets the render call, which is the only cost distinguishable
> from waiting for the display. Caveat written into the source: WebGL is asynchronous,
> so it measures the CPU side and **understates a GPU-bound scene** — the right bias,
> since trees are a draw-call and vertex story first.

---

## 8. What already exists, and what has to be built

**Already built and proven** (mostly by the probe, which is why it existed):

| | where |
|---|---|
| convex terrain profile + station geometry | `range/elr-probe-config.ts` |
| sight-line clearance + offset solver | `range/sight-clearance.ts` |
| tree field generation, deterministic | `range/elr-probe-trees.ts` |
| tree rendering, variants, sway | `range/environment/trees.ts` |
| constant-angular gongs, bullseye texture | `range/bullseye-texture.ts` |
| per-range camera reach, perf + depth readouts | `range/ranges.ts`, `scope/perf-hud.ts` |
| steel reaction, hit marks, paint chipping | `RangeScene`, `plate-surface.ts` |
| commit-preferred target resolution | `scope/aim-pick.ts` |
| coarse ±2 MIL / ±5 MOA elevation buttons | `state/store.ts` |
| engine: long zeros, flight-time walls | `GameBuild/engine` (2026-07-28 fixes) |
| oracle coverage to 2000 m / 500 m rimfire | `validation/loads.json` |

**Must be built:**

1. **Scope elevation-travel model** (§5.4) — prerequisite, build on Range A first.
2. **Range registry entry + scene** for the real range, with two firing points.
3. **Firing-point switching** — UI and camera, plus per-point clearance solving.
4. **Plate-scaled clearance margin** (§3.1).
5. **Rimfire ladder** — 50 m steps to 500, low line.
6. **Tree LOD / impostors for the far half**, if the ramp says it is needed. The Wooded
   Zero Range has never rendered 2 km of depth.
7. **Wind markers along the range** (§6).
8. **Mach-state marking + travel readout** (§4.5, §5.3).
9. **Ground dressing** — grass, tufts, mud, scatter, textures. Deferred; see §13.10.
10. **Catalog entries**: .50 BMG, .338 LM, .300 WM (pure data — verified, no code).
   **Not** high-velocity .22 LR or .22 WMR: neither exists in
   `bullet-catalog/catalog-starting-values.md` (the `.22 LR` section documents only
   Lapua Center-X at 1073 fps and CCI Standard Velocity at 1055 fps, both subsonic, and
   `.22 WMR` is not in the teaching ladder). They need a research pass, and they should
   wait for gap N4 regardless — see §13.

---

## 9. Build stages

> **There is a step-by-step build spec.** For execution, use
> [`elr-range-build-spec.md`](./elr-range-build-spec.md) — twelve
> numbered tasks with exact file paths, exact code, exact test assertions and a runnable
> "done when" gate each, written to be followed without needing this document. The
> stages below are the same work at a coarser grain.


Each stage ends with something on device and a stop.

| stage | what | done when |
|---|---|---|
| **1** | Scope travel model on Range A | turret clamps visibly; `DIALABLE`/`HOLD REQUIRED`/`SHORT BY` verdict correct at three optic tiers |
| **2** | Tree-budget sweep on the probe | the ramp is walked on iPad; a tree count is chosen from data |
| **3** | Range scene: terrain + forest + centrefire ladder, high line only | 8 stations, all visible, all shootable, frame time inside budget |
| **4** | Targets: rings, panels, signage, Mach marking | a 2000 m plate reads correctly at 10× and 35× |
| **5** | Low firing line + rimfire ladder | 10 stations to 500 m; 250 m shared station shootable from both lines |
| **6** | Wind markers + wind-model circle-back | drift matches §6 within the wind model's own tolerance |
| **7** | Catalog additions + DOPE integration | a come-up table can be built end to end on this range |

Stage 2 gates stage 3's vegetation density. Stage 1 gates nothing structurally but is
the reason the range exists, so it goes first.

---

## 10. Verification the plan asks for

- **Oracle stays green** after every engine touch: `node GameBuild/validation/run.mjs`
  must report `0.000e+0`.
- **Come-up table (§5.1) reproduced in-game** at three stations against the engine.
- **Wind drift (§6) reproduced** at 1000 m and 2000 m.
- **Clearance holds**: every station visible from its own firing point, at every tree
  density, on device — not just in the solver.
- **Frame time** inside 16 ms mean on iPad with the chosen tree count, both lines.
- **The 250 m shared station** gives the same DOPE row from both firing points, allowing
  for the different eye heights.
- **Unit parity**: 8 stations in both MIL and MOA worlds, imperial stations sitting
  short on shared azimuths.

---

## 11. Ballistic reference

From the validated integrator, ICAO sea level, 100 m zero, G7 drag, catalog measured MV
and true (hidden) BC — not box BC.

| load | G7 BC | MV (fps) | M1.2 (m) | **M1.0 (m)** | come-up @1000 m |
|---|---|---|---|---|---|
| .22 LR 40 gr std | *(G1 0.138)* | 1070 | *subsonic at muzzle* | — | — |
| .223 77 gr TMK | 0.207 | 2683 | 652 | 791 | — |
| .308 175 gr SMK | 0.243 | 2580 | 716 | 879 | — |
| 6.5 CM 140 gr ELD-M | 0.310 | 2712 | 994 | 1203 | 10.0 MIL |
| .300 WM 215 gr Berger | 0.354 | 2765 | 1173 | 1411 | 8.9 MIL |
| .338 LM 300 gr Scenar | 0.392 | 2680 | 1233 | 1496 | 9.1 MIL |
| **.50 BMG 750 gr A-MAX** | 0.581 | 2720 | **1875** | **2267** | 7.86 MIL |

**Rimfire**, 50 m zero, 10 mph full-value crosswind:

| range | 40 gr standard (1070 fps) | 40 gr high-vel (1255 fps) | .22 WMR (1875 fps) |
|---|---|---|---|
| 200 m / 219 yd | 8.35 MIL · 1.77 wind | 6.69 · 2.10 | 2.48 · 1.48 |
| 300 m / 328 yd | 15.75 · 2.87 | 13.02 · 3.27 | 6.24 · 2.88 |
| 400 m / 437 yd | 24.45 · 4.00 | 20.55 · 4.41 | 11.11 · 4.11 |
| **500 m / 547 yd** | **34.56 · 5.16** | 29.39 · 5.55 | 17.04 · 5.23 |

**Bullet apex above the line of sight** — the basis of the shoot-over-a-treeline idea
(§13):

| station | 6.5 CM | .338 LM | .50 BMG | apex at |
|---|---|---|---|---|
| 500 m | 0.6 m | 0.6 m | 0.5 m | ~52 % downrange |
| 1000 m | 3.5 m | 3.1 m | 2.9 m | ~55 % |
| 1500 m | 12.3 m | 9.9 m | 9.6 m | ~58 % |
| 2000 m | **32.1 m** | 25.8 m | 26.0 m | ~60 % |

---

## 12. Decisions log

| # | decision | date | note |
|---|---|---|---|
| D1 | Cap at **2000 m / 2000 yd**, 250 m steps, 8 stations | 07-27 | trust, not reach (§1.2) |
| D2 | Scope elevation-travel ceiling is the lesson, met by **holdover** not a gear gate | 07-27 | §5 |
| D3 | Gongs **1 MIL / 3 MOA**, constant-angular | 07-27 | §4.1 |
| D4 | **White** plate on a **dark charcoal** panel | 07-27 | §4.2 |
| D5 | Bullseye rings **white / blue / white** at ⅓ / ⅔ / 1 MIL | 07-27 | §4.3 |
| D6 | **Convex rising slope**; bluff and fan retired | 07-28 | §2.1, measured |
| D7 | **Wooded throughout**, no cleared lane or cut swaths | 07-28 | §2.2 |
| D8 | Target offsets **searched against the forest**, angular cap 25 mrad | 07-28 | §3 |
| D9 | **One terrain, two firing points** — low rimfire, high centrefire | 07-28 | §2.3 |
| D10 | **Rimfire ladder 50 m steps to 500 m**; 250 m shared | 07-28 | §1.1 |
| D11 | Trees are **scenery**; trajectory clearance deferred | 07-28 | §13 |
| D12 | Range stays **known-distance and marked** | 07-28 | §1 |

---

## 13. Still open

1. **Tree budget.** The ramp exists; the sweep has not been run. Gates stage 3.
2. **Bake the solved offsets, or keep recomputing?** (§3.4) Decide before ship.
3. **Plate-scaled clearance margin** (§3.1) — needed before the rimfire ladder.
4. **Transonic dispersion (`_gaps.md` N4).** Not modelled, so high-velocity rimfire is
   strictly better in-game and strictly worse in life, and §4.5's "dispersion opens"
   label overstates the model. Affects the centrefire Mach 1.2 threshold too.
   **Blocks two catalog additions:** high-velocity .22 LR and .22 WMR are not in
   `bullet-catalog/catalog-starting-values.md` and need a research pass — but they
   should not be added until N4 exists anyway, or the game teaches that buying the
   faster rimfire is a straight upgrade, which is the reverse of the truth. Research
   prompt belongs in `bullet-catalog/catalog-data-research-prompts.md` (Prompt A
   shape): a supersonic .22 LR load and the .22 WMR as an eighth ladder cartridge.
5. **Wind model circle-back** (§6) — `computeZero` bakes session wind into the zero.
6. **The `effectiveRangeYd` rule.** Shipped values are provisional and physically
   inconsistent (.223's 600 yd is short of its 865 yd limit; .308's 1000 is 4 % past its
   961). A clean "last supersonic station" rule would cut .308 to 750 yd, deleting the
   sport's canonical proof shot — so it is a wrong rule. This range does not need it
   resolved (§4.5 is strictly better), but the 2.4c DOPE range does.
7. **Trajectory clearance as a mechanic** (`feature-catalog.md`). The apex table in §11
   says a 2000 m shot passes 32 m above the sight line at the 1200 m mark — fire through
   a slot in a treeline and the round leaves it climbing and comes down through the
   canopy beyond. Deferred: needs path-obstacle collision (nothing does this today) and
   feedback for a strike 1200 m away and 30 m up, which makes **spotter cam a
   prerequisite**.
8. **Does the 250 m station belong on the centrefire line?** It anchors the near end of
   the DOPE curve but is the station most affected by the high line's downward angle.
   Now that it is also the rimfire ladder's far end, it may want to belong to the low
   line only. Look at it on device.
10. **Ground dressing — grass, tufts, mud patches, bushes, rocks, textures.** Owner
   raised 2026-07-28: the ground is currently a plain coloured surface and needs to read
   as real terrain. **Deliberately deferred out of the build spec**, for three reasons:
   it is additive and isolated (no effect on geometry, station placement or the
   clearance solver); the machinery already exists and is a reuse job, not new tech
   (`environment/ground-cover.ts`, `environment/terrain.ts`,
   `environment/texture-loader.ts`, plus dirt/grass/rock textures already on disk); and
   most importantly **it is the other half of the tree-budget question**. Ground scatter
   and trees compete for the same frame time, and the tree ramp has not been swept yet
   (§13.1). Adding scatter before that number exists would confound it. Do this after
   the range is shootable and the budget is known — and expect it to want iteration
   against the owner's eye rather than a spec.

11. **Metric vs imperial for the rimfire ladder.** The centrefire ladder is 250 m / 250 yd
   with matched station counts. The rimfire ladder was specified as "every 50 yards out
   to 500" but is computed here in metres. Same shared-azimuth invariant applies; check
   it holds at 50 m steps.

---

## Sources

- `elr-dope-range-plan-2026-07-27.md` — the superseded draft; retains the full
  derivations for the fan geometry, depth-precision analysis and biome notes.
- `elr-probe-plan.md` §5.0 — the probe's on-device findings.
- `mil-zero-range-plan.md` — the Wooded Zero Range, whose corridor/knoll model,
  tree renderer and dual-unit superset this range reuses and scales.
- `Design/execution/PROGRESS.md` P0–P17 — the build and measurement log behind every
  number in §7.
- `Wiki/ballistic-coefficient.md`, `Wiki/range-estimation.md`, `Wiki/mil-dots-subtensions.md`
- `GameBuild/validation/ORACLE_VERSION` — coverage and oracle identity.
