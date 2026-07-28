import { describe, it, expect } from 'vitest';
import {
  pickAimedPlate,
  angularMissRad,
  rayPointAtDistance,
  resolveTargetPlate,
  switchThresholdRad,
} from './aim-pick';
import { snapshotElrProbe } from '../range/elr-probe-config';

const EYE = { x: 0, y: 1.7 };

/** Aim ray pointing at `(x, y)` on the plane `distanceM` downrange. */
function aimAt(x: number, y: number, distanceM: number) {
  const dx = x - EYE.x;
  const dy = y - EYE.y;
  const len = Math.hypot(dx, dy, distanceM);
  return { x: dx / len, y: dy / len, z: -distanceM / len };
}

const probePlates = snapshotElrProbe('flat').stations.map((s, i) => ({
  distanceM: s.losRangeM,
  position: { x: s.x, y: s.y },
  diameterM: s.gongDiameterM,
  instanceId: i,
  station: s.nominalDistance,
}));
const idOf = (station: number) => probePlates.find((p) => p.station === station)!.instanceId;

describe('pickAimedPlate', () => {
  it('picks the plate the crosshair is actually on', () => {
    for (const p of probePlates) {
      const dir = aimAt(p.position.x, p.position.y, p.distanceM);
      expect(pickAimedPlate(EYE, dir, probePlates)?.station).toBe(p.station);
    }
  });

  // THE REGRESSION THIS FILE EXISTS FOR. Dialled onto the 1000 m gong, holding
  // 8 MIL of elevation to reach the 1500 m one. The old linear-miss rule scored the
  // 500 m plate at 11.38 m against the 1500 m plate's 12.00 m and picked the wrong
  // one, resolving the shot on the z = -500 plane and leaving the dust puff hanging
  // 5.5 m in the air.
  it('holding 8 MIL over the 1500 m gong still picks the 1500 m gong', () => {
    const target = probePlates.find((p) => p.station === 1500)!;
    const holdMil = 8;
    const dir = aimAt(
      target.position.x,
      target.position.y + (holdMil / 1000) * target.distanceM,
      target.distanceM,
    );
    expect(pickAimedPlate(EYE, dir, probePlates)?.station).toBe(1500);

    // And show the old rule really did prefer the near plate, so the test fails
    // loudly if anyone reinstates it.
    const linearMiss = (p: (typeof probePlates)[number]) => {
      const q = rayPointAtDistance(EYE, dir, p.distanceM);
      return Math.hypot(q.x - p.position.x, q.y - p.position.y);
    };
    const near = probePlates.find((p) => p.station === 500)!;
    expect(linearMiss(near)).toBeLessThan(linearMiss(target)); // the old bug
    expect(angularMissRad(EYE, dir, near)).toBeGreaterThan(angularMissRad(EYE, dir, target));
  });

  it('holds up across a sweep of holdovers, not just the one that was reported', () => {
    const target = probePlates.find((p) => p.station === 2000)!;
    for (const holdMil of [0, 1, 2, 4, 6, 8, 10]) {
      const dir = aimAt(
        target.position.x,
        target.position.y + (holdMil / 1000) * target.distanceM,
        target.distanceM,
      );
      expect(pickAimedPlate(EYE, dir, probePlates)?.station).toBe(2000);
    }
  });

  it('a fixed ANGULAR error ranks the same at every distance — the bias that is gone', () => {
    // Two plates, same angular offset from the ray, 6x apart in range. The linear
    // rule would always prefer the near one; the angular rule calls them equal.
    const dir = aimAt(0, EYE.y, 1000);
    const offsetRad = 0.005;
    const a = { distanceM: 500, position: { x: 0, y: EYE.y + offsetRad * 500 } };
    const b = { distanceM: 3000, position: { x: 0, y: EYE.y + offsetRad * 3000 } };
    expect(angularMissRad(EYE, dir, a)).toBeCloseTo(angularMissRad(EYE, dir, b), 9);
  });

  it('returns null when not pointing downrange or with nothing to shoot', () => {
    expect(pickAimedPlate(EYE, { x: 0, y: 0, z: 1 }, probePlates)).toBeNull();
    expect(pickAimedPlate(EYE, { x: 0, y: 0, z: 0 }, probePlates)).toBeNull();
    expect(pickAimedPlate(EYE, aimAt(0, 1, 500), [])).toBeNull();
  });

  it('resolves ties to the first plate, so the pick does not flicker', () => {
    const dir = aimAt(0, EYE.y, 1000);
    const tied = [
      { distanceM: 1000, position: { x: 0, y: EYE.y + 5 }, tag: 'first' },
      { distanceM: 1000, position: { x: 0, y: EYE.y + 5 }, tag: 'second' },
    ];
    expect(pickAimedPlate(EYE, dir, tied)?.tag).toBe('first');
  });
});


