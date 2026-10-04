/**
 * Axis scales for the hand-drawn SVG charts.
 *
 * Pure and integer-friendly: given a data range it returns round tick values
 * (1 / 2 / 2.5 / 5 × a power of ten) that bracket the data, so an axis reads
 * `0 · 2,000 · 4,000` rather than `0 · 1,873 · 3,746`. Money scales pass
 * paise straight in — every step at or above one paise is a whole number, so
 * the ticks stay integer paise and only the label formatter converts units.
 */

export interface NiceScale {
  /** The lowest tick — the bottom of the axis. */
  readonly min: number;
  /** The highest tick — the top of the axis. */
  readonly max: number;
  readonly step: number;
  /** Every tick from `min` to `max` inclusive, ascending. */
  readonly ticks: readonly number[];
}

/** The round number nearest above `raw` from the 1 / 2 / 2.5 / 5 / 10 ladder. */
export function niceStep(raw: number): number {
  if (!Number.isFinite(raw) || raw <= 0) return 1;
  const exponent = Math.floor(Math.log10(raw));
  const magnitude = 10 ** exponent;
  const fraction = raw / magnitude;
  const nice =
    fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 2.5 ? 2.5 : fraction <= 5 ? 5 : 10;
  return nice * magnitude;
}

/**
 * Round ticks covering `[min, max]` with roughly `target` intervals.
 *
 * `integer` floors the step at 1, for values that are counts or paise and must
 * never be split. A flat range is widened around its value so the axis still
 * has height.
 */
export function niceScale(
  min: number,
  max: number,
  options: { readonly target?: number; readonly integer?: boolean } = {},
): NiceScale {
  const target = Math.max(1, options.target ?? 5);
  let lo = Number.isFinite(min) ? min : 0;
  let hi = Number.isFinite(max) ? max : 0;
  if (lo > hi) [lo, hi] = [hi, lo];
  if (lo === hi) {
    const pad = lo === 0 ? 1 : Math.abs(lo) * 0.1;
    lo -= pad;
    hi += pad;
  }

  let step = niceStep((hi - lo) / target);
  if (options.integer === true) step = Math.max(1, Math.round(step));

  const first = Math.floor(lo / step);
  const last = Math.ceil(hi / step);
  const ticks: number[] = [];
  // Ticks are built from integer multiples rather than by repeated addition,
  // which would accumulate floating-point drift on fractional steps.
  for (let k = first; k <= last; k += 1) ticks.push(k * step);

  return { min: first * step, max: last * step, step, ticks };
}
