import { ORB_STRATEGY_NAME, ORB_STRATEGY_SHORT_NAME } from '@equitywise/shared';
import { ORB_CONFIG, orbRules } from '../intraday/config.js';
import { ORB_STRATEGY_ID } from './intent.js';

/**
 * The code-level strategy catalogue (docs/planning/paper-trading-plan.md §13).
 * The paper engine reads it for names and rules text only — never for
 * evaluation. Adding a strategy is a new entry here, its evaluator, and an
 * assignment row; the engine does not change.
 */
export interface StrategyCatalogueEntry {
  id: string;
  name: string;
  shortName: string;
  revision: number;
  timeframe: string;
  /** The ranking metric used for same-candle ties, in plain words. */
  strength: string;
  /** Plain-language rules, in the order a reader should meet them. */
  rules: readonly string[];
  parameters: Record<string, number | string | boolean>;
}

export const STRATEGY_CATALOGUE: readonly StrategyCatalogueEntry[] = Object.freeze([
  {
    id: ORB_STRATEGY_ID,
    name: ORB_STRATEGY_NAME,
    shortName: ORB_STRATEGY_SHORT_NAME,
    revision: ORB_CONFIG.revision,
    timeframe: ORB_CONFIG.timeframe,
    strength: 'relative volume of the signal candle',
    rules: [
      'Waits for the first fifteen minutes (09:15–09:30) to set the opening range.',
      'Looks for a 5-minute candle that closes beyond the range, on the right side of VWAP, with volume at least 1.5× the recent average and a solid body.',
      'Signals only between 09:35 and 14:30; one signal per stock per day.',
      'The stop level sits just beyond the other side of the range; Target 1 is one risk distance away, Target 2 is two.',
      'Half the shares are booked at Target 1 and the stop moves to the entry level; the rest run to Target 2 or the stop.',
      'Anything still open squares off at 15:15.',
    ],
    parameters: orbRules().parameters,
  },
]);

export const strategyById = (id: string) => STRATEGY_CATALOGUE.find((s) => s.id === id) ?? null;
