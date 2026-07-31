// Tests for Test Range target construction (task T9a).
//
// THE POINT OF THIS FILE is the first suite: the placement-built gong must reproduce
// what `TestRangeScene` used to build from `TEST_RANGE_GONG` directly. That is the
// migration's whole justification — if the new target system cannot reproduce a target
// that already shipped, nothing built on it should be trusted. Everything else here
// guards the invariants the atlas, the chain mesh and the reaction maps depend on.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  buildTestRangePlates,
  chainClampFor,
  plateCentreYM,
} from './test-range-targets';
import { NO_HILL_CORRIDOR, TEST_RANGE_GONG } from './test-range-config';
import { IDPA_SHOULDER_LOCAL_Y } from './targets/idpa';
import { planFace } from './targets/face-plan';
import { getTargetPlacements, resolvePlacement } from './targets/placements';
import { PLATE_CENTER_FRACTION } from './range-a-config';
import { CHAIN_OUTWARD_OFFSET_M, chainOutwardOffsetFor } from '../engine-bridge/steel-target';
import { reactionModeOf } from './targets/mount-registry';
import type { PlateInstance } from './RangeScene';

const plates = buildTestRangePlates(getTargetPlacements('test-range'));

/** The gong `PlateInstance` the OLD code built, verbatim from the pre-T9a
 *  `TestRangeScene.addGong()`. */
function legacyGong(): PlateInstance {
  const g = TEST_RANGE_GONG;
  return {
    rackId: g.rackId,
    distanceM: g.distanceM,
    distanceYards: g.distanceYards,
    diameterM: g.gongDiameterM,
    position: new THREE.Vector3(g.xOffsetM, g.plateCenterYM, -g.distanceM),
    beamHeightM: g.beamHeightM,
    instanceId: 0,
    paintColor: g.paintColor,
  };
}

/** The fields that existed BEFORE T9a. The migration must reproduce these exactly; the
 *  target-system fields (`targetTypeId`, `mountId`, …) are additive and checked
 *  separately below. */
const LEGACY_KEYS = [
  'rackId',
  'distanceM',
  'distanceYards',
  'diameterM',
  'beamHeightM',
  'instanceId',
  'paintColor',
  'chainOutwardOffsetM',
] as const;

describe('T9a: the migrated gong reproduces the shipped one', () => {
  const built = plates[0];
  const legacy = legacyGong();

  it('is the first of the range\'s four authored targets', () => {
    expect(plates.map((p) => p.rackId)).toEqual([
      'test-gong-100',
      'test-idpa-75',
      'test-popper-50a',
      'test-popper-50b',
    ]);
  });

  it('matches the legacy construction field for field', () => {
    for (const key of LEGACY_KEYS) {
      expect(built[key], `field '${key}'`).toEqual(legacy[key]);
    }
  });

  it('places it at exactly the same point in world space', () => {
    // Compared component-wise rather than by object identity: a 1 mm shift here is a
    // visible shift on a 12" plate at 100 yd.
    expect(built.position.x).toBeCloseTo(legacy.position.x, 12);
    expect(built.position.y).toBeCloseTo(legacy.position.y, 12);
    expect(built.position.z).toBeCloseTo(legacy.position.z, 12);
  });

  it('derives the hang height from the beam, as the old code did', () => {
    expect(built.position.y).toBeCloseTo(built.beamHeightM * PLATE_CENTER_FRACTION, 12);
    expect(built.position.y).toBeCloseTo(TEST_RANGE_GONG.plateCenterYM, 12);
  });

  it('leaves the chain offset UNSET, so its chain geometry is unchanged', () => {
    // The trap this catches: `chainOutwardOffsetFor(0.3048)` returns 4.3 cm, not the
    // shared 5 cm — so applying the small-plate clamp unconditionally would have
    // silently moved this gong's chain anchors. It is only applied where the shared
    // constant would actually cross the centreline.
    expect(built.chainOutwardOffsetM).toBeUndefined();
    expect(chainOutwardOffsetFor(TEST_RANGE_GONG.gongDiameterM)).toBeLessThan(
      CHAIN_OUTWARD_OFFSET_M,
    );
  });

  it('reacts identically: it still swings', () => {
    expect(reactionModeOf(built)).toBe('swing');
    expect(reactionModeOf(legacy)).toBe('swing');
  });

  it('carries the target-system fields additively', () => {
    expect(built.targetTypeId).toBe('hanging-gong');
    expect(built.mountId).toBe('chain-beam');
    expect(built.swings).toBe(true); // explicit now; `undefined` meant the same before
    expect(built.heightM).toBeCloseTo(built.diameterM, 12); // round ⇒ no aspect change
    expect(built.groupId).toBeUndefined();
    expect(built.pivotYM).toBeUndefined(); // not a knockdown
  });
});

