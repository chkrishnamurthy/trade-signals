import { sessionOpen } from '@equitywise/shared';
import type { Bar } from './types.js';
import type { StrategyInput } from './vwap-strategy.js';
/** Designed by price geometry: trend steps 5 paise, 100-paise normal range,
 * a 55-paise retracement, then a separate 65-paise-bodied confirmation.
 * Expected gates/levels below are hand-derived, not outputs recorded from the engine.
 */
export function strategyFixture(direction: 'BUY' | 'SELL' = 'BUY'): StrategyInput {
  const bars: Bar[] = [];
  for (const day of ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11']) {
    const open = sessionOpen(new Date(`${day}T06:00:00Z`)).getTime();
    for (let i = 0; i < (day === '2026-09-11' ? 14 : 75); i++) {
      const close = 100_000 + bars.length * 5;
      bars.push({
        timestamp: open + i * 300_000,
        open: close - 5,
        high: close + 20,
        low: close - 80,
        close,
        volume: 1000,
      });
    }
  }
  const trend = bars.at(-3);
  const pb = bars.at(-2);
  const confirmation = bars.at(-1);
  if (!trend || !pb || !confirmation) throw new Error('Invalid fixture');
  bars[bars.length - 2] = {
    ...pb,
    open: trend.close,
    high: trend.close,
    low: trend.close - 55,
    close: trend.close - 20,
  };
  bars[bars.length - 1] = {
    ...confirmation,
    open: trend.close - 55,
    low: trend.close - 55,
    high: trend.close + 15,
    close: trend.close + 10,
    volume: 2000,
  };
  const benchmark = bars.map((b, i) => {
    const close = 100_000 + i * 5;
    return { ...b, open: close - 5, high: close + 20, low: close - 80, close, volume: 1000 };
  });
  const mirror = (b: Bar): Bar => ({
    ...b,
    open: 300_000 - b.open,
    high: 300_000 - b.low,
    low: 300_000 - b.high,
    close: 300_000 - b.close,
  });
  const now = confirmation.timestamp + 300_000 + 2000;
  return {
    bars: direction === 'BUY' ? bars : bars.map(mirror),
    benchmark: direction === 'BUY' ? benchmark : benchmark.map(mirror),
    now,
    marketOpen: true,
    tickSize: 5,
    quote: { bid: 100_000, ask: 100_005, timestamp: now - 1000 },
    averageDailyTurnoverPaise: 30_000_000_000,
  };
}
