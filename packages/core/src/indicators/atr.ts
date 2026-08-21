import type { Bar, Series } from '../types.js';
import { wilderSmooth } from './moving-average.js';

/**
 * Average True Range (Wilder, 14 periods by default), in paise.
 *
 * True range is the greatest of: high−low, |high−prevClose|, |low−prevClose|.
 * The gap terms are what make ATR react to overnight moves rather than only
 * intraday spread.
 */
export function atr(bars: readonly Bar[], period = 14): Series {
  const out: (number | null)[] = new Array(bars.length).fill(null);
  if (bars.length < 2) return out;

  const trueRanges: number[] = [];
  for (let i = 1; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (bar === undefined || prev === undefined) continue;
    trueRanges.push(
      Math.max(bar.high - bar.low, Math.abs(bar.high - prev.close), Math.abs(bar.low - prev.close)),
    );
  }

  const smoothed = wilderSmooth(trueRanges, period);
  for (let i = 0; i < smoothed.length; i += 1) {
    const value = smoothed[i];
    if (value === null || value === undefined) continue;
    out[i + 1] = Math.round(value);
  }
  return out;
}
