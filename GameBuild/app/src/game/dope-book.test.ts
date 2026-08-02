// Task 2.4a unit tests — the pure DOPE-book model + rules. No engine, no store,
// no browser. The confidence rule's constants are provisional (D3), so these
// tests pin the SHAPE (monotonic in SD and range, match < bulk, clamp bounds)
// and the exact node/ladder mechanics — never a magic N value.

import { describe, expect, it } from 'vitest';
import {
  believedVerticalSdRad,
  requiredShots,
  confidenceTier,
  upsertNode,
  removeNode,
  pruneNodesForRifle,
  pruneNodesForLot,
  ladderStationsM,
  comeUpStationsM,
  TOL_RAD,
  type DopeNode,
} from './dope-book';
import { lotRangesForSpec, rifleRangesForSpec, believedLoadForSpec } from './catalog';
import { cartridgeParams, specFromPreset, type RifleSpec } from './spec';
import { yardsToMeters } from '../units';

const c65 = cartridgeParams('65cm');
const RIFLE_SPEC_65CM: RifleSpec = { cartridgeId: '65cm', barrelLengthIn: c65.referenceBarrelIn, twistIn: c65.twistOptionsInPerTurn[0] };
const LOAD_SPEC_65CM_MATCH = specFromPreset('65cm-match');
const LOAD_SPEC_65CM_BULK = specFromPreset('65cm-bulk');

/** Build a DopeNode with sensible defaults; override what a test cares about. */
const node = (partial: Partial<DopeNode> = {}): DopeNode => ({
  rifleId: 'rifle-1',
  lotId: 'lot-1',
  distanceM: yardsToMeters(300),
  elevationRad: 0.003,
  windageRad: 0,
  zeroRangeM: yardsToMeters(100),
  shots: 3,
  hits: 3,
  conditions: { windSpeedMps: 0, windDirectionDeg: 0, tempC: 15, pressurePa: 101325 },
  confirmedAtIso: '2026-07-24T00:00:00.000Z',
  ...partial,
});

