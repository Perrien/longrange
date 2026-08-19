# ELR Probe — two throwaway 3 km ranges, built to be looked at

Status: **plan, nothing built.** This is the next build.
Date: 2026-07-27

Owner direction (2026-07-27): *"a very simple test of flat ground, gongs every 500 to 3k
and whatever other things it may need to handle, do that first, learn what works and
doesn't and then build on that."* Correct call — see §1.

This **supersedes `Design/elr-dope-range-plan.md` as the thing to build next**. That document
is not wrong, but most of it is unvalidated; it now carries a banner saying so and stays as
the reference for the arithmetic this probe does *not* need to re-derive.

Precedent: this is the same move the Test Range already made for the environment system —
*"a prototype for upgrading Range A / Zero Range's visual world before touching those live
ranges."* A throwaway range that de-risks a real one is an established pattern in this repo.

---

## 1. Why a probe, and what it is really testing

The obvious answer is "will a 3 km world render and hold frame rate." That matters, but it
is not the interesting risk.

**The real risk is the shot loop at ELR timescales.** Nothing in the game was built for
them:

| | Range A's longest shot (500 yd) | this probe's longest (3000 m) |
|---|---|---|
| time of flight | ~0.6 s | **9.4 s** (6.5 CM) |
| sound travel back | 1.34 s | **8.8 s** |
| **trigger → ping** | **~2 s** | **~18 s** |

Eighteen seconds. And the pieces that fill those seconds are all sized for two:

- **`scope/BulletTrace.ts`** draws a **0.15 s** trail (`TRAIL_S`) behind an **8 cm** glow
  sprite (`HEAD_SIZE_M`). On a 9.4 s flight the trail covers 1.6 % of the arc, and an 8 cm
  sprite at 3000 m subtends 0.027 mrad. **Expect the tracer to be invisible.**
- **`audio/audio-model.ts`** — its own doc comment reads *"500 yd (≈457 m) ... ≈ 1.34 s."*
  Distance attenuation floors out at `SOUND_MAX_DISTANCE_M`, so the ping at 3 km plays at
  minimum volume. **Expect it to be inaudible or nearly so.**
- Impact FX, the per-shot scatter sim and the curl-noise wind field were all tuned in a
  500-yd world.

None of that can be reasoned about. An 18-second shot is either *tense* — you watch, you
wait, you hear it — or it is *tedious*, and no table settles which. **That is what this probe
is for.** The rendering questions come along for free.

---

## 2. What this probe is NOT

Deliberately excluded, so it stays a probe and not a range:

- ❌ No bluff, no terrain relief, no forward face — **dead flat** *(Probe A only; Probe B in
      §3.3 adds exactly this one variable, and nothing else)*
- ❌ No 250 m ladder — **500 m steps, 6 stations**
- ❌ No environment dressing — no trees, scrub, rocks, grass, ridges, clouds
- ❌ No optic travel model (§6.6 of the full plan). It does not exist yet, so **the turret
      currently dials without limit** — which is exactly what the probe wants
- ❌ No Mach-state marking, no travel verdict readout, no DOPE nodes
- ❌ No ring **scoring** — the rings are drawn, but a hit is still just hit/miss
- ❌ No imperial layout — **metric only**
- ❌ **No fixes to the trace, audio or impact FX.** Watch them fail first (owner, 2026-07-27)
- ❌ **No LOS-relative solver fix.** Probe B is expected to miss low by ~0.45 MIL at 3000 m;
      that is the measurement, not a bug to pre-empt
- ❌ No wind markers (`windMarkers: false`) — the wind field is checked by dialling a known
      wind and comparing drift against the §5 table, which is a better test than flags anyway
- ❌ Not on the range-select screen — `UNLISTED` in the registry, reached by id

It is throwaway. Give it an id that says so (`elr-probe`) and expect to delete it.

> **The probe runs to 3000 even though the real range now stops at 2000** (owner,
> 2026-07-27). The full plan's cap was revised down for oracle coverage and Mach trust —
> but the probe's job is to *find* limits, not respect them. Firing at 2500 and 3000 and
> watching them misbehave turns "stop around 2000" from a judgement into something observed.
> It costs a longer ground plane on a scene that gets deleted.

---

