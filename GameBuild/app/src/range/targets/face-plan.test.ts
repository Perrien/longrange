// Tests for the face layer plan (task T6b).
//
// The plan is where every coordinate decision about target art lives, so this is
// mostly about pinning the two traps its header names: the tile is anisotropic (a
// local circle is a texel ellipse), and row 0 is the plate's BOTTOM.
//
// Also the acceptance path for owner decision 9 — recolouring a target must be a data
// edit, and drawn shapes must be as easy as provided artwork.

import { describe, it, expect } from 'vitest';
import { FACE_TILE, PX_PER_LOCAL_X, planFace, toPx, type DrawOp } from './face-plan';
import { PLATE_TILE_HEIGHT, PLATE_TILE_WIDTH } from '../plate-surface';
import type { TargetType, ZoneStyle } from './target-type';

/** A round gong: solid paint, one plate zone. */
const GONG: TargetType = {
  id: 'gong',
  name: 'Gong',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'plate',
  massModel: 'oval',
  paint: { palette: { face: 0xf0f0ea }, layers: [{ kind: 'fill', color: '$face' }] },
  defaultWidthM: 0.3048,
  compatibleMounts: ['chain-beam'],
  defaultMount: 'chain-beam',
};

/** A tall silhouette with art, a drawn ring and zone strokes — the full stack. */
const TALL: TargetType = {
  ...GONG,
  id: 'tall',
  shape: { kind: 'rect' },
  aspect: 3.5,
  zones: [
    { id: 'centre', label: 'Centre', shape: { kind: 'circle', cx: 0, cy: 0.5, r: 0.2 } },
    { id: 'body', label: 'Body', shape: { kind: 'rect', cx: 0, cy: 0, halfW: 0.5, halfH: 1.75 } },
  ],
  defaultZoneId: 'body',
  massModel: 'rect',
  paint: {
    palette: { face: 0xb4946e, line: 0x1a1a1a, ring: 0x2f6fd0 },
    layers: [
      { kind: 'fill', color: '$face' },
      { kind: 'image', artId: 'tall-art', fit: 'bbox' },
      { kind: 'shapes', items: [{ shape: { kind: 'circle', cx: 0, cy: 0.5, r: 0.3 }, stroke: '$ring', strokeWidthFrac: 0.01 }] },
      { kind: 'zones', style: { centre: { stroke: '$line' } } },
    ],
  },
};

const ops = (t: TargetType, palette?: Record<string, number>) => planFace(t, { palette }).ops;
const only = <K extends DrawOp['kind']>(list: DrawOp[], kind: K) =>
  list.filter((o) => o.kind === kind) as Extract<DrawOp, { kind: K }>[];

describe('tile geometry', () => {
  it('agrees with the atlas about tile size', () => {
    const plan = planFace(GONG);
    expect(plan.widthPx).toBe(PLATE_TILE_WIDTH);
    expect(plan.heightPx).toBe(PLATE_TILE_HEIGHT);
    expect(FACE_TILE.halfPx * 2).toBe(PLATE_TILE_WIDTH);
  });

  it('maps the plate to a half-width, full-height box on each face', () => {
    // Δu = 0.5 across the plate, Δv = 1 — so 256 × 256 in a 512 × 256 tile.
    for (const side of ['downrange', 'shooter'] as const) {
      const l = toPx({ x: -0.5, y: 0 }, 1, side);
      const r = toPx({ x: 0.5, y: 0 }, 1, side);
      expect(r.x - l.x).toBeCloseTo(PX_PER_LOCAL_X, 9);
      expect(PX_PER_LOCAL_X).toBe(256);
    }
    const bottom = toPx({ x: 0, y: -0.5 }, 1, 'shooter');
    const top = toPx({ x: 0, y: 0.5 }, 1, 'shooter');
    expect(top.y - bottom.y).toBeCloseTo(PLATE_TILE_HEIGHT, 9);
  });

  it('puts the downrange face in the LEFT half and the shooter face in the RIGHT', () => {
    expect(toPx({ x: 0, y: 0 }, 1, 'downrange').x).toBeCloseTo(0.25 * PLATE_TILE_WIDTH, 9);
    expect(toPx({ x: 0, y: 0 }, 1, 'shooter').x).toBeCloseTo(0.75 * PLATE_TILE_WIDTH, 9);
  });

  it('TRAP 2: row 0 is the plate BOTTOM, not its top', () => {
    // v = 0.5 + y with y up and flipY = false, so buffer rows run bottom-to-top.
    // Getting this backwards renders every silhouette upside down.
    expect(toPx({ x: 0, y: -0.5 }, 1, 'shooter').y).toBeCloseTo(0, 9);
    expect(toPx({ x: 0, y: 0.5 }, 1, 'shooter').y).toBeCloseTo(PLATE_TILE_HEIGHT, 9);
  });

  it('does NOT mirror between the two faces', () => {
    // plate-geometry maps both caps with u = halfCentre + x·0.5, so local +x is
    // higher u on each. A hole at local +x is at local +x from either side.
    const dr = toPx({ x: 0.4, y: 0 }, 1, 'downrange');
    const sh = toPx({ x: 0.4, y: 0 }, 1, 'shooter');
    expect(dr.x - 0.25 * PLATE_TILE_WIDTH).toBeCloseTo(sh.x - 0.75 * PLATE_TILE_WIDTH, 9);
  });
});