describe('believedVerticalSdRad (D3 analytic σ_v)', () => {
  const mv = 826;
  const mvSd = 3.66;
  const inherent = 0.0001;

  it('increases monotonically with range', () => {
    let prev = -Infinity;
    for (const R of [100, 300, 500, 800, 1000, 1500]) {
      const s = believedVerticalSdRad(R, mv, mvSd, inherent);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('increases monotonically with per-shot MV SD', () => {
    let prev = -Infinity;
    for (const sd of [1, 2, 4, 8]) {
      const s = believedVerticalSdRad(500, mv, sd, inherent);
      expect(s).toBeGreaterThan(prev);
      prev = s;
    }
  });

  it('is never below the inherent-precision floor (quadrature)', () => {
    // At zero range the velocity term vanishes; σ_v collapses to inherent.
    expect(believedVerticalSdRad(0, mv, mvSd, inherent)).toBeCloseTo(inherent, 12);
    expect(believedVerticalSdRad(500, mv, mvSd, inherent)).toBeGreaterThanOrEqual(inherent);
  });
});

describe('requiredShots (N rule, D3)', () => {
  it('floors at 3 for a tiny spread', () => {
    expect(requiredShots(TOL_RAD * 0.01)).toBe(3);
  });

  it('caps at 10 for a huge spread', () => {
    expect(requiredShots(TOL_RAD * 100)).toBe(10);
  });

  it('is non-decreasing in σ_v', () => {
    let prev = -Infinity;
    for (const k of [0.1, 1, 1.5, 2, 2.5, 3, 5, 20]) {
      const n = requiredShots(TOL_RAD * k);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });

  it('follows the clamp(ceil((σ/tol)²), 3, 10) form in the interior', () => {
    // σ/tol = 2.1 → ceil(4.41) = 5 (between the floor and ceiling).
    expect(requiredShots(TOL_RAD * 2.1)).toBe(5);
  });

  it('is non-decreasing in range (via σ_v growing with R)', () => {
    let prev = -Infinity;
    for (const R of [100, 300, 500, 800, 1000, 1500]) {
      const n = requiredShots(believedVerticalSdRad(R, 810, 5.49, 0.00029));
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

describe('match < bulk at every range (catalog-believed values)', () => {
  const matchMv = believedLoadForSpec(LOAD_SPEC_65CM_MATCH).muzzleVelocityMps;
  const bulkMv = believedLoadForSpec(LOAD_SPEC_65CM_BULK).muzzleVelocityMps;
  const matchSd = lotRangesForSpec(LOAD_SPEC_65CM_MATCH).mvSd.nominal;
  const bulkSd = lotRangesForSpec(LOAD_SPEC_65CM_BULK).mvSd.nominal;
  // Hold the rifle's inherent precision equal so the comparison isolates the
  // ammo grade's per-shot MV SD (the honest "match vs bulk" axis).
  const inherent = rifleRangesForSpec(RIFLE_SPEC_65CM).inherentPrecision.nominal;

  it('match σ_v < bulk σ_v and N_match ≤ N_bulk across the ladder', () => {
    for (const R of [100, 300, 500, 800, 1000]) {
      const sMatch = believedVerticalSdRad(R, matchMv, matchSd, inherent);
      const sBulk = believedVerticalSdRad(R, bulkMv, bulkSd, inherent);
      expect(sMatch).toBeLessThan(sBulk);
      expect(requiredShots(sMatch)).toBeLessThanOrEqual(requiredShots(sBulk));
    }
  });
});

describe('confidenceTier (D3 tiers)', () => {
  // σ/tol = 2.1 → N = 5 (from the requiredShots test above).
  const sigmaV = TOL_RAD * 2.1;

  it('is "noted" when the plate was never hit (hits < 1), whatever the shot count', () => {
    expect(confidenceTier(node({ shots: 8, hits: 0 }), sigmaV)).toBe('noted');
  });

  it('is "provisional" below the shot-count threshold', () => {
    expect(confidenceTier(node({ shots: 4, hits: 4 }), sigmaV)).toBe('provisional');
  });

  it('is "confirmed" at or above the threshold', () => {
    expect(confidenceTier(node({ shots: 5, hits: 5 }), sigmaV)).toBe('confirmed');
    expect(confidenceTier(node({ shots: 9, hits: 5 }), sigmaV)).toBe('confirmed');
  });
});

describe('upsertNode / removeNode (replace-by-station, D5)', () => {
  it('replaces the node at the same rifle+lot+station (latest wins), length unchanged', () => {
    const a = node({ distanceM: yardsToMeters(300), elevationRad: 0.003 });
    const b = node({ distanceM: yardsToMeters(300), elevationRad: 0.005 });
    const out = upsertNode([a], b);
    expect(out).toHaveLength(1);
    expect(out[0].elevationRad).toBe(0.005);
  });

  it('matches the station within the SI epsilon (a re-confirm at the same yd value replaces)', () => {
    const a = node({ distanceM: yardsToMeters(200) });
    const b = node({ distanceM: yardsToMeters(200) + 0.3, elevationRad: 0.009 }); // <0.5 m
    const out = upsertNode([a], b);
    expect(out).toHaveLength(1);
    expect(out[0].elevationRad).toBe(0.009);
  });

  it('appends a distinct station rather than replacing', () => {
    const a = node({ distanceM: yardsToMeters(300) });
    const b = node({ distanceM: yardsToMeters(500) });
    expect(upsertNode([a], b)).toHaveLength(2);
  });

  it('does not cross rifle/lot pairings', () => {
    const a = node({ rifleId: 'r1', lotId: 'l1', distanceM: yardsToMeters(300) });
    const b = node({ rifleId: 'r2', lotId: 'l1', distanceM: yardsToMeters(300) });
    const c = node({ rifleId: 'r1', lotId: 'l2', distanceM: yardsToMeters(300) });
    let book = upsertNode([], a);
    book = upsertNode(book, b);
    book = upsertNode(book, c);
    expect(book).toHaveLength(3); // same distance, three different pairings
  });

  it('removeNode drops only the matching station', () => {
    const a = node({ distanceM: yardsToMeters(300) });
    const b = node({ distanceM: yardsToMeters(500) });
    const out = removeNode([a, b], 'rifle-1', 'lot-1', yardsToMeters(300));
    expect(out).toHaveLength(1);
    expect(out[0].distanceM).toBeCloseTo(yardsToMeters(500), 9);
  });

  it('is pure — the input array is never mutated', () => {
    const src = [node({ distanceM: yardsToMeters(300) })];
    upsertNode(src, node({ distanceM: yardsToMeters(300), elevationRad: 0.01 }));
    expect(src).toHaveLength(1);
    expect(src[0].elevationRad).toBe(0.003);
  });
});

describe('pruneNodesForRifle / pruneNodesForLot (cascade)', () => {
  const nodes = [
    node({ rifleId: 'r1', lotId: 'l1' }),
    node({ rifleId: 'r1', lotId: 'l2', distanceM: yardsToMeters(500) }),
    node({ rifleId: 'r2', lotId: 'l1', distanceM: yardsToMeters(400) }),
  ];

  it('prunes every node for a rifle', () => {
    const out = pruneNodesForRifle(nodes, 'r1');
    expect(out).toHaveLength(1);
    expect(out[0].rifleId).toBe('r2');
  });

  it('prunes every node for a lot', () => {
    const out = pruneNodesForLot(nodes, 'l1');
    expect(out.map((n) => n.lotId)).toEqual(['l2']);
  });
});

describe('ladderStationsM (D7)', () => {
  it('rimfire MOA (.22 LR, 200 yd) is the finer set, capped at 200 yd', () => {
    const out = ladderStationsM(true, 'MOA', 200);
    expect(out).toHaveLength(7); // 25,50,75,100,125,150,200 yd
    expect(out[out.length - 1]).toBeCloseTo(yardsToMeters(200), 9);
    for (const s of out) expect(s).toBeLessThanOrEqual(yardsToMeters(200) + 1e-9);
  });

  it('rimfire MIL caps at the metric equivalent (200 yd ≈ 183 m, so the 200 m step is dropped)', () => {
    const out = ladderStationsM(true, 'MIL', 200);
    expect(out).toEqual([25, 50, 75, 100, 125, 150]); // meters; 200 m > 182.88 m cap
  });

  it('centrefire MOA (.308, 1000 yd) climbs by centuries to 1000 yd', () => {
    const out = ladderStationsM(false, 'MOA', 1000);
    expect(out).toHaveLength(10);
    expect(out[0]).toBeCloseTo(yardsToMeters(100), 9);
    expect(out[9]).toBeCloseTo(yardsToMeters(1000), 9);
  });

  it('centrefire MIL (.308, 1000 yd) caps at 900 m (1000 yd ≈ 914 m)', () => {
    const out = ladderStationsM(false, 'MIL', 1000);
    expect(out).toEqual([100, 200, 300, 400, 500, 600, 700, 800, 900]);
  });

  it('centrefire MIL (6.5 CM, 1200 yd ≈ 1097 m) reaches 1000 m but not 1100', () => {
    const out = ladderStationsM(false, 'MIL', 1200);
    expect(out[out.length - 1]).toBe(1000);
    expect(out).not.toContain(1100);
  });

  it('never places a station beyond the effective range', () => {
    for (const [rim, units, eff] of [
      [true, 'MOA', 200],
      [false, 'MOA', 600],
      [false, 'MIL', 1000],
    ] as const) {
      // Effective range is always authored in yd, so its true value in meters is
      // yardsToMeters(eff) regardless of the display unit the ladder was read in.
      const capM = yardsToMeters(eff);
      for (const s of ladderStationsM(rim, units, eff)) {
        expect(s).toBeLessThanOrEqual(capM + 1e-9);
      }
    }
  });
});

describe('comeUpStationsM (come-up reference table, past effective range)', () => {
  it('its in-range portion is exactly the shootable ladder', () => {
    const inRange = comeUpStationsM(false, 'MOA', 1000, 2000)
      .filter((s) => !s.beyondEffective)
      .map((s) => s.stationM);
    expect(inRange).toEqual(ladderStationsM(false, 'MOA', 1000));
  });

  it('continues past effective range up to the hard max, tagged beyondEffective', () => {
    const st = comeUpStationsM(false, 'MOA', 1000, 2000);
    const beyond = st.filter((s) => s.beyondEffective).map((s) => s.stationM);
    expect(beyond[0]).toBeCloseTo(yardsToMeters(1100), 6); // first station past 1000 yd
    expect(st[st.length - 1].stationM).toBeCloseTo(yardsToMeters(2000), 6); // to the hard max
    // every beyond station is strictly past the effective range
    for (const m of beyond) expect(m).toBeGreaterThan(yardsToMeters(1000) + 1e-9);
  });

  it('honours the MIL station-unit cap for beyondEffective (.223: 500 m in-range, 600 m beyond)', () => {
    const st = comeUpStationsM(false, 'MIL', 600, 1200);
    const at500 = st.find((s) => Math.abs(s.stationM - 500) < 1e-6);
    const at600 = st.find((s) => Math.abs(s.stationM - 600) < 1e-6);
    expect(at500?.beyondEffective).toBe(false); // 500 m ≤ yardsToMeters(600)=548.6
    expect(at600?.beyondEffective).toBe(true); // 600 m > 548.6
  });
});
