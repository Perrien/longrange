# DOPE book UI plan — the rifle-scoped, multi-page DOPE book

**Status:** P1–P4 BUILT 2026-07-27 (awaiting owner device check), + DOPE-first step 3
(chrono→MV) pulled forward. Only step 5 (confirm-hold → BC) remains on the DOPE-first
plan. Expands
[`dope-first-plan.md`](./dope-first-plan.md) **step 2** into the full DOPE book the
owner specified (2026-07-27): a **tabbed, rifle-scoped book**. The come-up table is
one page; a rifle + ammo overview is the other. The book is the surface future
behavior (chrono→MV, confirm-hold→BC, nodes, tabulated cards) plugs into.
Step 1 is DONE (real per-rifle zero wired into the believed solve).

**Build log:**
- **P1 — BUILT 2026-07-27 (awaiting owner device check).** `units/energy.ts`
  (J⇄ft·lb) + `dope-row.ts` extended with kinetic energy + Mach/transonic band + a
  shared `nearestRow` helper (+ tests); `shell/DopeBookScreen.tsx` — tabbed overlay,
  page-2 come-up table (Range·Elev·Wind·Vel[transonic-coloured]·Energy) to the
  cartridge's effective range via `ladderStationsM`, header status chips (not zeroed /
  not chronoed) + effective MV/BC as value+source tag, page-1 tab a P3 stub; entry
  points wired from RangeSelect + the scope HUD (`App.tsx` `dopeBookOpen`). In-scope
  strip (`DopePanel.tsx`) upgraded: same DOPE ladder (`ladderStationsM`, full ladder to
  effective range), the not-zeroed / not-chronoed status header, current-target row
  highlight, and an "Open book ⤢" button jumping to the full screen. Typecheck clean,
  574/574 tests, build OK.
- **Fix 2026-07-27 (owner device feedback):** current-target highlight used
  `nearestRow`'s 0.5 m grid tolerance, so a committed plate never matched a century
  station and nothing highlighted — now uses unbounded tolerance (nearest station).
  Verified via an engine probe that the come-up reaches effective range (6.5 CM → 12
  rows to 1200 yd, transonic flagged at 1200 yd, M1.15); "only through 500" was the
  .223-in-MIL effective-range cap, not a generation bug.
- **Transonic visibility 2026-07-27 (owner decision):** transonic is a beyond-
  effective phenomenon for most cartridges, so the come-up REFERENCE table now extends
  past effective range to the transonic→subsonic wall (shootable DOPE-range stations
  stay capped). New pure helpers: `dope-book.comeUpStationsM` (in-range ladder + a
  continuation to a hard max, each tagged `beyondEffective`) and
  `dope-row.assembleComeUp` (maps stations→rows, trims one row past the first subsonic
  row). Both surfaces use them; beyond-effective rows are dimmed under a "beyond
  effective range" divider, transonic/subsonic coloured (amber/red). +7 tests.
  Typecheck clean, 581/581 tests, build OK.
- **P2a — BUILT 2026-07-27 (data model; not device-observable until P2b/P3).** Schema
  gained additive-optional fields (no version bump): `RifleInstance.acquiredAt` +
  `lifetimeShotCount`; `AmmoLot.lotNumber` + `roundsRemaining` + `acquiredAt` +
  `effective` (MV/BC value + source tag, `EffectiveParams`), all validated when present.
  `acquire.ts`: `DEFAULT_LOT_ROUNDS = 20`, a deterministic FNV-hash `lotNumberFromId`
  (`[A-Z][0-9][0-9]`, collision-probing the full 2600 space), builders stamp the new
  fields; store `acquireRifle/acquireLot` pass `Date.now()` + generate a unique code
  against owned lots (store creator now takes `get`). `saveToInventory` backfills the
  fields onto pre-P2 records and assigns stable unique codes to lots lacking one.
  +8 tests. Typecheck clean, 589/589 tests, build OK.
- **P2b — BUILT 2026-07-27 (owner device check pending).** Store `consumeRound(rifleId,
  lotId)` (+1 lifetime shot, −1 round floored at 0, atomic). Wired into both fire paths
  (`fireSteel` + `fireSightIn`) after each gear shot — chrono shots go through the same
  paths, so they deplete too. Both paths block fire when the active lot is at 0 rounds
  (box-true fallback unaffected); the FIRE button disables + relabels **EMPTY** with an
  "out of rounds" note. Per-shot inventory mutation persists via the existing
  subscription (one IDB write per shot — fine at human cadence). +3 store tests.
  Typecheck clean, 592/592 tests, build OK.
