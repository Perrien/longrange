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
const mph = 20;
const spd = mph * 0.44704;
// 3 o'clock wind: windToVec comment says "from 3 o'clock -> -x". Live session wind zeros INCLUDING this wind (current game behavior).
const wind = { x: -spd, y: 0, z: 0 };

function radToMil(r) { return r * 1000; }
const angleAtRange = (offsetM, rangeM) => Math.atan2(offsetM, rangeM);

// Current game behavior: solve() internally computes zero WITH this wind baked in (mirrors setupZeroedSimulator).
const rowsZeroedWithWind = solve(module, load.si, atm, wind, { zeroRangeM, maxRangeM, stepM });

console.log("=== Current game behavior: zero computed WITH the 20mph 3 o'clock wind baked in ===");
console.log('yd  | windageM(pos.x) | wind_mil | direction');
for (const r of rowsZeroedWithWind) {
  const yd = (r.rangeM/0.9144).toFixed(0);
  const mil = radToMil(angleAtRange(r.windageM, r.rangeM));
  const dir = Math.abs(mil) < 0.05 ? 'none' : (mil >= 0 ? 'right(→)' : 'left(←)');
  console.log(`${yd.padStart(3)} | ${r.windageM.toFixed(5)} | ${mil.toFixed(3).padStart(7)} | ${dir}`);
}
