// Tests for the hostage-paddle target type.
//
// Deliberately thin: the paddle is the system's simplest shape (a disc, one
// zone, flat fill — no art, no SVG spec), and its only real behaviour lives on
// the MOUNT (`mount-registry.ts`'s `hostage-clamp-2way`/`-3way`), tested there.

import { describe, it, expect } from 'vitest';
import { HOSTAGE_PADDLE, HOSTAGE_PADDLE_FACE_HEX } from './hostage-paddle';
import { getTargetType, listTargetTypes } from './registry';
import { validateTargetType } from './target-type';
import { hitTargetZone, zoneAt } from '../../game/target-hit';
import { IDPA_HOSTAGE_SILHOUETTE, IDPA_HOSTAGE_WINDOW_CIRCLE } from './idpa-hostage';
import {
  IDPA_BODY_CIRCLE,
  IDPA_FRAME,
  IDPA_HEAD_CIRCLE,
  IDPA_SHOULDER_LOCAL_Y,
} from './idpa';
import { toLocal } from './svg-outline';
import { getMountType } from './mount-registry';
import { getTargetPlacements } from './placements';

describe('hostage paddle', () => {
  it('is a valid target type', () => {
    expect(() => validateTargetType(HOSTAGE_PADDLE)).not.toThrow();
  });

  it('is a disc with one zone', () => {
    expect(HOSTAGE_PADDLE.shape).toEqual({ kind: 'disc' });
    expect(HOSTAGE_PADDLE.aspect).toBe(1);
    expect(HOSTAGE_PADDLE.zones).toHaveLength(1);
    expect(HOSTAGE_PADDLE.defaultZoneId).toBe('paddle');
  });

  it('registers a hit anywhere on the disc and misses off it', () => {
    const BR = 0.0067056 / 2 / HOSTAGE_PADDLE.defaultWidthM;
    expect(zoneAt({ x: 0, y: 0 }, HOSTAGE_PADDLE, BR)).toBe('paddle');
    expect(zoneAt({ x: 0.49, y: 0 }, HOSTAGE_PADDLE, BR)).toBe('paddle');
    expect(zoneAt({ x: 0.6, y: 0 }, HOSTAGE_PADDLE, BR)).toBeNull();
  });

  it('is flat-fill orange, no art needed', () => {
    expect(HOSTAGE_PADDLE.paint.layers).toEqual([{ kind: 'fill', color: '$face' }]);
    expect(HOSTAGE_PADDLE.paint.palette.face).toBe(HOSTAGE_PADDLE_FACE_HEX);
  });

  it('is registered, and accepts only the two hostage-clamp mounts', () => {
    expect(getTargetType('hostage-paddle')).toBe(HOSTAGE_PADDLE);
    expect(listTargetTypes()).toContain(HOSTAGE_PADDLE);
    expect(HOSTAGE_PADDLE.compatibleMounts).toEqual(['hostage-clamp-2way', 'hostage-clamp-3way']);
  });
});

