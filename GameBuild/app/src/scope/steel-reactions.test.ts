// Tests for the extracted reactive-steel lifecycle (task T5).
//
// T5 is a PURE REFACTOR, so the job here is to pin the behaviour that used to be
// unobservable inside `ScopeView`'s render loop: the swing → step → settle →
// snap-back sequence, that a bolted plate never enters the stepped set, and that
// native handles are freed exactly once.
//
// The scene and the native reaction are FAKES. The real ones need a THREE scene and
// the WASM module; what matters here is the orchestration, and a fake is what lets
// "settles after N steps" and "delete() called exactly once" be asserted at all.

import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createSteelReactions, type SteelReactionFactory } from './steel-reactions';
import { PLATE_THICKNESS_M, type PlateInstance } from '../range/RangeScene';
import { PLATE_LAYER_BYTES } from '../range/plate-surface';
import type { SteelSceneApi } from '../range/steel-scene-api';
import type { SteelReaction } from '../engine-bridge/steel-target';

/** A stand-in for one C++ SteelTarget. Records what the controller did to it. */
class FakeReaction {
  strikes = 0;
  steps = 0;
  deletes = 0;
  textureReads = 0;
  /** Settle after this many steps. */
  movingFor = 3;
  constructor(readonly spec: Record<string, unknown>) {}
  strike(): void {
    this.strikes++;
    this.steps = 0; // a fresh impulse re-starts the swing
  }
  step(): void {
    this.steps++;
  }
  getPose() {
    // Swing away from the shooter and rotate about X, like the real thing.
    return {
      position: { x: 0.1 * this.steps, y: 1.5, z: -100 - 0.05 * this.steps },
      quaternion: { x: Math.sin(0.05 * this.steps), y: 0, z: 0, w: Math.cos(0.05 * this.steps) },
    };
  }
  getChains() {
    return [
      { attach: { x: -0.1, y: 1.6, z: -100 }, fixed: { x: -0.15, y: 1.8, z: -100 } },
      { attach: { x: 0.1, y: 1.6, z: -100 }, fixed: { x: 0.15, y: 1.8, z: -100 } },
    ];
  }
  isMoving(): boolean {
    return this.steps < this.movingFor;
  }
  getTexture(): Uint8Array {
    this.textureReads++;
    return new Uint8Array(PLATE_LAYER_BYTES);
  }
  repaint(): void {}
  delete(): void {
    this.deletes++;
  }
}

const built: FakeReaction[] = [];

/** The injected factory. Records every target built so the test can assert one
 *  target per struck plate, and exactly one `delete()` each. */
const fakeFactory: SteelReactionFactory = (spec) => {
  const r = new FakeReaction(spec as unknown as Record<string, unknown>);
  built.push(r);
  return r as unknown as SteelReaction;
};

interface FakeScene extends SteelSceneApi {
  writes: { layer: number; paintHex: number }[];
}

function fakeScene(plateCount: number, meshes = 1): FakeScene {
  const perMesh = Math.ceil(plateCount / meshes);
  const plateMeshes = Array.from(
    { length: meshes },
    () => new THREE.InstancedMesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial(), perMesh),
  );
  // Give every plate a distinct rest matrix so a snap-back is detectable.
  const rest: THREE.Matrix4[] = [];
  for (let id = 0; id < plateCount; id++) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(id, 1.5, -100),
      new THREE.Quaternion(),
      new THREE.Vector3(0.3, 0.3, PLATE_THICKNESS_M),
    );
    rest.push(m.clone());
    plateMeshes[Math.floor(id / perMesh)].setMatrixAt(id % perMesh, m);
  }
  const writes: { layer: number; paintHex: number }[] = [];
  const chainMesh = new THREE.InstancedMesh(
    new THREE.BufferGeometry(),
    new THREE.MeshBasicMaterial(),
    plateCount * 2,
  );
  const chainRest = Array.from({ length: plateCount * 2 }, () => new THREE.Matrix4());
  return {
    plates: [],
    plateMesh: plateMeshes[0],
    meshFor:
      meshes > 1
        ? (id: number) => ({ mesh: plateMeshes[Math.floor(id / perMesh)], index: id % perMesh })
        : undefined,
    plateSurface: {
      texture: null as never,
      writeLayer: () => {
        throw new Error('writeLayer must not be used on the hit path (T4b)');
      },
      setBaseLayer: () => {},
      writeEngineLayer: (layer: number, _rgba: ArrayLike<number>, paintHex: number) => {
        writes.push({ layer, paintHex });
      },
      dispose: () => {},
    },
    chainMesh,
    chainRest,
    dispose: () => {},
    writes,
    // exposed for assertions
    ...({ restMatrices: rest, plateMeshes } as unknown as object),
  } as FakeScene;
}