describe('resolveTargetPlate — commit-preferred', () => {
  const engage = (station: number, upMil: number, rightMil: number) => {
    const t = probePlates.find((p) => p.station === station)!;
    return aimAt(
      t.position.x + (rightMil / 1000) * t.distanceM,
      t.position.y + (upMil / 1000) * t.distanceM,
      t.distanceM,
    );
  };

  it('with nothing committed it is exactly pickAimedPlate — casual play unchanged', () => {
    for (const p of probePlates) {
      const dir = aimAt(p.position.x, p.position.y, p.distanceM);
      expect(resolveTargetPlate(EYE, dir, probePlates, null)?.station).toBe(
        pickAimedPlate(EYE, dir, probePlates)?.station,
      );
    }
  });

  // THE CASE THAT MOTIVATED THIS. 6 MIL up + 6 MIL of wind hold on the 1000 m gong
  // puts the crosshair angularly nearer the 1500 m one; the commitment must hold.
  it('keeps the committed target through a combined elevation + wind hold', () => {
    const dir = engage(1000, 6, 6);
    expect(pickAimedPlate(EYE, dir, probePlates)?.station).toBe(1500); // the trap
    expect(resolveTargetPlate(EYE, dir, probePlates, idOf(1000))?.station).toBe(1000);
  });

  it('survives every realistic hold — elevation to 25 MIL, wind to 12', () => {
    for (const up of [0, 3, 6, 10, 15, 25]) {
      for (const right of [0, 3, 6, 12]) {
        expect(resolveTargetPlate(EYE, engage(1000, up, right), probePlates, idOf(1000))?.station)
          .toBe(1000);
      }
    }
  });

  it('elevation hold alone can never steal the engagement, at any magnitude', () => {
    // Every gong centre sits at the same height, so holding UP moves away from all
    // of them at once. Only lateral hold can walk the crosshair onto a neighbour.
    for (const up of [5, 15, 30, 60]) {
      expect(resolveTargetPlate(EYE, engage(1000, up, 0), probePlates, idOf(1000))?.station)
        .toBe(1000);
    }
  });

  // "Swing around and shoot whatever" — putting the crosshair ON another plate
  // hands it the engagement immediately, with no commit step.
  it('switches the moment the crosshair is actually on a different plate', () => {
    for (const station of [500, 1500, 2000, 3000]) {
      const t = probePlates.find((p) => p.station === station)!;
      const dir = aimAt(t.position.x, t.position.y, t.distanceM);
      expect(resolveTargetPlate(EYE, dir, probePlates, idOf(1000))?.station).toBe(station);
    }
  });

  it('switches when just off a plate edge, but not a plate-width away', () => {
    const t = probePlates.find((p) => p.station === 2000)!;
    const near = aimAt(t.position.x + 0.9, t.position.y, t.distanceM); // ~0.45 mrad
    expect(resolveTargetPlate(EYE, near, probePlates, idOf(1000))?.station).toBe(2000);
    const away = aimAt(t.position.x + 12, t.position.y, t.distanceM); // ~6 mrad
    expect(resolveTargetPlate(EYE, away, probePlates, idOf(1000))?.station).toBe(1000);
  });

  it('falls back to aim-pick if the committed plate is gone (scene rebuilt)', () => {
    const dir = engage(1000, 6, 6);
    expect(resolveTargetPlate(EYE, dir, probePlates, 999)?.station).toBe(1500);
  });

  it('the switch threshold has a floor, so small far plates stay selectable', () => {
    const tiny = { distanceM: 3000, position: { x: 0, y: 1 }, diameterM: 0.05 };
    expect(switchThresholdRad(tiny)).toBeGreaterThanOrEqual(1.5e-3);
    const big = { distanceM: 500, position: { x: 0, y: 1 }, diameterM: 3 };
    expect(switchThresholdRad(big)).toBeCloseTo(2 * (1.5 / 500), 9);
  });

  it('returns null when not pointing downrange, committed or not', () => {
    expect(resolveTargetPlate(EYE, { x: 0, y: 0, z: 1 }, probePlates, idOf(1000))).toBeNull();
  });
});
