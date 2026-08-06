// Tests for the target-type abstraction + registry (task T1). Pure — no THREE,
// no engine, no DOM.
//
// The load-bearing part is `validateTargetType`: it runs at import in
// `registry.ts`, so it is the thing standing between a mis-authored target and a
// silently wrong face, an unhittable zone, or a mis-scaled outline. Each failure
// mode below is a bug that would otherwise only show up on device.

import { describe, it, expect } from 'vitest';
import { validateTargetType, type Point, type TargetType } from './target-type';
import { aspectOf, zoneSamplePoints } from './target-geometry';
import { getTargetType, hasTargetType, listTargetTypes } from './registry';

/** A minimal valid disc type; `over` patches any field for the failure cases. */
function discType(over: Partial<TargetType> = {}): TargetType {
  return {
    id: 'test-disc',
    name: 'Test disc',
    shape: { kind: 'disc' },
    aspect: 1,
    zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
    defaultZoneId: 'plate',
    massModel: 'oval',
    paint: { palette: { face: 0xf0f0ea }, layers: [{ kind: 'fill', color: '$face' }] },
    defaultWidthM: 0.3048,
    compatibleMounts: ['chain-beam', 'bolt-stake'],
    defaultMount: 'chain-beam',
    ...over,
  };
}

// --- the real IDPA spec, normalised here the way T3b will ---------------------
// Straight from Documentation/Targets/idpa-target.svg (viewBox 423×694, stated
// total height 30.75"). Included at T1 so the validator is proven against the
// ACTUAL target before T7 depends on it — an abstraction that only accepts
// synthetic fixtures is not yet load-bearing.
const IDPA_SVG_OUTLINE: readonly [number, number][] = [
  [145, 15], [278.25, 15], [278.25, 143], [360.75, 143.5], [408.25, 215.25],
  [408.25, 566.25], [348, 678.75], [74, 678.75], [15, 566.25], [15, 214.75],
  [62.5, 143.5], [144.75, 143.25],
];

/** The outline's own bounding box — the ONE reference every other shape in the
 *  drawing is normalised against. Normalising a zone against its own bbox instead
 *  (my first attempt) silently stretches it to fill the target, which the
 *  zone-inside-outline check caught. */
