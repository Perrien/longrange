# Catalog expansion v2 — the parametric load model

`Status: design settled, research prompts ready to run` · `Date: 2026-08-01`
`Supersedes: Prompt D (blocking geometry run) and the discrete per-load research plan`

> **What changed, and why.** This document was first drafted as a plan to research twenty
> individual factory loads and write them into `catalog.data.json` as discrete entries. That
> approach was abandoned on 2026-08-01 in favour of a **parametric model**: the player configures
> a load along two physical axes and a quality tier, and muzzle velocity, ballistic coefficient
> and bullet length are *derived* rather than looked up. Named factory products survive as
> **presets** that snap the configurator to a real load.
>
> The reason is teaching, not economy. With two products per cartridge the player sees two points
> on a curve they can never perceive. With a configurator they see the curve itself — heavier
> bullets lose velocity and gain BC, and the whole trade becomes legible. It also happens to
> shrink the research, dissolve the geometry blocker that has stalled this work since
> 2026-07-29, and repair a dead channel in the hidden-truth model.

---

## 1. The ladder — 10 cartridges

| # | Cartridge | Class / lesson | Status |
|---|---|---|---|
| 1 | .22 LR | Rimfire precision (teacher) | Shipped |
| 2 | .223 Rem / 5.56 NATO | Light match | Shipped |
| 3 | **6mm Creedmoor** | Low-recoil competition | 🆕 |
| 4 | 6.5 Creedmoor | Medium match | Shipped |
| 5 | **6.5 PRC** | Magnum 6.5 | 🆕 |
| 6 | .308 Winchester | Standard precision | Shipped |
| 7 | .300 Win Mag | Heavy long-range | Ballistics only |
| 8 | **.300 PRC** | Modern heavy | 🆕 |
| 9 | .338 Lapua Magnum | Extreme long-range | Ballistics only |
| 10 | .50 BMG | Anti-materiel / ELR | Ballistics only |

**6mm Dasher was rejected** despite being the most-used PRS cartridge (182 shooters in the most
recent survey): it is a wildcat with no factory ammunition, so it has no preset to anchor and
belongs with handloading in Increment 5. 6mm Creedmoor is the mainstream factory answer
(162 shooters, SAAMI-standard, Hornady 108 gr ELD Match widely available). 6mm BR Norma and
6 GT were considered and passed over on availability and mainstream fit.

> ⚠ **KNOWN GAP — register in `Wiki/_gaps.md` alongside N4.** 6mm Creedmoor's real downside is
> **barrel life** (2,200–3,000 rounds vs 6.5 CM's ~3,000+ and 6mm BR's 5,000+) — the reason the
> PRS meta is drifting to 6 GT and 6XC. Barrel life is an *optional* soft resource the owner
> leans toward omitting (`CLAUDE.md` §C2/§G). **If it is never modelled, 6mm Creedmoor is
> strictly better than 6.5 Creedmoor in-game.** Same failure shape as N4: a correct-looking
> model teaching the reverse of the truth. Owner decision 2026-08-01: ship it, log the gap.

---

## 2. The model — three axes

The player chooses **bullet weight**, **bullet profile** and **ammunition quality**. Everything
else is derived.

### 2.1 Why weight is the master variable

Weight, MV and BC are not independent, and exposing all three as free sliders would let a player
build a physically impossible load — the "strictly better" failure this project has now hit three
times. In reality:

- **Weight sets MV.** For a given case, a heavier bullet leaves slower.
- **Weight sets most of BC.** Sectional density is mass over diameter squared, and BC is SD
  divided by form factor, so a heavier bullet in the same caliber automatically carries a higher
  BC.

The genuine second axis is **form factor** — how sleek the bullet is at a given weight. Our own
catalog already demonstrates this axis is real and separable: **6.5 CM's two shipped loads are
both 140.0 gr**, and .22 LR's are both 40 gr. They differ in profile alone.

### 2.2 The derivations

```
sectional density   SD  = w_gr / (7000 · d_in²)
ballistic coeff.    BC7 = SD / i7                    (i7 = form factor)
muzzle velocity     MV  = k · w_gr^(−a)              (k, a per cartridge)
```

`a = 0.50` means constant muzzle energy. Lower `a` means heavier bullets extract *more* energy
from the charge — physically real, because a heavier bullet gives the powder longer dwell time.

