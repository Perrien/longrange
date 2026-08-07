// Test Range scene builder. Originally Stage 1-2 of
// Design/archive/test-range-environment-plan.md (one 12" gong on a rack, on the shared
// environment module); rebuilt at tasks T9a/T9b onto the target system.
//
// The range's targets now come from `placements.data.json` — which is what makes this
// the "permanent proving ground for new target types" `ranges.ts` charters it as: a new
// target here is a data entry plus, at most, a furniture case below.
//
// THREE THINGS THIS SCENE HAS TO GET RIGHT, all of them invariants other code depends on:
//
//  1. ONE GLOBAL instanceId SPACE across several plate meshes. A shape needs its own
//     geometry and therefore its own InstancedMesh, but `instanceId` is simultaneously
//     the paint-atlas layer index, the `chainRest[id*2+ci]` key, the reaction-map key and
//     the store's `currentTarget.plateInstanceId`. Per-mesh index spaces break all four,
//     so ids stay global and `meshFor()` says which mesh holds which row.
//  2. A CHAIN SLOT PAIR FOR EVERY PLATE, even ones that do not hang. The reaction loop
//     indexes `chainRest[id*2+ci]` unconditionally; a beamless mount gets a collapsed
//     zero-length pair, exactly as ELR's stake plates do.
//  3. ONE PIECE OF FURNITURE PER GROUP. A `groupId` means one rack/stand carrying
//     several targets, so the group is built once rather than per plate.

