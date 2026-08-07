// Authored target placements (Design/archive/target-system-plan.md §4, task T3).
//
// Typed loader over `placements.data.json`, mirroring `game/catalog.ts` /
// `catalog.data.json`: the JSON lives INSIDE `src/` and is imported statically
// rather than fetched, which keeps it out of the offline/precache question
// entirely and gives full type inference at the boundary.
//
// ── WHAT BELONGS HERE, AND WHAT DOES NOT ──────────────────────────────────────
// This file is for AUTHORED placements — "a 12″ gong, 100 yd, dead centre". It is
// deliberately NOT the only way a scene gets targets, and two shipped ranges must
// stay in code:
//
//   • Range A's ladder is DERIVED (`buildRack` over distance-keyed tables, the BTK
//     authored-inputs model, with the berm computed from the rack frame). Flattening
//     50 plates into JSON would lose that derivation for no gain.
//   • The ELR Range SOLVES its layout at runtime (`solveLayout`) against the
//     generated tree field, searching lateral offsets for sight clearance. It
//     cannot be static data without deleting the solver or duplicating it.
//
// The shared abstraction is Target × Mount × `PlateInstance` — NOT the placement
// source. Authored placements are data; computed layouts stay code; both produce
// the same `PlateInstance[]`. A range with no entry in the JSON resolves to `[]`,
// so no range is forced to opt in.

import { inchesToMeters, metersToYards, yardsToMeters } from '../../units';
import { getRangeDefinition } from '../ranges';
import { getMountType, hasMountType } from './mount-registry';
import { getTargetType, hasTargetType } from './registry';
import type { MountType } from './mount-type';
import type { TargetType } from './target-type';
import placementsData from './placements.data.json';

/** Stamped on the data file so a future migration can tell versions apart, the
 *  same role `CATALOG_VERSION` plays for the gear catalog. */
export const PLACEMENTS_VERSION: number = placementsData.placementsVersion;

/** One entry as authored in the JSON. */
export interface RawPlacement {
  id: string;
  typeId: string;
  mountId?: string;
  groupId?: string;
  distanceYards?: number;
  distanceM?: number;
  xOffsetM: number;
  widthM?: number;
  widthInches?: number;
  beamHeightM?: number;
  /** Beam height in YARDS, converted through `units/`. Authored this way where the
   *  rack frame is specified in yards (Range A's ladder, the Test Range gong) so the
   *  data file carries the authored number rather than a float literal that has to
   *  match a computed constant. */
  beamHeightYards?: number;
  /** Plate-centre height above ground (m). Omitted ⇒ derived from the mount's
   *  furniture (a beam rack hangs its plate at `PLATE_CENTER_FRACTION` of the beam). */
  centreYM?: number;
  /**
   * Depth nudge (m) applied to the RENDERED mesh position only — never to
   * `distanceM`/the hit-test plane. **SIGNED: positive is toward the shooter,
   * negative is downrange.** Omitted ⇒ 0.
   *
   * Exists for a target authored to sit visually in front of or behind another at
   * the exact same distance (a hostage paddle and its backing silhouette) — two
   * plates at identical world-Z z-fight, since the renderer has no other depth cue
   * to separate two coplanar surfaces. A few centimetres resolves it without
   * reading as "floating."
   *
   * It is also load-bearing for a `flip` mount, not merely cosmetic: a hostage
   * paddle swings DOWNRANGE when struck (`scope/steel-reactions.ts`'s `poseFlip`),
   * so it must be nudged NEGATIVE — behind its backing plate. A positive nudge
   * would put the paddle in front and its swing would sweep through the plate.
   */
  zNudgeM?: number;
  /**
   * Which `groupId` this target's strike RE-ARMS — the popper star's hub plate
   * (`Design/Plans/popper-star.md`).
   *
   * Lives on the placement rather than on the mount so a `'reset-switch'` mount stays
   * reusable: a second star, or a future plate rack with a shoot-to-reset button,
   * needs no new mount type. Required exactly when the mount's reaction is
   * `'reset-switch'`, and the named group must exist in the same range — a typo'd id
   * would otherwise be a button that silently does nothing, which is invisible on
   * device and indistinguishable from a physics bug.
   */
  resetsGroupId?: string;
  palette?: Record<string, number>;
}

/** A placement with its registry lookups done and its geometry derived — what a
 *  scene builder actually wants. */
export interface ResolvedPlacement {
  id: string;
  rangeId: string;
  type: TargetType;
  mount: MountType;
  groupId?: string;
  distanceM: number;
  distanceYards: number;
  xOffsetM: number;
  /** Resolved width (m): the entry's, else the type's `defaultWidthM`. */
  widthM: number;
  /** Derived height (m) = width × the type's aspect. */
  heightM: number;
  beamHeightM?: number;
  centreYM?: number;
  /** Forward render-only nudge (m). See `RawPlacement.zNudgeM`. */
  zNudgeM: number;
  /** The `groupId` a strike on this target re-arms. See `RawPlacement.resetsGroupId`. */
  resetsGroupId?: string;
  /** The type's palette with the entry's overrides applied. */
  palette: Record<string, number>;
}

