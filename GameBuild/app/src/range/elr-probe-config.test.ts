import { describe, it, expect } from 'vitest';
import {
  groundLocalYToDownrangeM,
  GROUND_LENGTH_M,
  targetCenterYFor,
  FRAME_GROUND_CLEARANCE_M,
  snapshotElrProbe,
  frameHalfDiagonalRad,
  angularSeparationDeg,
  sightLineY,
  slopeGroundY,
  groundYFor,
  eyeYFor,
  GONG_ANGULAR_SIZE_RAD,
  TARGET_CENTER_Y_M,
  SLOPE_RISE_M,
  SLOPE_SPAN_M,
  RING_FRACTIONS,
} from './elr-probe-config';
import { getRangeDefinition, cameraReachFor, DEFAULT_CAMERA_REACH } from './ranges';

const DEG = Math.PI / 180;

describe('elr-probe registry row', () => {
  it('is resolvable by id but stays off the landing screen', () => {
    const def = getRangeDefinition('elr-probe');
    expect(def.sceneType).toBe('elr-probe');
    expect(def.targetKind).toBe('steel');
    expect(def.zeroable).toBe(false);
  });

  it('carries the reach a 3 km world needs', () => {
    const reach = cameraReachFor(getRangeDefinition('elr-probe'));
    expect(reach.farM).toBeGreaterThanOrEqual(3100);
    expect(reach.nearM).toBeGreaterThanOrEqual(10);
  });

  it('leaves every other range on the shipped camera — the no-change guarantee', () => {
    for (const id of ['range-a', 'test-range', 'wooded-zero']) {
      expect(cameraReachFor(getRangeDefinition(id))).toEqual(DEFAULT_CAMERA_REACH);
    }
  });

  it('has six stations at 500 m steps out to 3000', () => {
    const s = getRangeDefinition('elr-probe').stations.map((x) => x.nominalDistance);
    expect(s).toEqual([500, 1000, 1500, 2000, 2500, 3000]);
  });
});

