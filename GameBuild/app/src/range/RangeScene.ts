// Range A scene builder (task 1.2; build-plan §5 Increment 1).
//
// Ports the *look* of BallisticsToolkit's steel-sim (`Landscape.js`, `Berm.js`,
// `TargetRack.js`, `RangeSign.js`) into TypeScript, but re-expressed with
// InstancedMesh throughout so the whole range is a handful of draw calls
// (target: 60 fps on iPad — see RangeView's frame-time HUD). Framework-agnostic:
// it takes a THREE.Scene and fills it; RangeView owns the renderer/camera/loop.
//
// World axes match the aim spike and steel-sim: +X right, +Y up, downrange is
// −Z, shooter at the origin. All geometry is built from the SI config in
// ./range-a-config (no unit math here).

import * as THREE from 'three';
import { RANGE_A_RACKS, RANGE_A_GROUND, type RackSpec } from './range-a-config';
import { chainAnchorLocalOffset, CHAIN_SPLAY_FRACTION } from '../engine-bridge/steel-target';
import { createPlateDiscGeometry } from './plate-geometry';
import { createPlateSurface, createPlateMaterial, type PlateSurface } from './plate-surface';

const SKY_COLOR = 0x9fc4e8;
const PLATE_COLOR = 0xf0f0ea; // default plate PAINT (bright steel white); racks may override via config paintColor
const FRAME_COLOR = 0xaaaaaa; // galvanised posts/beams
const BERM_COLOR = 0xd8b483; // sand
const GRASS_COLOR = 0x7d9450;
const DIRT_COLOR = 0xb89d6f;
const CHAIN_COLOR = 0x4a4a4a; // dark galvanised chain
const CHAIN_RADIUS_M = 0.006; // ~1/2" visual link rod

/** Plate thickness (1/2"). Exported so the reactive-steel physics (task 1.5a)
 * sizes its C++ target from the same source as the rendered plate. */
export const PLATE_THICKNESS_M = 0.0127;
const POST_RADIUS_M = 0.0254; // 2" diameter posts
const BEAM_RADIUS_M = 0.0254; // 2" diameter beam

/** One placed plate, exposed for the shot loop (tasks 1.4/1.5) to hit-test. */
export interface PlateInstance {
  rackId: string;
  distanceM: number;
  distanceYards: number;
  diameterM: number;
  /** World-space centre of the plate face. */
  position: THREE.Vector3;
  /** World Y of the rack beam this plate hangs from (chain-anchor height for the
   * reactive-steel physics, task 1.5a). */
  beamHeightM: number;
  /** Index of this plate in the shared plate InstancedMesh. */
  instanceId: number;
  /** Resolved plate paint color, 0xRRGGBB (rack override or default steel;
   * target-surface TS-C feeds it to the C++ paint buffer so splats chip through
   * the same paint the rendered plate shows). */
  paintColor: number;
}

/**
 * Builds the Range A world into the given scene. Call dispose() to tear down.
 */
export class RangeScene {
  readonly plates: PlateInstance[] = [];
  /** The shared InstancedMesh holding every plate. The reactive-steel loop
   * (task 1.5a) writes per-plate matrices here via `setMatrixAt(instanceId,…)`. */
  plateMesh!: THREE.InstancedMesh;
  /** Per-plate paint/mark texture atlas (target-surface TS-B): layer index ==
   * plate `instanceId`. TS-C copies a struck plate's engine paint buffer into
   * its layer via `writeLayer` so hit marks appear on the plate surface. */
  plateSurface!: PlateSurface;
  /** The shared InstancedMesh holding every plate's two hanging chains (task
   * 1.5c). Chain instances for plate `instanceId` are `instanceId*2` and
   * `instanceId*2+1`; the reactive-steel loop rewrites a struck plate's pair to
   * track its swing and restores `chainRest` on settle. */
  chainMesh!: THREE.InstancedMesh;
  /** Per-chain-instance rest transform, for snapping back once a plate settles. */
  readonly chainRest: THREE.Matrix4[] = [];
  private readonly scene: THREE.Scene;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly objects: THREE.Object3D[] = [];

