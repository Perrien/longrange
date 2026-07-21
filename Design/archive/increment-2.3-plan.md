# Increment 2.3 plan — Zeroing flow (sight-in range + gear-driven solve)

`Status: decisions D1–D10 LOCKED with owner 2026-07-19 — ready to build 2.3a` · `Date: 2026-07-19`
`Amended 2026-07-19 (same day):` final target art delivered (see D7); D3/D5 clarifications owner-confirmed
(entry-snapshot covers art variant + physical size; dial change starts a new group).
`Covers:` PROGRESS task **2.3** (zeroing flow), split into **2.3a / 2.3b / 2.3c / 2.3d**.
`Authority:` refines [`increment-2.md`](./increment-2.md) §2.3 under
[`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's
*Done when* clauses — it decides the *how* and the task split so each sub-task fits the §3 size
limit. **Live state lives in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this is the
point-in-time plan.**

---

## Context — why we're building this

Increment 2.1 built the **hidden-truth primitive** (`resolveTruth` → true MV/BC/zero-offset/precision
from stored draws); 2.2 built the **catalog + owned instances** (acquire a rifle + lot, select them).
Both were deliberately **inert on the live solve**. 2.3 is where the game's identity reaches the
trigger: a freshly-acquired rifle has a **hidden bore/scope misalignment** (`zeroOffsetRad`), so it does
**not** hit where you aim. The player must **zero** it on a dedicated **sight-in range** — fire a group
at a gridded paper target, read the group center off the grid, dial the correction out, and confirm —
before the rifle is trustworthy. This is the first mechanic that makes "two copies of the same model
each need their own zero" real, and it lays the physical-fact zero storage that DOPE (2.4) and truing
(2.5) build on.

**Owner decisions locked 2026-07-19 (this planning session):**
- **Expandable range-type system**, not a one-off view — future ranges (2.4 DOPE range, 2.7 Range B,
  later field range) plug in.
- **Wire true MV/BC into the solve now** (not just the zero offset) — the full hidden-truth gap goes
  live in 2.3.
- **Zeroing pedagogy:** show the group on the target's mil/MOA grid; the player **reads** the offset and
  **dials** it out, then confirms. Don't-chase nudge on < 3 shots.
- **Range A becomes gear-driven now** — a selected rifle+lot solves with their true ballistics + the
  player's zero; an unzeroed rifle misses on Range A too.
- **Sight-in range shape (new, this session):** a dedicated range with **three immobile paper targets**
  at **50 / 100 / 200** (in the active unit — yd for MOA, m for MIL), laid out **50 left of center,
  100 center, 200 right**. Targets are **square** (size per art variant — see D7), mounted on a
  **~1 yd/m-high rack**, and **do not
  swing**. **Wind is available** (defaults to calm; the player can dial speed + direction and watch it
  push the shot). Target face is the **OK2A-style sight-in design** (grid + five diamond bullseyes w/
  orange aim points), modeled on `Documentation/Targets/sighting in.pdf`. **Final art is delivered**
  (`Documentation/Targets/zeroing-target-mil.svg` / `zeroing-target-moa.svg`) — note the two variants are
  **different physical sizes** (MIL 44 cm, MOA 22 in); the range must account for that (D7). Hit marks
  are a **bright-green circle sized to the bullet diameter with a black outline**, so overlapping hits
  still show distinct edges. The player can **clean a target** (wipe its hit marks for a fresh face) and
  **inspect a target up close** (a head-on view, not through the scope) for accurate calibration.

---

## 1. What already exists (so we build, not rebuild)

- **The truth seam is built and idle.** `game/hidden-truth.ts` exposes
  `resolveTruth(rifle, rifleRanges, lot, lotRanges) → TrueBallistics { rifle:{mvOffsetMps,
  zeroOffsetRad{h,v}, inherentPrecisionRad}, lot:{meanMvShiftMps, mvSdMps, trueBc, bcSdFraction},
  totalMvOffsetMps }`. `catalog.ts` supplies the ranges (`catalogRifleRanges` / `catalogLotRanges`),
  the believed box `Load` (`believedLoad(ammoCatalogId)`), and the true base MV
  (`lotTrueBaseMvMps(ammoCatalogId)`) — both keyed by the lot's **catalog** id (`lot.catalogId`), not the
  instance id.
  **2.3 is the "real consumption lands in 2.3" the seam was built for.**
- **The no-leak guard is live.** `game/hidden-truth.guard.test.ts` fails if any file under
  `scope/ range/ shell/ debug/ state/` imports `game/hidden-truth` (allowlist: `debug/TruthInspector.tsx`).
  Truth must therefore enter the solve **inside `engine-bridge/` or `game/`**, never in a component.
- **The solve/fire pipeline is proven** (`scope/ScopeView.tsx`): `solveAt(rangeM, wind)` →
  `resolveShot({eye, aimDir, dial, solve, distanceM, scatter, plates, bulletDiameterM})` (`game/shot.ts`)
  → impact + hit test. `game/firing-solution.ts` has the pure geometry (`requiredCorrectionRad`,
  `centerOffsetM`, `discHit`). The engine bridge (`engine-bridge/index.ts`) owns all embind + `.delete()`;
  `solveTrajectory` zeros to line-of-sight at `zeroRangeM` and returns drop/windage relative to LOS.
- **Both `ScopeView` and `DopePanel` hardcode the box-true load** — `getGameLoad(DEFAULT_GAME_LOAD_ID)`
  + the module constant `SCOPE_ZERO_RANGE_M` (currently 300 yd, an owner test value in `game/loads.ts`).
  Both become gear-aware in 2.3.
- **`PlayerZero` is pre-sketched** in `persistence/schema.ts` as `{ elevationRad, windageRad }`, additive-
  optional on `RifleInstance`, validated only when present. 2.3 adds `zeroRangeM` (SI) as a **physical
  fact** — additive, no schema bump (2.1 D6 pattern).
- **Units are coupled, not separate.** No metric/imperial preference; `units/display.ts` keys off
  `settings.unitsPrimary` — **MIL ⇒ metric (m)**, **MOA ⇒ imperial (yd)**. The sight-in range's stations
  therefore read off `unitsPrimary` at entry; **no new setting needed** (D3).
- **Range A scene** (`range/RangeScene.ts` + `range-a-config.ts`) is a framework-agnostic THREE builder
  the view consumes; `App.tsx` hardcodes `'range-a'` and `RangeSelect.tsx` has one card. **No range
  abstraction exists yet** — 2.3a introduces it. Steel hit marks use the shipped target-surface
  chip-through-paint system; the sight-in target's green splat is a **separate, simpler** mark renderer.
- **Store** already has `inventory` (`rifles`, `ammoLots`, `activeRifleId`, `activeLotId`) + `selectRifle`
  / `selectLot`, and `session.scope.{elevationRad, windageRad}` (the dialed turret) + `session.wind`.

## 2. Architecture at a glance

```
                             active rifle + lot (records with draws)  ← store.inventory
                                        │  catalog ranges (catalogRifleRanges / catalogLotRanges)
                                        ▼
   engine-bridge/gear-solve.ts   ── resolveTruth(...) ── the ONE place truth enters the solve
     • solveGear(rifle, lot, ranges, opts) → { trueTable, believedTable, zeroOffsetRad }
        - trueLoad:     MV = lotTrueBaseMvMps + totalMvOffsetMps ; BC = trueBc   → impact + trace
        - believedLoad: box MV/BC (believedLoad(lot.catalogId))                  → DOPE / come-up display
        - zeroOffsetRad: rifle bore/scope misalignment {h,v}                     → resolveShot
                                        │                          (returns numbers only — no truth object)
        ┌───────────────────────────────┴───────────────────────────────┐
        ▼                                                                 ▼
   scope/ScopeView (Range A + sight-in share the scope core)        DopePanel (believed table)
     solve TRUE for impact/trace, BELIEVED for HUD come-up
     resolveShot(dial, playerZero, zeroOffsetRad, solve=trueDropWindage, …)
        applied  = aimError + dial + playerZero
        required = trueTrajectory + zeroOffsetRad     ← NEW zero-error term
        impact   = center + R·(tan(applied) − tan(required)) + scatter
                                        │
                                        ▼
   RANGE-TYPE SYSTEM (2.3a)     range/ranges.ts  RangeDefinition { id, name, unitCharacter,
        │                         sceneType: 'steel-racks' | 'sight-in', zeroable, stations }
        ├── range-a  (steel-racks)  → RangeScene (unchanged)
        └── sight-in (sight-in)     → SightInScene: 3 immobile square paper targets on a ~1 m rack,
                                        at 50 / 100 / 200 (active unit): 50 left, 100 center, 200 right.
                                        Wind available (default calm). Face = delivered zeroing-target art;
                                        size per variant: MIL 44 cm sq, MOA 22 in sq (D7).
                                        Hits = green bullet-sized disc + black outline (overlaps show edges).
                                        Clean-target wipes marks; inspect-target = head-on close-up view.
                                        │
                                        ▼
   ZEROING FLOW (2.3d)   overlay the shot marks + running group centroid on the target's grid; player
        READS the grid and dials the turret to center; CONFIRM → store.setPlayerZero({elevationRad,
        windageRad, zeroRangeM = engaged target's SI distance}) + reset turret to 0. Don't-chase nudge
        if adjusting/confirming on < 3 shots. playerZero persists via the existing inventory→save wiring.
```

Invariants honoured: **§4.8 / catalog §0** (truth never displayed — `solveGear` returns trajectories +
an angular offset, never true MV/BC/precision; the guard stays green because no component imports
`hidden-truth`), **§4.6** (no schema bump — `playerZero.zeroRangeM` is additive-optional, 2.1 D6), **§9**
(all embind stays in `engine-bridge/`), **§4.4** (all unit/grid math via the units service), **§4** (no
new deps — target art is a bundled asset, precached for offline).

## 3. Decisions — LOCKED (owner 2026-07-19)

**D1 — Expandable range-type system; sight-in is a SEPARATE range from Range A.** ✅
`range/ranges.ts`: a `RangeDefinition` + registry describing each range's identity, **unit character**
(`both` | `yards` | `meters` | `agnostic`), **scene type** (`steel-racks` | `sight-in`), whether it is
**zeroable**, and its **stations**. Register `range-a` (existing steel KD) and `sight-in` (new). Range A
stays a steel range and renders **byte-identically**; the sight-in bay (paper targets, immobile, wind
default-calm) is its own range rather than a modification of Range A — the owner offered either, and
separate is cleaner and is exactly what the registry is for. Future ranges add a row + a scene builder,
no rewrite.

**D2 — Gear-driven solve, with a box-true fallback.** ✅
With an active rifle **and** lot, the solve uses their **true** ballistics (impact/trace) + **believed**
ballistics (DOPE/HUD come-up) + the rifle's `zeroOffsetRad` + the stored `playerZero`. With **no** active
rifle/lot (fresh save, nothing selected), fall back to today's `getGameLoad` (believed = true,
`zeroOffset = 0`, `playerZero = 0`) so Range A, the golden vectors, and every existing test behave exactly
as today. Cartridge coherence: solve ballistics off the **lot**, zero-offset/precision off the **rifle**;
the Loadout overlay should offer only lots whose cartridge matches the active rifle (small filter in 2.2's
`LoadoutOverlay`); on a stray mismatch, solve off the lot and don't crash.

**D3 — Stations resolve at range ENTRY off `unitsPrimary`; never live-morph the world.** ✅
No new metric/imperial setting (coupled to `unitsPrimary`: MIL⇒m, MOA⇒yd). On walking onto the sight-in
range, snapshot the system and fix the three physical stations (imperial → 50/100/200 **yd**, metric →
50/100/200 **m**, stored in SI). **The entry snapshot also fixes the target art variant and its physical
size** (amended: the two art variants are different sizes — MIL 44 cm, MOA 22 in — so a live art swap
would resize the physical target, which D3 forbids). A later `unitsPrimary` flip therefore converts only
**labels/come-up display** (MIL⇄MOA) mid-session; the art + target size + stations change on the **next
range entry**, and a flip **must not** move or resize a target or re-zero. The stored zero is a
**physical fact** (`zeroRangeM` in SI + come-up in rad); flipping units only converts its label
("zeroed at 100 yd" ↔ "91.4 m").

**D4 — Sight-in layout: three immobile paper targets at 50/100/200; wind available.** ✅
`range/sight-in-config.ts`: three stations in the active unit — **50 left of shooter center, 100 center,
200 right** (x-offsets: 50 → −, 100 → 0, 200 → +). Target size is **per art variant** (amended, D7):
**MOA → 22 in (0.5588 m) square**, **MIL → 44 cm (0.44 m) square**, fixed by the entry snapshot (D3);
mounted at
**~1 yd/m** height on a simple **immobile** rack (no swing, no reactive physics, no berm system needed —
just a backstop). Any of the three is shootable; the **recommended** zero distance per cartridge is a hint
(50 for rimfire `.22 LR`, 100 for centerfire) surfaced in the HUD, but the player may zero on any target.
**Wind is available** but **defaults to calm** (`session.wind = {0,0}` on entry). The player can dial mean
speed + direction via the existing Increment-1.7 wind controls and see it push the shot at 50/100/200;
wind markers (flags/socks) render as on Range A. Wind is orthogonal to the DOPE work (2.4/2.5, which is
the vertical come-up table + MV/BC truing) — it teaches wind hold, not DOPE — so it stays in scope here. A
gentle hint appears if the player confirms a zero in non-trivial wind ("zero in calm conditions").

**D5 — Zeroing is read-the-grid + manual dial-to-center + confirm.** ✅
After each shot, plot the impact mark on the target and overlay the running **group centroid** on the
target's printed mil/MOA grid — the player **reads the grid** to judge the offset (the UI does not spell
out the numeric correction; that's the "read & dial" pedagogy the owner chose). **Group rule (amended,
owner-confirmed): any dial change starts a NEW group** — centroid tracking resets; prior marks stay on
paper (until Clean) but are excluded — so the player fires a fresh confirming group after each
correction and the centroid can visibly center (a centroid of pre-dial shots would never move).
**Grid calibration:** both art grids are calibrated at **100** (1 in ≈ 1 MOA at 100 yd; 2 cm = 0.2 MIL
at 100 m) — at 50 a square reads **2×** the angular value, at 200 **0.5×**; surface this as a small HUD
hint per station so the read-and-dial math stays honest. (The MOA grid is inch-based "shooter's MOA";
vs. true MOA that's a ~4.7% read error — accepted, the confirm-group iteration absorbs it, as in real
life.) The player **dials the
turret** to bring the next group onto the center diamond, then taps **Confirm zero**: **COMPOSE minus
the come-up handoff** — `playerZero += current turret − required(target | old zero reference)` —
+ `zeroRangeM = engaged target's SI distance`, then reset the turret to 0/0 (future dialing is
relative to the new zero). *(Amended 2026-07-19, two parts: (a) COMPOSE, never replace — the stored
zero is applied as a baseline under the dial in `resolveShot`, so the post-confirm turret is
relative to it; replacing shifted the next shot by exactly the dropped old zero. (b) The sight-in
solve zeros the trajectory at the rifle's CURRENT zero reference (stored `zeroRangeM`, else the
cartridge default), so the other stations read their true hold — a 100-zeroed rifle is ~0.2 mil low
at 50 and ~0.5 mil low at 200; the come-up portion of the confirming dial is therefore absorbed into
the NEW trajectory zero, not the angular baseline, leaving `playerZero` a pure bore-offset
corrector.)* A **Clean target** button (D9) wipes the
target's hit marks and resets the current group for a fresh face; it does not touch a stored zero.
**Don't-chase nudge:** adjusting the dial or confirming with **< 3 shots** in the current
group shows a non-blocking hint ("let the group build — 3+ shots before you trust the center"). Both
**MIL and MOA** turrets/grids work (they follow `unitsPrimary`).

**D6 — Zero-error math is a pure, additive term in `resolveShot`.** ✅
Two changes in `game/shot.ts` (pure, unit-tested, no engine/embind):
- `applied = aimError + dial + playerZero`  (stored zero baseline adds to what the player applies)
- `requiredEff = requiredCorrectionRad(trueDrop, trueWindage, R) + zeroOffsetRad`  (bore misalignment is
  extra correction the player must supply)
- `impact = center + centerOffsetM(applied, requiredEff, R) + scatter`

Sign-checked: fresh rifle (`playerZero=0`) at the zero target (`required≈0`) aiming center with `dial=0`
lands off by `−R·tan(zeroOffset)` (visibly off-zero ✓). Dial `zeroOffset` → centered; Confirm snapshots
`playerZero≈zeroOffset` and resets the turret → future shots have `applied=zeroOffset`,
`requiredEff=required+zeroOffset` → the offset cancels at **all** ranges. Downrange, the residual miss is
purely `R·(required_believed − required_true)` — the DOPE gap 2.4/2.5 address — independent of the zero.
`zeroOffsetRad` reaches `resolveShot` as a **plain number** from `solveGear`; it is never rendered
(§4.8), so the guard test stays green (no component imports `hidden-truth`).

**D7 — Target face uses the delivered zeroing-target art (MIL + MOA variants); green bullet-sized splat
marks.** ✅ *(amended: final art DELIVERED 2026-07-19 — no placeholder needed)*
Final art: **`Documentation/Targets/zeroing-target-moa.svg`** — 22×22 in, 1-in border + 20×20 grid of
**1-inch squares** (≈1 MOA at 100 yd), five diamond bullseyes (center + 4 corners), all with orange
aim points; **`Documentation/Targets/zeroing-target-mil.svg`** — 44×44 cm, 2-cm border + 20×20 grid of
**2-cm squares** (0.2 MIL at 100 m), same layout. Identical proportions, **different physical sizes** —
the scene's target quad and the splat-radius mapping must use the **variant's own size** (0.5588 m vs
0.44 m), fixed at range entry (D3). Copy both SVGs into the app's bundled assets (Vite's precache
`globPatterns` already includes `svg` — offline §4.7 is satisfied automatically). **Rasterize for the
texture at high resolution** (≥2048², ideally 4096²): the thin grid strokes (~0.2 mm) vanish at low
raster sizes; verify grid readability through the scope at 100/200 on device. Generator + provenance:
`Documentation/Targets/generate_target.py` (note: the script still writes `zeroing-target-inch.svg`;
the shipped file was renamed `-moa` — sync the script if regenerating). **Hit marks:** a **bright-green
filled circle** at the impact, **radius = the load's bullet radius** mapped to the target face, with a
**black outline stroke**, drawn onto the target's mark layer so **overlapping hits still show their
edges**. This is a new, simple paper-mark renderer (`range/sight-in-marks.ts`), independent of the steel
target-surface system.

