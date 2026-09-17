import { and, desc, eq, gte, inArray, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  bulkBlockDeals,
  deliveryStats,
  derivativeOiDaily,
  feedIngestionRuns,
  instruments,
  participantOi,
  shareholdingPatterns,
} from '../schema/index.js';

/**
 * Persistence for the Institutional Flow datasets.
 *
 * Writers are the worker's flow ingestion jobs; the reader is the web app's
 * `/flows` page. Every write upserts on the table's natural key so a re-run
 * (or a corrected exchange file) replaces rather than duplicates. Every read
 * is one bounded query.
 */

const CHUNK = 500;

// ---------------------------------------------------------------------------
// Feed health
// ---------------------------------------------------------------------------

/**
 * Stable feed ids. The worker records runs under them; the web app reads
 * health by them. A rename here is a migration of `feed_ingestion_runs.feed`.
 */
export const FLOW_FEEDS = {
  fiiDii: 'nse-fii-dii',
  deals: 'nse-deals',
  delivery: 'nse-bhavdata',
  participantOi: 'nse-participant-oi',
  shareholding: 'nse-shareholding',
  futuresOi: 'provider-futures-oi',
} as const;

export type FlowFeed = (typeof FLOW_FEEDS)[keyof typeof FLOW_FEEDS];

export interface FeedIngestionInput {
  readonly feed: string;
  readonly succeeded: boolean;
  readonly fetched: number;
  readonly written: number;
  readonly error?: string | null;
  readonly startedAt: Date;
  readonly completedAt: Date;
}

export async function recordFeedIngestion(db: Database, input: FeedIngestionInput): Promise<void> {
  await db.insert(feedIngestionRuns).values({
    feed: input.feed,
    succeeded: input.succeeded,
    fetched: input.fetched,
    written: input.written,
    error: input.error ?? null,
    startedAt: input.startedAt,
    completedAt: input.completedAt,
  });
}

export interface FeedRun {
  readonly succeeded: boolean;
  readonly fetched: number;
  readonly written: number;
  readonly error: string | null;
  readonly completedAt: Date;
}

export interface FeedHealthRow {
  readonly feed: string;
  /** The most recent attempt, whatever its outcome. */
  readonly latest: FeedRun | null;
  /** The most recent attempt that succeeded. */
  readonly lastSuccess: FeedRun | null;
}

