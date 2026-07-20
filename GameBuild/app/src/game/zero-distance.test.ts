// Recommended zero-distance helper tests (task 2.3a, D8).
import { describe, expect, it } from 'vitest';
import { recommendedZeroM } from './zero-distance';
import { yardsToMeters } from '../units/length';

// Catalog cartridge ids: '22lr' = rimfire; '65cm'/'308'/'223' = centrefire.
describe('recommendedZeroM (D8)', () => {
  it('rimfire zeroes at 50 in the active unit — metric (MIL) is 50 m', () => {
    expect(recommendedZeroM('22lr', 'MIL')).toBe(50);
  });

  it('rimfire zeroes at 50 in the active unit — imperial (MOA) is 50 yd in SI', () => {
    expect(recommendedZeroM('22lr', 'MOA')).toBeCloseTo(yardsToMeters(50), 10);
  });

  it('centrefire zeroes at 100 in the active unit — metric (MIL) is 100 m', () => {
    expect(recommendedZeroM('65cm', 'MIL')).toBe(100);
  });

  it('centrefire zeroes at 100 in the active unit — imperial (MOA) is 100 yd in SI', () => {
    expect(recommendedZeroM('65cm', 'MOA')).toBeCloseTo(yardsToMeters(100), 10);
    expect(recommendedZeroM('308', 'MOA')).toBeCloseTo(91.44, 5);
    expect(recommendedZeroM('223', 'MIL')).toBe(100);
  });
});
