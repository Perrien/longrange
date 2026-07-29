import { describe, it, expect } from 'vitest';
import {
  FrameTimer,
  FRAME_BUDGET_MS,
  SAMPLE_WINDOW,
  depthResolutionM,
  depthVerdict,
  depthReport,
  readDepthBits,
  MIN_PLATE_STANDOFF_M,
  RenderCostMeter,
  frameUtilisation,
  headroomVerdict,
} from './perf-hud';

describe('FrameTimer', () => {
  it('reports zeros before any sample, and calls that within budget', () => {
    const t = new FrameTimer();
    expect(t.sample()).toEqual({ avgMs: 0, worstMs: 0, fps: 0, withinBudget: true });
  });

  it('averages frame times and derives fps', () => {
    const t = new FrameTimer(4);
    for (const ms of [10, 10, 20, 20]) t.push(ms);
    const s = t.sample();
    expect(s.avgMs).toBeCloseTo(15, 6);
    expect(s.fps).toBeCloseTo(1000 / 15, 6);
  });

  it('reports the worst frame, not just the mean — hitching is what a mean hides', () => {
    const t = new FrameTimer(10);
    for (let i = 0; i < 9; i++) t.push(8);
    t.push(48); // one bad frame
    const s = t.sample();
    expect(s.avgMs).toBeLessThan(FRAME_BUDGET_MS); // mean looks fine
    expect(s.worstMs).toBe(48); // but the spike is visible
  });

  it('is a ring buffer — old samples fall out of the window', () => {
    const t = new FrameTimer(3);
    for (const ms of [100, 100, 100]) t.push(ms);
    expect(t.sample().avgMs).toBeCloseTo(100, 6);
    for (const ms of [10, 10, 10]) t.push(ms);
    expect(t.sample().avgMs).toBeCloseTo(10, 6);
    expect(t.sample().worstMs).toBe(10);
  });

  it('ignores non-finite and non-positive deltas (tab resume reports nonsense)', () => {
    const t = new FrameTimer(4);
    t.push(10);
    t.push(Number.NaN);
    t.push(0);
    t.push(-5);
    t.push(Number.POSITIVE_INFINITY);
    const s = t.sample();
    expect(s.avgMs).toBeCloseTo(10, 6);
    expect(s.worstMs).toBe(10);
  });

  it('flags the budget in both directions', () => {
    const under = new FrameTimer(2);
    under.push(12);
    under.push(12);
    expect(under.sample().withinBudget).toBe(true);

    const over = new FrameTimer(2);
    over.push(20);
    over.push(20);
    expect(over.sample().withinBudget).toBe(false);
  });

  it('resets', () => {
    const t = new FrameTimer(4);
    t.push(33);
    t.reset();
    expect(t.sample().avgMs).toBe(0);
  });

  it('defaults to roughly a second of frames at 60 fps', () => {
    expect(SAMPLE_WINDOW).toBe(60);
  });
});

describe('depthResolutionM', () => {
  // The whole per-range camera decision rests on this: `near` is the lever and
  // `far` is nearly irrelevant. If that ever stops being true, the plan is wrong.
  it('is essentially independent of far — the counter-intuitive part', () => {
    const atNear3k = depthResolutionM(3000, 0.5, 3000, 24);
    const atFar12k = depthResolutionM(3000, 0.5, 12000, 24);
    expect(atNear3k).toBeCloseTo(atFar12k, 2);
    // Both land around a metre, which is why the shipped camera z-fights at 3 km.
    expect(atFar12k).toBeGreaterThan(1);
    expect(atFar12k).toBeLessThan(1.2);
  });

  it('scales with 1/near — raising near 20x buys ~20x precision', () => {
    const coarse = depthResolutionM(3000, 0.5, 12000, 24);
    const fine = depthResolutionM(3000, 10, 12000, 24);
    expect(coarse / fine).toBeGreaterThan(18);
    expect(fine).toBeLessThan(0.06);
  });

  it('grows with the square of distance', () => {
    const near = depthResolutionM(1000, 10, 12000, 24);
    const far = depthResolutionM(3000, 10, 12000, 24);
    expect(far / near).toBeCloseTo(9, 1);
  });

  it('a 16-bit buffer is unusable at 3 km even with the raised near plane', () => {
    // If a device reports 16, the two-pass depth split stops being optional.
    expect(depthResolutionM(3000, 10, 12000, 16)).toBeGreaterThan(10);
  });

  it('returns Infinity for nonsense inputs rather than a plausible-looking number', () => {
    expect(depthResolutionM(0, 10, 12000, 24)).toBe(Number.POSITIVE_INFINITY);
    expect(depthResolutionM(3000, 0, 12000, 24)).toBe(Number.POSITIVE_INFINITY);
    expect(depthResolutionM(3000, 10, 5, 24)).toBe(Number.POSITIVE_INFINITY);
    expect(depthResolutionM(3000, 10, 12000, 0)).toBe(Number.POSITIVE_INFINITY);
  });
});

