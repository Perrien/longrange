# Popper Star — build plan

`Status: **APPROVED 2026-08-07. PS1 + PS2 DONE — owner-confirmed on device (incl. two defect rounds). PS3 next.**` · `Date: 2026-08-07` · `Plan slug: popper-star`
`Audience: the executing coding agent` · `Owner decisions: locked below (§6)`

> Read `Design/execution/execution-protocol.md` first. This plan declares its own
> pause points (§2b) and commit points (§2c). **Three tasks, two owner-verification
> stops.** Save this plan to `Design/Plans/popper-star.md` before starting
> (memory: plans live in `Design/Plans/`).

---

## 0. Context — what is being built and why

The owner asked for a new target on the Test Range: a **simplified Texas Star**.
Five evenly-spaced 60 cm arms on a slowly rotating hub; a 10″ bright-purple
popper plate at each arm tip that folds back when hit and **stays down**; a fixed
12″ plate at the hub that acts as a **reset switch**, standing every downed plate
back up. One revolution every 10 seconds.

Why it matters beyond one more target: **nothing in the game moves continuously
today.** Every reaction shipped so far is a discrete state machine — a C++ swing
that settles and snaps back, a knockdown that topples, a flip between fixed stops.
A rotating carrier is the first target whose *hit-testable position changes every
frame*, which forces the question `PROGRESS.md` deferred during the dueling-tree
build ("hit-testing against the mid-swing pose"). `Design/feature-catalog.md` §F
lists **Texas star** under "Not built" alongside swingers/spinners — this plan
builds the mechanism those all need, not just this one target.

Intended outcome: the Test Range gains a rotating, self-resetting star that
teaches timing and a small amount of lead, and the codebase gains a reusable
`star-arm` mount + `reset-switch` reaction that a future swinger or plate rack
can hang off.

**Nothing is removed from the Test Range** and no range config changes (§6 D1).

---

## 1. READ THIS BEFORE YOU WRITE ANY CODE — most of it already exists

The Target × Mount × Group system already does ~80% of this. Do not invent
parallel machinery.

| Need | Already handled by | Notes |
|---|---|---|
| A 10″ purple disc target | `TargetType` + `paint.palette` + `{kind:'fill', color:'$face'}` | Exactly what `DUELING_TREE_PADDLE` (`targets/dueling-tree.ts`) does. A placement can override any palette slot in JSON. |
| Plate falls when struck, latches, rises on command | `range/targets/knockdown.ts` — `strikeKnockdown`, `stepKnockdown`, `resetKnockdown`, `seedFallRate`, `steelPlateMassKg` | Pure, tested. Integrates `θ̈ = (3g/2L)·sin θ`. **`downDwellS: Infinity` already means "never auto-reset"** — `stepKnockdown`'s `since >= cfg.downDwellS` is never true, and `validateMountType`'s `downDwellS >= 0` passes. No new physics. |
| Down plate is out of play | `isStanding(instanceId)` + `ScopeView.tsx:1202`'s rack filter | A folded plate is already unhittable and un-aimable. |
| Stand a whole group back up | `resetDownTargets(groupId?)` (`steel-reactions.ts:580`) | The exact primitive the hub needs. Today only called from COMMIT. |
| Per-frame pose written into a shared `InstancedMesh` | `poseKnockdown` / `poseFlip` + `steel-reactions.ts:526`'s `update` loop | Copy the pivot-compose idiom: `fromPivot · spin · toPivot · rest`. |
| Hit test tracking a TS-driven pose | `game/shot.ts` reads `plate.position` live; the flip branch mutates `plate.position.x` on strike (`steel-reactions.ts:495`) | Precedent exists — it's just *discrete* today. |
| Splats landing in the right place on a moved/rotated plate | `reaction.setOrientation(...)` + the `enginePos` impact re-expression (`steel-reactions.ts:154-163`, `:444-479`) | **Both are mandatory here.** The engine has no `setPosition`; `recordImpact` computes `local = inverse(orientation_)·(impact − position_)` against a frozen `position_`. |
| Furniture drawn once per group | `TestRangeScene.addFurniture` (`:178`), `addTreePost` (`:286`) | `addTreePost` also shows the house style of **recovering** geometry from data rather than duplicating a constant. |
| A per-frame scene clock | `SteelSceneApi.update?(dt, timeS, …)` → `ScopeView.tsx:1838` `range?.update?.(dt, st.t, …)` | `st.t` is the authoritative absolute clock. |

