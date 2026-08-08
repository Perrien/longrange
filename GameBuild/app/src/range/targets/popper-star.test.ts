// Tests for the popper star's geometry and kinematics (`Design/archive/popper-star-plan.md`,
// task PS1). Pure — no THREE, no DOM, no clock.
//
// TWO ASSERTIONS HERE CARRY REAL WEIGHT, and the rest are guardrails around them.
//
//  1. THE CENTROID IS THE HUB. Every derived quantity in the star — each arm's angle,
//     each arm's radius, the drawn post's x, the fold hinge's position — is recovered
//     from the authored plate positions via `starHubFrom`. If that recovery is even
//     slightly wrong, nothing downstream can be right, and the failure would show up
//     on device as a star that wobbles rather than as an error.
//
//  2. THE TWO ROTATION CONVENTIONS AGREE. The scene writes
//     `starCarrierRotationZ(t)` into the drawn arms' `group.rotation.z`, while
//     `starArmOffsetM` positions the plates. Those are different formulas for the same
//     motion, and a sign error in either slides every plate off its arm in the
//     opposite direction. Nothing but a test can catch that — the two live in
//     different files and neither is wrong on its own.

import { describe, it, expect } from 'vitest';
import {
  STAR_ARM_COUNT,
  STAR_ARM_LENGTH_M,
  STAR_ARM_PITCH_RAD,
  STAR_ARM_RADIUS_M,
  STAR_ARM_SPEC,
  STAR_ARM_Z_OFFSET_M,
  STAR_HUB_CLEARANCE_M,
  STAR_HUB_BOSS_LENGTH_M,
  STAR_HUB_BOSS_RADIUS_M,
  STAR_HUB_BOSS_Z_OFFSET_M,
  STAR_HUB_PLATE,
  STAR_HUB_PLATE_WIDTH_M,
  STAR_LATCH_UNTIL_RESET,
  STAR_OMEGA_RAD_S,
  STAR_PERIOD_S,
  STAR_PLATE_WIDTH_M,
  STAR_POPPER,
  STAR_POST_RADIUS_M,
  STAR_POST_Z_OFFSET_M,
  STAR_SWEPT_RADIUS_M,
  starArmAngleRad,
  starArmIndexOf,
  starArmMeshLengthM,
  starArmMeshPose,
  starArmOf,
  starArmOffsetAt,
  starArmOffsetM,
  starArmTangentUnit,
  starCarrierRotationZ,
  starFoldCfg,
  starFoldMomentArmM,
  starHingeRadiusM,
  starHubFrom,
} from './popper-star';
import { stepKnockdown, strikeKnockdown } from './knockdown';
import { getTargetPlacements } from './placements';
import { getMountType } from './mount-registry';
import { buildTestRangePlates } from '../test-range-targets';
import { NO_HILL_CORRIDOR } from '../test-range-config';
import { hitTargetZone } from '../../game/target-hit';
import { PLATE_THICKNESS_M } from '../RangeScene';
import type { ShotPlate } from '../../game/shot';
import { yardsToMeters } from '../../units';
import type { StarArmSpec } from './mount-type';

/** .264 bullet, the diameter the other target tests hit-walk with. */
const BULLET_D_M = 0.0067056;

/** The authored hub, matching the placement data PS2 ships (plan §3.3). */
const HUB = { x: 1.19, y: 1.2 };

/** The five arm plate positions as authored — hub + the t=0 arm offsets. Built from
 *  the geometry function rather than pasted floats, which is the house idiom
 *  (`dueling-tree.test.ts` recomputes every offset it checks). */
const ARM_POSITIONS = Array.from({ length: STAR_ARM_COUNT }, (_, i) => {
  const { dx, dy } = starArmOffsetM(i, 0);
  return { x: HUB.x + dx, y: HUB.y + dy };
});

describe('popper star — sizes', () => {
  it('takes the owner-specified sizes', () => {
    expect(STAR_ARM_COUNT).toBe(5);
    expect(STAR_ARM_LENGTH_M).toBeCloseTo(0.6, 12); // "each one 60 cm long"
    expect(STAR_PLATE_WIDTH_M).toBeCloseTo(0.254, 12); // 10"
    expect(STAR_HUB_PLATE_WIDTH_M).toBeCloseTo(0.3048, 12); // 12"
    expect(STAR_PERIOD_S).toBe(10); // 1 rev / 10 s
  });

  it('spaces five arms evenly, 72 degrees apart', () => {
    expect(STAR_ARM_PITCH_RAD).toBeCloseTo((72 * Math.PI) / 180, 12);
    expect(STAR_ARM_PITCH_RAD * STAR_ARM_COUNT).toBeCloseTo(2 * Math.PI, 12);
  });

  it('derives the angular rate from the period rather than restating it', () => {
    expect(STAR_OMEGA_RAD_S).toBeCloseTo((2 * Math.PI) / STAR_PERIOD_S, 12);
  });

  it('leaves the hub plate clear of every arm plate', () => {
    // Load-bearing, not cosmetic: `game/shot.ts` takes the FIRST plate an impact
    // breaks with no occlusion concept, so overlapping plates make the later one
    // permanently unhittable (mount-registry's HOSTAGE_CLAMP_3WAY war story).
    expect(STAR_HUB_CLEARANCE_M).toBeGreaterThan(0.3);
    expect(STAR_HUB_CLEARANCE_M).toBeCloseTo(
      STAR_ARM_LENGTH_M - STAR_PLATE_WIDTH_M / 2 - STAR_HUB_PLATE_WIDTH_M / 2,
      12,
    );
  });

  it('sweeps a circle of arm + plate radius', () => {
    expect(STAR_SWEPT_RADIUS_M).toBeCloseTo(0.727, 12);
  });

  it('draws each arm out to the plate rim, not through its face', () => {
    expect(starArmMeshLengthM()).toBeCloseTo(STAR_ARM_LENGTH_M - STAR_PLATE_WIDTH_M / 2, 12);
    expect(starArmMeshLengthM()).toBeLessThan(STAR_ARM_LENGTH_M);
  });
});

