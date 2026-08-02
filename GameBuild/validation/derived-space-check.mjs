// Derived-space validation harness (rifle-ammo-store S11, step 1). The golden-
// vector harness (run.mjs) is keyed to specific loads — the 6 oracle-pinned
// presets — so it proves the engine matches BTK at those exact points but says
// nothing about the CONTINUOUS space the Store's sliders actually expose (any
// weight/i7 combo inside a cartridge's authored band). This harness sweeps that
// space instead and asserts STRUCTURAL properties (monotonic trends), never
// absolute numbers — the plan's own step 1 wording.
//
// Deliberately Vite/TS-free plain Node (same convention as run.mjs/match-check.mjs
// — this directory never imports the app's TypeScript source). The handful of
// pure formulas this needs (sectionalDensity, bc7FromI7, muzzleVelocityFps,
// bulletLengthIn) are REIMPLEMENTED here from `game/ballistic-derivation.ts`,
// not imported — kept in sync by hand; `ballistic-derivation.test.ts`'s own
// anchor-reproduction suite is what actually enforces the two stay identical.
//
// Run: node GameBuild/validation/derived-space-check.mjs
// Wired as `npm run validate:derived` (GameBuild/app/package.json).

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve } from './solve-driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(here, '../engine/build-wasm/ballistics_toolkit_wasm.js');
const CARTRIDGES_JSON = join(here, '../app/src/game/cartridges.data.json');

const MPS_PER_FPS = 0.3048;
const KG_PER_GRAIN = 0.00006479891;
const M_PER_INCH = 0.0254;

const fpsToMps = (fps) => fps * MPS_PER_FPS;
const grainsToKg = (gr) => gr * KG_PER_GRAIN;
const inchesToMeters = (inch) => inch * M_PER_INCH;

// --- reimplemented from game/ballistic-derivation.ts (S2) --------------------
function sectionalDensity(weightGr, dIn) {
  return weightGr / (7000 * dIn * dIn);
}
function bc7FromI7(sd, i7) {
  return sd / i7;
}
// `curve` here is the full cartridge record (`c`), matching catalog.ts's
// `velocityCurveParamsFor`: `a`/`kAnchored` live under `velocityCurve`, but
// `referenceBarrelIn`/`n` are top-level cartridge fields, not nested.
function muzzleVelocityFps(c, weightGr, barrelIn) {
  return (
    c.velocityCurve.kAnchored *
    Math.pow(weightGr, -c.velocityCurve.a) *
    Math.pow(barrelIn / c.referenceBarrelIn, c.n)
  );
}
function bulletLengthIn(sd, lengthClassC) {
  return lengthClassC * sd;
}

// ICAO sea level — same atmosphere `engine-bridge/effective-range.ts` (S8) pins
// the "effective range" definition to, so this harness's notion of "supersonic
// reach" agrees with what the game actually shows.
const ICAO_SEA_LEVEL = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };
const ZERO_RANGE_M = 91.44; // 100 yd — arbitrary, the Mach crossing doesn't depend on the zero
const MAX_RANGE_M = 3000;
const STEP_M = 25;

function lengthClassCFor(cartridgeId, lengthClasses) {
  for (const cls of Object.values(lengthClasses)) {
    if (cls.cartridgeIds.includes(cartridgeId)) return cls.C;
  }
  throw new Error(`derived-space-check: no length class covers '${cartridgeId}'`);
}

function linspace(min, max, n) {
  if (n === 1) return [(min + max) / 2];
  const out = [];
  for (let i = 0; i < n; i++) out.push(min + ((max - min) * i) / (n - 1));
  return out;
}

/** Last supersonic station (m), raw (not rounded to any display cadence — this
 *  harness checks the underlying trend, not the UI's rounding). */
function supersonicReachM(module, si) {
  const rows = solve(
    module,
    si,
    ICAO_SEA_LEVEL,
    { x: 0, y: 0, z: 0 },
    { zeroRangeM: ZERO_RANGE_M, maxRangeM: MAX_RANGE_M, stepM: STEP_M },
  );
  const atmos = new module.Atmosphere(
    ICAO_SEA_LEVEL.temperatureK,
    ICAO_SEA_LEVEL.altitudeM,
    ICAO_SEA_LEVEL.humidity,
    ICAO_SEA_LEVEL.pressurePa,
  );
  const speedOfSoundMps = atmos.getSpeedOfSound();
  atmos.delete();
  let lastSupersonicM = 0;
  for (const row of rows) {
    if (row.velocityMps / speedOfSoundMps < 1.0) break;
    lastSupersonicM = row.rangeM;
  }
  return lastSupersonicM;
}

function buildSi(c, weightGr, i7, barrelIn, twistIn, lengthClasses) {
  const sd = sectionalDensity(weightGr, c.dIn);
  const bc = bc7FromI7(sd, i7);
  const lengthIn = bulletLengthIn(sd, lengthClassCFor(c._id, lengthClasses));
  const mvFps = muzzleVelocityFps(c, weightGr, barrelIn);
  return {
    massKg: grainsToKg(weightGr),
    diameterM: inchesToMeters(c.dIn),
    lengthM: inchesToMeters(lengthIn),
    bc,
    dragModel: 'G7',
    muzzleVelocityMps: fpsToMps(mvFps),
    twistM: inchesToMeters(twistIn),
  };
}

