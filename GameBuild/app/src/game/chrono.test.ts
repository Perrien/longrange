// Task 2.4e unit tests — the pure chronograph string/summary math. No engine, no
// store. The realism model (each reading is an independent draw; the average is an
// improving estimate) lives in the engine-backed match-sim test; here we pin the
// Welford merge exactly and the string/prune mechanics.

import { describe, expect, it } from 'vitest';
import {
  stringStats,
  mergeChronoString,
  findChronoSummary,
  pruneChronoForRifle,
  pruneChronoForLot,
  type ChronoSummary,
} from './chrono';

/** Reference single-pass stats over a full reading list (sample SD, ES). */
function refStats(readings: number[]) {
  const n = readings.length;
  const avg = readings.reduce((s, r) => s + r, 0) / n;
  const m2 = readings.reduce((s, r) => s + (r - avg) * (r - avg), 0);
  return {
    shots: n,
    avgMps: avg,
    sdMps: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
    minMps: Math.min(...readings),
    maxMps: Math.max(...readings),
  };
}

describe('stringStats', () => {
  it('empty string → all zero', () => {
    expect(stringStats([])).toEqual({ shots: 0, avgMps: 0, sdMps: 0, minMps: 0, maxMps: 0 });
  });

  it('single reading → sd 0, min=max=avg', () => {
    expect(stringStats([820])).toEqual({ shots: 1, avgMps: 820, sdMps: 0, minMps: 820, maxMps: 820 });
  });

  it('matches a single-pass reference (sample SD, ES = max − min)', () => {
    const r = [818, 822, 819, 825, 816];
    const s = stringStats(r);
    const ref = refStats(r);
    expect(s.avgMps).toBeCloseTo(ref.avgMps, 12);
    expect(s.sdMps).toBeCloseTo(ref.sdMps, 12);
    expect(s.maxMps - s.minMps).toBeCloseTo(ref.maxMps - ref.minMps, 12);
  });
});

describe('mergeChronoString (Welford parallel-combine, D10)', () => {
  const rifleId = 'r1';
  const lotId = 'l1';

  it('a first string equals its own stats', () => {
    const readings = [820, 824, 818];
    const [sum] = mergeChronoString([], rifleId, lotId, readings, 'iso');
    const ref = refStats(readings);
    expect(sum.shots).toBe(3);
    expect(sum.avgMps).toBeCloseTo(ref.avgMps, 12);
    expect(sum.sdMps).toBeCloseTo(ref.sdMps, 12);
    expect(sum.minMps).toBe(ref.minMps);
    expect(sum.maxMps).toBe(ref.maxMps);
    expect(sum.updatedAtIso).toBe('iso');
  });

  it('merging two strings equals one pass over the concatenation', () => {
    const a = [820, 824, 818, 821];
    const b = [815, 830, 822, 819, 826];
    const afterA = mergeChronoString([], rifleId, lotId, a, 'iso1');
    const afterB = mergeChronoString(afterA, rifleId, lotId, b, 'iso2');
    const sum = findChronoSummary(afterB, rifleId, lotId)!;
    const ref = refStats([...a, ...b]);
    expect(sum.shots).toBe(a.length + b.length);
    expect(sum.avgMps).toBeCloseTo(ref.avgMps, 9);
    expect(sum.sdMps).toBeCloseTo(ref.sdMps, 9);
    expect(sum.minMps).toBe(ref.minMps);
    expect(sum.maxMps).toBe(ref.maxMps);
  });

  it('three strings still equal one pass over the whole concatenation', () => {
    const strings = [[820, 824], [818, 821, 815], [830, 822, 819, 826, 817]];
    let summaries: ChronoSummary[] = [];
    for (const s of strings) summaries = mergeChronoString(summaries, rifleId, lotId, s, 'iso');
    const sum = findChronoSummary(summaries, rifleId, lotId)!;
    const ref = refStats(strings.flat());
    expect(sum.shots).toBe(strings.flat().length);
    expect(sum.avgMps).toBeCloseTo(ref.avgMps, 9);
    expect(sum.sdMps).toBeCloseTo(ref.sdMps, 9);
  });

  it('keeps distinct rifle+lot pairings separate', () => {
    let s: ChronoSummary[] = [];
    s = mergeChronoString(s, 'r1', 'l1', [820, 821], 'iso');
    s = mergeChronoString(s, 'r2', 'l1', [900, 902], 'iso');
    s = mergeChronoString(s, 'r1', 'l2', [700, 701], 'iso');
    expect(s).toHaveLength(3);
    expect(findChronoSummary(s, 'r1', 'l1')!.avgMps).toBeCloseTo(820.5, 9);
    expect(findChronoSummary(s, 'r2', 'l1')!.avgMps).toBeCloseTo(901, 9);
  });

  it('an empty string is a no-op (returns the same array)', () => {
    const s = mergeChronoString([], rifleId, lotId, [], 'iso');
    expect(s).toEqual([]);
  });

  it('is pure — does not mutate the input array', () => {
    const src: ChronoSummary[] = [];
    mergeChronoString(src, rifleId, lotId, [820], 'iso');
    expect(src).toHaveLength(0);
  });
});

describe('prune helpers (cascade)', () => {
  const summaries: ChronoSummary[] = [
    { rifleId: 'r1', lotId: 'l1', shots: 3, avgMps: 820, sdMps: 4, minMps: 816, maxMps: 824, updatedAtIso: 'i' },
    { rifleId: 'r1', lotId: 'l2', shots: 3, avgMps: 700, sdMps: 5, minMps: 695, maxMps: 706, updatedAtIso: 'i' },
    { rifleId: 'r2', lotId: 'l1', shots: 3, avgMps: 900, sdMps: 6, minMps: 894, maxMps: 907, updatedAtIso: 'i' },
  ];

  it('pruneChronoForRifle drops every summary for a rifle', () => {
    const out = pruneChronoForRifle(summaries, 'r1');
    expect(out).toHaveLength(1);
    expect(out[0].rifleId).toBe('r2');
  });

  it('pruneChronoForLot drops every summary for a lot', () => {
    const out = pruneChronoForLot(summaries, 'l1');
    expect(out.map((s) => s.lotId)).toEqual(['l2']);
  });
});