describe('popper star — kinematics', () => {
  it('puts arm 0 straight up at t = 0 and steps the rest 72 degrees apart', () => {
    for (let i = 0; i < STAR_ARM_COUNT; i++) {
      expect(starArmAngleRad(i, 0)).toBeCloseTo(i * STAR_ARM_PITCH_RAD, 12);
    }
    const up = starArmOffsetM(0, 0);
    expect(up.dx).toBeCloseTo(0, 12);
    expect(up.dy).toBeCloseTo(STAR_ARM_LENGTH_M, 12);
  });

  it('turns CLOCKWISE as the shooter sees it (owner decision D5)', () => {
    // The shooter is at +Z looking downrange, so their clockwise is a NEGATIVE
    // rotation about world +Z. A quarter period should carry the up arm to the right.
    expect(starCarrierRotationZ(STAR_PERIOD_S / 4)).toBeLessThan(0);
    const quarter = starArmOffsetM(0, STAR_PERIOD_S / 4);
    expect(quarter.dx).toBeCloseTo(STAR_ARM_LENGTH_M, 12); // straight right
    expect(quarter.dy).toBeCloseTo(0, 12);
    // …and half a period puts it straight down, not back up.
    const half = starArmOffsetM(0, STAR_PERIOD_S / 2);
    expect(half.dy).toBeCloseTo(-STAR_ARM_LENGTH_M, 12);
  });

  it('completes exactly one revolution per period', () => {
    expect(starCarrierRotationZ(STAR_PERIOD_S)).toBeCloseTo(-2 * Math.PI, 12);
    // Position is periodic in the period, and NOT in half of it.
    for (let i = 0; i < STAR_ARM_COUNT; i++) {
      const t0 = starArmOffsetM(i, 3.7);
      const t1 = starArmOffsetM(i, 3.7 + STAR_PERIOD_S);
      expect(t1.dx).toBeCloseTo(t0.dx, 10);
      expect(t1.dy).toBeCloseTo(t0.dy, 10);
      const halfLater = starArmOffsetM(i, 3.7 + STAR_PERIOD_S / 2);
      expect(Math.hypot(halfLater.dx - t0.dx, halfLater.dy - t0.dy)).toBeGreaterThan(0.5);
    }
  });

  it('agrees with the carrier rotation the scene applies to the drawn arms', () => {
    // THE BRIDGE TEST. `TestRangeScene` spins the arm meshes with
    // `group.rotation.z = starCarrierRotationZ(t)`; `steel-reactions` places the
    // plates with `starArmOffsetM(i, t)`. Rotating the t=0 offset by that same angle
    // must land on the posed position, or the plates slide off their arms.
    for (const t of [0, 0.4, 1.7, 2.5, 5, 7.3, 9.9, 13.2, 101.5]) {
      const theta = starCarrierRotationZ(t);
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      for (let i = 0; i < STAR_ARM_COUNT; i++) {
        const rest = starArmOffsetM(i, 0);
        // Rz(theta) applied to the rest offset.
        const spun = { dx: rest.dx * cos - rest.dy * sin, dy: rest.dx * sin + rest.dy * cos };
        const posed = starArmOffsetM(i, t);
        expect(posed.dx).toBeCloseTo(spun.dx, 10);
        expect(posed.dy).toBeCloseTo(spun.dy, 10);
      }
    }
  });

  it('keeps every arm on the swept circle at all times', () => {
    for (const t of [0, 1.3, 4.8, 6.2, 9.99]) {
      for (let i = 0; i < STAR_ARM_COUNT; i++) {
        const { dx, dy } = starArmOffsetM(i, t);
        expect(Math.hypot(dx, dy)).toBeCloseTo(STAR_ARM_LENGTH_M, 10);
      }
    }
  });

  it('keeps the arms 72 degrees apart at every instant, never bunching', () => {
    for (const t of [0, 2.1, 5.5, 8.8]) {
      for (let i = 0; i < STAR_ARM_COUNT; i++) {
        const a = starArmOffsetM(i, t);
        const b = starArmOffsetM((i + 1) % STAR_ARM_COUNT, t);
        // Chord between adjacent plate centres for a 72° step on a 0.6 m radius.
        const chord = 2 * STAR_ARM_LENGTH_M * Math.sin(STAR_ARM_PITCH_RAD / 2);
        expect(Math.hypot(a.dx - b.dx, a.dy - b.dy)).toBeCloseTo(chord, 10);
      }
    }
  });

  it('reverses with sense: +1 and is otherwise identical', () => {
    const ccw: StarArmSpec = { ...STAR_ARM_SPEC, sense: 1 };
    expect(starCarrierRotationZ(2.5, ccw)).toBeCloseTo(-starCarrierRotationZ(2.5), 12);
    const cw = starArmOffsetM(0, STAR_PERIOD_S / 4);
    const rev = starArmOffsetM(0, STAR_PERIOD_S / 4, STAR_ARM_LENGTH_M, ccw);
    expect(rev.dx).toBeCloseTo(-cw.dx, 10); // mirrored across the vertical
    expect(rev.dy).toBeCloseTo(cw.dy, 10);
  });

  it('yields the outward radial unit vector at radius 1', () => {
    // This is what the fold hinge's axis and moment arm are measured against, so it
    // has to be a unit vector pointing outward along the arm.
    for (const t of [0, 3.3, 7.7]) {
      for (let i = 0; i < STAR_ARM_COUNT; i++) {
        const unit = starArmOffsetAt(starArmAngleRad(i, t), 1);
        expect(Math.hypot(unit.dx, unit.dy)).toBeCloseTo(1, 12);
        const centre = starArmOffsetM(i, t);
        // Same direction as the plate centre's offset.
        expect(unit.dx * centre.dx + unit.dy * centre.dy).toBeCloseTo(STAR_ARM_LENGTH_M, 10);
      }
    }
  });
});