/** Latest and last-successful run for each named feed, in one query. */
export async function feedHealth(
  db: Database,
  feeds: readonly string[],
): Promise<Map<string, FeedHealthRow>> {
  const out = new Map<string, FeedHealthRow>();
  for (const feed of feeds) out.set(feed, { feed, latest: null, lastSuccess: null });
  if (feeds.length === 0) return out;

  // Row-number twice: once over all runs, once over successful runs only.
  const ranked = db
    .select({
      feed: feedIngestionRuns.feed,
      succeeded: feedIngestionRuns.succeeded,
      fetched: feedIngestionRuns.fetched,
      written: feedIngestionRuns.written,
      error: feedIngestionRuns.error,
      completedAt: feedIngestionRuns.completedAt,
      anyRank:
        sql<number>`row_number() over (partition by ${feedIngestionRuns.feed} order by ${feedIngestionRuns.completedAt} desc)`.as(
          'any_rank',
        ),
      okRank:
        sql<number>`row_number() over (partition by ${feedIngestionRuns.feed}, ${feedIngestionRuns.succeeded} order by ${feedIngestionRuns.completedAt} desc)`.as(
          'ok_rank',
        ),
    })
    .from(feedIngestionRuns)
    .where(inArray(feedIngestionRuns.feed, [...feeds]))
    .as('ranked');

  const rows = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.anyRank} = 1 or (${ranked.succeeded} and ${ranked.okRank} = 1)`);

  for (const row of rows) {
    const current = out.get(row.feed);
    if (current === undefined) continue;
    const run: FeedRun = {
      succeeded: row.succeeded,
      fetched: row.fetched,
      written: row.written,
      error: row.error,
      completedAt: row.completedAt,
    };
    out.set(row.feed, {
      feed: row.feed,
      latest: Number(row.anyRank) === 1 ? run : current.latest,
      lastSuccess: row.succeeded && Number(row.okRank) === 1 ? run : current.lastSuccess,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Delivery
// ---------------------------------------------------------------------------

export interface DeliveryUpsert {
  readonly instrumentId: number;
  readonly tradingDate: string;
  readonly tradedQty: number;
  readonly deliverableQty: number;
  readonly deliveryPercent: number;
  readonly closePaise: number;
  readonly prevClosePaise: number;
  readonly avgPricePaise: number;
  readonly turnoverPaise: number;
  readonly trades: number;
  readonly source: string;
}

export async function upsertDeliveryStats(
  db: Database,
  rows: readonly DeliveryUpsert[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(deliveryStats)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [deliveryStats.instrumentId, deliveryStats.tradingDate],
        set: {
          tradedQty: sql`excluded.traded_qty`,
          deliverableQty: sql`excluded.deliverable_qty`,
          deliveryPercent: sql`excluded.delivery_percent`,
          closePaise: sql`excluded.close_paise`,
          prevClosePaise: sql`excluded.prev_close_paise`,
          avgPricePaise: sql`excluded.avg_price_paise`,
          turnoverPaise: sql`excluded.turnover_paise`,
          trades: sql`excluded.trades`,
          source: sql`excluded.source`,
          ingestedAt: sql`now()`,
        },
      })
      .returning({ instrumentId: deliveryStats.instrumentId });
    written += result.length;
  }
  return written;
}

/** The most recent session with delivery data, or null when the table is empty. */
export async function latestDeliveryDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: sql<string | null>`max(${deliveryStats.tradingDate})` })
    .from(deliveryStats);
  return row?.tradingDate ?? null;
}

export interface DeliverySnapshotRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly companyName: string;
  readonly tradingDate: string;
  readonly tradedQty: number;
  readonly deliverableQty: number;
  readonly deliveryPercent: number;
  readonly closePaise: number;
  readonly prevClosePaise: number;
  readonly turnoverPaise: number;
  /** Mean delivery % over the trailing sessions, excluding this one. Null when none. */
  readonly trailingDeliveryPercent: number | null;
  /** Sample standard deviation of delivery % over the same sessions. Null under two. */
  readonly trailingDeliveryStdev: number | null;
  /** Mean traded quantity over the same trailing sessions. */
  readonly trailingTradedQty: number | null;
  /** How many trailing sessions the means are over. */
  readonly trailingSessions: number;
}

/** Trailing window, in calendar days, that holds ~20 sessions. */
const TRAILING_CALENDAR_DAYS = 30;

/**
 * Every stock's delivery row for one session, with its trailing averages.
 *
 * One query: the session's rows joined to a per-instrument aggregate of the
 * prior ~20 sessions. The aggregate deliberately excludes the session itself
 * so "today vs average" is not today vs (today + 19 others).
 */
export async function deliverySnapshot(
  db: Database,
  tradingDate: string,
): Promise<DeliverySnapshotRow[]> {
  const trailing = db
    .select({
      instrumentId: deliveryStats.instrumentId,
      avgPercent: sql<number>`avg(${deliveryStats.deliveryPercent})`.as('avg_percent'),
      stdevPercent: sql<number | null>`stddev_samp(${deliveryStats.deliveryPercent})`.as(
        'stdev_percent',
      ),
      avgQty: sql<number>`avg(${deliveryStats.tradedQty})`.as('avg_qty'),
      sessions: sql<number>`count(*)`.as('sessions'),
    })
    .from(deliveryStats)
    .where(
      and(
        lt(deliveryStats.tradingDate, tradingDate),
        gte(
          deliveryStats.tradingDate,
          sql`${tradingDate}::date - ${TRAILING_CALENDAR_DAYS}::integer`,
        ),
      ),
    )
    .groupBy(deliveryStats.instrumentId)
    .as('trailing');

  const rows = await db
    .select({
      instrumentId: deliveryStats.instrumentId,
      symbol: instruments.symbol,
      companyName: instruments.name,
      tradingDate: deliveryStats.tradingDate,
      tradedQty: deliveryStats.tradedQty,
      deliverableQty: deliveryStats.deliverableQty,
      deliveryPercent: deliveryStats.deliveryPercent,
      closePaise: deliveryStats.closePaise,
      prevClosePaise: deliveryStats.prevClosePaise,
      turnoverPaise: deliveryStats.turnoverPaise,
      trailingDeliveryPercent: trailing.avgPercent,
      trailingDeliveryStdev: trailing.stdevPercent,
      trailingTradedQty: trailing.avgQty,
      trailingSessions: trailing.sessions,
    })
    .from(deliveryStats)
    .innerJoin(instruments, eq(instruments.id, deliveryStats.instrumentId))
    .leftJoin(trailing, eq(trailing.instrumentId, deliveryStats.instrumentId))
    .where(eq(deliveryStats.tradingDate, tradingDate));

  return rows.map((row) => ({
    ...row,
    tradedQty: Number(row.tradedQty),
    deliverableQty: Number(row.deliverableQty),
    turnoverPaise: Number(row.turnoverPaise),
    trailingDeliveryPercent:
      row.trailingDeliveryPercent === null ? null : Number(row.trailingDeliveryPercent),
    trailingDeliveryStdev:
      row.trailingDeliveryStdev === null || row.trailingDeliveryStdev === undefined
        ? null
        : Number(row.trailingDeliveryStdev),
    trailingTradedQty: row.trailingTradedQty === null ? null : Number(row.trailingTradedQty),
    trailingSessions: Number(row.trailingSessions ?? 0),
  }));
}

export interface DeliveryHistoryRow {
  readonly tradingDate: string;
  readonly tradedQty: number;
  readonly deliverableQty: number;
  readonly deliveryPercent: number;
  readonly closePaise: number;
  readonly prevClosePaise: number;
}

/** One stock's recent delivery sessions, newest first. */
export async function deliveryHistory(
  db: Database,
  instrumentId: number,
  limit = 40,
): Promise<DeliveryHistoryRow[]> {
  const rows = await db
    .select({
      tradingDate: deliveryStats.tradingDate,
      tradedQty: deliveryStats.tradedQty,
      deliverableQty: deliveryStats.deliverableQty,
      deliveryPercent: deliveryStats.deliveryPercent,
      closePaise: deliveryStats.closePaise,
      prevClosePaise: deliveryStats.prevClosePaise,
    })
    .from(deliveryStats)
    .where(eq(deliveryStats.instrumentId, instrumentId))
    .orderBy(desc(deliveryStats.tradingDate))
    .limit(Math.min(limit, 250));
  return rows.map((row) => ({
    ...row,
    tradedQty: Number(row.tradedQty),
    deliverableQty: Number(row.deliverableQty),
  }));
}

// ---------------------------------------------------------------------------
// Participant-wise OI
// ---------------------------------------------------------------------------

export interface ParticipantOiUpsert {
  readonly tradingDate: string;
  readonly participant: string;
  readonly bucket: string;
  readonly longContracts: number;
  readonly shortContracts: number;
  readonly source: string;
}

export async function upsertParticipantOi(
  db: Database,
  rows: readonly ParticipantOiUpsert[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db
    .insert(participantOi)
    .values([...rows])
    .onConflictDoUpdate({
      target: [participantOi.tradingDate, participantOi.participant, participantOi.bucket],
      set: {
        longContracts: sql`excluded.long_contracts`,
        shortContracts: sql`excluded.short_contracts`,
        source: sql`excluded.source`,
        ingestedAt: sql`now()`,
      },
    })
    .returning({ tradingDate: participantOi.tradingDate });
  return result.length;
}

export interface ParticipantOiRow {
  readonly tradingDate: string;
  readonly participant: string;
  readonly bucket: string;
  readonly longContracts: number;
  readonly shortContracts: number;
}

/** Every participant/bucket row for the most recent `sessions` sessions, newest first. */
export async function recentParticipantOi(
  db: Database,
  sessions = 30,
): Promise<ParticipantOiRow[]> {
  const dates = db
    .selectDistinct({ tradingDate: participantOi.tradingDate })
    .from(participantOi)
    .orderBy(desc(participantOi.tradingDate))
    .limit(Math.min(sessions, 250))
    .as('dates');

  const rows = await db
    .select({
      tradingDate: participantOi.tradingDate,
      participant: participantOi.participant,
      bucket: participantOi.bucket,
      longContracts: participantOi.longContracts,
      shortContracts: participantOi.shortContracts,
    })
    .from(participantOi)
    .innerJoin(dates, eq(dates.tradingDate, participantOi.tradingDate))
    .orderBy(desc(participantOi.tradingDate));

  return rows.map((row) => ({
    ...row,
    longContracts: Number(row.longContracts),
    shortContracts: Number(row.shortContracts),
  }));
}

// ---------------------------------------------------------------------------
// Stock-futures OI
// ---------------------------------------------------------------------------

export interface DerivativeOiUpsert {
  readonly instrumentId: number;
  readonly tradingDate: string;
  readonly futuresOi: number;
  readonly oiChange: number | null;
  readonly nearExpiry: string;
  readonly futuresClosePaise: number;
  readonly closeChangePaise: number | null;
  readonly buildup: string | null;
  readonly contracts: number;
  readonly source: string;
}

export async function upsertDerivativeOi(
  db: Database,
  rows: readonly DerivativeOiUpsert[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(derivativeOiDaily)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [derivativeOiDaily.instrumentId, derivativeOiDaily.tradingDate],
        set: {
          futuresOi: sql`excluded.futures_oi`,
          oiChange: sql`excluded.oi_change`,
          nearExpiry: sql`excluded.near_expiry`,
          futuresClosePaise: sql`excluded.futures_close_paise`,
          closeChangePaise: sql`excluded.close_change_paise`,
          buildup: sql`excluded.buildup`,
          contracts: sql`excluded.contracts`,
          source: sql`excluded.source`,
          ingestedAt: sql`now()`,
        },
      })
      .returning({ instrumentId: derivativeOiDaily.instrumentId });
    written += result.length;
  }
  return written;
}

export interface DerivativeOiRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly tradingDate: string;
  readonly futuresOi: number;
  readonly oiChange: number | null;
  readonly nearExpiry: string;
  readonly futuresClosePaise: number;
  readonly closeChangePaise: number | null;
  readonly buildup: string | null;
}

function toDerivativeRow(row: {
  instrumentId: number;
  symbol: string;
  tradingDate: string;
  futuresOi: number;
  oiChange: number | null;
  nearExpiry: string;
  futuresClosePaise: number;
  closeChangePaise: number | null;
  buildup: string | null;
}): DerivativeOiRow {
  return {
    ...row,
    futuresOi: Number(row.futuresOi),
    oiChange: row.oiChange === null ? null : Number(row.oiChange),
  };
}

const derivativeColumns = {
  instrumentId: derivativeOiDaily.instrumentId,
  symbol: instruments.symbol,
  tradingDate: derivativeOiDaily.tradingDate,
  futuresOi: derivativeOiDaily.futuresOi,
  oiChange: derivativeOiDaily.oiChange,
  nearExpiry: derivativeOiDaily.nearExpiry,
  futuresClosePaise: derivativeOiDaily.futuresClosePaise,
  closeChangePaise: derivativeOiDaily.closeChangePaise,
  buildup: derivativeOiDaily.buildup,
};

/** The most recent OI row per instrument (each stock's latest session). */
export async function latestDerivativeOi(db: Database): Promise<DerivativeOiRow[]> {
  const rows = await db
    .selectDistinctOn([derivativeOiDaily.instrumentId], derivativeColumns)
    .from(derivativeOiDaily)
    .innerJoin(instruments, eq(instruments.id, derivativeOiDaily.instrumentId))
    .orderBy(derivativeOiDaily.instrumentId, desc(derivativeOiDaily.tradingDate));
  return rows.map(toDerivativeRow);
}

/** One stock's OI sessions, newest first. */
export async function derivativeOiHistory(
  db: Database,
  instrumentId: number,
  limit = 40,
): Promise<DerivativeOiRow[]> {
  const rows = await db
    .select(derivativeColumns)
    .from(derivativeOiDaily)
    .innerJoin(instruments, eq(instruments.id, derivativeOiDaily.instrumentId))
    .where(eq(derivativeOiDaily.instrumentId, instrumentId))
    .orderBy(desc(derivativeOiDaily.tradingDate))
    .limit(Math.min(limit, 250));
  return rows.map(toDerivativeRow);
}

/** The most recent session with OI data, or null when the table is empty. */
export async function latestDerivativeOiDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: sql<string | null>`max(${derivativeOiDaily.tradingDate})` })
    .from(derivativeOiDaily);
  return row?.tradingDate ?? null;
}

// ---------------------------------------------------------------------------
// Deals, aggregated per stock
// ---------------------------------------------------------------------------

export interface DealAggregateRow {
  readonly instrumentId: number;
  /** Σ buy value − Σ sell value, paise. */
  readonly netPaise: number;
  readonly buyPaise: number;
  readonly sellPaise: number;
  readonly deals: number;
  readonly latestDate: string;
}

/** Net bulk/block deal value per stock since `since` (inclusive). */
export async function dealAggregates(
  db: Database,
  since: string,
): Promise<Map<number, DealAggregateRow>> {
  const value = sql<number>`${bulkBlockDeals.quantity} * ${bulkBlockDeals.price}`;
  const signed = sql<number>`case when ${bulkBlockDeals.side} = 'sell' then -(${value}) else ${value} end`;
  const rows = await db
    .select({
      instrumentId: bulkBlockDeals.instrumentId,
      netPaise: sql<number>`sum(${signed})`,
      buyPaise: sql<number>`sum(case when ${bulkBlockDeals.side} = 'sell' then 0 else ${value} end)`,
      sellPaise: sql<number>`sum(case when ${bulkBlockDeals.side} = 'sell' then ${value} else 0 end)`,
      deals: sql<number>`count(*)`,
      latestDate: sql<string>`max(${bulkBlockDeals.tradingDate})`,
    })
    .from(bulkBlockDeals)
    .where(
      and(gte(bulkBlockDeals.tradingDate, since), sql`${bulkBlockDeals.instrumentId} is not null`),
    )
    .groupBy(bulkBlockDeals.instrumentId);

  const out = new Map<number, DealAggregateRow>();
  for (const row of rows) {
    if (row.instrumentId === null) continue;
    out.set(row.instrumentId, {
      instrumentId: row.instrumentId,
      netPaise: Number(row.netPaise),
      buyPaise: Number(row.buyPaise),
      sellPaise: Number(row.sellPaise),
      deals: Number(row.deals),
      latestDate: row.latestDate,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Shareholding history
// ---------------------------------------------------------------------------

export interface ShareholdingHistoryRow {
  readonly asOfDate: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
}

/** One stock's quarterly shareholding rows, newest first. */
export async function shareholdingHistory(
  db: Database,
  instrumentId: number,
  limit = 8,
): Promise<ShareholdingHistoryRow[]> {
  return db
    .select({
      asOfDate: shareholdingPatterns.asOfDate,
      promoterPercent: shareholdingPatterns.promoterPercent,
      fiiPercent: shareholdingPatterns.fiiPercent,
      diiPercent: shareholdingPatterns.diiPercent,
      publicPercent: shareholdingPatterns.publicPercent,
    })
    .from(shareholdingPatterns)
    .where(eq(shareholdingPatterns.instrumentId, instrumentId))
    .orderBy(desc(shareholdingPatterns.asOfDate))
    .limit(Math.min(limit, 40));
}

/**
 * The latest two quarters per instrument, so the main-page table can show a
 * quarter-on-quarter change alongside the snapshot.
 */
export async function latestTwoShareholdingForInstruments(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, ShareholdingHistoryRow[]>> {
  const out = new Map<number, ShareholdingHistoryRow[]>();
  if (instrumentIds.length === 0) return out;

  const ranked = db
    .select({
      instrumentId: shareholdingPatterns.instrumentId,
      asOfDate: shareholdingPatterns.asOfDate,
      promoterPercent: shareholdingPatterns.promoterPercent,
      fiiPercent: shareholdingPatterns.fiiPercent,
      diiPercent: shareholdingPatterns.diiPercent,
      publicPercent: shareholdingPatterns.publicPercent,
      rank: sql<number>`row_number() over (partition by ${shareholdingPatterns.instrumentId} order by ${shareholdingPatterns.asOfDate} desc)`.as(
        'rank',
      ),
    })
    .from(shareholdingPatterns)
    .where(inArray(shareholdingPatterns.instrumentId, [...instrumentIds]))
    .as('ranked');

  const rows = await db
    .select()
    .from(ranked)
    .where(sql`${ranked.rank} <= 2`)
    .orderBy(ranked.instrumentId, ranked.asOfDate);

  for (const row of rows) {
    const list = out.get(row.instrumentId) ?? [];
    // Newest first, matching `shareholdingHistory`.
    list.unshift({
      asOfDate: row.asOfDate,
      promoterPercent: row.promoterPercent,
      fiiPercent: row.fiiPercent,
      diiPercent: row.diiPercent,
      publicPercent: row.publicPercent,
    });
    out.set(row.instrumentId, list);
  }
  return out;
}
