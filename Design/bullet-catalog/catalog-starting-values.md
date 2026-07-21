# Catalog starting values (for coding) — teaching-ladder v1

`Status: draft data — SECONDARY source, spot-check before shipping` · `Date: 2026-07-16`

> Distilled from `Documentation/AmmoResearch.txt` + `RifleResearch.txt` (plain-text copies of two AI deep-research
> reports; the .md/pdf/html exports cropped the equation images and lost the SD/range numbers — the text copies
> preserved them). Machine-readable twin: [`catalog-seed.json`](./catalog-seed.json). Every value is **nominal ± SD**
> per decision D3 (bell-curve draw, clamp ±3 SD). Imperial as sourced; the JSON adds SI for the engine.

## How these map to the hidden-truth model

**Ammo lot (hidden):** mean-MV shift ~ N(0, ΔMV-SD) · per-shot MV SD ~ N(nom, sd) · true BC ~ N(trueBC, trueBC×lotBCvar%). Box/believed values the player starts from: box MV (advertised) + advertised BC (optimistic vs true).

**Rifle instance (hidden):** MV offset ~ N(0, barrel-to-barrel spread) · inherent precision = the model's group-MOA tier. Zero offset (h/v) is a **design-set** field — not in the research; set ourselves.

**Rifle model (catalog):** barrel length, twist + twist-gating, weight, recoil, barrel life.

**Design-set (not in research; owner-approved defaults, tunable):** rifle **zero offset** each axis ~ N(0, **1.0 MOA**), clamp ±3 MOA (fresh rifle starts visibly off-zero, dialed out in 2.3). Per-shot **BC scatter** (`bcSdFraction`, distinct from the lot-to-lot BC variance in the tables): **match 0.5% / bulk 1.5%**.


## .22 LR — Rimfire precision (teacher)

**Rifle model:** barrel 20.0 ± 2.0"  ·  twist 1:16.0  ·  weight 13.5 ± 1.5 lb  ·  recoil 0.05 ± 0.01 ft-lb  ·  barrel life 15000 ± 3000 rd  ·  MV/inch -5.0 ± 1.5 fps

**Twist gating:** 1:16" → 36–40 gr LRN (std). 1:12" → gate for 60 gr subsonic conicals.

**Rifle instance (hidden):** MV offset ~ N(0, **30.0 fps**)  ·  inherent precision by tier — hunting 1.25 ± 0.25 / factory-match 0.65 ± 0.15 / custom 0.25 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Lapua Center-X (40 gr LRN) | CCI Standard Velocity (40 gr LRN) |
| Bullet weight (gr) | 40.0 ± 0.1 | 40.0 ± 0.4 |
| Box MV (fps @ in) — *believed* | 1073 @ 26" | 1070 @ 18" |
| Measured MV (fps) | 1073.0 ± 10.0 @20" | 1055.0 ± 25.0 @18" |
| True BC (drag) — *hidden* | 0.134 (G1) | 0.12 (G1) |
| Box BC (advertised) — *optimistic* | G1 0.172 | G1 0.12 |
| Per-shot MV SD (fps) — *hidden* | 6.0 ± 1.5 | 18.0 ± 4.0 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 15.0 | 30.0 |
| Lot BC variance (%) — *hidden* | 1.5 | 3.5 |
| Temp sens (fps/10°F) | 1.2 ± 0.4 | 3.2 ± 0.8 |

## .223 Rem / 5.56 NATO — Light match

**Rifle model:** barrel 24.0 ± 2.0"  ·  twist 1:7.5  ·  weight 15.0 ± 1.0 lb  ·  recoil 2.0 ± 0.2 ft-lb  ·  barrel life 5000 ± 1000 rd  ·  MV/inch 25.3 ± 3.5 fps

**Twist gating:** 1:12" → 40–55 gr. 1:9" → 55–69 gr. 1:7–1:8" → gate for 69–80 gr match.

**Rifle instance (hidden):** MV offset ~ N(0, **35.0 fps**)  ·  inherent precision by tier — hunting 1.25 ± 0.25 / factory-match 0.65 ± 0.1 / custom 0.3 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Black Hills 5.56 77 gr TMK | Federal American Eagle XM193 (55 gr FMJ) |
| Bullet weight (gr) | 77.0 ± 0.15 | 55.0 ± 0.4 |
| Box MV (fps @ in) — *believed* | 2750 @ 20" | 3250 @ 20" |
| Measured MV (fps) | 2683.0 ± 12.0 @16" | 3165.0 ± 25.0 @16" |
| True BC (drag) — *hidden* | 0.207 (G7) | 0.12 (G7) |
| Box BC (advertised) — *optimistic* | G1 0.42 / G7 0.207 | G1 0.243 |
| Per-shot MV SD (fps) — *hidden* | 10.0 ± 2.0 | 18.0 ± 4.0 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 15.0 | 45.0 |
| Lot BC variance (%) — *hidden* | 3.5 | None |
| Temp sens (fps/10°F) | 1.5 ± 0.4 | 17.0 ± 3.0 |

