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
import { useEffect, useState, type CSSProperties } from 'react';
import { useGameStore } from '../state/store';
import { CARTRIDGE_IDS_V2, cartridgeParams, defaultLoadSpec, defaultRifleSpec } from '../game/spec';
import { effectiveMvForLot, resolveLoadSpec, resolveRifleSpec } from '../game/catalog';
import { cartridgeOverviewWords } from '../game/store-overview';
import { effectiveRangeYdForSpec } from '../engine-bridge/effective-range';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule } from '../engine-bridge/types';
import { formatDistanceForDisplay, formatMuzzleVelocityForDisplay } from '../units/display';
import { yardsToMeters } from '../units/length';
import { BuildScreen } from './BuildScreen';
import { TabButton } from './TabButton';

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const GREEN = '#4ade80';
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

// Same neutral look as DopeBookScreen's `smallBtn` — kept as its own constant
// here since GearScreen's rows run a bit larger (12/13px) than that screen's
// compact lot cards.
const replenishBtnStyle: CSSProperties = {
  fontFamily: 'monospace',
  fontSize: 12,
  color: FG,
  background: 'rgba(232,238,244,0.1)',
  border: '1px solid rgba(232,238,244,0.35)',
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
  // Which lot's carry-forward disclosure (Replenish) is open — at most one at
  // a time, same pattern as DopeBookScreen's RifleAmmoOverview.
  const [replenishFor, setReplenishFor] = useState<string | null>(null);

  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const { rifles, ammoLots, activeRifleId, activeLotId } = useGameStore((s) => s.inventory);
  const selectRifle = useGameStore((s) => s.selectRifle);
  const selectLot = useGameStore((s) => s.selectLot);
  const deleteRifle = useGameStore((s) => s.deleteRifle);
  const deleteLot = useGameStore((s) => s.deleteLot);
  const replenishLot = useGameStore((s) => s.replenishLot);

  // The Store list's effective-range figure needs the WASM engine (the same
  // physics solve BuildScreen's readouts and the DOPE book use) — everything
  // else in the list (name, class, weight/velocity/power words) is sync and
  // renders immediately; this one field pops in a beat later.
  const [module, setModule] = useState<BtkModule | null>(null);
  useEffect(() => {
    let cancelled = false;
    loadBtkModule().then((m) => !cancelled && setModule(m));
    return () => {
      cancelled = true;
    };
  }, []);

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

  // Rifles only (owner 2026-08-02) — a cartridge's ammo lots aren't "gear you
  // own" in the sense this badge is meant to convey; it's specifically "you
  // have a rifle for this".
  const ownedCount = (cartridgeId: string) => rifles.filter((r) => r.spec.cartridgeId === cartridgeId).length;

  // Upper bound only (owner call, 2026-08-02) — the last station the DEFAULT
  // build for this cartridge stays supersonic at ICAO sea level, same solve
  // DopeBookScreen uses. There's no lower-bound concept anywhere in the
  // engine (a minimum practical range isn't a physics quantity), so this is
  // deliberately one-sided: it's already short for .22 LR and long for .50
  // BMG on its own, without inventing a floor.
  const effectiveRangeYd = (cartridgeId: string): number | null => {
    if (!module) return null;
    return effectiveRangeYdForSpec(module, defaultRifleSpec(cartridgeId), defaultLoadSpec(cartridgeId));
  };

  const effectiveRangeText = (cartridgeId: string): string | null => {
    const yd = effectiveRangeYd(cartridgeId);
    if (yd == null) return null;
    const fmt = formatDistanceForDisplay(yardsToMeters(yd), unitsPrimary);
    return `effective to ~${fmt.value.toFixed(0)} ${fmt.label}`;
  };

  // Sorted low → high by effective range once the engine's loaded (owner
  // 2026-08-02); until then, the catalog's own authored order — it re-sorts
  // in place the moment `module` lands, same one-time pop-in as the range
  // figure itself.
  const sortedCartridgeIds = module
    ? [...CARTRIDGE_IDS_V2].sort((a, b) => (effectiveRangeYd(a) ?? 0) - (effectiveRangeYd(b) ?? 0))
    : CARTRIDGE_IDS_V2;

  const emptyInventory = rifles.length === 0 && ammoLots.length === 0;

  // Loadout tab (owner 2026-08-02): ammo is scoped to the ACTIVE rifle's
  // cartridge — you can't pair a .223 rifle with 6.5 CM ammo, because the
  // list of selectable lots never offers the mismatch in the first place
  // (selectRifle's own cross-clear in state/store.ts backs this up if a
  // stale mismatched pair ever existed).
  const activeRifle = rifles.find((r) => r.id === activeRifleId) ?? null;
  const compatibleLots = activeRifle
    ? ammoLots.filter((l) => l.spec.cartridgeId === activeRifle.spec.cartridgeId)
    : [];

  const zeroText = (zeroed: boolean, zeroRangeM: number | undefined): string => {
    if (!zeroed) return '⚠ not zeroed';
    const fmt = formatDistanceForDisplay(zeroRangeM ?? 0, unitsPrimary);
    return `zeroed @ ${fmt.value.toFixed(0)} ${fmt.label}`;
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

            {sortedCartridgeIds.map((cartridgeId) => {
              const c = cartridgeParams(cartridgeId);
              const owned = ownedCount(cartridgeId);
              const overview = cartridgeOverviewWords(cartridgeId);
              const rangeText = effectiveRangeText(cartridgeId);
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
                      {owned > 0 && (
                        <span style={{ color: GREEN, fontWeight: 700 }}> · owned ×{owned}</span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {c.class}
                      {c.presetsOnly && ' · presets only'}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {overview.weight} · {overview.velocity}
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                      {rangeText ?? 'solving effective range…'}
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
              const zeroed = !!r.playerZero;
              return (
                <div key={r.id} style={rowStyle(active)} onClick={() => selectRifle(active ? null : r.id)}>
                  <div style={{ textAlign: 'left' }}>
                    <div style={{ fontSize: 15 }}>{model.name}</div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>{model.className}</div>
                    <div style={{ fontSize: 12, marginTop: 2, opacity: zeroed ? 0.6 : 0.9, color: zeroed ? undefined : '#e8c95a' }}>
                      {zeroText(zeroed, r.playerZero?.zeroRangeM)}
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <button
                      style={deleteBtnStyle}
                      aria-label="Delete"
                      title="Delete"
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
                      🗑
                    </button>
                  </div>
                </div>
              );
            })}

            {activeRifle && compatibleLots.length > 0 && (
              <h2 style={{ fontSize: 16, opacity: 0.8, margin: '16px 0 0', borderTop: DIVIDER, paddingTop: 12 }}>
                Ammo
              </h2>
            )}
            {activeRifle && compatibleLots.length === 0 && (
              <p style={{ opacity: 0.6, fontSize: 13, marginTop: 16, borderTop: DIVIDER, paddingTop: 12 }}>
                No {cartridgeParams(activeRifle.spec.cartridgeId).name} ammo yet — acquire some from the Store
                tab.
              </p>
            )}
            {!activeRifle && rifles.length > 0 && (
              <p style={{ opacity: 0.6, fontSize: 13, marginTop: 16, borderTop: DIVIDER, paddingTop: 12 }}>
                Select a rifle above to see its ammo.
              </p>
            )}
            {compatibleLots.map((l) => {
              const load = resolveLoadSpec(l.spec);
              const active = l.id === activeLotId;
              const mv = effectiveMvForLot(l, load);
              const mvFmt = formatMuzzleVelocityForDisplay(mv.mps, unitsPrimary);
              const rounds = l.roundsRemaining ?? 0;
              const depleted = rounds <= 0;
              // Replenish (P4): a new lot of the same ammo. A lot with a
              // chrono/trued MV or BC gets a choice — carry those numbers
              // forward as provisional on the new (physically different) lot,
              // or start it as a plain box lot; nothing discovered means
              // there's nothing to ask, so it just replenishes fresh.
              const hasDiscovered = !!(l.effective && (l.effective.mvMps != null || l.effective.bc != null));
              return (
                <div key={l.id}>
                  <div style={rowStyle(active)} onClick={() => selectLot(active ? null : l.id)}>
                    <div style={{ textAlign: 'left' }}>
                      <div style={{ fontSize: 15 }}>
                        {load.cartridgeName} — {load.grade}
                        {l.lotNumber && <span style={{ opacity: 0.7 }}> · {l.lotNumber}</span>}
                      </div>
                      <div style={{ fontSize: 12, opacity: 0.6, marginTop: 2 }}>
                        {load.weightGr} gr · {mvFmt.value.toFixed(0)} {mvFmt.label} ({mv.source}) ·{' '}
                        <span style={{ color: depleted ? '#e88' : undefined }}>{rounds} rds</span>
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <button
                        style={replenishBtnStyle}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (hasDiscovered) {
                            setReplenishFor(replenishFor === l.id ? null : l.id);
                          } else {
                            replenishLot(l.id, false);
                          }
                        }}
                      >
                        Replenish
                      </button>
                      <button
                        style={deleteBtnStyle}
                        aria-label="Delete"
                        title="Delete"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (window.confirm(`Delete this ${load.cartridgeName} ${load.grade} lot? Its lot characteristics are lost permanently.`)) {
                            deleteLot(l.id);
                          }
                        }}
                      >
                        🗑
                      </button>
                    </div>
                  </div>
                  {replenishFor === l.id && (
                    <div
                      style={{
                        display: 'flex',
                        gap: 6,
                        alignItems: 'center',
                        flexWrap: 'wrap',
                        padding: '6px 12px 0',
                      }}
                    >
                      <span style={{ fontSize: 11, opacity: 0.7 }}>Carry this lot's discovered MV/BC forward?</span>
                      <button
                        style={replenishBtnStyle}
                        onClick={() => {
                          replenishLot(l.id, true);
                          setReplenishFor(null);
                        }}
                      >
                        Carry (provisional)
                      </button>
                      <button
                        style={replenishBtnStyle}
                        onClick={() => {
                          replenishLot(l.id, false);
                          setReplenishFor(null);
                        }}
                      >
                        Fresh (box)
                      </button>
                      <button style={replenishBtnStyle} onClick={() => setReplenishFor(null)}>
                        Cancel
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
}
