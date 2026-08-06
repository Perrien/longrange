// Zone-capable hit testing (Design/archive/target-system-plan.md §7, task T2).
//
// `discHit` in `firing-solution.ts` is NOT modified. It stays exactly as shipped
// and becomes the delegate for the legacy round-plate path, so "byte-identical for
// every plate that exists today" is a structural guarantee rather than an argument
// — a plate with no `typeId` runs the same function, with the same `<=`, and gets
// the same answer. T0's `firing-solution.hit-grid.test.ts` grid is what proves it.
//
// Coordinate frames: the impact and plate centre arrive in WORLD plane coordinates
// (m). Everything here converts to the target's width-normalised local frame by
// dividing by `widthM` — both axes by the SAME number, which is what keeps the
// frame isotropic (see `range/targets/target-type.ts`'s header). The bullet radius
// converts the same way, so it needs no per-axis correction.
//
// Pure: no THREE, no engine, no React.

import { discHit, type PlanePoint } from './firing-solution';
import { getTargetType } from '../range/targets/registry';
import { outlinePolygon, pointInOutline, zoneBroken } from '../range/targets/target-geometry';
import type { Point, TargetType } from '../range/targets/target-type';
import type { ShotPlate } from './shot';

/** Which zone of which target a shot struck. */
export interface ZoneHit {
  instanceId: number;
  /** `TargetZone.id`, or `'plate'` for a legacy round plate with no target type. */
  zoneId: string;
  /** Impact in the target's width-normalised local frame (× widthM for metres).
   *  Carried because the face/splat work (T6b) and any future scoring readout want
   *  WHERE on the target the hit landed, not just which zone. */
  localX: number;
  localY: number;
}

/** The zone id reported for a plate with no target type — the pre-T2 world, where
 *  a plate is a plate and a hit is a hit. */
export const LEGACY_ZONE_ID = 'plate';

/**
 * Which zone of `type` a bullet at `local` breaks, or null if it misses the
 * outline entirely, OR lands in a hole zone (e.g. a hostage target's window —
 * a literal absence, so a shot there misses this target regardless of what
 * larger zone would otherwise enclose it). `local` and `bulletR` are both in
 * the target's width-normalised frame.
 *
 * Split out from `hitTargetZone` so the zone logic is testable against a target
 * type directly, without one having to be in the registry — the registry is still
 * empty until T7/T8/T9a, and a new capability that cannot be exercised until three
 * tasks later is a capability nobody has checked. T6b's face planner wants the same
 * type-in-hand shape.
 */
export function zoneAt(local: Point, type: TargetType, bulletR: number): string | null {
  // Outline first: a shot that misses the silhouette misses, whatever zone
  // rectangle it might nominally fall inside.
  const ring = outlinePolygon(type.shape, type.aspect);
  if (!pointInOutline(local, ring, bulletR)) return null;

  for (const zone of type.zones) {
    if (zone.id === type.defaultZoneId) continue; // resolved as the fallback below
    if (zoneBroken(local, zone.shape, bulletR)) return zone.isHole ? null : zone.id;
  }
  // Inside the outline but outside every scoring zone → the default zone. For the
  // IDPA that is −3, the silhouette itself.
  return type.defaultZoneId;
}

/**
 * Test one shot against one plate, returning the best zone struck or null.
 *
 * `plate.typeId` absent ⇒ delegate to `discHit` verbatim (the legacy path).
 * Present ⇒ resolve the target type and hand off to `zoneAt`.
 */
export function hitTargetZone(
  impact: PlanePoint,
  plate: ShotPlate,
  bulletDiameterM: number,
): ZoneHit | null {
  const widthM = plate.diameterM;
  const localX = (impact.x - plate.position.x) / widthM;
  const localY = (impact.y - plate.position.y) / widthM;

  if (plate.typeId === undefined) {
    // THE LEGACY PATH. Same function, same inputs, same answer as before T2.
    if (!discHit(impact, plate.position, plate.diameterM, bulletDiameterM)) return null;
    return { instanceId: plate.instanceId, zoneId: LEGACY_ZONE_ID, localX, localY };
  }

  const type = getTargetType(plate.typeId);
  const zoneId = zoneAt({ x: localX, y: localY }, type, bulletDiameterM / 2 / widthM);
  if (zoneId === null) return null;
  return { instanceId: plate.instanceId, zoneId, localX, localY };
}

/**
 * The height a plate occupies (m) — its target type's aspect applied to its width,
 * or its width for an untyped/round plate.
 *
 * Lives here rather than on `PlateInstance` so there is one derivation instead of
 * every caller doing `heightM ?? diameterM` and quietly disagreeing about whether
 * an explicit `heightM` or the type's aspect wins.
 */
export function plateHeightM(plate: {
  diameterM: number;
  heightM?: number;
  typeId?: string;
}): number {
  if (plate.heightM !== undefined) return plate.heightM;
  if (plate.typeId !== undefined) return plate.diameterM * getTargetType(plate.typeId).aspect;
  return plate.diameterM;
}
