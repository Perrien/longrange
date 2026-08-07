// Tests for the authored-placement loader (task T3).
//
// Registry lookups are INJECTED here (`PlacementDeps`) because the real target
// registry is empty until T7/T8/T9a — the same problem T2 hit. Production callers
// never pass deps; these fixtures let every validation rule be proven now instead
// of three tasks after it ships.
//
// Every failure mode gets its own test with an asserted message, because the whole
// value of this loader is that a bad data file says which entry to fix.

import { describe, it, expect } from 'vitest';
import {
  PLACEMENTS_VERSION,
  getTargetPlacements,
  resolvePlacement,
  resolvePlacementList,
  type PlacementDeps,
  type RawPlacement,
} from './placements';
import type { MountType } from './mount-type';
import type { TargetType } from './target-type';
import { inchesToMeters, yardsToMeters } from '../../units';

const GONG: TargetType = {
  id: 'gong',
  name: 'Gong',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'plate',
  massModel: 'oval',
  paint: { palette: { face: 0xf0f0ea }, layers: [{ kind: 'fill', color: '$face' }] },
  defaultWidthM: 0.3048,
  compatibleMounts: ['chain-beam', 'bolt-stake'],
  defaultMount: 'chain-beam',
};

/** A tall target that only accepts a hinge — the pairing rule's reason to exist. */
const POPPER: TargetType = {
  ...GONG,
  id: 'popper',
  name: 'Popper',
  shape: { kind: 'rect' },
  aspect: 3,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'rect', cx: 0, cy: 0, halfW: 0.5, halfH: 1.5 } }],
  compatibleMounts: ['hinge-stem'],
  defaultMount: 'hinge-stem',
};

const CHAIN_BEAM: MountType = {
  id: 'chain-beam',
  name: 'Chain-hung',
  reaction: 'swing',
  furniture: 'beam-rack',
  needsBeamHeight: true,
  anchor: { angleRad: 0.6, outwardOffsetM: 0.05, splayFraction: 0.5 },
};
const BOLT_STAKE: MountType = {
  id: 'bolt-stake',
  name: 'Bolted',
  reaction: 'bolted',
  furniture: 'stake',
  needsBeamHeight: false,
};
const HINGE_STEM: MountType = {
  id: 'hinge-stem',
  name: 'Hinged stem',
  reaction: 'knockdown',
  furniture: 'hinge-stem',
  needsBeamHeight: false,
  knockdown: { fallAngleDeg: 80, downDwellS: 2, resetRateDegS: 90, stemLengthM: 1 },
};

/** A plate whose only mount is the reset switch — the popper star's hub plate. Kept
 *  a separate fixture rather than widening GONG's `compatibleMounts`, which other
 *  tests assert verbatim in the pairing-error message. */
const HUB_PLATE: TargetType = {
  ...GONG,
  id: 'hub-plate',
  name: 'Hub plate',
  compatibleMounts: ['reset-switch'],
  defaultMount: 'reset-switch',
};

/** A bolted plate that re-arms a group when struck — the popper star's hub. Its
 *  target group id is a PLACEMENT field, which is what these tests pin down. */
const RESET_SWITCH: MountType = {
  id: 'reset-switch',
  name: 'Reset switch',
  reaction: 'reset-switch',
  furniture: 'none',
  needsBeamHeight: false,
};

const TYPES = new Map([GONG, POPPER, HUB_PLATE].map((t) => [t.id, t]));
const MOUNTS = new Map(
  [CHAIN_BEAM, BOLT_STAKE, HINGE_STEM, RESET_SWITCH].map((m) => [m.id, m]),
);

const DEPS: PlacementDeps = {
  hasTargetType: (id) => TYPES.has(id),
  getTargetType: (id) => TYPES.get(id)!,
  hasMountType: (id) => MOUNTS.has(id),
  getMountType: (id) => MOUNTS.get(id)!,
};

/** A valid chain-hung gong entry; `over` patches it for the failure cases. */
const entry = (over: Partial<RawPlacement> = {}): RawPlacement => ({
  id: 'gong-100',
  typeId: 'gong',
  distanceYards: 100,
  xOffsetM: 0,
  beamHeightM: 1.1,
  ...over,
});

