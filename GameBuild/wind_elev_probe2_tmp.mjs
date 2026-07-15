import { readFileSync } from 'node:fs';
import createBtkModule from './engine/build-wasm/ballistics_toolkit_wasm.js';
import { solve } from './validation/solve-driver.mjs';

const fixture = JSON.parse(readFileSync('./validation/loads.json', 'utf8'));
const load = fixture.loads[0];
const module = await createBtkModule();
const atm = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const zeroRangeM = 300 * 0.9144;
const maxRangeM = 500 * 0.9144;
const stepM = 50 * 0.9144;

function radToMil(r) { return r * 1000; }
function angleAtRange(offsetM, rangeM) { return Math.atan2(offsetM, rangeM); } // matches dope-row.ts

function run(windVec) {
  return solve(module, load.si, atm, windVec, { zeroRangeM, maxRangeM, stepM });
}

const zeroWind = run({ x: 0, y: 0, z: 0 });

for (const mph of [10, 20]) {
  const spd = mph * 0.44704;
  const head = run({ x: 0, y: 0, z: spd });
  console.log(`\n=== ${mph} mph pure headwind (12 o'clock) vs calm ===`);
  console.log('yd  | mil(calm) rounded | mil(head) rounded | raw_calm   | raw_head   | raw_delta');
  for (let i = 0; i < zeroWind.length; i++) {
    const r0 = zeroWind[i], rh = head[i];
    const a0mil = radToMil(angleAtRange(-r0.dropM, r0.rangeM)); // come-up sign per dope-row (up positive)
    const ahmil = radToMil(angleAtRange(-rh.dropM, rh.rangeM));
    const yd = (r0.rangeM/0.9144).toFixed(0);
    const flip = a0mil.toFixed(1) !== ahmil.toFixed(1) ? '  <-- FLIPS' : '';
    console.log(`${yd.padStart(3)} | ${a0mil.toFixed(1).padStart(6)}            | ${ahmil.toFixed(1).padStart(6)}            | ${a0mil.toFixed(5)} | ${ahmil.toFixed(5)} | ${(ahmil-a0mil).toFixed(5)}${flip}`);
  }
}