function plate(over: Partial<PlateInstance> = {}): PlateInstance {
  return {
    rackId: 'r',
    distanceM: 100,
    distanceYards: 109,
    diameterM: 0.3048,
    position: new THREE.Vector3(0, 1.5, -100),
    beamHeightM: 1.8,
    instanceId: 0,
    paintColor: 0xf0f0ea,
    ...over,
  };
}

const IMPACT = {
  impactWorld: { x: 0, y: 1.5, z: -100 },
  impactVel: { x: 0, y: -8, z: -760 },
  bulletMassKg: 0.009,
  bulletDiameterM: 0.0067,
};

function setup(plateCount = 2, meshes = 1) {
  built.length = 0;
  const scene = fakeScene(plateCount, meshes);
  const controller = createSteelReactions(scene, fakeFactory);
  return { scene, controller };
}

describe('swinging plate lifecycle', () => {
  it('strikes, steps, settles, and snaps back to the rest matrix', () => {
    const { scene, controller } = setup();
    const p = plate();
    const restBefore = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, restBefore);

    controller.onImpact({ plate: p, ...IMPACT });
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(1);

    // While moving, the matrix tracks the pose — i.e. it is NOT the rest matrix.
    controller.update(0.016);
    const posed = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, posed);
    expect(posed.elements).not.toEqual(restBefore.elements);
    expect(built[0].steps).toBe(1);

    // Step until it settles.
    controller.update(0.016);
    controller.update(0.016);
    const after = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, after);
    // Snapped back EXACTLY, not approximately — this is the visual "plate is at
    // rest again" state the next hit reads as its rest matrix.
    expect(after.elements).toEqual(restBefore.elements);
  });

  it('stops stepping once settled, and does not delete the native target', () => {
    const { controller } = setup();
    controller.onImpact({ plate: plate(), ...IMPACT });
    for (let i = 0; i < 10; i++) controller.update(0.016);
    // Settles at 3; the extra 7 frames must not have kept stepping it.
    expect(built[0].steps).toBe(3);
    // The C++ target SURVIVES settle — its paint buffer is the persistent mark
    // store, so deleting here would wipe the plate's hit marks.
    expect(built[0].deletes).toBe(0);
  });

  it('re-uses the same native target on a second hit, and re-enters the swing', () => {
    const { controller } = setup();
    const p = plate();
    controller.onImpact({ plate: p, ...IMPACT });
    for (let i = 0; i < 5; i++) controller.update(0.016);
    expect(built).toHaveLength(1);

    controller.onImpact({ plate: p, ...IMPACT });
    expect(built).toHaveLength(1); // NOT a second target
    expect(built[0].strikes).toBe(2);
    controller.update(0.016);
    expect(built[0].steps).toBe(1); // stepping again
  });

  it('tracks each plate independently', () => {
    const { controller } = setup(2);
    controller.onImpact({ plate: plate({ instanceId: 0 }), ...IMPACT });
    controller.onImpact({ plate: plate({ instanceId: 1 }), ...IMPACT });
    expect(built).toHaveLength(2);
    controller.update(0.016);
    expect(built[0].steps).toBe(1);
    expect(built[1].steps).toBe(1);
  });

  it('redraws the struck plate\'s chains while it swings, and restores them on settle', () => {
    const { scene, controller } = setup();
    const before = new THREE.Matrix4();
    scene.chainMesh.getMatrixAt(0, before);
    controller.onImpact({ plate: plate(), ...IMPACT });
    controller.update(0.016);
    const during = new THREE.Matrix4();
    scene.chainMesh.getMatrixAt(0, during);
    expect(during.elements).not.toEqual(before.elements);
    for (let i = 0; i < 5; i++) controller.update(0.016);
    const after = new THREE.Matrix4();
    scene.chainMesh.getMatrixAt(0, after);
    expect(after.elements).toEqual(scene.chainRest[0].elements);
  });
});

