// Store — acquire rifles + ammo (task 2.2c, D3). MINIMAL HOLDING VERSION
// (rifle-ammo-store S4 step 7): the real two-step build screen (cartridge list
// → sliders → Acquire, D17) is S9. This version exists only so the app keeps
// compiling and stays usable between S4 and S9 — every cartridge gets a single
// "default build" rifle row (reference barrel, first twist option) and every
// authored preset (game/spec.ts's PRESETS) gets an ammo row. No sliders, no
// derived readouts yet.
//
// Shows BELIEVED values only (guardrail §4.8 / catalog §0: no hidden truth in
// player-facing UI), via the units service (guardrail §4.4).
import { useGameStore } from '../state/store';
import { resolveLoadSpec, resolveRifleSpec } from '../game/catalog';
import { CARTRIDGE_IDS_V2, PRESETS, cartridgeParams, specFromPreset, type RifleSpec } from '../game/spec';
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

/** The default (reference-barrel, first-twist-option) build for a cartridge —
 *  the holding screen's stand-in for S9's rifle sliders. */
function defaultRifleSpec(cartridgeId: string): RifleSpec {
  const c = cartridgeParams(cartridgeId);
  return { cartridgeId, barrelLengthIn: c.referenceBarrelIn, twistIn: c.twistOptionsInPerTurn[0] };
}

export function StoreScreen({ onClose }: { onClose: () => void }) {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const rifles = useGameStore((s) => s.inventory.rifles);
  const ammoLots = useGameStore((s) => s.inventory.ammoLots);
  const acquireRifle = useGameStore((s) => s.acquireRifle);
  const acquireLot = useGameStore((s) => s.acquireLot);

  // Re-keyed off cartridgeId (rifles) / presetId (lots) — S4 step 7: the old
  // catalogId counters have no equivalent under specs.
  const ownedRifles = (cartridgeId: string) => rifles.filter((r) => r.spec.cartridgeId === cartridgeId).length;
  const ownedLots = (presetId: string) => ammoLots.filter((l) => l.spec.presetId === presetId).length;

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
          Holding view — sliders + live readouts land in a later pass. Rifles acquire at
          their reference-barrel default build; ammo acquires from a named preset.
        </div>

        <h2 style={{ fontSize: 16, opacity: 0.8, margin: '8px 0' }}>Rifles</h2>
        {CARTRIDGE_IDS_V2.map((cartridgeId) => {
          const spec = defaultRifleSpec(cartridgeId);
          const m = resolveRifleSpec(spec);
          const owned = ownedRifles(cartridgeId);
          return (
            <div
              key={cartridgeId}
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
                  {m.cartridgeName}
                  {owned > 0 && <span style={{ opacity: 0.6 }}> · owned ×{owned}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {m.className} · {m.barrelLengthIn}" · 1:{m.twistIn}
                </div>
              </div>
              <button style={acquireBtnStyle} onClick={() => acquireRifle(spec)}>
                Acquire
              </button>
            </div>
          );
        })}

        <h2 style={{ fontSize: 16, opacity: 0.8, margin: '20px 0 8px' }}>Ammo</h2>
        {PRESETS.map((p) => {
          const load = resolveLoadSpec(specFromPreset(p.id));
          const owned = ownedLots(p.id);
          const mv = formatSpeedForDisplay(load.believedMvMps, unitsPrimary);
          return (
            <div
              key={p.id}
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
                  {load.cartridgeName} — {load.grade}
                  {owned > 0 && <span style={{ opacity: 0.6 }}> · owned ×{owned}</span>}
                </div>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                  {load.product} · box {mv.value.toFixed(0)} {mv.label} · BC {load.believedBc.toFixed(3)}{' '}
                  {load.dragModel}
                </div>
              </div>
              <button style={acquireBtnStyle} onClick={() => acquireLot(specFromPreset(p.id))}>
                Acquire
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
