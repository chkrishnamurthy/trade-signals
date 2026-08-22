import type { Bar } from '../types.js';
import { type CostModel, roundTripCost } from './costs.js';
import type { TechnicalLevels, TradeDirection } from './types.js';

/**
 * Paper-trade resolution.
 *
 * Turns a triggered signal into a completed, costed, per-share outcome by
 * walking forward through closed bars. Pure (CLAUDE.md rule 1) and shared
 * verbatim by the live paper-trading recorder and the backtester, which is the
 * only way the two can ever be compared to each other.
 *
 * Three decisions here determine whether the resulting numbers are honest, and
 * all three are taken pessimistically:
 *
 *  1. THE FILL IS THE NEXT BAR'S OPEN. Never the entry zone, never the trigger
 *     bar's close. The trigger is only known once its bar has closed, so the
 *     earliest reachable price is the next open (CLAUDE.md rule 2). Filling at
 *     the planned entry is the single largest source of fictitious backtest
 *     profit.
 *
 *  2. WHEN A BAR CONTAINS BOTH THE STOP AND THE TARGET, THE STOP WINS. A 3
 *     minute bar's high and low say nothing about their order. Assuming the
 *     target came first turns every volatile bar into a win and is how a
 *     losing system backtests profitably.
 *
 *  3. COSTS ARE CHARGED ON EVERY TRADE, including losers, and slippage is
 *     charged on both legs.
 */

export type PaperExitReason = 'target1' | 'target2' | 'stop' | 'session_close' | 'unresolved';

export interface PaperTradeInput {
  readonly direction: TradeDirection;
  readonly levels: TechnicalLevels;
  /** Timestamp of the CLOSE of the bar that triggered. */
  readonly triggeredAt: number;
  /** Closed bars, ascending, covering the trigger and everything after it. */
  readonly bars: readonly Bar[];
  /**
   * Latest timestamp a position may still be held. Bars at or after this force
   * an exit — intraday setups are closed out before the session ends, and a
   * backtest that quietly carries one overnight is measuring a different
   * strategy than the one being run.
   */
  readonly forceExitAt: number;
  readonly costs: CostModel;
  /**
   * The most of the planned risk the entry fill may consume, 0-1.
   *
   * A signal publishes an entry ZONE. When the next bar opens far past it, the
   * setup that was published is no longer available at the price it was
   * published at, and nobody working from the signal would chase it.
   *
   * Without this rule such a fill is still recorded, on a risk distance that
   * has been shrunk to almost nothing — and the ordinary stop-out that follows
   * divides by that stub and scores −3.54R instead of −1R. One BAJFINANCE
   * trade did exactly that in testing, filling 207 paise beyond its entry and
   * leaving 50 paise of a 257-paise budget.
   *
   * Defaults to 0.5: half the risk gone before the trade starts is not the
   * trade that was signalled.
   */
  readonly maxEntrySlipFraction?: number;
}

export interface PaperTrade {
  readonly direction: TradeDirection;
  readonly entryAt: number;
  readonly entryPrice: number;
  readonly exitAt: number;
  readonly exitPrice: number;
  readonly exitReason: PaperExitReason;
  /** Signed, paise per share, before costs. */
  readonly grossPaise: number;
  readonly costPaise: number;
  /** Signed, paise per share, after costs. The number that matters. */
  readonly netPaise: number;
  /**
   * Net result as a multiple of the planned risk — |fill − invalidation|.
   *
   * The denominator is the GROSS risk deliberately, so that a stopped-out
   * trade scores worse than −1R by exactly the cost drag. Dividing by a
   * cost-inclusive risk would make every stop-out land on a tidy −1.00R and
   * hide the drag this engine exists to account for.
   */
  readonly rMultiple: number;
  /** Best and worst excursion between fill and exit, paise, signed favourably. */
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
  /** Whether the second target was reached before the exit. */
  readonly reachedTarget2: boolean;
}

/**
 * Resolve a triggered signal into a completed paper trade.
 *
 * Returns null when there is no bar after the trigger to fill on — a signal
 * that triggers on the session's final bar is not a trade, and recording it as
 * a flat outcome would dilute every statistic it appears in.
 */
