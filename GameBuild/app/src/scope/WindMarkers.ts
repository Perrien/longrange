// Wind flags/socks renderer. Flag half ported wind-system-btk-port W2 from
// BTK's `WindFlagFactory` (`BallisticsToolkit/web/steel-sim/WindFlag.js`);
// sock half ported W3 from BTK's `WindSockFactory`
// (`BallisticsToolkit/web/steel-sim/WindSock.js`) — both MIT, copied per P22
// (BTK is local-only/git-ignored and cannot be imported from). The
// angle/direction/flutter/sway MATH lives in the pure, tested
// `game/wind-marker-model.ts`; visual dimensions/response curves live in
// `range/wind-marker-visual-config.ts`. This file only builds meshes and
// writes that math into shader attributes / instance matrices each frame.
//
// --- Shared architecture (D5/D6) --------------------------------------------
// The marker ROOT (one `THREE.Group` per marker spec) owns exactly one thing:
// the pole. Neither the flag nor the sock renderer creates its own pole
// (BTK's own factories each build one, which would double up under the
// game's 'both' style — D5 factors it out). Both cloth types are instead each
// a single SHARED `THREE.InstancedMesh` spanning every marker in the active
// ladder (BTK's own architecture: one instanced draw call per marker TYPE, not
// one mesh per marker) — per-instance ANIMATION state is written into
// `InstancedBufferAttribute`s (flag) or a per-instance matrix (sock) every
// frame; the response curve that drives that state (`markerAngleDeg`,
// `yawFromWind`) is computed ONCE, on the CPU, in the tested pure model — a
// deliberate D6 deviation from BTK, which recomputes it twice per flag inside
// its own vertex shader (position + normal) from a raw wind vector.
//
// The flag's rotation math is NOT BTK's own `windDir = atan2(-z,x)` /
// `(cosDir,-sinDir)` parametrization; both the flag (in-shader) and the sock
// (its rigid-body axis) use `yawFromWind`'s `θ = atan2(x,z)` convention
// instead — see `yawFromWind`'s doc comment in wind-marker-model.ts for the
// proof that BTK's own formula is the same rotation (P1), and standardize on
// the one this codebase already tests (one direction convention, not two).
//
// P4 (unlit → lit): today's PRE-PORT markers were flat `MeshBasicMaterial`.
// BTK's are `MeshStandardMaterial` with `castShadow`/`receiveShadow` — every
// game scene already carries a `HemisphereLight` + `DirectionalLight`, so
// this just works. The pole was upgraded alongside the flag in W2 (D1's
// geometry-verbatim decision covers the whole marker).
//
// World axes match the scene: +X right, +Y up, downrange −Z (same convention
// as RangeScene / ScopeView).

