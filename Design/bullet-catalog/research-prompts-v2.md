# Research prompts v2 — the three runs that finish the catalog

`Status: ready to run` · `Date: 2026-08-01`
`Model context:` [`catalog-expansion-v2.md`](./catalog-expansion-v2.md)

Three self-contained prompts. Each is pasteable on its own; they share no dependencies and can be
run in any order. Everything they *don't* ask for, we already hold — see §1.

---

## 1. What we already have, and what is left

| Data | Status | Source |
|---|---|---|
| Form factor (i7) by caliber & construction | ✅ **471 bullets** | Litz *Applied Ballistics* 3rd ed. **Appendix A** → [`litz-appendix-a-bullets.json`](./litz-appendix-a-bullets.json) |
| Measured G1 + G7 BC per bullet | ✅ same 471 | same |
| Modern G7 BCs (ELD Match, ELD-X) | ✅ | Hornady Handbook 10th ed., radar-measured at 800 yd |
| Velocity-vs-weight envelope — 6 cartridges | ✅ in hand | Hornady Handbook 10th ed. (.223, 6.5 CM, .308, .300 WM, .338 LM, .50 BMG) |
| Ammo + rifle data — 7 original cartridges | ✅ | [`catalog-seed.json`](./catalog-seed.json) (runs A + B, 2026-07-16) |
| Stability / twist math | ✅ | Litz *Applied Ballistics* Ch10 (Miller) |
| **Velocity envelope — 3 new cartridges** | ❌ | **Run R1** |
| **Rifle platform — 3 new cartridges** | ❌ | **Run R1** |
| **Case capacity — all 10** | ❌ | **Run R1** |
| **Bullet overall length** | ❌ | **Run R2** |
| **Ammo consistency statistics by grade** | ❌ | **Run R3** |

Books that would have answered R2 and R3 — *Ballistic Performance of Rifle Bullets* and
*Modern Advancements in Long Range Shooting* — could not be obtained. Both runs are written to
get close enough without them, and both have a validation hook against data we already hold.

**Rules that apply to all three runs:**

> **⚠ Delivery format.** Plain text with every number written inline. **No equation editor, no
> Google Docs export.** Earlier runs on this project came back as Docs exports with the numbers
> embedded as images, and the `.md` / `.pdf` / `.html` exports cropped them — only the plain-text
> copies survived.
>
> **Sourcing.** Prefer independently measured data (Applied Ballistics, PrecisionRifleBlog,
> published chronograph or radar results, manufacturer technical drawings) over marketing. Label
> advertised figures as advertised and state the test barrel length. Give ranges, not point
> values. **Cite every source.**
>
> **The one rule that matters most:** if a value does not exist in the literature, **say so
> explicitly**. Do not fill a gap with a plausible-looking number. A named gap is useful to me; an
> invented number is worse than nothing, because I cannot tell it apart from a real one. Flag
> every figure that is an estimate and say what you estimated it from.
>
> Each run is in priority order — partial answers are still useful, so work top-down.

---

## 2. Run R1 — the three new cartridges, plus case capacity for all ten

