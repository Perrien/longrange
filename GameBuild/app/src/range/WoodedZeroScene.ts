// Wooded Zero Range scene — Stage 2b of `Design/archive/mil-zero-range-plan.md`.
//
// A `PaperBayScene`, so ScopeView's existing paper-target fire path, hit marks,
// running group centroid, Clean, Inspect and the whole zeroing flow work here
// with no changes at all — that was the point of Stage 2a.
//
// Structure mirrors TestRangeScene: hand the shared environment module a config
// and then add this range's own furniture on top. What differs from the original
// grass bay:
//   - four stations on a 10.5 deg FAN, not three on a lateral offset;
//   - the firing point sits on a knoll, so `eyeHeightM` is raised and every
//     sight line looks slightly DOWN (that is what stops the near boards
//     occluding the far ones — plan §4);
//   - boards are one physical size at every station (the constant-angular-size
//     rule was tried first and made the 200 m board 2.4 m wide — see plan §5.1),
//     and carry an orange lane-number plate reading e.g. "100 M";
//   - no berms anywhere (owner, 2026-07-26) — misses fly on into the woods.
//
// World axes match the scope: +X right, +Y up, downrange −Z, shooter at the
// origin. All geometry is SI from the entry snapshot; no unit math here
// (guardrail §4.4).

import * as THREE from 'three';
import type { WoodedZeroLayout, WoodedZeroStation } from './wooded-zero-config';
import { EYE_Y_M, facingYawRad } from './wooded-zero-config';
import { WOODED_ZERO_ENVIRONMENT } from './wooded-zero-environment';
import { drawZeroingTarget, rasterizeZeroingArt } from './paper-target-texture';
import { createTargetFace, type TargetFace } from './paper-target-marks';
import { buildEnvironment, type EnvironmentHandle } from './environment';
import type { PaperBayScene, PaperTargetInstance } from './paper-bay-scene';

const ART_RASTER_PX = 2048;
/** Board canvas width in px. Lower than the paper's — the board carries a border,
 *  a lane plate and the occasional stray hole, not a measuring grid. */
const BOARD_RASTER_PX = 512;

// Board treatment (plan §5.1). White face + dark border is the strongest read
// against dark conifers, which is what replaces the berm.
const BOARD_FACE_COLOR = '#f2efe6';
const BOARD_BORDER_COLOR = '#2b2b28';
const BOARD_BORDER_FRACTION = 0.06;
const MARKER_PLATE_COLOR = '#e8722c'; // orange — survives the distance haze
const POST_COLOR = 0x8b7355;
const POST_RADIUS_M = 0.04;

export class WoodedZeroScene implements PaperBayScene {
  readonly targets: PaperTargetInstance[] = [];
  readonly whenReady: Promise<void>;
  /** The shooter is on a knoll — the camera, the wind sampling and the mirage
   *  reference all follow this (Stage 2a made eye height per-bay). */
  readonly eyeHeightM = EYE_Y_M;

  private readonly scene: THREE.Scene;
  private readonly env: EnvironmentHandle;
  private readonly layout: WoodedZeroLayout;
  private readonly faces: TargetFace[] = [];
  /** Mark layer for the BACKER BOARD behind each paper face (D16). A raw
   *  off-the-shelf rifle carries 5-35 MOA of pointing error, which at the 25 m
   *  station puts up to 16% of first shots off the paper entirely — and a miss
   *  that draws nothing gives the player no way to walk the correction in. The
   *  board catches those. */
  private readonly boardFaces: TargetFace[] = [];
  private readonly disposables: Array<{ dispose(): void }> = [];
  private readonly objects: THREE.Object3D[] = [];
  private readonly artCanvas: HTMLCanvasElement;

  constructor(scene: THREE.Scene, layout: WoodedZeroLayout) {
    this.scene = scene;
    this.layout = layout;
    this.artCanvas = drawZeroingTarget(ART_RASTER_PX);

    this.env = buildEnvironment(scene, WOODED_ZERO_ENVIRONMENT);
    layout.stations.forEach((_s, i) => this.addStation(i));

    this.whenReady = this.loadDeliveredArt();
  }

  get laneLengthM(): number {
    return this.layout.ground.lengthM;
  }

  /** Whether this bay's environment configured a shadow map — ScopeView reads
   *  it to enable `renderer.shadowMap`, which is a renderer-level flag. */
  get usesShadows(): boolean {
    return this.env.usesShadows;
  }

