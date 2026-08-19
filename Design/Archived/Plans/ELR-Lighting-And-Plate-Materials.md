# ELR Lighting And Plate Materials

Status: **APPROVED** — 2026-08-19.

## Context

On device at 1250 / 1500 / 2000 m the owner found the ELR high-line targets hard to find: *"the board
and target kind of fade into the fog and grass"*, and *"if they're white, why are they a light grey in
the shot while the sign above is an obvious bright white?"* This plan fixes exactly that — the plate
material, the backer panel colour, and ELR's light rig. It is the slice of the ELR dressing work that
does **not** depend on the shared-environment refactor, which is waiting on its own exploration.

**Why the plate reads grey, established by reading the code.** Three multiplicative losses hit the
plate and none of them hit the sign above it:

1. `plate-surface.ts:210` (`const material = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.6 });`)
   — metalness scales diffuse albedo by `(1 − 0.3) = 0.7` and routes 30 % into a specular lobe. There
   is **no environment map anywhere in the app**, so that 30 % reflects nothing and is lost.
2. Light angle. `ELRRangeScene.ts:128` (`sun.position.set(-318, 97, 223)`) is a 14° sun; a
   shooter-facing plate normal is ≈ `(0, 0, 1)`, giving **N·L ≈ 0.557**.
3. Together those put the plate at a linear reflectance ≈ 0.29 of albedo → **≈ 0.58 sRGB**, i.e. light
   grey, matching the screenshot.

The sign escapes all three because it is **unlit** — `ELRRangeScene.ts:359`
(`const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));`) renders its
texel value directly. **That makes the sign the negative control for every check in this plan: it must
never change.**

