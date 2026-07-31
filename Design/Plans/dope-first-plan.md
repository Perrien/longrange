# DOPE-first plan — auto-populated, chrono-fed DOPE book to 1000 yd

**Status: COMPLETE 2026-07-31 — all five steps shipped.** Locked as the direction
2026-07-26; supersedes the increment 2.4b–f node-confirmation sequencing *as the path to a
working DOPE book* — the heavy node/confidence machinery was not a prerequisite. Built on
D15 ([`D15-two-lever-truing-independent.md`](./D15-two-lever-truing-independent.md)): two
independent levers, chrono→MV, confirm-hold→BC.

**Step 5 — DONE (2026-07-31)** via [`bc-truing-plan.md`](./bc-truing-plan.md) (T1–T4, all
owner-verification stops confirmed on device). Shipped as an **asserted-hold fit**, not a
measured confirm: the player dials/holds until rounds land, then presses **Update BC** in the
in-scope DOPE panel; a bracketed bisection (`engine-bridge/bc-fit.ts`) fits the BC that
reproduces that come-up, writes it to `lot.effective.bc` via `setLotEffectiveBc` (D13
provisional/trued labelling), and the table recomputes. The plan's two "open decisions" below
are resolved by what actually shipped, not left open: **(1)** the manual-BC-nudge stopgap is
subsumed by the dialog's editable pre-filled field — no separate manual-truing UI was needed;
**(2)** the `provisional` label is carried **from the start** (D13/D15), not deferred. T4 also
added the **stale-BC signal** (`game/chrono.ts`'s `isBcStaleVsChrono`, D15's named re-true
loop): a chip in both the in-scope panel and the DOPE book when a chrono postdates the BC it
was fitted against. See `bc-truing-plan.md` for the full build record and scope fence (no
impact capture, no group tracking, no DopeNode recording — this is deliberately narrower than
the old 2.4b–f node/confidence system, which remains valid future work per D15).

**Steps 2–4 — DONE (2026-07-27)** via the expanded [`dope-book-ui-plan.md`](../archive/dope-book-ui-plan.md)
(P1–P4): the tabbed rifle-scoped DOPE book (status header, come-up table extended past
effective range to the transonic/subsonic wall, rifle & ammo overview with calculated
vertical spread), inventory data model (shot count, round depletion, lot codes,
`effective` MV/BC slot), and Replenish. **Step 3 (chrono→MV)** was pulled forward there
too — a chrono commit writes `lot.effective.mvMps` and the believed come-up solves off it.
**Remaining: step 5 (confirm-hold → BC, D15 lever 2).**

**Step 1 — DONE (2026-07-27).** Verified + finished. Pieces 1a (D16 raw 5–35 MOA zero error)
and 2 (25/50/100/200 `zeroable` zeroing range) were already shipped by the Wooded Zero Range
work (2026-07-26). Remaining work completed this session: retired the leftover
`SCOPE_ZERO_RANGE_M = 300 yd` test constant (`game/loads.ts`) — box-true fallback paths in
`ScopeView.tsx`/`DopePanel.tsx` now derive the zero from `recommendedZeroM(DEFAULT_GAME_LOAD_CARTRIDGE_ID, unitsPrimary)`
(100 yd CF / 50 yd RF, owner-chosen); split the Confirm-Zero gate so the paper-grid HUD keys on
`targetKind === 'paper'` (interface) while the Confirm-Zero action keys on `rangeDef.zeroable`
(permission — now actually read, enabling future field-zeroing on a zeroable steel range with no
refactor); tidied a stale `zeroOffsetSdMrad` conversion comment in `catalog.ts` (the data field
stays for provenance, by prior decision). Typecheck clean, 570/571 tests green (the 1 miss is a
pre-existing stochastic wind-field flake, passes in isolation), build OK. **Next:** step 2 (DOPE
book status notes + real-zero wiring) — but the owner asked to discuss the UI / DOPE book first.

## Goal

A usable, auto-populated DOPE book that always shows a firing solution (assuming a 100 yd zero
until the player zeros), tightens as the player zeros then chronographs then confirms holds, and
reaches out to 1000 yd — **without** building the full 2.4b–f node-recording + confidence-tier
system first.

## How the DOPE book behaves (the through-line)

The DOPE book is **never hidden**. It always renders a come-up table, but carries **status
notes at the top** that tell the player how much to trust it:

- **"Not zeroed"** — the table assumes the cartridge's recommended zero (**100 yd centrefire /
  50 yd rimfire**, via the existing `recommendedZeroM()`). Until the player actually zeros, the
  rifle still carries its raw pointing error (D16), so real impacts will be *way* off the table.
  The note says so; the table is a placeholder, not a lie the player can't see through.
- **"Not chronoed"** — MV is the box value, not measured. The table is roughly right but
  unverified.

As the player progresses, notes clear and the table tightens:
1. **Zero** (any range they choose, incl. 25 yd) → updates the stored zero → table recomputes
   for that zero, "not zeroed" note clears.
2. **Chrono** → better MV → table recomputes, "not chronoed" note clears.
3. **Confirm hold at distance** → fits BC → table tightens at range.

## The steps

