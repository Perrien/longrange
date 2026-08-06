# Dueling Tree — build plan

`Status: ready to execute` · `Date: 2026-08-06` · `Plan slug: dueling-tree`
`Audience: the executing coding agent (junior)` · `Owner decisions: locked below`

> Read `Design/execution/execution-protocol.md` first. This plan declares its own
> pause points (§2b) and commit points (§2c). Three tasks, two owner-verification
> stops.

---

## 0. What is being built

A **dueling tree** on the Test Range: one vertical centre post, 5 ft tall, carrying
**5 round paddles** that all rest on one side. Shooting a paddle swings it 180°
around the post to the other side, **always arcing away from the shooter**. Shooting
it again on the far side brings it back.

Paddle size is **6″ by default, with 8″ as an authored option** (locked: chosen per
placement in `placements.data.json`, not by a runtime UI toggle — §6.2).

---

## 1. READ THIS BEFORE YOU WRITE ANY CODE — most of this already exists

The hostage-target work (2026-08-06) shipped the entire flipping-paddle mechanism.
A dueling tree is that mechanism with a different arrangement of stops. **The
following are already built and correct. Do not reimplement, reopen, or "improve"
them.**

| Requirement | Already handled by | Notes |
|---|---|---|
| A hit advances a paddle to its next stop | `range/targets/flip.ts` — `strikeFlip`, `index = (index+1) % stopCount` | A 2-stop cycle *is* a left/right toggle. |
| The paddle **swings 180° about a vertical pivot midway between its two stops**, rather than sliding | `scope/steel-reactions.ts` — `poseFlip` | The pivot lands exactly on the tree's post; see §3.4. |
| The swing **always goes away from the shooter** | `poseFlip`: `z = base.z − \|halfTravel\| · sin(πt)` — the arc is taken **unsigned**, so it is downrange whichever direction the paddle is travelling | This is the owner's headline requirement and it is **already true**. It needs zero new code. |
| The struck face travels round with the paddle, so a splat stays on the side it was made on | Engine `SteelTarget::setOrientation` (task T10) + the `setOrientation` call in `onImpact`'s `'flip'` branch | Native tests already pin two-sided splat correctness. |
| Hits register against the **new** stop immediately, before the cosmetic swing finishes | `onImpact` mutates `plate.position.x` to the landed stop, then animates | |
| All paddles reset to their start side when a new engagement begins | `steelReactions.resetFlipTargets()`, called from `ScopeView`'s `commitRef` on COMMIT | Resets position **and** the accumulated facing angle. Locked owner decision (§6.3): this is the wanted behaviour. **No change.** |
| One piece of furniture built once for a set of targets sharing a `groupId` | `TestRangeScene.addFurniture` | `placements.ts` already enforces that group members share a distance and a mount. |
| Targets authored as data, resolved against the type + mount registries | `range/targets/placements.ts` + `placements.data.json` | |

**What you are actually adding is small:** one target type, two mount entries, one
piece of scene furniture (the post), five placement rows, and the tests that pin the
geometry.

---

## 2. The three-axis model, and where each decision goes

The codebase separates **target** (what the plate is) from **mount** (how it is held
and what a hit does to it) from **placement** (where this particular one is). Put
each new decision on the right axis:

- **Target type** (`dueling-tree.ts`) — the disc, its zone, its colour, its default
  size, and which mounts it is allowed on.
- **Mount** (`mount-registry.ts`) — the arm: the two stops and the distance between
  them. **The swing distance depends on paddle size, so there are two mounts**, one
  per size. See §3.2 for why this is right rather than a hack.
- **Placement** (`placements.data.json`) — post position, distance, and each
  paddle's height.

---

## 3. Geometry — every number, with its derivation

**Author the derivations as exported constants/functions in `dueling-tree.ts` and
have the tests recompute the JSON literals from them.** Do not paste bare floats
into the JSON without the test that regenerates them; that is how the hostage
assembly's offsets stayed correct through four rounds of owner tuning.

### 3.1 The post

