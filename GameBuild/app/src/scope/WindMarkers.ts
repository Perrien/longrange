// Wind flags/socks renderer (task 1.7b) — the THREE-facing side of the wind
// markers a player reads down the lane. Follows the same module-singleton,
// flat-function convention as impact-fx.ts / BulletTrace.ts (init/update/
// dispose; DOM/THREE-free at import time). The yaw/droop/flutter MATH lives in
// the pure, tested game/wind-marker-model.ts — this file only builds meshes
// and reads that math each frame.
//
// Geometry convention (verified against real THREE.js before writing this —
// see the 1.7b PROGRESS entry): both the flag and the sock are built spanning
// their LOCAL +Z axis from the hinge (z=0, at the pole mount) to the free/tip
// end (z=length) — matching `yawFromWind`'s convention that a Y-axis rotation
// of θ=atan2(x,z) points an object's local +Z along wind vector (x,z). A
// "droop" pivot between the yaw group and the mesh rotates about LOCAL X by
// `(1 − speedFactor)·π/2`: 0 (fully extended, horizontal) at speedFactor=1,
// π/2 (hanging straight down) at speedFactor=0 — both verified numerically.
//
// World axes match the scene: +X right, +Y up, downrange −Z (same convention
// as RangeScene / ScopeView).

import * as THREE from 'three';
import type { WindMarkerSpec, MarkerStyle } from '../range/wind-markers-config';
import { yawFromWind, speedFactor, horizontalSpeed, smoothYaw, type Vec3 } from '../game/wind-marker-model';

// --- tunables (visual feel only — not physics; re-tuned in 1.7d) -----------
const POLE_RADIUS_M = 0.02;
const POLE_COLOR = 0x4a4a4a;
const MOUNT_HEIGHT_FRACTION = 0.92; // near the pole top

const FLAG_WIDTH_M = 0.5; // hinge → free edge
const FLAG_HEIGHT_M = 0.32;
const FLAG_SEGMENTS = 5; // columns of vertices along the flutter axis
const FLAG_COLOR = 0xd23b3b;
const FLUTTER_FREQ_HZ = 2.3;
const FLUTTER_WAVELENGTH_M = 0.22; // spatial period of the ripple along the flag
const FLUTTER_AMPLITUDE_M = 0.05; // at full speedFactor, at the free edge

const SOCK_LENGTH_M = 0.7;
const SOCK_RADIUS_MOUTH_M = 0.14; // wide end, at the hinge (faces "into" the wind)
const SOCK_RADIUS_TIP_M = 0.03; // narrow end, at the free/downwind tip
const SOCK_RADIAL_SEGMENTS = 10;
const SOCK_COLOR = 0xff7a1a;
const SOCK_SECOND_HEIGHT_M = 1.5; // when 'both': mount the sock lower than the flag

const FLAG_MOUNT_FRACTION_BOTH = 1.0; // when 'both', flag stays at the pole top

/** Reference speed for the visual droop/flutter curve (NOT the ballistics
 *  D3b gustScale) — chosen so a typical breeze already reads as "extended". */
const MARKER_SPEED_REFERENCE_MPS = 5.5; // ≈ 12 mph
const YAW_SMOOTH_RATE = 2.5; // 1/s — settle time so direction doesn't snap

interface DroopingMesh {
  mesh: THREE.Mesh;
  pivot: THREE.Group; // rotation.x = droop angle
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
  /** Base (un-fluttered) local positions, for the flag's per-vertex ripple. */
  basePositions: Float32Array | null;
}

interface MarkerInstance {
  spec: WindMarkerSpec;
  root: THREE.Group; // positioned at the marker's world location
  poleMesh: THREE.Mesh;
  yawGroups: THREE.Group[]; // one per drooping mesh (flag and/or sock)
  flag: DroopingMesh | null;
  sock: DroopingMesh | null;
  yaw: number; // current smoothed heading (shared — flag and sock read the same wind)
}

interface WindMarkersState {
  scene: THREE.Scene;
  style: MarkerStyle;
  instances: MarkerInstance[];
}

let state: WindMarkersState | null = null;