describe('popper star — recovering the hub from authored positions', () => {
  it('recovers the hub EXACTLY as the centroid of the five plate positions', () => {
    // The invariant everything else rests on: five evenly-spaced arm vectors sum to
    // zero, so the centroid has no residual and the placement data never has to state
    // the hub twice.
    const hub = starHubFrom(ARM_POSITIONS);
    expect(hub.x).toBeCloseTo(HUB.x, 12);
    expect(hub.y).toBeCloseTo(HUB.y, 12);
  });

  it('recovers the hub whatever order the arms are authored in', () => {
    const shuffled = [ARM_POSITIONS[3], ARM_POSITIONS[0], ARM_POSITIONS[4], ARM_POSITIONS[2], ARM_POSITIONS[1]];
    const hub = starHubFrom(shuffled);
    expect(hub.x).toBeCloseTo(HUB.x, 12);
    expect(hub.y).toBeCloseTo(HUB.y, 12);
  });

  it('survives the rounding the JSON actually carries (9 decimal places)', () => {
    // The placement file cannot hold a float literal, so it carries the arm positions
    // rounded. This asserts that rounding does not move the recovered hub anywhere
    // that matters — the whole reason the plan authors 9 dp rather than 3.
    const round9 = (v: number) => Number(v.toFixed(9));
    const hub = starHubFrom(ARM_POSITIONS.map((p) => ({ x: round9(p.x), y: round9(p.y) })));
    expect(hub.x).toBeCloseTo(HUB.x, 9);
    expect(hub.y).toBeCloseTo(HUB.y, 9);
  });

  it('round-trips every arm back to its index and radius', () => {
    const hub = starHubFrom(ARM_POSITIONS);
    ARM_POSITIONS.forEach((p, i) => {
      const { restAngleRad, radiusM } = starArmOf(hub, p);
      expect(radiusM).toBeCloseTo(STAR_ARM_LENGTH_M, 10);
      expect(restAngleRad).toBeCloseTo(i * STAR_ARM_PITCH_RAD, 10);
      expect(starArmIndexOf(restAngleRad)).toBe(i);
    });
  });

  it('normalises the recovered angle into [0, 2pi) rather than atan2 range', () => {
    // Arms 3 and 4 sit at 216° and 288°, which raw `atan2` reports as negative. The
    // normalisation is what makes the round-trip above read as i * 72°.
    const hub = starHubFrom(ARM_POSITIONS);
    for (const p of ARM_POSITIONS) {
      const { restAngleRad } = starArmOf(hub, p);
      expect(restAngleRad).toBeGreaterThanOrEqual(0);
      expect(restAngleRad).toBeLessThan(2 * Math.PI);
    }
  });

  it('throws rather than inventing a hub for an empty arm list', () => {
    expect(() => starHubFrom([])).toThrow(/at least one arm/);
  });
});