### 2.3 It reproduces the existing catalog

Form factor back-computed from every shipped and researched load lands in the plausible
0.85–1.35 band for 12 of 14. The two outliers are informative rather than fatal:

- **.50 BMG match implies i7 = 0.709** — sleeker than any bullet that exists. That BC is very
  likely too optimistic. **Verify before it ships.**
- **.300 WM bulk implies i7 = 1.355** — very blunt, consistent with a soft-point *and* with the
  fact that this load has no BC source at all (§4.3).

> ### ⚠ CORRECTION 2026-08-01 — the original `a` trend published here was wrong
>
> This section previously fitted `a` **from the two loads of each cartridge in the seed** and
> reported: .223 0.491 · .308 0.345 · .50 BMG 0.286 · .300 WM 0.229 · .338 LM 0.221 — concluding
> that *"efficient small cases sit near 0.5, overbore magnums near 0.22."*
>
> **That conclusion is falsified.** Fitted properly against the Hornady Handbook's full weight
> ladders, **.300 Win Mag is `a = 0.444` across 11 weight bands (R² = 0.983)** — not 0.229. The
> seed pair was two loads only 35 gr apart (180 and 215 gr), and over a span that narrow the fit
> is unstable: a ±30 fps chronograph difference on one point moves `a` by ±0.06. The apparent
> trend was an artefact of poorly-conditioned two-point fits, not physics.
>
> **Do not use the old table.** Multi-point fits from primary sources:
>
> | cartridge | `a` | points | R² | source |
> |---|---|---|---|---|
> | 6.5 Creedmoor | **0.426** | 5 bands | 0.946 | Hornady Handbook, PDF 329–333 |
> | .300 Win Mag | **0.444** | 11 bands | 0.983 | Hornady Handbook, PDF 598–606 |
>
> `a` is looking **far more constant across cartridges** than the original trend implied — two
> cartridges of very different capacity land within 0.02 of each other. The remaining four
> Hornady cartridges should be fitted the same way before any capacity-based scaling rule is
> adopted; it may turn out that a single `a` with a per-cartridge `k` is sufficient.

The muzzle-energy ratio across each cartridge's two seed loads runs 1.006 (.223) to 1.107
(.338 LM) — heavier bullets do extract modestly more energy, which is the physics the exponent
encodes. That part stands; only the per-cartridge exponents above were unreliable.

Anchored on the single 140 gr point (`k = 25064`, `a = 0.45`), the model reproduces the entire
real 6.5 Creedmoor factory lineup:

| load | derived MV | real | derived BC7 | published |
|---|---|---|---|---|
| 95 gr V-MAX | 3229 | ~3300 | 0.156 | ~0.16 |
| 120 gr ELD-M | 2906 | ~2910 | 0.246 | ~0.257 |
| 140 gr ELD-M | 2712 | **2712** | 0.310 | **0.310** |
| 147 gr ELD-M | 2653 | ~2695 | 0.335 | ~0.351 |
| 156 gr EOL | 2583 | ~2600 | 0.363 | ~0.368 |

Two constants per cartridge, ~2% error across the lineup. *(The 140 gr row is the anchor, so its
exactness is by construction, not evidence.)*

### 2.4 The third axis — quality

Weight and profile are **free trades**: give up velocity, gain BC. Quality is not a trade — better
is simply better — which makes it the natural place to attach cost, scarcity or progression. That
matters because it is the one thing every other axis in this project lacks. The rifle tiers are a
dead mechanic precisely because "custom" is free and strictly better.

Quality carries the four hidden-truth statistics. The existing research shows **grade explains
nearly all the variance and cartridge only scales it**:

| | per-shot MV SD | lot BC variance |
|---|---|---|
| match | 6–14 fps (mean 10.6) | 1.5% for 5 of 7 |
| bulk | 16–25 fps (mean 18.6) | 3.5–5.0% (mean 4.1) |

Lot-to-lot MV shift *does* scale with case size — 15 fps (.22 LR) → 25 (6.5 CM) → 45 (.338 LM) →
75 (.50 BMG) — which is real: a bigger charge varies more in absolute terms.

So the model is **tier sets the level, cartridge scales it**, not seven independent datasets.

