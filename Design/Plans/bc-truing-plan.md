# BC truing plan — "Update BC" from an asserted hold (DOPE-first step 5)

**Status:** DRAFT — awaiting owner approval. Written 2026-07-31.
Closes the last open step of [`dope-first-plan.md`](./dope-first-plan.md) (step 5,
confirm-hold → BC) and implements **D15 lever 2**
([`D15-two-lever-truing-independent.md`](./D15-two-lever-truing-independent.md)).
Plan slug for commit messages: **`bc-truing`**.

---

## 1. The flow, as the owner described it

**The truing loop is the player's, not the program's.** The game does not watch shots,
measure groups, or infer anything from where the bullet landed.

1. Rifle is zeroed and chronographed. The DOPE table is solving off box BC.
2. The table says hold **10.0 MIL** at 800 m. The player shoots, adjusts, shoots again,
   and establishes by hand that **10.3 MIL** is what actually puts rounds on the plate.
3. With 10.3 on the turret and the 800 m plate committed, the player presses **Update BC**
   in the in-scope DOPE panel.
4. A dialog asks: *"Update BC to satisfy 10.3 MIL @ 800 m?"* — the value pre-filled from
   the current elevation dial, editable.
5. **Update** fits the BC that reproduces that come-up and writes it to
   `lot.effective.bc`; the table recomputes and now reads 10.3 at 800 m. **Cancel** does
   nothing.

That is the whole feature. It is deliberately an *assertion* the player makes, not a
measurement the game takes.

### 1.1 What this is NOT (scope fence)

Explicitly out of scope — do not build any of it under this plan:

- **No impact capture.** `ShotResult` is not extended; no applied-correction plumbing,
  no observed-vertical-offset math.
- **No group tracking on steel.** No running group, no centroid, no "a dial change starts
  a new group" rule. (That machinery exists for paper in the sight-in path; it stays there.)
- **No DopeNode recording.** The DOPE-first plan drops the node/confidence system on
  purpose, and D12's freeze rule has nothing to freeze without nodes. `dope-book.ts`'s
  node rules stay unused by this feature.
- **No scope elevation-travel model** (ELR plan §5.3/§5.4). Related, unbuilt, separate.
- **No MV inference.** A BC fit never touches MV (D15).

---

## 2. What already exists (verified 2026-07-31)

The *consumer* side of lever 2 is fully wired. Nothing writes the value.

| Piece | State |
|---|---|
| `AmmoLot.effective.bc` + `bcSource` (`box\|chrono\|trued\|provisional`) | **Built** — `persistence/schema.ts`, validated on load |
| Believed solve honours `effective.bc` | **Built** — `engine-bridge/gear-solve.ts` L104-106 |
| DOPE book BC chip with source tag | **Built** — `shell/DopeBookScreen.tsx` L143-148, L206-209 |
| Replenish carries BC forward as `provisional` | **Built** — `state/store.ts` L695-707 |
| Chrono → `effective.mvMps` (D15 lever 1) | **Built** — `withLotEffectiveMv`, store L440-446 |
| In-scope DOPE panel with committed-target highlight | **Built** — `scope/DopePanel.tsx` L167 |
| Committed target + its distance | **Built** — `session.currentTarget.distanceM` |
| Current elevation dial | **Built** — `session.scope.elevationRad` |
| **A BC solver** | **Missing** — nothing anywhere fits BC |
| **A store action writing `effective.bc`** | **Missing** |
| **Any UI to invoke it** | **Missing** |

Steps 1–4 of the DOPE-first plan are done and were re-verified while writing this: zero
model + `zeroable` ranges, status chips, chrono→MV, and distance (ELR reaches 2000 m; the
come-up table already runs past effective range to the transonic/subsonic wall).

---

## 3. Decisions