describe('snapshotElrProbe — Probe A (flat)', () => {
  const layout = snapshotElrProbe('flat');

  it('sizes gongs at exactly 1 MIL, so the diameter is the station number scaled', () => {
    for (const st of layout.stations) {
      expect(st.gongDiameterM).toBeCloseTo(st.losRangeM / 1000, 9);
      expect(st.gongDiameterM / st.losRangeM).toBeCloseTo(GONG_ANGULAR_SIZE_RAD, 12);
    }
    expect(layout.stations[layout.stations.length - 1].gongDiameterM).toBeCloseTo(3.0, 6);
  });

  it('solves ground run FROM line-of-sight range, never the other way round', () => {
    for (const st of layout.stations) {
      const dy = st.y - layout.eyeYM;
      expect(Math.hypot(st.groundRunM, dy)).toBeCloseTo(st.losRangeM, 6);
      expect(st.groundRunM).toBeLessThanOrEqual(st.losRangeM);
    }
  });

  it('places stations on the fan, monotonically left to right', () => {
    const az = layout.stations.map((s) => s.azimuthDeg);
    for (let i = 1; i < az.length; i++) expect(az[i]).toBeGreaterThan(az[i - 1]);
    expect(az[0]).toBeCloseTo(-1.5, 6);
    expect(az[az.length - 1]).toBeCloseTo(1.5, 6);
  });

  it('clears occlusion on every pair — the fan exists for exactly this', () => {
    const st = layout.stations;
    let worst = Infinity;
    for (let i = 0; i < st.length; i++) {
      for (let j = i + 1; j < st.length; j++) {
        const need = (frameHalfDiagonalRad(st[i]) + frameHalfDiagonalRad(st[j])) / DEG;
        worst = Math.min(worst, angularSeparationDeg(st[i], st[j]) - need);
      }
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeCloseTo(0.457, 2);
  });

  // The finding that justifies the fan: without it the range cannot see its own
  // far end, and that would read on device as a rendering bug.
  it('WOULD self-occlude on a straight lane — the reason the fan is not optional', () => {
    const st = layout.stations;
    const far = st[st.length - 1];
    const near = st[st.length - 2];
    const sightAtNear = sightLineY({ ...layout, stations: st }, far, near.groundRunM);
    const nearTopEdge = near.y + near.gongDiameterM / 2;
    expect(sightAtNear).toBeLessThan(nearTopEdge); // blocked, with azimuth removed
  });

  // Targets are constant-ANGULAR, so their frames grow with distance. Pinning every
  // centre at 1.0 m buried the far ones — the 3000 m panel's bottom edge sat 2 m
  // underground. The centre is now whatever stands the frame clear of the dirt.
  it('stands every frame clear of the ground, near and far', () => {
    for (const st of layout.stations) {
      const bottom = st.y - st.frameHeightM / 2;
      expect(bottom).toBeGreaterThanOrEqual(FRAME_GROUND_CLEARANCE_M - 1e-9);
    }
  });

  it('keeps small near targets at the standard height, and raises only the big ones', () => {
    const near = layout.stations[0]; // 500 m, 0.5 m gong -> 1.0 m frame, fits at 1.0
    expect(near.y).toBeCloseTo(TARGET_CENTER_Y_M, 9);
    const far = layout.stations[layout.stations.length - 1]; // 3000 m, 6 m frame
    expect(far.y).toBeCloseTo(3.0 + FRAME_GROUND_CLEARANCE_M, 9);
  });

  it('targetCenterYFor never returns less than the standard height', () => {
    for (const d of [0.01, 0.5, 1, 2, 3, 10]) {
      expect(targetCenterYFor(d)).toBeGreaterThanOrEqual(TARGET_CENTER_Y_M);
    }
  });
});

describe('snapshotElrProbe — Probe B (convex slope)', () => {
  const layout = snapshotElrProbe('slope');

  it('puts every station on a single straight lane', () => {
    for (const st of layout.stations) expect(st.azimuthDeg).toBe(0);
  });

  it('still clears occlusion, on elevation alone', () => {
    const st = layout.stations;
    let worst = Infinity;
    for (let i = 0; i < st.length; i++) {
      for (let j = i + 1; j < st.length; j++) {
        const need = (frameHalfDiagonalRad(st[i]) + frameHalfDiagonalRad(st[j])) / DEG;
        worst = Math.min(worst, angularSeparationDeg(st[i], st[j]) - need);
      }
    }
    expect(worst).toBeGreaterThan(0);
    expect(worst).toBeCloseTo(0.532, 2);
  });

  // THE load-bearing property. A linear slope gives ~0.041 deg of separation no
  // matter how high the hill goes, because every target on a straight line through
  // space subtends nearly the same elevation angle from a fixed eye.
  it('a LINEAR slope would fail — this is why the profile is convex', () => {
    const eyeY = eyeYFor('slope');
    const linear = (r: number) => SLOPE_RISE_M * (r / SLOPE_SPAN_M);
    const angles = [500, 1000, 1500, 2000, 2500, 3000].map(
      (d) => Math.asin((linear(d) + TARGET_CENTER_Y_M - eyeY) / d) / DEG,
    );
    let worstSep = Infinity;
    for (let i = 0; i < angles.length; i++)
      for (let j = i + 1; j < angles.length; j++)
        worstSep = Math.min(worstSep, Math.abs(angles[i] - angles[j]));
    const need = (2 * Math.hypot(1.5e-3 / 2, 2.0e-3 / 2)) / DEG;
    expect(worstSep).toBeLessThan(need); // linear does NOT clear
    expect(worstSep).toBeCloseTo(0.041, 2);
  });

  it('raising a LINEAR hill does not help — the effect is a ratio', () => {
    const worstFor = (rise: number) => {
      const eyeY = eyeYFor('slope');
      const angles = [500, 1000, 1500, 2000, 2500, 3000].map(
        (d) => Math.asin((rise * (d / SLOPE_SPAN_M) + TARGET_CENTER_Y_M - eyeY) / d) / DEG,
      );
      let w = Infinity;
      for (let i = 0; i < angles.length; i++)
        for (let j = i + 1; j < angles.length; j++) w = Math.min(w, Math.abs(angles[i] - angles[j]));
      return w;
    };
    expect(worstFor(50)).toBeCloseTo(worstFor(300), 2); // 6x the hill, same separation
  });

  it('the convex profile is convex — the chord lies above the curve', () => {
    // This is what guarantees sight-line clearance without a per-station proof.
    for (const [a, b] of [
      [0, 3000],
      [500, 2500],
      [1000, 3000],
    ]) {
      const mid = (a + b) / 2;
      const chord = (slopeGroundY(a) + slopeGroundY(b)) / 2;
      expect(slopeGroundY(mid)).toBeLessThan(chord);
    }
  });

  it('no intervening ground rises into the sight line to the far station', () => {
    const far = layout.stations[layout.stations.length - 1];
    for (let r = 10; r < far.groundRunM; r += 10) {
      expect(sightLineY(layout, far, r)).toBeGreaterThan(groundYFor('slope', r));
    }
  });

  it('spreads the near station downhill and the far one uphill', () => {
    expect(layout.stations[0].elevationDeg).toBeLessThan(0);
    expect(layout.stations[layout.stations.length - 1].elevationDeg).toBeGreaterThan(3);
  });

  it('reaches the intended rise at the far end', () => {
    expect(slopeGroundY(SLOPE_SPAN_M)).toBeCloseTo(SLOPE_RISE_M, 6);
    expect(slopeGroundY(0)).toBe(0);
  });
});

describe('bullseye ring fractions', () => {
  it('are 1 / 2 / 3 MOA as thirds of the plate', () => {
    expect(RING_FRACTIONS.centre).toBeCloseTo(1 / 3, 9);
    expect(RING_FRACTIONS.middle).toBeCloseTo(2 / 3, 9);
    expect(RING_FRACTIONS.outer).toBe(1);
  });

  it('are constant-angular, so the pattern looks identical at every station', () => {
    const layout = snapshotElrProbe('flat');
    const subtense = layout.stations.map(
      (s) => (s.gongDiameterM * RING_FRACTIONS.centre) / s.losRangeM,
    );
    for (const v of subtense) expect(v).toBeCloseTo(subtense[0], 12);
  });
});


// Owner, on device 2026-07-27: "the ground and the targets need to meet." They did
// not, because the terrain plane's local-y → downrange mapping was wrong.
describe('terrain plane mapping — the ground has to meet the targets', () => {
  it('maps the plane ends to the shooter and the far end, not to a valley', () => {
    const half = GROUND_LENGTH_M / 2;
    expect(groundLocalYToDownrangeM(-half, GROUND_LENGTH_M)).toBeCloseTo(0, 9);
    expect(groundLocalYToDownrangeM(0, GROUND_LENGTH_M)).toBeCloseTo(half, 9);
    expect(groundLocalYToDownrangeM(half, GROUND_LENGTH_M)).toBeCloseTo(GROUND_LENGTH_M, 9);
  });

  it('is monotonic — downrange must never fold back on itself', () => {
    let prev = -Infinity;
    for (let ly = -GROUND_LENGTH_M / 2; ly <= GROUND_LENGTH_M / 2; ly += 50) {
      const r = groundLocalYToDownrangeM(ly, GROUND_LENGTH_M);
      expect(r).toBeGreaterThan(prev);
      prev = r;
    }
  });

  // THE REGRESSION. The old expression collapsed to |localY|, giving a V-shaped
  // valley 53 m high at the shooter — which buried the 11.7 m camera 41 m
  // underground and left the targets floating above a narrow band of terrain.
  it('puts NO hill where the shooter stands', () => {
    const half = GROUND_LENGTH_M / 2;
    const atShooter = groundYFor('slope', groundLocalYToDownrangeM(-half, GROUND_LENGTH_M));
    expect(atShooter).toBeCloseTo(0, 6);
    expect(atShooter).toBeLessThan(eyeYFor('slope')); // i.e. not buried
    // The old formula: |localY| = half → this is what it used to produce.
    expect(groundYFor('slope', Math.abs(-half))).toBeGreaterThan(50);
  });

  it('every station sits ON the terrain, both variants', () => {
    for (const variant of ['flat', 'slope'] as const) {
      for (const st of snapshotElrProbe(variant).stations) {
        const groundHere = groundYFor(variant, st.groundRunM);
        // The centre sits at exactly the height the sizing rule asks for, measured
        // from the terrain directly beneath it — not from y = 0, and not from the
        // ground at some other distance.
        expect(st.y - groundHere).toBeCloseTo(targetCenterYFor(st.gongDiameterM), 1);
        // And the frame's bottom edge is above that terrain, not in it.
        expect(st.y - st.frameHeightM / 2 - groundHere).toBeGreaterThan(0);
      }
    }
  });

  it('the terrain under each station matches the height the station was placed at', () => {
    for (const st of snapshotElrProbe('slope').stations) {
      // Find the plane's local y for this station and check the displaced height.
      const localY = st.groundRunM - GROUND_LENGTH_M / 2;
      const terrainHere = groundYFor('slope', groundLocalYToDownrangeM(localY, GROUND_LENGTH_M));
      expect(terrainHere).toBeCloseTo(groundYFor('slope', st.groundRunM), 6);
      expect(st.y).toBeGreaterThan(terrainHere); // target above ground, not inside it
    }
  });
});
