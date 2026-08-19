# LongRange — Phase 2 Plan (web/PWA build on BallisticsToolkit)

`Status: ARCHIVED (2026-07-13)`  ·  `Date: 2026-07-10`

> ⚠ **ARCHIVED.** Superseded by [`../build-plan.md`](../build-plan.md) (see its §5.8
> for what changed). Relative links below were written for `Design/` and are stale.

> ⚠ **Superseded for stack & sequencing.** As of 2026-07-13 the authoritative feature
> set is [`feature-catalog.md`](./feature-catalog.md), and the architecture / framework /
> reuse strategy / sequencing are delegated to a planning model via
> [`build-plan-prompt.md`](./build-plan-prompt.md) (output: `build-plan.md`). The **M0–M5
> ordering and the "Option A — extend BTK in place" and v1-scope decisions below are no
> longer binding** — they are background/reference. Design principles and the reuse
> inventory here remain useful input.

> Execution plan for building the game. Decision and engine assessment are in
> [`btk-assessment-and-path-forward.md`](./btk-assessment-and-path-forward.md). The
> [`../Wiki/`](../Wiki/Home.md) remains the design/knowledge base and the
> **correctness spec** the engine is validated against.

## 0. Decision recorded

- **Path:** build the game on the **BallisticsToolkit (BTK)** skeleton, shipped as
  a **Progressive Web App (PWA)**. (Assessment Option A.)
- **Why:** owner needs it on **iPad + iPhone with no weekly re-signing and no paid
  Apple account**; web/PWA is the only route that satisfies all three. Native
  Swift was ruled out by the free-account 7-day provisioning expiry.
- **Reuse posture:** BTK is MIT-licensed. We build **on** it (extend in place),
  keep the validated C++/WASM engine, adapt the `steel-sim` front-end, and add the
  game layers. BTK's own richer front-ends stay as reference / dev tools.

## 1. Guiding design principles (carried from Phase 1)

1. **Simulation-first.** Model factors faithfully; in-game knowledge should
   transfer to reality. The Wiki is the spec.
2. **The puzzle is the firing solution; the shot is the payoff.**
3. **Wind is the enduring skill; drop is learnable-to-near-certainty.** Design so a
   prepared player misses almost exclusively on wind.
4. **Target size in angular units (MOA/MRAD)** so difficulty normalizes across
   range; *range* drives the environmental/physics difficulty.
5. **Hidden truth, discovered through DOPE.** Gear quality (low MV SD, tight
   precision) is valuable because it shrinks the dispersion cone *and* lets you
   trust your DOPE in fewer shots.
6. **Three pillars:** (1) precision & scoring, (2) missions/scenarios, (3)
   progression (gear/optics/ammo, difficulty).

## 2. Target architecture

```
┌─────────────────────────────────────────────────────────┐
│  PWA shell (manifest + service worker) — installable, offline, no expiry │
├─────────────────────────────────────────────────────────┤
│  Game layer (NEW, JS)                                     │
│   • Game state: rifles, ammo, inventory, DOPE, missions   │
│   • Hidden-truth model (per-instance fixed bias)          │
│   • Economy / progression / mission runner / scoring      │
│   • Persistence: IndexedDB (schema-versioned)             │
├─────────────────────────────────────────────────────────┤
│  Presentation (ADAPT from steel-sim, Three.js)            │
│   • 3D range, scopes, wind markers, mirage, impact FX     │
│   • Scope dialing / reticle holds / HUD / DOPE UI         │
├─────────────────────────────────────────────────────────┤
│  Ballistics engine (KEEP as-is, C++ → WASM)               │
│   • Point-mass RK2 solver, G1/G7 drag, atmosphere         │
│   • Curl-noise wind field, spin drift, aero jump, Miller Sg│
│   • Monte-Carlo dispersion (MV σ, BC σ, wind σ, rifle MOA) │
└─────────────────────────────────────────────────────────┘
                 ▲ validated against ▼
    BTK-as-oracle golden vectors · McCoy M33 · Litz worked examples · Wiki
```