## 6.5 Creedmoor — Medium match

**Rifle model:** barrel 26.0 ± 1.0"  ·  twist 1:8.0  ·  weight 21.0 ± 2.5 lb  ·  recoil 4.27 ± 0.5 ft-lb  ·  barrel life 2800 ± 400 rd  ·  MV/inch 18.1 ± 3.7 fps

**Twist gating:** 1:8–1:8.5" → 120–147 gr high-BC (full range).

**Rifle instance (hidden):** MV offset ~ N(0, **25.0 fps**)  ·  inherent precision by tier — hunting 1.0 ± 0.2 / factory-match 0.5 ± 0.1 / custom 0.25 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Hornady Match 140 gr ELD-M | Sellier & Bellot 140 gr FMJ-BT |
| Bullet weight (gr) | 140.0 ± 0.1 | 140.0 ± 0.35 |
| Box MV (fps @ in) — *believed* | 2710 @ 24" | 2657 @ 24" |
| Measured MV (fps) | 2712.0 ± 12.0 @24" | 2610.0 ± 20.0 @24" |
| True BC (drag) — *hidden* | 0.31 (G7) | 0.24 (G7) |
| Box BC (advertised) — *optimistic* | G1 0.646 / G7 0.326 | G1 0.485 |
| Per-shot MV SD (fps) — *hidden* | 12.0 ± 2.0 | 18.0 ± 4.0 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 25.0 | 45.0 |
| Lot BC variance (%) — *hidden* | 1.5 | 4.0 |
| Temp sens (fps/10°F) | 1.2 ± 0.3 | 15.0 ± 3.0 |

## .308 Winchester — Standard precision

**Rifle model:** barrel 22.0 ± 2.0"  ·  twist 1:10.0  ·  weight 16.0 ± 2.0 lb  ·  recoil 8.68 ± 0.8 ft-lb  ·  barrel life 6500 ± 1500 rd  ·  MV/inch 22.7 ± 1.8 fps

**Twist gating:** 1:12" → 150–168 gr. 1:10" → up to 175–185 gr (M118LR).

**Rifle instance (hidden):** MV offset ~ N(0, **30.0 fps**)  ·  inherent precision by tier — hunting 1.25 ± 0.25 / factory-match 0.65 ± 0.1 / custom 0.35 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Federal Gold Medal Match 175 gr SMK | PMC Bronze 147 gr FMJ-BT |
| Bullet weight (gr) | 175.0 ± 0.15 | 147.0 ± 0.4 |
| Box MV (fps @ in) — *believed* | 2600 @ 24" | 2780 @ 24" |
| Measured MV (fps) | 2580.0 ± 12.0 @22" | 2740.0 ± 20.0 @22" |
| True BC (drag) — *hidden* | 0.243 (G7) | 0.195 (G7) |
| Box BC (advertised) — *optimistic* | G1 0.505 | G1 0.39 |
| Per-shot MV SD (fps) — *hidden* | 11.5 ± 2.0 | 16.0 ± 3.5 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 20.0 | 35.0 |
| Lot BC variance (%) — *hidden* | 1.5 | 4.0 |
| Temp sens (fps/10°F) | 7.5 ± 1.5 | 16.0 ± 3.0 |

## .300 Win Mag — Heavy long-range

**Rifle model:** barrel 25.0 ± 1.0"  ·  twist 1:10.0  ·  weight 18.0 ± 1.5 lb  ·  recoil 14.09 ± 1.5 ft-lb  ·  barrel life 1500 ± 300 rd  ·  MV/inch 39.6 ± 5.0 fps

**Twist gating:** 1:10" → 190–210 gr. 1:8–1:9" → gate for 220–230 gr.

**Rifle instance (hidden):** MV offset ~ N(0, **40.0 fps**)  ·  inherent precision by tier — hunting 1.25 ± 0.25 / factory-match 0.65 ± 0.15 / custom 0.4 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Federal Premium Gold Medal 215 gr Berger | Sellier & Bellot 180 gr SPCE |
| Bullet weight (gr) | 215.0 ± 0.15 | 180.0 ± 0.4 |
| Box MV (fps @ in) — *believed* | 2800 @ 24" | 2936 @ 24" |
| Measured MV (fps) | 2765.0 ± 15.0 @24" | 2880.0 ± 25.0 @24" |
| True BC (drag) — *hidden* | 0.354 (G7) | 0.2 (G7) |
| Box BC (advertised) — *optimistic* | G1 0.696 | G1 None |
| Per-shot MV SD (fps) — *hidden* | 12.0 ± 2.5 | 19.0 ± 4.0 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 25.0 | 50.0 |
| Lot BC variance (%) — *hidden* | 4.5 | None |
| Temp sens (fps/10°F) | 3.0 ± 0.8 | 22.0 ± 4.0 |

## .338 Lapua Mag — Extreme long-range

