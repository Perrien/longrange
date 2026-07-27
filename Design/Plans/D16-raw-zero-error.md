# D16 — Raw off-the-shelf zero error; player must zero (Option B)

**Status:** **BUILT 2026-07-26** (offset model + off-paper visibility). Consequence 1
(the DOPE book's "not zeroed" note) still pending — it needs the Data Book UI from task
2.4f. Originally LOCKED with owner 2026-07-26 as decision-only.

**Implementation note added on build:** the 25 m station could not actually serve as the
"get on paper" step without a change. Hit marks were painted on the PAPER only, and a
35 MOA error at 25 m is 25.5 cm off centre against a 22 cm half-width metric face — so
~16% of rifles left no visible impact at all. The backer board is now a mark surface too
(33 cm half-width), which is what this doc's "a backer big enough to catch a ~9″
first-shot miss" requires. See `range/WoodedZeroScene.ts` `paintHit`. Drives step 1 of
[`dope-first-plan.md`](./dope-first-plan.md). Supersedes the effective behavior of the current
~1 MOA hidden zero offset (`zeroH`/`zeroV` SD in the hidden-truth model).

## The decision (Option B: truly raw bore)

A brand-new rifle+scope is **not** treated as pre-zeroed. Out of the box it carries a large,
random scope/mount **pointing error** the player must discover and remove by zeroing. Bore and
line of sight point in the same general direction, but not aligned.

### Offset spec
- **Magnitude:** flat (uniform) distribution, **5–35 MOA**.
- **Direction:** uniform random 0–360°.
- **Construction:** draw magnitude ∈ U(5, 35) MOA and direction ∈ U(0, 360°), then decompose
  into H/V components (`h = mag·cos θ`, `v = mag·sin θ`). This *replaces* the current independent
  H/V normal draws with SD ~1 MOA — a guaranteed meaningful offset (never rolls a near-perfect
  rifle), which makes "you must zero before the rifle is usable" always true.
- Reference sizes: 1 MOA ≈ 1.047″/100 yd. So 5 MOA ≈ 1.3″ @25 / 5.2″ @100; 35 MOA ≈ 9.2″ @25 /
  37″ @100. At 100 yd a large offset is off a normal target entirely — which is *why* you start
  at 25 yd.

### Physical model (unchanged, just bigger)
The offset is a **range-independent angular constant** added on top of the trajectory (exactly
what `zeroOffset` already is). Because it's constant at all ranges, zeroing at any one distance
cancels it at all distances; the leftover per-range differences are pure trajectory = the DOPE.
This is how a real scope zero physically works — not a simplification.

## Zeroing workflow

- A zeroing range offers **25, 50, 100, and 200 yd** targets (this may be a **new range
  feature** — the current sight-in range is 50/100/200; 25 yd needs adding, with a backer big
  enough to catch a ~9″ first-shot miss).
- **25 yd is "get on paper"** — coarse: confirm shots land in the right general area, remove the
  bulk of the pointing error.
- The player then **stretches to 50/100/200** and refines. Because a 25 yd zero and a 100 yd
  zero cross the line of sight at different points, the come-ups differ — refining at the longer
  distance is a real, teachable step, not busywork.
- **The player zeroes to whatever range they want.** When they hit **"Confirm Zero,"** that
  locks in the rifle as zeroed *at that range*: stores `playerZero` (dialed correction) **and**
  the chosen `zeroRangeM`.
- **Confirm the zero range with the player** at Confirm-Zero time (the stored `zeroRangeM`
  becomes the DOPE reference, so it must be explicit, not guessed from which target they last
  shot).

## Consequences / requirements this creates

1. **DOPE book stays visible with a "not zeroed" note (NOT gated/hidden).** The come-up table is
   built from trajectory only and does **not** include the hidden offset — so an unzeroed rifle's
   table is a placeholder that real impacts will miss badly (up to 35 MOA). Rather than hide it,
   the DOPE book **always renders**, assuming a **100 yd zero**, and shows a **"not zeroed"**
   status note at the top so the player knows the table is provisional until they zero. (Owner
   decision 2026-07-26 — corrects this doc's earlier "gate/hide until zeroed" wording.) A
   parallel **"not chronoed"** note covers box-vs-measured MV. Notes clear as the player zeros /
   chronographs and the table recomputes.
2. **Unzeroed come-up shape assumes the recommended zero.** Before the player zeros, the table
   is computed as if zeroed at the cartridge's recommended distance — **100 yd centrefire / 50 yd
   rimfire** (the existing `recommendedZeroM()`, no new logic). It's a sane default that's still
   "way off" in reality because the raw pointing error hasn't been removed. That's expected and is
   exactly what the "not zeroed" note communicates. After **Confirm Zero**, the table recomputes
   for the player's chosen `zeroRangeM`.
3. **Zero range is player-chosen and stored**, then feeds every downstream DOPE solve as the
   reference. A 25 yd "get on paper" is a coarse step; the player decides what counts as their
   real zero by confirming at that range.

## Open sub-decisions (for the detailed step-1 plan)

- Does a 25 yd Confirm-Zero count as a legitimate final zero (stored as `zeroRangeM = 25`), or
  is 25 yd flagged/discouraged as coarse-only? (Owner leans: player's choice — they confirm
  whatever range they want.)
- Exact "Confirm Zero" UX: how the dialed correction at confirm time maps into `playerZero`, and
  how the range is confirmed with the player.