**Persistence note (from the web decision).** DOPE is **computed, not tabulated**:
the WASM solver generates baseline come-ups for any load + condition on the fly, so
no DOPE tables are ever hand-authored. The player's *trued* DOPE is their confirmed
corrections layered on the solver, saved as **user data** — the standard job of
`IndexedDB`. Hard-coding charts into the site is never required (it would be static
and worse); any "factory card" is just optional engine-generated starter data.

Durability on iOS — the key detail: Safari evicts script-writable storage after
**7 days of no interaction for sites opened in the browser**, but **installed
home-screen PWAs are exempt**. Since we install the PWA anyway (that's also how we
dodge the native provisioning expiry), saved DOPE lives in the durable bucket; we
additionally call `navigator.storage.persist()` as belt-and-suspenders.

Remaining limitation: saves are **per-device** (no backend). Mitigate with
**export/import** (dump the full save — rifles, ammo lots, DOPE — to a JSON file to
back up, move to another device, or share a profile); leave a seam for optional
future cloud sync (a BaaS). Version the save schema from day one so we can migrate.

## 3. Reuse map — keep / adapt / drop

| BTK asset | Disposition |
|---|---|
| C++/WASM ballistics engine (`ballistics/`, `physics/`, `match/`) | **Keep** as-is (the validated core) |
| `steel-sim` scene, scopes, wind markers, mirage, impact FX | **Adapt** into the mission/challenge front-end |
| Monte-Carlo dispersion + scoring (`match/`) | **Keep**; extend scoring for mission rules |
| `ballistic-calc`, `load-comp`, `perf-matrix` | **Keep as dev/reference tools**, not player-facing v1 |
| `fclass-sim`, remote play (PeerJS) | **Defer** — multiplayer is post-v1 |
| Target generator (printable) | **Drop** for the game |
| Game state, economy, hidden-truth, DOPE, missions, saves | **New** — the bulk of Phase-2 work |

## 4. Milestones

Each milestone is independently demoable and ends with a clear exit test.

### M0 — Foundation, PWA shell, validation harness
- Get BTK building + running locally (`build_web.sh`) and deploying to GitHub Pages.
- Add **PWA** manifest + service worker; confirm install + offline launch **on the
  iPad** (validates the whole premise early). Smoke-test **storage durability**:
  write to `IndexedDB` from the installed PWA, request `persist()`, confirm it
  survives relaunch (validates the DOPE-save premise before M2 depends on it).
- Trim the app to the `steel-sim` path; keep other front-ends as reference.
- Stand up the **validation harness**: golden vectors from the engine (drop, drift,
  spin drift, TOF, retained velocity) for a few known loads; check against **McCoy
  M33** and Litz worked examples cited in the Wiki.
- **Exit:** installable PWA runs the steel range on iPad, offline; a test write to
  IndexedDB survives relaunch; validation vectors documented and passing.

### M1 — Core shot loop (single-challenge MVP)
- One rifle + one ammo; **a few targets at different ranges** (near / mid / far) so
  both correction methods get exercised across real come-ups.
- Wire the loop: ranged target → read wind → apply correction → fire → spot impact
  → correct → score within a **2–3 shot budget**.
- **Two correction methods, player-selectable per shot:** (1) **dial** the turrets
  (elevation + windage), or (2) **hold over/under** (and hold off for wind) using
  the reticle. Both are already supported by steel-sim's MRAD/MOA scopes + reticle
  ticks — this milestone surfaces the choice, it doesn't build new capability.
- **Adjustable wind** (speed + direction) so each target must be re-solved.
- Minimal HUD: current dial/hold values, shot result, remaining shots.
- **Exit:** across a few ranges, a player can solve each shot by *either* dialing or
  holding, with wind factored in, and get scored hits with spotter-style
  corrections. Fun-to-aim baseline established.

### M2 — Hidden truth + DOPE loop (the game's identity)
- **Per-instance hidden parameters:** each rifle *copy* gets fixed unknown biases
  (MV offset, zero offset, precision); each ammo *lot* gets a true mean-MV shift +
  SD + BC. Distinct from the *random* per-shot spread the engine already models.
