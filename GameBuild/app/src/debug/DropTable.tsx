// Task 0.4d — debug drop/windage table. Renders the engine's solve for the
// reference load in GameBuild/validation/loads.json (the same fixture
// match-check.mjs verifies against pristine BTK), MIL+MOA and metric+imperial
// side-by-side per catalog §0.6.
//
// Row formatting (range, come-up, wind hold, both unit systems) is shared with
// the in-scope DOPE panel via game/dope-row.ts (task 1.6d) so the two screens
// can't drift from each other.
//
// This table passes no `sightHeightM` (bore-line drops, not scope come-ups) —
// deliberately, so it keeps matching the golden-vector oracle and
// match-check.mjs exactly. The scope come-up table (with the 2″ sight height
// applied) is scope/DopePanel.tsx.
import { useEffect, useState } from 'react';
import {
  createEngineBridge,
  spinRateFromTwist,
  type EngineBridge,
  type Load,
  type TrajectoryTable,
} from '../engine-bridge';
import { metersToYards } from '../units';
import { formatDopeRow } from '../game/dope-row';
import fixture from '../../../validation/loads.json';

const ref = fixture.loads[0];
const { atmosphere, zeroRangeM, maxRangeM, stepM, windCases } = fixture.conditions;

const load: Load = {
  massKg: ref.si.massKg,
  diameterM: ref.si.diameterM,
  lengthM: ref.si.lengthM,
  bc: ref.si.bc,
  dragModel: ref.si.dragModel === 'G1' ? 'G1' : 'G7',
  muzzleVelocityMps: ref.si.muzzleVelocityMps,
  spinRateRadPerSec: spinRateFromTwist(ref.si.muzzleVelocityMps, ref.si.twistM),
};

const fmt = (n: number, digits = 2) => n.toFixed(digits);

export function DropTable() {
  const [bridge, setBridge] = useState<EngineBridge | null>(null);
  const [windIdx, setWindIdx] = useState(0);
  const [rows, setRows] = useState<TrajectoryTable>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    createEngineBridge().then(setBridge, (e: unknown) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (!bridge) return;
    try {
      setRows(
        bridge.solveTrajectory(load, atmosphere, windCases[windIdx].windVec, {
          zeroRangeM,
          maxRangeM,
          stepM,
        }),
      );
    } catch (e: unknown) {
      setError(String(e));
    }
  }, [bridge, windIdx]);

  if (error) return <pre>Engine error: {error}</pre>;
  if (!bridge) return <p>Loading engine…</p>;

  return (
    <div style={{ fontFamily: 'monospace', padding: '1rem' }}>
      <h1>LongRange — debug drop table (task 0.4d)</h1>
      <p>
        {ref.name} · {ref.box.bulletWeightGr} gr · {ref.box.dragModel} BC {ref.box.bc} · MV{' '}
        {ref.box.muzzleVelocityFps} fps ({fmt(ref.si.muzzleVelocityMps, 1)} m/s) · twist 1:
        {ref.box.twistInPerTurn}″ · zero {zeroRangeM} m ({fmt(metersToYards(zeroRangeM), 0)} yd) ·
        ISA sea level, RH 50%
      </p>
      <label>
        Wind:{' '}
        <select value={windIdx} onChange={(e) => setWindIdx(Number(e.target.value))}>
          {windCases.map((w, i) => (
            <option key={w.name} value={i}>
              {w.name}
            </option>
          ))}
        </select>
      </label>
      <table cellPadding={4} style={{ borderCollapse: 'collapse', marginTop: '0.5rem' }}>
        <thead>
          <tr style={{ borderBottom: '1px solid #888', textAlign: 'right' }}>
            <th>Range m | yd</th>
            <th>Drop cm | in</th>
            <th>Drop MIL | MOA</th>
            <th>Wind cm | in</th>
            <th>Wind MIL | MOA</th>
            <th>Vel m/s | fps</th>
            <th>TOF s</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const row = formatDopeRow(r);
            return (
              <tr key={r.rangeM} style={{ textAlign: 'right' }}>
                <td>
                  {fmt(row.rangeM, 0)} | {fmt(row.rangeYd, 0)}
                </td>
                <td>
                  {fmt(row.dropCm, 1)} | {fmt(row.dropIn, 1)}
                </td>
                <td>
                  {fmt(row.dropMilMoa.mil, 2)} | {fmt(row.dropMilMoa.moa, 2)}
                </td>
                <td>
                  {fmt(row.windCm, 1)} | {fmt(row.windIn, 1)}
                </td>
                <td>
                  {fmt(row.windMilMoa.mil, 2)} | {fmt(row.windMilMoa.moa, 2)}
                </td>
                <td>
                  {fmt(row.velocityMps, 0)} | {fmt(row.velocityFps, 0)}
                </td>
                <td>{fmt(row.timeOfFlightS, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ color: '#888' }}>
        Bore-line trajectory (no sight height applied here by design, so this table
        keeps matching the golden-vector oracle exactly). For the 2″ sight-height
        scope come-up table, see the in-scope DOPE panel (task 1.6d). Verified vs
        pristine BTK: GameBuild/validation/match-check.mjs.
      </p>
    </div>
  );
}