**D8 — Zero distance policy helper (light).** ✅
`game/zero-distance.ts`: `recommendedZeroM(cartridgeId, unitsPrimary) → number` (SI) — 50 (rimfire) /
100 (centerfire) in the active unit, used only for the HUD hint. The **stored** `playerZero.zeroRangeM`
is always the distance of the target the player actually confirmed on (not this hint).

**D9 — "Clean target" wipes hit marks for a fresh face, any time.** ✅
A **Clean target** action clears the engaged target's drawn hit-mark layer (the green splats) and resets
the current group tracking, giving a fresh face to shoot — available at any point, not only during
zeroing, and independent of any stored zero (cleaning marks never alters `playerZero`). Implemented in the
`range/sight-in-marks.ts` renderer (clear the mark layer + re-upload). Offer "clean this target"; a
"clean all" is a cheap extension if wanted.

**D10 — "Inspect target" gives a head-on close-up view for accurate calibration.** ✅
The player can view a target **up close, not through the scope** — a head-on inspect view that renders the
target face (art + hit marks + the current group centroid) flat and large, so the grid is easy to read and
the group easy to judge before dialing. Cheapest robust form: an **overlay** that draws the same target
texture + mark layer + centroid at high resolution (no downrange camera flight needed); reachable by an
"Inspect" button and dismissed back to the scope. It is read-only (no dialing from the inspect view) —
the player inspects, returns to the scope, dials, and confirms. This reinforces the read-the-grid pedagogy
(D5) and is the sight-in analogue of walking downrange to check your target.

