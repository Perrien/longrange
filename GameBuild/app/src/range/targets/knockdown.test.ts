// Tests for the knockdown state machine (task T6).
//
// This is the one part of the knockdown feature that CAN be proven programmatically —
// scene behaviour cannot be unit-tested in this repo — so it is tested properly:
// phase transitions, the physical invariants (harder hit → faster fall, SAME latch
// angle), and the out-of-play window.

import { describe, it, expect } from 'vitest';
import {
  isStandingPhase,
  resetKnockdown,
  seedFallRate,
  standingState,
  steelPlateMassKg,
  stepKnockdown,
  strikeKnockdown,
  type KnockdownState,
} from './knockdown';
import { getMountType } from './mount-registry';
import type { KnockdownSpec } from './mount-type';

const CFG: KnockdownSpec = getMountType('hinge-stem').knockdown!;
const DT = 1 / 60;

/** Step until `predicate` holds, or give up. Returns the state and the step count. */
function runUntil(
  start: KnockdownState,
  predicate: (s: KnockdownState) => boolean,
  maxSteps = 6000,
): { state: KnockdownState; steps: number } {
  let state = start;
  for (let i = 0; i < maxSteps; i++) {
    if (predicate(state)) return { state, steps: i };
    state = stepKnockdown(state, DT, CFG);
  }
  throw new Error(`never satisfied predicate; ended in '${state.phase}' at ${state.angleRad}`);
}

const struck = (seed = 5) => strikeKnockdown(standingState(), seed);

describe('phase machine', () => {
  it('starts standing, upright and still', () => {
    const s = standingState();
    expect(s).toEqual({ phase: 'standing', angleRad: 0, rateRadS: 0, phaseSinceS: 0 });
  });

  it('does nothing at all while standing — a standing plate is not animating', () => {
    const s = standingState();
    expect(stepKnockdown(s, DT, CFG)).toBe(s); // same object: no work, no churn
  });

  it('runs standing → falling → down → rising → standing', () => {
    const seen: string[] = [];
    let s = struck();
    seen.push(s.phase);
    for (let i = 0; i < 6000 && !(s.phase === 'standing' && seen.length > 1); i++) {
      s = stepKnockdown(s, DT, CFG);
      if (seen[seen.length - 1] !== s.phase) seen.push(s.phase);
    }
    expect(seen).toEqual(['falling', 'down', 'rising', 'standing']);
  });

  it('is deterministic — identical inputs give identical trajectories', () => {
    const a = runUntil(struck(), (s) => s.phase === 'down');
    const b = runUntil(struck(), (s) => s.phase === 'down');
    expect(a.steps).toBe(b.steps);
    expect(a.state).toEqual(b.state);
  });

  it('ignores dt ≤ 0 rather than integrating backwards', () => {
    const s = struck();
    expect(stepKnockdown(s, 0, CFG)).toBe(s);
    expect(stepKnockdown(s, -DT, CFG)).toBe(s);
  });
});