- **P3 — BUILT 2026-07-27 (owner device check pending).** The DOPE book's "Rifle &
  Ammo" tab is now real (`shell/DopeBookScreen.tsx` `RifleAmmoOverview`): rifle block
  (name, caliber/class, twist, zeroed@, acquired date, lifetime rounds) + one card per
  **same-cartridge** lot — lot code, rounds remaining (depleted lots dimmed), box MV,
  chrono avg/SD/ES when present, box BC, discovered BC (— until P5), and the CALCULATED
  expected vertical spread @ effective range (`believedVerticalSdRad` over chrono-else-
  box MV SD + the tier's nominal inherent precision — leak-free; tightens after a
  chrono). Presentational; the underlying math is already unit-tested. Typecheck clean,
  592/592 tests, build OK.
- **Chrono → MV pulled forward 2026-07-27 (DOPE-first step 3 / D15 lever 1; owner
  device feedback).** Owner chronographed (779 vs box 810) and the come-up didn't move —
  because P1 surfaced chrono MV in the book HEADER but the solve still used box MV
  (step 3 was deferred). Fixed: chrono commit now writes `lot.effective.mvMps`
  (`mvSource: 'chrono'`) — store `withLotEffectiveMv`, applied in `commitChronoString`
  + the gear-switch auto-commit in `logChronoReading`. `solveGear`'s BELIEVED table now
  reads `lot.effective.mvMps`/`.bc` (?? box); the TRUE table is untouched. The book
  header now reads the same `effective` slot (single source — header & table can't
  diverge; also P4/P5-ready for provisional/trued). Vertical spread was already
  chrono-aware and is correct (SD-driven; the mean drop only nudges it via the 1/v³
  sensitivity term). +3 tests. Typecheck clean, 595/595 tests, build OK.
- **P4 — BUILT 2026-07-27 (owner device check pending).** Replenish. Store
  `replenishLot(sourceLotId, carryForward)`: appends a NEW lot of the same ammo with
  fresh hidden draws, a new unique `[A-Z][0-9][0-9]` code, and a full round count
  (reuses `buildAmmoLot`); `carryForward` copies the source's discovered MV/BC into the
  new lot as **provisional** (unverified until re-chrono / hold-confirm, D15), else box;
  if the source lot was active, the new lot becomes active (seamless continue when a lot
  runs dry). Book's ammo cards gained a **Replenish +20** control — a plain box
  replenish, or a carry-MV/BC-provisional choice when the lot has discovered values.
  +6 store tests. Typecheck clean, 601/601 tests, build OK.
- **DOPE book workstream (P1–P4) COMPLETE**, plus DOPE-first step 3 (chrono→MV) pulled
  forward. Remaining in the DOPE-first plan: **step 5 (confirm-hold → BC, D15 lever 2)**
  — the `effective.bc`/`bcSource: 'trued'` slot + book "BC (discovered)" field are
  already wired to display it once the confirm-hold interaction writes it.

## Shape

- **The book is tied to the RIFLE**, not the ammo lot. Finishing/deleting a lot never
  invalidates the book. Rifle-level data (zero, lifetime shot count, discovered
  traits) persists across ammo changes.
- **Tabbed, ≥2 pages** (tabs at the top):
  - **Page 1 — Rifle & ammo overview** (mostly new).
  - **Page 2 — Come-up table** (the original step-2 table).
- **Two surfaces:** the full-screen book (new overlay, the plug-in home) + the
  existing in-scope strip (`scope/DopePanel.tsx`) kept as the glance-while-aiming
  reference. Full screen opens from the range-select landing and the scope HUD, reusing
  the `{ onClose }` overlay pattern (`SettingsScreen`/`StoreScreen`) + `App.tsx` nav.

## Owner decisions (2026-07-27)

- **Lot scope on page 1:** only lots whose cartridge matches the rifle (a 6.5 CM rifle
  shows its 6.5 CM match + bulk lots; never .22 LR).
