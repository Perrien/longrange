// Sight-in scene builder (task 2.3c, D4/D7). Framework-agnostic THREE builder
// (same contract as RangeScene): takes a THREE.Scene and fills it with the
// sight-in bay — ground, and three IMMOBILE square paper targets at 50/100/200
// (50 left, 100 centre, 200 right) on simple ~1 m racks with a backstop behind
// each. No swing, no reaction, no berm system (D4) — just a static bay.
//
// The target FACE art is delivered SVG (rasterized once via sight-in-target-
// texture), then each target gets its own mark layer (sight-in-marks) so hits
// paint independently and a single target can be cleaned (D9). The face texture
// loads asynchronously; the quads render white until `whenReady` resolves, then
// the art + mark layer are swapped in.
//
// World axes match the scope/Range A: +X right, +Y up, downrange −Z, shooter at
// the origin. All geometry is SI from the entry-snapshot layout (sight-in-config);
// no unit math here (guardrail §4.4).

import * as THREE from 'three';
import type { SightInLayout, SightInStation } from './sight-in-config';
import { drawZeroingTarget, rasterizeSightInArt } from './sight-in-target-texture';
import { createTargetFace, type TargetFace } from './sight-in-marks';

const SKY_COLOR = 0x9fc4e8;
const GRASS_COLOR = 0x7d9450;
const DIRT_COLOR = 0xb89d6f;
const BACKSTOP_COLOR = 0x6d5a44; // dark earth berm board behind the paper
const POST_COLOR = 0x8b7355; // wooden rack post
const POST_RADIUS_M = 0.03;
const ART_RASTER_PX = 2048;

/** One placed paper target, exposed for the shot loop (2.3c2) to aim + hit-test. */
export interface SightInTargetInstance {
  stationIndex: number;
  distanceM: number;
  nominalDistance: number;
  /** Physical square side of the face (m). */
  sizeM: number;
  /** World-space centre of the target face. */
  position: THREE.Vector3;
}

export class SightInScene {
  readonly targets: SightInTargetInstance[] = [];
  /** Resolves when the delivered art has been swapped in (or the load failed and
   *  the procedural grid is kept). Faces are usable immediately regardless. */
  readonly whenReady: Promise<void>;

  private readonly scene: THREE.Scene;
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly objects: THREE.Object3D[] = [];
  private readonly faces: TargetFace[] = [];
  private readonly layout: SightInLayout;
  /** The procedurally-drawn grid, rendered once and shared by all three faces
   *  as the immediate (fallback) art. */
  private readonly artCanvas: HTMLCanvasElement;

  constructor(scene: THREE.Scene, layout: SightInLayout) {
    this.scene = scene;
    this.layout = layout;
    this.artCanvas = drawZeroingTarget(ART_RASTER_PX);

    scene.background = new THREE.Color(SKY_COLOR);
    scene.fog = new THREE.Fog(SKY_COLOR, 200, 1200);

    this.addLights();
    this.addGround();
    layout.stations.forEach((_station, i) => this.addTarget(i));

    // Prefer the delivered OK2A art (D7): swap it over the procedural grid once
    // it rasterizes; keep the procedural fallback if it can't (blank-SVG guard).
    this.whenReady = this.loadDeliveredArt();
  }

  /** Rasterize the delivered SVG and swap it into every face; on failure keep
   *  the procedural grid the faces were seeded with. */
  private async loadDeliveredArt(): Promise<void> {
    try {
      const art = await rasterizeSightInArt(this.layout.artVariant, ART_RASTER_PX);
      for (const face of this.faces) face.setArt(art);
    } catch (err) {
      console.warn('sight-in: delivered art failed to rasterize; keeping procedural grid', err);
    }
  }

  private addLights(): void {
    this.add(new THREE.HemisphereLight(0xffffff, GRASS_COLOR, 1.1));
    const sun = new THREE.DirectionalLight(0xfff4e0, 1.2);
    sun.position.set(-120, 300, 120);
    this.add(sun);
  }

