// SVG outline parsing + flattening (Design/Plans/target-system-plan.md, task T3b).
//
// A deliberately MINIMAL subset — absolute `M`/`L`/`A`/`Z` plus `<circle>`
// attributes — sized to exactly what the owner's target specs in
// `Documentation/Targets/` actually use. Anything else throws by name rather than
// being silently skipped, because a dropped path command produces a target that is
// subtly the wrong shape and still passes every other check.
//
// WHY THIS EXISTS. Target modules embed the spec's `d` / `cx,cy,r` attributes
// VERBATIM as string constants and flatten them here at module load. That makes the
// art↔zones↔geometry sync test exact string equality against the spec file rather
// than a tolerance comparison of hand-transcribed numbers, and it means one source
// (the SVG) drives the outline, the scoring zones and the rasterised face.
//
// THE REFERENCE FRAME IS THE OUTLINE'S. Every shape in a drawing normalises against
// the OUTLINE's bounding box, never its own — normalising a zone against its own
// bbox stretches it to fill the target, which is a real mistake that a T1 test
// caught. `svgFrameOf(outline)` produces that frame once and everything else takes
// it as an argument, so the mistake is hard to make.
//
// Pure: no DOM, no XML parser, no THREE.

import { aspectOf, bounds } from './target-geometry';
import type { Point, ZoneShape } from './target-type';

/** Max sagitta (px) allowed between a flattened chord and the true arc. 0.25 px
 *  against outlines a few hundred px wide is far below the accuracy of the trace
 *  itself, so flattening is never the limiting error. */
const ARC_TOLERANCE_PX = 0.25;

/** The reference frame for one drawing: the outline's bounding box in SVG pixels. */
export interface SvgFrame {
  /** Outline bbox width (px) — the ONE scale both axes divide by. */
  widthPx: number;
  /** Outline bbox centre (px). */
  cxPx: number;
  cyPx: number;
}

/** Derive the drawing's reference frame from its outline points (in SVG px). */
export function svgFrameOf(outlinePx: readonly Point[]): SvgFrame {
  const b = bounds(outlinePx);
  return {
    widthPx: b.maxX - b.minX,
    cxPx: (b.minX + b.maxX) / 2,
    cyPx: (b.minY + b.maxY) / 2,
  };
}

/**
 * SVG pixels (y DOWN) → the target's width-normalised local frame (y UP).
 *
 * Both axes divide by the SAME number (`widthPx`), which is what keeps the frame
 * isotropic so a circle stays a circle — see `target-type.ts`'s header.
 */
export function toLocal(p: Point, frame: SvgFrame): Point {
  return { x: (p.x - frame.cxPx) / frame.widthPx, y: -(p.y - frame.cyPx) / frame.widthPx };
}

// --- path parsing -----------------------------------------------------------

/** Split path data into command letters and numbers. Handles comma or whitespace
 *  separators, signed and decimal numbers, and exponent notation. */
function tokenize(d: string): (string | number)[] {
  const out: (string | number)[] = [];
  const re = /([A-Za-z])|(-?\d*\.?\d+(?:[eE][-+]?\d+)?)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(d)) !== null) {
    out.push(m[1] !== undefined ? m[1] : Number(m[2]));
  }
  return out;
}

function num(tokens: (string | number)[], i: number, cmd: string): number {
  const v = tokens[i];
  if (typeof v !== 'number')
    throw new Error(`svg-outline: '${cmd}' expected a number at token ${i}, got ${String(v)}`);
  return v;
}

/**
 * Flatten one elliptical-arc command into points (excluding the start point),
 * using the SVG spec's endpoint→centre parameterisation (F.6.5).
 *
 * Only circular arcs (rx === ry, no rotation) appear in the shipped specs, but the
 * general form costs nothing extra and refusing it would be an arbitrary limit.
 */
function flattenArc(
  from: Point,
  rxIn: number,
  ryIn: number,
  xRotDeg: number,
  largeArc: boolean,
  sweep: boolean,
  to: Point,
): Point[] {
  // Degenerate radii ⇒ a straight line, per the spec.
  let rx = Math.abs(rxIn);
  let ry = Math.abs(ryIn);
  if (rx === 0 || ry === 0) return [to];

  const phi = (xRotDeg * Math.PI) / 180;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);

  const dx2 = (from.x - to.x) / 2;
  const dy2 = (from.y - to.y) / 2;
  const x1p = cosPhi * dx2 + sinPhi * dy2;
  const y1p = -sinPhi * dx2 + cosPhi * dy2;

  // Scale up radii that are too small to span the endpoints (spec F.6.6).
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    const s = Math.sqrt(lambda);
    rx *= s;
    ry *= s;
  }

  const sign = largeArc === sweep ? -1 : 1;
  const numer = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const denom = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, numer / denom));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (-coef * ry * x1p) / rx;

  const cx = cosPhi * cxp - sinPhi * cyp + (from.x + to.x) / 2;
  const cy = sinPhi * cxp + cosPhi * cyp + (from.y + to.y) / 2;

  const angleOf = (px: number, py: number) => Math.atan2((py - cyp) / ry, (px - cxp) / rx);
  const theta1 = angleOf(x1p, y1p);
  let dTheta = angleOf(-x1p, -y1p) - theta1;
  if (!sweep && dTheta > 0) dTheta -= 2 * Math.PI;
  if (sweep && dTheta < 0) dTheta += 2 * Math.PI;

  // Segment count from the sagitta bound: err = r(1 − cos(θ/2)).
  const rMax = Math.max(rx, ry);
  const maxStep =
    ARC_TOLERANCE_PX >= rMax
      ? Math.PI / 2
      : 2 * Math.acos(1 - ARC_TOLERANCE_PX / rMax);
  const steps = Math.max(1, Math.ceil(Math.abs(dTheta) / maxStep));

  const pts: Point[] = [];
  for (let i = 1; i <= steps; i++) {
    const t = theta1 + (dTheta * i) / steps;
    const ex = rx * Math.cos(t);
    const ey = ry * Math.sin(t);
    pts.push({ x: cosPhi * ex - sinPhi * ey + cx, y: sinPhi * ex + cosPhi * ey + cy });
  }
  // Pin the final point to the authored endpoint so a closed path closes exactly.
  pts[pts.length - 1] = { x: to.x, y: to.y };
  return pts;
}

