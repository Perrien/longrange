// Settings screen (task 2.1d, Increment 2 — owner request). A full-screen overlay
// reachable from the scope's gear-icon button and from the range-select screen's
// Settings button. It is the home for the durable player settings: units, aim
// sensitivity, bullet trace, wind realism, wind-marker style, and the mirage
// strength preset. Reading/writing goes straight through the existing Zustand
// setters — no new store state.
//
// Persistence: units / sensitivity / trace / marker-style ride the schema-v2
// save (task 2.1a D5), so those stick across launches; wind realism also
// persists (additive-optional since 1.7a); mirage strength now persists too
// (additive-optional since the W6 close-out, owner decision 2026-07-31 —
// defaults to Medium and survives a relaunch, superseding D9's "store-only").
//
// Rendered as an overlay OVER whatever is underneath (the still-mounted ScopeView
// in the scope view, the range-select screen otherwise), so opening settings
// mid-engagement doesn't tear down/rebuild the 3D scene or lose the committed
// target / dialed solution. Dismissed only via the Done button (owner 2026-07-27);
// "Return to range select" moved to the scope's Home button.
//
// Guardrail §4.4: no inline unit math here — these are plain preference toggles
// (unitsPrimary just flips which system every readout elsewhere uses); MIL and
// MOA are both labelled where the units choice is shown.
import { useGameStore, type MarkerStyle, type MirageStrength } from '../state/store';
import type { ReactNode } from 'react';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';

/** A labelled settings row: title on the left, control(s) on the right.
 *  `children` is optional so a row can be pure text — a reference note with
 *  nothing to set (see "Desktop trigger"). */
function Row({ label, hint, children }: { label: string; hint?: string; children?: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        padding: '14px 0',
        borderTop: DIVIDER,
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 16 }}>{label}</div>
        {hint && <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>{children}</div>
    </div>
  );
}

/** A segmented option button (active = solid, inactive = dim). */
function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'monospace',
        fontSize: 15,
        color: active ? '#fff' : FG,
        background: active ? 'rgba(40,110,170,0.9)' : 'rgba(232,238,244,0.08)',
        border: active ? '1px solid #e8eef4' : '1px solid rgba(232,238,244,0.3)',
        borderRadius: 6,
        padding: '8px 14px',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  );
}

export function SettingsScreen({ onClose }: { onClose: () => void }) {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const setUnitsPrimary = useGameStore((s) => s.setUnitsPrimary);
  const sensitivity = useGameStore((s) => s.settings.sensitivity);
  const setSensitivity = useGameStore((s) => s.setSensitivity);
  const traceEnabled = useGameStore((s) => s.settings.traceEnabled);
  const setTraceEnabled = useGameStore((s) => s.setTraceEnabled);
  const windRealism = useGameStore((s) => s.settings.windRealism);
  const setWindRealism = useGameStore((s) => s.setWindRealism);
  const windMarkerStyle = useGameStore((s) => s.settings.windMarkerStyle);
  const setWindMarkerStyle = useGameStore((s) => s.setWindMarkerStyle);
  const mirageStrength = useGameStore((s) => s.settings.mirageStrength);
  const setMirageStrength = useGameStore((s) => s.setMirageStrength);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 50, // above the scope glass + its Menu button
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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>Settings</h1>
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

        <Row label="Units" hint="Which system every readout uses">
          <Seg active={unitsPrimary === 'MIL'} onClick={() => setUnitsPrimary('MIL')}>
            MIL · Metric
          </Seg>
          <Seg active={unitsPrimary === 'MOA'} onClick={() => setUnitsPrimary('MOA')}>
            MOA · Imperial
          </Seg>
        </Row>

        <Row label="Aim sensitivity" hint={`Drag-to-aim gain · ×${sensitivity.toFixed(2)}`}>
          <input
            type="range"
            min={0.3}
            max={3}
            step={0.05}
            value={sensitivity}
            onChange={(e) => setSensitivity(Number(e.target.value))}
            style={{ width: 180 }}
          />
        </Row>

        {/* Reference, not a control (mouse-release-fire): nothing here to switch
            off, because holding the key IS the safety. Listed so the key is
            discoverable — on touch there is no keyboard, so the row simply never
            applies. */}
        <Row
          label="Desktop trigger"
          hint="Hold F and release the left mouse button to fire. The FIRE button still works."
        />

        <Row label="Bullet trace" hint="Show the in-scope tracer on each shot">
          <Seg active={traceEnabled} onClick={() => setTraceEnabled(true)}>
            On
          </Seg>
          <Seg active={!traceEnabled} onClick={() => setTraceEnabled(false)}>
            Off
          </Seg>
        </Row>

        <Row label="Wind realism" hint="Steady mean vs. an evolving gusty field">
          <Seg active={windRealism === 'steady'} onClick={() => setWindRealism('steady')}>
            Steady
          </Seg>
          <Seg active={windRealism === 'realistic'} onClick={() => setWindRealism('realistic')}>
            Realistic
          </Seg>
        </Row>

        <Row label="Wind markers" hint="Downrange wind indicators">
          {(['flag', 'sock', 'both'] as MarkerStyle[]).map((style) => (
            <Seg key={style} active={windMarkerStyle === style} onClick={() => setWindMarkerStyle(style)}>
              {style}
            </Seg>
          ))}
        </Row>

        <Row label="Mirage" hint="Heat-shimmer strength">
          {(['off', 'light', 'medium', 'heavy'] as MirageStrength[]).map((strength) => (
            <Seg key={strength} active={mirageStrength === strength} onClick={() => setMirageStrength(strength)}>
              {strength === 'off' ? 'Off' : strength[0].toUpperCase() + strength.slice(1)}
            </Seg>
          ))}
        </Row>
      </div>
    </div>
  );
}
