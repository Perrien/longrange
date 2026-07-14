// Root — tab switcher between the debug screen (0.4d/0.8) and the
// touch-aiming spike (0.9).
import { useState } from 'react';
import { DropTable } from './debug/DropTable';
import { PersistencePanel } from './debug/PersistencePanel';
import { AimSpike } from './spike/AimSpike';
import { RangeView } from './range/RangeView';

type View = 'range' | 'aim' | 'debug';

export function App() {
  const [view, setView] = useState<View>('range');
  const fullscreen = view === 'range' || view === 'aim';

  return (
    <div>
      <nav style={{ fontFamily: 'monospace', padding: '0.5rem', display: 'flex', gap: '0.5rem', position: fullscreen ? 'absolute' : 'static', zIndex: 10, right: 0 }}>
        <button onClick={() => setView('range')} disabled={view === 'range'}>
          Range A
        </button>
        <button onClick={() => setView('aim')} disabled={view === 'aim'}>
          Aim spike
        </button>
        <button onClick={() => setView('debug')} disabled={view === 'debug'}>
          Debug tables
        </button>
      </nav>
      {view === 'range' && <RangeView />}
      {view === 'aim' && <AimSpike />}
      {view === 'debug' && (
        <>
          <DropTable />
          <PersistencePanel />
        </>
      )}
    </div>
  );
}
