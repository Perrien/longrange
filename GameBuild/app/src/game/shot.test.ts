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

// --- D6 zero-error math (task 2.3b) -------------------------------------------
describe('game/shot/resolveShot zero-error math (D6)', () => {
  const BULLET = 0.0067056;
  const zeroOffset = { h: milToRad(0.3), v: milToRad(0.5) }; // hidden bore/scope misalignment

  // At the zero distance the trajectory is on the line of sight (drop=windage=0).
  const Rzero = 91.44; // 100 yd
  const zeroSolve = { dropM: 0, windageM: 0 };
  const Pz = { x: 0, y: 0.6 };
  // A huge plate so the disc hit-test never gates these impact-position checks.
  const bigPlate: ShotPlate = { instanceId: 1, position: { x: 0, y: 0.6 }, diameterM: 4.0 };

  const dirTo = (t: { x: number; y: number }, R: number) => {
    const v = { x: t.x - EYE.x, y: t.y - EYE.y, z: -R - EYE.z };
    const m = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / m, y: v.y / m, z: v.z / m };
  };

  it('fresh rifle (playerZero=0, zeroOffset≠0) lands off by −R·tan(zeroOffset) at the zero target', () => {
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(Pz, Rzero), dial: { elevRad: 0, windRad: 0 }, solve: zeroSolve,
      distanceM: Rzero, scatter: { x: 0, y: 0 }, plates: [bigPlate], bulletDiameterM: BULLET,
      zeroOffsetRad: zeroOffset, // no playerZero → defaults to 0
    });
    expect(res.impact.x - Pz.x).toBeCloseTo(-Rzero * Math.tan(zeroOffset.h), 9);
    expect(res.impact.y - Pz.y).toBeCloseTo(-Rzero * Math.tan(zeroOffset.v), 9);
  });

  it('dialing playerZero = zeroOffset centers the shot at the zero target', () => {
    const res = resolveShot({
      eye: EYE, aimDir: dirTo(Pz, Rzero), dial: { elevRad: 0, windRad: 0 }, solve: zeroSolve,
      distanceM: Rzero, scatter: { x: 0, y: 0 }, plates: [bigPlate], bulletDiameterM: BULLET,
      zeroOffsetRad: zeroOffset,
      playerZero: { elevationRad: zeroOffset.v, windageRad: zeroOffset.h },
    });
    expect(res.impact.x).toBeCloseTo(Pz.x, 9);
    expect(res.impact.y).toBeCloseTo(Pz.y, 9);
  });

  it('once zeroed, the bore offset cancels at a far range — residual miss is the believed-vs-true DOPE gap', () => {
    const Rfar = 457.2; // 500 yd
    const P = { x: 0, y: 0.6 };
    const trueSolve = { dropM: -3.0, windageM: 0.2 };
    const believedSolve = { dropM: -2.7, windageM: 0.18 }; // optimistic box come-up (less drop)
    // The player dials their believed DOPE; the shot flies the TRUE trajectory.
    const dial = requiredCorrectionRad(believedSolve.dropM, believedSolve.windageM, Rfar);
    const playerZero = { elevationRad: zeroOffset.v, windageRad: zeroOffset.h }; // confirmed at the zero target

    const fire = (zo: { h: number; v: number }, pz: { elevationRad: number; windageRad: number }) =>
      resolveShot({
        eye: EYE, aimDir: dirTo(P, Rfar), dial, solve: trueSolve, distanceM: Rfar,
        scatter: { x: 0, y: 0 }, plates: [bigPlate], bulletDiameterM: BULLET,
        zeroOffsetRad: zo, playerZero: pz,
      });

    const zeroed = fire(zeroOffset, playerZero);
    const noOffset = fire({ h: 0, v: 0 }, { elevationRad: 0, windageRad: 0 });

    // The bore offset cancels: a zeroed rifle impacts the same as one with no
    // offset and no zero (agreement well under 0.1 mm at 500 yd — the only
    // residual is the second-order tan nonlinearity).
    expect(zeroed.impact.x).toBeCloseTo(noOffset.impact.x, 4);
    expect(zeroed.impact.y).toBeCloseTo(noOffset.impact.y, 4);

    // The residual miss is purely the believed-vs-true gap: dialing an optimistic
    // (too-little) come-up lands the group low.
    const gapY =
      Rfar *
      (Math.tan(requiredCorrectionRad(believedSolve.dropM, 0, Rfar).elevRad) -
        Math.tan(requiredCorrectionRad(trueSolve.dropM, 0, Rfar).elevRad));
    expect(zeroed.impact.y - P.y).toBeCloseTo(gapY, 4);
    expect(zeroed.impact.y).toBeLessThan(P.y); // came up short → low
  });

  it('confirming a zero must not move the group: (dial=d, playerZero=P) ≡ (dial=0, playerZero=P+d)', () => {
    // The re-confirm invariant behind the 2026-07-19 bug: Confirm composes the
    // touch-up dial into the stored zero and resets the turret; because applied
    // = aim + dial + playerZero, the impact must be IDENTICAL before and after.
    const P = { elevationRad: milToRad(0.6), windageRad: milToRad(-0.2) }; // stored zero
    const d = { elevRad: milToRad(0.1), windRad: milToRad(0.1) }; // touch-up on the turret
    const common = {
      eye: EYE, aimDir: dirTo(Pz, Rzero), solve: zeroSolve, distanceM: Rzero,
      scatter: { x: 0, y: 0 }, plates: [bigPlate], bulletDiameterM: BULLET,
      zeroOffsetRad: zeroOffset,
    };
    const before = resolveShot({ ...common, dial: d, playerZero: P });
    const after = resolveShot({
      ...common,
      dial: { elevRad: 0, windRad: 0 },
      playerZero: { elevationRad: P.elevationRad + d.elevRad, windageRad: P.windageRad + d.windRad },
    });
    expect(after.impact.x).toBeCloseTo(before.impact.x, 12);
    expect(after.impact.y).toBeCloseTo(before.impact.y, 12);
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
