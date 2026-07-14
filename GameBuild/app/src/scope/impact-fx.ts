// Impact visual FX (task 1.5c) — the THREE-facing renderer for bullet impact
// marks and hit/miss dust puffs. Ports the *look* of BallisticsToolkit steel-sim
// (`ImpactMark.js`, `DustCloud.js`), but re-expressed for this game's shared,
// swinging plate InstancedMesh:
//
//  - Marks are pooled `THREE.Sprite`s, NOT `DecalGeometry` (plan 1.5c D2):
//    DecalGeometry projects onto one static mesh, incompatible with 50 plates in
//    a single InstancedMesh. The procedural splat texture is ported verbatim.
//  - Dust is the ported GPU `DustCloud` shader (grows + fades on the GPU).
//
// Both pools share the one bookkeeper (game/impact-fx-model.ts EffectPool), which
// is unit-tested; this file owns only the rendering (no node tests — needs a
// canvas + WebGL). Constructed lazily via initImpactFx(scene) so importing the
// module is DOM-free. World axes match the scene: +X right, +Y up, downrange −Z.

import * as THREE from 'three';
import { EffectPool, pickImpactColor, type RgbColor } from '../game/impact-fx-model';

// --- marks ------------------------------------------------------------------
const MAX_MARKS = 32; // matches steel-sim ImpactMarkFactory; marks persist + recycle oldest
const MARK_SIZE_M = 0.06; // sprite world size (a plausible scuff on Range A plates)
const MARK_Z_OFFSET_M = 0.01; // nudge toward the shooter (+Z) so it sits proud of the plate face

// --- dust -------------------------------------------------------------------
const MAX_DUST = 16; // steel-sim DustCloud POOL_SIZE
const DUST_PARTICLES = 120;
const DUST_INITIAL_RADIUS_M = 0.05;
const DUST_GROWTH_RATE_MPS = 0.6;
const DUST_PARTICLE_DIAMETER_M = 0.02;
// Alpha ∝ 1/(radius/initialRadius)² reaches the ~0.01 vanish threshold at radius
// ≈ 10×initial (0.5 m) → t = (0.5−0.05)/0.6 ≈ 0.75 s. Recycle a hair later.
const DUST_LIFETIME_S = 0.85;

const DUST_VERTEX_SHADER = `
attribute vec3 instanceRelativePosition;

uniform vec3 centerPosition;
uniform float initialRadius;
uniform float radiusScale;
uniform float particleScale;

void main() {
  vec3 worldPos = centerPosition + instanceRelativePosition * initialRadius * radiusScale;
  vec3 localPos = position * particleScale;
  vec4 worldPosition = vec4(worldPos + localPos, 1.0);
  gl_Position = projectionMatrix * modelViewMatrix * worldPosition;
}
`;

const DUST_FRAGMENT_SHADER = `
uniform vec3 color;
uniform float alpha;

void main() {
  gl_FragColor = vec4(color, alpha);
}
`;

const ALPHA_THRESHOLD = 0.01;

/** Box-Muller Gaussian, resampled outside 2σ (steel-sim DustCloud). */
function truncatedNormalRandom(): number {
  let value: number;
  do {
    let u = 0;
    let v = 0;
    while (u === 0) u = Math.random();
    while (v === 0) v = Math.random();
    value = Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
  } while (Math.abs(value) > 2.0);
  return value;
}

/** One GPU dust cloud (ported from steel-sim DustCloud). Geometry is built once
 * and reused; `reset()` re-aims it, `update(dt)` grows + fades it on the GPU.
 * Pooling/recycling is owned externally by EffectPool. */
class DustCloud {
  active = false;
  readonly mesh: THREE.InstancedMesh;
  private readonly material: THREE.ShaderMaterial;
  private readonly center = new THREE.Vector3();
  private radius = DUST_INITIAL_RADIUS_M;
  private initialRadius = DUST_INITIAL_RADIUS_M;
  private growthRate = DUST_GROWTH_RATE_MPS;

  constructor() {
    const rel = new Float32Array(DUST_PARTICLES * 3);
    for (let i = 0; i < DUST_PARTICLES; i++) {
      rel[i * 3 + 0] = truncatedNormalRandom();
      rel[i * 3 + 1] = truncatedNormalRandom();
      rel[i * 3 + 2] = truncatedNormalRandom();
    }
    this.material = new THREE.ShaderMaterial({
      vertexShader: DUST_VERTEX_SHADER,
      fragmentShader: DUST_FRAGMENT_SHADER,
      uniforms: {
        centerPosition: { value: new THREE.Vector3() },
        initialRadius: { value: DUST_INITIAL_RADIUS_M },
        radiusScale: { value: 1.0 },
        particleScale: { value: 0.01 },
        color: { value: new THREE.Color(0.5, 0.5, 0.5) },
        alpha: { value: 0.0 },
      },
      transparent: true,
      depthWrite: false,
      depthTest: true,
    });
    const geo = new THREE.IcosahedronGeometry(0.5, 1);
    geo.setAttribute('instanceRelativePosition', new THREE.InstancedBufferAttribute(rel, 3));
    this.mesh = new THREE.InstancedMesh(geo, this.material, DUST_PARTICLES);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2; // over decals (renderOrder 1)
    this.mesh.visible = false;
  }