/**
 * Parse an SVG path `d` string into a closed ring of points, in SVG pixel space.
 *
 * Supports absolute `M`, `L`, `A`, `Z` only. Relative commands and curves throw by
 * name — the shipped specs use none of them, and silently ignoring a `C` would
 * produce a plausible-looking but wrong silhouette.
 */
export function parsePath(d: string): Point[] {
  const tokens = tokenize(d);
  const pts: Point[] = [];
  let cursor: Point | null = null;
  let i = 0;
  let closed = false;

  while (i < tokens.length) {
    const cmd = tokens[i];
    if (typeof cmd !== 'string')
      throw new Error(`svg-outline: expected a command letter at token ${i}, got ${cmd}`);
    i++;
    switch (cmd) {
      case 'M':
      case 'L': {
        // Both take repeatable coordinate pairs; a repeated pair after M is an L.
        do {
          const x = num(tokens, i, cmd);
          const y = num(tokens, i + 1, cmd);
          i += 2;
          cursor = { x, y };
          pts.push(cursor);
        } while (typeof tokens[i] === 'number');
        break;
      }
      case 'A': {
        if (!cursor) throw new Error("svg-outline: 'A' before any 'M'");
        do {
          const rx = num(tokens, i, cmd);
          const ry = num(tokens, i + 1, cmd);
          const rot = num(tokens, i + 2, cmd);
          const large = num(tokens, i + 3, cmd) !== 0;
          const sweep = num(tokens, i + 4, cmd) !== 0;
          const x = num(tokens, i + 5, cmd);
          const y = num(tokens, i + 6, cmd);
          i += 7;
          const arc = flattenArc(cursor!, rx, ry, rot, large, sweep, { x, y });
          pts.push(...arc);
          cursor = arc[arc.length - 1];
        } while (typeof tokens[i] === 'number');
        break;
      }
      case 'Z':
      case 'z':
        closed = true;
        break;
      default:
        throw new Error(
          `svg-outline: unsupported path command '${cmd}' — only absolute M, L, A and Z are supported`,
        );
    }
  }

  if (!closed) throw new Error('svg-outline: path is not closed (no Z)');
  if (pts.length < 3) throw new Error(`svg-outline: path has only ${pts.length} point(s)`);
  // A path that returns to its start leaves a duplicate vertex; a closed ring must
  // not repeat it or the ring has a zero-length edge.
  const first = pts[0];
  const last = pts[pts.length - 1];
  if (Math.hypot(last.x - first.x, last.y - first.y) < 1e-9) pts.pop();
  return pts;
}

/** Signed area (shoelace). Positive = counter-clockwise in a y-UP frame. */
export function signedArea(ring: readonly Point[]): number {
  let a = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    a += ring[j].x * ring[i].y - ring[i].x * ring[j].y;
  }
  return a / 2;
}

/** Force a ring counter-clockwise in the y-up local frame. Triangulation and
 *  outward face winding (T4) both depend on a known orientation, and an SVG author
 *  has no reason to have picked one. */
export function toCcw(ring: readonly Point[]): Point[] {
  const pts = ring.map((p) => ({ ...p }));
  return signedArea(pts) < 0 ? pts.reverse() : pts;
}

// --- the two public entry points --------------------------------------------

export interface FlattenedOutline {
  /** Closed CCW ring in the width-normalised local frame. */
  points: Point[];
  /** The drawing's reference frame — pass to `localCircle`/`localPolygon`. */
  frame: SvgFrame;
  /** height ÷ width of the outline, i.e. `TargetType.aspect`. */
  aspect: number;
}

/** Parse a target's OUTLINE path and establish the drawing's reference frame. */
export function flattenOutline(d: string): FlattenedOutline {
  const px = parsePath(d);
  const frame = svgFrameOf(px);
  const points = toCcw(px.map((p) => toLocal(p, frame)));
  return { points, frame, aspect: aspectOf(points) };
}

/** An SVG `<circle>` → a local-frame circular zone, against the outline's frame. */
export function localCircle(cxPx: number, cyPx: number, rPx: number, frame: SvgFrame): ZoneShape {
  if (!(rPx > 0)) throw new Error(`svg-outline: circle needs r > 0, got ${rPx}`);
  const c = toLocal({ x: cxPx, y: cyPx }, frame);
  return { kind: 'circle', cx: c.x, cy: c.y, r: rPx / frame.widthPx };
}

/** An inner SVG path → a local-frame polygon zone, against the outline's frame. */
export function localPolygon(d: string, frame: SvgFrame): ZoneShape {
  return { kind: 'polygon', points: toCcw(parsePath(d).map((p) => toLocal(p, frame))) };
}