// --- reachability at every clamp stop (owner defect, 2026-08-06) --------------
//
// "The first shot hits and it flips to a side correctly but then it is no longer
// able to be hit again." Not a flip-state bug — a GEOMETRY one. `game/shot.ts`
// walks the rack in order and takes the FIRST plate whose zones the impact
// breaks, with no depth or occlusion concept; the backing silhouette is authored
// ahead of the paddles. So while a swung paddle overlaps the silhouette's
// outline, every shot aimed at it resolves against the silhouette instead and
// the paddle is unreachable. Only the rest stop worked, because the window is an
// `isHole` zone that misses cleanly and falls through.
//
// These tests run that exact loop over the real shipped geometry, so the fix is
// pinned to what actually decides a hit rather than to the offsets in isolation.
describe('a paddle is reachable at EVERY stop of its mount', () => {
  const SILHOUETTE_X = 0; // the backing plate's centreline; offsets are from it
  const BULLET_D_M = 0.0067056; // .264

  /** The rack, in authored order: backing plate first, then the paddle. */
  function rack(paddleXM: number, paddleCentreY: number, silhouetteCentreY: number) {
    return [
      {
        instanceId: 0,
        position: { x: SILHOUETTE_X, y: silhouetteCentreY },
        diameterM: IDPA_HOSTAGE_SILHOUETTE.defaultWidthM,
        typeId: IDPA_HOSTAGE_SILHOUETTE.id,
      },
      {
        instanceId: 1,
        position: { x: SILHOUETTE_X + paddleXM, y: paddleCentreY },
        diameterM: HOSTAGE_PADDLE.defaultWidthM,
        typeId: HOSTAGE_PADDLE.id,
      },
    ];
  }

  /** `resolveShot`'s hit loop: first plate whose zones break, in rack order. */
  function firstHit(plates: ReturnType<typeof rack>, impact: { x: number; y: number }) {
    for (const plate of plates) {
      const zone = hitTargetZone(impact, plate, BULLET_D_M);
      if (zone) return zone;
    }
    return null;
  }

  /** Torso level: the paddle's rest stop is concentric with body-0/the window. */
  const bodyY = toLocal(
    { x: IDPA_BODY_CIRCLE.cx, y: IDPA_BODY_CIRCLE.cy },
    IDPA_FRAME,
  ).y * IDPA_HOSTAGE_SILHOUETTE.defaultWidthM;

  const centreStops = getMountType('hostage-clamp-3way').flip!.positions;

  it('lands on the paddle, not the backing plate, at every 3-way stop', () => {
    for (const stop of centreStops) {
      const plates = rack(stop.xOffsetM, bodyY, 0);
      const hit = firstHit(plates, { x: SILHOUETTE_X + stop.xOffsetM, y: bodyY });
      expect(hit, `stop '${stop.id}' (${stop.xOffsetM} m) is unreachable`).not.toBeNull();
      expect(hit!.instanceId, `stop '${stop.id}' resolved to the backing plate`).toBe(1);
      expect(hit!.zoneId).toBe('paddle');
    }
  });

  it('puts the whole paddle clear of the silhouette outline at both SWUNG stops', () => {
    // The property that makes the above true, stated directly: a swung stop must
    // clear half the backing plate's width plus the paddle's own radius.
    //
    // THE GUARD ON DIALING IT IN. The owner tunes this offset by eye (0.15 → 0.36
    // → 0.33 so far), and the floor is invisible from the screenshot, so it is
    // asserted here rather than trusted to the comment in `mount-registry.ts`. The
    // margin term is not decoration: bare containment leaves the paddle's inner
    // edge inside one bullet radius of the silhouette, where a shot breaks the
    // silhouette first and the unhittable-paddle bug returns from the edge inward.
    const clearance =
      IDPA_HOSTAGE_SILHOUETTE.defaultWidthM / 2 + HOSTAGE_PADDLE.defaultWidthM / 2;
    const MARGIN_M = 0.01;
    for (const stop of centreStops.filter((s) => s.xOffsetM !== 0)) {
      expect(
        Math.abs(stop.xOffsetM),
        `stop '${stop.id}' is inside the ${clearance.toFixed(4)} m clearance floor`,
      ).toBeGreaterThan(clearance + MARGIN_M);
    }
  });

  it('still reaches the paddle at the rest stop, THROUGH the window', () => {
    // The one stop that already worked, kept honest: it works because the
    // silhouette's window is `isHole`, not because of any clearance.
    const plates = rack(0, bodyY, 0);
    const hit = firstHit(plates, { x: SILHOUETTE_X, y: bodyY });
    expect(hit!.instanceId).toBe(1);
  });

  it('still scores the BACKING plate for a shot into its torso, clear of the paddle', () => {
    // The fix must not turn the silhouette into a pass-through. A hit between the
    // window's rim and the swung paddle is the silhouette's.
    const swung = centreStops.find((s) => s.xOffsetM > 0)!.xOffsetM;
    const plates = rack(swung, bodyY, 0);
    const hit = firstHit(plates, { x: SILHOUETTE_X + 0.15, y: bodyY });
    expect(hit!.instanceId).toBe(0);
    expect(['body-0', 'minus-1']).toContain(hit!.zoneId);
  });

  it('COVERS the backing plate window, leaving no ring of background around it', () => {
    // Owner, on device 2026-08-06: "The hole should actually be a bit smaller than
    // the paddle so no ring exists." The window was 70 spec-px (0.0814 m) against a
    // 0.0762 m paddle radius, so ~5 mm of background showed all the way round at the
    // rest stop.
    //
    // Neither file can see this on its own — the window is authored in spec pixels in
    // `idpa-hostage.ts`, the paddle in metres here — so the relationship is asserted
    // rather than commented, in the one place that knows both.
    const windowRadiusM =
      (IDPA_HOSTAGE_WINDOW_CIRCLE.r / IDPA_FRAME.widthPx) * IDPA_HOSTAGE_SILHOUETTE.defaultWidthM;
    const paddleRadiusM = HOSTAGE_PADDLE.defaultWidthM / 2;
    expect(paddleRadiusM).toBeGreaterThan(windowRadiusM);
    // …and by a visible margin, not by a rounding error.
    expect(paddleRadiusM - windowRadiusM).toBeGreaterThan(0.002);
  });

  it('hangs the head paddle clear of the SHOULDER, not just clear of the head', () => {
    // Owner, on device 2026-08-06: "the shoulder target is overlapping the
    // shoulder a bit causing some clipping." The two plates are coplanar, so any
    // overlap z-fights. The paddle was centred on the head ZONE (1.586 m), but the
    // disc is 6″ across and its bottom edge reached 1.4 cm BELOW the shoulder
    // line, where the silhouette suddenly widens from head to shoulders.
    //
    // Asserted from the shipped constants rather than against a literal, because
    // the failure is a couple of centimetres of z-fighting that is invisible in a
    // screenshot and only shows up in motion.
    const placement = getTargetPlacements('test-range').find((p) => p.id === 'test-hostage-top');
    expect(placement, 'test-hostage-top placement is missing').toBeDefined();
    const backing = getTargetPlacements('test-range').find(
      (p) => p.id === 'test-hostage-idpa-60',
    )!;
    // The shoulder line in world y: the backing plate's centre plus the shoulder's
    // own local y (`idpa.ts` exports it precisely so this cannot be eyeballed).
    const shoulderY = backing.centreYM! + IDPA_SHOULDER_LOCAL_Y * backing.widthM;
    const paddleBottomY = placement!.centreYM! - placement!.widthM / 2;
    expect(paddleBottomY).toBeGreaterThan(shoulderY);
  });

  it('reaches the 2-way (head) paddle at both stops too — it always did', () => {
    // The head/neck outline is much narrower than the torso, which is why this
    // paddle was re-hittable and the centre one was not. Pinned so a later
    // change to either offset cannot quietly break it.
    const stops = getMountType('hostage-clamp-2way').flip!.positions;
    const headY =
      toLocal({ x: IDPA_HEAD_CIRCLE.cx, y: IDPA_HEAD_CIRCLE.cy }, IDPA_FRAME).y *
      IDPA_HOSTAGE_SILHOUETTE.defaultWidthM;
    // The placement centres this paddle's SWING on the head, so its plate x is
    // half a swing left of the centreline (placements.data.json).
    const restOffset = -stops[stops.length - 1].xOffsetM / 2;
    for (const stop of stops) {
      const x = restOffset + stop.xOffsetM;
      const hit = firstHit(rack(x, headY, 0), { x: SILHOUETTE_X + x, y: headY });
      expect(hit, `head stop '${stop.id}' is unreachable`).not.toBeNull();
      expect(hit!.instanceId).toBe(1);
    }
  });
});