## 4. Task split (each stops for owner per protocol §2.8)

Four sub-tasks, dependency-ordered, each independently verifiable, within the §3 size limit (~400 lines /
~10 files). PROGRESS label **2.3** becomes **2.3a / 2.3b / 2.3c / 2.3d**. If **2.3d** exceeds the limit,
split off **2.3e** for the Range A gear/zero integration (cleanly separable; shares only `solveGear`).

### 2.3a — Range-type registry + zero-distance hint + schema field (no gear-solve, no scene yet)
*Pure config + a thin, behaviour-preserving refactor + one additive schema field.*
- `range/ranges.ts`: `RangeDefinition` type + registry with `range-a` (`sceneType:'steel-racks'`,
  `unitCharacter:'both'`, `zeroable:false`) and `sight-in` (`sceneType:'sight-in'`, `unitCharacter:'both'`,
  `zeroable:true`, stations = [50,100,200] with side offsets). `getRangeDefinition(id)`.
- `game/zero-distance.ts` (pure): `recommendedZeroM(cartridgeId, unitsPrimary)` (D8), units-service-based.
- `persistence/schema.ts`: add `zeroRangeM: number` to `PlayerZero`; extend `validatePlayerZero` to check
  it **when present** (additive-optional; no version bump). Add a v2 fixture rifle with a full `playerZero`
  (incl. `zeroRangeM`) to `persistence.test.ts`.
