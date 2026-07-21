# Increment 2.2 plan — gear catalog + inventory

`Status: LOCKED — decisions D1–D10 agreed with owner 2026-07-17; ready to build 2.2a` · `Date: 2026-07-17`
`Covers:` PROGRESS task **2.2** (gear catalog + inventory), proposed split into **2.2a / 2.2b / 2.2c**.
`Authority:` refines [`increment-2.md`](./increment-2.md) §2.2 under [`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's *Done when* clauses — it decides the *how* and the task split so each sub-task fits the §3 size limit. **Live state + per-task deltas live in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this doc is the point-in-time plan.**

> Task 2.1 gave us the **hidden-truth primitive** (draws → truth via `deriveXTruth`),
> the **v2 save shell** (`rifles[]` / `ammoLots[]`), and the **engine-bridge boundary**
> (`resolveTruth`). 2.2 is what fills all three: it authors the **catalog** (rifle models
> + ammo loads + their believed box values AND their hidden-truth ranges), lets the player
> **acquire** instances (rolling per-field draws with `crypto`) and **select** a rifle + lot,
> and **persists** the owned gear in the v2 save. It is the last foundation task before the
> gameplay that consumes truth — **zeroing (2.3)**, **DOPE (2.4)**, **truing (2.5)** — all
> read the instances 2.2 creates. Get the catalog shape and the acquire/persist path right
> and those flow; get them wrong and every later task inherits the debt.

> **Decisions D1–D10 are LOCKED (owner, 2026-07-17)** — see §3. Headlines: 2.2 is catalog +
> Store + inventory + a **dev-only** believed-vs-true readout; **the range/live solve is
> untouched** (true ballistics into the solve, and zeroing, are 2.3). Ship the **4** cartridges
> (D1) × **3 rifle tiers** (Hunting/Factory Match/Custom, D5) + 2 ammo grades each; acquire from a
> **Store** on the landing, swap gear at the range via a non-destructive **Loadout** overlay (D3);
> believed = advertised box, true = measured MV + hidden offsets (D6); the dev **TruthInspector**
> shows rifle/ammo stats, effective mean MV + SD, and a 100/400/800 yd vertical-spread table, on a
> guard allowlist + tree-shaken from prod (D9).

---

## 1. What already exists (so we build, not rebuild)

- **The hidden-truth model is built and tested (2.1b/c).** `game/hidden-truth.ts` exposes
  `deriveRifleTruth(ranges, draws)` / `deriveLotTruth(ranges, draws)`, the bell-curve map
  `bellCurveValue({nominal, sd}, draw)` (probit, clamp ±3 SD, draw 0.5 → nominal), the
  **catalog-ranges interfaces** the catalog must satisfy —
  `RifleTruthRanges { mvOffset, zeroH, zeroV, inherentPrecision }` and
  `LotTruthRanges { meanMvShift, mvSd, bc, bcSd }`, each field a `FieldRange {nominal, sd}` —
  and the boundary seam `resolveTruth(rifle, rifleRanges, lot, lotRanges) → TrueBallistics`
  where `totalMvOffsetMps = rifle.mvOffsetMps + lot.meanMvShiftMps` (catalog §D's two hidden
  MV contributors). **2.2's catalog is exactly the thing that produces those ranges.**
- **The v2 save shell exists (2.1a).** `persistence/schema.ts` defines `RifleInstance
  { id, catalogId, catalogVersion, draws, playerZero? }` and `AmmoLot { id, catalogId,
  catalogVersion, draws }`; `SaveData.rifles[]` / `.ammoLots[]` are required arrays;
  `validateSaveShape` validates each record (id/catalogId strings, integer `catalogVersion`,
  every draw finite in `[0,1)`, `playerZero` when present). The migration corpus already has
  a **v2-with-gear fixture** (2.1c). Draws are rolled at acquisition (2.1 D4) with
  `crypto.getRandomValues`; 2.1's tests hand in explicit draws.
- **Persistence is now actually wired (2.1d fix).** `main.tsx` calls
  `persistSettingsOnChange` + `loadSettingsInto` against `createSaveStore()` at boot. **But
  `state/persist-settings.ts` still projects settings onto `DEFAULT_SAVE` and does NOT carry
  `rifles[]`/`ammoLots[]`** — the 2.1a-flagged gap. Harmless while no gear exists; **2.2 must
  fix this** or acquiring gear then changing a setting wipes the gear.
- **The no-leak guard is live (2.1c).** `game/hidden-truth.guard.test.ts` asserts no file under
  `scope/ range/ shell/ debug/ state/` imports `game/hidden-truth`. The catalog + inventory UI
  must honour it; the **dev effective-truth readout** (2.2's Done-when) is the one place that
  needs truth in a UI dir — see **D9**.
- **Increment-1's load path works and must keep working.** `game/loads.ts` builds two box-true
  6.5 CM `GameLoad`s from `validation/loads.json` `si` (the golden-vector oracle, **never
  modified**) + provisional dispersion in `game/loads.data.json`. The live shot loop
  (`ScopeView`) uses `getGameLoad(DEFAULT_GAME_LOAD_ID)`. **Non-goal: 2.2 does not change how
  the Increment-1 loop solves** — the selected instance doesn't feed the live solve until 2.3.
- **Starting catalog data is already produced (owner, 2026-07-16).**
  [`../bullet-catalog/catalog-starting-values.md`](../bullet-catalog/catalog-starting-values.md) (readable) +
  [`../bullet-catalog/catalog-seed.json`](../bullet-catalog/catalog-seed.json) (engine-ready, imperial + SI, mapped to the
  hidden-truth fields) cover **7 cartridges** (.22 LR, .223/5.56, 6.5 CM, .308, .300 WM,
  .338 LM, .50 BMG), **match + bulk** each, with rifle-model attrs (barrel, twist + gating,
  weight, recoil, barrel life, MV/inch), per-instance/per-lot hidden ranges (nominal + SD),
  believed box MV/BC vs. true MV/BC, temp sensitivity, and a **scope quality-tier table**.
  Two fields are explicitly **design-set** (not in the research): rifle zero offset h/v
  (`N(0, 1.0 MOA)`, clamp ±3 MOA) and per-shot BC scatter `bcSdFraction` (match 0.5% /
  bulk 1.5%). The seed's `_modelMapping` names exactly how each field maps to the 2.1b model.

## 2. Architecture at a glance

```
game/catalog.data.json  (trimmed from Design/bullet-catalog/catalog-seed.json — the shipped cartridges)
         │   rifle models + ammo loads: believed (box) values + hidden RANGES {nominal, sd} + model attrs
         ▼
game/catalog.ts  ── typed loader + two adapters ───────────────────────────────┐
   • RIFLE_MODELS / AMMO_LOADS (believed box values, model attrs, tiers)        │
   • catalogRifleRanges(modelId)  → RifleTruthRanges  (satisfies 2.1b)          │
   • catalogLotRanges(loadId)     → LotTruthRanges     (satisfies 2.1b)         │
   • believedLoad(loadId)         → engine `Load` (box MV/BC — player's DOPE)   │
         │                                                                       │
         │  acquire (2.2b): rollDraws(fieldNames, rng)  ── rng = crypto in prod, injected in tests
         ▼                                                                       │
state/store.ts  `inventory` slice ───────────────────────────────────────┐      │
   rifles: RifleInstance[]  ammoLots: AmmoLot[]  activeRifleId  activeLotId │      │
   actions: acquireRifle / acquireLot / selectRifle / selectLot            │      │
         │                                                                  │      │
         ▼                                                                  ▼      ▼
persistence (v2)  ◄── persist gear arrays (FIX the DEFAULT_SAVE-wipe gap)   resolveTruth(...)
   rifles[] / ammoLots[] + activeRifleId? / activeLotId? (additive-optional)   (engine-bridge boundary)
         ▲                                                                          │
         │                                                                          ▼
   Inventory / Loadout UI (shell/) ── believed values ONLY (no truth leak)   dev-only effective-truth
   acquire · select · view                                                    readout (D9: guard allowlist
                                                                              + prod tree-shake)
```

Invariants honoured: **guardrail §4.8 / catalog §0** (truth never in player-facing UI/logs — the
inventory shows only believed box values; the effective readout is dev-gated, D9), **§4.6** (gear
now persists — the arrays finally ride the save; `activeRifleId?`/`activeLotId?` are
additive-optional per 2.1 D6, no new bump), **protocol §4** (no new deps — draws use platform
`crypto`), and **the Increment-1 non-goal** (the live solve is untouched until 2.3).

## 3. Decisions — PROPOSED (discuss before building)

**D1 — Ship the 4 cartridges `increment-2.md` names (.22 LR, .223, 6.5 CM, .308).** ✅ LOCKED 2026-07-17
Structured so the other 3 (.300 WM, .338 LM, .50 BMG) drop in later with no schema change — they
stay in `catalog-seed.json`, just not copied into `catalog.data.json` yet. The 4 span the teaching
arc (rimfire → light match → medium → standard).

**D2 — Catalog is additive; the Increment-1 solve/range path is untouched in 2.2.** ✅ LOCKED 2026-07-17 (option a)
2.2 builds the catalog + inventory + a **dev-only** readout of believed-vs-true; **nothing on the
range changes** — wiring the selected instance's true ballistics into the actual solve, *and* the
zeroing flow, both land in **2.3**. Specifics:
- `validation/loads.json` stays the **untouched engine oracle** (golden vectors); `game/loads.ts`
  + `loads.data.json` + the live shot loop stay **exactly as they are**.
- Add a **consistency test** that the catalog's *believed* 6.5 CM match box values (MV, BC, mass,
  diameter) equal the oracle `si` block, so the KD loop's numbers can't silently drift.
- **Defer** the `loads.data.json` reconciliation (6.5 CM per-shot MV SD 2.7 → seed 3.66 m/s) to
  **2.3**, when the selected instance actually feeds the solve and the provisional file retires;
  the catalog carries the correct seed numbers now.
- **Attribution (dev readout):** MV **offset** + inherent **precision** are per-RIFLE (two copies
  of a model differ in mean MV + group size); per-shot MV **SD**, true **BC**, and mean-lot
  **shift** are per-AMMO-LOT (two lots differ in SD/BC). Effective MV = box MV + rifle offset +
  lot mean shift. The readout attributes each to rifle vs. lot so it reads correctly and teaches
  the distinction.

**D3 — Two surfaces: a "Store" (acquire, pre-range) + an in-range "Loadout" switcher (select owned gear without ending the session).** ✅ LOCKED 2026-07-17
Owner's longer-term vision: a **Store** to buy guns/ammo from, and at the range the ability to
see what you own and swap between them mid-session.
- **Store (acquire):** reachable from the **range-select landing** (a "Store" entry alongside
  Range A). Browse the catalog, acquire instances into inventory. Acquisition happens here, not
  at the range.
- **Loadout (select):** an **in-scope overlay** (non-destructive, same pattern as the 2.1d
  Settings overlay — NOT the "Return to range select" reset path) listing owned rifles + ammo;
  sets `activeRifleId` / `activeLotId`. The player can **cycle through owned guns/ammo without
  backing out and restarting the session.**
- **2.2 scope:** the Loadout selection is **inert on the solve** (reflected only in the dev
  readout); it drives the actual solve in **2.3**. **Forward constraint for 2.3:** swapping the
  active rifle/lot mid-session must NOT reset the engagement (budget / score / committed target
  carry) — it re-solves for the new gear in place. (Trivially satisfied in 2.2 since nothing
  on the range changes; called out so 2.3 honours it.)

**D4 — "Skill-gated acquisition, no money": no real gate in 2.2.** ✅ LOCKED 2026-07-17
Everything is freely acquirable, with a clearly-marked `isUnlocked(catalogId, progress)` seam
stubbed to `true` so the future progression task imposes gates without reshaping the catalog or
inventory. (No progression counter exists to gate on yet.)

**D5 — Expose all three rifle tiers (Hunting / Factory Match / Custom) per cartridge.** ✅ LOCKED 2026-07-17
Owner wants the full precision range visible. The catalog carries **one RifleModel per (cartridge,
tier)** — 4 cartridges × 3 tiers = **12 acquirable rifles** — each using that tier's
`inherentPrecisionMOA` range (seed `factoryHunting` / `factoryMatch` / `customMatch`). The tier is
encoded in the `catalogId` (e.g. `6.5cm-custom`), so a `RifleInstance` needs no extra field and
`catalogRifleRanges(catalogId)` returns the tier-specific precision range. All other rifle attrs
(barrel, twist, weight, recoil, barrel life, MV-offset spread) are **per-cartridge, shared across
tiers** — the seed differentiates only precision by tier (a modeling simplification: a custom
barrel's tighter MV consistency isn't separately modeled). All 12 freely acquirable in 2.2 (D4);
tier-gating is a future concern via the `isUnlocked` stub. Store shows **12 rifles + 8 ammo loads**
(4 cartridges × 2 grades).

**D6 — Believed = advertised box; true base = measured MV + hidden offsets.** ✅ LOCKED 2026-07-17
The player's **believed** load uses **advertised `boxMvFps` + advertised BC**; the **true base**
MV is **`measMvFps.nom`**, onto which the hidden `mvOffset` (barrel-to-barrel) + `meanMvShift`
(lot) are added: `trueMv = measMvFps.nom + mvOffset + meanMvShift`. The believed-vs-true gap is
the honest optimism-of-advertising the game teaches, and it's exactly what the dev panel surfaces
(box MV beside computed effective mean MV; effective SD; actual vertical spread at range — see
2.2c).

**D7 — Barrel length + twist gating carried as catalog data only (no ballistics wiring).** ✅ LOCKED 2026-07-17
Both are stored + displayed in the Store, but **not wired into ballistics** in 2.2: copy-to-copy
MV variation stays folded into the `mvOffset` spread (no separate barrel-length→MV model), and
twist-gating is display text only (no pairing enforcement / stability effect). Both interact with
the solve, which 2.2 doesn't touch; enforcement + barrel-length physics are a clean later addition.

**D8 — Scope quality tiers out of 2.2.** ✅ LOCKED 2026-07-17
2.2 is rifles + ammo. Scope mechanical error (tracking factor, return-to-zero, cant, subtension)
is its own optic-config concern for a later task; the seed's scope table is flagged low-confidence
and needs re-sourcing before it drives anything. (feature-catalog §C3: one configurable optic, no
scope catalog.)

**D9 — How does the dev effective-truth readout coexist with the no-leak guard?** 📌📌
The Done-when needs a **dev-screen readout showing two copies' differing effective MV/zero** —
which means importing `resolveTruth` (hidden truth) into a UI dir the guard scans (`debug/`).
**Recommend:** put it in a single, explicitly-named dev module (e.g. `debug/TruthInspector.tsx`),
add that one path to a **guard allowlist** (the guard keeps failing for every *other* file), and
assert it is **tree-shaken from the prod bundle** (behind `import.meta.env.DEV`, like `DevTools`
— reuse the 1.8a dist-grep proof). This preserves "no player-facing leak" while sanctioning the
dev diagnostic. *Alternative: expose effective values only through a dev-gated store selector —
but that just relocates the same import; the allowlist is more honest.*

**D10 — `catalogVersion: 1` + active-selection persisted as additive-optional fields.** ✅ LOCKED 2026-07-17
Every acquired record is stamped **`catalogVersion: 1`** (dev-drift accepted per 2.1 D2 until a
pre-release freeze). The active rifle/lot selection persists as **additive-optional
`activeRifleId?` / `activeLotId?`** on `SaveData` (durable loadout; no version bump, validated
when present — the 2.1 D6 pattern).

## 4. Task split (each stops for owner per protocol §2.8)

Three sub-tasks, dependency-ordered, each independently verifiable and within the §3 size limit
(~400 lines / ~10 files). PROGRESS label **2.2** becomes **2.2a / 2.2b / 2.2c**.

### 2.2a — Catalog data + types + truth-range adapters
*Pure data + mapping; engine-free except the believed-`Load` builder. No store, no UI.*
- `game/catalog.data.json`: the shipped cartridges (D1) copied from `catalog-seed.json` — rifle
  model attrs + believed box values + hidden ranges (nominal + SD) + design-set fields.
- `game/catalog.ts`: typed `RifleModel` / `AmmoLoad` loaders; `catalogRifleRanges(modelId) →
  RifleTruthRanges` and `catalogLotRanges(loadId) → LotTruthRanges` (the seed→2.1b field mapping,
  incl. `mvOffset = {0, barrelToBarrelSd}`, `zeroH/V = {0, designSet}`, `bc = {trueBc, trueBc·lotBcVarPct/100}`,
  `bcSd = {perShotBcSdFraction, 0}`); `believedLoad(loadId) → Load` (box MV/BC, for the player's DOPE).
- `game/catalog.test.ts`: every model/load resolves; **every derived range satisfies `nominal ≥
  3·sd` for non-negative fields** (so clamped truth can't go negative); a range fed through 2.1b's
  `deriveXTruth` produces finite, in-band truth; **believed 6.5 CM match box values equal the
  oracle `si` block** (D2 consistency); drag models are 'G1'|'G7'.
- **Done when:** the above tests are green; `game/catalog.ts` imports nothing from `state`, `scope`,
  `range`, `shell`, `debug`, or React (it may import `hidden-truth` *types* + `engine-bridge` `Load`
  type + the units service); `tsc` + `vitest` + `npm run build` green; `node …/run.mjs` green (oracle untouched).

### 2.2b — Acquisition + inventory store slice + gear persistence
*Store + save-store; the primitive that turns catalog entries into owned, persisted instances.*
- `game/acquire.ts` (or in catalog.ts): `rollDraws(fieldNames, rng) → draws` where `rng: () =>
  number` (injected — `crypto.getRandomValues`-backed in prod, deterministic in tests);
  `acquireRifle(modelId, rng)` / `acquireLot(loadId, rng)` build `RifleInstance` / `AmmoLot`
  records (id, catalogId, `catalogVersion: 1`, draws).
- `state/store.ts`: new `inventory` slice (`rifles`, `ammoLots`, `activeRifleId`, `activeLotId`)
  + actions (`acquireRifle`, `acquireLot`, `selectRifle`, `selectLot`); acquiring the same model
  twice appends a second distinct instance.
- `state/persist-settings.ts` (or a new `state/persist-inventory.ts`): **fix the DEFAULT_SAVE-wipe
  gap** — the persisted save now carries `rifles[]`/`ammoLots[]` (+ `activeRifleId?`/`activeLotId?`)
  merged with settings, so a settings change no longer wipes gear; `schema.ts` gains the two
  additive-optional active-id fields (validated when present).
- Tests: acquire the same model twice → two instances, **different draws → different resolved
  truth** (via 2.1b); a full **acquire → persist → reload (MemorySaveStore) → same instances +
  same resolved truth** round-trip (determinism through storage); a **settings change does not
  wipe owned gear** (the regression the fix targets); active selection persists.
- **Done when:** those tests green; `tsc` + `vitest` + `npm run build` green; `node …/run.mjs`
  green (engine untouched).

### 2.2c — Store + Loadout UI + dev effective-truth readout
*UI over the store; delivers the increment-2.md §2.2 Done-when. May split into 2.2c (Store +
acquire) / 2.2d (in-range Loadout switcher + dev readout) if it exceeds the §3 size limit.*
- `shell/StoreScreen.tsx`: reachable from the range-select landing (D3); browse the catalog and
  **acquire** rifles/ammo into inventory — showing **believed box values ONLY** (no truth). Free
  to acquire (D4 stub).
- `shell/LoadoutOverlay.tsx`: an in-scope, non-destructive overlay (2.1d Settings-overlay pattern,
  NOT the reset path) listing owned rifles + ammo; sets `activeRifleId` / `activeLotId` so the
  player cycles gear **without ending the session** (D3). Believed values only.
- `debug/TruthInspector.tsx` (dev-only, D9): renders **two copies of one model** side by side and,
  for a selected rifle instance + ammo lot, calls out (via `resolveTruth`, attributed per D2):
  **rifle** — MV offset + inherent precision (MOA); **ammo** — mean-lot shift, per-shot MV SD,
  true BC, BC SD; **computed** — effective **mean MV** (= measured base + rifle offset + lot shift)
  beside the believed box MV, effective **SD** (the ammo's), and a small **vertical-spread table
  with fixed rows 100 / 400 / 800 yd** — the group's vertical (y) 1σ at each range, obtained by
  running the **true-gear `MatchSimulator`** (the same engine hit-sim the Inc-1 loop uses, task
  1.4a) per row, with the MV-SD-only component split out from the rifle's angular contribution.
  This is a dev-only engine **read** — it does NOT wire the active instance into the live shot loop
  (D2 holds). Behind `import.meta.env.DEV`, added to the guard allowlist, proven tree-shaken from
  prod. (May import `engine-bridge` freely; the allowlist exception is specifically for its
  `hidden-truth` import.)
- `game/hidden-truth.guard.test.ts`: add the single `debug/TruthInspector.tsx` allowlist exception
  (documented); every other UI-dir file still asserted clean. Prod-bundle grep proves the inspector
  is dropped (reuse the 1.8a technique).
- **Done when (increment-2.md §2.2 verbatim):** two copies of one model produce different effective
  MV/precision in the dev readout; inventory persists and exports (through the real save +
  export/import); `tsc` + `vitest` + `npm run build` green; `node …/run.mjs` green. **OWNER CHECK
  (device):** acquire two of the same rifle from the Store, cycle the Loadout at the range without
  restarting, confirm it survives relaunch and rides an export/import; the player-facing UI shows
  only believed values.

**Order & stops:** 2.2a → 2.2b → 2.2c. **STOP for owner confirmation after each** (protocol §2.8).
Commit per task (`inc2/task2.2a: …`, owner-side per the git agreement).

## 5. Risks, constraints, and non-goals

- **Non-goal (belongs to later tasks):** no change to how the Increment-1 loop solves (D2) — the
  selected instance does not feed the live firing solution until **2.3 zeroing**; no zeroing/DOPE/
  truing (2.3–2.5); no scope catalog (D8); no twist-gating enforcement or barrel-length→MV physics
  (D7); no real progression/skill gate (D4).
- **Persistence is now live (2.1d) — the gear-wipe gap is a REAL bug the moment gear exists.** 2.2b
  fixing the `settingsToSave`/`DEFAULT_SAVE` projection is load-bearing, not cosmetic; its regression
  test is mandatory.
- **Secondary-source data:** `catalog-seed.json` is a clearly-marked secondary source (two AI
  research reports), spot-checked but not final; `catalog-starting-values.md` says "spot-check before
  shipping." Two fields are design-set, not sourced (zero offset, per-shot BC scatter). These are
  *starting* values — a tuning surface, not ground truth (Wiki gaps G5/G6).
- **No-leak discipline (D9):** the effective-truth readout is the first sanctioned truth-in-UI-dir
  code; the allowlist must stay a single named dev file with a prod tree-shake proof, or the guard's
  value erodes.
- **Determinism is load-bearing:** truth must stay a pure function of `(ranges, draws)` and draws are
  fixed at acquisition — export/import (2.8) and truing's synthetic tests (2.5) depend on it. Keep the
  RNG **only** in the acquire action (injected), never in derivation.
- **catalog drift (2.1 D2):** editing a catalog range shifts already-owned dev instances until a
  pre-release freeze; accepted in development (wipe the dev save if disruptive).

---

**Next step:** discuss D1–D10 with the owner, fold decisions back into this doc (flip status to
LOCKED), then build **2.2a**, verify, log to `PROGRESS.md`, and STOP for owner confirmation before
2.2b — per [`execution-protocol.md`](./execution-protocol.md) §2.
