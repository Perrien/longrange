// Wind flags/socks renderer (task 1.7b; flag half rewritten wind-system-btk-
// port W2 as a faithful port of BTK's `WindFlagFactory` — see
// `BallisticsToolkit/web/steel-sim/WindFlag.js`, MIT, copied per P22). The
// yaw/angle/flutter MATH lives in the pure, tested `game/wind-marker-model.ts`
// and `range/wind-marker-visual-config.ts`; this file only builds meshes and
// writes that math into shader attributes each frame.
//
// SOCK is NOT YET PORTED (that's W3) — it keeps 1.7b's original flat, unlit,
// CPU-droop-pivot implementation below, unchanged, so 'sock'/'both' styles
// keep working in the interim. Only the flag half was rewritten this task.
//
// --- Flag architecture (wind-system-btk-port W2) ----------------------------
// One SHARED `THREE.InstancedMesh` holds every flag in the active marker set
// (BTK's own architecture: a single instanced draw call, not one mesh per
// flag). Per-instance ANIMATION state (`instanceAngleRad`, `instanceDirRad`,
// `instanceWavePhase`) is written into `InstancedBufferAttribute`s every frame
// (P8); per-instance POSITION is a one-time translation baked into the
// instance matrix at build time (flags don't move). The vertex shader (an
// `onBeforeCompile` patch on `MeshStandardMaterial`, matching BTK) deforms the
// authored flat-cloth geometry entirely in local space from those three
// attributes — quadratic pitch bend, a travelling flap wave, and a furl (roll
// about the length axis, scaled by how "open" the angle is) that reads the
// cloth as a 3D form rather than a flat card. A custom `beginnormal_vertex`
// block recomputes the normal from finite differences of the SAME deformed
// position function (P4) — without it the lit cloth would shade as if it were
// still flat, and the furl would disappear visually even though the geometry
// moved.
//
// D6 (deliberate deviation from BTK): BTK recomputes its wind→angle/direction
// response TWICE inside the vertex shader (once for position, once for
// normals) from a raw `instanceWindVector`. This port computes that response
// ONCE, on the CPU, in the tested pure model (`markerAngleDeg`, `yawFromWind`),
// and feeds the shader the already-smoothed `instanceAngleRad`/
// `instanceDirRad` instead of a raw wind vector — the response curve then
// lives in exactly one (tested) place, and can be smoothed (D7) before it
// ever reaches the GPU. The shader's rotation math is consequently NOT BTK's
// own `windDir = atan2(-z,x)` / `(cosDir,-sinDir)` parametrization; it uses
// `yawFromWind`'s `θ = atan2(x,z)` / `(sinθ,cosθ)` convention instead — see
// `yawFromWind`'s doc comment in wind-marker-model.ts for the proof that the
// two are the same rotation (P1), and standardize on the one this codebase
// already tests.
//
// P4 (unlit → lit): today's markers were flat `MeshBasicMaterial`. BTK's are
// `MeshStandardMaterial` with `castShadow`/`receiveShadow` — every game scene
// already carries a `HemisphereLight` + `DirectionalLight`, so this just
// works, but the pole is upgraded to match (D1's geometry-verbatim decision
// covers the whole marker, and a thin unlit stick next to a lit BTK-scale
// flag would read wrong).
//
// World axes match the scene: +X right, +Y up, downrange −Z (same convention
// as RangeScene / ScopeView).

import * as THREE from 'three';
import type { WindMarkerSpec, MarkerStyle } from '../range/wind-markers-config';
import { FLAG_CONFIG, type WindFlagVisualConfig } from '../range/wind-marker-visual-config';
import {
  yawFromWind,
  speedFactor,
  horizontalSpeed,
  smoothYaw,
  smoothAngle,
  markerAngleDeg,
  flapFrequencyHz,
  advanceWavePhase,
  type AngleResponseCurve,
  type Vec3,
} from '../game/wind-marker-model';
import { mpsToMph, degToRad, radToDeg } from '../units';

// --- pole (shared by flag + sock per D5 — the marker root owns exactly one
// pole; neither renderer creates its own) ------------------------------------
const POLE_COLOR = 0x606060;
const POLE_METALNESS = 0.4;
const POLE_ROUGHNESS = 0.6;
const POLE_RADIAL_SEGMENTS = 16;

// --- sock tunables (visual feel only — UNCHANGED from 1.7b; ported in W3) --
const MOUNT_HEIGHT_FRACTION = 0.92; // sock's solo mount height, near the pole top

