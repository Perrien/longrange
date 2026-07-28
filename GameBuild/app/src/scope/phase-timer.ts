// Attribute a one-off main-thread stall to the phase that caused it.
//
// WHY. The ELR probe measured, on device: idle 17–18 ms, and **25–30 ms on the
// frame a shot is fired**, dropping straight back. A mean inside budget with an
// occasional near-double frame is the signature of a discrete BLOCKING event —
// one thing on the main thread occasionally taking too long — not of rendering
// being marginally too slow, which would raise the mean instead. So the useful
// measurement is not "how fast is the frame", it is "which phase of the shot ate
// it", and that needs per-phase numbers, not a total.
//
// Deliberately not a profiler. It answers one question — *which phase* — and the
// ranking is what answers it, so `summary()` sorts by cost and puts the culprit
// first rather than preserving call order.

/** Injectable so tests are deterministic; defaults to the real high-res clock. */
export type Clock = () => number;

const defaultClock: Clock = () =>
  typeof performance !== 'undefined' ? performance.now() : Date.now();

export interface Phase {
  name: string;
  ms: number;
}

export class PhaseTimer {
  private readonly clock: Clock;
  private readonly start: number;
  private last: number;
  private readonly phases: Phase[] = [];

  constructor(clock: Clock = defaultClock) {
    this.clock = clock;
    this.start = this.clock();
    this.last = this.start;
  }

  /** Close the phase that ended here and name it. Call after the work, not before. */
  mark(name: string): void {
    const now = this.clock();
    this.phases.push({ name, ms: now - this.last });
    this.last = now;
  }

  /** Wall time across every phase so far, including work not yet `mark`ed. */
  totalMs(): number {
    return this.clock() - this.start;
  }

  /** Phases worst-first — the ranking IS the diagnosis. */
  ranked(): Phase[] {
    return [...this.phases].sort((a, b) => b.ms - a.ms);
  }

  /**
   * One line for the on-screen readout: `total 24.1 — solve 18.4 · trace 4.2 · …`
   *
   * Shows the top `limit` phases only. A stall has one dominant cause in
   * practice, and a line long enough to list eight phases is a line nobody reads
   * on an iPad.
   */
  summary(limit = 3): string {
    const total = this.totalMs();
    const top = this.ranked()
      .slice(0, limit)
      .map((p) => `${p.name} ${p.ms.toFixed(1)}`)
      .join(' · ');
    return top ? `total ${total.toFixed(1)} — ${top}` : `total ${total.toFixed(1)}`;
  }
}
