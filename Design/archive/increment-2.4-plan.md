# Increment 2.4 plan — Computed DOPE + data book v1 (+ chronograph + range environment)

`Status: decisions D1–D10 LOCKED with owner 2026-07-20 — ready to build 2.4a on owner authorization; owner is pausing active build for a while (2026-07-21) — D11–D13 (§8, 2.5 truing lever order) added ahead of that pause so they aren't lost` · `Date: 2026-07-20 (2.4a–f) / 2026-07-21 (§8 addendum)`
`Covers:` PROGRESS task **2.4** (computed DOPE + data book v1), split into **2.4a / 2.4b / 2.4c /
2.4d / 2.4e / 2.4f**. Scope grew two owner-directed additions this session: a **reusable range
environment system** (BTK-style mountains/trees/textured ground, all ranges) and a **chronograph**
(true-MV discovery: per-shot speed, average, SD, extreme spread — "what it actually shoots vs the box").
`Authority:` refines [`increment-2.md`](./increment-2.md) §2.4 under
[`execution-protocol.md`](./execution-protocol.md). Nothing here overrides the increment doc's
*Done when* clauses — it decides the *how* and the task split so each sub-task fits the §3 size
limit. **Live state lives in [`PROGRESS.md`](./PROGRESS.md) (authoritative); this is the
point-in-time plan.**

`Prerequisites:` 2.4 sits directly on 2.3e's gear path. **2.3e, the QoL row, TS-C and TS-D are
AWAITING OWNER** (gates + device) as of this writing — those should be owner-confirmed before 2.4a
starts.

---

## Context — why we're building this

2.3 finished the zero story: `playerZero` is a **pure bore-offset corrector**, `zeroRangeM` carries
the come-up reference (Confirm-zero composes `pz_new = pz_old + dial − required`, handing the
come-up to the new trajectory zero), and `engine-bridge/gear-solve.ts` produces **true** (impact /
trace) vs **believed** (DOPE / HUD) solves. On Range A a zeroed rifle centres, and the
believed-vs-true downrange residual — `R·(required_believed − required_true)`, driven by hidden true
MV/BC — is now the only gap left. **2.4 is where the player measures and records that gap:** shoot a
distance, find the real come-up, confirm it as a **node** (a physical fact: SI distance + measured
dials + shots + conditions), and read the growing **data book** — baseline believed curve vs
confirmed reality. 2.5 (truing) then fits effective MV + BC to those nodes.

**Owner decisions locked 2026-07-20 (this planning session):**
- Nodes can be confirmed at **any steel rack** (Range A + the new DOPE range) — the DOPE range's job
  is the full ladder; finer distances (e.g. 250) are picked up at other ranges.