## 3. Layout — Probe A (flat)

Dead flat ground. Eye at **1.70 m**, gong centres at **1.00 m** — the same relationship every
other range uses, so nothing new is introduced.

**Gong size: 1 MIL at every station** (owner, 2026-07-27). Because a mil is *defined* as 1 m
at 1000 m, the plate diameter in metres is just the station number with the decimal moved —
no table lookup, and it makes the metric range trivially readable.

| station | azimuth | world x | world z | gong ⌀ (1 MIL) |
|---|---|---|---|---|
| 500 m | −1.5° | −13.09 | −499.8 | **0.50 m** |
| 1000 m | −0.9° | −15.71 | −999.9 | **1.00 m** |
| 1500 m | −0.3° | −7.85 | −1500.0 | **1.50 m** |
| 2000 m | +0.3° | +10.47 | −2000.0 | **2.00 m** |
| 2500 m | +0.9° | +39.27 | −2499.7 | **2.50 m** |
| 3000 m | +1.5° | +78.53 | −2999.0 | **3.00 m** |

*(The imperial equivalent is 3 MOA, which is 0.873 MIL — 12.7 % smaller angularly. The probe
is metric-only so it does not arise here; see the full plan for the consequence.)*

Ground plane: **300 m wide × 3100 m long**, flat, one material. That is the whole world.

> **Why the gongs are fanned and not in a straight line.** They have to be. On flat ground
> the sight line to the 3000 m gong passes **1.117 m** high at r = 2500 m, and the 2500 m
> gong's top edge is at **2.250 m** — it blocks. Same for every adjacent pair down to
> 1000/1500. A straight line of gongs on flat ground **cannot see its own far end**, and
> 1 MIL plates make it worse than 2 MOA ones did.
>
> This is worth knowing before building it, because "I can't see the far targets" would
> otherwise read as a rendering bug and send the probe chasing the wrong thing. The ±1.5°
> fan at 0.6° steps clears the worst pair by **+0.457°**, against a 0.143° requirement.
>
> It is also the first half of the argument for the bluff in the full plan: on flat ground,
> *azimuth alone* has to do all the separating.

### 3.1 Target colour — white plate on a DARK panel

Owner direction: **targets must be white**, not grey — grey will not read at 3 km. Correct,
and it is also authentic: real ELR steel is painted white, and this game's plate model
already chips paint through to bare metal on a hit, so a white plate showing dark chips is
both true to life and legible at distance.

**But the backdrop decides this, not the plate.** Fog washes everything toward the pale
horizon colour, which compresses contrast — and it compresses *bright* things far harder
than dark ones. Apparent contrast at the configured 1.7e−4 fog density:

| station | fog | white on a **pale** deck | white on a **dark panel** | dark on a pale deck |
|---|---|---|---|---|
| 1000 m | 3 % | 0.214 | **0.690** | 0.476 |
| 2000 m | 11 % | 0.196 | **0.632** | 0.437 |
| 3000 m | 23 % | 0.170 | **0.547** | 0.378 |

White on pale ground is the **worst** option available — worse even than a dark plate. A
white plate only wins when it has something dark immediately behind it, which is exactly the
finding the Wooded Zero Range already documented in reverse (*"White against dark conifers is
the strongest read available"*, `mil-zero-range-plan.md` §5.2 — white worked there **because**
the backdrop was conifers).

So the probe hangs a **white gong (`0xf2efe6`) on a dark charcoal backer panel**, frame
1.5 × gong wide and 2.0 × gong tall. Local contrast then holds at 3 km regardless of what
ground colour a later biome uses, and it removes a dependency between two decisions that
should be independent.

Ground for the probe stays a **mid neutral** — deliberately not pale, not dark — so §5.2 can
judge the plate on its own merits before a biome is chosen.

### 3.2 Bullseye rings

Three concentric rings on every plate (owner, 2026-07-27) — generous to hit, but a tight
group is still visible:

| ring | metric | imperial | angular | fill |
|---|---|---|---|---|
| centre | ⅓ MIL | 1 MOA | 0.333 mrad | white `0xf2efe6` |
| middle | ⅔ MIL | 2 MOA | 0.667 mrad | mid blue `0x2f6fd0` |
| outer | 1 MIL | 3 MOA | 1.000 mrad | white `0xf2efe6` — the plate edge |

