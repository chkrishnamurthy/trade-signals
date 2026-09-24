/**
 * Pure chart maths (unit-tested). Points are closes in paise; geometry is in
 * floating-point *pixels*, which is presentation only — no price arithmetic
 * happens here, and every label goes back through `formatPaise`.
 */

export interface ChartPoint {
  readonly t: number;
  readonly c: number;
}

export interface ChartGeometry {
  readonly path: string;
  readonly area: string;
  readonly min: number;
  readonly max: number;
  readonly xs: readonly number[];
  readonly ys: readonly number[];
}

export function chartGeometry(
  points: readonly ChartPoint[],
  width: number,
  height: number,
  pad = 4,
): ChartGeometry | null {
  if (points.length < 2 || width <= 0 || height <= 0) return null;
  let min = Number.POSITIVE_INFINITY;
  let max = Number.NEGATIVE_INFINITY;
  for (const p of points) {
    if (p.c < min) min = p.c;
    if (p.c > max) max = p.c;
  }
  const span = max - min || 1;
  const innerH = height - pad * 2;
  const step = width / (points.length - 1);
  const xs = points.map((_, i) => i * step);
  const ys = points.map((p) => pad + innerH - ((p.c - min) / span) * innerH);
  const path = xs
    .map((x, i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)},${(ys[i] ?? 0).toFixed(1)}`)
    .join(' ');
  const area = `${path} L${width.toFixed(1)},${height} L0,${height} Z`;
  return { path, area, min, max, xs, ys };
}

/** Index of the point nearest an x coordinate. */
export function nearestIndex(x: number, width: number, count: number): number {
  if (count <= 1 || width <= 0) return 0;
  const i = Math.round((x / width) * (count - 1));
  return Math.min(count - 1, Math.max(0, i));
}

/** Normalise the API's bar time (epoch ms or ISO string) to epoch ms. */
export function barTime(t: number | string): number {
  return typeof t === 'number' ? t : Date.parse(t);
}