- **Zeroing** flow (fire a group, center the zero — teaches "don't chase shots").
- **DOPE data book (user-built, computed not tabulated):** the solver generates
  baseline come-ups; the player records **confirmed** come-ups at chosen ranges and
  the **solver trues** to those nodes. Low-SD ammo confirms a node in fewer shots
  (surfaces the cone math). Optional **starter card** = engine-generated factory
  data the player can copy and then true into their own saved profile (real-world
  onramp + anti-grind valve).
- **Persistence (durable, per rifle+ammo combo):** store in `IndexedDB`; rely on
  installed-PWA storage durability + `navigator.storage.persist()`; ship
  **export/import** of the full save (JSON) for backup, device transfer, and
  profile sharing. Version the save schema.
- **Mil / MOA reticle ranging:** every target carries a **known physical size**; the
  player measures its apparent size against the reticle subtensions to estimate
  range — `Range_m = size_m × 1000 ÷ mils` (or `size_in × 95.5 ÷ MOA`). The **FFP**
  reticle makes the read true at any zoom. On the KD ranges the distance is
  *labeled*, so this is where the player **learns and verifies** ranging (range it,
  then check against the known distance); it becomes *necessary* on the UKD mission
  ranges (M3). Requires accurate reticle-subtension rendering + per-target
  known-size metadata (steel plates already carry width/height in BTK's config).
- **Exit:** buying a second copy of the same rifle behaves differently and must be
  re-zeroed/re-DOPE'd; a trued profile visibly beats box numbers; saved DOPE
  survives an app relaunch on the iPad, and export→import reproduces it on another
  device; a player can mil-range a known-size target and land within a few percent
  of the labeled distance.

### M3 — Missions, gear & progression (the game around the loop)
- **Gear catalog:** rifles (with per-instance variance ranges), optics (MIL/MOA,
  reticles, dialing), and factory ammo (off-the-shelf high-SD vs. match low-SD),
  selectable from inventory. **No money economy** — access is skill-gated (see
  [`game-design.md`](./game-design.md) §8, §11; still an open decision).
- **Mission structure (UKD / field):** hit an *X-MOA* target at *Y* range within a
  shot budget; targets unlabeled and irregularly placed; scoring; difficulty
  laddered by range band (500 → 1000 → 1 mile) and environmental uncertainty.
- **Incline / decline fire:** elevated shooter positions (valley scenarios) with
  targets above and below; cosine correction. *Moved up from M4* because the field
  missions are built around angled shots. Verify the 3D point-mass solver handles
  launch/target elevation, add elevated terrain, and relax steel-sim's scope-pitch
  limits.
- **Field ranging:** known-size targets (mil-dot ranging) or laser rangefinder.
- **Progression/unlocks** (skill-gated) tied to the pillars; **spotter** as an
  optional unlock that narrows wind uncertainty / calls corrections.
- **Exit:** a short campaign of field missions — including at least one angled
  valley range — is playable start-to-finish with gear selection and progression.

### M4 — Fidelity depth (Bucket A engine extensions)
- **Custom drag models (CDM)** — add a `DragFunction::CUSTOM` Cd-vs-Mach path +
  **McDrag** geometry predictor; anchor/validate on the McCoy **.50 Ball M33**
  curve. Enables honest ELR/.50-past-a-mile.
- **Bullet core & shape editor** — integrate layered material densities →
  weight, CG, moments of inertia → feed BC and a **full** stability factor (beyond
  simplified Miller). Turns "which core/shape" into a real, physically-grounded
  choice.
- **Coriolis** — a smaller, well-sourced addition (incline/angle fire moved up to
  M3, where the field missions need it).
- **Exit:** a player-authored bullet + custom drag produces plausible, validated
  behavior; ELR targets are honestly modeled.

### M5 — Content, balance, polish
- More gear/ammo/missions, difficulty tuning, audio/visual polish, onboarding that
  teaches from first principles (leverage the Wiki), save-migration hardening.

## 5. Game-state data model (sketch)

```
RifleModel   { id, name, caliber, catalogMV, twist, priceTier, varianceSpec }
RifleInstance{ modelId, serial, hidden:{ mvOffset, zeroOffset, precisionMOA } }
AmmoType     { id, name, bulletId, boxMV, boxBC, dragModel, priceTier, varianceSpec }
AmmoLot      { typeId, lotId, hidden:{ meanMVshift, mvSD, trueBC, bcSD } }
Bullet       { weight, diameter, length, bc, dragModel  (+ M4: geometry, cores[]) }
DopeProfile  { rifleInstanceId, ammoLotId, zero, confirmedNodes[], truedCurveRef }
Mission      { targetMOA, rangeM, conditions, shotBudget, scoringRule, tier }
PlayerProfile{ currency, inventory[], unlocks[], missionProgress, settings }
SaveEnvelope { schemaVersion, ...all of the above }   // IndexedDB, versioned
```

**Hidden vs. observed** is the crux: `hidden.*` fields are never shown; the player
infers them by shooting. The engine's existing Monte-Carlo σ's are the *irreducible
cone*; the `hidden` biases are the *fixed unknowns* discovered via DOPE.

## 6. v1 scope (recommended defaults — confirm or adjust)

To keep v1 achievable, these open decisions are resolved to the lean option; each
is reversible:

| Decision | v1 default | Rationale |
|---|---|---|
| Fidelity model | **BC + G7** (BTK as-is); CDM/McDrag in **M4/post-v1** | Playable game sooner; Bucket A is depth, not a blocker |
| Bullet authoring | **Curated catalog + presets**; shape/core editor in M4 | Editor is a big feature; catalog gets missions running |
| Bucket B extent | **DOPE loop + short mission set + minimal economy** | Proves the game identity before full campaign |
| Multiplayer | **Deferred** (single-player first) | PeerJS remote exists to revisit later |
| Incline / angle fire | **M3** (field missions need it) | Valley scenarios are angle-based |
| Coriolis | **M4** | Minor at the ranges of early missions |

**v1 = M0 → M3.** M4/M5 are the depth-and-content phase after the core game works.

## 7. Validation & correctness (continuous)

- BTK is a runnable **second implementation** → diff our game's trajectory outputs
  against engine golden vectors on every change.
- Cross-check the engine against **McCoy's measured .50 Ball M33** and Litz worked
  examples already cited in the Wiki — closing sources → engine → game.
- The Wiki articles are the **behavioral spec**; when gameplay and a cited article
  disagree, the article (and its source) wins or the discrepancy is logged.

## 8. Risks & mitigations

- **Unfamiliar ~37.6k-line JS front-end.** → We keep the engine, *rebuild* only the
  game layer, and adapt (not fully absorb) `steel-sim`.
- **PWA/iOS quirks** (storage limits, audio needs a user gesture, install UX). →
  Validate on-device in **M0**, before building on top.
- **Per-device saves & storage durability** (no cloud). → User-built DOPE persists
  in `IndexedDB`; **installed PWA is exempt from iOS Safari's 7-day storage
  eviction** (validate in M0) + `persist()`. No cross-device sync in v1; cover with
  **export/import** (JSON). Version the schema; leave a cloud-sync seam.
- **Fidelity scope creep.** → Hard line: v1 ships on BC+G7; CDM/cores live in M4.
- **"Hidden truth" feeling like grind.** → Solver truing from few nodes; optional
  chronograph tool; copyable starting DOPE (per Phase-1 design).

## 9. Immediate next steps (M0 kickoff)

1. Confirm the v1 scope defaults in §6 (or adjust).
2. Get BTK building locally and deploying to your GitHub Pages.
3. Add the PWA manifest + service worker; install and launch on the iPad offline.
4. Reduce the app to the `steel-sim` entry path; park other front-ends as reference.
5. Write the first validation vectors (M33 + one modern load) and record expected
   drop/drift/TOF.

## 10. Open decisions to confirm

The §6 defaults are my recommendation; flag any you want changed before M0. The one
that most affects sequencing is **Bucket B extent** — how much of the
economy/campaign is in v1 vs. a later content pass.
