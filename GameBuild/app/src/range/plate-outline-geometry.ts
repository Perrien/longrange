// Non-round plate geometry (Design/Plans/target-system-plan.md §5, task T4).
//
// `plate-geometry.ts` is NOT touched by this file or this task. That is deliberate:
// leaving the disc's generator completely alone is the cheapest possible proof that
// every shipped range's plates are unchanged — no golden-hash reasoning required,
// the code simply did not move. T0's `plate-geometry.golden.test.ts` re-runs green as
// the receipt.
//
// COORDINATE CONVENTION. Positions are authored in the target's width-normalised
// local frame (x ∈ [−0.5, +0.5], y ∈ [−aspect/2, +aspect/2]; see
// `targets/target-type.ts`), thickness ±0.5 along z. So the instance scale is
// (widthM, widthM, thicknessM) — UNIFORM in x and y, because the aspect is already
// baked into the vertex positions. For a disc (aspect 1) that is exactly the
// existing convention, so the two generators agree where they overlap.
//
// UV CONVENTION — identical to `plate-geometry.ts`, and it has to be, because both
// feed the same C++ paint buffer (`u = 0.5 + x/width`, `v = 0.5 + y/height`,
// steel_target.cpp) through the same atlas:
//
//   u = halfCentre + x·0.5      halfCentre = 0.25 (downrange) or 0.75 (shooter side)
//   v = 0.5 + y/aspect          ← the ONE place the anisotropic unit box appears
//
// Rim vertices carry UV (−1,−1), which the plate material's shader reads as
// "no texture — flat metal gray".

import * as THREE from 'three';
import type { Point } from './targets/target-type';

/** Winding of a ring, positive = counter-clockwise (y-up). */
function signedArea(ring: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return a / 2;
}

/**
 * Unit-width plate geometry for an arbitrary outline: two triangulated caps plus a
 * rim, UV'd into the shared paint atlas.
 *
 * `outline` must be a closed CCW ring in the width-normalised frame with no repeated
 * final vertex — which is exactly what `targets/svg-outline.ts` `flattenOutline()`
 * produces.
 */
export function createPlateOutlineGeometry(
  outline: readonly Point[],
  aspect: number,
): THREE.BufferGeometry {
  if (outline.length < 3)
    throw new Error(`plate-outline-geometry: need ≥3 outline points, got ${outline.length}`);
  if (!(aspect > 0)) throw new Error(`plate-outline-geometry: aspect must be > 0, got ${aspect}`);
  if (signedArea(outline) <= 0)
    throw new Error('plate-outline-geometry: outline must be counter-clockwise (use toCcw)');

  // three's earcut, already in the pinned 0.185.1 — no new dependency. Required
  // rather than a centroid fan: both shipped silhouettes are NON-convex (the IDPA's
  // neck/shoulder junction, the popper's waist pinch), and a fan over a reflex
  // vertex produces overlapping triangles.
  const contour = outline.map((p) => new THREE.Vector2(p.x, p.y));
  const faces = THREE.ShapeUtils.triangulateShape(contour, []);
  if (faces.length === 0)
    throw new Error('plate-outline-geometry: triangulation produced no faces (degenerate outline?)');

  const positions: number[] = [];
  const uvs: number[] = [];
  const hd = 0.5; // unit half-thickness (scaled by plate thickness)

  /** Cap UV for a local point on the given face. */
  const capUv = (p: Point, halfCentre: number): [number, number] => [
    halfCentre + p.x * 0.5,
    0.5 + p.y / aspect,
  ];

  // Downrange cap (z = −hd; the engine's "front") — LEFT texture half. Outward is
  // −Z, so a CCW contour triangle (a,b,c) is emitted REVERSED.
  for (const [ia, ib, ic] of faces) {
    for (const i of [ia, ic, ib]) {
      const p = outline[i];
      positions.push(p.x, p.y, -hd);
      uvs.push(...capUv(p, 0.25));
    }
  }

  // Shooter-facing cap (z = +hd; the engine's "back") — RIGHT texture half. Outward
  // is +Z, so CCW order is already correct.
  for (const [ia, ib, ic] of faces) {
    for (const i of [ia, ib, ic]) {
      const p = outline[i];
      positions.push(p.x, p.y, hd);
      uvs.push(...capUv(p, 0.75));
    }
  }

  // Rim: two triangles per outline edge, wound OUTWARD. For a CCW ring the interior
  // is on the left of each edge, so the outward normal is (dy, −dx) — the general
  // form of the disc's "radially away from the axis".
  for (let i = 0; i < outline.length; i++) {
    const a = outline[i];
    const b = outline[(i + 1) % outline.length];
    // (a,−h) (b,−h) (a,+h) then (b,−h) (b,+h) (a,+h)
    positions.push(a.x, a.y, -hd, b.x, b.y, -hd, a.x, a.y, hd);
    positions.push(b.x, b.y, -hd, b.x, b.y, hd, a.x, a.y, hd);
    for (let k = 0; k < 6; k++) uvs.push(-1, -1);
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  return geometry;
}

/** Sum of triangle areas from a triangulation, for the no-self-overlap check. */
export function triangulatedArea(outline: readonly Point[], faces: readonly number[][]): number {
  let sum = 0;
  for (const [ia, ib, ic] of faces) {
    const a = outline[ia];
    const b = outline[ib];
    const c = outline[ic];
    sum += Math.abs((b.x - a.x) * (c.y - a.y) - (c.x - a.x) * (b.y - a.y)) / 2;
  }
  return sum;
}

/** The triangulation this module would use — exposed so tests can check the faces
 *  themselves rather than only the emitted buffer. */
export function triangulateOutline(outline: readonly Point[]): number[][] {
  return THREE.ShapeUtils.triangulateShape(
    outline.map((p) => new THREE.Vector2(p.x, p.y)),
    [],
  );
}
