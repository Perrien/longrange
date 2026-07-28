import { describe, it, expect } from 'vitest';
import {
  planApproach,
  coneRadiusAt,
  treeOccludes,
  occludingTreeIndices,
  clearanceMarginM,
  chooseOffset,
  offsetCandidates,
  boundsOf,
  DEFAULT_MARGIN_M,
  type Point3,
} from './sight-clearance';
import { treeUnitBounds } from './environment/trees';
import type { TreePlacement } from './environment/environment-config';

const EYE: Point3 = { x: 0, y: 1.7, z: 0 };

/** A tree at (x, z) standing on ground height `groundY`. */
function tree(x: number, z: number, over: Partial<TreePlacement> = {}): TreePlacement {
  return {
    kind: 'conifer',
    x,
    z,
    y: 0,
    scale: 1,
    scaleXZ: 1,
    scaleY: 1,
    rotationY: 0,
    tiltX: 0,
    tiltZ: 0,
    variantIndex: 0,
    tintIndex: 0,
    ...over,
  };
}

describe('treeUnitBounds', () => {
  // The cone tiers are CENTRED then translated, so a tier top is y + height/2.
  // Reading it as y + height would over-estimate every conifer by half a tier and
  // reject trees that block nothing.
  it('measures a conifer to the top of its highest tier, not half a tier past it', () => {
    const b = treeUnitBounds('conifer', 0);
    expect(b.top).toBeCloseTo(5.9 + 1.8 / 2, 6);
    expect(b.radius).toBeCloseTo(1.6, 6);
  });

  it('measures a broadleaf crown to the top of its highest blob', () => {
    const b = treeUnitBounds('deciduous', 1);
    expect(b.top).toBeCloseTo(5.6 + 0.85, 6);
    // Widest reach is the blob's RADIAL offset plus its radius — hypot(x, z), not
    // x alone. That blob sits at (0.4, 0.2), so ignoring z under-reports the crown
    // by 4.7 cm and would let a tree clip a sight line the maths called clear.
    expect(b.radius).toBeCloseTo(Math.hypot(0.4, 0.2) + 1.0, 6);
  });

  it('wraps an out-of-range variant index rather than returning undefined', () => {
    expect(treeUnitBounds('conifer', 99).top).toBeGreaterThan(0);
    expect(treeUnitBounds('deciduous', 99).radius).toBeGreaterThan(0);
  });

  it('scales with the placement, in both axes independently', () => {
    const b = boundsOf(tree(0, 0, { scaleXZ: 2, scaleY: 3 }));
    const unit = treeUnitBounds('conifer', 0);
    expect(b.radiusM).toBeCloseTo(unit.radius * 2, 6);
    expect(b.topM).toBeCloseTo(unit.top * 3, 6);
  });
});

describe('planApproach', () => {
  it('finds the perpendicular distance to the sight line', () => {
    const t = planApproach(EYE, { x: 0, y: 0, z: -1000 }, 5, -500);
    expect(t.distanceM).toBeCloseTo(5, 6);
    expect(t.t).toBeCloseTo(0.5, 6);
  });

  it('reports t outside [0,1] for behind-the-shooter and past-the-target', () => {
    const target = { x: 0, y: 0, z: -1000 };
    expect(planApproach(EYE, target, 0, 100).t).toBeLessThan(0);
    expect(planApproach(EYE, target, 0, -1500).t).toBeGreaterThan(1);
  });
});

describe('treeOccludes', () => {
  const target = { position: { x: 0, y: 3, z: -1000 }, radiusM: 1 };

  it('blocks when a tall tree stands on the sight line midway', () => {
    expect(treeOccludes(EYE, target, tree(0, -500))).toBe(true);
  });

  // THE POINT OF TESTING HEIGHT AS WELL AS PLAN POSITION. Same plan position,
  // same sight line — but this tree stands in a dip deep enough that its crown
  // never reaches the corridor. Rejecting it would cost a tree for nothing.
  it('does NOT block when the same tree sits low enough to pass under', () => {
    const inADip = tree(0, -500, { y: -20 });
    expect(treeOccludes(EYE, target, inADip)).toBe(false);
  });

  it('ignores trees behind the shooter and beyond the target', () => {
    expect(treeOccludes(EYE, target, tree(0, 200))).toBe(false);
    expect(treeOccludes(EYE, target, tree(0, -1500))).toBe(false);
  });

  // A ray test would pass this: the plate's centre is visible, but a third of the
  // plate is behind a trunk. The cone is what catches it.
  it('blocks a tree beside the centre line that still covers part of the plate', () => {
    const wide = { position: { x: 0, y: 3, z: -1000 }, radiusM: 3 };
    const beside = tree(2.0, -900);
    expect(planApproach(EYE, wide.position, beside.x, beside.z).distanceM).toBeGreaterThan(
      wide.radiusM - 1.5,
    );
    expect(treeOccludes(EYE, wide, beside)).toBe(true);
  });

  it('widens its guard with the margin', () => {
    const t = tree(6, -500);
    expect(treeOccludes(EYE, target, t, 0)).toBe(false);
    expect(treeOccludes(EYE, target, t, 12)).toBe(true);
  });

  it('scales the guard with the tree — a bigger crown blocks from further off', () => {
    const far = tree(4, -500);
    expect(treeOccludes(EYE, target, far)).toBe(false);
    expect(treeOccludes(EYE, target, { ...far, scaleXZ: 4 })).toBe(true);
  });
});

