/// <reference types="vitest/config" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` keeps asset URLs relative so the build works under a GitHub Pages
// project subpath; revisited when the Pages base path is finalized (tasks 0.5/0.6).
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    // Default to Node: engine-bridge tests load the WASM module in Node and units
    // tests are pure functions. Component tests opt into jsdom per-file via a
    // `// @vitest-environment jsdom` docblock.
    environment: 'node',
  },
});