- `App.tsx` / `shell/RangeSelect.tsx`: route selection through the registry — add a second card
  ("Zero Range — sight in"); `App` view state keys off the selected `RangeDefinition`, not literal
  `'range-a'`. **Range A must render/behave exactly as before.**
- **Done when:** `recommendedZeroM` unit tests (rimfire→50, centerfire→100, both systems, SI); registry
  resolves both ranges; the new `playerZero.zeroRangeM` fixture migrates/validates; Range A selects and
  renders identically. `tsc` + `vitest` + `npm run build` + `node GameBuild/validation/run.mjs` green.

### 2.3b — Gear-solve seam + zero-error shot math (pure/engine; no scene/flow yet)
*The truth→solve boundary + the two `resolveShot` changes; fully unit-testable.*
- `engine-bridge/gear-solve.ts` (new; may import `hidden-truth` + `catalog` — NOT in the guard scan):
  `solveGear({ rifle, lot, rifleRanges, lotRanges, atmosphere, wind, zeroRangeM, maxRangeM, stepM,
  sightHeightM }) → { trueTable, believedTable, zeroOffsetRad }`. Builds the **true** Load
  (`MV = lotTrueBaseMvMps(lot.catalogId) + totalMvOffsetMps`, `bc = trueBc`, spin from twist) and the
  **believed** Load (`believedLoad(lot.catalogId)`), solves both via the existing `solveTrajectory`,
  returns `zeroOffsetRad`
  from `resolveTruth`. **Returns numbers only — never the `TrueBallistics` object.**