- **Discovered vertical spread is CALCULATED, not recorded** — no group-recording, no
  hidden-truth leak. Use `dope-book.ts` `believedVerticalSdRad(rangeM, mvMps, mvSdMps,
  inherentPrecisionRad)`: MV SD from the lot's chrono if present (discovered) else box
  MV SD; inherent precision from the rifle tier's nominal cone (believed). It tightens
  when a lot is chronographed — a discovered number that rewards effort.
- **Depleted lots stay listed** (greyed, "0 rounds") and keep their discovered data for
  Replenish carry-forward until the user deletes them.
- A **lot = 20 rounds** on acquire — a **testing value**; real lot sizes will scale to a
  few hundred, up to ~1000. The field is a plain count; the acquire default becomes
  per-catalog later.
- **Lot number = a non-sequential `[A-Z][0-9][0-9]` code** (e.g. D52, H05, N28) for
  realism — randomly drawn, not counted up. Unique within the user's owned lots
  (regenerate on collision); generated via the existing `cryptoRng()` draw source.

---

## Page 1 — Rifle & ammo overview

### Top section — the rifle
Everything that makes this rifle unique + what the player has discovered:
- **Model / caliber** — catalog.
- **Barrel twist** — catalog (`catalogTwistM`).
- **Zeroed?** + **at what distance** — `playerZero` / `playerZero.zeroRangeM` (else
  "not zeroed").
- **Acquired date** — 🆕 `acquiredAt` (stamped at acquire).
- **Lifetime shot count** — 🆕 `lifetimeShotCount` (incremented on every shot fired
  with this rifle, chrono shots included).

### Bottom section — ammo lots (this rifle's cartridge only)
One row per owned lot of the rifle's cartridge; depleted lots greyed but present:
- **Lot number** — 🆕 non-sequential `[A-Z][0-9][0-9]` code (D52, H05, …).
- **Rounds remaining** — 🆕 `roundsRemaining` (20 on acquire; decrements on every fired
  round, chrono included).
- **Box MV** — catalog.
- **Chrono** (avg / SD / ES) — `ChronoSummary` for this rifle+lot if present.
- **Box BC** — catalog.
- **Discovered BC** — the lot's effective BC if truing has set one (empty until step 5).
- **Expected vertical spread @ distance** — CALCULATED per lot via
  `believedVerticalSdRad(...)`: this lot's MV SD (chrono if present → discovered, else
  box) + the rifle tier's nominal inherent precision. Shown at the cartridge's effective
  range (in MOA + inches, ±), tagged `(box SD)` vs `(chrono SD)`; tightens once the lot
  is chronographed.
- **Replenish** action — 🆕 adds a new lot of the same ammo (new `[A-Z][0-9][0-9]` lot
  number, 20 rounds). Offers: **carry the previous lot's discovered MV/BC forward**, or
  leave blank. If carried, those values are flagged **provisional** until the new lot is
  chronographed (MV) and hold-confirmed at distance (BC) — D15's two levers.

## Page 2 — Come-up table (original step-2 scope)

- **Rows** via `dope-book.ts` `ladderStationsM(isRimfire, units, effectiveRangeYd)` —
  centuries (centrefire) / rimfire fine set, capped at the cartridge's effective range
  (.308 1000, 6.5 CM 1200, .223 600, .22 LR 200). Solve-driven → reaches effective range
  now, independent of step 4 (shootable far targets). Replaces `DopePanel`'s 50-to-500
  hardcode.
- **Columns:** Range · Elevation come-up · Wind hold · Velocity · Transonic flag ·
  Kinetic energy. **No time-of-flight.**
- **Wind** tracks current session wind (fixed-reference come-up card = later Tabulated
  DOPE). **Energy** = ½·m·v² (`believedLoad(...).massKg` + per-row velocity), J/ft-lb by
  `unitsPrimary`. **Transonic** = velocity ÷ speed of sound.
- **Reserved marker slot** — empty column for future node confidence badges.

## Header (both pages) — trust + effective params
- **Status chips:** "⚠ not zeroed" (`!playerZero`) / "⚠ not chronoed"
  (`!findChronoSummary(...)`).
- **Effective MV / BC** as *value + source tag* — `2700 fps (box)` · `BC .310 (box)`.
  Step 3 flips MV → `(chrono)`; step 5 flips BC → `(trued)`; Replenish carry-forward
  shows `(provisional)`; D14 manual truing edits these same fields. Value+tag now = data
  swaps later, not re-layouts.

