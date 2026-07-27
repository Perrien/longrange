// Wooded Zero Range layout tests — Stage 1 of `Design/archive/mil-zero-range-plan.md`.
//
// These assert the geometric PROPERTIES the range depends on, not just the
// numbers the plan happens to quote. Each one guards a specific way the layout
// can silently break if the fan, the knoll or the corridor model is retuned
// later.
import { describe, expect, it } from 'vitest';
import {
  CORRIDOR_OVERRUN_M,
  EYE_Y_M,
  KNOLL_GRADE,
  SIGHT_DROP_M,
  SHOOTER_CLEAR_M,
  TARGET_CENTER_Y_M,
  boardHalfDiagonalRad,
  facingYawRad,
  boardLayoutFor,
  buildCorridors,
  corridorFloorY,
  corridorHalfWidth,
  groundRunForLosRange,
  insideAnyCorridor,
  isPlantable,
  sightLineY,
  snapshotWoodedZero,
} from './wooded-zero-config';
import { getRangeDefinition } from './ranges';
import { yardsToMeters, inchesToMeters } from '../units/length';

const metric = snapshotWoodedZero('MIL');
const imperial = snapshotWoodedZero('MOA');
const DEG = Math.PI / 180;

describe('registry wiring', () => {
  it('is a zeroable paper bay with four fanned stations', () => {
    const r = getRangeDefinition('wooded-zero');
    expect(r.sceneType).toBe('wooded-zero');
    expect(r.targetKind).toBe('paper');
    expect(r.zeroable).toBe(true);
    expect(r.unitCharacter).toBe('both');
    expect(r.stations.map((s) => s.nominalDistance)).toEqual([25, 50, 100, 200]);
    expect(r.stations.every((s) => typeof s.azimuthDeg === 'number')).toBe(true);
  });
});

describe('snapshot shape', () => {
  it('pairs MIL with metres + the mil face, MOA with yards + the moa face', () => {
    expect(metric.system).toBe('metric');
    expect(metric.artVariant).toBe('mil');
    expect(metric.stations.map((s) => Math.round(s.losRangeM))).toEqual([25, 50, 100, 200]);

    expect(imperial.system).toBe('imperial');
    expect(imperial.artVariant).toBe('moa');
    // 25/50/100/200 YARDS, in metres
    expect(imperial.stations.map((s) => +s.losRangeM.toFixed(2))).toEqual([22.86, 45.72, 91.44, 182.88]);
  });

  it('is a pure value function — a later flip cannot mutate a held snapshot (D3)', () => {
    const held = snapshotWoodedZero('MIL');
    snapshotWoodedZero('MOA');
    expect(held.stations.map((s) => s.losRangeM)).toEqual(metric.stations.map((s) => s.losRangeM));
  });
});

describe('LOS range vs ground run (plan §3.3)', () => {
  it('treats the station distance as line-of-sight, so ground run is SHORTER', () => {
    for (const s of metric.stations) {
      expect(s.groundRunM).toBeLessThan(s.losRangeM);
      expect(Math.hypot(s.groundRunM, SIGHT_DROP_M)).toBeCloseTo(s.losRangeM, 10);
    }
  });

  it('places each target on its own bearing at its own ground run', () => {
    for (const s of metric.stations) {
      expect(Math.hypot(s.x, s.z)).toBeCloseTo(s.groundRunM, 10);
      expect(Math.atan2(s.x, -s.z) / DEG).toBeCloseTo(s.azimuthDeg, 10);
      expect(s.y).toBe(TARGET_CENTER_Y_M);
    }
  });

  it('inverts groundRunForLosRange consistently', () => {
    expect(Math.hypot(groundRunForLosRange(100), SIGHT_DROP_M)).toBeCloseTo(100, 10);
  });
});

describe('knoll must out-run the steepest sight line (plan §2.2)', () => {
  // THE failure mode this guards: a gentle knoll grazes the 25 m sight line a
  // few metres past the muzzle, and the shooter fires into his own hill.
  it('keeps the corridor floor below every sight line, at every range', () => {
    for (const s of metric.stations) {
      for (let r = 0; r <= s.groundRunM; r += 0.25) {
        expect(sightLineY(s, r)).toBeGreaterThan(corridorFloorY(r));
      }
    }
  });

  it('clears by a margin that only grows with distance on the steepest lane', () => {
    const nearest = metric.stations[0];
    let previous = -Infinity;
    for (let r = 0; r <= 15; r += 0.5) {
      const clearance = sightLineY(nearest, r) - corridorFloorY(r);
      expect(clearance).toBeGreaterThan(previous);
      previous = clearance;
    }
  });

  it('grades the forward face steeper than the steepest sight line', () => {
    const steepest = Math.max(...metric.stations.map((s) => SIGHT_DROP_M / s.groundRunM));
    expect(KNOLL_GRADE).toBeGreaterThan(steepest);
  });

  it('starts the shooter one eye-height above the crest and reaches the target plane', () => {
    expect(corridorFloorY(0)).toBeCloseTo(EYE_Y_M - 0.2, 10);
    expect(corridorFloorY(15)).toBe(0);
  });
});

