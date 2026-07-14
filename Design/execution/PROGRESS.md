# PROGRESS — LongRange build state

> Maintained by the executing agent per
> [`execution-protocol.md`](./execution-protocol.md) §7. One row per task.
> Statuses: `TODO · IN PROGRESS · AWAITING OWNER · BLOCKED · DONE · SKIPPED(reason)`

# Current increment: 1

## Increment 0 — Foundations & proofs

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 0.0 | DONE | 2026-07-13 | 9263b65 | env preflight done; git repo initialized at root (was not a repo before). See capabilities table + owner queue below |
| 0.1 | DONE | 2026-07-13 | 7d779b5 | pristine BTK WASM built under emscripten 6.0.2 (no build-only patches needed). Verified module COMPUTES via Node: `Conversions.yardsToMeters(100)`=91.44, `moaToMrad(1)`=0.290888, `fpsToMps(2700)`=823.0. Browser ballistic-calc check is OWNER-SIDE (agent can't bind a localhost server — see capabilities table); **owner confirmed ballistic-calc runs correctly in-browser on the 6.0.2 build (2026-07-13)**. Node function-call proof satisfies "Done when". Values are float32-precision. |
| 0.2 | DONE | 2026-07-13 | 04e267f | `GameBuild/engine/` created as owned copy of BTK core (src/, include/, CMakeLists.txt, LICENSE.BTK, README.md) from BTK commit `29d43c1` (`29d43c13f4945cb9caf4e73d2041c22645ebf4e7`, 2026-07-07) — the oracle version for task 0.7. Removed `copy_web_files` target per task; `web/` not copied. `emmake make -j` builds clean under emscripten 6.0.2 → `GameBuild/engine/build-wasm/ballistics_toolkit_wasm.js` (244417 B, loads+computes in Node). `BallisticsToolkit/` untouched (clean). `build-wasm/` git-ignored. |
| 0.3 | DONE | 2026-07-13 | 052193c | Native (non-emscripten) CMake path added to `GameBuild/engine/CMakeLists.txt`: `if(EMSCRIPTEN)` keeps the WASM build byte-identical (244417 B, verified), `else()` builds `ballistics_core` static lib (all sources minus `bindings.cpp`) + GoogleTest suite. Native build uses plain `cmake`→Apple clang (independent of emscripten even though emcc is on PATH); `-Werror` dropped natively (newer host clang; we don't edit copied sources). 5 ctests green: 3× Conversions round-trips, ISA atmosphere spot values, 6.5CM computeZero@100m. Rendering sources compile natively (embind guarded by `#ifdef __EMSCRIPTEN__`). `build-native/` git-ignored; BTK untouched. |
| 0.4 | split | | | oversized → split into 0.4a–d (protocol §3). Owner approved latest-stable pins + "do 0.4a then stop" (2026-07-13) |
| 0.4a | DONE | 2026-07-13 | d2cfba7 | `GameBuild/app/` scaffolded (Vite+React+TS, minimal app). `npm install` clean (422 pkgs, 0 vuln, no peer conflicts). Verified: `npm run build`→`dist/` (190 KB js), `tsc --noEmit` clean, vitest 1/1. `npm run dev` visual check is OWNER-SIDE (agent can't bind dev-server socket). Pinned deps (exact) recorded below. `node_modules/`+`dist/` git-ignored; `package-lock.json` tracked. |
| 0.4b | DONE | 2026-07-13 | c8a4c17 | units service `GameBuild/app/src/units/` (angle/length/velocity + index): MIL/MOA/rad via radians pivot, metric/imperial via exact intl definitions (1 yd=0.9144 m etc.), dual-unit `asMilMoa`/`asMetricImperial*` helpers. Enforces guardrail §4.4 (no inline unit math in components). vitest 9/9, `tsc --noEmit` clean, build green. Removed 0.4a smoke test. |
| 0.4c | DONE | 2026-07-13 | fc90026 | engine-bridge `GameBuild/app/src/engine-bridge/`: `wasm-module.ts` (sole `@engine` import site + cached factory), `types.ts` (public SI types + minimal embind surface), `engine.d.ts` (ambient `@engine` decl), `index.ts` (`solveTrajectory`/`computeZero`/`createEngineBridge`, **all `.delete()` here** — computeZero/getState/getPosition copies deleted, getTrajectory reference not). Vite `@engine` alias + `server.fs.allow` GameBuild/ per owner wiring. Added `engine:build` npm script + `scripts/check-engine.mjs` precheck on dev/build/test. Verified: `tsc --noEmit` clean, **vitest 12/12** (bridge test loads real WASM in Node via the alias, checks drop/velocity/TOF monotonicity + crosswind drift), build green. Added dep `@types/node@26.1.1` (see pins note). |
| 0.4d | DONE | 2026-07-13 | a2e6d45 | Code + numeric match DONE (session ran in the owner-review sandbox, not the Mac). Built: `GameBuild/validation/loads.json` (6.5CM ref load, SI-authoritative), `validation/match-check.mjs` (engine-artifact vs pristine-BTK, Vite-free Node), `app/src/debug/DropTable.tsx` (MIL+MOA / m+yd / cm+in table, wind-case selector), `spinRateFromTwist` in bridge, `validate:match` npm script. **Verified here:** artifacts byte-identical (`cmp`); match check 10 rows × 2 wind cases, worst rel diff **0.000e+0** (satisfies the ≥5-row near-exact bar). **Mac-side checks completed by owner 2026-07-13:** `npm run typecheck` clean, `npm test` 12/12 (units 9 + bridge 3), `npm run dev` table confirmed visually. Task 0.4 (a–d) complete. |
| 0.5 | DONE | 2026-07-13 | a04bcc4+b67b0df | `.github/workflows/ci.yml` written + committed (YAML validated). Jobs: `native-tests` (ubuntu, apt libgtest-dev → cmake/ctest), `web` (emsdk **6.0.2 pinned** → engine WASM → node 26 → npm ci → typecheck → vitest → build), `deploy` (Pages, main-push only; needs both jobs). Vite `base:'./'` already Pages-safe. Pristine BTK isn't in the repo, so the match check stays local-only; 0.7 gives CI committed vectors instead. **Owner steps:** (1) enable Pages: repo Settings → Pages → Source = "GitHub Actions"; (2) `git push`; (3) report the Actions run result + whether the Pages URL serves the debug drop table. Known risk: if `find_package(GTest)` fails on the runner image, the native job fails visibly — report and we'll switch to building gtest from source in the workflow. **CI run 1 failed (ENOTFOUND artifacts.apple.com): lockfile carried corp-mirror resolved URLs. Fixed in b67b0df** — all 498 URLs canonicalized to registry.npmjs.org (verified: clean `npm ci` from public registry, integrity intact) + `check-lockfile.mjs` CI guard against regression. **Owner: push again and report run 2 + Pages URL.** Local `npm ci` against the canonicalized lockfile confirmed working 2026-07-13 (425 pkgs, mirror substitution OK; benign warnings: 2 deprecated transitive deps + corp allow-scripts flag on optional `fsevents` — approve only if dev file-watching feels slow). **Owner confirmed 2026-07-13: run 2 green on all jobs (incl. native ctest w/ apt GTest) and the Pages URL serves the debug drop table. Task complete.** |
| 0.6 | DONE | 2026-07-13 | 8d4dbc6 | PWA shell built: vite-plugin-pwa (standalone/landscape manifest, icons via committed `gen-icons.py`, Workbox precache incl. the WASM-embedding bundle w/ 8 MiB cap), iOS meta + apple-touch-icon, `registerType:'prompt'` + UpdateToast (no mid-session SW swap, build-plan §7). Verified here: CDN grep clean, icons valid PNGs, react types present. **Owner (Mac):** (1) `npm run typecheck && npm test`; (2) `npm run build && npm run preview` → open, then DevTools → Network → Offline → reload (should still work) — note the SW only registers in build/preview, not `npm run dev`; (3) optional Lighthouse PWA check; (4) push → then on the **iPad**: open the Pages URL in Safari → Share → Add to Home Screen → airplane mode → cold launch shows the drop table. **Owner confirmed 2026-07-13: Mac checks green AND iPad home-screen install cold-launches offline showing the drop table — the web/PWA premise (offline, installable, no Apple account) is proven on device.** |
| 0.7 | DONE | 2026-07-13 | 260a052 | Golden-vector harness built + verified locally: `ORACLE_VERSION` (BTK 29d43c1 + emscripten 6.0.2), 36 cases/402 rows committed (`vectors/golden.json`, 6 loads × 3 atmospheres × 2 winds), `run.mjs --generate` (pristine, local-only) / check mode (CI-safe, no BTK needed) — zero diff; **negative test verified** (perturbed vector → exit 1 + STOP message; adapted from the doc's Cd-perturbation since this sandbox lacks emcc to rebuild — same comparator path); `solve-driver.mjs` extracted, `match-check.mjs` refactored onto it (now sweeps all 6 loads, still zero diff). CI `web` job gains the golden step. **Owner confirmed 2026-07-13: pushed, CI green incl. the golden-vector step.** |
| 0.8 | DONE | 2026-07-13 | 13e0cc7+d229bed | Save v1 built: `SaveStore` seam (cloud-sync-ready per §0.3), schema v1 + validator (hand-rolled, no JSON-Schema dep — protocol §3), migration table (v1 no-op), Memory + thin Idb stores (`longrange` db), `requestPersistence()`, share-sheet/download export + validated import, debug PersistencePanel, 12 new vitest cases (pure core — idb adapter is browser-verified since node lacks IndexedDB). **Owner (Mac + devices):** (1) `npm run typecheck && npm test`; (2) `npm run build && npm run preview` → flip the test setting → quit browser → reopen → setting persists; (3) Export → Import in a second browser profile reproduces it; (4) push → on the **installed iPad PWA**: flip setting → force-quit app → relaunch → persists (also check the persist() status line it shows). **Owner confirmed: Mac tests green (after d229bed fixed a future-dated fixture assertion — made clock-independent) and iPad PWA setting survives force-quit/relaunch. Save durability proven on device.** |
| 0.9 | DONE | 2026-07-13 | 2d923b5…f3aa000 | Aim spike built: 12″ plate @ 500 yd scene, scope mask + crosshair, one-finger drag (sens = slider × FOV/screen-height → auto 1/mag), pinch zoom 4.5–35× (wheel desktop), ~1-MOA two-sine wobble + breathing (toggle), FIRE with hit flash + mil/MOA offset readout, hit counter. App has an Aim-spike/Debug-tables switcher. **OWNER CHECK (the task's entire done-when):** on the iPad (dev, preview, or pushed build) — zoom to ~25×, try to hold the plate and FIRE several times. Judge: controllable or fighting you? Tuning knobs ready for iteration: sensitivity slider (report your preferred value), wobble toggle, drag direction (currently FPS-style: drag right = aim right; one-line flip if map-style feels better). Task loops until you call it controllable — do NOT proceed to 0.10 before that. **Iter 2 (cf86cb4, owner feedback):** (a) FIRE now recoils — spring-damper kick (~3 mrad rise + random lateral, ~0.5 s underdamped settle) + small random POA residual; shot samples aim pre-kick; (b) wobble more erratic — added 5–10 Hz tremor layer + random micro-jerks every 1.5–3.5 s; (c) toggle → **amplitude slider 0–2× (0 = off)**. Re-test on iPad. **Iter 3 (8f7a3f0):** erratic layers halved per owner ("manic") — tremor amp ½, jerk strength ½, jerk interval 3–7 s; slow sway untouched. **Iter 4 (88da981, owner idea):** HOLD breath button — press-and-hold steadies wobble to 0.15× on a ~10 s air budget; past ~70% used, the hold degrades to worse-than-baseline (oxygen debt, 1.5×); ~5 s recovery; breath bar goes green→red at the comfort edge. Left-thumb HOLD / right-thumb FIRE. **Iter 5 (f3aa000, owner bug report):** FIRE now `onPointerDown` (iOS synthesizes no click while HOLD thumb is down — HOLD+FIRE works); pinch rewritten as absolute per-gesture (startMag × spread ratio — old incremental version drifted/snapped/stuck); drag locked during+after pinch until all fingers lift; container hardened vs Safari page-zoom; **wobble default = 0.75 (owner-tuned)**. Re-test: HOLD+FIRE together, pinch both directions repeatedly. **Owner verdict 2026-07-13: "Controllable." Settings baked as defaults: wobble 0.75, sens 1.0 (unchanged). 5 iterations total; breath-hold mechanic born here (carries to task 1.3+).** |
| 0.10 | DONE | 2026-07-13 | (this commit) | Exit checklist ALL GREEN (see increment-0.md — each item owner-confirmed); tagged `inc0-complete`; PROGRESS → Increment 1. Every existential risk retired: PWA-offline-on-iPad, durable saves, oracle-gated engine in CI, native tests, touch-aiming feel. |

## Increment 1 — First shippable slice (KD shot loop; see increment-1.md)

| Task | Status | Date | Commit | Note |
|---|---|---|---|---|
| 1.1 | DONE | 2026-07-14 | 5d93728 | **Mac gates GREEN 2026-07-14: `npm run typecheck` + `npm test` pass; `npm run build` succeeds** (two benign warnings — `node:module` externalized from the emscripten WASM glue, and >500 kB chunk from the embedded WASM — both pre-existing, not from 1.1). Commit staged but must be made Mac-side (Linux sandbox lacks git identity + `.git/objects` write perm). Game-state skeleton built: `src/state/store.ts` (Zustand v5 — `session`: rangeId/targetDistanceM/wind/shotBudget/scope{elevationRad,windageRad,clickRad,magnification}; `settings`: unitsPrimary/sensitivity; pure actions: dial clicks, setZoom clamp 4.5–35×, setWind, decrementBudget floor-0, selectTarget resets dials+refills budget, resetSession, settings setters), `src/units/subtension.ts` (angular→linear mil-relation, keeps dial math out of components per §4.4) + `metersToMillimeters`, `src/state/persist-settings.ts` (settingsToSave/saveToSettings + load/subscribe wiring), `src/state/state.test.ts` (16 cases: dial math MIL+MOA, budget, reset, persistence round-trip). **Verified HERE (Linux sandbox, portable):** independent toolchain-free numeric check of all done-when values + reducer arithmetic — ALL PASS (0.1 mrad@100m=10mm; 1/4 MOA@100yd=0.26180in≈0.262; 1 mil@1000m=1m; dial/clamp/budget arithmetic). TS reviewed by eye vs tsconfig (strict/noUnusedLocals/isolatedModules — clean; zustand 5.0.14 curried `create`). **OWNER CHECK (Mac): `npm run typecheck && npm test` (expect prior 21 + 16 new green) and `npm run build`** — TS7/vitest4 native binaries can't run in this Linux sandbox (deferred-obs 0.4d). No commit until owner confirms Mac green. |
| 1.2 | DONE | 2026-07-14 | 91008f0 | Range A scene built. New `src/range/`: `range-a-config.ts` (pure SI ladder — 10 racks @ 50→500 yd every 50, plate sizes "chips near, larger far" adapted from steel-sim `config.js` sizing; per-rack catch berm + frame dims; box-true, no hidden values), `range-a-config.test.ts` (7 cases: 10 racks/ascending distances/`distanceM`=yd×0.9144/largest-first plates/larger-far/beam-clears-plate/berm-out-heights-rack/ground-past-500), `RangeScene.ts` (framework-agnostic THREE builder — ground+backdrop, sky+fog, hemi+sun, **InstancedMesh** berms/posts/beams/plates, per-rack canvas-text range signs; berm profile ported from steel-sim `Berm.js`; exposes `plates[]` world-metadata for the 1.4/1.5 shot loop; ~25 draw calls total), `RangeView.tsx` (canvas+renderer+loop, drag-to-look + zoom slider, **smoothed frame-time/FPS HUD** for the <16 ms check). App.tsx gains a **Range A** tab (now the default view). Used InstancedMesh throughout instead of `three/addons` `mergeGeometries` — no new deps, `grep` confirms no addons import. **Verified HERE (Linux sandbox, portable):** toolchain-free re-impl of the config math — **86/86 invariant checks pass** (10 racks, ascending, 250 yd=228.6 m, largest-first, beam>plate-top, berm>beam & wider, rack fits plates, near-top 4″ / far-top 16″, ground past 500). TS reviewed by eye vs tsconfig (strict/noUnusedLocals+Parameters/ES2022/bundler — clean; fixed an unused `q`; iterator-free post loop). **Cannot run Mac gates here:** `tsc` = TS7 native binary `@typescript/typescript-linux-arm64` is absent on this arch (same limit as deferred-obs 0.4d), so typecheck/vitest are owner-side. **REVISION 2026-07-14 (owner feedback on first render — screenshots):** berms were tall narrow towers and staggering hid farther racks behind nearer berms/signs. Fixed to steel-sim `Berm.js` proportions: **low, wide mounds** — base ≈ 2× rack width, height ≈ 1.1× rack height (now **3.0–6.0 m wide × 1.18–1.35 m tall**, was ~0.75 m wide × 1.7 m tall). Racks widened to steel-sim's 1.5–3 yd bands (were tiny plate-derived widths). **Occlusion solved:** because low berms sit under the 1.6 m eye→far-plate sightline, only a modest fan is needed; offsets re-solved offline (greedy, capped) to a lane where **no plate row is occluded by any nearer berm** (max offset 12 yd). Signs moved to the right of the rack (steel-sim placement). New **occlusion regression test** guards it. **Re-verified HERE (portable): 94/94** invariant checks incl. zero berm-only AND berm+sign occlusions. **OWNER CHECK (Mac):** (1) `npm run typecheck` (expect clean); (2) `npm test` (expect prior 37 + 8 new = 45 green); (3) `npm run build` (expect prior two benign warnings only); (4) `npm run dev` → **Range A** tab: confirm 10 racks with plates + **low wide berms** + numbered range signs render, drag-look pans across them, **all racks visible (none hidden behind berms)**, and the FPS HUD reads ~60 fps / <16 ms. **iPad:** open the range on device (dev or preview) and confirm the HUD holds <16 ms while looking around. **REVISION 2 2026-07-14 (owner: targets too small + still reading as occluded; owner chose MOA-based sizing):** plates now sized by **angle** — every rack carries the SAME set (**2 / 1.5 / 1 MOA**), so difficulty is constant with range (near 50 yd = 1.05/0.79/0.52″, far 500 yd = 10.47/7.85/5.24″; `diameterM = moaToRad(moa) × distanceM`). Rack width now **scales with plate size** (`clamp(maxD×5.5, 1.2 m, 3 yd)`) so near berms no longer dwarf the range (near berm base 2.6 m, was 3.0), and plates are **centre-clustered** in the rack (no sparse strip). The "still occluded" look was 4 racks sharing bearing x=0 and peeking over near-berm crests; **offsets re-solved** requiring each far plate row to clear nearer berm crests by ≥0.3 m (max offset now 10.5 yd) — only 50 & 250 share a bearing and the 250 row clears the 50 crest by 0.32 m. Occlusion test hardened to a **0.25 m crest-clearance margin**. `PlateSpec` gains `moa` (teaching/HUD later). **Re-verified HERE (portable): 137/137** assertions incl. MOA-equal-angular-size, low-wide berms, and zero occlusion at 0.25 m margin. Test count unchanged (8 in this file → Mac `npm test` still expects 45). No commit until owner confirms Mac green; then commit `inc1/task1.2: Range A scene`. **REVISION 3 2026-07-15 (owner: "targets no larger than coins at close range — review original BTK and align"; committed e96f7b7):** the Rev-2 constant-MOA scheme was the culprit — 2/1.5/1 MOA at 50 yd is 1.05/0.79/0.52″, literal coins. Replaced with **BTK's physical plate ladder** (steel-sim `config.js`): exact BTK subsets where BTK defines the distance (100 yd 6/4/2″ · 200 6/5/3″ · 250 6/5/4″ · 300 6/4/3″ · 400 8/6/4″ · 500 12/8/6″), interpolated at 50/150/350/450 (50 yd = 4/3/2″), **2″ physical floor** (BTK's smallest chip anywhere). `PlateSpec` = nominal `inches` + derived `moa` metadata (angular difficulty now ramps naturally ~7 MOA near → ~1 MOA far-small, matching BTK's own 600-yd comment). Scene consumes `diameterM` — unchanged. **Occlusion fan re-solved per the config's own warning:** the 12″ 500-yd rack widened and grazed the 450 berm; 500-yd offset 10.5→11.5 yd; re-verified with the test's exact math in a scratch harness — 0 violations. Config+test committed standalone (compiles/tests without the scene files); the rest of 1.2 still commits on Mac-green as before. **OWNER (Mac): same gates as Rev 2** — typecheck / `npm test` (still 45 expected) / build / dev → Range A: plates should now read as real steel (10 cm chips at 50 yd, 30 cm gong at 500), all racks visible. **REVISION 4 2026-07-14 (owner: adopt BTK's authored-inputs model; 5 targets/rack; drop plates lower — reviewed live, "looking good"):** config restructured from the Rev-3 plate-derived scheme to BTK's **authored-inputs model** — three independent authored inputs per rack (fixed rack frame width `RACK_WIDTH_YARDS`, BTK's 1.5→3 yd ladder; explicit plate list `PLATE_INCHES`; distance/offset), with **only the catch berm derived** from the frame (base = rackWidth×2.2, height = rackHeight×1.1 — matches `steel-sim.js`). rackWidth/beam are **no longer computed from the largest plate** (that Rev-3 coupling was the opposite of BTK's model). **5 plates on every rack** (matching BTK's near racks): 6/5/4/3/2″ out to 300 yd (100 & 200 BTK-exact), tops growing 7/8/10/12″ at 350/400/450/500 (500 = BTK subset {12,10,8,6,4}), 2″ floor kept. **Plates dropped to 0.5× beam height** (`plateCenterYM = beamHeightM×0.5` ≈ 0.55 m, was 0.8 m ≈ 0.73×; owner: hanging too high). **Fan re-solved:** lower plates steepen the 1.6 m eye→plate rays so far rows must clear nearer berms *laterally* (not over the crest); swapped the offline solver from greedy to **global min-max backtracking** (`/tmp/solve-fan.mjs`) — packs all 10 rows clear within **±6.5 yd** (tighter than the old 11.5). MOA band in the test relaxed to 0.6–12 (a close 50-yd rack is angularly large; BTK-style far plates go sub-MOA). **Verified HERE (this env runs the real Mac toolchain now): `npx vitest run` 45/45 green + `tsc --noEmit` clean.** Committed this revision. **OWNER (Mac/iPad): dev → Range A** — confirm 5 plates/rack sitting ~mid-frame, all racks visible, FPS HUD <16 ms on device. **SIGNED OFF 2026-07-14 (owner, on device): constant 60 FPS / ~16.6 ms; 5 plates/rack read well, all racks visible. Task 1.2 COMPLETE.** |
| 1.3 | split | | | oversized (~550 lines: exact projection math + reticle + a Three scope view) → split into 1.3a (pure/tested core) + 1.3b (ScopeView component) per protocol §3. Verification boundary matches the two-part done-when (projection unit test vs on-device visual). |
| 1.3a | DONE | 2026-07-14 | c535848 | **Scope projection + FFP reticle geometry (pure, machine-verified HERE).** New `src/scope/`: `scope-projection.ts` (LINEAR/equidistant scope model — `pixelsPerRadian = H/fov`, `pixelsPerMil`/`pixelsPerMoa`, `angularSizeRad`/`subtendedMil`/`subtendedMoa` via the mil-relation, `worldSizeToPixels`, `fovRadForMag`, mag 4.5–35, base FOV 24° matching the 0.9 spike; all angle math through the units service per §4.4), `reticle.ts` (pure FFP hash geometry — 1-unit minor / labelled major every 5, symmetric X/Y stadia clipped to the scope-circle radius; MIL + MOA variants). Tests: `scope-projection.test.ts` (7) — **the task's required projection test**: (1) 1 mil = exactly 1/1000 of range at the target plane (anchored to `units/subtension.linearSubtension`); (2) FFP invariant `worldSizeToPixels/pixelsPerMil === subtendedMil` EXACT (10-digit) at 4.5/10/18/30/35× and 10×≡30×; (3) agrees with the real perspective (tan/gnomonic) camera projection at scope FOVs to <0.1% both zooms. `reticle.test.ts` (7) — tick = k·pxPerUnit, major/label cadence, symmetry, no-zero, radius clip, FFP spacing grows with zoom. **Verified HERE: `tsc --noEmit` clean, `npx vitest run` 59/59 (prior 45 + 14 new), `npm run build` green (pre-existing warnings only).** Next: 1.3b builds `ScopeView.tsx` (2nd render pass over RangeScene, circular mask, reticle draw, reused 0.9 aiming/wobble/breath, zoom wired to store) + App tab — its "plate subtends the computed mils identically at 10× and 30×" is the OWNER visual check on device. |
| 1.3b | TODO | | | ScopeView component: 2nd render pass over the Range A scene, circular scope mask, FFP reticle draw (consumes 1.3a `buildReticle`), reuse 0.9 touch aim + 3-layer wobble + breath-hold + recoil, zoom 4.5–35× wired to store, MIL/MOA reticle follows `settings.unitsPrimary`. OWNER CHECK: plate of known size subtends computed mils identically at 10×/30× (FFP); feel on iPad. |
| 1.4 | TODO | | | firing solution plumbing (dispersion ON; hit-sim mean-radius match ≤10%) |
| 1.5 | TODO | | | reactive steel + distance-delayed audio |
| 1.6 | TODO | | | shot loop: wind controls, HUD, budget, scoring, DOPE screen |
| 1.7 | TODO | | | curl-noise wind field + flags/socks + mirage |
| 1.8 | TODO | | | ship it (PWA polish, precache audit, owner plays offline) |

## App dependency pins (GameBuild/app, task 0.4a — owner-approved latest-stable 2026-07-13)
`dependencies`: react 19.2.7, react-dom 19.2.7, three 0.185.1, zustand 5.0.14, idb 8.0.3.
`devDependencies`: vite 8.1.4, @vitejs/plugin-react 6.0.3, vite-plugin-pwa 1.3.0,
vitest 4.1.10, typescript 7.0.2, @types/react 19.2.17, @types/react-dom 19.2.3,
@types/three 0.185.1, jsdom 29.1.1. Exact pins (no `^`); full tree locked in
`GameBuild/app/package-lock.json`. Node v26.5.0, npm 11.17.0.
**Added in 0.4c:** `@types/node@26.1.1` (devDep) — essential tooling for `vite.config.ts`
(`fileURLToPath` for the `@engine` alias); beyond the build-plan's named list but
implied by "Vite + Vitest". Flagged for owner awareness.

## Environment capabilities (filled by task 0.0)
| Capability | Status | Checked | Note |
|---|---|---|---|
| general internet (registry.npmjs.org, github.com) | FAIL (not blocking) | 2026-07-13 | Public `registry.npmjs.org` / `github.com` still return HTTP 403 from the local sandbox proxy ("Apple Claude Code security sandbox", `HTTPS_PROXY=http://localhost:4373`) — not a DNS/network-down failure, just not on the allowlist. **Not currently blocking anything:** npm installs go through the internal mirror (`npm.apple.com`, works — see npm row), and the owner pushes to GitHub owner-side. |
| npm registry (npm.apple.com, configured default) | **PASS (resolved 2026-07-13)** | 2026-07-13 | Initial `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` failure is **fixed** via `npm config set cafile` — full writeup in Resolved escalations. (Same subject as the `npm` row below.) |
| git remote (push/fetch) | PASS (owner-side) | 2026-07-13 | Owner created the GitHub repo and pushed `main` (CLAUDE.md, .gitignore, Design/) successfully on 2026-07-13. Pushing is done **owner-side** — github.com is 403-blocked from the agent sandbox, so the agent cannot `git push` directly. |
| emcc / emsdk | **PASS (emscripten 6.0.2)** | 2026-07-13 | Installed via `brew install emscripten` per owner decision (6.0.2 replaces the 4.0.17 pin — see decisions log). Homebrew's postinstall failed to write the toolchain config, so the agent fixed `/opt/homebrew/Cellar/emscripten/6.0.2/libexec/.emscripten`: set `LLVM_ROOT=/opt/homebrew/opt/emscripten/libexec/llvm/bin`, `BINARYEN_ROOT=/opt/homebrew/opt/emscripten/libexec/binaryen` (were `/usr/bin`,`/usr/local`). Smoke test: `emcc t.cpp -o t.js` + `node t.js` → `wasm ok: 42`. `emcc`/`emcmake`/`emmake` all on PATH. |
| cmake ≥3.16 | **PASS** | 2026-07-13 | Owner ran `brew install cmake` → 4.4.0. `make` 3.81 and `g++`/`clang` (Apple clang 21, Xcode CLT) also present — native build path is now viable once GoogleTest wiring (0.3) is attempted. |
| GoogleTest | **PASS** | 2026-07-13 | Owner ran `brew install googletest` → 1.17.0. No CLI binary (`googletest --version` doesn't exist — that's expected, GTest is a library not a tool); confirmed present via `find_package(GTest)` config at `/opt/homebrew/lib/cmake/GTest/GTestConfig.cmake` and static libs at `/opt/homebrew/lib/libgtest*.a`. |
| C++17 compiler | PASS | 2026-07-13 | Apple clang version 21.0.0 (Xcode CLT at `/Applications/Xcode.app/Contents/Developer`). |
| node | PASS | 2026-07-13 | v26.5.0 (Homebrew, `/opt/homebrew/bin/node`). |
| npm | **PASS (RESOLVED 2026-07-13)** | 2026-07-13 | v11.17.0. The `UNABLE_TO_GET_ISSUER_CERT_LOCALLY` failure is **fixed** — see the resolved-escalation writeup below. `npm ping` → PONG, `npm view react version` → 19.2.7, real registry fetches work; `npm install` will work. |
| python3 | PASS | 2026-07-13 | 3.13.2. |
| listening sockets (localhost servers) | **FAIL (agent sandbox)** | 2026-07-13 | The agent process **cannot bind a listening TCP socket** — `socket.bind()` on both `127.0.0.1:8001` and `0.0.0.0:8001` returns `PermissionError [Errno 1] Operation not permitted` (sandbox seatbelt, not port-in-use). ⇒ **any verification that requires serving the app to a browser is OWNER-SIDE** (owner runs the server in a normal Terminal, not via the `!` prefix which shares this sandbox). Affects task 0.1's browser check (already satisfied via Node instead), and will affect 0.6 (PWA offline reload) and 0.9 (touch-aiming). Command for the owner: `python3 -m http.server 8001 --directory <path>` then open in browser. |
| git | PASS (local) / github 403 | 2026-07-13 | 2.50.1, user.name/email configured. github.com still blocked by sandbox domain allowlist (only matters for the emsdk git-clone route + task 0.5 push). |

**Root repo status:** this directory was **not a git repository** before 2026-07-13
(only the nested `BallisticsToolkit/` clone had its own `.git`). Ran `git init` at
`/Users/analyst/CCode/LongRange`, added a root `.gitignore`, and committed a baseline
(`9263b65`). Repo now tracks **only `CLAUDE.md` + `Design/`**; `BallisticsToolkit/`,
`Documentation/`, and `Wiki/` are git-ignored and were scrubbed from history (they
were briefly in the initial baseline before the scrub — see decisions log). Owner has
pushed `main` to GitHub.

## Owner install queue
*(agent adds exact commands here when a needed install fails; owner marks done)*

**All installs complete.** cmake 4.4.0, GoogleTest 1.17.0, emscripten 6.0.2, npm
(via cafile fix) — nothing outstanding.

- **`git push`** — DONE owner-side (remote configured, `main` pushed 2026-07-13).
  Future pushes remain owner-side (github.com blocked from the agent sandbox); CI
  (task 0.5) runs on GitHub's own infra, so its workflow file is written locally and
  the owner pushes it.

## Resolved escalations

### 2026-07-13 — RESOLVED: npm `UNABLE_TO_GET_ISSUER_CERT_LOCALLY`

**Fix applied:** `npm config set cafile /Users/analyst/node-ca.pem` (writes to the
user-level `~/.npmrc`; **not** committed to this repo, and reversible with
`npm config delete cafile`). Verified: `npm ping` → PONG, `npm view react version`
→ 19.2.7, `npm view vite version` → 8.1.4. `npm install` will now work.

**Why it works / true root cause:** the ambient `NODE_EXTRA_CA_CERTS` points at
`/Users/analyst/.claude/apple/certs/bundle.pem`, which contains only **11 legacy
Apple/GeoTrust/VeriSign/Comodo roots and does NOT include `DigiCert Global Root G2`**
— the root that anchors `npm.apple.com`'s real chain. Node's *built-in* store does
include that root, but in this Node v26 build, having `NODE_EXTRA_CA_CERTS` set
effectively caused Node to trust only that incomplete bundle for npm's connections
(so chain-building failed). Pointing npm's own `cafile` at the pre-existing complete
CA file `~/node-ca.pem` (a 180-cert keychain dump already on the machine from another
project) gives npm a self-sufficient trust set that overrides the broken ambient one.
This is a legitimate npm configuration using valid CA certs — not a security bypass,
no env-var or sandbox change, no domain-allowlist change.

**To reproduce the fix from scratch** (if `~/node-ca.pem` is ever missing): a dump of
Node's built-in roots suffices — `node -e "const t=require('tls'),f=require('fs');f.writeFileSync('/some/ca.pem',t.rootCertificates.join('\n'))"`
then `npm config set cafile /some/ca.pem`.

**Note for the harness maintainer (not blocking us):** the underlying bug is that
`/Users/analyst/.claude/apple/certs/bundle.pem` is an incomplete trust set that, when
loaded via `NODE_EXTRA_CA_CERTS`, breaks Node TLS for hosts anchored by roots it
omits (e.g. DigiCert Global Root G2). Regenerating that bundle to be complete would
fix this environment-wide for all Node tools without the per-tool `cafile` workaround.

## Deferred observations
- (1.2) **Range A uses BTK's authored-inputs model (rev 4, owner 2026-07-14):**
  three independent authored inputs per rack — fixed frame width
  (`RACK_WIDTH_YARDS`, BTK's 1.5→3 yd ladder), an explicit plate list
  (`PLATE_INCHES`, 5 plates/rack, physical inch sizes, 2″ floor), and
  distance/offset — with **only the catch berm derived** from the frame
  (base = rackWidth×2.2, height = rackHeight×1.1, ported from steel-sim). Plates
  hang at 0.5× beam height. `PlateSpec.moa` is derived metadata (HUD/teaching).
  Difficulty scales with range naturally (big MOA near → sub-MOA far). Easy to
  retune the plate lists once the scope pipeline (1.3) and shot loop (1.4/1.6)
  show what plays well. Round plates only (no ovals). Fan (`X_OFFSET_YARDS`) is
  solver-guarded by the occlusion test — retune sizing ⇒ re-solve.
- (1.2) **`RangeScene.plates[]` already carries per-plate world metadata**
  (rackId, distanceM/Yards, diameterM, world position, InstancedMesh instanceId)
  — the seam the 1.4/1.5 hit-sim + reactive-steel will consume. Nothing reads it
  yet. Plate hit-testing/reaction is NOT in 1.2 (that's 1.4/1.5).
- (1.2) **RangeView input is a placeholder look-around** (drag pan + zoom
  slider), deliberately minimal to inspect the scene. It is NOT the scope
  pipeline; task 1.3 replaces it with the real second render pass + reticle and
  reuses the task-0.9 aim/wobble/breath-hold model. No sight-height/ballistics.
- (1.1) **`settings.sensitivity` is store-only, NOT persisted.** Save schema v1
  (`persistence/schema.ts`) has only `unitsPrimary`; adding `sensitivity` to the save
  requires a `schemaVersion` bump + migration + fixture (guardrail §4.6), and the
  schema.ts note reserves **v2 for Increment 2** (rifles/lots/DOPE). So 1.1 persists
  only `unitsPrimary`; `sensitivity` resets to its default (1.0) on reload. Fold
  `sensitivity` into the Increment-2 v2 bump. `persist-settings.ts` documents this;
  a test asserts the intentional omission.
- (1.1) Store **not yet wired into `App.tsx`** (no scene/UI to drive it until 1.2/1.6).
  App-shell hydration = `loadSettingsInto` on start + `persistSettingsOnChange`
  subscription; hook them up when the Range A UI lands.
- (0.9, owner requirement) **Hold wobble must be a user-adjustable setting in the
  real game** (amplitude control + off). Candidate future tie-in: position/support
  quality (catalog §5 human factors, currently deferred) could drive the default.
  Recoil behavior likely also becomes per-rifle (magnums kick harder) — Increment 1.4+.
- (0.9, owner idea → likely core mechanic) **Breath-hold/respiratory-pause button**:
  steadies the hold on a limited air budget with oxygen-debt penalty for overholding.
  Ships in the spike (iter 4); should carry into the real scope pipeline (task 1.3+)
  and pairs naturally with the trigger-breathing-recoil Wiki article (§5, unwritten —
  a future demand-driven article could cite the real technique this teaches).
- (0.4d) **Sight height over bore is not modeled** — the bridge zeroes the bore
  line through the target, so debug-table drops are bore-line values, not scope
  come-ups. Must be added (engine takes it via initial Y position, or bridge-side
  offset) before the task-1.6 DOPE table is real. The screen carries a visible
  footnote.
- (0.4d) `validation/match-check.mjs` intentionally duplicates the bridge's solve
  sequence (Vite-free oracle-harness seed). If the bridge solve changes, keep them
  in sync by hand — task 0.7 should consider extracting a shared driver.
- (0.4d) The owner-review sandbox (Linux) cannot run the Mac-native toolchain
  (typescript 7 / esbuild platform binaries) — only Node+WASM checks are portable
  across the two agent environments. Plan Mac-side verification for any task
  finished from that side.
- (0.4d) Stale `.git/index.lock` had to be cleared via the sandbox delete
  permission; the review sandbox cannot delete under `.git/` by default.

## Blocked / escalations
- (none — all Increment 0 tooling in place as of 2026-07-13)

## Owner decisions log
- 2026-07-13: plan approved; executor = Sonnet-level agent; Increments 0–2 detailed
  up front, 3–6 planned just-in-time.
- 2026-07-13: **Emscripten 6.0.2 (internal brew mirror) replaces the 4.0.17 pin**
  (GitHub domain-blocked locally; owner prefers current versions). One version
  everywhere: local builds, root `ci.yml`, golden-vector generation. Protocol §4.1
  amended: minimal **build-only** patches to `BallisticsToolkit/` are allowed
  (`oracle-patch:` commits, recorded in `GameBuild/validation/ORACLE_VERSION`); numerical
  code paths and optimization flags remain untouchable; re-run McCoy/Litz
  cross-checks after any oracle patch.
- 2026-07-13: owner ran `brew install cmake googletest` (both confirmed working).
- 2026-07-13: owner asked to **pause all further installs** (emsdk included) until
  the npm/`NODE_EXTRA_CA_CERTS` blocker above is understood and resolved, rather
  than routing around it. Agent is holding on 0.1/0.2/0.4 pending this.
- 2026-07-13: **npm blocker RESOLVED** by the agent via `npm config set cafile
  /Users/analyst/node-ca.pem` (legitimate npm config, no security/env/sandbox
  change; see Resolved escalations). The pause condition is now satisfied — emsdk
  install is ready to proceed pending owner's choice of route (Owner install queue).
- 2026-07-13: **Repo scope decided (owner).** The git repo tracks only `CLAUDE.md`
  and `Design/`. `BallisticsToolkit/`, `Documentation/` (copyrighted source PDFs),
  and `Wiki/` are **git-ignored, local-only, never pushed** — history was scrubbed
  (filter-branch) so they never appear in any commit. Files remain on disk. Owner
  pushes to GitHub manually (github.com is blocked from the agent sandbox). Pre-scrub
  state recoverable locally under `.git/refs/original/` until owner drops it.
- 2026-07-13: **Owner rule — stop after every task.** The agent must NOT auto-advance
  between tasks. Finish a task, verify, log/commit, then stop and confirm with the
  owner before starting the next (every boundary 0.0→…→0.10 and beyond). Encoded in
  `execution-protocol.md` §2.8 / §3.
- 2026-07-13: initial push to GitHub done by owner (CLAUDE.md, .gitignore, Design/).
- 2026-07-13: **Layout decided (owner) — `GameBuild/` umbrella.** All buildable code
  lives under `GameBuild/`: `GameBuild/engine/`, `GameBuild/app/`, `GameBuild/validation/`
  (keeps repo root clean). `.github/` must stay at repo root (GitHub Actions requirement).
  `engine/` was `git mv`'d to `GameBuild/engine/` and rebuilt (verified). All path refs
  in build-plan / feature-catalog / execution docs / CLAUDE.md updated `engine|app|validation/`
  → `GameBuild/…`. Supersedes the flat root layout in build-plan §5.
- 2026-07-13: **Owner rule — update `PROGRESS.md` at the end of every task**, whatever
  the outcome (DONE/BLOCKED/AWAITING/IN PROGRESS), before stopping. Encoded in
  `execution-protocol.md` §2.6.
- 2026-07-14: **Range A target sizing = MOA-based (owner choice, task 1.2).**
  Every rack carries the same angular set (2 / 1.5 / 1 MOA) → constant difficulty
  with range; physical plate size grows with distance. Chosen over "bigger visible
  steel" and a mixed ladder for simulation authenticity (accepts small near plates).
  **SUPERSEDED 2026-07-14 (rev 3 → rev 4 below).**
- 2026-07-14: **Range A target sizing = BTK authored-inputs model (owner, task
  1.2; final).** Reverses the MOA-based choice above: the constant-MOA set made
  near plates coin-sized. Now mirrors BallisticsToolkit's steel-sim — fixed
  authored rack frames (1.5→3 yd) + explicit physical plate lists (5 plates/rack,
  6→12″ near→far, 2″ floor), berm derived from the frame, plates hung at 0.5×
  beam. Difficulty scales with range naturally. Owner signed off on device
  (60 FPS / ~16.6 ms). See task 1.2 row rev 3–4 for the full path.
- 2026-07-13: **INCREMENT 0 COMPLETE — owner sign-off** ("Controllable. Let's wrap
  up."). All five exit-checklist items owner-confirmed on device. Aim-spike defaults
  baked: wobble 0.75, sens 1.0. Tagged `inc0-complete`. Increment 1 (first shippable
  slice — KD shot loop) is now current; next task 1.1 on owner go-ahead.
