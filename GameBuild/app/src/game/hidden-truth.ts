// Hidden-truth derivation (task 2.1b, Increment 2). Pure, engine-free,
// persistence-free math: normalized draws + catalog ranges in, the instance's
// true (hidden) ballistics out.
//
// The stored identity of a rifle/lot is a map of normalized [0,1) draws keyed by
// field name (persistence/schema.ts `RifleDraws`/`LotDraws`, decision D1). This
// module maps each draw to a value ON DEMAND (D3): a bell-curve (inverse-normal)
// map centered on the catalog's box nominal, scaled by the field's standard
// deviation, and clamped at ±3 SD so a freak draw can't produce an absurd
// instance. draw 0.5 → exactly nominal; draw 0.84 → ≈ +1 SD.
//
// This is a pure function of (ranges, draws): no Date.now, no global RNG, no
// iteration-order hazards — truing's synthetic-truth tests (2.5) and
// export/import reproduction (2.8) depend on that determinism. The values
// produced here flow ONLY into engine-bridge solve inputs (wired in 2.1c / 2.3),
// never to UI or logs (guardrail §4.8 / catalog §0).
//
// Import discipline (2.1b done-when): this module imports nothing from
// engine-bridge, state, scope, range, shell, debug, or React — only the draw
// map TYPES from the persistence schema (type-only, no runtime coupling), so
// 2.2's catalog and 2.1c's boundary can share them.
import type { RifleDraws, LotDraws, RifleInstance, AmmoLot } from '../persistence';

// --- Catalog-ranges interface (satisfied by the gear catalog in task 2.2) ----

/** One authored field: the box nominal plus its standard deviation, in the
 *  field's native unit (m/s for velocities, rad for angles, fraction for BC).
 *  A field that is itself a spread (e.g. "true MV SD") is just an SD-valued
 *  field mapped the same way — one level of nesting, no special-casing (D3).
 *
 *  Authoring constraint for non-negative fields (SDs, precision): keep
 *  `nominal ≥ 3·sd` so the −3 SD clamp can't produce a negative value. */
export interface FieldRange {
  nominal: number;
  sd: number;
}

/** Hidden per-rifle-copy ranges (catalog §C1 / §D). */
export interface RifleTruthRanges {
  /** Muzzle-velocity offset of this copy vs the box MV (m/s). */
  mvOffset: FieldRange;
  /** Horizontal zero offset (rad). */
  zeroH: FieldRange;
  /** Vertical zero offset (rad). */
  zeroV: FieldRange;
  /** Inherent angular precision of the rifle (rad). */
  inherentPrecision: FieldRange;
}

/** Hidden per-ammo-lot ranges (catalog §C2 / §D). `bc.nominal` is the box BC. */
export interface LotTruthRanges {
  /** Lot mean-MV shift vs the box MV (m/s) — summed with the rifle's mvOffset. */
  meanMvShift: FieldRange;
  /** Lot's true muzzle-velocity SD (m/s) — an SD-valued field. */
  mvSd: FieldRange;
  /** True ballistic coefficient (nominal = box BC). Mapped from the `bcError` draw. */
  bc: FieldRange;
  /** Lot's true BC SD (fraction) — an SD-valued field. */
  bcSd: FieldRange;
}

// --- Derived truth ----------------------------------------------------------

export interface RifleTruth {
  mvOffsetMps: number;
  zeroOffsetRad: { h: number; v: number };
  inherentPrecisionRad: number;
}

export interface LotTruth {
  meanMvShiftMps: number;
  mvSdMps: number;
  trueBc: number;
  bcSdFraction: number;
}

// --- Bell-curve map (D3) ----------------------------------------------------

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

/**
 * Inverse standard-normal CDF (probit) — Acklam's rational approximation
 * (|error| < 1.15e-9 across the whole range). Dependency-free (protocol §4).
 * `invNormalCdf(0.5) === 0` exactly, so a draw of 0.5 maps to the nominal.
 */