**Four `tsc`-enforced switches will fail until you extend them.** This is by
design; don't work around it:
1. `TestRangeScene.addFurniture` — exhaustive `default: { const unhandled: never = … }` (`:215`).
2. `test-range-targets.ts` `plateCentreYM` — explicit `: number` return (`:49-71`).
3. `validateMountType` — add branches for the new reaction modes.
4. Roster tests assert exact lists (§5, PS1/PS2 file lists). **Update them, never delete them.**

---

## 2. The model — how the star maps onto the three axes

| Axis | Value |
|---|---|
| Target type | `star-popper` — 10″ disc, purple face. `star-hub-plate` — 12″ disc, steel white. |
| Mount | `star-arm` (reaction `'star-arm'`, furniture `'star-hub'`) · `star-hub-reset` (reaction `'reset-switch'`, furniture `'none'`) |
| Group | `test-star-arms` — the five arm plates. The hub plate is **not** in it (a group's members must share a mount, `placements.ts:239` — the same constraint the hostage assembly hit). |

Two new `ReactionMode` members, not one:

- **`'star-arm'`** — a knockdown plate carried on a rotating arm. Reuses
  `knockdown.ts` verbatim for the fall; what's new is that the *rest frame* is a
  function of time and the hinge is **radial**, not at the plate's base.
- **`'reset-switch'`** — a bolted plate that takes paint and, on strike, calls
  `resetDownTargets(groupId)`. The group it resets comes from the **placement**
  (`resetsGroupId`), not the mount, so the mount stays reusable.

New `MountFurniture` member: **`'star-hub'`** — the static post plus the rotating
carrier (hub boss + five arms).

New `MountType` field:

```ts
/** Rotating-carrier spec, consumed by the star branch of `steel-reactions.ts`. */
export interface StarArmSpec {
  /** Seconds per revolution of the carrier. */
  periodS: number;
  /** Rotation sense SEEN BY THE SHOOTER: -1 = clockwise, +1 = counter-clockwise. */
  sense: 1 | -1;
  /** Angle off the arm's rest plane at which a struck plate latches folded (deg). */
  fallAngleDeg: number;
  /** Reset rise rate (deg/s) — mechanical, so constant. */
  resetRateDegS: number;
}
```

`validateMountType` additions: `'star-arm'` requires `star` and forbids
`knockdown`/`flip`; `'reset-switch'` forbids `star`/`knockdown`/`flip`; only a
`'star-arm'` mount may carry `star`; `periodS > 0`, `fallAngleDeg ∈ (0, 90]`,
`resetRateDegS > 0`.

**The hub is derived, never authored twice.** Five evenly-spaced arm vectors sum
to zero, so the hub is exactly the **centroid** of the group's five authored
positions, and each plate's arm index and radius fall out of
`atan2`/`hypot` against it. This is the `addTreePost` idiom ("recover the post x
from the mount's own stops") applied to a ring. No new placement fields for
geometry.

---

## 3. Geometry — every number, with its derivation

All of it lives in one new pure module, `range/targets/popper-star.ts`, alongside
the two target types — mirroring `dueling-tree.ts`.

### 3.1 Sizes

| Constant | Value | Derivation |
|---|---|---|
| `STAR_ARM_COUNT` | `5` | Owner. |
| `STAR_ARM_PITCH_RAD` | `2π/5` = 72° | 5 evenly spaced. |
| `STAR_ARM_LENGTH_M` | `0.60` | Owner: "each one 60 cm long". This is the **plate-centre radius**. |
| `STAR_PLATE_INCHES` | `10` → `0.254 m` | Owner. `inchesToMeters` — never an inline literal (protocol §4.4). |
| `STAR_HUB_PLATE_INCHES` | `12` → `0.3048 m` | Owner. |
| `STAR_SWEPT_RADIUS_M` | `0.60 + 0.127` = `0.727` | Arm + plate radius. The footprint every clearance check uses. |
| `STAR_PERIOD_S` | `10` | Owner: 1 rev / 10 s. |
| `STAR_OMEGA_RAD_S` | `2π/10` = `0.6283185307` | Derived; do not hard-code. |
| `STAR_POST_RADIUS_M` | `0.0381` (3″ dia) | Same as `DUELING_TREE_POST_RADIUS_M` — a post carrying five arms, not standing alone. |
| `STAR_ARM_RADIUS_M` | `0.019` (1.5″ dia) | Visible at 90 yd; the dueling tree's arms were skipped for being a few pixels, these are 0.47 m long and will read. |
| `STAR_HUB_BOSS_RADIUS_M` | `0.10` | Hidden behind the 12″ hub plate (radius 0.152). |

Radial gap between the hub plate's rim and an arm plate's inner rim:
`0.60 − 0.127 − 0.1524 = 0.3206 m`. No overlap, so `game/shot.ts`'s
first-hit-wins rack walk can never confuse them (the `HOSTAGE_CLAMP_3WAY`
war story in `mount-registry.ts:118-152` is what that check exists to avoid).

### 3.2 Kinematics — the single source of truth

```ts
/** Carrier rotation about world +Z at scene time `timeS` (rad).
 *  NEGATIVE for clockwise-as-seen-by-the-shooter: the shooter looks down −Z, so
 *  Rz(+θ) takes +X→+Y (right→up), which is COUNTER-clockwise from their side. */
export function starCarrierRotationZ(timeS: number): number;

/** Arm `i`'s plate centre, as an offset from the hub, at `timeS`.
 *  φ = i·72° + ω·t measured CLOCKWISE FROM STRAIGHT UP, so
 *  dx = R·sin φ, dy = R·cos φ. */
export function starArmOffsetM(i: number, timeS: number, radiusM?: number): { dx: number; dy: number };

/** Hub centre recovered from a group's plate positions — the exact centroid. */
export function starHubFrom(positions: readonly { x: number; y: number }[]): { x: number; y: number };

/** Arm index and radius for one plate, given the hub. `restAngleRad` is φ at t=0. */
export function starArmOf(hub: {x:number;y:number}, p: {x:number;y:number}): { restAngleRad: number; radiusM: number };
```

A test must tie the two rotation representations together, because the scene sets
`group.rotation.z = starCarrierRotationZ(timeS)` on the arm meshes while
`starArmOffsetM` positions the plates — a sign error would slide the plates off
their arms:

> `starArmOffsetM(i, t)` equals `starArmOffsetM(i, 0)` rotated about +Z by
> `starCarrierRotationZ(t)`, for every `i` and a sweep of `t`.

### 3.3 Placement — 90 yd, hub at x = +1.19 m, hub centre y = 1.20 m

Distance **90 yd (82.296 m)** is exclusive: 50/60/75/80/100 yd are taken, and
`ScopeView.tsx:1197` filters the hittable rack by *exact* `distanceM` equality.

Lateral placement was chosen in the **angular** frame, because occlusion between
targets at different distances is an angle problem, not a metres problem.
Occupied bands seen from the eye (mrad right of boresight):

```
tree −43.9…−38.1 │ IDPA −29.6…−22.9 │ gong −1.7…+1.7 │ popper a 27.3…33.9
popper b 42.6…49.3 │ hostage 50.9…65.7
```

The star needs `2 × 0.727/82.296 = 17.66 mrad`. Centring it in the
`+1.67 … +27.29` gap gives `14.48 mrad` → `x = 14.48e-3 × 82.296 = 1.19 m`, and
it spans `5.62 … 23.29 mrad` — **3.96 mrad clear of the gong, 4.00 mrad clear of
popper a.** Swept extent `0.463 … 1.917 m`, well inside `NO_HILL_CORRIDOR`'s
4.572 m half-width, so the ground under it is flat and no config changes.

Hub centre `y = 1.20 m`: over a revolution the lowest plate rim reaches
`1.20 − 0.727 = 0.473 m` (clear of the ground) and the highest `1.927 m`. Post
height = 1.20 m.

**Authored placements** (append to the END of the `test-range` block — the
`_note` at `placements.data.json:8` warns that order is load-bearing because
ScopeView auto-commits `plates[0]`, the gong):

| id | xOffsetM | centreYM | derivation |
|---|---|---|---|
| `test-star-arm-1` | `1.190000000` | `1.800000000` | hub + `starArmOffsetM(0, 0)` = (0, +0.60) |
| `test-star-arm-2` | `1.760633910` | `1.385410197` | hub + (0.60·sin72, 0.60·cos72) |
| `test-star-arm-3` | `1.542671151` | `0.714589803` | hub + (0.60·sin144, 0.60·cos144) |
| `test-star-arm-4` | `0.837328849` | `0.714589803` | hub + (0.60·sin216, 0.60·cos216) |
| `test-star-arm-5` | `0.619366090` | `1.385410197` | hub + (0.60·sin288, 0.60·cos288) |
| `test-star-hub` | `1.190000000` | `1.200000000` | the hub itself |

Arms: `typeId: 'star-popper'`, `mountId: 'star-arm'`,
`groupId: 'test-star-arms'`, `distanceYards: 90`, `widthInches: 10`, **no
`zNudgeM`** (must stay 0 — an arm plate has no coplanar neighbour, and the fold
already carries it downrange).
Hub: `typeId: 'star-hub-plate'`, `mountId: 'star-hub-reset'`,
`distanceYards: 90`, `widthInches: 12`, `resetsGroupId: 'test-star-arms'`.

Those x/y columns sum to exactly `5 × 1.19` and `5 × 1.20`, so
`starHubFrom` recovers `(1.19, 1.20)` to within 1e-9. **A test must assert that**
— it is the invariant every derived quantity rests on.

### 3.4 The fold

The hinge is at the plate's **inner rim** (radially inward, `0.473 m` from the
hub), the axis is the arm's **tangential** direction, and the plate swings
**downrange (−Z)** — momentum, the same reasoning `poseFlip:355` gives.

- Rod length in the fall equation: the plate **diameter**, `0.254 m`. Hinged at
  one rim, centre of mass at `L/2` — exactly the uniform-rod-about-one-end model
  `stepKnockdown` solves. `accel = 3g/(2·0.254) ≈ 58 rad/s²`, so it snaps back in
  ~0.25 s. Do **not** use the mount's `stemLengthM`; there isn't one.
- Moment arm for `seedFallRate`: the **radial** distance from the hinge line to
  the impact, `dot(impactWorld − hingeWorld, radialUnit)`. `seedFallRate` already
  clamps negatives to 0.
- `fallAngleDeg: 80`, `resetRateDegS: 60` — the shipped `HINGE_STEM` values.
- `downDwellS` is **not in `StarArmSpec`**: a star arm never auto-resets. Build
  the `KnockdownSpec` the state machine consumes with
  `downDwellS: Number.POSITIVE_INFINITY`, behind a named constant
  (`STAR_LATCH_UNTIL_RESET`) with a comment saying why.

Pose composition, in the star's own frame (copy `poseKnockdown`'s scratch-matrix
discipline — no per-frame allocation):

