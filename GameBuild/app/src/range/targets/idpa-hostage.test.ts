// Tests for the windowed IDPA hostage silhouette.
//
// The load-bearing property is the WINDOW: a shot landing inside it must miss
// this plate cleanly (the centre paddle handles it, on its own instance), never
// fall through to the silhouette's own zones — that is what `isHole`
// (`target-type.ts`, `game/target-hit.ts`) exists for. Everything else about
// this type is identical to `idpa.ts`'s `IDPA_SILHOUETTE`, so those tests are
// not re-derived here beyond confirming the shared geometry actually matches.

import { describe, it, expect } from 'vitest';
import {
  IDPA_HOSTAGE_FACE_HEX,
  IDPA_HOSTAGE_SILHOUETTE,
  IDPA_HOSTAGE_WINDOW_CIRCLE,
} from './idpa-hostage';
import { IDPA_ASPECT, IDPA_BODY_CIRCLE, IDPA_OUTLINE, IDPA_SILHOUETTE } from './idpa';
import { getTargetType, listTargetTypes } from './registry';
import { validateTargetType } from './target-type';
import { zoneAt } from '../../game/target-hit';
import { toLocal } from './svg-outline';
import { planFace, type DrawOp } from './face-plan';
import { rasterizeFace, type FaceContext, type FaceRasterDeps } from './face-raster';
import { PLATE_LAYER_BYTES } from '../plate-surface';

/**
 * Raster deps that return a REAL byte buffer over a do-nothing context.
 *
 * The context is inert because these tests are about the alpha channel, which
 * `rasterizeFace` writes itself (the opacity pass, then the cut pass) rather than
 * reading back from a canvas — so a node env with no canvas can still check the
 * one thing that decides whether the window is a hole. Colour fidelity is
 * `face-raster.test.ts`'s call-log problem.
 */
function byteDeps(): FaceRasterDeps {
  const noop = () => {};
  const ctx = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    fillRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    ellipse: noop,
    fill: noop,
    stroke: noop,
    save: noop,
    restore: noop,
    translate: noop,
    scale: noop,
    drawImage: noop,
  } as unknown as FaceContext;
  const bytes = new Uint8Array(PLATE_LAYER_BYTES);
  return { makeSurface: () => ({ ctx, readRgba: () => bytes }), loadImage: async () => null };
}