const resolve = (raw: RawPlacement) => resolvePlacement('test-range', raw, DEPS);

describe('placements: the data file itself', () => {
  it('exports a version', () => {
    expect(PLACEMENTS_VERSION).toBe(1);
  });

  it('returns [] for the ranges that build their targets in code', () => {
    // Range A's ladder is derived and the ELR Range solves its layout at runtime;
    // neither may be forced through this loader. See placements.ts's header.
    expect(getTargetPlacements('range-a')).toEqual([]);
    expect(getTargetPlacements('elr-range')).toEqual([]);
  });

  it('returns [] for a range with no entry at all', () => {
    expect(getTargetPlacements('wooded-zero')).toEqual([]);
  });

  it('loads the shipped file, resolving every Test Range target', () => {
    // Runs against the REAL registries, so a malformed entry fails here.
    const list = getTargetPlacements('test-range');
    expect(list.map((p) => p.id)).toEqual([
      'test-gong-100',
      'test-idpa-75',
      'test-popper-50a',
      'test-popper-50b',
      'test-hostage-idpa-60',
      'test-hostage-top',
      'test-hostage-center',
      'test-tree-1',
      'test-tree-2',
      'test-tree-3',
      'test-tree-4',
      'test-tree-5',
      'test-star-arm-1',
      'test-star-arm-2',
      'test-star-arm-3',
      'test-star-arm-4',
      'test-star-arm-5',
      'test-star-hub',
    ]);
    const gong = list[0];
    expect(gong.type.id).toBe('hanging-gong');
    expect(gong.mount.id).toBe('chain-beam');
    expect(gong.distanceYards).toBe(100);
    expect(gong.widthM).toBeCloseTo(inchesToMeters(12), 12);
    expect(gong.beamHeightM).toBeCloseTo(yardsToMeters(1.2), 12);
  });

  it('accepts a beam height authored in yards', () => {
    // Same reason as `widthInches`: the rack frame is specified in yards, so the data
    // file should carry 1.2 rather than a float literal that must match a conversion.
    const p = resolve(entry({ beamHeightM: undefined, beamHeightYards: 1.2 }));
    expect(p.beamHeightM).toBeCloseTo(yardsToMeters(1.2), 12);
  });

  it('rejects both beam-height forms at once', () => {
    expect(() => resolve(entry({ beamHeightYards: 1.2 }))).toThrow(
      /beamHeightM or beamHeightYards, not both/,
    );
  });
});

describe('placements: resolution', () => {
  it('resolves a valid entry, deriving what it can', () => {
    const p = resolve(entry());
    expect(p.id).toBe('gong-100');
    expect(p.type).toBe(GONG);
    expect(p.mount).toBe(CHAIN_BEAM); // from the type's defaultMount
    expect(p.distanceM).toBeCloseTo(yardsToMeters(100), 12);
    expect(p.distanceYards).toBe(100);
    expect(p.widthM).toBeCloseTo(0.3048, 12); // the type's defaultWidthM
    expect(p.heightM).toBeCloseTo(0.3048, 12); // width × aspect(1)
    expect(p.palette).toEqual({ face: 0xf0f0ea });
  });

  it('derives height from the type aspect for a tall target', () => {
    const p = resolve({ id: 'pop', typeId: 'popper', distanceM: 50, xOffsetM: 1, widthM: 0.2 });
    expect(p.heightM).toBeCloseTo(0.6, 12); // 0.2 × aspect 3
    expect(p.mount).toBe(HINGE_STEM);
  });

  it('accepts a width in inches, which is how steel is actually sold', () => {
    const p = resolve(entry({ widthInches: 12 }));
    expect(p.widthM).toBeCloseTo(0.3048, 12);
  });

  it('converts a metric distance back to yards for labels', () => {
    const p = resolve(entry({ distanceYards: undefined, distanceM: 91.44 }));
    expect(p.distanceYards).toBeCloseTo(100, 9);
  });

  it('applies a palette override without mutating the type', () => {
    const p = resolve(entry({ palette: { face: 0xffffff } }));
    expect(p.palette).toEqual({ face: 0xffffff });
    // The recolouring promise: a data edit, and the type is untouched for everyone
    // else using it.
    expect(GONG.paint.palette).toEqual({ face: 0xf0f0ea });
  });
});

