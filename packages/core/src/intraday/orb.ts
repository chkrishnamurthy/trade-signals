import type { IntradayDirection, IntradayLevels, OpeningRange } from '@equitywise/shared';
import type { Bar } from '../types.js';
import { ORB_CONFIG, type OrbConfig } from './config.js';

/**
 * The opening range from the first `openingRangeBars` five-minute candles of
 * a session. `bars` are that session's closed candles in order; anything short
 * of the full range, or not starting at the session open, is `null` — a range
 * built from two candles is a different (and untested) strategy.
 */
export function openingRange(
  sessionBars: readonly Bar[],
  sessionOpenMs: number,
  config: OrbConfig = ORB_CONFIG,
): OpeningRange | null {
  const n = config.openingRangeBars;
  if (sessionBars.length < n) return null;
  let high = 0;
  let low = Number.MAX_SAFE_INTEGER;
  for (let i = 0; i < n; i += 1) {
    const bar = sessionBars[i];
    if (!bar || bar.timestamp !== sessionOpenMs + i * config.barMs) return null;
    high = Math.max(high, bar.high);
    low = Math.min(low, bar.low);
  }
  const mid = Math.floor((high + low) / 2);
  return {
    high,
    low,
    mid,
    rangeBps: ((high - low) * 10_000) / mid,
    completeAt: sessionOpenMs + n * config.barMs,
  };
}

const roundDown = (paise: number, tick: number) => Math.floor(paise / tick) * tick;
const roundUp = (paise: number, tick: number) => Math.ceil(paise / tick) * tick;

/**
 * Stop, Target 1 and Target 2 from the reference close and the opening range.
 *
 * BUY: stop a small buffer below the range low; SELL mirrors above the high.
 * The risk distance is |ref − stop|, floored at `minRiskBps` (a too-tight stop
 * is pushed away from price) and capped at `maxRiskBps` (too wide → no
 * signal). Targets are 1× and 2× the risk distance, rounded in the
 * favourable direction so a tick never shrinks the reward.
 */
export function orbLevels(
  ref: number,
  range: OpeningRange,
  direction: IntradayDirection,
  tickSize: number,
  config: OrbConfig = ORB_CONFIG,
): IntradayLevels | null {
  if (!Number.isSafeInteger(ref) || ref <= 0 || ref % tickSize !== 0) return null;
  const sign = direction === 'BUY' ? 1 : -1;
  const edge = direction === 'BUY' ? range.low : range.high;
  const buffer = Math.floor((edge * config.stopBufferBps) / 10_000);
  const awayFromPrice = (paise: number) =>
    direction === 'BUY' ? roundDown(paise, tickSize) : roundUp(paise, tickSize);
  const towardsReward = (paise: number) =>
    direction === 'BUY' ? roundUp(paise, tickSize) : roundDown(paise, tickSize);

  let stop = awayFromPrice(edge - sign * buffer);
  let risk = sign * (ref - stop);
  const minRisk = (ref * config.minRiskBps) / 10_000;
  const maxRisk = (ref * config.maxRiskBps) / 10_000;
  if (risk < minRisk) {
    stop = awayFromPrice(ref - sign * minRisk);
    risk = sign * (ref - stop);
  }
  if (risk > maxRisk || risk <= 0 || stop <= 0) return null;
  const target1 = towardsReward(ref + sign * config.target1Multiple * risk);
  const target2 = towardsReward(ref + sign * config.target2Multiple * risk);
  if (target1 <= 0 || target2 <= 0) return null;
  return { ref, stop, target1, target2, riskDistance: risk, tickSize };
}