describe('bolted plates', () => {
  it('take paint but NEVER enter the stepped set', () => {
    const { scene, controller } = setup();
    // Read the rest matrix BACK from the mesh: instance matrices are Float32Array,
    // so a freshly-composed float64 matrix will not compare equal.
    const restBefore = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, restBefore);
    controller.onImpact({ plate: plate({ swings: false }), ...IMPACT });
    // It got a native target and a splat…
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(1);
    expect(scene.writes).toEqual([{ layer: 0, paintHex: 0xf0f0ea }]);
    // …but no pose, no stepping, ever.
    for (let i = 0; i < 10; i++) controller.update(0.016);
    expect(built[0].steps).toBe(0);
    // …and its matrix is untouched, so it does not visibly move.
    const m = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, m);
    expect(m.elements).toEqual(restBefore.elements);
  });

  it('accumulate marks across repeat hits', () => {
    const { scene, controller } = setup();
    const p = plate({ swings: false });
    controller.onImpact({ plate: p, ...IMPACT });
    controller.onImpact({ plate: p, ...IMPACT });
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(2);
    expect(scene.writes).toHaveLength(2);
  });
});

describe('paint writes', () => {
  it('composite through writeEngineLayer with the plate\'s own paint colour', () => {
    // Not `writeLayer` — the fake scene throws on that, which is how a regression
    // to the ELR-wiping call would surface here rather than on device.
    const { scene, controller } = setup();
    controller.onImpact({ plate: plate({ paintColor: 0x123456 }), ...IMPACT });
    expect(scene.writes).toEqual([{ layer: 0, paintHex: 0x123456 }]);
  });

  it('writes on every strike, so marks accumulate as the plate keeps swinging', () => {
    const { scene, controller } = setup();
    const p = plate();
    controller.onImpact({ plate: p, ...IMPACT });
    controller.onImpact({ plate: p, ...IMPACT });
    expect(scene.writes).toHaveLength(2);
  });
});

describe('multi-shape scenes (meshFor)', () => {
  it('poses a plate in whichever mesh holds it', () => {
    // The seam T9b needs: global instanceIds across several plate meshes.
    const { scene, controller } = setup(4, 2); // 2 meshes × 2 plates
    const untouchedBefore = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, untouchedBefore);
    const slot = scene.meshFor!(3);
    const before = new THREE.Matrix4();
    slot.mesh.getMatrixAt(slot.index, before);
    controller.onImpact({ plate: plate({ instanceId: 3 }), ...IMPACT });
    controller.update(0.016);
    const after = new THREE.Matrix4();
    slot.mesh.getMatrixAt(slot.index, after);
    expect(after.elements).not.toEqual(before.elements);
    // The first mesh must be untouched — a plate in mesh 2 must not move mesh 1.
    const other = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, other);
    expect(other.elements).toEqual(untouchedBefore.elements);
  });

  it('falls back to plateMesh when a scene declares no meshFor', () => {
    const { scene, controller } = setup(2, 1);
    expect(scene.meshFor).toBeUndefined();
    controller.onImpact({ plate: plate({ instanceId: 1 }), ...IMPACT });
    controller.update(0.016);
    const m = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(1, m);
    expect(m.elements[14]).toBeLessThan(-100); // swung downrange
  });
});

describe('lifecycle bookkeeping', () => {
  it('deletes every native handle exactly once, and is idempotent', () => {
    const { controller } = setup(3);
    controller.onImpact({ plate: plate({ instanceId: 0 }), ...IMPACT });
    controller.onImpact({ plate: plate({ instanceId: 1, swings: false }), ...IMPACT });
    controller.onImpact({ plate: plate({ instanceId: 2 }), ...IMPACT });
    expect(built).toHaveLength(3);
    controller.dispose();
    controller.dispose();
    // Exactly once each: a moving entry ALIASES a targets entry, so freeing via
    // both maps would double-delete.
    for (const r of built) expect(r.deletes).toBe(1);
  });

  it('update() is a no-op with nothing moving', () => {
    const { controller } = setup();
    expect(() => controller.update(0.016)).not.toThrow();
  });

  it('exposes the T6 seams as trivial today', () => {
    // A plate that was never struck (or cannot be knocked) is always in play.
    const { controller } = setup();
    expect(controller.isStanding(0)).toBe(true);
    expect(() => controller.resetDownTargets()).not.toThrow();
    expect(() => controller.resetDownTargets('some-group')).not.toThrow();
  });
});

