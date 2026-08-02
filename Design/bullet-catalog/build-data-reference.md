# Build data reference — everything needed for the rifle and ammo builders

`Status: build-ready, with two flagged gaps` · `Date: 2026-08-01`
`Design context:` [`catalog-expansion-v2.md`](./catalog-expansion-v2.md) ·
`Prompts:` [`research-prompts-v2.md`](./research-prompts-v2.md)

> **What this document is.** The consolidated, validated data behind the two builders:
> **one rifle per cartridge** with adjustable barrel length and twist rate, and an **ammo
> configurator** with sliders, where **Match vs Bulk is essentially an SD selector**.
>
> Every number here has been checked against at least one independent source. Provenance and
> confidence are stated per field. Where a number is assumed rather than measured, it says so.

---

## 1. The model in one page

The player configures **a rifle** (cartridge, barrel length, twist) and **a load** (bullet weight,
bullet profile, Match/Bulk). Everything else is derived:

```
sectional density   SD  = w_gr / (7000 · d_in²)
ballistic coeff.    BC7 = SD / i7                    i7 = form factor (the profile slider)
bullet length       L   = C · SD                     C by construction class
muzzle velocity     MV  = k · w_gr^(−a) · (L_bbl/L_ref)^n     n = (fps_per_in · L_ref)/MV_ref
recoil velocity     V_r = √(2E / m_rifle)            E from bullet mass + MV + charge
```

Match/Bulk sets **per-shot MV SD, lot-to-lot shift, and BC variance** — nothing else. Weight and
profile are free trades (velocity against BC); Match/Bulk is the one axis where better is simply
better, which is where cost or progression should attach.

---

## 2. Per-cartridge build table

### 2.1 Velocity curve — `MV = k · w^(−a)` (grains → fps, at the reference barrel)

| cartridge | `a` | `k` | pts | R² | source | confidence |
|---|---|---|---|---|---|---|
| .22 LR | *0.444* | 5 522 | anchor | — | assumed `a`, 40 gr @ 1073 fps anchor | ⚠ low |
| .223 Remington | 0.309 | 11 414 | 5 | 0.946 | Hornady 10th, PDF 172–179 | ✅ high |
| 6mm Creedmoor | 0.406 | 19 892 | 7 | 0.993 | R1 | ◐ medium |
| 6.5 Creedmoor | 0.426 | 22 611 | 5 | 0.946 | Hornady 10th, PDF 329–333 | ✅ high |
| 6.5 PRC | 0.333 | 15 314 | 4 | 0.923 | R1, 1 row rejected | ⚠ weakest fit |
| .308 Winchester | 0.525 | 38 537 | 6 | 0.976 | Hornady 10th, PDF 486–492 | ✅ high |
| .300 Win Mag | 0.444 | 31 900 | 11 | 0.983 | Hornady 10th, PDF 598–606 | ✅ high |
| .300 PRC | 0.464 | 34 864 | 5 | 0.983 | R1, 1 row rejected | ◐ medium |
| .338 Lapua Mag | 0.511 | 49 391 | 5 | 0.989 | Hornady 10th, PDF 680–682 | ✅ high |
| .50 BMG | *0.444* | 52 972 | anchor | — | assumed `a`, 750 gr @ 2800 fps anchor | ◐ medium |

All eight fitted cartridges land in one band: **`a` = 0.309–0.525, mean 0.427 ± 0.072.**
**Fallback rule:** fixing `a` at 0.444 and anchoring `k` to one known (weight, velocity) point
reproduces every fitted cartridge to within **4.4% worst case, typically 1–4%** — inside the MV
scatter the hidden-truth model already applies. That is how .22 LR and .50 BMG are handled.

### 2.2 Slider ranges and geometry