/** Registry lookups, injectable so tests can resolve fixture types before the real
 *  registry has any entries (it stays empty until T7/T8/T9a). Production callers
 *  never pass this. */
export interface PlacementDeps {
  getTargetType: (id: string) => TargetType;
  hasTargetType: (id: string) => boolean;
  getMountType: (id: string) => MountType;
  hasMountType: (id: string) => boolean;
}

const REAL_DEPS: PlacementDeps = { getTargetType, hasTargetType, getMountType, hasMountType };

function fail(rangeId: string, entryId: string, message: string): never {
  throw new Error(`placements[${rangeId}/${entryId || '?'}]: ${message}`);
}

/** Resolve and validate one entry. Every failure names the range and entry, so a
 *  bad data file says which line to fix. */
export function resolvePlacement(
  rangeId: string,
  raw: RawPlacement,
  deps: PlacementDeps = REAL_DEPS,
): ResolvedPlacement {
  if (!raw.id) fail(rangeId, '', 'missing id');
  const id = raw.id;

  if (!raw.typeId) fail(rangeId, id, 'missing typeId');
  if (!deps.hasTargetType(raw.typeId))
    fail(rangeId, id, `unknown target type '${raw.typeId}'`);
  const type = deps.getTargetType(raw.typeId);

  const mountId = raw.mountId ?? type.defaultMount;
  if (!deps.hasMountType(mountId)) fail(rangeId, id, `unknown mount '${mountId}'`);
  // The pairing check. A silhouette welded to a hinged stem is a different object
  // from one hanging on chains; letting any target take any mount would silently
  // produce a target that cannot physically exist.
  if (!type.compatibleMounts.includes(mountId))
    fail(
      rangeId,
      id,
      `mount '${mountId}' is not compatible with target '${type.id}' (allowed: ${type.compatibleMounts.join(', ')})`,
    );
  const mount = deps.getMountType(mountId);

  // Exactly one distance form. Accepting both invites them to disagree; accepting
  // neither leaves the target nowhere.
  const hasYd = raw.distanceYards !== undefined;
  const hasM = raw.distanceM !== undefined;
  if (hasYd === hasM) fail(rangeId, id, 'needs exactly one of distanceYards or distanceM');
  const distanceM = hasYd ? yardsToMeters(raw.distanceYards!) : raw.distanceM!;
  if (!(distanceM > 0)) fail(rangeId, id, `distance must be > 0, got ${distanceM} m`);

  // Width may be authored in inches (how steel is actually sold) or metres.
  if (raw.widthM !== undefined && raw.widthInches !== undefined)
    fail(rangeId, id, 'give widthM or widthInches, not both');
  const widthM =
    raw.widthInches !== undefined
      ? inchesToMeters(raw.widthInches)
      : (raw.widthM ?? type.defaultWidthM);
  if (!(widthM > 0)) fail(rangeId, id, `widthM must be > 0, got ${widthM}`);

  if (!Number.isFinite(raw.xOffsetM)) fail(rangeId, id, 'xOffsetM must be a finite number');

  if (raw.beamHeightM !== undefined && raw.beamHeightYards !== undefined)
    fail(rangeId, id, 'give beamHeightM or beamHeightYards, not both');
  const beamHeightM =
    raw.beamHeightYards !== undefined ? yardsToMeters(raw.beamHeightYards) : raw.beamHeightM;
  // A chain mount with no beam has nothing to hang from — the reaction would build
  // a target whose anchors sit at y = undefined.
  if (mount.needsBeamHeight && beamHeightM === undefined)
    fail(rangeId, id, `mount '${mountId}' requires beamHeightM`);
  if (beamHeightM !== undefined && !(beamHeightM > 0))
    fail(rangeId, id, `beamHeightM must be > 0, got ${beamHeightM}`);
  if (raw.centreYM !== undefined && !(raw.centreYM > 0))
    fail(rangeId, id, `centreYM must be > 0, got ${raw.centreYM}`);
  if (raw.zNudgeM !== undefined && !Number.isFinite(raw.zNudgeM))
    fail(rangeId, id, `zNudgeM must be a finite number, got ${raw.zNudgeM}`);

  // A reset switch with nothing to reset is a dead button, and a reset id on a mount
  // that cannot act on it is a silent no-op. Both are invisible on device, so both are
  // authoring errors here. (Which group it names is checked across the whole range in
  // `resolvePlacementList` — it cannot be known from one entry.)
  const isResetSwitch = mount.reaction === 'reset-switch';
  if (isResetSwitch && raw.resetsGroupId === undefined)
    fail(rangeId, id, `mount '${mountId}' is a reset switch and requires resetsGroupId`);
  if (!isResetSwitch && raw.resetsGroupId !== undefined)
    fail(
      rangeId,
      id,
      `resetsGroupId is only meaningful on a 'reset-switch' mount, and '${mountId}' reacts '${mount.reaction}'`,
    );

  // A palette override keyed on a slot the type does not define is a silent no-op
  // otherwise — the most likely authoring typo, and the least visible.
  const palette = { ...type.paint.palette };
  for (const [slot, value] of Object.entries(raw.palette ?? {})) {
    if (!(slot in type.paint.palette))
      fail(
        rangeId,
        id,
        `palette override '${slot}' is not a slot on target '${type.id}' (has: ${Object.keys(type.paint.palette).join(', ')})`,
      );
    if (!Number.isInteger(value) || value < 0 || value > 0xffffff)
      fail(rangeId, id, `palette '${slot}' must be a 0xRRGGBB integer, got ${value}`);
    palette[slot] = value;
  }

  return {
    id,
    rangeId,
    type,
    mount,
    groupId: raw.groupId,
    distanceM,
    distanceYards: hasYd ? raw.distanceYards! : metersToYards(distanceM),
    xOffsetM: raw.xOffsetM,
    widthM,
    heightM: widthM * type.aspect,
    beamHeightM,
    centreYM: raw.centreYM,
    zNudgeM: raw.zNudgeM ?? 0,
    resetsGroupId: raw.resetsGroupId,
    palette,
  };
}