const SOCK_LENGTH_M = 0.7;
const SOCK_RADIUS_MOUTH_M = 0.14; // wide end, at the hinge (faces "into" the wind)
const SOCK_RADIUS_TIP_M = 0.03; // narrow end, at the free/downwind tip
const SOCK_RADIAL_SEGMENTS = 10;
const SOCK_COLOR = 0xff7a1a;
const SOCK_SECOND_HEIGHT_M = 1.5; // when 'both': mount the sock lower than the flag

/** Reference speed for the sock's (interim, pre-W3) visual droop curve (NOT
 *  the ballistics D3b gustScale). */
const MARKER_SPEED_REFERENCE_MPS = 5.5; // ≈ 12 mph
const YAW_SMOOTH_RATE = 2.5; // 1/s — settle time so direction doesn't snap

/** BTK's flag angle-response curve, read off `FLAG_CONFIG` (wind-marker-
 *  visual-config.ts, transcribed verbatim from BTK per D1). */
const FLAG_ANGLE_CURVE: AngleResponseCurve = {
  minAngle: FLAG_CONFIG.minAngle,
  maxAngle: FLAG_CONFIG.maxAngle,
  flatSpeed: FLAG_CONFIG.flatSpeed,
  responseExp: FLAG_CONFIG.responseExp,
};

interface DroopingMesh {
  mesh: THREE.Mesh;
  pivot: THREE.Group; // rotation.x = droop angle
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

interface FlagMeshState {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  instanceAngleRad: Float32Array;
  instanceDirRad: Float32Array;
  instanceWavePhase: Float32Array;
}

interface MarkerInstance {
  spec: WindMarkerSpec;
  root: THREE.Group; // pole only (D5) — positioned at the marker's world location
  poleMesh: THREE.Mesh;
  // Flag smoothing state (W2) — index-aligned with `WindMarkersState.flag`'s
  // instance attribute buffers; the flag mesh itself is NOT a child of `root`
  // (it's one shared InstancedMesh positioned by its own instance matrix).
  flagAngleRad: number;
  flagDirRad: number;
  flagWavePhase: number;
  // Sock (1.7b interim; ported W3) — a child of `root`, unchanged.
  sockYawGroup: THREE.Group | null;
  sock: DroopingMesh | null;
  yaw: number; // shared sock droop/yaw heading
}

interface WindMarkersState {
  scene: THREE.Scene;
  style: MarkerStyle;
  instances: MarkerInstance[];
  flag: FlagMeshState | null; // null when the style has no flag
}

let state: WindMarkersState | null = null;

function buildPole(spec: WindMarkerSpec): THREE.Mesh {
  const poleRadius = FLAG_CONFIG.poleThicknessM / 2;
  const geo = new THREE.CylinderGeometry(poleRadius, poleRadius, spec.poleHeightM, POLE_RADIAL_SEGMENTS);
  const material = new THREE.MeshStandardMaterial({
    color: POLE_COLOR,
    metalness: POLE_METALNESS,
    roughness: POLE_ROUGHNESS,
  });
  const mesh = new THREE.Mesh(geo, material);
  mesh.position.y = spec.poleHeightM / 2; // CylinderGeometry is centred at its own origin
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}

/** Sock geometry: a tapered, open-ended cylinder spanning local Z from 0
 *  (wide mouth, at the hinge) to SOCK_LENGTH_M (narrow tip) — unchanged from
 *  1.7b; see the file header for the rotateX/translate derivation. Ported to
 *  BTK's rigid-body sock in W3. */
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
  return { mesh, pivot, geometry, material };
}

// --- flag geometry (ported from BTK's WindFlagFactory.createFlagGeometry) --

/**
 * Static tapered-cloth geometry with a `segmentT` attribute (0 at the hinge,
 * 1 at the free tip) that the vertex shader reads to drive the pitch/furl/
 * flap deformation. Exported (pure, no DOM) so it's unit-testable without a
 * THREE.Scene/canvas — see `WindMarkers.test.ts`.
 *
 * Local space: X runs 0 (hinge) → `cfg.lengthM` (tip) — the flag's "forward"
 * axis; Y is width (top/bottom); Z is thickness (front/back faces).
 */