| cartridge | d (in) | capacity (gr H₂O) | weight range (gr) | i7 range (profile slider) |
|---|---|---|---|---|
| .22 LR | 0.2255 | 10.5 | 30–60 | **n/a — G1 model, see §6** |
| .223 Remington | 0.224 | 28.5 | 40–90 | 0.987–1.437 |
| 6mm Creedmoor | 0.243 | 52.5 | 58–117 | 0.950–1.323 |
| 6.5 Creedmoor | 0.264 | 52.5 | 95–160 | 0.905–1.212 |
| 6.5 PRC | 0.264 | 67.6 | 100–160 | 0.905–1.212 |
| .308 Winchester | 0.308 | 56.0 | 110–240 | 0.959–1.226 |
| .300 Win Mag | 0.308 | 93.8 | 110–240 | 0.959–1.226 |
| .300 PRC | 0.308 | 97.0 | 165–250 | 0.959–1.226 |
| .338 Lapua Mag | 0.338 | 114.2 | 180–325 | 0.844–1.170 |
| .50 BMG | 0.510 | 646–808 → see note | 646–808 | 0.811–1.181 |

Weight and i7 ranges are the **5th–95th percentile of what actually exists**, measured across the
471-bullet Litz Appendix A library (`litz-appendix-a-bullets.json`). Capacity for .50 BMG is
290.0 gr H₂O. Clamping the sliders to these ranges is what stops the player building a bullet no
manufacturer makes.

> **Note:** cartridges sharing a bore share an i7 range, because form factor is a property of the
> **bullet**, not the case. The weight ranges differ because the case and magazine do constrain
> what is practical.

### 2.3 Rifle platform

| cartridge | twist | barrel (in) | fps/inch | barrel life | rifle-to-rifle MV (fps) |
|---|---|---|---|---|---|
| .22 LR | 1:16 | 20 ± 2 | **−5.0** | 15 000 | 30 |
| .223 Remington | 1:7.5 | 24 ± 2 | 25.3 | 5 000 | 35 |
| 6mm Creedmoor | 1:7.5–1:8 | 24–26 | 25–30 | 1 800–2 500 | 15–25 |
| 6.5 Creedmoor | 1:8 | 26 ± 1 | 18.1 | 2 800 | 25 |
| 6.5 PRC | 1:7.5–1:8 | 24–26 | 20–25 | 1 200–1 800 | 20–30 |
| .308 Winchester | 1:10 | 22 ± 2 | 22.7 | 6 500 | 30 |
| .300 Win Mag | 1:10 | 25 ± 1 | 39.6 | 1 500 | 40 |
| .300 PRC | 1:8–1:8.5 | 26–28 | 25–30 | 1 000–1 500 | 20–35 |
| .338 Lapua Mag | 1:9.3 | 28 ± 2 | 28.3 | 1 800 | 40 |
| .50 BMG | 1:15 | 32 ± 3 | 25.0 | 4 000 | 50 |

**.22 LR's fps/inch is negative and that is correct.** Rimfire velocity peaks near 16″ and falls
in longer barrels — the powder is fully burned early and bore friction dominates. Counterintuitive,
real, and worth teaching.

**Twist gating** — the weight each twist stabilises, for the three new cartridges (R1):
6mm CM 1:8 → 90–105 gr, 1:7.5 → 108–115 gr · 6.5 PRC 1:8 → 120–147 gr, 1:7.5 → 150–156 gr ·
.300 PRC 1:8.5 → 208–225 gr, 1:8 → 225–250 gr. For the other seven, `twistGating` strings already
exist in `catalog-seed.json`.

**Barrel-length model.** Prefer the power law `V = V_ref · (L/L_ref)^n`, `n = (fps_per_in · L_ref)/V_ref`
over a flat fps/inch: it gives diminishing returns for free and handles the rimfire inversion in the
same expression. Across 16–28″ the two forms agree within ~30 fps for most cartridges, so this is
correctness at the edges rather than a visible change. **The slopes themselves carry 7–30%
uncertainty** and come from secondary research — see §5 for why that is acceptable.

### 2.4 Inherent precision by tier (MOA, group size)

| cartridge | hunting | factory match | custom |
|---|---|---|---|
| .22 LR | 1.25 | 0.65 | 0.25 |
| .223 | 1.25 | 0.65 | 0.30 |
| 6mm Creedmoor | 0.90–1.30 | 0.50–0.75 | 0.25–0.40 |
| 6.5 Creedmoor | 1.00 | 0.50 | 0.25 |
| 6.5 PRC | 0.85–1.25 | 0.45–0.70 | 0.20–0.35 |
| .308 | 1.25 | 0.65 | 0.35 |
| .300 Win Mag | 1.25 | 0.65 | 0.40 |
| .300 PRC | 0.90–1.40 | 0.50–0.75 | 0.25–0.40 |
| .338 Lapua | 1.25 | 0.70 | 0.35 |
| .50 BMG | 1.50 | 0.90 | 0.50 |

