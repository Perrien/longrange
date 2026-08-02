// Build screen (rifle-ammo-store S9, D17) — the second step of the Store: a
// single cartridge's rifle build (barrel + twist) and ammo build (weight +
// profile/i7 + grade), two stacked sections, live derived readouts, preset
// chips that snap the ammo sliders. Acquire is per-section (Rifle/Ammo are
// independently owned inventory records — `acquireRifle`/`acquireLot` always
// were separate store actions, unchanged by this rewrite).
//
// Readouts are assembled by the pure `game/store-readouts.ts` (S9's own
// Done-when: "a component test on the pure readout-assembly function is
// enough — do not test the canvas") — this file is display + slider wiring
// only. Believed values only (guardrail §4.8): every number shown ultimately
// comes from `resolveRifleSpec`/`resolveLoadSpec`/`believedLoadForBuild`, never
// the truth-facing `rifleRangesForSpec`/`lotRangesForSpec`/`trueBaseMvForSpec`.
//
// Every displayed number goes through the units service (guardrail §4.4).
import { useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { useGameStore } from '../state/store';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule } from '../engine-bridge/types';
import { ammoReadouts, rifleReadouts, SG_MARGINAL_BELOW } from '../game/store-readouts';
import {
  cartridgeParams,
  clampLoadSpec,
  clampRifleSpec,
  defaultLoadSpec,
  defaultRifleSpec,
  presetsForCartridge,
  specFromPreset,
  type AmmoGrade,
  type LoadSpec,
  type RifleSpec,
} from '../game/spec';
import {
  fpsToMps,
  formatAngleForDisplay,
  formatDistanceForDisplay,
  formatMuzzleVelocityForDisplay,
  formatOffsetForDisplay,
  inchesToMeters,
  moaToRad,
  yardsToMeters,
} from '../units';
import { TabButton } from './TabButton';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';
const AMBER = '#e8c95a';

const btnStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 15,
  color: FG,
  background: 'rgba(232,238,244,0.1)',
  border: '1px solid rgba(232,238,244,0.4)',
  borderRadius: 6,
  padding: '8px 16px',
  cursor: 'pointer',
};

const acquireBtnStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 15,
  color: '#fff',
  background: 'rgba(40,110,170,0.9)',
  border: '1px solid #e8eef4',
  borderRadius: 6,
  padding: '10px 18px',
  cursor: 'pointer',
  WebkitUserSelect: 'none',
  userSelect: 'none',
  width: '100%',
  marginTop: 12,
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 4 }}>{title}</div>
      {children}
    </div>
  );
}

/** A labelled row: title/hint on the left, value/control on the right — same
 *  visual language as SettingsScreen's Row. */
function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: 16,
        padding: '10px 0',
        borderTop: DIVIDER,
      }}
    >
      <div style={{ textAlign: 'left' }}>
        <div style={{ fontSize: 14 }}>{label}</div>
        {hint && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{hint}</div>}
      </div>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0, textAlign: 'right' }}>
        {children}
      </div>
    </div>
  );
}

function Seg({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'monospace',
        fontSize: 13,
        color: active ? '#fff' : FG,
        background: active ? 'rgba(40,110,170,0.9)' : 'rgba(232,238,244,0.08)',
        border: active ? '1px solid #e8eef4' : '1px solid rgba(232,238,244,0.3)',
        borderRadius: 6,
        padding: '6px 10px',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  );
}

/** A slider row: label/hint on the left, the live value + a range input,
 *  stacked, on the right. One-thumbed at iPad width (step 6). */
function SliderRow({
  label,
  hint,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div style={{ padding: '10px 0', borderTop: DIVIDER }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 6 }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: 14 }}>{label}</div>
          {hint && <div style={{ fontSize: 11, opacity: 0.6, marginTop: 2 }}>{hint}</div>}
        </div>
        <div style={{ fontSize: 14, fontWeight: 700 }}>{display}</div>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: '100%' }}
      />
    </div>
  );
}

