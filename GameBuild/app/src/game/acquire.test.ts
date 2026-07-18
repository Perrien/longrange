// Task 2.2b tests — acquisition rolls per-field draws, builds valid records, and
// (with the same catalog ranges) two copies resolve to different truth. Pure;
// deterministic via an injected rng.
import { describe, expect, it } from 'vitest';
import {
  LOT_DRAW_FIELDS,
  RIFLE_DRAW_FIELDS,
  buildAmmoLot,
  buildRifleInstance,
  newId,
  rollDraws,
} from './acquire';
import { CATALOG_VERSION, catalogRifleRanges } from './catalog';
import { deriveRifleTruth } from './hidden-truth';

/** Deterministic rng cycling through a fixed sequence (for reproducible draws). */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[i++ % values.length];
}

describe('rollDraws', () => {
  it('produces one draw per field, each in [0,1)', () => {
    const draws = rollDraws(RIFLE_DRAW_FIELDS, seqRng([0.1, 0.5, 0.9, 0.3]));
    expect(Object.keys(draws).sort()).toEqual([...RIFLE_DRAW_FIELDS].sort());
    for (const v of Object.values(draws)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });

  it('clamps a misbehaving rng into [0,1)', () => {
    const draws = rollDraws(['a', 'b'], seqRng([-0.2, 1.5]));
    expect(draws.a).toBe(0);
    expect(draws.b).toBeLessThan(1);
    expect(draws.b).toBeGreaterThan(0.99);
  });

  it('lot draw fields include bcError (maps to the bc range), not bc', () => {
    expect(LOT_DRAW_FIELDS).toContain('bcError');
    expect(LOT_DRAW_FIELDS).not.toContain('bc');
  });
});

describe('buildRifleInstance / buildAmmoLot', () => {
  it('builds a valid record stamped with the catalog version', () => {
    const r = buildRifleInstance('65cm-custom', { rng: seqRng([0.5]), id: 'r1' });
    expect(r).toEqual({
      id: 'r1',
      catalogId: '65cm-custom',
      catalogVersion: CATALOG_VERSION,
      draws: { mvOffset: 0.5, zeroH: 0.5, zeroV: 0.5, inherentPrecision: 0.5 },
    });
    const l = buildAmmoLot('65cm-match', { rng: seqRng([0.5]), id: 'l1' });
    expect(Object.keys(l.draws).sort()).toEqual([...LOT_DRAW_FIELDS].sort());
    expect(l.catalogId).toBe('65cm-match');
  });

  it('rejects an unknown catalog id', () => {
    expect(() => buildRifleInstance('nope', { rng: seqRng([0.5]), id: 'x' })).toThrow();
    expect(() => buildAmmoLot('nope', { rng: seqRng([0.5]), id: 'x' })).toThrow();
  });

  it('two copies of the same model get different draws → different resolved truth', () => {
    const ranges = catalogRifleRanges('308-factoryMatch');
    const a = buildRifleInstance('308-factoryMatch', { rng: seqRng([0.2, 0.5, 0.5, 0.5]), id: 'a' });
    const b = buildRifleInstance('308-factoryMatch', { rng: seqRng([0.8, 0.5, 0.5, 0.5]), id: 'b' });
    const ta = deriveRifleTruth(ranges, a.draws);
    const tb = deriveRifleTruth(ranges, b.draws);
    expect(ta.mvOffsetMps).not.toBe(tb.mvOffsetMps);
    // Copy a drew low (0.2) → below nominal 0; copy b high (0.8) → above.
    expect(ta.mvOffsetMps).toBeLessThan(0);
    expect(tb.mvOffsetMps).toBeGreaterThan(0);
  });
});

describe('newId', () => {
  it('is unique and prefixed', () => {
    const a = newId('rifle');
    const b = newId('rifle');
    expect(a).not.toBe(b);
    expect(a.startsWith('rifle-')).toBe(true);
  });
});
