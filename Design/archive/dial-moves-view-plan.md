# Dial Moves the View — build plan

`Status: COMPLETE 2026-08-06 — all three tasks built, owner-confirmed on device` · `Date: 2026-08-06` · `Plan slug: dial-moves-view`
`Audience: the executing coding agent (junior)` · `Owner decisions: locked in §7`

> Read `Design/execution/execution-protocol.md` first. This plan declares its own
> pause points (§2b) and commit points (§2c). **Three tasks, one owner-verification
> stop.**

---

## 0. What is being built

Today, turning the turrets changes a number and nothing else: the sight picture
never moves, and the player never sees which way "up" goes.

After this plan, **turning a turret moves the sight picture in real time**, exactly
as it does on a real rifle held still in a vise. Dial elevation UP and the crosshair
walks *down* the target. Dial windage RIGHT and the crosshair walks *left*. The
rifle has not moved, so the bullet still goes exactly where it would have gone —
until the player re-aims to put the crosshair back on the target, which is what
actually points the barrel where the come-up needs it.

This makes the owner's zeroing workflow a real in-game mechanic:

> Fire a group. Don't touch the rifle. Turn the dials until the crosshair sits on
> the group you just shot. Confirm the zero. Re-aim at the bull.

And it teaches the direction rule by muscle memory instead of mnemonic:
**the crosshair chases the group; the impact moves the opposite way from the
crosshair.**

---

## 1. Read this before you write any code

**The shot mathematics is already correct and must not be touched.** `resolveShot`
(`src/game/shot.ts`) computes

```
applied = aimError + dial + playerZero
```

where `aimError` is the angle from the crosshair (the sight line) to the aimed
plate's centre. This plan rotates the *camera* — i.e. the sight line — by the dial
amount. That makes `aimError` change by exactly minus the dial, so `applied` is
unchanged. **Dialing alone therefore cannot move the impact, for free, with no
change to any shot code.** That invariant is the whole reason this feature is a
small, safe change rather than a rewrite, and DV1 pins it with a test.

**Do not modify any of these:**

- `src/game/shot.ts`, `src/game/firing-solution.ts` — the shot math.
- `GameBuild/engine/`, `BallisticsToolkit/`, `GameBuild/validation/` — no engine
  work at all in this plan (gates `ctest` and `validation/run.mjs` are **N/A**;
  record them as N/A in `PROGRESS.md`, never skip silently — protocol §5).
- `src/scope/reticle.ts`, `src/scope/scope-projection.ts` — the reticle stays
  drawn at the centre of the screen and keeps its true subtensions. It is the
  *camera* that moves, not the reticle drawing.
- The DOPE panel / turret readouts — the numbers they show are unchanged.

---

## 2. The model, and the sign conventions (get these right first)

### 2.1 The three directions

Three angles matter. Two of them already exist in the code; the third is new.

| Name | What it is | Where it lives |
|---|---|---|
| **Hold** (bore) | Where the rifle is pointed. What the player's finger-drag controls. | `st.pitch`, `st.yaw` in `ScopeView.tsx` (unchanged) |
| **Sight offset** | How far the scope's erector has been moved off the bore by the turrets. | **NEW** — `st.sight`, computed in §3 |
| **Sight line** | Where the crosshair points. What the camera renders. | `aimQuaternion()` — gains one new term |

```
sight line = hold − sight offset
```

The minus sign is the entire feature: dialing the sight *up* means the sight line
moves *down* relative to the barrel, so that when you bring the crosshair back onto
the target the barrel ends up pointing higher.

### 2.2 The direction table — memorise this before touching `aimQuaternion`

Rifle held still, player watching through the scope:

| You dial | The sight line | On screen | The next shot's impact would move |
|---|---|---|---|
| Elevation **UP** (+) | pitches **down** | crosshair walks **DOWN** the target (target rises in the view) | UP |
| Elevation **DOWN** (−) | pitches up | crosshair walks **UP** | DOWN |
| Windage **RIGHT** (+) | yaws **left** | crosshair walks **LEFT** | RIGHT |
| Windage **LEFT** (−) | yaws right | crosshair walks **RIGHT** | LEFT |

Worked example — the owner's case, a group landing **1 MOA high and left**:
the impact must move **down and right**, so the player dials **DOWN and RIGHT**,
and on screen the crosshair walks **up and left** — onto the group. The crosshair
always ends up on the group. That is the check that the signs are right.

### 2.3 The existing camera convention (read carefully — the two axes are not symmetric)

