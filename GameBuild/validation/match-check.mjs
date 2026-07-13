// Engine-artifact vs pristine-BTK LIVE comparison (task 0.4d; kept as a local
// tool). LOCAL-ONLY: pristine BTK is git-ignored and absent in CI — CI uses
// run.mjs (committed golden vectors) instead.
//
// Uses the shared solve driver (task 0.7 refactor); the app-side bridge is
// covered by vitest — HERE the subject is artifact-vs-artifact.
//
// Run: node GameBuild/validation/match-check.mjs

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, rowDiff } from './solve-driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(here, '../engine/build-wasm/ballistics_toolkit_wasm.js');
const PRISTINE_JS = join(here, '../../BallisticsToolkit/build-wasm/web/ballistics_toolkit_wasm.js');
const REL_TOL = 1e-6; // identical builds expected; anything near this is a red flag

const fixture = JSON.parse(readFileSync(join(here, 'loads.json'), 'utf8'));
const { atmosphere, zeroRangeM, maxRangeM, stepM, windCases } = fixture.conditions;

const [{ default: engineFactory }, { default: pristineFactory }] = await Promise.all([
  import(ENGINE_JS),
  import(PRISTINE_JS),
]);
const [engine, pristine] = await Promise.all([engineFactory(), pristineFactory()]);

let worst = 0;
let failed = false;
for (const load of fixture.loads) {
  for (const windCase of windCases) {
    const opts = { zeroRangeM, maxRangeM, stepM };
    const a = solve(engine, load.si, atmosphere, windCase.windVec, opts);
    const b = solve(pristine, load.si, atmosphere, windCase.windVec, opts);
    if (a.length !== b.length || a.length < 5) {
      console.error(`${load.id} | ${windCase.name}: ROW COUNT engine=${a.length} pristine=${b.length}`);
      failed = true;
      continue;
    }
    let caseWorst = 0;
    for (let i = 0; i < a.length; i++) {
      const d = rowDiff(a[i], b[i]);
      caseWorst = Math.max(caseWorst, d);
      if (d > REL_TOL) {
        failed = true;
        console.error(`DIFF ${load.id} | ${windCase.name} @ ${a[i].rangeM.toFixed(0)} m: rel ${d.toExponential(2)}`);
      }
    }
    worst = Math.max(worst, caseWorst);
    console.log(`${load.id} | ${windCase.name}: ${a.length} rows, worst rel ${caseWorst.toExponential(2)}`);
  }
}

console.log(`\nworst relative diff: ${worst.toExponential(3)} (tolerance ${REL_TOL})`);
if (failed) {
  console.error('MATCH CHECK FAILED — do not proceed; see protocol §6.');
  process.exit(1);
}
console.log('MATCH CHECK PASSED — engine artifact matches pristine BTK.');
