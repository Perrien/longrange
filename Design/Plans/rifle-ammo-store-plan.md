# Rifle & Ammo Store — parametric builders

`Status: decisions locked, ready to build` · `Date: 2026-08-01` · `Plan slug: rifle-ammo-store`
`Data authority:` [`../bullet-catalog/build-data-reference.md`](../bullet-catalog/build-data-reference.md)
`Design context:` [`../bullet-catalog/catalog-expansion-v2.md`](../bullet-catalog/catalog-expansion-v2.md)
`Working rules:` [`../execution/execution-protocol.md`](../execution/execution-protocol.md)

> **What this plan does.** Replaces the enumerated gear catalog (4 cartridges × 3 rifle
> tiers × 2 ammo grades = 12 rifles + 8 loads, every value hand-authored per entry) with
> **two parametric builders** over 10 cartridges: a **rifle** configured by barrel length
> and twist, and an **ammo load** configured by bullet weight, profile and grade. Muzzle
> velocity, ballistic coefficient, bullet length, recoil and effective range become
> *derived* instead of looked up. Named factory loads survive as **presets** that snap the
> sliders.
>
> **Read §1 in full before writing code.** Every decision is locked — you should not need
> to invent one. If you find a case §1 does not cover, that is a stop rule
> (protocol §6), not an invitation to improvise.

---

## 0. Why this is worth doing (context, not instructions)

With two fixed loads per cartridge the player sees two points on a curve they can never
perceive. With a configurator they see the curve: heavier bullets leave slower and carry
better, and the whole trade becomes legible. Three side effects matter as much as the
teaching:

1. **It repairs a live defect.** Both grades of every shipped cartridge currently share
   one bullet length, because geometry came from the golden-vector fixture, which holds
   only the match load. A 55 gr XM193 is not 0.98″ like a 77 gr TMK. Four live loads are
   solving on wrong geometry today. Under a derived model this cannot happen.
2. **It revives a dead deception channel.** `catalog.ts` correctly refuses to feed a G1
   number into a G7 solve, so `believedBc` falls back to `trueBc` almost everywhere —
   only 2 of 8 shipped loads carry any believed-vs-true BC gap. Parametrically this
   becomes one clean knob (D10).
3. **It makes twist rate a decision.** With two fixed loads there is nothing to gate,
   which is why `twistGating` was left as decoration. A continuous weight slider is what
   gives it meaning.

---

## 1. Decisions — all locked, do not re-open

| # | Decision |
|---|---|
| **D1** | **All 10 cartridges ship.** Nine centrefire are configurable; **.22 LR is presets-only** (it is G1, absent from Litz Appendix A, has no weight axis, and is never handloaded — the presets *are* the data). |
| **D2** | **Rifle tiers are deleted.** `RifleTier` (`hunting`/`factoryMatch`/`custom`), `TIER_LABEL` and the three-way `inherentPrecisionMoa` object are removed. One rifle per cartridge with a single precision value — the **factory-match band** from build-data-reference §2.4. This kills the "custom is free and strictly better" dead mechanic. |
| **D3** | **Rifle axes:** barrel length (1″ steps within a per-cartridge band) and twist (a discrete per-cartridge list). Nothing else. |
| **D4** | **Ammo axes:** bullet weight (1 gr steps, clamped to the Litz 5th–95th percentile band), profile `i7` (continuous within the caliber band), grade (`match` \| `bulk`). |
| **D5** | **Grade stays two-tier.** R3's third tier (cheap bulk, 25 fps SD, 6.5% lot BC variance) exists in the data but is **not modelled** — logged as a gap, not built. |
| **D6** | **Fitted `a`, anchored `k`.** Take each cartridge's velocity exponent `a` from build-data-reference §2.1, but **re-solve `k` so the curve passes exactly through that cartridge's anchor load** rather than using the published fitted `k`. Rationale in §2.2 — this preserves every shipped box MV *bit-exact* and keeps the golden vectors meaningful. |
| **D7** | **Barrel length = power law**, `V = V_ref · (L/L_ref)^n` with `n = fps_per_in · L_ref / MV_ref` — not a flat fps/inch. Gives diminishing returns for free and handles the rimfire inversion in the same expression. |
| **D8** | **BC = SD / i7, G7**, for all nine centrefire cartridges. **.22 LR stays G1** with per-preset authored BCs — the SD/form-factor/G7 apparatus does not apply to it. |
| **D9** | **Bullet length `L = C · SD`** by construction class (§3.4). **Exception:** a preset pinned to a golden-vector oracle load keeps its **measured** length as an authored override, so the oracle diff stays exact. |
| **D10** | **Believed vs true is one knob: the advertised numbers are optimistic.** `believedBc = trueBc × (1 + bcOptimism[grade])` and `believedMv = trueBaseMv × (1 + mvOptimism[grade])`. Replaces today's hand-authored per-load believed/true pairs. Constants in §3.3, **design-set and tunable**. |
| **D11** | **Lot-to-lot MV shift scales with case capacity**, `lotShiftFps = gradeBase × √(capacity / capacity_ref)`; per-shot MV SD stays near-constant by grade. Constants chosen to reproduce today's 6.5 CM values exactly (§3.3). |
| **D12** | **Charge mass = 0.80 × case capacity (gr H₂O)**, except rimfire, which is authored explicitly (.22 LR = 0.9 gr — its 10.5 gr case volume is not usable charge). |
| **D13** | **Recoil is computed:** `V_r = (m_bullet · v + m_charge · 1.5v) / m_rifle`. `ScopeView`'s pitch constant scales **linearly in `V_r`**, calibrated so 6.5 CM / 140 gr stays at today's ~3.0 mrad. ⚠ **Recoil must not move the point of impact** — `ScopeView` samples aim *before* the kick and that must stay. |
| **D14** | **Twist gating is surfaced, not enforced.** Compute Miller `Sg` from the derived length, show it on the build screen with a marginal band (< 1.4), and **do not block the build and do not fake dispersion.** Consistent with the owner's standing transonic policy: no gating, honesty burden on the readout. Real marginal-stability dispersion would need a new engine path — out of scope. |
| **D15** | **Effective range is derived per configured load** — the last supersonic station at ICAO sea level, solved against the engine and cached per (spec, atmosphere). `effectiveRangeYd` leaves the data file entirely. |
| **D16** | **Save schema v3.** `RifleInstance.spec` / `AmmoLot.spec` replace `catalogId`. The v2→v3 migration **clears** `rifles`, `ammoLots`, `dopeNodes`, `chronoSummaries` and the active selection; `settings` survive. Owner's explicit choice, confirmed 2026-08-01: **no in-app notice, no warning, no confirmation** — the owner is the only user and has authorised the wipe. Migrate silently. |
| **D17** | **Store UX: cartridge list → build screen → Acquire.** Sliders with live derived readouts (MV, BC, SD, bullet length, `Sg`, recoil, supersonic reach). Preset chips snap the sliders. |
| **D18** | **Presets = what we already hold** — the 8 shipped catalog loads plus any oracle-only load. No new research run blocks this plan. |
| **D19** | **Transition safety:** the new spec API lands **alongside** the old id API (S3); call sites migrate in two batches (S5 solve path, S6 UI); the old API and `catalog.data.json` are deleted last (S7). The app compiles and runs at every task boundary. |
| **D20** | **The `i7` band is per-caliber and constant with weight** — a deliberate simplification. In reality a 40 gr .224 cannot be as sleek as a 90 gr one. Logged as a deferred observation, not built. |