describe('placements: validation', () => {
  it('rejects a missing id or typeId', () => {
    expect(() => resolve(entry({ id: '' }))).toThrow(/missing id/);
    expect(() => resolve(entry({ typeId: '' }))).toThrow(/missing typeId/);
  });

  it('rejects an unknown target type or mount', () => {
    expect(() => resolve(entry({ typeId: 'nope' }))).toThrow(/unknown target type 'nope'/);
    expect(() => resolve(entry({ mountId: 'nope' }))).toThrow(/unknown mount 'nope'/);
  });

  it('rejects a mount the target cannot take, listing what it can', () => {
    // A popper is welded to its stem; hanging one on chains is not a thing.
    expect(() => resolve({ id: 'p', typeId: 'popper', distanceM: 50, xOffsetM: 0, beamHeightM: 1 })).not.toThrow();
    expect(() =>
      resolve({ id: 'p', typeId: 'popper', mountId: 'chain-beam', distanceM: 50, xOffsetM: 0, beamHeightM: 1 }),
    ).toThrow(/mount 'chain-beam' is not compatible with target 'popper' \(allowed: hinge-stem\)/);
  });

  it('rejects both or neither distance form', () => {
    expect(() => resolve(entry({ distanceM: 91.44 }))).toThrow(/exactly one of distanceYards or distanceM/);
    expect(() => resolve(entry({ distanceYards: undefined }))).toThrow(/exactly one of distanceYards or distanceM/);
  });

  it('rejects a non-positive distance or width', () => {
    expect(() => resolve(entry({ distanceYards: 0 }))).toThrow(/distance must be > 0/);
    expect(() => resolve(entry({ widthM: 0 }))).toThrow(/widthM must be > 0/);
    expect(() => resolve(entry({ widthM: -1 }))).toThrow(/widthM must be > 0/);
  });

  it('rejects two width forms at once', () => {
    expect(() => resolve(entry({ widthM: 0.3, widthInches: 12 }))).toThrow(/widthM or widthInches, not both/);
  });

  it('rejects a non-finite xOffsetM', () => {
    expect(() => resolve(entry({ xOffsetM: NaN }))).toThrow(/xOffsetM must be a finite number/);
  });

  it('requires beamHeightM exactly when the mount hangs from a beam', () => {
    expect(() => resolve(entry({ beamHeightM: undefined }))).toThrow(
      /mount 'chain-beam' requires beamHeightM/,
    );
    // …and a bolted mount does not need one.
    expect(() =>
      resolve(entry({ mountId: 'bolt-stake', beamHeightM: undefined })),
    ).not.toThrow();
    expect(() => resolve(entry({ beamHeightM: 0 }))).toThrow(/beamHeightM must be > 0/);
  });

  it('rejects a palette override for a slot the target does not define', () => {
    expect(() => resolve(entry({ palette: { rim: 0x123456 } }))).toThrow(
      /palette override 'rim' is not a slot on target 'gong' \(has: face\)/,
    );
  });

  it('rejects a palette value that is not a 0xRRGGBB integer', () => {
    expect(() => resolve(entry({ palette: { face: -1 } }))).toThrow(/must be a 0xRRGGBB integer/);
    expect(() => resolve(entry({ palette: { face: 0x1000000 } }))).toThrow(/must be a 0xRRGGBB integer/);
    expect(() => resolve(entry({ palette: { face: 1.5 } }))).toThrow(/must be a 0xRRGGBB integer/);
  });

  it('requires resetsGroupId on a reset-switch mount, and forbids it elsewhere', () => {
    // Both directions are silent failures on device if unchecked: a switch with
    // nothing to reset is a dead button, and a reset id on a mount that cannot act on
    // it does nothing at all.
    expect(() =>
      resolve({ id: 'hub', typeId: 'hub-plate', distanceM: 82, xOffsetM: 1.19 }),
    ).toThrow(/mount 'reset-switch' is a reset switch and requires resetsGroupId/);
    expect(() => resolve(entry({ resetsGroupId: 'arms' }))).toThrow(
      /resetsGroupId is only meaningful on a 'reset-switch' mount, and 'chain-beam' reacts 'swing'/,
    );
  });

  it('names the range and entry in every message', () => {
    expect(() => resolve(entry({ typeId: 'nope' }))).toThrow(/^placements\[test-range\/gong-100\]:/);
  });
});