| # | Decision | Owner call |
|---|---|---|
| **B1** | The asserted come-up is **pre-filled from the current elevation dial and editable** before confirming. A player who dials 10 and holds 0.3 on the reticle can type 10.3; the turret alone would understate the correction. | 2026-07-31 |
| **B2** | A fit that lands outside a plausible BC band is **rejected with a reason**, not clamped and not applied. An impossible hold usually means a bad zero or wrong MV, and saying so is the teaching payload. | 2026-07-31 |
| **B3** | The button lives in the **in-scope DOPE panel only** — available exactly when a target is committed, which is when the player knows the real number. Not on the full DOPE Book screen (it has no committed target, so it would need a distance picker). | 2026-07-31 |
| **B4** | The plausible band is **relative to box BC: `[0.5 × box, 2.0 × box]`**. Model-agnostic (works for G1 and G7 alike), generous enough for a genuinely bad box number, tight enough to catch a fat-fingered entry. | proposed — confirm at T3 |
| **B5** | **No hard gate on being zeroed or chronoed.** Not-chronoed already forces `bcSource: 'provisional'` per D13, and not-zeroed shows an inline caution in the dialog. D15's pedagogy is that a fit made on a bad foundation *should* be wrong and *should* look right at the trued range — gating that away removes the lesson. | proposed — confirm at T3 |
| **B6** | The value is entered and displayed in the player's **active angular unit** (`settings.unitsPrimary`), converted to radians at the seam. | 2026-07-31 |

---

## 4. Tasks

Four tasks. **One owner-verification stop** (after T3) plus a final sign-off (after T4).

### T1 — the BC fitter

**New file `GameBuild/app/src/engine-bridge/bc-fit.ts`.** Lives in `engine-bridge/`
because it drives the WASM solver; it touches **no hidden truth** (every input is a
believed/box value or a number the player typed), so it must not import
`game/hidden-truth`.

```ts
export interface BcFitInput {
  load: Load;            // believed geometry + EFFECTIVE MV (chrono if present, else box)
  twistM: number;        // spin is re-derived per candidate via spinRateFromTwist
  atmosphere: AtmosphereInput;
  wind: WindVec;
  zeroRangeM: number;
  sightHeightM: number;
  distanceM: number;
  /** The come-up the player asserts is correct at distanceM (rad, positive = up). */
  requiredElevRad: number;
  /** Plausible band (B4). Caller supplies [0.5×box, 2.0×box]. */
  bcMin: number;
  bcMax: number;
}

export type BcFitResult =
  | { ok: true; bc: number; comeUpRad: number; iterations: number }
  | { ok: false; reason: 'needs-more-bc' | 'needs-less-bc';
      achievableMinRad: number; achievableMaxRad: number };
```

**Method.** Come-up at a fixed distance is **monotonically decreasing in BC** (more BC →
less drop → less come-up), so a bracketed bisection is both correct and predictable:

1. Solve once at `bcMax` and once at `bcMin` (each a single-row solve: `maxRangeM =
   stepM = distanceM`, so one trajectory row comes back).
2. If `requiredElevRad < comeUp(bcMax)` → `ok: false, reason: 'needs-more-bc'` (the hold
   is flatter than the best BC in band can produce). If `requiredElevRad >
   comeUp(bcMin)` → `'needs-less-bc'`. Return the achievable bounds either way so the UI
   can say what *is* reachable.
3. Otherwise bisect, early-exiting when `|comeUp − required| < milToRad(0.005)`, hard cap
   **18 iterations** (band width / 2^18 is far below any BC precision that matters).

**Perf note for the builder:** a single long-range solve measured ~5–6 ms natively and
~3× that on device (PROGRESS P12), so a worst-case fit is ~20 solves ≈ 120 ms native /
~350 ms on iPad. That is fine for a modal button press and is why the fit does **not**
run per keystroke (see T3). If it measures materially worse, say so at the T3 stop rather
than silently switching methods.

**Tests (`bc-fit.test.ts`):**
- **Round-trip:** pick a BC, solve its come-up at 800 m, fit it back → within 1e-3 of the
  original.
