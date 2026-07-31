# Wind system — port the BTK flag/sock renderers and the BTK mirage

**Plan slug:** `wind-system-btk-port`
**Status:** COMPLETE and ARCHIVED — all seven tasks (W1–W7) done, every
owner-verification stop passed on device, 2026-07-31; moved to `Design/archive/` the
same day. Kept for provenance (the locked D1–D9 decisions, the P1–P22 pitfall register,
and the reasoning behind them), **not as a live spec** —
[`../feature-catalog.md`](../feature-catalog.md) §B ("Wind-reading renderers") and the
"Wind system" rows in [`../execution/PROGRESS.md`](../execution/PROGRESS.md) are the
authoritative record of what shipped, including four rounds of on-device tuning beyond
what this plan originally specified (drift rate, wind-fade ceiling, and an ELR-specific
elevation-falloff retune the plan didn't anticipate).
**Audience:** a coding agent / junior programmer working alone. Read
[`../execution/execution-protocol.md`](../execution/execution-protocol.md) §2b–2d and §5
first — this plan declares its own pause points and commit points, and they are binding.

---

## 1. Why this plan exists

Two complaints, one subsystem.

1. **The flags and socks look bad.** The current markers (task 1.7b) are flat unlit
   `MeshBasicMaterial` primitives — a 0.5 m rectangle and a smooth cone — animated by a
   CPU sine ripple. BallisticsToolkit already ships a far better pair: a GPU vertex-shader
   flag with wind-driven pitch, quadratic bend, travelling flutter and a *furl* (the cloth
   rolls about its own length axis so it reads as a 3D form), and a proper windsock —
   tapered open tube on two visible strings, rigid-body oriented, smoothed, with a wind-scaled
   sway. Both are lit, textured and shadow-casting.

2. **Mirage was built and parked.** Task 1.7c shipped a deliberate *single-layer*
   simplification of BTK's mirage. After three on-device iterations the owner turned it off
   (1.7d): *"it's adding a bubbling to the view but it's really not discernable if there's a
   direction to it at all."* The two bugs found then (heat-rise ratio, linear→sRGB) were real
   and are still fixed in the code. What was never built is everything that makes BTK's
   version read as **air at a distance** rather than a screen filter: three depth-layered
   slabs at different apparent scales, per-layer wind smoothing and fade, world-anchoring to
   where the sight line actually lands, and an elevation falloff that keeps the boil near the
   deck. That omission — not the two bugs — is the most likely reason direction never read.

This plan replaces both, faithfully, from the BTK sources.

---

## 2. Locked decisions

Owner-locked 2026-07-31 unless marked otherwise.

| # | Decision |
|---|---|
| **D1** | **Marker geometry uses BTK's dimensions verbatim.** Copy `WIND_FLAG_CONFIG` / `WIND_SOCK_CONFIG` (`BallisticsToolkit/web/steel-sim/config.js` L194–243) as-is: 3 yd pole, 2 yd flag tapering 18″→6″, 1.1 yd sock on a 0.14 yd string. Consequence: poles grow 2.2 m → 2.74 m and flags reach 1.83 m out, so the 9-yd lateral offset and its occlusion regression test must be **re-solved, not assumed** (see P11). |
| **D2** | **Mirage is a full faithful port, replacing the current one wholesale.** `scope/Mirage.ts` and `game/mirage-model.ts` are rewritten, not extended: 3 slabs, per-layer EMA wind + fade, world-anchored offsets from the aim ray, elevation falloff, chromatic tint. The incremental approach is what failed in 1.7c. |
| **D3** | **Mirage strength is a 4-way control: Off / Light / Medium / Heavy**, replacing today's on/off toggle in Settings. `Off` still skips the post-process pass entirely (the cheap path). |
| **D4** | **ELR marker placement is in scope.** The ELR Range gets its own marker ladder down its lane, planted on the sloped terrain. |
| **D5** *(plan author's call)* | **The pole is factored out of both renderers.** Both BTK factories build their own pole `InstancedMesh`; naively porting both would give two poles per marker under the `both` style. The game's marker root owns exactly one pole; the flag and sock renderers only contribute cloth. |
| **D6** *(plan author's call)* | **Angle and direction are computed on the CPU, not in the shader.** BTK recomputes the wind→angle response twice inside the vertex shader (once for position, once for normals). With ≤8 markers per range the CPU cost is nil, and moving it out means the response curve lives once, in a pure tested module, and can be smoothed. The shader receives `instanceAngleRad` + `instanceDirRad` + `instanceWavePhase` instead of `instanceWindVector`. This is a deliberate deviation from BTK — say so in the file header. |
| **D7** *(plan author's call)* | **Flags get the sock's smoothing.** BTK's flags snap instantly to the sampled wind (the config declares `flagAngleInterpolationSpeed` / `flagDirectionInterpolationSpeed` and the shader path never uses them). The game's curl-noise field is noisy sample-to-sample — the current renderer smooths yaw for exactly this reason. Apply the sock's constants (30 deg/s, 1 rad/s) to both. |
| **D8** *(plan author's call)* | **The mirage module works internally in yards and mph**, converting once at its seam. Every BTK constant then transfers verbatim with no re-derivation. See P13 — this is the single highest-risk item in the plan. |
| **D9** *(plan author's call)* | **`mirageStrength` stays store-only, not persisted**, and resets to `off` each launch — preserving the intent of the existing `state.test.ts` assertion. Flipping the shipped default to `light` is a separate owner call at W7, after they have seen it. |

---

## 3. Source map — read these before writing anything

**BTK originals** (MIT, local-only, git-ignored — see P22 on how to use them):

| File | What to take |
|---|---|
| `BallisticsToolkit/web/steel-sim/WindFlag.js` | `WindFlagFactory` (L~430 onward) — the *evolved* version: quadratic bend, furl, derivative-based normals. The single-flag `WindFlag` class above it is the older, flatter shader; **do not port that one.** |
| `BallisticsToolkit/web/steel-sim/WindSock.js` | `WindSockFactory` in full — geometry, banded texture, rigid-body quaternion, smoothing, sway, strings. |
| `BallisticsToolkit/web/steel-sim/config.js` L194–243 | `WIND_FLAG_CONFIG`, `WIND_SOCK_CONFIG`. Note these are already SI metres (built through `Conversions.yardsToMeters`), but the *response* curves take mph. |
| `BallisticsToolkit/web/fclass-sim/rendering/mirage.js` | `MirageEffect` in full, including its long tuning-constant commentary — that commentary is the design rationale and most of it should survive into the port. |
| `BallisticsToolkit/web/fclass-sim/rendering/scope.js` L969–1040 | How BTK composes the mirage pass, and what `intersection` / `viewPitch` are. |
| `BallisticsToolkit/web/fclass-sim/core/btk.js` L92–135 | `btkWindToThreeJs` / `sampleWindAtThreeJsPosition` — **this is where the yards + mph convention enters.** |

**Game files this plan touches:**

| File | Fate |
|---|---|
| `GameBuild/app/src/scope/WindMarkers.ts` | rewritten (W2, W3) |
| `GameBuild/app/src/game/wind-marker-model.ts` | rewritten — BTK's response curve + smoothing (W2) |
| `GameBuild/app/src/range/wind-markers-config.ts` | rewritten — per-range ladders, ground height (W1) |
| `GameBuild/app/src/range/wind-markers-config.test.ts` | re-solved offsets, new ELR cases (W1) |
| `GameBuild/app/src/range/ranges.ts` | `windMarkers: boolean` → a marker-set identifier (W1) |
| `GameBuild/app/src/scope/Mirage.ts` | rewritten wholesale (W5) |
| `GameBuild/app/src/game/mirage-model.ts` | rewritten wholesale (W4) |
| `GameBuild/app/src/scope/ScopeView.tsx` | marker set + aim-ray/view-pitch wiring (W1, W5) |
| `GameBuild/app/src/shell/SettingsScreen.tsx` | Off/Light/Medium/Heavy (W6) |
| `GameBuild/app/src/state/store.ts`, `state/state.test.ts` | `mirageEnabled` → `mirageStrength` (W6) |

**Engine is untouched by this entire plan.** `ctest` and `GameBuild/validation/run.mjs`
are therefore N/A at every gate — record them as N/A, do not silently skip them (§5).

---

## 4. Pitfall register

This is the part worth reading twice. Each entry is a real trap found while reading the two
codebases side by side, not a general caution.

### Flags and socks

**P1 — The wind-vector sign looks wrong and is not.**
BTK's shader does `windZ = -uWindVector.z`, then `windDir = atan2(windZ, windX)`, then emits a
horizontal direction of `(cosDir, −sinDir)`. Substituting, that is `(wx, wz)/|w|` — the flag
points *along* the wind velocity vector. The two negations cancel. The game's existing
`yawFromWind` = `atan2(x, z)` points local +Z along the same `(x, z)`. **Both are already
correct and agree.** If you port half of BTK's expression, or "tidy up" the stray minus, you
will get a flag that is 180° wrong in the head/tail axis only — which is exactly the error a
player cannot see on a pure crosswind and will be bitten by later.
*Guard:* a unit test on the pure model. `windToVec(5, 270)` (wind *from* 9 o'clock) is
`{x:+5, z:0}`; the flag's tip must displace toward **+x**. `windToVec(5, 0)` (headwind, from
12) is `{x:0, z:+5}`; the tip must displace toward **+z**, i.e. back toward the shooter.

**P2 — Metres vs mph inside the response curve.**
`WIND_FLAG_CONFIG`'s *dimensions* are SI metres, but `flagAngleFlatSpeed: 20.0` and
`sockAngleFlatSpeed: 20.0` are **mph**, and BTK converts with `windSpeedMph = windSpeed * 2.237`
at the sample site. The game's `windAt` hands you m/s. Do the conversion **once**, inside the
pure model, and pin it with a test (`20 mph ⇒ fully horizontal`, `0 ⇒ minAngle`). Do not
sprinkle `* 2.237` through the renderer.

**P3 — Two poles under the `both` style.** See D5. Both BTK factories call
`createInstancedPoles`. Strip pole creation out of both ports; the marker root owns the pole.

**P4 — Unlit → lit is a real visual change.** Today's markers are `MeshBasicMaterial` (flat
colour, no lighting). BTK's are `MeshStandardMaterial` with `castShadow`/`receiveShadow`.
Every game scene does have a `HemisphereLight` + `DirectionalLight`, so this works — but
(a) the flag will now be shaded and may read dark when backlit against sky, (b) `castShadow`
only does anything on scenes where ScopeView sets `renderer.shadowMap.enabled` (the
`wantsShadows` branch), and (c) **do not drop BTK's custom `beginnormal_vertex` block.** That
block recomputes the normal from finite differences of the deformed position; without it the
cloth lights as if it were still a flat undeformed plane and the furl disappears visually
even though the geometry moved.

**P5 — Markers are planted at y = 0, and the ELR range is a hill.**
`WindMarkers.buildMarker` does `root.position.set(spec.xOffsetM, 0, -spec.distanceM)`. Range A
and the Test Range are flat, so this has always worked. The ELR range's ground is
`groundY(r) = 200·(r/3000)²` — **4.6 m above datum at 457 m.** Specs need a ground height, and
the ELR ladder must supply it from `elr-range-config.groundY`.

**P6 — There is a live ELR bug to fix on the way past.** In `ScopeView.tsx` the `laneLenM`
used to filter markers has no `elr-range` branch, so it falls through to
`RANGE_A_GROUND.laneLengthM`. Combined with P5, the ELR range today plants the Range-A
100–500 yd ladder at datum height, i.e. **buried up to the flag in the hillside.** W1 removes
this by moving marker sets onto the range definition.

**P7 — Shader-deformed geometry breaks frustum culling.** Three computes the bounding sphere
from the *undeformed* vertex positions; a flag that the shader swings 1.8 m downwind will pop
out of view near the screen edge at high zoom. BTK handles this two different ways and you
need both: the flag `InstancedMesh` gets an **explicit** `geometry.boundingSphere` sized to the
flag's maximum 3D extent × 1.1, and the sock mesh (whose matrices are computed on the CPU each
frame) gets `frustumCulled = false`. Copy both, including the reasoning comments.

**P8 — Instance attributes need `needsUpdate` every frame, and disposal on style rebuild.**
`updateWindMarkers` rebuilds the whole marker set when the style changes; make sure the old
geometry, its `InstancedBufferAttribute`s, materials and canvas textures are disposed
(`material.map?.dispose()` — the current `disposeMarker` does not dispose textures because
today's materials have none).

**P9 — Do not duplicate the response formula into GLSL.** See D6. If you port BTK's shader
verbatim you will have the angle curve written three times (JS comment, `begin_vertex`,
`beginnormal_vertex`) and no way to unit-test any of them.

**P10 — Keep the smoothing.** See D7. Removing it to "match BTK" will make the flags jitter
on the curl-noise field.

**P11 — The occlusion regression test is load-bearing and its constants are now wrong.**
`wind-markers-config.test.ts` pins that no marker sits on or occludes a plate bearing, using
`MARKER_RADIUS_M = 0.15`. Under D1 the pole is 2.74 m tall and the flag reaches 1.83 m
downwind of it, so the swept radius is more like **2.0 m**. The 9-yd offset must be
**re-solved** the way 1.7b solved it (a throwaway Node script brute-forcing candidate offsets
against the real rack geometry, run from the outputs scratchpad — *never* leave scratch files
inside `GameBuild/`, see the 1.7b PROGRESS note), then pinned by the updated test.

**P12 — First-mount shader compile.** Both ports compile a `MeshStandardMaterial` variant at
scene init. Expect a one-off hitch entering the scope on device; it is acceptable (BTK does the
same) but mention it in the owner-check note so it is not reported as a bug.

### Mirage

**P13 — Yards and mph. This is the one that will break the port.**
`fclass-sim`'s mirage is written **entirely in yards and mph**. `sampleWindAtThreeJsPosition`
converts positions yd→m to sample and returns wind in **mph**; `HEAT_RISE_SPEED = 1.0` is
**yd/s**; `MPH_TO_YARDS_PER_SEC = 0.4889`; `NOISE_FREQ_X/Y/Z` are **1/yd**;
`WIND_FADE_SPEED_MPH = 15`. The game is SI end to end. Copying the constants against metre
positions and m/s wind silently rescales feature size by 1.094× and wind advection by 2.24× —
the pattern will look plausible and drift at the wrong speed, which is precisely the failure
mode that is hard to diagnose by eye.
*Per D8:* convert at the module seam (positions m→yd on the way in, wind m/s→mph on the way
in), keep every BTK constant verbatim, and state the convention in the first paragraph of the
file header. Add a unit test that a 10 mph pure crosswind produces the expected yards of drift
after 1 s.

**P14 — Keep `linearToSRGB` in the final pass.** BTK does not need it because its mirage pass
writes into *another* render target which a later scope pass encodes. The game's pass writes
straight to the default framebuffer, so a bespoke `ShaderMaterial` gets no automatic
`colorspace_fragment` encode. Deleting the existing `linearToSRGB()` reintroduces the
"like I'm wearing sunglasses" darkening the owner reported 2026-07-15. **Do not** try to fix it
by setting `renderer.outputColorSpace` instead — that would double-encode the non-mirage path.

**P15 — The mirage pass silently kills antialiasing.** The canvas is created with
`antialias: true`, but a plain `WebGLRenderTarget` is single-sampled: the moment mirage turns
on, every plate and pole edge gets jaggier. That reads to a player as "the picture got worse"
and is easily mistaken for the shimmer itself. Create the target with `samples: 4` (WebGL2,
fine on iPad Safari). `samples` and `RESOLUTION_SCALE` are the **two perf levers** — pull
`RESOLUTION_SCALE` first if frame time suffers, and read the result off the existing
`RenderCostMeter`, which already brackets the render call.

**P16 — World anchoring is the missing feature, not a detail.** Today `viewScale` is pinned at
a fixed 150 m and the noise offsets never move with the aim, so the pattern is glued to the
screen. BTK anchors each slab at `intersection.{x,y,z} × t` and scales it by
`intersection.distance × t × tan(fov/2) × 2` — so panning and zooming move the viewport
*through* a world-fixed field, and near slabs show big soft blobs while far ones stay crisp.
That parallax is most of what sells it as air. You need an aim-ray intersection: reuse
`findAimed()` / `findAimedTarget()` for the aimed target's distance when there is one, else the
range's lane length, and take `point = camera.position + dir × distance`.

**P17 — The elevation-falloff constants are geometry-specific, and BTK bakes them into the
shader string.** `ELEV_FULL_DEG = 0.08` / `ELEV_FALLOFF_DEG = 0.14` were tuned against a
1000 yd F-class frame; Range A's targets sit at 100–500 yd and subtend much more, and at close
range the sight line points slightly *down* (eye 1.6 m, plate centre ~1 m). Two required
changes: make both **uniforms** rather than `${...toFixed()}` literals so they can be tuned
live, and feed the real sight-line elevation (`asin(dir.y)`) as `viewPitch` rather than 0.
Expect to re-tune on device at W6.

**P18 — The base FOV differs.** BTK's `BASE_FOV = 30`; the game's `SCOPE_BASE_FOV_DEG = 24`.
`BASE_INTENSITY = 0.025` was eyeballed against a 30° base, so `zoomFactor = BASE_FOV / fov`
lands differently. Carry the constant over as a starting point, not a proven value, and say so
in the comment.

**P19 — BTK's layer sampler calls `Math.random()` every frame.** Each slab picks one random
depth inside its own range and mixes it into an EMA. That is fine — it is render-only — but
keep the random pick at the **renderer** seam and pass sample positions into the pure model, so
`game/mirage-model.ts` stays deterministic and testable, and nothing non-deterministic can drift
into anything the shot solve reads (§4.8 discipline).

**P20 — Per-layer normalization is not optional.** `perLayerNorm = baseIntensity / sqrt(Σmask²)`
keeps the summed 3-slab distortion at the same RMS a single layer produced. Skip it and the
port will be roughly √3 too strong, which will read as the same "too much bubbling" the owner
already rejected once.

**P21 — `mirageEnabled` is asserted in two places.** `state.test.ts` pins that it defaults
`false` and is absent from `settingsToSave`. Renaming to `mirageStrength` (D3/D9) breaks those
tests and `SettingsScreen.tsx`; update all three together in W6, preserving the intent
(default off, not persisted).

**P22 — On copying BTK source.** `BallisticsToolkit/` is MIT-licensed but **local-only and
git-ignored** — it is not in the app's module graph and is never pushed, so you *cannot*
`import` from it and must not try. Copying the source into `GameBuild/app/src/` with the MIT
attribution comment intact is the correct and already-established move (the 4D simplex noise in
today's `Mirage.ts` was copied exactly this way). The "port the approach, do not import" note in
the current file headers means *do not create a runtime dependency* — it does not mean
re-derive the maths from scratch.

---

## 5. Tasks

Each task states its **boundary** (checkpoint → keep going; owner-verification stop → halt) and
its **commit point**, per §2b/§2c. Mirror this list into the session task checklist (§2d) and
update `PROGRESS.md` at the end of every task regardless of outcome.

### W1 — Marker sets move onto the range definition; ELR ladder; ground height

*Pure config and data. No visual quality change yet, but markers move on the ELR range.*

- `wind-markers-config.ts`: `WindMarkerSpec` gains `groundYM: number`. Replace the single
  exported `WIND_MARKERS` with **named ladders**: `RANGE_A_WIND_MARKERS` (unchanged distances,
  `groundYM: 0`) and `ELR_WIND_MARKERS` (new — `groundYM` from `elr-range-config.groundY`).
- ELR ladder distances: propose **250 / 500 / 750 / 1000 / 1500 / 2000 m**, covering the high
  line's station ladder; confirm at the W1 stop that the near end is also useful from the low
  line. Lateral offset: start from the Range A value but **solve it** against the ELR gong
  frames from both firing points, don't assume it transfers.
- `ranges.ts`: `windMarkers: boolean` → `windMarkers: WindMarkerSetId | null`
  (`'range-a' | 'elr' | null`). Update all four range definitions.
- `ScopeView.tsx`: select the ladder from the range definition; **delete the `laneLenM`
  filter** and its fall-through (P6). Pass `groundYM` through to the renderer's root position.
- **Re-solve `MARKER_OFFSET_YARDS`** under D1's larger geometry (P11) with a scratch script run
  in the outputs directory.

**Tests:** update `wind-markers-config.test.ts` for the new radius and both ladders; add ELR
cases — every marker sits within the ELR ground strip, its `groundYM` equals `groundY(distance)`
to 9 dp, and no marker occludes any station's gong bearing from **either** firing point (reuse
the existing eye-ray projection technique). Update `test-range-config.test.ts`, which currently
imports `WIND_MARKERS` directly.

**Done when:** all four ranges compile against the new registry field, tests green, and the ELR
range's flags stand *on* the hillside rather than inside it.
**Boundary:** checkpoint — run the gates, record, keep going.
**Commit:** — (rolls into W2).

---

### W2 — Port the BTK flag renderer

- Rewrite `game/wind-marker-model.ts` as the pure response model: `markerAngleDeg(speedMph,
  {minAngle, maxAngle, flatSpeed, responseExp})` (the concave `min + span·clamp(v/flat,0,1)^exp`
  curve), `flapFrequencyHz(speedMph, base, scale)`, phase accumulation, and the existing
  `smoothYaw` plus a new `smoothAngle` (see D7). Keep `horizontalSpeed`; keep `yawFromWind`
  **and its convention comment** (P1).
- New `range/wind-marker-visual-config.ts` — BTK's `WIND_FLAG_CONFIG` / `WIND_SOCK_CONFIG`
  transcribed verbatim (D1), with the mph units of the response fields called out (P2).
- Rewrite the flag half of `scope/WindMarkers.ts` from `WindFlagFactory`: shared tapered
  geometry with the `segmentT` attribute, `InstancedMesh`, canvas red/yellow texture,
  `MeshStandardMaterial` + `onBeforeCompile` carrying `computeDeformedPosition` (quadratic
  bend, furl, travelling flutter) and the finite-difference normal block (P4). Per D6 the
  per-instance attributes are `instanceAngleRad`, `instanceDirRad`, `instanceWavePhase`.
  Set the explicit `boundingSphere` (P7).
- Pole stays with the marker root (D5). Keep the module-singleton
  `init/update/dispose` API and the lazy style rebuild; fix texture disposal (P8).

**Tests:** headless-three geometry tests in the style of `plate-outline-geometry.test.ts` —
vertex/index counts, `segmentT` runs 0→1, bounding sphere covers max extent. Pure-model tests:
the P1 direction cases (crosswind → +x, headwind → +z), 0 mph → `minAngle`, 20 mph →
`maxAngle`, monotonic between, `responseExp < 1` puts more travel in the low end, smoothing
converges and never overshoots at large `dt`.

**Done when:** flags on Range A and ELR are lit, furled, flutter with speed, point downwind,
and the shipped default style still renders on first entry.
**Boundary:** **owner-verification stop.** Owner check: enter Range A, set 3 mph then 15 mph
then 0, watch the flags at 100–500 yd (should be near-limp → half-lifted → horizontal and
rippling, with the cloth reading as a 3D form rather than a card); swing the wind through the
clock and confirm the head/tail cases point the right way; then the ELR range at 20× to confirm
the far flags are on the ground and still readable through the fog. Note the first-entry shader
hitch (P12) is expected.
**Commit:** `commit`

```
wind-system-btk-port W2: port BTK wind-flag renderer + per-range marker ladders

- Replaces the flat unlit flag with BTK's instanced vertex-shader cloth
  (quadratic bend, furl, flutter, derived normals) at BTK's own dimensions.
- Marker ladders move onto the range definition; adds an ELR ladder planted
  on the sloped terrain, fixing flags previously buried in the hillside.
```

---

### W3 — Port the BTK wind sock

- Port `WindSockFactory`: tapered open-ended tube geometry, orange/white banded canvas
  texture, `DoubleSide`, per-frame rigid-body quaternion from the smoothed angle/direction,
  the mouth hung one string-length off the anchor, and the two `LineSegments` strings with
  `raycast = () => {}` (BTK's comment explains why: the raycaster's ~1 m line threshold would
  otherwise steal the rangefinder pick at distance — the game's `findAimed` has the same
  exposure). `frustumCulled = false` (P7).
- Pole comes from the marker root (D5). Under the `both` style, flag at the pole top and sock
  mounted lower, as today.
- Prime the first frame (BTK's `updateTransforms(0, null)`) so nothing pops at the origin.

**Tests:** headless-three — sock axis points straight down at 0 mph and horizontally downwind at
20 mph; string endpoints land on the mouth rim; `both` builds one pole and two cloth meshes per
marker. Pure model: sway amplitude scales with wind and is zero when calm.

**Done when:** all three styles render correctly and switching between them at runtime leaves no
orphaned meshes (check the marker count after several switches).
**Boundary:** **owner-verification stop.** Owner check: Settings → marker style through
Flag / Sock / Both on Range A at three wind speeds; confirm the sock's head/tail read (pointing
at or away from you) is easier than the flag's, since that is the whole reason it exists.
**Commit:** `commit + push`

```
wind-system-btk-port W3: port BTK wind sock

- Tapered open tube on two visible strings, rigid-body oriented with smoothed
  angle/direction and a wind-scaled sway; strings excluded from raycasts.
- Single shared pole per marker so the 'both' style no longer doubles it.
```

---

### W4 — Mirage: the pure layered model

*No rendering change lands in this task. It ends at a checkpoint, so it does not need its own
owner-visible artefact — but leave the old renderer working and untouched until W5.*

- Rewrite `game/mirage-model.ts` around BTK's layered atmosphere, **in yards and mph** (D8/P13),
  with the conversion helpers at the boundary:
  - `LAYER_FRACS = [0.5, 0.8, 1.0]`, per-layer state `{smoothedWind, accumulatedDrift}`.
  - `advanceLayer(state, sampleMph, dtSec)` → EMA at `alpha = 0.01`, drift accumulation
    (`cross`, `vertical + HEAT_RISE_SPEED`, `head`).
  - `layerFade(smoothedWindMph)` → `clamp(1 − |horiz| / 15, 0, 1)`.
  - `perLayerNorm(baseIntensity, mask)` → `base / sqrt(Σmask²)` (P20).
  - `zoomIntensity(fovDeg, baseFovDeg)` with the `ZOOM_INTENSITY_CAP = 2.0` clamp (P18).
  - `layerScale(distanceYd, frac, fovDeg)` and `layerAnchor(intersectionYd, frac)` (P16).
  - Sample **positions** are computed here; the random depth pick stays in the renderer (P19).
- Keep the `DEBUG_LAYER_MASK` concept as a parameter, not a constant, so W6 can isolate a slab.

**Tests:** the 10 mph crosswind → yards-of-drift-per-second case (P13); dead calm advances only
the vertical drift; EMA converges to a constant input; fade hits 0 at 15 mph and 1 at calm;
normalization keeps summed RMS constant as the active-layer count changes; zoom intensity is
monotonic and capped.
**Boundary:** checkpoint.
**Commit:** —

---

### W5 — Mirage: renderer rewrite and ScopeView wiring

- Rewrite `scope/Mirage.ts` from `MirageEffect`: the 3-layer uniform arrays
  (`layerOffsets`, `layerScales`, `layerDrifts`, `layerIntensities`), the elevation-falloff
  block with `ELEV_FULL_DEG` / `ELEV_FALLOFF_DEG` as **uniforms** (P17), and the chromatic tint.
  Keep the existing verbatim 4D simplex GLSL and its MIT attribution. **Keep `linearToSRGB`
  on the final write (P14).** Create the render target with `samples: 4` (P15).
- `ScopeView.tsx`: compute the aim-ray intersection (aimed target distance, else lane length)
  and `viewPitch = asin(dir.y)`, and sample the wind at each slab's random depth via the
  existing `windAtForMarkers` (P16, P19).
- Delete the single-layer leftovers: `MIRAGE_REFERENCE_DISTANCE_M` and its fixed −150 m sample.

**Tests:** what is testable without WebGL — the uniform-packing function (given a mock
intersection, FOV and layer states, the four arrays hold the expected values); the aim-ray
intersection helper (aimed target vs. fallback); `viewPitch` sign (looking down at a near plate
gives a negative pitch). Everything visual is the owner's call.

**Done when:** mirage renders three decorrelated layers, the pattern moves through the world as
you pan and zoom, it fades out above the target, and the frame-time readout at the current
strength is on record.
**Boundary:** **owner-verification stop.** Owner check, with strength temporarily forced on:
at 300 yd on Range A, 0 mph → the boil rises near-vertically in place; 10 mph full-value
crosswind → it leans and runs across; pan up off the target → the shimmer thins out into the
sky rather than cutting off at a line; zoom 5× → 20× → features get stronger but do not tear;
check the perf panel's render cost with mirage on vs off, and confirm edges are not visibly
jaggier than with it off (P15).
**Commit:** `commit`

```
wind-system-btk-port W5: port BTK layered mirage

- Three depth-layered slabs with per-layer wind EMA, fade and world-anchored
  offsets from the aim ray; adds elevation falloff and chromatic tint.
- Replaces the single fixed-depth layer that never read as directional; keeps
  the sRGB encode on the final pass and restores MSAA via a multisampled target.
```

---

### W6 — Off / Light / Medium / Heavy, and the tuning pass

- `state/store.ts`: `mirageEnabled: boolean` → `mirageStrength: 'off' | 'light' | 'medium' | 'heavy'`,
  store-only, default `'off'` (D9). Update `setMirageEnabled` → `setMirageStrength` and the two
  `state.test.ts` assertions (P21).
- `SettingsScreen.tsx`: 4-way segmented control replacing the on/off pair.
- `ScopeView.tsx`: `'off'` keeps the existing straight `renderer.render` path; the other three
  map to BTK's `intensityScale` (1.0 medium; light/heavy either side).
- **Tuning pass.** Expect at least one on-device round on: the three strength multipliers, the
  two elevation-falloff uniforms (P17), `BASE_INTENSITY` against the game's 24° base FOV (P18),
  and — if frame time needs it — `RESOLUTION_SCALE` then `samples` (P15). Use the debug layer
  mask from W4 to check each slab in isolation if a layer looks wrong.

**Boundary:** **owner-verification stop.** Owner check: walk all four strengths on Range A and
the ELR range; decide whether the shipped default moves off `'off'` (D9 leaves that call here).
**Commit:** `commit`

---

### W7 — Close-out

- `Design/feature-catalog.md`: flip the flag/sock and mirage entries to built-with-date, noting
  what changed; log any deferred follow-up (see §7).
- `Design/execution/PROGRESS.md`: final rows for W1–W7 with gate numbers.
- Delete `MIRAGE_REFERENCE_DISTANCE_M` references from any comment that survived W5, and grep
  for stale mentions of the single-layer design.

**Boundary:** plan complete.
**Commit:** `commit + push`

```
wind-system-btk-port W7: close out wind-system port

- Mirage strength control (off/light/medium/heavy) and the on-device tuning pass.
- Feature catalog and PROGRESS updated for the flag/sock and mirage rebuilds.
```

---

## 6. Gates

From `GameBuild/app/`, before marking any task done, in this order:

```
npx vitest run
npx tsc --noEmit
npm run build
```

All three green. `ctest` and `node GameBuild/validation/run.mjs` are **N/A for every task in
this plan** (no engine source is touched) — record them as N/A in `PROGRESS.md`, do not omit
them. Never offer a commit on a red gate.

Additional per-task checks worth recording: the precache entry count from the build (expect it
**unchanged** — this plan adds no assets; both textures are generated on a canvas at runtime),
and the test count.

---

## 7. Explicitly out of scope

- Any change to the ballistics wind field itself (`engine-bridge/wind-field.ts`,
  `game/wind-superposition.ts`, the curl-noise preset list). This plan is renderers only; what
  the bullet experiences does not change.
- Mirage as a *readable instrument* — BTK's `getSmoothedWindVector()` exposes the target-layer
  wind for a HUD readout. Porting the effect makes that possible; wiring it to a wind-call
  mechanic is a separate design question.
- Wind markers on the Test Range and the Wooded Zero Range (deliberately off — see
  `ranges.ts`).
- Marker LOD or count scaling; six ELR markers is well inside budget.

## 8. If it still does not read

If, after W5 and a tuning round, the mirage's direction still is not legible on device, the
next thing to try is **more layers, not more intensity** — `LAYER_FRACS` is a plain array and
the shader loops over `NUM_LAYERS`. Five slabs at `[0.3, 0.5, 0.7, 0.85, 1.0]` costs four extra
noise samples per pixel; measure it on the perf panel before and after. Do not respond by
raising `BASE_INTENSITY`, which is what produced the "too much bubbling" verdict in 1.7c.