// --- knockdown mode (task T6) --------------------------------------------------


/** A knockdown plate: a 12"×42" popper on a hinged stem.
 *
 *  `position` MUST match the rest matrix `fakeScene` wrote for this instanceId — the
 *  controller derives the hinge from the rest matrix, and a fixture whose two
 *  disagree tests a configuration no real scene produces. (My first version of this
 *  fixture did disagree, which is what surfaced the source-side fix.) */
function popper(over: Partial<PlateInstance> = {}): PlateInstance {
  const instanceId = over.instanceId ?? 0;
  return plate({
    mountId: 'hinge-stem',
    diameterM: 0.3048,
    heightM: POPPER_HEIGHT_M,
    position: new THREE.Vector3(instanceId, 1.5, -100), // == fakeScene's rest matrix
    // Set explicitly, exactly as `buildTestRangePlates` does: a knockdown target is
    // hinged at its own BASE, so the pivot is half its height below its centre. The
    // fixture must mirror that rule or its hinge assertions test a pivot production
    // never uses.
    pivotYM: 1.5 - POPPER_HEIGHT_M / 2,
    ...over,
  });
}

/** 42″ popper. */
const POPPER_HEIGHT_M = 1.0668;

/** The hinge for a popper at this instanceId — its own base. */
const pivotFor = (instanceId = 0) =>
  new THREE.Vector3(instanceId, 1.5 - POPPER_HEIGHT_M / 2, -100);

/** A hit at the plate centre — half a plate height above the hinge. */
const POPPER_IMPACT = {
  impactWorld: { x: 0, y: 1.5, z: -100 },
  impactVel: { x: 0, y: -8, z: -760 },
  bulletMassKg: 0.0109,
  bulletDiameterM: 0.0078,
};

/** Step the controller until `predicate`, or throw. */
function drive(
  controller: ReturnType<typeof createSteelReactions>,
  predicate: () => boolean,
  maxSteps = 6000,
): number {
  for (let i = 0; i < maxSteps; i++) {
    if (predicate()) return i;
    controller.update(1 / 60);
  }
  throw new Error('predicate never satisfied');
}