```
DUELING_TREE_POST_HEIGHT_M   = inchesToMeters(60)   = 1.524 m   ← owner: "5 feet tall"
DUELING_TREE_POST_RADIUS_M   = 0.0381 m                          ← 3" diameter
```

3″ rather than the scene's shared `POST_RADIUS_M` (2″): a dueling tree's centre post
carries five swinging arms and is visibly heavier than a stake. It also sets the arm
clearance (§3.2), which is why the constant lives in `dueling-tree.ts` and
`TestRangeScene` imports it — the same reason `mount-registry.ts` imports its chain
constants from `engine-bridge/steel-target.ts` instead of re-typing them.

### 3.2 The arm — why the swing depends on paddle size, and why that means TWO mounts

The paddle's inner rim must clear the post, so the arm length is a function of the
paddle radius:

```ts
export const DUELING_TREE_ARM_CLEARANCE_M = 0.02;  // 2 cm rim-to-post gap

/** Distance between the two stops = twice the arm. */
export function duelingTreeSwingM(paddleWidthM: number): number {
  return 2 * (paddleWidthM / 2 + DUELING_TREE_POST_RADIUS_M + DUELING_TREE_ARM_CLEARANCE_M);
}
```

|  | paddle Ø | radius | arm | **swing (stop→stop)** |
|---|---|---|---|---|
| 6″ | 0.1524 | 0.0762 | 0.1343 | **0.2686 m** |
| 8″ | 0.2032 | 0.1016 | 0.1597 | **0.3194 m** |

A `MountType` carries **static** stops (`FlipSpec.positions`), and a placement
carries the size. A single mount therefore cannot serve both sizes without either
oversizing the 6″ arm (a visible gap where a real paddle nearly touches the post) or
letting an 8″ paddle foul the post. **Two mounts is also exactly what the codebase
already does** — `hostage-clamp-2way` and `-3way` are two registry entries differing
only in their stop list.

```ts
const DUELING_TREE_ARM_6: MountType = {
  id: 'dueling-tree-arm-6',
  name: 'Dueling-tree arm (6" paddle)',
  reaction: 'flip',
  furniture: 'tree-post',
  needsBeamHeight: false,
  flip: {
    positions: [
      { id: 'left',  xOffsetM: 0 },                              // rest — MUST be 0 (validateMountType)
      { id: 'right', xOffsetM: duelingTreeSwingM(inchesToMeters(6)) },
    ],
    transitionS: 0.35,
  },
};
```

…and `DUELING_TREE_ARM_8` identically with `inchesToMeters(8)`.

`transitionS: 0.35` — marginally slower than the hostage clamp's 0.3, because the
arm is longer and a snappier swing on a 5-paddle stack reads as teleporting. Tune on
device at the DT2 stop if the owner disagrees.

### 3.3 The paddle stack

```
DUELING_TREE_PADDLE_COUNT    = 5
DUELING_TREE_PADDLE_PITCH_M  = inchesToMeters(10) = 0.254 m
DUELING_TREE_TOP_PADDLE_Y_M  = inchesToMeters(55) = 1.397 m
```

```ts
/** Centre height of paddle `i`, i = 0 at the TOP. */
export function duelingTreePaddleYM(i: number): number {
  return DUELING_TREE_TOP_PADDLE_Y_M - i * DUELING_TREE_PADDLE_PITCH_M;
}
```

Giving centres at **55″, 45″, 35″, 25″, 15″** = `1.397, 1.143, 0.889, 0.635, 0.381 m`.

Why those numbers, and why the same stack serves both paddle sizes:

- **Pitch 10″ must exceed the largest paddle's diameter,** or two paddles overlap and
  the shot resolver cannot tell them apart (§4.1). 10″ leaves **2″ of vertical air
  between adjacent 8″ paddles** and 4″ between 6″ ones.
- **Top paddle at 55″** puts an 8″ paddle's top edge at 59″ — 1″ under the 60″ post
  top, so nothing overhangs the post.
- **Bottom paddle at 15″** puts an 8″ paddle's bottom edge at 11″ above ground.
  Clear of the terrain, and low enough that the stack reads as a full tree rather
  than a cluster near the top.

