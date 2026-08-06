// Face rasteriser (Design/archive/target-system-plan.md §5b, task T6c).
//
// Deliberately dumb: it replays T6b's draw-op list onto a 2D context, reads the bytes
// back, and hands them to `PlateSurface.setBaseLayer`. Every decision about colour,
// coordinates and ordering was already made by `planFace`; if you are tempted to make
// a choice here, it belongs there instead, where it can be unit-tested.
//
// ── WHY THE CANVAS IS NOT TRANSFORMED ─────────────────────────────────────────
// The atlas buffer's row 0 is the plate's BOTTOM (`v = 0.5 + y`, y up,
// `texture.flipY = false`; see `face-plan.ts` trap 2). `getImageData` returns row 0
// as the canvas TOP. Those line up if op coordinates are used as canvas coordinates
// 1:1 — so no global flip. The canvas therefore looks vertically mirrored if you ever
// display it, which does not matter because only its bytes are read. The one thing
// that DOES need flipping is a bitmap, because an image's own row 0 is its top; that
// is what `flipY` on an `image` op means.
//
// Canvas + image loading are INJECTED, so the replay is testable against a mocked
// context without a `canvas` package (forbidden by execution-protocol §3) and without
// a DOM.

import { PLATE_LAYER_BYTES } from '../plate-surface';
import type { DrawOp, FacePlan } from './face-plan';

/** Art id → URL under `public/`. Resolved through `import.meta.env.BASE_URL` so it
 *  works under the PWA's base path, matching `range/paper-target-texture.ts`. */
const ART_PATHS: Record<string, string> = {
  idpa: 'targets/idpa-target.svg',
};

/** The URL for an art id; throws on an unknown id (a programming error). */
export function artUrl(artId: string): string {
  const path = ART_PATHS[artId];
  if (!path)
    throw new Error(
      `face-raster: unknown artId '${artId}' — known: ${Object.keys(ART_PATHS).join(', ')}`,
    );
  return `${import.meta.env.BASE_URL}${path}`;
}

/** The slice of `CanvasRenderingContext2D` the replay uses. */
export interface FaceContext {
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  fillRect(x: number, y: number, w: number, h: number): void;
  beginPath(): void;
  closePath(): void;
  moveTo(x: number, y: number): void;
  lineTo(x: number, y: number): void;
  ellipse(
    cx: number,
    cy: number,
    rx: number,
    ry: number,
    rotation: number,
    start: number,
    end: number,
  ): void;
  fill(): void;
  stroke(): void;
  save(): void;
  restore(): void;
  translate(x: number, y: number): void;
  scale(x: number, y: number): void;
  drawImage(img: unknown, x: number, y: number, w: number, h: number): void;
}

export interface FaceRasterDeps {
  /** A drawing surface of the plan's size, plus a way to read its bytes back. */
  makeSurface(widthPx: number, heightPx: number): { ctx: FaceContext; readRgba(): Uint8Array };
  /** Decode one art asset. Rejecting (or resolving null) skips just that op. */
  loadImage(artId: string): Promise<unknown | null>;
}

/** `0xRRGGBB` → a CSS colour the 2D context accepts. */
export function cssColor(hex: number): string {
  return `#${(hex & 0xffffff).toString(16).padStart(6, '0')}`;
}

function tracePolygon(ctx: FaceContext, points: readonly { x: number; y: number }[]): void {
  ctx.beginPath();
  points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
  ctx.closePath();
}

/** Apply a shape op's fill then stroke. Fill before stroke so an outline sits ON the
 *  fill rather than half under it. */
function paintPath(
  ctx: FaceContext,
  op: Extract<DrawOp, { kind: 'ellipse' | 'polygon' }>,
): void {
  if (op.fill !== undefined) {
    ctx.fillStyle = cssColor(op.fill);
    ctx.fill();
  }
  if (op.stroke !== undefined) {
    ctx.strokeStyle = cssColor(op.stroke);
    ctx.lineWidth = op.strokeWidthPx ?? 1;
    ctx.stroke();
  }
}

