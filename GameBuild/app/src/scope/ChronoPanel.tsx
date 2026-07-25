// Chronograph panel (task 2.4e, D10): a deployable in-scope readout of measured
// muzzle velocity for the active rifle+lot. Docked in the left dark-mask margin
// like DopePanel (stacked in ScopeView's controls column, never over the glass).
//
// "Deploy" is the toggle: while deployed, every fired shot logs a reading (the
// wiring lives in ScopeView's fire paths) into the live string; the panel shows
// the string's per-shot speeds + running avg/SD/ES, a "New string" button that
// folds it into the persisted per-rifle+lot summary (Welford), and that summary
// beside the box MV — the SD/ES the box never told you.
//
// Realism (owner, 2026-07-24): each reading is an independent draw from the lot's
// true MV distribution, so the average is an ESTIMATE — better than the box, never
// exact, tightening with shot count (diminishing returns). No hidden truth here:
// readings arrive as plain numbers via the engine-bridge scatter seam.
//
// Velocity shows m/s (Metric/MIL) or fps (Imperial/MOA) — NOT mph (that's the
// wind helper); routes through `mpsToFps` + the units toggle, like dope-row.

import { stringStats, findChronoSummary } from '../game/chrono';
import { getAmmoLoad } from '../game/catalog';
import { mpsToFps } from '../units';
import { useGameStore } from '../state/store';

const fmt = (n: number, digits: number) => n.toFixed(digits);

export function ChronoPanel() {
  const deployed = useGameStore((s) => s.chrono.deployed);
  const current = useGameStore((s) => s.chrono.current);
  const summaries = useGameStore((s) => s.chrono.summaries);
  const inventory = useGameStore((s) => s.inventory);
  const unitsPrimary = useGameStore((s) => s.settings.unitsPrimary);
  const setChronoDeployed = useGameStore((s) => s.setChronoDeployed);
  const commitChronoString = useGameStore((s) => s.commitChronoString);

  const rifle = inventory.rifles.find((r) => r.id === inventory.activeRifleId);
  const lot = inventory.ammoLots.find((l) => l.id === inventory.activeLotId);
  const gearActive = Boolean(rifle && lot);

  const isMetric = unitsPrimary === 'MIL';
  const unit = isMetric ? 'm/s' : 'fps';
  const conv = (mps: number): number => (isMetric ? mps : mpsToFps(mps));

  // Box (believed) MV for comparison — guard a stale/drifted catalog id.
  let boxMvMps: number | null = null;
  if (lot) {
    try {
      boxMvMps = getAmmoLoad(lot.catalogId).believedMvMps;
    } catch {
      boxMvMps = null;
    }
  }

  // The live string only counts if it belongs to the active pairing.
  const liveReadings =
    current && rifle && lot && current.rifleId === rifle.id && current.lotId === lot.id
      ? current.readings
      : [];
  const live = stringStats(liveReadings);
  const summary = rifle && lot ? findChronoSummary(summaries, rifle.id, lot.id) : undefined;

  return (
    <div style={{ marginTop: 8, borderTop: '1px solid rgba(232,238,244,0.25)', paddingTop: 6 }}>
      <button onClick={() => setChronoDeployed(!deployed)}>
        Chrono {deployed ? '■ stow' : '▶ deploy'}
      </button>
      {deployed && (
        <div style={{ marginTop: 6, width: 190, fontSize: 12 }}>
          {!gearActive && (
            <div style={{ color: '#9aa5b1' }}>select a rifle + lot to chronograph.</div>
          )}
          {gearActive && (
            <>
              <div style={{ color: '#9aa5b1', fontSize: 10 }}>
                box MV: {boxMvMps == null ? '—' : `${fmt(conv(boxMvMps), 0)} ${unit}`}
              </div>

              <div style={{ marginTop: 4 }}>
                <strong>string</strong> · {live.shots} shot{live.shots === 1 ? '' : 's'}
              </div>
              {live.shots > 0 ? (
                <div>
                  avg {fmt(conv(live.avgMps), 0)} {unit} · SD {fmt(conv(live.sdMps), 1)} · ES{' '}
                  {fmt(conv(live.maxMps - live.minMps), 1)}
                </div>
              ) : (
                <div style={{ color: '#9aa5b1' }}>fire while deployed to log readings…</div>
              )}
              {live.shots > 0 && (
                <div style={{ color: '#9aa5b1', fontSize: 10, marginTop: 2, wordSpacing: 2 }}>
                  {liveReadings.map((r) => fmt(conv(r), 0)).join('  ')}
                </div>
              )}
              <button
                style={{ marginTop: 4 }}
                disabled={live.shots === 0}
                onClick={() => commitChronoString(new Date().toISOString())}
              >
                New string (save)
              </button>

              <div style={{ marginTop: 6, borderTop: '1px solid rgba(232,238,244,0.15)', paddingTop: 4 }}>
                <strong>recorded</strong>
                {summary ? (
                  <div>
                    {summary.shots} shots · avg {fmt(conv(summary.avgMps), 0)} {unit} · SD{' '}
                    {fmt(conv(summary.sdMps), 1)} · ES {fmt(conv(summary.maxMps - summary.minMps), 1)}
                  </div>
                ) : (
                  <div style={{ color: '#9aa5b1' }}>no record yet — save a string.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