describe('popper star — the latch', () => {
  it('never rises on its own, at any dwell (owner decision D3)', () => {
    // The whole "plates stay down when shot" requirement, asserted against the real
    // state machine rather than against the constant: `Infinity` makes
    // `stepKnockdown`'s `since >= downDwellS` unreachable, so the plate stays `down`.
    const cfg = {
      fallAngleDeg: STAR_ARM_SPEC.fallAngleDeg,
      downDwellS: STAR_LATCH_UNTIL_RESET,
      resetRateDegS: STAR_ARM_SPEC.resetRateDegS,
      stemLengthM: STAR_PLATE_WIDTH_M,
    };
    let s = strikeKnockdown({ phase: 'standing', angleRad: 0, rateRadS: 0, phaseSinceS: 0 }, 8);
    // Run a full minute of frames — six revolutions of the carrier.
    for (let i = 0; i < 3600; i++) s = stepKnockdown(s, 1 / 60, cfg);
    expect(s.phase).toBe('down');
    expect(s.angleRad).toBeCloseTo((STAR_ARM_SPEC.fallAngleDeg * Math.PI) / 180, 12);
  });

  it('folds fast, because a 10-inch plate hinged at its rim is a short rod', () => {
    // stemLengthM is the plate's WIDTH (hinged at one rim, mass centre at L/2), not a
    // mount stem length — so the fall is quick. Anything over ~1 s would read as the
    // plate sagging rather than snapping back.
    const cfg = {
      fallAngleDeg: STAR_ARM_SPEC.fallAngleDeg,
      downDwellS: STAR_LATCH_UNTIL_RESET,
      resetRateDegS: STAR_ARM_SPEC.resetRateDegS,
      stemLengthM: STAR_PLATE_WIDTH_M,
    };
    let s = strikeKnockdown({ phase: 'standing', angleRad: 0, rateRadS: 0, phaseSinceS: 0 }, 8);
    let elapsed = 0;
    while (s.phase === 'falling' && elapsed < 5) {
      s = stepKnockdown(s, 1 / 60, cfg);
      elapsed += 1 / 60;
    }
    expect(s.phase).toBe('down');
    expect(elapsed).toBeLessThan(1);
  });
});

describe('popper star — target types', () => {
  it('gives the arm plate a light bright purple face at 10 inches (D4)', () => {
    expect(STAR_POPPER.id).toBe('star-popper');
    expect(STAR_POPPER.shape.kind).toBe('disc');
    expect(STAR_POPPER.defaultWidthM).toBeCloseTo(STAR_PLATE_WIDTH_M, 12);
    expect(STAR_POPPER.paint.palette.face).toBe(0xc77dff);
    expect(STAR_POPPER.paint.layers).toEqual([{ kind: 'fill', color: '$face' }]);
  });

  it('pairs each type with exactly the one mount that can drive it', () => {
    // `placements.ts` enforces the pairing, so a single-entry list is what stops an
    // arm plate being authored onto a stake where nothing would rotate or fold it.
    expect(STAR_POPPER.compatibleMounts).toEqual(['star-arm']);
    expect(STAR_POPPER.defaultMount).toBe('star-arm');
    expect(STAR_HUB_PLATE.compatibleMounts).toEqual(['star-hub-reset']);
    expect(STAR_HUB_PLATE.defaultMount).toBe('star-hub-reset');
  });

  it('gives the hub plate ordinary steel paint at 12 inches (D6)', () => {
    expect(STAR_HUB_PLATE.id).toBe('star-hub-plate');
    expect(STAR_HUB_PLATE.defaultWidthM).toBeCloseTo(STAR_HUB_PLATE_WIDTH_M, 12);
    expect(STAR_HUB_PLATE.paint.palette.face).toBe(0xf0f0ea);
  });
});

