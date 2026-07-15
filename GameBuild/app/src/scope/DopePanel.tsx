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
import type { BtkModule } from '../engine-bridge/types';
import { windToVec } from '../game/firing-solution';
import { formatDopeRow, type DopeRow } from '../game/dope-row';
import { getGameLoad, DEFAULT_GAME_LOAD_ID, SCOPE_ZERO_RANGE_M, SIGHT_HEIGHT_M } from '../game/loads';
import { yardsToMeters } from '../units';
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
  const [module, setModule] = useState<BtkModule | null>(null);
  const [rows, setRows] = useState<DopeRow[]>([]);
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

  // Re-solve whenever the panel is open and the wind changes (closed panels
  // don't burn cycles re-solving on every wind tweak).
  useEffect(() => {
    if (!open || !module) return;
    try {
      const gameLoad = getGameLoad(DEFAULT_GAME_LOAD_ID);
      const load = {
        ...gameLoad.load,
        spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
      };
      const windVec = windToVec(wind.speedMps, wind.directionDeg);
      const table = solveTrajectory(module, load, ISA_ATMOSPHERE, windVec, {
        zeroRangeM: SCOPE_ZERO_RANGE_M,
        maxRangeM: MAX_RANGE_M,
        stepM: STEP_M,
        sightHeightM: SIGHT_HEIGHT_M,
      });
      setRows(table.map(formatDopeRow));
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [open, module, wind.speedMps, wind.directionDeg]);

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
      <button onClick={() => setOpen((o) => !o)}>DOPE {open ? '▲' : '▼'}</button>
      {open && (
        <div style={{ marginTop: 6, maxHeight: 220, overflowY: 'auto', width: 190 }}>
          {error && <div style={{ color: '#e88' }}>engine error: {error}</div>}
          {!error && !module && <div>loading…</div>}
          {!error &&
            module &&
            rows.map((r) => {
              const isMetric = unitsPrimary === 'MIL';
              const range = isMetric ? r.rangeM : r.rangeYd;
              const rangeLabel = isMetric ? 'm' : 'yd';
              const drop = isMetric ? r.dropMilMoa.mil : r.dropMilMoa.moa;
              const dropLabel = isMetric ? 'mil' : 'MOA';
              const windHold = isMetric ? r.windMilMoa.mil : r.windMilMoa.moa;
              return (
                <div key={r.rangeM} style={{ marginBottom: 4, lineHeight: 1.3 }}>
                  <div>
                    {fmt(range, 0)} {rangeLabel}
                  </div>
                  <div>
                    {drop >= 0 ? '↑' : '↓'}
                    {fmt(Math.abs(drop), 1)} {dropLabel}
                  </div>
                  {Math.abs(r.windMilMoa.mil) > 1e-3 && (
                    <div>
                      {windHold >= 0 ? '→' : '←'}
                      {fmt(Math.abs(windHold), 1)} {dropLabel} wind
                    </div>
                  )}
                </div>
              );
            })}
          <div style={{ marginTop: 4, color: '#9aa5b1', fontSize: 10 }}>
            2″ sight-height model applied (task 1.6a) — these are scope come-ups, not bore-line drops.
          </div>
        </div>
      )}
    </div>
  );
}
