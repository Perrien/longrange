// Tests for the dueling-tree paddle type + geometry module
// (`Design/Plans/dueling-tree-plan.md`).
//
// DT1 pins the DATA-LEVEL geometry: the target type itself, the two arm
// mounts' swing distances, post clearance, and the paddle stack fitting the
// post. DT2 (below) pins the PLACEMENT-level invariants over the real shipped
// rows — group membership, derived offsets, and the first-hit loop that would
// have caught the hostage assembly's unhittable-paddle bug, run here even
// though nothing occludes a tree paddle (the plan's own caution, §4.1).

import { describe, it, expect } from 'vitest';
import { inchesToMeters } from '../../units';
import {
  DUELING_TREE_ARM_CLEARANCE_M,
  DUELING_TREE_PADDLE,
  DUELING_TREE_PADDLE_COUNT,
  DUELING_TREE_PADDLE_PITCH_M,
  DUELING_TREE_POST_HEIGHT_M,
  DUELING_TREE_POST_RADIUS_M,
  duelingTreePaddleYM,
  duelingTreeSwingM,
} from './dueling-tree';
import { getMountType, listMountTypes } from './mount-registry';
import { getTargetType, listTargetTypes } from './registry';
import { validateTargetType } from './target-type';
import { getTargetPlacements, resolvePlacementList, type RawPlacement } from './placements';
import { hitTargetZone } from '../../game/target-hit';
import type { ShotPlate } from '../../game/shot';

const SIZES_IN = [6, 8] as const;
const MOUNT_ID_FOR: Record<(typeof SIZES_IN)[number], string> = {
  6: 'dueling-tree-arm-6',
  8: 'dueling-tree-arm-8',
};

describe('dueling-tree paddle (target type)', () => {
  it('is a valid target type', () => {
    expect(() => validateTargetType(DUELING_TREE_PADDLE)).not.toThrow();
  });

  it('is a disc with one zone', () => {
    expect(DUELING_TREE_PADDLE.shape).toEqual({ kind: 'disc' });
    expect(DUELING_TREE_PADDLE.aspect).toBe(1);
    expect(DUELING_TREE_PADDLE.zones).toHaveLength(1);
    expect(DUELING_TREE_PADDLE.defaultZoneId).toBe('paddle');
  });

  it('is registered, and accepts only the two dueling-tree arm mounts', () => {
    expect(getTargetType('dueling-tree-paddle')).toBe(DUELING_TREE_PADDLE);
    expect(listTargetTypes()).toContain(DUELING_TREE_PADDLE);
    expect(DUELING_TREE_PADDLE.compatibleMounts).toEqual([
      'dueling-tree-arm-6',
      'dueling-tree-arm-8',
    ]);
    expect(DUELING_TREE_PADDLE.defaultMount).toBe('dueling-tree-arm-6');
  });

  it('defaults to a 6" paddle', () => {
    expect(DUELING_TREE_PADDLE.defaultWidthM).toBeCloseTo(inchesToMeters(6), 12);
  });
});

describe('dueling-tree arm mounts', () => {
  it('are registered as flip mounts on tree-post furniture', () => {
    for (const size of SIZES_IN) {
      const m = getMountType(MOUNT_ID_FOR[size]);
      expect(m.reaction).toBe('flip');
      expect(m.furniture).toBe('tree-post');
      expect(m.needsBeamHeight).toBe(false);
      expect(m.flip!.positions.map((p) => p.id)).toEqual(['left', 'right']);
      expect(m.flip!.positions[0].xOffsetM).toBe(0); // rest
    }
  });

  it('are in the mount registry roster', () => {
    expect(listMountTypes().map((m) => m.id)).toContain('dueling-tree-arm-6');
    expect(listMountTypes().map((m) => m.id)).toContain('dueling-tree-arm-8');
  });

  it("each mount's swing equals duelingTreeSwingM(its own paddle size) — recomputed, not pasted", () => {
    for (const size of SIZES_IN) {
      const m = getMountType(MOUNT_ID_FOR[size]);
      const expectedSwing = duelingTreeSwingM(inchesToMeters(size));
      expect(m.flip!.positions[1].xOffsetM).toBeCloseTo(expectedSwing, 12);
    }
  });

  it('the paddle clears the post at both stops, for both sizes', () => {
    // The arm is half the stop-to-stop swing; the rim-to-post gap left over
    // after the paddle's own radius must be at least the post's radius.
    for (const size of SIZES_IN) {
      const m = getMountType(MOUNT_ID_FOR[size]);
      const swing = m.flip!.positions[1].xOffsetM;
      const arm = swing / 2;
      const paddleRadiusM = inchesToMeters(size) / 2;
      expect(arm - paddleRadiusM).toBeGreaterThanOrEqual(DUELING_TREE_POST_RADIUS_M);
      // …and specifically by the authored clearance, not by accident.
      expect(arm - paddleRadiusM).toBeCloseTo(
        DUELING_TREE_POST_RADIUS_M + DUELING_TREE_ARM_CLEARANCE_M,
        12,
      );
    }
  });
});

