// Pure-helper tests for the Update BC dialog (bc-truing-plan T3).
import { describe, it, expect } from 'vitest';
import {
  canUpdateBc,
  angleRadToDisplay,
  angleDisplayToRad,
  plausibleBcBand,
  formatBcRejection,
  UPDATE_BC_DISABLED_REASON,
} from './bc-update';
import { milToRad, moaToRad } from '../units/angle';
import { yardsToMeters } from '../units/length';
import type { BcFitResult } from '../engine-bridge/bc-fit';

describe('canUpdateBc (B3)', () => {
  it('enabled only with gear AND a committed target', () => {
    expect(canUpdateBc(true, true)).toBe(true);
    expect(canUpdateBc(true, false)).toBe(false);
    expect(canUpdateBc(false, true)).toBe(false);
    expect(canUpdateBc(false, false)).toBe(false);
  });

  it('exposes a one-line disabled reason', () => {
    expect(UPDATE_BC_DISABLED_REASON).toMatch(/target/);
  });
});

describe('angleRadToDisplay / angleDisplayToRad (B1/B6)', () => {
  it('MIL: 1 mrad = 1000x rad, and round-trips', () => {
    const rad = milToRad(10.3);
    expect(angleRadToDisplay(rad, 'MIL')).toBeCloseTo(10.3, 9);
    expect(angleDisplayToRad(10.3, 'MIL')).toBeCloseTo(rad, 12);
  });

  it('MOA: matches radToMoa/moaToRad, and round-trips', () => {
    const rad = moaToRad(35.4);
    expect(angleRadToDisplay(rad, 'MOA')).toBeCloseTo(35.4, 6);
    expect(angleDisplayToRad(35.4, 'MOA')).toBeCloseTo(rad, 9);
  });

  it('a value round-trips through display and back to the same radians', () => {
    for (const [rad, units] of [
      [0.003, 'MIL'],
      [0.003, 'MOA'],
      [-0.0012, 'MIL'],
    ] as const) {
      const back = angleDisplayToRad(angleRadToDisplay(rad, units), units);
      expect(back).toBeCloseTo(rad, 9);
    }
  });
});

describe('plausibleBcBand (B4)', () => {
  it('is [0.5x, 2.0x] the box BC', () => {
    expect(plausibleBcBand(0.243)).toEqual({ bcMin: 0.1215, bcMax: 0.486 });
  });
});

describe('formatBcRejection (B2)', () => {
  const needsMoreBc: Extract<BcFitResult, { ok: false }> = {
    ok: false,
    reason: 'needs-more-bc',
    achievableMinRad: milToRad(0.3),
    achievableMaxRad: milToRad(2.1),
  };

  it('MIL: reports the distance in meters and the band in MIL', () => {
    const msg = formatBcRejection(needsMoreBc, 800, 'MIL');
    expect(msg).toContain('800 m');
    expect(msg).toContain('0.30');
    expect(msg).toContain('2.10');
    expect(msg).toContain('MIL');
    expect(msg).toMatch(/chronograph/i);
  });

  it('MOA: reports the distance in yards and the band in MOA', () => {
    const msg = formatBcRejection(needsMoreBc, yardsToMeters(875), 'MOA');
    expect(msg).toContain('875 yd');
    expect(msg).toContain('MOA');
  });

  it('achievable bounds are always reported low-to-high regardless of reason', () => {
    const needsLessBc: Extract<BcFitResult, { ok: false }> = {
      ok: false,
      reason: 'needs-less-bc',
      achievableMinRad: milToRad(0.3),
      achievableMaxRad: milToRad(2.1),
    };
    const msg = formatBcRejection(needsLessBc, 800, 'MIL');
    const loIdx = msg.indexOf('0.30');
    const hiIdx = msg.indexOf('2.10');
    expect(loIdx).toBeGreaterThan(-1);
    expect(hiIdx).toBeGreaterThan(loIdx);
  });
});