describe('TRAP 1: anisotropy', () => {
  it('plans a local circle as a CIRCLE in texels on a square target', () => {
    // aspect 1 ⇒ both axes scale the same, so rx === ry.
    const square: TargetType = {
      ...GONG,
      paint: { palette: { face: 0xf0f0ea }, layers: [{ kind: 'zones', style: { plate: { stroke: '$face' } } }] },
    };
    const e = only(ops(square), 'ellipse');
    expect(e).toHaveLength(2); // one per face
    expect(e[0].rx).toBeCloseTo(e[0].ry, 6);
  });

  it('plans a local circle as an ELLIPSE on a tall target', () => {
    // The bug this prevents: emitting a circle would render scoring rings as eggs,
    // the same trap `bullseye-texture.ts` documents.
    const e = only(ops(TALL), 'ellipse');
    expect(e.length).toBeGreaterThan(0);
    for (const op of e) {
      expect(op.rx).toBeGreaterThan(op.ry * 3); // aspect 3.5 squashes y hard
      expect(op.ry).toBeCloseTo(op.rx / TALL.aspect, 6);
    }
  });

  it('scales the ring radius by the right axis in each direction', () => {
    const drawn = only(ops(TALL), 'ellipse').find((o) => o.stroke === 0x2f6fd0)!;
    expect(drawn.rx).toBeCloseTo(0.3 * PX_PER_LOCAL_X, 6);
    expect(drawn.ry).toBeCloseTo((0.3 / TALL.aspect) * PLATE_TILE_HEIGHT, 6);
  });
});

describe('palette resolution', () => {
  it('resolves a $slot against the type palette', () => {
    const fill = only(ops(GONG), 'fill');
    expect(fill).toHaveLength(1);
    expect(fill[0].color).toBe(0xf0f0ea);
  });

  it('lets a placement override win — recolouring is a DATA edit', () => {
    // The acceptance test for owner decision 9.
    const fill = only(ops(GONG, { face: 0xffffff }), 'fill');
    expect(fill[0].color).toBe(0xffffff);
  });

  it('falls back to the type default for slots the override does not mention', () => {
    const list = ops(TALL, { face: 0x111111 });
    expect(only(list, 'fill')[0].color).toBe(0x111111);
    // `$ring` untouched.
    expect(only(list, 'ellipse').some((o) => o.stroke === 0x2f6fd0)).toBe(true);
  });

  it('does not mutate the type when an override is applied', () => {
    planFace(GONG, { palette: { face: 0x000000 } });
    expect(GONG.paint.palette).toEqual({ face: 0xf0f0ea });
    expect(only(ops(GONG), 'fill')[0].color).toBe(0xf0f0ea);
  });

  it('accepts a literal colour alongside slots', () => {
    const t: TargetType = { ...GONG, paint: { palette: {}, layers: [{ kind: 'fill', color: 0x123456 }] } };
    expect(only(ops(t), 'fill')[0].color).toBe(0x123456);
  });

  it('THROWS on an unknown slot rather than drawing nothing', () => {
    const t: TargetType = {
      ...GONG,
      paint: { palette: { face: 1 }, layers: [{ kind: 'fill', color: '$missing' }] },
    };
    expect(() => planFace(t)).toThrow(/palette slot '\$missing'/);
  });

  it('reports the paint colour so a splat composites against the right value', () => {
    expect(planFace(GONG).paintHex).toBe(0xf0f0ea);
    expect(planFace(GONG, { palette: { face: 0x00ff00 } }).paintHex).toBe(0x00ff00);
    // No fill layer ⇒ null, and the caller keeps the plate's own paintColor.
    const noFill: TargetType = {
      ...GONG,
      paint: { palette: { face: 1 }, layers: [{ kind: 'zones', style: { plate: { stroke: '$face' } } }] },
    };
    expect(planFace(noFill).paintHex).toBeNull();
  });
});