describe('popper star — the shipped Test Range placements', () => {
  const all = getTargetPlacements('test-range');
  const arms = all.filter((p) => p.type.id === 'star-popper');
  const hubPlate = all.find((p) => p.type.id === 'star-hub-plate')!;
  const plates = buildTestRangePlates(all);
  const starPlates = plates.filter(
    (p) => p.targetTypeId === 'star-popper' || p.targetTypeId === 'star-hub-plate',
  );

  it('ships five arms and one hub plate, all in one group but the hub', () => {
    expect(arms.map((p) => p.id)).toEqual([
      'test-star-arm-1',
      'test-star-arm-2',
      'test-star-arm-3',
      'test-star-arm-4',
      'test-star-arm-5',
    ]);
    expect(arms.every((p) => p.groupId === 'test-star-arms')).toBe(true);
    // The hub CANNOT share the group: a group's members must share a mount
    // (placements.ts), and it is bolted while the arms are knockdowns.
    expect(hubPlate.groupId).toBeUndefined();
    expect(hubPlate.resetsGroupId).toBe('test-star-arms');
  });

  it('recovers the hub from the SHIPPED rows, not from a stated coordinate', () => {
    // The invariant the whole target rests on, asserted against the real data file
    // rather than a fixture — this is what proves the 9-dp authoring is sufficient.
    const hub = starHubFrom(arms.map((p) => ({ x: p.xOffsetM, y: p.centreYM! })));
    expect(hub.x).toBeCloseTo(1.19, 9);
    expect(hub.y).toBeCloseTo(1.2, 9);
    // …and it agrees with where the hub plate is actually authored.
    expect(hub.x).toBeCloseTo(hubPlate.xOffsetM, 9);
    expect(hub.y).toBeCloseTo(hubPlate.centreYM!, 9);
  });

  it('puts every shipped arm at the full arm length and a distinct 72-degree step', () => {
    const hub = starHubFrom(arms.map((p) => ({ x: p.xOffsetM, y: p.centreYM! })));
    const indices = arms.map((p) => {
      const { restAngleRad, radiusM } = starArmOf(hub, { x: p.xOffsetM, y: p.centreYM! });
      expect(radiusM).toBeCloseTo(STAR_ARM_LENGTH_M, 8);
      return starArmIndexOf(restAngleRad);
    });
    // Five DISTINCT arms — a duplicated authored position would put two plates on one
    // arm and be nearly invisible on device.
    expect(new Set(indices).size).toBe(STAR_ARM_COUNT);
    expect([...indices].sort()).toEqual([0, 1, 2, 3, 4]);
  });

  it('takes a distance exclusive to the star', () => {
    // ScopeView filters the hittable rack by EXACT distanceM equality, so sharing a
    // distance would silently merge the star into another target's engagement.
    const starDistances = new Set(starPlates.map((p) => p.distanceM));
    expect(starDistances.size).toBe(1);
    const [d] = [...starDistances];
    expect(d).toBeCloseTo(yardsToMeters(90), 9);
    const others = plates.filter((p) => !starPlates.includes(p));
    for (const p of others) expect(p.distanceM).not.toBe(d);
  });

  it('stays inside the no-hill corridor at every point in the revolution', () => {
    const hub = { x: 1.19, y: 1.2 };
    expect(Math.abs(hub.x) + STAR_SWEPT_RADIUS_M).toBeLessThan(NO_HILL_CORRIDOR.halfWidthM);
    // …and clear of the ground, which is what the hub height was chosen for.
    expect(hub.y - STAR_SWEPT_RADIUS_M).toBeGreaterThan(0.4);
  });

  it('clears every other target ANGULARLY, which is what occlusion depends on', () => {
    // Two targets at different distances hide each other by ANGLE off the boresight,
    // not by metres of lateral offset — so this is the check that the star does not sit
    // in front of the gong. Half-width in mrad, per target, from the shooter's eye.
    const band = (xM: number, halfWidthM: number, distanceM: number) => ({
      lo: ((xM - halfWidthM) / distanceM) * 1000,
      hi: ((xM + halfWidthM) / distanceM) * 1000,
    });
    const star = band(1.19, STAR_SWEPT_RADIUS_M, yardsToMeters(90));
    for (const p of plates) {
      if (starPlates.includes(p)) continue;
      // A plate's widest lateral reach. `position.x` is its REST stop, so a flip target
      // has to be padded by the furthest stop its own mount can swing to — taken from
      // the mount rather than assumed, since only the hostage paddles flip at all and
      // padding a fixed popper with a swing it does not have would report a false
      // overlap.
      const flip = p.mountId ? getMountType(p.mountId).flip : undefined;
      const swingM = flip ? Math.max(...flip.positions.map((s) => Math.abs(s.xOffsetM))) : 0;
      const other = band(p.position.x, p.diameterM / 2 + swingM, p.distanceM);
      const overlaps = star.lo < other.hi && other.lo < star.hi;
      expect(overlaps, `${p.rackId} overlaps the star angularly`).toBe(false);
    }
  });

  it('leaves a real margin, not a hairline, on both sides of the gap it sits in', () => {
    // The two clearances the placement was chosen for. Asserted as NUMBERS so a future
    // target dropped into the same gap cannot quietly eat the margin.
    const mrad = (xM: number, distanceM: number) => (xM / distanceM) * 1000;
    const starLo = mrad(1.19 - STAR_SWEPT_RADIUS_M, yardsToMeters(90));
    const starHi = mrad(1.19 + STAR_SWEPT_RADIUS_M, yardsToMeters(90));
    const gong = plates.find((p) => p.rackId === 'test-gong-100')!;
    const popperA = plates.find((p) => p.rackId === 'test-popper-50a')!;
    const gongHi = mrad(gong.position.x + gong.diameterM / 2, gong.distanceM);
    const popperLo = mrad(popperA.position.x - popperA.diameterM / 2, popperA.distanceM);
    expect(starLo - gongHi).toBeGreaterThan(3.5);
    expect(popperLo - starHi).toBeGreaterThan(3.5);
  });

  it('keeps the hub plate hittable and every arm distinct at EVERY rotation angle', () => {
    // The rack walk `game/shot.ts` performs: first plate whose zones break wins, with
    // no occlusion concept. Run over a sweep of angles rather than one pose, because a
    // star can only shadow itself at particular angles — this is the analogue of the
    // dueling tree's per-stop first-hit loop.
    const hub = { x: 1.19, y: 1.2 };
    const rack = (): ShotPlate[] =>
      starPlates.map((p) => ({
        instanceId: p.instanceId,
        position: { x: p.position.x, y: p.position.y },
        diameterM: p.diameterM,
        typeId: p.targetTypeId,
        heightM: p.heightM,
      }));
    const firstHit = (impact: { x: number; y: number }) => {
      for (const p of rack()) {
        const zone = hitTargetZone(impact, p, BULLET_D_M);
        if (zone) return zone;
      }
      return null;
    };

    for (let step = 0; step < 60; step++) {
      const t = (step / 60) * STAR_PERIOD_S;
      // Pose the star plates the way the rotor does.
      const armPlates = starPlates.filter((p) => p.targetTypeId === 'star-popper');
      armPlates.forEach((p, i) => {
        const { dx, dy } = starArmOffsetM(i, t);
        p.position.x = hub.x + dx;
        p.position.y = hub.y + dy;
      });
      // Every arm's own centre resolves to that arm and no other.
      for (const p of armPlates) {
        const hit = firstHit({ x: p.position.x, y: p.position.y });
        expect(hit, `arm ${p.rackId} unhittable at t=${t.toFixed(2)}`).not.toBeNull();
        expect(hit!.instanceId, `at t=${t.toFixed(2)}`).toBe(p.instanceId);
      }
      // And the hub plate is never shadowed by a passing arm.
      const hubHit = firstHit({ x: hub.x, y: hub.y });
      expect(hubHit, `hub unhittable at t=${t.toFixed(2)}`).not.toBeNull();
      expect(hubHit!.instanceId, `hub shadowed at t=${t.toFixed(2)}`).toBe(
        starPlates.find((p) => p.targetTypeId === 'star-hub-plate')!.instanceId,
      );
    }
  });
});

