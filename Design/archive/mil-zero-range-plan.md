# Wooded Zero Range — 25/50/100/200 sight-in bay

Status: **all 5 stages built** (2026-07-26) — Stages 1-4b owner-confirmed on device, Stage 5 awaiting check.
Date: 2026-07-26
Owner decisions this doc records: shooter elevated on a natural knoll; wide target
spacing acceptable (player zooms out to find, zooms in to shoot); backer boards
must read clearly at 200 m against woods.

Supersedes nothing. Sits alongside `Design/archive/test-range-environment-plan.md`,
whose environment module (terrain / trees / sky / mountains / clouds) this range
reuses and **generalises from one straight lane to a fan of lanes**.

---

## 1. What this range is

A sight-in bay with four paper stations at **25, 50, 100 and 200** — metres under
MIL, yards under MOA (§8) — set in the wooded terrain of the Test Range rather
than the existing Zero Range's bare grass strip. It reuses the existing zeroing
target art (`zeroing-target-mil.svg` / `-moa.svg`) and the existing zeroing flow.

Its teaching purpose is the near-zero path — the thing a 25 m station exists to
show. With a 5 cm sight height:

| zero | 25 m | 50 m | 100 m | 200 m | 300 m |
|---|---|---|---|---|---|
| 100 m | −0.92 MIL | −0.11 | 0 | −0.60 | −1.46 |
| 200 m | −0.32 MIL | +0.49 | +0.60 | 0 | −0.86 |

The −0.92 MIL at 25 m is the point: a 25 m "zero" is a sight-height artifact,
not a zero.

### Unit character

`unitCharacter: 'both'` — stations are 25/50/100/200 in whichever unit is active
at entry (metric → metres + the MIL face; imperial → yards + the MOA face), on the
existing D3 entry-snapshot pattern. **This costs almost nothing** — see §8.

---

## 2. The elevated firing point

### 2.1 Why elevation is free

Inclining the shot changes the drop by `drop × (1 − cos θ)`. With `θ ≈ H/d` and
`drop ≈ ½g(d/v)²` the distance terms cancel:

**error ≈ g·H² / (4·v₀²)** — *independent of target distance.*

At 823 m/s muzzle velocity: 1 m of elevation → 0.004 mm; 3 m → 0.033 mm; 10 m →
0.36 mm (≈0.002 MIL). Orders of magnitude below group size, MV spread, or one
turret click. **Elevation is not a ballistic concern at these ranges.**

The one real consequence is *range definition*, handled in §3.3.

### 2.2 Knoll geometry

| parameter | value | why |
|---|---|---|
| crest height above target plane | **1.5 m** | enough for full occlusion clearance (§4), low enough to keep the sight-line fan shallow and the grading natural |
| prone eye above the ground it lies on | 0.20 m | → eye at **y = 1.70 m** |
| target face centre height | 1.00 m | matches existing `TARGET_CENTER_Y_M` |
| Δy (eye − target centre) | **0.70 m** | |
| forward face grade | **10 %** (5.71°) | must exceed the steepest sight line, which is 1.60° to the 25 m target |
| floor reaches the target plane at | r = 15 m | |

The binding constraint is that the ground must fall away **faster** than the
steepest sight line, from the muzzle onward. It does, with margin growing
monotonically:

| r (m) | 0 | 2 | 4 | 6 | 8 | 10 | 12 | 15 | 20 | 25 |
|---|---|---|---|---|---|---|---|---|---|---|
| corridor floor (m) | 1.50 | 1.30 | 1.10 | 0.90 | 0.70 | 0.50 | 0.30 | 0.00 | 0.00 | 0.00 |
| 25 m sight line (m) | 1.70 | 1.64 | 1.59 | 1.53 | 1.48 | 1.42 | 1.36 | 1.28 | 1.14 | 1.00 |
| **clearance (m)** | **0.20** | 0.34 | 0.49 | 0.63 | 0.78 | 0.92 | 1.06 | 1.28 | 1.14 | 1.00 |

**Gotcha this avoids:** a *gentle* knoll (a wide Gaussian, or a flat crest with a
long smoothstep shoulder) grazes the 25 m sight line a few metres in front of the
muzzle — the ground falls away more slowly than the line of sight and you shoot
into your own hill. An earlier 2.3 m / 14 m-radius profile cleared by only 1 cm at
r = 4 m. The fix is a **short, steep forward face**, not a taller hill.

Outside the shooting corridors the knoll can be as rounded and organic as the
artist wants — only the corridor floor profile is load-bearing.

---

## 3. Station layout

### 3.1 The fan

Azimuth is measured from downrange (−z), positive to the right.

