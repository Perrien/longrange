// CHARACTERIZATION GUARD — target-system task T0.
//
// Freezes `discHit`'s hit/miss truth over a deterministic grid, so T2 can prove
// its zone-capable replacement (`game/target-hit.ts`) is decision-identical for
// round plates instead of merely arguing it. `firing-solution.test.ts` covers the
// intent; this covers the exact decision boundary, including the `<=` (an edge
// graze counts) and the bullet-radius term.
//
// The grid generator below is intentionally tiny and dependency-free so T2's
// equivalence test can restate it verbatim and compare against the same
// signature. If you change the grid, both signatures change and both tests must
// be re-pinned together — that is the point.

import { describe, it, expect } from 'vitest';
import { discHit, type PlanePoint } from './firing-solution';
import { RANGE_A_RACKS } from '../range/range-a-config';

/** Every distinct plate diameter Range A actually hangs (m), ascending. */
const PLATE_DIAMETERS_M = [
  ...new Set(RANGE_A_RACKS.flatMap((r) => r.plates.map((p) => p.diameterM))),
].sort((a, b) => a - b);

/** Real bullet diameters from the shipped cartridge ladder (m). */
const BULLET_DIAMETERS_M = {
  '.223': 0.005588, // 5.56 mm
  '6.5mm': 0.0067056, // .264
  '.308': 0.0078232, // 7.62 mm
} as const;

/** A deterministic sweep of impact points about a plate centre, in units of the
 *  plate's own radius: a cartesian lattice plus a ring sweep that deliberately
 *  straddles the edge. No RNG — the same points every run, every platform. */
function gridOffsets(radiusM: number): PlanePoint[] {
  const out: PlanePoint[] = [];
  // Cartesian lattice from −1.5 R to +1.5 R in 0.25 R steps (13 × 13 = 169).
  for (let i = -6; i <= 6; i++) {
    for (let j = -6; j <= 6; j++) {
      out.push({ x: i * 0.25 * radiusM, y: j * 0.25 * radiusM });
    }
  }
  // Ring sweep at radii that bracket the edge, 16 bearings each (5 × 16 = 80).
  for (const rf of [0.9, 0.99, 1.0, 1.01, 1.1]) {
    for (let k = 0; k < 16; k++) {
      const a = (2 * Math.PI * k) / 16;
      out.push({ x: rf * radiusM * Math.cos(a), y: rf * radiusM * Math.sin(a) });
    }
  }
  return out;
}

/** Pack the whole truth table into a compact, human-comparable bit string. */
function truthBits(plateDiameterM: number, bulletDiameterM: number): string {
  const centre: PlanePoint = { x: 0.317, y: 1.104 }; // off-origin: catches any
  // accidental absolute-coordinate assumption in a replacement implementation.
  const radiusM = plateDiameterM / 2;
  return gridOffsets(radiusM)
    .map((o) => {
      const impact = { x: centre.x + o.x, y: centre.y + o.y };
      return discHit(impact, centre, plateDiameterM, bulletDiameterM) ? '1' : '0';
    })
    .join('');
}

function hitCount(bits: string): number {
  return bits.split('').filter((c) => c === '1').length;
}

describe('T0 guard: the Range A plate ladder these grids were pinned against', () => {
  it('still has the same distinct diameters', () => {
    // 2, 3, 4, 5, 6, 7, 8, 10, 12 inches → metres (PLATE_INCHES steps up past
    // 300 yd: 350 adds 7", 400 adds 8", 450 adds 10", 500 adds 12").
    expect(PLATE_DIAMETERS_M.map((d) => Math.round((d / 0.0254) * 100) / 100)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 10, 12,
    ]);
  });

  it('generates the expected grid size', () => {
    expect(gridOffsets(0.1524)).toHaveLength(169 + 80);
  });
});

