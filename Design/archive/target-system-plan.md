# Reactive Target System — plan

**Status:** COMPLETE and ARCHIVED — approved and delivered 2026-07-30/31; moved to
`Design/archive/` on 2026-07-31. All 16 tasks done, every device check passed. Kept
for provenance (the locked decisions and the reasoning behind them), **not as a live
spec** — [`../feature-catalog.md`](../feature-catalog.md) §F and the "Target system"
rows in [`../execution/PROGRESS.md`](../execution/PROGRESS.md) are the authoritative
record of what shipped.

⚠ **Its execution rules are out of date.** This plan was written and run under the
protocol rules in force at the time — *each task stops for owner confirmation*
(§2.8) and a *hard ~400-line / ~10-file size limit* (§3). Both were retired on
2026-07-31: plans now declare their own pause points, and size is planning guidance
only. See [`../execution/execution-protocol.md`](../execution/execution-protocol.md)
§2b. Read the per-task stop language below as history, not instruction.

Builds the three-axis target abstraction (Target × Mount × Group) that
[`../feature-catalog.md`](../feature-catalog.md) §F needs for the "steel target menagerie"
and "human silhouettes + IDPA zone scoring" entries, both currently *Not built*. Proved out
on the Test Range, which `range/ranges.ts` charters as "the permanent proving ground for new
target types". Target specs of record: `Documentation/Targets/idpa-target.svg` and
`idpa-popper.svg`.

## Context

The owner wants to build several reactive targets, proved out on the Test Range. The
working assumption going in was that targets — like environmentals — are "created,
saved as their own file, and imported/placed around scenes." **That is not how the
codebase works today.**

What actually exists:

- **No target catalog, registry, or file format.** Every target is a hand-written TS
  constant inside its own range's config module: `TEST_RANGE_GONG` is a 12-line
  `as const` (`range/test-range-config.ts:9`); Range A builds racks from
  distance-keyed lookup tables (`range-a-config.ts`); ELR *solves* its station
  layout at runtime against the generated tree field (`elr-range-config.ts:290`).
- **Environmentals are the same** — `EnvironmentConfig` objects written inline in a
  range config (`test-range-config.ts:69`), handed once to `buildEnvironment(scene, cfg)`.
  Config-driven and reusable, but code, not data: nothing is saved, exported, or
  placed at runtime.
- The only true data files are `game/catalog.data.json` / `loads.data.json` (gear),
  read through typed loaders (`game/catalog.ts`).

So the *shape* the owner described is right and is the pattern `range/environment/`
already proved — it just doesn't exist for targets. Three hard constraints govern the
work:

1. **All steel geometry is one round disc** (`plate-geometry.ts`). The C++
   `btk::rendering::SteelTarget` already supports rectangular plates for mass/inertia;
   the TS bridge hardcodes `const isOval = true` (`engine-bridge/steel-target.ts:138`).
2. **Hit testing is circle-only and binary** — `discHit()` inside `resolveShot()`
   (`game/shot.ts:131`). The engine's own intersect/score path is deliberately unused.
3. **The reaction lifecycle lives inside `scope/ScopeView.tsx`** (2461 lines), split
   across four regions: the two maps (635–644), create/strike (1068–1134), the
   per-frame step/pose/chain loop (1648–1680), teardown (1747–1751). The only
   reaction-mode switch that exists is `PlateInstance.swings`.

The Test Range is chartered for exactly this — `ranges.ts:137` calls it "the permanent
proving ground for new target types."

**Intended outcome:** a shared target abstraction where a new target type costs a file
plus a registry row (never a `ScopeView` edit), placements are authored as data, and
the first two types — an IDPA hanging silhouette and a knockdown popper — ship on the
Test Range.

## Owner decisions (Q&A, 2026-07-30)

1. Build the reusable system **first**, then author targets on it.
2. First batch: **IDPA hanging silhouette** (non-round shape × existing swing) and
   **popper/dropper** (existing round shape × new knockdown mode). Chosen so neither
   can hide a bug in the other — they prove the two axes independently.
3. Storage: target **types as typed TS modules** (geometry/reaction/zones need code),
   target **placements as JSON** through a typed loader.
4. Hit test becomes **zone-capable** — returns and records which zone was struck.
   Points/scoring math and HUD are **out of scope**.
5. **Mount is a separate axis from the target** (owner Q, answered below).
6. **The ELR bullseye first-hit wipe gets fixed in this batch**, not deferred.
7. **The existing 12″ hanging gong is migrated into the new system too**, so the Test
   Range ends this batch with three targets all on the new abstraction:
   **hanging gong** (chain-beam) · **stake-mounted IDPA** (bolt-stake) · **popper**
   (hinge-stem).
8. **Target specs of record are `Documentation/Targets/idpa-target.svg` and
   `idpa-popper.svg`** — not the stale root-level copies.
9. **Artwork is a composable face layer stack, not a fixed property.** A type ships
   default art, but recolouring must be easy, and it must be equally easy to put either
   provided artwork *or* procedurally drawn shapes (e.g. scoring circles / hit areas) on
   a face.

## Findings that shaped the design (verified, not assumed)

- **Mount is already an independent axis in shipped code.**
  `elr-range-config.ts:218` `mountFor(point, losRangeM) → 'stake' | 'rack' | 'panel'`,
  with the comment at line 309: *"The mount is per-STATION, not per-line."* One gong
  type, three mounts. And `ELRRangeScene.ts:213` derives the reaction **from the
  mount**: `swings: st.mount !== 'stake'`. Folding mount into the target type would
  regress what ELR already does.
- **Splat marks are target-frame, not mount-frame.** `steel_target.cpp`
  `drawImpactOnTexture` maps `u = 0.5 + x/width_`, `v = 0.5 + y/height_` from the
  target-local impact and normalizes splat radii the same way, into a per-instance
  buffer mirrored to atlas layer `instanceId`. Shape → UVs → splat position are all
  properties of the target; the mount only supplies the pose the marks ride on.
- **The engine paint buffer is aspect-independent.** `steel_target.cpp:15` sizes the
  texture from `texture_size` alone regardless of `width_`/`height_`. A tall silhouette
  needs **no atlas change and no second surface path** — the existing `(2·256)×256`
  layer works as-is.
- **The disc geometry's UV rule is already shape-generic.** `createPlateDiscGeometry`
  authors in a unit box (`r = 0.5`), so its cap UVs are exactly
  `u = halfCentre + x·0.5, v = 0.5 + y` — identical to the C++ formula for any outline
  in `x,y ∈ [−0.5, 0.5]`. Non-round geometry is a new triangulation, not a new UV
  convention.
- **`ShapeUtils.triangulateShape` ships in the pinned three 0.185.1** — earcut is
  available, no new dependency. Required: the IDPA outline is non-convex (reflex
  vertices at the neck/shoulder junction), so a centroid fan self-overlaps.