describe('idpa-hostage-silhouette', () => {
  it('is a valid target type', () => {
    expect(() => validateTargetType(IDPA_HOSTAGE_SILHOUETTE)).not.toThrow();
  });

  it('shares its outline and aspect with the plain IDPA silhouette', () => {
    expect(IDPA_HOSTAGE_SILHOUETTE.shape).toEqual({ kind: 'polygon', points: IDPA_OUTLINE });
    expect(IDPA_HOSTAGE_SILHOUETTE.aspect).toBe(IDPA_ASPECT);
  });

  it('shares the same head-0/body-0/minus-1/minus-3 zones as the plain silhouette', () => {
    const ids = IDPA_HOSTAGE_SILHOUETTE.zones.map((z) => z.id);
    for (const id of IDPA_SILHOUETTE.zones.map((z) => z.id)) expect(ids).toContain(id);
  });

  it('the window is the FIRST zone (best-first) and is marked isHole', () => {
    expect(IDPA_HOSTAGE_SILHOUETTE.zones[0].id).toBe('window');
    expect(IDPA_HOSTAGE_SILHOUETTE.zones[0].isHole).toBe(true);
  });

  it('is concentric with body-0, and strictly smaller than it (owner, on device)', () => {
    expect(IDPA_HOSTAGE_WINDOW_CIRCLE.cx).toBe(IDPA_BODY_CIRCLE.cx);
    expect(IDPA_HOSTAGE_WINDOW_CIRCLE.cy).toBe(IDPA_BODY_CIRCLE.cy);
    expect(IDPA_HOSTAGE_WINDOW_CIRCLE.r).toBeLessThan(IDPA_BODY_CIRCLE.r);
  });

  describe('hit resolution around the window', () => {
    const at = (xPx: number, yPx: number) =>
      toLocal({ x: xPx, y: yPx }, { widthPx: 393.25, cxPx: 211.625, cyPx: 346.875 });
    const BR = 0.0067056 / 2 / IDPA_HOSTAGE_SILHOUETTE.defaultWidthM;
    const zone = (xPx: number, yPx: number) => zoneAt(at(xPx, yPx), IDPA_HOSTAGE_SILHOUETTE, BR);
    const W = IDPA_HOSTAGE_WINDOW_CIRCLE;

    it('misses cleanly (null) dead centre of the window, where the paddle would sit', () => {
      expect(zone(W.cx, W.cy)).toBeNull();
    });

    it('still misses well inside the window radius', () => {
      expect(zone(W.cx + W.r * 0.5, W.cy)).toBeNull();
    });

    it('scores body-0 just outside the window — the window nests inside it', () => {
      // The window is concentric with, and smaller than, body-0 (owner: "it
      // should line up with the center circle in the target"), so the ring
      // between the two still scores as body-0.
      expect(zone(W.cx + W.r + 5, W.cy)).toBe('body-0');
    });

    it('scores minus-1 once clear of body-0 entirely', () => {
      expect(zone(W.cx + 90, W.cy)).toBe('minus-1');
    });

    it('resolves head-0 normally, unaffected by the window', () => {
      expect(zone(211.55, 90.55)).toBe('head-0');
    });

    it('misses outside the silhouette, same as the plain IDPA', () => {
      expect(zone(5, 400)).toBeNull();
      expect(zone(211, 690)).toBeNull();
    });
  });

  // Owner, on device 2026-08-06: plain white body, no IDPA artwork or zone lines,
  // and the window a real see-through hole rather than a black spot.
  it('is a plain white face with NO artwork and no drawn zone lines', () => {
    const kinds = IDPA_HOSTAGE_SILHOUETTE.paint.layers.map((l) => l.kind);
    expect(kinds).toEqual(['fill', 'cut']);
    expect(kinds).not.toContain('image');
    expect(kinds).not.toContain('zones');
    expect(IDPA_HOSTAGE_SILHOUETTE.paint.palette).toEqual({ face: IDPA_HOSTAGE_FACE_HEX });
    expect(IDPA_HOSTAGE_FACE_HEX).toBe(0xffffff);
    // The plate's engine paint colour comes from the `fill` layer, so a splat
    // composites against white rather than against the retired tan.
    expect(planFace(IDPA_HOSTAGE_SILHOUETTE).paintHex).toBe(0xffffff);
  });

  it('cuts the window LAST, so nothing fills it back in', () => {
    const layers = IDPA_HOSTAGE_SILHOUETTE.paint.layers;
    const last = layers[layers.length - 1];
    expect(last.kind).toBe('cut');
    expect((last as { zoneIds: readonly string[] }).zoneIds).toEqual(['window']);
  });

  it('rasterises the window to fully TRANSPARENT texels, not to a dark fill', async () => {
    // The owner's actual complaint ("currently it's just a black spot") is about
    // the bytes, so this asserts the bytes: inside the window alpha 0, outside
    // alpha 255 in the face colour.
    const plan = planFace(IDPA_HOSTAGE_SILHOUETTE);
    const rgba = await rasterizeFace(plan, byteDeps());
    const cut = plan.ops.find((o) => o.kind === 'ellipse' && o.cut) as {
      cx: number;
      cy: number;
      rx: number;
      ry: number;
    };
    const alphaAt = (x: number, y: number) =>
      rgba[(Math.round(y) * plan.widthPx + Math.round(x)) * 4 + 3];

    expect(alphaAt(cut.cx, cut.cy)).toBe(0); // dead centre of the window
    expect(alphaAt(cut.cx + cut.rx * 0.5, cut.cy)).toBe(0); // well inside it
    expect(alphaAt(cut.cx + cut.rx * 1.5, cut.cy)).toBe(255); // clear of it: solid
    expect(alphaAt(4, 4)).toBe(255); // a far corner of the tile
  });

  it('cuts BOTH faces of the plate, not just the shooter-facing half', () => {
    // A plate is one tile holding both halves (`face-plan.ts`); a hole through
    // steel is visible from either side.
    const cuts = planFace(IDPA_HOSTAGE_SILHOUETTE).ops.filter(
      (o): o is Extract<DrawOp, { kind: 'ellipse' }> => o.kind === 'ellipse' && o.cut === true,
    );
    expect(cuts.map((o) => o.side).sort()).toEqual(['downrange', 'shooter']);
  });

  it('is registered, and defaults to a stake mount like the plain silhouette', () => {
    expect(getTargetType('idpa-hostage-silhouette')).toBe(IDPA_HOSTAGE_SILHOUETTE);
    expect(listTargetTypes()).toContain(IDPA_HOSTAGE_SILHOUETTE);
    expect(IDPA_HOSTAGE_SILHOUETTE.defaultMount).toBe('bolt-stake');
    expect(IDPA_HOSTAGE_SILHOUETTE.compatibleMounts).toContain('chain-beam');
  });
});