- `game/shot.ts`: add optional `zeroOffsetRad?:{h,v}` (default `{0,0}`) + `playerZero?:{elevationRad,
  windageRad}` (default `{0,0}`) to `ResolveShotParams`; apply the D6 math. Existing callers unchanged.
- `state/store.ts`: `setPlayerZero(rifleId, { elevationRad, windageRad, zeroRangeM })` — writes
  `inventory.rifles[i].playerZero` immutably (persists via existing inventory→save wiring).
- **Done when:** `shot.test.ts` — fresh instance (`playerZero=0`, `zeroOffset≠0`) lands off by
  `R·tan(zeroOffset)` at the zero distance; `playerZero=zeroOffset` centers it; the offset stays cancelled
  at a far range while believed≠true MV produces a downrange miss equal to the DOPE gap. `gear-solve` test
  — a known-draw rifle+lot yields the expected true MV (base + offsets) & BC, believed≠true, and no truth
  object is returned. Guard test green. `tsc` + `vitest` + `npm run build` + `run.mjs` green.

### 2.3c — Sight-in scene: 3 immobile OK2A paper targets, wind (default calm), green splat marks, clean/inspect
*New scene + target/mark renderer; reuses the scope core. No confirm/zeroing logic yet (2.3d).*
- `range/sight-in-config.ts` (pure): three stations from the entry-snapshot unit system (SI distances
  50/100/200; side offsets 50-left / 100-center / 200-right), **per-variant target size** (MOA 0.5588 m /
  MIL 0.44 m square, D7), ~1 m rack height, backstop dims. Snapshot at entry (D3) — art variant + target
  size + stations are all fixed by the snapshot; a later unit flip does not move or resize targets.