### 1b. Two conflicts you must know about (do not resolve silently)

**Per-shot BC scatter.** `build-data-reference.md` §3.2 gives **match 0.8% / bulk 2.5%**
(sourced from research run R3). `catalog-expansion-v2.md` §6 lists the same quantity under
*"design-set values, unchanged and not researched"* at **match 0.5% / bulk 1.5%**, which is
what `catalog.data.json` ships today. These disagree.

**Resolution for this plan:** use **0.8% / 2.5%**, on the grounds that build-data-reference
is the newer document and cites actual research where the other explicitly says "not
researched." Author it as a single named constant so reverting is a one-line change, and
**call it out at the S7 owner stop** for sign-off. This is flagged, not hidden.

**.223 anchor barrel length.** Our catalog records Black Hills 77 gr TMK at 2750 fps
against a **24″** reference barrel; that advertised figure is generally a **20″** number.
Anchoring `k` (D6) preserves current in-game behaviour either way, so this does not block —
but note it in `Wiki/_gaps.md` at S11 rather than quietly "fixing" the barrel length.

---

## 2. The model

### 2.1 Derivation chain

```
sectional density   SD  = w_gr / (7000 · d_in²)
ballistic coeff.    BC7 = SD / i7                              i7 = the profile slider
bullet length       L   = C · SD                               C by construction class
muzzle velocity     MV  = k · w_gr^(−a) · (L_bbl / L_ref)^n    n = fps_per_in · L_ref / MV_ref
charge mass         m_c = 0.80 · capacity_gr                   (rimfire: authored)
recoil velocity     V_r = (m_b·v + m_c·1.5v) / m_rifle
Miller stability    Sg   (from L, twist, d, w, v)              display only (D14)
```

Grade (`match` | `bulk`) touches **nothing above**. It sets four scatter statistics and
the two optimism constants — that is all. Weight and profile are free trades (velocity
against BC); grade is the one axis where better is simply better, which is where cost or
progression should eventually attach.

### 2.2 Why `k` is anchored rather than fitted (D6)

The published fitted `k` values do **not** reproduce our shipped box velocities. Worked
through, at the reference barrel:

| cartridge | published `k` predicts | our shipped box MV | error |
|---|---|---|---|
| .223 @ 77 gr | 2981 fps | 2750 fps | **+8.4%** |
| 6.5 CM @ 140 gr | 2755 fps | 2710 fps | +1.7% |

An 8% MV shift on a live load would move every come-up in the DOPE book and break the
golden-vector anchor. Since the fits are log-log regressions against *reloading-manual
ceilings* and our box values are *advertised factory* numbers, the two are measuring
different things — the **shape** (`a`) transfers, the **intercept** (`k`) does not.

So: keep `a`, and set `k = MV_anchor · w_anchor^a`. Verified reproduction with anchored
`k` (this is the S1/S2 acceptance table — reproduce it exactly):

| load | w | box MV | derived | diff | SD | implied `i7` | in caliber band? |
|---|---|---|---|---|---|---|---|
| .223 match | 77 | 2750 | **2750** | **0.0%** | 0.2192 | 1.059 | ✅ 0.987–1.437 |
| .223 bulk | 55 | 3250 | 3051 | −6.1% ⚠ | 0.1566 | 1.305 | ✅ |
| 6.5 CM match | 140 | 2710 | **2710** | **0.0%** | 0.2870 | 0.926 | ✅ 0.905–1.212 |
| 6.5 CM bulk | 140 | 2657 | 2710 | +2.0% | 0.2870 | 1.196 | ✅ |
| .308 match | 175 | 2600 | **2600** | **0.0%** | 0.2635 | 1.085 | ✅ 0.959–1.226 |
| .308 bulk | 147 | 2780 | 2849 | +2.5% | 0.2214 | 1.135 | ✅ |

**Every shipped centrefire load's implied form factor lands inside its measured Litz
band** — independent evidence the model is sound.

