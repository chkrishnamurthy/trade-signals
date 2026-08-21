import type { Bar } from '../types.js';
import { DEFAULT_STRATEGY, type StrategyConfig } from './config.js';
import { evaluateSignals, type SignalReport } from './engine.js';

/**
 * Swing-setup screener.
 *
 * A screening filter, not advice: it asks "does this satisfy several
 * independent technical conditions at once?" and reports which ones.
 */

export interface SwingCriterion {
  readonly key: string;
  readonly label: string;
  readonly met: boolean;
  readonly detail: string;
}

export interface SwingCandidate {
  readonly report: SignalReport;
  readonly criteria: readonly SwingCriterion[];
  /** How many criteria were satisfied. */
  readonly met: number;
  readonly total: number;
  /** True when enough criteria align to be worth a look. */
  readonly qualifies: boolean;
  readonly setupName: string;
}

/** Criteria that must align before a name is attached to a setup. */
export const SWING_MIN_CRITERIA = 4;

export function scanSwing(
  bars: readonly Bar[],
  config: StrategyConfig = DEFAULT_STRATEGY,
): SwingCandidate {
  const report = evaluateSignals(bars, config);
  const ind = report.indicators;

  const criteria: SwingCriterion[] = [
    {
      key: 'trend',
      label: 'Uptrend',
      met: ind.ema20 !== null && ind.ema50 !== null && ind.ema20 > ind.ema50,
      detail: 'Fast EMA above medium EMA',
    },
    {
      key: 'aboveFast',
      label: `Above ${config.emaFast} EMA`,
      met: ind.ema20 !== null && ind.close > ind.ema20,
      detail: 'Price holding short-term trend',
    },
    {
      key: 'aboveMedium',
      label: `Above ${config.emaMedium} EMA`,
      met: ind.ema50 !== null && ind.close > ind.ema50,
      detail: 'Price holding medium-term trend',
    },
    {
      key: 'rsiHealthy',
      label: 'RSI in momentum band',
      met: ind.rsi !== null && ind.rsi >= config.rsiBullish.min && ind.rsi <= config.rsiBullish.max,
      detail:
        ind.rsi === null
          ? 'RSI unavailable'
          : `RSI ${ind.rsi.toFixed(1)} (target ${config.rsiBullish.min}–${config.rsiBullish.max})`,
    },
    {
      key: 'macd',
      label: 'MACD positive',
      met: ind.macdHistogram !== null && ind.macdHistogram > 0,
      detail: 'Momentum confirming the trend',
    },
    {
      key: 'volume',
      label: 'Volume participation',
      met: ind.relativeVolume !== null && ind.relativeVolume >= 1,
      detail:
        ind.relativeVolume === null
          ? 'Volume unavailable'
          : `${ind.relativeVolume.toFixed(2)}× average`,
    },
  ];

  const met = criteria.filter((c) => c.met).length;

  return {
    report,
    criteria,
    met,
    total: criteria.length,
    qualifies: !report.insufficientData && met >= SWING_MIN_CRITERIA && report.bias > 0,
    setupName: nameSetup(report, met),
  };
}

function nameSetup(report: SignalReport, met: number): string {
  if (report.setups.includes('Breakout')) return 'Breakout';
  if (report.setups.includes('MACD bullish crossover')) return 'Momentum crossover';
  if (report.setups.includes('Golden cross alignment')) return 'Trend continuation';
  if (report.setups.includes('Volume breakout')) return 'Volume expansion';
  if (met >= 5) return 'Bullish momentum';
  return 'Developing setup';
}
