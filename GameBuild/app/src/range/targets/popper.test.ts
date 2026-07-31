// Tests for the popper target type (task T8).
//
// Two things matter here beyond the usual sync check. The popper is the target that
// PROVES arc flattening is necessary — its authored line endpoints span only 8″ while
// the real silhouette is 12″ — and it is the target whose waist pinch proves the
// triangulator has to handle a non-convex ring.

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  POPPER,
  POPPER_ASPECT,
  POPPER_DIMS,
  POPPER_FRAME,
  POPPER_LINE_HEX,
  POPPER_OUTLINE,
  POPPER_OUTLINE_D,
  POPPER_REFERENCE_CIRCLE,
} from './popper';
import { getTargetType, listTargetTypes } from './registry';
import { validateTargetType } from './target-type';
import { bounds } from './target-geometry';
import { signedArea } from './svg-outline';
import { planFace } from './face-plan';
import { triangulateOutline, triangulatedArea, createPlateOutlineGeometry } from '../plate-outline-geometry';
import { resolvePlacement } from './placements';
import { zoneAt } from '../../game/target-hit';
import { toLocal } from './svg-outline';
import { artUrl } from './face-raster';

const SPEC_PATH = new URL('../../../../../Documentation/Targets/idpa-popper.svg', import.meta.url);
const specSvg = readFileSync(SPEC_PATH, 'utf8');

/** Px per inch in this drawing: the outline spans y 10..430 over a stated 42 in. */
const PX_PER_IN = 420 / POPPER_DIMS.heightIn;

describe('spec sync — the embedded path IS the spec', () => {
  it('is string-equal to the spec, whitespace-normalised', () => {
    const specPath = [...specSvg.matchAll(/\sd="([^"]+)"/g)].map((m) =>
      m[1].replace(/\s+/g, ' ').trim(),
    );
    expect(specPath).toHaveLength(1);
    expect(POPPER_OUTLINE_D).toBe(specPath[0]);
  });

  it('matches the spec reference circle exactly', () => {
    const m = specSvg.match(/<circle\s+cx="([\d.]+)"\s+cy="([\d.]+)"\s+r="([\d.]+)"/);
    expect(m).not.toBeNull();
    expect({ cx: Number(m![1]), cy: Number(m![2]), r: Number(m![3]) }).toEqual({
      ...POPPER_REFERENCE_CIRCLE,
    });
  });

  it('takes its line colour from the spec stroke', () => {
    const strokes = [...specSvg.matchAll(/stroke="#([0-9A-Fa-f]{6})"/g)].map((x) =>
      parseInt(x[1], 16),
    );
    expect(strokes).toContain(POPPER_LINE_HEX);
  });

  it('ships NO runtime asset, because it needs none', () => {
    // The spec is `fill="none"` line art: an outline (invisible against the plate edge)
    // plus the R6″ reference circle, which the `shapes` layer already draws. Copying it
    // into `public/` would precache ~800 bytes nothing ever fetches, so the popper is
    // the target that proves the drawn-shapes path stands on its own. The spec still
    // drives the GEOMETRY — it is just consumed at build time, not at runtime.
    expect(() => artUrl('popper')).toThrow(/unknown artId 'popper'/);
    expect(POPPER.paint.layers.some((l) => l.kind === 'image')).toBe(false);
  });
});