describe('placements: cross-entry invariants', () => {
  const list = (raws: RawPlacement[]) => resolvePlacementList('test-range', raws, DEPS);

  it('rejects duplicate ids within a range', () => {
    expect(() => list([entry(), entry()])).toThrow(/duplicate placement id/);
  });

  it('allows a group whose members agree on distance and mount', () => {
    const pop = (id: string, xOffsetM: number): RawPlacement => ({
      id,
      typeId: 'popper',
      groupId: 'rack-a',
      distanceM: 50,
      xOffsetM,
      widthM: 0.2,
    });
    const out = list([pop('p1', 1), pop('p2', 1.5)]);
    expect(out.map((p) => p.groupId)).toEqual(['rack-a', 'rack-a']);
  });

  it('rejects a group whose members disagree on distance', () => {
    // One piece of furniture cannot stand at two distances.
    expect(() =>
      list([
        { id: 'p1', typeId: 'popper', groupId: 'g', distanceM: 50, xOffsetM: 1, widthM: 0.2 },
        { id: 'p2', typeId: 'popper', groupId: 'g', distanceM: 75, xOffsetM: 1.5, widthM: 0.2 },
      ]),
    ).toThrow(/group 'g' members disagree on distance \(50 vs 75 m\)/);
  });

  it('rejects a group whose members disagree on mount', () => {
    expect(() =>
      list([
        { id: 'g1', typeId: 'gong', groupId: 'g', distanceM: 50, xOffsetM: 1, beamHeightM: 1.1 },
        { id: 'g2', typeId: 'gong', groupId: 'g', mountId: 'bolt-stake', distanceM: 50, xOffsetM: 1.5 },
      ]),
    ).toThrow(/group 'g' members disagree on mount \('chain-beam' vs 'bolt-stake'\)/);
  });

  it('accepts a reset switch naming a group that exists on the range', () => {
    const out = list([
      { id: 'p1', typeId: 'popper', groupId: 'arms', distanceM: 82, xOffsetM: 1, widthM: 0.2 },
      { id: 'p2', typeId: 'popper', groupId: 'arms', distanceM: 82, xOffsetM: 1.5, widthM: 0.2 },
      { id: 'hub', typeId: 'hub-plate', distanceM: 82, xOffsetM: 1.25, resetsGroupId: 'arms' },
    ]);
    expect(out[2].resetsGroupId).toBe('arms');
    // The switch is NOT in the group it resets — it cannot be, since a group's members
    // must share a mount and the switch is bolted while the arms are knockdowns.
    expect(out[2].groupId).toBeUndefined();
  });

  it('rejects a reset switch naming a group that does not exist', () => {
    // The failure mode this guards is the worst kind: a plate that takes hits and
    // silently does nothing, which on device reads as broken physics, not a typo.
    expect(() =>
      list([
        { id: 'p1', typeId: 'popper', groupId: 'arms', distanceM: 82, xOffsetM: 1, widthM: 0.2 },
        { id: 'hub', typeId: 'hub-plate', distanceM: 82, xOffsetM: 1.25, resetsGroupId: 'armz' },
      ]),
    ).toThrow(/resetsGroupId 'armz' is not a groupId on this range \(has: arms\)/);
  });

  it('leaves ungrouped entries alone', () => {
    const out = list([
      entry({ id: 'a' }),
      entry({ id: 'b', distanceYards: 200 }),
    ]);
    expect(out).toHaveLength(2);
    expect(out.every((p) => p.groupId === undefined)).toBe(true);
  });
});