import * as THREE from 'three';
import type { WindMarkerSpec, MarkerStyle } from '../range/wind-markers-config';
import {
  FLAG_CONFIG,
  SOCK_CONFIG,
  type WindFlagVisualConfig,
  type WindSockVisualConfig,
} from '../range/wind-marker-visual-config';
import {
  yawFromWind,
  horizontalSpeed,
  smoothYaw,
  smoothAngle,
  markerAngleDeg,
  flapFrequencyHz,
  advanceWavePhase,
  swayWindFactor,
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

/** When the style is `'both'`, the sock mounts lower than the flag so the two
 *  don't visually overlap near the pole top (both BTK anchor points — the
 *  flag's `poleHeight - baseWidth/2` and the sock's bare `poleHeight` — sit
 *  within a few inches of each other). BTK itself has no combined style; this
 *  override is game-specific, carried over unchanged from the pre-port
 *  marker (1.7b's `SOCK_SECOND_HEIGHT_M`), well clear of both the 2.74 m pole
 *  top and the flag's ~2.51 m attach point. */
const SOCK_BOTH_HEIGHT_M = 1.5;

/** BTK hardcodes this inline in `WindSockFactory.updateTransforms` (not part
 *  of `WIND_SOCK_CONFIG`) as the speed at which the decorative sway reaches
 *  full strength. */
const SOCK_SWAY_WIND_FULL_MPH = 12;

/** BTK's flag angle-response curve, read off `FLAG_CONFIG` (wind-marker-
 *  visual-config.ts, transcribed verbatim from BTK per D1). */
const FLAG_ANGLE_CURVE: AngleResponseCurve = {
  minAngle: FLAG_CONFIG.minAngle,
  maxAngle: FLAG_CONFIG.maxAngle,
  flatSpeed: FLAG_CONFIG.flatSpeed,
  responseExp: FLAG_CONFIG.responseExp,
};

/** BTK's sock angle-response curve, read off `SOCK_CONFIG`. */
const SOCK_ANGLE_CURVE: AngleResponseCurve = {
  minAngle: SOCK_CONFIG.minAngle,
  maxAngle: SOCK_CONFIG.maxAngle,
  flatSpeed: SOCK_CONFIG.flatSpeed,
  responseExp: SOCK_CONFIG.responseExp,
};

interface FlagMeshState {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  instanceAngleRad: Float32Array;
  instanceDirRad: Float32Array;
  instanceWavePhase: Float32Array;
}

interface SockMeshState {
  mesh: THREE.InstancedMesh;
  geometry: THREE.BufferGeometry;
  material: THREE.MeshStandardMaterial;
  stringLines: THREE.LineSegments;
  stringGeometry: THREE.BufferGeometry;
  stringMaterial: THREE.LineBasicMaterial;
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
  // Sock smoothing state (W3) — likewise index-aligned with the shared sock
  // InstancedMesh; independent of the flag's own state (BTK treats
  // `WindFlagFactory`/`WindSockFactory` as fully separate systems).
  sockAngleRad: number;
  sockDirRad: number;
  sockSwayPhase: number;
}

interface WindMarkersState {
  scene: THREE.Scene;
  style: MarkerStyle;
  instances: MarkerInstance[];
  flag: FlagMeshState | null; // null when the style has no flag
  sock: SockMeshState | null; // null when the style has no sock
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

// === Flag (wind-system-btk-port W2, ported from WindFlagFactory) ===========

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
  flag.material.map?.dispose();
  flag.material.dispose();
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

// === Sock (wind-system-btk-port W3, ported from WindSockFactory) ===========

/**
 * Tapered open-ended tube geometry along local +X (mouth at 0, tail at
 * `cfg.sockLengthM`) — the whole mesh is oriented as a rigid body each frame
 * (`computeSockPose`), unlike the flag's per-vertex shader deform. Exported
 * (pure, no DOM) so it's unit-testable without a THREE.Scene/canvas.
 */
export function createSockGeometry(cfg: WindSockVisualConfig = SOCK_CONFIG): THREE.BufferGeometry {
  const radial = cfg.radialSegments;
  const lengthSegs = cfg.lengthSegments;
  const length = cfg.sockLengthM;
  const mouthR = cfg.sockMouthRadiusM;
  const tailR = cfg.sockTailRadiusM;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let j = 0; j <= lengthSegs; j++) {
    const t = j / lengthSegs;
    const x = length * t;
    const r = mouthR + (tailR - mouthR) * t;
    for (let k = 0; k <= radial; k++) {
      const theta = (k / radial) * Math.PI * 2;
      positions.push(x, r * Math.cos(theta), r * Math.sin(theta));
      uvs.push(t, k / radial);
    }
  }

  const ringStride = radial + 1;
  for (let j = 0; j < lengthSegs; j++) {
    for (let k = 0; k < radial; k++) {
      const a = j * ringStride + k;
      const b = a + 1;
      const c = a + ringStride;
      const d = c + 1;
      indices.push(a, c, b);
      indices.push(b, c, d);
    }
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // No explicit boundingSphere (unlike the flag): the sock's matrices are
  // recomputed on the CPU every frame (a rigid-body rotation, not a shader
  // deform), so `frustumCulled = false` is set on the mesh instead (P7) — a
  // static sphere sized for a static instance transform wouldn't be
  // meaningful here.
  return geometry;
}

/** Banded orange/white sock texture — ported verbatim from
 *  `WindSockFactory.createSockTexture`. */
function createSockTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 128;
  canvas.height = 16;
  const ctx = canvas.getContext('2d')!;

  const bands = 5;
  const bandWidth = canvas.width / bands;
  for (let i = 0; i < bands; i++) {
    ctx.fillStyle = i % 2 === 0 ? '#ff6a00' : '#f2f2f2';
    ctx.fillRect(i * bandWidth, 0, Math.ceil(bandWidth), canvas.height);
  }

  const texture = new THREE.CanvasTexture(canvas);
  texture.needsUpdate = true;
  return texture;
}

function createSockMaterial(): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({
    map: createSockTexture(),
    color: 0xffffff,
    roughness: 0.85,
    metalness: 0.0,
    side: THREE.DoubleSide, // open tube - inside is visible
  });
}

