// Shared bookkeeping type for the environment module — mirrors RangeScene's
// `track()` helper (push a disposable, return it unchanged) so terrain/sky/
// lighting builders don't each invent their own disposal contract.
export type TrackFn = <T extends { dispose(): void }>(d: T) => T;
