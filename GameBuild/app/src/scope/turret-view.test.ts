// Turret-follows-view tests (plan `Design/Plans/dial-moves-view-plan.md`, DV1).
//
// This file is the plan's memory: the sign conventions are asserted in the words
// the player would use ("the crosshair walks DOWN"), the closed-form sight-line
// direction is pinned against THREE so the pure module and `ScopeView` cannot
// drift apart, and the load-bearing invariant — dialing alone does not move the
// impact — is checked through the real `resolveShot`.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import {
  SIGHT_GLIDE_TAU_S,
  easeSightOffset,
  sightAimAngles,
  sightLineDir,
  sightOffset,
} from './turret-view';
import { resolveShot, type ShotPlate } from '../game/shot';
import { milToRad } from '../units/angle';

const MIL = milToRad(1); // 0.001 rad

describe('scope/turret-view/sightOffset', () => {
  it('sums the live turret and the rifle’s stored zero on both axes', () => {
    const off = sightOffset(
      { elevationRad: 0.004, windageRad: -0.001 },
      { elevationRad: 0.002, windageRad: 0.0005 },
    );
    expect(off.elevRad).toBeCloseTo(0.006, 12);
    expect(off.windRad).toBeCloseTo(-0.0005, 12);
  });

  it('is the dial alone when the rifle has no stored zero', () => {
    const dial = { elevationRad: 0.004, windageRad: -0.001 };
    expect(sightOffset(dial, null)).toEqual({ elevRad: 0.004, windRad: -0.001 });
    expect(sightOffset(dial, undefined)).toEqual({ elevRad: 0.004, windRad: -0.001 });
    expect(sightOffset(dial)).toEqual({ elevRad: 0.004, windRad: -0.001 });
  });
});

// The direction table of the plan §2.2, stated as what the player sees. Hold is
// fixed at (0, 0) throughout, i.e. the rifle is in a vise.
describe('scope/turret-view — which way the sight picture moves', () => {
  const HOLD = { pitch: 0, yaw: 0 };
  const dirFor = (elevRad: number, windRad: number) => {
    const a = sightAimAngles(HOLD.pitch, HOLD.yaw, { elevRad, windRad });
    return sightLineDir(a.pitchRad, a.yawRad);
  };
  const zero = dirFor(0, 0);

  it('dial elevation UP → sight line pitches DOWN (crosshair walks down; target rises)', () => {
    const dir = dirFor(MIL, 0);
    expect(dir.y).toBeCloseTo(zero.y - MIL, 8);
    expect(dir.y).toBeLessThan(zero.y);
  });

  it('dial elevation DOWN → sight line pitches UP (crosshair walks up)', () => {
    const dir = dirFor(-MIL, 0);
    expect(dir.y).toBeCloseTo(zero.y + MIL, 8);
    expect(dir.y).toBeGreaterThan(zero.y);
  });

  it('dial windage RIGHT → sight line yaws LEFT (crosshair walks left)', () => {
    const dir = dirFor(0, MIL);
    expect(dir.x).toBeCloseTo(zero.x - MIL, 8);
    expect(dir.x).toBeLessThan(zero.x);
  });

  it('dial windage LEFT → sight line yaws RIGHT (crosshair walks right)', () => {
    const dir = dirFor(0, -MIL);
    expect(dir.x).toBeCloseTo(zero.x + MIL, 8);
    expect(dir.x).toBeGreaterThan(zero.x);
  });

  it('the owner’s case: a group 1 MOA high and left is chased by dialing down and right', () => {
    // Impact must move down and right ⇒ dial DOWN and RIGHT ⇒ on screen the
    // crosshair walks UP and LEFT, onto the group.
    const moa = (1 / 60) * (Math.PI / 180);
    const dir = dirFor(-moa, moa);
    expect(dir.y).toBeGreaterThan(zero.y); // crosshair up
    expect(dir.x).toBeLessThan(zero.x); // crosshair left
  });
});

// The pure closed form must be exactly what THREE computes from the Euler that
// `ScopeView.aimQuaternion` builds. If someone changes one and not the other,
// this fails.
describe('scope/turret-view/sightLineDir — parity with THREE', () => {
  const CASES: Array<[number, number]> = [
    [0, 0],
    [0.008, 0],
    [0, 0.05],
    [0.008, -0.05],
    [-0.2, 0.3],
    [0.2, -Math.PI / 3],
    [0.0375, 0.0125],
  ];
  for (const [pitch, yaw] of CASES) {
    it(`matches THREE for pitch=${pitch}, yaw=${yaw}`, () => {
      const q = new THREE.Quaternion().setFromEuler(
        new THREE.Euler(-pitch, -yaw, 0, 'YXZ'),
      );
      const v = new THREE.Vector3(0, 0, -1).applyQuaternion(q);
      const dir = sightLineDir(pitch, yaw);
      expect(dir.x).toBeCloseTo(v.x, 12);
      expect(dir.y).toBeCloseTo(v.y, 12);
      expect(dir.z).toBeCloseTo(v.z, 12);
    });
  }
});