export function createFlagGeometry(cfg: WindFlagVisualConfig = FLAG_CONFIG): THREE.BufferGeometry {
  const segments = cfg.segments;
  const halfThickness = cfg.thicknessM / 2;

  const positions: number[] = [];
  const uvs: number[] = [];
  const segmentTs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < segments; i++) {
    const t = i / (segments - 1);
    const halfWidth = cfg.baseWidthM / 2 + (cfg.tipWidthM / 2 - cfg.baseWidthM / 2) * t;
    const x = cfg.lengthM * t;

    // Front face vertices (z = +halfThickness)
    positions.push(x, halfWidth, halfThickness);
    uvs.push(t, 0.0);
    segmentTs.push(t);

    positions.push(x, -halfWidth, halfThickness);
    uvs.push(t, 1.0);
    segmentTs.push(t);

    // Back face vertices (z = -halfThickness)
    positions.push(x, halfWidth, -halfThickness);
    uvs.push(t, 0.0);
    segmentTs.push(t);

    positions.push(x, -halfWidth, -halfThickness);
    uvs.push(t, 1.0);
    segmentTs.push(t);
  }

  for (let i = 0; i < segments - 1; i++) {
    const idx = i * 4;

    // Front face triangles
    indices.push(idx, idx + 1, idx + 4);
    indices.push(idx + 1, idx + 5, idx + 4);

    // Back face triangles (reverse winding)
    indices.push(idx + 2, idx + 6, idx + 3);
    indices.push(idx + 3, idx + 6, idx + 7);

    // Top edge
    indices.push(idx, idx + 4, idx + 2);
    indices.push(idx + 2, idx + 4, idx + 6);

    // Bottom edge
    indices.push(idx + 1, idx + 3, idx + 5);
    indices.push(idx + 3, idx + 7, idx + 5);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('segmentT', new THREE.Float32BufferAttribute(segmentTs, 1));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();

  // P7: Three computes the bounding sphere from the UNDEFORMED positions —
  // a flag the shader swings up to `lengthM` off-axis (plus flutter/furl)
  // would pop out of view near the screen edge at high zoom. Set an explicit
  // sphere sized to the flag's max 3D extent, +10% margin (BTK verbatim).
  const halfMaxWidth = Math.max(cfg.baseWidthM, cfg.tipWidthM) * 0.5;
  const maxWave = cfg.flapAmplitude;
  const radius = Math.sqrt(cfg.lengthM * cfg.lengthM + halfMaxWidth * halfMaxWidth + maxWave * maxWave);
  geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), radius * 1.1);

  return geometry;
}

/** Iconic red/yellow banded flag texture — ported verbatim from
 *  `WindFlagFactory.createFlagTexture`. */
function createFlagTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = '#ff0000';
  ctx.fillRect(0, 0, 256, 128);
  ctx.fillStyle = '#ffff00';
  ctx.fillRect(0, 128, 256, 128);

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

/**
 * Instanced flag material: a `MeshStandardMaterial` patched via
 * `onBeforeCompile` to deform the cloth per-instance from `instanceAngleRad`/
 * `instanceDirRad`/`instanceWavePhase` (D6). Ported from
 * `WindFlagFactory.createInstancedMaterial` with BTK's own wind-vector-driven
 * response replaced by the CPU-precomputed attributes (see the file header).
 */
