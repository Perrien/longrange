// Reactive-steel bridge test (task 1.5a): loads the real engine WASM in Node (via
// the `@engine` alias) and checks the SteelReaction wrapper's lifecycle, its
// `.delete()` paths, and the physics signature the plan requires — a centred
// impact SWINGS the plate (pendulum about the horizontal top-anchor axis) while
// an off-centre impact adds a TWIST (rotation about the vertical axis), with the
// twist sign following the impact side. This is the machine-checkable half of
// "center swings / edge rotates (matches steel-sim behavior)"; the on-device
// side-by-side is the OWNER CHECK.
import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { createSteelReaction, type SteelReactionSpec } from './steel-target';
import type { BtkModule, Quat } from './types';

// 6" round plate at 100 yd, hung ~0.55 m up from a 1.1 m beam (Range A-ish).
const SPEC: SteelReactionSpec = {
  diameterM: 0.1524,
  thicknessM: 0.0127,
  position: { x: 0, y: 0.55, z: -91.44 },
  beamHeightM: 1.1,
};
const MASS_KG = 0.0090718474; // 6.5 mm 140 gr
const DIA_M = 0.0067056;
const IMPACT_SPEED = 760; // ~m/s remaining at 100 yd
// Bullet velocity at impact: downrange (−Z) with a little drop (−Y).
const VEL = { x: 0, y: -8, z: -IMPACT_SPEED };

/** Axis-angle of a unit quaternion (angle ≥ 0; axis undefined at angle 0). */
function axisAngle(q: Quat): { angle: number; x: number; y: number; z: number } {
  const w = Math.max(-1, Math.min(1, q.w));
  const angle = 2 * Math.acos(w);
  const s = Math.sqrt(Math.max(1e-9, 1 - w * w));
  return { angle, x: q.x / s, y: q.y / s, z: q.z / s };
}

let module: BtkModule;
beforeAll(async () => {
  module = await loadBtkModule();
});

describe('steel-target/createSteelReaction', () => {
  it('starts moving, then settles, then delete() is idempotent', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      r.strike(SPEC.position, VEL, MASS_KG, DIA_M);
      expect(r.isMoving()).toBe(true);
      // Step until it settles (chains + damping); bounded so the test can't hang.
      let settled = false;
      for (let i = 0; i < 3000; i++) {
        r.step(0.02);
        if (!r.isMoving()) {
          settled = true;
          break;
        }
      }
      expect(settled).toBe(true);
    } finally {
      r.delete();
      r.delete(); // idempotent
    }
  });

  it('a centred impact swings the plate (pendulum about X) and pushes it downrange', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      const z0 = r.getPose().position.z;
      r.strike(SPEC.position, VEL, MASS_KG, DIA_M);
      let peak = { angle: 0, x: 0, y: 0, z: 0 };
      let zMin = z0;
      for (let i = 0; i < 150; i++) {
        r.step(0.004); // ~0.6 s
        const pose = r.getPose();
        zMin = Math.min(zMin, pose.position.z);
        const aa = axisAngle(pose.quaternion);
        if (aa.angle > peak.angle) peak = aa;
      }
      // Pushed away from the shooter (downrange is −Z).
      expect(zMin).toBeLessThan(z0 - 0.05);
      // Rotation develops about the horizontal top-anchor axis (X), not a twist.
      expect(peak.angle).toBeGreaterThan(0.2);
      expect(Math.abs(peak.x)).toBeGreaterThan(Math.abs(peak.y));
    } finally {
      r.delete();
    }
  });

  it('an off-centre impact twists the plate about the vertical axis (edge rotates)', () => {
    const centre = reactAtOffset(0);
    const edgePlus = reactAtOffset(+0.6);
    const edgeMinus = reactAtOffset(-0.6);
    // Edge hits twist far more than a centred hit.
    expect(edgePlus.twist).toBeGreaterThan(5 * (centre.twist + 1e-4));
    // Twist direction follows the impact side (+X → +Y, −X → −Y).
    expect(Math.sign(edgePlus.signedY)).toBe(1);
    expect(Math.sign(edgeMinus.signedY)).toBe(-1);
  });

  it('exposes two hanging chains whose plate-side ends track the swing (task 1.5c)', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      const rest = r.getChains();
      expect(rest.length).toBe(2);
      for (const ch of rest) {
        // Fixed end hangs from the beam; plate end sits below it, above the centre.
        expect(ch.fixed.y).toBeCloseTo(SPEC.beamHeightM, 3);
        expect(ch.attach.y).toBeLessThan(ch.fixed.y);
        expect(ch.attach.y).toBeGreaterThan(SPEC.position.y);
        // Beam end splays OUTWARD of the attach (wider at the beam → no cross).
        expect(Math.abs(ch.fixed.x)).toBeGreaterThan(Math.abs(ch.attach.x));
        expect(Math.sign(ch.fixed.x)).toBe(Math.sign(ch.attach.x));
        expect(ch.fixed.z).toBeCloseTo(ch.attach.z, 6);
      }
      // Left/right symmetric about the plate centre at rest.
      expect(rest[0].attach.x).toBeCloseTo(-rest[1].attach.x, 6);

      // After a hit + a few steps, the plate-side end has moved with the swing.
      const before = r.getChains()[0].attach;
      r.strike(SPEC.position, VEL, MASS_KG, DIA_M);
      for (let i = 0; i < 20; i++) r.step(0.01);
      const after = r.getChains()[0].attach;
      const moved = Math.hypot(after.x - before.x, after.y - before.y, after.z - before.z);
      expect(moved).toBeGreaterThan(0.001);
    } finally {
      r.delete();
    }
  });
});

/** Strike a plate `offXFrac` of the radius off-centre in X, step briefly, and
 * return the early twist magnitude (rotation projected on Y) and its sign. */
function reactAtOffset(offXFrac: number): { twist: number; signedY: number } {
  const r = createSteelReaction(module, SPEC);
  try {
    const offX = offXFrac * (SPEC.diameterM / 2);
    r.strike({ x: SPEC.position.x + offX, y: SPEC.position.y, z: SPEC.position.z }, VEL, MASS_KG, DIA_M);
    r.step(0.02);
    const aa = axisAngle(r.getPose().quaternion);
    return { twist: Math.abs(aa.angle * aa.y), signedY: aa.angle * aa.y };
  } finally {
    r.delete();
  }
}