**The rings are constant-angular like the plate, so they look identical at every station.**
Distance drops out; only magnification matters, which means one texture serves all six
stations and the probe can judge the pattern from any of them.

On-screen, at a 900 px scope circle:

| magnification | 5× | 10× | 15× | 20× | 35× |
|---|---|---|---|---|---|
| plate | 11 px | 21 px | 32 px | 43 px | 75 px |
| red centre | 4 px | 7 px | 11 px | 14 px | 25 px |
| ring band | 2 px | 4 px | 5 px | 7 px | 13 px |

Rings should resolve from ~15× up and blur into one disc by 10×. **That is the intended
behaviour** — finding the plate is a low-magnification job, scoring against it a
high-magnification one. The probe's job is to confirm the blur is graceful rather than
shimmery.

> **Why white / blue / white and not a red centre** (owner, 2026-07-27). Red `0xd81f26` is
> **0.30** luminance and the blue ring **0.32** — they differ only in *hue*, and at 10× the
> whole plate is 21 px with fog desaturating it. A red centre would merge into the blue ring
> at exactly the distances that matter. White on blue is **0.62** of luminance contrast, and
> it survives greyscale, fog and a handful of pixels. It is also brighter overall: plate
> average 0.733 vs 0.662.
>
> **Why mid blue and not navy or bright blue.** Navy drops the plate average to 0.59; a
> brighter blue lifts it to 0.72, at which point the disc's luminance crosses pale ground's
> and the target becomes camouflage. `0x2f6fd0` keeps margin on both sides. Full tables in
> `elr-dope-range-plan.md` §5.3.
>
> The practical consequence for this probe: **the dark backer panel is load-bearing**, not a
> nicety. A bullseye plate on pale ground has a contrast under 0.05 at 3000 m — it
> effectively disappears.
>
> **A/B worth doing on device:** a small dark centre dot (~⅓ MOA). White/blue/white has no
> *filled* aim mark — the centre is inferred from the blue annulus's inner edge. A dot
> restores one for ~0.01 of average luminance, and is ~7 px at 35× / invisible below 20×.

---

### 3.3 Probe B — the rising-slope variant (owner, 2026-07-27)

A **second scene**, not a change to the flat one. Same six stations, same plates, same code
path — but the shooter sits on a **10 m bluff** and the targets climb a hillside, so vertical
separation replaces the azimuth fan and the stations can sit on **one straight lane**.

Probe A stays dead flat because it is the clean baseline for §5.1 and §5.3 — the shot loop and
frame time should be measured with nothing else varying. Probe B then changes exactly one
thing.

### The slope must be CONVEX, not linear — this is the whole finding

The intuition is that raising the far targets spreads them out vertically. **On a linear
slope that is false**, and the arithmetic is blunt about it:

| ground rise to 3000 m | linear — worst separation | convex (`r²`) — worst separation |
|---|---|---|
| 50 m | 0.041° ❌ | 0.200° ✅ |
| 100 m | 0.041° ❌ | 0.359° ✅ |
| 200 m | 0.041° ❌ | **0.675°** ✅ |
| 300 m | 0.040° ❌ | 0.988° ✅ |

*(requirement: 0.143°)*

**A linear slope gives 0.041° no matter how high the hill goes.** Every target on a straight
line through space subtends almost the same elevation angle from a fixed eye — at a 200 m rise
the spread is only +2.59° to +3.61°, and adjacent stations differ by 0.04°. The hill gets
taller and the targets stay stacked on top of each other. Raising it further does not help
because the effect is a *ratio*, and the ratio is what a straight line holds constant.

Making the slope **convex** — rising slowly near the shooter and steepening with distance —
breaks the ratio and spreads the stations properly. At a 200 m rise the elevation spread is
**−0.59° to +3.61°** and the worst pair clears by **+0.532°**, 3.7× the requirement, on a
single lane with **no azimuth fan at all**.

Convexity also guarantees sight-line clearance for free: **for a convex profile the chord
between any two points lies above the curve**, so no intervening ground can rise into a sight
line. Clearance to the 3000 m gong runs 26–56 m through the middle of the range. On the linear
profile the same clearance collapses to **1.18 m** at r = 2950 — grazing, and the same
"gentle hill eats the sight line" gotcha the Wooded Zero Range paid for once already.

