// PBR texture loading for the environment module (Stage 2 of
// Design/Plans/test-range-environment-plan.md). Offline-first (build-plan
// hard constraint): the material renders immediately with `fallbackColor`, so
// a slow/failed texture load (or a build that forgot to precache jpg — see
// vite.config.ts) never blocks the scene or leaves it untextured-and-broken;
// it just stays a flat color.

import * as THREE from 'three';

export interface PbrMaterialHandle {
  material: THREE.MeshStandardMaterial;
  dispose(): void;
}

export interface LoadPbrMaterialOptions {
  /** e.g. 'textures/grass/Grass004_1K-JPG' (no `_Color.jpg` suffix). */
  basePath: string;
  repeat: [number, number];
  /** Shown until (or unless) the color map lands. */
  fallbackColor: number;
  roughness?: number;
  anisotropy?: number;
}

const loader = new THREE.TextureLoader();

/** Builds a `MeshStandardMaterial` synchronously (flat `fallbackColor`) and
 *  starts loading the Color/NormalGL/Roughness maps in the background;
 *  each map is wired onto the material as it lands. */
export function loadPbrMaterial(opts: LoadPbrMaterialOptions): PbrMaterialHandle {
  const { basePath, repeat, fallbackColor, roughness = 1, anisotropy = 4 } = opts;
  const material = new THREE.MeshStandardMaterial({ color: fallbackColor, roughness });
  const loaded: THREE.Texture[] = [];

  const wire = (tex: THREE.Texture, isColor: boolean) => {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(repeat[0], repeat[1]);
    tex.anisotropy = anisotropy;
    if (isColor) tex.colorSpace = THREE.SRGBColorSpace;
  };

  const base = `${import.meta.env.BASE_URL}${basePath}`;
  loader.load(
    `${base}_Color.jpg`,
    (tex) => {
      wire(tex, true);
      material.map = tex;
      material.color.set(0xffffff); // don't tint the map with the fallback color
      material.needsUpdate = true;
      loaded.push(tex);
    },
    undefined,
    () => {
      /* offline-first fallback: keep the flat color */
    },
  );
  loader.load(
    `${base}_NormalGL.jpg`,
    (tex) => {
      wire(tex, false);
      material.normalMap = tex;
      material.needsUpdate = true;
      loaded.push(tex);
    },
    undefined,
    () => {},
  );
  loader.load(
    `${base}_Roughness.jpg`,
    (tex) => {
      wire(tex, false);
      material.roughnessMap = tex;
      material.needsUpdate = true;
      loaded.push(tex);
    },
    undefined,
    () => {},
  );

  return {
    material,
    dispose() {
      material.dispose();
      for (const tex of loaded) tex.dispose();
      loaded.length = 0;
    },
  };
}