Metric layout (the imperial one shares these azimuths exactly — §8). World `x` is
side-to-side (+ = right), world `z` is downrange (always negative); `y` is height
and is the same 1.00 m at every station.

| LOS range | azimuth | ground run | world x | world z | depression | face subtends | board |
|---|---|---|---|---|---|---|---|
| 25 m | −6.0° | 24.99 m | −2.61 | −24.85 | −1.60° | 17.60 mrad | 0.66 × 0.84 m |
| 50 m | −2.0° | 50.00 m | −1.74 | −49.96 | −0.80° | 8.80 mrad | 0.66 × 0.84 m |
| 100 m | +1.5° | 100.00 m | +2.62 | −99.96 | −0.40° | 4.40 mrad | 0.66 × 0.84 m |
| 200 m | +4.5° | 200.00 m | +15.69 | −199.38 | −0.20° | 2.20 mrad | 0.66 × 0.84 m |

Each board is **yawed to face the firing point** (`facingYawRad` = −azimuth); a
fanned bay cannot share one facing the way the straight bay did.

Bounding box: **10.5° horizontal × 1.4° vertical**. All four are in view at or
below **4.1×**; the scope runs 1–35× with a 24° base FOV, so "zoom out, see all,
zoom in" works comfortably. At 10× you see one station at a time, which is right.

The layout reads as a shallow left-to-right staircase receding into the woods:
25 m low and left, 200 m high and right, near the horizon.

### 3.2 Why 10.5° and not wider

Wider was tested and **buys nothing**. The plantable-area figure is ~96–97 % at
10.5°, 18° and 25° alike, because what actually frees up ground for trees is
**corridor termination** — the 25 m lane's corridor simply ends at 35 m, so
everything beyond that in its direction is forest — not lateral separation
between adjacent lanes. Adjacent corridors stay merged at short radius no matter
how wide the fan gets, since they all converge on the same firing point.

So: take the narrowest fan that satisfies occlusion and legibility, and get the
forest from depth instead. 10.5° is that fan.

### 3.3 Range definition — the one thing elevation *does* change

**Station distance is line-of-sight range, not ground run.** The LOS distance is
what the scope sees, what a rangefinder returns, and what must be fed to the
ballistic solver. Placement therefore solves the ground run from the desired LOS
range:

```
groundRun = sqrt(losRange² − Δy²)      // Δy = eyeY − targetCentreY = 0.70 m
x =  groundRun · sin(azimuth)
z = −groundRun · cos(azimuth)
```

At Δy = 0.70 m the correction is small (25 m LOS → 24.99 m ground run), but
defining it this way is what keeps the range honest if the knoll is ever raised.

---

## 4. Occlusion — verified against board silhouettes, not just paper faces

The test that matters is angular: does the near station's **whole backer board**
silhouette clear the far target, combining azimuth and elevation separation?

Recomputed for the **equal-sized boards** of §5.1 (metric layout):

| near board | far target | angular sep | **margin** |
|---|---|---|---|
| 25 m | 50 m | 4.08° | **+2.00°** |
| 25 m | 100 m | 7.60° | **+5.87°** |
| 25 m | 200 m | 10.59° | **+9.04°** |
| 50 m | 100 m | 3.52° | **+2.48°** |
| 50 m | 200 m | 6.53° | **+5.66°** |
| 100 m | 200 m | 3.01° | **+2.49°** |

All clear, minimum margin **+2.00°** metric and **+1.21°** imperial. The imperial
case is tighter because the MOA face is 27 % larger while the yard stations sit
9 % closer, so the near board subtends more — still over a degree of air.

Equal boards came out *slightly better* than the distance-scaled ones at the
binding 100 m/200 m pair (+2.49° vs +2.03°): the far boards shrink faster than
the near ones grow. Losing the angular rule cost nothing here.

Worth noting: the **knoll alone** would clear the paper faces (every sight line
passes 0.4–1.1 m over each nearer face). It's the *enlarged backer boards* of §5
that need the azimuth fan as well — a 1.2 m board at 100 m has a top edge at
1.6 m, above the 1.35 m sight line to the 200 m target. Elevation and azimuth
each solve part of the problem; the layout needs both.

---

## 5. Backer boards and lane markers — visibility at range

**No berms** (owner, 2026-07-26). Misses pass the board and disappear into the
woods, exactly as the Test Range already handles them. Board contrast is bought
with light and backdrop instead of earthworks.

### 5.1 Boards — **constant physical size** (revised on device, 2026-07-26)

> **Superseded:** the original rule scaled the board with range to a constant
> 12 mrad subtension, so every station filled the same fraction of the sight
> picture. On device the owner's verdict was *"the board holding the target is
> comically large at the 200 meter mark. The boards should all be the same
> size."* — and that is correct. A 2.40 m frame around a 44 cm target reads as
> absurd, and real ranges use one frame size everywhere. The reasoning behind the
> angular rule was sound about *legibility* and wrong about *plausibility*.