- **Monotonicity:** come-up strictly decreases as BC increases across the band.
- **Identity:** asserting exactly the current table value returns the current BC.
- **Both rejections** fire with correct `reason` and sane `achievable*` bounds.
- Iteration count stays under the cap for a mid-band target.

**Boundary:** checkpoint (run `npx vitest run`), continue. **Commit:** —

---

### T2 — store action + D13 source labelling

**`state/store.ts`.** Add `setLotEffectiveBc(lotId: string, bc: number, source:
EffectiveSource): void`, mirroring the existing `withLotEffectiveMv` helper: writes
`effective.bc` + `bcSource`, **preserves the MV side untouched** (D15 — the levers are
independent), no-op on an unknown lot id.

The caller decides `source` per **D13**: `'trued'` when a `ChronoSummary` exists for the
active rifle+lot (`findChronoSummary`), `'provisional'` when it does not. A BC fit with no
chrono behind it is provisional no matter what.

Persistence needs no change — the field and its validation already exist, and the
inventory slice is already watched by the persist subscription (chrono writes through the
same path).

**Tests (`state.test.ts`):** writes bc + source; leaves `mvMps`/`mvSource` byte-identical;
creates the `effective` object on a lot that has none (with `mvSource: 'box'`); no-op for
an unknown lot; survives a save/load round-trip.

**Boundary:** checkpoint, continue. **Commit:** —

---

### T3 — Update BC button + confirm dialog

**`scope/DopePanel.tsx`.** A third button in the panel's header row, beside
`DOPE ▲` and `Open book ⤢`.

