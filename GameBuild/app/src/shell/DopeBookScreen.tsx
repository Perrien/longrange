// DOPE book — the full-screen, rifle-scoped reference (DOPE-first plan, P1).
//
// A tabbed overlay (SettingsScreen/StoreScreen `{ onClose }` pattern) reachable
// from the range-select landing and the scope HUD. Two pages:
//   - "Rifle & Ammo" — the rifle + ammo overview (P3; a stub placeholder here).
//   - "Come-up"      — the believed come-up table to the cartridge's effective
//                      range, the page built in P1.
//
// The come-up table is the BELIEVED solve for the active rifle+lot at its real
// zero — the exact path the in-scope DopePanel uses (gearSolveContext → solveGear
// → believedTable → formatDopeRow), so the two surfaces never drift. No hidden
// truth is read here (solveGear consumes it internally; the believedTable is what
// the player would see), so the no-leak guard is respected.
//
// Header (both tabs): status chips (not zeroed / not chronoed) + the effective
// MV/BC readout as value + source tag — `(box)` now; steps 3/5 flip those tags to
// `(chrono)`/`(trued)` by swapping the value, not the layout.

import { Fragment, useEffect, useState, type CSSProperties, type ReactNode } from 'react';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { speedOfSound, type AtmosphereInput } from '../engine-bridge';
import type { BtkModule } from '../engine-bridge/types';
import { solveGear } from '../engine-bridge/gear-solve';
import { gearSolveContext } from '../game/active-gear';
import { windToVec } from '../game/firing-solution';
import { assembleComeUp, nearestRow, type ComeUpDisplayRow } from '../game/dope-row';
import { comeUpStationsM, believedVerticalSdRad } from '../game/dope-book';
import { findChronoSummary, isBcStaleVsChrono, type ChronoSummary } from '../game/chrono';
import {
  resolveRifleSpec,
  resolveLoadSpec,
  isRimfireCartridge,
  catalogEffectiveRangeYd,
  rifleRangesForSpec,
  lotRangesForSpec,
  type RifleModelForSpec,
} from '../game/catalog';
import { SIGHT_HEIGHT_M } from '../game/loads';
import { mpsToFps, asMilMoa, subtensionMmInch, yardsToMeters } from '../units';
import type { RifleInstance, AmmoLot } from '../persistence';
import { useGameStore } from '../state/store';

// Same ISA atmosphere the scope + DopePanel solve against.
const ISA_ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

const PANEL_BG = '#1a222c';
const FG = '#e8eef4';
const DIVIDER = '1px solid rgba(232,238,244,0.18)';
// Transonic band → velocity-cell colour (page 2). Supersonic reads normal; the
// transonic zone is flagged amber; subsonic gets the strongest (red) mark.
const BAND_COLOR = { supersonic: FG, transonic: '#e8c95a', subsonic: '#e88' } as const;
const BAND_TAG = { supersonic: '', transonic: ' trans', subsonic: ' sub' } as const;

type Tab = 'overview' | 'comeup';

const fmt = (n: number, digits: number) => n.toFixed(digits);