- **C++ cannot do a knockdown.** `SteelTarget::timeStep` has gravity, chain springs, a
  Y-twist spring and settle detection — no base hinge, no angular limit about X, no
  ground contact, no latch, no reset.
- **Scene builders are not unit-testable here.** `vite.config.ts:74` sets
  `test.environment: 'node'` and there is no `canvas` package (adding one is forbidden
  by protocol §3), so `makeSignTexture`'s 2D context is unavailable. Every
  scene-level behaviour in this batch is an OWNER CHECK by construction.
- **Confirmed defect:** `ScopeView.tsx:1130` overwrites a plate's *whole* atlas layer
  with the C++ buffer. ELR writes its bullseye rings through the same layer
  (`ELRRangeScene.ts:183`), so **the rings are wiped on the first hit.** T4 ships the
  mechanism, T4b applies it to ELR.
- **The owner's two specs (read 2026-07-30, in `Documentation/Targets/`):**
  - `idpa-target.svg` — viewBox `423 × 694`, total height **30.75 in**, **four zones**:
    outer silhouette polygon (−3), inner polygon (−1), head circle `r=41.2` at
    `(211.55, 90.55)` (−0), body circle `r=84.05` at `(211.53, 300.95)` (−0). Straight
    segments only. *(The root-level `idpa-target.svg` is an older 3-zone draft — ignore
    it.)*
  - `idpa-popper.svg` — viewBox `140 × 440`, **42 in** overall, head arc R3 in, body
    circle R6 in centred 27.375 in up, pinching to 8 in then tapering to a 6 in base.
    **It is a tall full-height silhouette, not a round head**, and it uses SVG **arc**
    (`A`) commands.
- **Consequence:** two of the three targets need real outline sourcing, one with arc
  flattening. That justifies a small dedicated `svg-outline.ts` (T3b) rather than
  hand-transcribed point lists, and it makes the art↔zones↔geometry sync test *exact*
  rather than tolerance-based (see §1).

## Design

### 0. The factoring: three independent axes

The owner's question exposed the right decomposition, and it's the one ELR and Range A
already imply:

| Axis | Owns | Examples |
|---|---|---|
| **Target** | shape/outline, aspect, zones, paint + art, splat surface, mass model, default size | 12″ gong, IDPA silhouette, 8″ popper head |
| **Mount** | how it's held, the furniture geometry, **the reaction mode**, anchor/pivot geometry | chain-on-beam, bolted stake, hinged stem, panel |
| **Group** | one piece of furniture carrying N targets, and shared reset | Range A's 5-plate rack, ELR's single-gong frame, a 6-plate rack |

Reaction mode belongs to the **mount**, not the target: a chain-hung plate swings, a
bolted plate doesn't, a hinged stem knocks down. That's already literally how ELR
computes it. The same IDPA silhouette can hang on chains *or* sit on a hinged stand,
and get different behaviour for free.

Not every combination is physical, so the target type carries
`compatibleMounts: readonly MountId[]` and `defaultMount`, validated at load. A popper
is a `disc` target whose only compatible mount is `hinge-stem` — which expresses
"welded to a stem" without collapsing the axes.

### 1. Target types

New `range/targets/target-type.ts` (pure, no THREE):

```
TargetShape  = {kind:'disc'} | {kind:'rect'} | {kind:'polygon', points}
ZoneShape    = {kind:'circle',cx,cy,r} | {kind:'rect',…} | {kind:'polygon',points}
TargetZone   = { id, label, shape }            // authored best-zone-first
TargetPaint  = { palette: Record<string, number>,        // named colour slots
                 layers: readonly FaceLayer[] }          // ordered, bottom-first
TargetType   = { id, name, shape, aspect, zones, defaultZoneId,
                 massModel:'oval'|'rect', paint, defaultWidthM,
                 compatibleMounts, defaultMount }
```

**All outline and zone coordinates live in the target's WIDTH-NORMALISED LOCAL FRAME:
`X ∈ [−0.5, +0.5]` exactly (the outline spans the full width by definition),
`Y ∈ [−aspect/2, +aspect/2]`, +x right, +y up, origin at the outline's bbox centre.**
Multiply by `widthM` for metres.

*(Revised at T1, 2026-07-30. This section originally specified a normalised bounding
box — x AND y in ±0.5. That frame is **anisotropic** for any non-square target, so an
authored circle silently becomes an ellipse: the IDPA head zone would have been squashed
by 1/aspect ≈ 0.59 in y, and the hit test's bullet-radius term would skew with aspect.
The width-normalised frame is isotropic, so a circle stays a circle and a distance stays a
distance.)*

The anisotropic box still exists, but **only as the texture mapping** — the C++ paint
buffer uses `u = 0.5 + x/width, v = 0.5 + y/height` and `plate-geometry.ts` matches it.
`toUnitBox()` is the single conversion, so that frame never leaks into geometry or scoring.

`aspect` stays a field on `TargetType` (scenes and the loader read it constantly) but is
**validated against the outline**, so the cached value can never disagree with the
geometry — which is also what catches an outline left in SVG viewBox pixels.

`range/targets/registry.ts`: `TARGET_TYPES` map + `getTargetType(id)` that **throws**
on unknown ids, mirroring `getRangeDefinition` (`ranges.ts:230`).

Geometry helpers live in a sibling `range/targets/target-geometry.ts` (split out at T1):
`outlinePolygon`, `pointInPolygon`, `pointInOutline` (boundary-tolerant),
`distanceToSegment`/`distanceToRing`, `zoneSamplePoints`, `bounds`, `aspectOf`,
`toUnitBox`/`fromUnitBox`. T2's hit test, T3b's flattener and T4's triangulation all
depend on these rather than on the type definitions.

### 2. Mount types

New `range/targets/mount-type.ts` (pure, no THREE):

```
ReactionMode = 'swing' | 'bolted' | 'knockdown'
MountType = { id, name, reaction,
              furniture: 'beam-rack' | 'stake' | 'panel' | 'hinge-stem' | 'none',
              needsBeamHeight: boolean,          // chain mounts only
              anchor?: { angleRad, outwardOffsetM, splayFraction },  // chain geometry
              knockdown?: { fallAngleDeg, downDwellS, resetRateDegS, stemLengthM } }
```