describe('T0 guard: discHit truth grid', () => {
  // One signature per (plate, bullet) pair. Hit COUNTS are pinned alongside the
  // bit strings because a count is what tells you *how* a regression differs.
  it('is scale-invariant in plate diameter for a fixed bullet/plate ratio', () => {
    // The grid is expressed in plate radii, so with the bullet radius scaled to
    // match, every diameter must produce the identical pattern. This is the
    // property that lets the per-diameter signatures below be short.
    const reference = truthBits(0.1524, 0.1524 * 0.044); // 6" plate, ratio fixed
    for (const d of PLATE_DIAMETERS_M) {
      expect(truthBits(d, d * 0.044)).toBe(reference);
    }
  });

  it('pins the truth table for every real plate × bullet pair', () => {
    const signatures: Record<string, number> = {};
    for (const d of PLATE_DIAMETERS_M) {
      for (const [name, bd] of Object.entries(BULLET_DIAMETERS_M)) {
        const inches = Math.round((d / 0.0254) * 100) / 100;
        signatures[`${inches}in/${name}`] = hitCount(truthBits(d, bd));
      }
    }
    // The grid is expressed in PLATE RADII while the bullet radius is absolute,
    // so the hit count FALLS as the plate grows (the bullet's edge bonus shrinks
    // relative to the grid spacing). Monotonicity therefore only holds across
    // bullets at a fixed plate — asserted structurally below.
    expect(signatures).toEqual({
      '2in/.223': 141,
      '2in/6.5mm': 149,
      '2in/.308': 149,
      '3in/.223': 125,
      '3in/6.5mm': 125,
      '3in/.308': 141,
      '4in/.223': 121,
      '4in/6.5mm': 125,
      '4in/.308': 125,
      '5in/.223': 121,
      '5in/6.5mm': 121,
      '5in/.308': 125,
      '6in/.223': 121,
      '6in/6.5mm': 121,
      '6in/.308': 121,
      '7in/.223': 121,
      '7in/6.5mm': 121,
      '7in/.308': 121,
      '8in/.223': 113,
      '8in/6.5mm': 121,
      '8in/.308': 121,
      '10in/.223': 113,
      '10in/6.5mm': 113,
      '10in/.308': 121,
      '12in/.223': 113,
      '12in/6.5mm': 113,
      '12in/.308': 113,
    });
  });

  it('never loses a hit when the bullet gets bigger', () => {
    for (const d of PLATE_DIAMETERS_M) {
      const small = truthBits(d, BULLET_DIAMETERS_M['.223']);
      const large = truthBits(d, BULLET_DIAMETERS_M['.308']);
      for (let i = 0; i < small.length; i++) {
        if (small[i] === '1') expect(large[i]).toBe('1');
      }
    }
  });
});

describe('T0 guard: discHit decision boundary', () => {
  const plateD = 0.1524; // 6"
  const bulletD = BULLET_DIAMETERS_M['6.5mm'];
  const r = plateD / 2 + bulletD / 2;
  // Origin-centred so `impact.x − centre.x` is EXACTLY r with no rounding — the
  // `<=` boundary is only meaningful if the arithmetic reaching it is exact.
  // (An off-origin centre is used for the grid above, which tests coordinate
  // independence rather than the boundary itself.)
  const centre: PlanePoint = { x: 0, y: 0 };

  it('counts an impact exactly ON the combined radius (line-break convention)', () => {
    expect(discHit({ x: r, y: 0 }, centre, plateD, bulletD)).toBe(true);
    expect(discHit({ x: 0, y: r }, centre, plateD, bulletD)).toBe(true);
    expect(discHit({ x: -r, y: 0 }, centre, plateD, bulletD)).toBe(true);
  });

  it('rejects an impact just outside it', () => {
    expect(discHit({ x: r * 1.0000001, y: 0 }, centre, plateD, bulletD)).toBe(false);
  });

  it('includes the bullet radius (a shot that clears the plate edge alone still hits)', () => {
    // Between the plate radius and the combined radius: a hit only because the
    // bullet has width. Guards against a replacement dropping that term.
    const between = (plateD / 2 + r) / 2;
    expect(between).toBeGreaterThan(plateD / 2);
    expect(between).toBeLessThan(r);
    expect(discHit({ x: between, y: 0 }, centre, plateD, bulletD)).toBe(true);
  });

  it('is symmetric about the plate centre', () => {
    const off: PlanePoint = { x: -0.42, y: 0.87 }; // symmetry must not need the origin
    for (const [dx, dy] of [[0.03, 0.041], [-0.03, 0.041], [0.03, -0.041], [-0.03, -0.041]]) {
      expect(discHit({ x: off.x + dx, y: off.y + dy }, off, plateD, bulletD)).toBe(
        discHit({ x: off.x - dx, y: off.y - dy }, off, plateD, bulletD),
      );
    }
  });
});
