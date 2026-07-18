// Impact visual FX (task 1.5c) — the THREE-facing renderer for the dust puff a
// shot kicks up. Every shot spawns one pooled, camera-facing `THREE.Sprite`
// puff: a light metallic spark on a steel hit, brown dirt on a berm/ground miss
// (colour from game/impact-fx-model.ts). The puff grows and fades over its
// lifetime, then recycles.
//
// Why sprites: an earlier build's GPU dust shader didn't render reliably;
// plain sprites always do. The puff is TRANSIENT by design — persistent hit
// marks are a separate system (target-surface TS-C, 2026-07-18): the C++
// engine paints splats into each plate's texture layer (range/plate-surface),
// which rides the swinging plate in its material UVs. (That replaced the
// original world-anchored "scuff" sprite, which hung in space while the plate
// swung — dropped 2026-07-14, redone properly in plate-UV space.)
//
// Pool bookkeeping + colour live in the pure model; this file owns only the
// sprites + texture. Built lazily via initImpactFx(scene) so importing the
// module is DOM-free. World axes match the scene: +X right, +Y up, downrange −Z.

import * as THREE from 'three';
import { EffectPool, pickPuffColor } from '../game/impact-fx-model';

const MAX_PUFFS = 24; // plenty for rapid fire; oldest recycles if exceeded
const PUFF_LIFETIME_S = 1.3;
const PUFF_START_SIZE_M = 0.1; // visible even on distant racks (grows from here)
const PUFF_END_SIZE_M = 0.6;
const PUFF_START_OPACITY = 0.9;
const PUFF_CAMERA_NUDGE_M = 0.05; // toward the shooter (+Z) so it sits proud of the surface

/** A soft, cloud-like puff texture: a few overlapping radial blobs, white with
 * alpha falloff (the sprite's colour tints it). Needs a DOM canvas → created
 * only inside initImpactFx. */
function createPuffTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  ctx.clearRect(0, 0, size, size);
  // A cluster of soft blobs so the single sprite reads as a puff, not a disc.
  const blobs: Array<[number, number, number]> = [
    [0.5, 0.5, 0.42],
    [0.36, 0.44, 0.26],
    [0.62, 0.4, 0.24],
    [0.44, 0.62, 0.24],
    [0.6, 0.6, 0.2],
  ];
  for (const [cx, cy, r] of blobs) {
    const x = cx * size;
    const y = cy * size;
    const rad = r * size;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.5, 'rgba(255,255,255,0.28)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, rad, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.minFilter = THREE.LinearFilter;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

interface ImpactFxState {
  scene: THREE.Scene;
  texture: THREE.CanvasTexture;
  sprites: THREE.Sprite[];
  pool: EffectPool;
}

let fx: ImpactFxState | null = null;

/** Build the puff pool and add its (hidden) sprites to the scene. Idempotent. */
export function initImpactFx(scene: THREE.Scene): void {
  if (fx) return;
  const texture = createPuffTexture();
  const sprites: THREE.Sprite[] = [];
  for (let i = 0; i < MAX_PUFFS; i++) {
    const material = new THREE.SpriteMaterial({
      map: texture,
      transparent: true,
      depthWrite: false,
      opacity: 0,
    });
    const sprite = new THREE.Sprite(material);
    sprite.scale.set(PUFF_START_SIZE_M, PUFF_START_SIZE_M, 1);
    sprite.visible = false;
    sprite.renderOrder = 2;
    scene.add(sprite);
    sprites.push(sprite);
  }
  fx = { scene, texture, sprites, pool: new EffectPool(MAX_PUFFS) };
}

/** Emit the puff for one resolved shot at the impact world point (metres):
 * metallic spark on a hit, brown dirt on a miss. */
export function emitImpact(params: { impactWorld: THREE.Vector3; hit: boolean }): void {
  if (!fx) return;
  const idx = fx.pool.acquire();
  const sprite = fx.sprites[idx];
  const c = pickPuffColor(params.hit);
  sprite.position.set(
    params.impactWorld.x,
    params.impactWorld.y,
    params.impactWorld.z + PUFF_CAMERA_NUDGE_M,
  );
  sprite.material.color.setRGB(c.r / 255, c.g / 255, c.b / 255);
  sprite.material.opacity = PUFF_START_OPACITY;
  sprite.scale.set(PUFF_START_SIZE_M, PUFF_START_SIZE_M, 1);
  sprite.visible = true;
}

/** Grow + fade active puffs and recycle finished ones. Call once per frame. */
export function updateImpactFx(dt: number): void {
  if (!fx) return;
  for (const idx of fx.pool.releaseExpired(dt, PUFF_LIFETIME_S)) {
    fx.sprites[idx].visible = false;
    fx.sprites[idx].material.opacity = 0;
  }
  for (let i = 0; i < fx.sprites.length; i++) {
    if (!fx.pool.isActive(i)) continue;
    const t = Math.min(1, fx.pool.ageOf(i) / PUFF_LIFETIME_S);
    const size = PUFF_START_SIZE_M + (PUFF_END_SIZE_M - PUFF_START_SIZE_M) * t;
    const sprite = fx.sprites[i];
    sprite.scale.set(size, size, 1);
    sprite.material.opacity = PUFF_START_OPACITY * (1 - t);
  }
}

/** Tear down all FX resources. Idempotent. */
export function disposeImpactFx(): void {
  if (!fx) return;
  for (const sprite of fx.sprites) {
    fx.scene.remove(sprite);
    sprite.material.dispose();
  }
  fx.texture.dispose();
  fx = null;
}