⚠ **.223 bulk at −6.1% is the one outlier and it is expected.** `a = 0.309` is the lowest
exponent in the ladder, fitted with the 35 gr and 40 gr bands excluded (they are censored
at 3800 fps — the last column the table prints, not the cartridge's ceiling), so the curve
under-predicts the light end. Handle it the way D9 handles length: the .223 bulk **preset
carries an authored MV override**. The derived curve still governs everything the player
builds between presets.

Reproduction of the 6.5 CM factory lineup, against catalog-expansion-v2 §2.3 (a
cross-check, not an anchor — the 140 gr row is exact by construction):

| weight | derived MV | doc's table | real |
|---|---|---|---|
| 95 gr | 3197 | 3229 | ~3300 |
| 120 gr | 2894 | 2906 | ~2910 |
| 140 gr | **2710** | 2712 | **2712** |
| 147 gr | 2654 | 2653 | ~2695 |
| 156 gr | 2588 | 2583 | ~2600 |

### 2.3 Where precision matters (and where it does not)

**DOPE is a per-distance table, so it absorbs any systematic error regardless of shape.**
That single fact should drive how hard you chase a number:

| quantity | precision needed | why |
|---|---|---|
| rifle MV offset, lot mean shift, barrel-length effect | **low** | drawn once and fixed — zeroing and DOPE cancel them |
| **per-shot MV SD** | **high** | redrawn every shot, irreducible, never cancelled |
| **BC / retained velocity** | **high** | sets the transonic wall — a hard boundary DOPE cannot move |
| **inherent precision** | **high** | dispersion, irreducible |

This is why the barrel-length slopes are acceptable at 7–30% uncertainty, and why the
.50 BMG BC error mattered (it distorted where that cartridge goes transonic, which nothing
cancels).

---

## 3. Data to author

All of this goes in **one new file**, `GameBuild/app/src/game/cartridges.data.json`. Values
below are build-ready — do not re-derive them. Provenance is
`build-data-reference.md` §2–3 unless noted; anchored `k` is computed per D6.

### 3.1 Per-cartridge

| id | name | class | d (in) | cap (gr H₂O) | `a` | anchored `k` | anchor |
|---|---|---|---|---|---|---|---|
| `22lr` | .22 LR | Rimfire precision | 0.2255 | 10.5 | 0.444 | 5 520 | 40 gr @ 1073 fps |
| `223` | .223 Rem / 5.56 | Light match | 0.224 | 28.5 | 0.309 | 10 526 | 77 gr @ 2750 fps |
| `6cm` | 6mm Creedmoor | Low-recoil competition | 0.243 | 52.5 | 0.406 | 19 809 | 108 gr @ 2960 fps |
| `65cm` | 6.5 Creedmoor | Medium match | 0.264 | 52.5 | 0.426 | 22 244 | 140 gr @ 2710 fps |
| `65prc` | 6.5 PRC | Magnum 6.5 | 0.264 | 67.6 | 0.333 | 15 332 | 147 gr @ 2910 fps |
| `308` | .308 Winchester | Standard precision | 0.308 | 56.0 | 0.525 | 39 135 | 175 gr @ 2600 fps |
| `300wm` | .300 Win Mag | Heavy long-range | 0.308 | 93.8 | 0.444 | 30 609 | 215 gr @ 2820 fps |
| `300prc` | .300 PRC | Modern heavy | 0.308 | 97.0 | 0.464 | 34 683 | 225 gr @ 2810 fps |
| `338lm` | .338 Lapua Mag | Extreme long-range | 0.338 | 114.2 | 0.511 | 50 162 | 300 gr @ 2720 fps |
| `50bmg` | .50 BMG | Anti-materiel / ELR | 0.510 | 290.0 | 0.444 | 52 928 | 750 gr @ 2800 fps |

⚠ **`a` confidence varies.** ✅ high: .223, 6.5 CM, .308, .300 WM, .338 LM. ◐ medium:
6mm CM, .300 PRC, .50 BMG. ⚠ **weakest: 6.5 PRC** (R² 0.923, 4 surviving points,
`a = 0.333` is the low outlier) — first candidate for re-sourcing, ship it anyway.
.22 LR and .50 BMG use the assumed `a = 0.444` fallback, which reproduces every *fitted*
cartridge to within 4.4% worst case.

### 3.2 Sliders, platform and precision

| id | weight range (gr) | `i7` range | barrel band (in) | ref barrel | fps/in | `n` | twist options | barrel life | barrel-to-barrel MV SD (fps) | precision MOA (nom/sd) |
|---|---|---|---|---|---|---|---|---|---|---|
| `22lr` | *presets only* | *n/a — G1* | 16–22 | 20 | **−5.0** | **−0.093** | 1:16, 1:12 | 15 000 | 30 | 0.65 / 0.15 |
| `223` | 40–90 | 0.987–1.437 | 18–26 | 24 | 25.3 | 0.221 | 1:9, 1:8, 1:7.5, 1:7 | 5 000 | 35 | 0.65 / 0.10 |
| `6cm` | 58–117 | 0.950–1.323 | 19–27 | 25 | 27.5 | 0.232 | 1:8, 1:7.5, 1:7 | 2 200 | 20 | 0.60 / 0.08 |
| `65cm` | 95–160 | 0.905–1.212 | 20–28 | 26 | 18.1 | 0.174 | 1:8.5, 1:8, 1:7.5 | 2 800 | 25 | 0.50 / 0.10 |
| `65prc` | 100–160 | 0.905–1.212 | 19–27 | 25 | 22.5 | 0.193 | 1:8.5, 1:8, 1:7.5 | 1 500 | 25 | 0.55 / 0.08 |
| `308` | 110–240 | 0.959–1.226 | 16–24 | 22 | 22.7 | 0.192 | 1:12, 1:10, 1:9 | 6 500 | 30 | 0.65 / 0.10 |
| `300wm` | 110–240 | 0.959–1.226 | 19–27 | 25 | 39.6 | 0.351 | 1:11, 1:10, 1:9 | 1 500 | 40 | 0.65 / 0.10 |
| `300prc` | 165–250 | 0.959–1.226 | 21–29 | 27 | 27.5 | 0.264 | 1:9, 1:8.5, 1:8 | 1 250 | 28 | 0.60 / 0.08 |
| `338lm` | 180–325 | 0.844–1.170 | 22–30 | 28 | 28.3 | 0.291 | 1:10, 1:9.3, 1:9 | 1 800 | 40 | 0.70 / 0.10 |
| `50bmg` | 646–808 | 0.811–1.181 | 26–34 | 32 | 25.0 | 0.286 | 1:15, 1:14 | 4 000 | 50 | 0.90 / 0.12 |

- **Weight and `i7` ranges are the 5th–95th percentile of what actually exists**, measured
  across the 471-bullet Litz Appendix A library. Clamping to these is what stops the
  player building a bullet no manufacturer makes.
- **Cartridges sharing a bore share an `i7` range** — form factor is a property of the
  bullet, not the case. Weight ranges differ because case and magazine do constrain what
  is practical.
- **.22 LR's fps/inch is negative and that is correct.** Rimfire velocity peaks near 16″
  and falls in longer barrels — the powder is fully burned early and bore friction
  dominates. Counterintuitive, real, and worth teaching. Do not "fix" it.
- **Barrel bands and twist option lists are design-set** (nominal −6/+2, clamped 16–34;
  three options centred on the researched value), not research findings. Tune freely on
  owner feedback.
- **Precision is the factory-match column** per D2. Authoring constraint from
  `hidden-truth.ts`: **`nominal ≥ 3·sd`** for every non-negative field, so the −3 SD clamp
  cannot go negative. Every row above satisfies it — check any value you change.

### 3.3 Global constants (grade + optimism)

| constant | match | bulk | note |
|---|---|---|---|
| per-shot MV SD — nominal | 11.0 fps (3.3528 m/s) | 18.0 fps (5.4864 m/s) | R3's figures reproduce the seed's observed means across seven cartridges (10.6 / 18.6) almost exactly — **the strongest validation of the three research runs** |
| per-shot MV SD — sd | 0.432 m/s | 0.406 m/s | ±3 SD spans the observed 6.0–14.5 / 14.0–22.0 fps bands |
| lot-shift base (at `65cm`, cap 52.5) | 25 fps (7.62 m/s) | 45 fps (13.716 m/s) | scaled by `√(cap/52.5)` per D11 — **reproduces today's 6.5 CM values exactly** |
| lot BC variance | 1.5% | 4.0% | |
| per-shot BC scatter | **0.008** | **0.025** | ⚠ **conflicted — see §1b.** Today's file ships 0.005 / 0.015 |
| MV optimism (D10) | 1.0% | 1.8% | design-set; today's per-load gaps run 0–2.6% |
| BC optimism (D10) | 4% | 8% | design-set; Litz cross-checks found .223 match 2.5% high, .300 WM ~4%, .50 BMG 14% |

**Sampling note worth a tooltip:** ES/SD ≈ 3.08 at N=10, 3.82 at N=30, 4.08 at N=50.
Strings of N ≤ 5 systematically understate SD — a real and teachable trap the in-game
chronograph already exposes.

### 3.4 Bullet-length constants `C` (D9)

| construction class | `C` | applies to |
|---|---|---|
| jacketed lead-core | **4.63 ± 0.16** | all centrefire .224–.338 |
| .50 BMG, all classes | **5.99 ± 0.34** | `50bmg` |
| unjacketed lead (rimfire) | **4.15** | `22lr` |

There is **no construction-class axis in the sliders** — class is implied by cartridge.
(Monolithic copper `C ≈ 5.4–5.9` and steel-core FMJ `C ≈ 6.36` exist in the research and
are logged for a future fourth axis, not built.)

⚠ **Precision needed here is low, but `Sg` is sensitive.** A 10% length error moves impact
~0.08 MOA at 1000 yd — well under the rifle's own 0.25–1.25 MOA, and it never touches drop
or wind drift. But the same 10% moves `Sg` from 1.62 to 1.22, across the ~1.4
marginal-stability line. Since D14 only *displays* `Sg`, treat the model as
self-consistent truth rather than a claim about reality, and say so in the UI copy.

### 3.5 Recoil verification table (D13)

With charge = 0.80 × capacity (rimfire authored) and gas velocity = 1.5 × muzzle velocity,
the model reproduces `feature-catalog.md` §B's hand-built table:

| cartridge | charge (gr) | computed `V_r` | catalog `V_r` | rel. kick |
|---|---|---|---|---|
| .22 LR | 0.9 (authored) | 0.14 | 0.15 | 0.13× |
| .223 | 22.8 | 0.89 | 0.89 | 0.78× |
| 6.5 CM | 42.0 | **1.14** | 1.10 | **1.00× (calibration point)** |
| .308 | 44.8 | 1.71 | 1.80 | 1.50× |
| .300 WM | 75.0 | 2.23 | 2.16 | 1.96× |
| .338 LM | 91.4 | 2.35 | 2.47 | 2.06× |
| .50 BMG | 232.0 | 4.18 | 4.36 | 3.67× |

Every row within ~8%, and the .50 BMG charge of 232 gr matches published loads. Rifle
weights come from the existing catalog (`weightLb`), which stops being Store-display-only
and starts doing work.

---

## 4. Tasks

Eleven tasks. Each says what to build, what "done" means, when to stop, and whether the
owner is pulled in. **Four owner-verification stops** (S7, S8, S9, S10) plus completion.

> **Standing rules for every task** (protocol §5): run `npx vitest run` → `npx tsc --noEmit`
> → `npm run build` from `GameBuild/app/`, all green, before marking anything done. No
> engine source is touched by this plan, so record `ctest` and
> `node GameBuild/validation/run.mjs` as **N/A** in `PROGRESS.md` — never skip them
> silently. **You do not run git commands**; at a commit point, hand the owner the message.

---

### S1 — Author the cartridge parameter data
`continue` · commit: **yes**

**Goal.** One data file holding everything in §3. No behaviour change — nothing reads it yet.

**Files:** `src/game/cartridges.data.json` (new), `src/game/cartridges.data.test.ts` (new).

**Steps**

1. Author the 10 cartridge entries from §3.1 + §3.2. Keep the existing file's conventions:
   a `_readme` / `_provenance` / `_units` header block, SI for anything the engine
   consumes, imperial retained where it is authored (weights in grains, barrel in inches,
   `i7` dimensionless).
2. Author the global blocks: `grades` (§3.3), `lengthClasses` (§3.4), `recoil`
   (`chargeFraction: 0.80`, `gasVelocityFactor: 1.5`, per-cartridge `chargeGrOverride`
   for `22lr`).
3. Author the `presets` block (D18): the 8 shipped loads converted to specs. For each,
   record `{ id, cartridgeId, name, weightGr, i7, grade }` plus optional
   `lengthMOverride` (oracle loads, D9) and `mvFpsOverride` (.223 bulk, §2.2). Take `i7`
   from §2.2's *implied `i7`* column; take lengths from today's `catalog.data.json`.
4. Bump `catalogVersion` to **2** in the new file.

**Done when**

- Consistency test green, covering: every cartridge has every field; `weightMin < weightMax`
  and `i7Min < i7Max`; every band's midpoint is finite; **every precision and SD field
  satisfies `nominal ≥ 3·sd`**; every preset's `i7` lies inside its caliber band; every
  preset's weight lies inside its cartridge band.
- **Form-factor plausibility screen** as a standing test: `0.811 ≤ i7 ≤ 1.437` for anything
  entering the catalog. *(This screen is not theoretical — it is what caught the .50 BMG
  BC error before the primary source did, by flagging an impossible `i7` of 0.709.)*
- Gates green.

**Stop if** any authored value violates `nominal ≥ 3·sd`, or a preset's implied `i7` falls
outside its band — that means a number was transcribed wrong, not that the screen is too
tight.

```
rifle-ammo-store S1: author parametric cartridge data for 10 cartridges

- Adds cartridges.data.json: velocity curve (fitted a, anchored k), slider
  bands, platform attrs, grade/optimism constants, length classes, presets.
- Consistency + form-factor plausibility tests; nothing reads it yet.
```

---

### S2 — Pure derivation module
`checkpoint` · commit: **yes**

**Goal.** The maths of §2.1 as a pure, dependency-free module. No engine, no state, no
React — same discipline as `hidden-truth.ts`.

**Files:** `src/game/ballistic-derivation.ts` (new), `src/game/ballistic-derivation.test.ts` (new).

**Steps**

1. Implement, all pure functions of explicit arguments: `sectionalDensity(weightGr, dIn)`,
   `bc7FromI7(sd, i7)`, `i7FromBc7(sd, bc7)`, `bulletLengthIn(sd, lengthClassC)`,
   `muzzleVelocityFps(cartridgeParams, weightGr, barrelIn)`, `chargeMassGr(cartridgeParams)`,
   `recoilVelocityMps(bulletMassKg, mvMps, chargeMassKg, rifleMassKg, gasFactor)`,
   `millerSg(weightGr, dIn, lengthIn, twistIn, mvFps)`.
2. All unit conversion goes through `units/` (guardrail §4.4). No inline `× 0.3048`.
3. `millerSg` is the standard Miller formula — implement it here rather than crossing the
   engine boundary, so the build screen stays engine-free. The test cross-checks it against
   the engine's `computeLaunchStability` so the two cannot drift.

**Done when**

- **The §2.2 reproduction table is a test.** All three anchors reproduce at **0.0%**; the
  three same-cartridge second loads within their stated diffs; `.223` bulk's −6.1% asserted
  explicitly so a future change to `a` is caught rather than absorbed.
- **The §2.2 6.5 CM lineup table is a test**, within 2% of the doc's column.
- **The §3.5 recoil table is a test**, every row within 8% of the catalog figure.
- `millerSg` agrees with the engine's `computeLaunchStability` within 1% on the 6.5 CM
  140 gr @ 1:8 case.
- **.22 LR gets longer-barrel-is-slower asserted directly** (`mv(22") < mv(16")`).
- Boundary behaviour: weight clamped to band; `i7` clamped to band; barrel clamped to band.
- Gates green.

**Stop if** the recoil table misses by more than 8% on any row — the charge fraction or gas
factor is wrong, and guessing a new one to make the test pass is exactly the failure mode
protocol §6 exists to prevent.

```
rifle-ammo-store S2: pure ballistic derivation module

- SD/BC/length/MV/charge/recoil/Sg as pure functions over cartridges.data.json.
- Tests reproduce the shipped-load anchor table, the 6.5 CM factory lineup and
  the feature-catalog recoil table; Miller Sg cross-checked against the engine.
```

---

### S3 — Spec types and resolver (new API alongside the old)
`checkpoint` · commit: **yes**

**Goal.** Turn a *spec* into everything the rest of the app needs, without touching a
single existing call site (D19).

**Files:** `src/game/spec.ts` (new), `src/game/catalog.ts` (additive only),
`src/game/catalog.test.ts` (extend).

**Steps**

1. `spec.ts`: `RifleSpec { cartridgeId, barrelLengthIn, twistIn }`,
   `LoadSpec { cartridgeId, weightGr, i7, grade, presetId? }`. Twist as **inches per turn**
   (1:8 → `8`). Plus `clampRifleSpec` / `clampLoadSpec` and `specFromPreset(presetId)`.
2. `catalog.ts` gains, additively: `resolveRifleSpec(spec) → RifleModel`-shaped,
   `resolveLoadSpec(spec) → AmmoLoad`-shaped, `rifleRangesForSpec`, `lotRangesForSpec`,
   `believedLoadForSpec`, `trueBaseMvForSpec`, `twistMForSpec`, `PRESETS`.
3. **Keep the encapsulation boundary exactly as it is today.** The player-facing shapes
   expose believed + geometry only; true values remain reachable solely through the
   `*Ranges` / `trueBaseMv*` functions that engine-bridge and the dev inspector call. The
   Store must never be able to reach truth.
4. Apply D10 here: believed = true × (1 + optimism), by grade. Apply D9's length override
   for oracle-pinned presets.
5. `.22 LR` branches: `resolveLoadSpec` requires a `presetId` for rimfire cartridges and
   reads authored G1 values. Never feed a G1 number into a G7 solve.

**Done when**

- For all 8 shipped loads, the preset spec resolves to values matching today's
  `catalog.data.json` within §2.2's tolerances (a test that diffs old API against new,
  side by side — this is the whole point of landing them in parallel).
