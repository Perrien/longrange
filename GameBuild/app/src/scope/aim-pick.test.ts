import { describe, it, expect } from 'vitest';
import {
  pickAimedPlate,
  angularMissRad,
  rayPointAtDistance,
  resolveTargetPlate,
  switchThresholdRad,
  crosshairIsOnPlate,
} from './aim-pick';

const EYE = { x: 0, y: 1.7 };

/** Aim ray pointing at `(x, y)` on the plane `distanceM` downrange. */
function aimAt(x: number, y: number, distanceM: number) {
  const dx = x - EYE.x;
  const dy = y - EYE.y;
  const len = Math.hypot(dx, dy, distanceM);
  return { x: dx / len, y: dy / len, z: -distanceM / len };
}

/**
 * The plate ladder these tests are calibrated against: six 1 MIL gongs at 500 m
 * steps on flat ground, fanned across ±1.5°.
 *
 * This is a LOCAL FIXTURE on purpose. It is the geometry of the deleted ELR probe
 * range (removed 2026-07-29), which is where the near-plate-steals-the-pick
 * regression was found — the numbers in the assertions below (an 11.38 m vs 12.00 m
 * linear miss, a 0.45 mrad edge, a 6 mrad miss) only mean anything against these
 * spacings. Rebuilding it here keeps the regression coverage without tying a unit
 * test of ray-vs-plate maths to whichever range happens to exist. Do NOT repoint it
 * at a live range's layout: that would silently recalibrate the test.
 */
const DEG = Math.PI / 180;
const LADDER = [
  { losRangeM: 500, azimuthDeg: -1.5 },
  { losRangeM: 1000, azimuthDeg: -0.9 },
  { losRangeM: 1500, azimuthDeg: -0.3 },
  { losRangeM: 2000, azimuthDeg: 0.3 },
  { losRangeM: 2500, azimuthDeg: 0.9 },
  { losRangeM: 3000, azimuthDeg: 1.5 },
];
const ladderPlates = LADDER.map(({ losRangeM, azimuthDeg }, i) => {
  const diameterM = losRangeM / 1000; // 1 MIL gong
  // Centre high enough that a 2×-diameter frame clears the dirt by 0.3 m.
  const y = Math.max(1, diameterM + 0.3);
  // Ground run solved FROM the line-of-sight range, as every ELR layout does.
  const groundRunM = Math.sqrt(losRangeM * losRangeM - (y - EYE.y) ** 2);
  return {
    distanceM: losRangeM,
    position: { x: groundRunM * Math.sin(azimuthDeg * DEG), y },
    diameterM,
    instanceId: i,
    station: losRangeM,
  };
});
const idOf = (station: number) => ladderPlates.find((p) => p.station === station)!.instanceId;