function invNormalCdf(p: number): number {
  const a = [
    -3.969683028665376e1, 2.209460984245205e2, -2.759285104469687e2,
    1.38357751867269e2, -3.066479806614716e1, 2.506628277459239,
  ];
  const b = [
    -5.447609879822406e1, 1.615858368580409e2, -1.556989798598866e2,
    6.680131188771972e1, -1.328068155288572e1,
  ];
  const c = [
    -7.784894002430293e-3, -3.223964580411365e-1, -2.400758277161838,
    -2.549732539343734, 4.374664141464968, 2.938163982698783,
  ];
  const d = [
    7.784695709041462e-3, 3.224671290700398e-1, 2.445134137142996,
    3.754408661907416,
  ];
  const plow = 0.02425;
  const phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (
      (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
      ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
    );
  }
  if (p <= phigh) {
    const q = p - 0.5;
    const r = q * q;
    return (
      ((((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q) /
      (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1)
    );
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return (
    -(((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) /
    ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1)
  );
}

/**
 * Map a normalized draw ∈ [0,1) to a value on the field's bell curve (D3):
 * `nominal + sd · clamp(probit(draw), −3, +3)`. The draw is nudged just inside
 * (0,1) so the probit stays finite; the ±3 SD clamp then bounds the result
 * (a draw of 0 → −3 SD, near-1 → +3 SD). Exposed for 2.2/tests.
 */
export function bellCurveValue(range: FieldRange, draw: number): number {
  const p = clamp(draw, 1e-9, 1 - 1e-9);
  const z = clamp(invNormalCdf(p), -3, 3);
  return range.nominal + range.sd * z;
}

// --- Public derivation ------------------------------------------------------

/** Map a rifle instance's stored draws to its hidden true ballistics. */
export function deriveRifleTruth(ranges: RifleTruthRanges, draws: RifleDraws): RifleTruth {
  return {
    mvOffsetMps: bellCurveValue(ranges.mvOffset, draws.mvOffset),
    zeroOffsetRad: {
      h: bellCurveValue(ranges.zeroH, draws.zeroH),
      v: bellCurveValue(ranges.zeroV, draws.zeroV),
    },
    inherentPrecisionRad: bellCurveValue(ranges.inherentPrecision, draws.inherentPrecision),
  };
}

/** Map an ammo lot's stored draws to its hidden true ballistics. The `bcError`
 *  draw maps through the `bc` range (nominal = box BC) to the true BC. */
export function deriveLotTruth(ranges: LotTruthRanges, draws: LotDraws): LotTruth {
  return {
    meanMvShiftMps: bellCurveValue(ranges.meanMvShift, draws.meanMvShift),
    mvSdMps: bellCurveValue(ranges.mvSd, draws.mvSd),
    trueBc: bellCurveValue(ranges.bc, draws.bcError),
    bcSdFraction: bellCurveValue(ranges.bcSd, draws.bcSd),
  };
}

// --- Engine-bridge-facing boundary (the ONE entry point into solves) --------
//
// `resolveTruth` is the single seam through which a stored rifle instance + ammo
// lot (their draws) become the true ballistics a solve consumes. It is meant to
// be called ONLY from engine-bridge (in task 2.3 zeroing) — the no-leak guard
// test asserts no UI/HUD/scene/shell/state module imports this module. This
// establishes the seam WITHOUT changing any Increment-1 solve behaviour yet
// (box-true loads still solve exactly as before; real consumption lands in 2.3).

/** The true (hidden) ballistics for a specific (rifle, lot) pairing that a solve
 *  needs. `totalMvOffsetMps` is the summed hidden MV offset (catalog §D: the
 *  rifle copy's offset + the lot's mean shift) applied onto the load's box MV. */
export interface TrueBallistics {
  rifle: RifleTruth;
  lot: LotTruth;
  totalMvOffsetMps: number;
}

/** Resolve a rifle instance's stored draws to truth (thin seam over deriveRifleTruth). */
export function resolveRifleTruth(rifle: RifleInstance, ranges: RifleTruthRanges): RifleTruth {
  return deriveRifleTruth(ranges, rifle.draws);
}

/** Resolve an ammo lot's stored draws to truth (thin seam over deriveLotTruth). */
export function resolveLotTruth(lot: AmmoLot, ranges: LotTruthRanges): LotTruth {
  return deriveLotTruth(ranges, lot.draws);
}

/** Resolve a (rifle, lot) pairing into the true ballistics a solve consumes. */
export function resolveTruth(
  rifle: RifleInstance,
  rifleRanges: RifleTruthRanges,
  lot: AmmoLot,
  lotRanges: LotTruthRanges,
): TrueBallistics {
  const r = resolveRifleTruth(rifle, rifleRanges);
  const l = resolveLotTruth(lot, lotRanges);
  return { rifle: r, lot: l, totalMvOffsetMps: r.mvOffsetMps + l.meanMvShiftMps };
}
