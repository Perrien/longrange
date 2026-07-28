// ELR Probe scene — step P2 of `Design/elr-probe-plan.md`.
//
// A THROWAWAY 3 km range built to be looked at. Six 1 MIL gongs at 500 m steps,
// bullseye faces, white plates standing proud of dark backer panels.
//
// DELIBERATELY MINIMAL. No trees, scrub, rocks, grass, ridges or clouds — the
// probe is answering whether an 18-second shot is tense or tedious, whether 3 km
// reads as distance, and whether frame time holds. Every piece of dressing added
// here is a confound in those answers and a cost in the frame-time number. It also
// means a bad result points at the range rather than at the vegetation.
//
// It implements `SteelSceneApi` structurally — same as `RangeScene` and
// `TestRangeScene` — so ScopeView's fire path, steel reaction, hit marks and paint
// chipping all work with no changes to ScopeView beyond one scene-branch case.

import * as THREE from 'three';
import { setChainInstance, PLATE_THICKNESS_M, makeSignTexture, type PlateInstance } from './RangeScene';
import { chainAnchorLocalOffset, CHAIN_SPLAY_FRACTION } from '../engine-bridge/steel-target';
import { createPlateDiscGeometry } from './plate-geometry';
import { createPlateSurface, createPlateMaterial, type PlateSurface } from './plate-surface';
import { buildBullseyeLayer } from './bullseye-texture';
import type { SteelSceneApi } from './steel-scene-api';
import { buildTrees } from './environment/trees';
import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';
import { generateProbeTreePlacements } from './elr-probe-trees';
import { MIN_PLATE_STANDOFF_M } from '../scope/perf-hud';
import {
  snapshotElrProbe,
  groundYFor,
  groundLocalYToDownrangeM,
  GROUND_HEX,
  PANEL_HEX,
  PLATE_HEX,
  GROUND_WIDTH_M,
  GROUND_LENGTH_M,
  type ElrProbeLayout,
  type ProbeVariant,
} from './elr-probe-config';

const POST_HEX = 0x6f6a60;
const POST_RADIUS_M = 0.04;
const CHAIN_HEX = 0x4a4a4a;

/**
 * Aerial perspective. 1.7e−4 puts the 3000 m gong at ~24 % fog — visibly further
 * away than the near ones, but never washing toward sky colour. The shared 7.45e−4
 * the other ranges use would put it at 98 %, i.e. invisible.
 */
const FOG_DENSITY = 1.7e-4;
const SKY_HEX = 0xdfe3e8;

/** Terrain tessellation. The flat variant needs almost none; the slope variant
 *  needs enough along z to render the convex profile without faceting. */
const GROUND_SEGMENTS_X = 8;
const GROUND_SEGMENTS_Z = 160;

export class ELRProbeScene implements SteelSceneApi {
  readonly plates: PlateInstance[] = [];
  plateMesh!: THREE.InstancedMesh;
  plateSurface!: PlateSurface;
  chainMesh!: THREE.InstancedMesh;
  readonly chainRest: THREE.Matrix4[] = [];

  readonly layout: ElrProbeLayout;
  /** Shooter eye height (m) — 1.7 on the flat variant, 11.7 on the bluff. ScopeView
   *  reads this off `SteelSceneApi` and places the camera accordingly; without it
   *  Probe B would look up a hillside from 1.6 m and see only dirt. */
  get eyeHeightM(): number {
    return this.layout.eyeYM;
  }

  /** The variant's ground profile, so a low miss kicks up dirt on the hillside
   *  rather than on an imaginary flat plane beyond it. */
  groundYAt = (downrangeM: number): number => groundYFor(this.layout.variant, downrangeM);
  /** No casters here, so ScopeView leaves `renderer.shadowMap` off — a shadow pass
   *  over a 3 km plane would cost frame time and light nothing. */
  readonly usesShadows = false;

  private readonly scene: THREE.Scene;
  private readonly disposables: Array<{ dispose(): void }> = [];
  /** Tree resources, kept apart from `disposables` so a tree rebuild does not
   *  take the gongs and the ground with it. */
  private readonly treeDisposables: Array<{ dispose(): void }> = [];
  private readonly treeObjects: THREE.Object3D[] = [];
  private treeCount = 0;
  private readonly objects: THREE.Object3D[] = [];
  private readonly prevBackground: THREE.Scene['background'];
  private readonly prevFog: THREE.Scene['fog'];