/**
 * Rasterise a planned face into one plate-atlas layer.
 *
 * `image` ops whose asset fails to load are SKIPPED — the rest of the stack still
 * renders, which is why the `fill`/`zones` layers under the art double as the
 * fallback instead of needing a separate code path.
 */
export async function rasterizeFace(plan: FacePlan, deps: FaceRasterDeps): Promise<Uint8Array> {
  const { ctx, readRgba } = deps.makeSurface(plan.widthPx, plan.heightPx);

  // Resolve every distinct art id up front: one fetch per asset even if both faces
  // reference it, and a failure is known before the replay starts.
  const artIds = [...new Set(plan.ops.filter((o) => o.kind === 'image').map((o) => o.artId))];
  const images = new Map<string, unknown>();
  for (const artId of artIds) {
    try {
      const img = await deps.loadImage(artId);
      if (img) images.set(artId, img);
    } catch {
      // Left out of the map ⇒ its ops are skipped below. Not fatal: a target with no
      // art is still a legible target.
    }
  }

  for (const op of plan.ops) {
    switch (op.kind) {
      case 'fill':
        ctx.fillStyle = cssColor(op.color);
        ctx.fillRect(0, 0, plan.widthPx, plan.heightPx);
        break;
      case 'image': {
        const img = images.get(op.artId);
        if (!img) break; // the skip path
        ctx.save();
        // An image's row 0 is its TOP, but this buffer's row 0 is the plate's BOTTOM,
        // so the bitmap is drawn mirrored in y.
        ctx.translate(op.x, op.y + op.h);
        ctx.scale(1, -1);
        ctx.drawImage(img, 0, 0, op.w, op.h);
        ctx.restore();
        break;
      }
      case 'ellipse':
        ctx.beginPath();
        ctx.ellipse(op.cx, op.cy, op.rx, op.ry, 0, 0, Math.PI * 2);
        paintPath(ctx, op);
        break;
      case 'polygon':
        tracePolygon(ctx, op.points);
        paintPath(ctx, op);
        break;
    }
  }

  const rgba = readRgba();
  if (rgba.length !== PLATE_LAYER_BYTES)
    throw new Error(
      `face-raster: surface produced ${rgba.length} bytes, expected ${PLATE_LAYER_BYTES}`,
    );
  // Force full opacity. A canvas starts transparent, so any texel no layer covered
  // would otherwise read as a HOLE in the steel rather than as bare plate — the same
  // reason `buildBullseyeLayer` makes every texel opaque including outside the disc.
  for (let i = 3; i < rgba.length; i += 4) rgba[i] = 255;
  // NB: a target's HOLES are not punched here. They are mesh geometry
  // (`TargetType.holeZoneIds` → `plate-outline-geometry.ts`), so the texels behind a
  // window are simply never sampled and their colour does not matter. An earlier
  // pass zeroed their alpha for an `alphaTest` discard; that cost 60 FPS → ~10 on
  // device and is gone (see `plate-surface.ts`'s `createPlateMaterial`).
  return rgba;
}

/** The browser surface + image loader. Not exercised by unit tests (there is no
 *  canvas in the node env) — its correctness is the T6c owner check. */
export function browserFaceDeps(): FaceRasterDeps {
  return {
    makeSurface(widthPx, heightPx) {
      const canvas = document.createElement('canvas');
      canvas.width = widthPx;
      canvas.height = heightPx;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('face-raster: 2D context unavailable');
      return {
        ctx: ctx as unknown as FaceContext,
        readRgba: () => new Uint8Array(ctx.getImageData(0, 0, widthPx, heightPx).data),
      };
    },
    async loadImage(artId) {
      // Same fetch-from-public path `range/paper-target-texture.ts` uses for the
      // zeroing art, so both go through one precache story.
      const res = await fetch(artUrl(artId));
      if (!res.ok) return null;
      const blob = await res.blob();
      try {
        return await createImageBitmap(blob);
      } catch {
        return null;
      }
    },
  };
}