---

## Data model — what's new (schema.ts)

Additive-optional per the 2.1-D6 / 2.3a pattern (validated when present, loader
defaults, no version bump):
- **`RifleInstance`**: `acquiredAt: number`, `lifetimeShotCount: number` (default 0).
- **`AmmoLot`**: `lotNumber: string` (`[A-Z][0-9][0-9]`, drawn via `cryptoRng`, unique
  among owned lots), `roundsRemaining: number` (default 20), `acquiredAt: number`, and an
  **effective-params** slot `effective?: { mvMps?; bcG7?; mvSource: 'box'|'chrono'|'provisional';
  bcSource: 'box'|'trued'|'provisional' }` — the home steps 3/5 + Replenish write into
  (empty/box now).
- Migration: existing records default (`roundsRemaining` 20, `lifetimeShotCount` 0,
  `lotNumber` a freshly-drawn unique `[A-Z][0-9][0-9]` code, `acquiredAt` unknown/0).

## Mechanics — what's new (store + fire path)

- **Shot counting + round depletion:** on every fired shot (steel + sight-in paths),
  increment the active rifle's `lifetimeShotCount` and decrement the active lot's
  `roundsRemaining`. At 0 rounds, block fire with a "replenish this lot" prompt.
- **Replenish:** extends `game/acquire.ts` — clone the ammo type, next `lotNumber`, 20
  rounds, optional provisional `effective` seeded from the prior lot.

## No-leak guard
Everything on page 1 is catalog-believed, player-recorded, or a calculation over those
(`believedVerticalSdRad` is explicitly leak-free). Page-1 UI imports no hidden-truth
module; the guard test (`hidden-truth.guard.test.ts`) continues to enforce this.

---

## Sequencing (phased — each phase ships something usable + stops for owner)

- **P1 — Book shell + Page 2 + strip.** Tabbed full-screen shell, page-2 come-up table
  (extend `dope-row.ts` with energy + transonic + tests; `DopeBookScreen.tsx`; entry
  points; `App.tsx` `dopeBookOpen`), header status chips + effective MV/BC value+tag,
  and the in-scope strip upgrades (status header, `ladderStationsM`, highlight current
  row, open-book button). **No new data model** — ships a working book.
- **P2 — Inventory data model + mechanics.** Schema additions + migration + defaults;
  `acquiredAt`/`lotNumber` on acquire; shot-count + round-depletion on the fire paths;
  block-fire-at-zero. Store + persistence tests.
- **P3 — Page 1 overview UI.** Rifle section (specs, caliber, zero+distance, twist,
  acquired, lifetime count, calculated vertical spread) + ammo section (lot rows), all
  reading P1/P2 data. Same-cartridge filter; depleted lots greyed.
- **P4 — Replenish + provisional carry-forward.** The Replenish action + UI + provisional
  tagging.

## Non-goals (later steps)
- No chrono→MV substitution (step 3) — header detects chrono; MV stays box.
- No BC truing (step 5) — discovered BC empty; effective slot present but box.
- No node-recording / confidence logic — only the reserved marker slot + calculated spread.
- No fixed-reference come-up card (Tabulated DOPE).
- No range-station/target extension to 1000 yd (step 4).

## Verification / Done-when
- Per phase: `npm run typecheck` · `npm test` · `npm run build`; golden vectors
  unaffected (no engine change).
- Owner on device, by phase: (P1) book opens from range-select + scope HUD, page-2 table
  reaches effective range with agreed columns, status header correct, strip upgraded;
  (P2) firing decrements rounds + increments lifetime count, 0-rounds blocks fire;
  (P3) page 1 shows rifle + same-cartridge lots, calculated spread reads sensibly and
  tightens after a chrono; (P4) Replenish adds a numbered lot, provisional carry-forward
  tags correctly.

## Resolved sub-decisions (owner, 2026-07-27)
1. **Vertical spread:** per ammo lot (ammo section), at the cartridge's effective range.
2. **Transonic threshold:** flag ≤ Mach 1.2 (onset) + distinct mark ≤ Mach 1.0 (subsonic).
3. **Energy units:** follow `unitsPrimary` (J metric / ft-lb imperial).
4. **In-scope strip rows:** full ladder + highlight current row.
5. **Chrono shots consume rounds:** yes — any fired round depletes the lot + counts.
