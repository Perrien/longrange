// Impact-FX model tests (task 1.5c): the puff pool bookkeeping (allocate → cap
// respected → recycle → age) and outcome→colour selection. Pure (no
// canvas/WebGL), so it runs in the node vitest env — see plan 1.5c "Verify".
import { describe, it, expect } from 'vitest';
import { EffectPool, pickPuffColor, STEEL_PUFF, DIRT_PUFF } from './impact-fx-model';

describe('impact-fx-model/pickPuffColor', () => {
  it('picks a metallic spark on a hit, brown dirt on a miss', () => {
    expect(pickPuffColor(true)).toBe(STEEL_PUFF);
    expect(pickPuffColor(false)).toBe(DIRT_PUFF);
  });

  it('hit and miss puff colours differ', () => {
    expect(pickPuffColor(true)).not.toEqual(pickPuffColor(false));
  });
});

describe('impact-fx-model/EffectPool', () => {
  it('rejects a non-positive capacity', () => {
    expect(() => new EffectPool(0)).toThrow();
  });

  it('hands out distinct free slots up to capacity', () => {
    const pool = new EffectPool(3);
    const a = pool.acquire();
    const b = pool.acquire();
    const c = pool.acquire();
    expect(new Set([a, b, c]).size).toBe(3);
    expect(pool.activeCount).toBe(3);
    for (const i of [a, b, c]) expect(pool.isActive(i)).toBe(true);
  });

  it('respects the cap by recycling the OLDEST slot when full', () => {
    const pool = new EffectPool(3);
    const first = pool.acquire(); // oldest
    pool.acquire();
    pool.acquire();
    expect(pool.activeCount).toBe(3);
    const recycled = pool.acquire(); // over cap → evict oldest
    expect(recycled).toBe(first);
    expect(pool.activeCount).toBe(3); // never exceeds capacity
  });

  it('recycles slots on expiry once their lifetime elapses', () => {
    const pool = new EffectPool(4);
    pool.acquire();
    pool.acquire();
    expect(pool.activeCount).toBe(2);

    // Not yet expired.
    expect(pool.releaseExpired(0.4, 1.0)).toEqual([]);
    expect(pool.activeCount).toBe(2);

    // Cumulative age (0.4 + 0.7 = 1.1) crosses the 1.0 s lifetime → both freed.
    const freed = pool.releaseExpired(0.7, 1.0);
    expect(freed.length).toBe(2);
    expect(pool.activeCount).toBe(0);
    for (const i of freed) expect(pool.isActive(i)).toBe(false);
  });

  it('tracks live age for animation and reports -1 when free', () => {
    const pool = new EffectPool(2);
    const a = pool.acquire();
    expect(pool.ageOf(a)).toBe(0);
    pool.releaseExpired(0.3, 1.0);
    expect(pool.ageOf(a)).toBeCloseTo(0.3, 6);
    pool.release(a);
    expect(pool.ageOf(a)).toBe(-1);
  });

  it('frees a slot explicitly and makes it available again', () => {
    const pool = new EffectPool(2);
    const a = pool.acquire();
    pool.acquire();
    pool.release(a);
    expect(pool.activeCount).toBe(1);
    expect(pool.acquire()).toBe(a); // the freed slot is reused first
  });
});
