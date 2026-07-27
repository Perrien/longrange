// Dev tools shell (task 1.8a, D2) — the developer-only overlay that sits
// ALONGSIDE the real player flow, plus the two remaining hidden test harnesses
// (DropTable/PersistencePanel and the TruthInspector).
//
// The default view is the actual range-select → Scope player flow, passed in as
// `game` — so `npm run dev` cold-launches straight into the real landing screen,
// exactly like production. The old scene-preview tabs (Game / Range A / Test
// Range / Scope) were removed 2026-07-27 (owner request — they cluttered the
// top-right corner and duplicated views now reachable in-game). The two dev
// harnesses that remain toggle open over the game and close back to it, so no
// separate "Game" button is needed to return.
//
// This component is the ONLY place DropTable / PersistencePanel / TruthInspector
// are imported. App renders it behind a static `import.meta.env.DEV` guard, which
// Vite replaces with the literal `false` in a production build — so Rollup drops
// this whole module and its transitive dev-only imports from the shipped bundle.
// The 1.8a tree-shake grep on dist/ is what proves that actually happened.

import { useState, type ReactNode } from 'react';
import { DropTable } from './DropTable';
import { PersistencePanel } from './PersistencePanel';
import { TruthInspector } from './TruthInspector';

type DevView = 'game' | 'debug' | 'truth';

export function DevTools({ game }: { game: ReactNode }) {
  const [view, setView] = useState<DevView>('game');
  const fullscreen = view === 'game';

  return (
    <div>
      <nav
        style={{
          fontFamily: 'monospace',
          padding: '0.5rem',
          display: 'flex',
          gap: '0.5rem',
          position: fullscreen ? 'absolute' : 'static',
          // Over the fullscreen game the top-right corner holds the Home/Loadout/
          // Settings buttons; nudge the dev strip down so the two don't overlap.
          top: fullscreen ? 48 : undefined,
          right: 0,
          zIndex: 30,
        }}
      >
        {/* Toggles: open the harness over the game, click again to return. */}
        <button onClick={() => setView((v) => (v === 'debug' ? 'game' : 'debug'))}>
          {view === 'debug' ? 'Close debug' : 'Debug tables'}
        </button>
        <button onClick={() => setView((v) => (v === 'truth' ? 'game' : 'truth'))}>
          {view === 'truth' ? 'Close truth' : 'Truth inspector'}
        </button>
      </nav>
      {/* Default: the real player flow (range select → Scope). */}
      {view === 'game' && game}
      {view === 'debug' && (
        <>
          <DropTable />
          <PersistencePanel />
        </>
      )}
      {view === 'truth' && <TruthInspector />}
    </div>
  );
}