describe('the paddle stack fits the post, for both sizes', () => {
  it('gives 5 paddles at 55/45/35/25/15 inches', () => {
    expect(DUELING_TREE_PADDLE_COUNT).toBe(5);
    const centres = Array.from({ length: DUELING_TREE_PADDLE_COUNT }, (_, i) =>
      duelingTreePaddleYM(i),
    );
    expect(centres.map((c) => c / 0.0254)).toEqual([55, 45, 35, 25, 15]);
  });

  it("the top paddle's top edge stays under the post top", () => {
    const topCentre = duelingTreePaddleYM(0);
    for (const size of SIZES_IN) {
      const topEdge = topCentre + inchesToMeters(size) / 2;
      expect(topEdge).toBeLessThanOrEqual(DUELING_TREE_POST_HEIGHT_M);
    }
  });

  it("the bottom paddle's bottom edge stays above the ground", () => {
    const bottomCentre = duelingTreePaddleYM(DUELING_TREE_PADDLE_COUNT - 1);
    for (const size of SIZES_IN) {
      const bottomEdge = bottomCentre - inchesToMeters(size) / 2;
      expect(bottomEdge).toBeGreaterThan(0);
    }
  });

  it('the pitch exceeds the largest authored paddle diameter, so no two paddles overlap', () => {
    const largestDiameterM = inchesToMeters(Math.max(...SIZES_IN));
    expect(DUELING_TREE_PADDLE_PITCH_M).toBeGreaterThan(largestDiameterM);
  });
});

// --- DT2: the real shipped placements -----------------------------------------
//
// The post's world x (design decision, `placements.data.json`'s `_note` on
// `test-tree-1`) — not a module constant, since the post's LOCATION on the
// range is a placement choice, unlike its radius/height which are hardware.
const TREE_POST_X_M = -3.0;

describe('the shipped dueling-tree placements', () => {
  const tree = getTargetPlacements('test-range').filter(
    (p) => p.groupId === 'test-dueling-tree',
  );

  it('resolves all five, sharing one groupId, one distance and one mount', () => {
    expect(tree).toHaveLength(DUELING_TREE_PADDLE_COUNT);
    for (const p of tree) {
      expect(p.groupId).toBe('test-dueling-tree');
      expect(p.distanceM).toBeCloseTo(tree[0].distanceM, 12);
      expect(p.mount.id).toBe(tree[0].mount.id);
      expect(p.type.id).toBe('dueling-tree-paddle');
    }
  });

  it('is authored in top-to-bottom order, matching duelingTreePaddleYM(0..4)', () => {
    tree.forEach((p, i) => {
      expect(p.centreYM).toBeCloseTo(duelingTreePaddleYM(i), 12);
    });
  });

  it("every paddle's rest xOffsetM equals postX − swing/2, for its authored size", () => {
    for (const p of tree) {
      const swing = duelingTreeSwingM(p.widthM);
      expect(p.xOffsetM).toBeCloseTo(TREE_POST_X_M - swing / 2, 6);
    }
  });

  it('carries no zNudgeM — a tree paddle has no coplanar neighbour to z-fight', () => {
    for (const p of tree) expect(p.zNudgeM).toBe(0);
  });

  // The rack, in authored order — mirrors `hostage-paddle.test.ts`'s "reachable
  // at EVERY stop" block, run over the REAL shipped geometry rather than the
  // pitch/clearance numbers in isolation (plan §4.1: nothing occludes a tree
  // paddle, but the loop must still be exercised, since that loop — not the
  // offsets — is what actually decides a hit).
  function shotPlates(): ShotPlate[] {
    return tree.map((p, instanceId) => ({
      instanceId,
      position: { x: p.xOffsetM, y: p.centreYM! },
      diameterM: p.widthM,
      typeId: p.type.id,
    }));
  }

  const BULLET_D_M = 0.0067056; // .264

  /** `resolveShot`'s hit loop: first plate whose zones break, in rack order. */
  function firstHit(plates: ShotPlate[], impact: { x: number; y: number }) {
    for (const plate of plates) {
      const zone = hitTargetZone(impact, plate, BULLET_D_M);
      if (zone) return zone;
    }
    return null;
  }

  it('resolves a shot at each paddle to that paddle — not a neighbour — at BOTH of its stops', () => {
    for (let i = 0; i < tree.length; i++) {
      const swing = duelingTreeSwingM(tree[i].widthM);
      const stops = [tree[i].xOffsetM, tree[i].xOffsetM + swing]; // left, right
      for (const stopX of stops) {
        const plates = shotPlates();
        plates[i] = { ...plates[i], position: { x: stopX, y: tree[i].centreYM! } };
        const hit = firstHit(plates, { x: stopX, y: tree[i].centreYM! });
        expect(hit, `paddle ${tree[i].id} is unreachable at x=${stopX}`).not.toBeNull();
        expect(hit!.instanceId, `stop at x=${stopX} resolved to a different paddle`).toBe(i);
        expect(hit!.zoneId).toBe('paddle');
      }
    }
  });
});