describe('T9a: invariants the rest of the system depends on', () => {
  it('keeps the gong FIRST — ScopeView auto-commits plates[0] on this range', () => {
    expect(plates[0].rackId).toBe('test-gong-100');
  });

  it('assigns contiguous instanceIds from 0', () => {
    // Simultaneously the atlas layer index, the `chainRest[id*2+ci]` key and the
    // reaction map key. A gap breaks all three.
    expect(plates.map((p) => p.instanceId)).toEqual(plates.map((_, i) => i));
  });

  it('needs one atlas layer per plate', () => {
    // `createPlateSurface(plates.map(p => p.paintColor))` — the scene sizes the atlas
    // from this list, so layer count == plate count by construction.
    expect(plates.map((p) => p.paintColor)).toHaveLength(plates.length);
    for (const p of plates) expect(Number.isInteger(p.paintColor)).toBe(true);
  });

  it('implies two chain slots per plate', () => {
    // The reaction loop indexes `chainRest[id*2+ci]` unconditionally, so the scene must
    // size its chain mesh at exactly this, including for plates that do not hang.
    expect(plates.length * 2).toBe(8);
  });
});

describe('plateCentreYM', () => {
  const place = (raw: Parameters<typeof resolvePlacement>[1]) => resolvePlacement('test-range', raw);

  it('hangs a beam-rack plate at half the beam', () => {
    const p = place({
      id: 'g',
      typeId: 'hanging-gong',
      distanceYards: 100,
      xOffsetM: 0,
      beamHeightM: 2,
    });
    expect(plateCentreYM(p)).toBeCloseTo(2 * PLATE_CENTER_FRACTION, 12);
  });

  it('lets an explicit centreYM win', () => {
    const p = place({
      id: 'g',
      typeId: 'hanging-gong',
      distanceYards: 100,
      xOffsetM: 0,
      beamHeightM: 2,
      centreYM: 1.4,
    });
    expect(plateCentreYM(p)).toBe(1.4);
  });

  it('stands a hinge-stem target on the ground: centre at half its height', () => {
    // Owner, 2026-07-31: poppers must sit at or very near ground level. A popper is
    // hinged at its own base, so its centre height is derived rather than authored.
    const popper = place({ id: 'p', typeId: 'popper', distanceYards: 50, xOffsetM: 1.4 });
    expect(plateCentreYM(popper)).toBeCloseTo(popper.heightM / 2, 12);
  });

  it('REQUIRES centreYM for a stake, whose height it cannot imply', () => {
    // A stake can be any height; guessing would silently place the target wrong.
    const stake = place({
      id: 's',
      typeId: 'idpa-silhouette',
      mountId: 'bolt-stake',
      distanceYards: 75,
      xOffsetM: -1.8,
    });
    expect(() => plateCentreYM(stake)).toThrow(/must specify centreYM/);
  });
});

describe('chainClampFor', () => {
  it('is UNSET for plates the shared constant already handles', () => {
    // Every plate hanging before the clamp existed, including the 12" gong.
    for (const d of [0.3048, 0.4, 0.5, 1.0, 2.0]) {
      expect(chainClampFor(d)).toBeUndefined();
    }
  });

  it('clamps only where the shared offset would cross the centreline', () => {
    // The ELR 50 mm gong: attach 1.4 cm off centre, a 5 cm inward nudge puts the fixed
    // anchor 3.6 cm out the OTHER side, and the resulting stiff oscillator never settles.
    for (const d of [0.05, 0.1, 0.15]) {
      const clamp = chainClampFor(d);
      expect(clamp).toBeDefined();
      expect(clamp!).toBeLessThan(CHAIN_OUTWARD_OFFSET_M);
      expect(clamp!).toBeGreaterThan(0);
    }
  });
});

