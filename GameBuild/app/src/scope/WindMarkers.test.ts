// Headless-three geometry/pose tests for the ported BTK flag cloth
// (wind-system-btk-port W2) and wind sock (W3), in the style of
// `plate-outline-geometry.test.ts` — pure BufferGeometry/Vector3/Quaternion
// math, node test env, no DOM/GL. Only `createFlagGeometry`, `createSockGeometry`
// and `computeSockPose` are exercised here: everything else in WindMarkers.ts
// (texture/material/instanced mesh) touches `document.createElement('canvas')`
// and isn't unit-testable outside a browser — that's the owner's on-device
// check at each style's stop.
import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createFlagGeometry, createSockGeometry, computeSockPose } from './WindMarkers';
import { FLAG_CONFIG, SOCK_CONFIG } from '../range/wind-marker-visual-config';

describe('WindMarkers/createFlagGeometry', () => {
  const geo = createFlagGeometry(FLAG_CONFIG);

  it('emits 4 vertices per segment column (front top/bottom, back top/bottom)', () => {
    const pos = geo.getAttribute('position');
    expect(pos.count).toBe(FLAG_CONFIG.segments * 4);
  });

  it('index count matches front + back + top-edge + bottom-edge triangle strips', () => {
    const idx = geo.getIndex();
    expect(idx).not.toBeNull();
    const columnPairs = FLAG_CONFIG.segments - 1;
    // 2 tris front + 2 back + 2 top edge + 2 bottom edge = 8 tris/pair, 3 indices/tri.
    expect(idx!.count).toBe(columnPairs * 8 * 3);
  });

  it('segmentT runs 0 -> 1 across the columns and is constant within a column', () => {
    const segmentT = geo.getAttribute('segmentT');
    expect(segmentT.getX(0)).toBeCloseTo(0, 9);
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    for (let k = 0; k < 4; k++) {
      expect(segmentT.getX(lastColumnStart + k)).toBeCloseTo(1, 9);
    }

    let prev = -Infinity;
    for (let col = 0; col < FLAG_CONFIG.segments; col++) {
      const base = col * 4;
      const t = segmentT.getX(base);
      for (let k = 1; k < 4; k++) {
        expect(segmentT.getX(base + k)).toBeCloseTo(t, 9); // constant within the column
      }
      expect(t).toBeGreaterThanOrEqual(prev); // monotonic across columns
      prev = t;
    }
  });

  it('tapers from baseWidthM at the hinge to tipWidthM at the tip', () => {
    // toBeCloseTo(..., 6): positions are stored in a Float32BufferAttribute
    // (Three requires it), so this compares a float32-rounded value against
    // a float64 literal — exact-to-9-places would fail on the rounding alone.
    const pos = geo.getAttribute('position');
    // Column 0 = hinge: top/front vertex (index 0) is at +halfBaseWidth.
    expect(pos.getY(0)).toBeCloseTo(FLAG_CONFIG.baseWidthM / 2, 6);
    // Last column = tip.
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    expect(pos.getY(lastColumnStart)).toBeCloseTo(FLAG_CONFIG.tipWidthM / 2, 6);
  });

  it('spans local X from 0 (hinge) to lengthM (tip), undeformed', () => {
    const pos = geo.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(0, 9);
    const lastColumnStart = (FLAG_CONFIG.segments - 1) * 4;
    expect(pos.getX(lastColumnStart)).toBeCloseTo(FLAG_CONFIG.lengthM, 6);
  });

  it('has an explicit bounding sphere covering the flag\'s max 3D extent, ×1.1 margin (P7)', () => {
    expect(geo.boundingSphere).not.toBeNull();
    const halfMaxWidth = Math.max(FLAG_CONFIG.baseWidthM, FLAG_CONFIG.tipWidthM) * 0.5;
    const expectedRadius =
      Math.sqrt(FLAG_CONFIG.lengthM ** 2 + halfMaxWidth ** 2 + FLAG_CONFIG.flapAmplitude ** 2) * 1.1;
    expect(geo.boundingSphere!.radius).toBeCloseTo(expectedRadius, 6);
    expect(geo.boundingSphere!.center.length()).toBe(0);
  });
});

