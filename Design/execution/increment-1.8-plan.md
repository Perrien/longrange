# Increment 1.8 plan — ship it (range select, PWA polish, deploy)

`Status: DECISIONS LOCKED — verified against code + tightened for a junior dev (2026-07-16)` · `Original: 2026-07-15`
`Covers:` PROGRESS task **1.8**, the last task of Increment 1 (`increment-1.md` §1.8: "PWA polish for
the slice (app icon, title screen, range select stub), precache audit, deploy, owner plays on iPad
offline").
`Authority:` refines [`increment-1.md`](./increment-1.md) §1.8 under [`execution-protocol.md`](./execution-protocol.md).
Nothing here overrides the increment doc's own **exit checklist** (quoted verbatim below) — 1.8's job
is to walk that checklist, not replace it. **Live state lives in [`PROGRESS.md`](./PROGRESS.md)
(authoritative); this doc is the point-in-time plan.**

> **Audience note:** written for a junior programmer. Work **one sub-task at a time, top to bottom.**
> After each sub-task: run its Verify checkpoint, update `PROGRESS.md`, commit, and **STOP for owner
> confirmation before starting the next** (protocol §2.8). 1.8 is a/b/c — do not over-build past
> what's asked.

> **How to read this doc:** every sub-task has four fixed parts — **Build** (exact files/edits),
> **Test (machine)** (commands that must pass, run by you), **Owner check** (on-device, marked
> `AWAITING OWNER`), and **STOP**. If reality disagrees with any *fact* stated here, STOP and log it
> (protocol §4/§6) — do not paper over it.

---

## Current state (verified by reading the code, 2026-07-16 — read before writing 1.8a)

Facts established so nobody re-derives them or guesses wrong. Each was re-checked against the live
tree on 2026-07-16.

1. **There is no title screen and no range-select UI today, not even a stub.** `App.tsx` (43 lines)
   is a hand-rolled tab switcher with no router: `type View = 'range' | 'scope' | 'aim' | 'debug'`,
   defaulting to `'scope'`. Its `nav` bar's four buttons ("Range A", "Scope", "Aim spike", "Debug
   tables") are **dev-only tools**: `RangeView.tsx` is a free-look preview scene, `AimSpike.tsx` is
   the pre-1.3 touch-aim prototype, `DropTable`/`PersistencePanel` are validation/debug tables. None
   is player-facing menu UI.
2. **The app icons are already real, finished branding — do not touch (owner-confirmed 2026-07-15).**
   `icon-192.png`, `icon-512.png`, `icon-512-maskable.png`, and `apple-touch-icon.png` (180×180) all
   exist in `GameBuild/app/public/` and render a white/light-gray crosshair reticle on the `#1a222c`
   navy that matches the manifest's `background_color`/`theme_color`.
3. **No favicon exists.** `index.html` has `<link rel="apple-touch-icon">` but no `<link rel="icon">`,
   so a bare browser tab shows a default icon. Owner asked for one added (2026-07-15).
4. **GitHub Pages deploy is already wired AND already proven live in the field (owner-confirmed
   2026-07-16).** `.github/workflows/ci.yml` has a `deploy` job (`if: github.ref == 'refs/heads/main'
   && github.event_name == 'push'`, `needs: [web, native-tests]`, `actions/deploy-pages@v4`) that
   runs after `native-tests` and `web`. `vite.config.ts`'s `base: './'` is GH-Pages-project-page-safe.
   **The owner has been pushing to `main` throughout and testing the running game on BOTH `npm run
   dev` AND the public GitHub Pages URL — the deploy → live-URL flow is proven working, not a
   first-time risk.** So 1.8c's deploy step is a routine "confirm the latest push went green," not the
   novel end-to-end verification the earlier draft treated it as.
5. **No CDN/external imports in `src/`.** Precache `globPatterns` is
   `['**/*.{js,css,html,png,svg,woff2,webmanifest,mp3}']`. **There is deliberately no `wasm` in that
   list, and that is correct:** the C++/WASM engine is emitted **single-file-inlined into
   `dist/assets/index-*.js`** (a ~1 MB JS file; `find dist -name '*.wasm'` returns nothing). So the
   `.js` glob already precaches the entire engine. Do not "fix" a missing `.wasm` — there isn't one.
6. **`session.rangeId` is a plain `string`, hardcoded to `'range-a'`** in `defaultSession()`
   (`state/store.ts`), with comment `/** Active range id (Range A this increment). */`. There is
   exactly one range config (`range/range-a-config.ts`), not parameterized by id. Its racks run
   **50 → 500 yd** (`RANGE_A_RACKS` keys 50,100,…,500), so the copy "Range A — 50 to 500 yd steel"
   is accurate.
7. **The store has NO `setRangeId` action, and components never call the store via a `store()`
   accessor.** Session setters that exist: `setWind`, `setWindPreset`, `decrementBudget`,
   `recordShot`, `selectTarget`, `commitTarget`, `resetSession`, `resetScore`. Components read/call
   the store as `const x = useGameStore((s) => s.x)` / `const act = useGameStore((s) => s.act)`
   (see `ScopeView.tsx` lines 132–169). Outside React, use `useGameStore.getState()`. **`selectTarget`
   / `commitTarget` do NOT touch `rangeId`.** (This corrects the original plan's `store().setRangeId?.()`
   pseudocode, which referenced an API that does not exist — see 1.8a Build for the real approach.)
8. **`resetSession()`** (`store.ts` line 349) does `set({ session: defaultSession(), score:
   defaultScore() })` — it already zeroes score, shot budget, wind, dials, `currentTarget`, and
   resets `rangeId` back to `'range-a'`. Reuse it verbatim; do not hand-roll a reset.
9. **`session.currentTarget`** is `CommittedTarget | null` — `null` until the player commits to a
   plate, non-null after. This is the exact signal the Menu-button confirm uses (D6, below).
10. **`ScopeView` takes no props today** (`export function ScopeView()`), and is rendered both by the
    real flow (after 1.8a) and by the dev tab-strip. Any prop 1.8 adds must be **optional** so the
    dev path keeps compiling.
11. **The exit checklist is real, already written, and currently unchecked** — quoted verbatim from
    `increment-1.md`:
    ```
    **Increment exit checklist:**
    - [ ] On the installed offline iPad PWA, a player can engage 50–500 yd steel and score hits.
    - [ ] Both correction methods work per shot: turret dialing AND reticle holds; both in MIL and in MOA scope variants.
    - [ ] Wind is adjustable (speed/direction) and visibly matters ≥300 yd.
    - [ ] Steel reacts (swing/rotation) and pings with distance-delayed audio.
    - [ ] Golden-vector diff still green; all tests green.
    - [ ] OWNER CHECK: the aim→fire→impact loop is fun.
    ```
    `git tag -l` shows exactly one tag today, `inc0-complete`; 1.8 creates `inc1-complete` the same way.

## Owner decisions (2026-07-15 / 2026-07-16, confirmed before this plan was finalized)

- **D1 — Flow: Range select → Scope (no separate splash).** The range-select screen IS the landing
  screen. Cold launch shows "Range A" as the only option; selecting it enters Scope.
- **D2 — Dev tab-strip is REMOVED from the shipped build**, not deleted from the repo — gated behind
  Vite's `import.meta.env.DEV` so the dev tools stay available under `npm run dev` but compile out of
  `npm run build`'s output. See 1.8a for the *exact* structure required to make this actually
  tree-shake (a naive conditional render does **not** work — this was a real gap in the original plan).
  **Scope (owner-confirmed 2026-07-16):** only **three** dev tools are gated — `RangeView` (isolated
  3D-scene FPS/geometry preview), `DropTable` (raw engine drop/windage solve, MIL+MOA metric+imperial,
  for eyeballing that the physics is sane), and `PersistencePanel` (save/export/import test harness,
  needed again at Increment 2's schema-v2 bump). All three are hidden test harnesses, never player UI.
- **D2b — `AimSpike` is DELETED outright (owner-confirmed 2026-07-16), not gated.** Its only purpose
  was the touch-feel model (hand wobble / breath hold / recoil spring), which was **ported verbatim
  into `ScopeView`** (see the "ported verbatim from task-0.9 AimSpike" comment block there). Nothing
  imports `AimSpike` except itself, so it has no remaining value beyond a historical copy. Remove
  `src/spike/AimSpike.tsx` (and the now-empty `src/spike/` folder) in 1.8a. **Do not** remove the
  feel-model constants living in `ScopeView.tsx` — those are the production copy now.
- **D3 — App icons are final; do not touch.**
- **D4 — Add a favicon**, reusing existing icon art (no new image asset). See 1.8b.
- **D5 — Cold launch always starts at range select**, never resumes mid-session (nothing persists
  "mid-engagement" across a reload anyway; score/budget/wind are session-only).
- **D6 — Scope gets a small "Menu" control** (top-left, unobtrusive, same monospace HUD language)
  that returns to range select. **Reset behavior (owner, 2026-07-16):** if `session.currentTarget`
  is **non-null** (a target is committed), show a small confirm — "Return to range select? Your
  current run resets" — before resetting; if it's **null**, return instantly with no confirm. On
  confirm/instant-return, call `resetSession()` (D8/D5 fresh start).
- **D7 — Favicon: point `<link rel="icon">` at the existing `icon-192.png`** (already precached), no
  new image file. Modern browsers scale it fine; a dedicated small favicon is a trivial follow-up if
  it looks soft.
- **D8 — Range-select is a real screen, not a disabled placeholder.** **Branded landing (owner,
  2026-07-16):** show the crosshair logo (existing `icon-512.png` art) + the "LongRange" title above
  a single "Range A — 50 to 500 yd steel" card. One enabled entry; **no** speculative grayed-out
  "coming soon" slots for ranges that don't exist yet.

---

## What already exists (build on this, don't rebuild)

- **Persisted settings survive navigation for free** — `unitsPrimary`, `windRealism`, etc. live in
  the Zustand store, untouched by adding top-level views. No persistence work here.
- **`resetSession()`** — reuse verbatim (Current state #8).
- **`ScopeView.tsx`** needs exactly one small addition (the Menu button + one optional prop); its
  render loop, HUD, wind/mirage systems do not change.
- **The CI/deploy pipeline is done** (Current state #4) — 1.8c verifies it.

---

## 1.8a — Range select (branded landing) + Menu button + dev-tab gating

**Goal:** cold launch shows a branded range-select screen (logo + title + one "Range A" card) — no
splash in front of it; selecting Range A enters Scope; a Menu control returns home (with a confirm
only when a target is committed). The dev tab-strip still works under `npm run dev` but is entirely
absent from `npm run build`'s output.

### Build — do these in order

**Step 1 — Add a `setRangeId` store action** (`src/state/store.ts`). There is no setter today
(Current state #7); add one that mirrors the existing `setWind` reducer exactly:

```ts
// in the GameStore interface, near setWind:
/** Set the active range id (range select, task 1.8). */
setRangeId(id: string): void;

// in the store body, near setWind:
setRangeId: (id) => set((s) => ({ session: { ...s.session, rangeId: id } })),
```

Also add one unit test in `src/state/state.test.ts` mirroring the existing `setWind`/`setWindPreset`
tests: set an id, assert `getState().session.rangeId` equals it, and assert `resetSession()` returns
it to `'range-a'`. *(This makes 1.8a add one tiny testable module — that is expected and correct;
the original plan's "no new tests" note was wrong once `setRangeId` is a real action.)*

**Step 2 — New folder `src/shell/` and `src/shell/RangeSelect.tsx`** (a genuinely new, player-facing
layer, distinct from the per-feature `scope/`/`range/`/`debug/` folders). Signature:

```ts
export function RangeSelect({ onSelect }: { onSelect: (rangeId: string) => void }) { … }
```

Content (D8, branded): full-bleed `#1a222c` background (so there's no flash-of-wrong-color on
launch); the crosshair logo — `<img src="./icon-512.png" …>` (reuses the existing precached asset,
no new file); the title "LongRange"; below it a single tappable card/button labeled
`Range A — 50 to 500 yd steel` whose `onClick` calls `onSelect('range-a')`. One enabled entry only;
no grayed-out future-range slots. Styling: plain inline `style={{}}` objects (matching every other
component here — there is no Tailwind/styled-components in this codebase). Make the card a large,
finger-friendly tap target (iPad).

**Step 3 — Delete `AimSpike` (D2b):** remove `src/spike/AimSpike.tsx` and the now-empty `src/spike/`
folder. Confirm nothing else imports it first — `grep -rn "AimSpike" src/` should afterward return
only the unrelated comment in `ScopeView.tsx` ("ported verbatim from task-0.9 AimSpike"), which is
prose, not an import. Leave the feel-model constants in `ScopeView.tsx` untouched.

**Step 4 — Extract the remaining dev tools into one gated component** — this is the *reliable* way to
satisfy D2 (a bare `import.meta.env.DEV &&` around JSX while `RangeView`/`DropTable` are still
statically imported and referenced can leave them in the prod bundle). Create `src/debug/DevTools.tsx`
that owns the dev tab-strip AND the three remaining dev views (`RangeView`, `DropTable` +
`PersistencePanel`), plus a way to jump straight into Scope for fast iteration:

```tsx
// src/debug/DevTools.tsx
import { useState } from 'react';
import { RangeView } from '../range/RangeView';
import { DropTable } from './DropTable';
import { PersistencePanel } from './PersistencePanel';
import { ScopeView } from '../scope/ScopeView';

type DevView = 'range' | 'scope' | 'debug';
export function DevTools() {
  const [view, setView] = useState<DevView>('scope');
  // …a nav <button> strip (Range A / Scope / Debug tables — NO "Aim spike" button)…
  // …plus the view switch, rendering ScopeView with NO onExit prop here.
}
```

**Step 5 — Rewrite `App.tsx`** to the two-state player machine, with `DevTools` referenced ONLY
inside a static `import.meta.env.DEV` guard (Vite replaces this with the literal `false` in a prod
build, so Rollup drops the whole `DevTools` import subtree — including `RangeView`/`DropTable`):

```tsx
import { useState } from 'react';
import { RangeSelect } from './shell/RangeSelect';
import { ScopeView } from './scope/ScopeView';
import { useGameStore } from './state/store';

type PlayerView = 'rangeSelect' | 'scope';

export function App() {
  const [view, setView] = useState<PlayerView>('rangeSelect'); // D5: always cold-starts here
  const setRangeId = useGameStore((s) => s.setRangeId);
  const resetSession = useGameStore((s) => s.resetSession);

  if (import.meta.env.DEV) {
    // Dev build only: render the dev tools shell instead of / alongside the player flow.
    // (Simplest: return <DevTools/> here, imported lazily so prod never sees it — see note.)
  }

  return (
    <>
      {view === 'rangeSelect' && (
        <RangeSelect onSelect={(id) => { setRangeId(id); setView('scope'); }} />
      )}
      {view === 'scope' && (
        <ScopeView onExit={() => { resetSession(); setView('rangeSelect'); }} />
      )}
    </>
  );
}
```

> **DevTools wiring detail (pick ONE, document which):** the cleanest tree-shakeable pattern is a
> dynamic import — `const DevTools = import.meta.env.DEV ? (await import('./debug/DevTools')).DevTools
> : null` is awkward in a component, so instead render `{import.meta.env.DEV && <DevTools />}` **and**
> ensure `DevTools` is the *only* place `RangeView`/`DropTable`/`PersistencePanel` are
> imported. Because `import.meta.env.DEV` is statically `false` in prod, Rollup sees `<DevTools/>` as
> dead and drops the module and its transitive dev-only imports. The Test step's grep is what proves
> this actually happened — if it fails, the fix is to remove any stray non-DevTools reference to the
> dev components, not to add CSS hiding.

**Step 6 — Menu button in `ScopeView.tsx`** (D6). Change the signature to accept an **optional**
prop (so `DevTools` can still render `<ScopeView />` with no prop):

```ts
export function ScopeView({ onExit }: { onExit?: () => void }) { … }
```

Add a small top-left absolute-positioned "Menu" button (monospace, minor — a utility control, not a
HUD feature). Guard it with `onExit &&` so it only appears in the real flow. Its `onClick`:

```ts
const currentTarget = useGameStore((s) => s.session.currentTarget); // already read? reuse it
const onMenu = () => {
  if (currentTarget != null) {
    // D6: confirm before discarding a committed run
    if (!window.confirm('Return to range select? Your current run resets.')) return;
  }
  onExit?.(); // App wires this to resetSession() + setView('rangeSelect')
};
```

*(Placement note: check the existing top-left HUD does not already occupy that corner; if it does,
nudge the Menu button so it does not overlap the readout. This is a visual check for the Owner
step.)*

### Test (machine) — all must pass before marking 1.8a done
- `npm run typecheck` → clean.
- `npm test` → green; **report the test count** (it should rise by the one new `setRangeId` test).
- `npm run build` → green.
- **Tree-shake proof:** after `npm run build`, run
  `grep -R -e "Debug tables" -e "Persistence (task 0.8)" dist/assets/*.js` — it must print **nothing**
  (exit code 1). These strings are unique to the DEV-gated `DevTools` nav and `PersistencePanel`, so
  their absence proves the dev subtree was dropped from the prod bundle (not just hidden at runtime).
  If it prints matches, the dev code did NOT tree-shake out; fix per the DevTools wiring detail above
  and rebuild. Record the grep result in PROGRESS.md.
  *(Note: don't grep for "Aim spike" — `AimSpike` is deleted from the repo entirely per D2b, so that
  string is gone from dev and prod alike and would prove nothing.)*

### Owner check (`AWAITING OWNER` — iPad, and `npm run dev` locally)
- Cold launch / reload shows the branded range-select screen directly (logo + title + Range A card),
  not Scope and not a separate splash.
- Selecting Range A enters Scope.
- Menu button with **no** target committed → returns home instantly.
- Menu button **with** a target committed → shows the confirm; canceling stays in Scope; confirming
  returns home, and a fresh Range A → Scope run shows shot-budget/score reset.
- Under `npm run dev` the dev tab-strip is visible and functional; in the installed/production build
  it never appears.

**STOP** — owner confirm before 1.8b.

---

## 1.8b — Favicon + precache re-audit

**Goal:** a real browser-tab icon; an explicit, re-measured confirmation that precache/CDN/no-new-deps
state still holds after 1.8a's new screens.

### Build
1. **Favicon (D4/D7):** in `index.html`, next to the existing `apple-touch-icon` link, add:
   `<link rel="icon" type="image/png" href="./icon-192.png" />`. No new image file.
2. **`index.html` sanity pass:** confirm `<title>LongRange</title>`, `theme-color #1a222c`, and the
   iOS standalone meta tags still make sense with range select as the landing screen. No changes
   expected beyond the favicon link — just don't regress them.

### Test (machine) — all must pass
- `npm run typecheck` / `npm test` / `npm run build` → green.
- **Precache count — measure, don't assume.** The current baseline is **17** entries (verified
  2026-07-16 by counting `url:` occurrences in `dist/sw.js`). Because the favicon reuses
  `icon-192.png`, which is **already** in the precache manifest, adding the `<link>` adds **no new
  file** → the count must stay **17**. Verify after building:
  `grep -o 'url:' dist/sw.js | wc -l` → expect **17**. *(The original plan said "expect 18"; that was
  a mistake — a reused asset does not add an entry.)* If the number is anything other than 17, STOP
  and investigate what asset changed before proceeding — record the number in PROGRESS.md either way.
- **No new deps / no CDN:** `git diff --stat` shows `package.json`/lockfile unchanged;
  `grep -R "https\?://" src/` returns only the two known MIT-attribution comments in `Mirage.ts`.

### Owner check (`AWAITING OWNER`)
- Load the built app (`npm run preview`) in a normal browser tab (not installed) — a crosshair
  favicon shows in the tab, not a blank/default icon.

**STOP** — owner confirm before 1.8c.

---

## 1.8c — Deploy confirmation, exit checklist, tag, sign-off

**Goal:** the increment-1 exit checklist (Current state #11) is walked and checked off for real on
the installed offline iPad PWA, running the NEW range-select → Scope flow from the live URL;
`inc1-complete` is tagged.

**Note (2026-07-16):** the deploy → live-URL flow is already proven (Current state #4 — the owner has
been running the game on the public GitHub Pages URL throughout). So step 1 below is a routine "did
the latest push go green," not a first-time verification. What's genuinely new to confirm here is only
that the **1.8a/1.8b changes** (range-select landing, Menu button, favicon) work once deployed.

### Build / verify steps
1. **Push 1.8a+1.8b to `main`** and confirm the `deploy` GitHub Actions job went green on that push —
   the pipeline is known-good, so this is just checking the run, then loading the live URL to see the
   new range-select landing show up (not a novel end-to-end test).
2. **Walk the six-item exit checklist verbatim** (Current state #11) on the installed iPad PWA,
   offline, through the NEW range-select → Scope flow. Items 1–4 are already proven from 1.1–1.7's
   on-device confirmations; the point here is checking them off together from the shipped install now
   that the flow starts at range select rather than defaulting straight into Scope. (Offline-after-
   install has effectively already been exercised via the owner's live-URL testing; a quick airplane-
   mode relaunch is a nice-to-have confirmation, not a blocker.)
3. **Tag `inc1-complete`** (mirrors `inc0-complete`) once all six boxes are checked and the owner
   signs off.
4. **Update `PROGRESS.md`:** mark 1.8 DONE and Increment 1 fully complete; open the Increment 2
   section per the build plan's sequencing. **Do not start any Increment-2 work in this task.**

### Test (machine) — last belt-and-suspenders pass
- `npm run typecheck` / `npm test` / `npm run build` → green.
- `node GameBuild/validation/match-check.mjs` (golden-vector diff) → green. Nothing in 1.8 touches
  `GameBuild/engine/`, so this should be a formality; if it isn't, STOP and log it.

### Owner check (`AWAITING OWNER` — iPad, offline, freshly installed from the live URL)
- Every box in the exit checklist checked for real, including the subjective one ("the
  aim→fire→impact loop is fun") — that has no machine proxy and is the owner's call alone.

**STOP** — owner sign-off closes Increment 1. Next is Increment 2 (its own future planning pass, not
started here).

---

## Whole-task exit (1.8 complete when…)

A player can cold-launch the installed offline iPad PWA, land on a branded single-option
range-select screen, pick Range A, play the full 1.1–1.7 KD steel loop, and return to range select
via Menu (with a confirm only when a target is committed) for another fresh run — with zero dev-only
UI ever visible in the shipped build. The favicon shows in a browser tab. The live GitHub Pages URL
works, installs, and runs offline. The increment-1 exit checklist is fully checked, `inc1-complete`
is tagged, and `PROGRESS.md` reflects Increment 1 as complete.

## Verification gates (run before marking ANY sub-task DONE)
1. `npm run typecheck` clean · `npm test` green (report the count) · `npm run build` green.
2. 1.8 is app-shell-only — no `GameBuild/engine/` change is expected anywhere; if that changes
   unexpectedly, STOP and log it (protocol §4/§6).
3. The sub-task's own **Test (machine)** items, verbatim.
4. Anything not machine-verifiable (flow feel, favicon crispness, live-deploy reachability) → the
   owner's on-device/on-browser check, marked `AWAITING OWNER`.

## Future refinements (log, don't build here)
- **Real multi-range support**: `session.rangeId`/`RangeSelect.tsx` are shaped for more than one
  range, but adding Range B is a full future content task (new rack layout, ground config, distances).
- **Settings/stats screens off range select**: no settings/stats/history view is added here; logged
  as a plausible Increment-2+ polish item.
- **Dedicated small favicon**: D7 reuses `icon-192.png`; a purpose-built 32×32/48×48 favicon is a
  trivial follow-up if the reused asset looks soft in a tab.
