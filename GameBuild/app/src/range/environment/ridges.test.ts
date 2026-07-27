// Ridgeline tests — Stage 4b of `Design/archive/mil-zero-range-plan.md`.
//
// Distance in a rendered scene is carried by two things: overlapping silhouettes
// at different depths, and aerial perspective separating them. These assert both
// hold, because both are easy to lose while "just adjusting the mountains" and
// neither failure is obvious in a screenshot — a flat cut-out and a layered
// horizon look similar until you compare them side by side.
import { describe, expect, it } from 'vitest';
import { generateRidgeProfile, RIDGE_BASE_Y_M, type EnvironmentConfig } from './environment-config';
import { WOODED_ZERO_ENVIRONMENT } from '../wooded-zero-environment';
import { TEST_RANGE_ENVIRONMENT } from '../test-range-config';

const CONFIGS: Array<[string, EnvironmentConfig]> = [
  ['wooded zero', WOODED_ZERO_ENVIRONMENT],
  ['test range', TEST_RANGE_ENVIRONMENT],
];

const fogAt = (density: number, distanceM: number) => 1 - Math.exp(-((density * distanceM) ** 2));
/** Perceived luminance, for comparing how pale two silhouette colours are. */
const luma = (hex: number) =>
  (0.2126 * ((hex >> 16) & 0xff) + 0.7152 * ((hex >> 8) & 0xff) + 0.0722 * (hex & 0xff)) / 255;

describe.each(CONFIGS)('%s — ridge layering', (_name, cfg) => {
  it('has at least two layers — one silhouette is a cut-out, not a landscape', () => {
    expect(cfg.ridges.layers.length).toBeGreaterThanOrEqual(2);
  });

  it('orders layers near-to-far, each further than the last', () => {
    const d = cfg.ridges.layers.map((l) => l.distanceM);
    for (let i = 1; i < d.length; i++) expect(d[i]).toBeGreaterThan(d[i - 1]);
  });

  it('makes further layers LOWER, so they read as behind rather than bigger', () => {
    const layers = cfg.ridges.layers;
    for (let i = 1; i < layers.length; i++) {
      expect(layers[i].heightMaxM).toBeLessThan(layers[i - 1].heightMaxM);
    }
  });

  it('makes further layers PALER — the core aerial-perspective cue', () => {
    const layers = cfg.ridges.layers;
    for (let i = 1; i < layers.length; i++) {
      expect(luma(layers[i].colorHex)).toBeGreaterThan(luma(layers[i - 1].colorHex));
    }
  });

  it('separates the layers meaningfully in haze, not just in depth', () => {
    // If both layers fog to nearly the same value they merge into one mass and
    // the second layer is wasted geometry.
    const f = cfg.ridges.layers.map((l) => fogAt(cfg.fog.density, l.distanceM));
    for (let i = 1; i < f.length; i++) expect(f[i] - f[i - 1]).toBeGreaterThan(0.1);
  });

  it('keeps every layer hazy but not fully dissolved', () => {
    for (const l of cfg.ridges.layers) {
      const f = fogAt(cfg.fog.density, l.distanceM);
      expect(f).toBeGreaterThan(0.2); // reads as distance
      expect(f).toBeLessThan(0.9); // still visible as a shape
    }
  });
});

describe.each(CONFIGS)('%s — ridge profiles', (_name, cfg) => {
  it('spans an arc wide enough that panning never runs off the end', () => {
    // The fanned bay alone covers ~10.5 deg, and the player can look well past
    // the outermost lane.
    expect(cfg.ridges.halfArcDeg).toBeGreaterThan(45);
  });

  it('varies in height along the crest instead of being a flat wall', () => {
    for (let i = 0; i < cfg.ridges.layers.length; i++) {
      const crest = generateRidgeProfile(cfg, i);
      const ys = crest.map((p) => p.y);
      const spread = Math.max(...ys) - Math.min(...ys);
      const configured = cfg.ridges.layers[i].heightMaxM - cfg.ridges.layers[i].heightMinM;
      // Should use most of the configured height band.
      expect(spread).toBeGreaterThan(configured * 0.6);
    }
  });

  it('is smooth — no spike between neighbouring crest samples', () => {
    // A jagged profile reads as noise, not terrain. Neighbouring samples are a
    // degree or so apart, so a big jump means the octave frequencies are too
    // high for the segment count.
    for (let i = 0; i < cfg.ridges.layers.length; i++) {
      const layer = cfg.ridges.layers[i];
      const crest = generateRidgeProfile(cfg, i);
      const band = layer.heightMaxM - layer.heightMinM;
      for (let k = 1; k < crest.length; k++) {
        expect(Math.abs(crest[k].y - crest[k - 1].y)).toBeLessThan(band * 0.35);
      }
    }
  });

  it('carries the base below the horizon so no sky shows underneath', () => {
    // The ridges sit ~1 km out, far past the end of the terrain mesh, so nothing
    // else fills the gap between the ridge foot and the skyline.
    expect(RIDGE_BASE_Y_M).toBeLessThan(0);
    for (let i = 0; i < cfg.ridges.layers.length; i++) {
      for (const p of generateRidgeProfile(cfg, i)) expect(p.y).toBeGreaterThan(RIDGE_BASE_Y_M);
    }
  });

  it('gives each layer its own profile — not the same ridge twice', () => {
    if (cfg.ridges.layers.length < 2) return;
    const a = generateRidgeProfile(cfg, 0).map((p) => p.y);
    const b = generateRidgeProfile(cfg, 1).map((p) => p.y);
    // Different seeds per layer, so even normalised the shapes must differ.
    const norm = (ys: number[]) => {
      const lo = Math.min(...ys);
      const hi = Math.max(...ys);
      return ys.map((y) => (y - lo) / (hi - lo));
    };
    const na = norm(a);
    const nb = norm(b);
    const n = Math.min(na.length, nb.length);
    let diff = 0;
    for (let i = 0; i < n; i++) diff += Math.abs(na[i] - nb[i]);
    expect(diff / n).toBeGreaterThan(0.05);
  });

  it('is deterministic for a given config', () => {
    expect(generateRidgeProfile(cfg, 0)).toEqual(generateRidgeProfile(cfg, 0));
  });
});