describe('falling', () => {
  it('latches at the configured angle and stops there', () => {
    const { state } = runUntil(struck(), (s) => s.phase === 'down');
    expect(state.angleRad).toBeCloseTo((CFG.fallAngleDeg * Math.PI) / 180, 12);
    expect(state.rateRadS).toBe(0);
  });

  it('never overshoots the latch, however hard it is hit', () => {
    // Clamping rather than overshooting matters: the stop is physical, and an
    // overshoot would render the plate past horizontal.
    const latch = (CFG.fallAngleDeg * Math.PI) / 180;
    for (const seed of [1, 10, 100, 1000]) {
      const { state } = runUntil(struck(seed), (s) => s.phase === 'down');
      expect(state.angleRad).toBeCloseTo(latch, 12);
    }
  });

  it('falls FASTER when hit harder, but latches at the SAME angle', () => {
    // The physical invariant: fall speed comes from the shot, the down angle from the
    // hardware. If a harder hit changed the resting angle, the plate would look like
    // it had different geometry per shot.
    const soft = runUntil(struck(2), (s) => s.phase === 'down');
    const hard = runUntil(struck(20), (s) => s.phase === 'down');
    expect(hard.steps).toBeLessThan(soft.steps);
    expect(hard.state.angleRad).toBeCloseTo(soft.state.angleRad, 12);
  });

  it('accelerates under gravity — the angle grows superlinearly', () => {
    // θ̈ = (3g/2L)·sin θ, so later steps cover more ground than earlier ones.
    let s = struck(0.5);
    const angles: number[] = [];
    for (let i = 0; i < 30; i++) {
      s = stepKnockdown(s, DT, CFG);
      angles.push(s.angleRad);
    }
    const early = angles[9] - angles[8];
    const late = angles[29] - angles[28];
    expect(late).toBeGreaterThan(early);
  });

  it('topples from a dead-centre hit that imparts no rotation of its own', () => {
    // sin(0) = 0 is a fixed point: without nudging off vertical, a plate struck
    // exactly at its hinge would stand forever despite a real impulse.
    const s = strikeKnockdown(standingState(), 0);
    expect(s.phase).toBe('falling');
    expect(s.angleRad).toBeGreaterThan(0);
    const { state } = runUntil(s, (x) => x.phase === 'down');
    expect(state.phase).toBe('down');
  });

  it('takes an extra impulse from a second hit while still toppling', () => {
    let s = struck(1);
    for (let i = 0; i < 5; i++) s = stepKnockdown(s, DT, CFG);
    const before = s.rateRadS;
    s = strikeKnockdown(s, 10);
    expect(s.phase).toBe('falling');
    expect(s.rateRadS).toBeCloseTo(before + 10, 9);
  });
});

describe('down + rising', () => {
  it('dwells for the configured time before starting to rise', () => {
    const down = runUntil(struck(), (s) => s.phase === 'down');
    const rise = runUntil(down.state, (s) => s.phase === 'rising');
    expect(rise.steps * DT).toBeGreaterThanOrEqual(CFG.downDwellS - DT);
    expect(rise.steps * DT).toBeLessThanOrEqual(CFG.downDwellS + DT);
  });

  it('rises at a CONSTANT rate — a reset motor is mechanical, not gravitational', () => {
    let s = runUntil(struck(), (x) => x.phase === 'rising').state;
    const deltas: number[] = [];
    for (let i = 0; i < 10; i++) {
      const before = s.angleRad;
      s = stepKnockdown(s, DT, CFG);
      deltas.push(before - s.angleRad);
    }
    const expected = ((CFG.resetRateDegS * Math.PI) / 180) * DT;
    for (const d of deltas) expect(d).toBeCloseTo(expected, 9);
  });

  it('comes to rest exactly upright, not slightly past', () => {
    const { state } = runUntil(struck(), (s) => s.phase === 'standing' && s.angleRad === 0);
    expect(state).toEqual(standingState());
  });

  it('takes roughly the expected time to come back up', () => {
    // 80° at 60°/s ≈ 1.33 s. A sanity check on the units, which is the easiest thing
    // to get wrong here (deg vs rad).
    const rising = runUntil(struck(), (s) => s.phase === 'rising');
    const up = runUntil(rising.state, (s) => s.phase === 'standing');
    expect(up.steps * DT).toBeCloseTo(CFG.fallAngleDeg / CFG.resetRateDegS, 1);
  });

  it('IGNORES a hit while down or rising — a fallen target is out of play', () => {
    const down = runUntil(struck(), (s) => s.phase === 'down').state;
    expect(strikeKnockdown(down, 50)).toBe(down);
    const rising = runUntil(down, (s) => s.phase === 'rising').state;
    expect(strikeKnockdown(rising, 50)).toBe(rising);
  });
});

describe('out-of-play window', () => {
  it('is standing while upright and while toppling, out of play once down', () => {
    // A toppling plate is still hittable — it is in the air, not yet scored down.
    expect(isStandingPhase('standing')).toBe(true);
    expect(isStandingPhase('falling')).toBe(true);
    expect(isStandingPhase('down')).toBe(false);
    expect(isStandingPhase('rising')).toBe(false);
  });

  it('stays out of play for the WHOLE down+rising window, with no gap', () => {
    // The failure this catches: becoming hittable again the instant it starts rising,
    // so a shot could hit a plate lying at 80°.
    let s = runUntil(struck(), (x) => x.phase === 'down').state;
    let sawRising = false;
    for (let i = 0; i < 6000; i++) {
      if (s.phase === 'standing') break;
      expect(isStandingPhase(s.phase)).toBe(false);
      if (s.phase === 'rising') sawRising = true;
      s = stepKnockdown(s, DT, CFG);
    }
    expect(sawRising).toBe(true); // the loop really did cover the rising phase
    expect(s.phase).toBe('standing');
  });
});