- Nodes store **elevation + windage** dials; conditions snapshotted alongside.
- Confidence is **3-tier + shot count**; N derives from the lot's **catalog-believed** SD (unit-tested).
- DOPE range: **one generous (~2 MOA) gong per century station**, capped per cartridge by a new
  catalog **effective range**; **freely available** (Range B stays 2.7's skill-gated ladder).
- Re-confirm **replaces** the node at that station; data book opens from **range select + in scope**.
- **Range environment system** (this session, owner: "I'd like this range to be a bit more fully
  fledged… BTK has mountains in the background, trees, etc. — start incorporating that into our
  scenes"): shared config-driven module ported from BTK steel-sim `Landscape.js`, **ship BTK's
  ground/bark textures**, **retrofit ALL ranges now**.
- **Chronograph** (this session): **any range, toggle on; always owned; results persist per
  rifle+lot** and appear in the data book beside the box MV.

## 1. What already exists (so we build, not rebuild)

- **The believed come-up curve is already end-to-end.** `game/active-gear.ts` `gearSolveContext`
  (zero-range policy: `pz?.zeroRangeM ?? recommendedZeroM(...)` + bullet dims + stored playerZero) →
  `engine-bridge/gear-solve.ts` `solveGear(...)` → `believedTable` → `game/dope-row.ts`
  `formatDopeRow` → `scope/DopePanel.tsx`. The data book's **baseline curve is this path** — no new
  solve code.
- **The measured come-up is already the dial.** Because `playerZero` sits *under* the dial
  (`applied = aim + dial + playerZero`), the turret at the moment of a hit *is* the come-up relative
  to the stored zero reference. A node just snapshots it — no math to invent.
- **Group-since-dial-change logic exists** (2.3d sight-in: `useGameStore.subscribe` on scope
  elev/wind resets the engaged group). 2.4d generalizes the *elevation-change ⇒ new group*
  convention to steel.
- **Range registry anticipated this** (2.3 D1): `range/ranges.ts` `RangeDefinition { id, name,
  unitCharacter, sceneType, zeroable, stations }` — the DOPE range is a new row + a config, not a new
  system. `RangeScene.ts` consumes an authored config (racks/plates/berms/signs, all InstancedMesh).
- **Additive-schema pattern is proven** (2.1 D6 / 2.3a): optional fields validated when present, no
  version bump, migration defaults, fixture in the corpus. Save v2 already persists
  `rifles[]`/`ammoLots[]`/`playerZero`; export/import inherits anything added there.
- **No-leak guard is live** (`game/hidden-truth.guard.test.ts`): UI/scene/state modules may not
  import `game/hidden-truth`. Truth enters solves only inside `engine-bridge/` + `game/` seams.
- **BTK's environment is cheap and portable** (`BallisticsToolkit/web/steel-sim/Landscape.js` +
  `config.js`): mountains = ONE `InstancedMesh` of 8-sided cones (10 instances, 2200–2500 yd out,
  25–75 yd tall) with a procedural 256×256 canvas snow-cap gradient — 1 draw call, zero assets;
  trees = trunk + foliage `InstancedMesh` pair (~280 trees: 200 flanking, 80 backdrop), flat-green
  foliage, bark-textured trunks — 2 draw calls; ground = two flat textured planes; sky = solid color;
  **core THREE only, no `three/addons`**. Texture assets are ambientCG 1K JPG sets (grass, dirt,
  bark) streamed by `TextureManager.js`.
- **Our scenes duplicate what the environment module should own:** `RangeScene.ts` and
  `SightInScene.ts` each hand-roll `addLights()` / `addGround()` / sky / fog with shared palette
  constants. Both funnel objects through `add()/track()` disposal bookkeeping — an env builder slots
  straight in.
- **PWA precache** (`vite.config.ts` Workbox glob `**/*.{js,css,html,png,svg,woff2,webmanifest,mp3}`)
  does **not** include `.jpg/.webp` yet — shipping ground textures means extending the glob (offline
  install must keep zero runtime-network fetches).
- **Engine scatter path** (`createScatterSimulator` / `createGearScatter`) wraps the C++
  `MatchSimulator`; whether embind's `SimulatedShot` exposes per-shot velocity determines the
  chronograph's source (see D10 + 2.4e).

## 2. Architecture at a glance

```
 store.inventory (active rifle+lot) ── gearSolveContext ──► solveGear → believedTable
                                                                  │        (baseline curve — exists)
   FIRE on steel (any range) ── ≥1 hit since last ELEVATION dial change ──► [Confirm node]
        │                                                         │
        │    DopeNode { rifleId, lotId, distanceM (SI), elevationRad, windageRad,
        │               zeroRangeM (reference at confirm), shots, hits,
        │               conditions {wind, ISA numbers}, confirmedAtIso }
        │        persisted additively (dopeNodes[]) · replace-by-station · cascade w/ gear deletes
        │
   [Chronograph]  deploy toggle (any range) → per-shot MV via numbers-only seam
        │         → live string (per-shot, avg, SD, ES) → Welford-merge into persisted
        │           ChronoSummary { rifleId, lotId, shots, avgMps, sdMps, minMps, maxMps }
        ▼
   DATA BOOK (overlay from RangeSelect + scope HUD; DopePanel rows gain node markers)
        per rifle+lot: baseline believed curve  vs  confirmed nodes (3-tier confidence + count)
                       + measured MV (avg/SD/ES/shots)  vs  box MV
        stale-zero flag when node.zeroRangeM ≠ current zero reference · delete node

   ENVIRONMENT SYSTEM (2.4b)   range/environment.ts  buildEnvironment(scene, envConfig)
        sky + fog + lights + textured ground + instanced mountains + instanced trees
        ├── RangeScene (Range A)      ← retrofit, deletes duplicated lights/ground/sky code
        ├── SightInScene              ← retrofit (closer treeline via its env block)
        └── DOPE range (2.4c)         ← debuts fully dressed: 1 gong + sign per century station
```

Invariants honoured: **§4.8 / catalog §0** (truth never displayed — node values are the *player's
dials*; confidence N uses catalog-believed SD; chrono readings are legitimate *measurements* surfaced
through a numbers-only seam, never the truth object), **§4.6** (no schema bump — `dopeNodes?` +
`chronoSummaries?` additive-optional), **§9** (embind stays in `engine-bridge/`), **§4.4** (all
unit/velocity display via the units service), **§4** (no new deps — environment is core THREE;
textures are bundled + precached, no CDN).

## 3. Decisions — LOCKED (owner 2026-07-20)

### D1 — Node venue: any steel rack
Confirm-node is available wherever the player shoots steel with active gear (Range A + DOPE range).
The DOPE range provides the full ladder to effective range; finer distances are picked up at other
ranges (owner: DOPE range gives 200 and 300; Range A adds 250).

### D2 — Node value: elevation + windage dials
Both dials, relative to the stored zero (`playerZero` excluded by construction — it sits under the
dial). Conditions snapshot (wind speed/dir + the ISA atmosphere numbers used) stored alongside.
2.5 truing consumes the elevation leg only; windage rows are honest only against their recorded
conditions (the book shows the conditions with the node).

### D3 — Confidence: 3-tier + shot count
`noted` → `provisional` → `confirmed` (shots ≥ N), raw shot count always shown.
**N derives from the lot's *catalog-believed* SD** — published spec, never the hidden true draw
(no leak): `N = clamp(ceil((σ_v(R)/tol)²), 3, 10)` where `σ_v(R)` = believed vertical angular SD at
the node's range (per-shot MV-SD drop sensitivity + inherent-precision nominal) and `tol ≈ 0.1 mil`
(standard-error-of-group-centre logic). Constants provisional; unit tests pin the rule's **shape**:
higher SD ⇒ larger N, longer range ⇒ larger N, match < bulk at every range. This is the increment
Done-when's "N derives from SD — unit-tested".

### D4 — DOPE range targets: one generous plate per station
A single ~2 MOA round gong per rack (physical diameter grows with distance) so a miss reads as
**DOPE error, not marksmanship**. Reuses RangeScene / steel-reaction / plate-surface hit-mark
systems wholesale.

### D5 — Re-confirm replaces
Latest wins per (rifleId, lotId, station SI distance). The book always shows the most recent
measurement; no history list in v1.

### D6 — Book access: range select + in scope
Full-screen Data Book overlay (SettingsScreen pattern) from the landing screen and from the scope
HUD; `DopePanel` rows additionally gain node markers.

### D7 — Ladder: century steps to effective range
Centerfire 100, 200, … capped by the cartridge's new catalog `effectiveRange`; rimfire finer:
25/50/75/100/125/150/200. Stations in the **active unit** (yd for MOA, m for MIL), entry-time
resolution, no live-morph (2.3 D3 rules apply verbatim). Provisional effective ranges (design-set,
owner-tunable in catalog data): **.22 LR 200 · .223 600 · .308 1000 · 6.5 CM 1200** (yd; the metric
ladder caps at the equivalent century).

### D8 — Freely available
No gate, `unitCharacter: 'both'`, `zeroable: false`. Range B (2.7) remains the skill-gated
challenge ladder — the DOPE range is a training/confirmation tool.

### D9 — Range environment system
Shared, config-driven module ported from BTK steel-sim `Landscape.js` (MIT; per-file attribution
header per the `plate-surface.ts` convention; license of record stays `GameBuild/engine/LICENSE.BTK`):
instanced-cone **mountains** w/ procedural snow-cap canvas (1 draw call), instanced **trees**
(trunk+foliage pair, ~280, 2 draw calls), **textured ground** — **ship BTK's grass/dirt/bark texture
sets** (~2–4 MB, webp where it wins; Workbox precache glob extended so offline keeps zero runtime
network), sky/fog/lights consolidated. **Retrofit ALL ranges now** (Range A + sight-in + DOPE
range); each range config carries its own env block. Core THREE only; perf gate stays **<16 ms on
iPad** (~3 extra draw calls per scene). No GLB/`GLTFLoader` (BTK's critters stay out).

### D10 — Chronograph
**Any range, toggle on** (deployable chrono panel; while deployed every shot logs a velocity to the
current string) · **always owned** (no store entry) · **persists per rifle+lot** as a measured-MV
summary (avg, SD, ES, shot count) shown in the Data Book beside the box MV. New strings merge into
the summary (Welford-combined mean/SD over total shots; ES = observed max−min). Readings surface
through a **numbers-only seam** (gear-solve pattern): preferred source is the **actual fired shot's
MV** if embind's `SimulatedShot` exposes it; fallback is seam-side draws from the truth distribution
(`totalMv + N(0, mvSdMps)`) — statistically identical; decided in 2.4e's first step. Readings are
exact (no simulated sensor error) — the pedagogy is MV-truth discovery, not instrument noise.

## 4. Data model (additive — no schema bump)

```ts
DopeNode {
  rifleId, lotId,               // instance ids (cascade-delete with deleteRifle/deleteLot)
  distanceM,                    // physical fact, SI — the station actually shot
  elevationRad, windageRad,     // measured dials at confirm (relative to stored zero)
  zeroRangeM,                   // zero reference the come-up is against (self-describing;
                                //   book flags the node stale if the rifle is later re-zeroed
                                //   to a different distance)
  shots, hits,                  // the confirming group (since last elevation-dial change)
  conditions: { windSpeedMps, windDirectionDeg, tempC, pressurePa },  // ISA numbers for now
  confirmedAtIso
}

ChronoSummary {
  rifleId, lotId,
  shots,                        // total chrono'd shots merged in
  avgMps, sdMps,                // running mean + SD (Welford merge across strings)
  minMps, maxMps,               // extreme spread = max − min
  updatedAtIso
}
```

Confirm-node enablement mirrors 2.3d: an **elevation**-dial change starts a new group at the
engaged target; the button enables at **≥1 hit** on the engaged plate within the current group.
The chrono's live string (per-shot list) is session-only; only the summary persists.

## 5. Task split

Suggested order **a → b → c → d → e → f** (a and b are independent; c needs b; d needs a; e is
independent of b–d; f needs a + e). Stop after every sub-task per the owner's task-loop rules.

### 2.4a — Model + rules (pure, machine-verified)
`game/dope-book.ts`: node upsert (replace-by-station per D5), confidence rule (D3,
catalog-believed values only), ladder generator (century/rimfire steps × `effectiveRange` cap).
Catalog: add `effectiveRange` per cartridge (`game/catalog.data.json` + `catalog.ts` accessor;
provisional D7 values). Schema: `dopeNodes?` + validator + migration default + corpus fixture.
Store: `dope` slice + `confirmNode`/`deleteNode` actions + cascade on rifle/lot delete +
persistence wiring.
**Done when:** vitest green on — confidence-rule shape (higher SD ⇒ larger N; longer range ⇒ larger
N; match < bulk; the Done-when's unit-tested N rule), replace-by-station, cascade deletes, save
round-trip, ladder gating (no 1500-yd station for a .22). Typecheck/build green.

### 2.4b — Range environment system (D9)
New `range/environment.ts` (+ env-config types): `buildEnvironment(scene, envConfig)` adds
sky/fog/lights/textured ground/mountains/trees, returning meshes+materials for the scenes' existing
`add()/track()` disposal bookkeeping. Port `createMountains()`/`createTrees()` +
MOUNTAIN_CONFIG/TREE_CONFIG from BTK `Landscape.js`/`config.js` (attribution header). Copy texture
sets under `app/public/` (webp where smaller); extend the Workbox precache glob. Retrofit
`RangeScene.ts` + `SightInScene.ts` (delete their duplicated lights/ground/sky/fog code); per-range
env block in configs (sight-in: closer treeline; Range A: current lane proportions kept).
**Done when:** config-invariant tests green (mountain/tree placement bands never intrude on the
firing lane or occlude eye→plate sightlines — reuse the Range A occlusion-test pattern); typecheck/
tests/build green; OWNER on device: all ranges look right, frame-time HUD holds <16 ms, offline
install still serves the textures.

### 2.4c — DOPE range
`range/ranges.ts` registry row (`dope-range`) + `range/dope-range-config.ts` generating a
RangeScene-compatible config: one ~2 MOA gong + range sign per station, ladder resolved **at
entry** from the active rifle's cartridge (box fallback: default centerfire ladder), full 2.4b
environment dressing — this range is the showcase. RangeSelect card via the registry (exists).
**Done when:** config invariant tests green (station distances = D7 ladder × unit system; gong
diameters ≈ 2 MOA at their distance; no occlusion); OWNER on device: enter in MIL vs MOA and see
m/yd ladders; ladder caps per cartridge (.22 vs 6.5 CM); <16 ms.

### 2.4d — Confirm-node flow
ScopeView: generalize the 2.3d group-since-elevation-change tracking to steel targets; Confirm-node
button (visible when: steel range + active gear + ≥1 hit in current group at the engaged rack);
capture per the DopeNode shape (distance = engaged rack SI; dials = current turret; zeroRangeM from
`gearSolveContext`; conditions from session wind + ISA constants); confirmation toast/readout.
No-leak: extend the hidden-truth guard scan to cover `game/dope-book.ts`.
**Done when:** vitest — capture math (node reflects dial state + engaged distance; windage
included; group/hit gating; don't fire = no node), guard green; OWNER on device: dial onto a Range
A rack, hit, confirm, see the node recorded (book lands in 2.4f — a dev-simple readout or toast
suffices here).

### 2.4e — Chronograph (D10)
First step: check whether embind `SimulatedShot` exposes per-shot velocity — if yes, thread the
fired shot's MV through the existing scatter path; if no, add `chronoReading()` draws in the
numbers-only seam (no C++ change either way unless a trivial additive binding is warranted — then
golden vectors must stay zero-diff). Store: `chrono` slice (deployed flag, current string,
`mergeChronoString` → persisted `ChronoSummary`, cascade on gear delete). `scope/ChronoPanel.tsx`:
deploy toggle + live string (per-shot speed in the active units via the units service, running avg,
SD, ES), new-string button; readings log on FIRE while deployed. Schema: `chronoSummaries?`
additive + validator + migration + fixture.
**Done when:** vitest — Welford merge math (mean/SD/ES across strings), distribution sanity (seeded
strings' SD ≈ lot true mvSd), cascade, save round-trip, no-leak (panel consumes numbers only);
OWNER on device: chrono a match vs bulk string and see the SD/ES difference the box never told you.

### 2.4f — Data book UI
`shell/DataBookScreen.tsx` overlay (SettingsScreen pattern; entry buttons on RangeSelect + scope
HUD): rifle+lot selector (defaults to active pair); baseline believed curve (existing
`gearSolveContext → solveGear().believedTable → formatDopeRow` path); node rows merged at their
converted display distances with confidence chip + shot count + conditions; stale-zero flag
(node.zeroRangeM ≠ current reference); delete-node; **chrono section: measured avg/SD/ES/shots
beside the box MV**. `DopePanel` gains node markers.
**Done when:** export→import round-trip test shows nodes + chrono summaries reproduce; OWNER on
device: book shows baseline vs confirmed nodes with confidence labels (**closes the increment §2.4
Done-when**), box-vs-measured MV reads clearly, MIL⇄MOA display converts labels without moving
facts.

## 6. Non-goals

No truing (2.5). No frozen/tabulated DOPE card (feature-catalog §D owner request — needs the trued
curve; post-2.5). No reticle ranging (2.6). No skill gates (2.7). No atmosphere variability
(conditions snapshot stores the ISA numbers used, so future weather stays compatible). No
miss-spotting system. No GLB models / `three/addons`. No terrain relief (BTK's ground is flat too).
No chrono sensor-error simulation.

## 7. Verification

- Per sub-task: `npm run typecheck` · `npm test` · `npm run build`; golden vectors unaffected
  (2.4 is TS-only unless 2.4e adds a trivial additive binding — then zero-diff is a gate).
- 2.4b/c: iPad frame-time HUD <16 ms with the environment on, all ranges; offline PWA install
  serves the textures (precache check).
- Increment Done-when: 2.4a's unit-tested N-from-SD rule + 2.4f's baseline-vs-nodes book, both
  owner-confirmed.
- Task-loop rules: stop after every sub-task; PROGRESS.md updated each time; **all git is
  owner-side**.

## 8. Forward decisions — 2.5 truing (locked with owner 2026-07-21, ahead of 2.5 planning)

2.4 itself is unchanged by this section — truing math stays out of scope here (§6). These
decisions were locked in a design conversation the same day the owner paused active build, so
they're recorded now rather than re-derived whenever 2.5 planning starts. Whoever writes
`increment-2.5-plan.md` should read this section first; it refines (does not contradict)
`increment-2.md` §2.5's existing method + Done-when.

### D11 — Truing lever order: chronograph first, then BC
**Effective MV** is sourced from a chronograph reading (2.4e `ChronoSummary`) directly when one
exists for the rifle+lot — a real measurement, not a fit. **BC/drag-scale** is then fit from a
confirmed node (farthest / near-transonic preferred, per `increment-2.md` §2.5's existing
guidance), now that MV is pinned. **No-chrono case:** effective MV is instead solved from a
confirmed node with BC held at the catalog value, and the result is flagged **provisional**
regardless of that node's own shot count — a single no-chrono node can't separate an MV error
from a BC error, so it isn't treated as a confirmed-grade fit.

*Why "zero + node" isn't the second data point:* a zero/near-range measurement barely constrains
BC — BC-driven trajectory divergence hasn't accumulated yet at short range, which is exactly why
real-world truing protocols always true BC from a long shot, never the zero distance. The
well-conditioned pair is **chronograph + one downrange node**, not zero + node. This supersedes
`increment-2.md` §2.5's "fit MV from the nearest node, BC from the farthest node" for the
has-chrono path, and replaces the blind two-node joint fit with the MV-only/always-provisional
interim state for the no-chrono path.

### D12 — Truing never overwrites a measured node
A curve recompute (MV and/or BC changing) only updates **distances with no recorded node**. Any
station the player has actually confirmed — provisional or confirmed tier alike — stays frozen at
its measured dial value; the only way to change it is to re-shoot and re-confirm that exact
station (D5: re-confirm replaces). A real observation is never silently overwritten by
extrapolation from a different distance.

### D13 — One merged confidence label per data-book row
Rather than showing a node's shot-count tier (D3) and the model's chrono-anchored-fit status (D11)
as two separate badges, a data-book row shows a single merged label: **provisional** if either the
node hasn't reached its shot-count threshold or the curve isn't yet chrono-anchored; **confirmed**
only when both hold. Rows with no node at all remain the plain computed baseline — no confidence
label, or a distinct "computed" tag (settle the exact treatment when 2.4f is actually built).