  private addGround(): void {
    const g = this.layout.ground;
    const lane = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(g.widthM, g.lengthM)),
      this.track(new THREE.MeshStandardMaterial({ color: GRASS_COLOR, roughness: 1 })),
    );
    lane.rotation.x = -Math.PI / 2;
    lane.position.z = -g.lengthM / 2;
    this.add(lane);

    const backdrop = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(g.widthM * 1.5, 6)),
      this.track(new THREE.MeshStandardMaterial({ color: DIRT_COLOR, roughness: 1 })),
    );
    backdrop.position.set(0, 3, -g.lengthM);
    this.add(backdrop);
  }

  /** One target: backstop board + two flanking posts + the paper face quad. */
  private addTarget(i: number): void {
    const station = this.layout.stations[i];
    const size = this.layout.targetSizeM;
    const cy = this.layout.targetCenterYM;
    const z = -station.distanceM;
    const x = station.xOffsetM;
    const bs = this.layout.backstop;

    // Backstop board, just behind the paper.
    const backstop = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(bs.widthM, bs.heightM)),
      this.track(new THREE.MeshStandardMaterial({ color: BACKSTOP_COLOR, roughness: 1 })),
    );
    backstop.position.set(x, cy, z - 0.25);
    this.add(backstop);

    // Two posts framing the target, ground → top edge.
    const postH = cy + size / 2;
    const postGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 8));
    const postMat = this.track(new THREE.MeshStandardMaterial({ color: POST_COLOR, roughness: 0.9 }));
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(x + sx * (size / 2 + POST_RADIUS_M), postH / 2, z - 0.12);
      this.add(post);
    }

    // Paper face quad — seeded synchronously with the procedurally-drawn grid so
    // the target is always visible and shots always leave a mark.
    const face = createTargetFace(ART_RASTER_PX, this.artCanvas);
    this.faces[i] = face;
    this.disposables.push(face);
    const mat = this.track(new THREE.MeshBasicMaterial({ map: face.texture }));
    const quad = new THREE.Mesh(this.track(new THREE.PlaneGeometry(size, size)), mat);
    quad.position.set(x, cy, z);
    this.add(quad);

    // Distance sign above the target (owner request 2026-07-19) — a small board
    // "100 YD" / "100 M" so the player reads each station's distance at a glance.
    this.add(this.makeDistanceSign(station, x, cy + size / 2 + 0.2, z));

    this.targets.push({
      stationIndex: i,
      distanceM: station.distanceM,
      nominalDistance: station.nominalDistance,
      sizeM: size,
      position: new THREE.Vector3(x, cy, z),
    });
  }

  /** A small white board above a target showing its distance + unit. */
  private makeDistanceSign(station: SightInStation, x: number, y: number, z: number): THREE.Mesh {
    const unit = this.layout.system === 'metric' ? 'M' : 'YD';
    const tex = this.track(makeSignTexture(`${station.nominalDistance} ${unit}`));
    const w = 0.55;
    const h = 0.26;
    const board = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(w, h)),
      this.track(new THREE.MeshBasicMaterial({ map: tex })),
    );
    board.position.set(x, y + h / 2, z);
    return board;
  }

  /**
   * Paint a hit on target `stationIndex` at the given world impact (x,y). No-ops
   * before the face has loaded, or if the impact falls off the paper. Bullet
   * radius is mapped to a fraction of the face side.
   */
  paintHit(stationIndex: number, worldX: number, worldY: number, bulletDiameterM: number): void {
    const face = this.faces[stationIndex];
    const target = this.targets[stationIndex];
    if (!face || !target) return;
    const size = target.sizeM;
    const u = 0.5 + (worldX - target.position.x) / size;
    const v = 0.5 - (worldY - target.position.y) / size; // world +y up → art v down
    if (u < 0 || u > 1 || v < 0 || v > 1) return; // off paper — no mark
    face.addMark(u, v, bulletDiameterM / 2 / size);
  }

  /** Wipe one target's marks for a fresh face (D9). */
  cleanTarget(stationIndex: number): void {
    this.faces[stationIndex]?.clean();
  }

  /** Wipe every target's marks. */
  cleanAll(): void {
    for (const face of this.faces) face?.clean();
  }

  /** Overlay the running group-centroid marker at a world point (task 2.3d, D5). */
  setGroupCentroid(stationIndex: number, worldX: number, worldY: number): void {
    const face = this.faces[stationIndex];
    const target = this.targets[stationIndex];
    if (!face || !target) return;
    const size = target.sizeM;
    const u = 0.5 + (worldX - target.position.x) / size;
    const v = 0.5 - (worldY - target.position.y) / size;
    face.setCentroid(u, v);
  }

  /** Remove a target's centroid marker (dial change / confirm / no shots). */
  clearGroupCentroid(stationIndex: number): void {
    this.faces[stationIndex]?.clearCentroid();
  }

  /** The engaged target's backing canvas, for the head-on Inspect view (D10). */
  getFaceCanvas(stationIndex: number): HTMLCanvasElement | null {
    return this.faces[stationIndex]?.canvas ?? null;
  }

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
    this.targets.length = 0;
    this.faces.length = 0;
    this.scene.background = null;
    this.scene.fog = null;
  }
}

/** White board with bordered black text (distance sign), drawn to a canvas
 *  texture. Unlit (used with MeshBasicMaterial) so it reads at any distance. */
function makeSignTexture(text: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#f4f4f0';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.strokeStyle = '#333333';
  ctx.lineWidth = 6;
  ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 64px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, canvas.width / 2, canvas.height / 2 + 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.needsUpdate = true;
  return tex;
}
