// Pure impact-FX model (task 1.5c) — the pool bookkeeping and outcome→colour
// choices behind bullet impact marks and dust puffs. Kept framework-, DOM- and
// THREE-free so it unit-tests in the node vitest env (no canvas, no WebGL). The
// ImpactFx renderer (scope/impact-fx.ts) consumes these; it owns the sprites,
// the dust shader, and the textures.
//
// Same split rationale as the audio module (audio-model.ts ÷ audio-manager.ts):
// the physics/bookkeeping is testable in isolation, the rendering is not.

/** An RGB colour, 0–255 per channel — the shape DustCloud's reset() expects. */
export interface RgbColor {
  r: number;
  g: number;
  b: number;
}

/** The two colour choices an impact drives: a multiply-tint for the persistent
 * mark sprite, and the dust-puff RGB. */
export interface ImpactColor {
  /** Multiply-blend tint for the impact-mark sprite (hex). */
  markHex: number;
  /** Dust-puff colour (0–255 RGB). */
  dust: RgbColor;
}

/** A steel hit: a dark metallic scuff on the plate + a grey/metallic spark puff. */
export const STEEL_IMPACT: ImpactColor = {
  markHex: 0x2b2b2b,
  dust: { r: 205, g: 205, b: 195 },
};
/** A miss into the berm/ground: no mark (there's no plate to mark), a brown
 * dirt puff. `markHex` is unused for misses but kept for a total colour. */
export const DIRT_IMPACT: ImpactColor = {
  markHex: 0x3d2817,
  dust: { r: 150, g: 116, b: 72 },
};

/** Outcome → colours: metallic spark on a steel hit, brown dirt on a miss
 * (plan 1.5c "colour keyed on hitPlateId != null"). */
export function pickImpactColor(hit: boolean): ImpactColor {
  return hit ? STEEL_IMPACT : DIRT_IMPACT;
}

/**
 * A fixed-capacity slot pool with oldest-first recycling — the shared mechanic
 * behind both effect pools. It owns no rendering: it hands out slot indices in
 * [0, capacity) and tracks which are live and how long they've been live. The
 * renderer maps each index to a sprite / dust cloud.
 *
 * - `acquire()` reuses a free slot if one exists, otherwise evicts (recycles)
 *   the oldest live slot — so `activeCount` never exceeds `capacity`.
 * - `releaseExpired(dt, lifetimeS)` ages the live slots and frees any past their
 *   lifetime (dust puffs fade and recycle). Marks never call this — they persist
 *   until evicted by a later `acquire()`.
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