  constructor(scene: THREE.Scene) {
    this.scene = scene;

    scene.background = new THREE.Color(SKY_COLOR);
    // Keep the 500-yd rack (457 m) clearly visible; far berms haze for depth.
    scene.fog = new THREE.Fog(SKY_COLOR, 250, 1600);

    this.addLights();
    this.addGround();
    this.addBerms();
    this.addFrames();
    this.addPlates();
    this.addChains();
    this.addSigns();
  }

  // --- lighting -------------------------------------------------------------
  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xffffff, GRASS_COLOR, 1.0);
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
    sun.position.set(-200, 400, 100);
    this.add(hemi);
    this.add(sun);
  }

  // --- ground ---------------------------------------------------------------
  private addGround(): void {
    const g = RANGE_A_GROUND;
    const lane = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(g.laneWidthM, g.laneLengthM)),
      this.track(new THREE.MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1 })),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = -g.laneLengthM / 2;
    this.add(lane);

    const backdrop = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(g.backdropWidthM, g.backdropLengthM)),
      this.track(new THREE.MeshStandardMaterial({ color: DIRT_COLOR, roughness: 1 })),
    );
    backdrop.rotation.x = -Math.PI / 2;
    backdrop.position.set(0, -0.1, -g.backdropLengthM / 2);
    this.add(backdrop);
  }

  // --- berms (one behind each rack) -----------------------------------------
  // A unit berm (flat-topped mound, X∈[-1,1], Z∈[-0.5,0.5], Y∈[0,1]) scaled per
  // instance. Profile logic ported from steel-sim Berm.js, normalised.
  private addBerms(): void {
    const geo = this.track(makeUnitBermGeometry());
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: BERM_COLOR, roughness: 1, side: THREE.DoubleSide }),
    );
    const mesh = new THREE.InstancedMesh(geo, mat, RANGE_A_RACKS.length);
    mesh.receiveShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    RANGE_A_RACKS.forEach((rack, i) => {
      const b = rack.berm;
      // Berm centre sits `behindM` downrange of the rack line (steel-sim: 2 yd).
      const z = -rack.distanceM - b.behindM;
      p.set(rack.xOffsetM, 0, z);
      s.set(b.baseHalfWidthM, b.heightM, b.depthM);
      m.compose(p, q, s);
      mesh.setMatrixAt(i, m);
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.add(mesh);
  }

  // --- rack frames (beam + two posts per rack) ------------------------------
  private addFrames(): void {
    const unitCyl = this.track(new THREE.CylinderGeometry(1, 1, 1, 8));
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: FRAME_COLOR, metalness: 0.6, roughness: 0.5 }),
    );

    const posts = new THREE.InstancedMesh(unitCyl, mat, RANGE_A_RACKS.length * 2);
    const beams = new THREE.InstancedMesh(unitCyl, mat, RANGE_A_RACKS.length);
    posts.castShadow = true;
    beams.castShadow = true;

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const rotZ90 = new THREE.Quaternion().setFromEuler(new THREE.Euler(0, 0, Math.PI / 2));

    RANGE_A_RACKS.forEach((rack, i) => {
      const halfW = rack.rackWidthM / 2;
      const z = -rack.distanceM;
      // Posts (vertical unit cylinder → scale radius/height; identity rotation).
      const sides = [-1, 1];
      for (let j = 0; j < sides.length; j++) {
        p.set(rack.xOffsetM + sides[j] * halfW, rack.beamHeightM / 2, z);
        s.set(POST_RADIUS_M, rack.beamHeightM, POST_RADIUS_M);
        m.compose(p, q, s);
        posts.setMatrixAt(i * 2 + j, m);
      }
      // Beam (horizontal: rotate the unit cylinder onto X, length = rack width).
      p.set(rack.xOffsetM, rack.beamHeightM, z);
      s.set(BEAM_RADIUS_M, rack.rackWidthM, BEAM_RADIUS_M);
      m.compose(p, rotZ90, s);
      beams.setMatrixAt(i, m);
    });
    posts.instanceMatrix.needsUpdate = true;
    beams.instanceMatrix.needsUpdate = true;
    this.add(posts);
    this.add(beams);
  }

  // --- plates (all racks share one InstancedMesh) ---------------------------
  private addPlates(): void {
    const total = RANGE_A_RACKS.reduce((n, r) => n + r.plates.length, 0);

    // Per-plate paint colors in instanceId order (must match the placement loop
    // below: racks near→far, plates left→right).
    const paintColors: number[] = [];
    for (const rack of RANGE_A_RACKS) {
      for (let i = 0; i < rack.plates.length; i++) paintColors.push(rack.paintColor ?? PLATE_COLOR);
    }
    this.plateSurface = createPlateSurface(paintColors);
    this.disposables.push(this.plateSurface);

    // Unit disc in the ENGINE frame (face in XY, thickness along Z, shooter side
    // +Z — see plate-geometry.ts): scaling X/Y by diameter → radius = ⌀/2, and
    // instances need NO face-the-shooter rotation (identity == engine frame,
    // which is also what the reactive-steel C++ pose is relative to).
    const geo = this.track(createPlateDiscGeometry());
    const mat = this.track(createPlateMaterial(this.plateSurface.texture));
    const mesh = new THREE.InstancedMesh(geo, mat, total);
    mesh.castShadow = true;

    // Per-instance atlas layer selector for the plate material (layer == id).
    const layerIndex = new Float32Array(total);
    for (let i = 0; i < total; i++) layerIndex[i] = i;
    geo.setAttribute('instanceTargetIndex', new THREE.InstancedBufferAttribute(layerIndex, 1));

    const m = new THREE.Matrix4();
    const s = new THREE.Vector3();
    const p = new THREE.Vector3();
    const identity = new THREE.Quaternion();

    let id = 0;
    for (const rack of RANGE_A_RACKS) {
      const z = -rack.distanceM;
      // Cluster the plates centred in the rack with a gap proportional to the
      // biggest plate, so a rack of tiny (near) plates isn't a sparse strip.
      const maxD = Math.max(...rack.plates.map((pl) => pl.diameterM));
      const gap = maxD * 0.7;
      const span =
        rack.plates.reduce((s2, pl) => s2 + pl.diameterM, 0) + gap * (rack.plates.length - 1);
      let cursor = -span / 2;
      rack.plates.forEach((plate) => {
        const x = rack.xOffsetM + cursor + plate.diameterM / 2;
        cursor += plate.diameterM + gap;
        p.set(x, rack.plateCenterYM, z);
        s.set(plate.diameterM, plate.diameterM, PLATE_THICKNESS_M);
        m.compose(p, identity, s);
        mesh.setMatrixAt(id, m);
        this.plates.push({
          rackId: rack.id,
          distanceM: rack.distanceM,
          distanceYards: rack.distanceYards,
          diameterM: plate.diameterM,
          position: p.clone(),
          beamHeightM: rack.beamHeightM,
          instanceId: id,
          paintColor: rack.paintColor ?? PLATE_COLOR,
        });
        id++;
      });
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.plateMesh = mesh;
    this.add(mesh);
  }

  // --- hanging chains (two per plate, all racks share one InstancedMesh) -----
  // Drawn at rest for every plate so the steel visibly hangs; the reactive-steel
  // loop (task 1.5c) rewrites a struck plate's pair each frame to track its swing
  // and restores the rest transform on settle. Endpoints come from the SAME
  // anchor geometry the reaction uses (chainAnchorLocalOffset), so live and rest
  // chains line up exactly.
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
        // Rest attach = plate centre + local offset (rest orientation = world);
        // the beam end splays a bit OUTWARD (shallow trapezoid, no cross). When a
        // plate swings, the reaction re-projects the attach and the chain tilts
        // from this fixed beam point.
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

  // --- range signs (one per rack, just right of the plates) -----------------
  private addSigns(): void {
    for (const rack of RANGE_A_RACKS) {
      this.add(this.makeSign(rack));
    }
  }

  private makeSign(rack: RackSpec): THREE.Group {
    const group = new THREE.Group();
    const postH = 0.9;
    const boardW = 0.6;
    const boardH = 0.3;

    const postMat = this.track(
      new THREE.MeshStandardMaterial({ color: 0x8b5a2b, roughness: 0.9 }),
    );
    const post = new THREE.Mesh(
      this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 8)),
      postMat,
    );
    post.position.y = postH / 2;
    group.add(post);

    const tex = this.track(makeSignTexture(`${rack.distanceYards}`));
    const boardMat = this.track(new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5 }));
    const board = new THREE.Mesh(this.track(new THREE.PlaneGeometry(boardW, boardH)), boardMat);
    board.position.y = postH + boardH / 2;
    group.add(board);

    // Just right of the plates (steel-sim placement); boards face +Z / shooter.
    group.position.set(rack.xOffsetM + rack.rackWidthM / 2 + 0.5, 0, -rack.distanceM);
    return group;
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
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.objects.length = 0;
    this.disposables.length = 0;
    this.plates.length = 0;
    this.scene.background = null;
    this.scene.fog = null;
  }
}

