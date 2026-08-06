// Face layer plan (Design/archive/target-system-plan.md §5b, task T6b).
//
// Turns a target's declarative face — a palette plus a bottom-first layer stack —
// into an ordered list of DRAW OPS in plate-atlas pixel coordinates. Pure: no canvas,
// no DOM, no fetch. T6c's rasteriser is a dumb replay of this list, which is what
// keeps the interesting logic (palette resolution, coordinate mapping, zone-derived
// art) testable in node.
//
// ── THE PIXEL FRAME, AND THE TWO TRAPS IN IT ──────────────────────────────────
// A plate layer is one (2·256)×256 RGBA tile holding BOTH faces, matching the C++
// paint buffer and `plate-geometry.ts`'s UVs:
//
//   u = halfCentre + x·0.5     halfCentre = 0.25 (downrange) or 0.75 (shooter side)
//   v = 0.5 + y/aspect         y = width-normalised local y
//   px = u·512,  py = v·256
//
// TRAP 1 — the tile is ANISOTROPIC. One unit of local x is 256 px; one unit of local
// y is 256/aspect px. So a circle in the target's local frame is an ELLIPSE in texel
// space, and emitting it as a circle would render scoring rings as eggs on any
// non-square target. `bullseye-texture.ts` documents the same trap. Circles are
// therefore planned as ellipses with separate radii.
//
// TRAP 2 — row 0 is the plate's BOTTOM, not its top. `v = 0.5 + y` with y pointing up
// and `texture.flipY = false` means buffer rows run bottom-to-top of the plate. Ops
// are emitted in that convention (so a test can assert against the real buffer), and
// `image` ops carry `flipY: true` to tell the rasteriser its bitmap needs flipping.
//
// No mirroring between halves: `plate-geometry.ts` maps BOTH caps with
// `u = halfCentre + x·0.5`, so local +x is higher u on each. A mark at local +x
// therefore appears at the same local +x from either side — which is what a hole
// through steel actually does.

import { PLATE_TEXTURE_SIZE, PLATE_TILE_HEIGHT, PLATE_TILE_WIDTH } from '../plate-surface';
import type {
  ColorRef,
  DrawShape,
  Point,
  TargetType,
  ZoneShape,
  ZoneStyle,
} from './target-type';

/** Which face of the plate a shape is being drawn on. */
export type FaceSide = 'downrange' | 'shooter';

/** u-centre of each half, per `plate-geometry.ts`. */
const HALF_CENTRE: Record<FaceSide, number> = { downrange: 0.25, shooter: 0.75 };

/**
 * Pixels per unit of local x.
 *
 * `u = halfCentre + x·0.5` and `px = u·tileWidth`, so `dpx/dx = 0.5·tileWidth` = 256.
 * (The plate's full width — Δx = 1 — therefore occupies 256 px, i.e. exactly one half
 * of the 512 px tile, which is the invariant a test pins.)
 */
export const PX_PER_LOCAL_X = PLATE_TILE_WIDTH * 0.5; // = 256

export interface PxPoint {
  x: number;
  y: number;
}

export type DrawOp =
  /** Flood the entire tile — both halves, including outside the outline. */
  | { kind: 'fill'; color: number }
  /** Provided artwork, fitted to the plate's box on one face. `flipY` because the
   *  buffer runs bottom-up (trap 2). SKIPPABLE: if the asset fails to load the
   *  rasteriser drops this op and the rest of the stack still renders. */
  | { kind: 'image'; artId: string; side: FaceSide; x: number; y: number; w: number; h: number; flipY: true }
  | { kind: 'ellipse'; side: FaceSide; cx: number; cy: number; rx: number; ry: number; fill?: number; stroke?: number; strokeWidthPx?: number }
  | { kind: 'polygon'; side: FaceSide; points: PxPoint[]; fill?: number; stroke?: number; strokeWidthPx?: number };

export interface FacePlan {
  widthPx: number;
  heightPx: number;
  ops: DrawOp[];
  /** The resolved `fill` colour — what the C++ target must be told its paint is, so
   *  `writeEngineLayer` composites against the right value. Null if the stack has no
   *  `fill` layer (then the caller keeps the plate's own `paintColor`). */
  paintHex: number | null;
}

export interface FacePlanOptions {
  /** Per-placement palette override, already validated by the placement loader. */
  palette?: Record<string, number>;
}

/** Resolve a `ColorRef` against the type palette plus any override. */
function resolveColor(
  ref: ColorRef | undefined,
  palette: Record<string, number>,
  where: string,
): number | undefined {
  if (ref === undefined) return undefined;
  if (typeof ref === 'number') return ref;
  const slot = ref.slice(1);
  if (!(slot in palette))
    throw new Error(`face-plan: ${where} references palette slot '$${slot}', which is not defined`);
  return palette[slot];
}

/** Local (width-normalised) → tile pixels, on one face. */
export function toPx(p: Point, aspect: number, side: FaceSide): PxPoint {
  const u = HALF_CENTRE[side] + p.x * 0.5;
  const v = 0.5 + p.y / aspect;
  return { x: u * PLATE_TILE_WIDTH, y: v * PLATE_TILE_HEIGHT };
}