describe('popper star — the drawn arms line up with the plates they carry', () => {
  // The gap the pure functions alone cannot close: the formulas agreeing does not mean
  // the METALWORK was placed to match. `TestRangeScene` is unconstructable in node, so
  // `starArmMeshPose` exists to make this provable — the symptom otherwise is purple
  // plates floating beside their arms, which only an eye would catch.
  it('runs each arm from the hub out to exactly its own plate hinge', () => {
    for (let i = 0; i < STAR_ARM_COUNT; i++) {
      const restAngleRad = i * STAR_ARM_PITCH_RAD;
      const pose = starArmMeshPose(restAngleRad);

      // A cylinder is centred on its origin and runs along local +Y, rotated by
      // `rotationZ`. Its two ends are therefore at midpoint ± (length/2) along that
      // rotated axis; `Rz(θ)·(0,1,0) = (−sin θ, cos θ, 0)`.
      const axis = { x: -Math.sin(pose.rotationZ), y: Math.cos(pose.rotationZ) };
      const inner = { x: pose.x - (axis.x * pose.lengthM) / 2, y: pose.y - (axis.y * pose.lengthM) / 2 };
      const outer = { x: pose.x + (axis.x * pose.lengthM) / 2, y: pose.y + (axis.y * pose.lengthM) / 2 };

      // The inner end is at the hub…
      expect(Math.hypot(inner.x, inner.y)).toBeCloseTo(0, 9);
      // …and the outer end is exactly the plate's hinge — its inner rim.
      const hinge = starArmOffsetAt(restAngleRad, starHingeRadiusM());
      expect(outer.x).toBeCloseTo(hinge.dx, 9);
      expect(outer.y).toBeCloseTo(hinge.dy, 9);

      // Which is to say: the arm stops one plate-radius short of the plate's centre,
      // pointing straight at it.
      const centre = starArmOffsetM(i, 0);
      expect(Math.hypot(centre.dx - outer.x, centre.dy - outer.y)).toBeCloseTo(
        STAR_PLATE_WIDTH_M / 2,
        9,
      );
    }
  });

  it('sits the arms and boss downrange of the plate plane so nothing z-fights', () => {
    // The hub plate is a flat surface AT the hub plane; coplanar metalwork flickers
    // (the defect `test-hostage-center`'s zNudgeM exists for).
    expect(starArmMeshPose(0).z).toBeLessThan(0);
    expect(STAR_HUB_BOSS_Z_OFFSET_M).toBeLessThan(0);
    // The boss must also clear the plate it hides behind, front face included.
    expect(Math.abs(STAR_HUB_BOSS_Z_OFFSET_M)).toBeGreaterThan(STAR_HUB_BOSS_LENGTH_M / 2);
  });

  it('stacks post → boss → arms → plates from downrange to the shooter', () => {
    // Owner, on device 2026-08-07: "The stake should be the farthest thing away from
    // the shooter. Then the arms. In front of the arms is the center and the spinning
    // targets."
    //
    // Asserted on each part's FRONT FACE — centre plus its own radius or half-length —
    // not on the centres, because that is precisely what went wrong: the post sat at
    // offset 0, level with the plates, and its 3.8 cm radius still put it 3.8 cm proud
    // of them, so a 1.2 m post drew in front of the entire star and hid the centre
    // plate. Comparing centres would have called that correct.
    const plateFront = PLATE_THICKNESS_M / 2; // the plates define z = 0
    const armFront = STAR_ARM_Z_OFFSET_M + STAR_ARM_RADIUS_M;
    const bossFront = STAR_HUB_BOSS_Z_OFFSET_M + STAR_HUB_BOSS_LENGTH_M / 2;
    const postFront = STAR_POST_Z_OFFSET_M + STAR_POST_RADIUS_M;

    // Strictly nearer-to-farther. `-z` is downrange, so each must be MORE negative.
    expect(armFront).toBeLessThan(plateFront);
    expect(bossFront).toBeLessThan(armFront);
    expect(postFront).toBeLessThan(bossFront);

    // And no part reaches forward past the plates, which is the whole complaint.
    for (const front of [armFront, bossFront, postFront]) {
      expect(front).toBeLessThan(plateFront);
    }
  });

  it('keeps the post clear of the arms rather than merely behind their centres', () => {
    // The post's front face must clear the arms' BACK face, or the two overlap in a band
    // and the post shows between them.
    const armBack = STAR_ARM_Z_OFFSET_M - STAR_ARM_RADIUS_M;
    const postFront = STAR_POST_Z_OFFSET_M + STAR_POST_RADIUS_M;
    expect(postFront).toBeLessThan(armBack);
  });

  it('hides the boss behind the hub plate rather than around it', () => {
    expect(STAR_HUB_BOSS_RADIUS_M).toBeLessThan(STAR_HUB_PLATE_WIDTH_M / 2);
  });
});

