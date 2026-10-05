import { inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { latestQuotes } from '../schema/index.js';

const UPSERT_CHUNK = 1_000;

export const QUOTE_CACHE_FEED = 'provider-latest-quotes';

export interface LatestQuoteInput {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly source: string;
  readonly ltpPaise: number;
  readonly changePaise: number | null;
  readonly changePercent: number | null;
  readonly openPaise: number | null;
  readonly highPaise: number | null;
  readonly lowPaise: number | null;
  readonly previousClosePaise: number | null;
  readonly averagePricePaise: number | null;
  readonly bidPaise: number | null;
  readonly askPaise: number | null;
  readonly volume: number | null;
  readonly quoteAt: Date | null;
  readonly fetchedAt: Date;
}

export interface LatestQuoteRow extends LatestQuoteInput {
  readonly updatedAt: Date;
}

/**
 * Replaces the latest quote snapshot for each instrument. This is a cache, not
 * price history, so an upsert is the intended write pattern.
 */
export async function upsertLatestQuotes(
  db: Database,
  rows: readonly LatestQuoteInput[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += UPSERT_CHUNK) {
    const chunk = rows.slice(i, i + UPSERT_CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(latestQuotes)
      .values([...chunk])
      .onConflictDoUpdate({
        target: latestQuotes.instrumentId,
        set: {
          symbol: sql`excluded.symbol`,
          source: sql`excluded.source`,
          ltpPaise: sql`excluded.ltp_paise`,
          changePaise: sql`excluded.change_paise`,
          changePercent: sql`excluded.change_percent`,
          openPaise: sql`excluded.open_paise`,
          highPaise: sql`excluded.high_paise`,
          lowPaise: sql`excluded.low_paise`,
          previousClosePaise: sql`excluded.previous_close_paise`,
          averagePricePaise: sql`excluded.average_price_paise`,
          bidPaise: sql`excluded.bid_paise`,
          askPaise: sql`excluded.ask_paise`,
          volume: sql`excluded.volume`,
          quoteAt: sql`excluded.quote_at`,
          fetchedAt: sql`excluded.fetched_at`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ instrumentId: latestQuotes.instrumentId });
    written += result.length;
  }
  return written;
}

/** Latest cached quotes for the requested instruments, keyed by instrument id. */
export async function latestQuotesForInstruments(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, LatestQuoteRow>> {
  if (instrumentIds.length === 0) return new Map();
  const rows = await db
    .select()
    .from(latestQuotes)
    .where(inArray(latestQuotes.instrumentId, [...instrumentIds]));
  return new Map(rows.map((row) => [row.instrumentId, row]));
}