const REF = (() => {
  const xs = IDPA_SVG_OUTLINE.map((p) => p[0]);
  const ys = IDPA_SVG_OUTLINE.map((p) => p[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  return { w: maxX - minX, cx: (minX + maxX) / 2, cy: (minY + maxY) / 2 };
})();

/** SVG pixels (y down) → the width-normalised local frame (y up). ONE scale for
 *  both axes (÷ the outline's width) keeps the frame isotropic; the y flip turns
 *  SVG's y-down into the game's y-up. */
function normaliseSvg(pts: readonly [number, number][]): Point[] {
  return pts.map(([x, y]) => ({ x: (x - REF.cx) / REF.w, y: -(y - REF.cy) / REF.w }));
}

const IDPA_OUTLINE = normaliseSvg(IDPA_SVG_OUTLINE);
const IDPA_ASPECT = aspectOf(IDPA_OUTLINE);

/** A viewBox circle → the same frame. The radius scales by the outline width like
 *  everything else, which is exactly why the frame has to be isotropic. */
function normaliseSvgCircle(cxPx: number, cyPx: number, rPx: number) {
  return {
    kind: 'circle' as const,
    cx: (cxPx - REF.cx) / REF.w,
    cy: -(cyPx - REF.cy) / REF.w,
    r: rPx / REF.w,
  };
}

function idpaType(): TargetType {
  return {
    id: 'idpa-fixture',
    name: 'IDPA silhouette (fixture)',
    shape: { kind: 'polygon', points: IDPA_OUTLINE },
    aspect: IDPA_ASPECT,
    // Best-first: the two −0 centres, then −1, then the outline as −3.
    zones: [
      { id: 'head-0', label: 'Head −0', shape: normaliseSvgCircle(211.55, 90.55, 41.2) },
      { id: 'body-0', label: 'Body −0', shape: normaliseSvgCircle(211.53, 300.95, 84.05) },
      {
        id: 'minus-1',
        label: '−1',
        shape: {
          kind: 'polygon',
          points: normaliseSvg([
            [148, 148], [275, 147.75], [338.25, 218], [338.25, 431.75],
            [274.5, 537.75], [148.25, 537.75], [84.75, 432], [84.75, 217.75],
          ]),
        },
      },
      { id: 'minus-3', label: '−3', shape: { kind: 'polygon', points: IDPA_OUTLINE } },
    ],
    defaultZoneId: 'minus-3',
    massModel: 'rect',
    paint: {
      palette: { face: 0xb4946e, line: 0x1a1a1a },
      layers: [
        { kind: 'fill', color: '$face' },
        { kind: 'zones', style: { 'minus-1': { stroke: '$line' }, 'head-0': { stroke: '$line' } } },
      ],
    },
    defaultWidthM: 0.4572, // 18"
    compatibleMounts: ['bolt-stake', 'chain-beam'],
    defaultMount: 'bolt-stake',
  };
}

describe('validateTargetType accepts real targets', () => {
  it('accepts a plain disc', () => {
    expect(() => validateTargetType(discType())).not.toThrow();
  });

  it('accepts the real IDPA silhouette, zones and all', () => {
    expect(() => validateTargetType(idpaType())).not.toThrow();
  });

  it("the IDPA fixture's aspect matches the drawing's stated 30.75in height", () => {
    // 30.75" tall. The outline's width is 393.25 px against 663.75 px of height,
    // so aspect ≈ 1.688 and the implied width is 30.75 / 1.688 ≈ 18.2" — the real
    // cardboard is 18" wide, so the trace is faithful to ~1%.
    expect(IDPA_ASPECT).toBeCloseTo(1.6879, 3);
    const impliedWidthIn = 30.75 / IDPA_ASPECT;
    expect(impliedWidthIn).toBeGreaterThan(17.8);
    expect(impliedWidthIn).toBeLessThan(18.6);
  });

  it('keeps the IDPA head zone circular in the local frame', () => {
    // The whole reason the frame is isotropic. Under the plan's original
    // normalised-bounding-box frame this circle would have been squashed by
    // 1/aspect ≈ 0.59 in y — an ellipse masquerading as a scoring circle.
    const head = idpaType().zones[0].shape;
    expect(head.kind).toBe('circle');
    const pts = zoneSamplePoints(head, 32).slice(1);
    const radii = pts.map((p) => Math.hypot(p.x - (head as { cx: number }).cx, p.y - (head as { cy: number }).cy));
    expect(Math.max(...radii) - Math.min(...radii)).toBeLessThan(1e-12);
  });
});

describe('validateTargetType rejects authoring mistakes', () => {
  it('rejects a non-positive aspect or default width', () => {
    expect(() => validateTargetType(discType({ aspect: 0 }))).toThrow(/aspect must be > 0/);
    expect(() => validateTargetType(discType({ defaultWidthM: -1 }))).toThrow(/defaultWidthM must be > 0/);
  });

  it('rejects a disc whose aspect is not 1', () => {
    expect(() => validateTargetType(discType({ aspect: 1.5 }))).toThrow(/disc must have aspect 1/);
  });

  it('rejects an outline that is not width-normalised', () => {
    // The exact mistake this catches: an outline left in SVG viewBox pixels.
    const raw = IDPA_SVG_OUTLINE.map(([x, y]) => ({ x, y }));
    expect(() =>
      validateTargetType(discType({ shape: { kind: 'polygon', points: raw }, aspect: 1.6879 })),
    ).toThrow(/not width-normalised/);
  });

  it('rejects an aspect that disagrees with the outline', () => {
    expect(() =>
      validateTargetType(
        discType({ shape: { kind: 'polygon', points: IDPA_OUTLINE }, aspect: 1.0 }),
      ),
    ).toThrow(/disagrees with the outline/);
  });

  it('rejects an outline not centred in y', () => {
    const shifted = IDPA_OUTLINE.map((p) => ({ x: p.x, y: p.y + 0.3 }));
    expect(() =>
      validateTargetType(
        discType({ shape: { kind: 'polygon', points: shifted }, aspect: IDPA_ASPECT }),
      ),
    ).toThrow(/not centred in y/);
  });

  it('rejects a zone that extends outside the outline', () => {
    // Unhittable by construction — the outline test rejects the impact first.
    expect(() =>
      validateTargetType(
        discType({
          zones: [
            { id: 'too-big', label: 'Too big', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.6 } },
            { id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } },
          ],
        }),
      ),
    ).toThrow(/extends outside the outline/);
  });

  it('rejects duplicate zone ids and a dangling defaultZoneId', () => {
    expect(() =>
      validateTargetType(
        discType({
          zones: [
            { id: 'a', label: 'A', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.1 } },
            { id: 'a', label: 'A again', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.2 } },
          ],
          defaultZoneId: 'a',
        }),
      ),
    ).toThrow(/duplicate zone id 'a'/);
    expect(() => validateTargetType(discType({ defaultZoneId: 'nope' }))).toThrow(
      /defaultZoneId 'nope' is not one of its zones/,
    );
  });

  it('rejects degenerate zone geometry', () => {
    expect(() =>
      validateTargetType(discType({ zones: [{ id: 'z', label: 'Z', shape: { kind: 'circle', cx: 0, cy: 0, r: 0 } }], defaultZoneId: 'z' })),
    ).toThrow(/circle needs r > 0/);
  });

  it('accepts a hole zone nested inside an outer zone', () => {
    expect(() =>
      validateTargetType(
        discType({
          zones: [
            { id: 'window', label: 'Window', isHole: true, shape: { kind: 'circle', cx: 0, cy: 0, r: 0.1 } },
            { id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } },
          ],
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a defaultZoneId that names a hole zone', () => {
    expect(() =>
      validateTargetType(
        discType({
          zones: [{ id: 'plate', label: 'Plate', isHole: true, shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
          defaultZoneId: 'plate',
        }),
      ),
    ).toThrow(/defaultZoneId 'plate' cannot be a hole zone/);
  });

  it('rejects a defaultMount outside compatibleMounts, and an empty mount list', () => {
    expect(() => validateTargetType(discType({ defaultMount: 'hinge-stem' }))).toThrow(
      /defaultMount 'hinge-stem' is not in compatibleMounts/,
    );
    expect(() => validateTargetType(discType({ compatibleMounts: [] }))).toThrow(
      /at least one compatible mount/,
    );
  });

  it('rejects a face referencing an undefined palette slot', () => {
    // Silently renders as "no colour" otherwise — the reason placement palette
    // overrides are validated the same way in T3.
    expect(() =>
      validateTargetType(discType({ paint: { palette: { face: 1 }, layers: [{ kind: 'fill', color: '$missing' }] } })),
    ).toThrow(/palette slot '\$missing'/);
  });

  it('rejects a zones face layer styling a zone that does not exist', () => {
    expect(() =>
      validateTargetType(
        discType({
          paint: {
            palette: { line: 0 },
            layers: [{ kind: 'zones', style: { 'no-such-zone': { stroke: '$line' } } }],
          },
        }),
      ),
    ).toThrow(/styles unknown zone 'no-such-zone'/);
  });

  it('accepts a cut face layer naming an isHole zone', () => {
    expect(() =>
      validateTargetType(
        discType({
          zones: [
            { id: 'window', label: 'Window', isHole: true, shape: { kind: 'circle', cx: 0, cy: 0, r: 0.1 } },
            { id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } },
          ],
          paint: { palette: { face: 1 }, layers: [{ kind: 'fill', color: '$face' }, { kind: 'cut', zoneIds: ['window'] }] },
        }),
      ),
    ).not.toThrow();
  });

  it('rejects a cut face layer naming a zone that is not a hole', () => {
    // The face and the hit test must agree about what is open. A visibly cut
    // window that still SCORES would let a shot straight through it register as
    // a body hit — worse than either behaviour on its own.
    expect(() =>
      validateTargetType(
        discType({ paint: { palette: { face: 1 }, layers: [{ kind: 'cut', zoneIds: ['plate'] }] } }),
      ),
    ).toThrow(/names zone 'plate', which is not marked isHole/);
  });

  it('rejects a cut face layer naming an unknown zone, or naming none', () => {
    expect(() =>
      validateTargetType(
        discType({ paint: { palette: { face: 1 }, layers: [{ kind: 'cut', zoneIds: ['nope'] }] } }),
      ),
    ).toThrow(/names unknown zone 'nope'/);
    expect(() =>
      validateTargetType(
        discType({ paint: { palette: { face: 1 }, layers: [{ kind: 'cut', zoneIds: [] }] } }),
      ),
    ).toThrow(/'cut' layer names no zones/);
  });

  it('rejects an empty face', () => {
    expect(() => validateTargetType(discType({ paint: { palette: {}, layers: [] } }))).toThrow(
      /face has no layers/,
    );
  });
});

describe('registry', () => {
  it('throws on an unknown id, naming what it does know', () => {
    expect(() => getTargetType('no-such-target')).toThrow(/unknown target-type id 'no-such-target'/);
    expect(hasTargetType('no-such-target')).toBe(false);
  });

  it('holds exactly the types registered so far', () => {
    // Asserted so the roster cannot drift, and so the zones-inside-outline loop below
    // can never pass vacuously against an empty registry (which is what this assertion
    // guarded when T1 shipped it). Each new type deliberately updates this line:
    // `idpa-silhouette` T7, `popper` T8, `hanging-gong` T9a, `idpa-hostage-silhouette`
    // and `hostage-paddle` (hostage-target plan).
    expect(listTargetTypes().map((t) => t.id)).toEqual([
      'hanging-gong',
      'idpa-silhouette',
      'popper',
      'idpa-hostage-silhouette',
      'hostage-paddle',
    ]);
  });

  it('every registered type passes validation (grows with the registry)', () => {
    for (const t of listTargetTypes()) {
      expect(() => validateTargetType(t)).not.toThrow();
      expect(getTargetType(t.id)).toBe(t);
    }
  });
});
