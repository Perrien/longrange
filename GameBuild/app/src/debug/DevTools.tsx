// Dev tools shell (task 1.8a, D2) — the developer-only tab strip that sits
// ALONGSIDE the real player flow, plus the three remaining hidden test
// harnesses (RangeView, DropTable, PersistencePanel).
//
// The default tab is "Game" — the actual range-select → Scope player flow,
// passed in as `game` — so `npm run dev` cold-launches straight into the real
// landing screen (with a working Menu button), exactly like production, while
// the extra tabs give quick access to the isolated dev views.
//
// This component is the ONLY place RangeView / DropTable / PersistencePanel are
// imported. App renders it behind a static `import.meta.env.DEV` guard, which
// Vite replaces with the literal `false` in a production build — so Rollup drops
// this whole module and its transitive dev-only imports from the shipped bundle.
// The 1.8a tree-shake grep on dist/ is what proves that actually happened.
//
// None of these extra views are player-facing menu UI: RangeView is an isolated
// 3D-scene preview, DropTable eyeballs the raw engine solve, PersistencePanel is
// the save/export/import harness (needed again at Increment 2's schema-v2 bump).

import { useState, type ReactNode } from 'react';
import { RangeView } from '../range/RangeView';
import { TestRangeScene } from '../range/TestRangeScene';
import { DropTable } from './DropTable';
import { PersistencePanel } from './PersistencePanel';
import { TruthInspector } from './TruthInspector';
import { ScopeView } from '../scope/ScopeView';

type DevView = 'game' | 'range' | 'test-range' | 'scope' | 'debug' | 'truth';

export function DevTools({ game }: { game: ReactNode }) {
  const [view, setView] = useState<DevView>('game');
  const fullscreen = view === 'game' || view === 'range' || view === 'test-range' || view === 'scope';

  return (
    <div>
      <nav
        style={{
          fontFamily: 'monospace',
          padding: '0.5rem',
          display: 'flex',
          gap: '0.5rem',
          position: fullscreen ? 'absolute' : 'static',
          // In fullscreen views the top-right corner holds the Scope Menu button;
          // nudge the dev strip down so the two don't overlap.
          top: fullscreen ? 48 : undefined,
          right: 0,
          zIndex: 30,
        }}
      >
        <button onClick={() => setView('game')} disabled={view === 'game'}>
          Game
        </button>
        <button onClick={() => setView('range')} disabled={view === 'range'}>
          Range A
        </button>
        <button onClick={() => setView('test-range')} disabled={view === 'test-range'}>
          Test Range
        </button>
        <button onClick={() => setView('scope')} disabled={view === 'scope'}>
          Scope
        </button>
        <button onClick={() => setView('debug')} disabled={view === 'debug'}>
          Debug tables
        </button>
        <button onClick={() => setView('truth')} disabled={view === 'truth'}>
          Truth inspector
        </button>
      </nav>
      {/* Default: the real player flow (range select → Scope, with Menu button). */}
      {view === 'game' && game}
      {view === 'range' && <RangeView />}
      {/* Stage 3 (test-range-environment-plan.md §3.3): free-look preview of the
          Test Range's environment (trees/ground-cover tuning) without shooting
          a session — same frame-time HUD + drag-to-look as the Range A tab. */}
      {view === 'test-range' && (
        <RangeView label="Test Range · 100 yd" buildScene={(s) => new TestRangeScene(s)} />
      )}
      {/* Standalone Scope with no onOpenMenu — the pre-1.8 dev preview (no Menu
          button, so no Settings overlay from this tab; use the Game tab for that). */}
      {view === 'scope' && <ScopeView />}
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