### Recommended profile

| parameter | value |
|---|---|
| shooter bluff | 10 m (eye at **11.70 m**) |
| ground height | `h(r) = 200 × (r / 3000)²` |
| rise at 500 / 1500 / 3000 m | 5.6 m / 50 m / **200 m** |
| final grade at the far end | 13 % — a real hillside, not a wall |
| lane | **single straight lane**, azimuth 0° at every station |
| gong centre | 1.00 m above its own local ground |

| station | ground | incline | LOS range |
|---|---|---|---|
| 500 m | 5.6 m | **−0.59°** | 500.0 m |
| 1000 m | 22.2 m | +0.66° | 1000.1 m |
| 1500 m | 50.0 m | +1.50° | 1500.5 m |
| 2000 m | 88.9 m | +2.24° | 2001.5 m |
| 2500 m | 138.9 m | +2.94° | 2503.3 m |
| 3000 m | 200.0 m | **+3.61°** | 3006.0 m |

Note the near station is very slightly **downhill** and the far one meaningfully **uphill** —
a single range that exercises both signs of incline.

### It exposes the flat-fire solver, on purpose

`firing-solution.ts` is flat-fire: it measures drop against a target plane at `z = −R` with
`R` treated as horizontal. Every range so far has kept inclines under 3° at distances where
drop is small, so `mil-zero-range-plan.md` §6.4 logged this as a harmless simplification.
**Probe B is the first layout where it stops being harmless:**

| ground rise | incline at 3000 m | flat-fire error | in clicks | vertical miss at 3 km |
|---|---|---|---|---|
| 50 m | +0.75° | 0.02 MIL | 0.2 | 0.06 m |
| 100 m | +1.71° | 0.10 MIL | 1.0 | 0.30 m |
| 150 m | +2.66° | 0.24 MIL | 2.4 | 0.73 m |
| **200 m** | **+3.61°** | **0.45 MIL** | **4.5** | **1.35 m** |

At the recommended 200 m rise the solver is out by **1.35 m of elevation at 3000 m — nearly
half a plate.** That is a real, reproducible, measurable miss, and having it appear on a
deliberate test range is far better than discovering it later on a mission map with terrain.

If the owner would rather keep the incline confound out of the first look, **100 m of rise**
still clears occlusion (+0.216°) at a tenth of the ballistic error. The trade is stated here
rather than decided.

### What Probe B could replace

If it reads well, the full plan's **12 m bluff + ±2.0° fan (§2–§3) may both be unnecessary**.
A modestly elevated firing point looking up a convex hillside is simpler to build, more
natural to look at, and answers the "grey band" worry directly — you are looking *at* a
slope rather than along a plane, so the ground reads as receding surface instead of an
edge-on line. Impact splash should also be far more legible, since the hillside faces you.

That is a real possible outcome of this probe, not a side note.

---

## 4. What has to change to make it render at all

Three constants, sized when the longest range in the game was 200 m. Route all three through
the **range config**, not globally — `ScopeView` already does this for eye height
(`sightIn?.eyeHeightM ?? EYE_HEIGHT_M`, line 366), so the existing four ranges stay untouched.

| | today | probe |
|---|---|---|
| camera **far** (`ScopeView.tsx:367`) | 3000 m | **12000 m** |
| camera **near** (`ScopeView.tsx:367`) | 0.5 m | **10 m** |
| sky dome radius (`environment/sky.ts` via config) | 1500 m | **9000 m** |
| fog density | 7.45e−4 | **1.7e−4** |

`near` is the one that stops z-fighting at long range — `far` has almost no effect on depth
precision. Full derivation in `elr-dope-range-plan.md` §6.1; it is settled arithmetic and the
probe does not need to re-check it, only to confirm no artefacts appear.

Raising `near` to 10 m is safe: the reticle is a 2D canvas overlay, and no scene content sits
within 18 m of the eye on any range (`shooterClearM: 18`).

---

## 5. What to look for

Fire the shipped default load (**6.5 CM 140 gr ELD-M**, `65cm-140-match`) at every station.
Predicted values, so a deviation is obvious rather than a matter of opinion:

| station | come-up | Mach | TOF | + sound | **trigger → ping** |
|---|---|---|---|---|---|
| 500 m | 3.33 MIL | 1.76 | 0.71 s | 1.47 s | **2.2 s** |
| 1000 m | 10.51 MIL | 1.19 | 1.73 s | 2.94 s | **4.7 s** |
| 1500 m | 23.33 MIL | 0.88 | 3.22 s | 4.41 s | **7.6 s** |
| 2000 m | 43.35 MIL | 0.77 | 5.01 s | 5.88 s | **10.9 s** |
| 2500 m | 70.00 MIL | 0.68 | 7.08 s | 7.35 s | **14.4 s** |
| 3000 m | **103.79 MIL** | 0.61 | 9.44 s | 8.82 s | **18.3 s** |

*(The 6.5 CM is deep subsonic past ~1200 m, which is why the come-ups get absurd. That is
correct behaviour and is itself worth seeing — 104 MIL is more elevation than any optic in
the catalog has, which previews the travel wall without needing the travel model built.)*

### 5.0 FINDINGS — on device, 2026-07-28 (owner, iPad)

**The probe has answered its Tier-1 questions. All three clear.**

| question | answer | consequence |
|---|---|---|
| Is an 18 s shot tense or tedious? | **Fine.** Not a problem. | The ELR range is viable at full time of flight. No TOF compression needed; do not build one. |
| Frame time on the iPad | **Locked at 60 fps**, 16–17 ms typical, **spikes to ~30 ms**. | Passes the <16 ms gate at the mean. The spikes are the only perf item left (§5.0a). |
| `DEPTH_BITS` on the iPad | **24.** | The two-pass depth split is **not needed**. `near = 10 m` alone carries 3 km. §6.1 of the full plan can drop it. |
| Convex hillside vs flat deck | **Convex wins**, decisively — owner: *"opens up so many options"*. | **Probe B's profile is the pattern for the real range.** This retires the 12 m bluff and the ±1.5° fan from `elr-dope-range-plan.md`: the convex slope buys the angular separation on its own, on a single straight lane, which is both more natural and more shootable. |
| Trace / impact / ping at 2000 m | **All three present.** | Better than predicted — §1 expected the tracer to vanish past ~1000 m and the ping to be marginal. The `BulletTrace` 0.15 s trail and the 500 yd `audio-model` tuning are **not** blockers. Their rework moves from prerequisite to polish. |

**One genuine oddity, and it is physics, not a bug.** At the far stations the bullet does not
read as an arc — it *drops out of the sky*. That is correct: with a 104 MIL come-up the launch
angle is so steep that the ascending leg happens above and behind the sight picture, and the
only part inside the scope's field of view is the near-vertical terminal descent. Worth
recording because it will read as wrong to a player who has never seen it, which makes it a
**teaching moment rather than a defect** — it is the visual proof of what a 100+ MIL come-up
actually means. Candidate Wiki hook: `trajectory-shape` / the come-up article.

#### 5.0a Still open

- **The ~30 ms spikes.** Mean is fine; the spikes are not yet attributed. Suspects, cheapest
  first: the per-shot solve (a 3 km fine table is thousands of integration steps on the main
  thread), the wind-field solve, and plate-atlas writes on impact. Worth attributing before
  the real range adds terrain and vegetation on top — the probe is deliberately empty, so
  this is the *floor*, not the ceiling.
- **The dead FIRE button.** Now partially characterised — see §5.0b.

#### 5.0b The FIRE failure, characterised

Observed on device: **`FIRE blocked: shot failed: [object Object]`**, with recoil but no trace.
That is a throw inside `fireSteel`'s engine block — the shot is resolved *after* the throw
point, the recoil kick is applied *after* the catch, hence a kick with nothing downrange.

`[object Object]` was a **reporting defect, not the fault itself**: the catch used
`String(err)`, and an Emscripten C++ exception is not an `Error`, so the message the engine
had already written was discarded. Fixed 2026-07-28 (`engine-bridge/describe-thrown.ts`) —
the next occurrence will name itself.

The engine's reachable throw sites, for matching against whatever text comes back:

| site | message |
|---|---|
| `simulator.cpp:328` | `computeZero: bullet cannot reach target distance (MV too low or range too far)` |
| `simulator.cpp:295` | `computeZero: target distance (-z) must be > 0` |
| `trajectory.cpp:19` | `Trajectory point index out of range` |
| `atmosphere.cpp:24/28` | temperature / humidity range |

Noted while reading: **`Simulator::computeZero` hard-codes its own `simulate(sim_dist, dt,
5.0f)` time wall**, which the P0 fix did not touch (P0 raised the *caller's* cap in
`engine-bridge/index.ts`). It is harmless at a 100 m zero, but it is a second, hidden 5 s
ceiling that would bite instantly if anything ever zeroes at long range — and the no-gear
sight-in fallback does exactly that (`ScopeView.tsx`, `zeroRangeM: distanceM`). Logged here
rather than fixed, because it is not yet shown to be *this* bug.

### 5.1 The shot loop — the primary question

- Is an 18-second shot **tense or tedious**? Trust the gut answer, not the second one.
- Does the **tracer** show at all past ~1000 m? (Predicted: no.)
- Is the **ping** audible at 2000 m+? (Predicted: barely.)
- Does the **impact splash** tell you where a miss went? Without it, a miss at 3 km is
  information-free.
- Can you **hold the sight picture** for 9 s of flight, or does aim wobble make watching the
  trace pointless?
- Does anything **break or drift** over that long a flight — trace endpoint off the target,
  ping arriving before the impact, FX firing at the wrong time?

### 5.2 Does 3 km read as distance?

- Can you **find** the 3.00 m gong at 3000 m, and at what magnification? *(A 1 MIL plate is
  8.4 % of the view at 35×, 2.4 % at 10×, 1.2 % at 5× — so it should be findable at 10× and
  shootable at 20×+. If it is not, the sizing rule is wrong, not the range.)*
- Does the **white-on-dark-panel** plate hold contrast at 2500–3000 m, or wash out? Try a
  dark plate at the far stations as a control — the table in §3.1 predicts dark-on-pale beats
  white-on-pale, and that prediction is worth testing since it is counter-intuitive.
- Is a **3 m plate** too generous — does it feel like a barn door at 3 km?
- Do the **bullseye rings** resolve where §3.2 predicts (clean at 15×+, blurred by 10×), and
  does the blur look graceful or shimmery? Watch for mipmap crawl on the ring edges as
  magnification changes — a fine concentric pattern is the worst case for it.
- Is the **centre findable** without a filled aim mark, or does the eye want a dot? Try the
  ⅓ MOA dark-dot variant side by side at 2500 and 3000 m.
- Does the far half look like *distance*, or like a **grey band**? (This is where flat ground
  is expected to fail — and that failure is the argument for the bluff.)
- Is **fog at 1.7e−4** right? Try 1.2e−4 and 2.5e−4 too — it is one number.
- Do the gongs **z-fight** their own frames at 2500–3000 m? (Predicted: no, with `near = 10`.)

### 5.3 Probe B — the rising slope (§3.3)

- Does the **convex hillside read better than the flat deck**? Compare A and B back to back at
  the same magnification. This is the question that decides the full plan's §2 bluff.
- Are all six stations **visible on one straight lane**, as the +0.532° margin predicts?
- Is the **impact splash** more legible on a slope facing you than on a plane seen edge-on?
- Does the **flat-fire error** show up as predicted — roughly 0.45 MIL / 1.35 m low at 3000 m?
  Dial the computed solution and see whether it lands consistently high or low by about half a
  plate. A confirmed, repeatable bias is the finding; a random one means something else is
  wrong.
- Do **misses that clear the crest** disappear sensibly, or do they do something odd?

### 5.4 Performance

- **Frame time on the iPad** — the gate stays <16 ms. This world is flat and near-empty, so
  if it fails *here* the full range is not viable in its current form.
- **`gl.getParameter(gl.DEPTH_BITS)`** — print it on screen. If it reads 16 rather than 24,
  the two-pass depth split becomes mandatory and §6.1 of the full plan needs rewriting.
- Does the **wind field** still sample sensibly 3 km downrange, or does it go flat/wrong past
  the extent it was tuned for? Dial a known 10 mph full-value crosswind and check the drift
  against the predicted table — no flags needed.