describe('occlusion — board silhouettes, not just faces (plan §4)', () => {
  // Angular separation between two stations must exceed the sum of their board
  // half-diagonals, or the nearer board covers the farther target.
  const worstMargin = (layout: typeof metric): number => {
    let worst = Infinity;
    for (const near of layout.stations) {
      for (const far of layout.stations) {
        if (far.groundRunM <= near.groundRunM) continue;
        const sep = Math.hypot(far.azimuthDeg - near.azimuthDeg, far.elevationDeg - near.elevationDeg);
        worst = Math.min(
          worst,
          sep - boardHalfDiagonalRad(near) / DEG - boardHalfDiagonalRad(far) / DEG,
        );
      }
    }
    return worst;
  };

  it('clears every pair in the metric layout', () => {
    expect(worstMargin(metric)).toBeGreaterThan(1.5);
  });

  it('clears every pair in the imperial layout too', () => {
    // Tighter than metric: the MOA face is 27% larger while the yard stations
    // sit 9% closer, so the near board subtends more. Still over a degree of air.
    expect(worstMargin(imperial)).toBeGreaterThan(1.0);
  });

  it('needs BOTH elevation and azimuth — elevation alone is not enough', () => {
    // Strip the azimuth fan and the 100 m board swallows the 200 m target.
    const flat = metric.stations.map((s) => ({ ...s, azimuthDeg: 0 }));
    const sep = Math.abs(flat[3].elevationDeg - flat[2].elevationDeg);
    expect(sep).toBeLessThan(boardHalfDiagonalRad(flat[2]) / DEG);
  });

  it('got BETTER when boards became equal-sized, not worse', () => {
    // The distance-scaled boards this replaced managed +2.03°. Equal boards win
    // because the far boards shrink faster than the near ones grow.
    expect(worstMargin(metric)).toBeGreaterThan(1.9);
  });
});

describe('targets face the firing point (owner bug, on device 2026-07-26)', () => {
  // The scene yawed boards by +azimuth instead of -azimuth, so every board was
  // turned the WRONG WAY and the visible error was twice the azimuth — 12 deg at
  // the 25 m station, which is where it was noticed. A sign error like this is
  // invisible in review and obvious on device, so it belongs in a test.
  const facingVector = (yaw: number) => ({ x: Math.sin(yaw), z: Math.cos(yaw) });

  it('points every board back at the origin', () => {
    for (const layout of [metric, imperial]) {
      for (const s of layout.stations) {
        const f = facingVector(facingYawRad(s));
        // Unit vector from the target toward the shooter.
        const len = Math.hypot(s.x, s.z);
        expect(f.x).toBeCloseTo(-s.x / len, 10);
        expect(f.z).toBeCloseTo(-s.z / len, 10);
      }
    }
  });

  it('yaws by exactly MINUS the station azimuth', () => {
    for (const s of metric.stations) {
      expect((facingYawRad(s) * 180) / Math.PI).toBeCloseTo(-s.azimuthDeg, 10);
    }
  });

  it('rejects the sign error specifically', () => {
    // +azimuth would look plausible and be wrong by 2x azimuth. Assert the two
    // are actually different, so a future "simplification" back to atan2(x, -z)
    // cannot pass.
    const near = metric.stations[0];
    const wrong = Math.atan2(near.x, -near.z);
    expect(Math.abs(facingYawRad(near) - wrong)).toBeCloseTo(Math.abs(2 * near.azimuthDeg * DEG), 10);
  });

  it('leaves a dead-ahead target unrotated', () => {
    expect(facingYawRad({ x: 0, z: -100 })).toBeCloseTo(0, 10);
  });
});

describe('corridors', () => {
  it('are built from the metric station set regardless of display units', () => {
    expect(metric.corridors).toEqual(imperial.corridors);
    expect(buildCorridors()).toEqual(metric.corridors);
  });

  it('each reaches exactly its own target plus the overrun', () => {
    metric.stations.forEach((s, i) => {
      expect(metric.corridors[i].reachM).toBeCloseTo(s.groundRunM + CORRIDOR_OVERRUN_M, 10);
    });
  });

  it('widens with range but never below the floor', () => {
    expect(corridorHalfWidth(0)).toBe(1.8);
    expect(corridorHalfWidth(100)).toBe(1.8);
    expect(corridorHalfWidth(200)).toBeCloseTo(2.4, 10);
  });

  it('contains every target it serves, with room around the board', () => {
    metric.stations.forEach((s) => {
      expect(insideAnyCorridor(s.x, s.z, metric.corridors)).toBe(true);
      // the board's half-width must fit inside the corridor's
      expect(corridorHalfWidth(s.groundRunM)).toBeGreaterThan(s.boardWidthM / 2);
    });
  });
});