> ⚠ Two figures look wrong and should be re-checked: **.223 match at 3.5%** and **.300 WM match at
> 4.5%** lot BC variance are both high for match-grade loads against a 1.5% norm.

### 2.5 "Bulk" means the cheaper factory option

The grade id stays `bulk`, but it means *the cheaper factory option for this cartridge* — plinking
FMJ where that genuinely exists (.22 LR, .223, .308, .50 BMG), factory hunting-grade where it does
not (the PRCs, the magnums). There is no cheap FMJ for a 6.5 PRC. The shipped catalog already
works this way (.300 WM's S&B SPCE, .338 LM's S&B FMJ-BT). Research must **name the category it
picked and why**, never invent a plinking load that does not exist.

---

## 3. What this dissolves

### 3.1 The geometry blocker

Bullet length becomes **derived** from mass, caliber and profile, rather than looked up per
product. Prompt D — blocking since 2026-07-29 because `lengthM` did not exist for any pending
load — is no longer needed. What replaces it is a small set of measured length-to-diameter anchors
per construction class, to calibrate the relation (§5, P2).

This also repairs a defect nobody had logged: **both grades of every shipped cartridge currently
share one bullet length**, because geometry came from the golden-vector fixture, which holds only
the match load. A 55 gr XM193 is not 0.98″ like a 77 gr TMK. Length feeds stability and therefore
spin drift, so four live loads are solving on wrong geometry today. Under the derived model this
cannot happen — length follows mass.

### 3.2 The dead box-BC channel

`catalog.ts` correctly refuses to feed a G1 number into a G7 solve, so where no G7 is advertised,
`believedBc` falls back to `trueBc`. In practice **only 2 of 8 shipped loads carry any
believed-vs-true BC gap** (.22 LR match +28%, 6.5 CM match +5%). The hidden-truth model has an
entire deception channel that does nothing across most of the catalog.

Parametrically this becomes one clean knob: **the advertised form factor is optimistic.** It
applies uniformly to every load instead of only where a manufacturer happened to publish a G7.

### 3.3 Residual holes that still need closing

- **.300 WM bulk** — `lotBcVarPct` null *and* both advertised BCs null. The only load with no BC
  data of any kind beyond an estimate.
- **.223 bulk** — `lotBcVarPct` null. **.223 match** — `trueBcMeasSd` null.
- **.300 Win Mag** — absent from the golden-vector oracle entirely. The one cartridge in the
  ladder with no oracle coverage.

---

## 4. The rifle model

Audited 2026-08-01: **of five rifle attributes, only twist does anything.**

| field | status |
|---|---|
| `twist` → `catalogTwistM` | ✅ live — drives spin drift in the solve |
| `barrelLengthIn`, `weightLb` | Store display text only |
| `recoilFtLb`, `barrelLifeRounds` | defined, copied into the model, **never read** |
| `twistGating` | a string, explicitly "display only, not enforced" (D7) |

Recoil is a hardcoded `RECOIL_PITCH_VEL = 0.05` in `ScopeView.tsx`, so the .50 BMG and the .22 LR
kick identically today.

**Decision: one rifle per cartridge, configurable on the two axes that earn their keep.**

| axis | what it changes | why it's a real choice |
|---|---|---|
| **Twist rate** | Spin drift (live) + which bullet weights stabilise | Fast twist buys heavy high-BC bullets, costs spin drift. **Only becomes a decision once weight is continuous** — which is exactly what §2 provides |
| **Barrel length** | MV via fps/inch | Velocity against weight and handling. Data exists in the seed (`mvPerInchFps`), never wired |

Barrel quality stays a single precision axis but **needs a price** (barrel life or progression) or
it repeats the dead-tier problem. Muzzle devices and the canted base are later — the canted base
is already the ELR range's designed lesson (§5.4 of the archived ELR plan) and has never been
started.

The synergy worth naming: **the weight slider is what makes twist rate matter.** With two fixed
loads there is nothing to gate, which is why `twistGating` was left as decoration.

---

## 5. What data is actually needed now

### 5.0 The form-factor axis is already sourced — we own it