These are **near-constant across cartridges** — hunting is 1.25 for six of seven in the original
set. They are a design convention with small nudges, not a research finding, and should be treated
as such. If the rifle is one-per-cartridge, this becomes a **build-quality axis** rather than a
catalog dimension, and it needs a price (barrel life or progression) or it is a free upgrade with
no downside — the flaw that made the old three-tier catalog a dead mechanic.

---

## 3. Global constants

### 3.1 Bullet length — `L = C · SD`

| construction class | C | evidence |
|---|---|---|
| jacketed lead-core, .224–.338 | **4.63 ± 0.16** | 4 fixture bullets + 28 from R2 |
| monolithic solid copper/brass | ~5.4–5.9 | R2 (.338 Cutting Edge 5.44, .243 GMX 5.92) |
| .50 BMG, all classes | **5.99 ± 0.34** | R2, 7 bullets |
| unjacketed lead (rimfire) | ~4.0–4.3 | fixture 4.01, R2 4.26–4.30 |

Per-caliber means from R2, as a cross-check: .224 4.53 · .264 4.90 · .308 4.78 · .338 4.79 ·
.243 5.11 · .510 5.99.

**Precision needed here is low.** Length feeds only the Miller stability factor and the
aerodynamic-jump term. A 10% length error moves the impact ~0.08 MOA at 1000 yd, well under the
rifle's own 0.25–1.25 MOA. It does *not* touch drop or wind drift.
⚠ But **Sg itself is sensitive** — a 10% length error moves it from 1.62 to 1.22, crossing the
~1.4 marginal-stability line. If twist gating keys off an Sg threshold, treat the model as
self-consistent truth rather than a claim about reality.

### 3.2 Match vs Bulk — the SD selector

Per the design decision, Match/Bulk controls scatter and nothing else.

| | per-shot MV SD | lot-to-lot MV shift | lot BC variance | per-shot BC variance |
|---|---|---|---|---|
| **Match** | **11.0** (6.0–14.5) | 18–25 | 1.2–2.2% | 0.8% |
| **Bulk** | **18.0** (14.0–22.0) | 42–48 | 3.5–4.1% | 2.5% |

Independently corroborated: R3's deep-research figures (11.0 / 18.0 fps) reproduce the seed's
observed means across seven cartridges (10.6 / 18.6 fps) almost exactly. **This was the strongest
validation of the three runs.**

> **Naming note.** Our "Bulk" is really **mid-tier factory** — PMC Bronze, S&B SPCE, XM193 are
> mid-market products, not surplus. R3 identifies a genuine third tier below it (cheap bulk/FMJ,
> **25.0 fps SD**, 6.5% lot BC variance) that we do not currently model. Room for a future grade.

Lot-to-lot shift scales with case capacity (roughly 15 fps at .22 LR → 75 fps at .50 BMG); per-shot
SD is much flatter across cartridges. Scale the lot shift, keep the per-shot SD near-constant.

**Sampling note for the in-game chronograph:** ES/SD ≈ 3.08 at N=10, 3.82 at N=30, 4.08 at N=50.
Strings of N ≤ 5 systematically understate SD — a real and teachable trap.

### 3.3 Recoil

`E` from bullet mass and muzzle velocity plus charge mass (derivable from case capacity, §2.2);
scale the visual kick by **recoil velocity** `V_r = √(2E/m_rifle)`, not energy. Energy spans
2000:1 across the ladder, velocity only ~30:1 — a usable range for a visual effect. Reference
values and the self-spotting thresholds are in `feature-catalog.md` §B.

⚠ **Recoil must not move the point of impact** — the bullet exits in ~1–1.5 ms. It affects the
visual kick, how close the rifle settles back to the original aim, and whether the player can
watch their own impact. `ScopeView` already samples aim before the recoil kick; keep that.