**Enablement.** Shown whenever the panel is open; enabled only with active gear **and**
`session.currentTarget != null`. Disabled state carries a one-line reason ("commit to a
target first").

**The dialog** (in-panel, not a browser `confirm()` — it has to render inside the scope
mask like the rest of the HUD):

```
  Update BC?

  Required come-up   [ 10.3 ] MIL   @ 800 m
  BC                 0.243 → 0.251  (G7)

  ⚠ not chronoed — this fit will be provisional
  ⚠ not zeroed — a residual zero error goes straight into BC

  [ Update ]  [ Cancel ]
```

- The number is pre-filled from `radToMil`/`radToMoa` of `session.scope.elevationRad`
  per `unitsPrimary` (B1/B6), and is editable.
- The **fit runs on dialog open and on committed value change** (blur / Enter, plus a
  ~250 ms debounce) — **not per keystroke** (see T1's perf note). While fitting, the
  Update button is disabled and the BC preview reads `…`.
- **Rejected fit** (B2): the preview is replaced by the reason and what *is* reachable —
  e.g. *"No BC within range produces 10.3 MIL at 800 m (0.30–2.10 MIL achievable). Check
  your zero, or chronograph first."* Update stays disabled.
- The two ⚠ lines are cautions, never gates (B5); they reuse the flags the panel header
  already computes (`notZeroed`, `notChronoed`).
- **Update** → `setLotEffectiveBc(...)` with the D13 source → dialog closes → the table
  re-solves (the panel's solve effect already depends on `inventory`) → the row at the
  committed distance now reads the asserted value.
- **Cancel** → close, no write, no state change.

The fit's `load` input is assembled the same way `gear-solve.ts` does it: `believedLoad`
geometry, `effective.mvMps ?? box MV`, spin from the rifle's twist — so the fitter and the
table can never disagree about what "believed" means.

**Tests:** the dialog's pure pieces (pre-fill conversion in both units, the enable/disable
predicate, the reject-message formatter) go in `DopePanel`-adjacent pure helpers so they
unit-test without a DOM.

**Boundary:** **OWNER-VERIFICATION STOP.** On device: zero a rifle, chrono a lot, commit
an 800 m ELR plate, dial a deliberately-wrong come-up, press Update BC, confirm the
dialog shows the right distance and pre-fill, then confirm the DOPE table reads the
asserted value afterwards and the BC chip flips to `trued`. Also try an absurd value
(e.g. 40 MIL at 800 m) and confirm it is refused with a readable reason. Confirm B4 and
B5 at this stop.

**Commit + push:**

```
bc-truing T3: Update BC from an asserted hold (D15 lever 2)

- Adds a bracketed BC fitter over the believed solve, a store action writing
  lot.effective.bc with D13 provisional/trued labelling, and the in-scope
  Update BC button + confirm dialog.
- The player asserts the come-up; the game fits BC to it. No impact capture,
  no group tracking, no node recording (DOPE-first plan scope fence).
```

---

### T4 — the stale-BC signal (D15's re-true loop)

D15 names a consequence this feature creates: chrono *after* truing BC and the table no
longer reproduces the number the player trued to. D15 says surface the mismatch rather
than hide it.

- **Schema (additive-optional):** `EffectiveParams.bcSetAt?: string` (ISO). No migration
  and no version bump — absent means "unknown, don't warn". `ChronoSummary` already
  carries `updatedAtIso`, so no MV-side timestamp is needed.
- T2's action stamps `bcSetAt`; the fields are validated alongside the existing ones.
- **Signal:** when `bcSetAt` exists and the chrono summary's `updatedAtIso` is newer, both
  the panel header and the DOPE book show a chip: **"⚠ chrono is newer than your BC —
  re-true at distance"**. Purely informational; nothing is invalidated or overwritten
  (D15: last write wins, no cross-invalidation).

**Also in T4 — close the docs out:**
- `dope-first-plan.md`: mark step 5 DONE with the date and a one-line summary of what
  actually shipped (an asserted-hold fit, not a measured confirm), and note that its two
  "open decisions" are resolved — manual BC nudge is subsumed by the editable field, and
  the provisional label is carried from the start per D13.
- `feature-catalog.md` §"Solver truing": flip lever 2 to built-with-date, with the scope
  fence (no nodes, no confidence tiers) written into the entry.
- `PROGRESS.md`: a row per task, as always.

**Boundary:** **OWNER-VERIFICATION STOP** (final). On device: true a BC, then chrono the
same lot, and confirm the re-true chip appears in both the panel and the book.

**Commit + push:**

```
bc-truing T4: stale-BC signal + DOPE-first close-out

- Stamps effective.bcSetAt and flags when a chrono is newer than the BC it
  was fitted against (D15's named re-true loop), in the panel and the book.
- Marks DOPE-first step 5 done in the plan and feature catalog.
```

---

## 5. Gates

Per protocol §5, from `GameBuild/app/`, before marking any task done:

`npx vitest run` → `npx tsc --noEmit` → `npm run build`, all green.

**No engine source is touched by this plan**, so `ctest` and
`GameBuild/validation/run.mjs` are **N/A** — record them as N/A in `PROGRESS.md`, never
skip them silently. If any task ends up modifying `GameBuild/engine/`, that is a
deviation: stop and re-plan.

## 6. Size estimate

| Task | Files | Est. lines |
|---|---|---|
| T1 | 2 (new + test) | ~180 |
| T2 | 2 | ~60 |
| T3 | 2–3 | ~220 |
| T4 | 5 (2 code, 3 docs) | ~90 |

Comfortably inside the ~400-line / ~10-file planning guidance per task.

## 7. What this does not close

Still outstanding after this plan, and deliberately untouched by it:

- **ELR task 11** — wind markers (owner deferred pending wind design work).
- **ELR task 12** — catalog entries for .300 WM / .338 LM / .50 BMG (blocked on bullet
  geometry data; Prompt D is written and ready to run).
- **ELR §5.3/§5.4** — the scope elevation-travel model and its required/dial/hold verdict
  readout. This is the ELR range's stated teaching payload and shares its numbers with
  this feature's dialog; it is the natural next plan.
- **The node / confidence-tier system** (old 2.4b–f). Still valid future work; when built,
  a confirmed node becomes a second producer of the same `effective.bc` value, exactly as
  D15 frames it.