async function main() {
  const cartridgesData = JSON.parse(readFileSync(CARTRIDGES_JSON, 'utf8'));
  const { cartridges, lengthClasses } = cartridgesData;
  const { default: engineFactory } = await import(ENGINE_JS);
  const module = await engineFactory();

  let failures = 0;
  const fail = (msg) => {
    failures++;
    console.error(`[derived-space] FAIL: ${msg}`);
  };

  // .22 LR is presetsOnly (D8, G1, no weight/i7 band) — no derived space to sweep.
  const ids = Object.keys(cartridges).filter((id) => !cartridges[id].presetsOnly);

  for (const id of ids) {
    const c = { ...cartridges[id], _id: id };
    const { min: wMin, max: wMax } = c.weightRangeGr;
    const { min: i7Min, max: i7Max } = c.i7Range;
    const barrelIn = c.referenceBarrelIn;
    const twistIn = c.twistOptionsInPerTurn[0];

    // --- MV strictly decreasing in weight (fixed i7 — MV doesn't read i7 at all) ---
    const weightSweep = linspace(wMin, wMax, 10);
    const i7Fixed = (i7Min + i7Max) / 2;
    const mvs = weightSweep.map((w) => muzzleVelocityFps(c, w, barrelIn));
    for (let i = 1; i < mvs.length; i++) {
      if (!(mvs[i] < mvs[i - 1])) fail(`${id}: MV not strictly decreasing in weight at ${weightSweep[i]} gr`);
    }

    // --- BC strictly increasing in weight (fixed i7) ---
    const bcsByWeight = weightSweep.map((w) => bc7FromI7(sectionalDensity(w, c.dIn), i7Fixed));
    for (let i = 1; i < bcsByWeight.length; i++) {
      if (!(bcsByWeight[i] > bcsByWeight[i - 1])) fail(`${id}: BC not strictly increasing in weight at ${weightSweep[i]} gr`);
    }

    // --- BC strictly decreasing in i7 (fixed weight); also the i7-band check ---
    const wFixed = (wMin + wMax) / 2;
    const i7Sweep = linspace(i7Min, i7Max, 10);
    const sdFixed = sectionalDensity(wFixed, c.dIn);
    const bcsByI7 = i7Sweep.map((i7) => bc7FromI7(sdFixed, i7));
    for (let i = 1; i < bcsByI7.length; i++) {
      if (!(bcsByI7[i] < bcsByI7[i - 1])) fail(`${id}: BC not strictly decreasing in i7 at i7=${i7Sweep[i].toFixed(3)}`);
    }
    for (const i7 of i7Sweep) {
      if (i7 < i7Min - 1e-9 || i7 > i7Max + 1e-9) fail(`${id}: swept i7 ${i7} outside its own measured band [${i7Min}, ${i7Max}]`);
    }

    // --- supersonic reach increasing in BC (fixed weight + barrel; sweep i7,
    //     which moves BC without touching MV — an isolated test of BC's effect) ---
    const i7ReachSweep = linspace(i7Min, i7Max, 5); // WASM solve per point — kept coarse
    const reaches = i7ReachSweep.map((i7) => {
      const si = buildSi(c, wFixed, i7, barrelIn, twistIn, lengthClasses);
      return { i7, bc: si.bc, reachM: supersonicReachM(module, si) };
    });
    for (let i = 1; i < reaches.length; i++) {
      // i7 ascending ⇒ BC descending ⇒ reach must be non-increasing (allow ties:
      // 25 m sampling can legitimately land two neighbouring i7s on the same
      // last-supersonic row).
      if (!(reaches[i].reachM <= reaches[i - 1].reachM)) {
        fail(
          `${id}: supersonic reach not monotone with BC — i7 ${reaches[i - 1].i7.toFixed(3)}→${reaches[i].i7.toFixed(3)} ` +
            `(BC ${reaches[i - 1].bc.toFixed(3)}→${reaches[i].bc.toFixed(3)}), reach ${reaches[i - 1].reachM}→${reaches[i].reachM} m`,
        );
      }
    }
    const reachSpanM = reaches[0].reachM - reaches[reaches.length - 1].reachM;
    if (!(reachSpanM > 0)) fail(`${id}: supersonic reach shows no measurable spread across the i7 band`);

    console.log(
      `[derived-space] ${id}: MV ${mvs[mvs.length - 1].toFixed(0)}–${mvs[0].toFixed(0)} fps, ` +
        `BC ${bcsByI7[bcsByI7.length - 1].toFixed(3)}–${bcsByI7[0].toFixed(3)}, ` +
        `reach ${reaches[reaches.length - 1].reachM.toFixed(0)}–${reaches[0].reachM.toFixed(0)} m — OK`,
    );
  }

  if (failures > 0) {
    console.error(`\n[derived-space] FAILED — ${failures} check(s) failed.`);
    process.exit(1);
  }
  console.log(`\n[derived-space] PASSED — ${ids.length} cartridges, structural properties hold across the derived space.`);
}

main();
