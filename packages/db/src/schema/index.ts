/**
 * Drizzle schema.
 *
 * `drizzle-kit` reads this file (see `drizzle.config.ts`), and every table must
 * be re-exported here or migrations will silently omit it.
 *
 * Invariants enforced by this schema, from CLAUDE.md:
 *   - Only 1m and 1d candles are stored; everything else derives (rule 4)
 *   - Candles are append-only; corrections are corporate_actions rows (rule 5)
 *   - All prices are integer paise (rule 3)
 *   - All timestamps are TIMESTAMPTZ in UTC (rule 6)
 *   - strategy_versions rows are immutable (rule 7)
 *   - Every signal writes its factor breakdown (rule 8)
 */
export { dailyCandles, minuteCandles } from './candles.js';
export { providerCredentials } from './credentials.js';
export { dailyIndicators } from './indicators.js';
export { corporateActions, ingestionRuns, instruments } from './instruments.js';
export {
  intradayRuns,
  intradaySignalEvents,
  intradaySignalFactors,
  intradaySignalReasons,
  intradaySignals,
  paperTrades,
} from './intraday.js';
export { signalFactors, signals, strategyVersions } from './signals.js';
export { alertEvents, alerts, watchlistItems, watchlists } from './watchlists.js';