describe('DUAL-UNIT SUPERSET INVARIANT (plan §8)', () => {
  // The whole reason the world can be built once: a yard is shorter than a metre
  // at every nominal distance, so imperial targets sit SHORT on the same lane
  // axes, always inside already-cleared ground. If this breaks, the forest and
  // the terrain shift between unit modes.
  it('places every imperial station inside the metric corridors', () => {
    imperial.stations.forEach((s) => {
      expect(insideAnyCorridor(s.x, s.z, metric.corridors)).toBe(true);
    });
  });

  it('keeps every imperial ground run inside its own lane reach', () => {
    imperial.stations.forEach((s, i) => {
      expect(s.groundRunM).toBeLessThanOrEqual(metric.corridors[i].reachM);
    });
  });

  it('fits every imperial board inside the corridor half-width at its range', () => {
    imperial.stations.forEach((s) => {
      expect(corridorHalfWidth(s.groundRunM)).toBeGreaterThan(s.boardWidthM / 2);
    });
  });

  it('shares azimuths across unit systems — distances convert, bearings do not', () => {
    expect(imperial.stations.map((s) => s.azimuthDeg)).toEqual(metric.stations.map((s) => s.azimuthDeg));
  });
});

describe('plantability (plan §6.2)', () => {
  const behind = (stationIndex: number, backM: number) => {
    const s = metric.stations[stationIndex];
    const a = s.azimuthDeg * DEG;
    const r = s.groundRunM + backM;
    return { x: r * Math.sin(a), z: -r * Math.cos(a) };
  };

  it('lets a real tree stand 25 m behind every near station', () => {
    for (let i = 0; i < 3; i++) {
      const p = behind(i, 25);
      expect(isPlantable(p.x, p.z, metric.corridors, 1.5)).toBe(true);
    }
  });

  it('still refuses a tree immediately behind a station, where lanes are merged', () => {
    const p = behind(0, 8);
    expect(isPlantable(p.x, p.z, metric.corridors, 1.5)).toBe(false);
  });

  it('never plants on a sight line', () => {
    for (const s of metric.stations) {
      for (let f = 0.1; f <= 1; f += 0.05) {
        const p = { x: s.x * f, z: s.z * f };
        expect(isPlantable(p.x, p.z, metric.corridors, 1.5)).toBe(false);
      }
    }
  });

  it('keeps a clear radius around the shooter', () => {
    expect(isPlantable(0, -(SHOOTER_CLEAR_M - 1), metric.corridors)).toBe(false);
  });

  it('allows the flanks well off-axis', () => {
    expect(isPlantable(60, -60, metric.corridors, 1.5)).toBe(true);
    expect(isPlantable(-60, -60, metric.corridors, 1.5)).toBe(true);
  });
});

