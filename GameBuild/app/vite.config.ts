/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Engine-artifact wiring (owner decision, 2026-07-15): the single-file WASM ES
// module (SINGLE_FILE=1, WASM embedded) is imported via the `@engine` alias, and
// the raw specifier lives in exactly one bridge file (src/engine-bridge/wasm-module.ts).
// Vitest inherits these aliases from this config. GameBuild/validation/run.mjs does
// NOT use Vite — it imports the artifact with a plain relative path.
const engineArtifact = fileURLToPath(
  new URL('../engine/build-wasm/ballistics_toolkit_wasm.js', import.meta.url),
);
// Vite's dev server refuses to serve files outside the app root; allow the parent
// GameBuild/ so it can read GameBuild/engine/.
const gameBuildRoot = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: {
      '@engine': engineArtifact,
    },
  },
  server: {
    fs: {
      allow: [gameBuildRoot],
    },
  },
  test: {
    environment: 'node',
  },
});