describe('dimensions recovered from the flattened outline', () => {
  it('is a valid target type', () => {
    expect(() => validateTargetType(POPPER)).not.toThrow();
  });

  it('is 42in tall and 12in wide — aspect 3.5', () => {
    expect(POPPER_ASPECT).toBeCloseTo(POPPER_DIMS.heightIn / POPPER_DIMS.widthIn, 3);
    expect(POPPER_ASPECT).toBeCloseTo(3.5, 3);
    expect(POPPER_FRAME.widthPx / PX_PER_IN).toBeCloseTo(POPPER_DIMS.widthIn, 1);
  });

  it("PROVES arc flattening matters: the authored endpoints are only 8in wide", () => {
    // The waist pinch (x = 30..110 = 8″) is all a straight-line parser would see; the
    // R6″ body arcs bulge to x = 10..130 = 12″. A parser treating `A` as a line would
    // make the popper a THIRD too narrow and nothing else would notice.
    const authoredXs = [70, 100, 100, 110, 100, 40, 30, 40, 40, 70];
    const authoredWidthIn = (Math.max(...authoredXs) - Math.min(...authoredXs)) / PX_PER_IN;
    expect(authoredWidthIn).toBeCloseTo(POPPER_DIMS.waistIn, 1);
    expect(POPPER_FRAME.widthPx / PX_PER_IN).toBeCloseTo(POPPER_DIMS.widthIn, 1);
    expect(POPPER_FRAME.widthPx / PX_PER_IN).toBeGreaterThan(authoredWidthIn * 1.4);
  });

  it('has the 6in base the drawing specifies', () => {
    // The two bottom vertices, x = 40 and 100.
    const baseIn = (100 - 40) / PX_PER_IN;
    expect(baseIn).toBeCloseTo(POPPER_DIMS.baseIn, 1);
  });

  it('normalises to the full width, centred in y', () => {
    const b = bounds(POPPER_OUTLINE);
    expect(b.minX).toBeCloseTo(-0.5, 9);
    expect(b.maxX).toBeCloseTo(0.5, 9);
    expect(b.minY + b.maxY).toBeCloseTo(0, 9);
  });

  it('flattened the arcs into a many-point ring, wound CCW', () => {
    expect(POPPER_OUTLINE.length).toBeGreaterThan(20); // 10 authored, arcs subdivided
    expect(signedArea(POPPER_OUTLINE)).toBeGreaterThan(0);
  });
});

describe('non-convex geometry', () => {
  it('has reflex vertices at the waist', () => {
    // The pinch is what makes a centroid fan invalid.
    let reflex = 0;
    for (let i = 0; i < POPPER_OUTLINE.length; i++) {
      const a = POPPER_OUTLINE[(i + POPPER_OUTLINE.length - 1) % POPPER_OUTLINE.length];
      const b = POPPER_OUTLINE[i];
      const c = POPPER_OUTLINE[(i + 1) % POPPER_OUTLINE.length];
      if ((b.x - a.x) * (c.y - b.y) - (b.y - a.y) * (c.x - b.x) < -1e-12) reflex++;
    }
    expect(reflex).toBeGreaterThan(0);
  });

  it('triangulates with no gaps and no self-overlap', () => {
    // T4's area identity, applied to this outline: an overlap makes the sum exceed the
    // ring area, a dropped triangle makes it fall short.
    const faces = triangulateOutline(POPPER_OUTLINE);
    expect(triangulatedArea(POPPER_OUTLINE, faces)).toBeCloseTo(
      Math.abs(signedArea(POPPER_OUTLINE)),
      9,
    );
  });

  it('builds plate geometry spanning the full width and aspect-scaled height', () => {
    const geo = createPlateOutlineGeometry(POPPER_OUTLINE, POPPER_ASPECT);
    const pos = geo.getAttribute('position');
    const pts: { x: number; y: number }[] = [];
    for (let i = 0; i < pos.count; i++) pts.push({ x: pos.getX(i), y: pos.getY(i) });
    const b = bounds(pts);
    expect(b.maxX - b.minX).toBeCloseTo(1, 6);
    expect(b.maxY - b.minY).toBeCloseTo(POPPER_ASPECT, 6);
  });
});

