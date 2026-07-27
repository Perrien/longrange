// The paper-bay scene contract — Stage 2a of `Design/archive/mil-zero-range-plan.md`.
//
// WHY THIS EXISTS. ScopeView carries ~700 lines of paper-target behaviour: the
// aimed-target pick, the gear-driven fire path, hit marks, the running group
// centroid, Clean, Inspect, and the zeroing flow. None of it was specific to the
// original grass Zero Range — but all of it used to be reached through a
// concrete `SightInScene` local and gated on `sceneType === 'sight-in'`. That
// made a second paper bay cost a new disjunction at every gate, and every gate
// someone forgot became a place where two ranges silently diverged.
//
// So the behaviour keys off a CAPABILITY (`RangeDefinition.targetKind === 'paper'`)
// and talks to this interface. The original `SightInScene` implemented every
// method below; declaring the interface was the whole change. That grass bay has
// since been retired (replaced by the Wooded Zero Range), but the interface it
// motivated stays: a new paper bay costs a registry row + a scene class, and
// inherits the zeroing flow, Clean and Inspect unmodified.
//
// See plan §7.2 for the coupling table this replaces.

import type * as THREE from 'three';

/** One placed paper target, exposed for the shot loop to aim at and hit-test. */
export interface PaperTargetInstance {
  stationIndex: number;
  /** Line-of-sight range to the target (m) — what the solver receives. */
  distanceM: number;
  /** Distance in the bay's own unit, for HUD labels (50, 100, 200…). */
  nominalDistance: number;
  /** Physical square side of the paper face (m). */
  sizeM: number;
  /** World-space centre of the target face. */
  position: THREE.Vector3;
}

/**
 * A bay of immobile paper targets that the zeroing flow can operate on.
 *
 * All `worldX`/`worldY` arguments are world-space impact coordinates on the
 * target plane; implementations map them to face UV themselves, because only the
 * scene knows how its faces are oriented and sized.
 *
 * Every method must tolerate an out-of-range `stationIndex` and an impact that
 * falls off the paper — the fire path calls them optimistically.
 */
export interface PaperBayScene {
  /** The placed targets, in station order. */
  readonly targets: readonly PaperTargetInstance[];

  /** Resolves once the delivered target art has been swapped in (or the load
   *  failed and a procedural fallback was kept). Faces are usable immediately
   *  either way — this is for tests and for art-swap sequencing, not a gate on
   *  being able to shoot. */
  readonly whenReady: Promise<void>;

  /** How far downrange this bay's ground extends (m). Drives which wind markers
   *  are worth placing — on a short bay the far ones would float past the end of
   *  the world. */
  readonly laneLengthM: number;

  /** Shooter eye height above the world origin's ground plane (m). A bay whose
   *  firing point sits on a knoll reports the raised value, and the camera, the
   *  wind sampling and the mirage reference all follow it. */
  readonly eyeHeightM: number;

  /** Paint a hit on a target's face. No-op if the impact misses the paper. */
  paintHit(stationIndex: number, worldX: number, worldY: number, bulletDiameterM: number): void;

  /** Wipe one target's marks for a fresh face. */
  cleanTarget(stationIndex: number): void;

  /** Wipe every target's marks. */
  cleanAll(): void;

  /** Overlay the running group-centroid marker at a world point. */
  setGroupCentroid(stationIndex: number, worldX: number, worldY: number): void;

  /** Remove a target's centroid marker (dial change / confirm / no shots). */
  clearGroupCentroid(stationIndex: number): void;

  /** The target's backing canvas, for the head-on Inspect view. */
  getFaceCanvas(stationIndex: number): HTMLCanvasElement | null;

  /** Optional per-frame animation hook — cloud drift and wind-driven canopy
   *  sway. `sampleWindAt` is the range's own wind sampler, so the vegetation
   *  moves with the same wind the bullet gets rather than a decorative sine.
   *  Bays with no animated environment omit this method entirely. */
  update?(
    dt: number,
    timeS: number,
    windVec: { x: number; y: number; z: number },
    sampleWindAt?: (p: { x: number; y: number; z: number }) => { x: number; y: number; z: number },
  ): void;

  dispose(): void;
}
