import { and, desc, eq, gte, ilike, inArray, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  bulkBlockDeals,
  corporateAnnouncements,
  fiiDiiFlows,
  instruments,
  shareholdingPatterns,
} from '../schema/index.js';

/**
 * Persistence for exchange/regulator disclosures.
 *
 * Writers are the worker's ingestion jobs; readers are the web app's
 * announcements and institutional-flow pages. Every write is idempotent on a
 * natural key so re-running a fetch cannot duplicate a filing, and every read is
 * a single bounded query — no N+1.
 */

const CHUNK = 500;

// ---------------------------------------------------------------------------
// Corporate announcements
// ---------------------------------------------------------------------------

export interface AnnouncementUpsert {
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly source: string;
  readonly externalId: string;
  readonly category: string | null;
  readonly headline: string;
  readonly detail: string | null;
  readonly attachmentUrl: string | null;
  readonly announcedAt: Date;
}

export async function upsertAnnouncements(
  db: Database,
  rows: readonly AnnouncementUpsert[],
): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(corporateAnnouncements)
      .values(
        chunk.map((row) => ({
          instrumentId: row.instrumentId,
          symbol: row.symbol,
          companyName: row.companyName,
          source: row.source,
          externalId: row.externalId,
          category: row.category,
          headline: row.headline,
          detail: row.detail,
          attachmentUrl: row.attachmentUrl,
          announcedAt: row.announcedAt,
        })),
      )
      .onConflictDoUpdate({
        target: [corporateAnnouncements.source, corporateAnnouncements.externalId],
        set: {
          instrumentId: sql`excluded.instrument_id`,
          category: sql`excluded.category`,
          headline: sql`excluded.headline`,
          detail: sql`excluded.detail`,
          attachmentUrl: sql`excluded.attachment_url`,
          announcedAt: sql`excluded.announced_at`,
        },
      })
      .returning({ id: corporateAnnouncements.id });
    written += result.length;
  }
  return written;
}

export interface AnnouncementRow {
  readonly id: number;
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly category: string | null;
  readonly headline: string;
  readonly detail: string | null;
  readonly attachmentUrl: string | null;
  readonly announcedAt: Date;
  readonly source: string;
}

export interface AnnouncementQuery {
  /** Restrict to these instruments (e.g. the user's watchlist). */
  readonly instrumentIds?: readonly number[];
  /** Restrict to these exchange symbols (e.g. one stock's history). */
  readonly symbols?: readonly string[];
  /** Restrict to these categories. */
  readonly categories?: readonly string[];
  /** Only announcements at or after this instant. */
  readonly since?: Date;
  /** Free-text match across symbol, company name and headline (case-insensitive). */
  readonly search?: string;
  /**
   * When set, keep only rows whose category OR headline matches one of these
   * SQL `ILIKE` patterns (e.g. `%dividend%`). The caller owns the pattern list
   * so "high impact" stays a single source of truth in the app layer.
   */
  readonly matchPatterns?: readonly string[];
  readonly limit?: number;
  readonly offset?: number;
}

export interface AnnouncementResult {
  readonly rows: readonly AnnouncementRow[];
  readonly total: number;
}

const MAX_ANNOUNCEMENTS = 200;

