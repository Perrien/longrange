// CHARACTERIZATION GUARD — target-system task T0.
//
// Freezes the TWO-SIDED paint invariant: the engine's paint buffer is split
// front|back, and a shot arriving from the shooter paints ONLY the shooter-facing
// half, leaving the downrange half at clean paint. Marks on a face the player
// cannot see stay invisible until that face is presented.
//
// Why this is worth its own guard: the design for flipping targets (dueling tree
// paddles, Design/archive/target-system-plan.md §8) depends entirely on this split,
// and on the fact that the engine picks the half from its LIVE surface normal
// (`is_front_face = vel·normal_ < 0`, steel_target.cpp:580) — which only tracks
// the body's own `orientation_`. A TS-animated pose therefore cannot move the
// paint to the other face. T10 adds the setter that fixes that; this test is what
// will show it working, and what catches a regression in the split itself.
//
// Loads the real engine WASM in node via the `@engine` alias, like
// `steel-target.test.ts`.

import { describe, it, expect, beforeAll } from 'vitest';
import { loadBtkModule } from './wasm-module';
import { createSteelReaction, STEEL_PAINT_TEXTURE_SIZE, type SteelReactionSpec } from './steel-target';
import type { BtkModule } from './types';

/** 12" gong (the Test Range's plate), hung like Range A steel. */
const SPEC: SteelReactionSpec = {
  diameterM: 0.3048,
  thicknessM: 0.0127,
  position: { x: 0, y: 0.55, z: -91.44 },
  beamHeightM: 1.1,
  paintColorHex: 0xf0f0ea, // the shipped PLATE_COLOR
};
const MASS_KG = 0.0090718474; // 6.5 mm 140 gr
const DIA_M = 0.0067056;
/** Downrange (−Z) with a little drop — a shot from the firing line. */
const VEL_DOWNRANGE = { x: 0, y: -8, z: -760 };

const WIDTH = STEEL_PAINT_TEXTURE_SIZE * 2;
const HEIGHT = STEEL_PAINT_TEXTURE_SIZE;
const HALF = STEEL_PAINT_TEXTURE_SIZE;

/** Count texels in a horizontal half of the buffer that differ from the paint
 *  colour — i.e. that the engine chipped down toward bare metal. */
function chippedTexels(rgba: Uint8Array, half: 'left' | 'right'): number {
  const paintR = (SPEC.paintColorHex! >> 16) & 0xff;
  const paintG = (SPEC.paintColorHex! >> 8) & 0xff;
  const paintB = SPEC.paintColorHex! & 0xff;
  const xMin = half === 'left' ? 0 : HALF;
  const xMax = half === 'left' ? HALF : WIDTH;
  let chipped = 0;
  for (let y = 0; y < HEIGHT; y++) {
    for (let x = xMin; x < xMax; x++) {
      const i = (y * WIDTH + x) * 4;
      if (rgba[i] !== paintR || rgba[i + 1] !== paintG || rgba[i + 2] !== paintB) chipped++;
    }
  }
  return chipped;
}

let module: BtkModule;
beforeAll(async () => {
  module = await loadBtkModule();
});

