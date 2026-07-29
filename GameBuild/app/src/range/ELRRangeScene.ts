// ELR Range scene — terrain and forest with dynamic firing points.
//
// A fully-featured ELR range: wooded hillside with two firing points (low and high),
// constant-angular 1 MIL gongs from 50 m to 2000 m. The range places itself
// into natural gaps left by the forest, with individual trees culled from sight
// lines as needed (mean 2.6, worst 5 out of 4000).

import * as THREE from 'three';
import { setChainInstance, PLATE_THICKNESS_M, makeSignTexture, type PlateInstance } from './RangeScene';
import {
  chainAnchorLocalOffset,
  chainOutwardOffsetFor,
  CHAIN_SPLAY_FRACTION,
} from '../engine-bridge/steel-target';
import { createPlateDiscGeometry } from './plate-geometry';
import { createPlateSurface, createPlateMaterial, type PlateSurface } from './plate-surface';
import { buildBullseyeLayer } from './bullseye-texture';
import type { SteelSceneApi } from './steel-scene-api';
import type { TreePlacement } from './environment/environment-config';
import { buildTrees } from './environment/trees';
import { buildGrassTuftMesh } from './environment/ground-cover';
import { loadPbrMaterial } from './environment/texture-loader';
import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';
import { generateRangeTreePlacements, MAX_TREES } from './elr-range-trees';
import { generateGrassTuftPlacements, rejectTuftsAtStations } from './elr-range-cover';
import { MIN_PLATE_STANDOFF_M } from '../scope/perf-hud';
import {
  groundY,
  solveLayout,
  type FiringPoint,
  GROUND_HEX,
  GROUND_TEXTURE_TILE_M,
  PANEL_HEX,
  PLATE_HEX,
  GROUND_WIDTH_M,
  GROUND_LENGTH_M,
  FOG_DENSITY,
  SKY_HEX,
  type ElrLayout,
} from './elr-range-config';

const GROUND_SEGMENTS_X_VAR = 8;
const GROUND_SEGMENTS_Z_VAR = 160;
const POST_HEX = 0x6f6a60;
const POST_RADIUS_M = 0.04;
/** Rack beam, 2" like Range A's. */
const BEAM_RADIUS_M = 0.0254;
/** Near-station stake, ~1.2" diameter — thin enough to sit behind a 5 cm plate. */
const STAKE_RADIUS_M = 0.015;
const CHAIN_HEX = 0x4a4a4a;

/**
 * Downrange distance (m) of a terrain-plane vertex, from its LOCAL y.
 *
 * `PlaneGeometry` is built in XY spanning ±length/2, then rotated −90° about X and
 * pushed to `z = −length/2`, which maps local +Y to world −Z. So the vertex at
 * `localY = −length/2` sits at the shooter and `+length/2` at the far end:
 *
 *     downrange = localY + length / 2
 *
 * EXTRACTED AND TESTED BECAUSE IT WAS WRONG ONCE. The first version wrote a
 * normalisation formula assuming [-1, 1], which produced a completely deformed
 * terrain with vertices wildly out of place and a hard cutoff at ~1750m where
 * clipped faces became visible.
 */
function groundLocalYToDownrangeM(localY: number, lengthM: number): number {
  return localY + lengthM / 2;
}

export class ELRRangeScene implements SteelSceneApi {
  readonly plates: PlateInstance[] = [];
  plateMesh!: THREE.InstancedMesh;
  plateSurface!: PlateSurface;
  chainMesh!: THREE.InstancedMesh;
  readonly chainRest: THREE.Matrix4[] = [];

  readonly layout: ElrLayout;
  get eyeHeightM(): number {
    return this.layout.eyeYM;
  }

  groundYAt = (downrangeM: number): number => groundY(downrangeM);
  readonly usesShadows = false;

  private readonly scene: THREE.Scene;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly treeDisposables: Array<{ dispose(): void }> = [];
  private readonly treeObjects: THREE.Object3D[] = [];
  private readonly objects: THREE.Object3D[] = [];
  private readonly prevBackground: THREE.Scene['background'];
  private readonly prevFog: THREE.Scene['fog'];

