// Tests for the face rasteriser (task T6c).
//
// The rasteriser is a REPLAY, so it is tested as one: a mocked 2D context records the
// call sequence and the tests assert that sequence against the plan, not pixels. That
// is the honest boundary — actual rendering needs a real canvas, which the node env
// does not have (and adding `canvas` is forbidden by execution-protocol §3), so how
// faces LOOK is the task's owner check.

import { describe, it, expect } from 'vitest';
import {
  applyCuts,
  artUrl,
  cssColor,
  rasterizeFace,
  type FaceContext,
  type FaceRasterDeps,
} from './face-raster';
import { planFace, type DrawOp, type FacePlan } from './face-plan';
import { PLATE_LAYER_BYTES, PLATE_TILE_HEIGHT, PLATE_TILE_WIDTH } from '../plate-surface';
import type { TargetType } from './target-type';

/** Records every call, in order, as `name(args)` strings. */
function mockContext(): { ctx: FaceContext; calls: string[] } {
  const calls: string[] = [];
  const rec =
    (name: string) =>
    (...args: unknown[]) => {
      calls.push(`${name}(${args.map((a) => (typeof a === 'number' ? +a.toFixed(3) : typeof a === 'object' ? 'IMG' : String(a))).join(',')})`);
    };
  // Style setters are recorded too — they are part of the replay sequence, and a
  // stroke applied with the wrong colour is exactly the kind of ordering bug the call
  // log is here to catch.
  const state = { fillStyle: '', strokeStyle: '', lineWidth: 0 };
  const ctx = {
    get fillStyle() {
      return state.fillStyle;
    },
    set fillStyle(v: string) {
      state.fillStyle = v;
      calls.push(`fillStyle=${v}`);
    },
    get strokeStyle() {
      return state.strokeStyle;
    },
    set strokeStyle(v: string) {
      state.strokeStyle = v;
      calls.push(`strokeStyle=${v}`);
    },
    get lineWidth() {
      return state.lineWidth;
    },
    set lineWidth(v: number) {
      state.lineWidth = v;
      calls.push(`lineWidth=${v}`);
    },
    fillRect: rec('fillRect'),
    beginPath: rec('beginPath'),
    closePath: rec('closePath'),
    moveTo: rec('moveTo'),
    lineTo: rec('lineTo'),
    ellipse: rec('ellipse'),
    fill: rec('fill'),
    stroke: rec('stroke'),
    save: rec('save'),
    restore: rec('restore'),
    translate: rec('translate'),
    scale: rec('scale'),
    drawImage: rec('drawImage'),
  } as unknown as FaceContext;
  return { ctx, calls };
}

/** Deps with a recording context. `art` lists the ids that load successfully. */
function deps(opts: { art?: string[]; fail?: string[]; alpha?: number } = {}) {
  const { ctx, calls } = mockContext();
  const bytes = new Uint8Array(PLATE_LAYER_BYTES);
  // Simulate a partially-transparent surface so the opacity forcing is observable.
  for (let i = 3; i < bytes.length; i += 4) bytes[i] = opts.alpha ?? 0;
  const loaded: string[] = [];
  const d: FaceRasterDeps = {
    makeSurface: () => ({ ctx, readRgba: () => bytes }),
    loadImage: async (artId) => {
      loaded.push(artId);
      if (opts.fail?.includes(artId)) throw new Error('fetch failed');
      return opts.art?.includes(artId) ? { artId } : null;
    },
  };
  return { d, calls, bytes, loaded };
}

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

/** fill → art → drawn ring → zone stroke: the full stack. */
const ARTED: TargetType = {
  ...GONG,
  id: 'arted',
  paint: {
    palette: { face: 0xb4946e, ring: 0x2f6fd0, line: 0x1a1a1a },
    layers: [
      { kind: 'fill', color: '$face' },
      { kind: 'image', artId: 'idpa', fit: 'bbox' },
      {
        kind: 'shapes',
        items: [{ shape: { kind: 'rect', cx: 0, cy: 0, halfW: 0.2, halfH: 0.2 }, fill: '$ring' }],
      },
      { kind: 'zones', style: { plate: { stroke: '$line', strokeWidthFrac: 0.02 } } },
    ],
  },
};

describe('artUrl', () => {
  it('resolves known ids under the PWA base path', () => {
    expect(artUrl('idpa')).toContain('targets/idpa-target.svg');
  });

  it('throws on an unknown id, naming what it knows', () => {
    expect(() => artUrl('nope')).toThrow(/unknown artId 'nope' — known: idpa/);
  });
});

