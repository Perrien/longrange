// Chronograph string/summary math (task 2.4e) — the pure statistics behind the
// measured muzzle-velocity record. No engine, no store, no DOM, no hidden-truth:
// every input here is a per-shot READING (a legitimate measurement surfaced by
// the engine-bridge scatter seam) or an already-persisted summary.
//
// Realism (owner requirement 2026-07-24): each reading is an independent draw
// from the lot's true MV distribution (the engine draws it per shot), so the
// running average is an ESTIMATE of the true mean — better than the box, never
// exact, with standard error ~ sd/√N (diminishing returns). This module keeps
// averaging real readings; it must never substitute the hidden true mean.
//
// The persisted shape (`ChronoSummary`) lives in persistence/schema.ts (it rides
// the additive-optional `chronoSummaries?` field) and is imported here so there
// is one definition — this module owns the *math*, the schema owns the *shape*.

import type { ChronoSummary } from '../persistence';

export type { ChronoSummary };

/** Live stats for the current (uncommitted) string of readings. Sample SD (n−1);
 *  0 readings → all zero; 1 reading → sd 0. ES = maxMps − minMps. */
export interface StringStats {
  shots: number;
  avgMps: number;
  sdMps: number;
  minMps: number;
  maxMps: number;
}

/** Mean + sample variance (n−1) + min/max of a reading list, in one pass. */
function stats(readings: number[]): StringStats {
  const shots = readings.length;
  if (shots === 0) return { shots: 0, avgMps: 0, sdMps: 0, minMps: 0, maxMps: 0 };
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const r of readings) {
    sum += r;
    if (r < min) min = r;
    if (r > max) max = r;
  }
  const avg = sum / shots;
  let m2 = 0;
  for (const r of readings) m2 += (r - avg) * (r - avg);
  const sd = shots > 1 ? Math.sqrt(m2 / (shots - 1)) : 0;
  return { shots, avgMps: avg, sdMps: sd, minMps: min, maxMps: max };
}

/** Public: live stats for a string of readings (drives the ChronoPanel readout). */
export function stringStats(readings: number[]): StringStats {
  return stats(readings);
}

/** Sum-of-squared-deviations for a summary (inverse of the sample-SD formula),
 *  so two summaries can be Welford-combined even though only sd is stored. */
function m2Of(shots: number, sdMps: number): number {
  return shots > 1 ? sdMps * sdMps * (shots - 1) : 0;
}

/**
 * Merge a new string of readings into the per-(rifleId, lotId) summary, returning
 * a NEW summaries array (mirrors dope-book's `upsertNode`; pure, never mutates).
 * Uses the parallel-combine (Chan et al.) form so merging strings equals a single
 * pass over the concatenation:
 *   δ = mean_b − mean_a
 *   mean = (n_a·mean_a + n_b·mean_b) / (n_a + n_b)
 *   M2   = M2_a + M2_b + δ²·n_a·n_b / (n_a + n_b)
 * min/max are the extremes of both; sd = √(M2/(n−1)). An empty string is a no-op;
 * a first string (no existing summary) is just its own stats.
 */
export function mergeChronoString(
  summaries: ChronoSummary[],
  rifleId: string,
  lotId: string,
  readings: number[],
  nowIso: string,
): ChronoSummary[] {
  if (readings.length === 0) return summaries;
  const b = stats(readings);
  const existing = summaries.find((s) => s.rifleId === rifleId && s.lotId === lotId);

  let merged: ChronoSummary;
  if (!existing) {
    merged = {
      rifleId,
      lotId,
      shots: b.shots,
      avgMps: b.avgMps,
      sdMps: b.sdMps,
      minMps: b.minMps,
      maxMps: b.maxMps,
      updatedAtIso: nowIso,
    };
  } else {
    const nA = existing.shots;
    const nB = b.shots;
    const n = nA + nB;
    const delta = b.avgMps - existing.avgMps;
    const mean = (nA * existing.avgMps + nB * b.avgMps) / n;
    const m2 = m2Of(nA, existing.sdMps) + m2Of(nB, b.sdMps) + (delta * delta * nA * nB) / n;
    merged = {
      rifleId,
      lotId,
      shots: n,
      avgMps: mean,
      sdMps: n > 1 ? Math.sqrt(m2 / (n - 1)) : 0,
      minMps: Math.min(existing.minMps, b.minMps),
      maxMps: Math.max(existing.maxMps, b.maxMps),
      updatedAtIso: nowIso,
    };
  }

  const kept = summaries.filter((s) => !(s.rifleId === rifleId && s.lotId === lotId));
  kept.push(merged);
  return kept;
}

/** Look up the summary for a rifle+lot pairing, if any. */
export function findChronoSummary(
  summaries: ChronoSummary[],
  rifleId: string,
  lotId: string,
): ChronoSummary | undefined {
  return summaries.find((s) => s.rifleId === rifleId && s.lotId === lotId);
}

/**
 * D15's named re-true loop (bc-truing-plan T4): true when a lot's BC was fitted
 * (`effective.bcSetAt`) BEFORE its most recent chrono commit — i.e. the BC was
 * trued against an MV that's since been superseded, so the card and the
 * asserted hold have quietly drifted apart. Purely informational (D15: last
 * write wins, neither lever invalidates the other) — this only flags the
 * mismatch, never clears or recomputes anything.
 *
 * `bcSetAt` absent means "unknown" (a save from before this field existed, or a
 * BC that's never been trued) and never warns — there's nothing to compare.
 */
export function isBcStaleVsChrono(bcSetAtIso: string | undefined, chrono: ChronoSummary | undefined): boolean {
  if (!bcSetAtIso || !chrono) return false;
  return new Date(chrono.updatedAtIso).getTime() > new Date(bcSetAtIso).getTime();
}

/** Drop every summary belonging to a rifle (cascade on rifle delete). */
export function pruneChronoForRifle(summaries: ChronoSummary[], rifleId: string): ChronoSummary[] {
  return summaries.filter((s) => s.rifleId !== rifleId);
}

/** Drop every summary belonging to an ammo lot (cascade on lot delete). */
export function pruneChronoForLot(summaries: ChronoSummary[], lotId: string): ChronoSummary[] {
  return summaries.filter((s) => s.lotId !== lotId);
}
