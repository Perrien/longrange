// DOPE book — the pure data model + rules behind confirmed nodes (task 2.4a).
//
// Scope: node upsert (replace-by-station, D5), the shot-count confidence rule
// (D3), and the range-ladder generator (D7). PURE — no engine, no store, no DOM,
// and (by construction, for auditability) NO hidden-truth import: every input
// here is a catalog-BELIEVED value or a physical fact the player recorded. The
// confirm-node interaction (2.4d) and the Data Book UI (2.4f) sit on top of this;
// solver truing (2.5) consumes the nodes but is not here.
//
// The persisted node shape (`DopeNode`) lives in persistence/schema.ts (it rides
// the additive-optional `dopeNodes?` field) and is imported here so there is one
// definition — this module owns the *rules*, the schema owns the *shape*.

import { milToRad } from '../units/angle';
import { yardsToMeters } from '../units/length';
import type { DisplayUnits } from '../units/display';
import type { DopeNode } from '../persistence';

export type { DopeNode };

/** Node confidence tier (D3): the player has looked at a station (`noted`),
 *  recorded some confirming shots (`provisional`), or reached the shot-count
 *  threshold N (`confirmed`). The raw shot count is always shown alongside. */
export type ConfidenceTier = 'noted' | 'provisional' | 'confirmed';

/** Standard gravity (m/s²) — used only for the vertical-SD approximation below. */
const G = 9.80665;

/** Grouping tolerance for the confidence rule (D3): the standard-error-of-group-
 *  centre bar. PROVISIONAL — tuned later; the unit tests pin only the *shape* of
 *  the N rule (monotonic in SD and range, match < bulk), never this constant. */
export const TOL_RAD = milToRad(0.1);

/** Two stations count as "the same station" within this SI tolerance (D5) — so a
 *  re-confirm at 200 yd replaces the prior node even after the yd⇄m round-trip. */
const STATION_EPSILON_M = 0.5;

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Believed vertical angular SD (radians) at a range — the spread the confidence
 * rule sizes a group against. Analytic approximation (owner's call, 2026-07-24;
 * keeps this module WASM-free): a first-order vacuum-drop proxy for how much the
 * per-shot muzzle-velocity spread moves the vertical impact angle, combined in
 * quadrature with the rifle's range-independent inherent-precision term.
 *
 *   drop ≈ ½·g·(R/V)²  ⇒  angular come-up ≈ ½·g·R/V²
 *   ∂(angular)/∂V ≈ −g·R/V³  ⇒  velocity-driven angular SD ≈ g·R·σ_V / V³
 *   σ_v(R) = hypot(g·R·σ_V/V³, inherentPrecision)
 *
 * Monotonically increasing in both R and σ_V, so N (below) inherits that shape.
 * All inputs are catalog-BELIEVED (box MV, published per-shot MV SD, the tier's
 * nominal inherent precision) — never hidden truth. `mvSdMps` is the lot's
 * catalog `perShotMvSd.nom`; `inherentPrecisionRad` the tier's nominal cone.
 */
export function believedVerticalSdRad(
  rangeM: number,
  mvMps: number,
  mvSdMps: number,
  inherentPrecisionRad: number,
): number {
  const velocitySensitivityRad = (G * rangeM * mvSdMps) / (mvMps * mvMps * mvMps);
  return Math.hypot(velocitySensitivityRad, inherentPrecisionRad);
}

/**
 * Shots needed to call a node `confirmed` (D3):
 *   N = clamp(ceil((σ_v(R) / tol)²), 3, 10)
 * More spread (bulk ammo, longer range) demands more shots; a floor of 3 keeps
 * even a laser honest, a ceiling of 10 keeps it playable. Constants provisional.
 */
export function requiredShots(sigmaVRad: number, tolRad: number = TOL_RAD): number {
  const ratio = sigmaVRad / tolRad;
  return clamp(Math.ceil(ratio * ratio), 3, 10);
}

/**
 * A node's confidence tier given the believed spread at its range. `noted` until
 * the player has actually hit the plate (hits ≥ 1); `confirmed` once the group
 * reaches N shots; `provisional` in between.
 */
export function confidenceTier(
  node: Pick<DopeNode, 'shots' | 'hits'>,
  sigmaVRad: number,
  tolRad: number = TOL_RAD,
): ConfidenceTier {
  if (node.hits < 1) return 'noted';
  if (node.shots >= requiredShots(sigmaVRad, tolRad)) return 'confirmed';
  return 'provisional';
}

/**
 * Replace-by-station upsert (D5): drop any existing node for the same
 * (rifleId, lotId, station) and append the new one, so the latest confirm wins.
 * Station identity is within `STATION_EPSILON_M` metres. Pure — returns a new
 * array, never mutates the input.
 */