---

## 4. Corrections found while validating

| item | was | is | how it was caught |
|---|---|---|---|
| **.50 BMG match BC** | G7 0.581 | **G7 0.508** | form-factor screen flagged an impossible i7 of 0.709; Litz Appendix A confirmed |
| **.300 WM velocity exponent** | a = 0.229 | **a = 0.444** | 2-point seed fit vs 11-band Hornady ladder |
| **`sources.md` spot-check** | ".50 750-A-MAX 0.581 is legitimate" | wrong | as above |
| **4 shipped bulk loads** | share the match bullet's length | derived per-load now | audit of `catalog.data.json` |
| **6.5 CM match BC 0.310** | flagged as suspect | **confirmed correct** | Hornady lists 140 ELD-M at G7 0.312 |

Two of these were caught by cross-checks rather than by reading a source, which is an argument for
keeping the form-factor plausibility screen (`0.85 ≤ i7 ≤ 1.35`, floor 0.811 observed) as a
standing validation on any BC that enters the catalog.

---

## 5. Where precision matters, and where it does not

**DOPE is a per-distance table, so it absorbs any systematic error regardless of shape.** That
single fact should drive all future data priorities.

| quantity | fate | precision needed |
|---|---|---|
| rifle MV offset | drawn once per rifle, fixed | **low** — zeroing + DOPE cancels it |
| lot mean MV shift | drawn once per lot, fixed | **low** — re-truing cancels it |
| barrel-length effect | deterministic property of the rifle | **low** — same, cancelled |
| **per-shot MV SD** | redrawn every shot | **high** — irreducible, never cancelled |
| **BC / retained velocity** | sets the transonic wall | **high** — a hard boundary DOPE cannot move |
| **inherent precision** | dispersion | **high** — irreducible |

This is why the barrel-length slopes are fine at 7–30% uncertainty: the quantity is cancelled by
the core loop. It is also why the .50 BMG BC error mattered — it was distorting where that
cartridge goes transonic, which nothing cancels.

Data precision still pays off in three places: **the journey of discovering the truth**,
**extrapolation beyond confirmed nodes**, and **conditions that change between truing and
shooting**.

---

## 6. Open items

1. **.22 LR needs a different model — decision pending.** It is G1, not G7, so the
   SD/form-factor/G7-BC apparatus does not apply. It is absent from Appendix A (a centrefire
   library). Both catalog loads are 40 gr at ~1070 fps, so there is no weight axis to slide.
   No reloading data exists anywhere, because rimfire is not handloaded. **Recommendation:
   presets-only, no configurator** — which is also how rimfire actually works.
2. **6.5 PRC is the weakest velocity fit** (R² 0.923, 4 surviving points, `a` = 0.333 is the low
   outlier). Usable; first candidate for re-sourcing.
3. **.300 PRC's 180 gr @ 3180 fps row was rejected** as optimistic. Re-source before using any
   load lighter than 200 gr in that cartridge.
4. **`effectiveRangeYd`** remains an owner decision — see `catalog-expansion-v2.md` §6.
5. **6mm Creedmoor barrel-life gap** — until barrel life is modelled it is strictly better than
   6.5 Creedmoor. Registered alongside gap N4.
6. **Third ammo tier** (cheap bulk, 25 fps SD) exists in the data but is not modelled.
7. **Presets** — named factory loads that snap the sliders — are assemblable from Appendix A,
   the Hornady handbook and the seed, but have not been compiled into a list yet.

## Sources

- Litz, *Applied Ballistics for Long-Range Shooting*, 3rd ed. — **Appendix A**, 471 bullets
  extracted → [`litz-appendix-a-bullets.json`](./litz-appendix-a-bullets.json)
- *Hornady Handbook of Cartridge Reloading*, 10th ed. (©2016) — velocity ladders, 6 cartridges
- `R1-CartridgeVelocity.txt` · `R2-BulletLength.txt` · `R3-AmmoConsistency.txt` (secondary,
  validated — see `Documentation/sources.md` entries 9–11)
- [`catalog-seed.json`](./catalog-seed.json) — earlier runs A/B, 7 cartridges
