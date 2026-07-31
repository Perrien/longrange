// Tests for zone-capable hit testing (task T2).
//
// The FIRST suite is the one that matters: it re-uses T0's characterization grid
// to prove `hitTargetZone` is decision-identical to `discHit` for every plate that
// exists today. Everything shipped is an untyped round plate, so if that holds,
// T2 cannot have changed any range's behaviour.
//
// The grid generator is restated here verbatim from
// `firing-solution.hit-grid.test.ts` rather than imported — importing a test file
// re-runs its suite. T0's header says both must move together if the grid changes.

import { describe, it, expect } from 'vitest';
import { discHit, type PlanePoint } from './firing-solution';
import { hitTargetZone, plateHeightM, zoneAt, LEGACY_ZONE_ID } from './target-hit';
import type { Point, TargetType } from '../range/targets/target-type';
import { resolveShot, type ShotPlate } from './shot';
import { RANGE_A_RACKS } from '../range/range-a-config';

const PLATE_DIAMETERS_M = [
  ...new Set(RANGE_A_RACKS.flatMap((r) => r.plates.map((p) => p.diameterM))),
].sort((a, b) => a - b);

const BULLET_DIAMETERS_M = [0.005588, 0.0067056, 0.0078232]; // .223, 6.5 mm, .308

/** Verbatim from `firing-solution.hit-grid.test.ts` (T0). */
function gridOffsets(radiusM: number): PlanePoint[] {
  const out: PlanePoint[] = [];
  for (let i = -6; i <= 6; i++) {
    for (let j = -6; j <= 6; j++) out.push({ x: i * 0.25 * radiusM, y: j * 0.25 * radiusM });
  }
  for (const rf of [0.9, 0.99, 1.0, 1.01, 1.1]) {
    for (let k = 0; k < 16; k++) {
      const a = (2 * Math.PI * k) / 16;
      out.push({ x: rf * radiusM * Math.cos(a), y: rf * radiusM * Math.sin(a) });
    }
  }
  return out;
}

describe('T2 equivalence: untyped plates decide exactly as discHit', () => {
  it('agrees with discHit on every grid point, plate and bullet', () => {
    const centre: PlanePoint = { x: 0.317, y: 1.104 };
    let compared = 0;
    let hits = 0;
    for (const d of PLATE_DIAMETERS_M) {
      for (const bd of BULLET_DIAMETERS_M) {
        const plate: ShotPlate = { instanceId: 3, position: centre, diameterM: d };
        for (const o of gridOffsets(d / 2)) {
          const impact = { x: centre.x + o.x, y: centre.y + o.y };
          const legacy = discHit(impact, centre, d, bd);
          const zoned = hitTargetZone(impact, plate, bd);
          expect(zoned !== null).toBe(legacy);
          if (zoned) {
            expect(zoned.instanceId).toBe(3);
            expect(zoned.zoneId).toBe(LEGACY_ZONE_ID);
            hits++;
          }
          compared++;
        }
      }
    }
    // Guard the guard: a comparison loop that ran zero iterations, or found no
    // hits at all, would pass every assertion above and prove nothing.
    expect(compared).toBe(PLATE_DIAMETERS_M.length * BULLET_DIAMETERS_M.length * 249);
    expect(hits).toBeGreaterThan(0);
    expect(hits).toBeLessThan(compared);
  });

  it('reports the impact in the plate-local frame', () => {
    const plate: ShotPlate = { instanceId: 1, position: { x: 2, y: 3 }, diameterM: 0.4 };
    // A quarter of the width right and an eighth up.
    const zone = hitTargetZone({ x: 2.1, y: 3.05 }, plate, 0.0067056);
    expect(zone).not.toBeNull();
    expect(zone!.localX).toBeCloseTo(0.25, 12);
    expect(zone!.localY).toBeCloseTo(0.125, 12);
  });
});

describe('T2: resolveShot threads the zone additively', () => {
  const base = {
    eye: { x: 0, y: 1.6, z: 0 },
    aimDir: { x: 0, y: 0, z: -1 },
    dial: { elevRad: 0, windRad: 0 },
    distanceM: 100,
    bulletDiameterM: 0.0067056,
  };
  const plate: ShotPlate = { instanceId: 9, position: { x: 0, y: 1.6 }, diameterM: 0.3048 };

  it('derives hitPlateId from hitZone, and both agree', () => {
    const res = resolveShot({
      ...base,
      solve: { dropM: 0, windageM: 0 },
      scatter: { x: 0, y: 0 },
      plates: [plate],
    });
    expect(res.hitPlateId).toBe(9);
    expect(res.hitZone).not.toBeNull();
    expect(res.hitZone!.instanceId).toBe(res.hitPlateId);
    expect(res.hitZone!.zoneId).toBe(LEGACY_ZONE_ID);
  });

  it('reports a null zone on a miss, in step with hitPlateId', () => {
    const res = resolveShot({
      ...base,
      solve: { dropM: -5, windageM: 0 }, // wildly under-dialed
      scatter: { x: 0, y: 0 },
      plates: [plate],
    });
    expect(res.hitPlateId).toBeNull();
    expect(res.hitZone).toBeNull();
  });
});

describe('T2: plateHeightM', () => {
  it('is the width for an untyped round plate', () => {
    expect(plateHeightM({ diameterM: 0.3048 })).toBeCloseTo(0.3048, 12);
  });

  it('prefers an explicit height when given', () => {
    expect(plateHeightM({ diameterM: 0.4572, heightM: 0.7716 })).toBeCloseTo(0.7716, 12);
  });
});

// --- the typed path, against the real IDPA geometry ---------------------------
// `zoneAt` takes the type in hand precisely so this can be tested now: the
// registry is still empty until T7/T8/T9a, and a capability nobody exercises for
// three more tasks is a capability nobody has checked.

