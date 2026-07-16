// Root — the two-state player machine (task 1.8a, D1/D5).
//
//   rangeSelect → (pick Range A) → scope → (Menu) → rangeSelect
//
// Cold launch always starts at range select (D5); nothing resumes mid-session.
// The dev tools shell (tab strip + hidden test harnesses) renders ONLY behind a
// static `import.meta.env.DEV` guard — Vite replaces that with `false` in a prod
// build, so Rollup drops DevTools and its transitive dev-only imports
// (RangeView / DropTable / PersistencePanel) from the shipped bundle. DevTools is
// the only place those are imported; the 1.8a dist/ grep proves the drop.
import { useState } from 'react';
import { RangeSelect } from './shell/RangeSelect';
import { ScopeView } from './scope/ScopeView';
import { DevTools } from './debug/DevTools';
import { useGameStore } from './state/store';

type PlayerView = 'rangeSelect' | 'scope';

export function App() {
  const [view, setView] = useState<PlayerView>('rangeSelect'); // D5: always cold-starts here
  const setRangeId = useGameStore((s) => s.setRangeId);
  const resetSession = useGameStore((s) => s.resetSession);

  // The real player flow — range select → Scope, with a working Menu button.
  const game = (
    <>
      {view === 'rangeSelect' && (
        <RangeSelect
          onSelect={(id) => {
            setRangeId(id);
            setView('scope');
          }}
        />
      )}
      {view === 'scope' && (
        <ScopeView
          onExit={() => {
            resetSession(); // D8/D5: fresh start on return home
            setView('rangeSelect');
          }}
        />
      )}
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
