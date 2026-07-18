// Store — acquire rifles + ammo (task 2.2c, D3). The pre-range acquisition
// surface, reachable from the range-select landing. Shows BELIEVED box values
// only (guardrail §4.8 / catalog §0: no hidden truth in player-facing UI) — MV
// via the units service, BC + display attrs as authored. Everything is freely
// acquirable in 2.2 (D4); acquiring the same model twice creates two instances.
//
// Guardrail §4.4: MV goes through `formatSpeedForDisplay`; no inline unit math.
// The imperial display attrs (barrel in, weight lb) are shown as authored (no
// conversion), flavour for the Store.
import { useGameStore } from '../state/store';
import { AMMO_LOADS, RIFLE_MODELS } from '../game/catalog';
import { formatSpeedForDisplay } from '../units/display';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';

const acquireBtnStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 14,
  color: '#fff',
  background: 'rgba(40,110,170,0.9)',
  border: '1px solid #e8eef4',
  borderRadius: 6,
  padding: '8px 14px',
  cursor: 'pointer',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  flexShrink: 0,
};

export function StoreScreen({ onClose }: { onClose: () => void }) {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const rifles = useGameStore((s) => s.inventory.rifles);
  const ammoLots = useGameStore((s) => s.inventory.ammoLots);
  const acquireRifle = useGameStore((s) => s.acquireRifle);
  const acquireLot = useGameStore((s) => s.acquireLot);

  const ownedRifles = (catalogId: string) => rifles.filter((r) => r.catalogId === catalogId).length;
  const ownedLots = (catalogId: string) => ammoLots.filter((l) => l.catalogId === catalogId).length;

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

        <h2 style={{ fontSize: 16, opacity: 0.8, margin: '8px 0' }}>Rifles</h2>
        {RIFLE_MODELS.map((m) => {
          const owned = ownedRifles(m.catalogId);
          return (
            <div
              key={m.catalogId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: DIVIDER,
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15 }}>
                  {m.name}
                  {owned > 0 && <span style={{ opacity: 0.6 }}> · owned ×{owned}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {m.className} · {m.barrelLengthIn}" · {m.twist} · {m.weightLb} lb
                </div>
              </div>
              <button style={acquireBtnStyle} onClick={() => acquireRifle(m.catalogId)}>
                Acquire
              </button>
            </div>
          );
        })}

        <h2 style={{ fontSize: 16, opacity: 0.8, margin: '20px 0 8px' }}>Ammo</h2>
        {AMMO_LOADS.map((a) => {
          const owned = ownedLots(a.catalogId);
          const mv = formatSpeedForDisplay(a.believedMvMps, unitsPrimary);
          return (
            <div
              key={a.catalogId}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 12,
                padding: '10px 0',
                borderTop: DIVIDER,
              }}
            >
              <div style={{ textAlign: 'left' }}>
                <div style={{ fontSize: 15 }}>
                  {a.cartridgeName} — {a.grade}
                  {owned > 0 && <span style={{ opacity: 0.6 }}> · owned ×{owned}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {a.product} · box {mv.value.toFixed(0)} {mv.label} · BC {a.believedBc.toFixed(3)}{' '}
                  {a.dragModel}
                </div>
              </div>
              <button style={acquireBtnStyle} onClick={() => acquireLot(a.catalogId)}>
                Acquire
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
