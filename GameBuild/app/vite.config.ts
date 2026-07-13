/// <reference types="vitest/config" />
import { fileURLToPath, URL } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

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
  plugins: [
    react(),
    // PWA shell (task 0.6): installable, launches offline (hard constraint §0.1).
    // registerType 'prompt' per build-plan §7 — the new SW waits for user consent
    // (UpdateToast), never swaps mid-session. Everything the app needs at runtime
    // is precached; the engine WASM is embedded in the JS bundle (SINGLE_FILE=1),
    // so **/*.js covers it. No CDN/runtime-network dependencies allowed.
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['apple-touch-icon.png'],
      manifest: {
        name: 'LongRange',
        short_name: 'LongRange',
        description: 'Simulation-first long-range rifle shooting game',
        start_url: '.',
        scope: '.',
        display: 'standalone',
        orientation: 'landscape',
        background_color: '#1a222c',
        theme_color: '#1a222c',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg,woff2,webmanifest}'],
        // The WASM-embedding JS bundle exceeds Workbox's 2 MiB default.
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
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
