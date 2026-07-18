// Plate disc geometry (target-surface task TS-B) — a unit round plate whose
// caps carry UVs into the per-plate paint texture, ported from BallisticsToolkit
// steel-sim `SteelTarget.js` createUnitCircleGeometry (MIT).
//
// Authored in the ENGINE's local frame (btk::rendering::SteelTarget): the plate
// face lies in the XY plane, thickness runs along Z, and the engine normal
// (0,0,-1) points DOWNRANGE — so with the game's plates at identity orientation
// (plate local axes == world axes), the +Z cap is the face the shooter sees.
// Instances therefore need no face-the-shooter rotation (the old CylinderGeometry
// convention); scale is (diameter, diameter, thickness).
//
// UV convention (pinned by the TS-A native tests, test_steel_target_paint.cpp):
// the engine's texture is split — left half u∈[0,0.5] is its "front" face (−Z),
// right half u∈[0.5,1] its "back" (+Z). A downrange bullet has vel·normal > 0,
// so the engine paints the RIGHT half — which is exactly the +Z shooter-facing
// cap mapped here. Cap mapping matches the C++ drawImpactOnTexture math
// (u = 0.5 + x/width compressed into the half): u = halfCenter + x·0.5,
// v = 0.5 + y. Rim vertices get UV (−1,−1), which the plate material's shader
// reads as "no texture — flat metal gray".

import * as THREE from 'three';

/** Unit plate disc: radius 0.5 in XY, thickness 1 along Z, cap UVs per the
 * engine texture convention above. */
export function createPlateDiscGeometry(segments = 40): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const positions: number[] = [];
  const uvs: number[] = [];

  const r = 0.5; // unit radius (scale by diameter)
  const hd = 0.5; // unit half-thickness (scale by plate thickness)

  // WINDING (TS-C iter-1 fix, owner bug report 2026-07-18): every face winds
  // OUTWARD so the default FrontSide material shows the correct cap. BTK's
  // original fan orders were authored for a DoubleSide material and actually
  // front-faced INWARD — with FrontSide that culled the shooter-facing cap at
  // rest (the splat only appeared mid-swing, mirrored, and "vanished" on
  // settle) and made the rim invisible edge-on. CCW as seen from outside the
  // face == front, per WebGL/three convention.

  // Downrange cap (z = −hd; engine "front") — LEFT texture half. Outward = −Z:
  // wind (center, θ2, θ1), which is CCW when viewed from −Z.
  for (let i = 0; i < segments; i++) {
    const a1 = (2 * Math.PI * i) / segments;
    const a2 = (2 * Math.PI * (i + 1)) / segments;
    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2);
    const sin2 = Math.sin(a2);

    positions.push(0, 0, -hd);
    positions.push(r * cos2, r * sin2, -hd);
    positions.push(r * cos1, r * sin1, -hd);

    uvs.push(0.25, 0.5);
    uvs.push(0.25 + cos2 * 0.25, 0.5 + sin2 * 0.5);
    uvs.push(0.25 + cos1 * 0.25, 0.5 + sin1 * 0.5);
  }

  // Shooter-facing cap (z = +hd; engine "back") — RIGHT texture half. Outward =
  // +Z: wind (center, θ1, θ2), CCW when viewed from +Z (the shooter). Local +X
  // (viewer's right) maps to higher u, +Y to higher v, matching where the
  // engine paints an offset hit (TS-A OffsetHitMapsLocalXYToTexel).
  for (let i = 0; i < segments; i++) {
    const a1 = (2 * Math.PI * i) / segments;
    const a2 = (2 * Math.PI * (i + 1)) / segments;
    const cos1 = Math.cos(a1);
    const sin1 = Math.sin(a1);
    const cos2 = Math.cos(a2);
    const sin2 = Math.sin(a2);

    positions.push(0, 0, hd);
    positions.push(r * cos1, r * sin1, hd);
    positions.push(r * cos2, r * sin2, hd);

    uvs.push(0.75, 0.5);
    uvs.push(0.75 + cos1 * 0.25, 0.5 + sin1 * 0.5);
    uvs.push(0.75 + cos2 * 0.25, 0.5 + sin2 * 0.5);
  }

  // Rim (two triangles per segment, wound radially OUTWARD), UV (−1,−1) →
  // shader paints flat gray. Quad corners: P1=(θ1,−hd) P2=(θ2,−hd) P3=(θ1,+hd)
  // P4=(θ2,+hd); triangles (P1,P2,P3) and (P2,P4,P3) both face away from the
  // axis.
  for (let i = 0; i < segments; i++) {
    const a1 = (2 * Math.PI * i) / segments;
    const a2 = (2 * Math.PI * (i + 1)) / segments;
    const x1 = r * Math.cos(a1);
    const y1 = r * Math.sin(a1);
    const x2 = r * Math.cos(a2);
    const y2 = r * Math.sin(a2);

    positions.push(x1, y1, -hd);
    positions.push(x2, y2, -hd);
    positions.push(x1, y1, hd);

    positions.push(x2, y2, -hd);
    positions.push(x2, y2, hd);
    positions.push(x1, y1, hd);

    uvs.push(-1, -1, -1, -1, -1, -1);
    uvs.push(-1, -1, -1, -1, -1, -1);
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(uvs), 2));
  geometry.computeVertexNormals();
  return geometry;
}
