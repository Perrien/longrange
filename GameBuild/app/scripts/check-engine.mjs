// Fails fast with an actionable message if the engine WASM artifact is missing.
// The artifact (GameBuild/engine/build-wasm/ballistics_toolkit_wasm.js) is a
// git-ignored build output, so a fresh checkout won't have it until built.
// Wired into dev/build/test scripts (task 0.4c, owner decision 2026-07-13).
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const artifact = fileURLToPath(
  new URL('../../engine/build-wasm/ballistics_toolkit_wasm.js', import.meta.url),
);

if (!existsSync(artifact)) {
  console.error(
    `\n[engine] WASM artifact not found:\n  ${artifact}\n\n` +
      `Build it first:  npm run engine:build\n` +
      `(requires the Emscripten toolchain on PATH — see Design/execution/PROGRESS.md)\n`,
  );
  process.exit(1);
}