export interface SockPose {
  /** Unit vector: the sock's local +X (mouth→tail) axis, in world space. */
  axis: THREE.Vector3;
  quaternion: THREE.Quaternion;
  /** World position of the mouth (one string-length out from the anchor). */
  mouthPosition: THREE.Vector3;
}

const SOCK_LOCAL_X_AXIS = new THREE.Vector3(1, 0, 0);

/**
 * Rigid-body pose for a sock at a given (already-smoothed) pitch/direction —
 * ported from `WindSockFactory.updateTransforms`'s per-frame axis/quaternion
 * math. `pitchRad` is measured from vertical (0 = straight down); `dirRad`
 * follows `yawFromWind`'s convention, NOT BTK's own `atan2(-z,x)` (a W3
 * extension of the W2 flag's D6 standardization — see the file header): at
 * full pitch (π/2) the axis points along `(sin(dirRad), 0, cos(dirRad))`,
 * matching the flag's tip-displacement direction for the same wind (P1).
 * At zero pitch the axis is straight down regardless of direction (a calm
 * sock hangs limp, with no defined heading).
 */
export function computeSockPose(
  anchor: THREE.Vector3,
  pitchRad: number,
  dirRad: number,
  cfg: WindSockVisualConfig = SOCK_CONFIG,
): SockPose {
  const sinP = Math.sin(pitchRad);
  const cosP = Math.cos(pitchRad);
  const sinDir = Math.sin(dirRad);
  const cosDir = Math.cos(dirRad);

  const axis = new THREE.Vector3(sinP * sinDir, -cosP, sinP * cosDir).normalize();
  const quaternion = new THREE.Quaternion().setFromUnitVectors(SOCK_LOCAL_X_AXIS, axis);
  const mouthPosition = anchor.clone().addScaledVector(axis, cfg.stringLengthM);

  return { axis, quaternion, mouthPosition };
}

/** World position of the sock's anchor (pole-top swivel point). Under the
 *  `'both'` style the sock mounts lower (`SOCK_BOTH_HEIGHT_M`) so it doesn't
 *  overlap the flag — see that constant's doc comment. */
function sockAnchorWorldPos(spec: WindMarkerSpec, style: MarkerStyle): Vec3 {
  const heightM = style === 'both' ? SOCK_BOTH_HEIGHT_M : spec.poleHeightM;
  return { x: spec.xOffsetM, y: spec.groundYM + heightM, z: -spec.distanceM };
}

/** Write one sock's two strings (anchor → mouth rim, ±local Y) into the
 *  shared `LineSegments` position buffer at instance `i` (4 vertices/sock —
 *  BTK verbatim). */
function writeSockStrings(stringPos: THREE.BufferAttribute, i: number, anchor: THREE.Vector3, pose: SockPose): void {
  const rimUp = new THREE.Vector3(0, SOCK_CONFIG.sockMouthRadiusM, 0).applyQuaternion(pose.quaternion);
  const rimDown = new THREE.Vector3(0, -SOCK_CONFIG.sockMouthRadiusM, 0).applyQuaternion(pose.quaternion);

  const base = i * 4;
  stringPos.setXYZ(base + 0, anchor.x, anchor.y, anchor.z);
  stringPos.setXYZ(base + 1, pose.mouthPosition.x + rimUp.x, pose.mouthPosition.y + rimUp.y, pose.mouthPosition.z + rimUp.z);
  stringPos.setXYZ(base + 2, anchor.x, anchor.y, anchor.z);
  stringPos.setXYZ(
    base + 3,
    pose.mouthPosition.x + rimDown.x,
    pose.mouthPosition.y + rimDown.y,
    pose.mouthPosition.z + rimDown.z,
  );
}

function buildSockInstancedMesh(scene: THREE.Scene, markers: readonly WindMarkerSpec[]): SockMeshState {
  const geometry = createSockGeometry(SOCK_CONFIG);
  const material = createSockMaterial();
  const numSocks = markers.length;

  const mesh = new THREE.InstancedMesh(geometry, material, numSocks);
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // P7: matrices are computed on the CPU every frame
  mesh.raycast = () => {}; // not interactive (BTK verbatim)
  scene.add(mesh);

  // 2 strings * 2 endpoints * 3 coords = 12 floats/sock.
  const stringPositions = new Float32Array(numSocks * 12);
  const stringGeometry = new THREE.BufferGeometry();
  stringGeometry.setAttribute('position', new THREE.BufferAttribute(stringPositions, 3));
  const stringMaterial = new THREE.LineBasicMaterial({ color: 0x333333 });
  const stringLines = new THREE.LineSegments(stringGeometry, stringMaterial);
  stringLines.frustumCulled = false;
  // Not interactive: LineSegments use the raycaster's Line threshold (~1 m),
  // so at long range these thin strings would catch the rangefinder/aim pick
  // over a wide zone at the sock's height — excluded so ranging reads through
  // to the terrain/target (BTK's own reasoning; the game's `findAimed` has
  // the same exposure). The pole, a solid cylinder, is only hit when aimed
  // at it directly.
  stringLines.raycast = () => {};
  scene.add(stringLines);

  return { mesh, geometry, material, stringLines, stringGeometry, stringMaterial };
}