- **One size at every station**, derived from the paper face alone:
  `width = FACE × 1.5`, `plate = FACE × 0.4`, `height = width + plate`.
  → metric 0.66 × 0.84 m; imperial 0.84 × 1.06 m.
- **The board sits above the target centre** by half the plate band
  (`boardCenterY = 1.0 + plate/2`), so the paper stays centred on the aim point
  at exactly 1.0 m while the lane-number plate occupies a reserved band above it.
  **The aim point must never move** — every sight-line and occlusion proof in
  this document is drawn from a target centre at 1.0 m.
- **Treatment:** near-white face (`0xf2efe6`), dark charcoal border, two visible
  posts. White against dark conifers is the strongest read available.
- **Frame, not backstop.** The board is a target frame. Nothing behind it.

**Cost of the change:** the lane number is small at 200 m (a 17.6 cm plate is
0.88 mrad). That is the accepted trade for equal boards — the HUD already names
the engaged station, so the plate is confirmation rather than the primary cue.

**Bug this section now guards** (first device build): the plate was drawn into a
*square* texture on a *square* board, so it landed wherever the border left room
— and the paper, centred on the aim point, covered its lower half. The board is
now an explicit rectangle whose texture carries the same aspect ratio, and a test
asserts `plateBottom > paperTop` in both unit systems.

### 5.2 What replaces the berm

Three things together, all of which the layout already supports:

1. **A dark conifer mass 15–25 m directly behind every station.** §6.2 confirms
   the corridor geometry allows this at all four. Dark evergreen behind a white
   board is higher contrast than a dirt berm ever was.
2. **The low morning sun (§9) lights the board faces at 0.56 of full** while the
   woods behind them sit in their own shade — the backdrop is self-darkening.
3. **Fog is tuned to leave targets alone** (§9.5): the 200 m board sits at ~2 %
   fog, so it never washes toward sky colour the way the mountains did.

### 5.3 Lane markers (owner: yes, include)

Insurance against losing a station in a 10.5° fan.

- **Number plate** on the top edge of each board — bright orange
  (`0xe8722c`), height = board × 0.33, black numerals. At 200 m that is a 0.79 m
  plate ≈ 4.0 mrad, with digits ≈ 2.7 mrad — about 6 % of the view height at 10×,
  comfortably readable. Sizing it as a fraction of the board means it stays
  constant-angular like everything else.
- **Lane stake** beside each frame: a 1.2 m post with an orange band, giving a
  second, smaller cue when the board itself is edge-on or shadowed.
- **Distance legend on the plate** — "25" / "50" / "100" / "200" plus the unit,
  drawn from the active unit system so the imperial layout reads "100 YD".

---

## 6. Engine / code changes

### 6.1 Corridor model (new — replaces the single-lane box)

`environment-config.ts` currently models one straight flat corridor
(`laneHalfWidthM`, `laneBlendM`, `zFlatToM`, `zBlendM`) plus a uniform `minAbsX`
tree-rejection rule. That generalises to a **fan of terminating wedges**:

```ts
interface Corridor {
  azimuthRad: number;   // from downrange, + = right
  reachM: number;       // groundRun + OVERRUN_M (10 m)
}

// half-width grows with radius but never below a floor
const corridorHalfWidth = (r: number) => Math.max(W_MIN_M /*1.8*/, ALPHA /*0.012*/ * r);

function insideAnyCorridor(x: number, z: number): boolean {
  const r = Math.hypot(x, z);
  return corridors.some(c => {
    if (r > c.reachM) return false;                       // ← the key line
    const perp = Math.abs(x * -Math.cos(c.azimuthRad) - z * Math.sin(c.azimuthRad));
    return perp <= corridorHalfWidth(r);
  });
}
```

That single `r > c.reachM` early-out is what lets the woods close in behind each
near target while the far lanes stay open.

- **Terrain sampler:** `height = floorY(r)` inside any corridor (the §2.2 knoll
  profile), `knollOutside(x,z) + relief + hills` elsewhere, smoothstep-blended
  across the corridor edge over ~4 m.
- **Tree / scatter placement:** replace `drawClearOfLane`'s `minAbsX` test with
  `!insideAnyCorridor(x, z)` **inflated by the tree radius** (1.5 m). The
  `allowOnLane` band flag becomes unnecessary — corridor termination does that
  job correctly and automatically.

### 6.2 Where trees can actually go

Verified with a 1.5 m tree radius (not a point sample):

