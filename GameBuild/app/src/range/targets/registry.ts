// Target-type registry (task T1). One place that resolves a target-type id, with
// every registered type validated at import — mirroring `getRangeDefinition`
// (`range/ranges.ts`), which throws on an unknown id because that is a
// programming error rather than a user-facing case.
//
// Registering a target type is the ONLY cost of adding one. Nothing in
// `ScopeView` or a scene builder needs to know the list exists; scenes reach
// types through placements (`placements.ts`, T3).

import { HANGING_GONG } from './hanging-gong';
import { HOSTAGE_PADDLE } from './hostage-paddle';
import { IDPA_SILHOUETTE } from './idpa';
import { IDPA_HOSTAGE_SILHOUETTE } from './idpa-hostage';
import { POPPER } from './popper';
import { validateTargetType, type TargetType } from './target-type';

/**
 * Every target type the game knows about.
 *
 * `target-type.test.ts` asserts the roster, so it cannot quietly drift.
 */
const REGISTERED: readonly TargetType[] = [
  HANGING_GONG,
  IDPA_SILHOUETTE,
  POPPER,
  IDPA_HOSTAGE_SILHOUETTE,
  HOSTAGE_PADDLE,
];

// Fail at import, not at render. A malformed type is a build-time bug.
for (const t of REGISTERED) validateTargetType(t);

const BY_ID = new Map(REGISTERED.map((t) => [t.id, t]));
if (BY_ID.size !== REGISTERED.length) {
  const seen = new Set<string>();
  const dupe = REGISTERED.find((t) => seen.size === seen.add(t.id).size);
  throw new Error(`targets/registry: duplicate target-type id '${dupe?.id}'`);
}

/** All registered target types, in registration order. */
export function listTargetTypes(): readonly TargetType[] {
  return REGISTERED;
}

/** Resolve a target type by id; throws on an unknown id. */
export function getTargetType(id: string): TargetType {
  const t = BY_ID.get(id);
  if (!t) {
    const known = REGISTERED.map((r) => r.id).join(', ') || '(none registered yet)';
    throw new Error(`targets/registry: unknown target-type id '${id}' — known: ${known}`);
  }
  return t;
}

/** Whether an id resolves, for callers that want to validate without throwing
 *  (the placement loader reports every bad entry rather than dying on the first). */
export function hasTargetType(id: string): boolean {
  return BY_ID.has(id);
}