describe('popper star — the fold', () => {
  it('builds a KnockdownSpec that never auto-resets, whatever the arm spec says', () => {
    const cfg = starFoldCfg(STAR_ARM_SPEC, STAR_PLATE_WIDTH_M);
    expect(cfg.downDwellS).toBe(STAR_LATCH_UNTIL_RESET);
    expect(cfg.fallAngleDeg).toBe(STAR_ARM_SPEC.fallAngleDeg);
    expect(cfg.resetRateDegS).toBe(STAR_ARM_SPEC.resetRateDegS);
    // The rod is the PLATE'S WIDTH: hinged at one rim, mass centre at L/2 — the
    // uniform-rod-about-one-end model `stepKnockdown` solves. Taking a mount stem
    // length here would make a 10" plate fall at the rate of a 1 m popper.
    expect(cfg.stemLengthM).toBeCloseTo(STAR_PLATE_WIDTH_M, 12);
  });

  it('measures the moment arm RADIALLY along the arm, not vertically', () => {
    // This is the whole difference from a ground popper, whose moment arm is height
    // above a hinge at its base. Take arm 1 (72°, up and to the right) so a vertical
    // measurement would give a visibly different answer from a radial one.
    const angle = STAR_ARM_PITCH_RAD;
    const radial = starArmOffsetAt(angle, 1);
    const hingeOff = starArmOffsetAt(angle, starHingeRadiusM());
    const hinge = { x: HUB.x + hingeOff.dx, y: HUB.y + hingeOff.dy };

    // A hit on the hinge line imparts nothing.
    expect(starFoldMomentArmM(hinge, hinge, radial)).toBeCloseTo(0, 12);

    // A hit at the plate's outer rim gives the full plate width.
    const rimOff = starArmOffsetAt(angle, STAR_ARM_LENGTH_M + STAR_PLATE_WIDTH_M / 2);
    const rim = { x: HUB.x + rimOff.dx, y: HUB.y + rimOff.dy };
    expect(starFoldMomentArmM(hinge, rim, radial)).toBeCloseTo(STAR_PLATE_WIDTH_M, 9);

    // A dead-centre hit gives half of it.
    const centreOff = starArmOffsetAt(angle, STAR_ARM_LENGTH_M);
    const centre = { x: HUB.x + centreOff.dx, y: HUB.y + centreOff.dy };
    expect(starFoldMomentArmM(hinge, centre, radial)).toBeCloseTo(STAR_PLATE_WIDTH_M / 2, 9);
  });

  it('ignores the TANGENTIAL component of a hit entirely', () => {
    // Off-centre left/right on the face is a hit on the same fold lever — only radial
    // distance turns the plate about a tangential hinge.
    const angle = 0; // arm straight up: radial is +y, tangential is +x
    const radial = starArmOffsetAt(angle, 1);
    const hinge = { x: HUB.x, y: HUB.y + starHingeRadiusM() };
    const centreY = HUB.y + STAR_ARM_LENGTH_M;
    const straight = starFoldMomentArmM(hinge, { x: HUB.x, y: centreY }, radial);
    const offToTheSide = starFoldMomentArmM(hinge, { x: HUB.x + 0.1, y: centreY }, radial);
    expect(offToTheSide).toBeCloseTo(straight, 12);
  });

  it('clamps a hit inboard of the hinge to zero rather than folding it backwards', () => {
    // Geometrically unreachable on a real plate, but a negative moment arm would seed a
    // NEGATIVE fall rate and drive the plate the wrong way through its own arm.
    const radial = starArmOffsetAt(0, 1);
    const hinge = { x: HUB.x, y: HUB.y + starHingeRadiusM() };
    const inboard = { x: HUB.x, y: HUB.y }; // at the hub, well inside the hinge
    expect(starFoldMomentArmM(hinge, inboard, radial)).toBe(0);
  });
});

