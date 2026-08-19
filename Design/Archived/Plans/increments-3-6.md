# Increments 3–6 — coarse breakdowns + just-in-time planning procedure

`Purpose:` Increments 3–6 are **not** detailed to task level yet, on purpose:
file-level instructions written today would drift from the code that exists by
then and mislead the executing agent. Instead, at each increment boundary the
agent runs the **JIT planning procedure** below to produce a detailed
`increment-N.md` in the style of increments 0–2, and gets owner sign-off before
building. The coarse breakdowns define the *shape and order* the detailed plan
must follow; [`../build-plan.md`](../build-plan.md) §5 defines each increment's
goals, features, and exit conditions and remains authoritative.

---

## JIT planning procedure (run at the start of each of increments 3–6)

1. **Re-read**, in order: `CLAUDE.md`; `Design/feature-catalog.md` (the sections
   this increment covers); `Design/build-plan.md` §5 for this increment (+ §8 for
   validation duties); this file's coarse breakdown; `PROGRESS.md` *Deferred
   observations* (harvest anything relevant).
2. **Survey the code as it actually is** — list the modules/interfaces the
   increment will touch; note where reality differs from what the build-plan
   assumed, and log discrepancies.
3. **Spec-article gates first** (increments 3 and 5): the increment plan's first
   tasks MUST be authoring the required Wiki article(s) from the page-routed
   sources in `Documentation/source-map.md`, following `Wiki/_Template.md`, every
   claim cited by PDF page, worked examples extracted into
   `GameBuild/validation/sources/` harness cases. **No implementation task for a gated
   feature may precede its article being `reviewed`.** (Catalog §L. The owner
   reviews each article — they are also its learning material.)
4. **Draft `Design/execution/increment-N.md`**: session-sized tasks (≤ ~400
   changed lines each), strictly ordered, each with **Do / Done when / Stop if**;
   an increment exit checklist mirroring build-plan §5's "done when"; new save
   schema changes called out with migrations; every engine change paired with its
   validation case.
5. **Owner sign-off:** present the draft; record approval in `PROGRESS.md`
   (decisions log); add the task rows to `PROGRESS.md`. Only then start task N.1.

---

## Increment 3 — Missions, UKD, incline, Coriolis, silhouettes (coarse)

Required order:
1. **[GATE]** Author `Wiki/angle-incline-shooting.md` (Litz Ch4; McCoy §3.4) →
   harness cases from its worked examples.
2. **[GATE]** Author `Wiki/coriolis-effect.md` (Litz Ch7; McCoy §8.8) → harness
   cases.
3. Engine: incline solve (launch/target elevation; real gravity decomposition,
   default-off) → native tests + article cases green; baseline vector diff still
   green.
4. Engine: Coriolis term (latitude + azimuth inputs, default-off) → same bar.
5. Mission runner + mission data format (X-MOA target, Y range, shot budget,
   conditions incl. latitude/azimuth); FRH-probability in results (Monte-Carlo
   with the player's *trued* params vs. truth).
6. UKD ranges: unlabeled irregular targets; known-size ranging props (§E4 set with
   FM 23-10 dimensions); laser-rangefinder unlock.
7. Valley terrain + angle readout; ≥1 angled mission.
8. Human silhouettes (IDPA zones) + no-shoot plates + zone scoring.
9. Environments: grassland hills, mountains (altitude affects atmosphere inputs).
10. Progression tier: magnums (.300 WM, .338 LM) + mission ladder 500→1000.

Exit = build-plan §5 Increment 3 "done when", verbatim, as the checklist.

## Increment 4 — Weather, temp-sensitive MV, DOPE cards (coarse)

1. Condition model (clear/overcast/rain) driving: mirage intensity, lighting/
   contrast, atmosphere inputs (rain = cooler/humid/denser per §E5 — effects via
   the existing atmosphere model only; no new physics).
2. Per-load temp-sensitivity (game layer: effective MV = f(powder temp)); lot
   catalog gains temp ratings; data book surfaces "trued at X °C" warnings.
3. Tabulated DOPE cards: freeze trued curve at a baseline condition; card-vs-
   solver comparison view; card drift honest off-baseline.
4. Mission conditions set/randomized; free-play condition picker.

Exit = build-plan §5 Increment 4 "done when".

## Increment 5 — ELR: custom drag, McDrag, bullet lab, handloading (coarse)

Required order:
1. **[GATE]** Author `Wiki/custom-drag-models.md` (McCoy Ch4 + drag chapters;
   M33 measured data) → harness cases incl. the M33 anchor.
2. **[GATE]** Author `Wiki/bullet-anatomy-stability.md` (Litz Ch17–18; McCoy
   §6.6) → harness cases.
3. Engine: `CUSTOM` drag function + per-bullet Cd(Mach) table through the existing
   `interpolateCd` path (additive; G1/G7 baseline diff must stay green).
4. Engine: McDrag predictor (geometry → Cd table) — validate vs. M33 within the
   article's stated error bands.
5. Engine: `BulletDesign` (layered densities → mass/CG/Ip/It → BC + full Sg;
   simplified Miller stays the default path).
6. ELR content: CheyTac + .50 BMG on measured/custom drag; Range C; transonic-band
   UX; canted-base toggle (elevation-travel gate at ~1 mile).
7. Handloading: charge workup + chronograph mini-loop (find the node; poor workup
   < factory); per-rifle loads; vertical-only benefit (wind untouched — enforce in
   the model and test it).

Exit = build-plan §5 Increment 5 "done when" (incl. M33/McCoy table matches).

## Increment 6 — Content, teaching, polish (coarse)

1. Environments: light forest, desert; optional night/lit range (owner decision
   pending — check the decisions log).
2. Target menagerie: poppers, dueling trees, plate racks, swingers, droppers,
   hostage/no-shoots.
3. Onboarding/teaching flow from the Wiki (first principles; glossary links);
   MIL/MOA + metric/imperial side-by-side **audit across every screen**.
4. Spotter unlock (wind-uncertainty narrowing; fclass AI wind-reader as
   reference).
5. SFP scope option (subtensions true at one magnification — the teachable
   gotcha).
6. Owner-optional: barrel life (default: omit). Multiplayer remains deferred.

Exit = build-plan §5 Increment 6 "done when".