/** Emit one shape onto one face. Circles become ellipses (trap 1). */
function shapeOps(
  shape: ZoneShape,
  aspect: number,
  side: FaceSide,
  style: { fill?: number; stroke?: number; strokeWidthPx?: number },
): DrawOp[] {
  switch (shape.kind) {
    case 'circle': {
      const c = toPx({ x: shape.cx, y: shape.cy }, aspect, side);
      return [
        {
          kind: 'ellipse',
          side,
          cx: c.x,
          cy: c.y,
          // Separate radii: the same local radius is a different number of pixels
          // horizontally and vertically once the tile squashes the plate.
          rx: shape.r * PX_PER_LOCAL_X,
          ry: (shape.r / aspect) * PLATE_TILE_HEIGHT,
          ...style,
        },
      ];
    }
    case 'rect': {
      const corners: Point[] = [
        { x: shape.cx - shape.halfW, y: shape.cy - shape.halfH },
        { x: shape.cx + shape.halfW, y: shape.cy - shape.halfH },
        { x: shape.cx + shape.halfW, y: shape.cy + shape.halfH },
        { x: shape.cx - shape.halfW, y: shape.cy + shape.halfH },
      ];
      return [{ kind: 'polygon', side, points: corners.map((p) => toPx(p, aspect, side)), ...style }];
    }
    case 'polygon':
      return [
        { kind: 'polygon', side, points: shape.points.map((p) => toPx(p, aspect, side)), ...style },
      ];
  }
}

/** Stroke width (px) from a width-normalised fraction. Scaled by the x axis; on a
 *  tall target the tile's vertical squash makes the stroke read slightly thinner
 *  top-to-bottom, which canvas cannot express per-segment and is not worth faking. */
function strokePx(frac: number | undefined): number | undefined {
  return frac === undefined ? undefined : Math.max(1, frac * PX_PER_LOCAL_X);
}

/**
 * Plan a target's face.
 *
 * Layers are walked bottom-first, and every shape is emitted onto BOTH faces so a
 * plate reads the same from either side.
 */
export function planFace(type: TargetType, opts: FacePlanOptions = {}): FacePlan {
  const palette = { ...type.paint.palette, ...(opts.palette ?? {}) };
  const zonesById = new Map(type.zones.map((z) => [z.id, z]));
  const sides: FaceSide[] = ['downrange', 'shooter'];
  const ops: DrawOp[] = [];
  let paintHex: number | null = null;

  const styleOf = (s: DrawShape | ZoneStyle, where: string) => ({
    fill: resolveColor(s.fill, palette, where),
    stroke: resolveColor(s.stroke, palette, where),
    strokeWidthPx: strokePx(s.strokeWidthFrac),
  });

  for (const [i, layer] of type.paint.layers.entries()) {
    const where = `${type.id} layer ${i} (${layer.kind})`;
    switch (layer.kind) {
      case 'fill': {
        const color = resolveColor(layer.color, palette, where);
        if (color === undefined) throw new Error(`face-plan: ${where} has no colour`);
        // The paint colour the engine must be told about, so a splat composites
        // against the same value the face was flooded with.
        paintHex = color;
        ops.push({ kind: 'fill', color });
        break;
      }
      case 'image': {
        for (const side of sides) {
          // The plate's box on this face: full width (256 px), full height (256 px).
          const lo = toPx({ x: -0.5, y: -type.aspect / 2 }, type.aspect, side);
          const hi = toPx({ x: 0.5, y: type.aspect / 2 }, type.aspect, side);
          ops.push({
            kind: 'image',
            artId: layer.artId,
            side,
            x: Math.min(lo.x, hi.x),
            y: Math.min(lo.y, hi.y),
            w: Math.abs(hi.x - lo.x),
            h: Math.abs(hi.y - lo.y),
            flipY: true,
          });
        }
        break;
      }
      case 'shapes': {
        for (const side of sides) {
          for (const item of layer.items) {
            ops.push(...shapeOps(item.shape, type.aspect, side, styleOf(item, where)));
          }
        }
        break;
      }
      case 'zones': {
        // Draw the type's OWN zones, so face art can never disagree with what scores.
        //
        // In REVERSE authored order — worst zone first. Zones are authored best-first
        // because that is what the hit test walks, but for painting that is exactly
        // backwards: scoring zones NEST (an IDPA −3 contains −1 contains the −0
        // centres), so best-first would fill the largest zone last and bury every
        // centre under it. Outermost-first is the same thing as worst-first for any
        // nested scheme, and it is harmless when zones do not overlap.
        const painted = [...type.zones].reverse();
        for (const side of sides) {
          for (const zone of painted) {
            const style = layer.style[zone.id];
            if (!style) continue; // unstyled zones simply are not drawn
            ops.push(...shapeOps(zone.shape, type.aspect, side, styleOf(style, where)));
          }
        }
        // A style keyed on a nonexistent zone draws nothing and reads as a missing
        // ring; `validateTargetType` already rejects it, so this is belt-and-braces.
        for (const zoneId of Object.keys(layer.style)) {
          if (!zonesById.has(zoneId))
            throw new Error(`face-plan: ${where} styles unknown zone '${zoneId}'`);
        }
        break;
      }
    }
  }

  return { widthPx: PLATE_TILE_WIDTH, heightPx: PLATE_TILE_HEIGHT, ops, paintHex };
}

/** Tile size, re-exported so the rasteriser and its tests agree with the atlas. */
export const FACE_TILE = {
  widthPx: PLATE_TILE_WIDTH,
  heightPx: PLATE_TILE_HEIGHT,
  halfPx: PLATE_TEXTURE_SIZE,
} as const;
