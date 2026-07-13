// The ONLY module that imports the raw engine artifact (via the `@engine` alias;
// owner decision 2026-07-13). Everything else uses the typed bridge in index.ts.
// If the wiring ever changes, only this file changes.
import createBtkModule from '@engine';
import type { BtkModule } from './types';

let modulePromise: Promise<BtkModule> | null = null;

/** Load (once) and cache the Emscripten module instance. */
export function loadBtkModule(): Promise<BtkModule> {
  const cached = modulePromise ?? (modulePromise = createBtkModule());
  return cached;
}
