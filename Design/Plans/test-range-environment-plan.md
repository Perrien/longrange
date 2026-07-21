# Test Range — 100-yd wooded sandbox + reusable environment module

**Status: planned (2026-07-21), not started.** Approved implementation plan; execution
follows the standing rules in `Design/execution/execution-protocol.md` (stop after
every stage, update `PROGRESS.md`, no git — owner handles git).

## Context

The owner wants the ranges to feel like real outdoor environments (trees, grass, hills, mountains, clouds), porting/upgrading the environment techniques from BTK's simulators. First step: a new, small **Test Range** — 100 yd, wooded, near a hill, mountains + clouds in the background — with a single **12" steel gong at 100 yd on a rack** as placeholder. Two long-term purposes: (1) prototype the environment system before redesigning Range A / Zero Range, and (2) a permanent sandbox for future target types (IDPA, Texas spinners, …). **Priority #1: the environment looks great.**

### Decisions made with the owner (2026-07-21)
- **Upgraded look**, not a faithful BTK port: BTK's instancing/config techniques as foundation, but multi-tier conifers + rounded deciduous trees (**mixed forest**), gradient sky dome (BTK uses flat blue), distance fog, rolling terrain with a hill, grass tufts near the firing line.
- **Copy the CC0 PBR textures** from `BallisticsToolkit/web/textures/` into `GameBuild/app/public/textures/` (~2–4 MB, stays fully offline).
- Build a **reusable, config-driven environment module** (`src/range/environment/`) — consumed first by the test range, adoptable by RangeScene/SightInScene later (owner's standing "robust over patch" preference).
- Test range appears as a normal card on range select.

### Verified codebase facts the design depends on
- `ScopeView.tsx:242` — renderer has **no `logarithmicDepthBuffer`; `renderer.shadowMap.enabled` is never set** (all `castShadow` flags are inert). ⇒ Skip shadow flags on new meshes; drop BTK's cloud `customDepthMaterial`; BTK's `logdepthbuf` GLSL includes are inert (may strip).
- `fireSteel` (ScopeView.tsx:716–895) + reaction loop (~1285–1313) touch exactly these scene members: `plates`, `plateMesh`, `plateSurface.writeLayer`, `chainMesh`, `chainRest` (indexed `instanceId*2 + side`), `dispose()`, and import `PLATE_THICKNESS_M`. Nothing else. ⇒ a new scene exposing this interface needs **zero fireSteel changes**.
- **Bullet trace, impact FX, audio, wind markers, mirage are all scene-agnostic** — `initImpactFx`/`initBulletTrace` run unconditionally (ScopeView.tsx:266–267); `fireSteel` launches the trace when `settings.traceEnabled` (879–887). ⇒ **the trace works on the test range in Stage 1 automatically**; it's in the Stage 1 verify list.
- Wind-marker filter (ScopeView.tsx:271–275): non-sight-in scenes get **ALL** `WIND_MARKERS` (100–500 yd) — on a 100-yd range the 200–500 markers would float mid-forest. Must be generalized (Stage 1).
- `GROUND_Y_M = 0` (ScopeView.tsx:82): low-miss dust projects onto y=0 (861–866). ⇒ the lane corridor must stay exactly flat at y=0.
- `zeroable` has **no runtime consumer** (zeroing flow is SightInScene-only) ⇒ test range is `zeroable: false`.
- `vite.config.ts` Workbox `globPatterns` has **no `jpg`** ⇒ must add it or textures won't precache (offline hard constraint). `maximumFileSizeToCacheInBytes` (8 MiB) is per-file — fine.
- Vitest env is `node` ⇒ all new tests must be pure-data, no THREE/DOM (pattern: `range-a-config.test.ts`).
- Store/save: `rangeId` is session-only; **no persistence/schema changes needed**.

### Reference sources (read while implementing — port, don't invent)
- `GameBuild/app/src/range/RangeScene.ts` — the steel recipe to reuse: frames (150–188), plates (191–255), chains (263–298), sign (307–332), `add`/`track`/`dispose` bookkeeping (335–352), exported `setChainInstance` (370–386), `PLATE_THICKNESS_M` (30), `makeSignTexture` (416–433).
- `BallisticsToolkit/web/fclass-sim/rendering/environment.js` — terrain relief (642–735, formula at 955–967), trees (520–640), FBM clouds (shader 345–518, drift/wrap 737–793), mountains + snow CanvasTexture (266–343), lighting (225–264), rocks (826–907).
- `BallisticsToolkit/web/steel-sim/config.js` — `TARGET_RACKS_CONFIG` (data-driven layout pattern).

---

## Stage 1 — Wiring + shootable gong (flat placeholder environment)

Goal: third card on range select; enter it; see a 12" gong on a rack at 100 yd on a flat RangeScene-style world; full shot loop works (commit, fire, swing, chains, splat, ping, score, **bullet trace**, dust puffs). No environment module yet.

### 1.1 `src/range/ranges.ts`
- Line 14: `export type RangeSceneType = 'steel-racks' | 'sight-in' | 'test-range';`
- After the `SIGHT_IN` const, add:
```ts
// Test Range (2026-07-21): 100-yd wooded sandbox. Prototype for the environment
// system (terrain/trees/sky/mountains/clouds) that will later be applied to the
// other ranges, and the permanent proving ground for new target types.
const TEST_RANGE: RangeDefinition = {
  id: 'test-range',
  name: 'Test Range',
  shortLabel: 'Test Range — 100 yd wooded',
  unitCharacter: 'both',
  sceneType: 'test-range',
  zeroable: false, // zeroing flow is hard-wired to the sight-in scene
  stations: [],
};
```
- Line 73: `const RANGES: readonly RangeDefinition[] = [RANGE_A, SIGHT_IN, TEST_RANGE];`
- `RangeSelect.tsx` / `App.tsx` need **no changes** (registry-driven card).

### 1.2 `src/range/steel-scene-api.ts` (new)
```ts
// The contract between ScopeView's steel fire path / reaction loop and any
// steel scene builder. Extracted (task: test range) from what fireSteel and the
// per-frame reaction loop actually touch on RangeScene — see ScopeView.tsx
// fireSteel + the reactions loop. RangeScene satisfies this structurally.
import type * as THREE from 'three';
import type { PlateInstance } from './RangeScene';
import type { PlateSurface } from './plate-surface';

export interface SteelSceneApi {
  plates: PlateInstance[];
  plateMesh: THREE.InstancedMesh;
  plateSurface: PlateSurface;
  chainMesh: THREE.InstancedMesh;
  /** Rest transform per chain instance; chains for plate `id` are id*2, id*2+1. */
  chainRest: THREE.Matrix4[];
  /** Optional per-frame environment animation (cloud drift etc.). windVec is the
   *  dialed mean wind in world m/s. RangeScene doesn't implement it — callers
   *  must use `scene.update?.(…)`. */
  update?(dt: number, timeS: number, windVec: { x: number; y: number; z: number }): void;
  dispose(): void;
}
```

### 1.3 `src/range/test-range-config.ts` (new — pure data, no THREE, mirrors range-a-config style)
```ts
import { yardsToMeters, inchesToMeters } from '../units';

/** The single placeholder target: a 12" gong hung at 100 yd, rack authored with
 *  Range A's frame numbers (RACK_HEIGHT_YARDS 1.2, PLATE_CENTER_FRACTION 0.5 —
 *  plate centre ≈ 0.55 m, which ScopeView's default pitch already points at). */
export const TEST_RANGE_GONG = {
  rackId: 'test-gong-100',
  distanceYards: 100,
  distanceM: yardsToMeters(100),        // 91.44
  gongInches: 12,
  gongDiameterM: inchesToMeters(12),    // 0.3048
  xOffsetM: 0,                          // dead centre — this is a test lane
  rackWidthM: yardsToMeters(1.5),
  beamHeightM: yardsToMeters(1.2),      // 1.0973
  plateCenterYM: yardsToMeters(1.2) * 0.5, // 0.5486
  paintColor: 0xf0f0ea,                 // RangeScene PLATE_COLOR default
} as const;

export const TEST_RANGE_GROUND = {
  laneWidthM: yardsToMeters(35),
  /** 140 yd: long enough that the 100-yd wind marker passes ScopeView's
   *  `distanceM <= laneLen − 10` filter, short enough that 200 yd doesn't. */
  laneLengthM: yardsToMeters(140),      // 128.0
} as const;
```
(Stage 2 appends `TEST_RANGE_ENVIRONMENT` here.)

### 1.4 `src/range/TestRangeScene.ts` (new)
Class implementing `SteelSceneApi`. Copy RangeScene's structure member-for-member; it is a single-rack, single-plate RangeScene without berms. Concretely:

- Same fields as RangeScene: `plates`, `plateMesh!`, `plateSurface!`, `chainMesh!`, `chainRest = []`, private `scene`, `disposables`, `objects`; same `add()`, `track()`, `dispose()` helpers (`dispose` must also null `scene.background`/`scene.fog` — copy RangeScene.dispose verbatim).
- Imports: `TEST_RANGE_GONG`, `TEST_RANGE_GROUND`; from `./RangeScene`: `setChainInstance`, `PLATE_THICKNESS_M`, `type PlateInstance`; from `./plate-geometry`/`./plate-surface`: the plate helpers; from `../engine-bridge/steel-target`: `chainAnchorLocalOffset`, `CHAIN_SPLAY_FRACTION`.
- Constructor (Stage 1 placeholder world — replaced by `buildEnvironment` in Stage 2):
  1. `scene.background = new THREE.Color(0x9fc4e8)`; `scene.fog = new THREE.Fog(0x9fc4e8, 150, 900)` (closer fog than Range A — this is a 100-yd scene).
  2. Lights: copy RangeScene.addLights() (hemi 0xffffff/grass 1.0 + directional 0xfff4e0 1.4 at (−200, 400, 100)).
  3. Ground: copy RangeScene.addGround() but with `TEST_RANGE_GROUND` for the lane and a dirt backdrop of ~`yardsToMeters(400)` × `yardsToMeters(600)` at y = −0.1.
  4. `addRack()`: one beam + two posts. Copy the loop body of RangeScene.addFrames() (167–183) but for a single rack — plain `THREE.Mesh` is fine (no instancing needed for 3 cylinders), or keep the InstancedMesh pattern with counts 2/1 for symmetry. Use `POST/BEAM radius 0.0254`, `FRAME_COLOR 0xaaaaaa`, metalness 0.6/roughness 0.5.
  5. `addGong()`: mirror RangeScene.addPlates() for exactly one plate:
     ```ts
     this.plateSurface = createPlateSurface([TEST_RANGE_GONG.paintColor]);
     this.disposables.push(this.plateSurface);
     const geo = this.track(createPlateDiscGeometry());
     const mat = this.track(createPlateMaterial(this.plateSurface.texture));
     const mesh = new THREE.InstancedMesh(geo, mat, 1);
     geo.setAttribute('instanceTargetIndex',
       new THREE.InstancedBufferAttribute(new Float32Array([0]), 1));
     const p = new THREE.Vector3(TEST_RANGE_GONG.xOffsetM, TEST_RANGE_GONG.plateCenterYM, -TEST_RANGE_GONG.distanceM);
     const m = new THREE.Matrix4().compose(p, new THREE.Quaternion(),
       new THREE.Vector3(TEST_RANGE_GONG.gongDiameterM, TEST_RANGE_GONG.gongDiameterM, PLATE_THICKNESS_M));
     mesh.setMatrixAt(0, m);
     mesh.instanceMatrix.needsUpdate = true;
     this.plates.push({
       rackId: TEST_RANGE_GONG.rackId, distanceM: TEST_RANGE_GONG.distanceM,
       distanceYards: TEST_RANGE_GONG.distanceYards, diameterM: TEST_RANGE_GONG.gongDiameterM,
       position: p.clone(), beamHeightM: TEST_RANGE_GONG.beamHeightM, instanceId: 0,
       paintColor: TEST_RANGE_GONG.paintColor,
     });
     this.plateMesh = mesh; this.add(mesh);
     ```
  6. `addChains()`: copy RangeScene.addChains() (263–298) unchanged — it already iterates `this.plates`, so with one plate it writes chain instances 0 and 1 and fills `chainRest[0..1]`. **Do not skip this**: the reaction loop indexes `chainRest[id*2 + ci]` unconditionally on a hit.
  7. Optional: one "100 YARDS" sign via RangeScene's makeSign pattern (needs `makeSignTexture` — either export it from RangeScene.ts or duplicate the 15-line canvas helper).
- `update(dt, timeS, windVec)`: empty body for now (Stage 4 delegates to the environment handle).

### 1.5 `src/scope/ScopeView.tsx` (three small edits)
1. **Scene branch** (~246–263). Change `let range: RangeScene | null = null;` to `let range: SteelSceneApi | null = null;` (import the type + `TestRangeScene`), read `const sceneType = getRangeDefinition(store().session.rangeId).sceneType;` once, keep `const isSightIn = sceneType === 'sight-in';`, and:
   ```ts
   if (isSightIn) { …unchanged… }
   else if (sceneType === 'test-range') { range = new TestRangeScene(scene); }
   else { range = new RangeScene(scene); }
   ```
   Everything downstream (`fireRef.current = isSightIn ? fireSightIn : fireSteel`, `isSightInHud`, cleanup `range?.dispose()`) is untouched — the test range gets the full steel HUD/fire path for free. Note: fireSteel/reaction loop reference only `SteelSceneApi` members (verified), so the type change compiles cleanly; if TS flags a stray `RangeScene`-only access, that access belongs in the interface — add it there rather than casting.
2. **Wind-marker filter** (~271–275). Replace the sight-in-only filter with a lane-length rule for every scene:
   ```ts
   const laneLenM = isSightIn && sightInLayout ? sightInLayout.ground.lengthM
     : sceneType === 'test-range' ? TEST_RANGE_GROUND.laneLengthM
     : RANGE_A_GROUND.laneLengthM;
   const markerSpecs = WIND_MARKERS.filter((m) => m.distanceM <= laneLenM - 10);
   ```
   Check: 100-yd marker = 91.44 ≤ 128 − 10 ✓ stays; 200-yd = 182.9 > 118 ✓ dropped; Range A lane 512 m keeps all five (existing behaviour unchanged).
3. **Frame-loop hook** (find `updateImpactFx(dt)` in the render loop; add after it):
   ```ts
   range?.update?.(dt, st.t, meanWindVec());
   ```
   where `meanWindVec()` converts `store().session.wind` (speedMps + directionDeg) to a world vector — reuse the existing dialed-wind→vector conversion already used for the solve/steady path (search `directionDeg` in ScopeView; factor a tiny helper if it's inline). No-op for RangeScene/nulls until Stage 4.

### 1.6 Tests
- **`src/range/ranges.test.ts`** (modify): registry order `['range-a','sight-in','test-range']`; add a case asserting test-range's `sceneType === 'test-range'`, `zeroable === false`, `stations` empty, `unitCharacter 'both'`.
- **`src/range/test-range-config.test.ts`** (new):
  - `TEST_RANGE_GONG.gongDiameterM === inchesToMeters(12)` and `distanceM === yardsToMeters(100)`.
  - Gong fits the rack: `gongDiameterM < rackWidthM`; hangs below the beam: `plateCenterYM + gongDiameterM / 2 < beamHeightM`.
  - Marker-filter math: with `WIND_MARKERS` imported, exactly the 100-yd marker satisfies `distanceM <= TEST_RANGE_GROUND.laneLengthM - 10`.
  - Marker lateral fit: `yardsToMeters(MARKER_OFFSET_YARDS) < TEST_RANGE_GROUND.laneWidthM / 2` (import from `wind-markers-config.ts`).

### Stage 1 verify
1. `npm test` green (from `GameBuild/app/`).
2. `npm run dev` → range select shows a third card "Test Range — 100 yd wooded" → enter.
3. Gong visible at 100 yd on its rack, chains hanging; only the 100-yd wind flag present.
4. Tap the gong region → Commit → HUD shows `#0 @ 100 yd`; FIRE: hit swings the gong, chains track the swing and snap back on settle, splat persists on the plate, ping arrives after time-of-flight, score increments, budget decrements.
5. **Bullet trace: enable the trace toggle in Settings → fire → tracer arc flies to the gong and lands with the impact** (works via the existing scene-agnostic path — no new code; this is a regression check).
6. Miss low → brown dust puff on the grass in front of the gong.
7. Range A and Zero Range play exactly as before (regression walk-through).

**STOP. Update `Design/execution/PROGRESS.md`. Owner confirms before Stage 2.**

---

## Stage 2 — Texture pipeline + terrain + sky + fog + lighting (the environment module core)

### 2.1 Copy textures
From `BallisticsToolkit/web/textures/` to `GameBuild/app/public/textures/` (create dirs):
- `grass/Grass004_1K-JPG_{Color,NormalGL,Roughness}.jpg` → `public/textures/grass/`
- `dirt/Ground082S_1K-JPG_{Color,NormalGL,Roughness}.jpg` → `public/textures/dirt/`
- `bark/Bark012_1K-JPG_{Color,NormalGL,Roughness}.jpg` → `public/textures/bark/`
- `rock/Rock030_256_{Color,NormalGL,Roughness}.jpg` → `public/textures/rock/` (check exact filenames on disk — the rock set's naming differs slightly)
Add `public/textures/README.md`: "ambientCG assets (Grass004, Ground082S, Bark012, Rock030), CC0 / public domain — https://ambientcg.com". Verify each set's page while copying.

### 2.2 `vite.config.ts`
In the Workbox config, add `jpg`: `globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest,mp3,jpg}']`, with a comment: textures must precache for offline-first (hard constraint). Leave `maximumFileSizeToCacheInBytes` alone.

### 2.3 `src/range/environment/texture-loader.ts` (new)
```ts
export interface PbrMaterialHandle { material: THREE.MeshStandardMaterial; dispose(): void; }
export function loadPbrMaterial(opts: {
  basePath: string;            // e.g. 'textures/grass/Grass004_1K-JPG' (no suffix)
  repeat: [number, number];
  fallbackColor: number;       // shown until/unless maps load
  roughness?: number;          // default 1
  anisotropy?: number;         // default 4
}): PbrMaterialHandle
```
Behaviour: create the material **synchronously** with `color: fallbackColor` so the scene renders immediately. Then `new THREE.TextureLoader().load(import.meta.env.BASE_URL + basePath + '_Color.jpg', onLoad, undefined, onError)` and same for `_NormalGL.jpg`, `_Roughness.jpg`. In each onLoad: `tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.repeat.set(...opts.repeat); tex.anisotropy = anisotropy;` — Color additionally `tex.colorSpace = THREE.SRGBColorSpace` (same idiom as `plate-surface.ts:79`); assign to `material.map` / `.normalMap` / `.roughnessMap`; when the color map lands also set `material.color.set(0xffffff)` (so the map isn't tinted); `material.needsUpdate = true`. onError: swallow (flat color stays — offline-first fallback). `dispose()` disposes the material + any loaded textures. Track loaded textures in a local array for dispose.

### 2.4 `src/range/environment/environment-config.ts` (new — PURE data/math, no THREE; this is the unit-testable heart)
```ts
export interface EnvironmentConfig {
  seed: number;
  terrain: {
    widthM: number; lengthM: number;       // total ground extent (centred on x=0, z ∈ [0,−lengthM])
    laneHalfWidthM: number;                // corridor where height ≡ 0
    laneBlendM: number;                    // smoothstep shoulder width
    reliefAmpM: number;                    // rolling-relief amplitude
    hill: { xM: number; zM: number; radiusM: number; heightM: number };
  };
  sky: { horizonHex: number; midHex: number; zenithHex: number; domeRadiusM: number };
  fog: { colorHex: number; nearM: number; farM: number };
  trees: {
    coniferCount: number; deciduousCount: number;
    bands: Array<{ xMin: number; xMax: number; zMin: number; zMax: number }>;
    scaleRange: [number, number];
    palette: number[];                     // canopy tint hexes
  };
  cover: { bushCount: number; rockCount: number; grassTuftCount: number; grassZoneM: number };
  mountains: { count: number; distMinM: number; distMaxM: number; heightMinM: number; heightMaxM: number; widthToHeight: number };
  clouds: { count: number; heightMinM: number; heightMaxM: number; fieldHalfWidthM: number; fieldZNearM: number; fieldZFarM: number; baseSizeM: number; fadeMarginM: number };
}
```
Exports:
- `mulberry32(seed: number): () => number` — standard 32-bit PRNG (~5 lines; deterministic placements).
- `makeTerrainSampler(cfg): (x: number, z: number) => number`:
  ```ts
  const relief = (x, z) =>   // BTK environment.js:955–967 rescaled to metres
      Math.sin(x * 0.045) * Math.cos(z * 0.045) * 0.45 * amp
    + Math.sin(x * 0.11 + 1.5) * Math.cos(z * 0.11 + 2.3) * 0.30 * amp
    + Math.sin(x * 0.23 + 3.7) * Math.cos(z * 0.23 + 4.2) * 0.25 * amp;
  const hill = (x, z) => h.heightM * Math.exp(-((x−h.xM)² + (z−h.zM)²) / h.radiusM²);
  const laneMask = (x) => smoothstep(laneHalfWidthM, laneHalfWidthM + laneBlendM, Math.abs(x));
  return (x, z) => laneMask(x) * (relief(x, z) + hill(x, z));
  ```
  (`smoothstep(a, b, t) = clamp((t−a)/(b−a),0,1)` then `t*t*(3−2t)` — write it locally.) The corridor `|x| ≤ laneHalfWidthM` is **exactly 0** by construction; everything (terrain mesh, placements) uses this one sampler.
- `generateTreePlacements(cfg): Array<{ kind: 'conifer'|'deciduous'; x; z; y; scale; rotationY; tintIndex }>` — draw uniformly inside `cfg.trees.bands` via the PRNG; **reject** any point with `|x| < laneHalfWidthM + laneBlendM` (belt + suspenders); `y = sampler(x, z)`; scale from `scaleRange`; `tintIndex = floor(rand * palette.length)`.
- `generateScatterPlacements(cfg)` — same pattern for bushes/rocks (in the tree bands + shoulder) and grass tufts (allowed IN the lane, `z ∈ [0, −grassZoneM]`, excluding a 3-m clear radius at the shooter and a 2-m radius at the rack base).
- `generateMountainPlacements(cfg)` — ring across the back: `z ∈ [−distMaxM, −distMinM]`, x fanned across ±distMaxM·0.8; heights in range; `radius = height * widthToHeight`.
- `generateCloudPlacements(cfg)` — uniform in the field box, each `{ x; y; z; sizeM; seed; driftFactor: 0.8 + rand*0.4 }`.

### 2.5 `src/range/environment/terrain.ts`
`buildTerrain(scene, cfg, sampler, track): { meshes }`:
- Lane/near ground: `PlaneGeometry(cfg.terrain.widthM, cfg.terrain.lengthM, 96, 192)`, rotate `-Math.PI/2`, position `z = −lengthM/2`; then loop vertices: world x = local x, world z = local (−y after rotation — easier: displace BEFORE rotating using plane local (x, y) → world (x, −y), set `positions.setZ(i, sampler(x, −y))` then `rotateX(-π/2)` — copy RangeScene's ground orientation convention and BTK 642–735); `computeVertexNormals()`.
- Material: `loadPbrMaterial({ basePath: 'textures/grass/Grass004_1K-JPG', repeat: [widthM/8, lengthM/8], fallbackColor: 0x7d9450 })`.
- Dirt apron beyond: big flat plane at y = −0.15 with the dirt set, repeat ~[60, 60], fallback `0xb89d6f`.

### 2.6 `src/range/environment/sky.ts`
`buildSky(scene, cfg, track)`:
- `SphereGeometry(cfg.sky.domeRadiusM /*1500*/, 32, 15)`, `ShaderMaterial({ side: THREE.BackSide, depthWrite: false, uniforms: { horizonColor, midColor, zenithColor } })`.
- Vertex shader passes `vWorldY = normalize(worldPosition.xyz).y`; fragment: `t = clamp(vWorldY, 0., 1.); color = t < .35 ? mix(horizon, mid, smoothstep(0., .35, t)) : mix(mid, zenith, smoothstep(.35, 1., t));` below-horizon (`t<0`) clamps to horizon color.
- `mesh.renderOrder = -1; mesh.frustumCulled = false;` add to scene.
- Also: `scene.fog = new THREE.Fog(cfg.fog.colorHex, cfg.fog.nearM, cfg.fog.farM)` and `scene.background = null` (the dome covers everything). **Set `cfg.fog.colorHex === cfg.sky.horizonHex`** so fogged geometry dissolves into the horizon. ShaderMaterial ignores fog by default — correct for the dome (it must not fog itself).

### 2.7 `src/range/environment/lighting.ts`
`buildLighting(scene, track)`: `HemisphereLight(0xbfd8ff /*sky tint*/, 0x5a6b46 /*ground bounce*/, 0.9)` + `DirectionalLight(0xfff2dc, 1.5)` at `(−250, 350, 150)` (sun forward-left so trunks/rack read with light/dark sides). No shadow config (maps disabled globally). Values are starting points — tune on device.

### 2.8 `src/range/environment/index.ts`
```ts
export interface EnvironmentHandle {
  getTerrainHeight(x: number, z: number): number;
  update(dt: number, timeS: number, windVec: {x;y;z}): void;
  dispose(): void;
}
export function buildEnvironment(scene: THREE.Scene, cfg: EnvironmentConfig): EnvironmentHandle
```
Calls (Stage 2): sampler → lighting → sky/fog → terrain. Stages 3–4 add vegetation/mountains/clouds here. Keeps its own `objects[]`/`disposables[]` (RangeScene `add`/`track` pattern); `dispose()` removes + disposes everything and nulls `scene.fog` (leave `scene.background` null-handling to the caller's dispose too — TestRangeScene.dispose already nulls both).

### 2.9 `TEST_RANGE_ENVIRONMENT` (append to `test-range-config.ts`)
```ts
export const TEST_RANGE_ENVIRONMENT: EnvironmentConfig = {
  seed: 1337,
  terrain: { widthM: 400, lengthM: 500, laneHalfWidthM: 16, laneBlendM: 12,
             reliefAmpM: 2.0, hill: { xM: 45, zM: -140, radiusM: 45, heightM: 9 } },
  sky: { horizonHex: 0xcfe0ee, midHex: 0x9ec2e4, zenithHex: 0x5f93c9, domeRadiusM: 1500 },
  fog: { colorHex: 0xcfe0ee, nearM: 180, farM: 1400 },
  trees: { coniferCount: 110, deciduousCount: 80,
    bands: [ { xMin: -170, xMax: -20, zMin: -430, zMax: -15 },     // left woods
             { xMin: 20, xMax: 170, zMin: -430, zMax: -15 },       // right woods
             { xMin: -170, xMax: 170, zMin: -430, zMax: -135 } ],  // behind-target block
    scaleRange: [0.8, 1.3],
    palette: [0x2d5016, 0x3a6420, 0x4a7328, 0x6b8f3a, 0x557a2e] }, // dark→light greens (mixed forest)
  cover: { bushCount: 60, rockCount: 25, grassTuftCount: 450, grassZoneM: 30 },
  mountains: { count: 12, distMinM: 1000, distMaxM: 1350, heightMinM: 120, heightMaxM: 260, widthToHeight: 1.4 },
  clouds: { count: 24, heightMinM: 220, heightMaxM: 380, fieldHalfWidthM: 900,
            fieldZNearM: 100, fieldZFarM: -1300, baseSizeM: 90, fadeMarginM: 120 },
};
```
Notes: hill at (+45, −140) is right of and behind the gong — the flat corridor (|x| ≤ 16 m) contains the rack (x=0) and the wind marker (x ≈ 8.2 m); behind-target tree band starts at z = −135 m (gong at −91.4, berm-free — trees ARE the backdrop, ≥ 40 m behind the gong so misses visually disappear into the woods). Mountains at 1000–1350 m sit inside the fog far (1400) so they read as hazy silhouettes, and inside the camera far (3000). All numbers are tuning starting points.

### 2.10 `TestRangeScene` swaps to the module
Constructor becomes: `this.env = buildEnvironment(scene, TEST_RANGE_ENVIRONMENT);` then rack/gong/chains/sign as before (they sit on the flat corridor, so their y math is unchanged; sink rack post bases 0.3 m by extending post length — cosmetic insurance). Remove the Stage-1 placeholder ground/sky/lights/fog. `update()` delegates: `this.env.update(dt, timeS, windVec)`. `dispose()` calls `this.env.dispose()` plus its own teardown.

### 2.11 Tests — `src/range/environment/environment-config.test.ts` (new)
- Determinism: two calls with seed 1337 give identical placement arrays; seed 1338 differs.
- Corridor flat: for a grid `x ∈ {−16…16 step 2}, z ∈ {0…−500 step 10}`, `|sampler(x,z)| < 1e-9`.
- Sight line: sample eye (0, 1.6, 0) → gong (0, 0.5486, −91.44) ray at 200 steps; terrain below the ray everywhere (trivially true given corridor-flat, but guards config drift).
- Hill: `sampler(45, −140) > 0.8 * hill.heightM` (laneMask ≈ 1 there).
- Placements: every tree/bush/rock has `|x| > laneHalfWidthM`; all within terrain bounds; counts match config; `y === sampler(x, z)` for each.
- Mountains: all `z ≤ −distMinM`.

### Stage 2 verify
1. `npm test` green.
2. Dev server: textured rolling ground with a visibly flat lane, hill right-rear, gradient sky, distant haze; gong loop from Stage 1 still fully works (commit/fire/swing/splat/trace/puffs — puff still sits ON the grass).
3. `npm run build` → grep `dist/sw.js` for `Grass004` (textures in the precache manifest); `npm run preview`, load once, go offline (DevTools), reload → textures still render.

**STOP. Update PROGRESS.md. Owner confirms.**

---

## Stage 3 — Vegetation (trees, bushes, rocks, grass tufts) + dev harness

### 3.1 `src/range/environment/trees.ts`
`buildTrees(scene, cfg, placements, track)` — 4 InstancedMeshes total:
- **Conifer trunk**: `CylinderGeometry(0.12, 0.18, 2.2, 7)` (unit tree ≈ 7 m tall overall), bark PBR material (`textures/bark/Bark012_1K-JPG`, repeat [1, 2], fallback 0x4a3728).
- **Conifer canopy**: merge 3 cones into ONE BufferGeometry so each tree costs one instance: `ConeGeometry(1.6, 2.6, 7)` at y 3.2, `(1.25, 2.2, 7)` at y 4.6, `(0.85, 1.8, 7)` at y 5.9 — use `BufferGeometryUtils.mergeGeometries` (`three/addons/utils/BufferGeometryUtils.js`; verify the import path against the installed three 0.185 — search node_modules if unsure). Material `MeshStandardMaterial({ roughness: 1 })` with `flatShading: true` (low-poly reads better than smooth cones).
- **Deciduous trunk**: `CylinderGeometry(0.14, 0.2, 2.6, 7)`, same bark material (share it).
- **Deciduous canopy**: merge 4 `IcosahedronGeometry(r, 1)` blobs (r ≈ 1.6/1.3/1.2/1.0) offset around (0, 3.8, 0) by ±0.9 in x/z — a lumpy crown. Same flat-shaded green material.
- Per instance: `matrix.compose(pos(x, y − 0.2 /*sink*/, z), rotY(rotationY), scale(s, s, s))`; `mesh.setColorAt(i, tintColor)` from `cfg.trees.palette[tintIndex]` — requires material color white and `instanceColor.needsUpdate = true`. Canopy + trunk share the same placement list split by `kind`.
- All meshes `frustumCulled = true` (default) — fine, they're one big bound each.

### 3.2 `src/range/environment/ground-cover.ts`
- **Bushes**: InstancedMesh of `IcosahedronGeometry(0.5, 1)` squashed `scale(s, s*0.65, s)`, flat-shaded, darker palette entries, sunk 0.1 m.
- **Rocks**: InstancedMesh of `IcosahedronGeometry(0.4, 1)` with vertices pre-jittered once (±15% via the PRNG), rock PBR (`textures/rock/Rock030_256…`, fallback 0x8a8578), random rotation, scale 0.3–1.2, sunk 30%.
- **Grass tufts**: InstancedMesh of a crossed-quad "X" (two `PlaneGeometry(0.5, 0.35)` merged at 90°, `DoubleSide`), vertex colors dark base → light tip (set a color BufferAttribute on the merged geometry), `MeshBasicMaterial({ vertexColors: true, side: DoubleSide })` (basic = cheap + always lit; alternative `MeshLambertMaterial` if basic looks flat against lit grass texture). Random yaw + scale 0.7–1.4. These live IN the lane near the shooter (placements from 2.4) — they're what sells "outdoor" at 1× magnification.

### 3.3 Dev harness (fast iteration without shooting a full session)
- `src/range/RangeView.tsx`: add optional props `{ label?: string; buildScene?: (scene: THREE.Scene) => { dispose(): void; update?(dt, t, wind): void } }`, defaulting to the current RangeScene behaviour; call `update?.()` in its loop with a fixed test wind.
- `src/debug/DevTools.tsx`: add a "Test Range" tab rendering `<RangeView label="Test Range · 100 yd" buildScene={(s) => new TestRangeScene(s)} />`. (~15 lines total; gives the existing frame-time HUD + free-look camera for environment tuning. Dev-only — tree-shaken from prod.)

### Stage 3 verify
1. `npm test` green (placement tests from 2.11 now cover trees too if written generically — extend if needed).
2. DevTools Test Range tab: mixed forest reads as woods (tiered pines + rounded crowns, tint variation), bushes/rocks seated on terrain (no floating/no buried-to-the-crown), grass tufts around the firing position, lane visibly clear to the gong.
3. Frame-time HUD comfortably under budget with everything drawn; if not, reduce counts in `TEST_RANGE_ENVIRONMENT` (that's why they're config).
4. In-game (scope view): sight line clean, commit/fire loop unaffected; wind flag not buried in a tree.

**STOP. Update PROGRESS.md. Owner confirms.**

---

## Stage 4 — Mountains + clouds + polish

### 4.1 `src/range/environment/mountains.ts`
Port BTK environment.js:266–343: one InstancedMesh of `ConeGeometry(1, 1, 8)` (unit), `MeshLambertMaterial({ map: snowGradientTexture() })` where `snowGradientTexture()` draws a 256×256 canvas vertical gradient — brown `#6b5d4f` (bottom 55%) → grey `#8a8a8a` (to 80%) → white (top) — as a `CanvasTexture`. Per instance from `generateMountainPlacements`: `compose(pos(x, y=0, z), randomYaw, scale(radius, height, radius))`. Lambert fogs naturally → hazy silhouettes at 1000–1350 m.

### 4.2 `src/range/environment/clouds.ts`
Port BTK environment.js:345–518 (build) + 737–793 (update):
- One `InstancedMesh` of `PlaneGeometry(1, 0.55)`; per-instance attributes `aSeed` (float) and `aOpacity` (float, updated each frame for edge fade — mark `needsUpdate`).
- `ShaderMaterial({ transparent: true, depthWrite: false, side: THREE.DoubleSide })`; copy the GLSL: `cloudHash`/`cloudNoise`/`cloudFbm` (5-octave value noise) → `cloudAlpha(uv, seed)` puffy-silhouette alpha; **strip the `#include <logdepthbuf_*>` lines** (our renderer doesn't use a log depth buffer) and **skip `customDepthMaterial`** (no shadows). Billboard the quads toward the camera in the vertex shader the way BTK does (or simplest: keep BTK's approach verbatim).
- `mesh.frustumCulled = false; mesh.renderOrder = 1;` (dome is −1 → dome draws first, clouds over it, both depthWrite:false).
- `updateClouds(dt, windVec)`: per instance, `x += windVec.x * driftFactor * dt; z += windVec.z * driftFactor * dt`; wrap toroidally into the field box (BTK `wrapToField`); recompute `aOpacity` edge fade over `fadeMarginM` from the field edges (BTK `cloudEdgeOpacity`). Decision (locked): drift with the **dialed mean wind** × per-cloud 0.8–1.2 — no engine wind-field dependency, and clouds respond when the player dials wind.

### 4.3 Wire + polish
- `index.ts` builds mountains + clouds; `EnvironmentHandle.update` calls `updateClouds`.
- ScopeView's Stage-1 hook (`range?.update?.(…)`) now animates them in-game; RangeView's harness wind animates them in DevTools.
- Tune pass with the owner: fog near/far, sky stops, tree counts/palette, hill shape, cloud count/height.

### Stage 4 verify
1. `npm test` green; `npm run build` clean.
2. Clouds drift with the dialed wind direction/speed, wrap without popping (edge fade), read correctly against the gradient dome (no depth artifacts through trees/mountains).
3. Snow-capped hazy ridge behind the forest; scene composition: woods → hill → mountains → clouds reads with depth.
4. Mirage toggle ON → post-process still renders dome/clouds correctly (mirage samples the rendered frame — should be transparent to it; verify visually).
5. Full-loop regression on all three ranges.
6. **Owner iPad pass**: install PWA, offline relaunch (textures present), smooth frame rate, full shoot loop, environment sign-off.

**STOP. Update PROGRESS.md.**

---

## Housekeeping (working agreement — applies to every stage)
- **No git commands** — owner handles all git (standing rule).
- `BallisticsToolkit/` is read-only (pristine oracle) — copy from it, never modify it.
- Update `Design/execution/PROGRESS.md` at the end of every stage; **stop and confirm with the owner after each stage** (standing rule).
- Add a `Design/feature-catalog.md` entry: "Test Range (environment sandbox + target proving ground)" — mark built-with-date as stages land; note it's the prototype for the environment redesign of the existing ranges and the future home for new target types (IDPA, Texas spinners…).

## Risks / notes for the implementer
- **iPad fill-rate** (dome + displaced terrain + ~190 trees + 450 grass tufts): everything is count/segment-configurable in `TEST_RANGE_ENVIRONMENT`; use the Stage-3 frame-time HUD before assuming it's fine.
- `BufferGeometryUtils` import path on three 0.185: verify (`three/addons/...` vs `three/examples/jsm/...`) against `node_modules` before using.
- Transparent clouds vs dome ordering: dome renderOrder −1 / clouds +1, both depthWrite false — verify visually in Stage 4; artifacts → give clouds `depthTest: true` (default) so trees/mountains still occlude them.
- ShaderMaterial clouds ignore `scene.fog` (BTK ships this way) — accepted.
- Wide-miss dust puffs project onto y=0 even under raised off-lane terrain — cosmetic, rare, accepted (noted in code).
- The planning session's shell was broken (proxy failure); the executor session needs a working shell (texture copy, `npm test`, `npm run build`). If exact BTK rock-texture filenames differ from this plan, trust the disk.