// --- geometry / texture helpers ---------------------------------------------

// Reused scratch for chain-instance composition (no per-frame allocation).
const CHAIN_UP = new THREE.Vector3(0, 1, 0);
const _cAttach = new THREE.Vector3();
const _cFixed = new THREE.Vector3();
const _cDir = new THREE.Vector3();
const _cPos = new THREE.Vector3();
const _cQuat = new THREE.Quaternion();
const _cScale = new THREE.Vector3();
const _cMat = new THREE.Matrix4();

/** Write chain instance `index` as a thin cylinder spanning `fixed`→`attach`
 * (world metres). Shared by the scene's rest chains and the reactive-steel loop
 * so a swinging plate's chains follow it (task 1.5c). */
export function setChainInstance(
  mesh: THREE.InstancedMesh,
  index: number,
  attach: { x: number; y: number; z: number },
  fixed: { x: number; y: number; z: number },
): void {
  _cAttach.set(attach.x, attach.y, attach.z);
  _cFixed.set(fixed.x, fixed.y, fixed.z);
  _cDir.subVectors(_cAttach, _cFixed);
  const len = _cDir.length() || 1e-6;
  _cDir.divideScalar(len);
  _cQuat.setFromUnitVectors(CHAIN_UP, _cDir);
  _cPos.addVectors(_cAttach, _cFixed).multiplyScalar(0.5);
  _cScale.set(CHAIN_RADIUS_M, len, CHAIN_RADIUS_M);
  _cMat.compose(_cPos, _cQuat, _cScale);
  mesh.setMatrixAt(index, _cMat);
}