function createFlagMaterial(cfg: WindFlagVisualConfig): THREE.MeshStandardMaterial {
  const material = new THREE.MeshStandardMaterial({
    map: createFlagTexture(),
    color: 0xffffff,
    roughness: 0.8,
    metalness: 0.0,
    side: THREE.DoubleSide,
  });

  material.onBeforeCompile = (shader) => {
    shader.uniforms.uFlagLength = { value: cfg.lengthM };
    shader.uniforms.uFlapAmplitude = { value: cfg.flapAmplitude };
    shader.uniforms.uWaveLength = { value: cfg.waveLength };
    shader.uniforms.uFurlBase = { value: cfg.furlBase };
    shader.uniforms.uFurlWave = { value: cfg.furlWave };

    shader.vertexShader = shader.vertexShader.replace(
      '#include <common>',
      `
      #include <common>

      attribute float segmentT;
      attribute float instanceAngleRad;
      attribute float instanceDirRad;
      attribute float instanceWavePhase;

      uniform float uFlagLength;
      uniform float uFlapAmplitude;
      uniform float uWaveLength;
      uniform float uFurlBase;   // steady roll root->tip (radians)
      uniform float uFurlWave;   // travelling furl flutter (radians)

      // Deformed position at given local coordinates, given an already-
      // smoothed pitch angle + direction (D6 — computed on the CPU, once, in
      // game/wind-marker-model.ts; NOT re-derived from a raw wind vector here).
      vec3 computeDeformedPosition(float localX, float localY, float localZ, float t) {
        // Quadratic bending: more curvature toward the tip.
        float xNorm = localX / uFlagLength;
        float bend = xNorm * xNorm;

        // Wave/flapping animation — phase is pre-accumulated on the CPU
        // (advanceWavePhase) to avoid time*freq jumps when freq changes.
        float waveArg = instanceWavePhase + t * uWaveLength * 6.28318;
        float waveOffset = sin(waveArg) * uFlapAmplitude * t;

        // Furl: roll the cross-section (width localY, thickness localZ)
        // about the length axis, accumulating root->tip with a travelling
        // flutter, scaled by how "open" the smoothed angle is — flat when
        // calm, furled into a 3D form when blowing. windFactor is derived
        // from the SAME smoothed angle the pitch below uses (not
        // re-computed from wind), so furl tracks the D7 smoothing too.
        float angleDeg = instanceAngleRad * 57.29577951;
        float windFactor = clamp(angleDeg / 60.0, 0.0, 1.0);
        float furl = (uFurlBase * t + uFurlWave * sin(waveArg) * t) * windFactor;
        float cf = cos(furl);
        float sf = sin(furl);
        float widthCoord = localY * cf - localZ * sf;
        float outOfPlane = localY * sf + localZ * cf + waveOffset;

        // Pitch: rotate the bent length down from vertical.
        float sinPitch = sin(instanceAngleRad);
        float cosPitch = cos(instanceAngleRad);
        float pitchedX = bend * uFlagLength * sinPitch;
        float pitchedY = bend * uFlagLength * -cosPitch;

        // Rotate into the wind direction. instanceDirRad follows this
        // codebase's yawFromWind convention (Y-axis rotation: local
        // "forward" -> world (sinθ,cosθ)) — a deliberate D6 deviation from
        // BTK's own windDir/(cosDir,-sinDir) parametrization; the two are
        // the same rotation (see yawFromWind's P1 doc comment).
        float sinDir = sin(instanceDirRad);
        float cosDir = cos(instanceDirRad);
        float rotatedX = pitchedX * sinDir + outOfPlane * cosDir;
        float rotatedY = pitchedY + widthCoord;
        float rotatedZ = pitchedX * cosDir - outOfPlane * sinDir;

        return vec3(rotatedX, rotatedY, rotatedZ);
      }
      `,
    );

    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `
      #include <begin_vertex>

      // Local deformed position - the instance matrix handles world position.
      transformed = computeDeformedPosition(position.x, position.y, position.z, segmentT);
      `,
    );

    // P4: recompute the normal from finite differences of the SAME deformed
    // position — without this the lit cloth shades as if it were still flat,
    // and the furl disappears visually even though the geometry moved.
    shader.vertexShader = shader.vertexShader.replace(
      '#include <beginnormal_vertex>',
      `
      vec3 nP = computeDeformedPosition(position.x, position.y, position.z, segmentT);

      // Tangent along flag length — step in physical space (resolution-
      // independent of segment count).
      float nDx = uFlagLength * 0.001;
      float nTNext = clamp(segmentT + 0.001, 0.0, 1.0);
      vec3 nPt = computeDeformedPosition(position.x + nDx, position.y, position.z, nTNext);
      vec3 objectTangent = normalize(nPt - nP);

      // Bitangent along flag width.
      float nDy = 0.001;
      vec3 nPy = computeDeformedPosition(position.x, position.y + nDy, position.z, segmentT);
      vec3 objectBitangent = normalize(nPy - nP);

      vec3 objectNormal = normalize(cross(objectTangent, objectBitangent));
      `,
    );
  };

  return material;
}

/** World position of the flag's attachment point: pole top minus half the
 *  flag's own base width (BTK: `pos.y + poleHeight - flagBaseWidth/2`). */
function flagAttachWorldPos(spec: WindMarkerSpec): Vec3 {
  return {
    x: spec.xOffsetM,
    y: spec.groundYM + spec.poleHeightM - FLAG_CONFIG.baseWidthM / 2,
    z: -spec.distanceM,
  };
}

