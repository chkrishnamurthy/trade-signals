import { and, desc, eq, gte, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments, intradaySignals, paperTrades } from '../schema/index.js';

/**
 * Paper-trade persistence.
 *
 * Every write is an upsert keyed on `signal_id`, because the recorder re-runs
 * on every cycle and an outcome sharpens over the session: a trade that is
 * `unresolved` at 11:00 is `target1` or `stop` by 14:00. Inserting instead of
 * upserting would produce one row per cycle and silently multiply every
 * statistic the results page shows.
 *
 * Nothing here represents money or a position. Figures are per share, in
 * paise — a measurement of the signal, not a record of a trade.
 */

export interface PaperTradeInput {
  readonly signalId: number;
  readonly instrumentId: number;
  readonly tradingDate: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: string;
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly entryAt: Date;
  readonly entryPrice: number;
  readonly exitAt: Date;
  readonly exitPrice: number;
  readonly exitReason: string;
  readonly grossPaise: number;
  readonly costPaise: number;
  readonly netPaise: number;
  readonly rMultiple: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
  readonly reachedTarget2: boolean;
}

/** Insert or refine a paper trade. Returns the number of rows written. */
export async function recordPaperTrade(db: Database, input: PaperTradeInput): Promise<void> {
  const values = {
    ...input,
    reachedTarget2: input.reachedTarget2 ? 'true' : 'false',
    recordedAt: new Date(),
  };

  await db
    .insert(paperTrades)
    .values(values)
    .onConflictDoUpdate({
      target: paperTrades.signalId,
      set: {
        exitAt: values.exitAt,
        exitPrice: values.exitPrice,
        exitReason: values.exitReason,
        grossPaise: values.grossPaise,
        costPaise: values.costPaise,
        netPaise: values.netPaise,
        rMultiple: values.rMultiple,
        maxFavourable: values.maxFavourable,
        maxAdverse: values.maxAdverse,
        barsHeld: values.barsHeld,
        reachedTarget2: values.reachedTarget2,
        recordedAt: values.recordedAt,
      },
    });
}

/** Signal ids on a date that already have a RESOLVED outcome, so may be skipped. */
export async function settledSignalIds(db: Database, tradingDate: string): Promise<Set<number>> {
  const rows = await db
    .select({ signalId: paperTrades.signalId })
    .from(paperTrades)
    .where(
      and(eq(paperTrades.tradingDate, tradingDate), sql`${paperTrades.exitReason} <> 'unresolved'`),
    );
  return new Set(rows.map((row) => row.signalId));
}

export interface StoredPaperTrade {
  readonly id: number;
  readonly signalId: number;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: string;
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly entryAt: Date;
  readonly entryPrice: number;
  readonly exitAt: Date;
  readonly exitPrice: number;
  readonly exitReason: string;
  readonly grossPaise: number;
  readonly costPaise: number;
  readonly netPaise: number;
  readonly rMultiple: number;
  readonly maxFavourable: number;
  readonly maxAdverse: number;
  readonly barsHeld: number;
}

/**
 * Recorded outcomes, newest first.
 *
 * `unresolved` rows are returned rather than hidden: a trade still open is a
 * fact about the session, and filtering it out here would make the page unable
 * to distinguish "nothing triggered" from "three are still running".
 */
export async function getPaperTrades(
  db: Database,
  query: { from?: string; limit?: number } = {},
): Promise<StoredPaperTrade[]> {
  const { from, limit = 500 } = query;

  const rows = await db
    .select({
      id: paperTrades.id,
      signalId: paperTrades.signalId,
      symbol: instruments.symbol,
      tradingDate: paperTrades.tradingDate,
      kind: paperTrades.kind,
      strategy: paperTrades.strategy,
      direction: paperTrades.direction,
      regime: paperTrades.regime,
      score: paperTrades.score,
      quality: paperTrades.quality,
      entryAt: paperTrades.entryAt,
      entryPrice: paperTrades.entryPrice,
      exitAt: paperTrades.exitAt,
      exitPrice: paperTrades.exitPrice,
      exitReason: paperTrades.exitReason,
      grossPaise: paperTrades.grossPaise,
      costPaise: paperTrades.costPaise,
      netPaise: paperTrades.netPaise,
      rMultiple: paperTrades.rMultiple,
      maxFavourable: paperTrades.maxFavourable,
      maxAdverse: paperTrades.maxAdverse,
      barsHeld: paperTrades.barsHeld,
    })
    .from(paperTrades)
    .innerJoin(instruments, eq(instruments.id, paperTrades.instrumentId))
    .where(from === undefined ? undefined : gte(paperTrades.tradingDate, from))
    .orderBy(desc(paperTrades.tradingDate), desc(paperTrades.entryAt))
    .limit(limit);

  return rows;
}

/** Signals on a date that have triggered and so are eligible for a paper trade. */
export interface TriggeredSignal {
  readonly id: number;
  readonly instrumentId: number;
  readonly symbol: string;
  readonly kind: string;
  readonly strategy: string;
  readonly direction: string;
  readonly regime: string;
  readonly score: number;
  readonly quality: string;
  readonly triggeredAt: Date;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidationLevel: number;
  readonly target1: number;
  readonly target2: number;
  readonly riskPaise: number;
  readonly rewardPaise: number;
}

export async function getTriggeredSignals(
  db: Database,
  tradingDate: string,
  excludeIds: readonly number[] = [],
): Promise<TriggeredSignal[]> {
  const conditions = [
    eq(intradaySignals.tradingDate, tradingDate),
    sql`${intradaySignals.triggeredAt} IS NOT NULL`,
  ];
  if (excludeIds.length > 0) {
    conditions.push(sql`NOT (${inArray(intradaySignals.id, [...excludeIds])})`);
  }

  const rows = await db
    .select({
      id: intradaySignals.id,
      instrumentId: intradaySignals.instrumentId,
      symbol: instruments.symbol,
      kind: intradaySignals.kind,
      strategy: intradaySignals.strategy,
      direction: intradaySignals.direction,
      regime: intradaySignals.regime,
      score: intradaySignals.score,
      quality: intradaySignals.quality,
      triggeredAt: intradaySignals.triggeredAt,
      entryLow: intradaySignals.entryLow,
      entryHigh: intradaySignals.entryHigh,
      invalidationLevel: intradaySignals.invalidationLevel,
      target1: intradaySignals.target1,
      target2: intradaySignals.target2,
      riskPaise: intradaySignals.riskPaise,
      rewardPaise: intradaySignals.rewardPaise,
    })
    .from(intradaySignals)
    .innerJoin(instruments, eq(instruments.id, intradaySignals.instrumentId))
    .where(and(...conditions));

  // `triggeredAt` is non-null by the predicate above; the column type cannot
  // express that, so it is narrowed here rather than asserted.
  return rows.flatMap((row) =>
    row.triggeredAt === null ? [] : [{ ...row, triggeredAt: row.triggeredAt }],
  );
}