function disposeSockMesh(scene: THREE.Scene, sock: SockMeshState): void {
  scene.remove(sock.mesh);
  sock.geometry.dispose();
  sock.material.map?.dispose();
  sock.material.dispose();
  scene.remove(sock.stringLines);
  sock.stringGeometry.dispose();
  sock.stringMaterial.dispose();
}

/** Prime the sock instances' matrices/strings from their INITIAL smoothing
 *  state, without sampling wind at all — ported from BTK's
 *  `updateTransforms(0, null)` call at the end of `createFlagsAtPositions`,
 *  so nothing pops at the world origin on the frame before the first real
 *  `updateWindMarkers` call. */
function primeSockInstances(sock: SockMeshState, instances: readonly MarkerInstance[], style: MarkerStyle): void {
  const matrix = new THREE.Matrix4();
  const scaleVec = new THREE.Vector3(1, 1, 1);
  const stringPos = sock.stringGeometry.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < instances.length; i++) {
    const instance = instances[i];
    const anchor = sockAnchorWorldPos(instance.spec, style);
    const anchorVec = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    const pose = computeSockPose(anchorVec, instance.sockAngleRad, instance.sockDirRad, SOCK_CONFIG);

    matrix.compose(pose.mouthPosition, pose.quaternion, scaleVec);
    sock.mesh.setMatrixAt(i, matrix);
    writeSockStrings(stringPos, i, anchorVec, pose);
  }

  sock.mesh.instanceMatrix.needsUpdate = true;
  stringPos.needsUpdate = true;
}

/** Advance the shared sock InstancedMesh (+ strings) one frame: sample wind
 *  at each sock's anchor, smooth angle/direction toward BTK's response curve
 *  the same way the flag does, add a small wind-scaled sway (`swayWindFactor`
 *  — "never looks rigid", BTK's own comment) to the direction only, then
 *  recompute the rigid-body pose and write the instance matrix + strings. */
function updateSockInstances(markersState: WindMarkersState, dt: number, windAt: (worldPos: Vec3) => Vec3): void {
  const sock = markersState.sock;
  if (!sock) return;

  const matrix = new THREE.Matrix4();
  const scaleVec = new THREE.Vector3(1, 1, 1);
  const stringPos = sock.stringGeometry.getAttribute('position') as THREE.BufferAttribute;

  for (let i = 0; i < markersState.instances.length; i++) {
    const instance = markersState.instances[i];
    const anchor = sockAnchorWorldPos(instance.spec, markersState.style);
    const wind = windAt(anchor);
    const speedMps = horizontalSpeed(wind);
    const speedMph = mpsToMph(speedMps);

    const targetAngleDeg = markerAngleDeg(speedMph, SOCK_ANGLE_CURVE);
    instance.sockAngleRad = degToRad(
      smoothAngle(radToDeg(instance.sockAngleRad), targetAngleDeg, SOCK_CONFIG.angleInterpolationSpeed, dt),
    );

    const targetDirRad = speedMps > 1e-6 ? yawFromWind(wind) : instance.sockDirRad;
    instance.sockDirRad = smoothYaw(instance.sockDirRad, targetDirRad, SOCK_CONFIG.directionInterpolationSpeed, dt);

    const swayFreqHz = flapFrequencyHz(speedMph, SOCK_CONFIG.swayFrequencyBase, SOCK_CONFIG.swayFrequencyScale);
    instance.sockSwayPhase = advanceWavePhase(instance.sockSwayPhase, swayFreqHz, dt);
    const swayFactor = swayWindFactor(speedMph, SOCK_SWAY_WIND_FULL_MPH);
    const swayDeg = Math.sin(instance.sockSwayPhase) * SOCK_CONFIG.swayAmplitude * swayFactor;
    const dirWithSway = instance.sockDirRad + degToRad(swayDeg);

    const anchorVec = new THREE.Vector3(anchor.x, anchor.y, anchor.z);
    const pose = computeSockPose(anchorVec, instance.sockAngleRad, dirWithSway, SOCK_CONFIG);

    matrix.compose(pose.mouthPosition, pose.quaternion, scaleVec);
    sock.mesh.setMatrixAt(i, matrix);
    writeSockStrings(stringPos, i, anchorVec, pose);
  }

  sock.mesh.instanceMatrix.needsUpdate = true;
  stringPos.needsUpdate = true;
}

