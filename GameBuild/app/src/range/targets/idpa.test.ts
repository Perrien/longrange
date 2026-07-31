// Tests for the IDPA silhouette target type (task T7).
//
// The load-bearing test is the SYNC one: the constants embedded in `idpa.ts` must be
// string-equal to the attributes in `spec/idpa-target.svg` (a tracked copy of the
// owner's authored art — the original lives in the git-ignored `Documentation/Targets/`
// workspace, see that file's header), and the `public/` copy the rasteriser fetches must
// be byte-identical to that same file. Two copies that can diverge silently is the
// failure mode this design exists to avoid.
//
// CI FIX (2026-07-31): this test used to read straight from `Documentation/Targets/`,
// which is git-ignored (local-only source workspace, .gitignore) — it never existed on
// GitHub Actions' checkout, so CI failed with ENOENT on every run. `spec/idpa-target.svg`
// is a tracked, byte-identical copy so CI has something to check the embedded constants
// and the `public/` copy against; keep it in sync with `Documentation/Targets/idpa-target.svg`
// by hand if that source ever changes.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  IDPA_ASPECT,
  IDPA_BODY_CIRCLE,
  IDPA_COLORS,
  IDPA_HEAD_CIRCLE,
  IDPA_HEIGHT_IN,
  IDPA_MINUS1_D,
  IDPA_OUTLINE,
  IDPA_OUTLINE_D,
  IDPA_SILHOUETTE,
} from './idpa';
import { getTargetType, listTargetTypes } from './registry';
import { validateTargetType } from './target-type';
import { bounds } from './target-geometry';
import { zoneAt } from '../../game/target-hit';
import { planFace } from './face-plan';
import { toLocal } from './svg-outline';

const SPEC_PATH = new URL('./spec/idpa-target.svg', import.meta.url);
const PUBLIC_PATH = new URL('../../../public/targets/idpa-target.svg', import.meta.url);

const specSvg = readFileSync(SPEC_PATH, 'utf8');

/** All `d="…"` values in the spec, in document order. */
const specPaths = [...specSvg.matchAll(/\sd="([^"]+)"/g)].map((m) =>
  m[1].replace(/\s+/g, ' ').trim(),
);