| behind the… | 8 m | 15 m | 25 m |
|---|---|---|---|
| 25 m target | no | no | **yes** |
| 50 m target | no | **yes** | **yes** |
| 100 m target | no | **yes** | **yes** |

So each station gets a genuine wall of woods 15–25 m behind it. Total plantable
area inside r < 215 m: **96.4 %**.

Keep the heavy behind-target block for the **200 m** station at z < −240 m, per
the Test Range's existing ≥40 m rule so misses disappear into the woods rather
than clipping trunks. With no berms anywhere (§5), the 25/50/100 m stations get
their dark backdrop from the 15–25 m tree mass above; a miss there flies on into
that mass, which is the desired behaviour, not a problem to design around.

### 6.3 Registry + scene

- `ranges.ts`: new `WOODED_ZERO` definition — `sceneType: 'wooded-zero'`,
  `unitCharacter: 'both'`, `zeroable: true`, stations 25/50/100/200 with an
  `azimuthDeg` field added to `RangeStation` (existing `side: -1|0|1` is too
  coarse for a fan; keep `side` for the old bay or derive it).
- New `wooded-zero-config.ts` (pure data, mirroring `sight-in-config.ts`) +
  `WoodedZeroScene.ts` — see §7, it is mostly composition, not new logic.
- `ScopeView`'s scene branch gains one case.

---

### 6.4 Ballistics caveat to log

`firing-solution.ts` is flat-fire: it measures drop against a target plane at
`z = −R` with `R` treated as horizontal. With Δy = 0.70 m the discrepancy is
~0.0002 mm — unmeasurable — so **no solver change is required**. But it should be
logged explicitly in `Wiki/_gaps.md` as a known simplification rather than left
implicit, since a future range with real terrain relief (targets up- or downhill
by tens of metres) *will* need the LOS-relative formulation.

---

## 7. Inherited behaviour — zeroing flow and target inspection

Owner (2026-07-26): this range inherits the zeroing options and target inspection
from the existing Zero Range. That is the right call and it is mostly a
*decoupling* job, not new feature work — the behaviour already exists and is
already scene-agnostic in the places that matter.

### 7.1 What comes across

Everything the sight-in bay does with paper:

| behaviour | where it lives today |
|---|---|
| hit marks on the face (green disc, black outline) | `sight-in-marks.ts` `createTargetFace` |
| running group centroid (magenta ring, D5) | `setCentroid` / `clearCentroid` |
| Clean target / Clean all (D9) | `ScopeView` ~1153–1161, `cleanTarget` / `cleanAll` |
| Inspect — head-on close-up of the engaged face (D10) | `inspectOpen` state + `getFaceCanvas` |
| gear-driven true solve per station (D2) | `sightInSolve` |
| per-station scatter sim cache | `sightInScatterAt` |
| aimed-target pick for paper | `findAimedTarget` (sight-in variant) |
| apply-zero from the group centroid (2.3d) | `ScopeView` ~1183–1217 |
| group reset when the dial changes | ~1215–1217 |

`sight-in-marks.ts` and `sight-in-target-texture.ts` are already independent of
the scene — they take a size and some art and hand back a canvas. They get reused
verbatim, not copied. Only the file names read as sight-in-specific; consider
renaming to `paper-target-marks.ts` / `paper-target-texture.ts` when they gain a
second caller.

### 7.2 The actual coupling to break

The logic is generic; the *gates* are not. Four places test the concrete scene
type where they mean to test a capability:

| line | today | should be |
|---|---|---|
| `ScopeView.tsx:184` | `isSightInHud = sceneType === 'sight-in'` | `rangeDef.targetKind === 'paper'` |
| `ScopeView.tsx:258` | `isSightIn = sceneType === 'sight-in'` | scene-builder switch only |
| `ScopeView.tsx:300` | wind markers branch on `sceneType === 'test-range'` | a `windMarkers` capability |
| `ranges.ts:81` | comment: *"zeroing flow is hard-wired to the sight-in scene"* | delete — it stops being true |

**Proposed change, small and contained:**

1. Add `targetKind: 'paper' | 'steel'` to `RangeDefinition`. `zeroable` already
   exists and stays; it answers a different question (may you *store* a zero
   here) from `targetKind` (what do shots *hit*).
2. Extract a `PaperBayScene` interface — `targets[]`, `paintHit`,
   `setGroupCentroid`, `clearGroupCentroid`, `cleanTarget`, `cleanAll`,
   `getFaceCanvas`. `SightInScene` already implements every one of these; the
   change is declaring the interface and typing ScopeView's local against it
   instead of against `SightInScene` concretely.
3. `WoodedZeroScene` implements the same interface. The ~700 lines of paper-bay
   fire path, zeroing flow, Clean and Inspect in `ScopeView` then work on the new
   range **without modification**.