describe('zone + hit behaviour', () => {
  const at = (xPx: number, yPx: number) => toLocal({ x: xPx, y: yPx }, POPPER_FRAME);
  const BR = 0.0078232 / 2 / 0.3048; // .308 against a 12" popper

  it('has ONE zone: the silhouette', () => {
    // A popper scores by falling, not by where it was hit; subdividing it would invent
    // a scoring scheme the hardware does not have.
    expect(POPPER.zones).toHaveLength(1);
    expect(POPPER.defaultZoneId).toBe('plate');
  });

  it('registers a hit anywhere on the body and misses off it', () => {
    expect(zoneAt(at(70, 156.25), POPPER, BR)).toBe('plate'); // body centre
    expect(zoneAt(at(70, 30), POPPER, BR)).toBe('plate'); // head
    expect(zoneAt(at(70, 420), POPPER, BR)).toBe('plate'); // base
    expect(zoneAt(at(5, 156.25), POPPER, BR)).toBeNull(); // left of the body
    expect(zoneAt(at(70, 438), POPPER, BR)).toBeNull(); // below the base
  });

  it('misses in the waist notch — the pinch is real, not decorative', () => {
    // At the waist the silhouette narrows to 8", so a shot 5.5" off centre that would
    // hit the 12" body ring passes by. This is the non-convexity mattering to scoring.
    const waistY = 300; // below the body circle, in the tapered section
    expect(zoneAt(at(70, waistY), POPPER, BR)).toBe('plate');
    expect(zoneAt(at(15, waistY), POPPER, BR)).toBeNull();
  });
});

describe('face stack', () => {
  it('draws the spec R6in reference circle as ART, not a zone', () => {
    // Owner decision 9's "or you drawing circle hit areas": a drawn overlay, no asset,
    // no fetch, no scoring change.
    expect(POPPER.paint.layers.map((l) => l.kind)).toEqual(['fill', 'shapes']);
    const ops = planFace(POPPER).ops.filter((o) => o.kind === 'ellipse');
    expect(ops).toHaveLength(2); // one per face
    for (const op of ops) {
      expect(op.stroke).toBe(POPPER_LINE_HEX);
      expect(op.fill).toBeUndefined(); // an aim reference, not a filled zone
      // Squashed by the aspect, as every circle on a tall target must be.
      expect(op.ry).toBeCloseTo(op.rx / POPPER_ASPECT, 6);
    }
  });

  it('has no image layer — it needs no asset to be legible', () => {
    expect(POPPER.paint.layers.some((l) => l.kind === 'image')).toBe(false);
  });

  it('takes a palette override on its face colour', () => {
    expect(planFace(POPPER, { palette: { face: 0xe0731d } }).paintHex).toBe(0xe0731d);
  });
});

describe('registry + mount compatibility', () => {
  it('is registered', () => {
    expect(getTargetType('popper')).toBe(POPPER);
    expect(listTargetTypes()).toContain(POPPER);
  });

  it('accepts ONLY a hinge-stem mount', () => {
    expect(POPPER.compatibleMounts).toEqual(['hinge-stem']);
    expect(POPPER.defaultMount).toBe('hinge-stem');
  });

  it('uses the RECTANGULAR mass model', () => {
    // A pinched 42″ silhouette is not an ellipse. This is also what the reaction
    // controller forwards as the engine's `isOval: false`, so getting it wrong gives
    // the C++ target the wrong inertia tensor and the popper falls at the wrong rate.
    expect(POPPER.massModel).toBe('rect');
  });

  it('the placement loader REJECTS hanging or bolting one', () => {
    // Enforced at the data boundary rather than trusted: a popper is welded to its
    // stem, so a placement describing a chain-hung one is describing a target that
    // does not exist.
    const base = { id: 'p', typeId: 'popper', distanceM: 50, xOffsetM: 0, beamHeightM: 1.2 };
    expect(() => resolvePlacement('test-range', base)).not.toThrow();
    for (const mountId of ['chain-beam', 'bolt-stake']) {
      expect(() => resolvePlacement('test-range', { ...base, mountId })).toThrow(
        /is not compatible with target 'popper' \(allowed: hinge-stem\)/,
      );
    }
  });
});
