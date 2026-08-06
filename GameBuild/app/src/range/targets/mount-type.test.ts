// Tests for the mount abstraction + registry (task T1b). Pure — no THREE, no DOM.
//
// The important test here is the EQUIVALENCE one: `reactionModeOf` has to
// reproduce the shipped `PlateInstance.swings` semantics for every plate the three
// live steel ranges actually build, because that fallback is the entire reason T1b
// changes no range config and no scene builder. It is asserted against the real
// `RANGE_A_RACKS` ladder and both ELR firing-point layouts rather than against
// hand-written examples, so a change to either range's mount policy shows up here.

import { describe, it, expect } from 'vitest';
import { validateMountType, type MountType } from './mount-type';
import {
  getMountType,
  hasMountType,
  listMountTypes,
  reactionModeOf,
} from './mount-registry';
import {
  CHAIN_ANCHOR_ANGLE_RAD,
  CHAIN_OUTWARD_OFFSET_M,
  CHAIN_SPLAY_FRACTION,
} from '../../engine-bridge/steel-target';
import { RANGE_A_RACKS } from '../range-a-config';
import { mountFor, solveLayout, stationsFor, type FiringPoint } from '../elr-range-config';

/** A minimal valid swing mount; `over` patches fields for the failure cases. */
function swingMount(over: Partial<MountType> = {}): MountType {
  return {
    id: 'test-swing',
    name: 'Test swing',
    reaction: 'swing',
    furniture: 'beam-rack',
    needsBeamHeight: true,
    anchor: { angleRad: 0.6, outwardOffsetM: 0.05, splayFraction: 0.5 },
    ...over,
  };
}

describe('mount registry', () => {
  it('registers the shipped mounts and throws on anything else', () => {
    expect(listMountTypes().map((m) => m.id)).toEqual([
      'chain-beam',
      'bolt-stake',
      'hinge-stem',
      'hostage-clamp-2way',
      'hostage-clamp-3way',
      'dueling-tree-arm-6',
      'dueling-tree-arm-8',
    ]);
    expect(hasMountType('chain-beam')).toBe(true);
    expect(hasMountType('no-such-mount')).toBe(false);
    expect(() => getMountType('no-such-mount')).toThrow(/unknown mount id 'no-such-mount'/);
  });

  it('gives hinge-stem a knockdown reaction and a complete spec (task T6)', () => {
    const m = getMountType('hinge-stem');
    expect(m.reaction).toBe('knockdown');
    expect(m.furniture).toBe('hinge-stem');
    expect(m.needsBeamHeight).toBe(false); // welded to a stem, nothing to hang from
    expect(m.anchor).toBeUndefined();
    // Hardware properties, not taste: a real popper lies against a stop rather than
    // flat, and resets at a mechanical rate.
    expect(m.knockdown).toEqual({
      fallAngleDeg: 80,
      downDwellS: 2.5,
      resetRateDegS: 60,
      stemLengthM: 1.0,
    });
  });

  it('gives chain-beam the SAME anchor geometry the physics actually uses', () => {
    // Imported, not re-typed — this asserts the import did not drift. If these
    // ever disagree, the drawn rest chains and the swinging chains separate.
    const anchor = getMountType('chain-beam').anchor;
    expect(anchor).toEqual({
      angleRad: CHAIN_ANCHOR_ANGLE_RAD,
      outwardOffsetM: CHAIN_OUTWARD_OFFSET_M,
      splayFraction: CHAIN_SPLAY_FRACTION,
    });
  });

  it('describes bolt-stake as bolted, needing no beam', () => {
    const m = getMountType('bolt-stake');
    expect(m.reaction).toBe('bolted');
    expect(m.needsBeamHeight).toBe(false);
    expect(m.anchor).toBeUndefined();
  });

  it('gives the top hostage paddle a binary 2-stop flip', () => {
    const m = getMountType('hostage-clamp-2way');
    expect(m.reaction).toBe('flip');
    expect(m.furniture).toBe('pivot-post');
    expect(m.flip!.positions.map((p) => p.id)).toEqual(['left', 'right']);
    expect(m.flip!.positions[0].xOffsetM).toBe(0);
  });

  it('gives the centre hostage paddle the alternating 4-stop cycle', () => {
    const m = getMountType('hostage-clamp-3way');
    expect(m.reaction).toBe('flip');
    expect(m.flip!.positions.map((p) => p.id)).toEqual(['center', 'right', 'center', 'left']);
    expect(m.flip!.positions[0].xOffsetM).toBe(0);
  });

  it('every registered mount passes validation', () => {
    for (const m of listMountTypes()) expect(() => validateMountType(m)).not.toThrow();
  });
});

