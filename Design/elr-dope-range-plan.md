# ELR DOPE Range — 250-step ladder to 2000, shot from a bluff

Status: **UNVALIDATED — do not build from this yet.**
Date: 2026-07-27 · banner added 2026-07-27 · **cap revised 3000 → 2000 on 2026-07-27**

> ### Revision — the bluff and the fan are retired; the range sits on a convex slope (owner, 2026-07-28)
>
> **The probe answered this on device.** Probe B's rising convex hillside beat the flat
> deck decisively (owner: *"opens up so many options"*), so the terrain form below —
> a **12 m bluff** firing across flat ground on a **±1.5° fan** — is superseded. Both of
> those existed to solve one problem: getting enough *angular* separation between stations
> that the near targets do not occlude the far ones. A convex slope solves it on its own,
> on a **single straight lane**, which is more natural to look at and better to shoot.
> Rebuild §3's geometry on `elr-probe-config.ts`'s `slopeGroundY` profile rather than on
> the bluff-plus-fan arithmetic. Occlusion margins must be re-derived for 250 m steps to
> 2000 (the probe's +0.532° margin is for 500 m steps to 3000).
>
> Also settled by the probe, and relevant here: **time of flight is fine** as-is (no
> compression mechanic), the iPad renders 3 km at **60 fps** with `near = 10 m` and a
> **24-bit** depth buffer (so **§6.1's two-pass depth split is unnecessary** — delete it),
> and trace/impact/ping all read at 2000 m. See [`archive/elr-probe-plan.md`](./archive/elr-probe-plan.md) §5.0.

> ### Revision — the ladder now stops at 2000 (owner, 2026-07-27)
>
> Two independent limits nearly coincide, and neither was noticed when this doc was
> written: the golden-vector oracle **stops at 1800 m**, and the .50 BMG goes transonic
> at **1875 m**. Past roughly 1800 m the engine is both unvalidated *and* outside the
> regime a single G7 BC describes well (`Wiki/ballistic-coefficient.md`: below ~1500 fps
> even banded BCs struggle; below ~1100 fps drag can spike). At 3000 m the .50 was at
> **Mach 0.86** — the least trustworthy numbers in the game sitting at the range's
> headline station.
>
> **2000 m / 2000 yd**: 8 stations, .50 at Mach 1.13, 2187 yd = 1.24 miles — comfortably
> ELR (a mile is 1760 yd). Longest shot drops from 18.3 s to **9.4 s**, which materially
> de-risks the "is this tedious" question. The world shortens from 3100 m to ~2100 m.
>
> **The 1800 m oracle limit is not a property of the engine** — it is only what the
> validation matrix happens to sample. `GameBuild/validation/loads.json` carries a
> per-load `ranges: {maxRangeM, stepM}` and pristine BTK is present locally, so extending
> coverage to 2000 m is a data edit plus `node run.mjs --generate`. Done that way the cap
> is **fully validated**, not "200 m past coverage". Formally an owner-decision-logged
> operation (harness header), but adding new loads/ranges does not disturb existing rows.
>
> > **✅ DONE 2026-07-28.** Coverage now runs to **2000 m** for the 6.5 CM, .223, .308,
> > .338 LM and .50 BMG (all five reach it in all three atmospheres). 402 pre-existing
> > rows came back **bit-identical**, 234 rows added, 636 total across 36 cases, and the
> > owned engine matches pristine at **worst rel diff 0.000e+0**. The .22 LR stays at
> > 300 m — it cannot reach 2000 and, worse, fails *raggedly*: the harness walls flight
> > at 15 s and silently drops unreachable rows, so its coverage would have varied by
> > atmosphere without erroring. Logged in `GameBuild/validation/ORACLE_VERSION`.
> > **The 2000 m headline station is now inside validated coverage.**
>
> **The travel wall softens, and improves.** 2000 m needs 23.02 MIL; a flat base gives 20.
> So you **hold the remaining 3 MIL** — no canted base needed (owner, 2026-07-27). Since
> the reticle is FFP, holdover capacity scales with zoom: ~6 MIL below centre at 35×, ~10
> at 20×, ~21 at 10×, so 3 MIL is available at any usable magnification. Holdover is a
> *technique*; a canted base is a *purchase*. The lesson survives in the better form.
>
> Sections below still carrying 3000-based figures (§4.1 come-up, §4.3 wind) remain
> correct **as reference** — they simply extend past the cap, which §5.5's beyond-effective
> marking already handles. §1.3, §3.1, §3.2 and §8 are updated.

> ## ⚠ Read this first
>
> **The probe has been built and has reported (2026-07-28). This document is next —
> but it needs a rewrite, not a read.**
>
> This document was written before anything had been on a device. Roughly half of it is
> settled and half is educated guesswork, and the two are not visually distinguishable in
> the prose below. Owner call, 2026-07-27: build a throwaway 3 km probe first, learn what
> actually works, then rewrite this. That probe is now **done and archived** at
> [`archive/elr-probe-plan.md`](./archive/elr-probe-plan.md) — its findings are in **§5.0**
> of that doc, and the two banners above carry the consequences.
>
> **What the probe changed in the lists below:** §2.1's 12 m bluff and §3.1–3.2's fan are
> **retired** (convex slope replaces both); §6.1's depth-precision derivation is **moot**
> (24-bit on device, `near = 10 m` suffices); §5 gong/frame sizing and §6.3 fog density are
> **confirmed as built** (1 MIL gongs, white-on-dark, `FogExp2` at 1.7e−4). What remains
> guesswork is genuinely still guesswork.
>
> **Settled — arithmetic, a device cannot overturn it:**
> §1 effective ranges · §2.2 inclination error · §3.1–3.2 fan geometry and occlusion ·
> §4.1 come-up and scope-travel tables · §4.3 wind drift · §6.1 depth-precision derivation ·
> §11 ballistic figures. Reuse these freely; they are why this document still exists.
>
> **Guesswork — every one of these needs the probe:**
> §2.1 the 12 m bluff and its grade · §5 gong and frame sizing · §6.2 terrain mesh split ·
> §6.3 fog density · §6.4 wind marker placement · §7 the desert biome · §9 the entire
> build-stage order.
>
> **Missing entirely — the largest risk, found after this was written:** the shot loop at
> ELR timescales. A 3000 m shot is ~18 s from trigger to ping (9.4 s flight + 8.8 s sound).
> `BulletTrace.ts` draws a 0.15 s trail behind an 8 cm sprite; `audio-model.ts` is tuned to
> 500 yd by its own comment. The tracer will likely be invisible and the ping inaudible, and
> whether an 18-second shot is tense or tedious is unknowable without firing one. See
> [`archive/elr-probe-plan.md`](./archive/elr-probe-plan.md) §1. Nothing in the build stages below accounts for this.

Owner decisions this doc records (2026-07-27): total distance **2000 m / 2000 yd**
(revised down from 3000 — see the banner); stations **every 250**, not every 500;
**the scope's elevation-travel ceiling is designed in as the lesson**, met by holdover
rather than by a gear gate.

Supersedes `Design/feature-catalog.md` §E "Range C — ELR (500/1000/1500/2000/2500)".
Sits alongside `Design/archive/mil-zero-range-plan.md` (the Wooded Zero Range), whose
**corridor / knoll / dual-unit-superset model this range reuses and scales by 15×**, and
alongside the planned DOPE range of `Design/archive/increment-2.4-plan.md` §2.4c, which
this range is the *sibling* of rather than a replacement for (§1.4).

---

## 1. What this range is, and why it is this long

### 1.1 The question that sized it

*"What is the most powerful round we'll likely have, and what is its effective range?"*

The cartridge ladder is not in the Wiki — the Wiki is topic articles. It lives in
`Design/bullet-catalog/` (7 cartridges, 4 shipped). The top of it is the **.50 BMG**,
Hornady Match 750 gr A-MAX: true G7 **0.581**, measured MV **2720 fps @ 30″**.

Flown through the standard G7 drag function at ICAO sea level, from a 100 m zero:

| threshold | metres | yards |
|---|---|---|
| transonic onset (**Mach 1.2** — where `C_D` starts climbing and dispersion opens) | 1875 | 2050 |
| supersonic limit (**Mach 1.0**) | **2267** | **2479** |
| fully subsonic (Mach 0.9) | 2708 | 2965 |

So the honest ceiling of the most powerful round in the game is **≈2500 yd / 2270 m**.
The archived `Range C` spec (500/1000/1500/2000/**2500** yd) landed on the same number
independently, which is a good sign that both are right.

**The range is built to 2000**, which sits below that ceiling on purpose: it is where the
engine is validated and where the .50 is still above Mach 1. The original plan ran to 3000
to put a station past the wall; the banner explains why that was traded away.

**Model validation.** The same integrator was checked at 1000 yd against published
factory data before any of these numbers were used: .50 BMG 750 A-MAX @2820 → **2069 fps**
(published ≈2050–2100); 6.5 CM 140 ELD-M @2700 → **1424 fps** (published ≈1400–1450);
.308 175 SMK @2600 → **1088 fps** (published ≈1130, ~4 % conservative). Every figure in
this document is an output of that run, not an estimate.

### 1.2 The whole ladder

Supersonic (Mach 1.0) limit per catalog load, from its measured MV and true BC:

| load | M1.2 (m / yd) | **M1.0 (m / yd)** | last 250-step ≥ M1.0 (m / yd) | shipped `effectiveRangeYd` |
|---|---|---|---|---|
| .22 LR Center-X | *subsonic at the muzzle* | — | — | 200 |
| .223 77 gr TMK | 652 / 713 | 791 / 865 | 750 / 750 | 600 |
| .308 175 gr SMK | 716 / 783 | 879 / 961 | 750 / 750 | 1000 |
| 6.5 CM 140 gr ELD-M | 994 / 1087 | 1203 / 1316 | 1000 / 1250 | 1200 |
| .300 WM 215 gr Berger | 1173 / 1282 | 1411 / 1543 | 1250 / 1500 | — |
| .338 LM 300 gr Scenar | 1233 / 1348 | 1496 / 1636 | 1250 / 1500 | — |
| **.50 BMG 750 gr A-MAX** | 1875 / 2050 | **2267 / 2479** | 2250 / 2250 | — |

Two things fall out of this table, and they are §12 open items, not decisions taken here:

1. The shipped `effectiveRangeYd` values (D7, provisional design-set) have **no consistent
   physical rule behind them** — .223's 600 is well short of its 865 yd supersonic limit
   while .308's 1000 is 4 % *past* its 961. They were set by feel and labelled provisional,
   which was the right call at the time; this table is the first evidence available to
   replace them.
2. Applying a clean rule (*last 250-step station still supersonic*) would **cut .308 from
   1000 yd to 750 yd** — deleting the single most iconic shot in the sport. That the .308
   is transonic at 1000 yd is precisely *why* 1000 yd with a .308 is the classic proof
   shot. A rule that erases it is a wrong rule.

**This range does not need that question answered.** It shows every station out to 2000 and
marks the ones past the active cartridge's effective range — see §1.4 and §5.5.

### 1.3 Why the ladder is 2000 m / 2000 yd, and why both units match

The cap is set by **trust**, not by reach — see the banner. What matters structurally is
that 2000 works in both unit systems with no special case.

The invariant inherited from the Wooded Zero Range (`mil-zero-range-plan.md` §8): **the
world — terrain, corridors, vegetation — is always built from the METRIC station set, and
the imperial stations sit short on the same shared lane azimuths**, because a yard is
shorter than a metre at every nominal distance. That requires equal station counts.

At a 250 step, **250→2000 is 8 stations in either unit**, and 2000 yd = **1828.8 m**, which
sits comfortably inside metric corridor #8. Shared azimuths, one world, no special case.
(The earlier 3000 plan needed the metric ladder pulled from 2750 to 3000 precisely to get
this property; at 2000 it falls out for free.)

| imperial station | sits at | metric corridor reach | inside |
|---|---|---|---|
| 250 yd | 228.2 m | 274.7 m | yes |
| 1000 yd | 914.2 m | 1024.9 m | yes |
| 1750 yd | 1600.1 m | 1775.0 m | yes |
| 2000 yd | 1828.8 m | 2025.0 m | yes |

### 1.4 Relationship to the planned DOPE range (2.4c)

They are siblings with different jobs, and both should exist:

| | DOPE range (2.4c) | **ELR range (this doc)** |
|---|---|---|
| purpose | *training* — build the card | *proving* — find where the card, the gun and the optic run out |
| ladder | centuries, **capped** at effective range | **250 steps to 2000, uncapped by cartridge**; past-effective stations flagged |
| cartridges | all, incl. rimfire's fine 25–200 ladder | **centrefire only** (a .22 has no business at 250 m) |
| gating | none | none — but most stations are unreachable without gear |
| terrain | flat bay, full environment dressing | **elevated bluff over a 3 km deck** |

The `beyondEffective` flag already exists on `ComeUpStation` in `game/dope-book.ts`, which
is exactly the mechanism this range needs — see §5.5. Nothing about this range requires
changing `ladderStationsM`, which stays 2.4c's.

---

## 2. The firing bluff and the deck

### 2.1 Why elevation stops being optional at 3 km

The Wooded Zero Range gets away with a 1.5 m knoll because its longest sight line is 200 m.
At 3000 m the arithmetic inverts. With the eye 0.70 m above the target centre (that range's
geometry), the sight line to the 3000 m gong is **1.35 m above the ground at mid-range** —
so the entire 3 km would have to be within about a metre of dead flat or the far half of the
range is invisible. That is both unbuildable-looking and unshootable.

Raise the firing point instead. **A 12 m bluff** with a **12 % forward face** that reaches
the deck at r = 100 m:

| parameter | value | why |
|---|---|---|
| bluff crest above the deck | **12.0 m** | enough that every sight line clears the deck by metres, low enough that near-station incline stays negligible |
| prone eye above the ground it lies on | 0.20 m | → eye at **y = 13.70 m** |
| gong centre above the deck | 1.00 m | matches `TARGET_CENTER_Y_M` on every other range |
| Δy (eye − gong centre) | **12.70 m** | |
| forward face grade | **12 %** (6.84°) | must exceed the steepest sight line, 2.91° to the 250 m station |
| face meets the deck at | r = 100 m | |
| deck | **dead level** from r = 100 m to r = 3025 m | |

The binding constraint is the same one the Wooded Zero Range documents: **the ground must
fall away faster than the steepest sight line, from the muzzle onward.** It does, with a
margin that grows monotonically — and the margin here is enormous compared to the zero
range's 20 cm:

| r (m) | 0 | 10 | 25 | 50 | 75 | 100 | 150 |
|---|---|---|---|---|---|---|---|
| corridor floor (m) | 12.00 | 10.80 | 9.00 | 6.00 | 3.00 | 0.00 | 0.00 |
| 250 m sight line (m) | 13.70 | 13.19 | 12.43 | 11.16 | 9.89 | 8.61 | 6.07 |
| **clearance (m)** | **1.70** | 2.39 | 3.43 | 5.16 | 6.89 | 8.61 | 6.07 |

Once past the face, a level deck makes clearance **automatic for every station**: the sight
line to any target ends at +1.00 m and descends monotonically to it, so it is above the deck
everywhere along the way. No per-station proof is needed — the geometry does it. Clearance
for the 3000 m station never drops below 9.47 m until the last kilometre.

> **Gotcha this avoids, inherited verbatim.** A *gentle* bluff (a wide Gaussian, or a flat
> crest with a long smoothstep shoulder) grazes the near sight line a few metres in front of
> the muzzle. `mil-zero-range-plan.md` §2.2 paid for this lesson once. The fix is a **short,
> steep forward face**, not a taller hill. 12 % over 100 m is that face.

### 2.2 Is the elevation ballistically free? Yes, again — but check it, don't assume it

The zero-range closed form is `error ≈ g·H²/(4·v₀²)`, *independent of target distance*. At
H = 12 m and v₀ = 829 m/s (.50 BMG): **0.5 mm**. Over 3000 m that is 0.0002 mrad — six
orders of magnitude below one turret click.

The other term is the cosine factor on the incline itself. Depression angles:

| station (m) | 250 | 500 | 1000 | 1500 | 2000 | 2500 | 3000 |
|---|---|---|---|---|---|---|---|
| depression | −2.91° | −1.46° | −0.73° | −0.49° | −0.36° | −0.29° | −0.24° |
| `1 − cos θ` | 1.3e−3 | 3.2e−4 | 8.1e−5 | 3.6e−5 | 2.0e−5 | 1.3e−5 | 8.8e−6 |

Worst case is the **250 m** station, where the incline is steepest — and where the drop is
smallest. 0.13 % of a 0.86 MIL come-up is **0.001 MIL**. Free.

So `firing-solution.ts` stays flat-fire and needs no change, exactly as
`mil-zero-range-plan.md` §6.4 concluded for its own geometry. **Log this second instance in
`Wiki/_gaps.md` against the existing entry** — two ranges now depend on the simplification,
which raises the cost of the future range that finally breaks it (real relief, targets tens
of metres up- or downhill).

### 2.3 What the elevation buys visually

From 13.7 m the deck at 3000 m is depressed 0.24° — you see the *surface* of the deck
receding, not an edge-on line. That is the difference between "a 3 km range" and "a grey
band". It is also, per §3.2, what makes the near stations separate from the far ones without
a wide fan.

---

## 3. Station layout — 12 lanes in a 3° fan

### 3.1 The fan

Azimuth from downrange (−z), positive right. Eight stations spread evenly across
**±1.5°**, in a monotonic left-to-right staircase receding into the distance (the Wooded
Zero Range's read, at 10× the depth). Station distance is **line-of-sight range**, and the
ground run is solved from it: `groundRun = √(los² − Δy²)`, Δy = 12.70 m.

| LOS (m) | azimuth | ground run (m) | world x | world z | depression | gong ⌀ (1 MIL) |
|---|---|---|---|---|---|---|
| 250 | −1.50° | 249.68 | −6.54 | −249.6 | −2.912° | 0.25 m |
| 500 | −1.07° | 499.84 | −9.35 | −499.8 | −1.455° | 0.50 m |
| 750 | −0.64° | 749.89 | −8.41 | −749.8 | −0.970° | 0.75 m |
| 1000 | −0.21° | 999.92 | −3.74 | −999.9 | −0.728° | 1.00 m |
| 1250 | +0.21° | 1249.94 | +4.67 | −1249.9 | −0.582° | 1.25 m |
| 1500 | +0.64° | 1499.95 | +16.83 | −1499.9 | −0.485° | 1.50 m |
| 1750 | +1.07° | 1749.95 | +32.72 | −1749.6 | −0.416° | 1.75 m |
| 2000 | +1.50° | 1999.96 | +52.35 | −1999.3 | −0.364° | 2.00 m |

Bounding box: **3.0° horizontal × 2.55° vertical**. All eight are in view at or below
**≈6×** on the 24° base FOV. Maximum lateral spread is 52 m at the 2000 m station, so the
deck is far narrower than the 3000 plan's 105 m.

### Gong size — 1 MIL / 3 MOA (owner, 2026-07-27)

**One gong per station, 1 MIL in the metric world and 3 MOA in the imperial one.** This
supersedes the ~2 MOA of the 2.4 plan's D4, and it is 72 % larger in angle.

The metric case is delightful: a mil is *defined* as 1 m at 1000 m, so the plate diameter in
metres is the station number with the decimal moved. 250 m → 0.25 m; 1500 m → 1.50 m;
2000 m → **2.00 m**. No table, no conversion, and a player can derive it in their head — which
is itself teaching material for what a mil actually is.

What the bigger plate buys is the stated purpose of the range: **a miss should read as a bad
solution, not a bad hold.** 2 MOA at ELR was tight enough that marksmanship noise competed
with DOPE error. 1 MIL is not.

> **The two unit systems are not equivalent, by 12.7 %.** 1 MIL = 3.4377 MOA, so a 3 MOA
> plate is 0.873 MIL. The MOA player therefore gets a target that is both angularly smaller
> *and* — because yards are shorter than metres — physically smaller: **2.00 m at 2000 m vs
> 1.60 m at 2000 yd**, a 20 % difference in steel. Owner accepted this as "roughly the same"
> (2026-07-27), and the alternatives are worse (1 MIL = 3.44 MOA is an unusable number for a
> MOA shooter; 0.87 MIL is unusable for a MIL one). **Flagged rather than hidden** because
> this is the same class of thing as the 22-inch MOA face that read wrong on device — see
> `mil-zero-range-plan.md` §5.1. Re-judge it on the probe.

> **Plausibility, now comfortable.** At the 2000 m cap the largest plate is **2.00 m** — a
> 234 kg disc in 3/8″ AR500, squarely inside what real ELR ranges hang. The 3000 plan
> needed a 3 m / 527 kg plate, which stretched it. Shortening the range fixed this for free.

### 3.2 Occlusion — elevation does the near field, azimuth does the far field

Silhouette per station: frame **1.5 × gong wide, 2.0 × gong tall**, centred on the aim
point → a half-diagonal of **0.072°**, *the same at every station*. Any two stations
therefore need **> 0.143°** of combined angular separation.

Full separation combines azimuth and depression (`hypot(Δaz, Δdep)`), at the ±1.5° fan:

| pair | separation | needed | **margin** |
|---|---|---|---|
| 250 / 500 | 1.500° | 0.143° | **+1.357°** |
| 500 / 750 | 0.517° | 0.143° | **+0.374°** |
| 750 / 1000 | 0.457° | 0.143° | **+0.314°** |
| 1000 / 1250 | 0.432° | 0.143° | **+0.288°** |
| 1250 / 1500 | 0.437° | 0.143° | **+0.294°** |
| 1500 / 1750 | 0.434° | 0.143° | **+0.291°** |
| 1750 / 2000 | 0.433° | 0.143° | **+0.290°** |

All 28 pairs clear. Worst margin anywhere is **+0.288°** — 3.0× the requirement.

> **Fan width vs margin at 8 stations**, if the frame proportions change on the probe and
> the requirement grows: ±1.0° → 2.0× · ±1.25° → 2.5× · **±1.5° → 3.0×** · ±2.0° → 4.0×.
> ±1.5° is chosen for 3× headroom at 52 m of lateral spread; widening is cheap if needed.

### 3.3 Why the fan is 3° and not 10.5°

The Wooded Zero Range needed 10.5° because its boards are **constant physical size**, so the
near board subtends a huge angle. Here the targets are **constant angular size**, so the
requirement is a fixed 0.143° regardless of distance and the fan only has to beat it. A much
wider fan would cost real terrain: ±1.5° at 2000 m is ±52 m of lateral spread, while ±5°
would be ±175 m — more than tripling the deck width for no occlusion benefit.

---

## 4. The scope-travel ceiling — the lesson this range is built around

Owner decision: **make it the lesson.** The range is sized so that the bullet is not what
stops you first. The optic is.

### 4.1 The numbers

Come-up from a 100 m zero, .50 BMG (the only cartridge that reaches the far half at all):

| station (m) | 250 | 500 | 750 | 1000 | 1250 | 1500 | 1750 | **2000** |
|---|---|---|---|---|---|---|---|---|
| **MIL** | 0.86 | 2.86 | 5.20 | 7.86 | 10.89 | 14.36 | 18.36 | **23.02** |
| MOA | 2.9 | 9.8 | 17.9 | 27.0 | 37.4 | 49.4 | 63.1 | **79.1** |
| Mach | 2.24 | 2.06 | 1.89 | 1.72 | 1.56 | 1.41 | 1.27 | **1.13** |
| TOF (s) | 0.31 | 0.66 | 1.03 | 1.44 | 1.88 | 2.38 | 2.93 | **3.54** |
| trigger → ping (s) | 1.05 | 2.13 | 3.23 | 4.37 | 5.56 | 6.79 | 8.07 | **9.42** |

Available up-elevation, taking the catalog scope tiers at half their total travel from a
mechanically-centred zero, plus a canted base, plus reticle holdover:

| configuration | up-elevation | reaches 2000 m (23.02 MIL)? |
|---|---|---|
| top optic (40 MRAD), flat base, dial only | 20.00 MIL | **no — 3.02 MIL short** |
| top optic, flat base, **+3 MIL holdover** | 23.00+ MIL | **yes** |
| top optic, 20 MOA base, dial only | 25.82 MIL | yes |
| mid optic (29 MRAD), flat base, +3 MIL hold | 17.50 + hold | yes |
| budget optic (16.4 MRAD), flat base, +hold | 8.20 + hold | yes, at ~15 MIL of hold |

**Holdover is the answer, and that is the better lesson** (owner, 2026-07-27). 2000 m sits
3.02 MIL past what a flat-based top optic can dial, so you hold the remainder. Because the
reticle is **FFP**, holdover capacity scales with magnification — roughly **6 MIL below
centre at 35×, 10 at 20×, 21 at 10×** — so 3 MIL is available at any magnification you would
actually shoot from. A canted base becomes an *optional convenience* rather than a gate.

### 4.2 Why the ceiling still teaches, now that it is climbable

The 3000 plan ended on a station **no** optic could reach — a hard wall. At 2000 the wall is
climbable, and that is an improvement rather than a loss:

- **The lesson is a technique, not a purchase.** "Dial what you have, hold the rest" is the
  actual field skill. A gear gate teaches shopping.
- **It still bites, visibly.** A flat-based optic runs out at 1843 m — *before* the last
  station — so the player meets the limit inside the range rather than as trivia.
- **It scales with the player's gear.** A budget optic hits the wall at 1030 m and needs
  ~15 MIL of hold; a top optic with a 20 MOA base dials the whole ladder. Same range, three
  different difficulty curves, no content duplication.
- **Holdover exercises the reticle**, which is otherwise only used for ranging (2.6) — and
  it makes FFP subtension correctness matter, which is the property §C3 is built on.

> **Gotcha to design against, unchanged.** The turret must *visibly* stop, and the HUD must
> say why and what closes the gap. A turret that silently refuses to keep turning reads as a
> bug. §5.6 specs the readout.

### 4.3 Wind is the other ceiling, and it arrives first

At these times of flight the elevation problem is arithmetic; the wind problem is not. .50
BMG, 10 mph (4.47 m/s) full-value crosswind:

| station (m) | 500 | 750 | 1000 | 1250 | 1500 | 1750 | **2000** |
|---|---|---|---|---|---|---|---|
| drift (m) | 0.24 | 0.55 | 1.03 | 1.68 | 2.54 | 3.65 | **5.05** |
| drift (MIL) | 0.47 | 0.74 | 1.03 | 1.34 | 1.70 | 2.09 | **2.52** |
| **gong widths** (1 MIL plate) | 0.5 | 0.7 | 1.0 | 1.3 | 1.7 | 2.1 | **2.5** |

With a 1 MIL gong the drift in MIL *is* the drift in target widths — another small
convenience of the sizing rule. At 2000 m a 10 mph error puts the round two and a half
plate-widths off; even at 1000 m it is a full width, i.e. a clean miss. **Wind, not
elevation, is what actually decides hits past ~1000 m** — so `windMarkers: true` is
mandatory here, and
the marker set has to run the length of the deck rather than sitting at the firing line
(§6.4). This is the range that finally makes the curl-noise wind field and the flag/sock
reading mechanic earn their keep.

---

## 5. Targets, signage and the past-effective marking

### 5.1 Gongs

One **1 MIL / 3 MOA round gong** per station (owner 2026-07-27, superseding 2.4 plan D4's
~2 MOA), physical diameter from the table in §3.1 — 0.25 m at 250 → **2.00 m** at 2000.
Reuses `RangeScene` / steel-reaction / `plate-surface` hit-mark systems wholesale — no new
target tech.

**No berms** (consistent with the Wooded Zero Range and the Test Range). A miss at 2500 m
should throw a visible dust plume on the deck and tell the player *where* it went; that
splash is the primary feedback at ELR and matters more than a catch berm. Impact FX already
exist (`scope/impact-fx.ts`); the deck's ground material needs to support a dirt plume.

### 5.2 Target colour — white plate, dark panel behind it

Owner direction (2026-07-27): **targets must be white.** Grey will not read at 3 km. Right,
and doubly so because it is authentic — real ELR steel is painted white, and this game's
plate model already chips paint through to bare metal on a hit, so a white plate accumulating
dark chips is both true to life and the clearest hit feedback available at distance.

**The backdrop decides this, though, not the plate.** Fog blends everything toward the pale
horizon colour, and it costs *bright* objects far more contrast than dark ones. Apparent
contrast at the §6.3 fog density of 1.7e−4:

| station | fog | white on the **pale deck** | white on a **dark panel** | dark on the pale deck |
|---|---|---|---|---|
| 1000 m | 3 % | 0.214 | **0.690** | 0.476 |
| 2000 m | 11 % | 0.196 | **0.632** | 0.437 |
| 3000 m | 23 % | 0.170 | **0.547** | 0.378 |

White steel on the pale desert deck of §7 is the **worst** combination available — worse than
a dark plate would be. A white plate only wins with something dark immediately behind it,
which is precisely what the Wooded Zero Range found in the opposite direction (*"White against
dark conifers is the strongest read available"*, `mil-zero-range-plan.md` §5.2 — white worked
there **because** of the conifers).

**So: white gong (`0xf2efe6`) on a dark charcoal backer panel.** Contrast then holds at 3 km
regardless of biome, and the target palette stops being coupled to the ground palette — two
decisions that should be independent, and were not.

> **Gotcha this closes.** Had the range shipped a white plate against §7's pale deck, the
> symptom would have been "the far targets are hard to see", and the instinct would have been
> to make the plates bigger or the fog thinner — neither of which addresses the cause. The
> Test Range's config comments record three rounds of exactly this failure mode with trees and
> mountains, where palettes kept getting retuned to fix what was really a lighting and fog
> problem.

### 5.3 Bullseye scoring rings (owner, 2026-07-27)

Three concentric rings, so the plate is generous to *hit* but still rewards a tight group —
"large target to hit but can still dial in to tighter groups if they want."

| ring | metric | imperial | angular | fill |
|---|---|---|---|---|
| centre | ⅓ MIL | 1 MOA | 0.333 mrad | **white** `0xf2efe6` |
| middle | ⅔ MIL | 2 MOA | 0.667 mrad | **mid blue** `0x2f6fd0` |
| outer | 1 MIL | 3 MOA | 1.000 mrad | **white** `0xf2efe6` — the plate edge |

> **Revised 2026-07-27, owner: white / blue / white — and it fixes a real defect.** The first
> spec here was a red centre. Red `0xd81f26` sits at **0.30** luminance and the blue ring at
> **0.32** — a contrast of **0.02**. They differ *only in hue*, and hue is the first thing to
> go at long range: fog desaturates, and at 10× the whole plate is 21 px so there is barely
> any area for colour to register in. The red centre would have **merged into the blue ring**
> at exactly the distances the pattern exists to serve. White against blue is **0.62** of
> luminance contrast — a real edge that survives desaturation, fog and a handful of pixels.
>
> It is also brighter, which was the owner's stated reason: average plate luminance rises
> from **0.662** to **0.733**, and contrast against the dark panel at 3000 m from 0.393 to
> **0.451**.

**The rings are constant-angular, like the plate.** A 1 MOA centre subtends 0.333 mrad at
250 m and at 3000 m alike, so the pattern's on-screen appearance is **identical at every
station**. Distance drops out entirely; only magnification matters. Tune it once.

On-screen size, assuming a 900 px scope circle (scales linearly with viewport):

| magnification | 5× | 10× | 15× | 20× | 35× |
|---|---|---|---|---|---|
| plate | 11 px | 21 px | 32 px | 43 px | 75 px |
| red centre | 4 px | 7 px | 11 px | 14 px | 25 px |
| ring band width | 2 px | 4 px | 5 px | 7 px | 13 px |

So the rings **resolve from ~15× up, blur together by 10×, and are gone at 5×** — which is
the desired behaviour, not a defect. Finding the plate is a low-magnification job; scoring
against the rings is a high-magnification one.

**What the pattern costs in brightness.** The blue ring covers 33 % of the plate's *area*, so
a bullseye plate averages **0.733** luminance against a plain white plate's 0.94 — and average
luminance is what you find the plate by at low magnification, where the rings blur into one
disc. The dark backer panel of §5.2 absorbs that, and is **load-bearing rather than
decorative**: on a pale deck a bullseye plate's contrast at 3000 m collapses to under 0.05.

> **Trap worth recording, since it is counter-intuitive.** Making the blue *brighter* improves
> contrast against a dark panel but makes it **catastrophically worse** against a pale deck —
> at a plate average of ~0.72 the disc's luminance crosses the deck's and the target becomes
> camouflage (contrast 0.008). `0x2f6fd0` is chosen for the margin it keeps on both sides.
> This is the argument for never letting the target palette depend on the ground palette.

**What white / blue / white gives up.** There is no longer a *filled* aiming mark — the centre
is defined by the inner edge of the blue annulus rather than by a coloured dot. That is
probably fine: the eye centres a ring very precisely, and the reticle supplies the actual aim
point. But it is a genuine change in character and the probe should judge it.

> **Variant for the probe to try: a small dark centre dot**, ~⅓ MOA (⅑ MIL). It restores a
> positive aim mark, costs **0.01** of average luminance (1.2 % of the plate's area), and is
> ~7 px at 35× and invisible below ~20× — i.e. it appears exactly when aiming precision
> matters and stays out of the way when finding the plate does. Not specced; offered as an
> A/B on device.

**Colour vision.** Blue-on-white is a sound choice: it relies on a luminance difference rather
than a hue one, so it works for every form of colour vision deficiency and in greyscale. This
is strictly better than the red/blue version it replaces, which relied on hue alone.

> **Open — paint erosion.** The plate model chips paint through to bare metal on every hit
> (`plate-surface.ts`). Over a long session the rings will erode, which is authentic but
> eventually destroys the scoring pattern. Paper bays already have "Clean target" / "Clean
> all" (`mil-zero-range-plan.md` §7.1); steel needs an equivalent **repaint** action, or the
> rings become single-use. Not specced here — flagged for the probe to judge how fast it
> actually bites.

> **Open — do the rings score?** Owner framed them as self-assessment ("dial in to tighter
> groups if they want"), not scoring. The impact position is already known to the engine, so
> feeding ring hits into the §F scoring model is available cheaply later. Deliberately not
> decided now.

### 5.4 Frames and signage

- Frame **1.5 × gong wide, 2.0 × gong tall** (the silhouette the §3.2 proof uses), carrying
  the dark panel of §5.2 and the rings of §5.3. Unlike the Wooded Zero Range's constant-size boards, these **scale
  with the gong**, because the gong itself is constant-angular — a fixed-size frame would be
  invisible at 250 m and a postage stamp at 3000 m.
- **Distance plate** on the frame's top edge, orange on black, sized as a fraction of the
  frame so it too stays constant-angular. Text from the active unit: `"1500 M"` / `"1500 YD"`.
- **Lane stake** beside each frame, as on the Wooded Zero Range.

### 5.5 Marking the stations past effective range

Every station is built and shootable. Stations past the active cartridge's
`effectiveRangeYd` are **marked, not removed** — the plate carries a secondary band and the
HUD names the state when that station is engaged:

| state | condition | reads |
|---|---|---|
| supersonic | Mach ≥ 1.2 at the target | (nothing — normal) |
| **transonic** | 1.0 ≤ Mach < 1.2 | "TRANSONIC — dispersion opens" |
| **subsonic** | Mach < 1.0 | "SUBSONIC — past effective range" |

Mach at the target is already available from the solver, so this is a display rule rather
than new physics. It is also strictly better than the binary `beyondEffective` flag for this
range's purpose, and it sidesteps the unresolved `effectiveRangeYd` question in §1.2
entirely: the range tells the truth about *this* shot regardless of what the catalog number
eventually becomes.

### 5.6 The travel readout (what makes §4 a lesson instead of a bug)

When a station is engaged, the HUD shows three numbers and one verdict:

```
  2750 M     required  42.5 MIL
             dial       31.6 MIL   (20.0 turret + 11.6 base)
             hold       10.0 MIL   (reticle)
             ──────────────────────
             SHORT      0.8 MIL    ▸ needs more base or a deeper reticle
```

The verdict line is the feature. `DIALABLE` / `HOLD REQUIRED` / `SHORT BY x.x MIL` — and in
the last case, a one-line statement of what would close the gap. That sentence is the range's
teaching payload.

---

## 6. Engine / code changes

### 6.1 Renderer reach — three constants, no new technology

**The current renderer cannot draw this range**, but nothing about that is fundamental. Both
blockers are values chosen when the longest range in the game was 200 m:

| | today | required | cost |
|---|---|---|---|
| camera **far** plane (`ScopeView.tsx:367`) | **3000 m** | **12000 m** | none |
| sky dome radius (`test-range-config.ts:90`, `wooded-zero-environment.ts:92`) | **1500 m** | **9000 m** | none — a 32×15 sphere |
| camera **near** plane (`ScopeView.tsx:367`) | 0.5 m | **10 m** | none — see below |

A 3000 m far plane clips the 3000 m gong exactly. A 1500 m sky dome puts the *sky* halfway
down the range. Both are one-line config values.

**Make all three per-range, not global.** `ScopeView` already takes eye height from the range
(`sightIn?.eyeHeightM ?? EYE_HEIGHT_M`, line 366) precisely because it is a property of the
bay rather than of the game. Camera near/far and dome radius are the same kind of value, and
routing them through the range config avoids changing the four existing ranges at all.

#### Depth precision — `near` is the lever, and `far` is nearly irrelevant

Depth resolution at distance `z` is `z²(f−n) / ((2^bits−1)·f·n)` — it scales with **1/near**
and is almost independent of `far`. Measured over the relevant configurations, 24-bit buffer:

| near | far | @250 m | @1000 m | @2000 m | **@3000 m** |
|---|---|---|---|---|---|
| 0.5 | 3000 *(today)* | 0.007 | 0.119 | 0.477 | **1.073 m** |
| 0.5 | 12000 | 0.007 | 0.119 | 0.477 | **1.073 m** |
| 2 | 12000 | 0.002 | 0.030 | 0.119 | 0.268 m |
| 5 | 12000 | 0.001 | 0.012 | 0.048 | 0.107 m |
| **10** | **12000** | 0.000 | 0.006 | 0.024 | **0.054 m** |
| 20 | 12000 | 0.000 | 0.003 | 0.012 | 0.027 m |

Quadrupling `far` costs **nothing** — rows 1 and 2 are identical. Raising `near` from 0.5 m to
10 m buys a **20×** improvement, taking 3000 m depth resolution from 1.07 m (the gong and its
own frame land in the same depth bucket and flicker) to 5 cm (a gong standing proud of its
frame resolves cleanly).

**Raising `near` to 10 m is free, because nothing renders within 10 m of the eye:**

- the reticle is a **2D canvas overlay**, not scene geometry (`scope/reticle.ts` header) — it
  is not clipped by `near` at all;
- both environment ranges set **`shooterClearM: 18`** (`test-range-config.ts:142`,
  `wooded-zero-environment.ts:126`), so no grass tuft, bush or rock is closer than 18 m;
- nothing else in the codebase reads `camera.near` or `camera.far` — `scope-projection.ts`
  works from FOV and viewport only.

> **Correction to an earlier draft of this plan.** This section previously called
> `logarithmicDepthBuffer: true` effectively mandatory. It is not, and on the shipping target
> it is the *worst* of the available options: it writes `gl_FragDepth` in the fragment shader,
> which disables early-Z and, on the iPad's tile-based deferred GPU, the hidden-surface
> removal that hardware depends on. Raising `near` achieves the same result at zero cost.
> Reach for it only if the fallback below is also insufficient.

> **Gotcha — verify the depth buffer is actually 24-bit before trusting any of this.**
> At 16 bits the same `near = 10 / far = 12000` configuration resolves only **13.7 m** at
> 3000 m, which is unusable, and the two-pass split below stops being a fallback and becomes
> mandatory. Check `gl.getParameter(gl.DEPTH_BITS)` on the actual iPad in Stage 1 rather than
> assuming the WebGL2 default.

**Fallback if artefacts survive all of the above:** a **two-pass depth split** — render the far
scene (500 → 12000 m) with its own camera, clear the depth buffer, then render the near scene
(10 → 500 m) over it. Each pass gets the full depth range over a much shorter span, precision
stops being a question entirely, and the cost on a tile-based GPU is one extra depth clear.
It is the standard solution in flight and space sims. More code than a constant, but wholly
contained in `ScopeView` and it touches no other range.

### 6.2 Terrain — the mesh has to be graded, not just bigger

`terrain.ts:25` builds `PlaneGeometry(widthM, lengthM, 96, 192)`. For the Wooded Zero
Range's 460 × 520 m world that is ~2.7 m per segment. For a **700 × 3100 m** world the same
segment count gives **~16 m per segment** — which puts only ~6 segments across the 100 m
forward face, so the bluff renders as a visible staircase.

Two options; take the first:

1. **Split the mesh.** A near-field plane (0 → 200 m, high segment count, carries the bluff
   and face) plus a far deck (200 → 3100 m, coarse — it is flat, so it needs almost nothing).
   Two draw calls instead of one, and the total vertex count *falls*.
2. Non-uniform segment distribution on one plane. More elegant, more code, and
   `makeTerrainSampler` would need to stop assuming a uniform grid.

The dirt underplane (`terrain.ts:76`, `widthM × 3` by `lengthM × 3`) becomes 2100 × 9300 m —
fine, it is two triangles.

### 6.3 Fog — the current density erases the far half of the range

`FogExp2` at the shared `density: 7.45e-4` puts the far stations at essentially pure fog
colour:

| density | 200 m | 500 m | 1000 m | 1500 m | 2000 m | 3000 m | 4000 m |
|---|---|---|---|---|---|---|---|
| 7.45e−4 *(current)* | 2 % | 13 % | 43 % | 71 % | 89 % | **99 %** | 100 % |
| 4.0e−4 | 1 % | 4 % | 15 % | 30 % | 47 % | 76 % | 92 % |
| 2.5e−4 | 0 % | 2 % | 6 % | 13 % | 22 % | 43 % | 63 % |
| **1.7e−4** | **0 %** | **1 %** | **3 %** | **6 %** | **11 %** | **24 %** | **37 %** |

**Use 1.7e−4** — a clear, dry ELR morning. The 3000 m gong sits at 24 % fog: visibly hazed
and distinctly further away than the 1000 m one, but never washing toward sky colour. That
is the same requirement §5.2 of the zero-range plan protected for its 200 m board, applied
15× further out.

This is a **per-range** value, not a change to the shared default. The Wooded Zero Range and
the Test Range keep 7.45e-4, which is correct for a 200 m wooded bay.

Consequence: **the ridgelines must move.** At 1.7e−4 the current 1100 m / 1430 m ridges would
sit at 3 %/5 % fog — reading as solid nearby hills *inside* the shooting range. Push them to
**≈4500 m and ≈6500 m** (44 % / 71 % fog), which restores the intended gradient and keeps
them behind the 3000 m station where they belong.

### 6.4 Wind markers along the deck

`wind-markers-config.ts` places markers for Range A's 500 yd ladder. This range needs them
**out to 3000 m**, and their spacing is a design decision rather than a port: a flag at
2500 m is 1.5 mrad of fabric and reads as a speck. Proposal — full-size flags at
250/500/750/1000, then progressively **larger physical** flags at 1500/2000/2500 so their
angular size stays readable, plus mirage as a mid-range indicator once mirage ships. This
is the range that justifies §4.3's claim that wind reading is the real skill here.

### 6.5 Registry, config and scene

- **`ranges.ts`** — new `RangeSceneType` `'elr-deck'`; new `ELR_RANGE` row:
  `unitCharacter: 'both'`, `targetKind: 'steel'`, `zeroable: false`, `windMarkers: true`,
  12 stations at 250…3000 with `azimuthDeg` from §3.1. Add it to `UNLISTED` until its scene
  exists (the D8 rule against grayed-out cards).
- **New `elr-range-config.ts`** — pure data, mirroring `wooded-zero-config.ts`: LOS→ground-run
  solve, bluff floor profile, corridors, gong/frame/plate sizing, `buildCorridors()` that
  **takes no unit argument** (the superset invariant, §1.3).
- **New `elr-environment.ts`** — the environment block: fog 1.7e−4, ridges at 4500/6500 m,
  sky dome 9000 m, split terrain mesh, sparse deck vegetation.
- **New `ELRDeckScene.ts`** — a steel scene. Should implement the existing
  `steel-scene-api.ts` contract so the ScopeView fire path, hit marks and confirm-node flow
  work unmodified, in exactly the way `PaperBayScene` let the Wooded Zero Range inherit the
  zeroing flow (`mil-zero-range-plan.md` §7). **Check `steel-scene-api.ts` actually carries
  everything needed before assuming this;** if it gates on `sceneType` anywhere, extract the
  capability first, as a separate behaviour-preserving stage.
- **`ScopeView`** — one more case in the scene branch, plus the §5.6 travel readout.

### 6.6 The scope elevation-travel model — a prerequisite, and it does not exist yet

Nothing in `GameBuild/app/src/` models turret travel, canted bases or holdover limits today.
`catalog-starting-values.md` specs the tier values ("Elevation travel (MOA / MRAD) 60 / 100 /
120", "elevation travel caps the dial (gates max range at ELR)") and `feature-catalog.md` §C3
lists the canted-base toggle, but neither is built.

Since §4 is the reason this range exists, **the travel model is a prerequisite stage, not a
detail of the range**. Minimum shape:

```ts
interface OpticSpec {
  totalTravelMil: number;   // 16.4 | 29 | 40 by tier
  baseCantMil: number;      // 0 | 20 MOA | 40 MOA, as MIL
  reticleHoldMil: number;   // usable holdover below centre
}
// available up-elevation = totalTravelMil / 2 + baseCantMil
//   (a 100 m zero consumes ~0 of it, so the halving is the honest model)
```

The turret must **clamp** at the limit rather than winding past it, and the clamp must be
visible. It is worth building this on its own and confirming it on Range A first — a bug in
the clamp is much easier to find at 500 yd than at 3000 m.

---

## 7. Scenery character — not the wooded bay scaled up

The Wooded Zero Range's conifer wall does not scale. A forest at 3000 m is an opaque green
band, and corridor clearance through 3 km of trees would consume most of the deck.

Proposed character: **a high desert / dry-lake flat.** Sparse low scrub and rock scatter
thinning with distance, bare ground, distant ridgelines. The reasons are structural, not
aesthetic:

1. **Sight lines are free.** A flat pale deck under a 12 m bluff needs no corridor clearing
   past the face — the §2.1 geometry already guarantees it.
2. **Contrast.** Dark steel on pale ground is the strongest read available at 3000 m, and it
   inverts the zero range's white-board-on-dark-conifers solution rather than fighting it.
3. **It is where ELR actually happens** — and it makes mirage (`scope/Mirage.ts`, currently
   shipped OFF by default) meaningful for the first time, since heat shimmer over a hot flat
   is both a real visibility problem and a real wind indicator.
4. **It reuses the environment module.** Terrain, ground cover, ridges, sky, fog, wind sway
   are all config-driven already; this is a new palette and a new scatter density, behind the
   same flags — a fifth range, not a second environment system.

The low morning sun (§9.1 of the zero-range plan, 14° elevation at −125° azimuth) carries
over unchanged and is if anything more valuable here: raking light across 3 km of flat deck
is the only thing that will give it any depth cue at all.

---

## 8. Decisions taken (2026-07-27)

| question | decision |
|---|---|
| Total distance | **2000** — metric 2000 m, imperial 2000 yd, 8 stations each (§1.3). Revised down from 3000 for oracle coverage + Mach trust; see banner |
| Station spacing | **Every 250** (owner: "every 500 is a bit sparse") |
| Scope-travel ceiling | **Designed in as the lesson**, §4 — met by **holdover** (3.02 MIL at the far station), not a gear gate |
| Cartridges | **Centrefire only** — rimfire keeps 2.4c's fine ladder on the DOPE range |
| Ladder cap | **2000 for the range**; no per-cartridge cap — every station is built, past-effective ones are *marked*, §5.5 |
| Firing point | **12 m bluff**, 12 % forward face meeting a level deck at r = 100 m (§2.1) |
| Fan width | **±1.5°** — constant-angular targets need 0.143° of separation; margin 3.0× (§3.2) |
| Targets | **One 1 MIL / 3 MOA gong per station**, white on a dark panel, no berms (§5.1–5.2) |
| Target face | **Bullseye rings 1/2/3 MOA (⅓/⅔/1 MIL)** — **white / mid-blue / white**; a red centre was specced and rejected, it matches blue in luminance (§5.3) |
| Units | `unitCharacter: 'both'`; world always built from the **metric** set (§1.3) |
| Wind markers | **On**, and extended down the deck — wind is the real ceiling (§4.3, §6.4) |
| Biome | **High desert / dry flat**, not the wooded bay scaled up (§7) |
| Additive or replacement | **Additive** — a fifth range; supersedes the *planned* Range C, replaces nothing built |
| Environment module | **Shared.** New palette + config, behind the existing flags |

---

## 9. Build stages

Protocol-sized, in dependency order, **STOP after each** (`execution-protocol.md` §2.8).

| Stage | Scope | Touches |
|---|---|---|
| **0** | **Optic travel model** (§6.6): `OpticSpec`, available-elevation math, turret clamp, HUD remaining-travel readout. Verified on Range A. No new range. | new `game/optic.ts`, `game/active-gear.ts`, `ScopeView.tsx`, tests |
| **1** | **Renderer reach** (§6.1): make near/far/dome-radius **per-range**; set 10 / 12000 / 9000 for this range, leave the other four untouched. **Read `gl.getParameter(gl.DEPTH_BITS)` on the iPad and record it** — if it is 16, escalate to the two-pass split before going further. | `ScopeView.tsx`, `environment/sky.ts`, range env configs |
| **2** | Registry row + `elr-range-config.ts` + corridor/geometry + invariant tests. No THREE, no scene. | `ranges.ts`, new config, tests |
| **3** | **Steel-scene capability extraction** if `steel-scene-api.ts` gates on `sceneType` — behaviour-preserving refactor only, no new scene. Skip if it is already clean. | `steel-scene-api.ts`, `RangeScene.ts`, `ScopeView.tsx` |
| **4** | Split terrain mesh (§6.2) + `elr-environment.ts` (fog, ridges, sky, desert palette). Shared module, config-flagged. | `environment/terrain.ts`, `environment-config.ts`, new env config |
| **5** | `ELRDeckScene` + scene branch. Range renders and is shootable; hit marks and confirm-node inherited. Joins the landing screen. | new `ELRDeckScene.ts`, `ScopeView.tsx`, `ranges.ts` |
| **6** | Mach-state marking (§5.5) + the travel verdict readout (§5.6). The teaching payload. | `ScopeView.tsx`, `game/dope-row.ts` |
| **7** | Wind markers down the deck (§6.4) + mirage on the flat. | `wind-markers-config.ts`, `Mirage.ts` |

Stage 0 and Stage 1 are both worth doing even if this range is later shelved — the first is a
specced-but-unbuilt feature, the second is a latent limit every future long range would hit.

---

## 10. Verification the plan asks for

Beyond the standard gates (`execution-protocol.md` §5):

1. **Superset invariant test** — `groundRun(imperial_i) ≤ corridorReach(metric_i)` for all 12
   stations, so a future tweak to the fan or the corridor profile cannot silently break it.
   This is the one the Wooded Zero Range already carries; copy its shape.
2. **Occlusion test** over all 66 station pairs, asserting margin > 0 with the §3.2
   silhouette model.
3. **Sight-line-clears-floor test** at 1 m steps along every lane — cheap, and it is the
   proof §2.1 rests on.
4. **Travel-clamp test** — required > available produces a clamped turret and a `SHORT BY`
   verdict, never a silently wrong solution.
5. **Ballistic cross-check** — the come-up table in §4.1 regenerated from the shipped engine
   and diffed against this document's values. **If they disagree, the engine is the thing
   under test**, per the CLAUDE.md working agreement, and the discrepancy gets logged.
6. **iPad frame time** at Stage 1 (before/after the renderer change) and Stage 5, on this
   range *and* the existing four.

---

## 11. Ballistic figures this plan depends on

All from the validated integrator described in §1.1, ICAO sea level, 100 m zero, G7 drag,
catalog measured MV and true (hidden) BC — **not** box BC.

| load | G7 BC | MV (fps) | M1.0 (m) | come-up @1000 m (MIL) |
|---|---|---|---|---|
| .223 77 gr TMK | 0.207 | 2683 | 791 | — |
| .308 175 gr SMK | 0.243 | 2580 | 879 | — |
| 6.5 CM 140 gr ELD-M | 0.310 | 2712 | 1203 | 10.0 |
| .300 WM 215 gr Berger | 0.354 | 2765 | 1411 | 8.9 |
| .338 LM 300 gr Scenar | 0.392 | 2680 | 1496 | 9.1 |
| .50 BMG 750 gr A-MAX | 0.581 | 2720 | 2267 | 7.86 |

---

## 12. Still open

1. **The `effectiveRangeYd` rule (§1.2).** The shipped values are provisional and
   inconsistent with the physics. A clean "last supersonic 250-step station" rule would cut
   .308 from 1000 yd to 750 yd, which deletes the sport's canonical proof shot. **This range
   does not need it resolved** — §5.5's Mach-state marking is strictly more informative — but
   the 2.4c DOPE range does, and the three unshipped cartridges (.300 WM, .338 LM, .50 BMG)
   have no value at all yet. Needs an owner call.
2. ~~**`logarithmicDepthBuffer` blast radius.**~~ **Resolved 2026-07-27 by measuring instead
   of assuming (§6.1).** `far` turns out to have almost no effect on depth precision and `near`
   has all of it; raising `near` to 10 m is free (nothing renders inside 18 m, and the reticle
   is a 2D overlay) and buys 20×. Making near/far per-range removes the blast radius entirely —
   the other four ranges are not touched. One thing left to *check*, not decide: the actual
   `DEPTH_BITS` on device, since 16-bit would force the two-pass split. Stage 1 does it.
3. **Does `steel-scene-api.ts` need the `PaperBayScene` treatment?** Unread at plan time.
   Stage 3 exists to answer it and may turn out to be a no-op.
4. **60 MOA base, or a deeper reticle?** §4.1 shows 3000 m is unreachable either way, but
   which unlock closes the 2750 m gap is a progression-design question, not a geometry one.
   The reticle route is arguably better teaching (holdover is a skill; a base is a purchase).
5. **Deck vegetation density vs the 16 ms gate.** A 700 × 3100 m deck is ~15× the area of the
   Wooded Zero Range. Scatter counts cannot simply scale; distance-thinned density needs
   tuning on device.
6. **Extend the oracle matrix to 2000 m, and add the .50 BMG to it.** Both are cheap and
   together they remove the last trust caveat. `GameBuild/validation/loads.json` holds six
   loads, each with its own `ranges: {maxRangeM, stepM}` (currently topping out at 1800 m);
   pristine BTK is present locally, so `node run.mjs --generate` regenerates. Adding new
   loads and ranges does not disturb existing rows, but the harness header is emphatic that
   regeneration is an **owner-decision-logged** operation — so this needs an explicit call,
   not an agent's initiative. Doing it makes the 2000 m cap fully validated instead of
   "200 m past coverage."

7. **Adding the .50 BMG to the catalog is pure data** — verified 2026-07-27. One entry in
   `game/catalog.data.json` keyed `50bmg` with the same shape as `65cm`; there are no
   hardcoded cartridge lists anywhere (only `DEFAULT_GAME_LOAD_CARTRIDGE_ID`), `RawCartridge`
   is typed off the `'65cm'` entry so a same-shaped entry typechecks for free, and
   `isRimfireCartridge` reads a string field. Every value already exists in
   `bullet-catalog/catalog-starting-values.md`. **Extending the DOPE table needs no code at
   all**: `comeUpStationsM(isRimfire, units, effectiveRangeYd, hardMaxYd)` is already
   parameterised, callers pass `effRangeYd × 2`, and `assembleComeUp` trims at the first
   subsonic row.

8. **Does the 250 m station belong on this range at all?** It exists to anchor the near end of
   the DOPE curve, but it is also the only station where the bluff's incline is non-trivial.
   Worth a look on device before it is treated as settled.

---

## Sources

- Cartridge values (true BC, measured MV): `Design/bullet-catalog/catalog-starting-values.md`
  and `catalog-seed.json` — *secondary* source, flagged as such there.
- Scope tier travel figures: `catalog-starting-values.md` § "Scope / sighting system".
- Trajectories, Mach thresholds, come-ups, wind drift: point-mass integration against the
  standard **G7** drag function, ICAO sea level (ρ = 1.225 kg/m³, a = 340.29 m/s), `dt = 0.5 ms`,
  100 m zero, 5 cm sight height. Validated at 1000 yd against published factory data for three
  loads (§1.1). Every ballistic number in this document is an output of that run.
- Fan, occlusion, bluff clearance, dual-unit superset, fog tables: computed directly from the
  parameters in §2–§3; all figures are outputs, not estimates.
- Inclination-error closed form `g·H²/(4v₀²)` and the corridor/knoll/superset model:
  `Design/archive/mil-zero-range-plan.md` §2.2, §3.3, §8.
- DOPE range decisions D1–D10 (gong sizing, ladder, node venue, environment module):
  `Design/archive/increment-2.4-plan.md` §3.
- Existing code read for conventions and limits: `range/ranges.ts`, `range/wooded-zero-config.ts`,
  `range/wooded-zero-environment.ts`, `range/test-range-config.ts`, `range/range-a-config.ts`,
  `range/environment/environment-config.ts`, `range/environment/terrain.ts`,
  `game/dope-book.ts`, `game/catalog.data.json`, `scope/ScopeView.tsx`.