describe('layer stack', () => {
  it('emits ops bottom-first, in declared order', () => {
    const kinds = ops(TALL).map((o) => o.kind);
    expect(kinds[0]).toBe('fill'); // the base, drawn under everything
    expect(kinds.indexOf('image')).toBeGreaterThan(0);
    // The drawn ring and the zone stroke both come after the art.
    expect(kinds.lastIndexOf('ellipse')).toBeGreaterThan(kinds.indexOf('image'));
  });

  it('draws every shape on BOTH faces', () => {
    const e = only(ops(TALL), 'ellipse');
    expect(e.filter((o) => o.side === 'downrange')).toHaveLength(e.length / 2);
    expect(e.filter((o) => o.side === 'shooter')).toHaveLength(e.length / 2);
    const img = only(ops(TALL), 'image');
    expect(img.map((o) => o.side).sort()).toEqual(['downrange', 'shooter']);
  });

  it('fills the WHOLE tile once, not per face', () => {
    // Including outside the outline: a stray sample must read as steel, not a hole.
    expect(only(ops(TALL), 'fill')).toHaveLength(1);
  });

  it('fits an image op to the plate box, flagged for the row-order flip', () => {
    const img = only(ops(TALL), 'image')[0];
    expect(img.artId).toBe('tall-art');
    expect(img.w).toBeCloseTo(PX_PER_LOCAL_X, 6);
    expect(img.h).toBeCloseTo(PLATE_TILE_HEIGHT, 6);
    expect(img.y).toBeCloseTo(0, 6);
    expect(img.flipY).toBe(true);
  });

  it('an image op is SKIPPABLE without invalidating the rest of the stack', () => {
    // What the rasteriser does on a failed fetch: drop just that op. The fill and the
    // drawn/zone shapes below and above it must still produce a legible face.
    const list = ops(TALL);
    const survivors = list.filter((o) => o.kind !== 'image');
    expect(survivors.some((o) => o.kind === 'fill')).toBe(true);
    expect(survivors.filter((o) => o.kind === 'ellipse').length).toBeGreaterThan(0);
    expect(survivors.length).toBe(list.length - 2); // exactly the two image ops gone
  });

  it('converts a rect zone to a four-point polygon', () => {
    const t: TargetType = {
      ...TALL,
      paint: { palette: { line: 0x1a1a1a }, layers: [{ kind: 'zones', style: { body: { stroke: '$line' } } }] },
    };
    const polys = only(ops(t), 'polygon');
    expect(polys).toHaveLength(2);
    expect(polys[0].points).toHaveLength(4);
  });
});