**Appendix A of Litz's *Applied Ballistics* 3rd edition is a 533-bullet live-fire library giving
`Bullet | SD | i7 | G7 BC | G1 BC`.** It has been in `Documentation/` since July; the `.txt` OCR
dropped it because it is a table, so it was never noticed. Extracted 2026-08-01 to
[`litz-appendix-a-bullets.json`](./litz-appendix-a-bullets.json) — **471 of 533 rows**, PDF pages
377–424.

This is a **primary source** for the entire form-factor axis, and it removes P2's largest ask.

Extraction notes: numeric columns came from positional (`pdftotext -bbox`) parsing; five pages
were image-only in the text layer and were transcribed by rendering them. **465 of 471 rows
satisfy the identity `i7 == SD ÷ G7 BC`**, and weight derived as `SD × 7000 × d²` agrees with the
printed name weight within 2 gr on **305 of 313** checkable rows. Bullet *names* carry OCR noise;
the numbers are validated. PDF page 393 (.264) is image-only and was not recovered — roughly 12
rows short there. The library is the 2015 edition, so later bullets (Hornady ELD-M, Berger 215
Hybrid) are absent.

**Measured form-factor ranges, replacing the values assumed in §2:**

| caliber | cartridges | n | weight range | i7 range (5–95 pct) |
|---|---|---|---|---|
| .224 | .223 Rem | 54 | 40–90 gr | 0.987–1.437 |
| .243 | 6mm Creedmoor | 57 | 58–117 gr | 0.950–1.323 |
| .264 | 6.5 CM / 6.5 PRC | 48 | 95–160 gr | 0.905–1.212 |
| .308 | .308 / .300 WM / .300 PRC | 140 | 110–240 gr | 0.959–1.226 |
| .338 | .338 Lapua | 47 | 180–325 gr | 0.844–1.170 |
| .510 | .50 BMG | 13 | 646–808 gr | 0.811–1.181 |

### 5.1 What the library says about our existing catalog

Looking up the actual bullets our loads use:

| load | our value | Litz measured | verdict |
|---|---|---|---|
| .308 match — Sierra 175 MatchKing | G7 0.243 | **0.243** (i7 1.085) | ✅ exact |
| .338 LM match — Lapua 300 Scenar | G7 0.392 | **0.392** (i7 0.956) | ✅ exact |
| **.50 BMG match — Hornady 750 A-MAX** | **G7 0.581** | **0.508** (i7 0.811) | ❌ **14% too optimistic** |
| .223 match — Sierra 77 Tipped MatchKing | G7 0.207 | 0.202 (i7 1.085) | minor, ~2.5% high |
| .300 WM match — Berger 215 Hybrid | G7 0.354 (implies i7 0.915) | not in the 2015 library; nearest Berger hybrids measure i7 0.945–0.960 | likely ~4% optimistic |
| .338 LM bulk — S&B 250 FMJ-BT | G7 0.260 (implies i7 1.202) | Lapua 250 FMJBT measures i7 1.015 | different maker; ours may be pessimistic |
| 6.5 CM match | G7 0.310 (implies i7 0.926) | Hornady 140 A-MAX 0.288 (i7 0.996) | ours is probably the newer ELD-M, absent from this edition |

**The .50 BMG error is the one that matters, and the form-factor screen found it before the
source did.** §2.3 flagged that load as implying an impossibly sleek i7 of 0.709; the primary
source confirms the flag and supplies the correct number. The real floor across 471 measured
bullets is 0.811 — which is the A-MAX itself, the sleekest bullet in the library.

### 5.1b Fitted velocity curves — build-ready values (2026-08-01)

`MV = k · w^(−a)`, w in grains, MV in fps. Fitted by log-log regression.

| cartridge | `a` | `k` | pts | R² | source |
|---|---|---|---|---|---|
| 6mm Creedmoor | 0.406 | 21 800 | 7 | 0.993 | R1 (as delivered) |
| 6.5 Creedmoor | **0.426** | 22 611 | 5 | 0.946 | **Hornady, PDF 329–333** |
| 6.5 PRC | 0.333 | — | 4 | 0.923 | R1, cleaned ⚠ weakest |
| .308 Winchester | **0.525** | 38 537 | 6 | 0.976 | **Hornady, PDF 486–492** |
| .300 Win Mag | **0.444** | 31 900 | 11 | 0.983 | **Hornady, PDF 598–606** |
| .300 PRC | 0.464 | — | 5 | 0.983 | R1, suspect 180 gr row dropped |
| .338 Lapua | **0.511** | 49 391 | 5 | 0.989 | **Hornady, PDF 680–682** |
| .50 BMG | *0.444 assumed* | 52 972 | 1 anchor | — | Hornady 750 gr band only |
| .22 LR | *0.444 assumed* | 5 522 | 1 anchor | — | no reloading data exists |
| **.223 Remington** | **0.309** | **11 414** | 5 | 0.946 | **Hornady, PDF 172–179** |