  private readonly treeField: TreePlacement[];
  /** Trees actually drawn — the full field minus the handful culled off sight
   *  lines. Read by the scene-cost readout in ScopeView; a tree count is the one
   *  number that explains a triangle count on this range. */
  placedTreeCount = 0;

  constructor(scene: THREE.Scene, point: FiringPoint) {
    this.scene = scene;

    // Generate the full tree field once; station offsets are solved against it,
    // so every smaller draw count is a strict subset and sight lines stay clear.
    this.treeField = generateRangeTreePlacements(MAX_TREES, WOODED_ZERO_ENVIRONMENT.trees.palette.length);
    this.layout = solveLayout(point, this.treeField);

    this.prevBackground = scene.background;
    this.prevFog = scene.fog;
    scene.background = new THREE.Color(SKY_HEX);
    scene.fog = new THREE.FogExp2(SKY_HEX, FOG_DENSITY);

    this.addLights();
    this.addGround();
    this.addGroundCover();
    // Trees minus the culled ones that block sight lines
    const cull = new Set(this.layout.cullTreeIndices);
    this.setInitialTrees(this.treeField.filter((_, i) => !cull.has(i)));
    this.addPlates();
    this.addFramesAndPanels();
    this.addChains();
    this.addSigns();
  }

  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xbcd2e8, 0x6b6558, 1.1);
    this.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9c8, 1.25);
    sun.position.set(-318, 97, 223);
    this.add(sun);
  }

  private addGround(): void {
    const geo = this.track(
      new THREE.PlaneGeometry(GROUND_WIDTH_M, GROUND_LENGTH_M, GROUND_SEGMENTS_X_VAR, GROUND_SEGMENTS_Z_VAR),
    );
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const downrangeM = groundLocalYToDownrangeM(pos.getY(i), GROUND_LENGTH_M);
      pos.setZ(i, groundY(downrangeM));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    // The Wooded Zero Range's grass, not a flat colour (owner, 2026-07-29). Same
    // material builder, same texture set, same 8 m tile — see
    // `GROUND_TEXTURE_TILE_M` for why the tile size is not a free parameter.
    // `loadPbrMaterial` is offline-first: it returns immediately as flat
    // `GROUND_HEX` and wires the colour/normal/roughness maps in as they land, so
    // a failed load costs the texture and nothing else.
    const grass = this.track(
      loadPbrMaterial({
        basePath: 'textures/grass/Grass004_1K-JPG',
        repeat: [GROUND_WIDTH_M / GROUND_TEXTURE_TILE_M, GROUND_LENGTH_M / GROUND_TEXTURE_TILE_M],
        fallbackColor: GROUND_HEX,
      }),
    );
    const mesh = new THREE.Mesh(geo, grass.material);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -GROUND_LENGTH_M / 2;
    this.add(mesh);
  }

  /** Grass tufts over the near ground — the shared mesh from the environment
   *  module, placed by this range's own pure generator. One InstancedMesh.
   *
   *  Tufts standing at the foot of a target are dropped against the ACTIVE line's
   *  layout: a 0.29 m tuft can hide the 5 cm gong on a 12" stake at 50 m, and the
   *  sight-clearance solver only knows about trees. Same per-line pattern as
   *  `cullTreeIndices` — the field itself is line-independent. */
  private addGroundCover(): void {
    const tufts = rejectTuftsAtStations(generateGrassTuftPlacements(), this.layout.stations);
    const mesh = buildGrassTuftMesh(this.scene, tufts, (d) => this.track(d));
    // `buildGrassTuftMesh` adds to the scene itself, so only removal is ours.
    this.objects.push(mesh);
  }

  private addPlates(): void {
    const count = this.layout.stations.length;
    this.plateSurface = createPlateSurface(new Array(count).fill(PLATE_HEX));
    this.disposables.push(this.plateSurface);

    const face = buildBullseyeLayer();
    for (let i = 0; i < count; i++) this.plateSurface.writeLayer(i, face);

    const geo = this.track(createPlateDiscGeometry());
    const mat = this.track(createPlateMaterial(this.plateSurface.texture));
    const mesh = new THREE.InstancedMesh(geo, mat, count);
    geo.setAttribute(
      'instanceTargetIndex',
      new THREE.InstancedBufferAttribute(Float32Array.from(this.layout.stations.map((_, i) => i)), 1),
    );

    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    this.layout.stations.forEach((st, i) => {
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-st.x, -st.z));
      const p = new THREE.Vector3(st.x, st.y, st.z);
      m.compose(p, q, new THREE.Vector3(st.gongDiameterM, st.gongDiameterM, PLATE_THICKNESS_M));
      mesh.setMatrixAt(i, m);
      this.plates.push({
        rackId: `elr-${st.nominalDistance}`,
        distanceM: st.losRangeM,
        distanceYards: Math.round(st.losRangeM * 1.0936133),
        diameterM: st.gongDiameterM,
        position: p.clone(),
        // Where the chains anchor: a rack's beam, or a panel frame's top edge.
        beamHeightM: st.beamY,
        instanceId: i,
        paintColor: PLATE_HEX,
        // A stake plate is BOLTED to its post — it rings, it does not swing.
        // This is also what keeps the 50–150 m plates out of a chain model whose
        // geometry degenerates at that size (see `chainOutwardOffsetFor`).
        swings: st.mount !== 'stake',
        // Constant-angular gongs run from 5 cm to 2 m, so the shared absolute
        // chain offset cannot serve all of them. Scale it per plate.
        chainOutwardOffsetM: chainOutwardOffsetFor(st.gongDiameterM),
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.plateMesh = mesh;
    this.add(mesh);
  }

  /**
   * Target furniture, per mount (owner, 2026-07-29).
   *
   * The LOW line gets Range A's hanging rack — beam, two legs, plate on chains,
   * nothing behind it. The HIGH line keeps the frame-and-dark-panel build,
   * because the panel's contrast advantage is measured and real once fog bites
   * (plan §4.2 / D4). `station.mount` decides; both share the post material.
   */
  private addFramesAndPanels(): void {
    const panelMat = this.track(
      new THREE.MeshStandardMaterial({ color: PANEL_HEX, roughness: 0.95 }),
    );
    const postMat = this.track(
      new THREE.MeshStandardMaterial({ color: POST_HEX, metalness: 0.4, roughness: 0.7 }),
    );

    for (const st of this.layout.stations) {
      const yaw = Math.atan2(-st.x, -st.z);
      const toShooter = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      const groundAtSt = groundY(st.groundRunM);

      if (st.mount === 'stake') {
        // ONE post, standing BEHIND the plate so the target and its label are
        // what you see. Fixed 12 inches — see the config's note on why this one
        // is physical rather than angular.
        const postH = Math.max(0.05, st.beamY - groundAtSt);
        const postGeo = this.track(
          new THREE.CylinderGeometry(STAKE_RADIUS_M, STAKE_RADIUS_M, postH, 6),
        );
        const post = new THREE.Mesh(postGeo, postMat);
        post
          .position.set(st.x, groundAtSt + postH / 2, st.z)
          .addScaledVector(toShooter, -(STAKE_RADIUS_M + MIN_PLATE_STANDOFF_M));
        this.add(post);
        continue;
      }

      if (st.mount === 'rack') {
        // Legs run ground → beam, and the beam spans the rack width. No panel
        // and no berm: the plate hangs in front of open hillside.
        const legH = Math.max(0.1, st.beamY - groundAtSt);
        const legGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, legH, 6));
        for (const side of [-1, 1]) {
          const leg = new THREE.Mesh(legGeo, postMat);
          leg
            .position.set(st.x, groundAtSt + legH / 2, st.z)
            .addScaledVector(across, (side * st.frameWidthM) / 2);
          this.add(leg);
        }

        const beamGeo = this.track(
          new THREE.CylinderGeometry(BEAM_RADIUS_M, BEAM_RADIUS_M, st.frameWidthM, 6),
        );
        const beam = new THREE.Mesh(beamGeo, postMat);
        beam.position.set(st.x, st.beamY, st.z);
        // Unit cylinder stands on Y; roll it onto the rack's across-axis.
        beam.rotation.set(0, yaw, Math.PI / 2);
        this.add(beam);
        continue;
      }

      const panelGeo = this.track(new THREE.PlaneGeometry(st.frameWidthM, st.frameHeightM));
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(st.x, st.y, st.z).addScaledVector(toShooter, -MIN_PLATE_STANDOFF_M);
      panel.rotation.y = yaw;
      this.add(panel);

      const postH = Math.max(0.1, st.beamY - groundAtSt);
      const postGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 6));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post
          .position.set(st.x, groundAtSt + postH / 2, st.z)
          .addScaledVector(across, (side * st.frameWidthM) / 2)
          .addScaledVector(toShooter, -MIN_PLATE_STANDOFF_M);
        this.add(post);
      }
    }
  }

  private addChains(): void {
    const geo = this.track(new THREE.CylinderGeometry(1, 1, 1, 6));
    const mat = this.track(
      new THREE.MeshStandardMaterial({ color: CHAIN_HEX, metalness: 0.7, roughness: 0.5 }),
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
        const idx = plate.instanceId * 2 + j;
        if (plate.swings === false) {
          // Bolted to a stake — no chains to draw. The instance still has to
          // EXIST: the reaction loop indexes `chainRest[id*2+ci]` unconditionally,
          // so a missing entry is a crash, not an absent chain. Collapse it to a
          // zero-length segment at the plate instead.
          attach.x = c.x;
          attach.y = c.y;
          attach.z = c.z;
          setChainInstance(mesh, idx, attach, attach);
          mesh.getMatrixAt(idx, rm);
          this.chainRest[idx] = rm.clone();
          continue;
        }
        attach.x = c.x + sx * ax;
        attach.y = c.y + ay;
        attach.z = c.z + az;
        fixed.x = attach.x + sx * ax * CHAIN_SPLAY_FRACTION;
        fixed.y = plate.beamHeightM;
        fixed.z = attach.z;
        setChainInstance(mesh, idx, attach, fixed);
        mesh.getMatrixAt(idx, rm);
        this.chainRest[idx] = rm.clone();
      }
    }
    mesh.instanceMatrix.needsUpdate = true;
    this.chainMesh = mesh;
    this.add(mesh);
  }

  private addSigns(): void {
    for (const st of this.layout.stations) {
      const tex = this.track(makeSignTexture(st.markerText, 'M'));
      const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      // Sized off the GONG, so the sign is constant-angular like everything else
      // on the range and reads the same at 50 m and 2000 m.
      const h = st.gongDiameterM * 0.44;
      const geo = this.track(new THREE.PlaneGeometry(h * 2.2, h));
      const sign = new THREE.Mesh(geo, mat);
      const yaw = Math.atan2(-st.x, -st.z);
      const toShooter = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      // On a stake the label is mounted on the FRONT of the post, so it steps
      // toward the shooter. On a rack or panel it sits behind the plate line.
      const signStandoff =
        st.mount === 'stake' ? MIN_PLATE_STANDOFF_M * 0.5 : -MIN_PLATE_STANDOFF_M * 0.5;
      sign.position
        .set(st.x, st.beamY + h * 0.7, st.z)
        .addScaledVector(toShooter, signStandoff);
      sign.rotation.y = yaw;
      this.add(sign);
    }
  }

  private setInitialTrees(placements: TreePlacement[]): void {
    const handle = buildTrees(this.scene, WOODED_ZERO_ENVIRONMENT, placements, (d) => {
      this.treeDisposables.push(d);
      return d;
    });
    for (const m of handle.meshes) this.treeObjects.push(m);
    this.placedTreeCount = placements.length;
  }

  private add(obj: THREE.Object3D): void {
    this.objects.push(obj);
    this.scene.add(obj);
  }

  private track<T extends { dispose(): void }>(d: T): T {
    this.disposables.push(d);
    return d;
  }

  dispose(): void {
    this.scene.background = this.prevBackground;
    this.scene.fog = this.prevFog;
    for (const o of this.treeObjects) this.scene.remove(o);
    for (const d of this.treeDisposables) d.dispose();
    this.treeObjects.length = 0;
    this.treeDisposables.length = 0;
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.objects.length = 0;
    this.disposables.length = 0;
  }
}