> **Role & goal.** You are a ballistics research assistant. I am building a long-range shooting
> simulation whose ammunition model is **parametric**: the player picks a bullet weight, and
> muzzle velocity is derived from a per-cartridge curve rather than looked up per product. I need
> the data to fit that curve for three modern cartridges, plus the rifles that shoot them.
>
> The curve I am fitting is `MV = k · weight^(−a)`, so what I need is **velocity at several
> different bullet weights in the same cartridge**, not one velocity per cartridge.
>
> ### Priority 1 — velocity envelopes
>
> For **6mm Creedmoor**, **6.5 PRC** and **.300 PRC**, report:
>
> 1. The **full range of bullet weights** available in that cartridge — lightest to heaviest, both
>    factory-loaded and as reloading components.
> 2. **Muzzle velocity at 4–6 different bullet weights spanning that range**, each with the
>    **barrel length** it was measured from and whether it is a factory-ammo figure or a
>    near-maximum handload. Reloading-manual data is ideal here. If you can give the velocity
>    *ceiling* a good handload reaches at each weight, say so — that is the number I want most.
> 3. Whether the cartridge is **SAAMI-standardised**, and its introduction year.
>
> ### Priority 2 — case capacity for all ten cartridges
>
> **Case capacity in grains of water (H₂O), fired or unfired — state which.** For:
> .22 LR · .223 Rem · 6mm Creedmoor · 6.5 Creedmoor · 6.5 PRC · .308 Win · .300 Win Mag ·
> .300 PRC · .338 Lapua Mag · .50 BMG.
>
> This matters more than it looks: case capacity relative to bore area is what determines how much
> a heavier bullet slows down in a given cartridge, and I am using it to place the three new
> cartridges on a trend fitted from the other seven. A rough figure with a source beats a precise
> one without.
>
> ### Priority 3 — the rifles
>
> For a typical **precision rifle** in 6mm Creedmoor, 6.5 PRC and .300 PRC:
>
> 1. **Barrel lengths** used for precision work, and **velocity change per inch of barrel
>    (fps/inch)**.
> 2. **Twist rates** offered, and **which bullet weights each twist stabilises**. I gate bullet
>    weight on twist, so I need the weight bands, not just the rate.
> 3. **Barrel life** — round count to accuracy loss, with a spread. For 6mm Creedmoor especially:
>    it is the cartridge's defining trade-off and I want a defensible number.
> 4. **Barrel-to-barrel muzzle-velocity variation (fps)** — how much two rifles of the *same*
>    spec, same barrel length, same ammo, differ in average MV. This is a key input and is rarely
>    published, so say plainly if you cannot source it.
> 5. **Rifle weight** (typical precision build) and **recoil energy in ft-lbf**.
> 6. **Inherent accuracy (group size, MOA)** at three tiers — factory hunting, factory precision,
>    custom barrel.
>
> ### Priority 4 — two factory loads each
>
> For each of the three, a **premium match** load and a **cheaper factory** load. For these
> cartridges the cheaper option is likely factory *hunting* ammunition rather than plinking FMJ —
> that is expected and correct. **Name the category you picked and why**; do not invent a plinking
> load that does not exist.
>
> For each load: product name and bullet · bullet weight · **advertised MV plus the barrel length
> quoted** · a realistic **measured** MV · **BC with the drag model stated, G1 and G7 if both are
> published** · and any known advertised-versus-true BC discrepancy.
>
> Suggested products to confirm or substitute with a reason: 6mm Creedmoor — Hornady 108 gr ELD
> Match / a Winchester or Federal 90–105 gr offering. 6.5 PRC — Hornady 147 gr ELD Match /
> Hornady Precision Hunter 143 gr ELD-X. .300 PRC — Hornady 225 gr ELD Match / Precision Hunter
> 212 gr ELD-X.
>
> ### Output
>
> One table per cartridge. Every numeric cell as **nominal + plausible SD**, or a min–max range,
> plus **Sources** and a **confidence** flag (measured / manufacturer-published / estimated).
> Close with a plain list of everything you could not source.

---

## 3. Run R2 — bullet overall lengths

> **Role & goal.** You are a ballistics research assistant. I need **bullet overall length** — the
> projectile alone, **not** cartridge overall length (C.O.L.) — for the bullets listed below. Be
> explicit in each row that the figure is the bullet by itself.
>
> I already hold measured ballistic coefficient, sectional density and form factor for all of
> these. Length is the only missing dimension, and I need it only to fit a stability model, so
> **a good estimate clearly labelled as an estimate is genuinely useful** — but it must be labelled.
>
> ### Sources likely to have this
>
> Manufacturer technical drawings and spec sheets (**Berger and Cutting Edge publish lengths**;
> Hornady and Sierra list some), reloading-manual dimension tables, the JBM Ballistics bullet
> database, and reloading-forum posts quoting an actual caliper reading. If a bullet is
> undocumented, name the **closest documented bullet of the same weight, caliber and
> construction** as a substitute and flag it as a substitution.
>
> ### For each bullet report
>
> Overall length (**inches and mm**) · construction class · source · confidence
> (measured / manufacturer-published / estimated).
>
> **Construction class** — assign exactly one, since I fit a separate constant per class:
> `jacketed lead-core match` · `jacketed lead-core hunting or polymer-tipped` · `FMJ` ·
> `monolithic solid copper or brass` · `steel-core FMJ` · `unjacketed lead (rimfire)`.
>
> ### Priority 1 — .50 BMG (I have almost nothing here; please be thorough)
>
> Hornady 750 gr A-MAX · Barnes 800 gr LR Solid · Barnes 750 gr LR Solid Bore · Barnes 647 gr
> TAC-X/TSX · Lehigh 808 gr Solid Match · Cutting Edge 802 gr MTAC · Lapua 800 gr Bullex-N ·
> military/PMC 660–661 gr M33 ball
>
> ### Priority 2 — magnums and 6.5 mm
>
> **.338:** Lapua 300 gr Scenar · Berger 300 gr Elite Hunter · Hornady 285 gr A-MAX ·
> Sierra 250 gr GameKing · Cutting Edge 275 gr MTAC · Lapua 250 gr FMJBT
> **.264:** Berger 140 gr Target Hybrid · Hornady 140 gr A-MAX · Hornady 147 gr ELD Match ·
> Nosler 142 gr AccuBond LR · Nosler 100 gr Ballistic Tip
> **.308:** Berger 230 gr Tactical OTM Hybrid · Berger 215 gr Hybrid Target · Sierra 220 gr
> MatchKing · Sierra 175 gr MatchKing · Sierra 165 gr HPBT GameKing · PMC 147 gr FMJ-BT
>
> ### Priority 3 — the light cartridges
>
> **.243:** Berger 105 gr Hunting VLD · Berger 115 gr Target VLD · Hornady 108 gr ELD Match ·
> Hornady 80 gr GMX
> **.224:** Berger 90 gr Target VLD · Sierra 77 gr Tipped MatchKing · Barnes 85 gr Match Burner ·
> Berger 55 gr Varmint FB · Federal XM193 55 gr FMJ
> **.22 LR:** CCI Standard Velocity 40 gr LRN · Lapua Center-X 40 gr LRN
>
> ### Also useful, if you can find it
>
> Any published rule of thumb relating **bullet length to weight** within a caliber and
> construction type, or a table of length-to-diameter ratios by bullet class. That would let me
> fill the gaps you cannot source.
>
> ### Output
>
> One row per bullet. Close with a list of every bullet you could not source, and a note on which
> manufacturers publish lengths openly versus which required inference.

