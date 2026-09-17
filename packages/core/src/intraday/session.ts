import type { IntradayRejectReason } from '@equitywise/shared';
import type { Bar } from '../types.js';
import { validBar } from './bars.js';
import { ORB_CONFIG, type OrbConfig } from './config.js';

/**
 * Day-level eligibility, decided once the opening range is complete and then
 * fixed for the session. `daily` is the stock's daily candles ending with the
 * previous session; `todayOpen` is today's 09:15 open in paise; `indexMoveBps`
 * is NIFTY 50's move at 09:30 versus its previous close (null = not known,
 * which blocks: an unknown index shock is not a passed check).
 */
export interface SessionEligibilityInput {
  daily: readonly Bar[];
  todayOpen: number;
  indexMoveBps: number | null;
  config?: OrbConfig;
}
export interface SessionEligibility {
  reason: IntradayRejectReason | null;
  previousClose: number | null;
  gapBps: number | null;
  averageTurnoverPaise: number | null;
}

export function sessionEligibility(input: SessionEligibilityInput): SessionEligibility {
  const config = input.config ?? ORB_CONFIG;
  const n = config.turnoverSessions;
  const none = (reason: IntradayRejectReason): SessionEligibility => ({
    reason,
    previousClose: null,
    gapBps: null,
    averageTurnoverPaise: null,
  });
  if (input.daily.length < n || !input.daily.every(validBar)) return none('HISTORY_INCOMPLETE');
  const recent = input.daily.slice(-n);
  const previous = recent[recent.length - 1];
  if (!previous || !Number.isSafeInteger(input.todayOpen) || input.todayOpen <= 0)
    return none('HISTORY_INCOMPLETE');
  // Turnover ≈ close × volume per session; bigint because 50-crore days overflow doubles' exactness.
  const turnover = recent.reduce((s, b) => s + BigInt(b.close) * BigInt(b.volume), 0n);
  const averageTurnoverPaise = Number(turnover / BigInt(n));
  const gapBps = (Math.abs(input.todayOpen - previous.close) * 10_000) / previous.close;
  const base = { previousClose: previous.close, gapBps, averageTurnoverPaise };
  if (previous.close < config.minPricePaise) return { ...base, reason: 'PRICE_TOO_LOW' };
  if (averageTurnoverPaise < config.minTurnoverPaise) return { ...base, reason: 'ILLIQUID' };
  if (gapBps > config.maxGapBps) return { ...base, reason: 'GAP' };
  if (input.indexMoveBps === null || !Number.isFinite(input.indexMoveBps))
    return { ...base, reason: 'INDEX_UNAVAILABLE' };
  if (Math.abs(input.indexMoveBps) > config.maxIndexMoveBps)
    return { ...base, reason: 'INDEX_SHOCK' };
  return { ...base, reason: null };
}
