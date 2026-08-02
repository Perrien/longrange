# D15 — Truing levers are independent; last write wins (supersedes D11 no-chrono path)

**Status:** LOCKED with owner 2026-07-26. Decision only — no build code. Refines the 2.5
truing decisions (D11–D14) in [`../archive/increment-2.4-plan.md`](../archive/increment-2.4-plan.md) §8.
Whoever writes `increment-2.5-plan.md` must read this alongside §8.

## The decision

There are exactly two truing levers, and each always moves exactly one value:

- **Chronograph → MV.** A chronograph reading is the *only* thing that ever sets effective
  muzzle velocity. (`ChronoSummary`, 2.4e.)
- **Confirmed downrange node → BC.** Confirming a holdover node *always* fits effective
  BC/drag-scale, with MV held at its current effective value (chrono if one exists,
  otherwise box). A node never sets MV.

**The levers are independent and neither invalidates the other. Whichever value was written
most recently is considered current ("last write wins").** Recording a new chrono does not
clear or re-fit BC; confirming a new node does not touch MV.

## What this changes vs. D11

D11's **no-chrono case** is **superseded**: the node lever no longer changes roles based on
whether a chronograph exists. Under D11, a node with no chrono behind it solved *MV* (BC held
at catalog); under D15 a node *always* solves *BC* (MV held at its current value). The
"one lever, two meanings" behavior is gone — a node always means BC, a chrono always means MV.

**Rationale for the change:** a single fixed rule ("node = BC, chrono = MV") is teachable and
holds in a newcomer's head; the role-swap ("node = MV, unless you've chronoed, then node = BC")
does not. This is the project's simulation-first / learn-transferable-knowledge goal — the
mental model the player builds should match the real technique (chrono your ammo to pin MV,
then true BC off a long shot).

## What is deliberately preserved from D11–D14

- **The degeneracy is real; we choose to dump it on BC.** A single node cannot separate an MV
  error from a BC error. D15 does not pretend otherwise — it *chooses* to attribute the whole
  residual to BC. Consequence: a BC fit made *before* chronographing, on top of an off box MV,
  will be wrong-but-look-right at the trued range and drift at other ranges. This is intended
  pedagogy — it is *why* you chronograph.
- **No-chrono BC fits stay `provisional`** (owner-confirmed 2026-07-26). D13's merged label is
  retained: a data-book row reads **confirmed** only when *both* the node has met its shot-count
  threshold *and* the curve is chrono-anchored. A BC fit with no chrono behind it is
  `provisional` no matter how many shots the node has — preserving the teaching signal without
  reintroducing D11's MV-from-node inference. **D13 stands as written.**
- **D12 stands:** a recompute (MV *or* BC changing) only updates distances with no recorded
  node. Confirmed/provisional nodes stay frozen at their measured dial; the only way to change
  a station is to re-shoot and re-confirm it.
- **D14 stands:** a confirmed node's auto-fit always overwrites a manual MV/BC override.

## The re-true loop (a named, accepted consequence)

Because neither lever invalidates the other, this sequence is expected and correct:

1. No chrono yet → confirm an 800 yd node → BC fits so the table matches at 800 (provisional,
   per D13).
2. Later → chronograph the lot → effective MV moves → the table recomputes with the new MV and
   the **old** BC → the model no longer reproduces the recorded 800 yd node.
3. Per D12 the 800 yd node is *not* silently overwritten; the card and that stale node
   temporarily disagree.
4. The player **re-confirms 800** → BC re-fits on the corrected MV → card and node agree again,
   and (now chrono-anchored) the row can reach **confirmed**.

This mirrors the real re-true workflow (chrono the ammo, then re-shoot your far node). The
temporary card-vs-node mismatch between steps 2 and 4 is accepted on purpose, not a bug. When
2.5 is built, surface the mismatch (e.g. flag the affected node as "re-shoot to re-true")
rather than hiding it.

## Net effect on the locked set

- **Superseded:** D11's no-chrono path (MV solved from a node with BC held at catalog). The
  D11 *has-chrono* path (chrono pins MV, node fits BC) is unchanged and is now the *only* path.
- **Unchanged:** D12, D13, D14.
- **Added:** levers are independent, no cross-invalidation, last write wins; re-truing is a
  manual re-confirm.
