// rifle-ammo-store S3 tests — spec types, band clamping, preset lookup.
import { describe, expect, it } from 'vitest';
import {
  cartridgeParams,
  clampLoadSpec,
  clampRifleSpec,
  findPreset,
  gradeParams,
  lengthClassCFor,
  presetsForCartridge,
  specFromPreset,
  CARTRIDGE_IDS_V2,
  PRESETS,
} from './spec';

describe('spec — cartridge/grade/preset lookup', () => {
  it('resolves all 10 cartridges and throws on an unknown id', () => {
    expect(CARTRIDGE_IDS_V2).toHaveLength(10);
    for (const id of CARTRIDGE_IDS_V2) expect(cartridgeParams(id).name).toBeTruthy();
    expect(() => cartridgeParams('nope')).toThrow();
  });

  it('resolves both grades and throws on an unknown one', () => {
    expect(gradeParams('match').mvOptimism).toBeGreaterThan(0);
    expect(gradeParams('bulk').mvOptimism).toBeGreaterThan(0);
    // @ts-expect-error deliberately invalid grade
    expect(() => gradeParams('premium')).toThrow();
  });

  it('finds a preset by id and throws on an unknown one', () => {
    expect(findPreset('65cm-match').cartridgeId).toBe('65cm');
    expect(() => findPreset('nope')).toThrow();
  });

  it('presetsForCartridge filters correctly', () => {
    expect(presetsForCartridge('223').map((p) => p.id).sort()).toEqual(['223-bulk', '223-match']);
    expect(presetsForCartridge('6cm')).toEqual([]); // no shipped preset for this cartridge
  });

  it('lengthClassCFor covers every cartridge exactly once', () => {
    for (const id of CARTRIDGE_IDS_V2) expect(lengthClassCFor(id)).toBeGreaterThan(0);
  });

  it('PRESETS re-exports all 10 authored presets', () => {
    expect(PRESETS).toHaveLength(10);
  });
});

describe('clampRifleSpec', () => {
  it('clamps barrel length to the cartridge band', () => {
    const c = cartridgeParams('65cm');
    expect(clampRifleSpec({ cartridgeId: '65cm', barrelLengthIn: 999, twistIn: 8 }).barrelLengthIn).toBe(
      c.barrelBandIn.max,
    );
    expect(clampRifleSpec({ cartridgeId: '65cm', barrelLengthIn: -5, twistIn: 8 }).barrelLengthIn).toBe(
      c.barrelBandIn.min,
    );
  });

  it('passes an in-band barrel length through unchanged', () => {
    expect(clampRifleSpec({ cartridgeId: '65cm', barrelLengthIn: 24, twistIn: 8 }).barrelLengthIn).toBe(24);
  });

  it('snaps an off-list twist to the nearest option; leaves a valid one alone', () => {
    // 65cm options: 8.5, 8, 7.5
    expect(clampRifleSpec({ cartridgeId: '65cm', barrelLengthIn: 26, twistIn: 7.9 }).twistIn).toBe(8);
    expect(clampRifleSpec({ cartridgeId: '65cm', barrelLengthIn: 26, twistIn: 7.5 }).twistIn).toBe(7.5);
  });
});

describe('clampLoadSpec', () => {
  it('clamps weight and i7 to the cartridge band', () => {
    const c = cartridgeParams('223');
    const clamped = clampLoadSpec({ cartridgeId: '223', weightGr: 9999, i7: 9999, grade: 'match' });
    expect(clamped.weightGr).toBe(c.weightRangeGr!.max);
    expect(clamped.i7).toBe(c.i7Range!.max);
  });

  it('is a no-op for .22 LR (presets-only, no band)', () => {
    const spec = { cartridgeId: '22lr', weightGr: 40, i7: 0, grade: 'match' as const };
    expect(clampLoadSpec(spec)).toEqual(spec);
  });
});

describe('specFromPreset', () => {
  it('builds a LoadSpec matching the preset for a G7 cartridge', () => {
    const spec = specFromPreset('308-bulk');
    expect(spec).toEqual({ cartridgeId: '308', weightGr: 147, i7: 1.135, grade: 'bulk', presetId: '308-bulk' });
  });

  it('builds a LoadSpec with i7=0 for a rimfire (G1) preset', () => {
    const spec = specFromPreset('22lr-match');
    expect(spec.cartridgeId).toBe('22lr');
    expect(spec.i7).toBe(0);
    expect(spec.presetId).toBe('22lr-match');
  });
});
