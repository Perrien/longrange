// Gear — Store (acquire rifles/ammo) and Loadout (pick the active rifle/lot) as
// one tabbed screen, reachable from BOTH range-select and the in-range HUD.
// Previously these were two separate screens with asymmetric reach — Store only
// from range-select, Loadout only from the scope — so switching gear mid-session
// meant leaving the range, and browsing the store meant you couldn't see what you
// already had equipped. Folding them into one screen with tabs (owner 2026-08-02)
// closes that gap; each entry point just picks which tab opens by default.
//
// Tab content is unchanged from the old StoreScreen/LoadoutOverlay (rifle-ammo-store
// S9, D17 / task 2.2c, D3) — same cartridge list → BuildScreen drill-down for Store,
// same owned-rifle/owned-lot select-or-delete rows for Loadout. Believed values only
// (guardrail §4.8): Loadout has no hidden truth to leak.
import { useState, type CSSProperties } from 'react';
import { useGameStore } from '../state/store';
import { CARTRIDGE_IDS_V2, cartridgeParams } from '../game/spec';
import { resolveLoadSpec, resolveRifleSpec } from '../game/catalog';
import { formatSpeedForDisplay } from '../units/display';
import { BuildScreen } from './BuildScreen';
import { TabButton } from './TabButton';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';

const doneBtnStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 15,
  color: FG,
  background: 'rgba(232,238,244,0.1)',
  border: '1px solid rgba(232,238,244,0.4)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
};

const deleteBtnStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: '#e8a0a0',
  background: 'rgba(180,40,40,0.15)',
  border: '1px solid rgba(232,160,160,0.45)',
  borderRadius: 5,
  padding: '5px 9px',
  cursor: 'pointer',
  flexShrink: 0,
};

function rowStyle(active: boolean): CSSProperties {
  return {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 12,
    padding: '10px 12px',
    marginTop: 6,
    borderRadius: 6,
    border: active ? '1px solid #e8eef4' : '1px solid rgba(232,238,244,0.25)',
    background: active ? 'rgba(40,110,170,0.35)' : 'rgba(232,238,244,0.05)',
    cursor: 'pointer',
    WebkitUserSelect: 'none',
    userSelect: 'none',
  };
}

type GearTab = 'store' | 'loadout';

export function GearScreen({ onClose, initialTab = 'store' }: { onClose: () => void; initialTab?: GearTab }) {
  const [tab, setTab] = useState<GearTab>(initialTab);
  const [selectedCartridgeId, setSelectedCartridgeId] = useState<string | null>(null);

  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const { rifles, ammoLots, activeRifleId, activeLotId } = useGameStore((s) => s.inventory);
  const selectRifle = useGameStore((s) => s.selectRifle);
  const selectLot = useGameStore((s) => s.selectLot);
  const deleteRifle = useGameStore((s) => s.deleteRifle);
  const deleteLot = useGameStore((s) => s.deleteLot);

  // Drilled into a cartridge's build screen (Store tab, step 2) — full-screen
  // replace, same as the old StoreScreen; back returns to the cartridge list.
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

  const emptyInventory = rifles.length === 0 && ammoLots.length === 0;

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
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Gear</h1>
          <button onClick={onClose} style={doneBtnStyle}>
            Done
          </button>
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 12 }}>
          <TabButton flex active={tab === 'store'} onClick={() => setTab('store')}>
            Store
          </TabButton>
          <TabButton flex active={tab === 'loadout'} onClick={() => setTab('loadout')}>
            Loadout
          </TabButton>
        </div>

        {tab === 'store' && (
          <>
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
          </>
        )}

        {tab === 'loadout' && (
          <>
            {emptyInventory && (
              <p style={{ opacity: 0.7, fontSize: 14 }}>No gear yet — acquire rifles and ammo from the Store tab.</p>
            )}

            {rifles.length > 0 && (
              <h2 style={{ fontSize: 16, opacity: 0.8, margin: '4px 0 0', borderTop: DIVIDER, paddingTop: 12 }}>
                Rifle
              </h2>
            )}
            {rifles.map((r) => {
              const model = resolveRifleSpec(r.spec);
              const active = r.id === activeRifleId;
              return (
                <div key={r.id} style={rowStyle(active)} onClick={() => selectRifle(active ? null : r.id)}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 15 }}>{model.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{model.className}</div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, opacity: active ? 1 : 0.4 }}>{active ? '✓ active' : 'select'}</span>
                    <button
                      style={deleteBtnStyle}
                      onClick={(e) => {
                        // Don't let the row's select toggle fire on a delete tap.
                        e.stopPropagation();
                        // Destroys this instance's hidden characteristics + zero for
                        // good — a re-acquire rolls a brand-new rifle.
                        if (window.confirm(`Delete this ${model.name}? Its zero and individual characteristics are lost permanently.`)) {
                          deleteRifle(r.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}

            {ammoLots.length > 0 && (
              <h2 style={{ fontSize: 16, opacity: 0.8, margin: '16px 0 0', borderTop: DIVIDER, paddingTop: 12 }}>
                Ammo
              </h2>
            )}
            {ammoLots.map((l) => {
              const load = resolveLoadSpec(l.spec);
              const active = l.id === activeLotId;
              const mv = formatSpeedForDisplay(load.believedMvMps, unitsPrimary);
              const rounds = l.roundsRemaining ?? 0;
              const depleted = rounds <= 0;
              return (
                <div key={l.id} style={rowStyle(active)} onClick={() => selectLot(active ? null : l.id)}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 15 }}>
                      {load.cartridgeName} — {load.grade}
                      {l.lotNumber && <span style={{ opacity: 0.7 }}> · {l.lotNumber}</span>}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {load.product} · box {mv.value.toFixed(0)} {mv.label}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 13, color: depleted ? '#e88' : FG, opacity: depleted ? 1 : 0.85 }}>
                      {rounds} rds
                    </span>
                    <span style={{ fontSize: 13, opacity: active ? 1 : 0.4 }}>{active ? '✓ active' : 'select'}</span>
                    <button
                      style={deleteBtnStyle}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (window.confirm(`Delete this ${load.cartridgeName} ${load.grade} lot? Its lot characteristics are lost permanently.`)) {
                          deleteLot(l.id);
                        }
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
