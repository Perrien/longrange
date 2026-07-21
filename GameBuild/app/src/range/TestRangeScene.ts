// Test Range scene builder (Stage 1-2 of Design/Plans/test-range-environment-plan.md)
// — a minimal single-rack steel world: one 12" gong at 100 yd, built so the
// existing shot loop (commit, fire, swing, chains, splat, ping, score, bullet
// trace, dust puffs) works with zero changes to ScopeView's fireSteel /
// reaction-loop paths. Stage 2 swaps the Stage-1 flat placeholder world for
// the reusable environment module (terrain/sky/fog/lighting; trees/mountains/
// clouds land in Stages 3-4) without touching the rack/gong/chains below.
//
// Structure mirrors RangeScene.ts (task 1.2) — a single-rack, single-plate
// RangeScene without berms — so it satisfies SteelSceneApi the same way.

import * as THREE from 'three';
import { TEST_RANGE_GONG, TEST_RANGE_ENVIRONMENT } from './test-range-config';
import { setChainInstance, PLATE_THICKNESS_M, makeSignTexture, type PlateInstance } from './RangeScene';
import { chainAnchorLocalOffset, CHAIN_SPLAY_FRACTION } from '../engine-bridge/steel-target';
import { createPlateDiscGeometry } from './plate-geometry';
import { createPlateSurface, createPlateMaterial, type PlateSurface } from './plate-surface';
import type { SteelSceneApi } from './steel-scene-api';
import { buildEnvironment, type EnvironmentHandle } from './environment';

const FRAME_COLOR = 0xaaaaaa; // galvanised posts/beam
const CHAIN_COLOR = 0x4a4a4a; // dark galvanised chain
const POST_RADIUS_M = 0.0254; // 2" diameter posts
const BEAM_RADIUS_M = 0.0254; // 2" diameter beam

/** Single-rack world: 12" gong on a rack at 100 yd, sitting on the environment
 *  module's terrain/sky/fog/lighting (`buildEnvironment`). */
export class TestRangeScene implements SteelSceneApi {
  readonly plates: PlateInstance[] = [];
  plateMesh!: THREE.InstancedMesh;
  plateSurface!: PlateSurface;
  chainMesh!: THREE.InstancedMesh;
  readonly chainRest: THREE.Matrix4[] = [];
  private readonly scene: THREE.Scene;
  private readonly env: EnvironmentHandle;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly objects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.env = buildEnvironment(scene, TEST_RANGE_ENVIRONMENT);

    this.addRack();
    this.addGong();
    this.addChains();
    this.addSign();
  }

  // --- rack frame (one beam + two posts) -------------------------------------
  private addRack(): void {
    const g = TEST_RANGE_GONG;
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: FRAME_COLOR, metalness: 0.6, roughness: 0.5 }),
    );
    const halfW = g.rackWidthM / 2;
    const z = -g.distanceM;

    const postGeo = this.track(
      new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, g.beamHeightM, 8),
    );
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(g.xOffsetM + sx * halfW, g.beamHeightM / 2, z);
      this.add(post);
    }

    const beamGeo = this.track(
      new THREE.CylinderGeometry(BEAM_RADIUS_M, BEAM_RADIUS_M, g.rackWidthM, 8),
    );
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(g.xOffsetM, g.beamHeightM, z);
    this.add(beam);
  }

  // --- the single gong --------------------------------------------------
  private addGong(): void {
    const g = TEST_RANGE_GONG;
    this.plateSurface = createPlateSurface([g.paintColor]);
    this.disposables.push(this.plateSurface);

    const geo = this.track(createPlateDiscGeometry());
    const mat = this.track(createPlateMaterial(this.plateSurface.texture));
    const mesh = new THREE.InstancedMesh(geo, mat, 1);
    geo.setAttribute(
      'instanceTargetIndex',
      new THREE.InstancedBufferAttribute(new Float32Array([0]), 1),
    );

    const p = new THREE.Vector3(g.xOffsetM, g.plateCenterYM, -g.distanceM);
    const m = new THREE.Matrix4().compose(
      p,
      new THREE.Quaternion(),
      new THREE.Vector3(g.gongDiameterM, g.gongDiameterM, PLATE_THICKNESS_M),
    );
    mesh.setMatrixAt(0, m);
    mesh.instanceMatrix.needsUpdate = true;

    this.plates.push({
      rackId: g.rackId,
      distanceM: g.distanceM,
      distanceYards: g.distanceYards,
      diameterM: g.gongDiameterM,
      position: p.clone(),
      beamHeightM: g.beamHeightM,
      instanceId: 0,
      paintColor: g.paintColor,
    });

    this.plateMesh = mesh;
    this.add(mesh);
  }

  // --- hanging chains (two, for the one plate) -------------------------------
  // Copied from RangeScene.addChains() — it iterates `this.plates` generically,
  // so with one plate it writes chain instances 0 and 1 and fills
  // chainRest[0..1]. Do not skip: the reaction loop indexes
  // chainRest[id*2 + ci] unconditionally on a hit.
  private addChains(): void {
    const geo = this.track(new THREE.CylinderGeometry(1, 1, 1, 6));
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: CHAIN_COLOR, metalness: 0.7, roughness: 0.5 }),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, this.plates.length * 2);

    const attach = { x: 0, y: 0, z: 0 };
    const fixed = { x: 0, y: 0, z: 0 };
    const rm = new THREE.Matrix4();
    for (const plate of this.plates) {
      const { ax, ay, az } = chainAnchorLocalOffset(plate.diameterM, PLATE_THICKNESS_M);
      const c = plate.position;
      const sides = [-1, 1];
      for (let j = 0; j < sides.length; j++) {
        const sx = sides[j];
        attach.x = c.x + sx * ax;
        attach.y = c.y + ay;
        attach.z = c.z + az;
        fixed.x = attach.x + sx * ax * CHAIN_SPLAY_FRACTION;
        fixed.y = plate.beamHeightM;
        fixed.z = attach.z;
        const idx = plate.instanceId * 2 + j;
        setChainInstance(mesh, idx, attach, fixed);
        mesh.getMatrixAt(idx, rm);
        this.chainRest[idx] = rm.clone();
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.chainMesh = mesh;
    this.add(mesh);
  }

  // --- one range sign -----------------------------------------------------
  private addSign(): void {
    const g = TEST_RANGE_GONG;
    const group = new THREE.Group();
    const postH = 0.9;
    const boardW = 0.6;
    const boardH = 0.3;

    const postMat = this.track(new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }));
    const post = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 8)),
      postMat,
    );
    post.position.y = postH / 2;
    group.add(post);

    const tex = this.track(makeSignTexture(`${g.distanceYards}`));
    const boardMat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const board = new THREE.Mesh(this.track(new THREE.PlaneGeometry(boardW, boardH)), boardMat);
    board.position.y = postH + boardH / 2;
    group.add(board);

    group.position.set(g.xOffsetM + g.rackWidthM / 2 + 0.5, 0, -g.distanceM);
    this.add(group);
  }

  /** Delegates to the environment handle (Stage 4 adds cloud drift there;
   *  a no-op until then). */
  update(dt: number, timeS: number, windVec: { x: number; y: number; z: number }): void {
    this.env.update(dt, timeS, windVec);
  }

  // --- bookkeeping ----------------------------------------------------------
  private add(obj: THREE.Object3D): void {
    this.scene.add(obj);
    this.objects.push(obj);
  }
  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  dispose(): void {
    this.env.dispose();
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.objects.length = 0;
    this.disposables.length = 0;
    this.plates.length = 0;
    this.scene.background = null;
    this.scene.fog = null;
  }
}