### 1. Fix the zero-error model + zeroing range
Three pieces:
- **Raise the off-the-shelf zero error** from the current ~1 MOA to **D16's raw pointing
  error** (flat 5–35 MOA magnitude, random direction) — see
  [`D16-raw-zero-error.md`](../archive/D16-raw-zero-error.md). A new rifle is genuinely un-zeroed and must
  be zeroed before it hits where the reticle points. Also retire the leftover
  `SCOPE_ZERO_RANGE_M = 300 yd` test constant in `loads.ts`.
- **Update the zeroing range to 25/50/100/200 yd** (currently 50/100/200) and treat it as a
  first-class range in the registry with **`zeroable: true`**. 25 yd is the "get on paper"
  distance for a rifle that could be ~9″ off at 25 yd. Add a backer big enough to catch that
  first-shot miss.
- **Decouple Confirm-Zero from the sight-in scene.** The `confirmZero()` store action is already
  range-agnostic (rifle id + distance + correction); only the *UI gate* is welded to the scene.
  Move the gate in `ScopeView.tsx` from `sceneType === 'sight-in'` to the existing (currently
  unread) **`rangeDef.zeroable`** flag, and source the zeroing distance from that range's
  engagement model (sight-in paper target now; committed steel plate later). This makes the
  dedicated zeroing range the canonical zeroing surface *and* leaves field-zeroing on other
  `zeroable` ranges as a free, no-refactor future option.
- The DOPE book meanwhile shows its table **assuming the recommended zero** (100 yd centrefire /
  50 yd rimfire) with a **"not zeroed"** note; **Confirm Zero** stores `playerZero` + a
  player-chosen `zeroRangeM`, the note clears, and the table recomputes for the confirmed zero.

  *Open sub-decision for detailed planning:* on a non-dedicated `zeroable` range, "the distance
  you're zeroing at" is looser (the last-engaged plate) — each such range needs a clear answer to
  what distance Confirm-Zero uses. The dedicated 25/50/100/200 range avoids this (fixed known
  distances); it only matters if/when field-zeroing is enabled elsewhere.

### 2. DOPE book status notes + box-stat table
Wire the always-visible come-up table (already largely built in `DopePanel.tsx`) to the real
per-rifle zero and add the **status-note header** ("not zeroed" / "not chronoed"). Before the
player zeros, the table assumes the cartridge's recommended zero via the existing
`recommendedZeroM()` (**100 yd centrefire / 50 yd rimfire**) — no new logic. Table is driven by
the believed load (box MV + box BC) at that zero. (Much of the table renderer exists; this step
adds the notes and the correct zero wiring.)

### 3. Chrono feeds the DOPE
When a `ChronoSummary` exists for the active rifle+lot, feed its average MV into the solve as
effective MV in place of box MV; recompute the table and clear the "not chronoed" note. Single
substitution at the MV input; the chrono capture/persist loop and recompute machinery already
exist. This is D15 lever 1.

### 4. Range out to 1000 yd
No engine blocker (sim has no distance cap). Extend the range config's target stations and lift
the DOPE table's hardcoded `MAX_RANGE_M` (currently 500 yd) so shots and the come-up table
reach ~1000 yd. Primarily content/config.

### 5. BC from confirming hold at distance — DONE (2026-07-31)
Capture the hold the player actually needed at a downrange target and 1-D-solve BC so the
computed come-up matches. This is D15 lever 2 (confirm-hold → BC). Last because it needs the
long range (step 4) to have a far shot to true against and MV pinned (step 3) so the residual
is genuinely BC. This is a *narrow* confirm-a-hold interaction — **not** the full node/
confidence-tier system. Shipped per [`bc-truing-plan.md`](./bc-truing-plan.md): an **asserted
hold** (not a measured/observed one) — the player dials/holds until rounds land, then presses
Update BC in the in-scope DOPE panel to fit BC to that number. Bracketed bisection
(`engine-bridge/bc-fit.ts`), a plausible-BC-band rejection with a readable reason (rather than
clamping), and the D15 re-true signal (`isBcStaleVsChrono`) when a later chrono outdates the fit.

## What this deliberately drops (vs. old 2.4b–f)

- No node-recording flow, no confidence tiers, no data-book confirmation gameplay as a
  prerequisite. Those remain valid future work (earning/verifying the card through confirmed
  shots) but are layered on later; the node flow just becomes a second producer of the same BC
  value, exactly as D15 already frames it.

## Open decisions — RESOLVED by what shipped (bc-truing-plan.md, 2026-07-31)

1. **Manual BC field as a stopgap before step 4?** Resolved: **not needed.** Went straight to
   confirm-hold (Update BC); the dialog's editable, pre-filled come-up field already gives the
   player direct control over the asserted number, so a separate D14 manual-nudge UI was never
   built as a stopgap.
2. **Carry the `provisional` label from the start?** Resolved: **yes** — D13/D15's
   provisional/trued labelling is live from T2 onward; no confidence-label deferral.

## Resolved: zeroing model

- **Zeroing model — DECIDED (D16, 2026-07-26)**, see
  [`D16-raw-zero-error.md`](../archive/D16-raw-zero-error.md). Option B: raw off-the-shelf pointing error
  (flat 5–35 MOA, random direction); player must zero; DOPE book gated until Confirm Zero;
  25/50/100/200 yd zeroing range.