describe('validateMountType', () => {
  it('accepts a well-formed swing mount', () => {
    expect(() => validateMountType(swingMount())).not.toThrow();
  });

  it('requires anchor geometry and a beam for a swing mount', () => {
    expect(() => validateMountType(swingMount({ anchor: undefined }))).toThrow(
      /'swing' mount needs anchor geometry/,
    );
    expect(() => validateMountType(swingMount({ needsBeamHeight: false }))).toThrow(
      /'swing' mount must require beamHeightM/,
    );
  });

  it('requires a knockdown spec for a knockdown mount, and forbids one on a bolted mount', () => {
    expect(() =>
      validateMountType(swingMount({ reaction: 'knockdown', anchor: undefined, needsBeamHeight: false })),
    ).toThrow(/'knockdown' mount needs a knockdown spec/);
    expect(() =>
      validateMountType(
        swingMount({
          reaction: 'bolted',
          anchor: undefined,
          needsBeamHeight: false,
          knockdown: { fallAngleDeg: 80, downDwellS: 2, resetRateDegS: 90, stemLengthM: 1 },
        }),
      ),
    ).toThrow(/'bolted' mount cannot carry a knockdown spec/);
  });

  it('requires a flip spec for a flip mount, and forbids one on a non-flip mount', () => {
    expect(() =>
      validateMountType(swingMount({ reaction: 'flip', anchor: undefined, needsBeamHeight: false })),
    ).toThrow(/'flip' mount needs a flip spec/);
    expect(() =>
      validateMountType(
        swingMount({
          flip: { positions: [{ id: 'a', xOffsetM: 0 }, { id: 'b', xOffsetM: 0.1 }], transitionS: 0.3 },
        }),
      ),
    ).toThrow(/only a 'flip' mount can carry a flip spec/);
  });

  it('rejects a degenerate flip spec', () => {
    const flip = (over: Record<string, unknown>) =>
      validateMountType(
        swingMount({
          reaction: 'flip',
          anchor: undefined,
          needsBeamHeight: false,
          flip: { positions: [{ id: 'a', xOffsetM: 0 }, { id: 'b', xOffsetM: 0.1 }], transitionS: 0.3, ...over },
        }),
      );
    expect(() => flip({ positions: [{ id: 'a', xOffsetM: 0 }] })).toThrow(/flip needs at least 2 positions/);
    expect(() => flip({ positions: [{ id: 'a', xOffsetM: 0.1 }, { id: 'b', xOffsetM: 0.2 }] })).toThrow(
      /flip position 0 \(rest\) must have xOffsetM 0/,
    );
    expect(() => flip({ transitionS: 0 })).toThrow(/flip transitionS must be > 0/);
  });

  it('rejects degenerate anchor and knockdown numbers', () => {
    expect(() => validateMountType(swingMount({ anchor: { angleRad: 0, outwardOffsetM: 0.05, splayFraction: 0.5 } }))).toThrow(/angleRad must be > 0/);
    expect(() => validateMountType(swingMount({ anchor: { angleRad: 0.6, outwardOffsetM: 0, splayFraction: 0.5 } }))).toThrow(/outwardOffsetM must be > 0/);
    const kd = (over: Record<string, number>) =>
      validateMountType(
        swingMount({
          reaction: 'knockdown',
          anchor: undefined,
          needsBeamHeight: false,
          knockdown: { fallAngleDeg: 80, downDwellS: 2, resetRateDegS: 90, stemLengthM: 1, ...over },
        }),
      );
    expect(() => kd({ fallAngleDeg: 0 })).toThrow(/fallAngleDeg must be in \(0, 90]/);
    expect(() => kd({ fallAngleDeg: 120 })).toThrow(/fallAngleDeg must be in \(0, 90]/);
    expect(() => kd({ resetRateDegS: 0 })).toThrow(/resetRateDegS must be > 0/);
    expect(() => kd({ stemLengthM: 0 })).toThrow(/stemLengthM must be > 0/);
  });
});

describe('reactionModeOf — the compatibility seam', () => {
  it('reproduces the swings flag when no mountId is present', () => {
    expect(reactionModeOf({})).toBe('swing'); // omitted ⇒ hangs
    expect(reactionModeOf({ swings: true })).toBe('swing');
    expect(reactionModeOf({ swings: false })).toBe('bolted');
  });

  it('lets mountId win when present', () => {
    expect(reactionModeOf({ mountId: 'bolt-stake' })).toBe('bolted');
    expect(reactionModeOf({ mountId: 'chain-beam' })).toBe('swing');
    // An explicit mount overrides a stale swings flag rather than conflicting
    // with it, so a migrated plate can keep the old field harmlessly.
    expect(reactionModeOf({ mountId: 'chain-beam', swings: false })).toBe('swing');
    expect(reactionModeOf({ mountId: 'bolt-stake', swings: true })).toBe('bolted');
  });

  it('throws on an unknown mountId rather than guessing a reaction', () => {
    expect(() => reactionModeOf({ mountId: 'no-such-mount' })).toThrow(/unknown mount id/);
  });

  it('leaves every Range A plate swinging, exactly as today', () => {
    // RangeScene sets no `swings`, so all 50 plates hang.
    const plates = RANGE_A_RACKS.flatMap((rack) => rack.plates.map(() => ({})));
    expect(plates).toHaveLength(50);
    for (const p of plates) expect(reactionModeOf(p)).toBe('swing');
  });

  it('reproduces the ELR Range mount policy on both firing points', () => {
    // ELRRangeScene builds plates with `swings: st.mount !== 'stake'`. Rebuild
    // that here from the REAL solved layout and check the resolver agrees, so a
    // change to `mountFor()` cannot silently diverge from the reaction it drives.
    for (const point of ['low', 'high'] as FiringPoint[]) {
      const layout = solveLayout(point, []);
      expect(layout.stations.length).toBe(stationsFor(point).length);
      let stakes = 0;
      for (const st of layout.stations) {
        const plate = { swings: st.mount !== 'stake' };
        const expected = st.mount === 'stake' ? 'bolted' : 'swing';
        expect(reactionModeOf(plate)).toBe(expected);
        // …and the mount policy itself is still what the resolver was written
        // against: stakes only on the low line, only inside the stake range.
        expect(st.mount).toBe(mountFor(point, st.losRangeM));
        if (st.mount === 'stake') stakes++;
      }
      // The low line really does have bolted stations and the high line does not
      // — without this the loop above would pass on an all-swing layout.
      if (point === 'low') expect(stakes).toBeGreaterThan(0);
      else expect(stakes).toBe(0);
    }
  });
});
