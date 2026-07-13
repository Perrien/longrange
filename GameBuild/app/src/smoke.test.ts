import { describe, it, expect } from 'vitest';

// Smoke test (task 0.4a): confirms the Vitest toolchain runs. Replaced by real
// units/engine tests in 0.4b/0.4c.
describe('smoke', () => {
  it('runs arithmetic', () => {
    expect(1 + 1).toBe(2);
  });
});