describe('knockdown plates', () => {
  it('take paint and topple, but never enter the swing set', () => {
    const { scene, controller } = setup();
    controller.onImpact({ plate: popper(), ...POPPER_IMPACT });
    // Native target created (it holds the paint buffer) and the splat recorded…
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(1);
    expect(scene.writes).toEqual([{ layer: 0, paintHex: 0xf0f0ea }]);
    // …but the C++ physics is never stepped: the pose is the TS machine's.
    controller.update(1 / 60);
    expect(built[0].steps).toBe(0);
  });

  it('rotates about the HINGE, not the plate centre', () => {
    // The distinguishing check. A rotation about the centre leaves the centre where
    // it is; a rotation about a hinge a metre below sweeps it through an arc.
    const { scene, controller } = setup();
    const before = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, before);
    const centreBefore = new THREE.Vector3().setFromMatrixPosition(before);

    controller.onImpact({ plate: popper(), ...POPPER_IMPACT });
    for (let i = 0; i < 10; i++) controller.update(1 / 60);

    const after = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, after);
    const centreAfter = new THREE.Vector3().setFromMatrixPosition(after);
    expect(centreAfter.distanceTo(centreBefore)).toBeGreaterThan(0.01);
    // Toppling away from the shooter (downrange is −z) and downward.
    expect(centreAfter.z).toBeLessThan(centreBefore.z);
    expect(centreAfter.y).toBeLessThan(centreBefore.y);
  });

  it('keeps the hinge itself fixed through the whole fall', () => {
    // What "about the hinge" means, asserted rather than implied: the pivot point
    // must not move, or the plate is sliding as well as rotating.
    const { scene, controller } = setup();
    const p = popper();
    const pivot = pivotFor(0);
    controller.onImpact({ plate: p, ...POPPER_IMPACT });
    const rest = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, rest);
    // The hinge in the plate's rest frame, carried through the live matrix each step.
    const localPivot = pivot.clone().applyMatrix4(new THREE.Matrix4().copy(rest).invert());
    for (let i = 0; i < 20; i++) {
      controller.update(1 / 60);
      const live = new THREE.Matrix4();
      scene.plateMesh.getMatrixAt(0, live);
      const moved = localPivot.clone().applyMatrix4(live);
      expect(moved.distanceTo(pivot)).toBeLessThan(1e-4);
    }
  });

  it('goes out of play while down, and comes back in when it stands up', () => {
    const { controller } = setup();
    controller.onImpact({ plate: popper(), ...POPPER_IMPACT });
    expect(controller.isStanding(0)).toBe(true); // still toppling — hittable
    drive(controller, () => !controller.isStanding(0));
    // Out of play for the whole down + rising window.
    const backUp = drive(controller, () => controller.isStanding(0));
    expect(backUp).toBeGreaterThan(1);
    // …and it really did come back up, rather than the loop running out.
    expect(controller.isStanding(0)).toBe(true);
  });

  it('resets to upright on demand, restoring the exact rest matrix', () => {
    const { scene, controller } = setup();
    const rest = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, rest);
    controller.onImpact({ plate: popper(), ...POPPER_IMPACT });
    drive(controller, () => !controller.isStanding(0));
    controller.resetDownTargets();
    const after = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, after);
    expect(after.elements).toEqual(rest.elements);
    expect(controller.isStanding(0)).toBe(true);
  });

  it('resets a whole GROUP together, and leaves other groups down', () => {
    // What `groupId` is for: one rack of plates stands up as one piece of furniture.
    const { controller } = setup(3);
    controller.onImpact({ plate: popper({ instanceId: 0, groupId: 'rack-a' }), ...POPPER_IMPACT });
    controller.onImpact({ plate: popper({ instanceId: 1, groupId: 'rack-a' }), ...POPPER_IMPACT });
    controller.onImpact({ plate: popper({ instanceId: 2, groupId: 'rack-b' }), ...POPPER_IMPACT });
    drive(controller, () => [0, 1, 2].every((id) => !controller.isStanding(id)));

    controller.resetDownTargets('rack-a');
    expect(controller.isStanding(0)).toBe(true);
    expect(controller.isStanding(1)).toBe(true);
    expect(controller.isStanding(2)).toBe(false); // other rack untouched
  });

  it('a harder hit topples faster', () => {
    const fast = setup();
    fast.controller.onImpact({ plate: popper(), ...POPPER_IMPACT, bulletMassKg: 0.02 });
    const fastSteps = drive(fast.controller, () => !fast.controller.isStanding(0));
    const slow = setup();
    slow.controller.onImpact({ plate: popper(), ...POPPER_IMPACT, bulletMassKg: 0.003 });
    const slowSteps = drive(slow.controller, () => !slow.controller.isStanding(0));
    expect(fastSteps).toBeLessThan(slowSteps);
  });

  it('builds its native target with the rectangular mass model for a tall plate', () => {
    // A 12"×42" silhouette is not an ellipse; `isOval: false` gives it the
    // bounding-box tensor the C++ already supports.
    const { controller } = setup();
    controller.onImpact({ plate: popper(), ...POPPER_IMPACT });
    const spec = built[0].spec as unknown as { isOval?: boolean; heightM?: number };
    expect(spec.isOval).toBe(false);
    expect(spec.heightM).toBeCloseTo(1.0668, 9);
  });

  it('leaves a ROUND plate on the elliptical default, so shipped ranges are unchanged', () => {
    const { controller } = setup();
    controller.onImpact({ plate: plate(), ...IMPACT });
    const spec = built[0].spec as unknown as { isOval?: boolean; heightM?: number };
    expect(spec.isOval).toBeUndefined();
    expect(spec.heightM).toBeUndefined();
  });

  it('takes the hinge from the REST MATRIX, not from plate.position', () => {
    // Real scenes write both from one value, so this configuration should never
    // occur — which is exactly why it needs a test: without one, deriving the pivot
    // from the wrong source is invisible. The rest matrix is what the rotation
    // composes onto, so it has to be the source of truth for the pivot too.
    const { scene, controller } = setup();
    const rest = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, rest); // centre at (0, 1.5, −100)
    // A plate whose `position` claims something 40 m away.
    const lying = popper({ position: new THREE.Vector3(0, 1.5, -60) });
    controller.onImpact({ plate: lying, ...POPPER_IMPACT });
    for (let i = 0; i < 10; i++) controller.update(1 / 60);

    const live = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, live);
    // The hinge implied by the REST matrix must be the one that stayed put.
    const pivot = pivotFor(0);
    const localPivot = pivot.clone().applyMatrix4(new THREE.Matrix4().copy(rest).invert());
    expect(localPivot.clone().applyMatrix4(live).distanceTo(pivot)).toBeLessThan(1e-4);
    // And the plate has actually moved, so the assertion above is not vacuous.
    expect(live.elements).not.toEqual(rest.elements);
  });

  it('does not animate a plate that was never struck', () => {
    const { scene, controller } = setup();
    const before = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, before);
    for (let i = 0; i < 50; i++) controller.update(1 / 60);
    const after = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, after);
    expect(after.elements).toEqual(before.elements);
  });
});

