import { readFileSync } from 'node:fs';
import createBtkModule from './engine/build-wasm/ballistics_toolkit_wasm.js';
import { solve, spinRate } from './validation/solve-driver.mjs';

const fixture = JSON.parse(readFileSync('./validation/loads.json', 'utf8'));
const load = fixture.loads.find(l => l.id) ?? fixture.loads[0];
console.log('Load id:', load.id, JSON.stringify(load.si));

const module = await createBtkModule();
const atm = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const zeroRangeM = 300 * 0.9144; // matches SCOPE_ZERO_RANGE_M in-game
const maxRangeM = 500 * 0.9144;
const stepM = 50 * 0.9144;

function radToMil(r) { return r * 1000; }

function run(windVec) {
  return solve(module, load.si, atm, windVec, { zeroRangeM, maxRangeM, stepM });
}

const zeroWind = run({ x: 0, y: 0, z: 0 });

// 20 mph = 8.9408 m/s. 12 o'clock (headwind, engine z convention per firing-solution.ts: from 12 -> +z headwind)
const speeds = [8.9408]; // 20 mph only, max wind
for (const spd of speeds) {
  const headwind = run({ x: 0, y: 0, z: spd });   // pure headwind
  const tailwind = run({ x: 0, y: 0, z: -spd });  // pure tailwind
  console.log(`\n--- wind speed ${spd.toFixed(3)} m/s (20 mph) ---`);
  console.log('range_yd | dropM(0wind) | dropM(head) | Δdrop_mil | dropM(tail) | Δdrop_mil');
  for (let i = 0; i < zeroWind.length; i++) {
    const r0 = zeroWind[i];
    const rh = headwind[i];
    const rt = tailwind[i];
    const rangeYd = (r0.rangeM / 0.9144).toFixed(0);
    // come-up angle differences (small-angle approx via atan2 like the game does)
    const angle = (rowDrop, range) => Math.atan2(-rowDrop, range); // matches requiredCorrectionRad's sign convention roughly
    const a0 = angle(r0.dropM, r0.rangeM);
    const ah = angle(rh.dropM, rh.rangeM);
    const at = angle(rt.dropM, rt.rangeM);
    const dMilHead = radToMil(ah - a0);
    const dMilTail = radToMil(at - a0);
    console.log(`${rangeYd.padStart(8)} | ${r0.dropM.toFixed(5)} | ${rh.dropM.toFixed(5)} | ${dMilHead.toFixed(4)} | ${rt.dropM.toFixed(5)} | ${dMilTail.toFixed(4)}`);
  }
}
