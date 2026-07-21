# Catalog data — deep-research prompts (teaching-ladder v1)

`Purpose:` gather realistic **starting** data to populate the Increment-2.2 gear catalog and
the hidden-truth model. Three separate research runs — **Prompt A (ammunition)**, **Prompt B
(rifles)**, and **Prompt C (sighting system / scope mechanical error)** — because they draw on
different source domains and each maps to a different part of the model. *A and B have been run
and extracted (2026-07-16) — see `catalog-seed.json`; C is new.*

> **Lesson learned (applies to every run):** deliver results as **plain text with numbers
> inline**, not an equation-editor doc. A and B first came as Google-Docs exports whose numbers
> were embedded as images and got **cropped in the .md/pdf/html/docx exports**; only the
> plain-text `.txt` copies preserved the full SD/range values.

`How this fits the project:` fills gaps **G5** (measured per-bullet G1/G7 BC) and **G6**
(per-load/per-rifle accuracy & dispersion) in [`../Wiki/_gaps.md`](../Wiki/_gaps.md). The
output of each run is ingested into `Documentation/` as a **clearly-marked secondary
source** (same pattern as the existing *Muzzle Velocity Simulation Modeling* report),
spot-checked against the primary books (Litz, McCoy) and the SD-by-class benchmark table in
[`../Wiki/muzzle-velocity.md`](../Wiki/muzzle-velocity.md) before any number enters the
catalog. These are *starting* values, not final truth.

`Teaching-ladder cartridges (v1):` .22 LR · .223 Rem / 5.56 NATO · 6.5 Creedmoor · .308
Win · .300 Win Mag · .338 Lapua Mag · .50 BMG.

`Model mapping:`
- **Prompt A → ammo *lot* truth:** box MV (nominal), lot-to-lot mean-MV shift, per-shot MV
  SD, true BC + BC SD, temperature sensitivity, drag model.
- **Prompt B → rifle *instance* truth + catalog model attrs:** barrel-to-barrel MV offset,
  inherent precision (group MOA), plus barrel length, twist, weight/recoil, barrel life.
  (The game's *zero offset* is a design abstraction we set ourselves; the prompt gathers
  real scope return-to-zero data only as a reference point.)