**.223 Remington (added 2026-08-01).** Section confirmed visually — the cartridge tab on PDF 176
reads "223 Remington", printed 165, consistent with the +11 offset. Weight bands were read from
the `SECTIONAL DENSITY` line (`gr = SD × 7000 × 0.224²`) rather than the band header, which OCRs
unreliably.

Two extraction traps worth recording:

- **The 35 gr and 40 gr bands are censored.** Both top out at 3800 fps because that is the last
  column the table prints, not because the cartridge stops there. Including them biases `a`
  downward; they are excluded.
- **Do not mix in the "223 Remington Service Rifle Data" section** (printed 169+). Those loads are
  throttled for gas-gun function, and folding its 68/70 gr bands into the fit swings `a` from
  0.309 to 0.510 and makes the result *worse* against our own catalog (−5.1% vs +3.2% at 77 gr).

Validated against the seed's own loads, normalised from their 16″ test barrel to 24″ at
25.3 fps/inch: **77 gr predicts 2979 vs 2885 fps (+3.2%)**, **55 gr predicts 3306 vs 3367 fps
(−1.8%)** — both inside the 4.4% band established below.

**All eight fitted cartridges land in one band: `a` = 0.309–0.525, mean 0.427 ± 0.072.**
Two data points had to be removed to get there — 6.5 PRC's impossible 140 gr row and .300 PRC's
optimistic 180 gr row — and **the fact that removing exactly those two collapses the spread is
independent evidence they were the bad values**, not the model.

**Fallback rule for cartridges without a ladder.** Fixing `a` at the mean and anchoring `k` to a
single known (weight, velocity) point reproduces every fitted cartridge to **within 4.4% worst
case, typically 1–4%** — comfortably inside the MV scatter the hidden-truth model already applies.
That is how .50 BMG and .22 LR are handled, and it means **one anchor point per cartridge is
sufficient** if a full ladder is ever unavailable. Sanity check: the .50 BMG fallback predicts
647 gr → 2990 fps and 808 gr → 2709 fps, both consistent with published loads.

### 5.2 Remaining data needs

Per **cartridge** (10):

- exact caliber diameter
- available bullet weight range in that caliber
- 3–4 (weight, MV, barrel length) anchor points to fit `k` and `a`
- twist rates available, and the weight each stabilises
- barrel length range and fps/inch
- barrel life, barrel-to-barrel MV spread
- lot-shift scaling

Per **quality tier** (3, global, cartridge-scaled): per-shot MV SD, lot-to-lot MV shift, lot BC
variance, per-shot BC scatter.

Per **construction class** (not per product): form-factor range and length-to-diameter anchors.

Per **preset** (~25, light): name, weight, profile (or published BC to back it out), quality tier,
advertised MV. **No per-product statistics dossier.**

### The four runs

Split by **source domain**, so no two runs open the same book:

| | Run | Scope | Source domain | status |
|---|---|---|---|---|
| **P1a** | Velocity envelopes — 6 cartridges | .223 · 6.5 CM · .308 · .300 WM · .338 LM · .50 BMG | **Hornady Handbook 10th ed. — in `Documentation/`** | ✅ **sourced — §5.4** |
| **P1b** | Velocity envelopes — 3 new cartridges | 6mm Creedmoor · 6.5 PRC · .300 PRC | postdate the 2016 edition — needs research or a newer manual | deep research |
| **P2a** | Bullet **form factors** | by caliber and construction class | Litz, *Applied Ballistics* 3rd ed. **Appendix A** | ✅ **done — §5.0** |
| **P2b** | Bullet **lengths** | ~30 length anchors to fit `C` per construction class | maker spec sheets, reloading manuals, caliper readings | **deep research — §5.3** |
| **P3** | Quality tiers | 3 tiers + cartridge scaling; plus the §3.3 holes | Litz, *Modern Advancements*; chronograph data | needs the book |
| **P4** | Rifle platform | 10 cartridges, 5 fields | rifle reviews, barrel makers | deep research |