function buildPole(spec: WindMarkerSpec): THREE.Mesh {
  const geo = new THREE.CylinderGeometry(POLE_RADIUS_M, POLE_RADIUS_M, spec.poleHeightM, 8);
  const mesh = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: POLE_COLOR }));
  mesh.position.y = spec.poleHeightM / 2; // CylinderGeometry is centred at its own origin
  return mesh;
}

/** Flag geometry: a segmented plane spanning local Z from 0 (hinge) to
 *  FLAG_WIDTH_M (free edge) — see the file header for the rotateY/translate
 *  derivation. Segments run along Z so the flutter ripple has something to
 *  perturb; height (Y) is unsegmented. */
function buildFlagMesh(): DroopingMesh {
  const geometry = new THREE.PlaneGeometry(FLAG_WIDTH_M, FLAG_HEIGHT_M, FLAG_SEGMENTS, 1);
  geometry.rotateY(-Math.PI / 2);
  geometry.translate(0, 0, FLAG_WIDTH_M / 2);
  const basePositions = Float32Array.from(geometry.attributes.position.array);
  const material = new THREE.MeshBasicMaterial({ color: FLAG_COLOR, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  return { mesh, pivot, geometry, material, basePositions };
}

/** Sock geometry: a tapered, open-ended cylinder spanning local Z from 0
 *  (wide mouth, at the hinge) to SOCK_LENGTH_M (narrow tip) — see the file
 *  header for the rotateX/translate derivation. */
function buildSockMesh(): DroopingMesh {
  const geometry = new THREE.CylinderGeometry(
    SOCK_RADIUS_TIP_M,
    SOCK_RADIUS_MOUTH_M,
    SOCK_LENGTH_M,
    SOCK_RADIAL_SEGMENTS,
    1,
    true,
  );
  geometry.rotateX(Math.PI / 2);
  geometry.translate(0, 0, SOCK_LENGTH_M / 2);
  const material = new THREE.MeshBasicMaterial({ color: SOCK_COLOR, side: THREE.DoubleSide });
  const mesh = new THREE.Mesh(geometry, material);
  const pivot = new THREE.Group();
  pivot.add(mesh);
  return { mesh, pivot, geometry, material, basePositions: null };
}

function buildMarker(scene: THREE.Scene, spec: WindMarkerSpec, style: MarkerStyle): MarkerInstance {
  const root = new THREE.Group();
  root.position.set(spec.xOffsetM, 0, -spec.distanceM);

  const poleMesh = buildPole(spec);
  root.add(poleMesh);

  const yawGroups: THREE.Group[] = [];
  let flag: DroopingMesh | null = null;
  let sock: DroopingMesh | null = null;

  const wantFlag = style === 'flag' || style === 'both';
  const wantSock = style === 'sock' || style === 'both';

  if (wantFlag) {
    flag = buildFlagMesh();
    const yawGroup = new THREE.Group();
    const mountFraction = style === 'both' ? FLAG_MOUNT_FRACTION_BOTH : MOUNT_HEIGHT_FRACTION;
    yawGroup.position.y = spec.poleHeightM * mountFraction;
    yawGroup.add(flag.pivot);
    root.add(yawGroup);
    yawGroups.push(yawGroup);
  }
  if (wantSock) {
    sock = buildSockMesh();
    const yawGroup = new THREE.Group();
    yawGroup.position.y = style === 'both' ? SOCK_SECOND_HEIGHT_M : spec.poleHeightM * MOUNT_HEIGHT_FRACTION;
    yawGroup.add(sock.pivot);
    root.add(yawGroup);
    yawGroups.push(yawGroup);
  }

  scene.add(root);
  return { spec, root, poleMesh, yawGroups, flag, sock, yaw: 0 };
}

function disposeMarker(scene: THREE.Scene, instance: MarkerInstance): void {
  scene.remove(instance.root);
  instance.poleMesh.geometry.dispose();
  (instance.poleMesh.material as THREE.Material).dispose();
  for (const d of [instance.flag, instance.sock]) {
    if (!d) continue;
    d.geometry.dispose();
    d.material.dispose();
  }
}

/** Build every marker at `style`. Idempotent (a repeat call with the same
 *  style is a no-op; call `disposeWindMarkers()` first to force a rebuild). */
export function initWindMarkers(scene: THREE.Scene, markers: readonly WindMarkerSpec[], style: MarkerStyle): void {
  if (state) return;
  state = { scene, style, instances: markers.map((spec) => buildMarker(scene, spec, style)) };
}

/** Rebuild all markers with a new style (dispose + reconstruct). No-op if the
 *  style hasn't actually changed. */
function rebuildWithStyle(style: MarkerStyle): void {
  if (!state) return;
  const { scene, instances } = state;
  const markers = instances.map((i) => i.spec);
  for (const instance of instances) disposeMarker(scene, instance);
  state = { scene, style, instances: markers.map((spec) => buildMarker(scene, spec, style)) };
}

/**
 * Advance every marker one frame: rebuild (lazily) if `style` has changed,
 * then sample the live wind at each marker's world position (`windAt` — the
 * caller's `meanVector + gustScale × field.sample(worldPos)`, D2/D3b), yaw
 * toward it (smoothed), droop/extend by its horizontal speed, and flutter the
 * flag's free edge. `t` is the render loop's elapsed-seconds clock (drives the
 * flutter phase).
 */
export function updateWindMarkers(
  dt: number,
  t: number,
  style: MarkerStyle,
  windAt: (worldPos: Vec3) => Vec3,
): void {
  if (!state) return;
  if (state.style !== style) rebuildWithStyle(style);
  if (!state) return; // defensive; rebuildWithStyle always re-sets state

  for (const instance of state.instances) {
    const worldPos: Vec3 = { x: instance.root.position.x, y: 0, z: instance.root.position.z };
    const wind = windAt(worldPos);
    const speed = horizontalSpeed(wind);
    const factor = speedFactor(speed, MARKER_SPEED_REFERENCE_MPS);
    const targetYaw = speed > 1e-6 ? yawFromWind(wind) : instance.yaw; // becalmed: hold last heading
    instance.yaw = smoothYaw(instance.yaw, targetYaw, YAW_SMOOTH_RATE, dt);
    const droopAngle = (1 - factor) * (Math.PI / 2);

    for (const yawGroup of instance.yawGroups) {
      yawGroup.rotation.y = instance.yaw;
    }
    if (instance.flag) {
      instance.flag.pivot.rotation.x = droopAngle;
      applyFlutter(instance.flag, factor, t);
    }
    if (instance.sock) {
      instance.sock.pivot.rotation.x = droopAngle;
    }
  }
}

/** Perturb the flag's free-edge vertices along local X (the thickness axis —
 *  see the file header) with a sine ripple whose phase runs along Z (distance
 *  from the hinge) and whose amplitude grows toward the free edge and with
 *  wind speed. Cheap (≤6 vertex columns), no shader — the tremor-sine pattern
 *  from the 0.9 aim wobble, applied to geometry instead of a camera angle. */
function applyFlutter(flag: DroopingMesh, factor: number, t: number): void {
  if (!flag.basePositions) return;
  const pos = flag.geometry.attributes.position;
  const base = flag.basePositions;
  const k = (2 * Math.PI) / FLUTTER_WAVELENGTH_M;
  const omega = 2 * Math.PI * FLUTTER_FREQ_HZ;
  for (let i = 0; i < pos.count; i++) {
    const bx = base[i * 3];
    const by = base[i * 3 + 1];
    const bz = base[i * 3 + 2];
    const edgeFraction = FLAG_WIDTH_M > 0 ? bz / FLAG_WIDTH_M : 0; // 0 at hinge, 1 at free edge
    const ripple = FLUTTER_AMPLITUDE_M * factor * edgeFraction * Math.sin(omega * t + k * bz);
    pos.setXYZ(i, bx + ripple, by, bz);
  }
  pos.needsUpdate = true;
}

/** Tear down all marker resources. Idempotent. */
export function disposeWindMarkers(): void {
  if (!state) return;
  for (const instance of state.instances) disposeMarker(state.scene, instance);
  state = null;
}
