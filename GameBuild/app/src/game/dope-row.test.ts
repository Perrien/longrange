import { describe, expect, it } from 'vitest';
import { angleAtRange, formatDopeRow, transonicBand, machStateLabel, assembleComeUp } from './dope-row';
import { metersToYards, metersToCentimeters, metersToInches, mpsToFps, milToRad, joulesToFootPounds } from '../units';
import type { TrajectoryRow } from '../engine-bridge/types';

const row = (partial: Partial<TrajectoryRow>): TrajectoryRow => ({
  rangeM: 300,
  dropM: 0,
  windageM: 0,
  velocityMps: 700,
  timeOfFlightS: 0.5,
  energyJ: 1000,
  ...partial,
});

describe('angleAtRange (task 1.6d)', () => {
  it('1 m offset at 1000 m ≈ 1 mil (mil-relation sanity, matches state.test.ts)', () => {
    expect(angleAtRange(1, 1000)).toBeCloseTo(milToRad(1), 6);
  });

  it('is exact atan2, not the linearized approximation, at close range', () => {
    // At 10 m with a 1 m offset the small-angle approximation (0.1 rad) already
    // diverges from atan2 by a measurable amount — confirm we use the exact form.
    const exact = Math.atan2(1, 10);
    expect(angleAtRange(1, 10)).toBeCloseTo(exact, 12);
    expect(angleAtRange(1, 10)).not.toBeCloseTo(0.1, 4);
  });
});

describe('formatDopeRow (task 1.6d)', () => {
  it('a zero-offset row (at the zero range) has zero come-up and wind hold', () => {
    const out = formatDopeRow(row({ rangeM: 300, dropM: 0, windageM: 0 }));
    expect(out.dropMilMoa.mil).toBe(0);
    expect(out.dropMilMoa.moa).toBe(0);
    expect(out.windMilMoa.mil).toBe(0);
    expect(out.rangeYd).toBeCloseTo(metersToYards(300), 9);
  });

  it('converts drop/windage into dual-unit linear + angular fields', () => {
    const out = formatDopeRow(row({ rangeM: 1000, dropM: -1, windageM: 0.5, velocityMps: 800 }));
    expect(out.dropCm).toBeCloseTo(metersToCentimeters(-1), 9);
    expect(out.dropIn).toBeCloseTo(metersToInches(-1), 9);
    expect(out.dropMilMoa.mil).toBeCloseTo(-1, 2); // ~1 mil for 1 m @ 1000 m
    expect(out.windCm).toBeCloseTo(metersToCentimeters(0.5), 9);
    expect(out.windIn).toBeCloseTo(metersToInches(0.5), 9);
    expect(out.windMilMoa.mil).toBeCloseTo(0.5, 2);
    expect(out.velocityFps).toBeCloseTo(mpsToFps(800), 9);
  });

  it('two independent calls on the same row produce identical rows (deterministic, no hidden state)', () => {
    const r = row({ rangeM: 500, dropM: -2.3, windageM: 0.8, velocityMps: 650 });
    expect(formatDopeRow(r)).toEqual(formatDopeRow(r));
  });

  it('exposes kinetic energy in both unit systems from the engine row', () => {
    const out = formatDopeRow(row({ energyJ: 2000 }));
    expect(out.energyJ).toBe(2000);
    expect(out.energyFtLb).toBeCloseTo(joulesToFootPounds(2000), 9);
  });

  it('omits Mach/transonic without a speed of sound, and classifies with one', () => {
    const bare = formatDopeRow(row({ velocityMps: 400 }));
    expect(bare.machNumber).toBeUndefined();
    expect(bare.transonic).toBeUndefined();

    // a = 340.3 m/s: 400 → Mach ~1.18 (transonic), 800 → ~2.35 (supersonic),
    // 300 → ~0.88 (subsonic).
    const a = 340.3;
    expect(formatDopeRow(row({ velocityMps: 800 }), { speedOfSoundMps: a }).transonic).toBe('supersonic');
    expect(formatDopeRow(row({ velocityMps: 400 }), { speedOfSoundMps: a }).transonic).toBe('transonic');
    const sub = formatDopeRow(row({ velocityMps: 300 }), { speedOfSoundMps: a });
    expect(sub.transonic).toBe('subsonic');
    expect(sub.machNumber).toBeCloseTo(300 / a, 9);
  });
});

