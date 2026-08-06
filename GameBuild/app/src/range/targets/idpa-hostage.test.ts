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
import { planFace } from './face-plan';
import { holeRings, outlinePolygon, ringSignedArea } from './target-geometry';
import { createPlateOutlineGeometry } from '../plate-outline-geometry';

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
    expect(kinds).toEqual(['fill']);
    expect(IDPA_HOSTAGE_SILHOUETTE.paint.palette).toEqual({ face: IDPA_HOSTAGE_FACE_HEX });
    expect(IDPA_HOSTAGE_FACE_HEX).toBe(0xffffff);
    // The plate's engine paint colour comes from the `fill` layer, so a splat
    // composites against white rather than against the retired tan.
    expect(planFace(IDPA_HOSTAGE_SILHOUETTE).paintHex).toBe(0xffffff);
  });

  it('declares the window as a MESH hole, not as paint', () => {
    // The face is paint; a hole is absence. Punching it through the face instead
    // meant `alphaTest` on the shared plate material, and the `discard` that
    // compiles in took the game from 60 FPS to ~10 on device — on every range.
    expect(IDPA_HOSTAGE_SILHOUETTE.holeZoneIds).toEqual(['window']);
    for (const layer of IDPA_HOSTAGE_SILHOUETTE.paint.layers) {
      expect(layer.kind).not.toBe('cut');
    }
  });

  it('derives ONE clockwise hole ring, matching the window zone', () => {
    // Clockwise is not a detail: earcut needs holes wound opposite the contour, and
    // the rim loop derives the wall's facing from the same winding.
    const rings = holeRings(
      IDPA_HOSTAGE_SILHOUETTE.zones,
      IDPA_HOSTAGE_SILHOUETTE.holeZoneIds,
    );
    expect(rings).toHaveLength(1);
    expect(ringSignedArea(rings[0])).toBeLessThan(0); // CW in this y-up frame
    // And it is the window's own circle: every vertex one radius from its centre.
    const w = IDPA_HOSTAGE_SILHOUETTE.zones.find((z) => z.id === 'window')!.shape as {
      cx: number;
      cy: number;
      r: number;
    };
    for (const p of rings[0]) {
      expect(Math.hypot(p.x - w.cx, p.y - w.cy)).toBeCloseTo(w.r, 9);
    }
  });

  it('punches the window clean out of the built mesh', () => {
    // End to end, on the real silhouette: no cap triangle survives over the window
    // centre, which is what makes the background visible through it.
    const holes = holeRings(IDPA_HOSTAGE_SILHOUETTE.zones, IDPA_HOSTAGE_SILHOUETTE.holeZoneIds);
    const geo = createPlateOutlineGeometry(
      outlinePolygon(IDPA_HOSTAGE_SILHOUETTE.shape, IDPA_HOSTAGE_SILHOUETTE.aspect),
      IDPA_HOSTAGE_SILHOUETTE.aspect,
      holes,
    );
    const pos = geo.getAttribute('position');
    const w = IDPA_HOSTAGE_SILHOUETTE.zones.find((z) => z.id === 'window')!.shape as {
      cx: number;
      cy: number;
    };
    let covering = 0;
    for (let t = 0; t + 2 < pos.count; t += 3) {
      const flat =
        Math.abs(pos.getZ(t) - pos.getZ(t + 1)) < 1e-9 &&
        Math.abs(pos.getZ(t) - pos.getZ(t + 2)) < 1e-9;
      if (!flat) continue; // rim/wall quads are vertical
      const sign = (ax: number, ay: number, bx: number, by: number) =>
        (w.cx - bx) * (ay - by) - (ax - bx) * (w.cy - by);
      const d1 = sign(pos.getX(t), pos.getY(t), pos.getX(t + 1), pos.getY(t + 1));
      const d2 = sign(pos.getX(t + 1), pos.getY(t + 1), pos.getX(t + 2), pos.getY(t + 2));
      const d3 = sign(pos.getX(t + 2), pos.getY(t + 2), pos.getX(t), pos.getY(t));
      if ((d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0)) covering++;
    }
    expect(covering).toBe(0);
    geo.dispose();
  });

  it('is registered, and defaults to a stake mount like the plain silhouette', () => {
    expect(getTargetType('idpa-hostage-silhouette')).toBe(IDPA_HOSTAGE_SILHOUETTE);
    expect(listTargetTypes()).toContain(IDPA_HOSTAGE_SILHOUETTE);
    expect(IDPA_HOSTAGE_SILHOUETTE.defaultMount).toBe('bolt-stake');
    expect(IDPA_HOSTAGE_SILHOUETTE.compatibleMounts).toContain('chain-beam');
  });
});
