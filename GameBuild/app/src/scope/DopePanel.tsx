// DOPE side panel (task 1.6d, D3): a read-only come-up table for the current
// load + wind + zero, docked in the left dark-mask margin (stacked into the
// existing controls column so it can never overlap the scope glass or the
// dial/fire controls — see ScopeView.tsx). A "DOPE" button shows/hides it;
// closed by default so it never affects layout until asked for.
//
// Row math is shared with the 0.4 debug DropTable via game/dope-row.ts's
// formatDopeRow — the two screens solve independently but format identically,
// so they can't drift apart. Unlike DropTable, this panel passes
// `sightHeightM: SIGHT_HEIGHT_M` (task 1.6a) — these are real scope come-ups,
// not bore-line drops.
//
// Single-unit display (owner-requested improvement, 2026-07-15): rows collapse
// to whichever system `settings.unitsPrimary` currently selects (the same
// Met/Imp toggle ScopeView's HUD uses) rather than showing both — `formatDopeRow`
// already computes both units per row, so this just picks a side, no new math.

import { useEffect, useState } from 'react';
import { solveTrajectory, spinRateFromTwist, type AtmosphereInput } from '../engine-bridge';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import type { BtkModule, TrajectoryTable } from '../engine-bridge/types';
import { solveGear } from '../engine-bridge/gear-solve';
import { gearSolveContext, type GearSolveContext } from '../game/active-gear';
import { windToVec } from '../game/firing-solution';
import { formatDopeRow, type DopeRow } from '../game/dope-row';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, SCOPE_ZERO_RANGE_M, SIGHT_HEIGHT_M } from '../game/loads';
import { yardsToMeters, formatDistanceForDisplay } from '../units';
import { useGameStore } from '../state/store';

// Same ISA atmosphere ScopeView solves against (validation/loads.json conditions).
const ISA_ATMOSPHERE: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

// Range A's ladder is 50→500 yd every 50 yd (range/range-a-config.ts). A single
// solve with a 50-yd step lands rows exactly on those distances (engine-bridge
// samples at `stepM, 2*stepM, ..., maxRangeM`) without depending on the scene.
const STEP_M = yardsToMeters(50);
const MAX_RANGE_M = yardsToMeters(500);

const fmt = (n: number, digits: number) => n.toFixed(digits);

export function DopePanel() {
  const [open, setOpen] = useState(false);
  const wind = useGameStore((s) => s.session.wind);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  // Active gear (task 2.3e, D2): the table becomes the BELIEVED (box) solve for
  // the selected rifle+lot at the rifle's stored zero — what the player's data
  // book would say, never the hidden truth.
  const inventory = useGameStore((s) => s.inventory);
  const [module, setModule] = useState<BtkModule | null>(null);
  const [rows, setRows] = useState<DopeRow[]>([]);
  const [zeroRangeM, setZeroRangeM] = useState<number>(SCOPE_ZERO_RANGE_M);
  const [error, setError] = useState<string | null>(null);

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

  // Re-solve whenever the panel is open and the wind / active gear / zero
  // changes (closed panels don't burn cycles re-solving on every wind tweak).
  useEffect(() => {
    if (!open || !module) return;
    try {
      const windVec = windToVec(wind.speedMps, wind.directionDeg);
      // Gear-driven DOPE (task 2.3e, D2): the BELIEVED table for the active
      // rifle+lot, zeroed at the rifle's stored zero (else the cartridge
      // default). Box-true fallback (Increment-1 behaviour) with no gear or a
      // stale catalog id.
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
          maxRangeM: MAX_RANGE_M,
          stepM: STEP_M,
          sightHeightM: SIGHT_HEIGHT_M,
        }).believedTable;
      } else {
        const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
        const load = {
          ...gameLoad.load,
          spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
        };
        table = solveTrajectory(module, load, ISA_ATMOSPHERE, windVec, {
          zeroRangeM: SCOPE_ZERO_RANGE_M,
          maxRangeM: MAX_RANGE_M,
          stepM: STEP_M,
          sightHeightM: SIGHT_HEIGHT_M,
        });
      }
      setZeroRangeM(ctx ? ctx.zeroRangeM : SCOPE_ZERO_RANGE_M);
      setRows(table.map(formatDopeRow));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [open, module, wind.speedMps, wind.directionDeg, inventory, unitsPrimary]);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
      <button onClick={() => setOpen((o) => !o)}>DOPE {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', width: 190 }}>
          {error && <div style={{ color: '#e88' }}>engine error: {error}</div>}
          {!error && !module && <div>loading…</div>}
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
                {rows.map((r) => {
                  const isMetric = unitsPrimary === 'MIL';
                  const range = isMetric ? r.rangeM : r.rangeYd;
                  const rangeLabel = isMetric ? 'm' : 'yd';
                  // Negligibility is judged on the raw MIL value, matching
                  // MIL's own 1-decimal rounding grid (0.05 mil) — NOT a
                  // per-unit epsilon (owner bug report, 2026-07-15). MOA is
                  // numerically ~3.44x mil, so a tiny near-zero residual that
                  // rounds away to "0.0" in Metric was rounding UP to a
                  // visible "0.1" in Imperial for the exact same underlying
                  // (essentially zero) physics. Clamping both to 0 below this
                  // shared threshold keeps the two unit systems in agreement.
                  const dropNegligible = Math.abs(r.dropMilMoa.mil) < 0.05;
                  const windNegligible = Math.abs(r.windMilMoa.mil) < 0.05;
                  const drop = isMetric ? r.dropMilMoa.mil : r.dropMilMoa.moa;
                  const windHold = isMetric ? r.windMilMoa.mil : r.windMilMoa.moa;
                  return (
                    <tr key={r.rangeM}>
                      <td style={{ textAlign: 'left', padding: '1px 0' }}>
                        {fmt(range, 0)} {rangeLabel}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {dropNegligible ? '0.0' : `${drop >= 0 ? '↑' : '↓'}${fmt(Math.abs(drop), 1)}`}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        {windNegligible ? '—' : `${windHold >= 0 ? '→' : '←'}${fmt(Math.abs(windHold), 1)}`}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
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
