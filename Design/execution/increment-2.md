# Increment 2 — Hidden truth, zeroing, DOPE & truing (task doc)

`Goal:` the game's identity: per-instance hidden truth, zeroing flow, computed
DOPE with two-lever truing, reticle ranging, gear catalog + Range B, save schema
v2. Build-plan §5 Increment 2. `Protocol:`
[`execution-protocol.md`](./execution-protocol.md).

**Increment exit checklist:**

- [ ] A second copy of the same rifle model demonstrably needs its own zero + DOPE.
- [ ] A trued profile beats box values at an untested range (measurably fewer
      shots to first hit).
- [ ] Player can mil-range a labeled known-size target within ~5%.
- [ ] Export→import reproduces the full state on a second device; v1 saves migrate.
- [ ] Golden vectors + all tests green; owner play-check passed.

**Tasks:**

## 2.1 Hidden-truth model + save schema v2
> **Detailed plan:** [`increment-2.1-plan.md`](./increment-2.1-plan.md) (decisions D1–D6
> locked 2026-07-16). It splits this task into **2.1a** (schema v2 + migration + settings
> carry-over), **2.1b** (hidden-truth model), **2.1c** (wire + no-leak guard), and
> **2.1d** (Settings screen — owner request). Note D1: truth is stored as **per-field
> normalized draws mapped on demand**, NOT a re-derived RNG seed.

`GameBuild/app/src/game/hidden-truth.ts`: per rifle **instance** — MV offset, zero offset
(h/v), inherent precision; per ammo **lot** — mean-MV shift, MV SD, true BC, BC
SD; all **mapped deterministically from stored per-field draws + catalog ranges**
(owner-approved; keeps saves small, resists casual spoiling). True values flow
only into engine-bridge calls, never to UI/logs (protocol §4.8). Schema v2:
`rifles[]` (instances), `ammoLots[]` (each carrying its draws); migration v1→v2 +
fixture save in the corpus.
**Carry-over (D5):** persist the store-only durable prefs in this bump —
**`settings.sensitivity`** (aim gain, default 1.0), **`traceEnabled`** (default on), and
**`windMarkerStyle`** (default 'flag'). `mirageEnabled` stays store-only until it ships.
Update `settingsToSave`/`saveToSettings` in
`GameBuild/app/src/state/persist-settings.ts`, and the v1→v2 migration must default each
from `defaultSettings()` for old saves.
**Done when:** vitest — same draws → same truth; distinct instances differ within
catalog ranges; migration green (incl. `sensitivity`/`traceEnabled`/`windMarkerStyle`
defaulted on v1 saves); those settings round-trip through persistence; grep-style check
that no UI/HUD module imports hidden-truth internals.