describe('depthVerdict / depthReport', () => {
  it('grades in depth buckets: >=2 ok, 1-2 marginal, <1 z-fighting', () => {
    expect(depthVerdict(0.05, 0.2)).toBe('ok'); // 4 buckets
    expect(depthVerdict(0.05, 0.075)).toBe('marginal'); // 1.5 buckets
    expect(depthVerdict(0.05, 0.02)).toBe('z-fighting'); // 0.4 buckets
  });

  it('passes the ELR camera reach and fails the shipped one, at 3000 m', () => {
    expect(depthReport(24, 10, 12000, 3000).verdict).toBe('ok');
    expect(depthReport(24, 0.5, 12000, 3000).verdict).toBe('z-fighting');
  });

  // The standoff is a SCENE REQUIREMENT the P1 tests discovered, not a free
  // parameter: at the ELR camera reach a 0.1 m gap is only 1.85 depth buckets and
  // grades marginal, which is the honest verdict for that geometry. P2 must set the
  // plate at least MIN_PLATE_STANDOFF_M off its panel.
  it('the standoff is what makes the ELR reach comfortable rather than marginal', () => {
    expect(depthReport(24, 10, 12000, 3000, 0.1).verdict).toBe('marginal');
    expect(depthReport(24, 10, 12000, 3000, MIN_PLATE_STANDOFF_M).verdict).toBe('ok');
    expect(MIN_PLATE_STANDOFF_M).toBeGreaterThanOrEqual(
      2 * depthResolutionM(3000, 10, 12000, 24),
    );
  });

  it('treats a zero or negative separation as unresolvable rather than passing', () => {
    expect(depthVerdict(0.05, 0)).toBe('z-fighting');
    expect(depthVerdict(0.05, -1)).toBe('z-fighting');
  });

  it('fails a 16-bit device on the ELR camera reach', () => {
    expect(depthReport(16, 10, 12000, 3000).verdict).toBe('z-fighting');
  });

  it('the shipped camera is fine at the ranges it shipped for', () => {
    expect(depthReport(24, 0.5, 3000, 500).verdict).toBe('ok');
  });
});

describe('readDepthBits', () => {
  it('returns 0 for a null context, which grades as z-fighting rather than passing', () => {
    expect(readDepthBits(null)).toBe(0);
    expect(depthVerdict(depthResolutionM(3000, 10, 12000, 0))).toBe('z-fighting');
  });

  it('a 16-bit report is z-fighting even with the standoff — the escalation trigger', () => {
    expect(depthReport(16, 10, 12000, 3000, MIN_PLATE_STANDOFF_M).verdict).toBe('z-fighting');
  });

  it('reads the parameter when the context provides it', () => {
    const gl = { DEPTH_BITS: 0x0d56, getParameter: (p: number) => (p === 0x0d56 ? 24 : null) };
    expect(readDepthBits(gl as unknown as WebGLRenderingContext)).toBe(24);
  });

  it('survives a context that throws or returns nonsense', () => {
    const thrower = {
      DEPTH_BITS: 1,
      getParameter: () => {
        throw new Error('lost context');
      },
    };
    expect(readDepthBits(thrower as unknown as WebGLRenderingContext)).toBe(0);

    const liar = { DEPTH_BITS: 1, getParameter: () => 'twenty-four' };
    expect(readDepthBits(liar as unknown as WebGLRenderingContext)).toBe(0);
  });
});

describe('RenderCostMeter', () => {
  it('averages what it is given', () => {
    const m = new RenderCostMeter(4);
    for (const v of [2, 4, 6, 8]) m.push(v);
    expect(m.meanMs()).toBeCloseTo(5, 9);
  });

  it('rolls, so an old spike stops dominating', () => {
    const m = new RenderCostMeter(3);
    m.push(100);
    m.push(1);
    m.push(1);
    expect(m.meanMs()).toBeCloseTo(34, 9);
    m.push(1);
    expect(m.meanMs()).toBeCloseTo(1, 9);
  });

  it('reads zero before anything is pushed, and after a reset', () => {
    const m = new RenderCostMeter(8);
    expect(m.meanMs()).toBe(0);
    m.push(9);
    m.reset();
    expect(m.meanMs()).toBe(0);
  });
});

describe('frameUtilisation / headroomVerdict', () => {
  // THE CASE THE WHOLE THING EXISTS FOR. Two identical 17 ms frame times that
  // mean opposite things — the capped number alone cannot tell them apart.
  it('separates an idle vsync-capped frame from a saturated one', () => {
    expect(frameUtilisation(3, 17)).toBeCloseTo(0.176, 3);
    expect(headroomVerdict(3, 17)).toBe('roomy');

    expect(frameUtilisation(15, 17)).toBeCloseTo(0.882, 3);
    expect(headroomVerdict(15, 17)).toBe('tight');
  });

  it('calls a blown budget over, whatever the render call says', () => {
    expect(headroomVerdict(15, 30)).toBe('over'); // CPU-side
    expect(headroomVerdict(4, 30)).toBe('over'); // GPU/fill-side
  });

  it('never returns NaN on the first frames, when nothing is averaged yet', () => {
    expect(frameUtilisation(0, 0)).toBe(0);
    expect(frameUtilisation(5, 0)).toBe(0);
    expect(Number.isNaN(frameUtilisation(0, 17))).toBe(false);
  });

  it('clamps rather than reporting more than a whole frame', () => {
    expect(frameUtilisation(40, 17)).toBe(1);
  });
});
