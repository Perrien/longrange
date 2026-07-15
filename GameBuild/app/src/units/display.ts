// Single-unit-system display formatting (owner-requested improvement,
// 2026-07-15, outside the increment-1.6-plan.md D1–D6 set): the HUD used to
// show every value in BOTH unit systems side by side (catalog §0.6). This
// module collapses that to whichever system the player has picked via the
// Met/Imp toggle, keyed off the existing `settings.unitsPrimary` store field
// (no new store state — MIL ⇒ Metric, MOA ⇒ Imperial, matching the pairing
// the owner specified). Presentation-only: nothing here touches the engine,
// the store schema, or persistence.
//
// GUARDRAIL (execution-protocol §4.4): all unit math goes through the units
// service — this is the one place HUD components format a raw SI value for
// display, so no component hand-rolls its own mph/yard conversion.

import { radToMil, radToMoa } from './angle';
import { metersToYards, metersToMillimeters, metersToInches } from './length';
import { mpsToMph } from './velocity';

/** The two angular/unit-system choices, paired per the owner's convention:
 *  MIL travels with metric (m/s, meters, mm); MOA travels with imperial
 *  (mph, yards, in). Same literal union as `state/store.ts`'s `UnitsPrimary`
 *  — declared locally (not imported) so `units/` doesn't depend on `state/`
 *  (the existing dependency direction is the other way: store imports units). */
export type DisplayUnits = 'MIL' | 'MOA';

/** A formatted value ready to render: the converted number plus its unit label. */
export interface Formatted {
  value: number;
  label: string;
}

/** Short toggle-button label for the active system: "Met" (MIL) or "Imp" (MOA). */
export const systemLabel = (units: DisplayUnits): 'Met' | 'Imp' => (units === 'MIL' ? 'Met' : 'Imp');

/** A scope-correction angle: mil under Metric, MOA under Imperial. */
export const formatAngleForDisplay = (rad: number, units: DisplayUnits): Formatted =>
  units === 'MIL' ? { value: radToMil(rad), label: 'mil' } : { value: radToMoa(rad), label: 'MOA' };

/** A speed (e.g. wind): m/s under Metric, mph under Imperial. */
export const formatSpeedForDisplay = (mps: number, units: DisplayUnits): Formatted =>
  units === 'MIL' ? { value: mps, label: 'm/s' } : { value: mpsToMph(mps), label: 'mph' };

/** A range/distance: meters under Metric, yards under Imperial. */
export const formatDistanceForDisplay = (m: number, units: DisplayUnits): Formatted =>
  units === 'MIL' ? { value: m, label: 'm' } : { value: metersToYards(m), label: 'yd' };

/** A small linear offset (e.g. impact-call miss distance): mm under Metric,
 *  inches under Imperial — finer-grained than `formatDistanceForDisplay`. */
export const formatOffsetForDisplay = (m: number, units: DisplayUnits): Formatted =>
  units === 'MIL' ? { value: metersToMillimeters(m), label: 'mm' } : { value: metersToInches(m), label: 'in' };