describe('T0 guard: two-sided paint split', () => {
  it('starts fully painted in the plate colour, both halves', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      const tex = r.getTexture();
      expect(tex.length).toBe(WIDTH * HEIGHT * 4);
      expect(chippedTexels(tex, 'left')).toBe(0);
      expect(chippedTexels(tex, 'right')).toBe(0);
    } finally {
      r.delete();
    }
  });

  it('paints a downrange hit ONLY in the shooter-facing (right) half', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      const tex = r.getTexture();
      // The shooter-facing cap maps to u ∈ [0.5,1] (plate-geometry.ts), so a mark
      // the player can see must land in the right half...
      expect(chippedTexels(tex, 'right')).toBeGreaterThan(0);
      // ...and the downrange face must still be clean. This is the whole
      // invariant a flipping paddle relies on.
      expect(chippedTexels(tex, 'left')).toBe(0);
    } finally {
      r.delete();
    }
  });

  it('accumulates repeat hits without ever bleeding into the downrange half', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      const offsets = [-0.1, -0.05, 0, 0.05, 0.1];
      let previous = 0;
      for (const dx of offsets) {
        r.strike(
          { x: SPEC.position.x + dx, y: SPEC.position.y, z: SPEC.position.z },
          VEL_DOWNRANGE,
          MASS_KG,
          DIA_M,
        );
        const tex = r.getTexture();
        const right = chippedTexels(tex, 'right');
        expect(right).toBeGreaterThan(previous);
        expect(chippedTexels(tex, 'left')).toBe(0);
        previous = right;
      }
    } finally {
      r.delete();
    }
  });

  it('repaint() restores clean paint across both halves', () => {
    const r = createSteelReaction(module, SPEC);
    try {
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      expect(chippedTexels(r.getTexture(), 'right')).toBeGreaterThan(0);
      r.repaint();
      const tex = r.getTexture();
      expect(chippedTexels(tex, 'right')).toBe(0);
      expect(chippedTexels(tex, 'left')).toBe(0);
    } finally {
      r.delete();
    }
  });

  it('CAN now be flipped from TS, and the paint follows the face (T10)', () => {
    // T0 wrote this as `expect('setOrientation' in r).toBe(false)` — a deliberate
    // tripwire documenting the gap, updated here now that T10 closes it. A TS-driven
    // pose used to leave the C++ `orientation_` untouched, so the engine kept believing
    // the plate faced downrange and kept painting the same half.
    const r = createSteelReaction(module, SPEC);
    try {
      expect('setOrientation' in r).toBe(true);
      // Flipped 180° about vertical: the face the shooter sees is now the engine's
      // "front", so a downrange bullet must paint the LEFT half.
      r.setOrientation({ x: 0, y: 1, z: 0, w: 0 });
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      const tex = r.getTexture();
      expect(chippedTexels(tex, 'left')).toBeGreaterThan(0);
      expect(chippedTexels(tex, 'right')).toBe(0);
    } finally {
      r.delete();
    }
  });

  it('leaves the un-flipped case exactly as it was', () => {
    // The regression that matters: adding the setter must not change a plate nobody
    // re-poses, which is every plate on every shipped range.
    const r = createSteelReaction(module, SPEC);
    try {
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      const tex = r.getTexture();
      expect(chippedTexels(tex, 'right')).toBeGreaterThan(0);
      expect(chippedTexels(tex, 'left')).toBe(0);
    } finally {
      r.delete();
    }
  });

  it('accumulates marks on BOTH faces across a flip and back', () => {
    // What a dueling-tree paddle needs: each face keeps its own marks, and the hidden
    // one stays hidden until the paddle turns round again.
    const r = createSteelReaction(module, SPEC);
    try {
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      const rightFirst = chippedTexels(r.getTexture(), 'right');
      expect(rightFirst).toBeGreaterThan(0);

      r.setOrientation({ x: 0, y: 1, z: 0, w: 0 }); // flip
      r.strike(SPEC.position, VEL_DOWNRANGE, MASS_KG, DIA_M);
      const tex = r.getTexture();
      expect(chippedTexels(tex, 'left')).toBeGreaterThan(0); // the other face marked
      expect(chippedTexels(tex, 'right')).toBe(rightFirst); // the first mark survives
    } finally {
      r.delete();
    }
  });

  it('round-trips a pose through the engine without drift', () => {
    // The bridge passes {x,y,z,w} but the C++ constructor is (w,x,y,z); getting that
    // order wrong would silently rotate every flipped target somewhere else.
    const r = createSteelReaction(module, SPEC);
    try {
      r.setOrientation({ x: 0, y: 1, z: 0, w: 0 });
      const q = r.getPose().quaternion;
      expect(Math.abs(q.y)).toBeCloseTo(1, 5);
      expect(Math.abs(q.w)).toBeCloseTo(0, 5);
      expect(Math.abs(q.x)).toBeCloseTo(0, 5);
      expect(Math.abs(q.z)).toBeCloseTo(0, 5);
    } finally {
      r.delete();
    }
  });
});