`Run order:` A first (it feeds the lot model and the game's existing loads); B can run in
parallel or after.

---

## Prompt A — Ammunition / cartridge & load data

> **Role & goal.** You are a ballistics research assistant. I am building a long-range
> shooting *simulation* and need realistic **starting** ammunition parameters for the
> cartridges listed below. Each numeric parameter will be modeled as a **nominal value plus
> a standard deviation** (representing real shot-to-shot and lot-to-lot variation), so I need
> both a central value and a sense of its spread.
>
> **Sourcing rules (important).**
> - Prefer **independently measured / chronographed** data (e.g. PrecisionRifleBlog, Bryan
>   Litz / Applied Ballistics, published PRS/F-Class data, radar-doppler BC) over
>   manufacturer advertising.
> - When you cite an **advertised** figure, label it as advertised and state the **test
>   barrel length** it was measured from (advertised MV is usually optimistic and quoted
>   from a long test barrel).
> - Give **ranges, not just point values**, and **cite every source**. Flag any value that
>   is an educated estimate rather than sourced.
>
> **Cartridges.** For each, cover **two loads**: one **premium match** load and one
> **bulk / FMJ / plinking** load (for .22 LR, match vs. standard bulk):
> .22 LR, .223 Rem / 5.56 NATO, 6.5 Creedmoor, .308 Win, .300 Win Mag, .338 Lapua Magnum,
> .50 BMG.
>
> **For each cartridge × load, report:**
> 1. Representative real product(s) — make, model, and bullet.
> 2. Bullet weight (grains) and construction (match hollow-point/boat-tail, FMJ, etc.).
> 3. **Ballistic coefficient with drag model stated** — G1 *and* G7 if available; note
>    whether measured (doppler/Litz) or advertised.
> 4. **Advertised muzzle velocity** + the **barrel length** it's quoted from; and a
>    realistic **measured MV** from a typical barrel of that cartridge.
> 5. **Muzzle-velocity SD and ES (fps)** — typical values, match vs bulk. *(This is the
>    single most important number.)*
> 6. **Lot-to-lot variation** — how much the mean MV of one production lot differs from
>    another for the same product (fps), and lot-to-lot **BC variation** (%), if known.
> 7. **Temperature sensitivity** — MV change in fps per 10 °F (or a note that the powder is
>    temperature-stable), if available.
> 8. Any known **advertised-BC-vs-true-BC** discrepancy.
>
> **Output format.** One table per cartridge (rows = the two loads), each numeric cell given
> as **nominal + plausible SD (or min–max range)**, plus a **Sources** column and a
> **confidence** flag (sourced / estimated). Follow with a short methodology note on how you
> weighted measured vs advertised data. Sanity-check MV-SD values against these rough class
> brackets and flag outliers: factory match SD ~ <10 fps (excellent), 10–13 (good), 14–17
> (average), >17 (poor).

---

## Prompt B — Rifle / platform data

> **Role & goal.** You are a ballistics/firearms research assistant. I am building a
> long-range shooting *simulation* and need realistic **starting** parameters for typical
> precision rifles chambered in the cartridges below. Each numeric parameter will be modeled
> as a **nominal value plus a standard deviation** (representing unit-to-unit / barrel-to-
> barrel variation), so I need both a central value and its spread.
>
> **Sourcing rules (important).** Prefer independently measured data (rifle reviews with
> chronograph and group data, barrel-maker specs, PrecisionRifleBlog, gunsmith/barrel-life
> data) over marketing. Give **ranges, not just point values**, **cite every source**, and
> flag educated estimates.
>
> **Cartridges (one representative precision rifle class each).** .22 LR, .223 Rem / 5.56
> NATO, 6.5 Creedmoor, .308 Win, .300 Win Mag, .338 Lapua Magnum, .50 BMG.
>
> **For each cartridge's typical precision rifle, report:**
> 1. **Typical barrel length(s)** used for precision work, and how much MV changes per inch
>    of barrel for that cartridge (fps/inch), if known.
> 2. **Typical twist rate(s)**, and **which bullet weights each twist stabilizes** (e.g.
>    .223 1:7 vs 1:9; .308 1:10 vs 1:11.25) — I want to model twist gating which loads
>    perform.
> 3. **Rifle weight** (typical precision build) for recoil context; and **recoil energy
>    (ft-lbf)** if available.
> 4. **Realistic inherent accuracy (group size, MOA)** by tier: factory hunting-grade,
>    factory precision/match, and custom/match-barrel. This feeds the rifle's inherent
>    precision.
> 5. **Barrel-to-barrel MV variation (fps)** — how much two rifles of the *same* spec
>    (same cartridge, barrel length, ammo) differ in average muzzle velocity. *(Key input —
>    it drives the per-rifle MV offset.)*
> 6. **Barrel life** — approximate round count to accuracy loss (contrast an efficient case
>    like .308/6.5 CM against overbore magnums like .300 Win Mag / .338 LM / .50 BMG).
> 7. **Scope return-to-zero / turret tracking repeatability** as a reference figure (I set
>    the game's "zero offset" myself; this is only context).
>
> **Output format.** One table per cartridge/rifle, each numeric cell given as **nominal +
> plausible SD (or min–max range)**, plus a **Sources** column and a **confidence** flag.
> Follow with a short note on twist-rate → bullet-weight compatibility across the ladder,
> since that's the mechanic I most want to get right.

---

## Prompt C — Sighting system / scope mechanical accuracy & repeatability

> **⚠ Delivery format (read first).** Return the results as **plain text with numbers written
> inline** (e.g. `0.985 ± 0.012`), NOT as an equation-editor document. Prior reports came as
> Google-Docs exports whose numbers were embedded as images and got **cropped in every export
> (.md/pdf/html/docx), dropping the SD and range values**. If you use a doc editor, also paste
> a plain-text copy. Every number must survive as selectable text.
>
> **Role & goal.** You are a ballistics/optics research assistant. I am building a long-range
> shooting *simulation* with a single configurable rifle scope, and I need realistic figures
> for the **mechanical accuracy and repeatability of riflescopes** — the errors that sit
> between what the shooter *dials/holds* and what the reticle *actually does*. Each parameter
> will be modeled as a **nominal value plus a standard deviation** (representing unit-to-unit
> variation), ideally broken down by **scope tier: budget/entry (~$300), mid-tier (~$800), and
> top-tier match (~$1,500+)**.
>
> **Sourcing rules (important).** Prefer **independently measured** data — "tall-target" /
> tracking tests, box tests, and published scope evaluations (e.g. PrecisionRifleBlog scope
> tests, Bryan Litz / Applied Ballistics *Accuracy & Precision for Long-Range Shooting*
> tracking data, optics reviewers who measure tracking) — over manufacturer marketing. Give
> **ranges, not just point values**, cite every source, and flag educated estimates.
>
> **For each scope tier, report:**
> 1. **Turret tracking error** — when the shooter dials a known amount (e.g. 10 mil / 30 MOA),
>    how much the reticle *actually* moves. Give it as a **calibration factor** (actual ÷
>    commanded, nominal ± SD, e.g. 0.985 ± 0.012) *and* as a % error, from tall-target tests.
> 2. **Return-to-zero repeatability** — after dialing up and back (and a box test), the 1σ
>    deviation from true zero, in **MIL and MOA** (and clicks).
> 3. **Click value accuracy & consistency** — measured mean value of a nominal 0.1 mil / 0.25
>    MOA click, and click-to-click consistency.
> 4. **FFP reticle subtension accuracy** — measured subtension vs nominal, and how much it
>    drifts across the magnification range (relevant to holdovers and mil-ranging).
> 5. **Tracking orthogonality / reticle cant** — squareness error between elevation and
>    windage travel (degrees), and typical mounted reticle cant.
> 6. **Zero retention** — POA shift under heavy recoil, temperature swings, and transport
>    (per tier; note where budget optics fail).
> 7. **Total elevation travel** — usable internal adjustment (MIL/MOA), since running out of
>    dial gates max range for ELR.
> 8. **Parallax-induced aiming error** — typical POA shift from parallax at representative
>    ranges/settings.
> 9. **Unit-to-unit variation** — how much two same-model scopes differ on the above (this is
>    the spread I most need for the "each scope is a little different" model).
>
> **Output format.** One table per tier (or one table with a column per tier), each numeric
> cell as **nominal ± SD (or min–max range)**, plus **Sources** and **confidence** columns.
> Follow with a short note on which errors matter most at 1,000 yd vs a mile.
>
> *(Game mapping, for context: the tracking factor scales every dialed correction; return-to-
> zero adds a small random zero drift per session; click value sets dial resolution; subtension
> accuracy feeds holdovers + mil-ranging; travel limits gate max range; unit-to-unit variation
> is the scope's version of the rifle/lot hidden truth. The rifle report already gave a first
> cut — top/mid/budget return-to-zero ±0.05/0.15/0.35 MOA and tracking factor 1.000/0.985/0.960
> — so this run is to deepen and source those.)*

---

## After the runs

1. Save each report into `Documentation/` with a `⚠ SECONDARY` header noting provenance
   (which tool, date), like the existing MV-stats report; add a manifest entry in
   [`../Documentation/sources.md`](../Documentation/sources.md).
2. Spot-check the numbers against Litz/McCoy and the `muzzle-velocity.md` SD brackets;
   note any that fail the sanity check.
3. Populate the 2.2 catalog: each field as **nominal + SD** per decision D3
   ([`../archive/increment-2.1-plan.md`](../archive/increment-2.1-plan.md)); close/annotate
   gaps **G5** and **G6** in [`../Wiki/_gaps.md`](../Wiki/_gaps.md).