export function resolvePaperTrade(input: PaperTradeInput): PaperTrade | null {
  const { direction, levels, triggeredAt, bars, forceExitAt, costs } = input;
  const maxEntrySlipFraction = input.maxEntrySlipFraction ?? 0.5;
  const long = direction === 'long';

  const fillIndex = bars.findIndex((bar) => bar.timestamp > triggeredAt);
  if (fillIndex === -1) return null;
  const fillBar = bars[fillIndex];
  if (fillBar === undefined || fillBar.timestamp >= forceExitAt) return null;

  const entryPrice = fillBar.open;
  const { invalidation, target1, target2 } = levels;

  // The premise can die between the trigger and the fill. If the next bar
  // opens at or beyond the invalidation level, the setup was already wrong
  // before it could be entered, and the live lifecycle would have invalidated
  // it rather than opened anything.
  //
  // Without this guard such a case is recorded as an instant stop-out on a
  // near-zero risk distance, which divides by almost nothing and produces
  // enormous fictitious R-multiples — it was measured at −3.6R on a single
  // trade before the guard existed, dragging a whole strategy's expectancy
  // with it.
  const alreadyInvalid = long ? entryPrice <= invalidation : entryPrice >= invalidation;
  if (alreadyInvalid) return null;

  // Risk measured from the ACTUAL fill, not the planned entry. The gap between
  // them is real and belongs in the R-multiple.
  const riskAtFill = Math.abs(entryPrice - invalidation);
  if (riskAtFill <= 0) return null;

  // The published entry zone is the offer. A fill that has already spent most
  // of the risk budget is a different, worse trade wearing the same name.
  const plannedEntry = (levels.entryLow + levels.entryHigh) / 2;
  const plannedRisk = Math.abs(plannedEntry - invalidation);
  if (plannedRisk > 0 && riskAtFill < plannedRisk * (1 - maxEntrySlipFraction)) return null;

  let maxFavourable = 0;
  let maxAdverse = 0;
  let reachedTarget2 = false;

  const settle = (
    exitAt: number,
    exitPrice: number,
    exitReason: PaperExitReason,
    barsHeld: number,
  ): PaperTrade => {
    const grossPaise = long ? exitPrice - entryPrice : entryPrice - exitPrice;
    const costPaise = roundTripCost(direction, entryPrice, exitPrice, costs).total;
    const netPaise = grossPaise - costPaise;
    return {
      direction,
      entryAt: fillBar.timestamp,
      entryPrice,
      exitAt,
      exitPrice,
      exitReason,
      grossPaise,
      costPaise,
      netPaise,
      rMultiple: netPaise / riskAtFill,
      maxFavourable,
      maxAdverse,
      barsHeld,
      reachedTarget2,
    };
  };

  for (let i = fillIndex; i < bars.length; i += 1) {
    const bar = bars[i];
    if (bar === undefined) continue;
    const held = i - fillIndex + 1;

    if (bar.timestamp >= forceExitAt) {
      const previous = bars[i - 1];
      const exitBar = previous ?? bar;
      return settle(exitBar.timestamp, exitBar.close, 'session_close', held - 1);
    }

    const favourable = long ? bar.high - entryPrice : entryPrice - bar.low;
    const adverse = long ? entryPrice - bar.low : bar.high - entryPrice;
    maxFavourable = Math.max(maxFavourable, favourable);
    maxAdverse = Math.max(maxAdverse, adverse);

    const hitStop = long ? bar.low <= invalidation : bar.high >= invalidation;
    const hitTarget1 = long ? bar.high >= target1 : bar.low <= target1;
    const hitTarget2 = long ? bar.high >= target2 : bar.low <= target2;
    if (hitTarget2) reachedTarget2 = true;

    // Decision 2: ambiguity resolves against the trade.
    if (hitStop) return settle(bar.timestamp, invalidation, 'stop', held);
    if (hitTarget1) return settle(bar.timestamp, target1, 'target1', held);
  }

  // Ran out of bars without reaching force-exit: the data ends mid-trade.
  // Marked unresolved rather than closed at the last price, so an incomplete
  // session cannot masquerade as a completed outcome.
  const last = bars.at(-1);
  if (last === undefined) return null;
  return settle(last.timestamp, last.close, 'unresolved', bars.length - fillIndex);
}

/** Aggregate statistics over a set of resolved paper trades. */
export interface PaperStats {
  readonly trades: number;
  readonly wins: number;
  readonly losses: number;
  readonly scratches: number;
  /** Wins ÷ resolved trades, 0-1. */
  readonly hitRate: number;
  /** Mean net result per trade, in R. The single number that decides viability. */
  readonly expectancyR: number;
  readonly totalNetPaise: number;
  readonly averageWinR: number;
  readonly averageLossR: number;
  /** Gross profit ÷ gross loss, in R. Null when there were no losses. */
  readonly profitFactor: number | null;
  readonly averageBarsHeld: number;
}

/**
 * Summarise trades.
 *
 * `unresolved` trades are excluded entirely: they have no outcome, and
 * counting them as anything — win, loss or scratch — invents information.
 */
export function summarisePaperTrades(trades: readonly PaperTrade[]): PaperStats {
  const resolved = trades.filter((trade) => trade.exitReason !== 'unresolved');
  const count = resolved.length;
  if (count === 0) {
    return {
      trades: 0,
      wins: 0,
      losses: 0,
      scratches: 0,
      hitRate: 0,
      expectancyR: 0,
      totalNetPaise: 0,
      averageWinR: 0,
      averageLossR: 0,
      profitFactor: null,
      averageBarsHeld: 0,
    };
  }

  const wins = resolved.filter((trade) => trade.netPaise > 0);
  const losses = resolved.filter((trade) => trade.netPaise < 0);
  const scratches = count - wins.length - losses.length;

  const sum = (list: readonly PaperTrade[], pick: (trade: PaperTrade) => number): number =>
    list.reduce((total, trade) => total + pick(trade), 0);

  const grossWinR = sum(wins, (trade) => trade.rMultiple);
  const grossLossR = Math.abs(sum(losses, (trade) => trade.rMultiple));

  return {
    trades: count,
    wins: wins.length,
    losses: losses.length,
    scratches,
    hitRate: wins.length / count,
    expectancyR: sum(resolved, (trade) => trade.rMultiple) / count,
    totalNetPaise: sum(resolved, (trade) => trade.netPaise),
    averageWinR: wins.length === 0 ? 0 : grossWinR / wins.length,
    averageLossR: losses.length === 0 ? 0 : -grossLossR / losses.length,
    profitFactor: grossLossR === 0 ? null : grossWinR / grossLossR,
    averageBarsHeld: sum(resolved, (trade) => trade.barsHeld) / count,
  };
}