  reset(position: THREE.Vector3, color: RgbColor): void {
    this.center.copy(position);
    this.initialRadius = DUST_INITIAL_RADIUS_M;
    this.growthRate = DUST_GROWTH_RATE_MPS;
    this.radius = DUST_INITIAL_RADIUS_M;
    const u = this.material.uniforms;
    u.centerPosition.value.copy(this.center);
    u.initialRadius.value = this.initialRadius;
    u.radiusScale.value = 1.0;
    u.particleScale.value = Math.max(DUST_PARTICLE_DIAMETER_M / 2, 0.01);
    (u.color.value as THREE.Color).setRGB(color.r / 255, color.g / 255, color.b / 255);
    u.alpha.value = 1.0;
    this.mesh.visible = true;
    this.active = true;
  }

  update(dt: number): void {
    if (!this.active) return;
    this.radius += this.growthRate * dt;
    const growthRatio = this.radius / this.initialRadius;
    const alpha = 1.0 / Math.max(growthRatio * growthRatio, 1.0);
    const u = this.material.uniforms;
    u.radiusScale.value = growthRatio;
    u.alpha.value = alpha < ALPHA_THRESHOLD ? 0 : alpha;
  }

  deactivate(): void {
    this.active = false;
    this.mesh.visible = false;
    this.material.uniforms.alpha.value = 0.0;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.material.dispose();
  }
}

// --- procedural mark texture (ported from steel-sim ImpactMark.createSplatTexture) ---
/** Grayscale radial divot with soft, slightly-noisy edges; the sprite's colour
 * tints it. Needs a DOM canvas → created only inside initImpactFx. */
function createSplatTexture(): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  const c = size / 2;
  const radius = size / 2 - 4;
  const g = ctx.createRadialGradient(c, c, 0, c, c, radius);
  g.addColorStop(0, 'rgba(255,255,255,0.95)');
  g.addColorStop(0.3, 'rgba(255,255,255,0.8)');
  g.addColorStop(0.6, 'rgba(255,255,255,0.4)');
  g.addColorStop(0.85, 'rgba(255,255,255,0.15)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(c, c, radius, 0, Math.PI * 2);
  ctx.fill();
  // Irregular edge noise on the alpha channel (outer ring only).
  const img = ctx.getImageData(0, 0, size, size);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const x = (i / 4) % size;
    const y = Math.floor(i / 4 / size);
    const dist = Math.hypot(x - c, y - c);
    if (dist > radius * 0.5 && dist < radius) {
      d[i + 3] = Math.max(0, Math.min(255, d[i + 3] + (Math.random() - 0.5) * 20));
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

// --- the FX controller ------------------------------------------------------
interface ImpactFxState {
  scene: THREE.Scene;
  markTexture: THREE.CanvasTexture;
  markSprites: THREE.Sprite[];
  markPool: EffectPool;
  dustClouds: DustCloud[];
  dustPool: EffectPool;
}

let fx: ImpactFxState | null = null;

/** Build the pools and add their (hidden) meshes to the scene. Idempotent. */
export function initImpactFx(scene: THREE.Scene): void {
  if (fx) return;
  const markTexture = createSplatTexture();
  const markSprites: THREE.Sprite[] = [];
  for (let i = 0; i < MAX_MARKS; i++) {
    // Alpha-composited dark scuff (NormalBlending, not MultiplyBlending): sprites
    // are full quads, and multiply would darken the transparent corners into a
    // halo. Normal blending just lays the soft divot onto the plate face.
    const material = new THREE.SpriteMaterial({
      map: markTexture,
      color: 0x2b2b2b,
      transparent: true,
      depthWrite: false,
      opacity: 0.9,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(MARK_SIZE_M, MARK_SIZE_M, 1);
    sprite.visible = false;
    sprite.renderOrder = 1;
    scene.add(sprite);
    markSprites.push(sprite);
  }
  const dustClouds: DustCloud[] = [];
  for (let i = 0; i < MAX_DUST; i++) {
    const cloud = new DustCloud();
    scene.add(cloud.mesh);
    dustClouds.push(cloud);
  }
  fx = {
    scene,
    markTexture,
    markSprites,
    markPool: new EffectPool(MAX_MARKS),
    dustClouds,
    dustPool: new EffectPool(MAX_DUST),
  };
}

/** Emit the visuals for one resolved shot: a puff always (colour keyed on the
 * outcome), plus a persistent mark on a steel hit. `impactWorld` is the impact
 * point in world metres. */
export function emitImpact(params: { impactWorld: THREE.Vector3; hit: boolean }): void {
  if (!fx) return;
  const color = pickImpactColor(params.hit);

  // Dust — always.
  const dustIdx = fx.dustPool.acquire();
  fx.dustClouds[dustIdx].reset(params.impactWorld, color.dust);

  // Mark — hits only (there's no plate to mark on a miss).
  if (params.hit) {
    const markIdx = fx.markPool.acquire();
    const sprite = fx.markSprites[markIdx];
    sprite.position.set(
      params.impactWorld.x,
      params.impactWorld.y,
      params.impactWorld.z + MARK_Z_OFFSET_M,
    );
    sprite.material.color.setHex(color.markHex);
    sprite.visible = true;
  }
}

/** Advance dust fades and recycle finished puffs. Call once per frame. */
export function updateImpactFx(dt: number): void {
  if (!fx) return;
  for (const cloud of fx.dustClouds) {
    if (cloud.active) cloud.update(dt);
  }
  for (const idx of fx.dustPool.releaseExpired(dt, DUST_LIFETIME_S)) {
    fx.dustClouds[idx].deactivate();
  }
}

/** Tear down all FX resources. Idempotent. */
export function disposeImpactFx(): void {
  if (!fx) return;
  for (const sprite of fx.markSprites) {
    fx.scene.remove(sprite);
    sprite.material.dispose();
  }
  for (const cloud of fx.dustClouds) {
    fx.scene.remove(cloud.mesh);
    cloud.dispose();
  }
  fx.markTexture.dispose();
  fx = null;
}