## 2.2 Gear catalog + inventory
> **Catalog starting data (2026-07-16):** use [`../catalog-starting-values.md`](../catalog-starting-values.md)
> (readable) and [`../catalog-seed.json`](../catalog-seed.json) (engine-ready, imperial + SI,
> mapped to the hidden-truth fields) for the teaching-ladder cartridges (.22 LR, .223/5.56,
> 6.5 CM, .308, .300 WM, .338 LM, .50 BMG). Distilled from the two secondary reports
> `Documentation/{Ammo,Rifle}Research.txt` (**work from the `.txt`, not the image-based
> exports** — see `Documentation/sources.md` §6–7). Values are nominal + SD per D3; two
> fields are **design-set, not in the research** (rifle zero offset h/v; per-shot BC scatter
> `bcSdFraction`). Reconcile the provisional numbers currently in `game/loads.data.json`
> (e.g. 6.5 CM match MV SD 2.7 m/s → seed's 12 fps ≈ 3.66 m/s) when building this task.

Catalog data (`GameBuild/app/src/game/catalog.ts`): rifles .22 LR, .223, 6.5 CM, .308 with
per-model variance *ranges*; 2–3 factory loads each per catalog §C2 (match
low-SD ↔ bulk high-SD, box MV/BC). Inventory UI: acquire (skill-gated, **no
money**), select rifle+lot. Acquiring the same model twice creates two instances.
**Done when:** two copies of one model produce different effective MV/zero in a
dev-flag readout (dev screen only); inventory persists and exports.

## 2.3 Zeroing flow
Zero range session at 100 (and 50 for .22): fire a group, UI overlays group
center vs. point of aim, player dials the correction and confirms zero; the
instance's *player zero* is stored against its hidden zero offset. Teach
don't-chase: UI nudge if the player adjusts after a single shot.
**Done when:** after zeroing, POA=POI at zero range within the load's noise; a
fresh instance starts visibly off-zero; the flow works with both MIL and MOA
turrets.

> **Design notes — dedicated dual-scale zeroing range (owner discussion 2026-07-17/18):**
> - **New range type for sighting-in** with a marked/gridded target you can read a
>   group *center* off (steel gives only hit/miss + swing — no readable POI). The grid
>   is drawn **procedurally in the active angular unit** (mil grid vs. MOA grid), so it
>   follows the MIL/MOA toggle — one parameterized component, not two datasets.
> - **Zeroing + DOPE ranges must exist in BOTH yards and meters.** A player picks their
>   preferred system in prefs and zeros / builds DOPE in that system with round-number
>   stations (imperial → 50/100/… yd; metric → 50/100/… m). These are the ranges where
>   round numbers are pedagogically load-bearing. (Other range types declare a **unit
>   character** — `both` / `yards` / `meters` / `agnostic`; the future unknown-distance
>   field range is `agnostic` — no signs, player ranges via reticle/LRF — a distinct
>   future range type, i.e. new target/ranging/LRF systems, not part of 2.3/2.4.)
> - **Unit resolution is at range ENTRY, not on a live toggle.** The station layout is
>   chosen when you walk onto the range and stays fixed while you shoot. A display-unit
>   flip mid-session must NEVER move the physical world (it would silently invalidate a
>   zero and blow away in-progress engagement/DOPE state).
> - **Zero is stored as a PHYSICAL FACT** (the actual distance in SI + the come-up), not
>   a label. Zero at 100 yd, later switch display to metric → it honestly reads "zeroed
>   at 91.4 m." The toggle converts the label; it does not re-zero. Come-ups convert too
>   (MOA⇄MIL). This physical-fact storage is what makes 2.4/2.5 (DOPE/truing) coherent.
> - **Zero distance is cartridge-appropriate**, one station even if the range offers
>   several: 50 (rimfire) / 100 (centerfire) in the active unit. Zero near, reach far by
>   dialing — you do NOT zero far even for ELR (a .50 zeros at 100, dials up for 1500+;
>   scope elevation-travel + canted base gate whether far is even reachable). Whether the
>   player may *choose* the zero distance (100 default vs a 200 doctrine) is deferred —
>   v1 leans auto-by-cartridge×system.

## 2.4 Computed DOPE + data book v1
DOPE service: solver-generated come-up table from *box + player zero* (the
baseline the player believes); data book UI listing per rifle+lot: baseline
curve, confirmed nodes, current conditions. Node recording: at a rack, after
hits, "confirm node" stores (range, true come-up dialed, shots fired,
conditions).
**Done when:** book shows baseline vs. confirmed nodes; node confidence label
scales with shots and lot SD (rule: display "confirmed" at ≥N shots where N
derives from SD — unit-tested).

> **Design notes — dual-scale DOPE range (owner discussion 2026-07-18):**
> - **Dedicated DOPE / confirmation range in BOTH yards and meters** (same dual-scale
>   requirement as the zeroing range, 2.3). Multi-distance station ladder (e.g.
>   50/100/300/500/800 in the active unit) where the player shoots each distance, sees
>   how far their *box-value* DOPE misses because true MV/BC differ, and records the
>   real come-ups. Station ladder extent is gated per cartridge by **effective range**
>   (add effective-range to the catalog) — don't offer 1500 for a .22.
> - **DOPE rows are PHYSICAL FACTS** (distance in SI + measured come-up + conditions),
>   like the zero. Build DOPE at yard stations, later switch display to metric → rows
>   read as the *converted* distances (100 yd → 91 m, 200 yd → 183 m…), **not** round
>   100/200 m — because you didn't shoot there. To get round-metric DOPE you re-shoot at
>   metric stations. This is correct-by-design and a good teaching artifact (DOPE is tied
>   to where you actually shot). Come-ups convert MOA⇄MIL on display.
> - Same **entry-time unit resolution** + **no live-morph** rules as 2.3.

## 2.5 Two-lever truing
`truing.ts`: given nodes, fit (1) **effective MV** primarily from the nearest
node ≤ ~600 yd, (2) **BC/drag scale** from the farthest node (near transonic
preferred); solver then uses trued params for untested ranges. Implementation:
simple 2-parameter least-squares over node residuals via repeated engine solves
(worker); no closed form needed.
**Done when:** vitest with synthetic truth — construct a hidden truth, confirm
nodes at 300 + 900 yd, truing recovers effective MV within ±5 fps and drag scale
within ±2%, and predicted come-up at an untested 600 yd is closer to truth than
the box prediction in ≥95% of 100 seeded trials.

## 2.6 Reticle ranging on KD
Known-size metadata on plates (already sized in scene config); ranging UI: player
brackets target with reticle, enters read mils/MOA (or taps subtension markers),
`Range = size×1000÷mils` / `size_in×95.5÷MOA` shown both ways
(per `Wiki/range-estimation.md`); KD signs let them verify. FFP correctness from
task 1.3's tested projection.
**Done when:** ranging a labeled plate lands within 5% when the reticle read is
accurate (automated test drives the projection math end-to-end); UI teaches the
formula per the Wiki article.

## 2.7 Range B + skill gates
Range B (100→1000 yd) scene; unlock rule: KD mastery on A (e.g. ≥80% first-round
hits over a qualifying string) opens B; gates defined in data, not code.
Transonic feedback near 1000 for .308-class loads (HUD notes retained
velocity/Mach from the solve).
**Done when:** gate triggers off recorded performance; 1000 yd .308 shots show
Mach < ~1.2 flagging in the HUD.

## 2.8 Export/import v2 + exit
Full-state export (instances, lots, nodes, trued params, progression); import on
a second device reproduces the data book exactly. Run exit checklist; tag
`inc2-complete`; then run the JIT planning procedure in
[`increments-3-6.md`](./increments-3-6.md) before any Increment-3 work.
**Done when:** exit checklist green; owner sign-off logged.
