// Task 0.4d — debug drop/windage table. Renders the engine's solve for the
// reference load in GameBuild/validation/loads.json (the same fixture
// match-check.mjs verifies against pristine BTK), MIL+MOA and metric+imperial
// side-by-side per catalog §0.6.
//
// NOTE (deferred): the bridge zeroes the bore line through the target — sight
// height over bore is not modeled yet, so these are bore-line drops, not
// scope come-ups. Logged in PROGRESS deferred observations; needed before the
// DOPE table (increment 1.6) is real.
import { useEffect, useState } from 'react';
import {
  createEngineBridge,
  spinRateFromTwist,
  type EngineBridge,
  type Load,
  type TrajectoryTable,
} from '../engine-bridge';
import { asMilMoa, metersToYards, metersToInches, metersToCentimeters, mpsToFps } from '../units';
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

/** Small-angle-free correction angle (rad) subtended at the shooter. */
const angleAtRange = (offsetM: number, rangeM: number): number => Math.atan2(offsetM, rangeM);

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
            const drop = asMilMoa(angleAtRange(r.dropM, r.rangeM));
            const wind = asMilMoa(angleAtRange(r.windageM, r.rangeM));
            return (
              <tr key={r.rangeM} style={{ textAlign: 'right' }}>
                <td>
                  {fmt(r.rangeM, 0)} | {fmt(metersToYards(r.rangeM), 0)}
                </td>
                <td>
                  {fmt(metersToCentimeters(r.dropM), 1)} | {fmt(metersToInches(r.dropM), 1)}
                </td>
                <td>
                  {fmt(drop.mil, 2)} | {fmt(drop.moa, 2)}
                </td>
                <td>
                  {fmt(metersToCentimeters(r.windageM), 1)} | {fmt(metersToInches(r.windageM), 1)}
                </td>
                <td>
                  {fmt(wind.mil, 2)} | {fmt(wind.moa, 2)}
                </td>
                <td>
                  {fmt(r.velocityMps, 0)} | {fmt(mpsToFps(r.velocityMps), 0)}
                </td>
                <td>{fmt(r.timeOfFlightS, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p style={{ color: '#888' }}>
        Bore-line trajectory (sight height not yet modeled — see PROGRESS deferred
        observations). Verified vs pristine BTK: GameBuild/validation/match-check.mjs.
      </p>
    </div>
  );
}
