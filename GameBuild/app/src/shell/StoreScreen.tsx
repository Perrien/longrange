// Store — step 1 of the two-step build flow (rifle-ammo-store S9, D17). Lists
// all 10 cartridges (name, class one-liner, presets-only tag for .22 LR);
// tapping one opens `BuildScreen` (step 2: rifle + ammo sliders, live derived
// readouts, preset chips, Acquire). Replaces S4's minimal holding version
// (single reference-barrel rifle row + one row per preset, no sliders).
import { useState } from 'react';
import { useGameStore } from '../state/store';
import { CARTRIDGE_IDS_V2, cartridgeParams } from '../game/spec';
import { BuildScreen } from './BuildScreen';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';

export function StoreScreen({ onClose }: { onClose: () => void }) {
  const [selectedCartridgeId, setSelectedCartridgeId] = useState<string | null>(null);
  const rifles = useGameStore((s) => s.inventory.rifles);
  const ammoLots = useGameStore((s) => s.inventory.ammoLots);

  if (selectedCartridgeId) {
    return (
      <BuildScreen
        cartridgeId={selectedCartridgeId}
        onBack={() => setSelectedCartridgeId(null)}
        onClose={onClose}
      />
    );
  }

  const ownedCount = (cartridgeId: string) =>
    rifles.filter((r) => r.spec.cartridgeId === cartridgeId).length +
    ammoLots.filter((l) => l.spec.cartridgeId === cartridgeId).length;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: PANEL_BG,
        color: FG,
        fontFamily: 'monospace',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        overflowY: 'auto',
        padding:
          'calc(16px + env(safe-area-inset-top)) calc(16px + env(safe-area-inset-right)) calc(16px + env(safe-area-inset-bottom)) calc(16px + env(safe-area-inset-left))',
      }}
    >
      <div style={{ width: '100%', maxWidth: 560 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Store</h1>
          <button
            onClick={onClose}
            style={{
              fontFamily: 'monospace',
              fontSize: 15,
              color: FG,
              background: 'rgba(232,238,244,0.1)',
              border: '1px solid rgba(232,238,244,0.4)',
              borderRadius: 6,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            Done
          </button>
        </div>

        <div style={{ fontSize: 12, opacity: 0.55, marginBottom: 8 }}>
          Pick a cartridge, then build your rifle and ammo.
        </div>

        {CARTRIDGE_IDS_V2.map((cartridgeId) => {
          const c = cartridgeParams(cartridgeId);
          const owned = ownedCount(cartridgeId);
          return (
            <button
              key={cartridgeId}
              onClick={() => setSelectedCartridgeId(cartridgeId)}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                width: '100%',
                padding: '12px 4px',
                border: 'none',
                borderTop: DIVIDER,
                background: 'transparent',
                color: FG,
                fontFamily: 'monospace',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              <div>
                <div style={{ fontSize: 15 }}>
                  {c.name}
                  {owned > 0 && <span style={{ opacity: 0.6 }}> · owned ×{owned}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {c.class}
                  {c.presetsOnly && ' · presets only'}
                </div>
              </div>
              <span style={{ opacity: 0.5, fontSize: 18 }}>›</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