export function upsertNode(nodes: DopeNode[], node: DopeNode): DopeNode[] {
  const kept = removeNode(nodes, node.rifleId, node.lotId, node.distanceM);
  kept.push(node);
  return kept;
}

/** Remove the node for a specific (rifleId, lotId, station) — the station is
 *  matched within `STATION_EPSILON_M` metres, so the same yd/m value that
 *  confirmed it also deletes it. Pure. Shared by `upsertNode` + the store's
 *  `deleteNode` so the station-identity rule lives in exactly one place. */
export function removeNode(
  nodes: DopeNode[],
  rifleId: string,
  lotId: string,
  distanceM: number,
): DopeNode[] {
  return nodes.filter(
    (n) =>
      !(
        n.rifleId === rifleId &&
        n.lotId === lotId &&
        Math.abs(n.distanceM - distanceM) < STATION_EPSILON_M
      ),
  );
}

/** Drop every node belonging to a rifle (cascade on rifle delete). */
export function pruneNodesForRifle(nodes: DopeNode[], rifleId: string): DopeNode[] {
  return nodes.filter((n) => n.rifleId !== rifleId);
}

/** Drop every node belonging to an ammo lot (cascade on lot delete). */
export function pruneNodesForLot(nodes: DopeNode[], lotId: string): DopeNode[] {
  return nodes.filter((n) => n.lotId !== lotId);
}

/** Rimfire ladder steps (D7) — finer than centrefire's centuries. */
const RIMFIRE_STEPS = [25, 50, 75, 100, 125, 150, 200];

/**
 * The DOPE-range ladder for a cartridge, as SI distances (D7). Steps are read in
 * the player's active display unit — yd for MOA, m for MIL — capped at the
 * cartridge's `effectiveRangeYd` converted to that same unit, then returned in
 * meters. Centrefire climbs by centuries (100, 200, …); rimfire uses the finer
 * fixed set. Resolved once at range entry (no live MIL⇄MOA morph — 2.3 D3).
 *
 * Example: .308 (effectiveRangeYd 1000) → MOA: 100…1000 yd; MIL cap =
 * yardsToMeters(1000) ≈ 914 m, so 100…900 m.
 */
export function ladderStationsM(
  isRimfire: boolean,
  units: DisplayUnits,
  effectiveRangeYd: number,
): number[] {
  // Cap expressed in the station unit: yd for MOA, m for MIL.
  const capInStationUnit = units === 'MOA' ? effectiveRangeYd : yardsToMeters(effectiveRangeYd);
  const stepValues: number[] = [];
  if (isRimfire) {
    for (const s of RIMFIRE_STEPS) if (s <= capInStationUnit) stepValues.push(s);
  } else {
    for (let s = 100; s <= capInStationUnit; s += 100) stepValues.push(s);
  }
  // MOA steps are yards → convert to meters; MIL steps are already meters.
  return stepValues.map((s) => (units === 'MOA' ? yardsToMeters(s) : s));
}

/** One come-up-table station + whether it lies past the cartridge's effective
 *  range (for the beyond-effective marking). */
export interface ComeUpStation {
  stationM: number;
  beyondEffective: boolean;
}

/**
 * Candidate stations for the come-up REFERENCE TABLE (not the shootable DOPE
 * range, which stays capped at effective range — `ladderStationsM`). The in-range
 * portion is identical to `ladderStationsM`; it then continues in the same cadence
 * (centuries / a 50-step rimfire tail) out to `hardMaxYd`, tagging every station
 * past effective range `beyondEffective`. The caller solves to the last station
 * then trims at the transonic→subsonic wall (`assembleComeUp`), so this over-
 * generates on purpose — `hardMaxYd` only needs to be past where the bullet goes
 * subsonic (owner 2026-07-27: transonic is a beyond-effective phenomenon for most
 * cartridges, so the reference table must reach past effective range to show it).
 */
export function comeUpStationsM(
  isRimfire: boolean,
  units: DisplayUnits,
  effectiveRangeYd: number,
  hardMaxYd: number,
): ComeUpStation[] {
  const inYd = units === 'MOA'; // station unit: yd (MOA) or m (MIL)
  const effCap = inYd ? effectiveRangeYd : yardsToMeters(effectiveRangeYd);
  const hardCap = inYd ? hardMaxYd : yardsToMeters(hardMaxYd);
  const stepUnitVals: number[] = [];
  if (isRimfire) {
    for (const s of RIMFIRE_STEPS) if (s <= hardCap) stepUnitVals.push(s);
    for (let s = RIMFIRE_STEPS[RIMFIRE_STEPS.length - 1] + 50; s <= hardCap; s += 50) stepUnitVals.push(s);
  } else {
    for (let s = 100; s <= hardCap; s += 100) stepUnitVals.push(s);
  }
  return stepUnitVals.map((s) => ({
    stationM: inYd ? yardsToMeters(s) : s,
    beyondEffective: s > effCap + 1e-6,
  }));
}
