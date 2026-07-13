# Increment 1 — First shippable slice: the KD shot loop (task doc)

`Goal:` a fun, complete, offline game: Range A steel (50–500 yd), one rifle + two
loads, dial-or-hold shot loop. Build-plan §5 Increment 1.
`Protocol:` [`execution-protocol.md`](./execution-protocol.md).
No hidden truth in this increment — box values are true.

**Increment exit checklist:**

- [ ] On the installed offline iPad PWA, a player can engage 50–500 yd steel and
      score hits.
- [ ] Both correction methods work per shot: turret dialing AND reticle holds; both
      in MIL and in MOA scope variants.
- [ ] Wind is adjustable (speed/direction) and visibly matters ≥300 yd.
- [ ] Steel reacts (swing/rotation) and pings with distance-delayed audio.
- [ ] Golden-vector diff still green; all tests green.
- [ ] OWNER CHECK: the aim→fire→impact loop is fun.

**Suggested session-sized tasks (verify each before the next):**

## 1.1 Game-state skeleton
Zustand store: `session` (current range, target, wind settings, shot budget,
scope state incl. dial values + zoom), `settings` (units-primary, sensitivity).
Persist `settings` via SaveStore (schema v1 already has it). Actions are pure and
unit-tested (dial click math in both MIL and MOA; budget decrement; reset).
**Done when:** vitest covers dial math: e.g. 0.1 MRAD click at 100 m = 10 mm; 1/4
MOA click at 100 yd ≈ 0.262 in; store round-trips through persistence.

## 1.2 Range A scene
Three.js scene: terrain strip with berms every 50 yd to 500 (use steel-sim's
`Landscape.js`/`Berm.js` as *reference*, re-written in TS), range signs with
distances, plates per BTK steel-sim sizing (small chips near, larger far —
copy the plate-size ladder from `web/steel-sim/config.js`), skybox, light.
Instanced/merged geometry; target 60 fps on iPad.
**Done when:** scene renders all racks; frame time < 16 ms on the iPad (or
devtools throttled equivalent); distances labeled.

## 1.3 Scope pipeline v1 (FFP, MIL + MOA variants)
Scope view = second render pass with zoom 4.5–35×, circular mask, **FFP mil-hash
reticle** (and MOA-hash variant) drawn in a screen-space shader/overlay whose
subtensions are mathematically exact at any zoom (this is load-bearing for
Increment 2 ranging — unit-test the projection: a 1 mil subtension must span
exactly 1/1000 of the range distance at the target plane, any zoom). Reuse task
0.9's touch aiming + wobble. Depth-of-field/mirage deferred to 1.7.
**Done when:** projection unit test green; visual check: plate of known size at
known range subtends the computed mils on screen at 10× and 30× identically (FFP).

## 1.4 Firing solution plumbing (engine bridge in anger)
On fire: build shot params (load box values, atmosphere fixed ISA for now, wind
from session, dial/hold state), call engine solve, get impact point at target
plane, hand to impact detection (C++ `ImpactDetector` via bridge, or TS port of
the plane-intersection if simpler — decide, log the decision). MV SD + rifle
accuracy dispersion ON (engine's per-shot sampling) so groups are honest.
**Done when:** with zero wind and correct dial, shots group on target center at
every rack distance, group size consistent with the load's SD + accuracy spec
(compare mean radius over 50 simulated shots against BTK hit-sim for identical
inputs — must match within 10%).

## 1.5 Reactive steel + audio
Steel reaction via `engine/`'s C++ steel-target physics (swing/rotation from
impact impulse) mirrored to the Three.js meshes; impact marks; hit/miss dust
color; WebAudio: shot report immediately, ping delayed by distance/speed-of-sound,
attenuated. Audio unlocked on first user gesture (iOS).
**Done when:** center hit swings, edge hit rotates (matches steel-sim behavior
side-by-side); ping delay at 500 yd ≈ 1.3–1.4 s after impact; no audio before
first tap on iOS.

## 1.6 The loop: wind, HUD, budget, scoring
Wind controls (speed 0–20 mph, direction 12-clock; constant for now — curl-noise
field arrives with wind markers in 1.7); HUD: current dial (elev/wind), zoom,
shots remaining, last impact call (hit/miss + rough clock position); shot budget
per target (default 3); simple score (hits, first-round hits). Solver screen:
computed DOPE table for current load+conditions (read-only, both unit systems).
**Done when:** a full engagement (pick target → check DOPE → dial or hold → fire
→ correct → hit) works end-to-end; first-round hits tracked; DOPE table matches
the debug-screen table from 0.4 for identical inputs.

## 1.7 Wind field + flags + mirage
Switch constant wind to the engine's curl-noise `WindGenerator` (preset scales
its intensity around the player's chosen mean); wind flags/socks at intervals
(salvage steel-sim `WindFlag`/`WindSock` shader approach); mirage shader (from
steel-sim) tied to zoom + wind for the wind-reading cue.
**Done when:** flags along the range visibly disagree with each other over time;
downrange drift matches the sampled field (engine does this — verify one shot's
drift changes when the field evolves); mirage shimmer direction tracks crosswind.

## 1.8 Ship it
PWA polish for the slice (app icon, title screen, range select stub), precache
audit (`grep` for CDN = empty; new assets in manifest), deploy, owner plays on
iPad **offline**.
**Done when:** increment exit checklist all green; tag `inc1-complete`; owner
sign-off logged. Update `PROGRESS.md` → Increment 2.
