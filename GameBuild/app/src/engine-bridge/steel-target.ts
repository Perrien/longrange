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
 * front of the beam line, as in steel-sim (outwardOffset). Exported so the scene
 * draws its rest chains from the same geometry the reaction uses (task 1.5c). */
export const CHAIN_OUTWARD_OFFSET_M = 0.05;
/** Near-top chain attach angle off vertical (rad), ≈ steel-sim's round-plate rig. */
export const CHAIN_ANCHOR_ANGLE_RAD = 0.6;
/** Outward splay of the DRAWN chains: the beam end sits this fraction of the
 * attach offset further out than the plate end, so the pair forms a shallow
 * trapezoid (wider at the beam) instead of dead-vertical. Visual only. */
export const CHAIN_SPLAY_FRACTION = 0.5;

/** Plate-local offset of a chain's plate-side attach point (before the ±X mirror):
 * near the top edge, a hair behind the face. Pure geometry — shared by the scene's
 * rest chains and the reaction's live `getChains()` so they line up exactly. */
export function chainAnchorLocalOffset(
  diameterM: number,
  thicknessM: number,
): { ax: number; ay: number; az: number } {
  const radius = diameterM / 2;
  return {
    ax: radius * Math.sin(CHAIN_ANCHOR_ANGLE_RAD),
    ay: radius * Math.cos(CHAIN_ANCHOR_ANGLE_RAD),
    az: -thicknessM / 2,
  };
}

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
  /** Current world endpoints of each hanging chain: `attach` (plate-side, tracks
   * the swing via localToWorld) and `fixed` (the beam-side fixed anchor). Used to
   * draw the chains so they follow the plate (task 1.5c). */
  getChains(): { attach: Vec3; fixed: Vec3 }[];
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
  const { ax, ay, az } = chainAnchorLocalOffset(spec.diameterM, spec.thicknessM);
  // Keep the plate-side local attach handles alive: getChains() re-projects them
  // through localToWorld every frame so the drawn chains track the swing. The
  // fixed beam anchors don't move, so store them as plain numbers.
  const chainLocals: EVector3D[] = [];
  const chainFixed: Vec3[] = [];
  for (const sx of [-1, 1] as const) {
    const localAttach = v3(module, sx * ax, ay, az);
    const worldAttach = st.localToWorld(localAttach); // COPY → delete
    const worldFixed = v3(module, worldAttach.x - sx * CHAIN_OUTWARD_OFFSET_M, spec.beamHeightM, worldAttach.z);
    st.addChainAnchor(localAttach, worldFixed); // C++ copies both by value
    chainLocals.push(localAttach); // kept alive → deleted in delete()
    // Drawn beam-end splays OUTWARD of the rest attach (shallow trapezoid), NOT
    // at the physics anchor — that anchor is nudged inward in X (steel-sim's
    // "outward offset" ported onto X), which reads as crossed chains. The physics
    // (swing, task 1.5a) keeps its anchor untouched; only the drawn chain differs.
    chainFixed.push({ x: worldAttach.x + sx * ax * CHAIN_SPLAY_FRACTION, y: spec.beamHeightM, z: worldAttach.z });
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
    getChains(): { attach: Vec3; fixed: Vec3 }[] {
      const chains: { attach: Vec3; fixed: Vec3 }[] = [];
      for (let i = 0; i < chainLocals.length; i++) {
        const w = st.localToWorld(chainLocals[i]); // COPY → delete
        chains.push({ attach: { x: w.x, y: w.y, z: w.z }, fixed: chainFixed[i] });
        w.delete();
      }
      return chains;
    },
    isMoving(): boolean {
      return st.isMoving();
    },
    delete(): void {
      if (deleted) return;
      deleted = true;
      for (const h of chainLocals) h.delete();
      st.delete();
    },
  };
}
