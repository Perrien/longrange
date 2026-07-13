// Task 0.4d numeric match: drive the OWNED engine artifact and the PRISTINE BTK
// artifact through an identical solve and diff every sampled row.
//
// This is deliberately Vite-free plain Node (the seed of the task-0.7 golden
// harness). It duplicates the bridge's solve sequence on purpose: the app-side
// bridge is covered by vitest; HERE the subject is artifact-vs-artifact.
//
// Expectation (owner note in PROGRESS 0.4d): no dispersion is involved, and the
// two artifacts are built from identical sources with the same toolchain, so
// rows must match essentially exactly. Small-but-systematic differences mean a
// toolchain/wiring bug -> exit 1 (STOP per protocol §6), never "tolerance".
//
// Run: node GameBuild/validation/match-check.mjs   (from repo root, or any cwd)

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(here, '../engine/build-wasm/ballistics_toolkit_wasm.js');
const PRISTINE_JS = join(
  here,
  '../../BallisticsToolkit/build-wasm/web/ballistics_toolkit_wasm.js',
);
const REL_TOL = 1e-6; // identical binaries expected; anything near this is a red flag

const fixture = JSON.parse(readFileSync(join(here, 'loads.json'), 'utf8'));
const { atmosphere, zeroRangeM, maxRangeM, stepM, windCases } = fixture.conditions;

/** Same solve sequence as app/src/engine-bridge (kept in sync by hand). */
function solve(module, si, wind) {
  const spinRate = (2 * Math.PI * si.muzzleVelocityMps) / si.twistM;
  const drag = si.dragModel === 'G1' ? module.DragFunction.G1 : module.DragFunction.G7;
  const bullet = new module.Bullet(si.massKg, si.diameterM, si.lengthM, si.bc, drag);
  const atmos = new module.Atmosphere(
    atmosphere.temperatureK,
    atmosphere.altitudeM,
    atmosphere.humidity,
    atmosphere.pressurePa,
  );
  const windVec = new module.Vector3D(wind.x, wind.y, wind.z);
  const target = new module.Vector3D(0, 0, -zeroRangeM);
  const sim = new module.BallisticsSimulator();
  const owned = [bullet, atmos, windVec, target, sim];
  try {
    sim.setInitialBullet(bullet);
    sim.setAtmosphere(atmos);
    sim.setWind(windVec);
    sim.computeZero(si.muzzleVelocityMps, target, 0.001, 50, 1e-5, spinRate).delete();
    sim.simulate(maxRangeM * 1.05, 0.001, 10.0);
    const trajectory = sim.getTrajectory(); // reference — do NOT delete
    const rows = [];
    for (let range = stepM; range <= maxRangeM + 1e-6; range += stepM) {
      const point = trajectory.atDistance(range);
      if (!point) continue;
      const state = point.getState();
      const pos = state.getPosition();
      rows.push({
        rangeM: point.getDistance(),
        dropM: pos.y,
        windageM: pos.x,
        velocityMps: point.getVelocity(),
        timeOfFlightS: point.getTime(),
      });
      pos.delete();
      state.delete();
      point.delete();
    }
    return rows;
  } finally {
    for (const h of owned) h.delete();
  }
}

function relDiff(a, b) {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  return Math.abs(a - b) / scale;
}

const [{ default: engineFactory }, { default: pristineFactory }] = await Promise.all([
  import(ENGINE_JS),
  import(PRISTINE_JS),
]);
const [engine, pristine] = await Promise.all([engineFactory(), pristineFactory()]);

let worst = 0;
let failed = false;
for (const load of fixture.loads) {
  for (const windCase of windCases) {
    const a = solve(engine, load.si, windCase.windVec);
    const b = solve(pristine, load.si, windCase.windVec);
    console.log(`\n== ${load.name} — ${windCase.name} ==`);
    console.log('range(m)  drop(m) [engine|pristine]  windage(m)  vel(m/s)  TOF(s)  maxRelDiff');
    if (a.length !== b.length || a.length < 5) {
      console.error(`ROW COUNT MISMATCH or <5 rows: engine=${a.length} pristine=${b.length}`);
      failed = true;
      continue;
    }
    for (let i = 0; i < a.length; i++) {
      const d = Math.max(
        relDiff(a[i].rangeM, b[i].rangeM),
        relDiff(a[i].dropM, b[i].dropM),
        relDiff(a[i].windageM, b[i].windageM),
        relDiff(a[i].velocityMps, b[i].velocityMps),
        relDiff(a[i].timeOfFlightS, b[i].timeOfFlightS),
      );
      worst = Math.max(worst, d);
      const flag = d > REL_TOL ? '  << DIFF' : '';
      console.log(
        `${a[i].rangeM.toFixed(1).padStart(7)}  ` +
          `${a[i].dropM.toFixed(6)} | ${b[i].dropM.toFixed(6)}  ` +
          `${a[i].windageM.toFixed(6)} | ${b[i].windageM.toFixed(6)}  ` +
          `${a[i].velocityMps.toFixed(2)}  ${a[i].timeOfFlightS.toFixed(4)}  ` +
          `${d.toExponential(2)}${flag}`,
      );
      if (d > REL_TOL) failed = true;
    }
  }
}

console.log(`\nworst relative diff: ${worst.toExponential(3)} (tolerance ${REL_TOL})`);
if (failed) {
  console.error('MATCH CHECK FAILED — do not proceed; see protocol §6.');
  process.exit(1);
}
console.log('MATCH CHECK PASSED — engine artifact matches pristine BTK.');
