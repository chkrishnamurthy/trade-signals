import {
  type AnnouncementUpsert,
  announcementIngestionHealth,
  type DealUpsert,
  type DeliveryUpsert,
  type FiiDiiUpsert,
  FLOW_FEEDS,
  listAllWatchedInstruments,
  listAnnouncementsWithScripCodeSymbols,
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
import { istParts } from '@equitywise/shared';
import type { WorkerContext } from '../context.js';
import { errorFields, type Logger } from '../log.js';
import {
  createIndiaDisclosureSource,
  listingSymbol,
  loadSymbolDirectory,
  type SymbolDirectory,
} from '../sources/india-disclosures.js';
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
  /** Test seam: where the relink pass reads BSE's and NSE's listings. */
  readonly loadDirectory?: () => Promise<SymbolDirectory>;
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

/** How far back the first run, or the first after a long outage, reaches. */
const ANNOUNCEMENT_LOOKBACK_MS = 3 * DAY_MS;
/** Re-read this much before the last success, for filings the exchange indexes late. */
const ANNOUNCEMENT_OVERLAP_MS = 2 * 60 * 60_000;

/**
 * Where an announcement run starts reading.
 *
 * Just before the last successful run, so a sweep re-reads hours rather than
 * BSE's ~3,000 filings a day — capped at the lookback. A failed run never
 * moves the start, so the next run covers whatever it missed.
 */
export function announcementWindowStart(now: Date, lastSuccessStartedAt: Date | null): Date {
  const floor = now.getTime() - ANNOUNCEMENT_LOOKBACK_MS;
  if (lastSuccessStartedAt === null) return new Date(floor);
  return new Date(Math.max(floor, lastSuccessStartedAt.getTime() - ANNOUNCEMENT_OVERLAP_MS));
}

/** IST weekday hours in which BSE filings arrive in volume. */
const FILING_HOURS = { from: 9, to: 20 } as const;
/** A weekday window with at least this many such hours cannot honestly contain no filings. */
const MIN_FILING_HOURS_TO_EXPECT_ANY = 3;

/**
 * How many whole-ish weekday business hours (09:00–20:00 IST) the window `[since, now]`
 * covers, counted by the hour. BSE posts hundreds of filings an hour then, so a
 * window with several of them and no filings means the endpoint changed, not that the
 * market was quiet.
 */
export function businessHoursInWindow(since: Date, now: Date): number {
  let hours = 0;
  for (let at = since.getTime(); at < now.getTime(); at += 3_600_000) {
    const parts = istParts(new Date(at));
    const weekday = parts.weekday >= 1 && parts.weekday <= 5;
    if (weekday && parts.hour >= FILING_HOURS.from && parts.hour < FILING_HOURS.to) hours += 1;
  }
  return hours;
}

/** Off-switch for the BSE crawl: `BSE_ANNOUNCEMENTS_ENABLED=false`. */
function bseAnnouncementsDisabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.BSE_ANNOUNCEMENTS_ENABLED?.trim().toLowerCase() === 'false';
}

export async function ingestAnnouncements(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source =
    options.source ?? createIndiaDisclosureSource({ warn: (message) => log.warn(message) });
  const now = options.now ?? new Date();

  if (bseAnnouncementsDisabled()) {
    log.info('BSE announcements are switched off (BSE_ANNOUNCEMENTS_ENABLED=false)');
    return { fetched: 0, written: 0 };
  }

  let fetched = 0;
  let written = 0;
  /** Resolves and stores one batch. Idempotent, so a retry of the same window is harmless. */
  const save = async (batch: readonly RawAnnouncement[]): Promise<void> => {
    if (batch.length === 0) return;
    const ids = await resolve(
      context,
      batch.map((a) => a.symbol),
    );
    const rows: AnnouncementUpsert[] = batch.map((a) => ({
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
    written += await upsertAnnouncements(context.db, rows.map(withAnnouncementInterpretation));
    fetched += batch.length;
  };

  try {
    await interpretPendingAnnouncements(context);
    const health = await announcementIngestionHealth(context.db);
    const since = announcementWindowStart(now, health.successful?.startedAt ?? null);

    // Days are stored as they complete, so a crawl that dies on an older day keeps the newer ones.
    const rest = await source.fetchAnnouncements({ since, now, onBatch: save });
    await save(rest);

    // A "successful" run that found nothing across several business hours is how the
    // previous endpoint failed (it answered "No Record Found!" to everything). Record it
    // as a failure so the window does not move past filings that were never read.
    const hours = businessHoursInWindow(since, now);
    if (fetched === 0 && hours >= MIN_FILING_HOURS_TO_EXPECT_ANY) {
      throw new Error(
        `BSE returned no filings across ${hours} weekday business hours since ${since.toISOString()}; the endpoint may have changed (or this was a market holiday)`,
      );
    }

    await recordAnnouncementIngestion(context.db, {
      source: source.id,
      succeeded: true,
      fetched,
      written,
      startedAt: now,
      completedAt: new Date(),
    });
    log.info('announcements ingested', { fetched, written });

    // Best effort: repairing old rows must never fail a run that already stored its filings.
    await relinkAnnouncementSymbols(context, log, options).catch((error: unknown) =>
      log.warn('could not relink announcement symbols', errorFields(error)),
    );
    return { fetched, written };
  } catch (error) {
    await recordAnnouncementIngestion(context.db, {
      source: source.id,
      succeeded: false,
      fetched,
      written,
      error: errorText(error),
      startedAt: now,
      completedAt: new Date(),
    });
    log.warn('Announcement ingestion failed; existing filings remain available');
    throw error;
  }
}

/**
 * Replaces BSE scrip codes with real symbols on filings already stored.
 *
 * The first BSE ingestion kept the numeric `SCRIP_CD` as the symbol, and a run that
 * could not read the listings keeps it on purpose. Those filings reach no watchlist.
 * This reads the listings, maps each code to its NSE symbol (or `BSE:<ticker>`), and
 * writes the rows back through the normal upsert, so every change is recorded as a
 * new version of the filing. Reads nothing from the network when there is nothing to fix,
 * and does nothing at all while the listings are incomplete.
 */
export async function relinkAnnouncementSymbols(
  context: WorkerContext,
  log: Logger,
  options: { loadDirectory?: () => Promise<SymbolDirectory> } = {},
): Promise<number> {
  const stale = await listAnnouncementsWithScripCodeSymbols(context.db, 500);
  if (stale.length === 0) return 0;

  const directory = await (options.loadDirectory ?? (() => loadSymbolDirectory()))();
  if (!directory.complete) {
    log.warn('not relinking announcement symbols yet: the listings are incomplete', {
      waiting: stale.length,
    });
    return 0;
  }

  const symbols = stale.map((row) =>
    listingSymbol(row.symbol, directory.scrips, directory.nseByIsin),
  );
  const ids = await resolve(context, symbols);
  const repaired: AnnouncementUpsert[] = stale.map((row, index) => {
    const symbol = symbols[index] ?? row.symbol;
    return { ...row, symbol, instrumentId: ids.get(symbol) ?? null };
  });
  await upsertAnnouncements(context.db, repaired);
  log.info('announcement symbols relinked', {
    relinked: repaired.length,
    onNse: repaired.filter((row) => row.instrumentId !== null).length,
  });
  return repaired.length;
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
