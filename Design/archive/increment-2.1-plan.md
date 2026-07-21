# Increment 2.1 plan — hidden-truth model + save schema v2

`Status: decisions D1–D6 LOCKED with owner 2026-07-16 — ready to build 2.1a` · `Date: 2026-07-16`
`Covers:` PROGRESS task **2.1** (hidden-truth model + save schema v2), split into **2.1a / 2.1b / 2.1c / 2.1d**.
`Authority:` refines [`increment-2.md`](./increment-2.md) §2.1 under [`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's *Done when* clauses — it decides the *how* and the task split so each sub-task fits the §3 size limit. **Live state + per-task deltas live in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this doc is the point-in-time plan.**

> This is the first task of Increment 2, so it lays foundations the rest of the
> increment stands on: the **hidden-truth** primitive (2.1) is consumed by zeroing
> (2.3), DOPE (2.4), and truing (2.5); the **save schema v2** shell (2.1) is populated
> by the gear catalog (2.2) and every task after. Get these two right and the
> increment flows; get them wrong and every later task inherits the debt.

> **Decisions locked with owner (2026-07-16), deltas from the first draft:**
> - **D1 changed** — the design does **not** store an RNG seed and re-derive. It stores
>   the **per-field normalized draws** directly and maps them to truth on demand. No
>   PRNG, no seed, no sub-streams (see D1). This is simpler than the drafted
>   seed-derivation and keeps the same casual-spoiling resistance.
> - **D4 dropped** — with no seed, there is nothing to "mint"; draws are rolled at
>   acquisition (task 2.2) with `crypto.getRandomValues`, and 2.1's tests/fixtures hand
>   in explicit draws.
> - **New task 2.1d — Settings screen** added right after 2.1c (owner request): a real
>   Settings screen, reachable from the existing Menu button, that becomes the home for
>   the persisted settings and lifts the toggles out of the scope HUD.

---

## 1. What already exists (so we build, not rebuild)

- **Save schema v1 is a clean, versioned seam.** `persistence/schema.ts` defines
  `CURRENT_SCHEMA_VERSION = 1`, `SaveData { schemaVersion, updatedAt, settings }`,
  `SaveSettings { unitsPrimary, windRealism? }`, structural `validateSaveShape` (runs
  *before* migration), and `DEFAULT_SAVE`. `persistence/migrations.ts` already has the
  forward-migration ladder (`migrations[n]: vN→vN+1`, driven by `migrateSave`) with a
  comment reserving `1: v1toV2` **for exactly this task**. The migration corpus lives in
  `persistence/persistence.test.ts`.
- **`windRealism` set the precedent for additive-optional fields** — it was added to
  `SaveSettings` as an optional field *without* a version bump (validated only when
  present, defaulted to `'steady'` on load). This precedent is load-bearing for D6: the
  record-growth fields (player zero, nodes, trued params) ride in the same way, with no
  further bump.
- **Settings persistence wiring is a pair of pure mappers.** `state/persist-settings.ts`
  has `settingsToSave` / `saveToSettings` (unit-tested) plus thin async glue
  (`loadSettingsInto`, `persistSettingsOnChange`). The store's `SettingsState`
  (`state/store.ts` ll. 104–128) carries **six** fields; only `unitsPrimary` +
  `windRealism` persist today. `sensitivity`, `traceEnabled`, `windMarkerStyle`, and
  `mirageEnabled` are store-only (each commented as waiting on "the schema v2 bump").
  `defaultSettings()` is the single defaults source (`sensitivity: 1.0`,
  `traceEnabled: true`, `windMarkerStyle: 'flag'`, `mirageEnabled: false`).
- **All settings toggles currently live inline in the scope HUD.** `scope/ScopeView.tsx`
  ll. 1018–1202 render units / sensitivity / trace / wind-realism / marker-style / mirage
  as a list in the top-left panel. A **Menu** button already exists (top-right,
  `ScopeView.tsx` ~ll. 979–1002, task 1.8a) and currently routes to range-select — the
  natural hook for the 2.1d Settings screen.
- **The engine seam is already the only place true ballistics flow.** `game/loads.ts`
  builds a `GameLoad { load: Load, dispersion, twistM }` from the oracle fixture; the
  solve path is `engine-bridge/index.ts` (`solveTrajectory`, `setupZeroedSimulator`,
  `computeZero`, `spinRateFromTwist`) plus `engine-bridge/match-sim.ts`. Increment 1's
  loads are **box-true** ("the box values ARE true" — `loads.ts` header): there is no
  offset between believed and real ballistics yet. 2.1 introduces that gap as a
  first-class, hidden primitive.
- **The catalog spec is written, not yet coded.** `feature-catalog.md` §C1 (rifles),
  §C2 (ammo), and §D ("Hidden truth & the DOPE loop — the game's identity") define the
  per-instance/per-lot unknowns: rifle copy → *MV offset, zero offset (h/v), inherent
  angular precision*; ammo lot → *mean-MV shift, MV SD, true BC, BC SD*. §D is explicit
  that these fixed unknowns are **distinct from the per-shot spread** the engine already
  models (the irreducible cone from Increment 1). Note MV has **two** hidden contributors
  — the rifle's offset and the lot's mean shift — summed onto the load's box MV.
- **increment-2.md §2.1 already fixes several decisions** we honour: truth derives
  deterministically from a stored roll + catalog ranges (small saves, resists casual
  spoiling); true values *"flow only into engine-bridge calls, never to UI/logs"*
  (protocol §4.8); the v2 shape is *"`rifles[]` (instances), `ammoLots[]`"*; and
  `settings.sensitivity` is an explicit carry-over to fold into this bump.

## 2. Architecture at a glance

```
SAVE (persistence/schema.ts)  ──────── v2 ────────►  SaveData {
  schemaVersion: 2                                     rifles:   RifleInstance[]  // {id, catalogId, catalogVersion, draws{...}, playerZero?}
  settings: { unitsPrimary, windRealism,               ammoLots: AmmoLot[]        // {id, catalogId, catalogVersion, draws{...}}
              sensitivity, traceEnabled,               settings, updatedAt }
              windMarkerStyle }                             │
        │                                                   │  draws = normalized [0,1) values per field.
        │ migrate v1→v2 (empty arrays; settings defaulted)  │  NOT the truth, NOT a seed — mapped on demand.
        ▼                                                   ▼
  persist-settings.ts (3 new fields round-trip)       game/hidden-truth.ts
        ▲                                              deriveRifleTruth(ranges, draws) ─► RifleTruth
        │                                              deriveLotTruth  (ranges, draws) ─► LotTruth
  2.1d Settings screen (Menu → Settings)                    │  (bell-curve map: draw→value, D3)
  reads/writes the same store settings                      ▼
                                          engine-bridge/*  ◄── truth enters ONLY here (solve inputs)
                                                              ▲
                                          UI / HUD / scope / range / shell / debug
                                             ── MUST NOT import hidden-truth internals
                                                (encapsulation guard test, 2.1c)
```

Design invariants honoured: **guardrail §4.6** (the structural change bumps
`schemaVersion` + ships a migration + a fixture save), **§4.8 / catalog §0** (hidden
truth never reaches UI/logs), **protocol §9** (all embind stays in `engine-bridge/`), and
**protocol §4** (no new npm deps — there is no PRNG at all; rolls use the platform
`crypto.getRandomValues` at acquisition).

## 3. Decisions — LOCKED (owner sign-off 2026-07-16)

**D1 — Store the per-field normalized draws; map to truth on demand. No seed, no PRNG.** ✅
Each rifle/lot record stores a `draws` map of normalized `[0,1)` values keyed **by field
name** (`{ mvOffset, zeroH, zeroV, inherentPrecision }` for a rifle;
`{ meanMvShift, mvSd, bcError, bcSd }` for a lot). The draws are the stored identity; the
truth is computed on demand by mapping each draw through its catalog range (D3). Keying by
name (not a positional array) means a *new* hidden field later is just a new key — nothing
existing reshuffles. This keeps casual-spoiling resistance (a bare `0.42` is meaningless
without the mapping + ranges) while deleting the seed/PRNG/sub-stream machinery entirely.

**D2 — Stamp `catalogVersion` on each record now; accept drift in dev; commit to freeze before first real release.** ✅
Because truth = map(draw, catalog ranges), editing a catalog range in a future update
would shift already-owned instances. 2.1 **stamps each record with the `catalogVersion` it
was rolled under** (one cheap field; rides in v2 so no future migration is needed to add
it) but **builds no freezing machinery** — during development the numbers are provisional
and we accept drift (a disruptive change just means wiping the dev save). Before the first
real release we commit to a freeze — either a **policy** ("post-release we only *add*
models/loads, never edit a shipped model's spread") or **versioned range tables** keyed by
`catalogVersion`. Escape hatch if we ever must change a shipped spread: that update's
migration bakes the affected instances' current values in as a one-time override.

**D3 — Bell-curve map centered on the box nominal, catalog authored as nominal + SD, clamped at ±3 SD.** ✅
A draw maps via an inverse-normal so values cluster near the box nominal and extremes are
rare (matches real barrel-/lot-to-lot variation), rather than a flat min–max band. The
catalog authors each field as **nominal + standard deviation** (SD is the native ballistic
unit), and the map clamps at **±3 SD** so a freak draw can't produce an absurd instance.
Reference points: draw 0.5 → exactly nominal; 0.84 → +1 SD. Note some *lot* fields are
themselves spreads (e.g. "true MV SD") — that's just the same bell-curve map applied to an
SD-valued field; one level of nesting, no special-casing.

**D4 — (dropped)** ✅ No seed to mint. Draws are rolled at acquisition (task 2.2) with
`crypto.getRandomValues`; 2.1's tests and fixtures supply explicit draws.

**D5 — Persist `sensitivity` + `traceEnabled` + `windMarkerStyle`; keep `mirageEnabled` store-only until it ships.** ✅
Since the v2 bump is happening anyway, the "store-only to avoid a bump" reflex no longer
applies to genuine preferences. `sensitivity` (required carry-over), `traceEnabled`, and
`windMarkerStyle` are all durable player choices → persist. `mirageEnabled` is explicitly
parked/half-finished and should reliably start OFF until it's a real feature → stays
store-only for now, folded into persistence once shipped. The v1→v2 migration defaults each
newly-persisted field from `defaultSettings()` (sensitivity 1.0, trace on, marker 'flag').

**D6 — v2 bumps only for the `rifles[]`/`ammoLots[]` arrays; grow records via additive-optional fields, no further bumps this increment.** ✅
The arrays are genuinely new required structure, so they earn the v2 bump + migration
(also what satisfies the increment's "v1 saves migrate" exit criterion). Everything that
later hangs off a record — `playerZero` (2.3), confirmed `nodes` (2.4), `truedParams`
(2.5) — is naturally optional/absent until the player acts, so each is added as an
**additive-optional field when its feature is built**, exactly like `windRealism` was —
no version bump, no new migration, just when-present validation. We pre-sketch `playerZero?`
as an optional field in the v2 rifle type for design clarity; **the DOPE/node model
(likely a per-(rifle, lot) profile structure) and `truedParams` shapes are deliberately
deferred to 2.4/2.5**, since D6 makes adding them then free, and their shapes (especially
the node "conditions" blob) are easier to get right once we're building that UI.

## 4. Task split (each stops for owner per protocol §2.8)

Four sub-tasks, dependency-ordered. Each is independently verifiable and within the §3
size limit (~400 lines / ~10 files). PROGRESS label **2.1** becomes **2.1a / 2.1b / 2.1c /
2.1d**.

### 2.1a — Save schema v2: shape, migration, fixtures, settings carry-over
*Persistence-only; introduces no hidden-truth logic yet, so it's cleanly testable on its own.*
- `persistence/schema.ts`: bump `CURRENT_SCHEMA_VERSION → 2`; add `RifleInstance`
  (`id, catalogId, catalogVersion, draws: RifleDraws, playerZero?`) and `AmmoLot`
  (`id, catalogId, catalogVersion, draws: LotDraws`) types, where `draws` is a
  name-keyed map of `[0,1)` numbers; add `rifles: RifleInstance[]` +
  `ammoLots: AmmoLot[]` to `SaveData`; extend `SaveSettings` with `sensitivity`,
  `traceEnabled`, `windMarkerStyle` (D5); extend `validateSaveShape` (arrays present &
  well-typed; each record's required fields; each `draws` value in `[0,1)`; optional
  fields validated only when present). Update `DEFAULT_SAVE` (empty arrays).
- `persistence/migrations.ts`: implement `1: v1toV2` — adds empty `rifles`/`ammoLots`,
  defaults the three newly-persisted settings from `defaultSettings()`, leaves
  `windRealism` handling intact.
- `state/persist-settings.ts`: extend `settingsToSave` / `saveToSettings` so the three
  carried-over settings round-trip (default on absence).
- `persistence/persistence.test.ts`: add fixture saves to the corpus — a **v1 pre-1.7**
  save (no `windRealism`), a **v1 with `windRealism`**, and a **v2** save — and assert
  each migrates/loads to a valid v2.
- **Done when:** vitest green — v1→v2 migration produces empty arrays + settings defaulted
  (sensitivity 1.0, trace on, marker 'flag'); a v2 save round-trips unchanged; a
  newer-than-supported version still fails cleanly; the three carried-over settings
  round-trip through `persist-settings`. `tsc --noEmit` + `npm run build` green. Engine
  untouched → `node GameBuild/validation/run.mjs` expected to stay green.

### 2.1b — Hidden-truth derivation model
*Pure, engine-free, persistence-free: draws + ranges in, truth out.*
- `game/hidden-truth.ts`: `deriveRifleTruth(ranges, draws) → RifleTruth { mvOffsetMps,
  zeroOffsetRad{h,v}, inherentPrecisionRad }` and `deriveLotTruth(ranges, draws) →
  LotTruth { meanMvShiftMps, mvSdMps, trueBc, bcSdFraction }`. Each field maps its draw
  via the bell-curve helper (inverse-normal, scaled by the field's SD, clamped at ±3 SD;
  D3). A minimal **catalog-ranges interface** (`RifleTruthRanges` / `LotTruthRanges`, each
  field a `{ nominal, sdX }`) is defined here so 2.2's catalog can satisfy it; 2.1b tests
  use a small inline ranges fixture.
- `game/hidden-truth.test.ts`: **same draws → identical truth** (determinism);
  **different draws → differing truth**, all fields **within ±3 SD of nominal** (clamp
  holds across many draws); a draw of 0.5 → exactly nominal per field; adding a new draw
  key does **not** change existing fields' outputs (stability regression).
- **Done when:** the above tests are green; the module imports nothing from `engine-bridge`,
  `state`, `scope`, `range`, `shell`, `debug`, or React; `npm run build` green.

### 2.1c — Wire draws into v2 records + encapsulation guard + boundary type
*Small: ties 2.1a and 2.1b together and proves the hidden-truth invariant.*
- Define the `engine-bridge`-facing boundary: a `TrueBallistics` shape (or a thin
  `resolveTruth(record, ranges)`) so truth has exactly one entry point into solves —
  **without** yet changing any Increment-1 solve behaviour (real consumption lands in 2.3
  zeroing; here we only establish the seam + a fixture rifle/lot carrying draws).
- **No-leak guard test** (`game/hidden-truth.guard.test.ts`): scan source under the
  UI/HUD/scene/shell/debug dirs (`scope/`, `range/`, `shell/`, `debug/`, `state/`) and
  assert **no file imports `game/hidden-truth`** internals — the grep-style check named in
  increment-2.md's Done-when.
- Add a **v2 fixture save that includes a rifle + lot with draws** to the corpus so
  export/import (2.8) has real content to reproduce later.
- **Done when:** the full increment-2.md §2.1 *Done when* checklist passes verbatim —
  same draws → same truth; distinct instances differ within catalog ranges; migration
  green incl. the carried-over settings defaulted; the settings round-trip; grep-style
  check confirms no UI/HUD module imports hidden-truth internals. `npx vitest run` + `tsc`
  + `npm run build` green; `node GameBuild/validation/run.mjs` green (engine untouched).

### 2.1d — Settings screen (owner request)
*Pure UI over the store; no engine or schema work beyond 2.1a. Depends on 2.1a so the
toggles it surfaces actually persist.*
- New `shell/SettingsScreen.tsx` (or similar): a full screen listing the player settings —
  units (MIL/MOA), sensitivity, bullet trace, wind realism, marker style, (mirage once
  shipped) — reading/writing the existing store setters. Reachable from the existing
  **Menu** button; the persisted ones (D5) now stick across launches.
- Remove the equivalent inline toggles from the scope HUD (`ScopeView.tsx` ll. 1018–1202),
  leaving the HUD to its shooting-relevant controls; keep any control that is genuinely a
  per-shot/in-scene control where it is (decide per control during the task).
- All angle/unit display continues to route through the units service (guardrail §4.4);
  MIL and MOA both shown where relevant.
- **Done when:** every setting is reachable and editable from the Settings screen; the
  persisted settings survive a reload (verifies the 2.1a wiring end-to-end through real
  UI); the scope HUD no longer duplicates them; `tsc` + `vitest` + `npm run build` green.
  **OWNER CHECK:** on device — Menu → Settings, toggle each, confirm they stick after an
  app relaunch and the scope view is cleaner.

**Order & stops:** 2.1a → 2.1b → 2.1c → 2.1d. 2.1a and 2.1b are independent and *could* go
in either order, but 2.1a first keeps the schema stable before anything references the new
records; 2.1c depends on both; 2.1d depends on 2.1a (persistence) so its toggles stick.
**STOP for owner confirmation after each** (protocol §2.8). Commit per task:
`inc2/task2.1a: …`, etc.

## 5. Risks, constraints, and non-goals

- **Non-goal (belongs to later tasks):** no gear-catalog data or inventory UI (2.2), no
  zeroing flow (2.3), no DOPE/nodes/truing (2.4/2.5), and **no change to how Increment-1
  solves behave** — the box-true loads keep working exactly as today. 2.1 adds the
  *primitive, its storage, and the settings home*, not the gameplay consumption of truth.
- **Guardrail watch:** §4.6 (bump + migration + fixture) is the spine of 2.1a; §4.8 /
  catalog §0 (truth never in UI/logs) is what 2.1c's guard test enforces; protocol §4
  (no new deps) is trivially satisfied — there is no PRNG to add, rolls use platform
  `crypto`.
- **Migration-corpus discipline:** every fixture we add is permanent regression coverage;
  future schema bumps must keep migrating these same fixtures forward.
- **Spoiling resistance is soft, by design:** only the normalized draws are stored (D1),
  so a player reading their save sees meaningless `[0,1)` numbers rather than "true MV = X".
  It's a speed bump (the mapping ships in the bundle), and that's the intended bar.
- **Determinism is load-bearing:** truing's synthetic-truth tests (2.5) and export/import
  reproduction (2.8) assume `deriveXTruth` is a pure function of `(ranges, draws)`. Keep it
  free of `Date.now`, global RNG, and iteration-order hazards.
- **Catalog-drift is knowingly deferred (D2):** during development, editing a catalog range
  shifts existing dev instances; that's accepted until we commit to a freeze before first
  real release.

---

**Next step:** build **2.1a**, verify, log to `PROGRESS.md`, commit, and STOP for owner
confirmation before 2.1b — per [`execution-protocol.md`](./execution-protocol.md) §2.
