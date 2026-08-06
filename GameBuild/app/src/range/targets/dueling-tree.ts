// The dueling-tree paddle — a reusable disc `TargetType` for the Test Range's
// dueling tree (`Design/Plans/dueling-tree-plan.md`).
//
// Behaviourally this is the shipped hostage-paddle flip mechanism
// (`range/targets/flip.ts`, `scope/steel-reactions.ts`'s `poseFlip`) with a
// different arrangement of stops — a 180° swing about a vertical pivot,
// arcing away from the shooter, is exactly what a dueling-tree paddle needs.
// Nothing about the REACTION is new here; what is new is the GEOMETRY that
// arranges five of these round a single post, which is why this file owns
// the post/arm/stack constants alongside the target type rather than leaving
// them scattered across the mount registry and the placement data.
//
// A SEPARATE type from `HOSTAGE_PADDLE`, not a reuse: `HOSTAGE_PADDLE.defaultWidthM`
// is shared by both hostage mounts and is load-bearing for the hostage window's
// radius and the hostage centre paddle's swing-clearance floor (see that file's
// header) — a tree paddle that can be 6″ or 8″ must not be able to reach those
// constraints by drifting a shared constant.

import { inchesToMeters } from '../../units';
import type { TargetType } from './target-type';

// --- the post ----------------------------------------------------------------

/** Owner: "5 feet tall". */
export const DUELING_TREE_POST_HEIGHT_M = inchesToMeters(60); // 1.524 m

/**
 * 3″ diameter — heavier than the scene's shared 2″ `POST_RADIUS_M`
 * (`TestRangeScene.ts`), because this post carries five swinging arms rather
 * than standing alone. It also sets the arm clearance below, which is why the
 * constant lives here and `TestRangeScene` imports it rather than re-typing it.
 */
export const DUELING_TREE_POST_RADIUS_M = 0.0381; // 1.5" radius = 3" diameter

// --- the arm -------------------------------------------------------------------

/** Rim-to-post gap at rest, both stops. */
export const DUELING_TREE_ARM_CLEARANCE_M = 0.02; // 2 cm

/**
 * Distance between a dueling-tree mount's two stops, for a paddle of the given
 * width. The arm has to clear the post, so the swing is a function of paddle
 * size — which is why there are TWO dueling-tree mounts (6″/8″) rather than one
 * with a paddle-size-agnostic swing (`mount-registry.ts`).
 */
export function duelingTreeSwingM(paddleWidthM: number): number {
  return 2 * (paddleWidthM / 2 + DUELING_TREE_POST_RADIUS_M + DUELING_TREE_ARM_CLEARANCE_M);
}

// --- the paddle stack ----------------------------------------------------------

export const DUELING_TREE_PADDLE_COUNT = 5;

/**
 * Vertical spacing between paddle centres. Must exceed the largest authored
 * paddle's diameter or two paddles overlap and `game/shot.ts`'s first-hit-wins
 * rack walk cannot tell them apart (see the plan §4.1).
 */
export const DUELING_TREE_PADDLE_PITCH_M = inchesToMeters(10); // 0.254 m

/** Centre height of the TOP paddle (index 0). */
export const DUELING_TREE_TOP_PADDLE_Y_M = inchesToMeters(55); // 1.397 m

/** Centre height of paddle `i`, i = 0 at the TOP, increasing downward. */
export function duelingTreePaddleYM(i: number): number {
  return DUELING_TREE_TOP_PADDLE_Y_M - i * DUELING_TREE_PADDLE_PITCH_M;
}

// --- the target type -------------------------------------------------------

/** Flat off-white, matching the scene's default plate paint — same both faces
 *  (owner decision: no two-tone; the face rasteriser paints one texture used
 *  for both halves of a flip paddle). */
export const DUELING_TREE_PADDLE_FACE_HEX = 0xf0f0ea;

export const DUELING_TREE_PADDLE: TargetType = {
  id: 'dueling-tree-paddle',
  name: 'Dueling-tree paddle',
  shape: { kind: 'disc' },
  aspect: 1,
  zones: [{ id: 'paddle', label: 'Paddle', shape: { kind: 'circle', cx: 0, cy: 0, r: 0.5 } }],
  defaultZoneId: 'paddle',
  massModel: 'oval',
  paint: {
    palette: { face: DUELING_TREE_PADDLE_FACE_HEX },
    layers: [{ kind: 'fill', color: '$face' }],
  },
  defaultWidthM: inchesToMeters(6),
  compatibleMounts: ['dueling-tree-arm-6', 'dueling-tree-arm-8'],
  defaultMount: 'dueling-tree-arm-6',
};