// === Marker roots (pole only, D5) ===========================================

function buildMarker(scene: THREE.Scene, spec: WindMarkerSpec): MarkerInstance {
  const root = new THREE.Group();
  // groundYM (wind-system-btk-port W1, P5): flat 0 on Range A, the sloped ELR
  // terrain height elsewhere — was hardcoded 0, which buried the ELR ladder's
  // poles up to the flag in the hillside.
  root.position.set(spec.xOffsetM, spec.groundYM, -spec.distanceM);

  const poleMesh = buildPole(spec);
  root.add(poleMesh);

  scene.add(root);
  return {
    spec,
    root,
    poleMesh,
    flagAngleRad: degToRad(FLAG_CONFIG.minAngle),
    flagDirRad: 0,
    flagWavePhase: Math.random() * Math.PI * 2,
    sockAngleRad: degToRad(SOCK_CONFIG.minAngle),
    sockDirRad: 0,
    sockSwayPhase: Math.random() * Math.PI * 2,
  };
}

function disposeMarker(scene: THREE.Scene, instance: MarkerInstance): void {
  scene.remove(instance.root);
  instance.poleMesh.geometry.dispose();
  (instance.poleMesh.material as THREE.Material).dispose();
}

/** Build every marker at `style`. Idempotent (a repeat call with the same
 *  style is a no-op; call `disposeWindMarkers()` first to force a rebuild). */
export function initWindMarkers(scene: THREE.Scene, markers: readonly WindMarkerSpec[], style: MarkerStyle): void {
  if (state) return;
  const instances = markers.map((spec) => buildMarker(scene, spec));

  const wantFlag = style === 'flag' || style === 'both';
  const flag = wantFlag ? buildFlagInstancedMesh(scene, markers) : null;

  const wantSock = style === 'sock' || style === 'both';
  const sock = wantSock ? buildSockInstancedMesh(scene, markers) : null;
  if (sock) primeSockInstances(sock, instances, style);

  state = { scene, style, instances, flag, sock };
}

/** Rebuild all markers with a new style (dispose + reconstruct). No-op if the
 *  style hasn't actually changed. */
function rebuildWithStyle(style: MarkerStyle): void {
  if (!state) return;
  const { scene, instances: oldInstances, flag: oldFlag, sock: oldSock } = state;
  const markers = oldInstances.map((i) => i.spec);
  for (const instance of oldInstances) disposeMarker(scene, instance);
  if (oldFlag) disposeFlagMesh(scene, oldFlag);
  if (oldSock) disposeSockMesh(scene, oldSock);

  const instances = markers.map((spec) => buildMarker(scene, spec));

  const wantFlag = style === 'flag' || style === 'both';
  const flag = wantFlag ? buildFlagInstancedMesh(scene, markers) : null;

  const wantSock = style === 'sock' || style === 'both';
  const sock = wantSock ? buildSockInstancedMesh(scene, markers) : null;
  if (sock) primeSockInstances(sock, instances, style);

  state = { scene, style, instances, flag, sock };
}

/**
 * Advance every marker one frame: rebuild (lazily) if `style` has changed,
 * then sample the live wind at each marker's world position (`windAt` — the
 * caller's `meanVector + gustScale × field.sample(worldPos)`, D2/D3b) and
 * drive the flag's instanced shader attributes and/or the sock's rigid-body
 * pose. `t` is unused: flag flutter and sock sway both run on internally
 * accumulated phases (`advanceWavePhase`), not the render loop's elapsed
 * clock — kept in the signature to preserve the module's `init/update/
 * dispose` API (D5).
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
  updateSockInstances(state, dt, windAt);
}

/** Tear down all marker resources. Idempotent. */
export function disposeWindMarkers(): void {
  if (!state) return;
  for (const instance of state.instances) disposeMarker(state.scene, instance);
  if (state.flag) disposeFlagMesh(state.scene, state.flag);
  if (state.sock) disposeSockMesh(state.scene, state.sock);
  state = null;
}
