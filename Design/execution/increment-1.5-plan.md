# Increment 1.5 plan — reactive steel, delayed audio, impact FX, bullet trace

`Status: approved; 1.5a + 1.5d built (pending owner Mac gates + device)` · `Date: 2026-07-14`
`Covers:` PROGRESS tasks **1.5** (reactive steel + distance-delayed audio) **and 1.5b** (in-scope bullet trace), planned together per owner.
`Authority:` refines [`increment-1.md`](./increment-1.md) §1.5/§1.5b under [`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's *Done when* clauses — it decides the *how* and the task split so each sub-task fits the §3 size limit. **Live state + per-task deltas live in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this doc is the point-in-time plan.**

Owner decisions already logged for this plan: **audio = reuse BTK's own assets** (copy from `BallisticsToolkit/web/audio/`, precache them); **scope = 1.5 + 1.5b together**.

> **Deltas since approval (2026-07-14), see PROGRESS.md for detail):**
> - **D3 audio superseded:** a **miss makes no impact sound** — a bullet into dirt/berm
>   doesn't ring or ricochet, so the ricochet clip was dropped; the muzzle report plays
>   every shot and the steel **ping plays on a HIT only**, scaled by distance + impact
>   energy (owner tie-in: close/heavy hits ring louder/brighter). Only `report.mp3` +
>   `ping.mp3` ship.
> - **Chains** (draw the hang chains, reactive to the swing) are **folded into 1.5c**
>   (owner) alongside impact marks + dust.
> - **Test scope zero = 300 yd** (owner) so nearer racks need hold-under and farther
>   hold-over.

---

## 1. What already exists (so we build, not rebuild)

- **`btk::rendering::SteelTarget` is already WASM-bound** (`GameBuild/engine/src/bindings.cpp` ll. 357–371): `hit(bullet)`, `timeStep(dt)`, `getOrientation()`, `getCenterOfMass()`, `getAngularVelocity()`, `isMoving()`, `addChainAnchor()`, `intersectTrajectory()`. Full 3D rigid body with chain constraints and impact-impulse transfer. **No engine change is expected** for reaction — if a needed accessor turns out unbound, it is an *additive* binding in the owned copy (golden-vector diff must stay zero; re-run `ctest` + `run.mjs`).
- **The shot loop already resolves impact + hit** (`game/shot.ts` → `ShotResult { impact, hitPlateId, aimedPlateId }`) and **ScopeView already wires FIRE → resolveShot → recordShot** (`scope/ScopeView.tsx` ll. 236–277). 1.5 hooks *after* `resolveShot`.
- **Plates render as one shared `InstancedMesh`** (`range/RangeScene.ts`), each carrying `PlateInstance { rackId, distanceM, diameterM, position, instanceId }`. This is the seam the reaction mirrors into — and it constrains the design (see §3, decision D1).
- **The 1.4 solve already returns the full `TrajectoryTable`** that the deterministic center is read from. The bullet trace (1.5b) and the impact-velocity for the steel impulse both reuse it — **no new physics**.
- **Salvage references (BTK, local-only, git-ignored — we port, not import):** `steel-sim/SteelTarget.js` (chain-anchor geometry, mesh mirroring), `steel-sim/AudioManager.js` (WebAudio, `playSoundDelayed`, node pooling, iOS resume), `steel-sim/steel-sim.js` ll. 2607–2660 (the delay = `distance / speedOfSound` + linear volume attenuation), `steel-sim/DustCloud.js` + `ImpactMark.js` (puff + decal pools), `fclass-sim/rendering/ballistics.js` (glow-sprite trace, live toggle, fade behind the bullet).
- **BTK audio assets present:** `long_shot.mp3`, `shot1.mp3` (report), `ping1.mp3` (steel ping), `ricochet.mp3` (miss/graze), `scope_click.mp3` (dial clicks — that's 1.6, not now), `background_noise.mp3` (3.9 MB ambient loop). Small SFX are all < 100 KB.

## 2. Architecture at a glance

```
FIRE (ScopeView)
  └─ resolveShot()  ────────────────────────────────►  ShotResult{impact, hitPlateId}
        ├─ if hit → steelReaction.strike(plate, impact, impactVel)   [1.5a]
        │              └─ engine-bridge/steel-target.ts  (C++ SteelTarget, lazy per hit)
        │                    └─ per-frame: mirror getOrientation()/getCenterOfMass()
        │                        into that plate's InstancedMesh matrix (setMatrixAt)
        │                    └─ retire + .delete() when isMoving()===false
        ├─ audio.report() now;  audio.pingOrRicochet(delay=dist/c, vol) [1.5d]
        │              └─ audio/AudioManager.ts (WebAudio, BTK assets, iOS unlock on tap)
        ├─ impactFx.mark(impact) + impactFx.dust(impact, hit?)          [1.5c]
        │              └─ pooled sprite decal + pooled dust puff (hit=metallic, miss=dirt)
        └─ if settings.traceEnabled → trace.launch(TrajectoryTable)     [1.5b]
                       └─ scope/BulletTrace.ts glow along table over real TOF, fading
```

All embind lifecycle (`.delete()`) lives in `engine-bridge/` per protocol §9. All angle/length math routes through the units service per guardrail §4.4. No new npm deps; no runtime CDN.

## 3. Decisions to lock before coding (architecture — owner sign-off requested)

**D1 — Reaction driver: lazy per-hit `SteelTarget`, mirrored into the shared InstancedMesh; NOT one target per plate, NOT persistent.**
The 10 racks share one plate `InstancedMesh` (~1 draw call). We do **not** spin up 50 C++ rigid bodies. On a hit we lazily construct a single `SteelTarget` sized to that plate, anchor it top-hung (chain geometry ported from `steel-sim/SteelTarget.js`), call `.hit(bullet)`, and each frame write its `getOrientation()`/`getCenterOfMass()` into just that plate's instance matrix via `setMatrixAt`. When `isMoving()` returns false we snap it back to rest, `.delete()` the C++ object, and stop touching that instance. Instancing stays intact; only struck instances animate; the real C++ physics drives it (spec §1.5 satisfied). Center hit → swing, edge hit → rotation falls out for free because `.hit()` applies the impulse at the true impact point.

**D2 — Impact marks use a sprite/decal pool, NOT `SteelTarget`'s texture paint-removal.**
`SteelTarget` renders wear by mutating its own per-target RGBA texture buffer. That requires a unique texture per plate and is incompatible with the shared InstancedMesh (and with 50 plates). So the C++ texture path is deliberately **not** used; instead a small pooled sprite decal is placed at the impact point on the plate face (port of `ImpactMark.js`). Logged as an intentional divergence, not an omission.

**D3 — Audio: port `AudioManager`, copy BTK's small SFX into the app, precache them; defer the big ambient loop.**
Copy `long_shot.mp3` (report), `ping1.mp3` (ping), `ricochet.mp3` (miss) into `GameBuild/app/public/audio/` — they become first-class, pushed app assets (BTK itself is git-ignored) and go into the vite-plugin-pwa precache manifest. `background_noise.mp3` is 3.9 MB against the 8 MiB precache budget already spent mostly on the WASM bundle; **recommend deferring the ambient loop** (or transcoding it smaller in 1.8 polish) and shipping only the three essential one-shots now. iOS audio unlock happens on the **first FIRE tap** (a user gesture) — create/resume the `AudioContext` there.

**D4 — `settings.traceEnabled` (default ON) is store-only this increment, not persisted — same treatment as `sensitivity`.**
Adding it to the save requires a `schemaVersion` bump + migration + fixture (guardrail §4.6), and schema v2 is reserved for Increment 2 (rifles/lots/DOPE). So it defaults ON each launch; fold it into the v2 bump alongside `sensitivity`. Logged in `_gaps.md`/deferred obs.

**D5 — Coordinate frames reuse the 1.4 mapping.** Reaction pose, dust, marks, and the trace all live in the same Three scene the impact already lands in; we reuse ScopeView's existing engine-SI→scene placement rather than inventing a second transform. Speed of sound comes from the engine atmosphere (`getSpeedOfSound()`, ISA ≈ 340 m/s), not a hard-coded 343.

## 4. Task split (each stops for owner per protocol §2.8)

Combined this is well over the ~400-line / 10-file limit, so it splits into four verified sub-tasks. Existing PROGRESS labels **1.5** and **1.5b** are preserved; the reactive-steel/audio work (old "1.5") becomes **1.5a / 1.5c / 1.5d**, and **1.5b** stays the bullet trace. Recommended order below (each independently valuable; all depend only on the 1.4 shot result, which already exists).

### 1.5a — Steel reaction (physics → mesh) — *the headline*
- New `engine-bridge/steel-target.ts`: `createSteelReaction(module, plate) → { strike(impactWorld, impactVel, bulletDiaM, bulletMassKg), step(dt), poseInto(instancedMesh, instanceId), isMoving(), delete() }`. Builds the `SteelTarget` (diameter/thickness, top-hung chain anchors ported from `steel-sim/SteelTarget.js`), constructs the impact `Bullet` from the 1.4 terminal velocity, calls `.hit()`. All `.delete()` here.
- ScopeView: after `resolveShot`, if `hitPlateId != null`, `strike` a reaction for that plate; drive `step(dt)` + `poseInto(...)` in the existing render loop; retire + delete on settle (snap the instance matrix back to rest).
- **Engine:** verify SteelTarget's bound surface is sufficient; if one accessor is missing, add it *additively* in the owned copy and re-run `ctest` + golden vectors (must stay zero-diff).
- **Verify:** `vitest` bridge test — lifecycle (create/hit/step/settle→isMoving false/delete) and a **behavioral parity check**: a centered impact produces dominant swing (rotation about the horizontal top-anchor axis) while an edge impact produces measurable yaw/roll — assert the pose-delta signature differs, matching steel-sim. Golden vectors green; `tsc`/build green. **OWNER CHECK:** side-by-side vs BTK steel-sim — center swings, edge rotates, looks right on device.

### 1.5d — Distance-delayed audio
- Copy the three SFX into `GameBuild/app/public/audio/`. New `audio/AudioManager.ts` (trimmed port of steel-sim's): decode buffers, `playSound(id,{volume})` immediate, `playSoundDelayed(id, delaySeconds, {volume})`, gain-node pool, `unlock()`/resume on first gesture.
- ScopeView FIRE: `report` immediately; on the resolved impact schedule `ping` (hit) or `ricochet` (miss) at `delay = distanceM / speedOfSound`, volume linearly attenuated 100 %@100 yd → 10 %@max (reference formula). Unlock the context on the first FIRE tap.
- Precache: add `audio/*.mp3` to the vite-plugin-pwa Workbox glob; confirm the precache manifest lists them.
- **Verify:** `vitest` unit test on the **delay + attenuation math** (500 yd → 457 m / 340 m/s ≈ **1.34 s** ∈ [1.3, 1.4]; volume monotonic decreasing, clamped [0.1, 1.0]). Build green. **OWNER CHECK (iOS):** no audio before the first tap; report is instant, 500 yd ping lags ~1.3 s; **offline relaunch of the installed PWA still plays** (precache proof, guardrail §7).

### 1.5c — Impact marks + hit/miss dust
- New `scope/impact-fx.ts`: a pooled sprite **decal** at the impact point on the struck plate (port `ImpactMark.js`), and a pooled **dust puff** (port `DustCloud.js`) coloured by outcome — metallic/grey spark on steel, brown dirt on a berm/ground miss. Bounded pools; puffs fade and recycle.
- ScopeView FIRE: emit a mark on hit and a puff always (colour keyed on `hitPlateId != null`).
- **Verify:** `vitest` on pool mechanics (allocate → active cap respected → recycle on expiry; colour selection by hit/miss). Build green. **OWNER CHECK:** hits leave marks, dust colour reads correctly, no leak over many shots (FPS HUD holds < 16 ms).

### 1.5b — In-scope bullet trace (existing label)
- Add `settings.traceEnabled` (default `true`) + setter to the store (store-only per D4).
- New `scope/BulletTrace.ts`: a fading glow sprite/line that walks the **same `TrajectoryTable` the 1.4 solve returned**, advancing the head by real elapsed time against cumulative per-point TOF, fading the tail (port `fclass-sim/rendering/ballistics.js`). Visible primarily at magnification; toggle OFF hides it with no other behavior change. Rendered in the scope pass.
- ScopeView FIRE: if `traceEnabled`, `trace.launch(table)` using the exact table that produced the impact.
- **Verify:** `vitest` — (1) **trace endpoint === impact point** (same table drives both; assert equality); (2) TOF timing (500 yd ≈ 0.7 s to the endpoint, within a frame or two); (3) toggle OFF ⇒ no trace, impact/audio unchanged. Build green. **OWNER CHECK:** arcing trace through the scope terminating on steel; toggle works.

## 5. Increment-exit alignment

This plan closes these `increment-1.md` exit-checklist items: *"Steel reacts (swing/rotation) and pings with distance-delayed audio"* (1.5a + 1.5d), and the *Done when* clauses for 1.5 (center swings / edge rotates / 500 yd ping ≈ 1.3–1.4 s / no audio before first tap) and 1.5b (arcing trace to the 1.4 impact point / TOF-matched / toggle / endpoint==impact assertion). Wind adjustability, HUD, budget, scoring remain **1.6**; wind field/flags/mirage remain **1.7**.

## 6. Risks / stop-conditions (protocol §6)

- **Chain-anchor geometry mismatch** — if the ported top-hung anchors don't reproduce steel-sim's swing/rotation feel, tune anchor positions against `steel-sim/SteelTarget.js` before proceeding; don't invent a different constraint model. Log if the C++ behavior itself disagrees with the reference.
- **Precache budget** — if adding SFX pushes past the 8 MiB Workbox cap, stop and escalate (drop the ambient loop is already the plan; do not raise the cap silently).
- **Additive engine binding** — if reaction needs an unbound accessor, it's additive-only; any non-zero golden-vector diff is a hard stop.
- **Frame budget** — struck-plate animation + pools must hold < 16 ms on iPad; if not, cap concurrent reactions/puffs and re-measure.
- **Coordinate drift** — reuse the 1.4 mapping (D5); if the trace or reaction visibly diverges from where the impact lands, that's a frame-mapping bug to fix, not to paper over.

## 7. Suggested sequence

`1.5a` (reaction — highest value, proves the C++ path) → `1.5d` (audio) → `1.5c` (marks/dust) → `1.5b` (trace). Stop for owner confirmation at each boundary. Then the 1.5 group is done; 1.6 (the loop/HUD) is next.
