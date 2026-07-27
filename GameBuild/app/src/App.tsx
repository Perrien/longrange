// Root — the player state machine (task 1.8a, D1/D5; Settings overlay task 2.1d).
//
//   rangeSelect → (pick a range) → scope → (gear icon) → Settings overlay
//        ↑  └→ (Settings button)                (Home icon) ┘
//        └──────────────────────────────────────────────────┘
//
// Cold launch always starts at range select (D5); nothing resumes mid-session.
// The scope's gear-icon button opens the Settings screen as an OVERLAY over the
// still-mounted ScopeView (so the 3D scene / committed target / dialed solution
// survive — no teardown just to flip a setting); Settings is also reachable from
// the range-select screen so gear can be changed before entering a range. The
// scope's Home button returns to range select (resetting the run, 1.8a behaviour);
// Settings dismisses only via its own Done button (owner request 2026-07-27).
//
// The dev tools shell (dev-only harness overlay) renders ONLY behind a
// static `import.meta.env.DEV` guard — Vite replaces that with `false` in a prod
// build, so Rollup drops DevTools and its transitive dev-only imports
// (DropTable / PersistencePanel / TruthInspector) from the shipped bundle. DevTools
// is the only place those are imported; the 1.8a dist/ grep proves the drop.
import { useState } from 'react';
import { RangeSelect } from './shell/RangeSelect';
import { SettingsScreen } from './shell/SettingsScreen';
import { StoreScreen } from './shell/StoreScreen';
import { LoadoutOverlay } from './shell/LoadoutOverlay';
import { DopeBookScreen } from './shell/DopeBookScreen';
import { ScopeView } from './scope/ScopeView';
import { DevTools } from './debug/DevTools';
import { getRangeDefinition } from './range/ranges';
import { useGameStore } from './state/store';

type PlayerView = 'rangeSelect' | 'scope';

export function App() {
  const [view, setView] = useState<PlayerView>('rangeSelect'); // D5: always cold-starts here
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [storeOpen, setStoreOpen] = useState(false);
  const [loadoutOpen, setLoadoutOpen] = useState(false);
  const [dopeBookOpen, setDopeBookOpen] = useState(false);
  const setRangeId = useGameStore((s) => s.setRangeId);
  const resetSession = useGameStore((s) => s.resetSession);

  // Home button (scope top-right): back to range select. The 1.8a "return home
  // resets your run" confirm lives here now (it moved off the Settings screen —
  // owner 2026-07-27). Only prompt if a target is actually committed; read the
  // live state imperatively so App need not subscribe to it.
  const goHome = () => {
    const { currentTarget } = useGameStore.getState().session;
    if (currentTarget && !window.confirm('Return to range select? Your current run resets.')) return;
    resetSession(); // D8/D5: fresh start on return home
    setSettingsOpen(false);
    setDopeBookOpen(false);
    setView('rangeSelect');
  };

  // The real player flow — range select (+ Store + Settings) → Scope, with a gear
  // button that opens Settings, a Loadout button that swaps gear in place, and a
  // Home button back to range select. Settings is an overlay rendered in either
  // view (it never unmounts the scene underneath).
  const game = (
    <>
      {view === 'rangeSelect' && (
        <>
          <RangeSelect
            onSelect={(id) => {
              // Route selection through the range registry (task 2.3a): resolve
              // the definition (guards unknown ids) before entering the scope.
              const range = getRangeDefinition(id);
              setRangeId(range.id);
              setView('scope');
            }}
            onOpenStore={() => setStoreOpen(true)}
            onOpenSettings={() => setSettingsOpen(true)}
            onOpenDopeBook={() => setDopeBookOpen(true)}
          />
          {storeOpen && <StoreScreen onClose={() => setStoreOpen(false)} />}
        </>
      )}
      {view === 'scope' && (
        <>
          <ScopeView
            onOpenMenu={() => setSettingsOpen(true)}
            onOpenLoadout={() => setLoadoutOpen(true)}
            onOpenDopeBook={() => setDopeBookOpen(true)}
            onGoHome={goHome}
          />
          {loadoutOpen && <LoadoutOverlay onClose={() => setLoadoutOpen(false)} />}
        </>
      )}
      {settingsOpen && <SettingsScreen onClose={() => setSettingsOpen(false)} />}
      {dopeBookOpen && <DopeBookScreen onClose={() => setDopeBookOpen(false)} />}
    </>
  );

  // Dev build only: wrap the player flow in the developer tab-strip + hidden test
  // harnesses (default tab is the player flow itself, so dev cold-launches into
  // the real landing screen). Statically `false` in prod, so DevTools and its
  // dev-only imports tree-shake out of the shipped build.
  if (import.meta.env.DEV) {
    return <DevTools game={game} />;
  }

  return game;
}