- Existing `catalog.test.ts` still green, unmodified.
- **`hidden-truth.guard.test.ts` still green** — no UI/HUD/scene/shell/state module reaches
  the truth module.
- Gates green.

**Stop if** the old-vs-new diff test cannot be made green without editing a tolerance.
Widening a tolerance to pass is a stop rule.

```
rifle-ammo-store S3: spec types and parametric resolver

- Adds RifleSpec/LoadSpec and resolve*/…ForSpec alongside the existing id API.
- Believed values now derive from a per-grade optimism constant (D10); oracle
  presets keep measured bullet length so golden vectors stay exact.
```

---

### S4 — Save schema v3, migration, and acquisition on specs
`checkpoint` · commit: **yes + push** *(commit before starting, too — a schema migration is hard to unwind)*

⚠ **Ask the owner to commit S3 before you begin this task.**

**Files:** `src/persistence/schema.ts`, `src/persistence/migrations.ts`,
`src/persistence/persistence.test.ts`, `src/game/acquire.ts`, `src/game/acquire.test.ts`.

**Steps**

1. `CURRENT_SCHEMA_VERSION` → **3**. `RifleInstance.spec: RifleSpec` and
   `AmmoLot.spec: LoadSpec` replace `catalogId`. Keep `catalogVersion` (it now stamps
   `cartridges.data.json`'s version).
2. Structural validators for both spec shapes: cartridge id known, numeric fields finite,
   **weight/i7/barrel inside the cartridge's authored band**, twist in the option list.
3. `migrations[2]`: return the save with `rifles: []`, `ammoLots: []`, `dopeNodes: []`,
   `chronoSummaries: []`, `activeRifleId: null`, `activeLotId: null`, `settings` untouched
   (D16). Add a **v2 fixture save** to the migration test corpus per guardrail §4.6.
   **Silent — no notice, no flag, no confirmation prompt** (D16).
4. `acquire.ts`: `buildRifleInstance(spec, opts)` / `buildAmmoLot(spec, opts)`. The draw
   field lists (`RIFLE_DRAW_FIELDS`, `LOT_DRAW_FIELDS`) are **unchanged** — the hidden-truth
   model is untouched by this plan.

**Done when**

- A v2 fixture migrates to v3 with empty inventory and **settings preserved verbatim**
  (units, wind realism, sensitivity, trace, wind markers, mirage strength).
- The validator rejects a spec whose weight is outside its band, with a message naming the
  field.
- Acquisition rolls the same four rifle draws and four lot draws as before.
- Gates green.

**Stop if** any additive-optional field that predates v3 (`playerZero`, `zeroRangeM`,
`effective`, `bcSetAt`) stops validating — the schema's discipline is that those are
validated only when present and never require a bump.

```
rifle-ammo-store S4: save schema v3 — specs replace catalog ids

- RifleInstance/AmmoLot now carry a build spec; v2→v3 silently clears inventory,
  DOPE nodes and chrono history, preserving settings.
- Acquisition builds from a spec; hidden-truth draw fields unchanged.
```

---

### S5 — Migrate the solve path
`checkpoint` · commit: **—** *(lands with S6)*

**Files:** `src/engine-bridge/gear-solve.ts`, `src/game/active-gear.ts`,
`src/game/zero-distance.ts`, `src/state/store.ts`, plus their tests.

**Steps**

1. Swap `believedLoad(lot.catalogId)` → `believedLoadForSpec(lot.spec)`,
   `catalogTwistM(rifle.catalogId)` → `twistMForSpec(rifle.spec)`, and the two `*Ranges`
   calls, in `gear-solve.ts` and `active-gear.ts`.
2. `zero-distance.ts`: `isRimfireCartridge` now takes `spec.cartridgeId` directly.
3. `store.ts`: `acquireRifle` / `acquireLot` / `replenishLot` take specs. `replenishLot`'s
   carry-forward behaviour is unchanged — a new lot of the *same spec* with fresh draws.

**Done when** `gear-solve.test.ts` and `active-gear.test.ts` pass against spec-built
records; `bc-fit.test.ts` and `dope-book.test.ts` green; gates green.

**Stop if** a solve's numeric output moves for the 6.5 CM match preset. It must not — that
load is the golden-vector anchor and D6/D9 exist specifically to hold it fixed.

---

### S6 — Migrate the UI path
`checkpoint` · commit: **yes**

**Files:** `src/shell/LoadoutOverlay.tsx`, `src/shell/DopeBookScreen.tsx`,
`src/shell/StoreScreen.tsx`, `src/scope/DopePanel.tsx`, `src/scope/ChronoPanel.tsx`,
`src/debug/TruthInspector.tsx`.

**Steps**

1. Every `getRifleModel(x.catalogId)` / `getAmmoLoad(x.catalogId)` becomes
   `resolveRifleSpec(x.spec)` / `resolveLoadSpec(x.spec)`.
2. Display names come from the resolver: a preset-built load shows its product name; a
   hand-built one shows `6.5 CM · 140 gr · i7 0.93 · Match`. Both need to read well in the
   Loadout list and the DOPE book header.
3. **`StoreScreen.tsx` gets a minimal holding change only** — list the presets so it
   compiles and remains usable. The real build screen is S9. Do not start it here.
4. `DopeBookScreen`'s cartridge filter (`lots.filter(... .cartridgeId === ...)`) reads
   `l.spec.cartridgeId`.
5. All unit display still goes through the units service (guardrail §4.4).

**Done when** `grep -rn "\.catalogId" src/` returns nothing outside `catalog.ts` and the
old API's own definitions; vitest green; gates green.

```
rifle-ammo-store S5+S6: migrate solve and UI paths onto specs

- gear-solve, active-gear, zero-distance and the inventory store now resolve
  from a build spec; Loadout, DOPE book, DOPE panel, chrono and the dev
  inspector follow. Store gets a holding preset list pending its rebuild.
```

---

### S7 — Delete the old API
**OWNER-VERIFICATION STOP** · commit: **yes + push**

**Files:** `src/game/catalog.ts` (remove the id API), delete `src/game/catalog.data.json`,
`src/game/catalog.test.ts` (rewrite onto specs).

**Steps**

1. Remove `RIFLE_MODELS`, `AMMO_LOADS`, `getRifleModel`, `getAmmoLoad`, `believedLoad`,
   `lotTrueBaseMvMps`, `catalogTwistM`, `catalogRifleRanges`, `catalogLotRanges`,
   `RifleTier`, `TIER_LABEL` (D2), and `catalogEffectiveRangeYd` **only if S8 has already
   replaced its callers** — otherwise leave it for S8 and say so in `PROGRESS.md`.
2. Delete `catalog.data.json`.
3. `isRimfireCartridge` and `CATALOG_VERSION` survive, now reading the new data file.

**Done when** `grep -rn "catalog.data.json\|RifleTier\|getRifleModel\|AMMO_LOADS" src/`
is empty; all gates green.

**What the owner checks.** This is the first point the game is playable end-to-end on the
parametric model. Tell them to:

1. Launch. Inventory is empty and there is no notice — expected (D16).
2. Store → acquire a **6.5 CM rifle** and the **140 gr ELD-M match preset**.
3. Loadout → select both. DOPE book → confirm the come-up table matches what they
   remember for that load. **This is the D6/D9 proof — the anchored preset must not have
   moved.**
4. Acquire the **.308 bulk** preset and compare its DOPE against the old numbers. **This
   one is expected to differ** — its bullet length was wrong before (§0.1) and D10's BC
   optimism now applies. Confirm the difference looks like a modest come-up shift, not a
   different cartridge.
5. **Sign off on the two flagged constants in §1b/§3.3:** per-shot BC scatter at
   0.8%/2.5% (vs today's 0.5%/1.5%), and the D10 optimism values (MV 1.0%/1.8%, BC 4%/8%).
   These change every load's believed table and are a one-line revert.

```
rifle-ammo-store S7: remove the enumerated catalog

- Deletes catalog.data.json and the catalogId API; rifle tiers removed (D2).
- The game now runs entirely on the parametric model with presets as anchors.
```

---

### S8 — Derived effective range
**OWNER-VERIFICATION STOP** · commit: **yes + push**

**Goal.** Replace the authored per-cartridge `effectiveRangeYd` with a per-load solve (D15).

**Files:** `src/engine-bridge/effective-range.ts` (new) + test; callers in
`src/game/dope-book.ts`, `src/shell/DopeBookScreen.tsx`, `src/scope/DopePanel.tsx`.

**Steps**

1. `effectiveRangeYdForSpec(module, rifleSpec, loadSpec) → number`: solve the believed
   trajectory at **ICAO sea level** and return the last station at which the projectile is
   still supersonic (Mach ≥ 1.0), rounded down to the ladder's own cadence.
2. **Cache by `(rifleSpec, loadSpec)`** — this runs on every gear change, DOPE-book open
   and DOPE-panel refresh. A `Map` keyed on a stable serialisation of the two specs is
   enough; there is no atmosphere axis because the definition pins ICAO SL.
3. Callers pass the resolved number where they previously called
   `catalogEffectiveRangeYd(cartridgeId)`. The `2×` over-generation in `comeUpStationsM`
   and the `beyondEffective` tagging are unchanged.
4. Remove `effectiveRangeYd` from `cartridges.data.json` and `catalogEffectiveRangeYd`
   from `catalog.ts`.

**Done when**

- Test asserts the returned range is monotonic in BC (higher `i7` → shorter reach) and in
  barrel length (longer barrel → longer reach, **except .22 LR**, where it shortens).
- Test asserts a heavy .223 build reaches meaningfully further than a light one — the
  behaviour the old per-cartridge constant could not express.
- No solve is issued twice for the same spec pair (cache-hit assertion).
- Gates green.

**What the owner checks.** Open the DOPE book with a .223 match build and confirm the
ladder now runs past the old 600 yd cap (its real supersonic limit is ~865 yd); then with
a .308 and confirm it stops slightly *short* of the old 1000. Then change the barrel length
on a .223 build and watch the reach move. Expect the amber `beyondEffective` marking to
land in a different place than before — that is the point.

```
rifle-ammo-store S8: derive effective range per configured load

- effectiveRangeYdForSpec solves the last supersonic station at ICAO SL and
  caches per spec pair; retires the authored per-cartridge constant.
- DOPE ladder and come-up reference table extents now respond to the build.
```

---

### S9 — The Store rebuild
**OWNER-VERIFICATION STOP** · commit: **yes + push**

**Goal.** D17's two-step Store. This is the plan's headline deliverable.

**Files:** `src/shell/StoreScreen.tsx` (rewrite), `src/shell/BuildScreen.tsx` (new).

**Steps**

1. **Cartridge list.** All 10, each showing name, class, and a one-line character summary.
   Mark `.22 LR` as presets-only.
2. **Build screen**, two tabs or two stacked sections:
   - **Rifle:** barrel length slider (1″ steps, cartridge band), twist selector (option
     list). Readouts: derived MV at the current weight, barrel life, precision, recoil
     kick relative to 6.5 CM.
   - **Ammo:** weight slider (1 gr steps), profile slider (`i7`, labelled sleek↔blunt),
     grade toggle. Readouts: BC7, SD, derived bullet length, derived MV, per-shot MV SD,
     supersonic reach, `Sg` with a marginal band below 1.4 (D14 — **warn, never block**).
3. **Preset chips** snap both sets of sliders and set `presetId`. Moving any slider clears
   `presetId` and the name reverts to the built description.
4. `Acquire` builds the spec and calls the store action. Acquiring twice creates two
   instances with independent hidden draws — unchanged behaviour.
5. **Every displayed number goes through the units service.** MIL and MOA, metric and
   imperial, both shown (guardrail §4.4). **Believed values only** — the Store has no
   route to truth and must not acquire one.
6. iPad-first layout: the build screen must be usable one-thumbed in landscape, with
   `env(safe-area-inset-*)` padding like the existing overlays.

**Done when**

- All 10 cartridges reachable; `.22 LR` shows presets with no weight/profile sliders.
- Sliders clamp to authored bands at both ends.
- Every readout updates live and matches `ballistic-derivation.ts` (a component test on
  the pure readout-assembly function is enough — do not test the canvas).
- Gates green, including `npm run build` and an **offline relaunch check** (guardrail §4.7 —
  no new runtime assets should be needed, confirm that).

**What the owner checks.** Build a light-and-fast 6.5 CM (95 gr, sleek) and a
heavy-and-slow one (156 gr, sleek), acquire both, and compare their DOPE. The heavy one
should be slower off the muzzle and flatter downrange — **that trade becoming visible is
the entire reason for this work.** Then push a .223 to 90 gr at 1:9 twist and confirm the
`Sg` readout goes marginal without blocking the build.

```
rifle-ammo-store S9: parametric Store — cartridge list to build screen

- Ten cartridges, rifle (barrel/twist) and ammo (weight/profile/grade) builders
  with live derived readouts and preset snapping.
- Sg is surfaced with a marginal band and never blocks a build (D14).
```

---

### S10 — Cartridge-scaled recoil
**OWNER-VERIFICATION STOP** · commit: **yes + push**

**Files:** `src/game/recoil.ts` (new) + test, `src/scope/ScopeView.tsx`.

**Steps**

1. `recoilPitchVelocity(rifleSpec, loadSpec) → number`: `V_r` from `ballistic-derivation`,
   scaled so **6.5 CM / 140 gr returns today's `0.05`** exactly.
2. `ScopeView` reads it from the active gear instead of the hardcoded constant. With no
   active gear, fall back to the current constant.
3. ⚠ **Do not touch the order of operations.** `ScopeView` samples aim *before* applying
   the kick, and D13 requires that stay. The bullet exits in ~1–1.5 ms, before the rifle
   has meaningfully rotated; making recoil throw the shot would be arcade and factually
   wrong. Shot placement stays a function of hold, wobble and breath.
4. Lateral kick and settle time scale with the same factor; **the random POA residual does
   not** (that is a shooter effect, not a physics one).

**Done when** the pure function reproduces §3.5's relative-kick column within 8%; the
6.5 CM calibration point returns `0.05` exactly; a test asserts the sampled aim is
unchanged by the recoil scale (the no-POI-shift guard); gates green.

**What the owner checks.** Fire a .22 LR, a 6.5 CM and a .50 BMG back to back at the same
target. The .22 should barely move, the 6.5 should feel exactly as it does today, and the
.50 should lose the target entirely. **Self-spotting emerging for free is the real payoff** —
whether you can watch your own impact is the single biggest practical consequence of
recoil, and it is why 6 mm and 6.5 mm dominate PRS.

```
rifle-ammo-store S10: cartridge-scaled recoil

- Recoil pitch velocity computed from bullet mass, muzzle velocity and charge
  mass, calibrated to hold 6.5 CM at its current feel.
- Point of impact is unaffected by construction; aim is still sampled pre-kick.
```

---

### S11 — Validation harness and documentation close-out
`plan complete` · commit: **yes + push**

**Files:** `GameBuild/validation/derived-space-check.mjs` (new),
`Design/feature-catalog.md`, `Design/execution/PROGRESS.md`, `Wiki/_gaps.md`.

**Steps**

1. **Derived-space harness.** Golden vectors are keyed to specific loads, so they cover the
   presets but not the space between them. Add a Node harness that sweeps each cartridge's
   weight band at three profiles and asserts **structural properties** rather than absolute
   numbers: MV strictly decreasing in weight; BC strictly increasing in weight; BC strictly
   decreasing in `i7`; supersonic reach increasing in BC; every derived `i7` inside its
   measured band. Wire it into `package.json` as `validate:derived`.
2. **The presets stay pinned to the six oracle loads** — the golden-vector harness is
   unchanged and must stay green, which is what D9's length override protects.
3. `feature-catalog.md`: rewrite the §C "Gear catalog architecture" entry as **Built**;
   fold in the "Magnum & ELR cartridge tier" entry (now shipped); move §B
   "Cartridge-scaled recoil" to Built; note the surviving self-spotting follow-on.
4. `PROGRESS.md`: one row per task, per protocol §7.
5. `Wiki/_gaps.md` — register, alongside N4:
   - **Third ammo grade** (cheap bulk, 25 fps SD, 6.5% lot BC variance) exists in R3, not modelled (D5).
   - **`i7` band constant with weight** — a 40 gr .224 cannot really be as sleek as a 90 gr (D20).
   - **Construction-class axis** — monolithic and steel-core `C` constants held, no slider.
   - **6mm Creedmoor barrel life** — strictly better than 6.5 CM until barrel life is modelled. Same failure shape as N4.
   - **6.5 PRC velocity fit** — weakest in the ladder (R² 0.923), first candidate for re-sourcing.
   - **.300 PRC below 200 gr** — its 180 gr row was rejected as optimistic; re-source before relying on light builds.
   - **.223 anchor barrel length** — 2750 fps is likely a 20″ figure recorded against 24″ (§1b).
   - **Marginal stability has no dispersion consequence** — `Sg` is displayed but inert (D14).

**Done when** `validate:derived` passes for all 10 cartridges; the golden-vector harness is
still zero-diff; every doc above reflects reality; gates green.

```
rifle-ammo-store S11: derived-space validation and docs close-out

- Adds validate:derived, a property-based sweep over each cartridge's slider
  space; golden vectors unchanged and still pinned to the preset loads.
- feature-catalog, PROGRESS and the gap register brought up to date.
```

---

## 5. Risks, and what to do about them

| risk | mitigation |
|---|---|
| A derived value silently changes a live load's DOPE | D6 anchors `k` and D9 overrides oracle lengths, so the six preset loads are held fixed by construction. S3's old-vs-new diff test enforces it. |
| The .223 light end is 6% off | Known and bounded (§2.2). The bulk preset carries an MV override; the error only affects hand-built light .223 loads. |
| Two research documents disagree on BC scatter | §1b: pick the newer sourced value, author it as one named constant, and get explicit owner sign-off at S7. |
| The owner loses accumulated play | Accepted and authorised (D16) — single-user project, wipe silently, no notice or confirmation to build. |
| `Sg` crossing 1.4 implies a consequence that does not exist | D14: display only, and UI copy must not claim dispersion opens. Registered as a gap at S11. |
| Effective-range solve on every gear change costs frames | S8 caches by spec pair; the assertion is a test, not a hope. |

## 6. What this plan deliberately does not do

Handloading and a powder-charge axis (Increment 5) · a bullet construction-class axis ·
a third ammo grade · barrel life as a spent resource · self-spotting and follow-up-shot
recovery mechanics · transonic dispersion (gap N4 — still the thing blocking HV rimfire) ·
the canted base and SFP · a scope catalog.

## Sources

- [`bullet-catalog/build-data-reference.md`](../bullet-catalog/build-data-reference.md) — the validated build data (§2–3 here are drawn from it)
- [`bullet-catalog/catalog-expansion-v2.md`](../bullet-catalog/catalog-expansion-v2.md) — why the model is parametric; the rifle-attribute audit (§4)
- [`bullet-catalog/litz-appendix-a-bullets.json`](../bullet-catalog/litz-appendix-a-bullets.json) — 471 measured bullets: the weight and `i7` bands
- [`bullet-catalog/catalog-seed.json`](../bullet-catalog/catalog-seed.json) — research runs A/B, 7 cartridges
- Litz, *Applied Ballistics for Long-Range Shooting*, 3rd ed., Appendix A · *Hornady Handbook of Cartridge Reloading*, 10th ed. · research runs R1/R2/R3 (secondary, validated — `Documentation/sources.md` entries 9–11)
