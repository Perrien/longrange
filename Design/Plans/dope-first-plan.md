# DOPE-first plan — auto-populated, chrono-fed DOPE book to 1000 yd

**Status:** DRAFT / basic plan — locked as the direction 2026-07-26. Detailed per-step plan
to follow. This supersedes the increment 2.4b–f node-confirmation sequencing *as the path to a
working DOPE book* — the heavy node/confidence machinery is no longer a prerequisite. Builds on
D15 ([`D15-two-lever-truing-independent.md`](./D15-two-lever-truing-independent.md)): two
independent levers, chrono→MV, confirm-hold→BC.

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

### 5. BC from confirming hold at distance
Capture the hold the player actually needed at a downrange target and 1-D-solve BC so the
computed come-up matches. This is D15 lever 2 (confirm-hold → BC). Last because it needs the
long range (step 4) to have a far shot to true against and MV pinned (step 3) so the residual
is genuinely BC. This is a *narrow* confirm-a-hold interaction — **not** the full node/
confidence-tier system.

## What this deliberately drops (vs. old 2.4b–f)

- No node-recording flow, no confidence tiers, no data-book confirmation gameplay as a
  prerequisite. Those remain valid future work (earning/verifying the card through confirmed
  shots) but are layered on later; the node flow just becomes a second producer of the same BC
  value, exactly as D15 already frames it.

## Open decisions (deferred to detailed plan)

1. **Manual BC field as a stopgap before step 4?** D14 "manual truing" (a nudgeable BC field)
   is smaller than confirm-at-distance and could ship first. Or go straight to confirm-hold.
2. **Carry the `provisional` label from the start?** D15 keeps no-chrono BC fits provisional;
   the minimal path could skip confidence labels initially and add them later.

## Resolved: zeroing model

- **Zeroing model — DECIDED (D16, 2026-07-26)**, see
  [`D16-raw-zero-error.md`](../archive/D16-raw-zero-error.md). Option B: raw off-the-shelf pointing error
  (flat 5–35 MOA, random direction); player must zero; DOPE book gated until Confirm Zero;
  25/50/100/200 yd zeroing range.
