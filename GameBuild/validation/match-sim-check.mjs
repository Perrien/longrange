// Match-sim (hit-sim) parity check: the owned engine's MatchSimulator vs pristine
// BTK's, fired with identical inputs, comparing mean group radius per rack
// distance. This is the measurement clause of LongRange task 1.4's Done-when:
// "mean radius over 50 simulated shots matches BTK hit-sim within 10%".
//
// LOCAL-ONLY: pristine BTK is git-ignored and absent in CI (same as match-check.mjs).
// Pristine has no Random::seed binding (it is untouched — guardrail §4.1), so it
// cannot be seeded to draw an identical RNG stream. Instead we rely on STATISTICAL
// CONVERGENCE: both builds share byte-identical match/simulator.cpp, so a large
// volley on each converges to the same true mean radius (well within the 10% spec
// bound). 50 shots is the in-game group size (its reproducibility is covered by the
// vitest determinism test); here we use a large N so the cross-engine comparison is
// meaningful without a shared seed. A light analytic sanity band guards against a
// unit/coordinate blunder that a pure reproduction test would miss.
//
// Run: node GameBuild/validation/match-sim-check.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(here, '../engine/build-wasm/ballistics_toolkit_wasm.js');
const PRISTINE_JS = join(here, '../../BallisticsToolkit/build-wasm/web/ballistics_toolkit_wasm.js');

const REL_TOL = 0.10; // task 1.4 Done-when spec bound
const SEED = 0x1abe11ed; // fixed, arbitrary — seeds the owned side for reproducible logs
const PARITY_SHOTS = 2000; // large N so both engines converge (pristine is unseeded)
const DT = 0.001;
const YD_TO_M = 0.9144;
const RACK_YARDS = [50, 100, 150, 200, 250, 300, 350, 400, 450, 500];

const oracleLoads = JSON.parse(readFileSync(join(here, 'loads.json'), 'utf8')).loads;
const gameLoads = JSON.parse(readFileSync(join(here, '../app/src/game/loads.data.json'), 'utf8')).loads;
const atmosphere = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

const [{ default: engineFactory }, { default: pristineFactory }] = await Promise.all([
  import(ENGINE_JS),
  import(PRISTINE_JS),
]);
const [engine, pristine] = await Promise.all([engineFactory(), pristineFactory()]);

/** Fire a seeded PARITY_SHOTS-shot volley and return the group's mean (RMS) radius (m). */
function meanRadius(module, si, dispersion, rangeM) {
  const bullet = new module.Bullet(
    si.massKg,
    si.diameterM,
    si.lengthM,
    si.bc,
    si.dragModel === 'G1' ? module.DragFunction.G1 : module.DragFunction.G7,
  );
  const atmos = new module.Atmosphere(
    atmosphere.temperatureK,
    atmosphere.altitudeM,
    atmosphere.humidity,
    atmosphere.pressurePa,
  );
  const BIG = 1000;
  const target = new module.Target('dummy', BIG, BIG, BIG, BIG, BIG, BIG, BIG, '');
  const sim = new module.MatchSimulator(
    bullet,
    si.muzzleVelocityMps,
    target,
    rangeM,
    atmos,
    dispersion.mvSdMps,
    dispersion.bcSdFraction,
    dispersion.windSpeedSdMps,
    dispersion.headwindSdMps,
    dispersion.updraftSdMps,
    module.Conversions.moaToRadians(dispersion.rifleAccuracyMoa),
    dispersion.scopeCantRad,
    DT,
    si.twistM,
  );

  // Seed AFTER construction (zeroing is deterministic), immediately before firing.
  // Pristine has no seed binding (untouched); it runs clock-seeded — convergence
  // over PARITY_SHOTS makes the comparison meaningful without a shared stream.
  if (module.Random) module.Random.seed(SEED);
  for (let i = 0; i < PARITY_SHOTS; i++) sim.fireShot();
  const match = sim.getMatch();
  const r = match.getMeanRadius();

  match.delete();
  sim.delete();
  target.delete();
  atmos.delete();
  bullet.delete();
  return r;
}

let failed = false;
let worst = 0;

for (const gl of gameLoads) {
  const si = oracleLoads.find((l) => l.id === gl.baseLoadId)?.si;
  if (!si) {
    console.error(`${gl.id}: baseLoadId '${gl.baseLoadId}' not found in loads.json`);
    failed = true;
    continue;
  }
  const rifleRad = engine.Conversions.moaToRadians(gl.dispersion.rifleAccuracyMoa);
  let prevOwned = 0;

  for (const yd of RACK_YARDS) {
    const rangeM = yd * YD_TO_M;
    const owned = meanRadius(engine, si, gl.dispersion, rangeM);
    const pris = meanRadius(pristine, si, gl.dispersion, rangeM);

    // Primary: owned reproduces pristine within the 10% spec bound.
    const rel = pris > 0 ? Math.abs(owned - pris) / pris : Math.abs(owned - pris);
    worst = Math.max(worst, rel);

    // Sanity: RMS radius of the uniform-disc rifle cone alone ≈ (1/√2)·(cone_dia/2)·R.
    // MV/BC SD add vertical stringing on top, so the true value is >= this. Guard
    // only against gross unit/coordinate errors with a wide [0.3, 5]× band.
    const discRms = (rifleRad / 2) * rangeM * Math.SQRT1_2;
    const ratio = discRms > 0 ? owned / discRms : 0;
    const sane = ratio >= 0.3 && ratio <= 5.0;

    const flags = [];
    if (rel > REL_TOL) flags.push('DIFF');
    if (!sane) flags.push('INSANE');
    if (owned < prevOwned - 1e-9) flags.push('NON-MONOTONIC'); // radius should grow with range
    if (flags.length) failed = true;
    prevOwned = owned;

    console.log(
      `${gl.id} @ ${yd} yd: owned=${(owned * 1000).toFixed(2)}mm pristine=${(pris * 1000).toFixed(2)}mm ` +
        `rel=${rel.toExponential(2)} disc-rms=${(discRms * 1000).toFixed(2)}mm ratio=${ratio.toFixed(2)}` +
        (flags.length ? `  <-- ${flags.join(',')}` : ''),
    );
  }
}

console.log(`\nworst relative diff: ${worst.toExponential(3)} (tolerance ${REL_TOL})`);
if (failed) {
  console.error('MATCH-SIM CHECK FAILED — do not proceed; see protocol §6.');
  process.exit(1);
}
console.log('MATCH-SIM CHECK PASSED — hit-sim groups match pristine BTK within 10%.');
