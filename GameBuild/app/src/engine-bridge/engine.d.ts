// Ambient declaration for the `@engine` alias (owner decision 2026-07-13): the
// single-file Emscripten ES module built at GameBuild/engine/build-wasm/. This is
// the ONLY place the module's shape is declared to TypeScript; the only runtime
// import of `@engine` is in wasm-module.ts.
declare module '@engine' {
  import type { BtkModuleFactory } from './types';
  const createBtkModule: BtkModuleFactory;
  export default createBtkModule;
}