export function BuildScreen({
  cartridgeId,
  onBack,
  onClose,
}: {
  cartridgeId: string;
  onBack: () => void;
  onClose: () => void;
}) {
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const acquireRifle = useGameStore((s) => s.acquireRifle);
  const acquireLot = useGameStore((s) => s.acquireLot);
  const rifles = useGameStore((s) => s.inventory.rifles);
  const ammoLots = useGameStore((s) => s.inventory.ammoLots);

  const [module, setModule] = useState<BtkModule | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBtkModule().then((m) => !cancelled && setModule(m));
    return () => {
      cancelled = true;
    };
  }, []);

  const c = cartridgeParams(cartridgeId);
  const rimfire = c.presetsOnly;
  const [tab, setTab] = useState<'rifle' | 'ammo'>('rifle');
  const [rifleSpec, setRifleSpec] = useState<RifleSpec>(() => defaultRifleSpec(cartridgeId));
  const [loadSpec, setLoadSpec] = useState<LoadSpec>(() => defaultLoadSpec(cartridgeId));
  const [acquiredFlash, setAcquiredFlash] = useState<'rifle' | 'ammo' | null>(null);

  const presets = presetsForCartridge(cartridgeId);
  const ownedRifles = rifles.filter((r) => r.spec.cartridgeId === cartridgeId).length;
  const ownedLots = ammoLots.filter((l) => l.spec.cartridgeId === cartridgeId).length;

  const rReadouts = rifleReadouts(rifleSpec, loadSpec);
  const aReadouts = module ? ammoReadouts(module, rifleSpec, loadSpec) : null;

  function updateRifle(patch: Partial<RifleSpec>) {
    setRifleSpec((prev) => clampRifleSpec({ ...prev, ...patch }));
  }

  function updateLoad(patch: Partial<LoadSpec>) {
    // D17: moving any slider (or the grade toggle) clears presetId — only a
    // chip tap re-establishes it.
    setLoadSpec((prev) => clampLoadSpec({ ...prev, ...patch, presetId: undefined }));
  }

  function flash(which: 'rifle' | 'ammo') {
    setAcquiredFlash(which);
    setTimeout(() => setAcquiredFlash((cur) => (cur === which ? null : cur)), 1200);
  }

  const mv = (mps: number) => {
    const f = formatMuzzleVelocityForDisplay(mps, unitsPrimary);
    return `${f.value.toFixed(0)} ${f.label}`;
  };
  const dist = (m: number) => {
    const f = formatDistanceForDisplay(m, unitsPrimary);
    return `${f.value.toFixed(0)} ${f.label}`;
  };
  const angWithSd = (nominalRad: number, sdRad: number) => {
    const nom = formatAngleForDisplay(nominalRad, unitsPrimary);
    const sd = formatAngleForDisplay(sdRad, unitsPrimary);
    return `${nom.value.toFixed(2)} ± ${sd.value.toFixed(2)} ${nom.label}`;
  };
  const offset = (m: number) => {
    const f = formatOffsetForDisplay(m, unitsPrimary);
    return `${f.value.toFixed(1)} ${f.label}`;
  };

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
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <button onClick={onBack} style={btnStyle}>
            ‹ Cartridges
          </button>
          <button onClick={onClose} style={btnStyle}>
            Done
          </button>
        </div>

        <h1 style={{ margin: '4px 0 0', fontSize: 22, fontWeight: 700 }}>{c.name}</h1>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
          {c.class}
          {rimfire && <span> · presets only</span>}
        </div>

        <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
          <TabButton flex active={tab === 'rifle'} onClick={() => setTab('rifle')}>
            Rifle {ownedRifles > 0 && `(×${ownedRifles})`}
          </TabButton>
          <TabButton flex active={tab === 'ammo'} onClick={() => setTab('ammo')}>
            Ammo {ownedLots > 0 && `(×${ownedLots})`}
          </TabButton>
        </div>

        {tab === 'rifle' && (
          <>
            <Section title="Configure">
              <SliderRow
                label="Barrel length"
                value={rifleSpec.barrelLengthIn}
                display={`${rifleSpec.barrelLengthIn}"`}
                min={c.barrelBandIn.min}
                max={c.barrelBandIn.max}
                step={1}
                onChange={(v) => updateRifle({ barrelLengthIn: v })}
              />
              <Row label="Twist">
                <span style={{ fontSize: 11, opacity: 0.5 }}>Slower</span>
                {[...c.twistOptionsInPerTurn].sort((a, b) => b - a).map((t) => (
                  <Seg key={t} active={rifleSpec.twistIn === t} onClick={() => updateRifle({ twistIn: t })}>
                    1:{t}
                  </Seg>
                ))}
                <span style={{ fontSize: 11, opacity: 0.5 }}>Faster</span>
              </Row>
              <div style={{ fontSize: 11, opacity: 0.55, marginTop: 6, lineHeight: 1.4 }}>
                Smaller number = faster twist (1:7 out-spins 1:9). Faster twist requires heavier bullets; a
                slower twist suits lighter ones and is more forgiving — less spin drift, tighter groups.
              </div>
            </Section>

            <Section title="Readouts">
              <Row label="Derived MV" hint="at the current ammo build">
                {mv(fpsToMps(rReadouts.derivedMvFpsAtCurrentLoad))}
              </Row>
              <Row label="Barrel life">{rReadouts.barrelLifeRounds.toLocaleString()} rd</Row>
              <Row label="Precision">
                {angWithSd(moaToRad(rReadouts.precisionMoa.nominal), moaToRad(rReadouts.precisionMoa.sd))}{' '}
                <span style={{ opacity: 0.5 }}>nominal</span>
              </Row>
              <Row label="Recoil" hint="relative to 6.5 CM / 140 gr match">
                {rReadouts.recoilRelativeToReference != null ? (
                  `${rReadouts.recoilRelativeToReference.toFixed(2)}×`
                ) : (
                  <span style={{ opacity: 0.5 }}>not yet sourced</span>
                )}
              </Row>
            </Section>

            <button
              style={acquireBtnStyle}
              onClick={() => {
                acquireRifle(rifleSpec);
                flash('rifle');
              }}
            >
              {acquiredFlash === 'rifle' ? 'Acquired ✓' : 'Acquire rifle'}
            </button>
          </>
        )}

        {tab === 'ammo' && (
          <>
            {presets.length > 0 && (
              <Section title="Presets">
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {presets.map((p) => (
                    <Seg
                      key={p.id}
                      active={loadSpec.presetId === p.id}
                      onClick={() => setLoadSpec(specFromPreset(p.id))}
                    >
                      {p.name}
                    </Seg>
                  ))}
                </div>
              </Section>
            )}

            {!rimfire && (
              <Section title="Configure">
                <SliderRow
                  label="Bullet weight"
                  value={loadSpec.weightGr}
                  display={`${loadSpec.weightGr} gr`}
                  min={c.weightRangeGr!.min}
                  max={c.weightRangeGr!.max}
                  step={1}
                  onChange={(v) => updateLoad({ weightGr: v })}
                />
                <SliderRow
                  label="Profile"
                  hint="sleek ↔ blunt (i7 form factor)"
                  value={loadSpec.i7}
                  display={loadSpec.i7.toFixed(3)}
                  min={c.i7Range!.min}
                  max={c.i7Range!.max}
                  step={0.001}
                  onChange={(v) => updateLoad({ i7: v })}
                />
                <Row label="Grade">
                  {(['match', 'bulk'] as AmmoGrade[]).map((g) => (
                    <Seg key={g} active={loadSpec.grade === g} onClick={() => updateLoad({ grade: g })}>
                      {g}
                    </Seg>
                  ))}
                </Row>
              </Section>
            )}

            <Section title="Readouts">
              {!module || !aReadouts ? (
                <Row label="Loading engine…">—</Row>
              ) : (
                <>
                  {aReadouts.bc7 != null && <Row label="BC7">{aReadouts.bc7.toFixed(3)}</Row>}
                  <Row label="SD">{aReadouts.sd.toFixed(4)}</Row>
                  <Row label="Bullet length">{offset(inchesToMeters(aReadouts.bulletLengthIn))}</Row>
                  <Row label="Derived MV">{mv(fpsToMps(aReadouts.derivedMvFps))}</Row>
                  <Row label="Per-shot MV SD" hint="nominal, this grade">
                    {mv(fpsToMps(aReadouts.perShotMvSdFps))}
                  </Row>
                  <Row label="Supersonic reach">{dist(yardsToMeters(aReadouts.supersonicReachYd))}</Row>
                  <Row label="Miller Sg">
                    <span style={{ color: aReadouts.sgMarginal ? AMBER : FG }}>
                      {aReadouts.sg.toFixed(2)}
                      {aReadouts.sgMarginal && ` ⚠ marginal (< ${SG_MARGINAL_BELOW})`}
                    </span>
                  </Row>
                </>
              )}
            </Section>

            <button
              style={acquireBtnStyle}
              onClick={() => {
                acquireLot(loadSpec);
                flash('ammo');
              }}
            >
              {acquiredFlash === 'ammo' ? 'Acquired ✓' : 'Acquire ammo'}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