function buildFlagInstancedMesh(scene: THREE.Scene, markers: readonly WindMarkerSpec[]): FlagMeshState {
  const geometry = createFlagGeometry(FLAG_CONFIG);
  const numFlags = markers.length;

  const instanceAngleRad = new Float32Array(numFlags);
  const instanceDirRad = new Float32Array(numFlags);
  const instanceWavePhase = new Float32Array(numFlags);
  for (let i = 0; i < numFlags; i++) {
    instanceAngleRad[i] = degToRad(FLAG_CONFIG.minAngle);
    instanceDirRad[i] = 0;
    instanceWavePhase[i] = Math.random() * Math.PI * 2; // random initial phase (BTK verbatim)
  }
  geometry.setAttribute('instanceAngleRad', new THREE.InstancedBufferAttribute(instanceAngleRad, 1));
  geometry.setAttribute('instanceDirRad', new THREE.InstancedBufferAttribute(instanceDirRad, 1));
  geometry.setAttribute('instanceWavePhase', new THREE.InstancedBufferAttribute(instanceWavePhase, 1));

  const material = createFlagMaterial(FLAG_CONFIG);

  const mesh = new THREE.InstancedMesh(geometry, material, numFlags);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.raycast = () => {}; // cloth isn't a valid aim/rangefinder target (BTK verbatim)

  const matrix = new THREE.Matrix4();
  for (let i = 0; i < numFlags; i++) {
    const p = flagAttachWorldPos(markers[i]);
    matrix.makeTranslation(p.x, p.y, p.z);
    mesh.setMatrixAt(i, matrix);
  }
  mesh.instanceMatrix.needsUpdate = true;

  scene.add(mesh);
  return { mesh, geometry, material, instanceAngleRad, instanceDirRad, instanceWavePhase };
}

function disposeFlagMesh(scene: THREE.Scene, flag: FlagMeshState): void {
  scene.remove(flag.mesh);
  flag.geometry.dispose();
  flag.material.map?.dispose(); // P8: today's old flag had no texture to dispose; this one does
  flag.material.dispose();
}

function buildMarker(scene: THREE.Scene, spec: WindMarkerSpec, style: MarkerStyle): MarkerInstance {
  const root = new THREE.Group();
  // groundYM (wind-system-btk-port W1, P5): flat 0 on Range A, the sloped ELR
  // terrain height elsewhere — was hardcoded 0, which buried the ELR ladder's
  // poles up to the flag in the hillside.
  root.position.set(spec.xOffsetM, spec.groundYM, -spec.distanceM);

  const poleMesh = buildPole(spec);
  root.add(poleMesh);

  let sock: DroopingMesh | null = null;
  let sockYawGroup: THREE.Group | null = null;
  const wantSock = style === 'sock' || style === 'both';
  if (wantSock) {
    sock = buildSockMesh();
    sockYawGroup = new THREE.Group();
    sockYawGroup.position.y = style === 'both' ? SOCK_SECOND_HEIGHT_M : spec.poleHeightM * MOUNT_HEIGHT_FRACTION;
    sockYawGroup.add(sock.pivot);
    root.add(sockYawGroup);
  }

  scene.add(root);
  return {
    spec,
    root,
    poleMesh,
    flagAngleRad: degToRad(FLAG_CONFIG.minAngle),
    flagDirRad: 0,
    flagWavePhase: Math.random() * Math.PI * 2,
    sockYawGroup,
    sock,
    yaw: 0,
  };
}

function disposeMarker(scene: THREE.Scene, instance: MarkerInstance): void {
  scene.remove(instance.root);
  instance.poleMesh.geometry.dispose();
  (instance.poleMesh.material as THREE.Material).dispose();
  if (instance.sock) {
    instance.sock.geometry.dispose();
    instance.sock.material.dispose();
  }
}

/** Build every marker at `style`. Idempotent (a repeat call with the same
 *  style is a no-op; call `disposeWindMarkers()` first to force a rebuild). */
export function initWindMarkers(scene: THREE.Scene, markers: readonly WindMarkerSpec[], style: MarkerStyle): void {
  if (state) return;
  const instances = markers.map((spec) => buildMarker(scene, spec, style));
  const wantFlag = style === 'flag' || style === 'both';
  const flag = wantFlag ? buildFlagInstancedMesh(scene, markers) : null;
  state = { scene, style, instances, flag };
}

/** Rebuild all markers with a new style (dispose + reconstruct). No-op if the
 *  style hasn't actually changed. */
function rebuildWithStyle(style: MarkerStyle): void {
  if (!state) return;
  const { scene, instances: oldInstances, flag: oldFlag } = state;
  const markers = oldInstances.map((i) => i.spec);
  for (const instance of oldInstances) disposeMarker(scene, instance);
  if (oldFlag) disposeFlagMesh(scene, oldFlag);

  const instances = markers.map((spec) => buildMarker(scene, spec, style));
  const wantFlag = style === 'flag' || style === 'both';
  const flag = wantFlag ? buildFlagInstancedMesh(scene, markers) : null;
  state = { scene, style, instances, flag };
}

