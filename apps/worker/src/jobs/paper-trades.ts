import { type IntradayConfig, resolvePaperTrade } from '@wealthos/core';
import {
  getMinuteBarsForInstruments,
  getTriggeredSignals,
  recordPaperTrade,
  settledSignalIds,
} from '@wealthos/db';
import { istDateKey, sessionClose, sessionOpen } from '@wealthos/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';

/**
 * Records what actually happened to every signal that triggered.
 *
 * This is the paper-trading recorder, and the only source of evidence about
 * whether the engine is any good. The engine grades its own setups with a
 * score; this grades them against the tape, which is the only grader that
 * counts.
 *
 * It writes NO orders and represents no money. Results are per share, in
 * paise. The application still does not know the user's capital, position size
 * or risk tolerance, and nothing here lets it infer them (CLAUDE.md).
 *
 * Resolution uses `resolvePaperTrade` from `@wealthos/core` — the same pure
 * function the backtester calls — so a live paper result and a backtested one
 * are produced by identical logic and may legitimately be compared. It runs on
 * every cycle rather than once at the close, so an in-flight trade is visible
 * while it is running; the upsert makes re-running free.
 */

const MS_PER_MINUTE = 60_000;

export interface PaperTradeResult {
  readonly tradingDate: string;
  readonly considered: number;
  readonly recorded: number;
  readonly skipped: number;
}

export async function recordPaperTrades(
  context: WorkerContext,
  log: Logger,
  options: { readonly now: Date; readonly config: IntradayConfig },
): Promise<PaperTradeResult> {
  const { db } = context;
  const { now, config } = options;
  const tradingDate = istDateKey(now);

  // Already-settled outcomes are final: the bars behind them cannot change,
  // and re-resolving fifty of them every three minutes is pure waste.
  const settled = await settledSignalIds(db, tradingDate);
  const signals = await getTriggeredSignals(db, tradingDate, [...settled]);

  if (signals.length === 0) {
    return { tradingDate, considered: 0, recorded: 0, skipped: 0 };
  }

  const open = sessionOpen(now);
  const close = sessionClose(now);
  const forceExitAt = close.getTime() - config.session.forceExitBeforeCloseMinutes * MS_PER_MINUTE;

  const bars = await getMinuteBarsForInstruments(db, {
    instrumentIds: [...new Set(signals.map((signal) => signal.instrumentId))],
    from: open,
    to: now,
    // Today's own bars: no corporate action can have an ex-date in their
    // future, so the adjustment factor is always 1.
    raw: true,
  });

  let recorded = 0;
  let skipped = 0;

  for (const signal of signals) {
    const series = bars.get(signal.instrumentId) ?? [];
    if (series.length === 0) {
      skipped += 1;
      continue;
    }

    try {
      const trade = resolvePaperTrade({
        direction: signal.direction === 'short' ? 'short' : 'long',
        levels: {
          entryLow: signal.entryLow,
          entryHigh: signal.entryHigh,
          invalidation: signal.invalidationLevel,
          target1: signal.target1,
          target2: signal.target2,
          risk: signal.riskPaise,
          reward: signal.rewardPaise,
          riskReward: signal.riskPaise === 0 ? null : signal.rewardPaise / signal.riskPaise,
          // The resolver charges costs itself from `config.costs`; these
          // stored figures describe the signal, not the fill, and are not
          // used in resolution.
          costPaise: 0,
          netReward: 0,
          netRisk: 0,
          netRiskReward: null,
        },
        triggeredAt: signal.triggeredAt.getTime(),
        bars: series,
        forceExitAt,
        costs: config.costs,
      });

      // Null means the setup was invalidated before a fill was possible, or
      // triggered with no bar left to fill on. Neither is a trade, and
      // recording either as a flat outcome would dilute every statistic it
      // appears in.
      if (trade === null) {
        skipped += 1;
        continue;
      }

      await recordPaperTrade(db, {
        signalId: signal.id,
        instrumentId: signal.instrumentId,
        tradingDate,
        kind: signal.kind,
        strategy: signal.strategy,
        direction: signal.direction,
        regime: signal.regime,
        score: signal.score,
        quality: signal.quality,
        entryAt: new Date(trade.entryAt),
        entryPrice: trade.entryPrice,
        exitAt: new Date(trade.exitAt),
        exitPrice: trade.exitPrice,
        exitReason: trade.exitReason,
        grossPaise: Math.round(trade.grossPaise),
        costPaise: Math.round(trade.costPaise),
        netPaise: Math.round(trade.netPaise),
        rMultiple: trade.rMultiple,
        maxFavourable: trade.maxFavourable,
        maxAdverse: trade.maxAdverse,
        barsHeld: trade.barsHeld,
        reachedTarget2: trade.reachedTarget2,
      });
      recorded += 1;
    } catch (error) {
      skipped += 1;
      log.warn('could not resolve', { symbol: signal.symbol, ...errorFields(error) });
    }
  }

  log.info('paper trades recorded', {
    tradingDate,
    considered: signals.length,
    recorded,
    skipped,
  });

  return { tradingDate, considered: signals.length, recorded, skipped };
}
