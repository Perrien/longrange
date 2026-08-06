// Test Range target construction (Design/archive/target-system-plan.md, task T9a).
//
// PURE: turns resolved placements into `PlateInstance[]`. Extracted from
// `TestRangeScene` precisely so it can be unit-tested — the scene itself cannot be
// constructed in the node env (its range sign needs a 2D canvas), so without this split
// the migration's central claim would rest on an owner's eyes alone.
//
// THE CLAIM THIS EXISTS TO PROVE: the placement-built gong is field-for-field identical
// to the one `TestRangeScene` used to build from `TEST_RANGE_GONG` directly. If the new
// system cannot reproduce a target that already shipped, nothing built on it is
// trustworthy. `test-range-targets.test.ts` asserts it.

import * as THREE from 'three';
import { PLATE_CENTER_FRACTION } from './range-a-config';
import type { PlateInstance } from './RangeScene';
import {
  CHAIN_ANCHOR_ANGLE_RAD,
  CHAIN_OUTWARD_OFFSET_M,
  chainOutwardOffsetFor,
} from '../engine-bridge/steel-target';
import type { ResolvedPlacement } from './targets/placements';

/**
 * The chain-anchor clamp, applied only where it is actually needed.
 *
 * `chainOutwardOffsetFor` clamps the shared 5 cm inward offset so it cannot cross a
 * small plate's centreline — the ELR 50 m gong's forever-swing bug. But it is not a
 * no-op at every size the shared constant already handles safely: on a 12″ plate it
 * returns 4.3 cm rather than 5 cm. Applying it unconditionally during the migration
 * would therefore have changed the Test Range gong's chain geometry. So it is applied
 * only when the shared constant would put the fixed anchor at or past the centreline,
 * and `undefined` otherwise — which leaves every currently-correct plate untouched.
 */
export function chainClampFor(widthM: number): number | undefined {
  const ax = (widthM / 2) * Math.sin(CHAIN_ANCHOR_ANGLE_RAD);
  return ax - CHAIN_OUTWARD_OFFSET_M <= 0 ? chainOutwardOffsetFor(widthM) : undefined;
}

/**
 * Plate-centre height above ground for one placement.
 *
 * Explicit `centreYM` wins. Otherwise it comes from the mount's FURNITURE, because
 * hang height is a property of the rack rather than of the target: a beam rack hangs
 * its plate at `PLATE_CENTER_FRACTION` of the beam, which is the same rule Range A and
 * the original Test Range gong already used.
 */
export function plateCentreYM(p: ResolvedPlacement): number {
  if (p.centreYM !== undefined) return p.centreYM;
  switch (p.mount.furniture) {
    case 'beam-rack':
    case 'panel':
      if (p.beamHeightM === undefined)
        throw new Error(`test-range-targets: '${p.id}' needs beamHeightM or centreYM`);
      return p.beamHeightM * PLATE_CENTER_FRACTION;
    case 'hinge-stem':
      // A popper is hinged at its OWN BASE and stands on the ground, so its centre is
      // half its height up. Owner, on device 2026-07-31: "Poppers should sit at or very
      // near ground level" — the previous authored 1.0 m centre floated a 42″ plate
      // 0.47 m in the air on a visible stem.
      return p.heightM / 2;
    case 'stake':
    case 'pivot-post':
    case 'tree-post':
    case 'none':
      // Nothing to derive it from — a stake's (or a hostage clamp's, or a
      // dueling-tree post's) height is not the plate's centre. These MUST
      // author `centreYM`.
      throw new Error(
        `test-range-targets: '${p.id}' on furniture '${p.mount.furniture}' must specify centreYM`,
      );
  }
}

/**
 * Build the Test Range's plate list from its authored placements.
 *
 * `instanceId` is the index in this array, which keeps the global id space contiguous —
 * the invariant the paint atlas (layer == instanceId), `chainRest[id*2+ci]` and the
 * reaction maps all depend on.
 */
export function buildTestRangePlates(
  placements: readonly ResolvedPlacement[],
): PlateInstance[] {
  return placements.map((p, instanceId) => {
    const centreY = plateCentreYM(p);
    const plate: PlateInstance = {
      rackId: p.id,
      distanceM: p.distanceM,
      distanceYards: Math.round(p.distanceYards),
      diameterM: p.widthM,
      // `zNudgeM` moves the RENDERED mesh only, toward the shooter (less-negative
      // z) — never `distanceM`, which stays the hit-test/range-gating value. It
      // exists for a target authored to sit visually in front of another at the
      // identical distance (a hostage paddle behind a silhouette's window):
      // without it the two meshes are exactly coplanar and z-fight.
      position: new THREE.Vector3(p.xOffsetM, centreY, -p.distanceM + p.zNudgeM),
      // Chains anchor at the beam; a mount with no beam still needs a number here
      // (the field is not optional), so it takes the plate centre — which collapses
      // its chain pair to zero length, exactly as ELR's stake plates do.
      beamHeightM: p.beamHeightM ?? centreY,
      instanceId,
      paintColor: p.palette.face ?? 0xf0f0ea,
      targetTypeId: p.type.id,
      mountId: p.mount.id,
      heightM: p.heightM,
      groupId: p.groupId,
      // Bolted and knockdown mounts do not swing. Written explicitly (rather than left
      // to `reactionModeOf`) so a plate is self-describing to anything reading the
      // legacy field.
      swings: p.mount.reaction === 'swing',
      // The small-plate chain clamp is applied ONLY where the shared constant would
      // actually put the fixed anchor across the centreline. Applying it everywhere
      // would silently change the geometry of plates that hang correctly today — the
      // 12″ gong included (0.05 → 0.043 m), which is precisely the kind of drift the
      // migration exists to avoid.
      chainOutwardOffsetM: chainClampFor(p.widthM),
    };
    if (p.mount.reaction === 'knockdown') {
      // The hinge is at the plate's own BASE, not a fixed distance below its centre.
      // That is both what a real popper does and what keeps it on the ground: the rod
      // in the fall equation is then the plate's full height, with its centre of mass
      // at half — exactly the uniform-rod-about-one-end model `knockdown.ts` solves.
      plate.pivotYM = centreY - p.heightM / 2;
    }
    return plate;
  });
}