const SVG = { w: 393.25, cx: 211.625, cy: 346.875 }; // outline bbox, idpa-target.svg
const px = (x: number, y: number): Point => ({ x: (x - SVG.cx) / SVG.w, y: -(y - SVG.cy) / SVG.w });
const circle = (cx: number, cy: number, r: number) => {
  const c = px(cx, cy);
  return { kind: 'circle' as const, cx: c.x, cy: c.y, r: r / SVG.w };
};

const IDPA_OUTLINE = [
  px(145, 15), px(278.25, 15), px(278.25, 143), px(360.75, 143.5), px(408.25, 215.25),
  px(408.25, 566.25), px(348, 678.75), px(74, 678.75), px(15, 566.25), px(15, 214.75),
  px(62.5, 143.5), px(144.75, 143.25),
];

const IDPA: TargetType = {
  id: 'idpa-t2-fixture',
  name: 'IDPA (T2 fixture)',
  shape: { kind: 'polygon', points: IDPA_OUTLINE },
  aspect: 663.75 / 393.25,
  zones: [
    { id: 'head-0', label: 'Head −0', shape: circle(211.55, 90.55, 41.2) },
    { id: 'body-0', label: 'Body −0', shape: circle(211.53, 300.95, 84.05) },
    {
      id: 'minus-1',
      label: '−1',
      shape: {
        kind: 'polygon',
        points: [
          px(148, 148), px(275, 147.75), px(338.25, 218), px(338.25, 431.75),
          px(274.5, 537.75), px(148.25, 537.75), px(84.75, 432), px(84.75, 217.75),
        ],
      },
    },
    { id: 'minus-3', label: '−3', shape: { kind: 'polygon', points: IDPA_OUTLINE } },
  ],
  defaultZoneId: 'minus-3',
  massModel: 'rect',
  paint: { palette: { face: 0xb4946e }, layers: [{ kind: 'fill', color: '$face' }] },
  defaultWidthM: 0.4572,
  compatibleMounts: ['bolt-stake'],
  defaultMount: 'bolt-stake',
};

/** A 6.5 mm bullet against an 18"-wide silhouette, in the local frame. */
const BR = 0.0067056 / 2 / 0.4572;

describe('T2: zone resolution on a real silhouette', () => {
  it('awards each zone at its own centre', () => {
    expect(zoneAt(px(211.55, 90.55), IDPA, BR)).toBe('head-0');
    expect(zoneAt(px(211.53, 300.95), IDPA, BR)).toBe('body-0');
  });

  it('falls back to the default zone inside the outline but outside every zone', () => {
    // Low on the legs: inside the silhouette, below the −1 polygon's bottom edge
    // (y = 537.75) and nowhere near either circle.
    expect(zoneAt(px(211, 640), IDPA, BR)).toBe('minus-3');
    // Upper chest, inside −1 but outside the body circle.
    expect(zoneAt(px(211, 190), IDPA, BR)).toBe('minus-1');
  });

  it('misses entirely outside the silhouette', () => {
    expect(zoneAt(px(211, 400 - 0), IDPA, BR)).not.toBeNull(); // sanity: on the target
    expect(zoneAt(px(5, 400), IDPA, BR)).toBeNull(); // left of the body
    expect(zoneAt(px(211, 700), IDPA, BR)).toBeNull(); // below the feet
    expect(zoneAt(px(60, 60), IDPA, BR)).toBeNull(); // beside the head, in the notch
  });

  it('honours best-first order: the head circle wins over the outline it sits in', () => {
    // Both `head-0` and `minus-3` contain this point; authored order decides.
    expect(zoneAt(px(211.55, 90.55), IDPA, BR)).toBe('head-0');
    const reordered: TargetType = { ...IDPA, zones: [IDPA.zones[3], ...IDPA.zones.slice(0, 3)] };
    // With the outline first it is skipped as the default, so the head still wins
    // — the default zone is never matched early even if authored early.
    expect(zoneAt(px(211.55, 90.55), reordered, BR)).toBe('head-0');
  });

  it('awards the better zone to a shot that BREAKS a scoring line', () => {
    // The line-break convention, generalised from discHit. Just outside the head
    // circle by less than a bullet radius: still `head-0`.
    const rLocal = 41.2 / SVG.w;
    const c = px(211.55, 90.55);
    const justOutside = { x: c.x + rLocal + BR * 0.5, y: c.y };
    expect(zoneAt(justOutside, IDPA, BR)).toBe('head-0');
    // Clear of the line by more than a bullet radius: the enclosing zone.
    const clear = { x: c.x + rLocal + BR * 3, y: c.y };
    expect(zoneAt(clear, IDPA, BR)).not.toBe('head-0');
  });

  it('lets the bullet radius break the OUTLINE too, matching discHit', () => {
    // A shot a hair off the left edge at mid-body still catches steel.
    const edge = px(15, 400);
    expect(zoneAt({ x: edge.x - BR * 0.5, y: edge.y }, IDPA, BR)).not.toBeNull();
    expect(zoneAt({ x: edge.x - BR * 3, y: edge.y }, IDPA, BR)).toBeNull();
  });

  it('scales with the plate: the same zone at any width', () => {
    // Zones are authored in the normalised frame, so a 9" mini-silhouette scores
    // identically to an 18" one — the property that makes the frame worth having.
    for (const widthM of [0.2286, 0.4572, 0.9144]) {
      const br = 0.0067056 / 2 / widthM;
      expect(zoneAt(px(211.55, 90.55), IDPA, br)).toBe('head-0');
      expect(zoneAt(px(211, 640), IDPA, br)).toBe('minus-3');
    }
  });
});