describe('popper star — the fold axis is per-arm', () => {
  /** Rodrigues, so the test does not depend on THREE's matrix ordering. */
  function rotate(
    v: readonly [number, number, number],
    axis: readonly [number, number, number],
    th: number,
  ): [number, number, number] {
    const [ax, ay, az] = axis;
    const [x, y, z] = v;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const dot = ax * x + ay * y + az * z;
    return [
      x * c + (ay * z - az * y) * s + ax * dot * (1 - c),
      y * c + (az * x - ax * z) * s + ay * dot * (1 - c),
      z * c + (ax * y - ay * x) * s + az * dot * (1 - c),
    ];
  }

  const LATCH = (STAR_ARM_SPEC.fallAngleDeg * Math.PI) / 180;

  it('folds all five arms IDENTICALLY downrange, with no sideways drift', () => {
    // THE TEST THAT MATTERS. The first implementation folded every plate about the
    // carrier frame's fixed X axis, which is tangential only for a vertical arm: arms 2
    // and 3 folded TOWARD the shooter and arms 1 and 4 dragged ~3 cm sideways off their
    // hinge lines. Asserting one arm — or asserting "it moved" — would have passed.
    //
    // The invariant: in the carrier frame, a folded plate's offset from its hinge must
    // keep the SAME radial length it had before folding (scaled by cos), pick up a
    // NEGATIVE z (downrange), and acquire NO tangential component at all — the plate
    // folds along its own arm, not across it.
    const zs: number[] = [];
    for (let i = 0; i < STAR_ARM_COUNT; i++) {
      const phi = i * STAR_ARM_PITCH_RAD;
      const radial = starArmOffsetAt(phi, 1);
      const tangent = starArmTangentUnit(phi);
      // Hinge → plate centre, i.e. one plate radius outward along the arm.
      const lever = starArmOffsetAt(phi, STAR_PLATE_WIDTH_M / 2);

      const folded = rotate(
        [lever.dx, lever.dy, 0],
        [tangent.dx, tangent.dy, 0],
        -LATCH, // negative carries the outer rim to −z; see starArmTangentUnit
      );

      const alongTangent = folded[0] * tangent.dx + folded[1] * tangent.dy;
      const alongRadial = folded[0] * radial.dx + folded[1] * radial.dy;

      expect(alongTangent, `arm ${i} drifted sideways off its hinge`).toBeCloseTo(0, 9);
      // Downrange, never toward the shooter — the bug arms 2 and 3 had.
      expect(folded[2], `arm ${i} folded the wrong way in z`).toBeLessThan(0);
      // Radially foreshortened by cos(latch), as a hinged plate must be.
      expect(alongRadial).toBeCloseTo((STAR_PLATE_WIDTH_M / 2) * Math.cos(LATCH), 9);
      // The lever never stretches — it is a rotation.
      expect(Math.hypot(...folded)).toBeCloseTo(STAR_PLATE_WIDTH_M / 2, 9);
      zs.push(folded[2]);
    }
    // Every arm folds by the same amount: the star has one hardware latch angle, not
    // five behaviours that depend on where an arm happens to be pointing.
    for (const z of zs) expect(z).toBeCloseTo(zs[0], 9);
  });

  it('gives the tangent axis as a unit vector perpendicular to the arm', () => {
    for (let i = 0; i < STAR_ARM_COUNT; i++) {
      const phi = i * STAR_ARM_PITCH_RAD;
      const radial = starArmOffsetAt(phi, 1);
      const tangent = starArmTangentUnit(phi);
      expect(Math.hypot(tangent.dx, tangent.dy)).toBeCloseTo(1, 12);
      expect(tangent.dx * radial.dx + tangent.dy * radial.dy).toBeCloseTo(0, 12);
    }
  });

  it('is the carrier X axis for a vertical arm, and only for that one', () => {
    // Why the bug survived a first look: arm 0 is genuinely correct about X, so a
    // spot-check of the top plate shows nothing wrong.
    const top = starArmTangentUnit(0);
    expect(top.dx).toBeCloseTo(1, 12);
    expect(top.dy).toBeCloseTo(0, 12);
    for (let i = 1; i < STAR_ARM_COUNT; i++) {
      const t = starArmTangentUnit(i * STAR_ARM_PITCH_RAD);
      expect(Math.abs(t.dx - 1) + Math.abs(t.dy)).toBeGreaterThan(0.1);
    }
  });
});
