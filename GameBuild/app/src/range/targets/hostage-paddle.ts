// The hostage-target "no-shoot" paddle — a reusable disc TargetType shared by
// both hostage-target mounts (Design/Plans, "IDPA Hostage/No-Shoot Paddle
// Targets"). Both paddles in the reference target are visually identical (a
// flat orange disc); the behaviour difference between the top (binary flip)
// and centre (alternating cycle) paddles lives entirely on the MOUNT
// (`mount-registry.ts`'s `hostage-clamp-2way`/`hostage-clamp-3way`), not here —
// the same separation `idpa.ts`'s header describes for the silhouette itself.
//
// One zone: no scoring math exists anywhere in this codebase yet, so a hit just
// needs to be distinguishable by `instanceId`/`zoneId` for a future scoring
// layer, which a single named zone already provides.

import type { TargetType } from './target-type';

/** Safety-orange, matching the reference target's hostage-paddle colour. */
export const HOSTAGE_PADDLE_FACE_HEX = 0xe8720c;

export const HOSTAGE_PADDLE: TargetType = {
  id: 'hostage-paddle',
  name: 'Hostage paddle',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'paddle', label: 'Paddle', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'paddle',
  massModel: 'oval',
  paint: {
    palette: { face: HOSTAGE_PADDLE_FACE_HEX },
    layers: [{ kind: 'fill', color: '$face' }],
  },
  defaultWidthM: 0.1524, // 6" — a placeholder, tune against the owner's reference art on device.
  compatibleMounts: ['hostage-clamp-2way', 'hostage-clamp-3way'],
  defaultMount: 'hostage-clamp-3way',
};
