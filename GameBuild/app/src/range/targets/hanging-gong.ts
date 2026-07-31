// Hanging gong target type (Design/archive/target-system-plan.md, task T9a).
//
// The Test Range's original 12″ gong, MIGRATED onto the target system rather than
// rebuilt. Its whole reason for existing at this point in the batch is the regression
// proof: `test-range-targets.test.ts` asserts the placement-built `PlateInstance` is
// FIELD-FOR-FIELD identical to one built from `TEST_RANGE_GONG` the old way. If the
// new system cannot reproduce the target that already shipped, nothing built on it
// should be trusted.
//
// It is also the system's simplest possible type — a round plate, one zone, one solid
// colour, no art — which makes it the useful floor: anything the abstraction demands
// beyond this is demanded of every future target too.

import type { TargetType } from './target-type';

/**
 * The shipped Test Range plate colour (`RangeScene`'s `PLATE_COLOR`). Named here so
 * the migration's identity test compares against a value with a stated provenance
 * rather than a magic number copied twice.
 */
export const GONG_FACE_HEX = 0xf0f0ea;

/**
 * A round steel gong.
 *
 * MOUNTS: `chain-beam` (how the Test Range hangs it) and `bolt-stake`, so the same
 * type can serve a bolted near-target later without a new module — which is exactly
 * what the ELR Range already does with one gong across three mounts.
 *
 * ZONES: one, the plate. A gong is scored by ringing it.
 */
export const HANGING_GONG: TargetType = {
  id: 'hanging-gong',
  name: 'Steel gong',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'plate', label: 'Plate', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'plate',
  massModel: 'oval',
  paint: {
    palette: { face: GONG_FACE_HEX },
    layers: [{ kind: 'fill', color: '$face' }],
  },
  defaultWidthM: 0.3048, // 12"
  compatibleMounts: ['chain-beam', 'bolt-stake'],
  defaultMount: 'chain-beam',
};