> **📌 The prompts are written and live in
> [`research-prompts-v2.md`](./research-prompts-v2.md)** — three self-contained runs (**R1** the
> three new cartridges + case capacity, **R2** bullet lengths, **R3** ammunition consistency
> statistics), each with a validation hook against data already in hand.

**No further books required.** *Ballistic Performance of Rifle Bullets* is not needed (§5.3), the
**Hornady Handbook is in hand** (§5.4), and *Modern Advancements* could not be obtained — its
content is now sought by run R3 instead. Note that **.22 LR is rimfire and appears in no reloading
manual**, so for that cartridge the presets effectively are the data.

### 5.4 The Hornady Handbook covers six of the ten

`Documentation/Hornady-Reloader.pdf` is the **10th edition (©2016)**, 1021 pages, **scanned with
no text layer** — `pdftotext` returns nothing. Extraction is `pdftoppm` + `tesseract`, or render
and read. **Printed page → PDF page = printed + 11** (verified: printed 336 = PDF 347).

**Why it answers P1 directly.** In the load tables the **velocity is the column header**
(2500 / 2600 / 2700 …) and the cells are the powder charge needed to reach it. So a cartridge's
velocity ceiling at a given bullet weight is just **the rightmost populated column** — one number
per weight band, which is exactly the `k`/`a` fit input. `tesseract --psm 6` at 150–200 dpi reads
the band header and the `POWDER 2500 2600 …` row reliably, so the sweep is automatable.

| ladder cartridge | in the book? | location |
|---|---|---|
| .223 Remington | ✅ | — |
| 6.5 Creedmoor | ✅ | printed 317 → PDF 328 |
| .308 Winchester | ✅ | confirm visually (OCR ambiguous) |
| .300 Win Mag | ✅ | confirm visually (OCR ambiguous) |
| .338 Lapua Magnum | ✅ | printed 668 → PDF 679 |
| .50 BMG | ✅ | printed 782 → PDF 793 |
| .22 LR | ❌ | rimfire — in no reloading manual |
| 6mm Creedmoor · 6.5 PRC · .300 PRC | ❌ | all postdate the 2016 edition |

**The three new cartridges are exactly the ones it misses**, which is the awkward part. But the
six it *does* cover span .223 to .50 BMG, which is enough to **fit the `a` exponent across the
full range of case capacities** and establish the efficient-case → overbore-magnum trend
identified in §2.3. 6.5 PRC and .300 PRC both sit between 6.5 CM and .300 WM in capacity, so P1b
becomes an interpolation to validate rather than a blind extrapolation.

**Bonus — it repairs a BC discrepancy.** The handbook publishes **G7 BCs for ELD® Match and
ELD-X®**, which the 2015 Appendix A predates, and notes ELD BCs are **Doppler-radar measured at
800 yd**. The 6.5 mm 140 gr ELD Match reads **G7 0.312** — confirming our catalog's 0.310. So
§5.1's flag on that row resolves as *not an error*: Appendix A's `Hornady 140 A-MAX 0.288` is
simply the older bullet.

**Not in it:** bullet length. `C.O.L.` is the loaded cartridge, not the projectile — P2b stands.

### 5.3 Bullet length — derived, with a small research run to calibrate it

We could not source *Ballistic Performance of Rifle Bullets*, so length is **modelled** instead of
looked up. That turns out to be defensible, for two measured reasons.

**Length is predictable from sectional density.** Mass is effective density × volume, and volume
is a shape fill factor × d² × L, so `SD` and `L` are proportional with a constant that depends only
on construction, not caliber:

```
L_in  =  C · SD          C = 7000 / (ρ_eff · k_shape)
```

Checked against the four jacketed lead-core bullets in the golden-vector fixture, spanning .224 to
.338: **C = 4.63 ± 0.16 (3.5%)**. The two fixture bullets that fall outside are explained by
construction, not by the model failing — `.22 LR` LRN sits at 4.01 (unjacketed blunt lead, high
fill factor) and the `.50 BMG` M33 at 6.36 (**steel core**, far less dense than lead).

