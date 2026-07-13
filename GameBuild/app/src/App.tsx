// Root — tab switcher between the debug screen (0.4d/0.8) and the
// touch-aiming spike (0.9).
import { useState } from 'react';
import { DropTable } from './debug/DropTable';
import { PersistencePanel } from './debug/PersistencePanel';
import { AimSpike } from './spike/AimSpike';

export function App() {
  const [view, setView] = useState<'debug' | 'aim'>('aim');

  return (
    <div>
      <nav style={{ fontFamily: 'monospace', padding: '0.5rem', display: 'flex', gap: '0.5rem', position: view === 'aim' ? 'absolute' : 'static', zIndex: 10, right: 0 }}>
        <button onClick={() => setView('aim')} disabled={view === 'aim'}>
          Aim spike
        </button>
        <button onClick={() => setView('debug')} disabled={view === 'debug'}>
          Debug tables
        </button>
      </nav>
      {view === 'aim' ? (
        <AimSpike />
      ) : (
        <>
          <DropTable />
          <PersistencePanel />
        </>
      )}
    </div>
  );
}
