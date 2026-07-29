// DOPE side panel (task 1.6d, D3): a read-only come-up table for the current
// load + wind + zero, docked in the left dark-mask margin (stacked into the
// existing controls column so it can never overlap the scope glass or the
// dial/fire controls — see ScopeView.tsx). A "DOPE" button shows/hides it;
// closed by default so it never affects layout until asked for.
//
// Row math is shared with the debug DropTable + the full-screen DopeBookScreen via
// game/dope-row.ts's formatDopeRow — the surfaces solve independently but format
// identically, so they can't drift apart. Unlike DropTable, this panel passes
// `sightHeightM: SIGHT_HEIGHT_M` (task 1.6a) — real scope come-ups, not bore drops.
//
// DOPE-first plan (P1): the strip is the glance-while-aiming companion to the full
// DopeBookScreen. Its rows now use the cartridge's DOPE ladder (`ladderStationsM`,
// centuries / rimfire fine set, to effective range) rather than a fixed 50→500,
// it carries the same not-zeroed / not-chronoed status header the book shows, and
// it highlights the row nearest the committed target. An "Open book" button jumps
// to the full screen. Columns stay minimal (Range/Elev/Wind); velocity, energy and
// transonic live on the book's page 2.
//
// Single-unit display (owner, 2026-07-15): rows collapse to whichever system
// `settings.unitsPrimary` selects — `formatDopeRow` computes both, this picks a side.

import { useEffect, useState, Fragment } from 'react';
import { solveTrajectory, spinRateFromTwist, speedOfSound, type AtmosphereInput } from '../engine-bridge';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule, TrajectoryTable } from '../engine-bridge/types';
import { solveGear } from '../engine-bridge/gear-solve';
import { gearSolveContext, type GearSolveContext } from '../game/active-gear';
import { windToVec } from '../game/firing-solution';
import { assembleComeUp, nearestRow, type ComeUpDisplayRow } from '../game/dope-row';
import { comeUpStationsM } from '../game/dope-book';
import { findChronoSummary } from '../game/chrono';
import { getRifleModel, isRimfireCartridge, catalogEffectiveRangeYd } from '../game/catalog';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, DEFAULT_GAME_LOAD_CARTRIDGE_ID, SIGHT_HEIGHT_M } from '../game/loads';
import { recommendedZeroM } from '../game/zero-distance';
import { formatDistanceForDisplay } from '../units';
import { useGameStore } from '../state/store';

// Same ISA atmosphere ScopeView solves against (validation/loads.json conditions).
const ISA_ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

const fmt = (n: number, digits: number) => n.toFixed(digits);

// Transonic band → text colour for the strip's range cell (no velocity column
// here, so the warning rides the range). Supersonic inherits the normal colour.
const BAND_COLOR: Record<'supersonic' | 'transonic' | 'subsonic', string | undefined> = {
  supersonic: undefined,
  transonic: '#e8c95a',
  subsonic: '#e88',
};

