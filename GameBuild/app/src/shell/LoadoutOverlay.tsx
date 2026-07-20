// Loadout — in-range gear selection (task 2.2c, D3). A non-destructive overlay
// (same pattern as the Settings overlay: rendered OVER the still-mounted
// ScopeView, so selecting does NOT reset the engagement — budget/score/committed
// target survive). Lists the rifles + ammo the player OWNS and sets the active
// rifle/lot. Believed values only (no hidden truth).
//
// 2.2 scope (D2): the active selection is inert on the live solve — it drives the
// solve from 2.3. Here it just records the choice (persisted via the 2.2b glue).
import { useGameStore } from '../state/store';
import { getAmmoLoad, getRifleModel } from '../game/catalog';
import { formatSpeedForDisplay } from '../units/display';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';

function rowStyle(active: boolean): React.CSSProperties {
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

const deleteBtnStyle: React.CSSProperties = {
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

export function LoadoutOverlay({ onClose }: { onClose: () => void }) {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const { rifles, ammoLots, activeRifleId, activeLotId } = useGameStore((s) => s.inventory);
  const selectRifle = useGameStore((s) => s.selectRifle);
  const selectLot = useGameStore((s) => s.selectLot);
  const deleteRifle = useGameStore((s) => s.deleteRifle);
  const deleteLot = useGameStore((s) => s.deleteLot);

  const empty = rifles.length === 0 && ammoLots.length === 0;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50,
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
      <div style={{ width: '100%', maxWidth: 460 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Loadout</h1>
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

        {empty && (
          <p style={{ opacity: 0.7, fontSize: 14 }}>
            No gear yet — acquire rifles and ammo from the Store on the range-select screen.
          </p>
        )}

        {rifles.length > 0 && <h2 style={{ fontSize: 16, opacity: 0.8, margin: '12px 0 0', borderTop: DIVIDER, paddingTop: 12 }}>Rifle</h2>}
        {rifles.map((r) => {
          const model = getRifleModel(r.catalogId);
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

        {ammoLots.length > 0 && <h2 style={{ fontSize: 16, opacity: 0.8, margin: '16px 0 0', borderTop: DIVIDER, paddingTop: 12 }}>Ammo</h2>}
        {ammoLots.map((l) => {
          const load = getAmmoLoad(l.catalogId);
          const active = l.id === activeLotId;
          const mv = formatSpeedForDisplay(load.believedMvMps, unitsPrimary);
          return (
            <div key={l.id} style={rowStyle(active)} onClick={() => selectLot(active ? null : l.id)}>
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15 }}>
                  {load.cartridgeName} — {load.grade}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {load.product} · box {mv.value.toFixed(0)} {mv.label}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
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
      </div>
    </div>
  );
}