This is worth doing properly rather than adding a second `|| sceneType ===
'wooded-zero'` to each gate — there will be a fourth and fifth paper bay, and
each added disjunction is a place for the two ranges to silently diverge.

### 7.3 Wind on a zero range — DECIDED 2026-07-26

The existing bay shows the **dialled mean only** with no gusts (D4), which is the
right call for zeroing: a group is only honest if wind isn't smearing it.

**Decision (owner):** a very light breeze that visibly moves the **tree tops
only**, and does not affect zeroing.

Spec:

| | value |
|---|---|
| mean wind | 1–3 mph (0.45–1.34 m/s), steady |
| gust scale | 0 (or near-0) — no gust smear on the group |
| vegetation response | height-weighted: canopy tops move, trunks and grass essentially still |
| ballistic effect | live and honest — it is the real field, just small |

At 1.34 m/s full-value crosswind the drift at 100 m is on the order of a few
millimetres — well inside group size, so a zero taken here is valid. The wind is
not faked or suppressed for the solver; it is simply small enough not to matter,
which is exactly what a real calm morning gives you.

The height weighting is what makes this read correctly: bend factor scales with
height above the trunk base (§9.6 already builds the bend that way), so a 1 m/s
field that barely stirs the grass still visibly moves a 10 m canopy. That is also
true to life, since wind speed increases with height above ground.

> **Implementation note.** Do *not* special-case the solver. The vegetation and
> the bullet must read the same field, or §9.6 loses the property that makes it
> worth building.

## 8. Dual units — why it's nearly free

The concern was that supporting round yards *and* round metres would complicate
the geometry. It doesn't, because of one arithmetic accident:

> **A yard is shorter than a metre, at every nominal distance.**
> 200 yd = 182.88 m < 200 m; 100 yd = 91.44 m < 100 m; and so on.

So if the **world is built for the metric layout** — corridors, terrain, forest,
berms — the imperial targets simply sit **short on the same lane axes**, always
inside already-cleared ground. The metric layout is a strict superset. Nothing is
regenerated, no azimuth moves, and the forest is identical in both modes.

| imperial station | sits at | inside its metric corridor | corridor half-width vs board half-width | woods start behind it |
|---|---|---|---|---|
| 25 yd | 22.85 m | yes | 1.80 m vs 0.39 m (+1.41) | 12 m |
| 50 yd | 45.71 m | yes | 1.80 m vs 0.39 m (+1.41) | 14 m |
| 100 yd | 91.44 m | yes | 1.80 m vs 0.55 m (+1.25) | 19 m |
| 200 yd | 182.88 m | yes | 2.19 m vs 1.10 m (+1.10) | 27 m |

Everything else re-verifies cleanly for the imperial layout with **zero retuning**:

| | metric | imperial |
|---|---|---|
| face | 44 cm (MIL) | 55.9 cm / 22 in (MOA) |
| board (same at every station, §5.1) | 0.66 × 0.84 m | 0.84 × 1.06 m |
| lane plate | `25 M` … `200 M` | `25 YD` … `200 YD` |
| min occlusion margin | +2.00° | **+1.21°** |
| steepest sight line vs 10 % grade | 1.60° | **1.75°** |
| min knoll clearance | +0.20 m | **+0.20 m** |
| sight box | 10.5° × 1.40° | **10.5° × 1.54°** |
| all four in view at/below | 4.1× | **4.1×** |

The imperial case is the tighter one for occlusion — its board is sized off the
27 % larger MOA face while its stations sit 9 % closer, so the near board subtends
more. Everywhere else (sight-line steepness, knoll clearance) the metric case
remains binding. Neither needed retuning.

### What this actually costs in code

Exactly what `sight-in-config.ts` already does, plus one rule:

```ts
const toSI = (nominal: number) => metric ? nominal : yardsToMeters(nominal);
// azimuths are SHARED constants — they do not depend on the unit system
// corridors/terrain/forest are ALWAYS generated from the METRIC station set
```

So: one conversion call, one comment explaining the superset invariant, and one
test asserting `groundRun(imperial_i) <= corridorReach(metric_i)` for all four
stations so a future tweak to the fan or the corridor profile can't silently
break it. That's the whole delta.

The one thing that must **not** be unit-dependent is the corridor/forest
generation. If someone later regenerates the environment from the imperial
station set, the woods shift between unit modes and the superset guarantee is
gone. Hence the assertion.

---

## 9. Scenery — an upgrade to the environment module, not an import

Owner direction (2026-07-26): *don't just import the existing scenery, improve
on it.* The upgrades below land in the **shared** `range/environment/` module
behind config flags, so the Test Range can opt in once they're proven rather than
forking a second environment system.