  constructor(scene: THREE.Scene, variant: ProbeVariant = 'flat') {
    this.scene = scene;
    this.layout = snapshotElrProbe(variant);

    this.prevBackground = scene.background;
    this.prevFog = scene.fog;
    scene.background = new THREE.Color(SKY_HEX);
    scene.fog = new THREE.FogExp2(SKY_HEX, FOG_DENSITY);

    this.addLights();
    this.addGround();
    this.addPlates();
    this.addFramesAndPanels();
    this.addChains();
    this.addSigns();
  }

  /** Flat rig — enough to read shape, nothing that costs a shadow pass. */
  private addLights(): void {
    const hemi = new THREE.HemisphereLight(0xbcd2e8, 0x6b6558, 1.1);
    this.add(hemi);
    const sun = new THREE.DirectionalLight(0xffe9c8, 1.25);
    // Behind-left of the shooter, low — the same reasoning as the Wooded Zero
    // Range: anything in FRONT lights every plate edge-on and silhouettes it.
    sun.position.set(-318, 97, 223);
    this.add(sun);
  }

  private addGround(): void {
    const geo = this.track(
      new THREE.PlaneGeometry(GROUND_WIDTH_M, GROUND_LENGTH_M, GROUND_SEGMENTS_X, GROUND_SEGMENTS_Z),
    );
    // Displace to the variant's profile BEFORE rotating: the plane is built in XY
    // and rotated into XZ, so local +Y becomes downrange and local Z becomes height.
    // The local-y → downrange mapping is `groundLocalYToDownrangeM` — a named,
    // tested function precisely because getting it wrong here is invisible on the
    // flat variant and catastrophic on the slope (see its doc comment).
    const pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const downrangeM = groundLocalYToDownrangeM(pos.getY(i), GROUND_LENGTH_M);
      pos.setZ(i, groundYFor(this.layout.variant, downrangeM));
    }
    pos.needsUpdate = true;
    geo.computeVertexNormals();

