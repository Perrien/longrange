import { describe, it, expect } from 'vitest';
import { PhaseTimer } from './phase-timer';

/** A clock the test drives by hand, so no assertion depends on real timing. */
function fakeClock() {
  let t = 0;
  return { clock: () => t, advance: (ms: number) => (t += ms) };
}

describe('PhaseTimer', () => {
  it('attributes elapsed time to the phase that just ended', () => {
    const { clock, advance } = fakeClock();
    const timer = new PhaseTimer(clock);
    advance(5);
    timer.mark('solve');
    advance(2);
    timer.mark('trace');
    expect(timer.ranked()).toEqual([
      { name: 'solve', ms: 5 },
      { name: 'trace', ms: 2 },
    ]);
    expect(timer.totalMs()).toBe(7);
  });

  // The whole point: on a 25–30 ms shot frame, the reader needs the CULPRIT, and
  // call order is not that. Ranking puts it first regardless of where it ran.
  it('ranks worst-first, not in call order', () => {
    const { clock, advance } = fakeClock();
    const timer = new PhaseTimer(clock);
    advance(1);
    timer.mark('scatter');
    advance(18);
    timer.mark('solve');
    advance(4);
    timer.mark('trace');
    expect(timer.ranked().map((p) => p.name)).toEqual(['solve', 'trace', 'scatter']);
    expect(timer.summary()).toBe('total 23.0 — solve 18.0 · trace 4.0 · scatter 1.0');
  });

  it('counts unmarked trailing work in the total, so nothing hides', () => {
    const { clock, advance } = fakeClock();
    const timer = new PhaseTimer(clock);
    advance(3);
    timer.mark('solve');
    advance(9); // never marked
    expect(timer.totalMs()).toBe(12);
    expect(timer.summary()).toContain('total 12.0');
  });

  it('caps the line length — an iPad readout nobody reads is worthless', () => {
    const { clock, advance } = fakeClock();
    const timer = new PhaseTimer(clock);
    for (const n of ['a', 'b', 'c', 'd', 'e']) {
      advance(1);
      timer.mark(n);
    }
    expect(timer.summary(2).split('·').length).toBe(2);
  });

  it('reports a total even when nothing was marked', () => {
    const { clock, advance } = fakeClock();
    const timer = new PhaseTimer(clock);
    advance(4);
    expect(timer.summary()).toBe('total 4.0');
  });

  it('defaults to a real clock without being handed one', () => {
    const timer = new PhaseTimer();
    timer.mark('work');
    expect(timer.totalMs()).toBeGreaterThanOrEqual(0);
  });
});