Read the existing module's history before touching it: the config comments in
`test-range-config.ts` record three rounds of owner feedback where trees rendered
near-black and mountains washed out. Both were **symptoms of the lighting and fog
model**, not the palettes that kept getting retuned. Fixing the causes is most of
this section.

### 9.1 Lighting — early morning, low sun *(the biggest single win, and free)*

Current rig is `DirectionalLight` at `(-250, 350, 150)` — a ~54°-elevation midday
sun. That is the least flattering angle available: it flattens the terrain relief,
lights canopy tops that the shooter can't see, and leaves every shooter-facing
canopy surface on hemisphere fill alone. Hence "the trees are too dark" surviving
a full palette brightening.

| | value | why |
|---|---|---|
| sun elevation | **14°** | rakes the terrain so relief reads; 4× shadow length |
| sun azimuth | **−125°** (behind-left of the shooter) | see below |
| `sun.position` | `(-318, 97, 223)` | unit direction × 400 |
| sun colour / intensity | `0xffd9a3` / 1.35 | warm morning |
| hemisphere | sky `0x93b4e0`, ground `0x4a5236`, 0.55 | cool fill in shade — the warm/cool split is what sells morning |

**Why −125° and not a prettier front-raking angle.** Board faces point back at the
shooter, so their illumination is `dot(sunDir, +z)`:

| sun azimuth | board faces lit | shadows fall |
|---|---|---|
| −65° | 0.00 (edge-on) | toward the shooter, targets backlit |
| −85° | 0.00 (edge-on) | toward the shooter, targets backlit |
| −105° | 0.25 | right / downrange |
| **−125°** | **0.56** | **right / downrange** |

Anything in front of the shooter backlights every target board — which directly
fights §5. −125° keeps the sun low and raking (14°) while putting it behind the
firing line, so boards are lit at 0.56 of full, tree shadows stretch *away* from
the shooter, and the shooter is never in his own shadow.

### 9.2 Shadows — real map, near field only

`ScopeView`'s renderer never enables `shadowMap`, so today every `castShadow` flag
in the codebase is inert (the `lighting.ts` header comment says as much). Enable:

```ts
renderer.shadowMap.enabled = true;
renderer.shadowMap.type    = THREE.PCFSoftShadowMap;
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
// tight ortho box over the near field only
sun.shadow.camera.left = -100; sun.shadow.camera.right = 100;
sun.shadow.camera.top  =  100; sun.shadow.camera.bottom = -100;
sun.shadow.camera.near = 200;  sun.shadow.camera.far    = 600;
sun.shadow.normalBias  = 0.08;   // see gotcha
sun.shadow.bias        = -0.0005;
```

Casters: trees (InstancedMesh casts fine), target frames, posts, rocks, bushes.
Receivers: terrain, trees, frames. Beyond ~120 m shadows fade out and nothing
notices, because §9.5's aerial perspective has taken over by then.

> **Gotcha — shadow acne.** A 14° sun over a near-flat plane is the worst case
> for depth-buffer shadow acne; the default bias will stripe the entire lane.
> `normalBias` (not `bias` alone) is the fix, and it must be tuned *at the final
> sun angle* — retuning the sun later invalidates it.

> **Gotcha — alpha-tested foliage.** The needle cards in §9.3 need a
> `customDepthMaterial` carrying the same alpha map, or they cast solid
> rectangular shadows.

Budget: ~190 trees in a handful of instanced draw calls plus a 96×192 terrain
plane re-rendered once into the shadow map. Cheap enough for iPad.

### 9.3 Tree silhouette variety

Today every conifer is the identical 3-cone stack (`buildConiferCanopyGeometry`)
and every broadleaf the identical 4-icosahedron blob, varied only by **uniform**
scale and Y rotation. The eye reads that repetition instantly — it is the main
reason the woods look synthetic.

- **3–4 canopy variants per species**, each a differently-merged geometry. Add
  `variantIndex` to `TreePlacement`; one InstancedMesh per variant. 3 variants ×
  2 species × 2 parts = 12 draw calls, still trivial.
- **Non-uniform scale** — independent `scaleY` and `scaleXZ` (say 0.75–1.35 and
  0.85–1.2). Uniform-only scaling is what makes a forest look like one tree
  photocopied.
- **Per-tree tilt** — up to 4° about a random horizontal axis.
- **Alpha-mapped needle cards** — 2–3 crossed quads with an alpha-tested needle
  cluster texture breaking the hard cone edge. `alphaTest`, **not** `transparent`,
  so there is no sort order to get wrong.
- **Vertex-colour depth in the canopy** — darken toward the trunk and underside.
  Nearly free, and it reads as self-shadowing.