  /** Drift the clouds with the dialed wind, and sway the canopies with the
   *  range's own wind sampler (Stage 5) — the same wind its shots experience. */
  update(
    dt: number,
    timeS: number,
    windVec: { x: number; y: number; z: number },
    sampleWindAt?: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
  ): void {
    this.env.update(dt, timeS, windVec, sampleWindAt);
  }

  private async loadDeliveredArt(): Promise<void> {
    try {
      const art = await rasterizeZeroingArt(this.layout.artVariant, ART_RASTER_PX);
      for (const face of this.faces) face.setArt(art);
    } catch (err) {
      console.warn('wooded-zero: delivered art failed to rasterize; keeping procedural grid', err);
    }
  }

  /** One station: backer board + two posts + the paper face + a lane-number
   *  plate. Everything faces the shooter, which on a fanned bay means each
   *  station is YAWED toward the origin rather than all sharing one facing. */
  private addStation(i: number): void {
    const s = this.layout.stations[i];
    const size = this.layout.targetSizeM;
    // Yaw so the board's normal points back at the firing point. On the original
    // straight bay every target faced +Z; here each sits on its own bearing, so
    // a shared facing would present the far ones at an angle.
    //
    // The maths lives in `facingYawRad` (pure, unit-tested) because getting the
    // sign wrong here is invisible in code review and yaws every board by TWICE
    // its azimuth on device — which is exactly what happened first time.
    const yaw = facingYawRad(s);

    const group = new THREE.Group();
    group.position.set(s.x, 0, s.z);
    group.rotation.y = yaw;

    // Backer board — the SAME physical size at every station (owner, 2026-07-26).
    // It sits slightly above the target centre so the lane-number plate occupies
    // a band above the paper instead of over it.
    // The board is a MARK SURFACE, not just a texture: `makeBoardTexture` draws
    // its art, and a TargetFace wraps that so off-paper impacts land somewhere
    // visible. Non-square, hence the explicit height.
    const boardArt = makeBoardTexture(s);
    const boardFace = createTargetFace(
      BOARD_RASTER_PX,
      boardArt,
      Math.round((BOARD_RASTER_PX * s.boardHeightM) / s.boardWidthM),
    );
    this.boardFaces[i] = boardFace;
    this.disposables.push(boardFace);
    const board = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(s.boardWidthM, s.boardHeightM)),
      this.track(new THREE.MeshBasicMaterial({ map: boardFace.texture })),
    );
    board.position.set(0, s.boardCenterYM, -0.06);
    group.add(board);

    // Two posts, ground to the board's top edge.
    const postH = s.boardCenterYM + s.boardHeightM / 2;
    const postGeo = this.track(new THREE.CylinderGeometry(POST_RADIUS_M, POST_RADIUS_M, postH, 8));
    const postMat = this.track(new THREE.MeshStandardMaterial({ color: POST_COLOR, roughness: 0.9 }));
    for (const sx of [-1, 1]) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(sx * (s.boardWidthM / 2 + POST_RADIUS_M), postH / 2, -0.12);
      group.add(post);
    }

    // Paper face, seeded synchronously so a shot always leaves a mark.
    const face = createTargetFace(ART_RASTER_PX, this.artCanvas);
    this.faces[i] = face;
    this.disposables.push(face);
    const quad = new THREE.Mesh(
      this.track(new THREE.PlaneGeometry(size, size)),
      this.track(new THREE.MeshBasicMaterial({ map: face.texture })),
    );
    quad.position.set(0, s.y, 0);
    group.add(quad);

    this.add(group);

    this.targets.push({
      stationIndex: i,
      // LOS range, not ground run — this is what reaches the solver (plan §3.3).
      distanceM: s.losRangeM,
      nominalDistance: s.nominalDistance,
      sizeM: size,
      position: new THREE.Vector3(s.x, s.y, s.z),
    });
  }

  /**
   * Paint a hit. Tries the paper first, then the backer board, then gives up.
   *
   * The board fallback is what makes the 25 m "get on paper" station actually
   * work with D16's raw 5-35 MOA pointing error: the worst-case first shot is
   * 25.5 cm off centre, which clears the 22 cm half-width of the metric paper but
   * sits comfortably inside the board's 33 cm. Without it, roughly one metric
   * rifle in six would fire and leave nothing on screen at all.
   */
  paintHit(stationIndex: number, worldX: number, worldY: number, bulletDiameterM: number): void {
    const target = this.targets[stationIndex];
    if (!target) return;
    const size = target.sizeM;
    const u = 0.5 + (worldX - target.position.x) / size;
    const v = 0.5 - (worldY - target.position.y) / size;
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
      this.faces[stationIndex]?.addMark(u, v, bulletDiameterM / 2 / size);
      return;
    }
    const s = this.layout.stations[stationIndex];
    const boardFace = this.boardFaces[stationIndex];
    if (!s || !boardFace) return;
    const bu = 0.5 + (worldX - s.x) / s.boardWidthM;
    const bv = 0.5 - (worldY - s.boardCenterYM) / s.boardHeightM;
    if (bu < 0 || bu > 1 || bv < 0 || bv > 1) return; // past the board — into the woods
    boardFace.addMark(bu, bv, bulletDiameterM / 2 / s.boardWidthM);
  }

  cleanTarget(stationIndex: number): void {
    this.faces[stationIndex]?.clean();
    this.boardFaces[stationIndex]?.clean();
  }

  cleanAll(): void {
    for (const face of this.faces) face?.clean();
    for (const face of this.boardFaces) face?.clean();
  }

  setGroupCentroid(stationIndex: number, worldX: number, worldY: number): void {
    const face = this.faces[stationIndex];
    const target = this.targets[stationIndex];
    if (!face || !target) return;
    const size = target.sizeM;
    face.setCentroid(0.5 + (worldX - target.position.x) / size, 0.5 - (worldY - target.position.y) / size);
  }

  clearGroupCentroid(stationIndex: number): void {
    this.faces[stationIndex]?.clearCentroid();
  }

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
    this.env.dispose();
    for (const o of this.objects) this.scene.remove(o);
    for (const d of this.disposables) d.dispose();
    this.objects.length = 0;
    this.disposables.length = 0;
    this.targets.length = 0;
    this.faces.length = 0;
    this.boardFaces.length = 0;
  }
}