### 3.4 The pivot lands on the post for free — verify this, don't build it

`poseFlip` computes:

```
halfTravelM = (animToXM − animFromXM) / 2   =  swing/2  =  arm
pivotX      = basePos.x + animFromXM + halfTravelM
            = (post − arm) + 0 + arm
            = post
```

The swing pivot is **exactly the post's centreline**, with no new code. At the
mid-swing instant (`t = 0.5`) the paddle sits edge-on at `x = post`,
`z = post.z − arm` — i.e. one arm-length **downrange**, comfortably clear of the
0.0381 m post radius. The paddle never intersects the post at any point in the arc.

**`zNudgeM` must be 0 for every dueling-tree placement.** Do not copy the hostage
centre paddle's `-0.05`. That nudge exists solely because the hostage paddle is
coplanar with a backing silhouette and z-fights it. A dueling-tree paddle has no
coplanar neighbour — the post is a solid cylinder with volume, not a flat surface.

### 3.5 Where the tree goes on the Test Range

```
distanceYards : 80
post x        : -3.0 m   (left of centreline)
rest side     : LEFT — authored paddle xOffsetM = post − arm
```

- **80 yd is deliberately a distance no other Test Range target uses** (gong 100,
  IDPA 75, hostage assembly 60, poppers 50). `ScopeView` filters the hittable rack
  by **exact `distanceM` equality**, so a tree sharing a distance with another target
  would silently merge into that target's engagement. Keep 80 exclusive to the tree.
- **x = −3.0** is left of the IDPA silhouette (at −1.8, its outline reaching −2.03).
  The tree's widest 8″ extent runs −3.26 → −2.74, leaving **0.71 m** of clear air
  between them, and sits well inside `NO_HILL_CORRIDOR`'s 4.572 m half-width so the
  terrain under it is flat.

Authored rest-x, 6″ default: `-3.0 − 0.1343 =` **`-3.1343`**.

---

## 4. Traps — read before authoring the placements

### 4.1 `game/shot.ts` has no depth or occlusion concept

It walks the engagement rack **in order** and takes the **first** plate whose zones
the impact breaks. This is what made the hostage paddle unhittable at its swung
stops. For the tree it means:

- **Adjacent paddles must not overlap at any stop.** The 10″ pitch guarantees this,
  and DT1's test must prove it over the shipped numbers rather than assert the pitch
  in isolation.
- **A paddle must be reachable at BOTH of its stops.** Nothing occludes it here (no
  backing plate), but the test must run the real first-hit loop anyway — that is the
  test that would have caught the hostage bug.

### 4.2 Placement order is load-bearing

`instanceId` is the array index in `placements.data.json`, and it is simultaneously
the paint-atlas layer, the `chainRest[id*2+ci]` key, the reaction-map key and the
store's `currentTarget.plateInstanceId`. `ScopeView`'s test-range branch also
auto-commits `plates[0]`. **Append the five paddles to the END of the
`test-range.targets` array.** Do not insert them anywhere else.

### 4.3 The five paddles share a `groupId`; that is a hard constraint, not a hint

`groupId: "test-dueling-tree"` on all five. `placements.ts` then **enforces** that
they agree on distance and mount, and `TestRangeScene.addFurniture` builds the post
**once** for the group. A useful side effect: the group rule makes it impossible to
author a tree with mixed 6″/8″ paddles, which is correct — a real tree has uniform
paddles.

### 4.4 Add a NEW furniture kind; do not reuse `'pivot-post'`

`MountFurniture` already has `'pivot-post'`, used by the two hostage clamps — and
`TestRangeScene.addFurniture` currently has **no case for it**, so the hostage
clamps deliberately draw no structure. Adding a `'pivot-post'` case would change the
shipped, owner-signed-off hostage assembly's appearance. **Add `'tree-post'` to the
`MountFurniture` union instead**, and give only that a furniture case. Zero
regression to anything already shipped.

Adding a union member surfaces two switches you must update. **They are not equally
enforced — know which one the compiler is watching:**