describe('reset', () => {
  it('stands a target up immediately, from any phase', () => {
    for (const phase of ['down', 'rising'] as const) {
      const s = runUntil(struck(), (x) => x.phase === phase).state;
      expect(resetKnockdown()).toEqual(standingState());
      expect(isStandingPhase(resetKnockdown().phase)).toBe(true);
      expect(s.phase).toBe(phase); // the source state is untouched (pure)
    }
  });
});

describe('seedFallRate', () => {
  it('scales with impulse and moment arm, inversely with mass and length²', () => {
    const base = { impulseNs: 6, impactHeightM: 1, massKg: 5, stemLengthM: 1 };
    expect(seedFallRate(base)).toBeCloseTo((3 * 6 * 1) / (5 * 1), 9);
    expect(seedFallRate({ ...base, impulseNs: 12 })).toBeCloseTo(2 * seedFallRate(base), 9);
    expect(seedFallRate({ ...base, impactHeightM: 2 })).toBeCloseTo(2 * seedFallRate(base), 9);
    expect(seedFallRate({ ...base, massKg: 10 })).toBeCloseTo(seedFallRate(base) / 2, 9);
    expect(seedFallRate({ ...base, stemLengthM: 2 })).toBeCloseTo(seedFallRate(base) / 4, 9);
  });

  it('gives no rotation for a hit AT the hinge', () => {
    expect(seedFallRate({ impulseNs: 6, impactHeightM: 0, massKg: 5, stemLengthM: 1 })).toBe(0);
  });

  it('never returns a negative rate for a hit below the hinge', () => {
    expect(seedFallRate({ impulseNs: 6, impactHeightM: -0.5, massKg: 5, stemLengthM: 1 })).toBe(0);
  });

  it('returns 0 rather than Infinity for degenerate mass or length', () => {
    expect(seedFallRate({ impulseNs: 6, impactHeightM: 1, massKg: 0, stemLengthM: 1 })).toBe(0);
    expect(seedFallRate({ impulseNs: 6, impactHeightM: 1, massKg: 5, stemLengthM: 0 })).toBe(0);
  });

  it('a real .308 hit topples a real popper in well under a second', () => {
    // End-to-end sanity with real numbers: a 168 gr (.0109 kg) bullet at 600 m/s into
    // a 3/8" 12"×42" steel popper, struck 1 m above the hinge.
    const massKg = steelPlateMassKg(0.3048, 1.0668, 0.009525);
    const rate = seedFallRate({
      impulseNs: 0.0109 * 600,
      impactHeightM: 1,
      massKg,
      stemLengthM: CFG.stemLengthM,
    });
    expect(rate).toBeGreaterThan(0);
    const { steps } = runUntil(strikeKnockdown(standingState(), rate), (s) => s.phase === 'down');
    expect(steps * DT).toBeLessThan(1);
    expect(steps).toBeGreaterThan(1); // not instantaneous either
  });
});

describe('steelPlateMassKg', () => {
  it('is the bounding box in steel', () => {
    // 12" × 12" × 3/8" mild steel ≈ 6.9 kg — the right order for a plate you can lift.
    const m = steelPlateMassKg(0.3048, 0.3048, 0.009525);
    expect(m).toBeCloseTo(0.3048 * 0.3048 * 0.009525 * 7850, 9);
    expect(m).toBeGreaterThan(6);
    expect(m).toBeLessThan(8);
  });

  it('scales linearly in every dimension', () => {
    const base = steelPlateMassKg(0.3, 0.3, 0.01);
    expect(steelPlateMassKg(0.6, 0.3, 0.01)).toBeCloseTo(2 * base, 9);
    expect(steelPlateMassKg(0.3, 0.6, 0.01)).toBeCloseTo(2 * base, 9);
    expect(steelPlateMassKg(0.3, 0.3, 0.02)).toBeCloseTo(2 * base, 9);
  });
});