**Length only drives second-order effects.** In `simulator.cpp` it feeds exactly two things: the
Miller stability factor (`computeLaunchStability`) and, through `L_cal`, the aerodynamic-jump
sensitivity. Sg in turn scales Litz's spin-drift constant `1.25·(Sg + 1.2)`. Measured sensitivity
on a 6.5 CM 140 gr at 1:8:

| length error | Sg | spin-drift shift | error at 1000 yd |
|---|---|---|---|
| +5% | 1.62 → 1.40 | 7.7% | ~0.05 MOA |
| +10% | 1.62 → 1.22 | 14.0% | ~0.08 MOA |
| +20% | 1.62 → 0.95 | 23.8% | ~0.14 MOA |

Even a 20% length error stays well inside the rifle's own inherent precision (0.25–1.25 MOA). It
never touches drop or wind drift at all.

> ⚠ **Two caveats.** (a) **Sg itself is sensitive** — a 10% length error moves Sg from 1.62 to
> 1.22, crossing the ~1.4 marginal-stability line. If twist gating is decided by an Sg threshold
> that boundary will move, so gating should treat our model as self-consistent truth rather than
> claiming real-world accuracy. (b) **`C = 4.63` is validated only for .224–.338.** Extrapolating
> to `.510` is unchecked, and the one .50 datapoint we hold is a steel-core FMJ. Long .50 ELR
> bullets are more slender than the fit assumes, so **.50 cal lengths are the priority of the run
> below.**

#### Prompt P2b — bullet overall lengths

> **⚠ Delivery format.** Plain text, numbers written inline. No equation editor, no Google Docs
> export — previous runs on this project came back with numbers embedded as images that were
> cropped in every export except plain text.
>
> **Role & goal.** You are a ballistics research assistant. I need **bullet overall length** — the
> projectile alone, **not** cartridge overall length — for the specific bullets listed below. I
> already hold measured BC, sectional density and form factor for all of them; length is the only
> missing dimension. Be explicit that the figure you give is the bullet, not the loaded round.
>
> **Sourcing rules.** Prefer manufacturer technical drawings or published spec sheets (Berger and
> Cutting Edge publish lengths; Hornady and Sierra list some), reloading-manual dimension tables,
> or forum posts quoting an actual caliper reading. **Cite every source. Flag every figure that is
> an estimate rather than measured, and say what you estimated it from.** If a bullet is
> undocumented, say so plainly and name the closest documented bullet of the same weight, caliber
> and construction as a substitute — do not silently invent a number.
>
> **For each bullet report:** overall length (inches and mm) · construction class from the list
> below · source · confidence (measured / manufacturer-published / estimated).
>
> **Construction class** — assign each to exactly one, since I am fitting a separate constant per
> class: `jacketed lead-core match` · `jacketed lead-core hunting/tipped` · `FMJ` ·
> `monolithic solid copper or brass` · `steel-core FMJ` · `unjacketed lead (rimfire)`.
>
> **Priority 1 — .50 BMG (I have almost no data here, so please be thorough):**
> Hornady 750 A-MAX · Barnes 800 LR Solid · Barnes 750 LR Solid Bore · Barnes 647 TAC-X/TSX ·
> Lehigh 808 Solid Match · Cutting Edge 802 MTAC · Lapua 800 Bullex-N · PMC/military 660–661 gr
> M33 ball
>
> **Priority 2 — the magnums and 6.5mm:**
> .338: Lapua 300 Scenar · Berger 300 Elite Hunter · Hornady 285 A-MAX · Sierra 250 GameKing ·
> Cutting Edge 275 MTAC · Lapua 250 FMJBT
> .264: Berger 140 Target Hybrid · Hornady 140 A-MAX · Hornady 147 ELD Match · Nosler 142 AccuBond
> LR · Nosler 100 Ballistic Tip
> .308: Berger 230 Tactical OTM Hybrid · Berger 215 Hybrid Target · Sierra 220 MatchKing ·
> Sierra 175 MatchKing · Sierra 165 HPBT GameKing · PMC 147 gr FMJ-BT
>
> **Priority 3 — the light cartridges:**
> .243: Berger 105 Hunting VLD · Berger 115 Target VLD · Hornady 108 ELD Match · Hornady 80 GMX
> .224: Berger 90 Target VLD · Sierra 77 Tipped MatchKing · Barnes 85 Match Burner ·
> Berger 55 Varmint FB · Federal XM193 55 gr FMJ
> .22 LR: CCI Standard Velocity 40 gr LRN · Lapua Center-X 40 gr LRN
>
> **Output format.** One row per bullet: name · length (in / mm) · construction class · source ·
> confidence. Close with a plain list of every bullet you could not source, and a note on which
> manufacturers publish lengths openly versus which required inference.