export async function getAnnouncements(
  db: Database,
  query: AnnouncementQuery = {},
): Promise<AnnouncementResult> {
  const conditions: SQL[] = [];
  if (query.instrumentIds !== undefined) {
    if (query.instrumentIds.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(corporateAnnouncements.instrumentId, [...query.instrumentIds]));
  }
  if (query.symbols !== undefined) {
    if (query.symbols.length === 0) return { rows: [], total: 0 };
    conditions.push(inArray(corporateAnnouncements.symbol, [...query.symbols]));
  }
  if (query.categories !== undefined && query.categories.length > 0) {
    conditions.push(inArray(corporateAnnouncements.category, [...query.categories]));
  }
  if (query.since !== undefined) {
    conditions.push(gte(corporateAnnouncements.announcedAt, query.since));
  }
  if (query.search !== undefined && query.search.trim() !== '') {
    const term = `%${query.search.trim()}%`;
    const match = or(
      ilike(corporateAnnouncements.symbol, term),
      ilike(corporateAnnouncements.companyName, term),
      ilike(corporateAnnouncements.headline, term),
    );
    if (match !== undefined) conditions.push(match);
  }
  if (query.matchPatterns !== undefined && query.matchPatterns.length > 0) {
    const clauses: SQL[] = [];
    for (const pattern of query.matchPatterns) {
      clauses.push(ilike(corporateAnnouncements.category, pattern));
      clauses.push(ilike(corporateAnnouncements.headline, pattern));
    }
    const match = or(...clauses);
    if (match !== undefined) conditions.push(match);
  }
  const where = conditions.length === 0 ? undefined : and(...conditions);

  const [countRow] = await db
    .select({ total: sql<number>`count(*)::int` })
    .from(corporateAnnouncements)
    .where(where);

  const rows = await db
    .select({
      id: corporateAnnouncements.id,
      instrumentId: corporateAnnouncements.instrumentId,
      symbol: corporateAnnouncements.symbol,
      companyName: corporateAnnouncements.companyName,
      category: corporateAnnouncements.category,
      headline: corporateAnnouncements.headline,
      detail: corporateAnnouncements.detail,
      attachmentUrl: corporateAnnouncements.attachmentUrl,
      announcedAt: corporateAnnouncements.announcedAt,
      source: corporateAnnouncements.source,
    })
    .from(corporateAnnouncements)
    .where(where)
    .orderBy(desc(corporateAnnouncements.announcedAt))
    .limit(Math.min(query.limit ?? 50, MAX_ANNOUNCEMENTS))
    .offset(query.offset ?? 0);

  return { rows: rows.map((row) => ({ ...row, id: Number(row.id) })), total: countRow?.total ?? 0 };
}

/** Distinct categories present, for the filter UI. */
export async function listAnnouncementCategories(db: Database): Promise<string[]> {
  const rows = await db
    .selectDistinct({ category: corporateAnnouncements.category })
    .from(corporateAnnouncements)
    .orderBy(corporateAnnouncements.category);
  return rows.map((row) => row.category).filter((c): c is string => c !== null);
}

// ---------------------------------------------------------------------------
// FII / DII flows
// ---------------------------------------------------------------------------

export interface FiiDiiUpsert {
  readonly tradingDate: string;
  readonly participant: string;
  readonly segment: string;
  readonly buyValue: number;
  readonly sellValue: number;
  readonly netValue: number;
  readonly source: string;
}

export async function upsertFiiDiiFlows(
  db: Database,
  rows: readonly FiiDiiUpsert[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db
    .insert(fiiDiiFlows)
    .values([...rows])
    .onConflictDoUpdate({
      target: [fiiDiiFlows.tradingDate, fiiDiiFlows.participant, fiiDiiFlows.segment],
      set: {
        buyValue: sql`excluded.buy_value`,
        sellValue: sql`excluded.sell_value`,
        netValue: sql`excluded.net_value`,
        source: sql`excluded.source`,
        ingestedAt: sql`now()`,
      },
    })
    .returning({ tradingDate: fiiDiiFlows.tradingDate });
  return result.length;
}

export interface FiiDiiRow {
  readonly tradingDate: string;
  readonly participant: string;
  readonly segment: string;
  readonly buyValue: number;
  readonly sellValue: number;
  readonly netValue: number;
}

/** Recent flow rows, newest first. `days` bounds the window. */
export async function getRecentFiiDii(
  db: Database,
  options: { segment?: string; days?: number } = {},
): Promise<FiiDiiRow[]> {
  const conditions: SQL[] = [];
  if (options.segment !== undefined) conditions.push(eq(fiiDiiFlows.segment, options.segment));

  const rows = await db
    .select({
      tradingDate: fiiDiiFlows.tradingDate,
      participant: fiiDiiFlows.participant,
      segment: fiiDiiFlows.segment,
      buyValue: fiiDiiFlows.buyValue,
      sellValue: fiiDiiFlows.sellValue,
      netValue: fiiDiiFlows.netValue,
    })
    .from(fiiDiiFlows)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(fiiDiiFlows.tradingDate))
    .limit((options.days ?? 30) * 4);

  return rows.map((row) => ({
    ...row,
    buyValue: Number(row.buyValue),
    sellValue: Number(row.sellValue),
    netValue: Number(row.netValue),
  }));
}

// ---------------------------------------------------------------------------
// Bulk & block deals
// ---------------------------------------------------------------------------

export interface DealUpsert {
  readonly dealType: string;
  readonly tradingDate: string;
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly side: string;
  readonly quantity: number;
  readonly price: number;
  readonly exchange: string;
  readonly source: string;
  readonly dedupeKey: string;
}

export async function upsertDeals(db: Database, rows: readonly DealUpsert[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(bulkBlockDeals)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [bulkBlockDeals.source, bulkBlockDeals.dedupeKey],
        set: {
          instrumentId: sql`excluded.instrument_id`,
          quantity: sql`excluded.quantity`,
          price: sql`excluded.price`,
        },
      })
      .returning({ id: bulkBlockDeals.id });
    written += result.length;
  }
  return written;
}

