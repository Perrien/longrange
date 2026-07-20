// Sight-in target face art (task 2.3c/2.3d). Two paths:
//  • `drawZeroingTarget` — draws the zeroing grid PROCEDURALLY (guaranteed to
//    render on every browser; the immediate face + fallback).
//  • `rasterizeSightInArt` — rasterizes the DELIVERED OK2A SVG (D7), swapped over
//    the procedural grid once it loads (SightInScene), kept only if it succeeds.
//
// Both produce the same 22-cell layout (1-unit border + 20×20 inner grid,
// calibrated so one square ≈ 1 MOA at 100 yd / 0.2 MIL at 100 m — D5). The
// procedural draw exists because the delivered SVG (physical in/cm units) can
// rasterize to a blank image on some WebKit builds; seeding procedurally first
// means the target is never invisible.

/** Grid cells across the face: 1-unit border + 20 grid + 1-unit border = 22
 *  (MOA 22 in, MIL 44 cm ÷ 2 cm) — identical structure for both variants. */
const CELLS = 22;

/** Draw the zeroing target to a fresh square canvas and return it. */
export function drawZeroingTarget(sizePx: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;
  const cell = sizePx / CELLS;

  // Paper.
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, sizePx, sizePx);

  // Thin inner grid (lines 1..21), inside the 1-cell border.
  ctx.strokeStyle = '#7f96a8';
  ctx.lineWidth = Math.max(1, sizePx / 1024);
  ctx.beginPath();
  for (let i = 1; i <= CELLS - 1; i++) {
    const p = i * cell;
    ctx.moveTo(p, cell);
    ctx.lineTo(p, sizePx - cell);
    ctx.moveTo(cell, p);
    ctx.lineTo(sizePx - cell, p);
  }
  ctx.stroke();

  // Border frame (the 1-unit margin).
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = Math.max(2, sizePx / 512);
  ctx.strokeRect(cell, cell, sizePx - 2 * cell, sizePx - 2 * cell);

  // Emphasised centre cross (line 11).
  const c = 11 * cell;
  ctx.strokeStyle = '#c0392b';
  ctx.lineWidth = Math.max(2, sizePx / 400);
  ctx.beginPath();
  ctx.moveTo(c, cell);
  ctx.lineTo(c, sizePx - cell);
  ctx.moveTo(cell, c);
  ctx.lineTo(sizePx - cell, c);
  ctx.stroke();

  // Five diamond bullseyes (centre + quadrant centres) with orange aim points.
  const r = cell * 1.7;
  for (const [gx, gy] of [
    [11, 11],
    [6, 6],
    [16, 6],
    [6, 16],
    [16, 16],
  ]) {
    drawDiamond(ctx, gx * cell, gy * cell, r);
  }

  return canvas;
}

function drawDiamond(ctx: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.strokeStyle = '#111111';
  ctx.lineWidth = Math.max(2, r * 0.06);
  ctx.stroke();
  ctx.fillStyle = '#ff7000';
  ctx.beginPath();
  ctx.arc(x, y, r * 0.3, 0, Math.PI * 2);
  ctx.fill();
}

// --- Delivered SVG art (D7) -------------------------------------------------
// Rasterize the delivered `zeroing-target-<variant>.svg` (bundled in public/,
// precached — §4.7) to a canvas. Used as the PREFERRED face art, swapped over the
// procedural grid once it loads (SightInScene). Robust to WebKit's physical-unit
// quirk: fetch the SVG text, force the root width/height to pixels (the viewBox
// keeps the artwork scaling), and rasterize via a blob URL. Rejects if the asset
// can't be fetched/decoded, so the caller can keep the procedural fallback.
export async function rasterizeSightInArt(
  artVariant: 'moa' | 'mil',
  sizePx: number,
): Promise<HTMLCanvasElement> {
  const url = `${import.meta.env.BASE_URL}zeroing-target-${artVariant}.svg`;
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`sight-in-target-texture: fetch ${url} → ${resp.status}`);
  let svgText = await resp.text();
  svgText = svgText.replace(
    /<svg([^>]*?)\swidth="[^"]*"([^>]*?)\sheight="[^"]*"/,
    `<svg$1 width="${sizePx}"$2 height="${sizePx}"`,
  );
  // The hairline grid strokes (0.008 in / 0.016 cm ≈ 0.7 px at raster) antialias
  // to faint grey when the face is viewed large (Inspect). Thicken the thin/medium
  // grid lines (< 0.03 units) 3× so they read; leave the bold frame/centre/
  // bullseye strokes (≥ 0.03) untouched.
  svgText = svgText.replace(/stroke-width="([\d.]+)"/g, (_m, w) => {
    const v = parseFloat(w);
    return `stroke-width="${(v < 0.03 ? v * 3 : v).toFixed(4)}"`;
  });
  const blob = new Blob([svgText], { type: 'image/svg+xml' });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error(`sight-in-target-texture: failed to decode ${url}`));
      el.src = objectUrl;
    });
    const canvas = document.createElement('canvas');
    canvas.width = sizePx;
    canvas.height = sizePx;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('sight-in-target-texture: no 2D context');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sizePx, sizePx);
    ctx.drawImage(img, 0, 0, sizePx, sizePx);
    return canvas;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