/** Flat-topped berm mound as a unit shape (ported from steel-sim Berm.js). */
function makeUnitBermGeometry(): THREE.BufferGeometry {
  const seg = 16;
  const geo = new THREE.PlaneGeometry(2, 1, seg, seg); // X∈[-1,1], Y∈[-0.5,0.5]
  const pos = geo.attributes.position;
  const flatTopHalfW = 0.5; // flat top spans full width after scale
  const flatTopHalfD = 0.35; // 70% of depth is flat
  const slopeW = 1 - flatTopHalfW;
  const slopeD = 0.5 - flatTopHalfD;
  for (let i = 0; i < pos.count; i++) {
    const ax = Math.abs(pos.getX(i));
    const ay = Math.abs(pos.getY(i));
    let h: number;
    if (ax <= flatTopHalfW && ay <= flatTopHalfD) {
      h = 1;
    } else {
      const dx = Math.max(0, ax - flatTopHalfW) / slopeW;
      const dy = Math.max(0, ay - flatTopHalfD) / slopeD;
      h = 1 - Math.min(1, Math.max(dx, dy));
    }
    pos.setZ(i, h); // height in +Z here; rotated to +Y below
  }
  geo.computeVertexNormals();
  geo.rotateX(-Math.PI / 2); // (x,y,z) → (x, z=height, -y=depth): mound stands up
  return geo;
}

/** White board with black distance text, drawn to a canvas texture. Exported so
 * TestRangeScene (Stage 1 of the environment plan) can reuse the same board
 * look for its one sign instead of duplicating the canvas helper. */
export function makeSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 90px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 - 6);
  ctx.font = 'bold 34px Arial';
  ctx.fillText('YARDS', canvas.width / 2, canvas.height - 24);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