`ScopeView.aimQuaternion` builds:

```ts
new THREE.Euler(-(st.pitch + w.pitch + st.dist.p), -(st.yaw + w.yaw + st.dist.y), 0, 'YXZ')
```

In this convention (the negated Euler is deliberate — `+=` drag reads FPS-style):

- **positive `st.pitch` = looking DOWN** (hence the `pitch: 0.008` default, "a hair
  down");
- **positive `st.yaw` = looking RIGHT**.

Store values, meanwhile, are `elevationRad` positive = dialed **up**, `windageRad`
positive = dialed **right**.

Combine those with §2.2 and the two axes pick up **opposite signs**:

```ts
new THREE.Euler(
  -(st.pitch + w.pitch + st.dist.p + st.sight.elevRad),   // + : dial up  → look down
  -(st.yaw   + w.yaw   + st.dist.y - st.sight.windRad),   // − : dial right → look left
  0, 'YXZ',
)
```

**`+` on elevation, `−` on windage.** This is the single most likely thing to get
backwards in this plan. Do not reason it out a second time at the keyboard — write
the test from §5 DV1 first, and let it tell you.

### 2.4 The closed-form sight-line direction (for the pure tests)

Applying `Euler(−p, −y, 0, 'YXZ')` to the camera's forward vector `(0, 0, −1)`:

```
dir = ( cos(p)·sin(y),  −sin(p),  −cos(p)·cos(y) )
```

Sanity: `p > 0` (looking down) gives `dir.y < 0` ✓; `y > 0` (looking right) gives
`dir.x > 0` ✓. DV1 pins this against THREE itself so the pure module and
`ScopeView` can never drift apart.

---

## 3. What goes into the sight offset — and what must NOT

```
sight offset = session.scope { elevationRad, windageRad }      ← the live turret
             + activeRifle.playerZero { elevationRad, windageRad }   ← zero folded into the erector
```

### 3.1 Why `playerZero` is included

`confirmZero` (`state/store.ts`) folds the current dial into the rifle's stored
`playerZero` and resets the turret to 0/0. Physically nothing moved — confirming a
zero is loosening the turret cap and re-indexing the ring to read zero; the erector
stays exactly where it is.

So if the view offset were the dial alone, then at the *exact moment the owner
presses Confirm Zero* — the moment this whole feature exists to serve — the sight
picture would snap back by the amount just dialed. Including `playerZero` keeps it
still. This costs nothing in shot math: `resolveShot` adds `playerZero` on the same
side as `dial`, so the §1 cancellation covers both terms identically.

### 3.2 The one seam, and why it is acceptable

`confirmZero` computes `pz_new = pz_old + dial − required`, where `required` is the
come-up handed off to the new trajectory zero range. The offset therefore shifts by
`−required` on confirm. When the owner confirms at the distance the rifle is already
zeroed for — the normal sight-in-bay case — `required ≈ 0` and the view is still.
Re-zeroing to a *different* distance will nudge the view by the come-up between the
old and new zero references. That is a known, documented seam: it is the price of
not modelling the trajectory's own launch angle as a fourth term. **Do not chase
it.** Note it in `PROGRESS.md` under *Deferred observations* and move on.

### 3.3 What must NOT be included: `zeroOffsetRad` (hard guardrail)

The rifle's hidden bore/scope offset (`zeroOffsetRad`, from `solveGear`) is **hidden
truth** (protocol §4.8). It must never enter the view offset. If it did, the player
could read a fresh rifle's exact hidden misalignment straight off the screen, and the
entire zeroing game would be spoiled. It also would not be physically right: that
offset is the *barrel* not pointing where the tube does, and the barrel is not what
the camera renders.

Reading it in this file at all is a mistake. The offset is built from
`session.scope` + `playerZero`, full stop.

---

## 4. Traps

1. **The eased value is the truth, not the target.** The offset glides over ~80 ms
   (§7.1). `aimQuaternion` must read the *current eased* `st.sight`, and every
   caller of `aimQuaternion` — `findAimed`, `commitRef`, both FIRE paths (steel and
   sight-in), the mirage aim-distance dispatch — then automatically resolves against
   the exact sight line drawn on screen. **Never recompute the target offset inside
   `aimQuaternion`**; if you do, a shot fired mid-glide resolves against a crosshair
   the player never saw.
2. **Initialise, don't glide, on mount.** Seed `st.sight` with the target offset
   when the scene is built. Otherwise entering a range with a zeroed rifle (or with
   dope still on the turret) starts the camera at zero offset and swings it into
   place — looks like a bug, and is one.
3. **The aim clamp is fine; leave it alone.** `st.pitch` is clamped to ±0.2 rad
   in *hold* space. Re-centring after a 30 MIL come-up costs 0.03 rad of that 0.2
   budget, so even ELR dope has ~6× headroom. Do not widen the clamp, and do not
   move the clamp into sight-line space.
4. **`dt` is already clamped** in the frame loop (50 ms). Use the same clamped `dt`
   for the ease so a stalled frame cannot overshoot.
5. **The dial is session state and survives a range switch** (only `confirmZero`
   resets it — `commitTarget` deliberately does not). So a player who walks onto a
   new range with 15 MIL still dialed will start with the view offset applied. That
   is correct and real; do not "helpfully" zero it.
6. **Big come-ups push the target out of the field of view.** At 10×, the vertical
   FOV is ~41.9 mrad, so 20 MIL of dial moves the target roughly half a screen
   height — at 25×, clean off the top. Re-acquiring (zoom out, re-aim, zoom in) is
   the real-world behaviour and is the intended experience. It is on the owner's
   verification list (DV2) precisely because it is the one thing that might feel
   wrong in play.
7. **No save-schema change.** The offset is *derived* every frame from state that is
   already persisted. Nothing new is stored, so there is no `schemaVersion` bump and
   no migration (protocol §4.6). If you find yourself adding a field to the save,
   stop — you have taken a wrong turn.

---

## 5. Tasks

### DV1 — the pure module + its tests

**New file: `src/scope/turret-view.ts`.** Framework-free (no THREE, no DOM, no
React) so it unit-tests directly, matching `scope/scope-projection.ts`.

```ts
export interface SightOffset { elevRad: number; windRad: number }

/** Time constant for the turret glide; ~3τ ≈ 80 ms to 95% of the step. */
export const SIGHT_GLIDE_TAU_S = 0.027;

/** The erector's angular position: the live turret plus whatever a Confirm Zero
 *  folded into the rifle's stored zero (§3.1). NEVER includes zeroOffsetRad (§3.3). */
export function sightOffset(
  scope: { elevationRad: number; windageRad: number },
  playerZero?: { elevationRad: number; windageRad: number } | null,
): SightOffset;

/** Hold angles + offset → the two angles ScopeView feeds THREE.Euler (§2.3).
 *  pitch ADDS the elevation, yaw SUBTRACTS the windage. */
export function sightAimAngles(
  holdPitchRad: number,
  holdYawRad: number,
  offset: SightOffset,
): { pitchRad: number; yawRad: number };

/** Unit sight-line direction for those angles — the closed form of §2.4. */
export function sightLineDir(pitchRad: number, yawRad: number): { x: number; y: number; z: number };

/** Frame-rate-independent exponential ease toward `target`; snaps when within
 *  SIGHT_SNAP_EPS_RAD so it cannot chase forever. */
export function easeSightOffset(
  current: SightOffset,
  target: SightOffset,
  dtS: number,
  tauS?: number,
): SightOffset;
```

Ease shape: `k = 1 − exp(−dt/τ)`, `next = cur + (target − cur) · k`, then snap if
`|target − next| < SIGHT_SNAP_EPS_RAD` (use `1e-9`, far below a click).

**New file: `src/scope/turret-view.test.ts`** — five groups:

1. **`sightOffset` sums both terms** on both axes; a null/absent `playerZero`
   yields the dial alone.
2. **Signs, stated as what the player sees.** Hold fixed at `(0, 0)`; dial 1 MIL
   up ⇒ `sightLineDir(...).y` drops by ≈ 0.001 (the crosshair points 1 mrad below
   where it did, so the target now sits *above* it). Dial 1 MIL right ⇒ `.x` drops
   by ≈ 0.001 (points left). Then the two negative cases. Write the assertions with
   the §2.2 wording in the test names — this file is the plan's memory.
3. **THREE parity.** For several `(pitch, yaw)` pairs, build
   `new THREE.Quaternion().setFromEuler(new THREE.Euler(-pitch, -yaw, 0, 'YXZ'))`,
   apply it to `(0,0,-1)`, and compare component-wise to `sightLineDir` within
   `1e-12`. This is the test that stops the pure module and `ScopeView` drifting
   apart. (THREE imports fine in vitest — see `scope/steel-reactions.test.ts`.)
4. **THE INVARIANT: dialing alone does not move the impact.** Fix a hold, a plate,
   a solve, `scatter = {x:0, y:0}`, and a `playerZero`. For each dial in
   `{0, +0.5 MIL, −1.2 MIL, +3 MIL}`, build
   `aimDir = sightLineDir(...sightAimAngles(hold, sightOffset(dial, pz)))` and call
   `resolveShot` with that `aimDir` and that `dial`. **Every impact must match the
   `dial = 0` impact within `1e-4` m.**
   > It is not exactly zero, and that is expected, not a bug to fix. `resolveShot`
   > goes through `atan2` of a plane intersection while the dial is a plain angle,
   > so the cancellation is exact only to first order; the residual at 3 MIL is
   > ~1e-7 m. If you see millimetres, your signs are wrong. If you see micrometres,
   > you are done.
5. **Re-aiming is what moves the impact.** Same setup: dial 1 MIL up, then rotate
   the hold up by 1 mrad (crosshair back on the plate centre) ⇒ the impact rises by
   ≈ `0.001 × distanceM`, within the same tolerance. This is the positive half of
   test 4 — together they say "the dial does nothing until you re-aim, and then it
   does exactly the right thing".

**Boundary after DV1:** `checkpoint` — run the gates (§8), record in `PROGRESS.md`,
**keep going**. **Commit point:** `—` (rolls into DV2).

---

### DV2 — wire it into the scope view

**File: `src/scope/ScopeView.tsx`** (one import, ~4 edits, no new files):

1. **Import** `easeSightOffset`, `sightOffset`, `type SightOffset` from
   `./turret-view`.
2. **Add the eased offset to the loop-visible aim state** `st` (declared next to
   `yaw`/`pitch`/`dist`):
   ```ts
   sight: { elevRad: 0, windRad: 0 } as SightOffset,
   ```
3. **Add a target-offset reader** next to `steelGearCtx` — deliberately *not*
   `steelGearCtx()` itself, which resolves specs and builds a whole solve context
   and has no business running every frame:
   ```ts
   function sightOffsetTarget(): SightOffset {
     const s = store();
     const inv = s.inventory;
     const rifle = inv.rifles.find((r) => r.id === inv.activeRifleId);
     return sightOffset(s.session.scope, rifle?.playerZero ?? null);
   }
   ```
   Seed `st.sight = sightOffsetTarget()` once at scene setup (trap §4.2).
4. **Ease it once per frame**, in the render loop immediately *before*
   `camera.quaternion.copy(aimQuaternion(st.t))`, using the loop's already-clamped
   `dt`:
   ```ts
   st.sight = easeSightOffset(st.sight, sightOffsetTarget(), dt);
   ```
5. **Apply it in `aimQuaternion`**, exactly as written in §2.3 — `+ st.sight.elevRad`
   on the pitch term, `− st.sight.windRad` on the yaw term. Copy the §2.2 direction
   table into a comment above the function; the next person to read this line will
   need it as much as you did.

No other call site changes. `findAimed`, `commitRef`, both FIRE paths and the
mirage dispatch all go through `aimQuaternion` already and pick this up for free.

**Boundary after DV2: owner-verification stop.** Mark `AWAITING OWNER` in
`PROGRESS.md` and hand over this checklist:

> **1 — Zeroing (the headline case).** Sight-in bay: fire a group, then *without
> touching the aim* turn the dials until the crosshair sits on the group. The
> crosshair should walk toward the group, not away from it. Press **Confirm Zero**:
> the sight picture must **not jump**. Re-centre on the bull and fire — the group
> should now be centred.
>
> **2 — Dialing alone does nothing.** Steel range, crosshair on a plate. Dial 2 MIL
> **up** and do not move: the plate rises in the view and the crosshair sits below
> it. Fire → the shot lands **low**, as if you had never dialed. Now re-centre the
> crosshair on the plate and fire → it hits. (Before this change, step one alone
> would have corrected the shot. This is the intended change and the thing to judge.)
>
> **3 — Windage.** Dial 1 MIL **right**: the crosshair must walk **left**.
>
> **4 — Big come-ups.** Dial 15–20 MIL at 20×+. The target will leave the field of
> view until you re-acquire (zoom out, re-aim, zoom in). This is real behaviour —
> tell me whether it is acceptable in play or whether it needs a re-acquire aid.
>
> **5 — Feel.** Is one 0.1 mil click visible? Does a coarse ±20 step read as one
> smooth sweep rather than a jump or a lag? `SIGHT_GLIDE_TAU_S` (default 0.027 s)
> is the knob — say faster or slower and I will re-tune it.
>
> **6 — Nothing swings on entry.** Walk onto a range with a zeroed rifle: the view
> must be settled from the first frame, not glide into place.

**Commit point: `commit + push`.**

```
dial-moves-view DV2: turrets move the sight picture in real time

- Rotates the sight line by (turret + stored zero) so dialing walks the
  crosshair across the target the way a real erector does; the shot math is
  untouched and dialing alone still cannot move the impact.
- Adds scope/turret-view.ts (pure) with the sign conventions, the ~80 ms glide
  and the dial-does-not-move-the-impact invariant under test.
```

---

### DV3 — record it

No behaviour change. Three edits:

1. **`Design/feature-catalog.md`** — under §B in the **Built** section, a new
   `#### Turret-follows-view (live erector offset)` entry: one-paragraph
   description, `**Built** — 2026-08-XX`, the files touched, and the two locked
   decisions from §7 (always on, no toggle; movement only, no HUD aid).
2. **`Design/execution/PROGRESS.md`** — a `## Dial Moves the View` section with a
   task row per task (status/date/commit/note), gate numbers, `ctest` and
   `validation/run.mjs` recorded **N/A**, the §3.2 seam under *Deferred
   observations*, and any tuning the owner asked for at DV2.
3. **`Wiki/turret-direction.md`** — a short new article started from
   `Wiki/_Template.md` and linked from `Wiki/Home.md`. The §2.2 table in both MIL
   and MOA, the vise-test explanation of *why* the crosshair moves opposite to the
   impact, and the "chase the group with the crosshair, then re-aim" procedure.
   Cite the zeroing/sight-adjustment pages in `Documentation/` by **PDF page** via
   `Documentation/source-map.md` (FM 23-10 is the likely home). **If you cannot pin
   a real page, mark the article `Status: needs-sources` and log it in
   `Wiki/_gaps.md` — do not invent a citation.**

**Boundary after DV3:** plan complete. **Commit point: `commit + push`.**

```
dial-moves-view DV3: document turret direction

- Records the feature in the catalog and PROGRESS, including the confirm-zero
  seam when re-zeroing to a new distance.
- Adds Wiki/turret-direction.md: which way the dials go, and why the crosshair
  moves opposite to the impact.
```

---

## 6. Definition of done

- Dialing moves the sight picture in the direction table of §2.2, on every range
  and in the sight-in bay.
- Dialing alone never changes where a shot lands (DV1 test 4, and the owner's
  DV2 step 2).
- Confirm Zero does not jump the view at the rifle's current zero distance.
- No new dependency, no engine change, no save-schema change.
- Hidden truth stays hidden: `zeroOffsetRad` appears nowhere in this diff.

## 7. Owner decisions (locked 2026-08-06)

1. **Feel: a short glide, ~80 ms**, not an instant snap — a single 0.1 mil click at
   10× is ~2% of screen height and a hard cut is easy to miss. Tunable at the DV2
   stop via `SIGHT_GLIDE_TAU_S`.
2. **Always on. No Settings toggle.** It is the physically correct behaviour, so it
   is simply how the game works — one code path, no schema bump. The ELR
   re-acquire cost (§4.6) is accepted, and is re-checked at the DV2 stop.
3. **Movement only — no HUD teaching aid.** No direction label, no bore/point-of-aim
   ghost marker. The view moving *is* the lesson, and it is the one that transfers
   to a real rifle, where no label exists.

## 8. Gates (every task, before it is marked done)

From `GameBuild/app/`, in order, all green:

```
npx vitest run
npx tsc --noEmit
npm run build
```

`ctest` and `node GameBuild/validation/run.mjs` are **N/A** for this plan — no
engine source is touched — and must be recorded as N/A in `PROGRESS.md`, never
skipped silently. **You do not run git commands** (protocol §2c): surface the
commit message at each commit point and let the owner run it. Never offer a commit
on a red gate.

## 9. Deliberately deferred

- **A re-acquire aid for large come-ups** (an off-screen target arrow, or an
  auto-zoom-out). Only build this if the owner asks for it after DV2 step 4.
- **Modelling the trajectory zero's own launch angle** as a fourth offset term,
  which would close the §3.2 confirm-zero seam. Not worth a solver call per frame
  for a nudge the owner will see only when re-zeroing to a new distance.
- **A scope-cant / canted-base interaction** (catalog §C3). The offset is applied
  as two independent axes; a canted base would rotate them together. Nothing here
  blocks that later.
- **Turret rotation animation** (a drawn dial that spins). Cosmetic, and unrelated
  to the direction lesson.
