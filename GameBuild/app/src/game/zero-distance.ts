// Recommended zero-distance policy helper (task 2.3a, D8). A light hint used
// only for the sight-in HUD ("recommended: zero at 100 yd"): rimfire zeroes at
// 50, centrefire at 100, expressed in the player's active unit and returned in
// SI (meters).
//
// The STORED zero distance (`playerZero.zeroRangeM`) is always the distance of
// the target the player actually confirmed on — never this hint. This function
// is pure and unit-service-based (guardrail §4.4).

import { yardsToMeters } from '../units/length';
import type { DisplayUnits } from '../units/display';
import { isRimfireCartridge } from './catalog';

/** Recommended zero distance for a cartridge, in SI meters (D8).
 *  Nominal is 50 (rimfire) or 100 (centrefire), read in the active unit
 *  (MOA ⇒ yards, MIL ⇒ meters — the coupling from `units/display.ts`). */
export function recommendedZeroM(cartridgeId: string, unitsPrimary: DisplayUnits): number {
  const nominal = isRimfireCartridge(cartridgeId) ? 50 : 100;
  // MOA travels with imperial (yards); MIL with metric (meters, already SI).
  return unitsPrimary === 'MOA' ? yardsToMeters(nominal) : nominal;
}