- `range/sight-in-target-texture.ts`: load the delivered art (`zeroing-target-moa.svg` /
  `zeroing-target-mil.svg`, copied into app assets — the existing precache glob covers `svg`, §4.7) and
  rasterize to a ≥2048² texture (D7 — thin grid strokes must survive; check readability at 200).
- `range/sight-in-marks.ts`: the green-disc + black-outline hit renderer (D7) — radius = bullet radius
  mapped to the target face; draws onto a per-target mark layer so overlaps show edges. Exposes a
  **clean(targetId)** that clears a target's mark layer for a fresh face (D9).
- `range/SightInScene.ts`: framework-agnostic THREE builder — ground + backstop + three immobile paper
  targets (no swing/reaction/berm). Target face carries the texture + the mark layer.
- `ScopeView`: branch on `RangeDefinition.sceneType` — `RangeScene` (steel) vs `SightInScene`. **Reuse**
  the magnified camera, aim/wobble/breath/recoil, zoom, reticle as-is. On entry to the sight-in range,
  set `session.wind={0,0}` (calm default) but leave the existing Increment-1.7 wind controls + markers
  live so the player can dial wind and watch it push the shot (D4). Solve the engaged target via
  `solveGear` (or the box-true fallback, D2). Firing paints a green splat on the target. Wire a **Clean
  target** button to the renderer's `clean` (D9).
