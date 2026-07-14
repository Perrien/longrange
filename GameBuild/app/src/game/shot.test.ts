// Shot-resolution tests (task 1.4c). Pure resolveShot cases + a WASM behavioral
// test that closes the task-1.4 Done-when through the app path: with zero wind
// and the correct dial, seeded groups center on the target and their mean radius
// matches the engine hit-sim within 10%.
import { describe, it, expect, beforeAll } from 'vitest';
import { resolveShot, type ShotPlate } from './shot';
import { requiredCorrectionRad } from './firing-solution';
import { milToRad } from '../units/angle';
import { loadBtkModule } from '../engine-bridge/wasm-module';
import { createScatterSimulator, seedRandom } from '../engine-bridge/match-sim';
import { solveTrajectory, spinRateFromTwist, type AtmosphereInput, type Load } from '../engine-bridge';
import type { BtkModule } from '../engine-bridge/types';
import { getGameLoad } from './loads';

const EYE = { x: 0, y: 1.6, z: 0 };
const ISA: AtmosphereInput = { temperatureK: 288.15, altitudeM: 0, humidity: 0.5, pressurePa: 0 };

// --- pure resolveShot ---------------------------------------------------------
describe('game/shot/resolveShot (pure)', () => {
  const R = 274.32; // 300 yd
  const P = { x: 1.2, y: 0.55 };
  const PLATE: ShotPlate = { instanceId: 7, position: P, diameterM: 0.1524 };
  const BULLET = 0.0067056;
  const solve = { dropM: -2.0, windageM: 0.1 };
  const required = requiredCorrectionRad(solve.dropM, solve.windageM, R);

  /** Unit aim direction from the eye toward a point on the R-plane. */
  function dirTo(target: { x: number; y: number }) {
    const v = { x: target.x - EYE.x, y: target.y - EYE.y, z: -R - EYE.z };
    const m = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  }

  it('correct dial + centered aim + no scatter lands dead center and hits', () => {
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(P), dial: required, solve, distanceM: R,
      scatter: { x: 0, y: 0 }, plates: [PLATE], bulletDiameterM: BULLET,
    });
    expect(res.impact.x).toBeCloseTo(P.x, 6);
    expect(res.impact.y).toBeCloseTo(P.y, 6);
    expect(res.hitPlateId).toBe(7);
    expect(res.aimedPlateId).toBe(7);
  });

  it('scatter shifts the impact by exactly the scatter (center unchanged)', () => {
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(P), dial: required, solve, distanceM: R,
      scatter: { x: 0.02, y: -0.03 }, plates: [PLATE], bulletDiameterM: BULLET,
    });
    expect(res.impact.x).toBeCloseTo(P.x + 0.02, 6);
    expect(res.impact.y).toBeCloseTo(P.y - 0.03, 6);
  });

  it('under-dialed elevation drops the impact low → miss', () => {
    const dial = { elevRad: required.elevRad - milToRad(2), windRad: required.windRad };
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(P), dial, solve, distanceM: R,
      scatter: { x: 0, y: 0 }, plates: [PLATE], bulletDiameterM: BULLET,
    });
    expect(res.impact.y).toBeLessThan(P.y - 0.05); // ~0.55 m low at 274 m
    expect(res.hitPlateId).toBeNull();
  });

  it('holding over (aim above center) adds to the dialed come-up → group rises', () => {
    const res = resolveShot({
      eye: EYE, aimDir: dirTo({ x: P.x, y: P.y + 0.3 }), dial: required, solve, distanceM: R,
      scatter: { x: 0, y: 0 }, plates: [PLATE], bulletDiameterM: BULLET,
    });
    expect(res.impact.y).toBeCloseTo(P.y + 0.3, 2);
  });

  it('picks the nearest plate as the aimed plate', () => {
    const p2: ShotPlate = { instanceId: 9, position: { x: P.x + 0.5, y: P.y }, diameterM: 0.1524 };
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(P), dial: required, solve, distanceM: R,
      scatter: { x: 0, y: 0 }, plates: [PLATE, p2], bulletDiameterM: BULLET,
    });
    expect(res.aimedPlateId).toBe(7);
  });
});

// --- WASM behavioral: the Done-when through the app path ----------------------
describe('game/shot/resolveShot (behavioral, seeded engine)', () => {
  let module: BtkModule;
  let solveLoad: Load;
  const gameLoad = getGameLoad('65cm-140-match');
  beforeAll(async () => {
    module = await loadBtkModule();
    solveLoad = {
      ...gameLoad.load,
      spinRateRadPerSec: spinRateFromTwist(gameLoad.load.muzzleVelocityMps, gameLoad.twistM),
    };
  });

  for (const yd of [100, 300, 500]) {
    it(`zero wind + correct dial groups on center within 10% of the hit-sim @ ${yd} yd`, () => {
      const R = yd * 0.9144;
      const P = { x: 1.0, y: 0.6 };
      const plate: ShotPlate = { instanceId: 1, position: P, diameterM: 0.3 };
      const dirTo = (t: { x: number; y: number }) => {
        const v = { x: t.x, y: t.y - EYE.y, z: -R };
        const m = Math.hypot(v.x, v.y, v.z);
        return { x: v.x / m, y: v.y / m, z: v.z / m };
      };

      const table = solveTrajectory(module, solveLoad, ISA, { x: 0, y: 0, z: 0 }, {
        zeroRangeM: 100, maxRangeM: R, stepM: R,
      });
      const last = table[table.length - 1];
      const solve = { dropM: last.dropM, windageM: last.windageM };
      const dial = requiredCorrectionRad(solve.dropM, solve.windageM, R);

      seedRandom(module, 20260714);
      const sim = createScatterSimulator(module, gameLoad.load, gameLoad.dispersion, R, ISA, gameLoad.twistM);
      try {
        let sx = 0, sy = 0, sr2 = 0, hits = 0;
        const N = 50;
        for (let i = 0; i < N; i++) {
          const res = resolveShot({
            eye: EYE, aimDir: dirTo(P), dial, solve, distanceM: R,
            scatter: sim.fire(), plates: [plate], bulletDiameterM: gameLoad.load.diameterM,
          });
          const dx = res.impact.x - P.x;
          const dy = res.impact.y - P.y;
          sx += dx; sy += dy; sr2 += dx * dx + dy * dy;
          if (res.hitPlateId === 1) hits++;
        }
        // Group centers on target (correct dial + centered aim → offset ~0).
        expect(Math.hypot(sx / N, sy / N)).toBeLessThan(0.03);
        // Mean (RMS) radius matches the engine hit-sim's own reading within 10%.
        const rms = Math.sqrt(sr2 / N);
        expect(Math.abs(rms - sim.meanRadius()) / sim.meanRadius()).toBeLessThan(0.1);
        // A 0.3 m plate comfortably contains a match group at these ranges.
        expect(hits).toBe(N);
      } finally {
        sim.delete();
      }
    });
  }
});