describe('transonicBand (task DOPE page 2)', () => {
  it('bands on the Mach 1.0 / 1.2 thresholds (supersonic > 1.2, subsonic ≤ 1.0)', () => {
    expect(transonicBand(2.0)).toBe('supersonic');
    expect(transonicBand(1.21)).toBe('supersonic');
    expect(transonicBand(1.2)).toBe('transonic'); // onset is inclusive of transonic
    expect(transonicBand(1.05)).toBe('transonic');
    expect(transonicBand(1.0)).toBe('subsonic'); // at/below the speed of sound
    expect(transonicBand(0.8)).toBe('subsonic');
  });
});

describe('assembleComeUp (extend past effective range, trim at subsonic)', () => {
  const a = 340; // speed of sound m/s
  // A decelerating table: supersonic → transonic → subsonic across the stations.
  const table = [
    row({ rangeM: 100, velocityMps: 800 }), // M2.35 super
    row({ rangeM: 200, velocityMps: 700 }), // M2.06 super
    row({ rangeM: 300, velocityMps: 410 }), // M1.21 super (just above onset)
    row({ rangeM: 400, velocityMps: 400 }), // M1.18 transonic
    row({ rangeM: 500, velocityMps: 330 }), // M0.97 subsonic
    row({ rangeM: 600, velocityMps: 300 }), // M0.88 subsonic
  ];
  const stations = [
    { stationM: 100, beyondEffective: false },
    { stationM: 200, beyondEffective: false },
    { stationM: 300, beyondEffective: true },
    { stationM: 400, beyondEffective: true },
    { stationM: 500, beyondEffective: true },
    { stationM: 600, beyondEffective: true },
  ];

  it('stops one row past the subsonic transition (includes the first subsonic row)', () => {
    const out = assembleComeUp(table, stations, { speedOfSoundMps: a });
    expect(out.map((r) => r.rangeM)).toEqual([100, 200, 300, 400, 500]); // 600 dropped
    expect(out[out.length - 1].transonic).toBe('subsonic');
  });

  it('carries the beyondEffective flag through', () => {
    const out = assembleComeUp(table, stations, { speedOfSoundMps: a });
    expect(out[1].beyondEffective).toBe(false); // 200
    expect(out[2].beyondEffective).toBe(true); // 300
  });

  it('without a speed of sound, nothing is subsonic so no trim happens', () => {
    const out = assembleComeUp(table, stations, {});
    expect(out).toHaveLength(6);
    expect(out.every((r) => r.transonic === undefined)).toBe(true);
  });

  it('skips stations with no nearby solved row', () => {
    const out = assembleComeUp(table, [{ stationM: 100, beyondEffective: false }, { stationM: 12345, beyondEffective: true }], {
      speedOfSoundMps: a,
    });
    expect(out.map((r) => r.rangeM)).toEqual([100]);
  });
});

// The interim policy while transonic dispersion is unmodelled (owner 2026-07-29):
// nothing is gated, so the DOPE card carries the honesty burden. These pin the
// classification the card's colouring and its footnote both key off.
describe('transonicBand — what the DOPE card warns on', () => {
  it('splits at 1.2 and 1.0, with the boundaries in the lower band', () => {
    expect(transonicBand(2.5)).toBe('supersonic');
    expect(transonicBand(1.21)).toBe('supersonic');
    expect(transonicBand(1.2)).toBe('transonic');
    expect(transonicBand(1.01)).toBe('transonic');
    expect(transonicBand(1.0)).toBe('subsonic');
    expect(transonicBand(0.8)).toBe('subsonic');
  });

  // 1.2 rather than 1.0 because the trouble starts while still supersonic —
  // the same threshold that sizes the ELR range's 2000 m cap.
  it('warns while the bullet is still above the speed of sound', () => {
    expect(transonicBand(1.15)).not.toBe('supersonic');
  });

  it('flags every band the card colours as non-supersonic', () => {
    const flagged = [1.2, 1.1, 1.0, 0.9].map(transonicBand);
    for (const b of flagged) expect(b).not.toBe('supersonic');
  });
});