export interface DealRow {
  readonly id: number;
  readonly dealType: string;
  readonly tradingDate: string;
  readonly instrumentId: number | null;
  readonly symbol: string;
  readonly companyName: string;
  readonly clientName: string;
  readonly side: string;
  readonly quantity: number;
  readonly price: number;
  readonly exchange: string;
}

export interface DealQuery {
  readonly instrumentIds?: readonly number[];
  readonly dealType?: string;
  readonly limit?: number;
}

export async function getRecentDeals(db: Database, query: DealQuery = {}): Promise<DealRow[]> {
  const conditions: SQL[] = [];
  if (query.instrumentIds !== undefined) {
    if (query.instrumentIds.length === 0) return [];
    conditions.push(inArray(bulkBlockDeals.instrumentId, [...query.instrumentIds]));
  }
  if (query.dealType !== undefined) conditions.push(eq(bulkBlockDeals.dealType, query.dealType));

  const rows = await db
    .select({
      id: bulkBlockDeals.id,
      dealType: bulkBlockDeals.dealType,
      tradingDate: bulkBlockDeals.tradingDate,
      instrumentId: bulkBlockDeals.instrumentId,
      symbol: bulkBlockDeals.symbol,
      companyName: bulkBlockDeals.companyName,
      clientName: bulkBlockDeals.clientName,
      side: bulkBlockDeals.side,
      quantity: bulkBlockDeals.quantity,
      price: bulkBlockDeals.price,
      exchange: bulkBlockDeals.exchange,
    })
    .from(bulkBlockDeals)
    .where(conditions.length === 0 ? undefined : and(...conditions))
    .orderBy(desc(bulkBlockDeals.tradingDate), desc(bulkBlockDeals.id))
    .limit(Math.min(query.limit ?? 100, 300));

  return rows.map((row) => ({
    ...row,
    id: Number(row.id),
    quantity: Number(row.quantity),
  }));
}

// ---------------------------------------------------------------------------
// Shareholding patterns
// ---------------------------------------------------------------------------

export interface ShareholdingUpsert {
  readonly instrumentId: number;
  readonly asOfDate: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
  readonly source: string;
}

export async function upsertShareholding(
  db: Database,
  rows: readonly ShareholdingUpsert[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const result = await db
    .insert(shareholdingPatterns)
    .values([...rows])
    .onConflictDoUpdate({
      target: [shareholdingPatterns.instrumentId, shareholdingPatterns.asOfDate],
      set: {
        promoterPercent: sql`excluded.promoter_percent`,
        fiiPercent: sql`excluded.fii_percent`,
        diiPercent: sql`excluded.dii_percent`,
        publicPercent: sql`excluded.public_percent`,
        source: sql`excluded.source`,
      },
    })
    .returning({ instrumentId: shareholdingPatterns.instrumentId });
  return result.length;
}

export interface ShareholdingRow {
  readonly instrumentId: number;
  readonly symbol: string;
  readonly companyName: string;
  readonly asOfDate: string;
  readonly promoterPercent: number | null;
  readonly fiiPercent: number | null;
  readonly diiPercent: number | null;
  readonly publicPercent: number | null;
}

/** The latest shareholding row for each of a set of instruments. */
export async function latestShareholdingForInstruments(
  db: Database,
  instrumentIds: readonly number[],
): Promise<Map<number, ShareholdingRow>> {
  if (instrumentIds.length === 0) return new Map();

  const rows = await db
    .selectDistinctOn([shareholdingPatterns.instrumentId], {
      instrumentId: shareholdingPatterns.instrumentId,
      symbol: instruments.symbol,
      companyName: instruments.name,
      asOfDate: shareholdingPatterns.asOfDate,
      promoterPercent: shareholdingPatterns.promoterPercent,
      fiiPercent: shareholdingPatterns.fiiPercent,
      diiPercent: shareholdingPatterns.diiPercent,
      publicPercent: shareholdingPatterns.publicPercent,
    })
    .from(shareholdingPatterns)
    .innerJoin(instruments, eq(instruments.id, shareholdingPatterns.instrumentId))
    .where(inArray(shareholdingPatterns.instrumentId, [...instrumentIds]))
    .orderBy(shareholdingPatterns.instrumentId, desc(shareholdingPatterns.asOfDate));

  return new Map(rows.map((row) => [row.instrumentId, row]));
}
