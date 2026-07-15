# Increment 1.7 plan — wind field, flags/socks, mirage

`Status: DECISIONS LOCKED — ready to build (owner-confirmed 2026-07-15)` · `Date: 2026-07-15`
`Covers:` PROGRESS task **1.7** (switch constant wind → the engine's curl-noise wind field; wind flags/socks; mirage cue).
`Authority:` refines [`increment-1.md`](./increment-1.md) §1.7 under [`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's *Done when* clauses. **Live state lives in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this doc is the point-in-time plan.**

This task turns the single, known, constant wind the player dials in 1.6 into a **living wind field** — one the bullet actually flies through, that flags and mirage reveal, and (in the realistic mode) that the player must *read* rather than simply set.

> **Audience note:** this doc is written for a junior programmer. Work **one sub-task at a time, top to bottom.** After each sub-task: run its Verify checkpoint, update `PROGRESS.md`, commit, and **STOP for owner confirmation before starting the next** (protocol §2.8). Do not batch sub-tasks. If any check goes red and the fix isn't obvious inside the sub-task's scope, STOP and log it (protocol §6) — a task blocked honestly is a success, not a failure.

---

## Locked / proposed decisions

- **D1 — Two wind modes, owner-chosen (owner steer, 2026-07-15).** A **realism toggle** on the settings/HUD:
  - **Steady (default, for testing):** the wind the bullet feels is *exactly* the mean speed + direction the player dials (today's 1.6 behavior). Deterministic. Flags and mirage still render, but they show that steady mean. This mode must stay bit-for-bit the current shot behavior so the owner can keep testing hold/dial against a known wind.
  - **Realistic:** the dialed speed + direction become a **guideline mean**; a curl-noise field (intensity chosen by a **preset**) layers realistic spatial + temporal *deviation* on top — the wind varies with distance downrange and drifts over time. The player reads the deviation off the flags/socks/mirage. The dial is now a best-guess starting point, not ground truth.
- **D2 — Backend: mean + turbulence by superposition (LOCKED).** The engine's `WindGenerator` is **zero-mean curl turbulence** (it has no "mean wind" input; see "Backend reality" below). Every BTK preset is turbulence *character* only — none carries a direction or base speed — so the only way to get "Gusty, from 3 o'clock, at X mph" is to merge a directional mean with a preset. Both the markers and the shot compose *mean + field*:
  - **Markers** sample `meanVector + (gustScale × field.sample(worldPos))` in JS each frame.
  - **Shot** uses linear superposition of engine solves (spelled out in 1.7a): `total = meanSolve + gustScale × (fieldSolve − zeroSolve)`. In Steady mode the field is absent, so `total == meanSolve` exactly — i.e. no change from 1.6. This is *glue combining two BTK outputs*, not a new physics model — BTK owns the drag/crosswind-jump/curl/spin-drift physics.
- **D3 — Player controls in Realistic mode (LOCKED).** Player keeps the existing mean **speed** + **direction** dials (the guideline) and gains a **raw BTK preset picker** — the **full list** enumerated live from `WindPresets.listPresets()` (`Zero, Dead, Calm, Moderate, Strong, Extra Strong, Switchy, Shear, Turbulent, Gusty`), shown by their real BTK names (owner wants the full authentic set, not a simplified dial).
- **D3b — Gusts scale PROPORTIONALLY to the mean (LOCKED).** The preset's turbulence is scaled by `gustScale = meanSpeedMps / GUST_REFERENCE_MPS` before it's added to the mean (both for markers and the shot superposition). So a light breeze wanders gently, a gale swings hard, and 0 mph mean → dead calm (flags hang). `GUST_REFERENCE_MPS` is a single named constant tuned in 1.7d (start ≈ the speed the BTK preset magnitudes were authored around, e.g. ~10 mph; the exact value is a feel knob). Implemented as a **JS multiply on the sampled field** — never by trying to rebuild the preset (`addComponent` isn't bound).
- **D4 — No C++/engine source change expected.** `WindGenerator`, `WindPresets`, and the `simulate(max, dt, maxT, WindGenerator&)` overload are **already embind-bound in the owned engine copy** (`GameBuild/engine/src/bindings.cpp`, verified 2026-07-15). If a needed binding turns out to be missing, **STOP** — do not edit C++ ad hoc; log it and get owner direction (protocol §4/§6). The golden-vector oracle must stay green regardless.
- **D5 — Build all three markers; mirage cuttable (LOCKED).** Plan builds flags/socks in 1.7b and mirage in 1.7c. **Mirage (1.7c) stays the last, self-contained sub-task and remains cuttable at its STOP boundary** (owner keeps the option to drop it if iPad perf/feel disappoint) without disturbing 1.7a/1.7b/1.7d.
- **D6 — Post-shot effective-wind readout (LOCKED).** In Realistic mode, after each shot, sample the field along the bullet's path at fire time and surface the **effective wind it actually saw** and what it cost (e.g. "~7 mph @ 2:30 → 1.1 mil L"). This recovers the "true answer" teaching feedback a varying field otherwise hides. Uses data already computed at fire time (the `fieldSolve` / column sample in 1.7a); displayed in the HUD alongside the 1.6 spotter call (built in 1.7b).

---

## Backend reality (read before writing 1.7a)

Facts established by reading the owned engine, so nobody rediscovers them the hard way:

1. **`WindGenerator` produces zero-mean turbulence.** `sample(x,y,z)` sums curl-noise octaves; there is **no mean-wind term**, no direction term, and no `setMean`. A freshly built preset, sampled anywhere, averages to ~0 — it is the *gustiness/character around* a mean, not the mean. **Every preset** (`Zero, Dead, Calm, Moderate, Strong, Extra Strong, Switchy, Turbulent, Shear, Gusty`) is built solely from `addComponent(...)` octaves — they describe *how gusty/switchy/how big the fluctuations are*, **not where the wind comes from or its average speed.** Consequence: to get "Gusty, from 3 o'clock, at 10 mph" you MUST merge a directional mean with a preset — that merge (D2) is the whole point of this sub-task, and the only way to get a directional+characterful wind out of this engine.
2. **You build one via a preset factory:** `WindPresets.getPreset(name, minCorner, maxCorner)` where the corners bound the sampling box (crossrange × vertical × −downrange, in metres). `WindPresets.listPresets()` returns the names. `addComponent(...)` is **not** bound — you cannot hand-roll or re-weight a field from JS; use the presets as-is. (If you want gust magnitude to scale *proportionally* to the chosen mean speed rather than being absolute mph, do it by scaling the **sampled vector** in JS after `sample()` — see D3 note — never by trying to rebuild the preset.)
3. **The field evolves in time** only when you call `field.advanceTime(currentTimeSeconds)` (monotonic). Advection carries the pattern downrange. Call it once per frame.
4. **The bullet flies the field** via the simulator's `simulate(maxDist, dt, maxTime, field)` overload (bound as `simulateWithWind` in the JS module). It samples the field at each step and **overwrites** the simulator's internal wind — i.e. it flies the field *only*, ignoring any `setWind` mean. That's why the mean has to be re-added by superposition (D2), not by `setWind` + `simulateWithWind` together.
5. **Coordinates:** engine X = crossrange (+right), Y = vertical (+up), Z = −downrange (a target R m out is at `(0,0,−R)`). The field returns `(x=crosswind, y=vertical, z=−headwind)`. The app already lives in these coordinates (see `engine-bridge/index.ts` header).

---

## What already exists (build on this, don't rebuild)

- **The shot loop is closed and field-ready at the seams.** `ScopeView.tsx` FIRE resolves a shot through three local helpers you will extend, not rewrite:
  - `solveAt(rangeM, wind)` → `{dropM, windageM, velocityMps, timeOfFlightS}` (the deterministic center; reads a cached fine table).
  - `traceTableAt(rangeM, wind)` → full `TrajectoryTable` via `solveTrajectory(...)` with a constant `windToVec(mean)` (cached per `range|speed|dir`).
  - `simAt(rangeM)` → `MatchSimulator` scatter (unchanged by 1.7 — spread stays as validated in 1.4).
- **Engine bridge** (`engine-bridge/index.ts`) is the **only** place embind handles and `.delete()` live. All new field wrappers go here (mirror `solveTrajectory` / `createScatterSimulator`).
- **Store** (`state/store.ts`) holds `session.wind {speedMps, directionDeg}` + `setWind`, and `settings {unitsPrimary}` with a persist seam (`persist-settings.ts`). You'll add a realism setting + a turbulence preset.
- **Scene** (`range/RangeScene.ts`) exposes `plates[]` with world `position`/`distanceM` and builds the lane/berms; rack world positions come from `RANGE_A_RACKS` (`range/range-a-config.ts`). Flags/socks attach into this scene like the reactive chains did in 1.5c.
- **Salvage references (MIT, in `BallisticsToolkit/web/`, do NOT import — port the approach):**
  - `steel-sim/WindFlag.js` (1187 ln), `steel-sim/WindSock.js` (452 ln) — cloth/pennant that yaws to local wind + bends by speed.
  - `fclass-sim/rendering/windsocks.js` (436 ln), `fclass-sim/rendering/mirage.js` (508 ln) — the fclass mirage shader tied to zoom + crosswind; `fclass-sim/simulator.js` shows the `WindPresets.getPreset` + preset-dropdown wiring end-to-end.
- **Units service** has `mphToMps`/`mpsToMph`, `clockToDeg`/`degToClock` (added 1.6b). No new unit math should live in components (guardrail §4.4).

---

## Architecture at a glance

```
                   ┌──────────────  state/store.ts  ──────────────┐
   1.7a (store) ─► │ session.wind {speedMps, directionDeg}  MEAN  │  (exists)
                   │ session.windPreset: string             NEW   │
                   │ settings.windRealism:'steady'|'realistic' NEW│
                   └───────────────────────┬──────────────────────┘
                                           │
        ┌──────────────────────────────────┼───────────────────────────────┐
        ▼                                   ▼                               ▼
  engine-bridge/wind-field.ts         ScopeView shot (FIRE)          markers (1.7b/c)
  (NEW, all .delete() here)           steady: total = meanSolve      sample mean+field
   • createWindField(preset,box)      realistic:                     at each flag/sock
   • advanceField(f, t)                 total = meanSolve            & at scope (mirage)
   • sampleField(f, pos) -> Vec3        + (fieldSolve − zeroSolve)   each frame
   • solveTrajectoryField(...)                                       (live field sample)
```

---

## 1.7a — Wind field backend + realism toggle + shot wiring (the correctness core)

**Goal:** a fired shot in Realistic mode drifts with the *evolving field*; a fired shot in Steady mode is byte-identical to 1.6. No visible flags yet.

**Pre-step 0 — confirm the artifact exposes the bindings (5 min, do first).** From `GameBuild/app`, in a Node one-liner against the `@engine` module (mirror `scripts/check-engine.mjs`), confirm `module.WindPresets.listPresets()` returns names and `module.WindGenerator` / the 4-arg `simulate` exist. **If any are undefined:** the shipped engine WASM predates the bindings — rebuild it with `emmake` (artifact only, **no source edit**), then run `node GameBuild/validation/run.mjs` to confirm the golden vectors are still zero-diff. If a rebuild is needed and you can't run `emmake` in your environment, STOP and hand the rebuild to the owner (protocol §4b).

**Steps:**

1. **Types** (`engine-bridge/types.ts`): add `EWindField` (methods you bind: `advanceTime(t)`, `sample(x,y,z) -> Vector3D`, `getCurrentTime()`, `delete()`) and `EWindPresets` (`listPresets()`, `getPreset(name, min, max)`, `hasPreset(name)`); add `WindGenerator` + `WindPresets` to `BtkModule`. Keep the public app-facing type a plain `WindVec`/`Vec3` (never leak a handle).

2. **Bridge** (`engine-bridge/wind-field.ts`, NEW — the only file that touches the field handle; mirror `match-sim.ts` lifecycle discipline):
   - `createWindField(module, presetName, minCorner, maxCorner): { advance(t), sample(pos): Vec3, currentTime(), delete() }` — wraps `WindPresets.getPreset`; `sample` builds a temp `Vector3D`, reads the result, and **deletes both** before returning a plain `{x,y,z}`. Idempotent `delete()`.
   - `solveTrajectoryField(module, load, atmosphere, meanWind, field, opts): TrajectoryTable` — copy `solveTrajectory` but replace the `sim.simulate(dist, dt, maxT)` call with the **`simulate(dist, dt, maxT, field)` overload**. Zero the launch with `meanWind` (same `setupZeroedSimulator` path, so launch angle matches the mean) so the field solve and the mean solve share a launch state. Read `windageM`/`dropM` from the trajectory exactly like `solveTrajectory`.
   - Export a small `sampleFieldColumn(field, eye, rangeM, samples)` helper (samples the field at N points along the eye→target line) — reused by 1.7b's HUD/debug and handy for the superposition sanity test.

3. **Store** (`state/store.ts` + `persist-settings.ts`):
   - `settings.windRealism: 'steady' | 'realistic'` (default `'steady'`) + `setWindRealism`. **Persist it** (add to `settingsToSave`/`saveToSettings`; bump nothing else — it's additive, schema still v1-compatible as a new optional field defaulting to `'steady'`).
   - `session.windPreset: string` (default a moderate preset name; **validated against `listPresets()`** at use-site so a bad value can't crash the field build) + `setWindPreset`. Session-only (not persisted). This is the **raw BTK preset name** (D3) — the picker shows the full `listPresets()` set.
   - Add a single `GUST_REFERENCE_MPS` constant (D3b) in `game/` (via the units service, not an inline `* 0.44704`).

4. **Shot wiring** (`ScopeView.tsx`, FIRE block ~L400-433 and the `solveAt` helper ~L217):
   - Build **one** `WindField` per engagement in Realistic mode (on mount / on preset or mode change), sampling box = the Range A bounds (crossrange ±~30 m, vertical 0..~50 m, downrange 0..~500 m; reuse `RANGE_A_GROUND` extents). Advance it once per frame in the render loop: `field.advance(elapsedSeconds)`. `delete()` on unmount / rebuild (mirror the `reactions`/`scatterSims` cleanup already in the file).
   - Compute `gustScale = store().session.wind.speedMps / GUST_REFERENCE_MPS` (D3b) — clamp at 0 so a 0 mph mean is dead calm.
   - Extend `solveAt(rangeM, wind)` so that **in Realistic mode** it returns the superposed center:
     - `meanSolve` = today's constant-mean solve (cached, unchanged).
     - `zeroSolve` = constant **zero-wind** solve at this range (cached per range) — the no-wind baseline (captures spin drift).
     - `fieldSolve` = `solveTrajectoryField(..., meanWind, field, ...)` **sampled at fire time** (not cached — it must change as the field evolves).
     - `windageM = meanSolve.windageM + gustScale × (fieldSolve.windageM − zeroSolve.windageM)`, and the same superposition for `dropM`. `velocityMps`/`timeOfFlightS` come from `meanSolve` (unchanged).
   - **Effective-wind readout (D6):** while resolving the shot, also compute the effective wind the bullet saw — average `meanVector + gustScale × field.sample(pos)` over `sampleFieldColumn(field, eye, rangeM, N)` (from step 2). Return it (speed + clock + the mils it accounts for) alongside the shot result so 1.7b can show it in the HUD. Steady mode → this is just the dialed mean.
   - **In Steady mode, `solveAt` returns `meanSolve` unchanged** — literally the current code path. Guard on `settings.windRealism`.
   - Leave `simAt` (scatter) and the trace/impact/audio plumbing untouched — they consume `solveAt`'s output, so they inherit the field drift for free.

**Verify (machine):**
- `tsc --noEmit` clean; `npm test`; `npm run build` green.
- New `wind-field.test.ts` (engine-backed, Node): (a) a freshly built preset sampled over a grid averages to ≈0 (proves zero-mean, documents the superposition rationale); (b) `advance(t)` then re-sample at the same position gives a *different* vector (field evolves); (c) **superposition identity** — with the field contribution forced to zero (Steady path), `solveAt` output equals `meanSolve` to full precision.
- New `shot` field test: for a fixed seed + fixed target, `solveAt` windage at `field.currentTime()=0` differs from windage after `advance(30s)` (**the §1.7 done-when: "one shot's drift changes when the field evolves"**).
- **Engine untouched → run `node GameBuild/validation/run.mjs` anyway to confirm zero-diff** (belt-and-suspenders per §5.1); if pre-step 0 forced a WASM rebuild, this is mandatory.

**Owner check (iPad):** Steady mode plays exactly like 1.6 (same holds, deterministic). Flip to Realistic: firing the *same* dial at the *same* plate repeatedly now lands in slightly different places as time passes (the field drifting), and a stiffer preset spreads them more. No flags yet — this is a numbers/feel check.

**STOP** — this sub-task also asks the owner to confirm **D2 (superposition backend) and D3 (preset control)** now that they're concrete. Do not start 1.7b until confirmed.

---

## 1.7b — Wind flags & socks (reading the field)

**Goal:** flags/socks down the lane that reveal the *local* wind — so in Realistic mode they visibly disagree with each other and drift over time, and in Steady mode they steadily show the dialed mean.

**Steps:**

1. **Placement** (`range/` — a new `wind-markers-config.ts`, pure + tested like `range-a-config.ts`): position ~5–6 markers along the lane (e.g. 100/200/300/400/500 yd), offset to the side of the sight-line lane so they never occlude a plate row (reuse the occlusion-clearance discipline from `range-a-config`'s fan; add a regression test that no marker sits on a plate bearing). Owner picks flags vs socks vs both via the existing marker style, defaulting to flags.

2. **Renderer** (`scope/WindMarkers.ts`, THREE; port the *look* of `steel-sim/WindFlag.js` / `WindSock.js` as plain geometry + a lightweight vertex wobble — **no addons, no new deps**, matching how 1.5 salvaged steel-sim). Each marker:
   - yaws to the **local** wind direction and bends/extends by local **speed**, sampled each frame from `meanVector + gustScale × sampleField(field, markerWorldPos)` (D2/D3b). In Steady mode the field term is zero, so every marker shows the same mean.
   - keep it cheap (InstancedMesh or a handful of small meshes; a few sine-driven vertices for the flutter — reuse the tremor pattern from the 0.9 wobble rather than a shader).

3. **Wire into `ScopeView`** (or `RangeScene` setup): build markers at scene init, update each frame from the live field, dispose on unmount. Add the wind controls to the HUD block next to the existing speed/direction sliders from 1.6c2, reading/writing the 1.7a store fields:
   - **Steady/Realistic toggle** (`settings.windRealism`).
   - **Raw BTK preset picker** (D3) — a dropdown populated from `WindPresets.listPresets()`, showing the full real names; writes `session.windPreset`. Shown only in Realistic mode.
   - **Effective-wind readout (D6):** display the value returned from the shot resolution (1.7a) in the HUD near the spotter call — "last shot saw ~7 mph @ 2:30 → 1.1 mil L". Realistic mode only (Steady just shows the dialed mean).

**Verify (machine):** `tsc`/`test`/`build` green. `wind-markers-config.test.ts`: marker count/spacing, side-offset, zero plate-bearing collisions. Effective-wind: a small pure test that averaging a known field column returns the expected mean vector → clock/speed. (The flutter/visual is owner-side.)

**Owner check (iPad):** Realistic mode — flags at different distances lean **different** ways and shift over time (**done-when: "flags disagree with each other over time"**); the shot you fire drifts consistent with what the flags near the target are showing, and the effective-wind readout matches what you saw; raise the mean speed and the whole field gets proportionally gustier (D3b). Steady mode — all flags hold the dialed mean. Toggle + full preset picker work.

**STOP** — owner confirm before 1.7c.

---

## 1.7c — Mirage cue (deferrable)

**Goal:** a heat-shimmer in the scope image whose *drift direction* tracks the crosswind — the classic wind-reading cue — and that grows with magnification (so high zoom trades detail for a better wind read, per catalog §C/§E).

> **Deferrable:** if the owner would rather ship 1.7a+1.7b and treat mirage as later polish, mark 1.7c `SKIPPED(deferred to polish)` in `PROGRESS.md` at this boundary and proceed to 1.7d. Nothing in 1.7a/1.7b/1.7d depends on it.

**Steps:**

1. **Port `fclass-sim/rendering/mirage.js`** as a post/overlay pass on the scope render (the ScopeView already does a second render pass for the magnified image + reticle overlay — the mirage sits between the world render and the reticle). Keep it a self-contained shader string; no new deps.
2. **Drive it from** the crosswind component the player *should* be reading — i.e. sample the field (+ mean) near the target line and feed its crossrange component as the shimmer drift direction/speed; scale overall intensity by `magnification` (stronger at high zoom) and gate it to Realistic mode (or a "conditions" flag — a windless/overcast day has little mirage; log the biome/weather coupling from catalog §E as a future refinement, don't build it here).
3. Performance-guard on device (mirage is a full-screen pass) — keep the FPS HUD under 16 ms; if it can't hold, drop resolution/step count before adding complexity.

**Verify:** `tsc`/`test`/`build` green (shader is owner-side visual). **Owner check (iPad):** shimmer drifts in the crosswind direction and intensifies as you zoom in; disabling wind (Steady, 0 mph) calms it (**done-when: "mirage shimmer direction tracks crosswind"**); FPS holds.

**STOP** — owner confirm before 1.7d.

---

## 1.7d — Integration, tuning & exit validation

**Goal:** the three done-when clauses proven together on the installed offline PWA, and the feel tuned.

**Steps:**
1. Walk the increment doc's §1.7 **Done when** verbatim on device: (a) flags disagree over time; (b) a single shot's downrange drift changes when the field evolves (fire, wait, fire the same hold — different impact); (c) mirage shimmer tracks crosswind (if 1.7c shipped).
2. Tune to owner feel: `GUST_REFERENCE_MPS` (the proportional-gust knob, D3b), field advection speed (`setAdvectionMultiplier` is bound if the pattern moves too fast/slow), marker flutter, mirage strength. Log final tuned values in `PROGRESS.md` (as 0.9/1.5 did).
3. **Precache audit** (guardrail §4): any new asset (flag texture, etc.) added to the Workbox manifest; `grep` for CDN imports = empty; install → airplane mode → cold launch → Realistic mode still works offline.
4. Update `PROGRESS.md` 1.7 → DONE with commit hashes; STOP for owner sign-off before 1.8 (ship it).

---

## Whole-task exit (1.7 complete when…)

On the installed **offline iPad PWA**: **Steady mode is byte-identical to 1.6** (known wind, deterministic — the owner's test harness); **Realistic mode** flies the shot through an evolving curl field where flags/socks disagree down the lane and over time, the downrange drift changes as the field evolves, and (if shipped) mirage shimmer tracks the crosswind — with the player reading those cues to refine a guideline mean. All machine gates green; golden-vector oracle still zero-diff; precache audit clean. Then mark 1.7 DONE in `PROGRESS.md` and STOP for owner sign-off before 1.8.

## Verification gates (run before marking any sub-task DONE)
1. `npm run typecheck` clean · `npm test` green (report the count) · `npm run build` green.
2. **Only if `GameBuild/engine/` was touched** (not expected — D4): engine `ctest` + `node GameBuild/validation/run.mjs` zero-diff. If pre-step 0 forced a WASM **rebuild** (artifact, not source), run `run.mjs` regardless.
3. The sub-task's own *Done when* items, verbatim.
4. Anything not machine-verifiable (flutter, shimmer, feel) → the owner's on-device check; mark `AWAITING OWNER`.

## Future refinements (log, don't build here)
- **Weather/biome coupling** (catalog §E): overcast → less mirage; desert → more; conditions gate the wind-reading cues. 1.7 ships the mirage *mechanism*; the weather system is its own increment.
- **Spotter unlock** (catalog §C4): narrows wind uncertainty / calls corrections — sits on top of the Realistic-mode read, a later feature.
- **Vertical field component**: 1.7 superposes the field's vertical (updraft) drift too, but it's small; revisit if it reads oddly.
- **Field advection controls** exposed to the player (gustiness/steadiness) beyond the preset — only if the presets prove too coarse.
