// Reactive-steel side of the engine bridge (task 1.5a) — wraps the C++
// btk::rendering::SteelTarget rigid body so a struck plate swings/rotates from
// the bullet's impact impulse. Like index.ts / match-sim.ts, this is the ONLY
// place that touches these embind handles and their `.delete()` rules
// (build-plan §3; execution-protocol §9).
//
// The wrapper is deliberately framework-free: it returns a plain-number pose
// (COM + quaternion), and ScopeView composes that into the plate InstancedMesh
// matrix. THREE never enters the bridge.
//
// Anchor geometry mirrors BallisticsToolkit steel-sim `SteelTarget.js`: two
// chains from near the top edge up to the rack beam, so the plate hangs and
// swings like real steel. A centred impact swings it (rotation about the
// horizontal top-anchor axis); an off-centre impact adds twist (rotation about
// the vertical axis) — the "center swings / edge rotates" behavior the plan
// requires.
//
// Coordinate frame (engine SI, matches the scene): +X right, +Y up, downrange
// is −Z, shooter at the origin. The plate's local frame at rest is the world
// frame (XY plate face, +Z/−Z normal), so the returned orientation composes
// directly onto the rendered plate.

import type { BtkModule, ESteelTarget, EVector3D, Vec3, Quat } from './types';

/** Small texture so the (unused) impact-paint buffer costs almost nothing; the
 * game draws its own marks (increment-1.5-plan D2). Must be > 0. */
const TEXTURE_SIZE = 8;

/** Chain anchor sits a hair proud of the plate face so the target hangs just in
 * front of the beam line, as in steel-sim (outwardOffset). */
const OUTWARD_OFFSET_M = 0.05;

export interface SteelReactionSpec {
  /** Round-plate diameter (m). */
  diameterM: number;
  /** Plate thickness (m). */
  thicknessM: number;
  /** Plate face centre in world coordinates (rest position). */
  position: Vec3;
  /** World Y of the rack beam the chains hang from. */
  beamHeightM: number;
}

/** One struck plate's live physics. Created lazily on the first hit, stepped
 * each frame, and `delete()`d once it settles. Reused for repeat hits (each
 * `strike` adds another impulse). */
export interface SteelReaction {
  /** Apply a bullet impact: `impactWorld` = impact point (world m),
   * `impactVel` = bullet velocity at impact (world m/s), plus the bullet's
   * mass/diameter (the impulse = momentum × transfer ratio, in the C++ model). */
  strike(impactWorld: Vec3, impactVel: Vec3, bulletMassKg: number, bulletDiameterM: number): void;
  /** Advance the rigid-body physics by dt seconds. */
  step(dt: number): void;
  /** Current pose: COM (world) + orientation quaternion (relative to the rest
   * frame, which equals the world frame). */
  getPose(): { position: Vec3; quaternion: Quat };
  /** True while the plate is still moving (C++ settle detection). */
  isMoving(): boolean;
  /** Release the native handle. Idempotent. */
  delete(): void;
}

function v3(module: BtkModule, x: number, y: number, z: number): EVector3D {
  return new module.Vector3D(x, y, z);
}

/**
 * Build a reactive steel target for one plate. Round plates → oval (elliptical)
 * mass/inertia; hit-testing is done in TS (game/shot.ts), so this target's own
 * intersect/score paths are unused.
 */
export function createSteelReaction(module: BtkModule, spec: SteelReactionSpec): SteelReaction {
  const isOval = true; // round steel plate
  const pos = v3(module, spec.position.x, spec.position.y, spec.position.z);
  // Face the shooter (normal points uprange, toward +Z). This is the engine
  // default normal, so the plate starts at identity orientation.
  const normal = v3(module, 0, 0, -1);
  const st: ESteelTarget = new module.SteelTarget(
    spec.diameterM,
    spec.diameterM,
    spec.thicknessM,
    isOval,
    pos,
    normal,
    TEXTURE_SIZE,
  );
  pos.delete();
  normal.delete();

  // Two chains from near the top edge (steel-sim geometry). Oval attach point is
  // at ~35° off vertical on the rim, mirrored left/right.
  const radius = spec.diameterM / 2;
  const angle = 0.6; // rad, ≈ steel-sim's near-top attach for round plates
  const ax = radius * Math.sin(angle);
  const ay = radius * Math.cos(angle);
  const az = -spec.thicknessM / 2;
  for (const sx of [-1, 1] as const) {
    const localAttach = v3(module, sx * ax, ay, az);
    const worldAttach = st.localToWorld(localAttach); // COPY → delete
    const worldFixed = v3(module, worldAttach.x - sx * OUTWARD_OFFSET_M, spec.beamHeightM, worldAttach.z);
    st.addChainAnchor(localAttach, worldFixed);
    localAttach.delete();
    worldAttach.delete();
    worldFixed.delete();
  }

  let deleted = false;
  return {
    strike(impactWorld, impactVel, bulletMassKg, bulletDiameterM): void {
      // hit() reads only weight/diameter/position/velocity, so the base bullet's
      // length/bc/drag are irrelevant — use throwaway values.
      const base = new module.Bullet(bulletMassKg, bulletDiameterM, 0.03, 0.5, module.DragFunction.G7);
      const p = v3(module, impactWorld.x, impactWorld.y, impactWorld.z);
      const vel = v3(module, impactVel.x, impactVel.y, impactVel.z);
      const impactBullet = new module.Bullet(base, p, vel, 0);
      st.hit(impactBullet);
      impactBullet.delete();
      vel.delete();
      p.delete();
      base.delete();
    },
    step(dt): void {
      st.timeStep(dt);
    },
    getPose(): { position: Vec3; quaternion: Quat } {
      const com = st.getCenterOfMass(); // COPY → delete
      const q = st.getOrientation(); // COPY → delete
      const pose = {
        position: { x: com.x, y: com.y, z: com.z },
        quaternion: { x: q.x, y: q.y, z: q.z, w: q.w },
      };
      com.delete();
      q.delete();
      return pose;
    },
    isMoving(): boolean {
      return st.isMoving();
    },
    delete(): void {
      if (deleted) return;
      deleted = true;
      st.delete();
    },
  };
}
