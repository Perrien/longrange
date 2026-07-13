// Golden-vector harness (task 0.7; build-plan §8.1).
//
// Modes:
//   node run.mjs --generate   Run PRISTINE BallisticsToolkit over the matrix in
//                             loads.json (`validation` block) and write
//                             vectors/golden.json. LOCAL-ONLY: pristine BTK is
//                             git-ignored and does not exist in CI. Regenerate
//                             ONLY when ORACLE_VERSION legitimately changes,
//                             with an owner decision logged.
//   node run.mjs              Check mode (default; runs locally AND in CI):
//                             run the OWNED engine artifact over the same
//                             matrix and diff every row against the committed
//                             golden vectors. Exits 1 beyond tolerance.
//
// A failing check means the engine changed behavior for factors BTK implements
// — that is a bug (or an undocumented oracle change). NEVER fix a red check by
// regenerating vectors or loosening tolerance (execution-protocol §4.2/§4.3).

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { solve, rowDiff } from './solve-driver.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const ENGINE_JS = join(here, '../engine/build-wasm/ballistics_toolkit_wasm.js');
const PRISTINE_JS = join(here, '../../BallisticsToolkit/build-wasm/web/ballistics_toolkit_wasm.js');
const GOLDEN = join(here, 'vectors/golden.json');
const REL_TOL = 1e-4;

const generate = process.argv.includes('--generate');
const fixture = JSON.parse(readFileSync(join(here, 'loads.json'), 'utf8'));
const { zeroRangeM, atmospheres, windCases } = fixture.validation;

function runMatrix(module) {
  const cases = [];
  for (const load of fixture.loads) {
    for (const atmosphere of atmospheres) {
      for (const windCase of windCases) {
        cases.push({
          loadId: load.id,
          atmosphere: atmosphere.name,
          wind: windCase.name,
          rows: solve(module, load.si, atmosphere, windCase.windVec, {
            zeroRangeM,
            maxRangeM: load.ranges.maxRangeM,
            stepM: load.ranges.stepM,
          }),
        });
      }
    }
  }
  return cases;
}

if (generate) {
  if (!existsSync(PRISTINE_JS)) {
    console.error(`[golden] pristine BTK artifact not found: ${PRISTINE_JS}\n` +
      `Build it first (BallisticsToolkit/build_web.sh). Generation is local-only.`);
    process.exit(1);
  }
  const { default: factory } = await import(PRISTINE_JS);
  const cases = runMatrix(await factory());
  mkdirSync(join(here, 'vectors'), { recursive: true });
  const rowCount = cases.reduce((n, c) => n + c.rows.length, 0);
  writeFileSync(
    GOLDEN,
    JSON.stringify(
      {
        $comment: 'GOLDEN VECTORS from pristine BTK. Do not edit; do not regenerate without an owner decision (see ORACLE_VERSION).',
        generatedAt: new Date().toISOString(),
        cases,
      },
      null,
      1,
    ),
  );
  console.log(`[golden] generated ${cases.length} cases / ${rowCount} rows -> vectors/golden.json`);
  process.exit(0);
}

// ---- check mode ----
if (!existsSync(GOLDEN)) {
  console.error('[golden] vectors/golden.json missing — run --generate locally first.');
  process.exit(1);
}
if (!existsSync(ENGINE_JS)) {
  console.error(`[golden] engine artifact not found: ${ENGINE_JS} — build it (npm run engine:build).`);
  process.exit(1);
}
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
const { default: engineFactory } = await import(ENGINE_JS);
const actualCases = runMatrix(await engineFactory());

let worst = 0;
let worstAt = '';
let failures = 0;
if (actualCases.length !== golden.cases.length) {
  console.error(`[golden] case count mismatch: engine ${actualCases.length} vs golden ${golden.cases.length}`);
  process.exit(1);
}
for (let i = 0; i < golden.cases.length; i++) {
  const g = golden.cases[i];
  const a = actualCases[i];
  const label = `${g.loadId} | ${g.atmosphere} | ${g.wind}`;
  if (a.loadId !== g.loadId || a.rows.length !== g.rows.length) {
    console.error(`[golden] structure mismatch at case ${i}: ${label}`);
    failures++;
    continue;
  }
  for (let r = 0; r < g.rows.length; r++) {
    const d = rowDiff(a.rows[r], g.rows[r]);
    if (d > worst) {
      worst = d;
      worstAt = `${label} @ ${g.rows[r].rangeM.toFixed(0)} m`;
    }
    if (d > REL_TOL) {
      failures++;
      console.error(
        `DIFF ${label} @ ${g.rows[r].rangeM.toFixed(0)} m: rel ${d.toExponential(2)} ` +
          `(drop ${a.rows[r].dropM} vs ${g.rows[r].dropM})`,
      );
    }
  }
}

console.log(
  `[golden] ${golden.cases.length} cases checked; worst rel diff ${worst.toExponential(3)}` +
    (worstAt ? ` (${worstAt})` : '') + `; tolerance ${REL_TOL}`,
);
if (failures > 0) {
  console.error(`[golden] FAILED — ${failures} row(s) beyond tolerance. STOP (protocol §6).`);
  process.exit(1);
}
console.log('[golden] PASSED — engine matches the committed oracle vectors.');