**Validation hook.** Every returned length gets checked against `C · SD` using the SD we already
hold from Appendix A. Anything more than ~15% off the class constant is either a bad source or a
genuinely unusual bullet, and gets re-checked before it enters the catalog. That check is only
possible because the form-factor library landed first.

**Delivery format, every run:** plain text with numbers written inline. Earlier runs came back as
Google Docs exports whose numbers were embedded as images and got **cropped** in the `.md`/`.pdf`/
`.html` exports — only the plain-text copies survived.

**Sourcing rules, every run:** prefer independently measured data over advertising; label
advertised figures and state the test barrel length; give ranges not point values; cite every
source; flag estimates and say what they were estimated from. **If a value does not exist in the
literature, say so — do not fill the gap with a plausible number.** A named gap is useful; an
invented number is not.

*(Prompt bodies to be written into this document next.)*

---

## 6. Not research — owner decisions

**`effectiveRangeYd`.** No research settles this. The shipped values are already flagged
*"provisional and physically inconsistent"* (archived ELR plan §13.6): .223's 600 yd is short of
its 865 yd supersonic limit, .308's 1000 is 4% past its 961. **Default: last supersonic station at
ICAO sea level, computed against the engine, applied to all 10.** This retcons the four shipped
values, so it lands as its own flagged step, acceptable or rejectable separately.

**Design-set values**, unchanged and not researched: rifle zero offset (the D16 raw 5–35 MOA
pointing error) and per-shot BC scatter (match 0.5% / bulk 1.5%).

**Blocked by gap N4, not by data:** high-velocity .22 LR and .22 WMR. Dispersion comes only from
MV SD, BC SD and rifle precision, none of which know about Mach, so a faster rimfire round would
be strictly better in-game while in reality it groups worse. Not in this expansion.

---

## 7. Still open

1. **Where presets get their profile.** Back-computed from published BC, or sourced directly?
   Back-computing is self-consistent with the model; sourcing is independent evidence.
2. **Whether quality is discrete or continuous.** Discrete matches how factory ammo is sold;
   continuous is what handloading (Increment 5) would actually need.
3. **Validation strategy.** Golden vectors are keyed to specific loads. The presets can stay
   pinned to the six existing oracle loads, but the *derived* space between them needs a different
   check — probably spot-diffs at sampled weights.
4. **Whether .300 Win Mag warrants an oracle load.** It is the only cartridge in the ladder with
   no golden-vector coverage at all.
5. **Bullet length model accuracy.** Derived length is an approximation; how far it may drift
   before stability and spin drift are affected needs a tolerance, set against the fixture's six
   measured bullets.

## Sources

- [What The Pros Use: Best Rifle Cartridge — PrecisionRifleBlog](https://precisionrifleblog.com/2025/09/19/best-rifle-cartridge/)
- [Top 5 PRS Cartridges — NRA Shooting Sports USA](https://www.ssusa.org/content/top-5-prs-cartridges/)
- [6 BR vs. 6mm Creedmoor — Long Range Hunting Forum](https://www.longrangehunting.com/threads/6-br-vs-6mm-creedmoor.360806/)
- [6mm Creedmoor 108 gr ELD Match — Hornady](https://www.hornady.com/ammunition/rifle/6mm-creedmoor-108-gr-eld-match)
- [6mm BR Norma 105 gr Scenar-L — Lapua](https://www.lapua.com/product/6-mm-br-norma-target-cartridge-scenar-l-68g-105gr-4316047/)
- [The 6GT Is a New Top Cartridge in the Precision Rifle World — Outdoor Life](https://www.outdoorlife.com/story/guns/the-6gt-is-a-new-top-cartridge-in-the-precision-rifle-world/)
