import { fromIstParts } from '@equitywise/shared';
import type { Bar } from '../types.js';

/**
 * Hand-built ORB-VC fixtures. Every expected value in the tests next to this
 * file was computed by hand from these numbers (see the comments), never by
 * running the code under test.
 *
 * Session under test: 2026-09-17 (Thursday). Four prior sessions of flat
 * five-minute bars provide the 250-bar warm-up and the volume baseline.
 */
export const SESSION = { year: 2026, month: 9, day: 17 };
export const PRIOR_SESSIONS = [
  { year: 2026, month: 9, day: 11 },
  { year: 2026, month: 9, day: 14 },
  { year: 2026, month: 9, day: 15 },
  { year: 2026, month: 9, day: 16 },
];
export const TICK = 5;

export function ist(
  day: { year: number; month: number; day: number },
  hour: number,
  minute: number,
  second = 0,
): number {
  return fromIstParts({ ...day, hour, minute, second }).getTime();
}
export const SESSION_OPEN = ist(SESSION, 9, 15);

const bar = (timestamp: number, o: number, h: number, l: number, c: number, v: number): Bar => ({
  timestamp,
  open: o,
  high: h,
  low: l,
  close: c,
  volume: v,
});

/** 75 flat bars per prior session: o 2940.00 h 2942.00 l 2938.00 c 2940.00, 40,000 each. */
export function priorSessionBars(): Bar[] {
  const out: Bar[] = [];
  for (const day of PRIOR_SESSIONS) {
    const open = ist(day, 9, 15);
    for (let i = 0; i < 75; i += 1)
      out.push(bar(open + i * 300_000, 294_000, 294_200, 293_800, 294_000, 40_000));
  }
  return out;
}

/**
 * Today's first six candles, identical for the BUY and SELL cases.
 *   09:15, 09:20, 09:25 — opening range: o 2940.00 h 2950.00 l 2936.00 c 2945.00, 50,000 each
 *     → OR high 295000, low 293600, mid 294300, width 1400 = 47.57 bps
 *     → typical price round((295000+293600+294500)/3) = 294367
 *   09:30, 09:35, 09:40 — inside the range: o/h/l/c 2945.00/2948.00/2942.00/2945.00, 40,000 each
 *     → typical price 294500
 */
export function todayPreamble(): Bar[] {
  const out: Bar[] = [];
  for (let i = 0; i < 3; i += 1)
    out.push(bar(SESSION_OPEN + i * 300_000, 294_000, 295_000, 293_600, 294_500, 50_000));
  for (let i = 3; i < 6; i += 1)
    out.push(bar(SESSION_OPEN + i * 300_000, 294_500, 294_800, 294_200, 294_500, 40_000));
  return out;
}

/**
 * BUY signal candle 09:45–09:50: o 2948.00 h 2957.00 l 2947.00 c 2956.40, 75,000.
 *   body 840 / range 1000 = 0.84; close − OR high = 640 → 21.69 bps
 *   typical price round((295700+294700+295640)/3) = 295347
 *   VWAP = (294367×150000 + 294500×120000 + 295347×75000) / 345000
 *        = 101,646,075,000 / 345,000 = 294,626.3 → 294626
 *   baseline = (14 prior × 40,000 + 3 × 50,000 + 3 × 40,000) / 20 = 830,000 / 20 = 41,500
 *   relative volume = 75,000 / 41,500 = 1.8072
 *   stop = 293600 − floor(293600 × 5 / 10000 = 146.8) = 293454 → 293450 (tick 5, down)
 *   risk distance = 295640 − 293450 = 2190 (0.74 %); T1 297830; T2 300020
 */
export const BUY_SIGNAL_BAR = bar(
  SESSION_OPEN + 6 * 300_000,
  294_800,
  295_700,
  294_700,
  295_640,
  75_000,
);
export const BUY_SIGNAL_AT = SESSION_OPEN + 7 * 300_000; // 09:50:00
export const BUY_EXPECTED = Object.freeze({
  openingRange: {
    high: 295_000,
    low: 293_600,
    mid: 294_300,
    rangeBps: 14_000_000 / 294_300,
    completeAt: SESSION_OPEN + 900_000,
  },
  vwap: 294_626,
  relativeVolume: 75_000 / 41_500,
  bodyRatio: 0.84,
  extensionBps: 6_400_000 / 295_000,
  levels: {
    ref: 295_640,
    stop: 293_450,
    target1: 297_830,
    target2: 300_020,
    riskDistance: 2_190,
    tickSize: TICK,
  },
});

/**
 * SELL signal candle 09:45–09:50: o 2938.00 h 2939.00 l 2929.00 c 2930.00, 75,000.
 *   body 800 / range 1000 = 0.80; OR low − close = 600 → 20.44 bps
 *   typical price round((293900+292900+293000)/3) = 293267
 *   VWAP = (44,155,050,000 + 35,340,000,000 + 293267×75000) / 345000
 *        = 101,490,075,000 / 345,000 = 294,174.1 → 294174
 *   stop = 295000 + floor(295000 × 5 / 10000 = 147.5) = 295147 → 295150 (tick 5, up)
 *   risk distance = 295150 − 293000 = 2150 (0.73 %); T1 290850; T2 288700
 */
export const SELL_SIGNAL_BAR = bar(
  SESSION_OPEN + 6 * 300_000,
  293_800,
  293_900,
  292_900,
  293_000,
  75_000,
);
export const SELL_EXPECTED = Object.freeze({
  vwap: 294_174,
  bodyRatio: 0.8,
  extensionBps: 6_000_000 / 293_600,
  levels: {
    ref: 293_000,
    stop: 295_150,
    target1: 290_850,
    target2: 288_700,
    riskDistance: 2_150,
    tickSize: TICK,
  },
});

export function buySession(): Bar[] {
  return [...priorSessionBars(), ...todayPreamble(), BUY_SIGNAL_BAR];
}
export function sellSession(): Bar[] {
  return [...priorSessionBars(), ...todayPreamble(), SELL_SIGNAL_BAR];
}

/** 21 daily bars ending the previous session: close 2940.00, 1,000,000 shares → ₹294 crore turnover. */
export function dailyBars(): Bar[] {
  const out: Bar[] = [];
  for (let i = 21; i >= 1; i -= 1) {
    const day = fromIstParts({ year: 2026, month: 8, day: 1 });
    out.push(
      bar(day.getTime() + (30 - i) * 86_400_000, 294_000, 295_000, 293_000, 294_000, 1_000_000),
    );
  }
  return out;
}
export const SESSION_INPUT = { daily: dailyBars(), indexMoveBps: 50 };