describe('cssColor', () => {
  it('formats a 0xRRGGBB int as a six-digit hex colour', () => {
    expect(cssColor(0xf0f0ea)).toBe('#f0f0ea');
    expect(cssColor(0x000000)).toBe('#000000'); // zero-padded, not '#0'
    expect(cssColor(0x0000ff)).toBe('#0000ff');
  });
});

describe('replay fidelity', () => {
  it('replays a solid fill as one whole-tile rect in the plan colour', async () => {
    const { d, calls } = deps();
    await rasterizeFace(planFace(GONG), d);
    expect(calls).toEqual([
      'fillStyle=#f0f0ea',
      `fillRect(0,0,${PLATE_TILE_WIDTH},${PLATE_TILE_HEIGHT})`,
    ]);
  });

  it('replays every op, in plan order, one call group each', async () => {
    const plan = planFace(ARTED);
    const { d, calls } = deps({ art: ['idpa'] });
    await rasterizeFace(plan, d);
    // One fillRect, two drawImage (both faces), two rect polygons, two zone ellipses.
    expect(calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('ellipse'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(2);
    // And the ORDER matches the plan: fill, then art, then shapes, then zones.
    const firstFill = calls.findIndex((c) => c.startsWith('fillRect'));
    const firstImg = calls.findIndex((c) => c.startsWith('drawImage'));
    const firstPoly = calls.findIndex((c) => c.startsWith('moveTo'));
    const firstEll = calls.findIndex((c) => c.startsWith('ellipse'));
    expect(firstFill).toBeLessThan(firstImg);
    expect(firstImg).toBeLessThan(firstPoly);
    expect(firstPoly).toBeLessThan(firstEll);
  });

  it('passes plan coordinates through UNCHANGED — no transform of its own', async () => {
    // The rasteriser must not "helpfully" flip or offset anything: every coordinate
    // decision belongs in `planFace`, where it is testable.
    const plan = planFace(ARTED);
    const { d, calls } = deps({ art: ['idpa'] });
    await rasterizeFace(plan, d);
    const ell = plan.ops.find((o) => o.kind === 'ellipse')!;
    expect(calls).toContain(
      `ellipse(${+ell.cx.toFixed(3)},${+ell.cy.toFixed(3)},${+ell.rx.toFixed(3)},${+ell.ry.toFixed(3)},0,0,${+(Math.PI * 2).toFixed(3)})`,
    );
  });

  it('flips a bitmap in y, because an image row 0 is its top but the buffer row 0 is the plate bottom', async () => {
    const plan = planFace(ARTED);
    const img = plan.ops.find((o) => o.kind === 'image')!;
    const { d, calls } = deps({ art: ['idpa'] });
    await rasterizeFace(plan, d);
    const i = calls.indexOf('save()');
    expect(calls.slice(i, i + 5)).toEqual([
      'save()',
      `translate(${+img.x.toFixed(3)},${+(img.y + img.h).toFixed(3)})`,
      'scale(1,-1)',
      `drawImage(IMG,0,0,${+img.w.toFixed(3)},${+img.h.toFixed(3)})`,
      'restore()',
    ]);
  });

  it('fills BEFORE stroking, and sets each style BEFORE the draw call it applies to', () => {
    // Two separate orderings, both load-bearing, and the second is easy to miss:
    // asserting only that `strokeStyle=` appears somewhere passes even if it is set
    // AFTER `stroke()`, in which case the stroke silently uses the previous colour.
    const t: TargetType = {
      ...GONG,
      paint: {
        palette: { a: 0x111111, b: 0x222222 },
        layers: [
          {
            kind: 'shapes',
            items: [
              { shape: { kind: 'circle', cx: 0, cy: 0, r: 0.3 }, fill: '$a', stroke: '$b', strokeWidthFrac: 0.02 },
            ],
          },
        ],
      },
    };
    const { d, calls } = deps();
    return rasterizeFace(planFace(t), d).then(() => {
      const at = (c: string) => calls.indexOf(c);
      expect(at('fill()')).toBeLessThan(at('stroke()'));
      expect(at('fillStyle=#111111')).toBeLessThan(at('fill()'));
      expect(at('strokeStyle=#222222')).toBeLessThan(at('stroke()'));
      expect(at('lineWidth=' + (planFace(t).ops[0] as { strokeWidthPx?: number }).strokeWidthPx)).toBeLessThan(at('stroke()'));
    });
  });

  it('traces a polygon as moveTo + lineTo… + closePath', async () => {
    const plan = planFace(ARTED);
    const poly = plan.ops.find((o) => o.kind === 'polygon')!;
    const { d, calls } = deps({ art: ['idpa'] });
    await rasterizeFace(plan, d);
    const i = calls.indexOf('beginPath()', calls.findIndex((c) => c.startsWith('drawImage')));
    expect(calls[i + 1]).toBe(`moveTo(${+poly.points[0].x.toFixed(3)},${+poly.points[0].y.toFixed(3)})`);
    expect(calls.slice(i, i + 7).filter((c) => c.startsWith('lineTo'))).toHaveLength(3);
    expect(calls.slice(i, i + 7)).toContain('closePath()');
  });

  it('uses the plan stroke width, defaulting to 1 px when absent', async () => {
    const plan = planFace(ARTED);
    const ell = plan.ops.find((o) => o.kind === 'ellipse')!;
    const { d, calls } = deps({ art: ['idpa'] });
    await rasterizeFace(plan, d);
    expect(calls).toContain(`lineWidth=${ell.strokeWidthPx}`);
  });
});

describe('asset loading', () => {
  it('loads each distinct art id ONCE even though both faces reference it', async () => {
    const { d, loaded } = deps({ art: ['idpa'] });
    await rasterizeFace(planFace(ARTED), d);
    expect(loaded).toEqual(['idpa']);
  });

  it('SKIPS only the image ops when the asset fails to load', async () => {
    // The failed-fetch path, with no fallback branch: the fill and shape layers
    // around the art still render, so the face stays legible.
    const { d, calls } = deps({ fail: ['idpa'] });
    await rasterizeFace(planFace(ARTED), d);
    expect(calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith('save'))).toHaveLength(0); // no half-applied transform
    // …and everything else is intact.
    expect(calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('ellipse'))).toHaveLength(2);
    expect(calls.filter((c) => c.startsWith('moveTo'))).toHaveLength(2);
  });

  it('treats a null image (a 404) the same as a throw', async () => {
    const { d, calls } = deps({ art: [] }); // loadImage resolves null
    await rasterizeFace(planFace(ARTED), d);
    expect(calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(1);
  });
});

describe('output buffer', () => {
  it('returns exactly one atlas layer', async () => {
    const { d } = deps();
    const out = await rasterizeFace(planFace(GONG), d);
    expect(out.length).toBe(PLATE_LAYER_BYTES);
  });

  it('forces every texel opaque', async () => {
    // A canvas starts transparent, so an uncovered texel would read as a HOLE in the
    // steel rather than as bare plate — the same reason `buildBullseyeLayer` makes
    // every texel opaque including outside the disc.
    const { d, bytes } = deps({ alpha: 0 });
    const out = await rasterizeFace(planFace(GONG), d);
    expect(bytes[3]).toBe(255); // written in place
    for (let i = 3; i < out.length; i += 4) {
      if (out[i] !== 255) throw new Error(`texel ${(i - 3) / 4} is not opaque`);
    }
  });

  it('throws if the surface is the wrong size rather than corrupting the atlas', async () => {
    const { ctx } = mockContext();
    const d: FaceRasterDeps = {
      makeSurface: () => ({ ctx, readRgba: () => new Uint8Array(16) }),
      loadImage: async () => null,
    };
    await expect(rasterizeFace(planFace(GONG), d)).rejects.toThrow(
      /produced 16 bytes, expected \d+/,
    );
  });
});

describe('cuts (a real see-through hole)', () => {
  /** Fresh byte surface per call, so a cut pass cannot read its own output. */
  function byteDeps() {
    const { ctx, calls } = mockContext();
    const bytes = new Uint8Array(PLATE_LAYER_BYTES);
    return {
      d: { makeSurface: () => ({ ctx, readRgba: () => bytes }), loadImage: async () => null } as FaceRasterDeps,
      calls,
      bytes,
    };
  }

  const alphaAt = (rgba: Uint8Array, x: number, y: number) =>
    rgba[(y * PLATE_TILE_WIDTH + x) * 4 + 3];

  /** The cut op of a given kind, narrowed — a cut carries no colour, so `kind`
   *  plus the `cut` flag is the whole identity. */
  const cutOp = <K extends 'ellipse' | 'polygon'>(plan: FacePlan, kind: K) =>
    plan.ops.find(
      (o): o is Extract<DrawOp, { kind: K }> => o.kind === kind && o.cut === true,
    )!;

  /** A gong with a circular window cut dead centre, radius 0.2 of its width. */
  const WINDOWED: TargetType = {
    ...GONG,
    id: 'windowed',
    zones: [
      { id: 'window', label: 'Window', isHole: true, shape: { kind: 'circle', cx: 0, cy: 0, r: 0.2 } },
      { id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } },
    ],
    paint: {
      palette: { face: 0xffffff },
      layers: [{ kind: 'fill', color: '$face' }, { kind: 'cut', zoneIds: ['window'] }],
    },
  };

  it('zeroes alpha inside a cut and leaves everything else opaque', async () => {
    const plan = planFace(WINDOWED);
    const { d } = byteDeps();
    const out = await rasterizeFace(plan, d);
    const cut = cutOp(plan, 'ellipse');
    expect(alphaAt(out, Math.round(cut.cx), Math.round(cut.cy))).toBe(0);
    expect(alphaAt(out, Math.round(cut.cx + cut.rx * 1.5), Math.round(cut.cy))).toBe(255);
    expect(alphaAt(out, 0, 0)).toBe(255);
  });

  it('cuts AFTER forcing opacity, not before — order or the hole heals shut', async () => {
    // The opacity pass sets every texel to 255 to deny ACCIDENTAL transparency; the
    // cut pass grants the deliberate kind. Reversed, the first would undo the second
    // and the window would render as an opaque texel of whatever was underneath.
    const plan = planFace(WINDOWED);
    const { d, bytes } = byteDeps();
    bytes.fill(0); // start fully transparent, as a real canvas does
    const out = await rasterizeFace(plan, d);
    const cut = cutOp(plan, 'ellipse');
    expect(alphaAt(out, Math.round(cut.cx), Math.round(cut.cy))).toBe(0);
    expect(alphaAt(out, 4, 4)).toBe(255); // an uncovered texel is still SOLID, not a hole
  });

  it('never replays a cut onto the context — it is a byte operation', async () => {
    // Erasing through the 2D context would put "which texels are transparent" behind
    // a canvas node does not have. `applyCuts` keeps it testable, which is the point.
    const { d, calls } = byteDeps();
    await rasterizeFace(planFace(WINDOWED), d);
    expect(calls.filter((c) => c.startsWith('ellipse'))).toHaveLength(0);
    expect(calls.filter((c) => c.startsWith('fillRect'))).toHaveLength(1); // the fill still runs
  });

  it('cuts a polygon zone by even-odd containment, not just its bounding box', async () => {
    const t: TargetType = {
      ...GONG,
      id: 'poly-cut',
      zones: [
        {
          id: 'slot',
          label: 'Slot',
          isHole: true,
          // A triangle: its bounding box corners are OUTSIDE it, which is what
          // separates real containment from a lazy box fill.
          shape: { kind: 'polygon', points: [{ x: -0.3, y: -0.3 }, { x: 0.3, y: -0.3 }, { x: 0, y: 0.3 }] },
        },
        { id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } },
      ],
      paint: {
        palette: { face: 0xffffff },
        layers: [{ kind: 'fill', color: '$face' }, { kind: 'cut', zoneIds: ['slot'] }],
      },
    };
    const plan = planFace(t);
    const { d } = byteDeps();
    const out = await rasterizeFace(plan, d);
    const poly = cutOp(plan, 'polygon');
    const xs = poly.points.map((p) => p.x);
    const ys = poly.points.map((p) => p.y);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
    const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    expect(alphaAt(out, Math.round(cx), Math.round(cy))).toBe(0); // interior
    // The apex is at cx; a top CORNER of the box is outside the triangle.
    expect(alphaAt(out, Math.round(Math.min(...xs)) + 1, Math.round(Math.max(...ys)) - 1)).toBe(255);
  });

  it('leaves a target with no cut layer fully opaque', async () => {
    const { d } = byteDeps();
    const out = await rasterizeFace(planFace(ARTED), d);
    for (let i = 3; i < out.length; i += 4) {
      if (out[i] !== 255) throw new Error(`texel ${(i - 3) / 4} became transparent`);
    }
  });
});

