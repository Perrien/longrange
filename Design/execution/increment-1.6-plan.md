# Increment 1.6 plan — the loop: sight height, wind, dial, HUD, scoring, DOPE

`Status: DECISIONS LOCKED — ready to build` · `Date: 2026-07-15`
`Covers:` PROGRESS task **1.6** (sight height over bore, wind controls, turret dial, HUD, shot budget, scoring, DOPE screen).
`Authority:` refines [`increment-1.md`](./increment-1.md) §1.6 under [`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's *Done when* clauses. **Live state lives in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this doc is the point-in-time plan.**

This task turns the working aim→fire→impact→feedback chain (1.1–1.5, all owner-confirmed on device) into an **actual scored engagement** — the first genuinely *playable* slice.

> **Audience note:** this doc is written for a junior programmer. Work **one sub-task at a time, top to bottom.** After each sub-task: run its Verify checkpoint, update `PROGRESS.md`, commit, and **STOP for owner confirmation before starting the next** (protocol §2.8). Do not batch sub-tasks. If any check goes red and the fix isn't obvious inside the sub-task's scope, STOP and log it (protocol §6) — a task blocked honestly is a success, not a failure.

---

## Locked decisions (owner, 2026-07-15)

- **D1 — Model 2″ sight height over bore now.** Owner confirmed BTK exposes scope-height + zero-distance inputs. Implemented at the **bridge/app layer** (no C++ change), so the golden-vector oracle stays untouched.
- **D2 — Scoring = simple session counters.** A **target is a specific plate.** A "first-round hit" = your **first** shot after committing to a plate hits **that** plate. Commit is **explicit** (aim at a plate, tap "Commit"); it refills the budget and resets the per-target shot count. No medals/streaks; score is **not saved** yet (waits for the Increment-2 save-schema bump).
- **D3 — DOPE = narrow table docked LEFT of the scope**, with a show/hide button, in the dark mask margin so it never covers the scope glass or the dial/fire controls. Dual units stacked per row.
- **D4 — Dialing is solve-only for now (Option A).** Dialing changes the firing solution; the sight picture does not move. **Option B** (dialing shifts the sight picture and you re-center the rifle — the true real-world behavior, per owner) is recorded as a **future refinement**, its own task.
- **D5 — Include dial-click audio** (BTK `scope_click.mp3`).
- **D6 — Wind input = 0–20 mph speed slider + 12-o'clock direction dial.**

## What already exists (build on this, don't rebuild)

- **Store** (`state/store.ts`) already holds `session.wind`/`setWind`, `session.scope` dial state + `dialElevationClicks`/`dialWindageClicks`/`setZoom`, `session.shotBudget`/`decrementBudget`, `session.lastShots`/`recordShot`, and `selectTarget(distanceM, budget)`. **Missing:** any score/first-round tracking, and a target *identity* (which plate) beyond bare distance.
- **The shot loop is closed.** `ScopeView.tsx` FIRE already does: sample aim → pick aimed rack → `solveTrajectory` (zeroed at `SCOPE_ZERO_RANGE_M`, currently the **300 yd test zero**) → `MatchSimulator` scatter → `resolveShot` → `recordShot` + `decrementBudget` → steel reaction + audio + dust + trace. The dial is already read into the solve (`dial: { elevRad: scope.elevationRad, windRad: scope.windageRad }`); **nothing sets it in the UI yet**, and budget floors at 0 without blocking fire.
- **The DOPE screen has a working reference:** the 0.4 debug `DropTable` (`debug/DropTable.tsx`) already renders `solveTrajectory` MIL+MOA and metric+imperial. 1.6's DOPE panel reuses its solve + row-format path so the numbers can't drift.
- **Units service** has `mphToMps`/`mpsToMph`, `asMilMoa`, `asMetricImperial*`, `metersToYards`, etc. **Missing:** a clock↔degrees helper.
- **Audio manager** (`audio/audio-manager.ts`) already preloads/unlocks/plays BTK SFX with an iOS-safe gesture unlock. Adding a click sound is one more clip + one method.
- **BTK asset** `scope_click.mp3` exists (MIT) for D5.

## Architecture at a glance

```
                          ┌──────────  state/store.ts  ──────────┐
   1.6b (pure) ─────────► │ session: wind · scope(dial,zoom)      │
                          │          currentTarget{plateId,dist}  │  ← NEW
                          │ score:   hits·shots·firstRoundHits·   │  ← NEW
                          │          targetsEngaged               │
                          │ actions: commitTarget() · recordShot()│
                          │          (now also scores)            │
                          └───────────────────────────────────────┘
   1.6a  engine-bridge/index.ts:  zero target y = sightHeight; drop reported vs LINE OF SIGHT
   1.6c  ScopeView UI:  wind dial · turret ± · Commit · HUD (dial·shots·last-call·score)
   1.6d  DopePanel:     narrow left table, current load+wind+zero, shares DropTable solve
```

All angle/length/speed math routes through the **units service only** (guardrail §4.4). Both MIL+MOA and metric+imperial shown everywhere (catalog §0.6). **No new npm deps; no runtime CDN.** Engine C++ is **not** touched, so `ctest`/golden vectors only need re-running if you unexpectedly edit `GameBuild/engine/`.

---

## 1.6a — Sight height over bore (correctness foundation)

**Goal:** make the zero and the reported come-ups reference the **line of sight** (scope ~2″ above the bore) instead of the bore line. This is the honest-DOPE foundation that 1.6c holds and 1.6d DOPE both depend on, so it goes first.

**Why:** the bullet leaves the muzzle ~2″ *below* the crosshair, arcs up across the line of sight, and crosses it again at the zero. Two inches subtends ~1 mil (~3.8 MOA) at 50 yd but only ~0.1 mil at 500 yd, so this mostly fixes the **near** targets. See the D1 discussion for the full picture.

**Files:** `engine-bridge/index.ts`, the `SolveOptions` type (grep `interface SolveOptions`), `game/loads.ts`, `game/firing-solution.ts` (read-only check — likely no change), tests. Engine C++ untouched.

**Steps:**

1. Add an **optional** `sightHeightM?: number` to `SolveOptions`, **defaulting to `0`**. Defaulting to 0 means the golden-vector harness and the 0.4 debug table, which pass no sight height, keep their exact current numbers — the oracle stays green.
2. In `engine-bridge/index.ts` → `setupZeroedSimulator`, change the zero target from
   `new module.Vector3D(0, 0, -zeroRangeM)` to `new module.Vector3D(0, sightHeightM, -zeroRangeM)`.
   This zeroes the bullet to the **line of sight** (height `sightHeightM` above the muzzle) at the zero range.
3. In `solveTrajectory`, change the reported drop from `dropM: pos.y` to `dropM: pos.y - sightHeightM`.
   Now `dropM` is measured **from the line of sight**: at the muzzle it's `-sightHeightM` (bullet 2″ below the crosshair), at the zero range it's `0` (on the crosshair), and past the zero it's negative (needs come-up). Windage is unchanged (sight height is vertical only).
4. In `game/loads.ts`, add `export const SIGHT_HEIGHT_M = inchesToMeters(2);` (via the units service — no inline `* 0.0254`). Thread `SIGHT_HEIGHT_M` into every **game-path** solve call (ScopeView's `solveTrajectory`/trace solves, and 1.6d's DOPE). Leave the validation harness and DropTable passing nothing (→ 0).
5. `game/firing-solution.ts` — **verify only.** `requiredCorrectionRad` does `atan2(-dropM, R)`; because `dropM` is now line-of-sight-relative, the come-up it returns is already correct. Confirm no change is needed and note it in the commit.

**Verify checkpoint (all must pass before commit):**

- `node GameBuild/validation/run.mjs` → **zero diff** (proves the oracle is untouched — the default-0 path).
- `npx vitest run` green; `tsc --noEmit` clean; `npm run build` green (the pre-existing WASM-chunk warning is the only allowed noise).
- **New unit test** (add to a bridge or firing-solution test): with `sightHeightM = SIGHT_HEIGHT_M`, assert (a) come-up at the zero range ≈ 0; (b) at the muzzle `dropM ≈ -SIGHT_HEIGHT_M`; (c) a near target (50 yd) shifts its come-up by ~1 mil versus the `sightHeightM = 0` result, and a far target (500 yd) shifts by only ~0.1 mil (hand-checkable geometry).

**STOP** — the come-up numbers now differ from the earlier owner-confirmed 300-yd bore-line DOPE (expected; they're more correct). Report the new near/far holds and get owner confirmation before 1.6b.

---

## 1.6b — Scoring & engagement state (pure store + units helper)

**Goal:** add score tracking and target identity to the store, and the clock↔degrees helper. All pure and unit-tested — no UI yet.

**Files:** `state/store.ts`, `units/angle.ts` (+ `units/index.ts` re-export), `state/state.test.ts`, a small `units/angle.test.ts` case. (~5 files, well under the size cap.)

**Steps:**

1. Add to `SessionState` a `currentTarget: { plateInstanceId: number; distanceM: number } | null` and a per-target shot counter `shotsAtCurrentTarget: number`.
2. Add a `score` slice: `{ hits: number; shotsFired: number; firstRoundHits: number; targetsEngaged: number }`.
3. Add action `commitTarget(plateInstanceId, distanceM)`: sets `currentTarget`, `shotsAtCurrentTarget = 0`, refills `shotBudget` to `DEFAULT_SHOT_BUDGET`, resets dials to 0, clears `lastShots`, and increments `score.targetsEngaged`. (This is the "new target" boundary from D2 — it supersedes the old `selectTarget`; keep `selectTarget` as a thin wrapper or migrate its callers.)
4. Change `recordShot(result)` so it **also scores**: increment `score.shotsFired` and `shotsAtCurrentTarget`; if `result.hitPlateId === currentTarget.plateInstanceId` then increment `score.hits`, and if this was the **first** shot at the target (`shotsAtCurrentTarget === 1` after incrementing) also increment `score.firstRoundHits`. Keep the reducer pure.
5. Add `resetScore()` and include the score in `resetSession()`.
6. In `units/angle.ts` add `clockToDeg(clock)` (1–12 o'clock → degrees, 12→0, 3→90, 6→180, 9→270) and `degToClock(deg)`; re-export from `units/index.ts`.

**Verify checkpoint:**

- `npx vitest run` green; `tsc --noEmit` clean.
- **New tests must cover:** hit on shot 1 → `firstRoundHits` +1 and `hits` +1; miss on shot 1 then hit on shot 2 → `hits` +1, `firstRoundHits` +0; hitting a **different** plate than committed → not a hit; `commitTarget` resets shot count + refills budget + bumps `targetsEngaged`; counters aggregate across two committed targets; `clockToDeg(3)===90`, `clockToDeg(12)===0`, and a `clockToDeg`→`degToClock` round-trip.

**STOP** — report and get owner go-ahead before 1.6c.

---

## 1.6c — The loop UI: wind, turret dial, commit, HUD (ScopeView)

**Goal:** wire the store into the scope so a full engagement is playable end-to-end. This is the biggest sub-task.

**Files:** mostly `scope/ScopeView.tsx`; new pure helper `game/impact-call.ts` (+ test); `audio/audio-manager.ts` + `public/audio/scope_click.mp3` + `vite.config.ts` (precache) for D5.
**Size guard:** if the ScopeView additions push it past ~400 changed lines or the file gets unwieldy, **split into 1.6c1** (turret dial + HUD readouts + impact-call + click sound) and **1.6c2** (wind control + commit/target-select), verify each separately (protocol §3). Decide this early, not halfway.

**Steps:**

1. **Impact call helper (pure, do first).** New `game/impact-call.ts`: given a `ShotResult` (impact vs the committed plate center) return `{ hit: boolean; clock: number; distanceLabel }` — the rough clock position of the impact relative to plate center (e.g. impact high-right → "1–2 o'clock"). Pure math, unit-tested. Keeps geometry out of the JSX.
2. **Turret dial control.** Add elevation and windage **± buttons** to the HUD calling `dialElevationClicks(±1)` / `dialWindageClicks(±1)`. Show the current dial in **MIL+MOA** via `asMilMoa` (never inline math). Play `scope_click.mp3` per click (step 6).
3. **Wind control (D6).** Add a 0–20 mph speed slider and a 12-o'clock direction dial; on change call `setWind` using `mphToMps` and `clockToDeg`. Display speed as mph+m/s and direction as clock+degrees.
4. **Commit / target select (D2).** Add a **"Commit"** button: it reads the plate nearest the crosshair (the existing aimed-plate resolution) and calls `commitTarget(plateInstanceId, distanceM)`. Show which plate/distance is committed. Now **gate FIRE on budget** — no shot when `shotBudget === 0` (the 1.4c dry-fire allowance ends here).
5. **HUD readouts.** Add to the HUD: current dial (elev/wind, both units), shots remaining, the **last-impact call** from step 1 (hit/miss + clock), and the **score** (first-round-hit rate + hits/shots). Zoom readout already exists.
6. **Dial-click audio (D5).** Copy BTK's `scope_click.mp3` into `public/audio/`; add a `click()` method to `AudioManager` (reuse the existing pooled play path); add `scope_click.mp3` to the Workbox `globPatterns` in `vite.config.ts` so it's precached offline. Call `click()` from the turret ± buttons.

**Verify checkpoint:**

- `tsc --noEmit` clean; `npx vitest run` green (incl. the new `impact-call` test); `npm run build` green.
- **OWNER CHECK (iPad):** a full engagement works end-to-end — Commit a plate → open DOPE (1.6d) → dial or hold → fire → read the call → correct → hit. First-round hits show in the HUD. Wind visibly matters ≥300 yd. FIRE is blocked at 0 budget. Report feel. Mark `AWAITING OWNER` until confirmed.

**STOP** — owner confirm before 1.6d.

---

## 1.6d — DOPE side panel

**Goal:** a read-only come-up table for the current engagement, docked narrow-left, toggled by a button, never covering the scope or controls (D3).

**Files:** new `scope/DopePanel.tsx`; a small refactor of `debug/DropTable.tsx` to export a shared row-formatter so the two can't drift; `dope.test.ts`.

**Steps:**

1. Extract the row-format logic from `DropTable.tsx` (range, `asMilMoa` come-up + wind hold, metric+imperial) into a shared pure helper both screens import.
2. New `DopePanel.tsx`: solve `solveTrajectory` for the **current** `session` load + wind + `SCOPE_ZERO_RANGE_M` **with `sightHeightM = SIGHT_HEIGHT_M`** (1.6a) across the Range A distances (or a fixed ladder). Render as a **narrow left-docked strip** with dual units **stacked per row** (e.g. `300 yd / 274 m · ↑1.2 mil / 4.1 MOA`). Position it in the dark mask margin, left of the 40vmin scope circle; a **"DOPE" show/hide button** toggles it; it must not overlap the scope glass or the right/bottom dial+fire controls.
3. Carry a small footnote noting the 2″ sight-height model is now applied.

**Verify checkpoint:**

- `npx vitest run` green including a **DOPE-equality test**: for a fixed load/wind/zero, the panel's rows equal the shared-formatter output (no hand re-derivation) — this is the "matches the 0.4 table for identical inputs" clause, now via the shared path.
- `tsc --noEmit` clean; `npm run build` green.
- **OWNER CHECK (iPad):** open/close the DOPE strip; confirm it never covers the scope or controls, both unit systems read clearly in the narrow width, and the numbers match what you dial to hit.

**STOP** — owner confirm; then update `PROGRESS.md` and STOP before task 1.7.

---

## Whole-task exit (1.6 complete when…)

On the installed **offline iPad PWA**: commit a plate → check DOPE → dial or hold → fire → correct → hit works end-to-end; first-round hits are tracked and shown; the DOPE table matches the shared solve; wind visibly matters ≥300 yd; FIRE gated on budget. All machine gates green. Then mark 1.6 DONE in `PROGRESS.md` with the commit hashes and STOP for owner sign-off before 1.7 (wind field + flags + mirage).

## Verification gates (every sub-task, protocol §5, in order)

1. Engine `ctest` + `node GameBuild/validation/run.mjs` — **only if `GameBuild/engine/` was touched** (not expected in 1.6; 1.6a is the closest and its default-0 design keeps the oracle green).
2. `npx vitest run` green.
3. `tsc --noEmit` clean.
4. `npm run build` green (only the pre-existing WASM-chunk warning allowed).
5. The sub-task's own Verify checkpoint, verbatim.

Anything device-only (feel, "wind visibly matters") is an **OWNER CHECK** → mark `AWAITING OWNER`, say exactly what to try, and stop that thread.

## Future refinements & deferred (log in PROGRESS, don't build now)

- **Option B turret behavior (owner-described):** dialing the turret actually re-points the scope, so the sight picture shifts and the target must be re-centered. 1.6 ships the solve-only simplification (D4-A); B is its own later task — target: dialing shifts the sight picture + requires re-acquiring the target.
- **Score persistence:** score is session-only this task; fold hit stats into the save at the Increment-2 schema-v2 bump (same place `sensitivity` and `traceEnabled` are queued). Do **not** add it to the v1 save.
- **Sight height as a per-rifle input:** 1.6 hardcodes 2″; when configurable rifles land (Inc 2), promote `SIGHT_HEIGHT_M` to a per-rifle field.
- **Half-value / full-value wind teaching text** on the wind dial: nice-to-have, deferred unless trivial.

## Risks / watch-items

- **ScopeView size** — 1.6c is the crowding risk; prefer the c1/c2 split early over a monster diff. Keep pure logic (impact-call, dial math) in tested modules and the JSX thin.
- **Test zero is 300 yd** (owner test config, `SCOPE_ZERO_RANGE_M`); holds/DOPE are validated against it. One line to revert/parameterize when rifle config lands.
- **1.6a shifts previously-confirmed numbers** — expected and more correct; surface the new near/far holds to the owner at the 1.6a STOP so there are no surprises downstream.
