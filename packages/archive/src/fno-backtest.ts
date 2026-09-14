import { type CostBreakdown, type FnoCostConfig, roundTripCost } from './fno-costs.js';
import { istMinuteOfDay } from './fno-normalize.js';
import type { FnoCandle, FnoSetup, FnoStrategyConfig } from './fno-types.js';

/**
 * Replay a day of 5-minute candles against the setups the strategy produced,
 * one bar at a time, with no lookahead. Pessimistic assumptions throughout:
 *
 *  - a setup fills only when a LATER bar breaks the trigger, within the pending
 *    window; otherwise it expires;
 *  - within a bar, if both the stop and a target are touched, the STOP is
 *    assumed hit first (no favourable intrabar path is invented);
 *  - one active setup at a time; a new setup is skipped until the prior one
 *    resolves;
 *  - anything unresolved by the square-off minute exits at that bar's close.
 */

export type TradeStatus = 'EXPIRED' | 'STOP' | 'TARGET2' | 'SQUAREOFF';

export interface FnoTrade {
  setup: FnoSetup;
  status: TradeStatus;
  entryIndex: number | null;
  entryPrice: number | null;
  exitIndex: number | null;
  exitPrice: number | null;
  target1Touched: boolean;
  grossPaise: number | null; // per unit
  rMultiple: number | null;
  costs: CostBreakdown | null;
  netPaise: number | null; // gross×qty − costs
}

export interface BacktestOptions {
  squareOffIstMinute: number; // e.g. 920 for 15:20
  qty: number; // units per trade (lot size × lots); an ASSUMPTION for costs
  costs?: FnoCostConfig;
}

export interface BacktestSummary {
  setups: number;
  filled: number;
  expired: number;
  wins: number;
  losses: number;
  byStatus: Record<TradeStatus, number>;
  totalR: number;
  totalNetPaise: number;
}

export interface BacktestResult {
  trades: FnoTrade[];
  summary: BacktestSummary;
}

function squareOffIndex(candles: readonly FnoCandle[], istMinute: number): number {
  for (let i = 0; i < candles.length; i += 1) {
    const c = candles[i];
    if (c && istMinuteOfDay(c.timestamp) >= istMinute) return i;
  }
  return candles.length - 1;
}

export function backtestFno(
  candles: readonly FnoCandle[],
  setups: readonly FnoSetup[],
  strategy: FnoStrategyConfig,
  options: BacktestOptions,
): BacktestResult {
  const sqIndex = squareOffIndex(candles, options.squareOffIstMinute);
  const trades: FnoTrade[] = [];
  let occupiedUntil = -1; // index through which a prior trade is still active

  for (const setup of setups) {
    if (setup.index <= occupiedUntil) continue; // one active setup at a time

    const bull = setup.direction === 'BULLISH';
    const windowEnd = Math.min(setup.index + strategy.pendingWindowBars, sqIndex);

    // Look for the trigger on later bars.
    let entryIndex: number | null = null;
    for (let j = setup.index + 1; j <= windowEnd; j += 1) {
      const c = candles[j];
      if (!c) continue;
      const triggered = bull ? c.high >= setup.triggerLevel : c.low <= setup.triggerLevel;
      if (triggered) {
        entryIndex = j;
        break;
      }
    }

    if (entryIndex === null) {
      trades.push(emptyTrade(setup, 'EXPIRED'));
      occupiedUntil = windowEnd;
      continue;
    }

    // Resolve from the entry bar to square-off.
    const entryPrice = setup.triggerLevel;
    let status: TradeStatus = 'SQUAREOFF';
    let exitIndex = sqIndex;
    let exitPrice = candles[sqIndex]?.close ?? entryPrice;
    let t1Touched = false;

    for (let k = entryIndex; k <= sqIndex; k += 1) {
      const c = candles[k];
      if (!c) continue;
      const stopHit = bull ? c.low <= setup.invalidationLevel : c.high >= setup.invalidationLevel;
      const t2Hit = bull ? c.high >= setup.target2 : c.low <= setup.target2;
      const t1Hit = bull ? c.high >= setup.target1 : c.low <= setup.target1;
      if (t1Hit) t1Touched = true;

      if (stopHit) {
        status = 'STOP';
        exitIndex = k;
        exitPrice = setup.invalidationLevel;
        break;
      }
      if (t2Hit) {
        status = 'TARGET2';
        exitIndex = k;
        exitPrice = setup.target2;
        break;
      }
    }

    const grossPaise = bull ? exitPrice - entryPrice : entryPrice - exitPrice;
    const rMultiple = setup.riskPaise > 0 ? grossPaise / setup.riskPaise : null;
    const costs = roundTripCost(entryPrice, exitPrice, options.qty, options.costs);
    const netPaise = grossPaise * options.qty - costs.total;

    trades.push({
      setup,
      status,
      entryIndex,
      entryPrice,
      exitIndex,
      exitPrice,
      target1Touched: t1Touched,
      grossPaise,
      rMultiple,
      costs,
      netPaise,
    });
    occupiedUntil = exitIndex;
  }

  return { trades, summary: summarise(setups.length, trades) };
}

function emptyTrade(setup: FnoSetup, status: TradeStatus): FnoTrade {
  return {
    setup,
    status,
    entryIndex: null,
    entryPrice: null,
    exitIndex: null,
    exitPrice: null,
    target1Touched: false,
    grossPaise: null,
    rMultiple: null,
    costs: null,
    netPaise: null,
  };
}

function summarise(setupCount: number, trades: readonly FnoTrade[]): BacktestSummary {
  const byStatus: Record<TradeStatus, number> = {
    EXPIRED: 0,
    STOP: 0,
    TARGET2: 0,
    SQUAREOFF: 0,
  };
  let filled = 0;
  let wins = 0;
  let losses = 0;
  let totalR = 0;
  let totalNetPaise = 0;
  for (const t of trades) {
    byStatus[t.status] += 1;
    if (t.entryIndex !== null) filled += 1;
    if (t.rMultiple !== null) totalR += t.rMultiple;
    if (t.netPaise !== null) totalNetPaise += t.netPaise;
    if (t.grossPaise !== null && t.grossPaise > 0) wins += 1;
    if (t.grossPaise !== null && t.grossPaise < 0) losses += 1;
  }
  return {
    setups: setupCount,
    filled,
    expired: byStatus.EXPIRED,
    wins,
    losses,
    byStatus,
    totalR,
    totalNetPaise,
  };
}