- After P0, does the **far station always return a solution**, or does it intermittently come
  back empty? A silent no-solve is the failure mode §6.1 exists to prevent.

---

## 6. Build steps

Three, all small. **STOP after each** (`execution-protocol.md` §2.8).

| Step | Scope | Touches |
|---|---|---|
| **P0** ✅ | **Lift the solver's 10-second flight cap** (§6.1 — this is a blocker, not a nicety). Make `max_time` a `SolveOptions` field instead of the hardcoded `10.0`; default it generously (20 s) or derive it from range. Regression-test that existing ranges produce identical tables. | `engine-bridge/index.ts`, `engine-bridge/types.ts`, tests |
| **P1** | Per-range camera near/far + dome radius + fog. `elr-probe` registry row (UNLISTED) + a flat 6-station config. **Build** an on-screen `DEPTH_BITS` + frame-time readout (§6.2 — none exists today). **No scene yet** — verify the four existing ranges are pixel-identical and unchanged. | `ScopeView.tsx`, `environment/sky.ts`, `ranges.ts`, new `elr-probe-config.ts` |
| **P2** | **Probe A** — the flat scene: flat plane, 6 gongs on frames, reusing `RangeScene`/steel-reaction/`plate-surface` **unmodified**. Reachable by id. Then **shoot it and write down §5**. | new `ELRProbeScene.ts`, `ScopeView.tsx` |
| **P3** | **Probe B** — the rising-slope variant (§3.3): same scene, convex terrain profile, single lane, 10 m bluff. A config flag on the same scene builder, not a second builder. Shoot both back to back. | `elr-probe-config.ts`, `ELRProbeScene.ts` |

### 6.1 P0 — the solver stops the bullet at 10 seconds

`engine-bridge/index.ts:148` calls:

```ts
sim.simulate(opts.maxRangeM * 1.05, dt, 10.0);
```

The third argument is **max time of flight in seconds** — confirmed in
`GameBuild/engine/src/ballistics/simulator.cpp:372–386`, where `max_sim_time = start_time +
max_time` and the integration loop exits on **whichever comes first**, distance or time.

At 500 yd that cap is invisible. At 3 km it binds:

| | value |
|---|---|
| 6.5 CM 140 ELD-M, TOF to 3000 m | **9.44 s** |
| distance reached at the 10.0 s wall | **3108 m** |
| distance `solveTrajectory` asks for (`3000 × 1.05`) | **3150 m** |
| **shortfall** | **42 m — the time cap binds before the distance target** |

**BUILT 2026-07-27 — and the bug was worse than this estimate.** Measured against the engine
itself rather than the reference integrator, a **cold morning alone** is enough:

| conditions | flight time to 3000 m | old 10 s wall returned |
|---|---|---|
| 15 °C, calm | 9.45 s | 6 rows ✅ (0.55 s of margin) |
| **0 °C, 15 mph headwind** | **10.18 s** | **5 rows — stops at 2500 m** ❌ |
| 0 °C, 25 mph headwind | 10.41 s | 5 rows ❌ |
| 0 °C, headwind, slow 2600 fps lot | 10.45 s | 5 rows ❌ |
| −5 °C, humid, 25 mph, bulk lot | 10.83 s | 5 rows ❌ |

Nothing in that table is exotic. A cold day with a breeze — routine conditions the game
already models — and the 3000 m station **silently has no firing solution**. The table simply
comes back one row shorter, with no error and no gap, so a caller cannot distinguish a
truncated solve from a legitimate one.

Fixed by making it a parameter rather than bumping the constant, so the value is visible at
the call site and a future ELR load can raise it further. `DEFAULT_MAX_TIME_S = 30` carries
every catalog load past 3 km with room to spare; the cost is zero in the normal case, because
distance is still the binding exit condition.

Note the `.50 BMG` reaches 3000 m in 6.65 s and never trips this — it is specifically the
**slow and subsonic** loads, which is exactly what the probe will be firing.

**Verification (all green):** 606 app tests (up from 601 — five new, including the cold-day
case and a guard that pins the silent-truncation failure mode on demand); `tsc --noEmit`
clean; golden-vector harness **36 cases, worst relative diff 0.000e+0** — the change is
provably behaviour-preserving for every existing range; `npm run build` succeeds, PWA
precache regenerated.