---

## 4. Run R3 — ammunition consistency statistics

> **Role & goal.** You are a ballistics research assistant. I am modelling **how much real
> ammunition deviates from its nominal specification** — the shot-to-shot and lot-to-lot scatter
> that makes a real firing solution imperfect. I need the *statistics of the scatter*, not the
> nominal values, which I already have.
>
> My model attaches this scatter to an **ammunition quality tier** rather than to individual
> products, scaled by cartridge size. So the shape of answer I need is "match-grade centrefire
> rifle ammunition typically shows X, cheap factory ammunition typically shows Y, and it scales
> with Z" — with the evidence behind it.
>
> ### Priority 1 — the four scatter statistics, by quality tier
>
> For **match-grade**, **mid-tier factory**, and **cheap bulk/FMJ** centrefire rifle ammunition:
>
> 1. **Per-shot muzzle-velocity standard deviation (fps)**, and typical **extreme spread**. State
>    the relationship between SD and ES you are assuming, and over how many shots.
> 2. **Lot-to-lot mean-velocity shift (fps)** — how far the average MV of one production lot of a
>    given product sits from another lot of the *same* product.
> 3. **Lot-to-lot ballistic-coefficient variation (%)** for the same product across lots.
> 4. **Per-shot BC variation (%)** — round-to-round scatter within a single lot.
>
> As a sanity anchor, these brackets are widely quoted for factory match MV SD: under 10 fps
> excellent, 10–13 good, 14–17 average, over 17 poor. Flag anything you report that falls outside
> the pattern.
>
> ### Priority 2 — how the scatter scales
>
> 1. Does per-shot MV SD **scale with cartridge size or case capacity**, or is it roughly constant
>    across cartridges for a given quality tier? I have data suggesting lot-to-lot shift grows
>    with case capacity (roughly 15 fps for .22 LR up to 75 fps for .50 BMG) while per-shot SD
>    stays much flatter. **Confirm, correct, or say the evidence is absent.**
> 2. Is there a real, distinguishable **mid-tier** between premium match and cheap bulk, or is the
>    market effectively bimodal?
> 3. Does **rimfire** behave differently enough to need its own figures? Match rimfire in
>    particular.
>
> ### Priority 3 — two specific gaps I need filled
>
> 1. **Sellier & Bellot .300 Win Mag 180 gr SPCE** — lot-to-lot BC variation (%), and **any**
>    published ballistic coefficient in either G1 or G7. I currently have no BC data of any kind
>    for this load.
> 2. **Federal American Eagle XM193 55 gr FMJ (.223/5.56)** — lot-to-lot BC variation (%).
>
> ### Where this data tends to live
>
> Applied Ballistics / Bryan Litz published testing (including *Modern Advancements in Long Range
> Shooting*, if you can quote from it), PrecisionRifleBlog ammunition tests, Sniper's Hide and
> AccurateShooter chronograph threads with real datasets, manufacturer quality-control claims, and
> military ammunition acceptance specifications. Group-size and consistency comparisons between
> match and bulk ammunition are also useful if they report velocity statistics.
>
> ### Output
>
> A table of the four statistics by quality tier, each as **nominal + plausible range**, with
> sources and a confidence flag. Then a short section on scaling, and a plain list of what could
> not be sourced. **Be explicit about which figures are well-evidenced and which are folklore
> repeated across forums** — that distinction is more valuable to me than a complete table.

---

## 5. Validation hooks — what happens to the answers

Nothing enters the catalog unchecked. Each run has a specific test against data already in hand:

- **R1** — the fitted `a` exponent for each new cartridge must land on the trend established from
  the six cartridges in the Hornady Handbook (efficient small cases near 0.5, overbore magnums
  near 0.22). Case capacity is what places them on it. An outlier means bad velocity data.
- **R2** — every length is checked against `L ≈ C · SD` using the sectional density we already
  hold from Appendix A, where `C = 4.63 ± 3.5%` for jacketed lead-core. More than ~15% off the
  class constant means a bad source or a genuinely unusual bullet, and gets re-checked.
- **R3** — the tier figures must reproduce the per-load values already in
  [`catalog-seed.json`](./catalog-seed.json) for the seven original cartridges (match ≈ 10.6 fps
  mean per-shot SD, bulk ≈ 18.6 fps). If the tier abstraction cannot reproduce those, the
  abstraction is wrong and the model changes, not the data.

Results are ingested into `Documentation/` as **clearly-marked secondary sources**, spot-checked
against Litz and McCoy, and only then written into `catalog-seed.json`.