/** Resolve every entry for one range, then check the cross-entry invariants. */
export function resolvePlacementList(
  rangeId: string,
  raws: readonly RawPlacement[],
  deps: PlacementDeps = REAL_DEPS,
): ResolvedPlacement[] {
  const out = raws.map((raw) => resolvePlacement(rangeId, raw, deps));

  const seen = new Set<string>();
  for (const p of out) {
    if (seen.has(p.id)) fail(rangeId, p.id, 'duplicate placement id');
    seen.add(p.id);
  }

  // A reset switch must name a group that actually exists on this range. Checked here
  // rather than per entry because a group is only visible across the whole list — and
  // checked at all because the failure mode is a plate that takes hits and does
  // nothing, which reads as broken physics rather than as a typo.
  const groupIds = new Set(out.map((p) => p.groupId).filter((g): g is string => g !== undefined));
  for (const p of out) {
    if (p.resetsGroupId === undefined) continue;
    if (!groupIds.has(p.resetsGroupId))
      fail(
        rangeId,
        p.id,
        `resetsGroupId '${p.resetsGroupId}' is not a groupId on this range (has: ${[...groupIds].join(', ') || 'none'})`,
      );
  }

  // A GROUP is one piece of furniture carrying several targets (a plate rack, a
  // dueling tree). Its members therefore share a distance and a mount by
  // definition — if they disagree, the scene cannot build one rack for them and
  // `resetDownTargets(groupId)` is resetting a set that isn't physically one thing.
  const groups = new Map<string, ResolvedPlacement>();
  for (const p of out) {
    if (!p.groupId) continue;
    const first = groups.get(p.groupId);
    if (!first) {
      groups.set(p.groupId, p);
      continue;
    }
    if (Math.abs(first.distanceM - p.distanceM) > 1e-9)
      fail(rangeId, p.id, `group '${p.groupId}' members disagree on distance (${first.distanceM} vs ${p.distanceM} m)`);
    if (first.mount.id !== p.mount.id)
      fail(rangeId, p.id, `group '${p.groupId}' members disagree on mount ('${first.mount.id}' vs '${p.mount.id}')`);
  }

  return out;
}

type RangeBlock = { targets?: RawPlacement[] };

const RANGES = placementsData.ranges as Record<string, RangeBlock>;

// Range ids are checked at import: a typo'd key would otherwise mean the range
// silently gets no targets, which reads as a rendering bug rather than a data one.
for (const rangeId of Object.keys(RANGES)) {
  try {
    getRangeDefinition(rangeId);
  } catch {
    throw new Error(`placements: '${rangeId}' is not a known range id`);
  }
}

/**
 * Every authored placement for a range, resolved. Returns `[]` for a range with no
 * entry — Range A and the ELR Range build their targets in code (see the header),
 * and a future range opting out is not an error.
 */
export function getTargetPlacements(rangeId: string): readonly ResolvedPlacement[] {
  const block = RANGES[rangeId];
  if (!block) return [];
  return resolvePlacementList(rangeId, block.targets ?? []);
}