/**
 * The backer board: a white face with a dark border and an orange lane-number
 * plate in a band across the top. Drawn to a canvas rather than assembled from
 * meshes so the whole board is one draw call and the plate can never separate
 * from it.
 *
 * The canvas is sized to the board's real ASPECT RATIO (it is taller than it is
 * wide by the plate band) so the plate maps to exactly the physical band the
 * layout reserves for it. Getting this wrong is what put the paper over the
 * lane number on the first device build: a square texture on a square board
 * placed the plate wherever the border happened to leave room, and the paper —
 * centred on the aim point — covered its lower half.
 *
 * Unlit (`MeshBasicMaterial`) so it reads at 200 m regardless of how the sun
 * ends up angled in Stage 3.
 */
function makeBoardTexture(station: WoodedZeroStation): HTMLCanvasElement {
  const PX_W = BOARD_RASTER_PX;
  const aspect = station.boardHeightM / station.boardWidthM;
  const PX_H = Math.round(PX_W * aspect);
  const canvas = document.createElement('canvas');
  canvas.width = PX_W;
  canvas.height = PX_H;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = BOARD_FACE_COLOR;
  ctx.fillRect(0, 0, PX_W, PX_H);

  const border = PX_W * BOARD_BORDER_FRACTION;
  ctx.strokeStyle = BOARD_BORDER_COLOR;
  ctx.lineWidth = border;
  ctx.strokeRect(border / 2, border / 2, PX_W - border, PX_H - border);

  // Lane-number plate: the top band, exactly the height the layout reserved.
  const plateH = PX_H * (station.markerPlateM / station.boardHeightM);
  ctx.fillStyle = MARKER_PLATE_COLOR;
  ctx.fillRect(border, border, PX_W - 2 * border, plateH - border);

  // Distance AND unit (owner, 2026-07-26 — the plate previously showed a bare
  // number, which is ambiguous on a range whose stations are metres or yards
  // depending on the player's unit preference). `M` / `YD` matches the original
  // Zero Range's distance signs so the two bays read alike.
  //
  // Font is fitted to the available width rather than a fixed fraction of the
  // plate height: "200 YD" is twice the glyphs of "25", and a height-derived
  // size would simply overflow the plate at the long stations.
  ctx.fillStyle = '#141210';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const usableW = PX_W - 2 * border - PX_W * 0.06;
  let fontPx = Math.round(plateH * 0.72);
  ctx.font = `bold ${fontPx}px Arial`;
  const measured = ctx.measureText(station.markerText).width;
  if (measured > usableW) {
    fontPx = Math.max(8, Math.floor((fontPx * usableW) / measured));
    ctx.font = `bold ${fontPx}px Arial`;
  }
  ctx.fillText(station.markerText, PX_W / 2, border + (plateH - border) / 2);

  return canvas;
}