// --- DT3: the 8″ option, covered WITHOUT shipping it --------------------------
//
// The shipped placements stay 6″ (owner default). This resolves a SYNTHETIC 8″
// placement set through the real `resolvePlacementList`/registries and runs the
// same class of invariants as the DT2 block above, so the 8″ path — and the
// three-field swap recipe documented in `placements.data.json`'s `_note` — is
// exercised by the suite even though no 8″ row ships.
describe('a synthetic 8″ dueling-tree placement set (DT3, not shipped)', () => {
  const WIDTH_IN = 8;
  const SWING_8 = duelingTreeSwingM(inchesToMeters(WIDTH_IN));
  const REST_X_8 = TREE_POST_X_M - SWING_8 / 2; // matches the DT3 swap recipe: -3.1597

  function synthetic8InRaws(): RawPlacement[] {
    return Array.from({ length: DUELING_TREE_PADDLE_COUNT }, (_, i) => ({
      id: `synthetic-tree-8-${i + 1}`,
      typeId: 'dueling-tree-paddle',
      mountId: 'dueling-tree-arm-8',
      groupId: 'synthetic-dueling-tree-8',
      distanceYards: 80,
      xOffsetM: REST_X_8,
      widthInches: WIDTH_IN,
      centreYM: duelingTreePaddleYM(i),
    }));
  }

  it("matches the plan's documented swap recipe (widthInches, mountId, xOffsetM)", () => {
    // The literal the plan's DT3 table and placements.data.json's `_note` both
    // promise: swapping all three fields on the shipped 6″ rows reproduces
    // exactly this xOffsetM.
    expect(REST_X_8).toBeCloseTo(-3.1597, 4);
  });

  it('resolves, sharing one groupId, one distance and one mount, at duelingTreePaddleYM centres', () => {
    const tree8 = resolvePlacementList('dueling-tree-dt3-synthetic', synthetic8InRaws());
    expect(tree8).toHaveLength(DUELING_TREE_PADDLE_COUNT);
    for (const p of tree8) {
      expect(p.groupId).toBe('synthetic-dueling-tree-8');
      expect(p.mount.id).toBe('dueling-tree-arm-8');
      expect(p.widthM).toBeCloseTo(inchesToMeters(WIDTH_IN), 12);
      expect(p.zNudgeM).toBe(0);
    }
    tree8.forEach((p, i) => expect(p.centreYM).toBeCloseTo(duelingTreePaddleYM(i), 12));
  });

  it('clears the post at both stops', () => {
    const arm = SWING_8 / 2;
    const paddleRadiusM = inchesToMeters(WIDTH_IN) / 2;
    expect(arm - paddleRadiusM).toBeGreaterThanOrEqual(DUELING_TREE_POST_RADIUS_M);
  });

  it('resolves a shot at each paddle to that paddle — not a neighbour — at BOTH of its stops', () => {
    const tree8 = resolvePlacementList('dueling-tree-dt3-synthetic', synthetic8InRaws());
    const BULLET_D_M = 0.0067056; // .264
    const basePlates: ShotPlate[] = tree8.map((p, instanceId) => ({
      instanceId,
      position: { x: p.xOffsetM, y: p.centreYM! },
      diameterM: p.widthM,
      typeId: p.type.id,
    }));
    function firstHit(plates: ShotPlate[], impact: { x: number; y: number }) {
      for (const plate of plates) {
        const zone = hitTargetZone(impact, plate, BULLET_D_M);
        if (zone) return zone;
      }
      return null;
    }
    for (let i = 0; i < tree8.length; i++) {
      const stops = [tree8[i].xOffsetM, tree8[i].xOffsetM + SWING_8];
      for (const stopX of stops) {
        const plates = basePlates.map((p) => ({ ...p }));
        plates[i] = { ...plates[i], position: { x: stopX, y: tree8[i].centreYM! } };
        const hit = firstHit(plates, { x: stopX, y: tree8[i].centreYM! });
        expect(hit, `8″ paddle ${tree8[i].id} is unreachable at x=${stopX}`).not.toBeNull();
        expect(hit!.instanceId, `stop at x=${stopX} resolved to a different paddle`).toBe(i);
        expect(hit!.zoneId).toBe('paddle');
      }
    }
  });
});
