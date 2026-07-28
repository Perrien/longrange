// Frame-time + depth-precision readout — step P1 of `Design/elr-probe-plan.md`.
//
// Pure model, no DOM/THREE, so the smoothing and the verdicts are unit-testable.
// `PerfHud` in ScopeView renders whatever `sample()` returns.
//
// WHY THIS EXISTS. Two of the probe's questions are unanswerable without an
// on-screen number:
//
//   1. **Frame time at 3 km.** The <16 ms gate has been checked with external
//      tooling before now; the probe needs it visible while flying the scope
//      around, because the interesting case is "does it dip when the far station
//      is in view", which a spot measurement misses.
//   2. **Depth bits.** The whole per-range `near = 10` decision assumes a 24-bit
//      depth buffer. At 16 bits the same configuration resolves ~13.7 m at 3000 m
//      instead of ~0.054 m, which is unusable, and the two-pass depth split stops
//      being a fallback and becomes mandatory. WebGL2 usually gives 24, but
//      "usually" is not a thing to build a range on — so read it and print it.

/** Frame-time gate the project holds itself to (ms). */
export const FRAME_BUDGET_MS = 16;

/**
 * How many frames the rolling average spans. ~1 s at 60 fps: long enough that the
 * number is readable rather than strobing, short enough that a stutter while
 * panning onto the far station still shows up.
 */
export const SAMPLE_WINDOW = 60;

export interface PerfSample {
  /** Rolling mean frame time (ms). */
  avgMs: number;
  /** Worst frame in the window (ms) — the number that actually reveals hitching;
   *  a mean of 14 with a 40 ms spike still feels broken. */
  worstMs: number;
  /** Mean frames per second, derived from `avgMs`. */
  fps: number;
  /** Whether the rolling mean is inside `FRAME_BUDGET_MS`. */
  withinBudget: boolean;
}

/**
 * Rolling frame-time accumulator. Fixed-size ring buffer — no allocation per
 * frame, because a perf readout that allocates is measuring itself.
 */
export class FrameTimer {
  private readonly samples: Float64Array;
  private index = 0;
  private count = 0;

  constructor(window: number = SAMPLE_WINDOW) {
    this.samples = new Float64Array(Math.max(1, window));
  }

  /** Record one frame's duration (ms). Non-finite and non-positive values are
   *  ignored — the first frame after a tab resume reports nonsense. */
  push(deltaMs: number): void {
    if (!Number.isFinite(deltaMs) || deltaMs <= 0) return;
    this.samples[this.index] = deltaMs;
    this.index = (this.index + 1) % this.samples.length;
    if (this.count < this.samples.length) this.count++;
  }

  /** Current rolling statistics. Returns zeros before the first sample. */
  sample(): PerfSample {
    if (this.count === 0) {
      return { avgMs: 0, worstMs: 0, fps: 0, withinBudget: true };
    }
    let total = 0;
    let worst = 0;
    for (let i = 0; i < this.count; i++) {
      const v = this.samples[i];
      total += v;
      if (v > worst) worst = v;
    }
    const avgMs = total / this.count;
    return {
      avgMs,
      worstMs: worst,
      fps: 1000 / avgMs,
      withinBudget: avgMs <= FRAME_BUDGET_MS,
    };
  }

  reset(): void {
    this.index = 0;
    this.count = 0;
  }
}

/**
 * Smallest depth difference (m) a buffer can resolve at distance `z`, for a
 * perspective camera.
 *
 * `Δz = z²(f − n) / ((2^bits − 1) · f · n)` — the standard non-linear depth
 * precision result. The thing worth internalising is that it scales with **1/near**
 * and is almost independent of **far**: going from `far = 3000` to `far = 12000` at
 * `near = 0.5` leaves the 3000 m figure unchanged at ~1.07 m, while raising `near`
 * from 0.5 to 10 improves it 20-fold.
 */
export function depthResolutionM(z: number, nearM: number, farM: number, bits: number): number {
  if (!(z > 0) || !(nearM > 0) || !(farM > nearM) || !(bits > 0)) return Number.POSITIVE_INFINITY;
  return (z * z * (farM - nearM)) / ((Math.pow(2, bits) - 1) * farM * nearM);
}

/**
 * The tightest depth pair the probe scene contains (m) — a gong standing proud of
 * its backer panel. Everything else in the scene is far more separated.
 *
 * **This is a SCENE CONSTRUCTION REQUIREMENT, not just a diagnostic.** At the probe's
 * camera reach the depth buffer resolves ~0.054 m at 3000 m, so a gong set only
 * ~0.1 m off its panel is 1.85 buckets apart — inside the band where quantisation
 * can drop both surfaces into the same bucket and flicker. 0.15 m puts it at 2.8
 * buckets, comfortably clear.
 *
 * Found by the P1 tests rather than assumed: the first draft used 0.1 m and graded
 * `marginal`, which is the correct verdict for that geometry. The answer was to
 * move the plate, not to loosen the grade.
 */
export const MIN_PLATE_STANDOFF_M = 0.15;

export type DepthVerdict = 'ok' | 'marginal' | 'z-fighting';

/**
 * Verdict for a depth resolution against the separation the scene actually needs,
 * so the readout says what the number *means* rather than making the reader do the
 * arithmetic mid-session.
 *
 * Two surfaces separated by Δ with buffer resolution r render distinctly when
 * Δ > r; they are only *comfortable* at Δ ≥ 2r, because quantisation boundaries
 * fall wherever they fall. Hence: ≥2 buckets `ok`, 1–2 buckets `marginal`, under
 * one bucket `z-fighting`.
 */
export function depthVerdict(
  resolutionM: number,
  separationM: number = MIN_PLATE_STANDOFF_M,
): DepthVerdict {
  if (!(separationM > 0)) return 'z-fighting';
  const buckets = separationM / resolutionM;
  if (buckets >= 2) return 'ok';
  if (buckets >= 1) return 'marginal';
  return 'z-fighting';
}

export interface DepthReport {
  bits: number;
  nearM: number;
  farM: number;
  /** Distance the report is evaluated at (m) — the range's far station. */
  atM: number;
  resolutionM: number;
  verdict: DepthVerdict;
}

/** Build the depth report for a range's camera reach and far station. */
export function depthReport(
  bits: number,
  nearM: number,
  farM: number,
  atM: number,
  separationM: number = MIN_PLATE_STANDOFF_M,
): DepthReport {
  const resolutionM = depthResolutionM(atM, nearM, farM, bits);
  return { bits, nearM, farM, atM, resolutionM, verdict: depthVerdict(resolutionM, separationM) };
}

/** Read the depth-buffer size of a live WebGL context. Kept here (rather than
 *  inline in ScopeView) so the call site is one line and the fallback is explicit:
 *  a context that will not report gets 0, which `depthVerdict` turns into
 *  `z-fighting` rather than silently passing. */
export function readDepthBits(gl: WebGLRenderingContext | WebGL2RenderingContext | null): number {
  if (!gl) return 0;
  try {
    const v = gl.getParameter(gl.DEPTH_BITS) as number | null;
    return typeof v === 'number' && Number.isFinite(v) ? v : 0;
  } catch {
    return 0;
  }
}
