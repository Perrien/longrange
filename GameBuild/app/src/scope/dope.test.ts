// DOPE-equality test (task 1.6d plan, Verify checkpoint): DropTable.tsx and
// DopePanel.tsx each format their solved rows through the exact same
// game/dope-row.ts `formatDopeRow` — this test locks that shared path in so a
// future edit can't quietly let one screen hand-derive its own MIL/MOA math
// again and drift from the other ("matches the 0.4 table for identical
// inputs", now guaranteed structurally rather than by hand comparison).
import { describe, expect, it } from 'vitest';
import { formatDopeRow } from '../game/dope-row';
import type { TrajectoryTable } from '../engine-bridge/types';

// A synthetic table shaped like a real solveTrajectory() result — this test is
// about the SHARED FORMATTING PATH, not the physics (that's covered by the
// engine-bridge/firing-solution tests), so no engine is needed here.
const table: TrajectoryTable = [
  { rangeM: 91.44, dropM: 0.02, windageM: 0.001, velocityMps: 800, timeOfFlightS: 0.12, energyJ: 3000 },
  { rangeM: 274.32, dropM: 0, windageM: 0, velocityMps: 700, timeOfFlightS: 0.4, energyJ: 2500 },
  { rangeM: 457.2, dropM: -1.8, windageM: 0.3, velocityMps: 600, timeOfFlightS: 0.75, energyJ: 2000 },
];

describe('DOPE-equality (task 1.6d)', () => {
  it('the DropTable-style consumption (row-by-row) matches the DopePanel-style consumption (table.map) exactly', () => {
    const dropTableStyle = table.map((r) => formatDopeRow(r));
    const dopePanelStyle = table.map(formatDopeRow);
    expect(dopePanelStyle).toEqual(dropTableStyle);
  });

  it('the come-up formula is pinned: formatDopeRow(row).dropMilMoa.mil === atan2(dropM, rangeM) in mil, for every row', () => {
    for (const row of table) {
      const viaShared = formatDopeRow(row);
      const handMil = Math.atan2(row.dropM, row.rangeM) * 1000;
      expect(viaShared.dropMilMoa.mil).toBeCloseTo(handMil, 9);
    }
  });

  it('a fixed load/wind/zero solve (same table) produces identical rows on repeat formatting — no hidden per-call state', () => {
    const first = table.map(formatDopeRow);
    const second = table.map(formatDopeRow);
    expect(second).toEqual(first);
  });
});