describe('WindMarkers/createSockGeometry', () => {
  const geo = createSockGeometry(SOCK_CONFIG);

  it('emits (lengthSegments+1) rings of (radialSegments+1) vertices', () => {
    const pos = geo.getAttribute('position');
    expect(pos.count).toBe((SOCK_CONFIG.lengthSegments + 1) * (SOCK_CONFIG.radialSegments + 1));
  });

  it('index count matches two triangles per quad, every ring pair × radial segment', () => {
    const idx = geo.getIndex();
    expect(idx).not.toBeNull();
    expect(idx!.count).toBe(SOCK_CONFIG.lengthSegments * SOCK_CONFIG.radialSegments * 6);
  });

  it('tapers from sockMouthRadiusM at the mouth ring to sockTailRadiusM at the tail ring', () => {
    const pos = geo.getAttribute('position');
    // First ring (j=0, k=0): mouth, radius = hypot(y,z) at local X=0.
    expect(Math.hypot(pos.getY(0), pos.getZ(0))).toBeCloseTo(SOCK_CONFIG.sockMouthRadiusM, 6);
    // Last ring (j=lengthSegments, k=0): tail.
    const lastRingStart = SOCK_CONFIG.lengthSegments * (SOCK_CONFIG.radialSegments + 1);
    expect(Math.hypot(pos.getY(lastRingStart), pos.getZ(lastRingStart))).toBeCloseTo(SOCK_CONFIG.sockTailRadiusM, 6);
  });

  it('spans local X from 0 (mouth) to sockLengthM (tail)', () => {
    const pos = geo.getAttribute('position');
    expect(pos.getX(0)).toBeCloseTo(0, 9);
    const lastRingStart = SOCK_CONFIG.lengthSegments * (SOCK_CONFIG.radialSegments + 1);
    expect(pos.getX(lastRingStart)).toBeCloseTo(SOCK_CONFIG.sockLengthM, 6);
  });
});

describe('WindMarkers/computeSockPose', () => {
  const anchor = new THREE.Vector3(1, 2, -3);

  it('points straight down at pitch=0, regardless of direction (calm has no heading)', () => {
    const a = computeSockPose(anchor, 0, 0, SOCK_CONFIG);
    const b = computeSockPose(anchor, 0, 2.4, SOCK_CONFIG);
    expect(a.axis.x).toBeCloseTo(0, 9);
    expect(a.axis.y).toBeCloseTo(-1, 9);
    expect(a.axis.z).toBeCloseTo(0, 9);
    expect(b.axis.x).toBeCloseTo(0, 9);
    expect(b.axis.y).toBeCloseTo(-1, 9);
    expect(b.axis.z).toBeCloseTo(0, 9);
  });

  it('points horizontally downwind at pitch=π/2 — the P1 crosswind/headwind guard, restated for the sock', () => {
    // dirRad = yawFromWind({x:5,z:0}) = π/2 (wind from 9 o'clock) -> tip toward +x.
    const crosswind = computeSockPose(anchor, Math.PI / 2, Math.PI / 2, SOCK_CONFIG);
    expect(crosswind.axis.x).toBeCloseTo(1, 9);
    expect(crosswind.axis.y).toBeCloseTo(0, 9);
    expect(crosswind.axis.z).toBeCloseTo(0, 9);

    // dirRad = yawFromWind({x:0,z:5}) = 0 (headwind from 12) -> tip toward +z.
    const headwind = computeSockPose(anchor, Math.PI / 2, 0, SOCK_CONFIG);
    expect(headwind.axis.x).toBeCloseTo(0, 9);
    expect(headwind.axis.y).toBeCloseTo(0, 9);
    expect(headwind.axis.z).toBeCloseTo(1, 9);
  });

  it('mouth position sits one stringLengthM out from the anchor, along the axis', () => {
    const pose = computeSockPose(anchor, Math.PI / 2, Math.PI / 2, SOCK_CONFIG);
    const expected = anchor.clone().addScaledVector(pose.axis, SOCK_CONFIG.stringLengthM);
    expect(pose.mouthPosition.distanceTo(expected)).toBeCloseTo(0, 9);
    expect(pose.mouthPosition.distanceTo(anchor)).toBeCloseTo(SOCK_CONFIG.stringLengthM, 9);
  });

  it('the quaternion maps local +X onto the axis (rigid-body orientation)', () => {
    const pose = computeSockPose(anchor, 0.7, 1.1, SOCK_CONFIG);
    const mapped = new THREE.Vector3(1, 0, 0).applyQuaternion(pose.quaternion);
    expect(mapped.distanceTo(pose.axis)).toBeCloseTo(0, 6);
  });

  it('string rim offsets are perpendicular to the axis, opposite each other, and mouthRadiusM long', () => {
    const pose = computeSockPose(anchor, 0.9, -0.4, SOCK_CONFIG);
    const rimUp = new THREE.Vector3(0, SOCK_CONFIG.sockMouthRadiusM, 0).applyQuaternion(pose.quaternion);
    const rimDown = new THREE.Vector3(0, -SOCK_CONFIG.sockMouthRadiusM, 0).applyQuaternion(pose.quaternion);
    expect(rimUp.length()).toBeCloseTo(SOCK_CONFIG.sockMouthRadiusM, 9);
    expect(rimUp.dot(pose.axis)).toBeCloseTo(0, 6); // string endpoints sit ON the mouth rim, not along the axis
    expect(rimUp.clone().add(rimDown).length()).toBeCloseTo(0, 6); // exactly opposite
  });
});
