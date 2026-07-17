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

## 2.4 Computed DOPE + data book v1
DOPE service: solver-generated come-up table from *box + player zero* (the
baseline the player believes); data book UI listing per rifle+lot: baseline
curve, confirmed nodes, current conditions. Node recording: at a rack, after
hits, "confirm node" stores (range, true come-up dialed, shots fired,
conditions).
**Done when:** book shows baseline vs. confirmed nodes; node confidence label
scales with shots and lot SD (rule: display "confirmed" at ≥N shots where N
derives from SD — unit-tested).

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
