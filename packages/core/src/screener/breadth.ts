import { ema } from '../indicators/moving-average.js';
import type { Bar } from '../types.js';
import { barDateKey } from './supplementary.js';

/**
 * Market breadth, built bottom-up: each stock contributes one point per
 * session, and the job sums points across the universe. Computing from each
 * stock's own adjusted series keeps a split from reading as a mass decline.
 */

export interface BreadthPoint {
  readonly date: string;
  /** +1 advance, −1 decline, 0 unchanged. */
  readonly move: -1 | 0 | 1;
  /** Null while the EMA is still warming up — excluded from that day's base. */
  readonly above20: boolean | null;
  readonly above50: boolean | null;
  readonly above200: boolean | null;
  /** Null without a full prior year — excluded from that day's base. */
  readonly newHigh52: boolean | null;
  readonly newLow52: boolean | null;
}

/** One point per session for the last `sessions` bars. */
export function breadthPoints(bars: readonly Bar[], sessions = 260): BreadthPoint[] {
  const closes = bars.map((b) => b.close);
  const e20 = ema(closes, 20);
  const e50 = ema(closes, 50);
  const e200 = ema(closes, 200);
  const out: BreadthPoint[] = [];
  const start = Math.max(1, bars.length - sessions);
  for (let i = start; i < bars.length; i += 1) {
    const bar = bars[i];
    const prev = bars[i - 1];
    if (bar === undefined || prev === undefined) continue;
    const above = (series: readonly (number | null)[]): boolean | null => {
      const v = series[i];
      return v === null || v === undefined ? null : bar.close > v;
    };
    let newHigh52: boolean | null = null;
    let newLow52: boolean | null = null;
    if (i >= 251) {
      const window = bars.slice(i - 251, i);
      newHigh52 = bar.high > Math.max(...window.map((b) => b.high));
      newLow52 = bar.low < Math.min(...window.map((b) => b.low));
    }
    out.push({
      date: barDateKey(bar.timestamp),
      move: bar.close > prev.close ? 1 : bar.close < prev.close ? -1 : 0,
      above20: above(e20),
      above50: above(e50),
      above200: above(e200),
      newHigh52,
      newLow52,
    });
  }
  return out;
}

export interface BreadthDay {
  readonly date: string;
  readonly advances: number;
  readonly declines: number;
  readonly unchanged: number;
  readonly above20: number;
  readonly base20: number;
  readonly above50: number;
  readonly base50: number;
  readonly above200: number;
  readonly base200: number;
  readonly newHighs: number;
  readonly newLows: number;
  readonly base52: number;
}

/** Sums per-stock points into one row per session, oldest first. */
export function aggregateBreadth(perStock: readonly (readonly BreadthPoint[])[]): BreadthDay[] {
  const days = new Map<string, { -readonly [K in keyof BreadthDay]: BreadthDay[K] }>();
  for (const points of perStock) {
    for (const p of points) {
      let day = days.get(p.date);
      if (day === undefined) {
        day = {
          date: p.date,
          advances: 0,
          declines: 0,
          unchanged: 0,
          above20: 0,
          base20: 0,
          above50: 0,
          base50: 0,
          above200: 0,
          base200: 0,
          newHighs: 0,
          newLows: 0,
          base52: 0,
        };
        days.set(p.date, day);
      }
      if (p.move === 1) day.advances += 1;
      else if (p.move === -1) day.declines += 1;
      else day.unchanged += 1;
      if (p.above20 !== null) {
        day.base20 += 1;
        if (p.above20) day.above20 += 1;
      }
      if (p.above50 !== null) {
        day.base50 += 1;
        if (p.above50) day.above50 += 1;
      }
      if (p.above200 !== null) {
        day.base200 += 1;
        if (p.above200) day.above200 += 1;
      }
      if (p.newHigh52 !== null && p.newLow52 !== null) {
        day.base52 += 1;
        if (p.newHigh52) day.newHighs += 1;
        if (p.newLow52) day.newLows += 1;
      }
    }
  }
  return [...days.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
}