describe('boards and lane markers (plan §5)', () => {
  it('is the SAME physical size at every station', () => {
    // Owner, on device 2026-07-26: the distance-scaled board was "comically
    // large at the 200 meter mark". One frame size, like a real range.
    for (const layout of [metric, imperial]) {
      const widths = new Set(layout.stations.map((s) => s.boardWidthM));
      const heights = new Set(layout.stations.map((s) => s.boardHeightM));
      expect(widths.size).toBe(1);
      expect(heights.size).toBe(1);
    }
  });

  it('keeps the 200 m board a sane physical object', () => {
    const far = metric.stations[3];
    expect(far.boardWidthM).toBeLessThan(1.0); // was 2.40 m under the angular rule
  });

  it('never lets a board be smaller than the paper it carries', () => {
    for (const s of metric.stations) expect(s.boardWidthM).toBeGreaterThan(metric.targetSizeM);
    for (const s of imperial.stations) expect(s.boardWidthM).toBeGreaterThan(imperial.targetSizeM);
  });

  // THE BUG THIS GUARDS (owner, on device 2026-07-26): the paper face covered
  // the lane number. The paper is centred on the aim point at 1.0 m and cannot
  // move — every sight-line and occlusion proof depends on that — so the plate
  // band has to be reserved ABOVE it, and the board grows upward to make room.
  it('never lets the paper face overlap the lane-number plate', () => {
    for (const layout of [metric, imperial]) {
      for (const s of layout.stations) {
        const paperTop = TARGET_CENTER_Y_M + layout.targetSizeM / 2;
        const plateBottom = s.boardCenterYM + s.boardHeightM / 2 - s.markerPlateM;
        expect(plateBottom).toBeGreaterThan(paperTop);
      }
    }
  });

  it('keeps the paper fully on the board, with margin all round', () => {
    for (const layout of [metric, imperial]) {
      const half = layout.targetSizeM / 2;
      for (const s of layout.stations) {
        expect(s.boardWidthM / 2).toBeGreaterThan(half);
        expect(TARGET_CENTER_Y_M - half).toBeGreaterThan(s.boardCenterYM - s.boardHeightM / 2);
      }
    }
  });

  it('leaves the aim point exactly at the target centre height', () => {
    // The board moved up; the PAPER must not have.
    for (const layout of [metric, imperial]) {
      for (const s of layout.stations) expect(s.y).toBe(TARGET_CENTER_Y_M);
    }
  });

  it('holds the board clear of the ground', () => {
    for (const s of metric.stations) expect(s.boardCenterYM - s.boardHeightM / 2).toBeGreaterThan(0.2);
  });

  // Owner, on device 2026-07-26: the plate showed a bare number, which is
  // ambiguous on a range whose stations are metres OR yards depending on the
  // player's unit preference.
  it('labels the plate with distance AND unit', () => {
    expect(metric.stations.map((s) => s.markerText)).toEqual(['25 M', '50 M', '100 M', '200 M']);
    expect(imperial.stations.map((s) => s.markerText)).toEqual(['25 YD', '50 YD', '100 YD', '200 YD']);
  });

  it('derives board geometry from the face alone', () => {
    const b = boardLayoutFor(0.44);
    expect(b.widthM).toBeCloseTo(0.66, 10);
    expect(b.plateM).toBeCloseTo(0.176, 10);
    expect(b.heightM).toBeCloseTo(0.836, 10);
    expect(b.centerYM).toBeCloseTo(TARGET_CENTER_Y_M + 0.088, 10);
  });
});

describe('sight picture (plan §3.1)', () => {
  it('fits all four stations in a compact box', () => {
    const az = metric.stations.map((s) => s.azimuthDeg);
    const el = metric.stations.map((s) => s.elevationDeg);
    expect(Math.max(...az) - Math.min(...az)).toBeCloseTo(10.5, 6);
    expect(Math.max(...el) - Math.min(...el)).toBeLessThan(1.6);
  });

  it('depresses every sight line — the shooter is above every target', () => {
    for (const s of metric.stations) expect(s.elevationDeg).toBeLessThan(0);
    // and the nearest station is the steepest
    const byRange = [...metric.stations].sort((a, b) => a.losRangeM - b.losRangeM);
    for (let i = 1; i < byRange.length; i++) {
      expect(byRange[i].elevationDeg).toBeGreaterThan(byRange[i - 1].elevationDeg);
    }
  });
});

describe('grid squares must line up with the reticle (owner bug, on device 2026-07-26)', () => {
  // Both faces are a 22-cell grid. The face size decides what ONE SQUARE is worth
  // in angle at its design distance — which is the whole point of a grid target,
  // and the thing that was silently wrong for MOA.
  const CELLS = 22;
  const MOA_RAD = Math.PI / (180 * 60);
  const MIL_RAD = 0.001;

  it('gives the MIL face exactly 0.2 mil per square at 100 m', () => {
    const cell = metric.targetSizeM / CELLS;
    expect(cell / 100 / MIL_RAD).toBeCloseTo(0.2, 12);
  });

  it('gives the MOA face exactly 1.00 MOA per square at 100 yd', () => {
    // THE BUG: a 22 in face gives 1 inch per cell, and an inch at 100 yd is only
    // 0.9549 MOA — the "1 inch = 1 MOA" shorthand. Each square was 4.5% small and
    // the error ACCUMULATED, so the grid drifted ~0.45 MOA off the reticle by the
    // 10 mark. MIL was unaffected because 1 mil at 100 m is 10 cm by definition.
    const cell = imperial.targetSizeM / CELLS;
    expect(cell / yardsToMeters(100) / MOA_RAD).toBeCloseTo(1.0, 12);
  });

  it('rejects the old 22 in face specifically', () => {
    const oldCell = inchesToMeters(22) / CELLS;
    expect(oldCell / yardsToMeters(100) / MOA_RAD).toBeCloseTo(0.9549, 4);
    expect(imperial.targetSizeM).toBeGreaterThan(inchesToMeters(22));
  });

  it('keeps the 10-square mark landing on the reticle 10 mark, both systems', () => {
    // The visible symptom was cumulative: fine at the centre, clearly off at 10.
    expect((10 * metric.targetSizeM) / CELLS / 100 / MIL_RAD).toBeCloseTo(2.0, 10);
    expect((10 * imperial.targetSizeM) / CELLS / yardsToMeters(100) / MOA_RAD).toBeCloseTo(10.0, 10);
  });
});
