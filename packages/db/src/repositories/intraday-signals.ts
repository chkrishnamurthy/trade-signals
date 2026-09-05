import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { intradaySignals } from '../schema/index.js';

/**
 * Live intraday setups, read by the watchlist.
 *
 * The intraday engine that used to WRITE these signals has been removed, along
 * with its sub-tables (factors, reasons, events, runs). What remains is this
 * one read: the watchlist still surfaces the strongest live setup per name from
 * whatever `intraday_signals` holds. With no writer, the table is empty and the
 * setup columns render blank — but the read stays wired so the columns can come
 * back the day a new engine repopulates the table.
 */

/** Eleven scalars per row — no jsonb snapshots, which the watchlist never reads. */
export interface InstrumentSetup {
  readonly instrumentId: number;
  readonly kind: string;
  readonly direction: string;
  readonly state: string;
  readonly score: number;
  readonly quality: string;
  readonly entryLow: number;
  readonly entryHigh: number;
  readonly invalidationLevel: number;
  readonly target1: number;
  readonly netRiskReward: number | null;
}

/**
 * The strongest live setup for each of a specific set of instruments.
 *
 * DISTINCT ON keys on the instrument with the highest score first: a name can
 * legitimately have several setups open at once, and a single column has room
 * for the best of them.
 */
export async function liveSetupsForInstruments(
  db: Database,
  tradingDate: string,
  instrumentIds: readonly number[],
): Promise<Map<number, InstrumentSetup>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([intradaySignals.instrumentId], {
      instrumentId: intradaySignals.instrumentId,
      kind: intradaySignals.kind,
      direction: intradaySignals.direction,
      state: intradaySignals.state,
      score: intradaySignals.score,
      quality: intradaySignals.quality,
      entryLow: intradaySignals.entryLow,
      entryHigh: intradaySignals.entryHigh,
      invalidationLevel: intradaySignals.invalidationLevel,
      target1: intradaySignals.target1,
      netRiskReward: intradaySignals.netRiskReward,
    })
    .from(intradaySignals)
    .where(
      and(
        eq(intradaySignals.tradingDate, tradingDate),
        isNull(intradaySignals.endedAt),
        inArray(intradaySignals.instrumentId, [...instrumentIds]),
      ),
    )
    .orderBy(intradaySignals.instrumentId, desc(intradaySignals.score));

  return new Map(rows.map((row) => [row.instrumentId, row]));
}