describe('applyCuts', () => {
  it('clamps to the tile, so a cut hanging off the edge cannot write out of bounds', () => {
    const rgba = new Uint8Array(PLATE_LAYER_BYTES).fill(255);
    expect(() =>
      applyCuts(
        rgba,
        [{ kind: 'ellipse', side: 'downrange', cx: 0, cy: 0, rx: 40, ry: 40, cut: true }],
        PLATE_TILE_WIDTH,
        PLATE_TILE_HEIGHT,
      ),
    ).not.toThrow();
    expect(rgba[3]).toBe(0); // texel (0,0) is inside it
    expect(rgba.length).toBe(PLATE_LAYER_BYTES); // nothing grew
  });

  it('touches ONLY the alpha channel — a hole keeps the colour under it', () => {
    const rgba = new Uint8Array(PLATE_LAYER_BYTES).fill(200);
    applyCuts(
      rgba,
      [{ kind: 'ellipse', side: 'downrange', cx: 10, cy: 10, rx: 5, ry: 5, cut: true }],
      PLATE_TILE_WIDTH,
      PLATE_TILE_HEIGHT,
    );
    const i = (10 * PLATE_TILE_WIDTH + 10) * 4;
    expect([rgba[i], rgba[i + 1], rgba[i + 2], rgba[i + 3]]).toEqual([200, 200, 200, 0]);
  });
});