- **Done when:** `sight-in-config` unit tests (three stations at the right SI distances + side offsets;
  entry snapshot stable across a `unitsPrimary` flip). `tsc` + `vitest` + `npm run build` + `run.mjs`
  green. **OWNER CHECK (device):** Zero Range → three grid targets at the variant's size (22 in MOA /
  44 cm MIL; 50 left / 100 center / 200 right)
  render at the right distances in the active unit; grid lines are readable through the scope at 100 and
  200; wind defaults to calm but dialing wind visibly pushes
  the shot; shots leave bright-green bullet-sized splats with black outlines (overlaps show edges); Clean
  target gives a fresh face; a mid-session MIL⇄MOA flip changes labels only, and re-entering the range
  swaps art + target size without breaking anything.

### 2.3d — Zeroing flow (grid-read overlay, dial-to-center, confirm, don't-chase) + Range A integration
*Delivers the increment-2.md §2.3 Done-when. Split off **2.3e** for the Range A wiring if oversized.*
- Zeroing overlay (`scope/ZeroingOverlay.tsx` or in-scope HUD): after each shot, show the shot marks +
  running **group centroid** against the target's grid (read-the-grid, D5 — no spelled-out numeric
  correction; include the D5 grid-scale hint at 50/200). **Any dial change starts a new group** (D5
  amended): centroid resets, prior marks stay until Clean, don't-chase counts the new group's shots.
  Group tracking is **per engaged target** (switching targets starts/resumes that target's group).
  **Confirm zero** → `setPlayerZero({elevationRad, windageRad}=current turret, zeroRangeM =
  engaged target SI)` then reset the turret to 0/0 and clear the group. **Clean target** (D9) wipes the
  target's marks for a fresh face without touching a stored zero.
- **Inspect target (D10):** an "Inspect" button opens a read-only head-on close-up of the engaged target
  (art + hit marks + current group centroid) at high resolution so the grid/group are easy to judge;
  dismiss returns to the scope to dial and confirm.
- **Don't-chase nudge (D5):** adjusting/confirming with **< 3 shots** shows a non-blocking hint; a calm-
  conditions hint appears if confirming in non-trivial wind (D4).
- **Physical-fact readout:** "Zeroed at 100 yd" via `formatDistanceForDisplay(zeroRangeM,…)` (flips to
  "91.4 m" under metric); come-up converts MIL⇄MOA on display.
- **Range A integration (D2):** switch Range A impact + trace to the **true** solve and `DopePanel` + HUD
  come-up to the **believed** solve, both via `solveGear`, passing the active rifle's `zeroOffsetRad` +
  `playerZero` into `resolveShot`. Solve zero distance = the rifle's stored `playerZero.zeroRangeM` if
  zeroed, else the cartridge default (an unzeroed rifle visibly misses). **Box-true fallback (D2)** when no
  active gear keeps today's behaviour; retire/repurpose the 300-yd `SCOPE_ZERO_RANGE_M`.
- **Done when (increment-2.md §2.3 verbatim):** after zeroing, POA=POI at the zero distance within the
  load's noise; a fresh instance starts visibly off-zero; the flow works with **both MIL and MOA**
  turrets. Plus: Range A shoots gear-driven (true impact / believed DOPE) with the fallback intact.
  `tsc` + `vitest` + `npm run build` + `run.mjs` green. **OWNER CHECK (device):** acquire two copies of
  one rifle → each needs its own zero; after zeroing, a group centers at the zero target; the zero
  survives relaunch (persisted) and an export/import; Range A reflects the active gear + zero; Clean target
  and Inspect both work.

**Order & stops:** 2.3a → 2.3b → 2.3c → 2.3d(→2.3e). 2.3a and 2.3b are independent; 2.3a first keeps the
registry + schema field stable before the scene/flow reference them. 2.3c depends on 2.3a and uses 2.3b's
`solveGear`. 2.3d depends on all. **STOP for owner confirmation after each** (protocol §2.8). Commit per
task (`inc2/task2.3a: …`, owner-side per the git agreement — the agent runs no git).

## 5. Risks, constraints, and non-goals

- **Non-goal (later tasks):** no DOPE data book / node recording (2.4), no truing (2.5), no reticle ranging
  (2.6), no Range B / skill gates (2.7). 2.3 delivers the sight-in range, the zeroing mechanic, physical-
  fact zero storage, and the gear-driven solve — nothing further.
- **Downrange misses appear before the DOPE tools exist.** True MV/BC (Q2) means a correctly zeroed rifle
  still misses at distance (box come-up is optimistic) with no data book yet (that's 2.4). Expected/by-
  design; the sight-in targets (≤200) are close enough that this barely shows, so zeroing is unaffected.
- **Guard discipline (§4.8):** `solveGear` is the single new truth-consuming module; it lives in
  `engine-bridge/` (outside the guard scan) and returns only trajectories + an angular offset. Do **not**
  return/render true MV/BC/precision, and never import `hidden-truth` into a `scope/` file.
- **Target art (delivered):** both variants are in `Documentation/Targets/` — no placeholder or blocking
  dependency remains. Residual risks: **raster resolution** (thin grid strokes must survive the SVG→texture
  rasterization and stay readable at 200 — verify on device) and the **size split** (every place that maps
  target-face coordinates — splat radius, centroid overlay, inspect view — must use the variant's physical
  size, 0.5588 m vs 0.44 m, never a shared constant).
- **Fit check (done):** catalog `zeroOffsetSdMrad = 0.29` → worst-case ~±0.9 mrad offset ≈ 9 cm at 100 m
  (3.2 in at 100 yd) — a fresh rifle's group lands comfortably on either paper at the recommended zero
  distance.
- **Refactor risk (2.3a):** the registry refactor must leave Range A byte-identical — lean on
  `range-a-config.test.ts` + a device check before moving on.
- **Determinism:** `solveGear` must stay a pure function of (records, ranges, conditions) — no `Date.now`
  / global RNG — so export/import (2.8) and truing (2.5) reproduce.
- **Offline (§4.7):** both target-art files must be added to the precache manifest and offline launch
  re-verified.
- **Catalog drift (2.1 D2)** still accepted in dev: editing a catalog range shifts owned instances' truth
  (and their zero offset) until the pre-release freeze — wipe the dev save if disruptive.

## 6. Verification (end-to-end)

- **Automated (every sub-task):** `npx tsc --noEmit`, `npx vitest run`, `npm run build`, and
  `node GameBuild/validation/run.mjs` (stays zero-diff — the engine is untouched; `solveGear` only composes
  existing bridge calls). New suites: `zero-distance`, `ranges`, `sight-in-config`, `gear-solve`, expanded
  `shot.test.ts`, and the `playerZero.zeroRangeM` migration fixture. `hidden-truth.guard.test.ts` stays green.
- **Owner device checks (can't be asserted programmatically):** (2.3c) sight-in scene — three grid targets
  at 50/100/200 in the active unit at the variant's size (22 in / 44 cm), grid readable through the scope
  at 100/200, correct left/center/right layout, wind defaults calm but dialing wind
  pushes the shot, green bullet-sized splats with visible overlap edges, Clean target gives a fresh face,
  MIL⇄MOA flip is label-only mid-session and swaps art/size on re-entry; (2.3d) two copies each need their
  own zero, POA=POI after
  zeroing, MIL and MOA turrets both work, Inspect close-up reads clearly, zero persists across relaunch +
  export/import, Range A reflects gear + zero. Mark these `AWAITING OWNER` in `PROGRESS.md` with exact steps.

---

**Next step:** build **2.3a**, verify, log to `PROGRESS.md`, and STOP for owner confirmation before 2.3b —
per [`execution-protocol.md`](./execution-protocol.md) §2. (Final MIL/MOA target art is delivered —
`Documentation/Targets/zeroing-target-{mil,moa}.svg`; copy into app assets during 2.3c.)
