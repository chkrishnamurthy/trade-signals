import {
  type AnnouncementUpsert,
  type DealUpsert,
  type FiiDiiUpsert,
  resolveInstrumentIds,
  type ShareholdingUpsert,
  upsertAnnouncements,
  upsertDeals,
  upsertFiiDiiFlows,
  upsertShareholding,
} from '@equitywise/db';
import type {
  DisclosureSource,
  RawAnnouncement,
  RawDeal,
  RawShareholding,
} from '@equitywise/market-data';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createIndiaDisclosureSource } from '../sources/india-disclosures.js';

/**
 * Disclosure ingestion.
 *
 * Fetches the free official feeds (corporate announcements, FII/DII flows,
 * bulk & block deals, shareholding) from a provider-neutral `DisclosureSource`
 * and writes them through the idempotent repository upserts. The source is
 * injectable so the jobs are testable and so a future feed swap is a one-line
 * change at the composition root, not here.
 *
 * These jobs never touch Fyers or mint a credential — the disclosure feeds are
 * a separate, public data path.
 */

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

  const fetched = await source.fetchAnnouncements({ since });
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

  const written = await upsertAnnouncements(context.db, rows);
  log.info('announcements ingested', { fetched: fetched.length, written });
  return { fetched: fetched.length, written };
}

export async function ingestFiiDii(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
  const fetched = await source.fetchFiiDii({ from: new Date(now.getTime() - 7 * DAY_MS), to: now });

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
}

export async function ingestDeals(
  context: WorkerContext,
  log: Logger,
  options: JobOptions = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const now = options.now ?? new Date();
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
}

export async function ingestShareholding(
  context: WorkerContext,
  log: Logger,
  options: JobOptions & { symbols?: readonly string[] } = {},
): Promise<IngestCount> {
  const source = options.source ?? createIndiaDisclosureSource();
  const fetched = await source.fetchShareholding({ symbols: options.symbols ?? [] });
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
  log.info('shareholding ingested', { fetched: fetched.length, written });
  return { fetched: fetched.length, written };
}