// ELR build spec task 10. Tested as a PURE FUNCTION, per the spec — the UI only
// picks a colour from the returned string.
describe('machStateLabel — Mach-state marking for a committed target', () => {
  it('says nothing at all when the round arrives supersonic', () => {
    for (const m of [3.0, 2.0, 1.5, 1.25, 1.21]) {
      expect(machStateLabel(m)).toBeNull();
    }
  });

  it('marks the transonic band', () => {
    for (const m of [1.2, 1.15, 1.05, 1.001]) {
      expect(machStateLabel(m)).toBe('TRANSONIC');
    }
  });

  it('marks subsonic, and names the consequence that IS modelled', () => {
    for (const m of [1.0, 0.95, 0.7]) {
      expect(machStateLabel(m)).toBe('SUBSONIC — past effective range');
    }
  });

  // LOAD-BEARING (spec task 10 step 3, gap N4). The drag rise through Mach 1 is
  // modelled; the group opening is NOT. Any label promising wider groups would
  // describe physics the engine does not simulate, so the transonic string must
  // stay bare. This test exists to fail if someone "improves" the wording.
  it('makes NO claim about dispersion in the transonic label', () => {
    const label = machStateLabel(1.1)!;
    expect(label).toBe('TRANSONIC');
    for (const forbidden of ['dispers', 'group', 'scatter', 'accuracy', 'spread', 'wider']) {
      expect(label.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('agrees with transonicBand at every boundary, so the card and the HUD cannot drift', () => {
    for (const m of [0.5, 1.0, 1.05, 1.2, 1.2001, 2.0]) {
      const band = transonicBand(m);
      const label = machStateLabel(m);
      expect(label === null).toBe(band === 'supersonic');
      if (band === 'transonic') expect(label).toBe('TRANSONIC');
      if (band === 'subsonic') expect(label).toContain('SUBSONIC');
    }
  });
});

// Owner, on device 2026-07-29: the .22 card showed a SINGLE ROW. The subsonic
// trim assumed every load starts supersonic, which is false for rimfire — both
// catalog .22 LR loads leave the muzzle subsonic BY DESIGN (~1060–1070 fps
// against ~1118 fps), which is the whole reason match shooters buy them.
describe('assembleComeUp — a load that is subsonic from the muzzle', () => {
  const a = 340;
  // .22-like: subsonic at every station, decelerating gently.
  const rimfireTable = [
    row({ rangeM: 50, velocityMps: 320 }),  // M0.94
    row({ rangeM: 100, velocityMps: 300 }), // M0.88
    row({ rangeM: 150, velocityMps: 285 }), // M0.84
    row({ rangeM: 200, velocityMps: 272 }), // M0.80
    row({ rangeM: 250, velocityMps: 261 }), // M0.77
  ];
  const rimfireStations = [50, 100, 150, 200, 250].map((stationM) => ({
    stationM,
    beyondEffective: false,
  }));

  it('keeps EVERY station instead of stopping at the first row', () => {
    const rows = assembleComeUp(rimfireTable, rimfireStations, { speedOfSoundMps: a });
    expect(rows).toHaveLength(5);
    expect(rows.map((r) => r.rangeM)).toEqual([50, 100, 150, 200, 250]);
  });

  it('still marks every row subsonic — the card warns, it does not truncate', () => {
    const rows = assembleComeUp(rimfireTable, rimfireStations, { speedOfSoundMps: a });
    for (const r of rows) expect(r.transonic).toBe('subsonic');
  });

  // Reproduces the defect, so a revert fails loudly rather than quietly
  // amputating the rimfire ladder again.
  it('would have produced exactly one row under the old unconditional trim', () => {
    const oldBehaviour: number[] = [];
    for (const st of rimfireStations) {
      const r = rimfireTable.find((x) => x.rangeM === st.stationM)!;
      oldBehaviour.push(st.stationM);
      if (r.velocityMps / a <= 1.0) break;
    }
    expect(oldBehaviour).toHaveLength(1);
  });
});