describe('spec sync — the embedded constants ARE the spec', () => {
  it('has the two paths the type expects', () => {
    expect(specPaths).toHaveLength(2);
  });

  it('the outline path is string-equal to the spec', () => {
    expect(IDPA_OUTLINE_D).toBe(specPaths[0]);
  });

  it('the −1 zone path is string-equal to the spec', () => {
    expect(IDPA_MINUS1_D).toBe(specPaths[1]);
  });

  it('the two circles match the spec attributes exactly', () => {
    const circles = [...specSvg.matchAll(/<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"/g)].map(
      (m) => ({ cx: Number(m[1]), cy: Number(m[2]), r: Number(m[3]) }),
    );
    expect(circles).toHaveLength(2);
    expect(circles[0]).toEqual({ ...IDPA_HEAD_CIRCLE });
    expect(circles[1]).toEqual({ ...IDPA_BODY_CIRCLE });
  });

  it('the colours match the spec fills', () => {
    const hexes = [...specSvg.matchAll(/(?:fill|stroke)="#([0-9A-Fa-f]{6})"/g)].map((m) =>
      parseInt(m[1], 16),
    );
    expect(hexes).toContain(IDPA_COLORS.face);
    expect(hexes).toContain(IDPA_COLORS.inner);
    expect(hexes).toContain(IDPA_COLORS.centre);
    expect(hexes).toContain(IDPA_COLORS.line);
  });

  it("the public/ copy the rasteriser fetches is byte-identical to the spec", () => {
    // Not "equivalent" — identical. A drifted copy would render art that disagrees
    // with the zones scoring behind it, and nothing else would notice.
    expect(readFileSync(PUBLIC_PATH)).toEqual(readFileSync(SPEC_PATH));
  });
});

describe('derived geometry', () => {
  it('is a valid target type', () => {
    expect(() => validateTargetType(IDPA_SILHOUETTE)).not.toThrow();
  });

  it('normalises the outline to the full width, centred', () => {
    const b = bounds(IDPA_OUTLINE);
    expect(b.minX).toBeCloseTo(-0.5, 9);
    expect(b.maxX).toBeCloseTo(0.5, 9);
    expect(b.minY + b.maxY).toBeCloseTo(0, 9);
  });

  it("recovers a real 18in cardboard width from the drawing's stated 30.75in height", () => {
    expect(IDPA_ASPECT).toBeCloseTo(1.6879, 3);
    const impliedWidthIn = IDPA_HEIGHT_IN / IDPA_ASPECT;
    expect(impliedWidthIn).toBeGreaterThan(17.8);
    expect(impliedWidthIn).toBeLessThan(18.6);
    // …and the type's default width is that 18", in metres.
    expect(IDPA_SILHOUETTE.defaultWidthM).toBeCloseTo(0.4572, 6);
  });

  it('keeps the head zone circular — the reason the local frame is isotropic', () => {
    const head = IDPA_SILHOUETTE.zones[0].shape;
    expect(head.kind).toBe('circle');
    // Under an anisotropic frame this would have been squashed by 1/aspect ≈ 0.59.
    expect((head as { r: number }).r).toBeCloseTo(IDPA_HEAD_CIRCLE.r / 393.25, 6);
  });
});

describe('zone resolution against the real geometry', () => {
  /** A spec pixel coordinate → the type's local frame. */
  const at = (xPx: number, yPx: number) =>
    toLocal({ x: xPx, y: yPx }, { widthPx: 393.25, cxPx: 211.625, cyPx: 346.875 });
  /** 6.5 mm bullet against an 18" target, in local units. */
  const BR = 0.0067056 / 2 / 0.4572;
  const zone = (xPx: number, yPx: number) => zoneAt(at(xPx, yPx), IDPA_SILHOUETTE, BR);

  it('awards each of the four zones somewhere', () => {
    expect(zone(IDPA_HEAD_CIRCLE.cx, IDPA_HEAD_CIRCLE.cy)).toBe('head-0');
    expect(zone(IDPA_BODY_CIRCLE.cx, IDPA_BODY_CIRCLE.cy)).toBe('body-0');
    expect(zone(211, 190)).toBe('minus-1'); // upper chest, outside the body circle
    expect(zone(211, 640)).toBe('minus-3'); // low on the legs, outside every ring
  });

  it('returns −3 for a hit inside the outline but outside every scoring zone', () => {
    // The `defaultZoneId` fallback. Without it these would read as misses.
    for (const [x, y] of [[211, 640], [40, 560], [380, 560]] as const) {
      expect(zone(x, y)).toBe('minus-3');
    }
  });

  it('misses outside the silhouette', () => {
    expect(zone(5, 400)).toBeNull(); // left of the body
    expect(zone(211, 690)).toBeNull(); // below the feet
    expect(zone(60, 60)).toBeNull(); // beside the head, in the shoulder notch
  });

  it('is scale-invariant — a mini silhouette scores like a full-size one', () => {
    for (const widthM of [0.2286, 0.4572, 0.9144]) {
      const br = 0.0067056 / 2 / widthM;
      expect(zoneAt(at(IDPA_HEAD_CIRCLE.cx, IDPA_HEAD_CIRCLE.cy), IDPA_SILHOUETTE, br)).toBe('head-0');
      expect(zoneAt(at(211, 640), IDPA_SILHOUETTE, br)).toBe('minus-3');
    }
  });
});

describe('face stack', () => {
  it('layers fill → zones → image, so the drawn zones are a fallback BENEATH the art', () => {
    // Order matters: above the art the strokes would double every line the SVG
    // already draws; beneath it they are invisible when the asset loads and legible
    // when it does not — one code path, no fallback branch.
    expect(IDPA_SILHOUETTE.paint.layers.map((l) => l.kind)).toEqual(['fill', 'zones', 'image']);
  });

  it('paints the nested zones worst-first, so the −0 centres are not buried', () => {
    const shapes = planFace(IDPA_SILHOUETTE)
      .ops.filter((o) => o.kind === 'polygon' || o.kind === 'ellipse')
      .filter((o) => o.side === 'downrange');
    // −1 (a polygon) must be drawn before the two −0 circles (ellipses).
    expect(shapes.map((o) => o.kind)).toEqual(['polygon', 'ellipse', 'ellipse']);
  });

  it('a placement palette override changes the resolved fill', () => {
    // Owner decision 9, on the real target.
    expect(planFace(IDPA_SILHOUETTE).paintHex).toBe(IDPA_COLORS.face);
    expect(planFace(IDPA_SILHOUETTE, { palette: { face: 0xffffff } }).paintHex).toBe(0xffffff);
  });

  it('references the art id the rasteriser knows', () => {
    const image = IDPA_SILHOUETTE.paint.layers.find((l) => l.kind === 'image');
    expect(image).toBeDefined();
    expect((image as { artId: string }).artId).toBe('idpa');
  });
});

describe('registry + mounts', () => {
  it('is registered and resolvable', () => {
    expect(getTargetType('idpa-silhouette')).toBe(IDPA_SILHOUETTE);
    expect(listTargetTypes()).toContain(IDPA_SILHOUETTE);
  });

  it('defaults to a stake mount but permits hanging', () => {
    // Owner: stake-mounted. `chain-beam` stays compatible so hanging one later is a
    // placement edit and no new code.
    expect(IDPA_SILHOUETTE.defaultMount).toBe('bolt-stake');
    expect(IDPA_SILHOUETTE.compatibleMounts).toContain('chain-beam');
  });

  it('uses the rectangular mass model', () => {
    expect(IDPA_SILHOUETTE.massModel).toBe('rect');
  });
});