**What each change actually buys — measured, because the exploration's assumption was wrong in one
place.** The exploration recorded that ELR is *"the pre-fix version of the shared rig."* That holds for
the sun (ELR 1.25 vs the shared rig's pre-fix 1.35) but **not for the hemisphere light**: ELR is at
`1.1` (`ELRRangeScene.ts:125`) against the shared rig's `0.75`
(`wooded-zero-environment.ts:116`, `hemiIntensity: 0.75`). So adopting the shared rig *lowers* ELR's
fill. Working it through:

| change | effect on a vertical shooter-facing plate | effect on the ground |
|---|---|---|
| metalness `0.3 → 0` | diffuse × 1.43 → ≈ 0.67 sRGB. **This is what delivers the goal.** | same × 1.43 |
| sun `1.25 → 1.6` at 24° | × 1.28 intensity, × 0.94 from N·L 0.557 → 0.524 = **× 1.20** | × 1.28 intensity, × 1.68 from N·L 0.242 → 0.407 = **× 2.15** |
| hemi `1.1 → 0.75` | × 0.68 on the fill term | × 0.68 |

So the rig change is **roughly neutral on the plates and a large lift on the ground and scenery** — which
is what *"let's lighten up the scene itself also"* asked for. The plate's brightness comes from the
metalness fix. The executor should expect the plate to move at T1 and barely move at T3; that is
correct, not a failure.

**Why this is a small change to known code:** four constants and one method body. `ELRRangeScene`
already imports the shared config it needs — `ELRRangeScene.ts:23`
(`import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';`) — and already calls a shared
environment builder at `ELRRangeScene.ts:380` (`buildTrees(this.scene, WOODED_ZERO_ENVIRONMENT, placements, …)`),
so consuming the shared lighting values is an established pattern here, not new plumbing.

## Decisions (2026-08-13)

| # | Decision |
|---|---|
| D1 | **Goal:** the ELR plate white must read as the same white as the distance sign above it. That is the acceptance criterion, judged by eye on device. |
| D2 | **Goal:** lighten the whole scene, not only the steel — this is a scene tuning job, not a target-material one. |
| D3 | Plate material `metalness: 0.3 → 0` — a painted plate is a dielectric, and with no environment map the specular 30 % is pure loss. |
| D4 | Plate material `roughness: 0.6 → 0.45` — a single conservative step that tightens the specular lobe (the sun sits behind the firing line and the plate faces the shooter, so **N·H ≈ 0.89** and a tighter lobe really does brighten a flat plate). **Not lower:** below ~0.4 painted steel starts reading as polished plastic with a hotspot. This is an authored starting value the owner tunes at T1's stop. |
| D5 | **D3 and D4 change all four ranges** — `createPlateMaterial` is one factory shared by `RangeScene` (Range A), `TestRangeScene`, `WoodedZeroScene` and `ELRRangeScene`. Deliberate, not an oversight: the defect is physical, so it is a defect everywhere, and parameterising would add an argument to a shared factory purely to keep a wrong value alive on three ranges. Do **not** add a per-range parameter. |
| D6 | Backer panel `PANEL_HEX = 0x2a2a28 → 0xff7a1a` (bright orange, owner-chosen 2026-08-13). Replaces the measured near-black. The panel's *purpose* is unchanged — it exists to give the light plate contrast — only its colour changes, so that the board is findable at 2000 m. Authored starting value; tuned by eye at T2's stop. |
| D7 | ELR's light rig takes the shared rig's values: sun elevation **24°**, azimuth **−125°**, `sunHex 0xffe3ba`, `sunIntensity 1.6`, `hemiSkyHex 0x93b4e0`, `hemiGroundHex 0x4a5236`, `hemiIntensity 0.75`. ELR was never given the owner's 2026-07-26 correction that raised the shared sun; this applies it. |
| D8 | ELR reads those values from `WOODED_ZERO_ENVIRONMENT.lighting` and computes the sun position with the shared `sunDirection()` — **it does not copy the numbers in**, so there is one source of truth. It does **not** call `buildLighting()`: that would allocate a 2048 shadow map ELR can never use (D10) and add lights via `scene.add` outside ELR's own disposal tracking. |
| D9 | `SKY_HEX = 0xdfe3e8 → 0xe6dcc8` (warm cream, the shared rig's fog colour). One constant drives **both** `scene.background` and the fog colour (`ELRRangeScene.ts:109-110`) and they must stay equal — a fog colour that differs from the sky it fades into shows a seam at the horizon. Change the constant; do not split them. |
| D10 | **`FOG_DENSITY` stays well below the shared rig's `7.45e-4`, and `usesShadows` stays `false`.** Adopting the shared density outright would put **89 % haze on the 2000 m gong** and delete the range's whole job — that ceiling is still a hard negative requirement. Within that ceiling the exact value is an owner-tuned dial: lowered `1.7e-4 → 1.19e-4` (−30 %, owner call 2026-08-19, after seeing T3 on device) — **~11 % → ~5.5 % haze at 2000 m** (`FogExp2`'s squared falloff: `1 − e^(−(density·depth)²)`). |
| D11 | The code comment at `ELRRangeScene.ts:234-235` justifies the dark panel and is falsified by D6. It gets rewritten in the same task, because a comment asserting the opposite of the code is how the next reader reverts it. |

## Tickets closed by this plan

**None.** The source exploration folded no tickets in — it ran before `Design/Tickets/` existed.

## Prefactoring

**None needed**, because nothing moves. Every edit is a constant or a material parameter changed in
place, plus one method body rewritten against values it already imports. There is no shared symbol
being renamed, no interface being retyped, and no code relocating — so there is no behaviour to pin
first. The one shared-code edit (`plate-surface.ts:210`, reached by four scenes) is a single parameter
change whose blast radius is covered by T1's owner stop checking all four ranges, which a
characterization test could not do: the thing being verified is how it *looks*.

## Approach

Four dials, each landing in its own task so the owner can judge them separately. Bundling them would
mean that if the result looks wrong, nobody can tell which dial did it — and this is entirely a
by-eye tuning job.

### 1. `range/plate-surface.ts` — the plate material (T1)

One line. At `:210`:

```ts
const material = new THREE.MeshStandardMaterial({ metalness: 0.3, roughness: 0.6 });
```

becomes `metalness: 0, roughness: 0.45`. Add a comment saying why `0` rather than `0.3`: a painted
plate is a dielectric and there is no environment map in the app, so the specular share reflects
nothing.

**Leave the rest of the function alone.** `:214` throws if three's shader anchors moved, and
`:242` (`material.customProgramCacheKey = () => 'plate-surface-v1';`) shares one patched program across
every user. Neither is affected: metalness and roughness are uniforms, not compile-time defines, so the
cache key stays valid.

### 2. `range/elr-range-config.ts` — two constants (T2, T3)

- `:103` (`export const PANEL_HEX = 0x2a2a28;`) → `0xff7a1a` (T2).
- `:235` (`export const SKY_HEX = 0xdfe3e8;`) → `0xe6dcc8` (T3).
- `:234` (`export const FOG_DENSITY = 1.7e-4;`) → `1.19e-4` (T3, added 2026-08-19 —
  see amended D10). Stay well clear of the shared rig's `7.45e-4` ceiling.

Both constants are consumed only by `ELRRangeScene` (verified by repo-wide grep: `PANEL_HEX` at
`ELRRangeScene.ts:33`/`:239`, `SKY_HEX` at `:38`/`:109`/`:110`, and nowhere else).

### 3. `range/ELRRangeScene.ts` — the panel comment (T2)

The doc comment at `:229-236` currently reads *"The HIGH line keeps the frame-and-dark-panel build,
because the panel's contrast advantage is measured and real once fog bites (plan §4.2 / D4)."* Rewrite
the second half: the panel still exists to give the light plate contrast, but it is now bright orange
so the board itself is findable through fog at 2000 m (owner, 2026-08-13, from a device screenshot).
Drop the `plan §4.2 / D4` reference — it points at an archived plan.

### 4. `range/ELRRangeScene.ts` — `addLights()` (T3)

Replace the body at `:124-129`:

```ts
private addLights(): void {
  const hemi = new THREE.HemisphereLight(0xbcd2e8, 0x6b6558, 1.1);
  this.add(hemi);
  const sun = new THREE.DirectionalLight(0xffe9c8, 1.25);
  sun.position.set(-318, 97, 223);
  this.add(sun);
}
```

with a version that reads `WOODED_ZERO_ENVIRONMENT.lighting` (already imported at `:23`) and places the
sun via `sunDirection(WOODED_ZERO_ENVIRONMENT)` from `./environment/environment-config`
(`environment-config.ts:202`, `export function sunDirection(cfg: EnvironmentConfig)`), scaled by a
locally-declared `const SUN_DISTANCE_M = 400;`.

Three things the executor must get right:

- **Destructure `sunHex`, `sunIntensity`, `hemiSkyHex`, `hemiGroundHex`, `hemiIntensity` only.** Ignore
  `cfg.lighting.shadows` — ELR is `readonly usesShadows = false` (`ELRRangeScene.ts:83`), so never set
  `castShadow` and never touch `sun.shadow`.
- **Keep both lights inside `this.add(...)`**, exactly as now, so ELR's existing disposal path
  (`ELRRangeScene.ts:388`, `private add(obj: THREE.Object3D): void`) still owns them.
- **`SUN_DISTANCE_M = 400` is declared locally**, with a comment that only the *direction* matters to a
  `DirectionalLight` and that 400 matches `environment/lighting.ts:28`, which does not export it.

**Correctness check available for free:** `sunDirection` at 14° / −125° × 400 reproduces
`(-317.9, 96.8, 222.6)` — ELR's current hardcoded `(-318, 97, 223)`. So the new code at 24° must produce
`(-299.3, 162.7, 209.6)`. That is a mechanical assertion, and T3 uses it.

## Explicitly not doing

- **The shared-environment refactor**, and everything downstream of it — ground undulation, the horizon
  and sky dome, clouds, mud patches, the world-extending skirt. Blocked on its own exploration.
- **The 21 scatter targets**, their seeded placement, clearance culling, the reshuffle control and the
  `scatterSeedByRange` save field. Same blocker, and the save field additionally collides with the
  protocol's guardrail 6, which is unsettled.
- **The wind-marker clearance fix.** It rides on the same sight-clearance work as the scatter steel.
- **Plate machinery** — the multi-shape `InstancedMesh` + `meshFor` pattern. That exists to carry
  scatter-target *shapes*; it is machinery, not a lighting or material change.
- **The committed-target chip rename** (`target: #7` → `target: popper`). UI text, not lighting.
- **An environment map, and an emissive lift on plate faces.** Both were deliberately held in reserve,
  to be revisited only if the cheap fix still reads flat on device.
- **Enabling shadows on ELR.** See D10 — a negative requirement, not an omission.
  (`FOG_DENSITY` itself is now a tuned dial within D10's ceiling, added 2026-08-19 — see above.)
- **Redesigning Range A, the Test Range or the Wooded Zero.** Their plates change via D5 and nothing
  else about them is touched.

## Tasks

| # | Task | Status | Then | Commit | Note |
|---|---|---|---|---|---|
| T1 | Plate material: metalness 0, roughness 0.45 | completed | **owner stop** | commit | |
| T2 | Backer panel goes bright orange | completed | **owner stop** | commit | |
| T3 | ELR light rig + warm sky/fog colour | completed | **owner stop** | commit + push | Material alteration 2026-08-19: FOG_DENSITY lowered 1.7e-4 → 1.19e-4 (−30%, owner call after seeing the rig on device); D10 amended from a fixed value to a ceiling. |
| T4 | Close out | completed | **owner stop** | commit + push | Filed `Bug-Flaky-Timeout-In-Base-Layer-Compositing-Test`; 1 untriaged ticket in `Design/Tickets/` at close-out. Plan archived; source exploration left live. |

**T1 — Plate material**

- **Files:** `GameBuild/app/src/range/plate-surface.ts` (edit),
  `GameBuild/app/src/range/plate-surface.test.ts` (edit)
- **Done when:**
  - `plate-surface.ts:210` reads `metalness: 0, roughness: 0.45`, with the dielectric comment.
  - `plate-surface.test.ts` has a new case asserting `material.metalness === 0` and
    `material.roughness === 0.45` on the result of `createPlateMaterial` — follow the existing pattern at
    `plate-surface.test.ts:242-243` (`const surface = createPlateSurface([0xf0f0ea]); const material = createPlateMaterial(surface.texture);`).
  - `npx vitest run` green, `npx tsc --noEmit` clean, `npm run build` succeeds.
- **Do not:** touch `onBeforeCompile`, the shader anchor guard at `:214`, or `customProgramCacheKey` at
  `:242`. Do not add a per-range parameter (D5). Do not change `PLATE_HEX`.
- **Verification handle** — `permanent`:
  - **Where:** ELR Range, high line, the 2000 m station. Then Range A, any plate.
  - **Positive:** the ELR plate face reads as bright as the white distance sign directly above it (D1).
    On Range A the plates brighten by the same visible step — that is D5 working, not a bug.
  - **Negative:** the **distance sign itself must look identical** to before. It is unlit
    (`ELRRangeScene.ts:359`), so nothing in this task can reach it; if the sign moved too, something
    other than the plate material changed.
  - **Reads:** `createPlateMaterial` in `GameBuild/app/src/range/plate-surface.ts` — every plate on
    every range is drawn with the material it returns.

```
ELR-Lighting-And-Plate-Materials T1: drop plate metalness to 0, roughness to 0.45

- A painted plate is a dielectric, and with no environment map the 30% routed
  into specular reflected nothing — it was pure loss on every range.
- Affects all four ranges through the shared createPlateMaterial (ADR 0001).
```

**T2 — Backer panel goes bright orange**

- **Files:** `GameBuild/app/src/range/elr-range-config.ts` (edit),
  `GameBuild/app/src/range/ELRRangeScene.ts` (edit)
- **Done when:**
  - `elr-range-config.ts:103` reads `export const PANEL_HEX = 0xff7a1a;`.
  - The doc comment at `ELRRangeScene.ts:229-236` no longer claims the panel is dark or cites
    `plan §4.2 / D4`, and states the current reason (D11).
  - `npx vitest run` green, `npx tsc --noEmit` clean, `npm run build` succeeds.
- **Do not:** change `PLATE_HEX`, `RING_HEX`, `POST_HEX`, or the panel material's `roughness: 0.95` at
  `ELRRangeScene.ts:239`. Do not add a panel to the low line.
- **Verification handle** — `permanent`:
  - **Where:** ELR Range, high line, stations at 250 m and 2000 m.
  - **Positive:** a bright orange backer panel behind each high-line plate, findable at 2000 m against
    the fog. Expect it to render duller than the authored `0xff7a1a` — the panel is a lit
    `MeshStandardMaterial`, so the same angle losses apply, then ~11 % haze at 2000 m.
  - **Negative:** the **low line shows no orange anywhere.** Low-line stations use Range A's hanging
    rack with nothing behind the plate (`ELRRangeScene.ts:232-233`); orange appearing there means the
    panel was attached to the wrong mount.
  - **Reads:** `PANEL_HEX` from `elr-range-config.ts:103`, consumed at `ELRRangeScene.ts:239`
    (`new THREE.MeshStandardMaterial({ color: PANEL_HEX, roughness: 0.95 })`).

```
ELR-Lighting-And-Plate-Materials T2: make the ELR backer panel bright orange

- 0x2a2a28 -> 0xff7a1a so the board is findable through fog at 2000 m; the
  panel's job (contrast behind a light plate) is unchanged, only its colour.
- Rewrites the comment that justified the dark panel.
```

**T3 — ELR light rig and warm sky/fog colour**

- **Files:** `GameBuild/app/src/range/ELRRangeScene.ts` (edit),
  `GameBuild/app/src/range/elr-range-config.ts` (edit),
  `GameBuild/app/src/range/elr-range-config.test.ts` (edit)
- **Done when:**
  - `addLights()` reads its five colour/intensity values from `WOODED_ZERO_ENVIRONMENT.lighting` and
    positions the sun via `sunDirection(WOODED_ZERO_ENVIRONMENT)` × `SUN_DISTANCE_M`; no light value is
    written as a literal in `ELRRangeScene.ts`.
  - No `castShadow` is set and `sun.shadow` is not touched; `readonly usesShadows = false` at
    `ELRRangeScene.ts:83` is unchanged.
  - `elr-range-config.ts:235` reads `export const SKY_HEX = 0xe6dcc8;` and
    `:234` reads `export const FOG_DENSITY = 1.19e-4;` (amended D10, 2026-08-19).
  - A new case in `elr-range-config.test.ts` asserts `sunDirection(WOODED_ZERO_ENVIRONMENT)` scaled by
    400 gives `(-299.3, 162.7, 209.6)` to 1 decimal place — the mechanical check that the 24° rig is
    actually in effect.
  - `npx vitest run` green, `npx tsc --noEmit` clean, `npm run build` succeeds.
- **Do not:** call `buildLighting()` (D8). Do not change `GROUND_HEX` or any grass/tree
  constant. Do not enable `renderer.shadowMap` anywhere. Do not raise `FOG_DENSITY` anywhere near the
  shared rig's `7.45e-4` — D10's 89 %-haze ceiling still stands.
- **Verification handle** — `permanent`:
  - **Where:** ELR Range, high line — the sky and open ground at ~100–800 m, then the 2000 m station.
  - **Positive:** sky and fog read warm cream rather than cold blue-grey, and the **ground and trees are
    clearly brighter** with shadows raking from a visibly higher sun. The plate should look about the
    same as it did after T1 — the rig is roughly neutral on vertical surfaces (see Context); that is
    expected, not a failure. The 2000 m gong should read with noticeably less haze than before this task
    (owner call: 30 % lower density, ~11 % → ~5.5 %).
  - **Negative:** the **2000 m gong must not lose the range's whole job to haze.** `FOG_DENSITY` stays
    far below the shared rig's `7.45e-4` (D10's ceiling); if the far gong reads anywhere near as hazy as
    the shared-rig density would produce, `FOG_DENSITY` drifted toward that ceiling, which D10 forbids.
  - **Reads:** `WOODED_ZERO_ENVIRONMENT.lighting` (`wooded-zero-environment.ts:109-117`) and
    `sunDirection` (`environment-config.ts:202`), both consumed by `addLights()` in
    `GameBuild/app/src/range/ELRRangeScene.ts`; plus `SKY_HEX` and `FOG_DENSITY` at
    `elr-range-config.ts:234-235`.

```
ELR-Lighting-And-Plate-Materials T3: put ELR on the shared light rig

- Sun 14 -> 24 deg and 1.25 -> 1.6, hemi to the shared 0.75, read from
  WOODED_ZERO_ENVIRONMENT.lighting rather than copied in; ELR never received
  the owner's 2026-07-26 sun correction.
- Sky and fog colour to warm cream 0xe6dcc8.
- FOG_DENSITY 1.7e-4 -> 1.19e-4 (-30%, owner call after seeing the rig on
  device): ~11% -> ~5.5% haze at 2000 m. D10 amended: the value is now a
  tuned dial, capped well below the shared rig's 7.45e-4 (89% haze ceiling).
```

**T4 — Close out**

- **Files:** `Design/Plans/ELR-Lighting-And-Plate-Materials.md` (edit)
- **Done when:**
  - **No temporary handles to delete** — all three are permanent observations of shipped state, and
    this plan added no scaffolding.
  - Every item in this plan's **Deferred** section has a ticket in `Design/Tickets/` with
    `Status: untriaged`.
  - The untriaged ticket count in `Design/Tickets/` is reported as one line.
  - `commit + push` with the message below.
  - Archive per the archive routine in `Design/Execution-Protocol.md`: **this plan only.**
    **Do not archive the exploration `ELR-Range-Dressing-And-Scatter-Targets`** — this plan implements
    4 of its 19 implementation decisions, and the terrain, horizon, mud and scatter-steel decisions are
    still live and needed by a later plan. Archiving it would strand them in a document that no longer
    carries authority. Catalog line form: `executed`.

```
ELR-Lighting-And-Plate-Materials T4: close out

- Archives the plan. The source exploration stays live: its terrain, horizon,
  mud and scatter-steel decisions are unbuilt and belong to a later plan.
```

## Deferred

- **Flaky timeout in `plate-surface.test.ts`'s base-layer compositing suite**, hit once during T3's
  gates on a file untouched by that task's change; passed in isolation and with
  `--no-file-parallelism`. Filed as `Bug-Flaky-Timeout-In-Base-Layer-Compositing-Test`, `Status:
  untriaged`.
