// Lighting for the environment module. Stage 3 of
// `Design/archive/mil-zero-range-plan.md` replaced the hardcoded midday rig with a
// config-driven low sun + an optional near-field shadow map.
//
// WHY THE OLD RIG WAS THE PROBLEM. It was a DirectionalLight at (-250, 350, 150)
// — roughly 54° elevation, i.e. near midday. That is the least flattering angle
// available: it flattens terrain relief, lights canopy TOPS the shooter can
// never see, and leaves every shooter-facing canopy surface on hemisphere fill
// alone. The Test Range's config comments record three rounds of "the trees are
// too dark" being fought with palette brightening, which could not work — the
// albedo was never the problem, the angle was.
//
// Shadows were also inert: `ScopeView` never enabled `renderer.shadowMap`, so
// every `castShadow` flag in the codebase did nothing. Stage 3 turns it on for
// the near field only.

import * as THREE from 'three';
import { shadowLengthFactor, sunDirection, type EnvironmentConfig } from './environment-config';

export interface LightingHandle {
  lights: THREE.Object3D[];
  /** The sun, exposed so the scene can point its shadow frustum. */
  sun: THREE.DirectionalLight;
}

/** How far out the sun is placed (m). Only its DIRECTION matters to a
 *  DirectionalLight; this just has to sit outside the shadow frustum. */
const SUN_DISTANCE_M = 400;

export function buildLighting(scene: THREE.Scene, cfg: EnvironmentConfig): LightingHandle {
  const { sunHex, sunIntensity, hemiSkyHex, hemiGroundHex, hemiIntensity, shadows } = cfg.lighting;

  // Warm key + cool fill. The warm/cool split is most of what sells "morning":
  // a low warm sun with a neutral fill just reads as a dim day.
  const hemi = new THREE.HemisphereLight(hemiSkyHex, hemiGroundHex, hemiIntensity);
  const sun = new THREE.DirectionalLight(sunHex, sunIntensity);

  const dir = sunDirection(cfg);
  sun.position.set(dir.x * SUN_DISTANCE_M, dir.y * SUN_DISTANCE_M, dir.z * SUN_DISTANCE_M);
  sun.target.position.set(0, 0, 0);

  if (shadows) {
    sun.castShadow = true;
    sun.shadow.mapSize.set(shadows.mapSize, shadows.mapSize);
    const cam = sun.shadow.camera;
    cam.left = -shadows.extentM;
    cam.right = shadows.extentM;
    cam.top = shadows.extentM;
    cam.bottom = -shadows.extentM;
    // The frustum has to reach from the light's position back past the origin,
    // and a 14° sun throws shadows ~4x object height, so the far plane needs
    // real slack beyond the sun distance or tall trees lose their shadow tips.
    cam.near = 1;
    cam.far = SUN_DISTANCE_M * 2;
    // normalBias, not bias alone: at a grazing sun over near-flat ground the
    // depth comparison is close to degenerate and plain depth bias stripes the
    // whole lane with acne. These are tuned AT the configured sun angle —
    // changing the elevation invalidates them.
    cam.updateProjectionMatrix();
    sun.shadow.normalBias = shadows.normalBias;
    sun.shadow.bias = shadows.bias;
  }

  scene.add(hemi);
  scene.add(sun);
  scene.add(sun.target);

  return { lights: [hemi, sun, sun.target], sun };
}

/** Diagnostic: how long a shadow this rig throws, as a multiple of object
 *  height. Re-exported so scenes and tests can size things against it without
 *  reaching into the config's trigonometry. */
export { shadowLengthFactor };