> **Gotcha, already paid for once.** `trees.ts` carries a comment about
> `vertexColors: true` with no bound colour attribute rendering solid black. If
> the vertex-colour change above is made, the attribute must actually be written
> onto every merged canopy geometry, or that bug returns identically.

### 9.4 Ridgeline mountains

Replace the 12 instanced `ConeGeometry` peaks with **two overlapping ridge
silhouettes** — 1-D noise heightlines extruded into strips, at ~1100 m and
~1500 m, the far one lighter and lower-contrast. Two draw calls, a couple of
hundred triangles, and vastly more convincing than cones because real distance
reads as *overlapping silhouettes*, not discrete objects.

The existing snow-gradient canvas texture can be reused on the near ridge.

### 9.5 Aerial perspective

`THREE.Fog` is linear-smoothstep between `nearM` and `farM`, which is what put
the mountains at 75–99 % fog colour and made three rounds of texture darkening
produce no visible change. Replace with `FogExp2`, whose falloff is gentle where
it matters:

| density | 100 m | 200 m | 400 m | 1000 m | 1350 m |
|---|---|---|---|---|---|
| 6.0e-4 | 0.4 % | 1.4 % | 5.6 % | 30 % | 48 % |
| **7.45e-4** | **0.6 %** | **2.2 %** | **8.5 %** | **43 %** | **64 %** |
| 9.0e-4 | 0.8 % | 3.2 % | 12 % | 56 % | 77 % |

`7.45e-4` leaves the 200 m board effectively unfogged (2 %) — protecting §5's
contrast requirement — while the ridge sits at 43–64 %, a real gradient with the
ridge albedo still visible through it.

Two refinements on top:

- **Fog colour sampled from the sky gradient at the horizon**, not a hand-picked
  constant, so distant geometry blends into the sky actually being rendered.
- **Desaturate with distance** as well as tint. Distance reads as *air* when
  saturation falls; tinting alone reads as a grey filter laid over the image.

### 9.6 Wind-driven vegetation *(the one that earns its keep twice)*

Tie tree and grass sway to the **existing curl-noise wind field**
(`engine-bridge/wind-field.ts`) rather than a decorative sine. The vegetation then
becomes a legitimate wind indicator alongside the flags and socks — in a game
whose entire subject is reading wind, the scenery doing real work is worth more
than the scenery looking nice.

Implementation that keeps instancing and stays honest:

1. Sample the real field on a coarse grid (16 × 16 over the near field) a few
   times a second on the CPU — the field is already sampled per shot, this is the
   same call.
2. Upload as a small `DataTexture` (RG = wind vector).
3. Bend canopy vertices in the vertex shader via `onBeforeCompile`: look up the
   instance's world position in that texture, bend proportional to height above
   the trunk base, add a small per-instance phase offset so the forest doesn't
   pulse in unison.

Grass tufts use the same texture with a higher bend factor and faster phase.

> **Design note.** Keep the bend *visibly proportional* to the modelled wind
> speed. If a player can eventually estimate wind from canopy movement, that is a
> feature — but only if the mapping is consistent, so it wants a documented
> speed → bend-angle curve rather than an art-directed fudge.

### 9.7 Sequencing

Independent of the range itself; can land in any order:

1. Lighting (§9.1) — biggest win, smallest change, do it first and re-judge
   everything else against it. Several existing palette hacks may become
   unnecessary.
2. Fog (§9.5) — removes the mountain-albedo fight.
3. Shadows (§9.2) — tune bias *after* 1.
4. Tree variety (§9.3).
5. Ridgelines (§9.4).
6. Wind sway (§9.6) — largest new surface area, and the only one needing engine
   data, so last.

---

## 10. Decisions taken (2026-07-26)

| question | decision |
|---|---|
| Units | `unitCharacter: 'both'` — round yards *or* round metres; world built metric, §8 |
| Lane markers | **In.** Orange number plate on each board + a lane stake, §5.3 |
| Additive or replacement | **Additive.** A fourth range. Zero Range stays for now; may retire later, not part of this work |
| Berms | **None anywhere.** Contrast comes from light + backdrop, §5.2 |
| Lighting | Early morning, low sun, §9.1 |
| Shadows | Real shadow map, near field only, §9.2 |
| Scenery upgrades | All four: tree variety, ridgelines, aerial perspective, wind-driven vegetation, §9.3–9.6 |
| Shooter position | Natural knoll, §2.2 |
| Fan width | 10.5°, §3.1–3.2 |
| Environment module | **Shared.** Upgrades land in `range/environment/` behind config flags; other ranges can adopt them, §9 |
| Zeroing + inspection | **Inherited** from Zero Range via a `PaperBayScene` interface, not reimplemented, §7 |
| Wind | Very light, tree-tops only, no effect on zeroing; same field feeds solver and vegetation, §7.3 |