export function DopePanel({ onOpenBook }: { onOpenBook?: () => void } = {}) {
  const [open, setOpen] = useState(false);
  const wind = useGameStore((s) => s.session.wind);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  // Active gear (task 2.3e, D2): the table becomes the BELIEVED (box) solve for
  // the selected rifle+lot at the rifle's stored zero — what the player's data
  // book would say, never the hidden truth.
  const inventory = useGameStore((s) => s.inventory);
  const currentTarget = useGameStore((s) => s.session.currentTarget);
  const chronoSummaries = useGameStore((s) => s.chrono.summaries);
  const [module, setModule] = useState<BtkModule | null>(null);
  const [rows, setRows] = useState<ComeUpDisplayRow[]>([]);
  // Initial/fallback zero (no active gear): the recommended zero for the default
  // load's cartridge in the active unit (DOPE-first plan, step 1). Overwritten by
  // the gear path's ctx.zeroRangeM on the first solve when a rifle+lot is active.
  const [zeroRangeM, setZeroRangeM] = useState<number>(() =>
    recommendedZeroM(DEFAULT_GAME_LOAD_CARTRIDGE_ID, unitsPrimary),
  );
  const [error, setError] = useState<string | null>(null);

  // Status (reactive) — the same trust flags the book header shows. Only meaningful
  // when real gear is selected; the box-true fallback has no rifle instance to zero.
  const activeRifle = inventory.rifles.find((r) => r.id === inventory.activeRifleId);
  const activeLot = inventory.ammoLots.find((l) => l.id === inventory.activeLotId);
  const hasGear = !!(activeRifle && activeLot);
  const notZeroed = hasGear ? !activeRifle!.playerZero : false;
  const chrono = hasGear ? findChronoSummary(chronoSummaries, activeRifle!.id, activeLot!.id) : undefined;
  const notChronoed = hasGear ? !chrono : false;

  // Load the engine (cached singleton — ScopeView already loads it; this just
  // reuses the same promise, no duplicate WASM instantiation).
  useEffect(() => {
    let cancelled = false;
    loadBtkModule().then(
      (m) => {
        if (!cancelled) setModule(m);
      },
      (e: unknown) => {
        if (!cancelled) setError(String(e));
      },
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // Re-solve whenever the panel is open and the wind / active gear / zero changes
  // (closed panels don't burn cycles re-solving on every wind tweak).
  useEffect(() => {
    if (!open || !module) return;
    try {
      const windVec = windToVec(wind.speedMps, wind.directionDeg);
      // Gear-driven DOPE (task 2.3e, D2): the BELIEVED table for the active
      // rifle+lot, zeroed at the rifle's stored zero (else the cartridge default).
      // Box-true fallback (Increment-1 behaviour) with no gear or a stale id.
      const rifle = inventory.rifles.find((r) => r.id === inventory.activeRifleId);
      const lot = inventory.ammoLots.find((l) => l.id === inventory.activeLotId);
      let ctx: GearSolveContext | null = null;
      if (rifle && lot) {
        try {
          ctx = gearSolveContext(rifle, lot, unitsPrimary);
        } catch (err) {
          console.error('DOPE: gear context failed, using box-true fallback', err);
        }
      }
      // The come-up stations for the active cartridge — the same extended ladder
      // the DopeBookScreen uses: in-range centuries / rimfire set, continued past
      // effective range to the transonic→subsonic wall (over-generated to 2×
      // effective range; assembleComeUp trims at the first subsonic row).
      const cartridgeId = ctx ? getRifleModel(ctx.rifle.catalogId).cartridgeId : DEFAULT_GAME_LOAD_CARTRIDGE_ID;
      const effRangeYd = catalogEffectiveRangeYd(cartridgeId);
      const stations = comeUpStationsM(isRimfireCartridge(cartridgeId), unitsPrimary, effRangeYd, effRangeYd * 2);
      if (stations.length === 0) {
        setRows([]);
        return;
      }
      const maxRangeM = stations[stations.length - 1].stationM;
      const stepM = stations[0].stationM;
      let table: TrajectoryTable;
      if (ctx) {
        table = solveGear(module, {
          rifle: ctx.rifle,
          lot: ctx.lot,
          rifleRanges: ctx.rifleRanges,
          lotRanges: ctx.lotRanges,
          atmosphere: ISA_ATMOSPHERE,
          wind: windVec,
          zeroRangeM: ctx.zeroRangeM,
          maxRangeM,
          stepM,
          sightHeightM: SIGHT_HEIGHT_M,
        }).believedTable;
      } else {
        const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
        const load = {
          ...gameLoad.load,
          spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
        };
        table = solveTrajectory(module, load, ISA_ATMOSPHERE, windVec, {
          zeroRangeM: recommendedZeroM(cartridgeId, unitsPrimary),
          maxRangeM,
          stepM,
          sightHeightM: SIGHT_HEIGHT_M,
        });
      }
      setZeroRangeM(ctx ? ctx.zeroRangeM : recommendedZeroM(cartridgeId, unitsPrimary));
      setRows(assembleComeUp(table, stations, { speedOfSoundMps: speedOfSound(module, ISA_ATMOSPHERE) }));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [open, module, wind.speedMps, wind.directionDeg, inventory, unitsPrimary]);

  // Row nearest the committed target (highlight) — only while engaging. Unbounded
  // tolerance: the ladder is centuries, so the target rarely sits ON a station; we
  // want the closest station regardless of distance.
  const highlight = currentTarget ? nearestRow(rows, currentTarget.distanceM, Infinity) : undefined;
  // First station past effective range — a divider is drawn just before it.
  const firstBeyondIdx = rows.findIndex((r) => r.beyondEffective);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <button onClick={() => setOpen((o) => !o)}>DOPE {open ? '▲' : '▼'}</button>
        {open && onOpenBook && (
          <button onClick={onOpenBook} title="Open the full DOPE book">
            Open book ⤢
          </button>
        )}
      </div>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', width: 190 }}>
          {error && <div style={{ color: '#e88' }}>engine error: {error}</div>}
          {!error && !module && <div>loading…</div>}
          {hasGear && (notZeroed || notChronoed) && (
            <div style={{ marginBottom: 4, fontSize: 10, color: '#e8c95a' }}>
              {[notZeroed ? '⚠ not zeroed' : null, notChronoed ? '⚠ not chronoed' : null]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
          {!error && module && rows.length > 0 && (
            <table style={{ borderCollapse: 'collapse', width: '100%' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(232,238,244,0.3)' }}>
                  <th style={{ textAlign: 'left', fontWeight: 'normal' }}>Range</th>
                  <th style={{ textAlign: 'right', fontWeight: 'normal' }}>Elev</th>
                  <th style={{ textAlign: 'right', fontWeight: 'normal' }}>Wind</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => {
                  const isMetric = unitsPrimary === 'MIL';
                  const range = isMetric ? r.rangeM : r.rangeYd;
                  const rangeLabel = isMetric ? 'm' : 'yd';
                  // Negligibility is judged on the raw MIL value, matching MIL's
                  // own 1-decimal rounding grid (0.05 mil) — NOT a per-unit epsilon
                  // (owner bug report, 2026-07-15). MOA is ~3.44x mil, so a tiny
                  // near-zero residual that rounds to "0.0" in Metric was rounding
                  // UP to "0.1" in Imperial for the same physics. The shared clamp
                  // keeps the two unit systems in agreement.
                  const dropNegligible = Math.abs(r.dropMilMoa.mil) < 0.05;
                  const windNegligible = Math.abs(r.windMilMoa.mil) < 0.05;
                  const drop = isMetric ? r.dropMilMoa.mil : r.dropMilMoa.moa;
                  const windHold = isMetric ? r.windMilMoa.mil : r.windMilMoa.moa;
                  const highlighted = highlight?.rangeM === r.rangeM;
                  const band = r.transonic ?? 'supersonic';
                  return (
                    <Fragment key={r.rangeM}>
                      {i === firstBeyondIdx && (
                        <tr>
                          <td
                            colSpan={3}
                            style={{ fontSize: 9, opacity: 0.6, padding: '2px 0', borderTop: '1px solid rgba(232,238,244,0.25)' }}
                          >
                            — beyond effective —
                          </td>
                        </tr>
                      )}
                      <tr
                        style={{
                          background: highlighted ? 'rgba(40,110,170,0.3)' : undefined,
                          opacity: r.beyondEffective ? 0.55 : 1,
                        }}
                      >
                        <td style={{ textAlign: 'left', padding: '1px 0', color: BAND_COLOR[band] }}>
                          {fmt(range, 0)} {rangeLabel}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {dropNegligible ? '0.0' : `${drop >= 0 ? '↑' : '↓'}${fmt(Math.abs(drop), 1)}`}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          {windNegligible ? '—' : `${windHold >= 0 ? '→' : '←'}${fmt(Math.abs(windHold), 1)}`}
                        </td>
                      </tr>
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          )}
          {/* Transonic honesty note (owner, 2026-07-29). No station is gated —
              shoot anything at any distance — so the caveat lives here instead.
              The rows are already coloured by band; this says what the colour
              MEANS, which is the part that was missing.

              Wording is deliberate: it claims the numbers are less trustworthy,
              NOT that groups open up. Real groups do, but this engine's scatter
              comes only from MV SD, BC SD and rifle precision, none of which
              know the bullet's Mach number — so promising wider groups would be
              a second falsehood on top of the first. See `Wiki/_gaps.md` N4 and
              `Design/feature-catalog.md` §A. */}
          {!error && module && rows.some((r) => r.transonic && r.transonic !== 'supersonic') && (
            <div style={{ marginTop: 4, color: '#e8c95a', fontSize: 9, lineHeight: 1.35 }}>
              ⚠ <span style={{ color: '#e8c95a' }}>amber</span> = transonic ·{' '}
              <span style={{ color: '#e88' }}>red</span> = subsonic. Drop still solves, but
              past ~Mach 1.2 these numbers are the least trustworthy on the card — treat
              them as indicative and true them by shooting.
            </div>
          )}
          <div style={{ marginTop: 4, color: '#9aa5b1', fontSize: 10 }}>
            {(() => {
              const z = formatDistanceForDisplay(zeroRangeM, unitsPrimary);
              return `Elev/Wind in ${unitsPrimary === 'MIL' ? 'mil' : 'MOA'} · zero ${z.value.toFixed(0)} ${z.label} · 2″ sight height — scope come-ups, not bore-line drops.`;
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