// --- flip mode (hostage paddles) ----------------------------------------------

/** A hostage paddle on a 2-way (binary) or 3-way (alternating) clamp mount. */
function paddle(mountId: 'hostage-clamp-2way' | 'hostage-clamp-3way', over: Partial<PlateInstance> = {}): PlateInstance {
  return plate({ mountId, diameterM: 0.1524, ...over });
}

describe('flip plates (hostage paddles)', () => {
  it('take paint and reposition, but never enter the swing set', () => {
    const { scene, controller } = setup();
    controller.onImpact({ plate: paddle('hostage-clamp-2way'), ...IMPACT });
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(1);
    expect(scene.writes).toEqual([{ layer: 0, paintHex: 0xf0f0ea }]);
    controller.update(1 / 60);
    expect(built[0].steps).toBe(0); // never stepped — the C++ physics is untouched
  });

  it('moves plate.position.x to the NEXT stop immediately on strike, before any update()', () => {
    // The load-bearing correctness property: `game/shot.ts` hit-tests
    // `PlateInstance.position` directly, so the very next shot must see the new
    // stop even if `update()` (the cosmetic animation) never ran.
    const { controller } = setup();
    const p = paddle('hostage-clamp-2way');
    const before = p.position.x;
    controller.onImpact({ plate: p, ...IMPACT });
    expect(p.position.x).toBeCloseTo(before + 0.35, 9); // 'left' (rest) -> 'right'
  });

  it('toggles a 2-way paddle left/right forever', () => {
    const { controller } = setup();
    const p = paddle('hostage-clamp-2way');
    const base = p.position.x;
    const seen: number[] = [];
    for (let i = 0; i < 4; i++) {
      controller.onImpact({ plate: p, ...IMPACT });
      seen.push(Math.round((p.position.x - base) * 1000) / 1000);
    }
    expect(seen).toEqual([0.35, 0, 0.35, 0]);
  });

  it('cycles a 3-way paddle center -> right -> center -> left -> center, alternating sides', () => {
    const { controller } = setup();
    const p = paddle('hostage-clamp-3way');
    const base = p.position.x;
    const seen: number[] = [];
    for (let i = 0; i < 6; i++) {
      controller.onImpact({ plate: p, ...IMPACT });
      seen.push(Math.round((p.position.x - base) * 1000) / 1000);
    }
    // ±0.33 m, not ±0.15: the swung stops have to put the paddle clear of the
    // backing silhouette's 18″ outline or it is unhittable there (see
    // `mount-registry.ts`'s HOSTAGE_CLAMP_3WAY — 0.3048 m is a hard floor, and
    // this sits 2.5 cm above it after the owner dialed 0.36 back).
    expect(seen).toEqual([0.33, 0, -0.33, 0, 0.33, 0]);
  });

  // --- it SWINGS, it does not slide (owner defect, 2026-08-06) ----------------
  //
  // "Both flippers don't actually flip, they just slide to the side so the same
  // face is always visible. If I shoot the right side of the flipper, it slides
  // out to the side and the splat is still visible on the right side."
  //
  // The fix is a 180° rotation about a vertical pivot midway between the stops.
  // These pin the three properties that distinguishes it from the old lerp: the
  // face turns, the paddle arcs toward the shooter, and it still lands exactly on
  // the stop the hit test already moved to.
  describe('swing (not slide)', () => {
    /** The paddle's pose after `steps` frames of `dt`. */
    function poseAfter(mountId: 'hostage-clamp-2way' | 'hostage-clamp-3way', dt: number, steps: number) {
      const { scene, controller } = setup();
      const p = paddle(mountId);
      const base = p.position.x;
      controller.onImpact({ plate: p, ...IMPACT });
      for (let i = 0; i < steps; i++) controller.update(dt);
      const m = new THREE.Matrix4();
      scene.plateMesh.getMatrixAt(0, m);
      const pos = new THREE.Vector3();
      const quat = new THREE.Quaternion();
      const scale = new THREE.Vector3();
      m.decompose(pos, quat, scale);
      return { pos, quat, base, plate: p, controller, scene };
    }

    it('turns the paddle a half turn about the VERTICAL axis per strike', () => {
      // The whole point: the far face comes round to the shooter, so a splat on
      // the struck side goes with it. A slide leaves the same face out.
      const { quat } = poseAfter('hostage-clamp-2way', 0.3, 1); // transition complete
      const euler = new THREE.Euler().setFromQuaternion(quat, 'YXZ');
      expect(Math.abs(euler.y)).toBeCloseTo(Math.PI, 4);
      // …about Y only. An X or Z component would be a tumble, not a door swing.
      expect(Math.abs(euler.x)).toBeCloseTo(0, 6);
      expect(Math.abs(euler.z)).toBeCloseTo(0, 6);
    });

    it('is edge-on at the halfway point, and proud of the plate by half the travel', () => {
      // The signature of a real swing: at 90° the paddle shows its rim, and its
      // centre stands off the backing plate — it is travelling on an arc, not a line.
      const { pos, base } = poseAfter('hostage-clamp-2way', 0.15, 1); // half of 0.3 s
      expect(pos.x).toBeCloseTo(base + 0.175, 4); // over the pivot
      // +z is toward the shooter; the plate rests at z = −100.
      expect(pos.z).toBeCloseTo(-100 + 0.175, 4);
    });

    it('always arcs TOWARD the shooter, on the return stop too', () => {
      // A door that opened both ways would sweep the paddle THROUGH the backing
      // plate every second strike. The facing takes the travel's sign; the arc
      // does not.
      const { scene, controller } = setup();
      const p = paddle('hostage-clamp-3way');
      const m = new THREE.Matrix4();
      const at = () => {
        scene.plateMesh.getMatrixAt(0, m);
        return new THREE.Vector3().setFromMatrixPosition(m);
      };
      for (let strike = 0; strike < 4; strike++) {
        controller.onImpact({ plate: p, ...IMPACT });
        controller.update(0.15); // mid-swing
        expect(at().z, `strike ${strike + 1} swung the wrong way`).toBeGreaterThan(-100);
      }
    });

    it('lands flat on the stop the hit test already moved to', () => {
      // The rotation must not become a second source of truth for position: a half
      // turn about the midpoint maps one stop exactly onto the other.
      const { pos, plate: p } = poseAfter('hostage-clamp-2way', 0.3, 2);
      expect(pos.x).toBeCloseTo(p.position.x, 6);
      expect(pos.z).toBeCloseTo(-100, 6); // back in the plate's plane
    });

    it('ALTERNATES which face is out across strikes, rather than resetting per stop', () => {
      // The 3-way cycle revisits `center` every other strike. Facing is an
      // accumulator, so `center` on strike 2 and `center` on strike 4 show
      // different faces — which stop index alone cannot express.
      const { scene, controller } = setup();
      const p = paddle('hostage-clamp-3way');
      const m = new THREE.Matrix4();
      const facing = () => {
        scene.plateMesh.getMatrixAt(0, m);
        const q = new THREE.Quaternion();
        m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
        return new THREE.Euler().setFromQuaternion(q, 'YXZ').y;
      };
      const seen: number[] = [];
      for (let i = 0; i < 4; i++) {
        controller.onImpact({ plate: p, ...IMPACT });
        controller.update(0.3);
        seen.push(Math.round((facing() / Math.PI) * 1000) / 1000);
      }
      // Half a turn per strike. Euler wraps, so ±1 and 0 alternate rather than
      // climbing — what matters is that consecutive entries differ.
      for (let i = 1; i < seen.length; i++) expect(seen[i]).not.toBe(seen[i - 1]);
    });

    it('resetFlipTargets clears the accumulated turn, not just the position', () => {
      // A paddle can sit on stop 0 having turned through 2π: same place, wrong
      // face. A fresh engagement must start from a known face.
      const { scene, controller } = setup();
      const p = paddle('hostage-clamp-3way');
      for (let i = 0; i < 4; i++) {
        controller.onImpact({ plate: p, ...IMPACT }); // back to stop 0, spun 2π
        controller.update(0.3);
      }
      controller.resetFlipTargets();
      const m = new THREE.Matrix4();
      scene.plateMesh.getMatrixAt(0, m);
      const q = new THREE.Quaternion();
      m.decompose(new THREE.Vector3(), q, new THREE.Vector3());
      expect(new THREE.Euler().setFromQuaternion(q, 'YXZ').y).toBeCloseTo(0, 6);
    });
  });

  it('animates the mesh toward the new stop over transitionS, without moving the hit-test position further', () => {
    const { scene, controller } = setup();
    const p = paddle('hostage-clamp-2way');
    controller.onImpact({ plate: p, ...IMPACT });
    const targetX = p.position.x; // landed immediately
    controller.update(0.1); // 1/3 of the 0.3 s transition
    const mid = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, mid);
    const midX = new THREE.Vector3().setFromMatrixPosition(mid).x;
    expect(midX).toBeGreaterThan(0);
    expect(midX).toBeLessThan(targetX - 1e-6);
    expect(p.position.x).toBeCloseTo(targetX, 9); // unaffected by the animation
    controller.update(0.2); // finishes the transition
    const done = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, done);
    expect(new THREE.Vector3().setFromMatrixPosition(done).x).toBeCloseTo(targetX, 6);
  });

  it('re-uses the same native target across repeat hits, same as knockdown', () => {
    const { controller } = setup();
    const p = paddle('hostage-clamp-2way');
    controller.onImpact({ plate: p, ...IMPACT });
    controller.onImpact({ plate: p, ...IMPACT });
    expect(built).toHaveLength(1);
    expect(built[0].strikes).toBe(2);
  });

  it('resetFlipTargets snaps back to the rest stop immediately, no animation', () => {
    const { scene, controller } = setup();
    const p = paddle('hostage-clamp-3way');
    const base = p.position.x;
    controller.onImpact({ plate: p, ...IMPACT }); // -> right
    controller.onImpact({ plate: p, ...IMPACT }); // -> center
    controller.onImpact({ plate: p, ...IMPACT }); // -> left
    expect(p.position.x).not.toBeCloseTo(base, 6);

    controller.resetFlipTargets();
    expect(p.position.x).toBeCloseTo(base, 9);
    const m = new THREE.Matrix4();
    scene.plateMesh.getMatrixAt(0, m);
    expect(new THREE.Vector3().setFromMatrixPosition(m).x).toBeCloseTo(base, 6);

    // The NEXT strike starts the cycle over from 'center', not where it left off.
    controller.onImpact({ plate: p, ...IMPACT });
    expect(p.position.x).toBeCloseTo(base + 0.33, 9);
  });

  it('resetFlipTargets is a no-op for a paddle that was never struck', () => {
    const { controller } = setup();
    expect(() => controller.resetFlipTargets()).not.toThrow();
  });

  it('deletes every native handle exactly once, and is idempotent, alongside a flip paddle', () => {
    const { controller } = setup(2);
    controller.onImpact({ plate: paddle('hostage-clamp-2way', { instanceId: 0 }), ...IMPACT });
    controller.onImpact({ plate: plate({ instanceId: 1 }), ...IMPACT });
    controller.dispose();
    controller.dispose();
    for (const r of built) expect(r.deletes).toBe(1);
  });
});