describe('zones layer', () => {
  it('emits ops matching the type OWN zone shapes exactly', () => {
    // The whole point of a `zones` layer: drawn rings cannot drift from what scores.
    const t: TargetType = {
      ...TALL,
      paint: { palette: { line: 0x1a1a1a }, layers: [{ kind: 'zones', style: { centre: { stroke: '$line' } } }] },
    };
    const zone = TALL.zones[0].shape as { cx: number; cy: number; r: number };
    const drawn = only(ops(t), 'ellipse');
    expect(drawn).toHaveLength(2);
    for (const op of drawn) {
      const expected = toPx({ x: zone.cx, y: zone.cy }, TALL.aspect, op.side);
      expect(op.cx).toBeCloseTo(expected.x, 9);
      expect(op.cy).toBeCloseTo(expected.y, 9);
      expect(op.rx).toBeCloseTo(zone.r * PX_PER_LOCAL_X, 9);
      expect(op.stroke).toBe(0x1a1a1a);
    }
  });

  it('skips zones the layer does not style', () => {
    // `body` is unstyled in TALL's zones layer, so only `centre` is drawn.
    const zoneEllipses = only(ops(TALL), 'ellipse').filter((o) => o.stroke === 0x1a1a1a);
    expect(zoneEllipses).toHaveLength(2); // centre only, one per face
    expect(only(ops(TALL), 'polygon')).toHaveLength(0); // body (a rect) not drawn
  });

  it('draws styled zones WORST-FIRST, so nested fills do not bury the centres', () => {
    // Corrected at T7. Zones are authored best-first because that is what the hit test
    // walks — but painting them in that order fills the largest zone LAST and buries
    // every centre under it. Scoring zones nest, so outermost-first (== worst-first) is
    // the only correct paint order, and it is harmless when they do not overlap.
    // TALL authors `centre` (small) then `body` (large), so `body` must be drawn first.
    const t: TargetType = {
      ...TALL,
      paint: {
        palette: { a: 0x111111, b: 0x222222 },
        layers: [{ kind: 'zones', style: { body: { fill: '$b' }, centre: { fill: '$a' } } }],
      },
    };
    const list = ops(t).filter((o) => 'side' in o && o.side === 'downrange');
    expect(list.map((o) => o.kind)).toEqual(['polygon', 'ellipse']); // body, then centre
  });

  it('ignores the style object key order', () => {
    // Only the type's zone list decides order, never an object's insertion order.
    const style: Record<string, ZoneStyle> = { centre: { fill: '$a' }, body: { fill: '$b' } }; // reversed keys
    const t: TargetType = {
      ...TALL,
      paint: { palette: { a: 0x111111, b: 0x222222 }, layers: [{ kind: 'zones', style }] },
    };
    const list = ops(t).filter((o) => 'side' in o && o.side === 'downrange');
    expect(list.map((o) => o.kind)).toEqual(['polygon', 'ellipse']);
  });

  it('throws on a style keyed to a nonexistent zone', () => {
    const t: TargetType = {
      ...TALL,
      paint: { palette: { line: 1 }, layers: [{ kind: 'zones', style: { nope: { stroke: '$line' } } }] },
    };
    expect(() => planFace(t)).toThrow(/styles unknown zone 'nope'/);
  });
});

describe('stroke width', () => {
  it('converts a width-normalised fraction to pixels', () => {
    const op = only(ops(TALL), 'ellipse').find((o) => o.stroke === 0x2f6fd0)!;
    expect(op.strokeWidthPx).toBeCloseTo(0.01 * PX_PER_LOCAL_X, 6);
  });

  it('never plans a sub-pixel stroke, which would vanish', () => {
    const t: TargetType = {
      ...GONG,
      paint: {
        palette: { line: 1 },
        layers: [{ kind: 'shapes', items: [{ shape: { kind: 'circle', cx: 0, cy: 0, r: 0.4 }, stroke: '$line', strokeWidthFrac: 1e-9 }] }],
      },
    };
    expect(only(ops(t), 'ellipse')[0].strokeWidthPx).toBe(1);
  });

  it('leaves stroke width undefined when the shape does not ask for one', () => {
    const t: TargetType = {
      ...GONG,
      paint: {
        palette: { line: 1 },
        layers: [{ kind: 'shapes', items: [{ shape: { kind: 'circle', cx: 0, cy: 0, r: 0.4 }, fill: '$line' }] }],
      },
    };
    expect(only(ops(t), 'ellipse')[0].strokeWidthPx).toBeUndefined();
  });
});
