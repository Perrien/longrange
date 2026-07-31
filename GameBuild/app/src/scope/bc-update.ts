// Pure helpers for the "Update BC" dialog (bc-truing-plan T3, D15 lever 2).
// No React, no DOM, no engine — kept separate from DopePanel.tsx so the
// pre-fill conversion, enable/disable predicate, and reject-message formatter
// unit-test without mounting a component (per the plan's T3 test note).
import { radToMil, radToMoa, milToRad, moaToRad } from '../units/angle';
import { formatDistanceForDisplay, type DisplayUnits } from '../units/display';
import type { BcFitResult } from '../engine-bridge/bc-fit';

/** Whether the Update BC button is enabled (B3): active gear + a committed target. */
export function canUpdateBc(hasGear: boolean, hasCommittedTarget: boolean): boolean {
  return hasGear && hasCommittedTarget;
}

/** One-line reason shown when the button is disabled (B3). */
export const UPDATE_BC_DISABLED_REASON = 'commit to a target first';

/** Convert a dialed elevation (rad) into the dialog's pre-filled value, in the
 *  player's active angular unit (B1/B6). Inverse of `angleDisplayToRad`. */
export function angleRadToDisplay(elevationRad: number, unitsPrimary: DisplayUnits): number {
  return unitsPrimary === 'MIL' ? radToMil(elevationRad) : radToMoa(elevationRad);
}

/** Convert the dialog's edited value back to radians (B6). Inverse of `angleRadToDisplay`. */
export function angleDisplayToRad(value: number, unitsPrimary: DisplayUnits): number {
  return unitsPrimary === 'MIL' ? milToRad(value) : moaToRad(value);
}

/** The plausible BC band (B4): `[0.5×box, 2.0×box]`. Model-agnostic (G1/G7 alike). */
export function plausibleBcBand(boxBc: number): { bcMin: number; bcMax: number } {
  return { bcMin: boxBc * 0.5, bcMax: boxBc * 2.0 };
}

/** Human-readable rejection message (B2) for a failed fit, in the player's
 *  active unit/distance convention (same MIL↔m / MOA↔yd pairing the rest of
 *  the panel uses — `units/display.ts`). */
export function formatBcRejection(
  result: Extract<BcFitResult, { ok: false }>,
  distanceM: number,
  unitsPrimary: DisplayUnits,
): string {
  const lo = angleRadToDisplay(result.achievableMinRad, unitsPrimary);
  const hi = angleRadToDisplay(result.achievableMaxRad, unitsPrimary);
  const unit = unitsPrimary === 'MIL' ? 'MIL' : 'MOA';
  const dist = formatDistanceForDisplay(distanceM, unitsPrimary);
  return (
    `No BC within range produces that hold at ${dist.value.toFixed(0)} ${dist.label} ` +
    `(${lo.toFixed(2)}–${hi.toFixed(2)} ${unit} achievable). Check your zero, or chronograph first.`
  );
}