### 6.2 P1 — the frame-time readout does not exist yet

There is no perf HUD in the codebase. `PROGRESS.md` records frame-time checks, but they were
made with external tooling, not an in-app display. P1 therefore has to **build** the readout,
not enable one — a small overlay showing rolling frame ms plus a one-shot
`gl.getParameter(gl.DEPTH_BITS)`. Cheap, but it is work, and every performance question in §5.3
depends on it.

### 6.3 Good news — the steel scene contract is already clean

`range/steel-scene-api.ts` is a **purely structural interface** (`plates`, `plateMesh`,
`plateSurface`, `chainMesh`, `chainRest`, optional `update`, `dispose`) with no `sceneType`
gating anywhere. `RangeScene` and `TestRangeScene` both satisfy it structurally, so
`ELRProbeScene` need only do the same.

**This answers open item #3 on the full plan: no capability extraction is needed, and its
Stage 3 can be dropped.** The remaining `sceneType ===` tests in `ScopeView` (lines 296, 308)
are the scene-builder branch itself, which is that field's actual job.

> **One small thing to supply.** `ScopeView` derives `laneLenM` for wind-marker filtering from
> a per-scene constant with an `else` fallback to `RANGE_A_GROUND.laneLengthM`. A new scene
> type lands in that fallback. The probe sets `windMarkers: false` so it does not bite here,
> but the full range must provide its own value or its flags will all be filtered out at
> 500 yd.

---

## 7. What each answer unblocks

So the probe's output feeds somewhere specific rather than being a vibe check:

| finding | decides |
|---|---|
| shot loop feels tense / tedious | whether the ELR range is worth building at all, and whether TOF needs a time-compression option |
| tracer invisible | trace scaling work — and whether it is a prerequisite or a polish item |
| ping inaudible | audio distance model rework; possibly a visual hit-confirm instead |
| flat ground reads as a grey band | confirms the 12 m bluff (full plan §2), or replaces it with something else |
| frame time at 3 km | deck size, vegetation density, whether 3000 survives as the far station |
| `DEPTH_BITS` = 16 | forces the two-pass depth split; rewrites full plan §6.1 |
| fog density preference | one config number in the full plan |
| gong findability at 3000 m | whether 1 MIL holds up, or the plates want to shrink toward 2 MOA |
| white-on-dark holds or washes | plate/panel palette, and whether the biome choice (full plan §7) is constrained by it |
| ring blur / mipmap behaviour | whether the bullseye needs a distance-aware texture (LOD variants) or one texture serves |
| ring erosion rate from hits | whether steel needs a **repaint** action, as paper bays have "Clean target" |
| whether the 20 s solver cap is enough | the far-station cap for the full plan, and whether ELR loads need their own value |
| **Probe B reads better than Probe A** | whether the full plan keeps its 12 m bluff + ±2° fan (§2–§3) or replaces both with a convex slope on a single lane |
| **flat-fire error confirmed at ~0.45 MIL** | whether an LOS-relative solver is a prerequisite for any sloped range, and when `Wiki/_gaps.md`'s logged simplification has to be paid off |

Everything in `elr-dope-range-plan.md` **§1 (effective ranges), §3.2 (occlusion), §4.1
(come-up and travel tables), §4.3 (wind drift)** is settled arithmetic and is **not** on this
list — the probe cannot overturn trigonometry.

---

## Sources

- Trajectories, Mach, TOF, come-ups: the validated G7 point-mass integrator described in
  `elr-dope-range-plan.md` §1.1 and §11.
- Sound delay: `distance / 340.3 m/s` (ISA), matching `audio/audio-model.ts`
  `soundDelaySeconds`.
- Occlusion, fan geometry and the straight-line blocking result: computed from the §3
  parameters.
- Code read for the limits quoted: `scope/ScopeView.tsx` (camera, line 367; eye height, 366),
  `scope/BulletTrace.ts` (`TRAIL_S`, `HEAD_SIZE_M`), `audio/audio-model.ts`,
  `game/loads.ts` (`DEFAULT_GAME_LOAD_ID`), `range/test-range-config.ts` and
  `range/wooded-zero-environment.ts` (`shooterClearM`, dome radius, fog).