export function DopeBookScreen({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('comeup'); // the built page (overview is a P3 stub)
  const inventory = useGameStore((s) => s.inventory);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const wind = useGameStore((s) => s.session.wind);
  const currentTarget = useGameStore((s) => s.session.currentTarget);
  const chronoSummaries = useGameStore((s) => s.chrono.summaries);

  const [module, setModule] = useState<BtkModule | null>(null);
  const [rows, setRows] = useState<ComeUpDisplayRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const rifle = inventory.rifles.find((r) => r.id === inventory.activeRifleId);
  const lot = inventory.ammoLots.find((l) => l.id === inventory.activeLotId);
  const rifleModel = rifle ? resolveRifleSpec(rifle.spec) : null;
  const ammoLoad = lot ? resolveLoadSpec(lot.spec) : null;
  const chrono =
    rifle && lot ? findChronoSummary(chronoSummaries, rifle.id, lot.id) : undefined;

  const isMetric = unitsPrimary === 'MIL';

  // Load the engine (cached singleton — reuses whatever already instantiated it).
  useEffect(() => {
    let cancelled = false;
    loadBtkModule().then(
      (m) => !cancelled && setModule(m),
      (e: unknown) => !cancelled && setError(String(e)),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Believed come-up for the active cartridge. The reference table runs PAST
  // effective range to the transonic→subsonic wall (owner 2026-07-27) so the
  // transonic warning is actually reachable — `comeUpStationsM` over-generates to
  // 2× effective range, one solve lands on the stations, `assembleComeUp` trims at
  // the first subsonic row. Re-solves on gear / wind / unit change.
  useEffect(() => {
    if (!module || !rifle || !lot || !rifleModel) return;
    try {
      const ctx = gearSolveContext(rifle, lot, unitsPrimary);
      const effRangeYd = catalogEffectiveRangeYd(rifleModel.cartridgeId);
      const stations = comeUpStationsM(
        isRimfireCartridge(rifleModel.cartridgeId),
        unitsPrimary,
        effRangeYd,
        effRangeYd * 2,
      );
      if (stations.length === 0) {
        setRows([]);
        return;
      }
      const windVec = windToVec(wind.speedMps, wind.directionDeg);
      const table = solveGear(module, {
        rifle: ctx.rifle,
        lot: ctx.lot,
        rifleRanges: ctx.rifleRanges,
        lotRanges: ctx.lotRanges,
        atmosphere: ISA_ATMOSPHERE,
        wind: windVec,
        zeroRangeM: ctx.zeroRangeM,
        maxRangeM: stations[stations.length - 1].stationM,
        stepM: stations[0].stationM,
        sightHeightM: SIGHT_HEIGHT_M,
      }).believedTable;
      const aMps = speedOfSound(module, ISA_ATMOSPHERE);
      setRows(assembleComeUp(table, stations, { speedOfSoundMps: aMps }));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [module, rifle, lot, rifleModel, inventory, unitsPrimary, wind.speedMps, wind.directionDeg]);

  // Effective MV/BC readout: value + source tag (P1 shows box; chrono avg already
  // supersedes MV where present — that IS step-3's discovered MV, surfaced early).
  // Effective MV/BC readout: read the lot's `effective` slot (the single source the
  // come-up solve also reads), falling back to box. Chrono writes effective MV, so
  // header and table can't diverge; Replenish (provisional) and BC-truing land here too.
  const eff = lot?.effective;
  const mv =
    eff?.mvMps != null
      ? { mps: eff.mvMps, source: eff.mvSource }
      : ammoLoad
        ? { mps: ammoLoad.believedMvMps, source: 'box' as const }
        : null;
  const bc =
    eff?.bc != null
      ? { value: eff.bc, model: ammoLoad?.dragModel ?? 'G7', source: eff.bcSource }
      : ammoLoad
        ? { value: ammoLoad.believedBc, model: ammoLoad.dragModel, source: 'box' as const }
        : null;

  const zeroDistM = rifle?.playerZero?.zeroRangeM;
  const notZeroed = !rifle?.playerZero;
  const notChronoed = !chrono;
  // D15's named re-true loop (bc-truing-plan T4): the BC was fitted before the
  // most recent chrono, so the card and the asserted hold have quietly drifted
  // apart. Purely informational — nothing is invalidated or recomputed.
  const staleBc = isBcStaleVsChrono(lot?.effective?.bcSetAt, chrono);

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
      <div style={{ width: '100%', maxWidth: 560 }}>
        {/* Title + Done */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <h1 style={{ margin: 0, fontSize: 24, fontWeight: 700, letterSpacing: 1 }}>DOPE Book</h1>
          <button onClick={onClose} style={btnStyle}>
            Done
          </button>
        </div>

        {!rifle || !lot || !rifleModel || !ammoLoad ? (
          <div style={{ opacity: 0.7, padding: '24px 0' }}>
            No rifle + ammo selected — pick your gear in Loadout (or acquire it in the Store).
          </div>
        ) : (
          <>
            {/* Rifle + lot identity */}
            <div style={{ fontSize: 15, marginBottom: 2 }}>{rifleModel.name}</div>
            <div style={{ fontSize: 13, opacity: 0.7, marginBottom: 8 }}>
              {ammoLoad.product} · {ammoLoad.cartridgeName}
            </div>

            {/* Status chips + effective MV/BC (value + source tag) */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
              <Chip warn={notZeroed}>
                {notZeroed
                  ? '⚠ not zeroed'
                  : `zeroed @ ${fmt(isMetric ? (zeroDistM ?? 0) : (zeroDistM ?? 0) / 0.9144, 0)} ${isMetric ? 'm' : 'yd'}`}
              </Chip>
              <Chip warn={notChronoed}>{notChronoed ? '⚠ not chronoed' : `chrono ${chrono!.shots} shots`}</Chip>
              {mv && (
                <Chip>
                  MV {isMetric ? `${fmt(mv.mps, 0)} m/s` : `${fmt(mpsToFps(mv.mps), 0)} fps`}{' '}
                  <span style={{ opacity: 0.6 }}>({mv.source})</span>
                </Chip>
              )}
              {bc && (
                <Chip>
                  BC {fmt(bc.value, 3)} {bc.model} <span style={{ opacity: 0.6 }}>({bc.source})</span>
                </Chip>
              )}
              {staleBc && <Chip warn>⚠ chrono is newer than your BC — re-true at distance</Chip>}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
              <TabButton active={tab === 'overview'} onClick={() => setTab('overview')}>
                Rifle &amp; Ammo
              </TabButton>
              <TabButton active={tab === 'comeup'} onClick={() => setTab('comeup')}>
                Come-up
              </TabButton>
            </div>

            {error && <div style={{ color: '#e88', marginBottom: 8 }}>engine error: {error}</div>}

            {tab === 'overview' && (
              <RifleAmmoOverview
                rifle={rifle}
                rifleModel={rifleModel}
                lots={inventory.ammoLots.filter((l) => l.spec.cartridgeId === rifleModel.cartridgeId)}
                chronoSummaries={chronoSummaries}
                isMetric={isMetric}
              />
            )}

            {tab === 'comeup' && (
              <ComeUpTable rows={rows} isMetric={isMetric} loading={!module} currentTargetM={currentTarget?.distanceM} />
            )}
          </>
        )}
      </div>
    </div>
  );
}

function ComeUpTable({
  rows,
  isMetric,
  loading,
  currentTargetM,
}: {
  rows: ComeUpDisplayRow[];
  isMetric: boolean;
  loading: boolean;
  currentTargetM?: number;
}) {
  if (loading) return <div>loading…</div>;
  if (rows.length === 0) return <div style={{ opacity: 0.7 }}>no solution yet</div>;

  // Which row is closest to the committed target (highlight). Unbounded tolerance:
  // pick the nearest station even though the target rarely sits exactly on one.
  const highlightM = currentTargetM != null ? nearestRow(rows, currentTargetM, Infinity)?.rangeM : undefined;
  // First station past effective range — a divider is drawn just before it.
  const firstBeyondIdx = rows.findIndex((r) => r.beyondEffective);

  const angUnit = isMetric ? 'mil' : 'MOA';
  const th: CSSProperties = { textAlign: 'right', fontWeight: 'normal', padding: '2px 6px', opacity: 0.7 };
  const td: CSSProperties = { textAlign: 'right', padding: '2px 6px' };

  return (
    <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13 }}>
      <thead>
        <tr style={{ borderBottom: DIVIDER }}>
          {/* Reserved marker slot (empty until node confidence badges land). */}
          <th style={{ width: 14 }} />
          <th style={{ ...th, textAlign: 'left' }}>Range</th>
          <th style={th}>Elev ({angUnit})</th>
          <th style={th}>Wind ({angUnit})</th>
          <th style={th}>Vel</th>
          <th style={th}>Energy</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => {
          const range = isMetric ? r.rangeM : r.rangeYd;
          const rangeLabel = isMetric ? 'm' : 'yd';
          // Negligibility judged on the raw MIL grid (0.05 mil), matching DopePanel
          // so the two surfaces agree on "0.0" vs a visible value.
          const dropNegligible = Math.abs(r.dropMilMoa.mil) < 0.05;
          const windNegligible = Math.abs(r.windMilMoa.mil) < 0.05;
          const drop = isMetric ? r.dropMilMoa.mil : r.dropMilMoa.moa;
          const windHold = isMetric ? r.windMilMoa.mil : r.windMilMoa.moa;
          const vel = isMetric ? r.velocityMps : r.velocityFps;
          const velUnit = isMetric ? 'm/s' : 'fps';
          const energy = isMetric ? r.energyJ : r.energyFtLb;
          const energyUnit = isMetric ? 'J' : 'ft·lb';
          const band = r.transonic ?? 'supersonic';
          const highlighted = highlightM != null && r.rangeM === highlightM;
          return (
            <Fragment key={r.rangeM}>
              {i === firstBeyondIdx && (
                <tr>
                  <td colSpan={6} style={{ padding: '4px 6px', fontSize: 11, opacity: 0.6, borderTop: DIVIDER }}>
                    — beyond effective range —
                  </td>
                </tr>
              )}
              <tr
                style={{
                  background: highlighted ? 'rgba(40,110,170,0.28)' : undefined,
                  opacity: r.beyondEffective ? 0.55 : 1,
                }}
              >
                <td style={{ width: 14 }} />
                <td style={{ ...td, textAlign: 'left' }}>
                  {fmt(range, 0)} {rangeLabel}
                </td>
                <td style={td}>{dropNegligible ? '0.0' : `${drop >= 0 ? '↑' : '↓'}${fmt(Math.abs(drop), 1)}`}</td>
                <td style={td}>{windNegligible ? '—' : `${windHold >= 0 ? '→' : '←'}${fmt(Math.abs(windHold), 1)}`}</td>
                <td style={{ ...td, color: BAND_COLOR[band] }} title={`Mach ${r.machNumber?.toFixed(2) ?? '—'}`}>
                  {fmt(vel, 0)} {velUnit}
                  {BAND_TAG[band]}
                </td>
                <td style={td}>
                  {fmt(energy, 0)} {energyUnit}
                </td>
              </tr>
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );
}

/** Acquisition date for display. `0` (pre-P2 / backfilled) reads "unknown". */
function fmtDate(epochMs: number): string {
  if (!epochMs) return 'unknown';
  return new Date(epochMs).toLocaleDateString();
}

/** Analytic expected vertical spread (1σ) at the cartridge's effective range: the
 *  lot's MV spread (chrono SD if measured, else box) folded with the rifle tier's
 *  nominal inherent precision — all catalog-believed (no hidden truth). Tightens
 *  once the lot is chronographed. */
function verticalSpread(
  rifle: RifleInstance,
  rifleModel: RifleModelForSpec,
  lot: AmmoLot,
  chrono: ChronoSummary | undefined,
  isMetric: boolean,
): string {
  const effYd = catalogEffectiveRangeYd(rifleModel.cartridgeId);
  const rangeM = yardsToMeters(effYd);
  const load = resolveLoadSpec(lot.spec);
  const mv = chrono?.avgMps ?? load.believedMvMps;
  const mvSd = chrono?.sdMps ?? lotRangesForSpec(lot.spec).mvSd.nominal;
  const inherent = rifleRangesForSpec(rifle.spec).inherentPrecision.nominal;
  const sdRad = believedVerticalSdRad(rangeM, mv, mvSd, inherent);
  const ang = asMilMoa(sdRad);
  const lin = subtensionMmInch(sdRad, rangeM);
  const angStr = isMetric ? `${ang.mil.toFixed(1)} mil` : `${ang.moa.toFixed(1)} MOA`;
  const linStr = isMetric ? `${(lin.mm / 10).toFixed(0)} cm` : `${lin.inch.toFixed(0)} in`;
  const rangeStr = isMetric ? `${Math.round(rangeM)} m` : `${effYd} yd`;
  return `±${angStr} / ±${linStr} @ ${rangeStr} (${chrono ? 'chrono' : 'box'} SD)`;
}

function RifleAmmoOverview({
  rifle,
  rifleModel,
  lots,
  chronoSummaries,
  isMetric,
}: {
  rifle: RifleInstance;
  rifleModel: RifleModelForSpec;
  lots: AmmoLot[];
  chronoSummaries: ChronoSummary[];
  isMetric: boolean;
}) {
  const replenishLot = useGameStore((s) => s.replenishLot);
  const [replenishFor, setReplenishFor] = useState<string | null>(null);
  const zeroDistM = rifle.playerZero?.zeroRangeM;
  const label: CSSProperties = { fontSize: 12, opacity: 0.6 };
  const grid: CSSProperties = { display: 'grid', gridTemplateColumns: 'auto 1fr', gap: '2px 12px', fontSize: 13 };
  const smallBtn: CSSProperties = {
    fontFamily: 'monospace',
    fontSize: 11,
    color: FG,
    background: 'rgba(232,238,244,0.1)',
    border: '1px solid rgba(232,238,244,0.35)',
    borderRadius: 5,
    padding: '4px 8px',
    cursor: 'pointer',
  };
  const fps = (mps: number) => mpsToFps(mps).toFixed(0);
  return (
    <div style={{ borderTop: DIVIDER, paddingTop: 10 }}>
      {/* Rifle */}
      <div style={{ fontSize: 15, marginBottom: 4 }}>{rifleModel.name}</div>
      <div style={{ ...grid, marginBottom: 14 }}>
        <span style={label}>Caliber</span>
        <span>
          {rifleModel.cartridgeName} · {rifleModel.className}
        </span>
        <span style={label}>Twist</span>
        <span>1:{rifleModel.twistIn}</span>
        <span style={label}>Zero</span>
        <span>
          {zeroDistM == null
            ? 'not zeroed'
            : isMetric
              ? `${Math.round(zeroDistM)} m`
              : `${Math.round(zeroDistM / 0.9144)} yd`}
        </span>
        <span style={label}>Acquired</span>
        <span>{fmtDate(rifle.acquiredAt ?? 0)}</span>
        <span style={label}>Lifetime rounds</span>
        <span>{rifle.lifetimeShotCount ?? 0}</span>
      </div>

      {/* Ammo lots for this cartridge */}
      <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 6 }}>Ammo — {rifleModel.cartridgeName}</div>
      {lots.length === 0 && <div style={{ opacity: 0.6, fontSize: 13 }}>no lots for this cartridge</div>}
      {lots.map((lot) => {
        const load = resolveLoadSpec(lot.spec);
        const chrono = findChronoSummary(chronoSummaries, rifle.id, lot.id);
        const rounds = lot.roundsRemaining ?? 0;
        const depleted = rounds <= 0;
        const discoveredBc = lot.effective?.bc;
        const hasDiscovered = !!(lot.effective && (lot.effective.mvMps != null || lot.effective.bc != null));
        return (
          <div
            key={lot.id}
            style={{ border: DIVIDER, borderRadius: 6, padding: '8px 10px', marginBottom: 8, fontSize: 13, opacity: depleted ? 0.5 : 1 }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span>
                <strong>{lot.lotNumber ?? '—'}</strong> · {load.product} · {load.grade}
              </span>
              <span style={{ color: depleted ? '#e88' : FG }}>{rounds} rds</span>
            </div>
            <div style={grid}>
              <span style={label}>MV (box)</span>
              <span>{isMetric ? `${load.believedMvMps.toFixed(0)} m/s` : `${fps(load.believedMvMps)} fps`}</span>
              <span style={label}>Chrono</span>
              <span>
                {chrono
                  ? `${isMetric ? chrono.avgMps.toFixed(0) + ' m/s' : fps(chrono.avgMps) + ' fps'} · SD ${
                      isMetric ? chrono.sdMps.toFixed(1) : mpsToFps(chrono.sdMps).toFixed(1)
                    } · ES ${isMetric ? (chrono.maxMps - chrono.minMps).toFixed(1) : mpsToFps(chrono.maxMps - chrono.minMps).toFixed(1)} · ${chrono.shots} shots`
                  : 'not chronoed'}
              </span>
              <span style={label}>BC (box)</span>
              <span>
                {load.believedBc.toFixed(3)} {load.dragModel}
              </span>
              <span style={label}>BC (discovered)</span>
              <span>{discoveredBc != null ? discoveredBc.toFixed(3) : '—'}</span>
              <span style={label}>Vert. spread</span>
              <span>{verticalSpread(rifle, rifleModel, lot, chrono, isMetric)}</span>
            </div>
            {/* Replenish (P4): a new lot of the same ammo. If this lot has discovered
                MV/BC, offer to carry them forward as provisional; else just a fresh box lot. */}
            <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
              {replenishFor === lot.id ? (
                <>
                  <span style={{ fontSize: 11, opacity: 0.7 }}>Replenish +20:</span>
                  <button
                    style={smallBtn}
                    onClick={() => {
                      replenishLot(lot.id, true);
                      setReplenishFor(null);
                    }}
                  >
                    carry MV/BC (provisional)
                  </button>
                  <button
                    style={smallBtn}
                    onClick={() => {
                      replenishLot(lot.id, false);
                      setReplenishFor(null);
                    }}
                  >
                    fresh (box)
                  </button>
                  <button style={smallBtn} onClick={() => setReplenishFor(null)}>
                    cancel
                  </button>
                </>
              ) : (
                <button
                  style={smallBtn}
                  onClick={() => (hasDiscovered ? setReplenishFor(lot.id) : replenishLot(lot.id, false))}
                >
                  Replenish +20
                </button>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

function Chip({ children, warn }: { children: ReactNode; warn?: boolean }) {
  return (
    <span
      style={{
        fontSize: 12,
        padding: '3px 8px',
        borderRadius: 10,
        border: `1px solid ${warn ? 'rgba(232,201,90,0.6)' : 'rgba(232,238,244,0.3)'}`,
        background: warn ? 'rgba(232,201,90,0.12)' : 'rgba(232,238,244,0.06)',
        color: warn ? '#e8c95a' : FG,
      }}
    >
      {children}
    </span>
  );
}

function TabButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      style={{
        fontFamily: 'monospace',
        fontSize: 14,
        color: active ? '#fff' : FG,
        background: active ? 'rgba(40,110,170,0.9)' : 'rgba(232,238,244,0.08)',
        border: active ? '1px solid #e8eef4' : '1px solid rgba(232,238,244,0.3)',
        borderRadius: 6,
        padding: '7px 14px',
        cursor: 'pointer',
        WebkitUserSelect: 'none',
        userSelect: 'none',
      }}
    >
      {children}
    </button>
  );
}