/** Advance the shared flag InstancedMesh one frame: sample wind at each
 *  flag's own attachment point, smooth angle (`smoothAngle`, rate-limited,
 *  D7) and direction (`smoothYaw`, exponential) toward BTK's response curve
 *  (`markerAngleDeg`), accumulate flap phase, and push into the instance
 *  attribute buffers (P8: `needsUpdate` every frame). */
function updateFlagInstances(markersState: WindMarkersState, dt: number, windAt: (worldPos: Vec3) => Vec3): void {
  const flag = markersState.flag;
  if (!flag) return;

  for (let i = 0; i < markersState.instances.length; i++) {
    const instance = markersState.instances[i];
    const wind = windAt(flagAttachWorldPos(instance.spec));
    const speedMps = horizontalSpeed(wind);
    const speedMph = mpsToMph(speedMps);

    const targetAngleDeg = markerAngleDeg(speedMph, FLAG_ANGLE_CURVE);
    const smoothedAngleDeg = smoothAngle(
      radToDeg(instance.flagAngleRad),
      targetAngleDeg,
      FLAG_CONFIG.angleInterpolationSpeed,
      dt,
    );
    instance.flagAngleRad = degToRad(smoothedAngleDeg);

    const targetDirRad = speedMps > 1e-6 ? yawFromWind(wind) : instance.flagDirRad;
    instance.flagDirRad = smoothYaw(instance.flagDirRad, targetDirRad, FLAG_CONFIG.directionInterpolationSpeed, dt);

    const freqHz = flapFrequencyHz(speedMph, FLAG_CONFIG.flapFrequencyBase, FLAG_CONFIG.flapFrequencyScale);
    instance.flagWavePhase = advanceWavePhase(instance.flagWavePhase, freqHz, dt);

    flag.instanceAngleRad[i] = instance.flagAngleRad;
    flag.instanceDirRad[i] = instance.flagDirRad;
    flag.instanceWavePhase[i] = instance.flagWavePhase;
  }

  flag.mesh.geometry.attributes.instanceAngleRad.needsUpdate = true;
  flag.mesh.geometry.attributes.instanceDirRad.needsUpdate = true;
  flag.mesh.geometry.attributes.instanceWavePhase.needsUpdate = true;
}

/**
 * Advance every marker one frame: rebuild (lazily) if `style` has changed,
 * then sample the live wind at each marker's world position (`windAt` — the
 * caller's `meanVector + gustScale × field.sample(worldPos)`, D2/D3b) and
 * drive the flag's instanced shader attributes (W2) and/or the sock's
 * (interim, pre-W3) droop pivot. `t` is reserved for W3's sock sway phase —
 * unused here since flag flutter now runs on an internally-accumulated phase
 * (`advanceWavePhase`), not the render loop's elapsed clock.
 */
export function updateWindMarkers(
  dt: number,
  _t: number,
  style: MarkerStyle,
  windAt: (worldPos: Vec3) => Vec3,
): void {
  if (!state) return;
  if (state.style !== style) rebuildWithStyle(style);
  if (!state) return; // defensive; rebuildWithStyle always re-sets state

  updateFlagInstances(state, dt, windAt);

  for (const instance of state.instances) {
    if (!instance.sock) continue;
    const worldPos: Vec3 = { x: instance.root.position.x, y: 0, z: instance.root.position.z };
    const wind = windAt(worldPos);
    const speed = horizontalSpeed(wind);
    const factor = speedFactor(speed, MARKER_SPEED_REFERENCE_MPS);
    const targetYaw = speed > 1e-6 ? yawFromWind(wind) : instance.yaw; // becalmed: hold last heading
    instance.yaw = smoothYaw(instance.yaw, targetYaw, YAW_SMOOTH_RATE, dt);
    const droopAngle = (1 - factor) * (Math.PI / 2);

    if (instance.sockYawGroup) instance.sockYawGroup.rotation.y = instance.yaw;
    instance.sock.pivot.rotation.x = droopAngle;
  }
}

/** Tear down all marker resources. Idempotent. */
export function disposeWindMarkers(): void {
  if (!state) return;
  for (const instance of state.instances) disposeMarker(state.scene, instance);
  if (state.flag) disposeFlagMesh(state.scene, state.flag);
  state = null;
}