import * as THREE from 'three';
import { TEST_RANGE_GONG, TEST_RANGE_ENVIRONMENT } from './test-range-config';
import { getTargetPlacements } from './targets/placements';
import { buildTestRangePlates } from './test-range-targets';
import { setChainInstance, PLATE_THICKNESS_M, makeSignTexture, type PlateInstance } from './RangeScene';
import { chainAnchorFor, CHAIN_SPLAY_FRACTION } from '../engine-bridge/steel-target';
import { createPlateDiscGeometry } from './plate-geometry';
import { createPlateOutlineGeometry } from './plate-outline-geometry';
import { createPlateSurface, createPlateMaterial, type PlateSurface } from './plate-surface';
import type { SteelSceneApi } from './steel-scene-api';
import { buildEnvironment, type EnvironmentHandle } from './environment';
import { planFace } from './targets/face-plan';
import { browserFaceDeps, rasterizeFace } from './targets/face-raster';
import { holeRings, outlinePolygon } from './targets/target-geometry';
import type { ResolvedPlacement } from './targets/placements';
import { DUELING_TREE_POST_HEIGHT_M, DUELING_TREE_POST_RADIUS_M } from './targets/dueling-tree';
import {
  STAR_ARM_RADIUS_M,
  STAR_HUB_BOSS_LENGTH_M,
  STAR_HUB_BOSS_RADIUS_M,
  STAR_HUB_BOSS_Z_OFFSET_M,
  STAR_POST_RADIUS_M,
  STAR_POST_Z_OFFSET_M,
  starArmMeshLengthM,
  starArmMeshPose,
  starArmOf,
  starCarrierRotationZ,
  starHubFrom,
} from './targets/popper-star';
import type { StarArmSpec } from './targets/mount-type';

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
  /** Which mesh row holds each global instanceId (SteelSceneApi's `meshFor`). */
  private readonly slots = new Map<number, { mesh: THREE.InstancedMesh; index: number }>();
  private placements: readonly ResolvedPlacement[] = [];
  /** Rotating star carriers (hub boss + arms), one per star group. Spun in `update`
   *  from the scene clock; the plates they carry are posed by
   *  `scope/steel-reactions.ts` from that same clock. */
  private readonly starCarriers: { group: THREE.Group; spec: StarArmSpec }[] = [];
  private disposed = false;
  private readonly scene: THREE.Scene;
  private readonly env: EnvironmentHandle;

  /** Whether this scene's environment configured a shadow map — ScopeView reads
   *  it to enable `renderer.shadowMap` (a renderer-level flag, Stage 3). */
  get usesShadows(): boolean {
    return this.env.usesShadows;
  }
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly objects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.env = buildEnvironment(scene, TEST_RANGE_ENVIRONMENT);

    this.addTargets();
    this.addFurniture();
    this.addChains();
    this.addSign();
  }

  // --- targets: one mesh per SHAPE, one global instanceId space --------------
  private addTargets(): void {
    this.placements = getTargetPlacements('test-range');
    this.plates.push(...buildTestRangePlates(this.placements));

    this.plateSurface = createPlateSurface(this.plates.map((p) => p.paintColor));
    this.disposables.push(this.plateSurface);
    const material = this.track(createPlateMaterial(this.plateSurface.texture));

    // Group plates by target type: same type ⇒ same geometry ⇒ one InstancedMesh.
    const byType = new Map<string, PlateInstance[]>();
    for (const plate of this.plates) {
      const key = plate.targetTypeId ?? 'disc';
      const list = byType.get(key);
      if (list) list.push(plate);
      else byType.set(key, [plate]);
    }

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    for (const [typeKey, group] of byType) {
      const placement = this.placements.find((pl) => pl.type.id === typeKey);
      const type = placement?.type;
      // Holes (`TargetType.holeZoneIds`) are punched through the MESH — a hostage
      // silhouette's window. Derived per TYPE, since geometry is shared by every
      // plate of that type.
      const holes = type ? holeRings(type.zones, type.holeZoneIds) : [];
      // A round plate keeps the shipped disc generator untouched; anything else gets
      // its outline triangulated. Positions are in the width-normalised frame either
      // way, so the instance scale is uniform in x/y.
      //
      // A holed DISC also takes the outline generator — the disc generator cannot
      // express a hole, and silently dropping one would be a window that scores as a
      // hole but renders solid. No shipped disc has holes, so nothing moves today.
      const geo = this.track(
        type && (type.shape.kind !== 'disc' || holes.length > 0)
          ? createPlateOutlineGeometry(outlinePolygon(type.shape, type.aspect), type.aspect, holes)
          : createPlateDiscGeometry(),
      );
      const mesh = new THREE.InstancedMesh(geo, material, group.length);
      // The GLOBAL instanceId per row, so the shader samples the right atlas layer
      // even though this mesh's own rows are 0..group.length-1.
      geo.setAttribute(
        'instanceTargetIndex',
        new THREE.InstancedBufferAttribute(Float32Array.from(group.map((pl) => pl.instanceId)), 1),
      );
      group.forEach((plate, row) => {
        this.slots.set(plate.instanceId, { mesh, index: row });
        m.compose(
          plate.position,
          q,
          new THREE.Vector3(plate.diameterM, plate.diameterM, PLATE_THICKNESS_M),
        );
        mesh.setMatrixAt(row, m);
      });
      mesh.instanceMatrix.needsUpdate = true;
      // `plateMesh` is the SteelSceneApi fallback for scenes with one shape; with
      // several it is only a default and `meshFor` is what callers must use.
      if (!this.plateMesh) this.plateMesh = mesh;
      this.add(mesh);
    }

    this.rasterizeFaces();
  }

  /**
   * Draw each target's authored face into its atlas layer.
   *
   * Fire-and-forget: art is fetched, so this cannot block the constructor. Until it
   * lands a plate shows its solid paint colour (the atlas is already filled with it),
   * which is why a failed or slow fetch degrades to "plain steel" rather than to a
   * hole. Only types whose face needs more than that flat fill are rasterised at all.
   */
  private rasterizeFaces(): void {
    const deps = browserFaceDeps();
    const done = new Set<string>();
    for (const placement of this.placements) {
      // One raster per TYPE+palette, reused across every plate sharing it.
      const key = `${placement.type.id}|${JSON.stringify(placement.palette)}`;
      const plan = planFace(placement.type, { palette: placement.palette });
      const needsArt = plan.ops.some((op) => op.kind !== 'fill');
      if (!needsArt) continue;
      const layers = this.plates
        .filter((pl) => pl.targetTypeId === placement.type.id)
        .map((pl) => pl.instanceId);
      if (done.has(key)) continue;
      done.add(key);
      void rasterizeFace(plan, deps)
        .then((rgba) => {
          // The scene may have been disposed while the fetch was in flight.
          if (this.disposed) return;
          for (const layer of layers) this.plateSurface.setBaseLayer(layer, rgba);
        })
        .catch((err) => {
          // A face is cosmetic; never let it take the range down.
          console.warn(`TestRangeScene: face raster failed for '${placement.type.id}'`, err);
        });
    }
  }

  // --- furniture: one build per GROUP, shaped by the mount -------------------
  private addFurniture(): void {
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: FRAME_COLOR, metalness: 0.6, roughness: 0.5 }),
    );
    const built = new Set<string>();
    for (let i = 0; i < this.placements.length; i++) {
      const placement = this.placements[i];
      const plate = this.plates[i];
      // A group is ONE piece of furniture carrying several targets, so build it once.
      if (placement.groupId) {
        if (built.has(placement.groupId)) continue;
        built.add(placement.groupId);
      }
      const members = placement.groupId
        ? this.plates.filter((_, j) => this.placements[j].groupId === placement.groupId)
        : [plate];
      switch (placement.mount.furniture) {
        case 'beam-rack':
        case 'panel':
          this.addBeamRack(members, placement, mat);
          break;
        case 'stake':
          for (const member of members) this.addStake(member, mat);
          break;
        case 'hinge-stem':
          for (const member of members) this.addHingeStem(member, mat);
          break;
        case 'tree-post':
          this.addTreePost(members, placement, mat);
          break;
        case 'star-hub':
          this.addStarHub(members, placement, mat);
          break;
        case 'pivot-post':
          // Deliberately draws nothing: the hostage clamps are hidden behind the
          // silhouette. Written as an explicit no-op so the default arm below can
          // exist — that is what makes it one.
          break;
        case 'none':
          break;
        default: {
          const unhandled: never = placement.mount.furniture;
          throw new Error(`TestRangeScene: no furniture case for '${unhandled}'`);
        }
      }
    }
  }

  /** Two posts and a beam, wide enough to span every plate on it. */
  private addBeamRack(
    members: readonly PlateInstance[],
    placement: ResolvedPlacement,
    mat: THREE.Material,
  ): void {
    const beamY = placement.beamHeightM ?? members[0].beamHeightM;
    const z = -placement.distanceM;
    // Frame width from the authored Test Range rack, widened if a group needs it.
    const span = Math.max(...members.map((p) => p.position.x)) - Math.min(...members.map((p) => p.position.x));
    const width = Math.max(TEST_RANGE_GONG.rackWidthM, span + members[0].diameterM * 1.5);
    const centreX = (Math.max(...members.map((p) => p.position.x)) + Math.min(...members.map((p) => p.position.x))) / 2;

    const postGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, beamY, 8));
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, mat);
      post.position.set(centreX + sx * (width / 2), beamY / 2, z);
      this.add(post);
    }
    const beamGeo = this.track(new THREE.CylinderGeometry(BEAM_RADIUS_M, BEAM_RADIUS_M, width, 8));
    const beam = new THREE.Mesh(beamGeo, mat);
    beam.rotation.z = Math.PI / 2;
    beam.position.set(centreX, beamY, z);
    this.add(beam);
  }

  /** A single post from the ground to the plate's lower edge — a bolted target. */
  private addStake(plate: PlateInstance, mat: THREE.Material): void {
    const halfHeight = (plate.heightM ?? plate.diameterM) / 2;
    const postTop = Math.max(0.05, plate.position.y - halfHeight);
    const geo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postTop, 8));
    const post = new THREE.Mesh(geo, mat);
    post.position.set(plate.position.x, postTop / 2, plate.position.z);
    this.add(post);
  }

  /** A stem from the hinge at the ground up to the plate — a knockdown target. */
  private addHingeStem(plate: PlateInstance, mat: THREE.Material): void {
    const pivotY = plate.pivotYM ?? 0;
    const halfHeight = (plate.heightM ?? plate.diameterM) / 2;
    const length = Math.max(0.05, plate.position.y - halfHeight - pivotY);
    if (length <= 0.05) return; // the plate reaches the hinge; nothing to draw
    const geo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, length, 8));
    const stem = new THREE.Mesh(geo, mat);
    stem.position.set(plate.position.x, pivotY + length / 2, plate.position.z);
    this.add(stem);
  }

  /**
   * The dueling tree's centre post — one solid cylinder, ground to
   * `DUELING_TREE_POST_HEIGHT_M`, built once for the whole group.
   *
   * Its x is RECOVERED from the mount's own stops rather than a second
   * hard-coded placement constant, the same way `poseFlip` recovers the swing
   * pivot: every paddle in the group rests at the SAME `xOffsetM` (all five
   * start on the tree's left side), which is `post − arm`; the mount's 'right'
   * stop is the full swing (`2 × arm`) away, so `paddle.x + swing / 2` lands
   * back on the post centreline regardless of which member happens to be
   * `members[0]`.
   *
   * Deliberately does NOT draw the arms — at the plan's 2 cm rim-to-post
   * clearance they are a few pixels at 80 yd (deferred, see `PROGRESS.md`).
   */
  private addTreePost(
    members: readonly PlateInstance[],
    placement: ResolvedPlacement,
    mat: THREE.Material,
  ): void {
    const swingM = placement.mount.flip!.positions[1].xOffsetM;
    const postX = members[0].position.x + swingM / 2;
    const geo = this.track(
      new THREE.CylinderGeometry(
        DUELING_TREE_POST_RADIUS_M,
        DUELING_TREE_POST_RADIUS_M,
        DUELING_TREE_POST_HEIGHT_M,
        10,
      ),
    );
    const post = new THREE.Mesh(geo, mat);
    post.position.set(postX, DUELING_TREE_POST_HEIGHT_M / 2, -placement.distanceM);
    this.add(post);
  }

  /**
   * The popper star: a static post, plus a rotating CARRIER carrying the hub boss and
   * five arms (`Design/Plans/popper-star.md` §3.5).
   *
   * THE HUB IS RECOVERED, NOT AUTHORED. Five evenly-spaced arm vectors sum to zero,
   * so the centroid of the group's plate positions IS the hub (`starHubFrom`) — the
   * same "derive it from the data you already have" move `addTreePost` makes for the
   * dueling tree's post x. Nothing here re-states a coordinate the placements own.
   *
   * WHAT THIS DELIBERATELY DOES NOT DRAW: the plates. They live in the shared
   * `InstancedMesh` so they keep their paint-atlas layer (layer == `instanceId`), and
   * `scope/steel-reactions.ts` is their single matrix writer. Parenting them here
   * would give one transform two owners, which is the one thing a rotating target
   * cannot survive.
   */
  private addStarHub(
    members: readonly PlateInstance[],
    placement: ResolvedPlacement,
    mat: THREE.Material,
  ): void {
    const hub = starHubFrom(members.map((p) => ({ x: p.position.x, y: p.position.y })));
    const z = -placement.distanceM;

    // Ground to the hub — static, so it is NOT a child of the carrier. Pushed
    // DOWNRANGE by `STAR_POST_Z_OFFSET_M`: at the plate plane its 3.8 cm radius stood
    // proud of the plates and drew in front of the whole star, centre plate included
    // (owner, on device). See the depth stack in `popper-star.ts`.
    const postGeo = this.track(
      new THREE.CylinderGeometry(STAR_POST_RADIUS_M, STAR_POST_RADIUS_M, hub.y, 10),
    );
    const post = new THREE.Mesh(postGeo, mat);
    post.position.set(hub.x, hub.y / 2, z + STAR_POST_Z_OFFSET_M);
    this.add(post);

    const carrier = new THREE.Group();
    carrier.position.set(hub.x, hub.y, z);

    // The boss sits DOWNRANGE of the hub plane so it does not z-fight the coplanar
    // 12" hub plate (see STAR_HUB_BOSS_Z_OFFSET_M).
    const bossGeo = this.track(
      new THREE.CylinderGeometry(
        STAR_HUB_BOSS_RADIUS_M,
        STAR_HUB_BOSS_RADIUS_M,
        STAR_HUB_BOSS_LENGTH_M,
        12,
      ),
    );
    const boss = new THREE.Mesh(bossGeo, mat);
    boss.rotation.x = Math.PI / 2; // a cylinder runs along +Y; the boss runs along Z
    boss.position.set(0, 0, STAR_HUB_BOSS_Z_OFFSET_M);
    carrier.add(boss);

    // One arm per member, drawn out to the plate's INNER rim — where the fold hinge
    // is — so an arm never pokes through a plate face. `starArmMeshPose` owns the
    // placement (and its sign convention) because it is testable there and this is not.
    const armLength = starArmMeshLengthM(members[0].diameterM);
    const armGeo = this.track(
      new THREE.CylinderGeometry(STAR_ARM_RADIUS_M, STAR_ARM_RADIUS_M, armLength, 8),
    );
    for (const member of members) {
      const { restAngleRad } = starArmOf(hub, { x: member.position.x, y: member.position.y });
      const pose = starArmMeshPose(restAngleRad, members[0].diameterM);
      const arm = new THREE.Mesh(armGeo, mat);
      arm.rotation.z = pose.rotationZ;
      arm.position.set(pose.x, pose.y, pose.z);
      carrier.add(arm);
    }

    // Held so `update` can spin it. Its rotation is a pure function of the scene
    // clock, exactly as the plate poses are, so the two cannot drift apart.
    this.starCarriers.push({ group: carrier, spec: placement.mount.star! });
    this.add(carrier);
  }

  // --- hanging chains (two slots per plate, ALWAYS) --------------------------  // The reaction loop indexes `chainRest[id*2+ci]` unconditionally, so every plate
  // gets a pair. A plate that does not hang gets a COLLAPSED (zero-length) pair —
  // invisible, and safe to read — which is what ELR's stake plates already do.
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
      const hangs = plate.swings !== false;
      const { ax, ay, az } = chainAnchorFor(
        plate.diameterM,
        plate.heightM ?? plate.diameterM,
        PLATE_THICKNESS_M,
      );
      const c = plate.position;
      for (let j = 0; j < 2; j++) {
        const sx = j === 0 ? -1 : 1;
        if (hangs) {
          attach.x = c.x + sx * ax;
          attach.y = c.y + ay;
          attach.z = c.z + az;
          fixed.x = attach.x + sx * ax * CHAIN_SPLAY_FRACTION;
          fixed.y = plate.beamHeightM;
          fixed.z = attach.z;
        } else {
          // Collapsed: both ends at the plate centre.
          attach.x = fixed.x = c.x;
          attach.y = fixed.y = c.y;
          attach.z = fixed.z = c.z;
        }
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

  /** Where instance `id`'s matrix lives — this scene draws one mesh per target SHAPE
   *  while keeping a single global id space. */
  meshFor(instanceId: number): { mesh: THREE.InstancedMesh; index: number } {
    const slot = this.slots.get(instanceId);
    if (!slot) throw new Error(`TestRangeScene: no mesh slot for instanceId ${instanceId}`);
    return slot;
  }

  /** Delegates to the environment handle (Stage 4 adds cloud drift there;
   *  a no-op until then), and spins any popper-star carrier.
   *
   *  The star's rotation is a pure function of `timeS` — NOT an accumulation of `dt` —
   *  because `scope/steel-reactions.ts` poses the plates from the same value on the
   *  same frame. Two clocks integrating separately would drift the plates off their
   *  arms over a session; one shared function of absolute time cannot. */
  update(
    dt: number,
    timeS: number,
    windVec: { x: number; y: number; z: number },
    sampleWindAt?: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
  ): void {
    for (const rotor of this.starCarriers) {
      rotor.group.rotation.z = starCarrierRotationZ(timeS, rotor.spec);
    }
    this.env.update(dt, timeS, windVec, sampleWindAt);
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
    this.disposed = true;
    this.slots.clear();
    this.starCarriers.length = 0;
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