**Rifle model:** barrel 28.0 ± 2.0"  ·  twist 1:9.3  ·  weight 22.0 ± 2.0 lb  ·  recoil 22.45 ± 2.0 ft-lb  ·  barrel life 1800 ± 400 rd  ·  MV/inch 28.3 ± 2.1 fps

**Twist gating:** 1:10" → 250 gr. 1:9.3–1:9.5" → gate for 300 gr.

**Rifle instance (hidden):** MV offset ~ N(0, **40.0 fps**)  ·  inherent precision by tier — hunting 1.25 ± 0.25 / factory-match 0.7 ± 0.15 / custom 0.35 ± 0.05 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Lapua 300 gr Scenar | Sellier & Bellot 250 gr FMJ-BT |
| Bullet weight (gr) | 300.0 ± 0.2 | 250.0 ± 0.5 |
| Box MV (fps @ in) — *believed* | 2713 @ 27" | 2848 @ 27" |
| Measured MV (fps) | 2680.0 ± 15.0 @26" | 2790.0 ± 20.0 @24" |
| True BC (drag) — *hidden* | 0.392 (G7) | 0.26 (G7) |
| Box BC (advertised) — *optimistic* | G1 0.782 | G1 0.62 |
| Per-shot MV SD (fps) — *hidden* | 9.0 ± 2.0 | 16.0 ± 3.5 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 30.0 | 55.0 |
| Lot BC variance (%) — *hidden* | 1.5 | 4.0 |
| Temp sens (fps/10°F) | 4.0 ± 1.0 | 18.0 ± 3.0 |

## .50 BMG — Anti-materiel / ELR

**Rifle model:** barrel 32.0 ± 3.0"  ·  twist 1:15.0  ·  weight 32.0 ± 3.0 lb  ·  recoil 101.77 ± 10.0 ft-lb  ·  barrel life 4000 ± 800 rd  ·  MV/inch 25.0 ± 6.5 fps

**Twist gating:** 1:15" → 647–700 gr ball. 1:12" → gate for 750–800 gr solids.

**Rifle instance (hidden):** MV offset ~ N(0, **50.0 fps**)  ·  inherent precision by tier — hunting 1.5 ± 0.3 / factory-match 0.9 ± 0.15 / custom 0.5 ± 0.1 MOA  ·  zero offset = *design-set*

**Loads:**

| Field (→ model) | Match | Bulk |
|---|---|---|
| Product | Hornady Match 750 gr A-MAX | PMC Bronze 660 gr FMJ (M33) |
| Bullet weight (gr) | 750.0 ± 0.3 | 661.0 ± 2.0 |
| Box MV (fps @ in) — *believed* | 2815 @ 36" | 2910 @ 45" |
| Measured MV (fps) | 2720.0 ± 15.0 @30" | 2820.0 ± 30.0 @30" |
| True BC (drag) — *hidden* | 0.581 (G7) | 0.34 (G7) |
| Box BC (advertised) — *optimistic* | G1 1.05 | G1 0.701 |
| Per-shot MV SD (fps) — *hidden* | 14.0 ± 3.0 | 25.0 ± 5.0 |
| Lot-to-lot ΔMV SD (fps) — *hidden* | 45.0 | 75.0 |
| Lot BC variance (%) — *hidden* | 1.5 | 5.0 |
| Temp sens (fps/10°F) | 5.0 ± 1.2 | 20.0 ± 4.0 |

---

## Scope / sighting system — by quality tier

*Model scope quality as a **tier choice** (feature-catalog §C3, one configurable optic), NOT per-instance hidden truth: scope-to-scope unit-to-unit variation was **unsourced** in both reports. **Low confidence** — re-source before shipping. Tracking factor + return-to-zero come from the rifle report's sighting model (has SDs, monotonic); travel/cant/parallax from `ScopeAccuracy.md`.*

| Field (→ model) | Budget (~$300) | Mid (~$800) | Top (~$1,500+) |
|---|---|---|---|
| Tracking factor (actual÷dialed) | 0.960 ± 0.025 | 0.985 ± 0.012 | 1.000 ± 0.005 |
| Return-to-zero drift (1σ, MOA) | 0.35 | 0.15 | 0.05 |
| Elevation travel (MOA / MRAD) | 60 / 16.4 | 100 / 29 | 120 / 40 |
| Reticle cant (1σ, °) | 0.5 | 0.5 | 0.2 |
| FFP subtension error (%) | n/a (BDC) | ~0.5 | 0.0 |
| Parallax adjust | fixed @100 yd | 25 yd–∞ | 10 yd–∞ |
| Unit-to-unit variation | *unsourced — design-set* | *unsourced* | *unsourced* |

**Mapping:** tracking factor scales every dialed correction · return-to-zero adds a small random zero drift per session · elevation travel caps the dial (gates max range at ELR) · cant → horizontal error growing with range · subtension error → holdover/mil-ranging error · parallax → POA shift if unset.