describe('buildTestRangePlates: knockdown plates', () => {
  it('hinges a knockdown plate at its own BASE, on the ground', () => {
    const p = resolvePlacement('test-range', {
      id: 'pop',
      typeId: 'popper',
      distanceYards: 50,
      xOffsetM: 1.4,
    });
    const [plate] = buildTestRangePlates([p]);
    expect(plate.mountId).toBe('hinge-stem');
    expect(plate.swings).toBe(false);
    expect(reactionModeOf(plate)).toBe('knockdown');
    // Hinge at ground level, and the plate's lower edge with it.
    expect(plate.pivotYM!).toBeCloseTo(0, 9);
    expect(plate.position.y - plate.heightM! / 2).toBeCloseTo(0, 9);
  });

  it('keeps the hinge at the plate base even for an elevated one', () => {
    // The rule is "hinged at its own base", not "hinged at y = 0" — so an explicitly
    // raised popper still pivots about its bottom edge rather than about the ground.
    const p = resolvePlacement('test-range', {
      id: 'pop',
      typeId: 'popper',
      distanceYards: 50,
      xOffsetM: 1.4,
      centreYM: 2.0,
    });
    const [plate] = buildTestRangePlates([p]);
    expect(plate.pivotYM!).toBeCloseTo(2.0 - plate.heightM! / 2, 9);
  });

  it('gives a beamless mount a collapsed chain pair rather than an undefined height', () => {
    const p = resolvePlacement('test-range', {
      id: 's',
      typeId: 'idpa-silhouette',
      mountId: 'bolt-stake',
      distanceYards: 75,
      xOffsetM: -1.8,
      centreYM: 1.2,
    });
    const [plate] = buildTestRangePlates([p]);
    // beamHeightM falls back to the plate centre, so the drawn chain pair has zero
    // length — the same thing ELR's stake plates do — rather than NaN geometry.
    expect(plate.beamHeightM).toBeCloseTo(1.2, 12);
    expect(plate.position.y).toBeCloseTo(1.2, 12);
    expect(reactionModeOf(plate)).toBe('bolted');
  });

  it('numbers a multi-target list contiguously and preserves order', () => {
    const raws = [
      { id: 'a', typeId: 'hanging-gong', distanceYards: 100, xOffsetM: 0, beamHeightM: 1.1 },
      { id: 'b', typeId: 'popper', distanceYards: 50, xOffsetM: 1.4, centreYM: 1 },
      { id: 'c', typeId: 'popper', distanceYards: 50, xOffsetM: 1.9, centreYM: 1 },
    ];
    const built = buildTestRangePlates(raws.map((r) => resolvePlacement('test-range', r)));
    expect(built.map((p) => p.rackId)).toEqual(['a', 'b', 'c']);
    expect(built.map((p) => p.instanceId)).toEqual([0, 1, 2]);
  });
});

// --- T9b: the full three-target Test Range -------------------------------------

describe('T9b: the stake IDPA and the popper pair', () => {
  const byId = (id: string) => plates.find((p) => p.rackId === id)!;
  const idpa = byId('test-idpa-75');
  const popperA = byId('test-popper-50a');
  const popperB = byId('test-popper-50b');

  it('mounts the IDPA on a stake — bolted, so it takes paint but never swings', () => {
    expect(idpa.targetTypeId).toBe('idpa-silhouette');
    expect(idpa.mountId).toBe('bolt-stake');
    expect(idpa.swings).toBe(false);
    expect(reactionModeOf(idpa)).toBe('bolted');
    expect(idpa.pivotYM).toBeUndefined(); // not a knockdown
  });

  it('gives the IDPA its real proportions: 18in wide, 30.75in tall', () => {
    expect(idpa.diameterM).toBeCloseTo(0.4572, 4); // the type's defaultWidthM
    // height = width × aspect(1.6879) ≈ 0.7717 m = 30.4"; the drawing states 30.75".
    expect(idpa.heightM!).toBeCloseTo(0.4572 * 1.6879, 3);
    expect(idpa.heightM! / 0.0254).toBeGreaterThan(29.5);
    expect(idpa.heightM! / 0.0254).toBeLessThan(31);
  });

  it('stages the IDPA with its SHOULDERS at 5 ft (owner spec)', () => {
    // Owner, 2026-07-31: "The IDPA height should be 5' at the shoulders." Asserted
    // against the shoulder line transcribed from the spec, because the previous
    // staging (centreYM 1.05) drew them at 4.22 ft and no test noticed — a comment
    // claiming the height would not have caught it.
    const shoulderY = idpa.position.y + IDPA_SHOULDER_LOCAL_Y * idpa.diameterM;
    expect(shoulderY).toBeCloseTo(5 * 0.3048, 2); // within 1 cm of 1.524 m
  });

  it('puts its feet on the stake and its head above the shoulders', () => {
    // The consequence of the shoulder spec: an IDPA target is a TORSO on a stand, so
    // the cardboard's base sits well off the ground rather than at it.
    const halfHeight = idpa.heightM! / 2;
    const shoulderY = idpa.position.y + IDPA_SHOULDER_LOCAL_Y * idpa.diameterM;
    expect(idpa.position.y - halfHeight).toBeGreaterThan(0.5); // feet up on the stake
    expect(idpa.position.y + halfHeight).toBeGreaterThan(shoulderY); // head above them
  });

  it('mounts both poppers on hinged stems, sharing ONE group', () => {
    for (const p of [popperA, popperB]) {
      expect(p.targetTypeId).toBe('popper');
      expect(p.mountId).toBe('hinge-stem');
      expect(p.swings).toBe(false);
      expect(reactionModeOf(p)).toBe('knockdown');
      expect(p.groupId).toBe('test-poppers');
    }
    // Same group ⇒ one piece of furniture, and one reset stands both up.
    expect(popperA.distanceM).toBeCloseTo(popperB.distanceM, 12);
    expect(popperA.mountId).toBe(popperB.mountId);
  });

  it('puts each popper hinge at ground level', () => {
    // centreYM 1.0 == the mount's stemLengthM, so the pivot lands at y = 0.
    for (const p of [popperA, popperB]) expect(p.pivotYM!).toBeCloseTo(0, 9);
  });

  it('gives the poppers their real proportions: 12in wide, 42in tall', () => {
    for (const p of [popperA, popperB]) {
      expect(p.diameterM).toBeCloseTo(0.3048, 4);
      expect(p.heightM! / 0.0254).toBeGreaterThan(41);
      expect(p.heightM! / 0.0254).toBeLessThan(43);
    }
  });

  it('separates the two poppers by more than a plate width', () => {
    // Touching poppers would read as one target and could not be scored apart.
    const gap = Math.abs(popperA.position.x - popperB.position.x);
    expect(gap).toBeGreaterThan(popperA.diameterM);
  });
});