describe('coneRadiusAt', () => {
  it('is zero at the eye and plate-plus-margin at the target', () => {
    expect(coneRadiusAt(0, 1, DEFAULT_MARGIN_M)).toBe(0);
    expect(coneRadiusAt(1, 1, 2)).toBeCloseTo(3, 9);
    expect(coneRadiusAt(0.5, 1, 2)).toBeCloseTo(1.5, 9);
  });
});

describe('clearanceMarginM', () => {
  const target = { position: { x: 0, y: 3, z: -1000 }, radiusM: 1 };

  it('is positive and large with an empty forest', () => {
    expect(clearanceMarginM(EYE, target, [])).toBe(Infinity);
  });

  it('goes negative exactly when something occludes', () => {
    const blocked = [tree(0, -500)];
    expect(occludingTreeIndices(EYE, target, blocked)).toHaveLength(1);
    expect(clearanceMarginM(EYE, target, blocked)).toBeLessThan(0);
  });

  // What makes the search able to prefer "nearly clear" over "buried".
  it('orders two blocked positions by how badly they are blocked', () => {
    const grazing = clearanceMarginM(EYE, target, [tree(4.0, -500)]);
    const buried = clearanceMarginM(EYE, target, [tree(0, -500)]);
    expect(grazing).toBeGreaterThan(buried);
  });

  // A gap measured in metres where the tree stands tells you nothing on its own,
  // and the intuition runs the opposite way to what you might expect: the SAME
  // 4 m lateral gap is 40 mrad of clear air at 100 m but only 4.4 mrad at 900 m.
  // So the near tree is comfortably outside the cone while the far one clips it —
  // which is why the gap has to be projected to the target plane before the two
  // are comparable at all. (Written the wrong way round first time; the code was
  // right and the test was wrong.)
  it('normalises gaps to the target plane, so near and far gaps compare fairly', () => {
    const near = clearanceMarginM(EYE, target, [tree(4, -100)]);
    const far = clearanceMarginM(EYE, target, [tree(4, -900)]);
    expect(near).toBeGreaterThan(far);
    expect(near).toBeGreaterThan(0); // 40 mrad off the line — nowhere near it
    expect(far).toBeLessThan(0); // 4.4 mrad off, against a 3 mrad cone — clips
  });
});

describe('chooseOffset', () => {
  const candidates = offsetCandidates(60, 2);

  it('preserves the station RANGE while moving it sideways', () => {
    // A station is defined by its distance; sliding it laterally along a fixed z
    // would quietly change the DOPE row it is meant to teach.
    const picked = chooseOffset(EYE, 1000, 3, 1, [], { candidates });
    const z = -Math.sqrt(1000 * 1000 - picked.offsetM * picked.offsetM);
    expect(Math.hypot(picked.offsetM, z)).toBeCloseTo(1000, 6);
  });

  it('threads the gap in a wall of trees rather than giving up', () => {
    // A picket fence at 500 m with one hole at x = +30.
    const wall: TreePlacement[] = [];
    for (let x = -60; x <= 60; x += 3) {
      if (Math.abs(x - 30) < 6) continue; // the gap
      wall.push(tree(x, -500));
    }
    const picked = chooseOffset(EYE, 1000, 3, 1, wall, { candidates });
    expect(picked.occluders).toBe(0);
    // Assert the PROPERTY, not one particular answer. Several offsets thread the
    // same hole — a station far out to the right crosses x = +30 at the fence —
    // and pinning the test to one of them would fail on an improvement.
    const z = -Math.sqrt(1000 * 1000 - picked.offsetM * picked.offsetM);
    const tAtFence = -500 / z;
    const xAtFence = picked.offsetM * tAtFence;
    expect(Math.abs(xAtFence - 30)).toBeLessThan(6);
  });

  it('honours a requested side when a rhythm is being imposed', () => {
    const left = chooseOffset(EYE, 1000, 3, 1, [], { candidates, side: 'left' });
    expect(left.offsetM).toBeLessThanOrEqual(0);
    const right = chooseOffset(EYE, 1000, 3, 1, [], { candidates, side: 'right' });
    expect(right.offsetM).toBeGreaterThanOrEqual(0);
  });

  it('prefers fewer occluders even when a blocked spot scores a wider margin', () => {
    // One distant trunk clipping the cone edge can out-score a genuinely open
    // position on margin alone. Count is what the player sees, so count wins.
    const picked = chooseOffset(EYE, 1000, 3, 1, [tree(0, -500)], { candidates });
    expect(picked.occluders).toBe(0);
    expect(picked.offsetM).not.toBe(0);
  });

  it('still returns a usable answer when every candidate is blocked', () => {
    const dense: TreePlacement[] = [];
    for (let x = -80; x <= 80; x += 1) dense.push(tree(x, -500, { scaleXZ: 3 }));
    const picked = chooseOffset(EYE, 1000, 3, 1, dense, { candidates });
    expect(Number.isFinite(picked.offsetM)).toBe(true);
    expect(picked.occluders).toBeGreaterThan(0);
  });
});

describe('offsetCandidates', () => {
  it('spans the lane symmetrically and includes the centre', () => {
    const c = offsetCandidates(10, 5);
    expect(c).toEqual([-10, -5, 0, 5, 10]);
  });
});
