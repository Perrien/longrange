import { describe, expect, it } from 'vitest';
import { buildLaneGeometry } from './terrain';
import { makeTerrainSampler } from './environment-config';
import { TEST_RANGE_ENVIRONMENT, TEST_RANGE_GONG } from '../test-range-config';

// Regression test for a real bug: `buildLaneGeometry` displaced vertices
// using `sampler(x, -yLocal)`, but the mesh is rotated -Math.PI/2 about X and
// then translated by `position.z = -lengthM/2`, so a vertex's actual world z
// is `-yLocal - lengthM/2` — off by lengthM/2 (250 m) from what was sampled.
// The ground right at the target was being height-sampled ~250 m further
// downrange than it renders (past `zFlatToM`/`zBlendM`'s unlock point), so a
// relief bump always showed up at the target regardless of hill/mask tuning.
// This test applies the SAME rotate+translate transform the real mesh gets
// and checks the resulting world position against the analytic sampler.
describe('buildLaneGeometry world-space mapping', () => {
  const cfg = TEST_RANGE_ENVIRONMENT;
  const sampler = makeTerrainSampler(cfg);
  const { lengthM } = cfg.terrain;

  function worldVertices(): Array<{ x: number; y: number; z: number }> {
    const geo = buildLaneGeometry(cfg, sampler);
    geo.rotateX(-Math.PI / 2);
    geo.translate(0, 0, -lengthM / 2);
    const pos = geo.attributes.position;
    const verts: Array<{ x: number; y: number; z: number }> = [];
    for (let i = 0; i < pos.count; i++) {
      verts.push({ x: pos.getX(i), y: pos.getY(i), z: pos.getZ(i) });
    }
    return verts;
  }

  function nearest(verts: Array<{ x: number; y: number; z: number }>, x: number, z: number) {
    let best = verts[0];
    let bestD = Infinity;
    for (const v of verts) {
      const d = (v.x - x) ** 2 + (v.z - z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = v;
      }
    }
    return best;
  }

  it('renders exactly flat at the target (x=0, z=-gong distance)', () => {
    const target = nearest(worldVertices(), 0, -TEST_RANGE_GONG.distanceM);
    expect(Math.abs(target.z + TEST_RANGE_GONG.distanceM)).toBeLessThan(3); // grid-snapped, close to the target's z
    expect(Math.abs(target.y)).toBeLessThan(1e-6);
  });

  it('renders the hill bump at its configured world position, not offset by lengthM/2', () => {
    const { hill } = cfg.terrain;
    const v = nearest(worldVertices(), hill.xM, hill.zM);
    expect(v.y).toBeCloseTo(sampler(v.x, v.z), 4);
    expect(v.y).toBeGreaterThan(0.8 * hill.heightM);
  });

  it('agrees with the sampler everywhere on the mesh (no lengthM/2 offset)', () => {
    const verts = worldVertices();
    let checked = 0;
    for (let i = 0; i < verts.length; i += 37) {
      const { x, y, z } = verts[i];
      expect(y).toBeCloseTo(sampler(x, z), 3); // mm-level float precision from geometry ops
      checked++;
    }
    expect(checked).toBeGreaterThan(20);
  });
});