    const mat = this.track(new THREE.MeshStandardMaterial({ color: GROUND_HEX, roughness: 1 }));
    const mesh = new THREE.Mesh(geo, mat);
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.z = -GROUND_LENGTH_M / 2;
    this.add(mesh);
  }

  /**
   * The gongs. One instanced mesh, one atlas layer per plate — every layer gets
   * the SAME bullseye, because the pattern is constant-angular and therefore
   * identical at every station.
   *
   * Per-plate layers rather than one shared layer because that is how the paint
   * system tracks chipping: a hit writes back into the plate's own layer, so
   * sharing would smear every plate's damage onto all six.
   */
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
      // Yaw to face the firing point, derived from the position rather than the
      // azimuth so it stays right if the placement convention ever changes.
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.atan2(-st.x, -st.z));
      const p = new THREE.Vector3(st.x, st.y, st.z);
      m.compose(p, q, new THREE.Vector3(st.gongDiameterM, st.gongDiameterM, PLATE_THICKNESS_M));
      mesh.setMatrixAt(i, m);
      this.plates.push({
        rackId: `probe-${st.nominalDistance}`,
        distanceM: st.losRangeM,
        distanceYards: Math.round(st.losRangeM * 1.0936133),
        diameterM: st.gongDiameterM,
        position: p.clone(),
        beamHeightM: st.y + st.frameHeightM / 2,
        instanceId: i,
        paintColor: PLATE_HEX,
      });
    });
    mesh.instanceMatrix.needsUpdate = true;
    this.plateMesh = mesh;
    this.add(mesh);
  }

  /**
   * Dark backer panel + two posts per station.
   *
   * THE PANEL IS LOAD-BEARING, not decoration. Fog costs bright objects far more
   * contrast than dark ones, so a white plate on pale ground is the worst
   * combination available — under 0.05 contrast at 3000 m, effectively camouflage.
   * On a dark panel it holds around 0.40 regardless of ground colour.
   *
   * The plate stands `MIN_PLATE_STANDOFF_M` in FRONT of the panel. That distance is
   * a depth-buffer requirement, not a look: at this range's camera reach the buffer
   * resolves ~0.054 m at 3000 m, so a 0.1 m gap is only 1.85 depth buckets and can
   * flicker. 0.15 m puts it at 2.8 buckets. See `scope/perf-hud.ts`.
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

      const panelGeo = this.track(new THREE.PlaneGeometry(st.frameWidthM, st.frameHeightM));
      const panel = new THREE.Mesh(panelGeo, panelMat);
      panel.position.set(st.x, st.y, st.z).addScaledVector(toShooter, -MIN_PLATE_STANDOFF_M);
      panel.rotation.y = yaw;
      this.add(panel);

      const groundY = groundYFor(this.layout.variant, st.groundRunM);
      const postH = Math.max(0.1, st.y + st.frameHeightM / 2 - groundY);
      const postGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 6));
      const across = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
      for (const side of [-1, 1]) {
        const post = new THREE.Mesh(postGeo, postMat);
        post
          .position.set(st.x, groundY + postH / 2, st.z)
          .addScaledVector(across, (side * st.frameWidthM) / 2)
          .addScaledVector(toShooter, -MIN_PLATE_STANDOFF_M);
        this.add(post);
      }
    }
  }

  /** Hanging chains. Ported from `RangeScene.addChains()` — the reaction loop
   *  indexes `chainRest[id*2 + ci]` unconditionally on a hit, so these must exist
   *  even though the probe is not testing steel reaction. */
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

  /** A distance sign per station, sized as a fraction of the frame so it stays
   *  constant-angular like everything else and remains readable at 3 km. */
  private addSigns(): void {
    for (const st of this.layout.stations) {
      // Metric-only range, so the sign must not say YARDS. `markerText` already
      // carries the number; the unit goes on the second line.
      const tex = this.track(makeSignTexture(String(st.nominalDistance), 'METRES'));
      const mat = this.track(new THREE.MeshBasicMaterial({ map: tex, transparent: true }));
      const h = st.frameHeightM * 0.22;
      const geo = this.track(new THREE.PlaneGeometry(h * 2.2, h));
      const sign = new THREE.Mesh(geo, mat);
      const yaw = Math.atan2(-st.x, -st.z);
      const toShooter = new THREE.Vector3(Math.sin(yaw), 0, Math.cos(yaw));
      sign.position
        .set(st.x, st.y + st.frameHeightM / 2 + h * 0.7, st.z)
        .addScaledVector(toShooter, -MIN_PLATE_STANDOFF_M * 0.5);
      sign.rotation.y = yaw;
      this.add(sign);
    }
  }

  /**
   * Replace the tree field with `count` trees (step P13).
   *
   * Rebuilds rather than toggling instance counts, deliberately: the reading that
   * matters is the STEADY-STATE frame time after the change settles, and a rebuild
   * hitch is over long before you read the number. Toggling `InstancedMesh.count`
   * would avoid that hitch but leaves the full geometry and every material resident,
   * so "0 trees" would not actually measure an empty scene — and the empty baseline
   * is half the comparison.
   *
   * Tree resources are tracked separately from the rest of the scene so a rebuild
   * disposes only them; disposing the shared `disposables` list would take the
   * gongs and ground with it.
   */
  setTreeCount(count: number): void {
    for (const o of this.treeObjects) this.scene.remove(o);
    for (const d of this.treeDisposables) d.dispose();
    this.treeObjects.length = 0;
    this.treeDisposables.length = 0;
    this.treeCount = 0;
    if (count <= 0) return;

    const placements = generateProbeTreePlacements(count, {
      groundY: this.groundYAt,
      targets: this.layout.stations.map((s) => ({ x: s.x, z: s.z })),
      paletteSize: WOODED_ZERO_ENVIRONMENT.trees.palette.length,
    });
    // Reuses the Wooded Zero Range's renderer and palette on purpose — a budget
    // measured against stand-in geometry would be a budget for the wrong trees.
    const handle = buildTrees(this.scene, WOODED_ZERO_ENVIRONMENT, placements, (d) => {
      this.treeDisposables.push(d);
      return d;
    });
    for (const m of handle.meshes) this.treeObjects.push(m);
    this.treeCount = placements.length;
  }

  /** Actual trees standing — may be under what was asked for if placement ran out
   *  of room, and the readout shows this number rather than the request. */
  get placedTreeCount(): number {
    return this.treeCount;
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
    // Restore what we replaced — a throwaway scene must not leave the next range
    // wearing its sky and fog.
    this.scene.background = this.prevBackground;
    this.scene.fog = this.prevFog;
    this.setTreeCount(0); // releases the tree field's own geometry/materials
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.objects.length = 0;
    this.disposables.length = 0;
  }
}
