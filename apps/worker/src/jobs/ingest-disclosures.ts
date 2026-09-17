import {
  type AnnouncementUpsert,
  type DealUpsert,
  type DeliveryUpsert,
  type FiiDiiUpsert,
  FLOW_FEEDS,
  listAllWatchedInstruments,
  type ParticipantOiUpsert,
  recordAnnouncementIngestion,
  recordFeedIngestion,
  resolveInstrumentIds,
  type ShareholdingUpsert,
  upsertAnnouncements,
  upsertDeals,
  upsertDeliveryStats,
  upsertFiiDiiFlows,
  upsertParticipantOi,
  upsertShareholding,
} from '@equitywise/db';
import type {
  DisclosureSource,
  RawAnnouncement,
  RawDeal,
  RawDeliveryStat,
  RawParticipantOi,
  RawShareholding,
} from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createIndiaDisclosureSource } from '../sources/india-disclosures.js';
import {
  interpretPendingAnnouncements,
  withAnnouncementInterpretation,
} from './interpret-announcements.js';

/**
 * Disclosure ingestion.
 *
 * Fetches the free official feeds (corporate announcements, FII/DII flows,
 * bulk & block deals, delivery, participant-wise OI, shareholding) from a
 * provider-neutral `DisclosureSource` and writes them through the idempotent
 * repository upserts. The source is injectable so the jobs are testable and so
 * a future feed swap is a one-line change at the composition root, not here.
 *
 * Every flow feed records each attempt in `feed_ingestion_runs` — success,
 * empty success and failure alike — so the page can say which dataset is
 * stale and why, rather than a fetch failing silently into "stale".
 *
 * These jobs never touch a market-data provider or mint a credential — the
 * disclosure feeds are a separate, public data path.
 */

