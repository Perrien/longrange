// Pure superposition math tests (task 1.7a, D2/D3b). No engine, no WASM.
import { describe, it, expect } from 'vitest';
import { superposeWind, gustScaleFor } from './wind-superposition';

describe('wind-superposition/superposeWind (D2)', () => {
  const mean = { dropM: -1.2, windageM: 0.05 };
  const zero = { dropM: -1.0, windageM: 0.0 };
  const field = { dropM: -1.3, windageM: 0.2 };

  it('gustScale=0 reduces to the mean solve exactly — the Steady-mode identity', () => {
    const out = superposeWind({ mean, zero, field, gustScale: 0 });
    expect(out.dropM).toBe(mean.dropM);
    expect(out.windageM).toBe(mean.windageM);
  });

  it('applies the full field-minus-zero delta at gustScale=1', () => {
    const out = superposeWind({ mean, zero, field, gustScale: 1 });
    expect(out.dropM).toBeCloseTo(mean.dropM + (field.dropM - zero.dropM), 12);
    expect(out.windageM).toBeCloseTo(mean.windageM + (field.windageM - zero.windageM), 12);
  });

  it('scales the delta proportionally at a fractional gustScale', () => {
    const out = superposeWind({ mean, zero, field, gustScale: 0.5 });
    expect(out.dropM).toBeCloseTo(mean.dropM + 0.5 * (field.dropM - zero.dropM), 12);
    expect(out.windageM).toBeCloseTo(mean.windageM + 0.5 * (field.windageM - zero.windageM), 12);
  });

  it('when field===zero (no gust contribution at this instant), reduces to the mean at any gustScale', () => {
    const out = superposeWind({ mean, zero, field: zero, gustScale: 3 });
    expect(out.dropM).toBe(mean.dropM);
    expect(out.windageM).toBe(mean.windageM);
  });
});

describe('wind-superposition/gustScaleFor (D3b)', () => {
  it('scales linearly with the mean speed', () => {
    expect(gustScaleFor(0, 4.4704)).toBe(0);
    expect(gustScaleFor(4.4704, 4.4704)).toBeCloseTo(1, 9);
    expect(gustScaleFor(8.9408, 4.4704)).toBeCloseTo(2, 9);
  });

  it('clamps a negative mean speed to 0 (dead calm, never inverted)', () => {
    expect(gustScaleFor(-3, 4.4704)).toBe(0);
  });
});
