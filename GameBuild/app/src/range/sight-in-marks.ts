// Sight-in hit marks (task 2.3c, D7/D9). A per-target "mark layer": a canvas
// whose base is the target art, onto which each shot paints a bright-green disc
// (radius = the bullet's radius mapped to the face) with a black outline, so
// overlapping hits still show distinct edges. Independent of the steel
// target-surface system (that chips paint on 3D steel; this is flat paper).
//
// The face is created EAGERLY (before the art has rasterized) so a shot always
// leaves a visible mark — the base starts white and the art is swapped in via
// `setArt` once it loads (marks are replayed over it). `clean()` wipes marks by
// replaying nothing over the current base for a fresh face (D9), leaving any
// stored zero untouched.

import * as THREE from 'three';

const MARK_FILL = '#22e022'; // bright green
const MARK_OUTLINE = '#101010'; // near-black edge so overlaps read
const OUTLINE_FRACTION = 0.22; // outline width as a fraction of the disc radius
const MIN_MARK_PX = 6; // floor so a distant tiny bullet still leaves a clear dot
const CENTROID_COLOR = '#e000e0'; // magenta ring so the group centre stands out

interface Mark {
  u: number;
  v: number;
  radiusFrac: number;
}

export interface TargetFace {
  /** The canvas-backed texture to map onto the target quad. */
  texture: THREE.CanvasTexture;
  /**
   * Paint a hit. `u`,`v` are face coordinates in [0,1] with the SAME orientation
   * as the art image (v = 0 at the top). `radiusFrac` is the disc radius as a
   * fraction of the face side (bullet radius / target size).
   */
  addMark(u: number, v: number, radiusFrac: number): void;
  /** Overlay the running group-centroid marker at face UV (task 2.3d, D5). */
  setCentroid(u: number, v: number): void;
  /** Remove the centroid marker (e.g. on a dial change / confirm). */
  clearCentroid(): void;
  /** Swap in the rasterized art as the base (marks are replayed over it). */
  setArt(art: CanvasImageSource): void;
  /** Wipe all marks + centroid — a fresh face over the current base (D9). */
  clean(): void;
  /** The backing canvas (for the head-on Inspect view, D10). */
  readonly canvas: HTMLCanvasElement;
  dispose(): void;
}

/**
 * Build a target face. `sizePx` is the canvas resolution; `art` is optional so
 * the face can exist (white) before the art rasterizes and receive it later via
 * `setArt`.
 */
export function createTargetFace(sizePx: number, art?: CanvasImageSource): TargetFace {
  const canvas = document.createElement('canvas');
  canvas.width = sizePx;
  canvas.height = sizePx;
  const ctx = canvas.getContext('2d')!;

  let base: CanvasImageSource | null = art ?? null;
  const marks: Mark[] = [];
  let centroid: { u: number; v: number } | null = null;

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const drawBase = () => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, sizePx, sizePx);
    if (base) ctx.drawImage(base, 0, 0, sizePx, sizePx);
  };
  const drawDisc = (m: Mark) => {
    const x = m.u * sizePx;
    const y = m.v * sizePx;
    const r = Math.max(MIN_MARK_PX, m.radiusFrac * sizePx);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = MARK_FILL;
    ctx.fill();
    ctx.lineWidth = Math.max(1, r * OUTLINE_FRACTION);
    ctx.strokeStyle = MARK_OUTLINE;
    ctx.stroke();
  };
  const drawCentroid = () => {
    if (!centroid) return;
    const x = centroid.u * sizePx;
    const y = centroid.v * sizePx;
    const r = sizePx * 0.03;
    ctx.strokeStyle = CENTROID_COLOR;
    ctx.lineWidth = Math.max(2, sizePx / 512);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.4, y);
    ctx.lineTo(x + r * 1.4, y);
    ctx.moveTo(x, y - r * 1.4);
    ctx.lineTo(x, y + r * 1.4);
    ctx.stroke();
  };
  const redrawAll = () => {
    drawBase();
    for (const m of marks) drawDisc(m);
    drawCentroid();
    texture.needsUpdate = true;
  };
  redrawAll();

  return {
    texture,
    canvas,
    addMark(u, v, radiusFrac) {
      const m = { u, v, radiusFrac };
      marks.push(m);
      // Redraw so the centroid marker stays on top of the fresh splat.
      redrawAll();
    },
    setCentroid(u, v) {
      centroid = { u, v };
      redrawAll();
    },
    clearCentroid() {
      centroid = null;
      redrawAll();
    },
    setArt(a) {
      base = a;
      redrawAll();
    },
    clean() {
      marks.length = 0;
      centroid = null;
      redrawAll();
    },
    dispose() {
      texture.dispose();
    },
  };
}