Shipped mounts: `chain-beam` (swing — today's Range A / Test Range / ELR rack+panel
behaviour), `bolt-stake` (bolted — today's ELR stake stations), `hinge-stem`
(knockdown — new in T6).

`PlateInstance` gains four optional fields — the pattern `swings?`,
`chainOutwardOffsetM?`, `camera?` and `shotBudget?` already use, where
"omitted ⇒ today's behaviour" is a structural guarantee:
`targetTypeId?`, `mountId?`, `heightM?` (defaults to `diameterM`), `pivotYM?` (hinge
world Y — a new field, not an overload of the documented `beamHeightM`).

`swings?` stays. One tested helper resolves the mode, and the mount is now the source
of truth:

```
reactionModeOf(plate) = plate.mountId ? getMountType(plate.mountId).reaction
                      : plate.swings === false ? 'bolted' : 'swing'
```

**Migration cost for the three shipped steel ranges: zero lines.** Their plates carry
no `mountId`, so the `swings` fallback reproduces current behaviour exactly — including
ELR, whose `mountFor()` keeps deciding `swings` as it does today. A later task *may*
map ELR's `'stake' | 'rack' | 'panel'` onto `MountType` ids, but nothing in this batch
requires it and doing so would risk a shipped range for no gain.

Chain anchor constants (`CHAIN_ANCHOR_ANGLE_RAD`, `chainOutwardOffsetFor`'s clamp,
`CHAIN_SPLAY_FRACTION` in `engine-bridge/steel-target.ts`) become the `chain-beam`
mount's `anchor` defaults, still exported from their current home so no existing
importer changes.

### 3. Groups (frames/racks)

Deliberately **minimal in this batch**: a placement may carry `groupId?: string`, and
the loader guarantees every target in a group shares distance and mount. Two consumers
now: the scene builds one piece of furniture per group instead of per target, and
`resetDownTargets(groupId?)` resets a group together. That's all a Range A rack, an ELR
single-gong frame and a future 6-plate rack need structurally — no separate group
registry, which would be speculative.

### 4. Placement JSON + typed loader

Mirror `game/catalog.ts` exactly: JSON **inside `src/`**, statically imported (not
fetched), so it stays out of the offline/precache question and keeps full type
inference.

- `range/targets/placements.data.json` — `{ placementsVersion, ranges: { [rangeId]: { targets: [...] } } }`
- `range/targets/placements.ts` — `PLACEMENTS_VERSION`, `getTargetPlacements(rangeId)`
  returning `[]` for ranges with no entry, throwing on malformed entries.

One entry: `{ id, typeId, mountId?, groupId?, distanceYards | distanceM, xOffsetM,
widthM?, beamHeightM?, palette? }`. `mountId` omitted ⇒ the type's `defaultMount`;
`widthM` omitted ⇒ its `defaultWidthM`; `palette` is a partial override of the type's
colour slots (§5b), so recolouring a target is a data edit.

Validation with explicit messages: unknown `typeId`/`mountId`; **mount not in the
type's `compatibleMounts`**; exactly one of `distanceYards`/`distanceM`; `widthM > 0`;
ids unique per range; `beamHeightM` required iff the mount sets `needsBeamHeight`;
group members agree on distance and mount; **`palette` keys must exist in the type's
palette** (a typo'd slot is a silent no-op otherwise). All unit conversion through
`units/` (`yardsToMeters`, `inchesToMeters`) — no inline unit math.

**Do NOT migrate Range A or ELR**, and write that rule into the loader header:
ELR's layout *cannot* be static data (it solves sight clearance against a runtime tree
field), and flattening Range A's computed ladder loses the BTK authored-inputs
derivation for a ~400-line churn diff. The shared abstraction is Target × Mount ×
`PlateInstance`, **not** the placement source. Authored placements are data; computed
layouts stay code; both produce `PlateInstance[]`.

### 5. Non-round geometry + the splat surface

New `range/plate-outline-geometry.ts`; **`plate-geometry.ts` is not touched** — the
cheapest possible proof the disc is unchanged. Caps triangulated with
`ShapeUtils.triangulateShape`; same UV rule as the disc; rim quads at UV `(−1,−1)` →
the shader's flat-gray branch.

**Several meshes, ONE global `instanceId` space.** A shape needs its own geometry, so
its own `InstancedMesh` — but `instanceId` is simultaneously the atlas layer index, the
`chainRest[id*2+ci]` key, the `plateTargets`/`reactions` key, and the store's
`currentTarget.plateInstanceId`. Per-mesh index spaces break all four. So: all meshes
share the material from `createPlateMaterial`, each carries the **global** id in
`instanceTargetIndex`, and `chainMesh` stays one mesh sized `plates.length*2` with
collapsed zero-length pairs for non-hanging mounts — the pattern
`ELRRangeScene.addChains()` already uses for stake plates.

`SteelSceneApi` gains one optional member plus a shared helper:

```
/** Where instance `id`'s matrix lives when a scene draws several shapes.
    Omitted ⇒ { mesh: plateMesh, index: instanceId } — every shipped range. */
meshFor?(instanceId: number): { mesh: THREE.InstancedMesh; index: number };
```

**Splat marks stay entirely target-side** (answering the owner's Q2): the target type
supplies shape → geometry UVs → the C++ `width`/`height`/`isOval` that normalize the
splat, and the base art layer. `plate-surface.ts` gains ~55 additive lines:
`setBaseLayer(layer, rgba)` stores authored art bytes, and
`writeEngineLayer(layer, engineRgba, paintHex)` composites splats over that base — **or,
with no base registered, does exactly what `writeLayer` does today, byte for byte.**
This is the mechanism that fixes ELR's ring wipe. Marks ride whatever pose the mount
produces (swing or hinge rotation) for free, because they live in the plate's UVs.

`engine-bridge/steel-target.ts`: `SteelReactionSpec` gains `heightM?` (default
`diameterM`) and `isOval?` (default `true`), so existing callers and the WASM
integration test are unchanged. For the IDPA silhouette `isOval: false` overstates mass
by the bounding-box fill factor (~1/0.72) — the right trade: conservative (a heavier
plate swings less), the closer of the two available inertia models for a tall shape, and
the alternative is an engine change.

### 5b. Target faces — art, colour and drawn overlays

The face is a **bottom-first layer stack**, not a fixed paint property. Four layer kinds
cover everything asked for:

```
FaceLayer =
  | { kind:'fill',   color: ColorRef }                        // base paint over the outline
  | { kind:'image',  artId: string, fit:'bbox'|'contain' }    // provided artwork
  | { kind:'shapes', items: readonly DrawShape[] }            // drawn primitives
  | { kind:'zones',  style: Record<string, ZoneStyle> }       // draw the type's OWN zones

DrawShape  = { shape: ZoneShape, fill?: ColorRef, stroke?: ColorRef, strokeWidthM?: number }
ColorRef   = number | `$${string}`   // literal 0xRRGGBB, or '$paletteSlot'
```

Why this shape:

- **Recolouring is a palette override**, not a new type. Colours are named slots
  (`'$face'`, `'$ring'`, `'$outline'`), and a placement may pass
  `palette: { face: 0xffffff }` to recolour any target without touching its module. This
  finally gives Range A's `PAINT_COLOR_HEX` (an empty record currently kept "for future
  use") a real consumer.
- **`kind:'shapes'` is exactly "draw circle hit areas"** — `ZoneShape` is already the
  circle/rect/polygon union from §7, in the same unit box, so a drawn ring and a scored
  zone are described by one primitive set.
- **`kind:'zones'` derives the art from the zone definitions themselves**, so scoring
  rings can never drift from what actually scores. The ELR bullseye is exactly this
  (three concentric circles, `RING_FRACTIONS`), which means `bullseye-texture.ts` becomes
  a candidate for retirement later — noted, not done in this batch.
- **The T7 "procedural fallback" stops being a special case.** If the image asset fails
  to load, the executor simply skips the `image` layer; the `fill` + `zones` layers below
  it still render a legible face. Same code path, no fallback branch.

**Split for testability.** Rasterizing needs a 2D canvas, which the node test env doesn't
have. So:

- `range/targets/face-plan.ts` — **pure**: resolves the palette, applies placement
  overrides, converts unit-box coords to layer pixels, and emits an ordered **draw-op
  list**. Fully node-testable, and it's where all the interesting logic lives.
- `range/targets/face-raster.ts` — **thin browser executor**: replays ops onto a canvas,
  reads back RGBA, hands it to `setBaseLayer`. Deliberately dumb, owner-verified on
  device.

**Interaction with splat compositing (§5) is unchanged.** The C++ target still receives a
single `paintColorHex` — the `fill` layer's resolved colour — and
`writeEngineLayer(layer, engineRgba, paintHex)` keeps its rule: texels that differ from
`paintHex` are chips, everything else takes the base layer. That works for an arbitrarily
complex face, because the base layer is only ever consulted where the engine says no chip
landed. So splats chip through provided artwork and drawn rings identically, with no extra
machinery.

### 6. Knockdown mount — TS animation, not C++ physics

C++ would need a new constraint type (base hinge with one-sided angular limit), ground
contact, a latch and a reset actuator inside the `timeStep` every other range's swing
runs through — 150–250 engine lines, a `ctest` + golden-vector + emsdk rebuild, for the
largest blast radius and smallest fidelity gain in the batch. And a popper's fall isn't
emergent: it's a rod pivoting about its base, a hard stop, then a mechanical reset.
Nothing for a solver to discover. Decisively: TS.

Critically, TS keeps it **pure and node-testable** — the one part of this feature that
can be proven programmatically, so it must live where tests reach it.

`range/targets/knockdown.ts` (pure, no RNG, no engine): phases
`standing | falling | down | rising`; fall uses the rod-about-base equation
`θ̈ = (3g/2L)·sin θ` seeded from impulse via `θ̇₀ = 3·J·h/(m·L²)`; latch at
`fallAngleDeg`; dwell; constant-rate `rising` (a reset motor is mechanical, not
gravitational). Config comes from the **mount's** `knockdown` block.

The struck popper **still gets a C++ `SteelTarget`** in the paint-only role bolted
plates already use (`ScopeView.tsx:1107` — strike, write the layer, never stepped) so
splats accumulate on its face. Pose is applied about the hinge:
`translate(pivot) · axisAngle(hinge, −θ) · translate(−pivot) · rest`.

**Reset in two places:** an auto-timer from the mount config (primary — the Test Range
has an infinite budget and auto-commits, so there's no engagement rhythm to hook, and a
target that never stands up is a dead sandbox), plus `resetDownTargets(groupId?)` on the
COMMIT boundary (one line; the seam a future stage course and plate rack need).

A down target must not accept hits — filter `rackPlates` in `fireSteel` via
`controller.isStanding(id)` **before** `resolveShot`, keeping `game/shot.ts` risk at
zero and correctly removing fallen targets from the aimed-plate pick too.

### 7. Zone-capable hit test

New pure `game/target-hit.ts`. **`discHit` is not modified** — it becomes the delegate
for the legacy path, so "byte-identical for round plates" is guaranteed rather than
argued. `ShotPlate` gains optional `typeId?`, `heightM?`; absent `typeId` ⇒ call
`discHit` verbatim and report `{ zoneId: 'plate' }`.

`resolveShot` keeps `hitPlateId` unchanged and **adds** `hitZone: ZoneHit | null`, with
`hitPlateId = hitZone?.instanceId ?? null` — every existing `shot.test.ts` assertion
still holds. `recordShot` gains `score.zoneHits: Record<string, number>` (session-only
like the rest of `ScoreState`, so no save-schema bump).

Three primitives (circle, rect, polygon) cover the IDPA target. Bullet-radius handling
uses signed distance-to-edge, applied to the outline (matching `discHit`'s existing
line-break convention) and to zone boundaries, so a shot touching a line scores the better
zone, as IDPA does. **The width-normalised frame (§1) makes this a plain scaled length** —
the bullet radius divides by `widthM` once and needs no per-axis correction, which was the
second reason for revising the frame.

**One source of truth for shape, zones and art.** A target module embeds the SVG's
`d` / `cx,cy,r` attributes **verbatim as string constants**, and
`range/targets/svg-outline.ts` (T3b) parses and flattens them at module load into unit-box
point lists. Geometry, zone tests and the rasterized face all derive from those same
strings, so they cannot disagree. The sync test reads
`Documentation/Targets/idpa-target.svg` (and the popper) from disk with `fs` and asserts
**string equality** with the embedded constants — exact, not a tolerance, and it fires the
moment the owner edits a spec without updating the module. Bounding box, aspect and
`defaultWidthM` are *computed* from the flattened outline rather than hand-entered, then
cross-checked against the drawings' stated overall heights (30.75 in and 42 in).

### 8. Two-sided splats and flipping targets

**The two-sided system already exists and is already correct** — verified in the C++:

- The paint buffer is split front|back, and each geometry cap maps to its own half
  (`plate-geometry.ts`: downrange cap → left half, u-centre 0.25; shooter-facing cap →
  right half, u-centre 0.75). Each face accumulates its own marks independently, and
  back-face marks are simply not visible from the front.
- `is_front_face = vel_world.dot(normal_) < 0` (`steel_target.cpp:580`) reads the
  **live** normal, which `timeStep` recomputes from the body orientation
  (`normal_ = orientation_.rotate((0,0,-1))`, lines 437 and 456). After a 180° flip the
  engine paints the *other* half by itself.
- The mark lands at `inv_orientation.rotate(local_pos)` (line 545) — the paddle's
  *current* local frame — so it's in the right spot on the face regardless of pose.

A dueling-tree paddle therefore works as expected: hit #1 marks the shooter-side face,
the paddle flips, that face is hidden and a clean one presents, hit #2 marks the other
half.

**But all three depend on `orientation_` being the C++ body's own state, and TS-animated
poses never touch it.** For the popper this is harmless — a target can only be struck
while standing (the `isStanding` filter), so `hit()` is always called at rest, and it
falls away rather than turning. For a **flipper it breaks all three**: the engine keeps
believing the paddle is at rest, paints the same half every time, and places the mark at
the un-flipped local position, so marks show on the wrong face.

`bindings.cpp` exposes no pose setter. **Fix: bind `setOrientation` on the owned engine
copy** (T10) so TS-driven poses feed the paint decision. The alternative — computing
face and local coords TS-side — duplicates engine logic that native tests already pin
(`DownrangeHitPaintsRightHalfOnly`, `OffsetHitMapsLocalXYToTexel`) and would drift.
`emcc 6.0.2-git` is on PATH locally and matches the CI pin, so ctest + golden vectors +
a WASM rebuild are all runnable.

T10 is what unblocks the dueling tree; the flip reaction mode itself stays out of this
batch. The invariant gets a test **now** so nobody rediscovers it later.

### 9. Extract the reaction lifecycle from ScopeView

Do it, as its own task **before** knockdown lands — otherwise a third reaction mode goes
into a 2461-line file across four separated regions, which is precisely the
patch-and-repatch the owner ruled against on 2026-07-18.

New `scope/steel-reactions.ts`:

```
createSteelReactions(scene: SteelSceneApi, module: BtkModule): SteelReactionController
  onImpact({plate, impactWorld, impactVel, bulletMassKg, bulletDiameterM}): void
  update(dt, timeS): void
  resetDownTargets(groupId?): void
  isStanding(instanceId): boolean
  dispose(): void
```

Moves in: both maps, the create/strike/layer-write branching, the swing
step/pose/chain/settle loop, teardown. **Stays in ScopeView:** `pendingImpacts` —
that's time-of-flight scheduling, a different concern; its closure body shrinks to one
`controller.onImpact(...)` call. Pure refactor, reviewable as a move.

### 10. Test Range after this batch

Three targets, **all on the new abstraction**, chosen so every mount and every reaction
mode is exercised and no target/mount pairing is left untested:

| # | Target | Shape | Mount | Reaction |
|---|---|---|---|---|
| 1 | 12″ hanging gong, 100 yd | disc | `chain-beam` | swing |
| 2 | IDPA silhouette, 75 yd | polygon (straight segments) | `bolt-stake` | bolted |
| 3 | Popper ×2, 50 yd | polygon (arc-flattened) | `hinge-stem` | knockdown |

- **The gong is migrated, not rebuilt.** It stays at 100 yd, stays `plates[0]` (the
  test-range branch auto-commits `range.plates[0]`), and keeps every current value —
  12″, `xOffsetM 0`, rack width 1.5 yd, beam height 1.2 yd, `plateCenterYM =
  beamHeight × 0.5`, paint `0xf0f0ea`. `TEST_RANGE_GONG` is **kept as an exported
  const** because `NO_HILL_CORRIDOR` and `test-range-config.test.ts` depend on it, and
  T9a asserts the placement-built gong `PlateInstance` is **field-for-field identical**
  to today's. That equality test is the whole point of migrating it: it proves the new
  system reproduces existing behaviour before two new targets rely on it.
- **The IDPA is stake-mounted** (owner), so it is bolted — paint-only, no pose, the same
  path ELR's stake stations already use. Its type declares
  `compatibleMounts: ['bolt-stake', 'chain-beam']` so hanging it later costs a placement
  edit and no new code.
- **The popper is a 42″ full-height silhouette**, not a round head: `shape: polygon` from
  the arc-flattened spec, `massModel: 'rect'`, on a hinged stem. Two of them share one
  `groupId` so group reset is exercised.
- Wind stays 0, `windMarkers: false` unchanged. Three plate meshes (disc / IDPA polygon /
  popper polygon), one shared atlas, one chain mesh with collapsed pairs for the stake
  and hinge mounts.

**Note on coverage:** with the IDPA bolted, no target in this batch pairs a *non-round
shape* with a *swing*. That combination is one placement-JSON edit away (the IDPA type
already permits `chain-beam`), and worth an on-device look during T9b's owner check.

## Tasks

Protocol rules applied throughout: each task ≤ ~400 changed lines / ~10 files (§3);
stop and confirm with the owner after every task (§2.8); update
`Design/execution/PROGRESS.md` at the end of every task whatever the outcome (§2.6);
no new dependencies (§3). Gate order per task: `npx vitest run` → `npm run build` →
the task's own Done-when. **`ctest` and the golden vectors are N/A for T0–T9 — no engine
source is modified** (T6 touches only the TS bridge); record them as N/A in PROGRESS.md
rather than skipping silently. **T10 is the one task that modifies engine source**, so it
runs the full gate: `ctest` → `node GameBuild/validation/run.mjs` → WASM rebuild → vitest
→ build. `BallisticsToolkit/` is never touched. Range A, Wooded Zero and ELR must be
provably unchanged except for T4b, which is an owner-approved ELR fix.

**T0 — Characterization guards.** NEW `range/plate-geometry.golden.test.ts`,
`game/firing-solution.hit-grid.test.ts` (~120 lines). Pin a stable hash of
`createPlateDiscGeometry()` positions+UVs; pin `discHit` truth over a deterministic grid
across the real Range A diameters; assert the `chainRest[id*2+ci]` contract; **pin the
two-sided paint invariant** — a shooter-side hit writes only the right texture half and
leaves the left half at clean paint (the guard that would catch a flip regression).
*Done when:* both suites green and named in PROGRESS.md as the T1–T10 baseline.

**T1 — `TargetType` + registry (pure). DONE 2026-07-30.** NEW
`range/targets/target-type.ts` (types + `validateTargetType`),
`target-geometry.ts` (unit-frame geometry, split out mid-task), `registry.ts`, plus
`target-type.test.ts` and `target-geometry.test.ts`. *Done when:* `getTargetType`
throws on unknown ids; every registered type's zones lie inside its outline; T0 green.
*Also gate:* `npm run typecheck`.

**T1b — `MountType` + registry + `PlateInstance` fields (pure). DONE 2026-07-30.** NEW
`range/targets/mount-type.ts`, `mount-registry.ts`, `mount-type.test.ts`; EDIT
`range/RangeScene.ts` (+25, four optional fields + docs). ~413 lines, 4 files.
*Done when:* `reactionModeOf` reproduces `swings` semantics for every plate derivable
from `RANGE_A_RACKS` and both `solveLayout('low'|'high')`; `chain-beam`'s anchor
defaults equal the current exported constants; T0 green.
*Resolved at T1b:* when both `mountId` and `swings` are present, **`mountId` wins** —
so a migrated plate can keep the legacy field harmlessly instead of the two
contradicting each other. Asserted in both directions.

**T2 — Zone hit test + `resolveShot` threading. DONE 2026-07-30.** NEW
`game/target-hit.ts` + test; EDIT `game/shot.ts`, `state/store.ts`, plus three test
files (two `ShotResult` helpers needed the new required field). ~420 lines, 7 files.
*Done when:* an equivalence test proves `hitTargetZone` with no `typeId` is
hit/miss-identical to `discHit` on the T0 grid; every pre-existing `shot.test.ts` /
`state.test.ts` assertion unchanged and green; `score.zoneHits` increments on a zoned
hit.
*Resolved at T2:* `zoneAt(local, type, bulletR)` was split out of `hitTargetZone` so the
typed path is testable with a type in hand — the registry stays empty until T7/T8/T9a,
and a capability nobody exercises for three tasks is a capability nobody has checked.
`hitZone` is **required** on `ShotResult` (not optional) so no production path can forget
it. `score.zoneHits` is gated on the same condition as `hits`, so `sum(zoneHits) === hits`
is an asserted invariant. `plateHeightM` centralises the `heightM ?? aspect ?? width`
derivation so callers cannot disagree about which wins.

**T3 — Placement JSON + typed loader. DONE 2026-07-30.** NEW
`range/targets/placements.data.json`, `placements.ts`, `placements.test.ts`. ~513 lines,
3 files. No scene consumes it yet. *Done when:* `PLACEMENTS_VERSION` exported; every
validation failure has its own test with an asserted message (including
mount-not-in-`compatibleMounts` and group disagreement); `getTargetPlacements('range-a')`
and `('elr-range')` return `[]`; the computed-layouts-stay-code rule is in the file header.
*Added at T3:* `widthInches` alongside `widthM` (steel is sold in inches); **range-id keys
validated at import** against `ranges.ts`, because a typo'd key would otherwise mean a
range silently gets no targets — reading as a rendering bug rather than a data one; and
`PlacementDeps` injection so every rule is testable before the registry has entries.

**T3b — SVG outline parser + flattener (pure). DONE 2026-07-30.** NEW
`range/targets/svg-outline.ts` + `svg-outline.test.ts`. ~556 lines, 2 files. Absolute
`M`/`L`/`A`/`Z` plus `<circle>`, arcs flattened via the SVG spec's endpoint→centre
parameterisation at a 0.25 px sagitta bound, output normalised into the width-normalised
frame with bbox and aspect computed. Pure, no DOM.
*Done when:* a known arc flattens to points on its true circle within tolerance; the
popper spec's flattened bbox is consistent with its stated 42 in height and the IDPA's
with 30.75 in; winding is normalised CCW regardless of source direction; an
unsupported command throws by name rather than silently dropping geometry.
*Key API shape:* `flattenOutline(d)` returns `{ points, frame, aspect }`, and
`localCircle`/`localPolygon` **take that frame as an argument** — so every zone
normalises against the OUTLINE's bbox rather than its own, which is the mistake a T1
test caught, now made structurally hard.

**T4 — Non-round geometry + atlas base-layer composite. DONE 2026-07-30.** NEW
`range/plate-outline-geometry.ts` + test; EDIT `range/plate-surface.ts` (+67/−2) + its
test. `plate-geometry.ts` untouched. ~510 lines, 4 files. *Done when:* the IDPA outline
triangulates with no self-overlap (triangle-area sum vs the outline's shoelace area);
every cap vertex satisfies `u = halfCentre + x·0.5, v = 0.5 + y/aspect`; all rim UVs are
`(−1,−1)`; `writeEngineLayer` with no base is byte-identical to `writeLayer`;
compositing preserves base texels wherever the engine buffer equals the paint colour;
T0 geometry hash unchanged.
*Resolved at T4:* positions are authored in the **width-normalised frame** (aspect baked
into the vertices), so the instance scale is `(widthM, widthM, thicknessM)` — uniform in
x/y, and identical to the disc's convention where they overlap (aspect 1). `v = 0.5 +
y/aspect` is the one place the anisotropic unit box appears on the geometry side.

**T4b — Fix the ELR bullseye first-hit wipe. COMPLETE — owner-confirmed on device
2026-07-30** (*"Confirmed ELR targets are working correctly."*).
EDIT `range/ELRRangeScene.ts` (`setBaseLayer` in place of `writeLayer`),
`scope/ScopeView.tsx` (both hit-path writes → `writeEngineLayer`),
`range/bullseye-texture.ts` (stale header comment), + 6 tests in
`bullseye-texture.test.ts`. ~90 lines, 4 files.

**T5 — Extract the reaction lifecycle (pure refactor). COMPLETE — owner-confirmed on
device 2026-07-30.** NEW `scope/steel-reactions.ts` (201) + `steel-reactions.test.ts`
(342, 14 tests); EDIT `scope/ScopeView.tsx` (2461 → **2391**), `range/steel-scene-api.ts`
(+ optional `meshFor`, + `plateMeshSlot`), + the T4b wiring guard repointed. ~600 lines,
5 files. *Done when:* no `reactions`/`plateTargets` identifiers remain in
`ScopeView.tsx`; the controller test proves swing → step → settle → snap-back-to-rest
and that a bolted plate never enters the stepped set; native handles are deleted exactly
once on `dispose`.
*Changed from the plan:* the controller takes an injected **`SteelReactionFactory`**
rather than a `BtkModule`. Faking embind's whole surface (`Vector3D`, `Bullet`,
`SteelTarget`, `localToWorld`, `addChainAnchor`, `setColors`…) to test orchestration was
both fragile and wrong — and this keeps embind handles confined to `engine-bridge/`
per build-plan §3.
*Owner check passed:* Range A and ELR — swing, chain tracking, splats and settle
indistinguishable from before.

**T6 — Knockdown mount + reaction mode. DONE 2026-07-31.** NEW
`range/targets/knockdown.ts` (156) + `knockdown.test.ts` (269, 26 tests); EDIT
`scope/steel-reactions.ts` (201 → 342, +11 controller tests),
`range/targets/mount-registry.ts` (+`hinge-stem`), `mount-type.test.ts`,
`engine-bridge/steel-target.ts` (optional `heightM`/`isOval` + `chainAnchorFor`),
`range/RangeScene.ts` (+`groupId`), `scope/ScopeView.tsx` (isStanding filter + COMMIT
reset). ~480 changed lines, 8 files.
*Done when:* `stepKnockdown` transitions standing→falling→down→rising→standing
deterministically; a harder hit falls faster but latches at the same angle;
`resetDownTargets(groupId)` restores a whole group immediately; `isStanding` is false
across the whole down+rising window; `createSteelReaction` with only `diameterM`
produces the identical native construction as today (WASM tests unchanged and green).
*Resolved at T6:* the hinge pivot is derived from the plate's **rest matrix**, not
`plate.position` — the rest matrix is what the rotation composes onto, so any other
source silently rotates the plate about a point it is not attached to. COMMIT resets
**all** knockdowns, not just the committed plate's group: the player is choosing what to
shoot next, and leaving other steel face-down would quietly narrow the range.

**T6b — Face layer plan (pure). DONE 2026-07-31.** NEW `range/targets/face-plan.ts` +
`face-plan.test.ts`. ~550 lines, 2 files, **28 tests**. Resolves the palette (type
defaults + placement override), walks the layer stack bottom-first, converts local
shapes to tile-pixel coords for both faces, emits an ordered draw-op list. No canvas,
no DOM.
*Done when:* a `'$slot'` ref resolves through a placement override and falls back to the
type default; an unknown slot throws; a `zones` layer emits ops matching the type's own
zone shapes exactly; ops for the two halves follow `plate-geometry`'s UV convention; an
`image` layer emits a skippable op.
*Two coordinate traps found and pinned here, both easy to ship wrong:* the tile is
**anisotropic** (one local x unit is 256 px, one local y unit is 256/aspect px), so a
local circle is a texel **ellipse** — emitting circles would render scoring rings as eggs
on any non-square target, the same trap `bullseye-texture.ts` documents; and **row 0 is
the plate's BOTTOM** (`v = 0.5 + y`, y up, `flipY = false`), so `image` ops carry
`flipY: true` and getting it backwards renders every silhouette upside down. Faces are
**not** mirrored — `plate-geometry` maps both caps with `u = halfCentre + x·0.5`, so a
mark at local +x reads at local +x from either side, which is what a hole through steel
does.

**T6c — Face rasterizer. DONE (gates) 2026-07-31 — AWAITING OWNER.** NEW
`range/targets/face-raster.ts` + `face-raster.test.ts`. ~500 lines, 2 files, **16 tests**.
Thin by design: fetch/decode the asset, replay ops onto a canvas, read back RGBA, ready
for `setBaseLayer`.
*Done when:* the op sequence recorded against a mocked context matches the plan
op-for-op; a failed image fetch skips only the `image` op and still produces a face; the
resulting buffer is exactly `PLATE_LAYER_BYTES`.
*Decided at T6c:* the art id → URL map lives in `face-raster.ts`, not `registry.ts` —
asset URLs are a rasteriser concern, and the type registry should stay about target
types. Canvas + image loading are **injected**, so the replay is testable without a
`canvas` package (§3) and without a DOM. Two extras the tests forced: the canvas is
**not** globally transformed (op coords are canvas coords 1:1, which is what makes
buffer row 0 = plate bottom line up), and every texel's alpha is **forced to 255** —
a canvas starts transparent, so an uncovered texel would read as a hole in the steel
rather than bare plate.
**OWNER CHECK:** faces render correctly on device — the one part that cannot be
pixel-tested in node. Not visible until T7–T9b put an arted target on the Test Range.

**T7 — IDPA silhouette type + art. DONE 2026-07-31.** NEW `range/targets/idpa.ts`,
`idpa.test.ts` (21 tests); spec copied byte-identically from
`Documentation/Targets/idpa-target.svg` to `public/targets/`; registry row. ~430 lines,
5 files. Zones best-first: `head-0`, `body-0`, `minus-1`, `minus-3` (the outline).
`compatibleMounts: ['bolt-stake','chain-beam']`, `defaultMount: 'bolt-stake'`.
*Done when:* the embedded `d`/`cx`/`cy`/`r` constants are **string-equal** to the spec
(fs test) and the `public/` copy is byte-identical; zone containment tests hit all four
zones and return `-3` inside the outline but outside every zone; a `palette` override
changes the resolved fill; the asset is in the built precache manifest (32 → **33
entries**, `targets/idpa-target.svg` present in `dist/sw.js`).
*Corrected here — the face stack order is `fill → zones → image`, not the
`fill → image → zones` this plan originally specified.* Zone strokes must sit BENEATH
the artwork: above it they double every line the SVG already draws, whereas beneath they
are invisible when the asset loads and become the legible fallback when it does not —
one code path, no fallback branch.
*Also corrected: a T6b design error found by using it.* T6b drew a `zones` layer in the
type's **authored** (best-first) order, justified as "also the correct paint order". For
**nested filled** zones that is exactly backwards: best-first fills the largest zone last
and buries every centre under it. Scoring zones nest by definition, so `zones` now paints
in **reverse authored order** (worst/outermost first), and T6b's test + its comment were
fixed rather than worked around.

**T8 — Popper type. DONE 2026-07-31.** NEW `range/targets/popper.ts` + `popper.test.ts`
(23 tests); registry row. ~420 lines, 4 files. A **42″ full-height silhouette**, not a
round head: `shape: polygon` from the arc-flattened spec (T3b), `massModel: 'rect'`,
single `plate` zone, `compatibleMounts: ['hinge-stem']` only. Face stack:
`fill('$face')` → `shapes([...])` drawing the spec's R6″ reference circle as a visible
aim reference — the concrete demonstration of drawn overlays.
*Done when:* the embedded path string is string-equal to the spec; the flattened outline's
proportions match the drawing (42 in tall, 12 in wide, 6 in base, 8 in waist pinch); the
placement loader rejects pairing it with `chain-beam` and `bolt-stake`; the waist pinch
produces reflex vertices that still triangulate without self-overlap.
*Changed from the plan:* **no `public/` copy and no art id.** The spec is `fill="none"`
line art — an outline (invisible against the plate edge) plus the reference circle the
`shapes` layer already draws — so copying it into `public/` would precache ~800 bytes
nothing ever fetches. The spec still drives the geometry; it is consumed at build time,
not at runtime. That makes the popper the target proving the drawn-shapes path stands on
its own, with no asset at all.

**T9a — Migrate the hanging gong onto the new system. COMPLETE — owner-confirmed on
device 2026-07-31.** NEW `range/targets/hanging-gong.ts`, `range/test-range-targets.ts`
(pure) + `test-range-targets.test.ts` (19 tests); EDIT `placements.data.json` (the gong
entry), `range/TestRangeScene.ts` (`addGong` → `addTargets`, built from placements),
`range/targets/placements.ts` (+`centreYM`, +`beamHeightYards`), `registry.ts`,
`range-a-config.ts` (export `PLATE_CENTER_FRACTION`). ~470 lines, 8 files.
`TEST_RANGE_GONG` is **kept exported** — five other test files depend on it, and it is
now also the reference the identity test compares against.
*Done when:* the placement-built gong `PlateInstance` reproduces the legacy construction
field for field; it is still `plates[0]`; instanceIds are contiguous; atlas layer count
== plate count.
*Two things found and fixed while migrating:* applying `chainOutwardOffsetFor`
unconditionally would have **changed the gong's chain geometry** (the clamp returns
4.3 cm on a 12″ plate, not the shared 5 cm), so `chainClampFor` applies it only where the
shared constant would actually cross the centreline; and a hardcoded
`beamHeightM: 1.09728` float in the JSON was replaced by `beamHeightYards: 1.2`, since a
literal that must match a computed conversion is the drift this design avoids elsewhere.
*Owner check passed:* Test Range gong working as expected, no visible changes.

**T9b — Add the stake IDPA + poppers to the Test Range. COMPLETE — owner-confirmed on
device 2026-07-31** (after four fixes; see PROGRESS T9b-FIX / T9b-FIX2).** EDIT `placements.data.json` (IDPA @ 75 yd `bolt-stake`; two poppers
@ 50 yd `hinge-stem` sharing `test-poppers`), `range/TestRangeScene.ts` (per-shape mesh
+ `meshFor` + per-mount furniture + face rasterisation), `test-range-targets.test.ts`
(+14 tests). ~330 changed lines, 3 files.
*Done when:* global `instanceId`s are contiguous `0..n−1` across all three meshes;
collapsed chain pairs for the stake and hinge mounts; one piece of furniture per
`groupId`; `getTargetPlacements('test-range')` drives all four targets.
*Also lands here:* the first actual use of T6b/T6c — `rasterizeFaces()` plans each
target's face and writes it through `setBaseLayer`, fire-and-forget, so a slow or failed
art fetch degrades to plain steel rather than blocking the scene or leaving a hole.
*Owner device check 2026-07-31 found three issues, all fixed (see PROGRESS T9b-FIX):* the
gong rendered black until its first hit (three uploads ONLY queued layers on a
`DataArrayTexture`'s first upload, and async `setBaseLayer` calls had narrowed it, so
layer 0 never got data — `setBaseLayer` now forces a full upload); poppers floated 0.47 m
up (a hinge-stem target is now hinged at its own base, with the fall equation's rod
length taken from the plate's height rather than the mount constant); and the IDPA's
shoulders sat at 4.22 ft instead of the specified 5 ft (`IDPA_SHOULDER_PX_Y` is now
exported from the spec and the staged height is asserted).
*A fourth issue found on the same check (PROGRESS T9b-FIX2): a popper's HEAD accepted no
hits.* The hit test was innocent — target SELECTION was shape-blind. `aim-pick.ts` sized
its "crosshair is on this plate" test as a circle of the plate's WIDTH, so a 42″ popper's
head (11.7 mrad above centre) fell outside 2× its angular width radius (6.7 mrad), the
committed gong kept the engagement, and the shot resolved on the gong's plane. Replaced
with an elliptical test normalised per axis, proven to reduce exactly to the old circular
one for round plates.
*Owner check PASSED 2026-07-31 — "All looking and working great." T9b is complete, and
with it T6c's deferred visual check.*

**T10 — Engine pose setter (unblocks flipping targets). DONE 2026-07-31.** EDIT
`GameBuild/engine/include/rendering/steel_target.h` + `src/rendering/steel_target.cpp`
(`setOrientation`, plus a private `syncNormalToOrientation` that `timeStep`'s two
rotation sites now share), `src/bindings.cpp` (+1 embind row), NEW
`tests/test_steel_target_setorientation.cpp` (**8 native tests**), EDIT
`tests/CMakeLists.txt`, `engine-bridge/steel-target.ts` + `types.ts`, and T0's
`steel-target.paint.test.ts` tripwire. ~330 lines, 7 files.
*Done when:* the new native tests pass; T0's two-sided invariant still holds for an
un-flipped target; consumers that never call `setOrientation` are unchanged.
*Full gate (the only task touching engine source):* `ctest` **30/30** (was 22) → golden
vectors **36 cases, worst rel diff 0.000e+0** → WASM rebuilt (emcc 6.0.2) → `tsc` clean →
vitest **1173 / 73** → build green.
*Note:* this ships the SEAM, not the flip mode. A dueling tree is a later task that
consumes it — `'flip'` reaction mode on a `pivot-post` mount, plus a multi-target group.

## Verification

Per task, in gate order: `npx vitest run` (currently 844 passing / 57 files — must stay
green and grow), `npm run build`, then the task's Done-when. `npm run typecheck` on T1,
T1b and T5. `ctest` / golden vectors **N/A for T0–T9b**, **full gate on T10** (the only
engine-source change; `emcc 6.0.2-git` on PATH matches the CI pin).

End-to-end after T9b, on device (the owner checks — scene behaviour is not
node-testable):

1. Test Range → the 100 yd hanging gong behaves exactly as before (swing, chains, splat,
   ping, auto-commit) — now driven by placement data.
2. Stake IDPA at 75 yd → correct shape and art, bolted (no swing), splats land where
   aimed and persist, `head-0`/`body-0`/`-1`/`-3` register per the recorded `zoneHits`.
3. Poppers at 50 yd → fall, dwell, auto-reset; a down popper can't be hit or aim-picked;
   COMMIT resets the group immediately; the drawn R6″ reference circle is visible on the
   face.
4. **Art flexibility spot-check:** add a `palette` override to one placement in
   `placements.data.json`, reload → that target renders in the new colour with no code
   change. This is the acceptance test for owner decision 9.
5. ELR → bullseye rings survive hits (T4b), splats visible against white and blue.
6. Range A, Wooded Zero → visually and behaviourally unchanged (T5's blocking check).
7. Frame time within `FRAME_BUDGET_MS` on iPad with three plate meshes.

## Deferred (deliberately)

- **Points/scoring math and any zone HUD** — owner-excluded. `zoneHits` is recorded;
  nothing reads it.
- **Mapping ELR's `'stake' | 'rack' | 'panel'` onto `MountType` ids.** Nothing in this
  batch needs it and it would risk a shipped range for no gain; the `swings` fallback
  keeps ELR on its current path.
- **Migrating Range A onto placement JSON** — no gain; violates the size and
  no-regression rules. **ELR — never:** its layout is runtime-solved against the trees.
- **A standalone group/frame registry.** `groupId` + the shared-distance/mount
  invariant is all the batch needs; a registry would be speculative.
- **Hit-testing against a swinging pose** (today every plate is tested against its rest
  plane). Unchanged here; a separate decision.
- **Engine-side `setBaseTexture`** — the TS composite makes it unnecessary; revisit only
  if splat edges against art look wrong on device.
- **Retiring `range/bullseye-texture.ts`** in favour of a `zones` face layer. The ELR
  bullseye is exactly three concentric circles and would express cleanly as one, but
  swapping it changes a shipped range's art — a later task, after T4b's fix is signed off.
- **Texas star, dueling tree, plate rack, runners, flappers, swinging IDPA behind
  cover** (`Documentation/Targets/Target listing.txt` — a wishlist richer than
  `feature-catalog.md` §F, and not currently referenced from `Design/`). The three-axis
  factoring is sized for them: a plate rack is N `hinge-stem` mounts sharing a `groupId`;
  a **dueling tree / flapper is a future `'flip'` reaction mode on a `pivot-post` mount**
  plus a multi-target group — and it is unblocked by T10, which is why T10 is in this
  batch even though the flip mode is not. Two-sided splat correctness is already handled
  by the engine (§8) once the pose reaches it.
- **A target/mount-driven paper-bay path** — paper has its own `PaperBayScene` contract;
  unifying steel and paper is a much larger design and isn't needed here.