- `range/test-range-targets.ts` → `plateCentreYM` — **compiler-enforced.** It has an
  explicit `: number` return type and every arm returns or throws, so omitting
  `'tree-post'` is a hard `tsc` failure. Add it to the **throwing** case alongside
  `'stake' | 'pivot-post' | 'none'`: a post's height is not a paddle's centre height,
  so every tree placement authors `centreYM` explicitly. Bundled into **DT1**, with
  the union edit that causes it.
- `range/TestRangeScene.ts` → `addFurniture` — **NOT enforced.** It returns `void`
  and has no `default` arm, so a missing `case 'tree-post'` compiles clean and simply
  draws no post. There is no safety net here; see DT2.2 for the fix that adds one.
  Scoped to **DT2**, where the post is actually needed.

---

## 5. Tasks

### DT1 — target type, mounts, geometry module, unit tests

**Files (~5):**

1. **NEW** `src/range/targets/dueling-tree.ts`
   - `DUELING_TREE_PADDLE: TargetType` — `shape: { kind: 'disc' }`, `aspect: 1`, one
     zone `'paddle'`, `massModel: 'oval'`, `paint.layers: [{ kind: 'fill', color: '$face' }]`,
     `defaultWidthM: inchesToMeters(6)`,
     `compatibleMounts: ['dueling-tree-arm-6', 'dueling-tree-arm-8']`,
     `defaultMount: 'dueling-tree-arm-6'`.
     Face colour: flat white `0xf0f0ea` (matching the scene's default plate paint) —
     owner decision §6.4, same on both faces.
     > A **separate type** from `HOSTAGE_PADDLE`, not a reuse. `HOSTAGE_PADDLE.defaultWidthM`
     > is shared by both hostage mounts and is load-bearing for the hostage window's
     > 62 px radius and the ±0.33 m swing-clearance floor — the file's own header
     > documents that growing it breaks that assembly. A tree paddle that can be 8″
     > must not be able to reach those constraints.
   - All the constants and functions from §3.1–§3.3.
2. `src/range/targets/mount-type.ts` — add `'tree-post'` to `MountFurniture`.
3. `src/range/targets/mount-registry.ts` — `DUELING_TREE_ARM_6`, `DUELING_TREE_ARM_8`,
   both appended to `REGISTERED`.
4. `src/range/targets/registry.ts` — register `DUELING_TREE_PADDLE`.
5. `src/range/test-range-targets.ts` — `plateCentreYM`: `'tree-post'` joins the
   throwing case (§4.4).

**Tests — NEW `src/range/targets/dueling-tree.test.ts`, plus two roster updates:**

- The type validates, is a one-zone disc, is registered, and accepts only the two
  tree-arm mounts.
- **Each mount's swing equals `duelingTreeSwingM(its paddle size)`** — recomputed,
  not a pasted float.
- **The paddle clears the post at both stops:** `arm − paddleRadius ≥
  DUELING_TREE_POST_RADIUS_M`, for both sizes.
- **The stack fits the post:** top paddle's top edge `≤ POST_HEIGHT`, bottom
  paddle's bottom edge `> 0`, for both sizes.
- **Pitch exceeds the largest paddle's diameter**, so no two paddles overlap.
- Existing roster tests must be updated, not deleted: `mount-type.test.ts:41`
  (`listMountTypes()` id list) and the registered-type roster in
  `target-type.test.ts`. These exist so the rosters cannot drift silently — updating
  them *is* the intended workflow.

**Boundary after DT1:** `checkpoint` — run the gates (§7), record in `PROGRESS.md`,
**keep going**. **Commit point:** `—` (rolls into DT2).

---

### DT2 — place the tree on the Test Range and draw the post

**Files (~3):**

1. `src/range/targets/placements.data.json` — five entries **appended** to
   `ranges['test-range'].targets`, ids `test-tree-1` … `test-tree-5` (1 = top):

   | id | centreYM | | shared by all five |
   |---|---|---|---|
   | `test-tree-1` | 1.397 | | `typeId: "dueling-tree-paddle"` |
   | `test-tree-2` | 1.143 | | `mountId: "dueling-tree-arm-6"` |
   | `test-tree-3` | 0.889 | | `groupId: "test-dueling-tree"` |
   | `test-tree-4` | 0.635 | | `distanceYards: 80` |
   | `test-tree-5` | 0.381 | | `xOffsetM: -3.1343` |
   |  |  | | `widthInches: 6` |

   No `zNudgeM` (§3.4). No `beamHeightM` (the mount doesn't need one).

   Write a `_note` on the first entry carrying: the post centreline (−3.0), the
   arm derivation that produces −3.1343, why 80 yd is exclusive to the tree, why the
   centres are 55/45/35/25/15″, and — **verbatim — the 8″ swap recipe from DT3.**
   The next person to touch this file will read the note, not this plan.

2. `src/range/TestRangeScene.ts` — `case 'tree-post':` in `addFurniture`, calling a
   new `addTreePost(members, placement, mat)`:
   - Build **once per group** (the existing `built` set already handles this).
   - One `CylinderGeometry(DUELING_TREE_POST_RADIUS_M, DUELING_TREE_POST_RADIUS_M,
     DUELING_TREE_POST_HEIGHT_M, 10)`, positioned at
     `x = paddle.x + mount.flip.positions[1].xOffsetM / 2` (the post centreline,
     recovered the same way `poseFlip` recovers the pivot — never a second hard-coded
     −3.0), `y = POST_HEIGHT/2`, `z = -placement.distanceM`.
   - **Do not draw the arms.** At 2 cm of rim-to-post clearance an arm is a few
     pixels at 80 yd. Deferred, logged in `PROGRESS.md`.
   - **Give this switch the safety net it currently lacks** (§4.4). While you are in
     it, close the silent-skip hole permanently:

     ```ts
     case 'pivot-post':
       // Deliberately draws nothing: the hostage clamps are hidden behind the
       // silhouette. Written as an explicit no-op so the default arm below can
       // exist — that is what makes it one.
       break;
     default: {
       const unhandled: never = placement.mount.furniture;
       throw new Error(`TestRangeScene: no furniture case for '${unhandled}'`);
     }
     ```

     This costs one no-op case and converts "a future furniture kind silently draws
     nothing" from a class of bug you find on device into a `tsc` error. It also
     turns the existing `'pivot-post'` omission from an undocumented gap into a
     stated decision. Run the full gate after adding it — if any other furniture
     kind is unhandled today, this is what will surface it.

3. `src/range/targets/dueling-tree.test.ts` — add the placement-level invariants,
   run over the **real shipped placements** via `getTargetPlacements('test-range')`,
   mirroring `hostage-paddle.test.ts`'s "reachable at EVERY stop" block:
   - All five resolve, share one `groupId`, one distance and one mount.
   - Their `centreYM`s equal `duelingTreePaddleYM(0..4)`.
   - Their `xOffsetM` equals `postX − swing/2` for the authored size.
   - **First-hit loop:** a shot at paddle *i*'s centre resolves to paddle *i* and
     not to a neighbour — tested at **both** stops, for all five.
   - No dueling-tree placement carries a non-zero `zNudgeM`.

**Boundary after DT2:** **owner-verification stop.** Mark `AWAITING OWNER` in
`PROGRESS.md` and hand over this checklist:

> Test Range → aim at the dueling tree, left of the IDPA silhouette, at 80 yd.
> COMMIT to it, then check:
> 1. Five white paddles, all on the **left** of a 5-ft post, evenly stacked.
> 2. Shoot one → it swings **round the post, arcing away from you**, and lands on
>    the right. It does not slide, and it does not come toward you.
> 3. Shoot it again on the right → it comes back to the left, again arcing away.
> 4. Your splat travels with the paddle and stays on the face you put it on.
> 5. Clear all five to the right, then press COMMIT → all five snap back to the left.
> 6. Frame time still inside `FRAME_BUDGET_MS` on the iPad (five extra plates).
> Judgement calls to report back: the 0.35 s swing speed, and whether 10″ spacing
> reads as a tree or as a stack.

**Commit point: `commit + push`.**

```
dueling-tree DT2: place the 5-paddle tree on the Test Range

- Adds the dueling-tree paddle type, two arm mounts (6"/8") and a 'tree-post'
  furniture kind; five grouped placements at 80 yd.
- The 180 deg swing, the away-from-shooter arc and the COMMIT reset are the
  shipped hostage-paddle flip mechanism reused unchanged.
```

---

### DT3 — the 8″ option

Prove the size swap is a data-only edit, and leave the recipe where it will be found.

**The swap, for all five entries:**

| field | 6″ | 8″ |
|---|---|---|
| `widthInches` | `6` | `8` |
| `mountId` | `"dueling-tree-arm-6"` | `"dueling-tree-arm-8"` |
| `xOffsetM` | `-3.1343` | `-3.1597` |

`xOffsetM` changes because the rest stop is the paddle's own centre and the arm grew
— the post stays at −3.0 either way. DT2's placement tests recompute this from
`duelingTreeSwingM`, so getting it wrong fails a test with a readable message rather
than producing a tree that looks slightly off.

**Work:**
1. Add a test that resolves a **synthetic** 8″ placement set through
   `resolvePlacementList` and runs the same clearance / no-overlap / both-stops-reachable
   invariants. This keeps the 8″ path covered without shipping it.
2. Perform the swap in `placements.data.json`, verify on device, then **revert to
   6″** — 6″ is the shipped default (owner). The swap exists as a documented,
   tested one-minute edit, not as a shipped second tree.
3. `PROGRESS.md`: task rows, gate numbers, and the deferred observations (arms not
   drawn; a runtime size toggle would need a `schemaVersion` bump + migration and
   was deliberately not built — §6.2).

**Boundary after DT3:** **owner-verification stop** (the 8″ tree on device) and
**plan completion**.

**Commit point: `commit + push`.**

```
dueling-tree DT3: cover and document the 8" paddle option

- Adds 8" arm-mount coverage over synthetic placements; ships 6" as the default.
- Records the three-field swap recipe in placements.data.json.
```

---

## 6. Owner decisions (locked 2026-08-06)

1. **Location:** Test Range, authored placement. No new range.
2. **Paddle size:** authored per placement in JSON. **A runtime Settings toggle was
   explicitly not chosen** — it would need a save-schema bump plus a migration
   (protocol §4.6) and a scene teardown/rebuild path. If the owner later wants one,
   nothing in this plan blocks it: the two mounts and the derived geometry are the
   part that would be reused.
3. **Reset:** all five return to the start side on COMMIT — the shipped
   `resetFlipTargets` behaviour, unchanged.
4. **Faces:** identical both sides, flat colour. Two-tone was considered and
   rejected: the face rasteriser paints one texture used for both halves, so
   distinct faces would be new capability, not a palette change.

---

## 7. Gates (every task, before it is marked done)

From `GameBuild/app/`, in order, all green:

```
npx vitest run
npx tsc --noEmit
npm run build
```

`ctest` and `node GameBuild/validation/run.mjs` are **N/A** for this plan — no engine
source is touched — and must be recorded as N/A in `PROGRESS.md`, never skipped
silently. **You do not run git commands**; surface the commit message at each commit
point and let the owner run it. Never offer a commit on a red gate.

---

## 8. Deliberately deferred

- **Drawing the arms** (§DT2.2) — a few pixels at range; revisit only if the owner
  asks.
- **A runtime paddle-size toggle** — §6.2.
- **Scoring / a "tree cleared" state.** No scoring math exists anywhere in the
  codebase yet; `zoneHits` is recorded and nothing reads it. A cleared-tree
  condition belongs with the scoring layer, not here.
- **Two trees at once, or a second tree at a different distance.** One tree proves
  the mechanism; a second is five more JSON rows whenever it's wanted.
- **Hit-testing against the swinging pose.** Every plate in the game is tested
  against its rest plane; a paddle caught mid-swing is tested at the stop it has
  already landed on. Unchanged here — it is a separate, range-wide decision.