/** Error name + message only; never the full error, which may carry a response body. */
function errorText(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`.slice(0, 500);
  return String(error).slice(0, 500);
}

/**
 * Runs one feed's fetch-and-write, recording the attempt either way.
 *
 * The failure is re-thrown after recording so the scheduler logs it like any
 * other job failure; what changes is that the page can now read the reason.
 */
export async function withFeedHealth(
  context: WorkerContext,
  feed: string,
  now: Date,
  run: () => Promise<IngestCount>,
): Promise<IngestCount> {
  try {
    const count = await run();
    await recordFeedIngestion(context.db, {
      feed,
      succeeded: true,
      fetched: count.fetched,
      written: count.written,
      startedAt: now,
      completedAt: new Date(),
    });
    return count;
  } catch (error) {
    await recordFeedIngestion(context.db, {
      feed,
      succeeded: false,
      fetched: 0,
      written: 0,
      error: errorText(error),
      startedAt: now,
      completedAt: new Date(),
    });
    throw error;
  }
}

interface JobOptions {
  readonly source?: DisclosureSource;
  readonly now?: Date;
}

const DAY_MS = 86_400_000;

/** Resolves a set of symbols to instrument ids, filling nulls for unknowns. */
async function resolve(
  context: WorkerContext,
  symbols: readonly string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(symbols.filter((s) => s !== ''))];
  if (unique.length === 0) return new Map();
  return resolveInstrumentIds(context.db, unique);
}

export interface IngestCount {
  readonly fetched: number;
  readonly written: number;
}

export async function ingestAnnouncements(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  const since = new Date(now.getTime() - 3 * DAY_MS);

  let fetched: readonly RawAnnouncement[] = [];
  try {
    await interpretPendingAnnouncements(context);
    fetched = await source.fetchAnnouncements({ since });
    const ids = await resolve(
      context,
      fetched.map((a: RawAnnouncement) => a.symbol),
    );

    const rows: AnnouncementUpsert[] = fetched.map((a) => ({
      instrumentId: ids.get(a.symbol) ?? null,
      symbol: a.symbol,
      companyName: a.companyName,
      source: a.source,
      externalId: a.externalId,
      category: a.category,
      headline: a.headline,
      detail: a.detail,
      attachmentUrl: a.attachmentUrl,
      announcedAt: a.announcedAt,
    }));

    const written = await upsertAnnouncements(context.db, rows.map(withAnnouncementInterpretation));
    await recordAnnouncementIngestion(context.db, {
      source: source.id,
      succeeded: true,
      fetched: fetched.length,
      written,
      startedAt: now,
      completedAt: new Date(),
    });
    log.info('announcements ingested', { fetched: fetched.length, written });
    return { fetched: fetched.length, written };
  } catch (error) {
    await recordAnnouncementIngestion(context.db, {
      source: source.id,
      succeeded: false,
      fetched: fetched.length,
      written: 0,
      startedAt: now,
      completedAt: new Date(),
    });
    log.warn('Announcement ingestion failed; existing filings remain available');
    throw error;
  }
}

export async function ingestFiiDii(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  return withFeedHealth(context, FLOW_FEEDS.fiiDii, now, async () => {
    const fetched = await source.fetchFiiDii({
      from: new Date(now.getTime() - 7 * DAY_MS),
      to: now,
    });
    const rows: FiiDiiUpsert[] = fetched.map((f) => ({
      tradingDate: f.tradingDate,
      participant: f.participant,
      segment: f.segment,
      buyValue: f.buyPaise,
      sellValue: f.sellPaise,
      netValue: f.netPaise,
      source: f.source,
    }));
    const written = await upsertFiiDiiFlows(context.db, rows);
    log.info('fii/dii ingested', { fetched: fetched.length, written });
    return { fetched: fetched.length, written };
  });
}

export async function ingestDeals(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  return withFeedHealth(context, FLOW_FEEDS.deals, now, async () => {
    const fetched = await source.fetchDeals({ date: now });
    const ids = await resolve(
      context,
      fetched.map((d: RawDeal) => d.symbol),
    );
    const rows: DealUpsert[] = fetched.map((d) => ({
      dealType: d.dealType,
      tradingDate: d.tradingDate,
      instrumentId: ids.get(d.symbol) ?? null,
      symbol: d.symbol,
      companyName: d.companyName,
      clientName: d.clientName,
      side: d.side,
      quantity: d.quantity,
      price: d.pricePaise,
      exchange: d.exchange,
      source: d.source,
      dedupeKey: d.externalId,
    }));
    const written = await upsertDeals(context.db, rows);
    log.info('deals ingested', { fetched: fetched.length, written });
    return { fetched: fetched.length, written };
  });
}

/**
 * The session's full bhavdata — delivery quantity and percentage per stock.
 *
 * Keyed by instrument id, so a symbol we do not track is skipped, not stored
 * orphaned. `date` defaults to now: the file for a session appears the same
 * evening, and a holiday simply 404s (recorded as a failed run, which the
 * next session's run supersedes).
 */
export async function ingestDeliveryStats(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { date?: Date } = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  return withFeedHealth(context, FLOW_FEEDS.delivery, now, async () => {
    const fetched = await source.fetchDeliveryStats({ date: options.date ?? now });
    const ids = await resolve(
      context,
      fetched.map((d: RawDeliveryStat) => d.symbol),
    );
    const rows: DeliveryUpsert[] = [];
    for (const d of fetched) {
      const instrumentId = ids.get(d.symbol);
      if (instrumentId === undefined) continue;
      rows.push({
        instrumentId,
        tradingDate: d.tradingDate,
        tradedQty: d.tradedQty,
        deliverableQty: d.deliverableQty,
        deliveryPercent: d.deliveryPercent,
        closePaise: d.closePaise,
        prevClosePaise: d.prevClosePaise,
        avgPricePaise: d.avgPricePaise,
        turnoverPaise: d.turnoverPaise,
        trades: d.trades,
        source: d.source,
      });
    }
    const written = await upsertDeliveryStats(context.db, rows);
    log.info('delivery ingested', {
      fetched: fetched.length,
      resolved: rows.length,
      written,
    });
    return { fetched: fetched.length, written };
  });
}

/** The session's participant-wise open interest (FII / DII / Pro / Client). */
export async function ingestParticipantOi(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { date?: Date } = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  return withFeedHealth(context, FLOW_FEEDS.participantOi, now, async () => {
    const fetched = await source.fetchParticipantOi({ date: options.date ?? now });
    const rows: ParticipantOiUpsert[] = fetched.map((r: RawParticipantOi) => ({
      tradingDate: r.tradingDate,
      participant: r.participant,
      bucket: r.bucket,
      longContracts: r.longContracts,
      shortContracts: r.shortContracts,
      source: r.source,
    }));
    const written = await upsertParticipantOi(context.db, rows);
    log.info('participant oi ingested', { fetched: fetched.length, written });
    return { fetched: fetched.length, written };
  });
}

/**
 * Quarterly shareholding for the names anyone follows.
 *
 * The feed is one request per symbol, so the demand set is every instrument
 * on any user's watchlist rather than the whole exchange. `symbols` overrides
 * that for a targeted re-fetch.
 */
export async function ingestShareholding(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { symbols?: readonly string[] } = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  return withFeedHealth(context, FLOW_FEEDS.shareholding, now, async () => {
    const symbols =
      options.symbols ?? (await listAllWatchedInstruments(context.db)).map((row) => row.symbol);
    const fetched = await source.fetchShareholding({ symbols });
    const ids = await resolve(
      context,
      fetched.map((s: RawShareholding) => s.symbol),
    );

    const rows: ShareholdingUpsert[] = [];
    for (const s of fetched) {
      const instrumentId = ids.get(s.symbol);
      // Shareholding is keyed by instrument id; an unresolved symbol is skipped
      // rather than stored orphaned.
      if (instrumentId === undefined) continue;
      rows.push({
        instrumentId,
        asOfDate: s.asOf,
        promoterPercent: s.promoterPercent,
        fiiPercent: s.fiiPercent,
        diiPercent: s.diiPercent,
        publicPercent: s.publicPercent,
        source: s.source,
      });
    }

    const written = await upsertShareholding(context.db, rows);
    log.info('shareholding ingested', {
      symbols: symbols.length,
      fetched: fetched.length,
      written,
    });
    return { fetched: fetched.length, written };
  });
}

/** Calendar days a flow backfill walks back. ~30 sessions, the trailing window the page averages over. */
const BACKFILL_DAYS = 45;

export interface BackfillResult {
  readonly sessions: number;
  readonly delivery: IngestCount;
  readonly participantOi: IngestCount;
  readonly missingDays: readonly string[];
}

/**
 * Walks the last {@link BACKFILL_DAYS} calendar days of the two date-addressed
 * archive feeds (delivery, participant-wise OI), oldest first.
 *
 * Weekends are skipped outright; a weekday with no file (an exchange holiday)
 * is recorded in `missingDays` and skipped, not treated as a failure — the
 * per-feed health rows are written by the daily jobs, not by this one-off.
 * Idempotent: every row upserts, so re-running only fills gaps.
 */
export async function backfillFlowFeeds(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { days?: number } = {},
): Promise<BackfillResult> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  const days = options.days ?? BACKFILL_DAYS;
  const totals = {
    delivery: { fetched: 0, written: 0 },
    participantOi: { fetched: 0, written: 0 },
  };
  const missingDays: string[] = [];
  let sessions = 0;

  for (let back = days; back >= 1; back -= 1) {
    const date = new Date(now.getTime() - back * DAY_MS);
    const weekday = new Intl.DateTimeFormat('en-US', {
      weekday: 'short',
      timeZone: 'Asia/Kolkata',
    }).format(date);
    if (weekday === 'Sat' || weekday === 'Sun') continue;
    const key = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(date);

    let delivery: readonly RawDeliveryStat[];
    try {
      delivery = await source.fetchDeliveryStats({ date });
    } catch (error) {
      // No file for a weekday is a holiday; anything else is still logged.
      missingDays.push(key);
      log.debug('no delivery file', { date: key, ...errorSummary(error) });
      continue;
    }
    sessions += 1;
    const ids = await resolve(
      context,
      delivery.map((d) => d.symbol),
    );
    const rows: DeliveryUpsert[] = [];
    for (const d of delivery) {
      const instrumentId = ids.get(d.symbol);
      if (instrumentId === undefined) continue;
      rows.push({
        instrumentId,
        tradingDate: d.tradingDate,
        tradedQty: d.tradedQty,
        deliverableQty: d.deliverableQty,
        deliveryPercent: d.deliveryPercent,
        closePaise: d.closePaise,
        prevClosePaise: d.prevClosePaise,
        avgPricePaise: d.avgPricePaise,
        turnoverPaise: d.turnoverPaise,
        trades: d.trades,
        source: d.source,
      });
    }
    totals.delivery.fetched += delivery.length;
    totals.delivery.written += await upsertDeliveryStats(context.db, rows);

    try {
      const oi = await source.fetchParticipantOi({ date });
      totals.participantOi.fetched += oi.length;
      totals.participantOi.written += await upsertParticipantOi(
        context.db,
        oi.map((r) => ({
          tradingDate: r.tradingDate,
          participant: r.participant,
          bucket: r.bucket,
          longContracts: r.longContracts,
          shortContracts: r.shortContracts,
          source: r.source,
        })),
      );
    } catch (error) {
      log.warn('participant oi missing for a session that has delivery', {
        date: key,
        ...errorSummary(error),
      });
    }
    log.info('session backfilled', { date: key, delivery: rows.length });
    // The archive host is a static CDN; still, one session at a time, politely.
    await new Promise((resolve) => setTimeout(resolve, 300));
  }

  log.info('backfill finished', {
    sessions,
    missingDays: missingDays.length,
    delivery: totals.delivery,
    participantOi: totals.participantOi,
  });
  return { sessions, ...totals, missingDays };
}

function errorSummary(error: unknown): Record<string, string> {
  return { errorMessage: error instanceof Error ? error.message : String(error) };
}