describe('pickAimedPlate', () => {
  it('picks the plate the crosshair is actually on', () => {
    for (const p of ladderPlates) {
      const dir = aimAt(p.position.x, p.position.y, p.distanceM);
      expect(pickAimedPlate(EYE, dir, ladderPlates)?.station).toBe(p.station);
    }
  });

  // THE REGRESSION THIS FILE EXISTS FOR. Dialled onto the 1000 m gong, holding
  // 8 MIL of elevation to reach the 1500 m one. The old linear-miss rule scored the
  // 500 m plate at 11.38 m against the 1500 m plate's 12.00 m and picked the wrong
  // one, resolving the shot on the z = -500 plane and leaving the dust puff hanging
  // 5.5 m in the air.
  it('holding 8 MIL over the 1500 m gong still picks the 1500 m gong', () => {
    const target = ladderPlates.find((p) => p.station === 1500)!;
    const holdMil = 8;
    const dir = aimAt(
      target.position.x,
      target.position.y + (holdMil / 1000) * target.distanceM,
      target.distanceM,
    );
    expect(pickAimedPlate(EYE, dir, ladderPlates)?.station).toBe(1500);

    // And show the old rule really did prefer the near plate, so the test fails
    // loudly if anyone reinstates it.
    const linearMiss = (p: (typeof ladderPlates)[number]) => {
      const q = rayPointAtDistance(EYE, dir, p.distanceM);
      return Math.hypot(q.x - p.position.x, q.y - p.position.y);
    };
    const near = ladderPlates.find((p) => p.station === 500)!;
    expect(linearMiss(near)).toBeLessThan(linearMiss(target)); // the old bug
    expect(angularMissRad(EYE, dir, near)).toBeGreaterThan(angularMissRad(EYE, dir, target));
  });

  it('holds up across a sweep of holdovers, not just the one that was reported', () => {
    const target = ladderPlates.find((p) => p.station === 2000)!;
    for (const holdMil of [0, 1, 2, 4, 6, 8, 10]) {
      const dir = aimAt(
        target.position.x,
        target.position.y + (holdMil / 1000) * target.distanceM,
        target.distanceM,
      );
      expect(pickAimedPlate(EYE, dir, ladderPlates)?.station).toBe(2000);
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
    expect(pickAimedPlate(EYE, { x: 0, y: 0, z: 1 }, ladderPlates)).toBeNull();
    expect(pickAimedPlate(EYE, { x: 0, y: 0, z: 0 }, ladderPlates)).toBeNull();
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
    const t = ladderPlates.find((p) => p.station === station)!;
    return aimAt(
      t.position.x + (rightMil / 1000) * t.distanceM,
      t.position.y + (upMil / 1000) * t.distanceM,
      t.distanceM,
    );
  };

  it('with nothing committed it is exactly pickAimedPlate — casual play unchanged', () => {
    for (const p of ladderPlates) {
      const dir = aimAt(p.position.x, p.position.y, p.distanceM);
      expect(resolveTargetPlate(EYE, dir, ladderPlates, null)?.station).toBe(
        pickAimedPlate(EYE, dir, ladderPlates)?.station,
      );
    }
  });

  // THE CASE THAT MOTIVATED THIS. 6 MIL up + 6 MIL of wind hold on the 1000 m gong
  // puts the crosshair angularly nearer the 1500 m one; the commitment must hold.
  it('keeps the committed target through a combined elevation + wind hold', () => {
    const dir = engage(1000, 6, 6);
    expect(pickAimedPlate(EYE, dir, ladderPlates)?.station).toBe(1500); // the trap
    expect(resolveTargetPlate(EYE, dir, ladderPlates, idOf(1000))?.station).toBe(1000);
  });

  it('survives every realistic hold — elevation to 25 MIL, wind to 12', () => {
    for (const up of [0, 3, 6, 10, 15, 25]) {
      for (const right of [0, 3, 6, 12]) {
        expect(resolveTargetPlate(EYE, engage(1000, up, right), ladderPlates, idOf(1000))?.station)
          .toBe(1000);
      }
    }
  });

  it('elevation hold alone can never steal the engagement, at any magnitude', () => {
    // Every gong centre sits at the same height, so holding UP moves away from all
    // of them at once. Only lateral hold can walk the crosshair onto a neighbour.
    for (const up of [5, 15, 30, 60]) {
      expect(resolveTargetPlate(EYE, engage(1000, up, 0), ladderPlates, idOf(1000))?.station)
        .toBe(1000);
    }
  });

  // "Swing around and shoot whatever" — putting the crosshair ON another plate
  // hands it the engagement immediately, with no commit step.
  it('switches the moment the crosshair is actually on a different plate', () => {
    for (const station of [500, 1500, 2000, 3000]) {
      const t = ladderPlates.find((p) => p.station === station)!;
      const dir = aimAt(t.position.x, t.position.y, t.distanceM);
      expect(resolveTargetPlate(EYE, dir, ladderPlates, idOf(1000))?.station).toBe(station);
    }
  });

  it('switches when just off a plate edge, but not a plate-width away', () => {
    const t = ladderPlates.find((p) => p.station === 2000)!;
    const near = aimAt(t.position.x + 0.9, t.position.y, t.distanceM); // ~0.45 mrad
    expect(resolveTargetPlate(EYE, near, ladderPlates, idOf(1000))?.station).toBe(2000);
    const away = aimAt(t.position.x + 12, t.position.y, t.distanceM); // ~6 mrad
    expect(resolveTargetPlate(EYE, away, ladderPlates, idOf(1000))?.station).toBe(1000);
  });

  it('falls back to aim-pick if the committed plate is gone (scene rebuilt)', () => {
    const dir = engage(1000, 6, 6);
    expect(resolveTargetPlate(EYE, dir, ladderPlates, 999)?.station).toBe(1500);
  });

  it('the switch threshold has a floor, so small far plates stay selectable', () => {
    const tiny = { distanceM: 3000, position: { x: 0, y: 1 }, diameterM: 0.05 };
    expect(switchThresholdRad(tiny)).toBeGreaterThanOrEqual(1.5e-3);
    const big = { distanceM: 500, position: { x: 0, y: 1 }, diameterM: 3 };
    expect(switchThresholdRad(big)).toBeCloseTo(2 * (1.5 / 500), 9);
  });

  it('returns null when not pointing downrange, committed or not', () => {
    expect(resolveTargetPlate(EYE, { x: 0, y: 0, z: 1 }, ladderPlates, idOf(1000))).toBeNull();
  });
});

// --- shape-aware target selection (owner fix, 2026-07-31) ----------------------
// "On the poppers the bottom and middle circle accept hits and fall but the head area
// doesn't. Shots pass clean through them." The switch test sized itself off a CIRCLE of
// the plate's width, so a 42" popper's head sat outside it and the committed plate kept
// the engagement — the popper was never hit-tested.

describe('crosshairIsOnPlate', () => {
  const at = (x: number, y: number, distanceM: number) => aimAt(x, y, distanceM);

  it('reduces EXACTLY to the old circular test for a round plate', () => {
    // The guarantee that keeps every shipped range unchanged: with `heightM` omitted,
    // the elliptical test and `switchThresholdRad` must agree on every point.
    for (const diameterM of [0.05, 0.1524, 0.3048, 1.0, 2.0]) {
      for (const distanceM of [50, 100, 457, 1000, 2000]) {
        const plate = { distanceM, position: { x: 0, y: 1.5 }, diameterM };
        const threshold = switchThresholdRad(plate);
        for (const f of [0.5, 0.9, 0.99, 1.01, 1.1, 2]) {
          for (const angle of [0, Math.PI / 4, Math.PI / 2, Math.PI]) {
            const rad = threshold * f;
            const dir = at(
              plate.position.x + Math.cos(angle) * rad * distanceM,
              plate.position.y + Math.sin(angle) * rad * distanceM,
              distanceM,
            );
            const circular = angularMissRad(EYE, dir, plate) <= threshold;
            expect(crosshairIsOnPlate(EYE, dir, plate)).toBe(circular);
          }
        }
      }
    }
  });

  it('treats heightM === diameterM as the round case', () => {
    const round = { distanceM: 100, position: { x: 0, y: 1.5 }, diameterM: 0.3048 };
    const square = { ...round, heightM: 0.3048 };
    const dir = at(0.4, 1.5, 100);
    expect(crosshairIsOnPlate(EYE, dir, square)).toBe(crosshairIsOnPlate(EYE, dir, round));
  });

  it('selects a TALL plate by its head, which the circular test could not', () => {
    // The exact popper geometry: 12" wide, 42" tall, centre 0.533 m up, at 50 yd.
    const popper = {
      distanceM: 45.72,
      position: { x: 1.4, y: 0.5334 },
      diameterM: 0.3048,
      heightM: 1.0668,
    };
    const headY = popper.position.y + popper.heightM / 2 - 0.05; // just inside the top
    const dir = at(popper.position.x, headY, popper.distanceM);
    // The old circular test rejected this…
    expect(angularMissRad(EYE, dir, popper)).toBeGreaterThan(switchThresholdRad(popper));
    // …the shape-aware one accepts it.
    expect(crosshairIsOnPlate(EYE, dir, popper)).toBe(true);
  });

  it('still rejects a shot well above a tall plate', () => {
    // Taller is not unlimited: 2× half-height is the limit, so a metre above the head
    // is still not "on it".
    const popper = {
      distanceM: 45.72,
      position: { x: 1.4, y: 0.5334 },
      diameterM: 0.3048,
      heightM: 1.0668,
    };
    const dir = at(popper.position.x, popper.position.y + 2.0, popper.distanceM);
    expect(crosshairIsOnPlate(EYE, dir, popper)).toBe(false);
  });

  it('does NOT widen a tall plate horizontally', () => {
    // The wrong fix would be `max(halfW, halfH)`, which would make a 42" popper
    // selectable a metre off to the side and let it steal its neighbour's engagement.
    const popper = {
      distanceM: 45.72,
      position: { x: 1.4, y: 0.5334 },
      diameterM: 0.3048,
      heightM: 1.0668,
    };
    const dir = at(popper.position.x + 0.7, popper.position.y, popper.distanceM);
    expect(crosshairIsOnPlate(EYE, dir, popper)).toBe(false);
  });
});

describe('resolveTargetPlate with a tall plate', () => {
  // The Test Range as staged: an auto-committed gong at 100 yd plus two poppers at 50.
  const gong = {
    distanceM: 91.44,
    position: { x: 0, y: 0.5486 },
    diameterM: 0.3048,
    instanceId: 0,
    station: 'gong',
  };
  const popper = {
    distanceM: 45.72,
    position: { x: 1.4, y: 0.5334 },
    diameterM: 0.3048,
    heightM: 1.0668,
    instanceId: 1,
    station: 'popper',
  };
  const plates = [gong, popper];

  it('gives the engagement to a popper aimed at its HEAD', () => {
    // What was broken: the gong kept it, the shot resolved on the gong's plane, and the
    // popper was never hit-tested — "shots pass clean through".
    const head = aimAt(popper.position.x, popper.position.y + 0.48, popper.distanceM);
    expect(resolveTargetPlate(EYE, head, plates, gong.instanceId)?.station).toBe('popper');
  });

  it('still gives it to a popper aimed at its body', () => {
    const body = aimAt(popper.position.x, popper.position.y, popper.distanceM);
    expect(resolveTargetPlate(EYE, body, plates, gong.instanceId)?.station).toBe('popper');
  });

  it('leaves the gong committed when the crosshair is on neither', () => {
    const nowhere = aimAt(-3, 3, popper.distanceM);
    expect(resolveTargetPlate(EYE, nowhere, plates, gong.instanceId)?.station).toBe('gong');
  });
});