// ---- THE INVARIANT ----------------------------------------------------------
// Rotating the sight line by the dial changes `resolveShot`'s `aimError` by
// exactly minus the dial, so `applied` — and the impact — is unchanged. This is
// the reason the feature needs no change to any shot code.
describe('scope/turret-view — dialing alone does not move the impact', () => {
  const EYE = { x: 0, y: 1.6, z: 0 };
  const R = 274.32; // 300 yd
  const PLATE_POS = { x: 0, y: 0.55 };
  const PLATE: ShotPlate = { instanceId: 3, position: PLATE_POS, diameterM: 0.1524 };
  const BULLET = 0.0067056;
  const SOLVE = { dropM: -2.0, windageM: 0.1 };
  const PZ = { elevationRad: 0.0021, windageRad: -0.0008 };
  // Hold that puts the crosshair exactly on the plate when the erector is
  // centred: x_cross = R·tan(yaw), y_cross = EYE.y − R·tan(pitch)/cos(yaw).
  const HOLD_YAW = 0;
  const HOLD_PITCH = Math.atan((EYE.y - PLATE_POS.y) / R);

  function impactFor(dialElevRad: number, dialWindRad: number, holdPitch = HOLD_PITCH) {
    const dial = { elevRad: dialElevRad, windRad: dialWindRad };
    const off = sightOffset(
      { elevationRad: dialElevRad, windageRad: dialWindRad },
      PZ,
    );
    const angles = sightAimAngles(holdPitch, HOLD_YAW, off);
    return resolveShot({
      eye: EYE,
      aimDir: sightLineDir(angles.pitchRad, angles.yawRad),
      dial,
      solve: SOLVE,
      distanceM: R,
      scatter: { x: 0, y: 0 },
      plates: [PLATE],
      bulletDiameterM: BULLET,
      playerZero: PZ,
    }).impact;
  }

  const baseline = impactFor(0, 0);

  // Not exactly zero, and that is expected: `resolveShot` goes through `atan2`
  // of a plane intersection while the dial is a plain angle, so the
  // cancellation is exact only to first order. The residual at 3 MIL is ~1e-7 m.
  const DIALS: Array<[string, number, number]> = [
    ['no dial', 0, 0],
    ['+0.5 MIL up', 0.5 * MIL, 0],
    ['−1.2 MIL down', -1.2 * MIL, 0],
    ['+3 MIL up', 3 * MIL, 0],
    ['+2 MIL right', 0, 2 * MIL],
    ['−1.5 MIL left, +3 MIL up', 3 * MIL, -1.5 * MIL],
  ];
  for (const [label, elev, wind] of DIALS) {
    it(`impact is unchanged with ${label} and no re-aim`, () => {
      const impact = impactFor(elev, wind);
      expect(Math.abs(impact.x - baseline.x)).toBeLessThan(1e-4);
      expect(Math.abs(impact.y - baseline.y)).toBeLessThan(1e-4);
    });
  }

  // The positive half: the dial does nothing until you re-aim, and then it does
  // exactly the right thing.
  it('re-aiming after 1 MIL up raises the impact by 1 mrad × distance', () => {
    // Positive hold pitch looks DOWN, so aiming UP by 1 mrad SUBTRACTS a mil —
    // which puts the crosshair back on the plate centre after dialing up.
    const impact = impactFor(MIL, 0, HOLD_PITCH - MIL);
    expect(impact.y - baseline.y).toBeCloseTo(MIL * R, 4);
    expect(Math.abs(impact.x - baseline.x)).toBeLessThan(1e-4);
  });

  it('re-aiming after 1 MIL right moves the impact right by 1 mrad × distance', () => {
    // Positive hold yaw looks RIGHT, so re-centring after dialing right ADDS a
    // mil to the hold.
    const dial = { elevRad: 0, windRad: MIL };
    const off = sightOffset({ elevationRad: 0, windageRad: MIL }, PZ);
    const angles = sightAimAngles(HOLD_PITCH, HOLD_YAW + MIL, off);
    const impact = resolveShot({
      eye: EYE,
      aimDir: sightLineDir(angles.pitchRad, angles.yawRad),
      dial,
      solve: SOLVE,
      distanceM: R,
      scatter: { x: 0, y: 0 },
      plates: [PLATE],
      bulletDiameterM: BULLET,
      playerZero: PZ,
    }).impact;
    expect(impact.x - baseline.x).toBeCloseTo(MIL * R, 4);
    expect(Math.abs(impact.y - baseline.y)).toBeLessThan(1e-4);
  });
});

describe('scope/turret-view/easeSightOffset', () => {
  const TARGET = { elevRad: 0.01, windRad: -0.004 };
  const START = { elevRad: 0, windRad: 0 };

  it('moves toward the target and reaches ~95% within ~3τ', () => {
    let cur = START;
    const dt = SIGHT_GLIDE_TAU_S / 4;
    for (let t = 0; t < 3 * SIGHT_GLIDE_TAU_S - 1e-9; t += dt) {
      cur = easeSightOffset(cur, TARGET, dt);
    }
    expect(cur.elevRad / TARGET.elevRad).toBeGreaterThan(0.94);
    expect(cur.elevRad / TARGET.elevRad).toBeLessThan(1);
    expect(cur.windRad / TARGET.windRad).toBeGreaterThan(0.94);
  });

  it('is frame-rate independent: one big step ≈ many small ones', () => {
    const total = 0.02;
    const one = easeSightOffset(START, TARGET, total);
    let many = START;
    for (let i = 0; i < 20; i++) many = easeSightOffset(many, TARGET, total / 20);
    expect(many.elevRad).toBeCloseTo(one.elevRad, 12);
    expect(many.windRad).toBeCloseTo(one.windRad, 12);
  });

  it('snaps exactly onto the target instead of chasing it forever', () => {
    let cur = START;
    for (let i = 0; i < 200; i++) cur = easeSightOffset(cur, TARGET, 0.016);
    expect(cur).toEqual(TARGET);
  });

  it('holds still when already on target', () => {
    expect(easeSightOffset(TARGET, TARGET, 0.016)).toEqual(TARGET);
  });

  it('accepts a tuned time constant', () => {
    const fast = easeSightOffset(START, TARGET, 0.01, 0.005);
    const slow = easeSightOffset(START, TARGET, 0.01, 0.1);
    expect(fast.elevRad).toBeGreaterThan(slow.elevRad);
  });
});