describe('T9b: layout keeps the sight line clear', () => {
  it('puts nothing inside the NO_HILL_CORRIDOR half-width', () => {
    // `test-range-config` guarantees a 10 yd wide, 100 yd long flat corridor down the
    // sight line. A target parked in it would sit where the terrain is deliberately
    // featureless AND could occlude the gong.
    const halfWidth = NO_HILL_CORRIDOR.halfWidthM;
    for (const p of plates) {
      if (p.rackId === 'test-gong-100') continue; // the gong IS the corridor's target
      expect(Math.abs(p.position.x)).toBeLessThan(halfWidth);
    }
  });

  it('separates the IDPA and the poppers to opposite sides of centre', () => {
    // One sight picture, no occlusion: the IDPA left, the poppers right.
    const idpa = plates.find((p) => p.rackId === 'test-idpa-75')!;
    const poppers = plates.filter((p) => p.targetTypeId === 'popper');
    expect(idpa.position.x).toBeLessThan(0);
    for (const p of poppers) expect(p.position.x).toBeGreaterThan(0);
  });

  it('orders targets near-to-far behind the shooter line, all downrange', () => {
    for (const p of plates) expect(p.position.z).toBeLessThan(0);
    // Distances: 100 (gong), 75 (IDPA), 50, 50 (poppers) — nothing coincident in a
    // way that would put a near target in front of a far one at the same x.
    const sameX = plates.filter((p) => Math.abs(p.position.x) < 0.01);
    expect(sameX).toHaveLength(1); // only the gong is dead centre
  });

  it('keeps every plate above the ground and below eye height at the muzzle', () => {
    for (const p of plates) {
      const half = (p.heightM ?? p.diameterM) / 2;
      expect(p.position.y - half).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('T9b: multi-shape invariants', () => {
  it('needs three DISTINCT geometries but keeps one global id space', () => {
    const types = new Set(plates.map((p) => p.targetTypeId));
    expect(types).toEqual(new Set(['hanging-gong', 'idpa-silhouette', 'popper']));
    // Ids stay 0..n-1 across all of them — the atlas layer index, the chain slot key
    // and the reaction map key all depend on it.
    expect(plates.map((p) => p.instanceId)).toEqual([0, 1, 2, 3]);
  });

  it('gives the two beamless mounts a collapsed chain pair rather than a missing one', () => {
    // `chainRest[id*2+ci]` is read unconditionally on every hit.
    for (const p of plates) {
      if (p.swings !== false) continue;
      expect(p.beamHeightM).toBeCloseTo(p.position.y, 12); // collapsed to the centre
    }
  });

  it('resolves a face plan for every target, and only some need art', () => {
    for (const placement of getTargetPlacements('test-range')) {
      const plan = planFace(placement.type, { palette: placement.palette });
      expect(plan.ops.length).toBeGreaterThan(0);
      expect(plan.paintHex).not.toBeNull();
    }
    // The gong is flat paint only; the IDPA and popper have more.
    const needsArt = getTargetPlacements('test-range').filter(
      (pl) => planFace(pl.type, { palette: pl.palette }).ops.some((op) => op.kind !== 'fill'),
    );
    expect(needsArt.map((pl) => pl.type.id).sort()).toEqual([
      'idpa-silhouette',
      'popper',
      'popper',
    ]);
  });
});