```
M = T(hub) · Rz(carrierθ) · [ T(hinge_local) · Rx(−foldα) · T(−hinge_local) ] · T(0, R, 0) · S(scale)
```

`Rx(−α)` is the same sign convention `poseKnockdown` uses (`spin.makeRotationAxis(hingeAxis, -angleRad)`), and it is what sends the outer rim to −z.

### 3.5 Furniture (`case 'star-hub'` in `addFurniture`, built once per group)

- **Static post**: cylinder `r = STAR_POST_RADIUS_M`, height `hubY`, at
  `(hubX, hubY/2, −distanceM)`. Not a child of the carrier.
- **Carrier `THREE.Group`** at `(hubX, hubY, −distanceM)`, held on the scene so
  `TestRangeScene.update` can spin it:
  - hub boss: cylinder `r = STAR_HUB_BOSS_RADIUS_M`, 0.06 m long along Z, centred
    0.06 m **downrange** of the hub plane (behind the 12″ hub plate — coplanar
    would z-fight, the bug `test-hostage-center`'s `zNudgeM` exists for).
  - five arms: cylinder `r = STAR_ARM_RADIUS_M`, length
    `STAR_ARM_LENGTH_M − plateRadius = 0.473 m`, local position
    `(0.2365·sin φᵢ, 0.2365·cos φᵢ, −0.03)` with `rotation.z = −φᵢ`
    (a `CylinderGeometry` runs along +Y; `Rz(θ)·(0,1,0) = (−sin θ, cos θ, 0)`, so
    `θ = −φ` points it along `(sin φ, cos φ)`). The 0.03 m downrange offset keeps
    a folding plate from clipping its own arm.
  - **Do not parent the plates to this Group** — they live in the shared
    `InstancedMesh` so they keep their paint-atlas layer. The rotor writes their
    matrices; the Group carries only the metalwork.

`TestRangeScene.update(dt, timeS, …)` gains one line per rotor:
`group.rotation.z = starCarrierRotationZ(timeS)`. Because both the carrier and
the plate matrices are **pure functions of the same `st.t`**, they cannot drift.

---

## 4. Traps

1. **Two writers to one instance matrix.** `steel-reactions` is the *only* thing
   allowed to write an arm plate's matrix. `TestRangeScene` writes only the
   carrier Group. Never both.
2. **The controller is created lazily on first impact** (`ScopeView.tsx:769`).
   A rotating target must move from frame 0, so the test-range setup branch must
   call `ensureSteelReactions(range)` eagerly. Do the rotor scan **inside
   `createSteelReactions`** off `scene.plates` (it's on `SteelSceneApi`), so it
   can never be forgotten by a future caller.
3. **`update(dt)` has no clock.** Widen to `update(dt: number, timeS = 0)` and
   pass `st.t` at `ScopeView.tsx:1813`. Keep it **defaulted**, so the 770-line
   `steel-reactions.test.ts` keeps compiling; document that production must pass
   the scene clock.
4. **Splats.** Every strike on an arm plate must (a) `setOrientation` to
   `Rz(carrierθ)` at arrival time and (b) re-express the impact against the
   plate's `enginePos`, exactly as the flip branch does. Skip either and every
   splat clamps to the rim or lands on the wrong face.
5. **Time of flight.** The pose at trigger break is not the pose at arrival. At
   36°/s and 0.11 s TOF the plate moves ~5 cm — 20% of a 10″ plate. §5 PS3
   resolves the shot against the **arrival** pose (D3).
6. **`resolveShot`'s aimed plate cancels out.** `impact = crosshair + (dial −
   required)·d + scatter` — the aimed plate's centre algebraically drops out
   (`shot.ts:116-142`). So advancing plate positions by TOF changes *only* the
   containment test, which is exactly right: the lead requirement emerges, it is
   not cancelled.
7. **Dust puffs are world-anchored** (`emitImpact` takes only
   `{impactWorld, hit}`), so a puff will not ride the arm. Persistent marks
   *will* (they're in plate-UV space). Leave it — deferred, §8.
8. **`pivotYM` is not set for a `'star-arm'` mount** and must not be:
   `buildTestRangePlates` only sets it for `reaction === 'knockdown'`, and the
   star's hinge is radial, not at the plate's base. No change to that line.
9. **Chains.** `swings` is false for both new mounts, so both get the collapsed
   zero-length pair automatically. `chainClampFor` runs but is irrelevant. No
   change.

---

## 5. Tasks

### PS1 — geometry, kinematics, types, mounts, data plumbing (no motion yet)

Everything pure plus the type/registry/validation plumbing. Nothing visible.

- **New** `range/targets/popper-star.ts` — every constant and function in §3.1–3.2,
  plus `STAR_POPPER` (10″ disc, `palette: { face: 0xc77dff }`, one `fill` layer,
  `compatibleMounts: ['star-arm']`) and `STAR_HUB_PLATE` (12″ disc, `face:
  0xf0f0ea`, `compatibleMounts: ['star-hub-reset']`). Header comment in the house
  style: what's reused, what's new, why the hub is derived.
- **New** `range/targets/popper-star.test.ts` — 72° spacing; exact centroid
  recovery from the §3.3 table; one revolution in exactly 10 s; the
  `starCarrierRotationZ` ↔ `starArmOffsetM` consistency sweep; clockwise sense
  (at `t = STAR_PERIOD_S/4` arm 0 has moved to `+x`); `starArmOf` round-trips
  every arm index.
- `targets/mount-type.ts` — `ReactionMode` `+= 'star-arm' | 'reset-switch'`;
  `MountFurniture` `+= 'star-hub'`; `StarArmSpec`; `MountType.star?`;
  `validateMountType` branches (§2).
- `targets/mount-registry.ts` — `STAR_ARM` and `STAR_HUB_RESET`, added to
  `REGISTERED`. Check `reactionModeOf` (`:272`) handles the new modes.
- `targets/registry.ts` — `STAR_POPPER`, `STAR_HUB_PLATE` in `REGISTERED`.
- `targets/placements.ts` — `RawPlacement.resetsGroupId?: string` →
  `ResolvedPlacement`. Validate in `resolvePlacement`: present **iff** the mount's
  reaction is `'reset-switch'`. Validate in `resolvePlacementList`: the named
  group exists among the range's placements (a typo'd group id would otherwise be
  a silently dead reset button).
- `range/RangeScene.ts` — `PlateInstance.resetsGroupId?: string`.
- `range/test-range-targets.ts` — carry `resetsGroupId` through
  `buildTestRangePlates`; add `case 'star-hub':` to `plateCentreYM`'s
  **throwing** group (a hub-derived centre is authored, like `'stake'`).
- `range/TestRangeScene.ts` — the real `case 'star-hub'` furniture builder (§3.5),
  minus the rotation. Runs on nothing until PS2.
- Roster/validation test updates: `targets/target-type.test.ts:326`,
  `targets/mount-type.test.ts:41`, plus new `validateMountType` cases.

**Done when:** the two types and two mounts validate at import; `popper-star.test.ts`
passes; `tsc` clean with all four exhaustive switches satisfied.

**Boundary after PS1:** `checkpoint` — run the gates (§7), record in
`PROGRESS.md`, **keep going**. **Commit point: `—`** (rolls into PS2).

---

### PS2 — place it and make it spin

First visible slice. The star appears, rotates, and takes hits + splats. Plates
do **not** fold yet.

- `targets/placements.data.json` — the six §3.3 entries appended to the
  `test-range` block, with a `_note` carrying the full derivation (hub 90 yd /
  x +1.19 / y 1.20, the angular-gap reasoning and its 3.96/4.00 mrad clearances,
  the corridor check, why `zNudgeM` must stay 0, and that the arm x/y columns are
  authored to 9 dp *because* `starHubFrom` recovers the hub from their centroid).
- `scope/steel-reactions.ts`:
  - `StarEntry { plate, spec, hub: THREE.Vector3, restAngleRad, radiusM, scale, state: KnockdownState, enginePos }`, in a `stars` map.
  - Scan `scene.plates` in `createSteelReactions`: group by `groupId` where the
    mount's reaction is `'star-arm'`, derive the hub via `starHubFrom`, then
    `starArmOf` per plate. Build entries **eagerly** (unlike `knocked`/`flipped`).
  - `poseStar(id, entry, timeS)` — the §3.4 composition, using the existing
    scratch matrices. It also writes `plate.position.x/y` (never `.z`), which is
    what makes the live hit test and aim-pick track the arm for free.
  - `update(dt, timeS = 0)` — pose every star entry each frame; flag
    `instanceMatrix.needsUpdate` on the touched meshes only, as the swing loop does.
  - `onImpact` star branch: `targetFor(plate)` → `setOrientation(Rz(carrierθ))` →
    `strike` with the `enginePos`-corrected impact → `paint`. No fold yet.
  - `dispose` clears `stars`.
- `range/TestRangeScene.ts` — hold the carrier Group(s); spin them in
  `update(dt, timeS, …)` via `starCarrierRotationZ(timeS)`.
- `scope/ScopeView.tsx` — `steelReactions?.update(dt, st.t)` at `:1813`; one
  eager `ensureSteelReactions(range)` in the `'test-range'` setup branch
  (`:476-486`), after the auto-commit.
- Test updates: `test-range-targets.test.ts` id list (`:62`) and counts
  (`:144` — 12→**18** plates, 24→**36** chain slots); `placements.test.ts:114`
  id list. **New** in `popper-star.test.ts`: resolve the real shipped rows through
  `getTargetPlacements('test-range')` and assert (a) `starHubFrom` over the five
  arm rows returns (1.19, 1.20) to 1e-9, (b) 90 yd is exclusive to these six, and
  (c) a `firstHit` rack walk (the `dueling-tree.test.ts:186` idiom) over a **sweep
  of rotation angles** finds exactly one plate for a dead-centre impact on each
  arm — no arm can shadow another, and none can shadow the hub plate.
- `steel-reactions.test.ts` — extend `fakeScene` with star-mounted plates; assert
  the pose tracks time, `plate.position` is mutated per frame, and
  `setOrientation` is pushed down before `strike`.

**Done when:** the star spins at exactly 1 rev / 10 s, plates stay glued to their
arm tips through a full revolution, arms and post are drawn, and a hit lands a
splat in the right place on the plate face.

**Boundary after PS2: owner-verification stop.**
On device, Test Range: pan ~14 mrad (1.5 mil) right of the gong at 90 yd.
- The star turns **clockwise**, one full turn in 10 s (time it — five arms pass a
  fixed point in 10 s).
- Each purple plate stays exactly on its arm tip for the whole revolution; no
  sliding, wobble or separation from the metalwork.
- The post is vertical and static; only the arms turn.
- Shoot a purple plate: it does **not** fall yet (expected at this stage) but a
  splat appears on the plate face where you hit it, and the splat **rides the
  plate** as it rotates.
- Nothing else on the range moved or changed.

**Commit point: `commit + push`.** (Covers PS1 too — its own commit point was `—`.)

```
popper-star PS1-PS2: add the rotating popper star to the Test Range

- Five 10" purple plates on a hub turning 1 rev/10 s at 90 yd, plus a fixed
  12" hub plate. Geometry, mounts and placements only — the fold-back, the
  reset switch and the time-of-flight lead land in PS3.
- steel-reactions gains the first reaction whose rest frame varies with time:
  it poses the arm plates and rewrites their live hit-test position every
  frame from the same clock TestRangeScene spins the drawn arms with.
- Hub position and depth order are derived rather than authored twice — the
  hub is the centroid of the five arm placements, and the post/arm/plate
  stack is ordered on front faces, not centres.
```

**Two owner defect rounds closed before this commit** (both recorded in
`PROGRESS.md`), each of which changed a decision rather than just a number:

1. **Plates frozen until the first shot.** `ensureSteelReactions` was gated on
   `engineModule`, which is assigned in a `.then()` — so the eager setup call
   silently created nothing and the controller first appeared on the first impact,
   long after the rotor entries were needed. Fixed by removing the dependency
   (construction never needed the engine; only building a native target does) and
   making the render loop the single place the controller comes up. Moving the call
   into the module's `.then()` would have fixed the symptom and left the same defect
   on a shorter timer.
2. **The post drew in front of the whole star**, centre plate included. It sat at the
   plate plane, which reads as "level with the plates" but puts a 3.8 cm radius 3.8 cm
   proud of them. Fixed by making the depth order a named stack ordered on **front
   faces**; the guard tests were confirmed to fail at the old value.

---

### PS3 — fold, latch, reset switch, and the lead

The mechanism. After this the target plays.

- `scope/steel-reactions.ts`:
  - Star branch of `onImpact`: after painting, `strikeKnockdown(entry.state,
    seedFallRate({ impulseNs: m·v, impactHeightM: <radial moment arm §3.4>,
    massKg: steelPlateMassKg(...), stemLengthM: plateDiameter }))`.
  - `update` advances each star entry with `stepKnockdown(entry.state, dt,
    starKnockdownCfg(entry.spec))` where `downDwellS = STAR_LATCH_UNTIL_RESET`
    (`Infinity`), so a folded plate never rises on its own.
  - **`'reset-switch'` branch** of `onImpact`: `targetFor` → `strike` → `paint`,
    then `resetDownTargets(plate.resetsGroupId)`.
  - `isStanding` consults `stars` as well as `knocked`.
  - `resetDownTargets(groupId?)` walks `stars` as well as `knocked`
    (`resetKnockdown()`, then re-pose). COMMIT's existing no-argument call then
    stands the star up on every fresh engagement, matching the poppers — no
    ScopeView change needed for that.
- `scope/ScopeView.tsx`:
  - New controller method `rotorPositionAt(instanceId, timeS, aheadS)`, returning
    `null` for a non-rotor plate. Move `const timeOfFlightS = …` (`:1254`) up
    above the `rackPlates` build (`:1196`) and use it there, so containment is
    tested against the plate's **arrival** pose. Fall back to `pl.position` when
    `null`, so every other range is byte-identical.
  - `callImpact` (`:1247`) takes the aimed plate's advanced centre too, so the
    spotter clock refers to where the plate actually was.
  - Behind `import.meta.env.DEV`, log one line per shot at a rotor:
    `star lead: plate advanced X.X cm during Y.YYY s TOF` — the owner-observable
    proof required by protocol §2b for an otherwise invisible change.
- Test updates: `steel-reactions.test.ts` — a struck star plate falls, latches at
  `fallAngleDeg` and **stays down past any dwell**; `isStanding` goes false;
  striking the hub plate stands the whole group up; `resetDownTargets()` with no
  group does too. `popper-star.test.ts` — the radial moment arm is zero for a hit
  on the hinge line and maximal at the outer rim.

**Done when:** a hit folds the plate back and it stays folded; the hub plate
raises all five; a folded plate cannot be hit or aimed at; and the shot resolves
against the arrival pose.

**Boundary after PS3: owner-verification stop** and **plan completion**.
On device, Test Range, at the star:
- Shoot a purple plate → it folds **away from you** (downrange) fast, latches
  near flat, and **stays down** through several more revolutions. It never pops
  back up on its own.
- Shoot the remaining four the same way; all five stay down and the empty arms
  keep turning.
- Shoot the **12″ hub plate** → all five rise together at a steady mechanical
  rate and are immediately shootable again.
- A folded plate cannot be hit — shots through where it was miss.
- Press **COMMIT** while plates are down → they stand up (same as the poppers).
- Holding dead-centre on a crossing plate should put hits slightly **behind** the
  centre, in the direction the plate came from. The DEV console line gives the
  number in cm if you want to confirm it.

**Commit point: `commit + push`.**

```
popper-star PS3: fold-and-latch arms with a hub reset switch

- Arm plates fold downrange on a radial hinge and latch until reset; the 12"
  hub plate resets its group on strike via the new 'reset-switch' reaction.
- Shots at a rotating plate now resolve against its pose at bullet arrival, so
  a crossing target has to be led.
```

---

## 6. Owner decisions (locked 2026-08-07)

| # | Decision |
|---|---|
| D1 | **Placement: 90 yd, hub at x = +1.19 m. Nothing removed, no range config changed.** Centred in the largest clean angular gap (gong ↔ near poppers), 3.96/4.00 mrad clear on each side, inside the no-hill corridor. |
| D2 | **The hub resets only its own arm group** (`test-star-arms`). The two 50 yd poppers are unaffected — it is one self-contained machine, not a range master reset. |
| D3 | **Plates stay down until the hub is shot** (`downDwellS: Infinity`) — no timed auto-reset. COMMIT still stands everything up, as it already does for the poppers. |
| D4 | **Arm plate face: `0xc77dff`** — light bright violet. Chosen at the lighter end because this range's lighting crushes dark albedos toward black (the tree palette had to be brightened for exactly that reason). One-line palette override in the JSON if it reads wrong on device. |
| D5 | **Rotation is clockwise as seen by the shooter**, 1 rev / 10 s exactly. Reversible by flipping `StarArmSpec.sense`. |
| D6 | **Hub plate is steel white `0xf0f0ea`** and takes paint like any other plate — a distinct "button" colour is a one-line palette override if the owner wants one. |

---

## 7. Gates (every task, before it is marked done)

Run from `GameBuild/app/`, in this order (protocol §5):

1. `ctest` — **N/A**, no engine source touched. Record it as N/A in `PROGRESS.md`, don't skip silently.
2. `node GameBuild/validation/run.mjs` — **N/A**, same reason.
3. `npx vitest run` — green. Baseline is 1487 tests / 87 files; the count must go **up**, and no existing test may be deleted to make a roster assertion pass.
4. `npx tsc --noEmit` — clean.
5. `npm run build` — succeeds. **No new assets**, so the PWA precache manifest is unchanged (33 entries) and no offline re-check is needed.
6. The task's own *Done when* items, verbatim.

No save-schema change (nothing about the star is persisted), so no
`schemaVersion` bump and no migration (protocol §4.6).

---

## 8. Deliberately deferred

- **Dust puffs don't ride the arm.** `emitImpact` is world-anchored, so the puff
  hangs where the round struck while the plate moves on. Persistent marks do ride
  (they're in plate-UV space). Fixing it means a plate-relative FX anchor —
  range-wide, and out of scope here.
- **A real Texas star drops its plates out of a cradle** and the loss of mass
  makes the wheel unbalanced and accelerate. The owner asked for "a bit more
  basic": a constant-rate motor and plates that fold rather than fall. Note it in
  `Wiki/_gaps.md` as a fidelity gap if the owner later wants the real thing.
- **`sense: +1` (counter-clockwise) is built and validated but not shipped** —
  a one-field data swap in `mount-registry.ts`, documented like the dueling
  tree's 8″ recipe.
- **No second star anywhere else.** This ships on the Test Range only, which is
  its charter as the target proving ground.
- **Arms are drawn here** even though the dueling tree's were skipped — these are
  0.47 m long and clearly visible at 90 yd. If the owner wants the tree's arms
  drawn too, that's a separate one-task follow-up reusing this arm builder.
