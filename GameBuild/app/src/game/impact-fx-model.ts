// Pure impact-FX model (task 1.5c) — the pool bookkeeping and outcome→colour
// choice behind the dust puffs a shot kicks up. Kept framework-, DOM- and
// THREE-free so it unit-tests in the node vitest env (no canvas, no WebGL). The
// ImpactFx renderer (scope/impact-fx.ts) consumes these; it owns the sprites and
// the puff texture.
//
// Same split rationale as the audio module (audio-model.ts ÷ audio-manager.ts):
// the bookkeeping is testable in isolation, the rendering is not.
//
// Design (owner 2026-07-14): a shot ALWAYS kicks a dust puff — a light metallic
// spark on a steel hit, brown dirt on a berm/ground miss. There is no persistent
// impact "mark" (the earlier decal/sprite scuff read wrong on a swinging plate);
// the transient puff carries all the hit/miss feedback.

/** An RGB colour, 0–255 per channel. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** A steel hit: a light, metallic/grey spark puff. */
export const STEEL_PUFF: RgbColor = { r: 220, g: 220, b: 210 };
/** A miss into the berm/ground: a brown dirt puff. */
export const DIRT_PUFF: RgbColor = { r: 156, g: 122, b: 77 };

/** Outcome → puff colour: metallic spark on a steel hit, brown dirt on a miss
 * (plan 1.5c "colour keyed on hitPlateId != null"). */
export function pickPuffColor(hit: boolean): RgbColor {
  return hit ? STEEL_PUFF : DIRT_PUFF;
}

/**
 * A fixed-capacity slot pool with oldest-first recycling and lifetime expiry —
 * the mechanic behind the puff pool. It owns no rendering: it hands out slot
 * indices in [0, capacity) and tracks which are live and how long they've been
 * live (so the renderer can animate size/opacity over each puff's life). The
 * renderer maps each index to a sprite.
 *
 * - `acquire()` reuses a free slot if one exists, otherwise evicts (recycles)
 *   the oldest live slot — so `activeCount` never exceeds `capacity`.
 * - `releaseExpired(dt, lifetimeS)` ages the live slots and frees any past their
 *   lifetime, returning the freed indices.
 * - `ageOf(index)` is the live age (s) for animation, or -1 when free.
 */
export class EffectPool {
  readonly capacity: number;
  /** age[i] ≥ 0 while slot i is live; -1 when free. */
  private readonly age: Float64Array;
  /** Live slots in acquisition order (front = oldest) for eviction. */
  private readonly order: number[] = [];

  constructor(capacity: number) {
    if (!(capacity > 0)) throw new Error('EffectPool capacity must be > 0');
    this.capacity = capacity;
    this.age = new Float64Array(capacity).fill(-1);
  }

  get activeCount(): number {
    return this.order.length;
  }

  isActive(index: number): boolean {
    return index >= 0 && index < this.capacity && this.age[index] >= 0;
  }

  /** Live age in seconds, or -1 if the slot is free. */
  ageOf(index: number): number {
    return this.isActive(index) ? this.age[index] : -1;
  }

  /** Reserve a slot, evicting the oldest if the pool is full. Always returns a
   * valid index; when it recycles, the returned index was previously live (the
   * caller should overwrite that slot's visual). */
  acquire(): number {
    let index = -1;
    for (let i = 0; i < this.capacity; i++) {
      if (this.age[i] < 0) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      // Full: recycle the oldest live slot.
      index = this.order.shift()!;
    }
    this.age[index] = 0;
    this.order.push(index);
    return index;
  }

  /** Free a specific slot (idempotent). */
  release(index: number): void {
    if (!this.isActive(index)) return;
    this.age[index] = -1;
    const at = this.order.indexOf(index);
    if (at >= 0) this.order.splice(at, 1);
  }

  /** Age every live slot by `dt` and free those that reach `lifetimeS`. Returns
   * the indices freed this step (so the renderer can hide them). */
  releaseExpired(dt: number, lifetimeS: number): number[] {
    const freed: number[] = [];
    for (const index of this.order) {
      this.age[index] += dt;
      if (this.age[index] >= lifetimeS) freed.push(index);
    }
    for (const index of freed) this.release(index);
    return freed;
  }
}