## 11. Build stages

Protocol-sized, in dependency order, **STOP after each** (execution-protocol §2.8).
Mirrors how the Test Range was staged.

| Stage | Scope | Touches |
|---|---|---|
| **1** ✅ | Registry + pure config + corridor model + tests. No THREE, no scene, no ScopeView. | `ranges.ts`, new `wooded-zero-config.ts`, corridor fns in `environment-config.ts`, tests |
| **2a** ✅ | `PaperBayScene` interface extraction + ScopeView re-gated onto `targetKind`. Behaviour-preserving refactor — no new scene. | new `paper-bay-scene.ts`, `SightInScene.ts`, `ScopeView.tsx`, `ranges.ts` |
| **2b** ✅ | `WoodedZeroScene` + scene branch. Bay renders and is shootable; zeroing/Clean/Inspect inherited. Range joins the landing screen. | new `WoodedZeroScene.ts`, `ScopeView.tsx`, `ranges.ts` |
| **3** ✅ | Environment core: lighting (§9.1), fog (§9.5), shadows (§9.2) — shared module, config-flagged. | `environment/lighting.ts`, `sky.ts`, `ScopeView.tsx` renderer |
| **4a** ✅ | Tree silhouette variety (§9.3). | `environment/trees.ts`, `environment-config.ts` |
| **4b** ✅ | Ridgeline mountains (§9.4). | `environment/mountains.ts`, `environment-config.ts` |
| **5** ✅ | Wind-driven canopy sway (§9.6) + the documented bend curve. | new `environment/wind-sway.ts`, `trees.ts`, `index.ts`, `ScopeView.tsx` |

## 12. Still open

1. ~~**Does the Test Range adopt the new look?**~~ **Resolved by checking who
   actually uses the shared module.** Only `TestRangeScene` and `WoodedZeroScene`
   call `buildEnvironment`; **Range A and the original Zero Range build their own
   lights** (`RangeScene.ts`, `SightInScene.ts`) and are untouched by §9. So the
   blast radius is the Test Range only — and per its own charter it exists as
   "a prototype for upgrading Range A / Zero Range's visual world before touching
   those live ranges", so inheriting the new look is its purpose, not a risk.

   **Confirmed on device 2026-07-26** — owner: *"Test range is fine, keep the
   changes."* The upgrade is permanent there, not a preview.

   One genuinely global piece remains: `renderer.shadowMap.enabled` lives on the
   renderer in `ScopeView`, so §9.2 turns it on for every range. Appearance only
   changes where objects set `castShadow`/`receiveShadow` — i.e. nowhere but the
   two environment-module scenes — but the shadow pass costs a little on all of
   them. Worth measuring on device before assuming it is free.
2. ~~**Wind → bend-angle curve**~~ **Resolved in Stage 5.** The mapping is
   `bendDeflectionM()` in `environment/wind-sway.ts` — exported as a pure
   function specifically so it is inspectable and testable rather than buried in
   GLSL. Linear in wind speed (so doubling the wind doubles the movement),
   quadratic in height above the trunk base, clamped at both ends. 22 tests
   assert those properties.
3. ~~**Rename `sight-in-marks.ts` / `sight-in-target-texture.ts`**~~ **Done
   2026-07-26.** Now `paper-target-marks.ts` / `paper-target-texture.ts`, with
   `rasterizeSightInArt` → `rasterizeZeroingArt` (it loads
   `zeroing-target-<variant>.svg`, so "zeroing" matches the asset). Only the two
   genuinely SHARED modules were renamed; `SightInScene.ts` and
   `sight-in-config.ts` keep their names because they really are specific to the
   original grass bay. The SVG assets were left alone — their names are already
   unit-neutral, and renaming them would mean touching the PWA precache manifest
   and re-verifying offline launch for no gain.

**No open items remain on this plan.**

---

## Sources

- Inclination error derivation and the `g·H²/(4v₀²)` closed form: verified
  numerically against a fitted-drag point-mass model at 25–300 m.
- Near-zero path table: same model, 5 cm sight height, 100 m and 200 m zeros.
- Fan, occlusion, plantability, dual-unit superset and sun-angle tables: computed
  directly from the parameters in §2–§3; all figures in this doc are outputs of
  those runs, not estimates.
- Existing conventions read from `GameBuild/app/src/range/sight-in-config.ts`,
  `test-range-config.ts`, `environment/environment-config.ts`, `environment/trees.ts`,
  `environment/lighting.ts`, `environment/terrain.ts`, `environment/mountains.ts`,
  `ranges.ts`, and `GameBuild/app/src/scope/scope-projection.ts`.
