import { createHash } from 'node:crypto';
import { slugFor } from '@equitywise/core';
import type {
  FieldSources,
  IpoBoard,
  IpoExchange,
  IpoStatus,
  IpoSubscriptionCategory,
  SubscriptionScope,
} from '@equitywise/shared';
import { and, asc, desc, eq, inArray, isNull, like, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  ipoDocuments,
  ipoGmpSnapshots,
  ipoIssues,
  ipoListingPerformance,
  ipoRhpExtracts,
  ipoSebiFilings,
  ipoSourceRecords,
  ipoSubscriptionSnapshots,
} from '../schema/index.js';
import type { RhpTableData } from '../schema/ipos.js';

/**
 * Persistence for IPOs (docs/planning/ipos-plan.md §6).
 *
 * Writers are the worker's IPO jobs; readers are the web app's `/ipos` pages
 * and APIs. Every write is idempotent on a natural key, so re-running a fetch
 * never duplicates an issue, a snapshot or a document.
 */

/** Feed ids in `feed_ingestion_runs`: `ipo-nse-calendar`, `ipo-investorgain-gmp`, … */
export function ipoFeedId(source: string, feed: string): string {
  return `ipo-${source}-${feed}`;
}

export type IpoIssueRow = typeof ipoIssues.$inferSelect;

// ---------------------------------------------------------------------------
// Source records — every observation, with a change history
// ---------------------------------------------------------------------------

/** JSON with object keys sorted, so equal observations hash equally. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (v instanceof Date) return v.toISOString();
    if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
      const sorted: Record<string, unknown> = {};
      for (const k of Object.keys(v as Record<string, unknown>).sort())
        sorted[k] = (v as Record<string, unknown>)[k];
      return sorted;
    }
    return v;
  });
}

export function payloadHash(payload: unknown): string {
  return createHash('sha256').update(canonicalJson(payload)).digest('hex');
}

export interface SourceObservationInput {
  readonly ipoId: number | null;
  readonly source: string;
  readonly feed: string;
  readonly externalKey: string;
  readonly sourceUrl: string;
  readonly payload: Record<string, unknown>;
  readonly seenAt: Date;
}

/**
 * Records one observation. An unchanged payload only bumps `last_seen_at`
 * (and fills a newly known `ipo_id`); a changed one becomes a new row, which
 * is the change history. Returns whether the payload was new — or newly
 * attached to this issue: a known payload whose row had lost or lacked its
 * `ipo_id` (the issue was recreated, or matched late) must re-resolve it too.
 */
export async function recordSourceObservation(
  db: Database,
  input: SourceObservationInput,
): Promise<{ id: number; changed: boolean }> {
  const payload = JSON.parse(canonicalJson(input.payload)) as Record<string, unknown>;
  const hash = payloadHash(payload);
  const [prior] =
    input.ipoId === null
      ? []
      : await db
          .select({ ipoId: ipoSourceRecords.ipoId })
          .from(ipoSourceRecords)
          .where(
            and(
              eq(ipoSourceRecords.source, input.source),
              eq(ipoSourceRecords.feed, input.feed),
              eq(ipoSourceRecords.externalKey, input.externalKey),
              eq(ipoSourceRecords.payloadHash, hash),
            ),
          )
          .limit(1);
  const [row] = await db
    .insert(ipoSourceRecords)
    .values({
      ipoId: input.ipoId,
      source: input.source,
      feed: input.feed,
      externalKey: input.externalKey,
      sourceUrl: input.sourceUrl,
      payload,
      payloadHash: hash,
      firstSeenAt: input.seenAt,
      lastSeenAt: input.seenAt,
    })
    .onConflictDoUpdate({
      target: [
        ipoSourceRecords.source,
        ipoSourceRecords.feed,
        ipoSourceRecords.externalKey,
        ipoSourceRecords.payloadHash,
      ],
      set: {
        lastSeenAt: sql`greatest(${ipoSourceRecords.lastSeenAt}, excluded.last_seen_at)`,
        ipoId: sql`coalesce(excluded.ipo_id, ${ipoSourceRecords.ipoId})`,
      },
    })
    .returning({ id: ipoSourceRecords.id, inserted: sql<boolean>`(xmax = 0)` });
  if (row === undefined) throw new Error('recordSourceObservation: no row returned');
  const attached = prior !== undefined && prior.ipoId !== input.ipoId;
  return { id: row.id, changed: row.inserted || attached };
}

/** Attaches every version of one source key to an issue (after a late match). */
export async function attachSourceKey(
  db: Database,
  key: { source: string; externalKey: string },
  ipoId: number,
): Promise<void> {
  await db
    .update(ipoSourceRecords)
    .set({ ipoId })
    .where(
      and(
        eq(ipoSourceRecords.source, key.source),
        eq(ipoSourceRecords.externalKey, key.externalKey),
        isNull(ipoSourceRecords.ipoId),
      ),
    );
}

export interface SourceObservationRow {
  readonly source: string;
  readonly feed: string;
  readonly externalKey: string;
  readonly sourceUrl: string;
  readonly payload: Record<string, unknown>;
  readonly lastSeenAt: Date;
}

/**
 * The latest version of every (source, feed, key) attached to an issue —
 * the resolver's input.
 */
export async function latestObservationsForIssue(
  db: Database,
  ipoId: number,
): Promise<SourceObservationRow[]> {
  const rows = await db
    .selectDistinctOn(
      [ipoSourceRecords.source, ipoSourceRecords.feed, ipoSourceRecords.externalKey],
      {
        source: ipoSourceRecords.source,
        feed: ipoSourceRecords.feed,
        externalKey: ipoSourceRecords.externalKey,
        sourceUrl: ipoSourceRecords.sourceUrl,
        payload: ipoSourceRecords.payload,
        lastSeenAt: ipoSourceRecords.lastSeenAt,
      },
    )
    .from(ipoSourceRecords)
    .where(eq(ipoSourceRecords.ipoId, ipoId))
    .orderBy(
      ipoSourceRecords.source,
      ipoSourceRecords.feed,
      ipoSourceRecords.externalKey,
      desc(ipoSourceRecords.lastSeenAt),
      desc(ipoSourceRecords.id),
    );
  return rows;
}

export interface UnmatchedRecordRow {
  readonly source: string;
  readonly feed: string;
  readonly externalKey: string;
  readonly sourceUrl: string;
  readonly payload: Record<string, unknown>;
  readonly lastSeenAt: Date;
}

/** The latest external key each issue has at one source and feed (e.g. BSE's `bse:8020`). */
export async function sourceKeysFor(
  db: Database,
  source: string,
  feed: string,
  ipoIds: readonly number[],
): Promise<Map<number, string>> {
  if (ipoIds.length === 0) return new Map();
  const rows = await db
    .selectDistinctOn([ipoSourceRecords.ipoId], {
      ipoId: ipoSourceRecords.ipoId,
      externalKey: ipoSourceRecords.externalKey,
    })
    .from(ipoSourceRecords)
    .where(
      and(
        eq(ipoSourceRecords.source, source),
        eq(ipoSourceRecords.feed, feed),
        inArray(ipoSourceRecords.ipoId, [...ipoIds]),
      ),
    )
    .orderBy(ipoSourceRecords.ipoId, desc(ipoSourceRecords.lastSeenAt));
  const out = new Map<number, string>();
  for (const r of rows) if (r.ipoId !== null) out.set(r.ipoId, r.externalKey);
  return out;
}

/** Recently seen observations no issue claims — the operator's to-check list. */
export async function listUnmatchedSourceRecords(
  db: Database,
  since: Date,
  limit = 100,
): Promise<UnmatchedRecordRow[]> {
  return db
    .selectDistinctOn(
      [ipoSourceRecords.source, ipoSourceRecords.feed, ipoSourceRecords.externalKey],
      {
        source: ipoSourceRecords.source,
        feed: ipoSourceRecords.feed,
        externalKey: ipoSourceRecords.externalKey,
        sourceUrl: ipoSourceRecords.sourceUrl,
        payload: ipoSourceRecords.payload,
        lastSeenAt: ipoSourceRecords.lastSeenAt,
      },
    )
    .from(ipoSourceRecords)
    .where(and(isNull(ipoSourceRecords.ipoId), sql`${ipoSourceRecords.lastSeenAt} >= ${since}`))
    .orderBy(
      ipoSourceRecords.source,
      ipoSourceRecords.feed,
      ipoSourceRecords.externalKey,
      desc(ipoSourceRecords.lastSeenAt),
    )
    .limit(limit);
}

// ---------------------------------------------------------------------------
// Canonical issues
// ---------------------------------------------------------------------------

export interface IpoIdentityRow {
  readonly id: number;
  readonly slug: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly isin: string | null;
  readonly nseSymbol: string | null;
  readonly bseScripCode: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
}

/** Every issue's identity, for matching. Hundreds of rows a year — cheap. */
export async function listIssueIdentities(db: Database): Promise<IpoIdentityRow[]> {
  const rows = await db
    .select({
      id: ipoIssues.id,
      slug: ipoIssues.slug,
      companyName: ipoIssues.companyName,
      board: ipoIssues.board,
      isin: ipoIssues.isin,
      nseSymbol: ipoIssues.nseSymbol,
      bseScripCode: ipoIssues.bseScripCode,
      openDate: ipoIssues.openDate,
      closeDate: ipoIssues.closeDate,
    })
    .from(ipoIssues);
  return rows.map((r) => ({ ...r, board: r.board as IpoBoard }));
}

export interface NewIpoIssue {
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly openDate: string | null;
  readonly nseSymbol: string | null;
  readonly nseSeries: string | null;
  readonly bseScripCode: string | null;
  readonly isin: string | null;
  /** The year the slug carries; the open date's year when known. */
  readonly slugYear: number;
}

/** Creates an issue with a unique slug. Identity facts are refined by the resolver. */
export async function createIpoIssue(db: Database, input: NewIpoIssue): Promise<number> {
  const stem = slugFor(input.companyName, input.slugYear, new Set());
  const existing = await db
    .select({ slug: ipoIssues.slug })
    .from(ipoIssues)
    .where(or(eq(ipoIssues.slug, stem), like(ipoIssues.slug, `${stem}-%`)));
  const slug = slugFor(input.companyName, input.slugYear, new Set(existing.map((r) => r.slug)));
  const [row] = await db
    .insert(ipoIssues)
    .values({
      slug,
      companyName: input.companyName,
      board: input.board,
      openDate: input.openDate,
      nseSymbol: input.nseSymbol,
      nseSeries: input.nseSeries,
      bseScripCode: input.bseScripCode,
      isin: input.isin,
    })
    .returning({ id: ipoIssues.id });
  if (row === undefined) throw new Error('createIpoIssue: no row returned');
  return row.id;
}

/** The resolver's output: every canonical column it may set, plus provenance. */
export type IpoIssuePatch = Partial<
  Omit<typeof ipoIssues.$inferInsert, 'id' | 'slug' | 'firstSeenAt' | 'updatedAt' | 'fieldSources'>
> & { readonly fieldSources: FieldSources };

export async function updateIpoIssue(
  db: Database,
  id: number,
  patch: IpoIssuePatch,
): Promise<void> {
  await db
    .update(ipoIssues)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(ipoIssues.id, id));
}

export async function getIpoById(db: Database, id: number): Promise<IpoIssueRow | null> {
  const [row] = await db.select().from(ipoIssues).where(eq(ipoIssues.id, id));
  return row ?? null;
}

export async function getIpoBySlug(db: Database, slug: string): Promise<IpoIssueRow | null> {
  const [row] = await db.select().from(ipoIssues).where(eq(ipoIssues.slug, slug));
  return row ?? null;
}

// ---------------------------------------------------------------------------
// Status in SQL — the same rules as core's `ipoStatus`, for filtering
// ---------------------------------------------------------------------------

/** `today` is an IST date key. Mirrors `ipoStatus` in @equitywise/core. */
export function statusCondition(status: IpoStatus, today: string): SQL {
  const t = sql`${today}::date`;
  const noOverride = isNull(ipoIssues.lifecycleOverride);
  const notListed = sql`(${ipoIssues.listingDate} IS NULL OR ${ipoIssues.listingDate} > ${t})`;
  switch (status) {
    case 'withdrawn':
    case 'postponed':
      return eq(ipoIssues.lifecycleOverride, status);
    case 'listed':
      return sql`${noOverride} AND ${ipoIssues.listingDate} <= ${t}`;
    case 'upcoming':
      return sql`${noOverride} AND ${notListed} AND (${ipoIssues.openDate} IS NULL OR ${ipoIssues.openDate} > ${t})`;
    case 'open':
      return sql`${noOverride} AND ${notListed} AND ${ipoIssues.openDate} <= ${t} AND (${ipoIssues.closeDate} IS NULL OR ${ipoIssues.closeDate} >= ${t})`;
    case 'closed':
      return sql`${noOverride} AND ${notListed} AND ${ipoIssues.closeDate} < ${t}`;
  }
}

// ---------------------------------------------------------------------------
// Worker work-lists
// ---------------------------------------------------------------------------

export interface IpoWorkRow {
  readonly id: number;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly nseSymbol: string | null;
  readonly nseSeries: string | null;
  readonly bseScripCode: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
  readonly listingDate: string | null;
  readonly designatedExchange: string | null;
  readonly exchanges: string[];
  readonly issuePricePaise: number | null;
  readonly priceBandLowPaise: number | null;
  readonly priceBandHighPaise: number | null;
  readonly isin: string | null;
  /** Null until a detail page states it — the history load re-reads such an issue. */
  readonly lotSize: number | null;
}

const workColumns = {
  id: ipoIssues.id,
  companyName: ipoIssues.companyName,
  board: ipoIssues.board,
  nseSymbol: ipoIssues.nseSymbol,
  nseSeries: ipoIssues.nseSeries,
  bseScripCode: ipoIssues.bseScripCode,
  openDate: ipoIssues.openDate,
  closeDate: ipoIssues.closeDate,
  listingDate: ipoIssues.listingDate,
  designatedExchange: ipoIssues.designatedExchange,
  exchanges: ipoIssues.exchanges,
  issuePricePaise: ipoIssues.issuePricePaise,
  priceBandLowPaise: ipoIssues.priceBandLowPaise,
  priceBandHighPaise: ipoIssues.priceBandHighPaise,
  isin: ipoIssues.isin,
  lotSize: ipoIssues.lotSize,
};

const asWork = (rows: (Omit<IpoWorkRow, 'board'> & { board: string })[]): IpoWorkRow[] =>
  rows.map((r) => ({ ...r, board: r.board as IpoBoard }));

/** Issues whose detail is still moving: not yet listed, or listed in the last `days`. */
export async function listIssuesForDetail(
  db: Database,
  today: string,
  listedWithinDays: number,
): Promise<IpoWorkRow[]> {
  const rows = await db
    .select(workColumns)
    .from(ipoIssues)
    .where(
      and(
        isNull(ipoIssues.lifecycleOverride),
        sql`(${ipoIssues.listingDate} IS NULL OR ${ipoIssues.listingDate} >= ${today}::date - ${listedWithinDays}::int)`,
        sql`(${ipoIssues.closeDate} IS NULL OR ${ipoIssues.closeDate} >= ${today}::date - 30)`,
      ),
    )
    .orderBy(asc(ipoIssues.openDate));
  return asWork(rows);
}

/** Issues open for bidding on `today`. */
export async function listOpenIssues(db: Database, today: string): Promise<IpoWorkRow[]> {
  const rows = await db
    .select(workColumns)
    .from(ipoIssues)
    .where(statusCondition('open', today))
    .orderBy(asc(ipoIssues.closeDate));
  return asWork(rows);
}

/** Issues that closed within `days` (their final subscription figure settles after close). */
export async function listRecentlyClosedIssues(
  db: Database,
  today: string,
  days: number,
): Promise<IpoWorkRow[]> {
  const rows = await db
    .select(workColumns)
    .from(ipoIssues)
    .where(
      and(
        isNull(ipoIssues.lifecycleOverride),
        sql`${ipoIssues.closeDate} < ${today}::date AND ${ipoIssues.closeDate} >= ${today}::date - ${days}::int`,
      ),
    );
  return asWork(rows);
}

/** Issues listed on or after `since` — the ones whose listing prices matter. */
export async function listIssuesListedSince(db: Database, since: string): Promise<IpoWorkRow[]> {
  const rows = await db
    .select(workColumns)
    .from(ipoIssues)
    .where(sql`${ipoIssues.listingDate} >= ${since}::date`)
    .orderBy(desc(ipoIssues.listingDate));
  return asWork(rows);
}

/**
 * Issues whose dates fall on or after `since` (open, else close, else listing
 * date), newest first — the history load's work list, so the most recent
 * issues complete first when a run is cut short. Withdrawn and postponed
 * issues are included: their pages exist too.
 */
export async function listIssuesOpenedSince(db: Database, since: string): Promise<IpoWorkRow[]> {
  const rows = await db
    .select(workColumns)
    .from(ipoIssues)
    .where(
      sql`coalesce(${ipoIssues.openDate}, ${ipoIssues.closeDate}, ${ipoIssues.listingDate}) >= ${since}::date`,
    )
    .orderBy(sql`coalesce(${ipoIssues.openDate}, ${ipoIssues.closeDate}) desc nulls last`);
  return asWork(rows);
}

// ---------------------------------------------------------------------------
// Subscription, documents, listing performance, GMP
// ---------------------------------------------------------------------------

/** Which of `ipoIds` have at least one subscription reading in `scope`. */
export async function issuesWithSubscription(
  db: Database,
  scope: SubscriptionScope,
  ipoIds: readonly number[],
): Promise<Set<number>> {
  if (ipoIds.length === 0) return new Set();
  const rows = await db
    .selectDistinct({ ipoId: ipoSubscriptionSnapshots.ipoId })
    .from(ipoSubscriptionSnapshots)
    .where(
      and(
        eq(ipoSubscriptionSnapshots.scope, scope),
        inArray(ipoSubscriptionSnapshots.ipoId, [...ipoIds]),
      ),
    );
  return new Set(rows.map((r) => r.ipoId));
}

/** When the first unofficial GMP quote was stored — where GMP coverage begins. */
export async function firstGmpObservedAt(db: Database): Promise<Date | null> {
  const rows = await db
    .select({ first: sql<Date | null>`min(${ipoGmpSnapshots.observedAt})` })
    .from(ipoGmpSnapshots);
  const first = rows[0]?.first ?? null;
  return first === null ? null : new Date(first);
}

export interface SubscriptionSnapshotInput {
  readonly ipoId: number;
  readonly source: string;
  readonly scope: SubscriptionScope;
  readonly asOf: Date;
  readonly asOfBasis: 'stated' | 'fetched';
  readonly rows: readonly {
    readonly category: IpoSubscriptionCategory;
    readonly label: string;
    readonly sharesOffered: number | null;
    readonly sharesBid: number | null;
  }[];
}

/** Appends a snapshot; a repeat of the same "as of" is a no-op. Returns rows written. */
export async function insertSubscriptionSnapshot(
  db: Database,
  snapshot: SubscriptionSnapshotInput,
): Promise<number> {
  if (snapshot.rows.length === 0) return 0;
  // A label can repeat across sub-rows; the first occurrence is the headline row.
  const unique = new Map<string, (typeof snapshot.rows)[number]>();
  for (const r of snapshot.rows) if (!unique.has(r.label)) unique.set(r.label, r);
  const values = [...unique.values()].map((r) => ({
    ipoId: snapshot.ipoId,
    source: snapshot.source,
    scope: snapshot.scope,
    asOf: snapshot.asOf,
    asOfBasis: snapshot.asOfBasis,
    category: r.category,
    categoryLabel: r.label,
    sharesOffered: r.sharesOffered,
    sharesBid: r.sharesBid,
  }));
  const written = await db
    .insert(ipoSubscriptionSnapshots)
    .values(values)
    .onConflictDoNothing()
    .returning({ ipoId: ipoSubscriptionSnapshots.ipoId });
  return written.length;
}

export interface DocumentInput {
  readonly kind: string;
  readonly title: string;
  readonly url: string;
}

export async function upsertIpoDocuments(
  db: Database,
  ipoId: number,
  source: string,
  docs: readonly DocumentInput[],
  checkedAt: Date,
): Promise<number> {
  if (docs.length === 0) return 0;
  const written = await db
    .insert(ipoDocuments)
    .values(
      docs.map((d) => ({
        ipoId,
        source,
        kind: d.kind,
        title: d.title,
        url: d.url,
        lastCheckedAt: checkedAt,
      })),
    )
    .onConflictDoUpdate({
      target: [ipoDocuments.ipoId, ipoDocuments.url],
      set: { lastCheckedAt: checkedAt, title: sql`excluded.title`, kind: sql`excluded.kind` },
    })
    .returning({ id: ipoDocuments.id });
  return written.length;
}

export interface ListingDayInput {
  readonly ipoId: number;
  readonly exchange: IpoExchange;
  readonly listingDate: string;
  readonly issuePricePaise: number;
  readonly openPaise: number;
  readonly highPaise: number;
  readonly lowPaise: number;
  readonly closePaise: number;
  readonly volume: number;
  readonly source: string;
  readonly sourceUrl: string;
}

/** Writes listing-day prices once; a re-run leaves them untouched. */
export async function recordListingDay(db: Database, row: ListingDayInput): Promise<boolean> {
  const written = await db
    .insert(ipoListingPerformance)
    .values({
      ipoId: row.ipoId,
      exchange: row.exchange,
      listingDate: row.listingDate,
      issuePricePaise: row.issuePricePaise,
      listingOpenPaise: row.openPaise,
      listingHighPaise: row.highPaise,
      listingLowPaise: row.lowPaise,
      listingClosePaise: row.closePaise,
      listingVolume: row.volume,
      latestClosePaise: row.closePaise,
      latestCloseDate: row.listingDate,
      source: row.source,
      sourceUrl: row.sourceUrl,
    })
    .onConflictDoNothing()
    .returning({ ipoId: ipoListingPerformance.ipoId });
  return written.length > 0;
}

/** Rolls the latest close forward; never moves it backwards in time. */
export async function updateLatestClose(
  db: Database,
  input: { ipoId: number; exchange: IpoExchange; closePaise: number; date: string },
): Promise<boolean> {
  const updated = await db
    .update(ipoListingPerformance)
    .set({ latestClosePaise: input.closePaise, latestCloseDate: input.date, updatedAt: new Date() })
    .where(
      and(
        eq(ipoListingPerformance.ipoId, input.ipoId),
        eq(ipoListingPerformance.exchange, input.exchange),
        sql`(${ipoListingPerformance.latestCloseDate} IS NULL OR ${ipoListingPerformance.latestCloseDate} < ${input.date}::date)`,
      ),
    )
    .returning({ ipoId: ipoListingPerformance.ipoId });
  return updated.length > 0;
}

/** Issue ids (on `exchange`) that already have their listing-day row. */
export async function issuesWithListingDay(
  db: Database,
  exchange: IpoExchange,
  ipoIds: readonly number[],
): Promise<Set<number>> {
  if (ipoIds.length === 0) return new Set();
  const rows = await db
    .select({ ipoId: ipoListingPerformance.ipoId })
    .from(ipoListingPerformance)
    .where(
      and(
        eq(ipoListingPerformance.exchange, exchange),
        inArray(ipoListingPerformance.ipoId, [...ipoIds]),
      ),
    );
  return new Set(rows.map((r) => r.ipoId));
}

export interface GmpSnapshotInput {
  readonly ipoId: number;
  readonly source: string;
  readonly observedAt: Date;
  readonly observedAtBasis: 'stated' | 'fetched';
  readonly gmpPaise: number | null;
  readonly rangeLowPaise: number | null;
  readonly rangeHighPaise: number | null;
  readonly sourceUrl: string;
}

export async function insertGmpSnapshots(
  db: Database,
  rows: readonly GmpSnapshotInput[],
): Promise<number> {
  if (rows.length === 0) return 0;
  const written = await db
    .insert(ipoGmpSnapshots)
    .values([...rows])
    .onConflictDoNothing()
    .returning({ ipoId: ipoGmpSnapshots.ipoId });
  return written.length;
}

// ---------------------------------------------------------------------------
// Readers for /ipos
// ---------------------------------------------------------------------------

export interface IpoListFilters {
  readonly today: string;
  readonly status?: IpoStatus | undefined;
  readonly board?: IpoBoard | undefined;
  readonly exchange?: IpoExchange | undefined;
  readonly search?: string | undefined;
  /** Calendar year of the bidding dates; an undated issue counts in `today`'s year. */
  readonly year?: number | undefined;
  readonly page: number;
  readonly pageSize: number;
}

export interface LatestSubscriptionJson {
  readonly scope: SubscriptionScope;
  readonly asOf: string;
  readonly sharesBid: number | null;
  readonly sharesOffered: number | null;
}

export interface LatestGmpJson {
  readonly source: string;
  readonly gmpPaise: number | null;
  readonly observedAt: string;
  readonly sourceUrl: string;
}

export interface ListingJson {
  readonly exchange: IpoExchange;
  readonly listingDate: string;
  readonly issuePricePaise: number;
  readonly listingOpenPaise: number;
  readonly listingClosePaise: number;
  readonly latestClosePaise: number | null;
  readonly latestCloseDate: string | null;
}

export interface IpoListRow extends IpoIssueRow {
  /** Broadest-scope Total (consolidated before NSE-only), latest. */
  readonly subscriptionTotal: LatestSubscriptionJson | null;
  readonly subscriptionRetail: LatestSubscriptionJson | null;
  readonly latestGmp: LatestGmpJson | null;
  /** Designated exchange first. */
  readonly listing: ListingJson | null;
}

function latestSubscription(category: 'total' | 'retail'): SQL<LatestSubscriptionJson | null> {
  return sql<LatestSubscriptionJson | null>`(
    select json_build_object('scope', s.scope, 'asOf', s.as_of, 'sharesBid', s.shares_bid, 'sharesOffered', s.shares_offered)
    from ipo_subscription_snapshots s
    where s.ipo_id = ${ipoIssues.id} and s.category = ${category}
    order by (s.scope = 'consolidated') desc, s.as_of desc
    limit 1)`;
}

const latestGmpSql = sql<LatestGmpJson | null>`(
  select json_build_object('source', g.source, 'gmpPaise', g.gmp_paise, 'observedAt', g.observed_at, 'sourceUrl', g.source_url)
  from ipo_gmp_snapshots g
  where g.ipo_id = ${ipoIssues.id}
  order by g.observed_at desc
  limit 1)`;

const listingSql = sql<ListingJson | null>`(
  select json_build_object('exchange', l.exchange, 'listingDate', l.listing_date, 'issuePricePaise', l.issue_price_paise,
    'listingOpenPaise', l.listing_open_paise, 'listingClosePaise', l.listing_close_paise,
    'latestClosePaise', l.latest_close_paise, 'latestCloseDate', l.latest_close_date)
  from ipo_listing_performance l
  where l.ipo_id = ${ipoIssues.id}
  order by (l.exchange = ${ipoIssues.designatedExchange}) desc nulls last, l.exchange
  limit 1)`;

/** The year an issue belongs to: its bidding dates, else its listing date. */
const issueYear = sql<
  number | null
>`extract(year from coalesce(${ipoIssues.openDate}, ${ipoIssues.closeDate}, ${ipoIssues.listingDate}))::int`;

function baseConditions(filters: Omit<IpoListFilters, 'page' | 'pageSize' | 'status'>): SQL[] {
  const out: SQL[] = [];
  if (filters.board !== undefined) out.push(eq(ipoIssues.board, filters.board));
  if (filters.year !== undefined)
    out.push(
      Number(filters.today.slice(0, 4)) === filters.year
        ? sql`(${issueYear} = ${filters.year} OR ${issueYear} IS NULL)`
        : sql`${issueYear} = ${filters.year}`,
    );
  if (filters.exchange !== undefined)
    out.push(sql`${ipoIssues.exchanges} @> ARRAY[${filters.exchange}]::text[]`);
  const q = filters.search?.trim();
  if (q !== undefined && q !== '') {
    const pattern = `%${q.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
    out.push(
      sql`(${ipoIssues.companyName} ILIKE ${pattern} OR ${ipoIssues.nseSymbol} ILIKE ${pattern} OR ${ipoIssues.bseScripCode} ILIKE ${pattern})`,
    );
  }
  return out;
}

function orderFor(status: IpoStatus | undefined): SQL[] {
  switch (status) {
    case 'upcoming':
      return [sql`${ipoIssues.openDate} asc nulls last`, asc(ipoIssues.companyName)];
    case 'open':
      return [asc(ipoIssues.closeDate), asc(ipoIssues.companyName)];
    case 'closed':
      return [desc(ipoIssues.closeDate), asc(ipoIssues.companyName)];
    case 'listed':
      return [desc(ipoIssues.listingDate), asc(ipoIssues.companyName)];
    default:
      return [sql`${ipoIssues.openDate} desc nulls first`, asc(ipoIssues.companyName)];
  }
}

export async function listIpos(
  db: Database,
  filters: IpoListFilters,
): Promise<{ rows: IpoListRow[]; total: number }> {
  const conditions = baseConditions(filters);
  if (filters.status !== undefined) conditions.push(statusCondition(filters.status, filters.today));
  const where = conditions.length > 0 ? and(...conditions) : undefined;
  const rows = await db
    .select({
      issue: ipoIssues,
      subscriptionTotal: latestSubscription('total'),
      subscriptionRetail: latestSubscription('retail'),
      latestGmp: latestGmpSql,
      listing: listingSql,
      total: sql<number>`count(*) over ()`,
    })
    .from(ipoIssues)
    .where(where)
    .orderBy(...orderFor(filters.status))
    .limit(filters.pageSize)
    .offset((filters.page - 1) * filters.pageSize);
  // `count(*) over ()` rides on the page's rows, so a page past the end has
  // none to carry it; count separately rather than report zero matches.
  let total = Number(rows[0]?.total ?? 0);
  if (rows.length === 0 && filters.page > 1) {
    const [counted] = await db
      .select({ n: sql<number>`count(*)`.mapWith(Number) })
      .from(ipoIssues)
      .where(where);
    total = counted?.n ?? 0;
  }
  return {
    rows: rows.map((r) => ({
      ...r.issue,
      subscriptionTotal: r.subscriptionTotal,
      subscriptionRetail: r.subscriptionRetail,
      latestGmp: r.latestGmp,
      listing: r.listing,
    })),
    total,
  };
}

/** Counts per status under the same board/exchange/search filters. */
export async function countIposByStatus(
  db: Database,
  filters: Omit<IpoListFilters, 'page' | 'pageSize' | 'status'>,
): Promise<Record<IpoStatus, number>> {
  const conditions = baseConditions(filters);
  const t = filters.today;
  const count = (status: IpoStatus) =>
    sql<number>`count(*) filter (where ${statusCondition(status, t)})`.mapWith(Number);
  const [row] = await db
    .select({
      upcoming: count('upcoming'),
      open: count('open'),
      closed: count('closed'),
      listed: count('listed'),
      withdrawn: count('withdrawn'),
      postponed: count('postponed'),
    })
    .from(ipoIssues)
    .where(conditions.length > 0 ? and(...conditions) : undefined);
  return {
    upcoming: row?.upcoming ?? 0,
    open: row?.open ?? 0,
    closed: row?.closed ?? 0,
    listed: row?.listed ?? 0,
    withdrawn: row?.withdrawn ?? 0,
    postponed: row?.postponed ?? 0,
  };
}

/** Issues with any milestone that can fall between `from` and `to` (IST keys). */
export async function listIposAround(
  db: Database,
  from: string,
  to: string,
): Promise<IpoIssueRow[]> {
  return db
    .select()
    .from(ipoIssues)
    .where(
      sql`(${ipoIssues.openDate} BETWEEN ${from}::date AND ${to}::date)
        OR (${ipoIssues.closeDate} BETWEEN ${from}::date - 7 AND ${to}::date)
        OR (${ipoIssues.listingDate} BETWEEN ${from}::date AND ${to}::date)`,
    )
    .orderBy(asc(ipoIssues.openDate));
}

/** True once any issue is stored — false on a fresh database. */
export async function hasIpoIssues(db: Database): Promise<boolean> {
  const rows = await db.select({ id: ipoIssues.id }).from(ipoIssues).limit(1);
  return rows.length > 0;
}

/** The years that have issues on a board, newest first. */
export async function listIpoYears(db: Database, board?: IpoBoard): Promise<number[]> {
  const rows = await db
    .selectDistinct({ year: issueYear })
    .from(ipoIssues)
    .where(board === undefined ? undefined : eq(ipoIssues.board, board))
    .orderBy(desc(issueYear));
  return rows.flatMap((r) => (r.year === null ? [] : [Number(r.year)]));
}

export interface IpoYearStats {
  /** Issues whose official listing date falls in [from, today]. */
  readonly listed: number;
  /** Of those, how many have listing prices from an exchange end-of-day file. */
  readonly withListingPrice: number;
  readonly openedAboveIssue: number;
  readonly withLatestClose: number;
  readonly latestAboveIssue: number;
}

/**
 * How a year's issues that have listed went, from the designated exchange's
 * own end-of-day prices: how many opened above the issue price and how many
 * closed above it on the latest day recorded. "A year's issues" is the board
 * list's own rule (the year bidding opened), so the dashboard's count and the
 * list's "Listed" filter always agree — an issue bid in December and listed in
 * January counts in December's year on both.
 */
export async function ipoYearStats(
  db: Database,
  filters: { readonly board?: IpoBoard | undefined; readonly year: number; readonly today: string },
): Promise<IpoYearStats> {
  const perf = sql`(
    select l.listing_open_paise as open, l.latest_close_paise as latest, l.issue_price_paise as issue
    from ipo_listing_performance l
    where l.ipo_id = ${ipoIssues.id}
    order by (l.exchange = ${ipoIssues.designatedExchange}) desc nulls last, l.exchange
    limit 1)`;
  const [row] = await db
    .select({
      listed: sql<number>`count(*)::int`,
      withListingPrice: sql<number>`count(p.open)::int`,
      openedAboveIssue: sql<number>`count(*) filter (where p.open > p.issue)::int`,
      withLatestClose: sql<number>`count(p.latest)::int`,
      latestAboveIssue: sql<number>`count(*) filter (where p.latest > p.issue)::int`,
    })
    .from(ipoIssues)
    .leftJoin(sql`lateral ${perf} p`, sql`true`)
    .where(
      and(
        isNull(ipoIssues.lifecycleOverride),
        sql`${issueYear} = ${filters.year}`,
        sql`${ipoIssues.listingDate} <= ${filters.today}::date`,
        filters.board === undefined ? undefined : eq(ipoIssues.board, filters.board),
      ),
    );
  return {
    listed: row?.listed ?? 0,
    withListingPrice: row?.withListingPrice ?? 0,
    openedAboveIssue: row?.openedAboveIssue ?? 0,
    withLatestClose: row?.withLatestClose ?? 0,
    latestAboveIssue: row?.latestAboveIssue ?? 0,
  };
}

export interface IssueDocumentRow {
  readonly ipoId: number;
  readonly kind: string;
  readonly title: string;
  readonly url: string;
  /** RHP sections quoted on the issue page from this document. */
  readonly sectionsQuoted: number;
}

/** The documents of several issues, with how many RHP sections each yielded. */
export async function listIssueDocuments(
  db: Database,
  ipoIds: readonly number[],
  kinds: readonly string[],
): Promise<IssueDocumentRow[]> {
  if (ipoIds.length === 0 || kinds.length === 0) return [];
  return db
    .select({
      ipoId: ipoDocuments.ipoId,
      kind: ipoDocuments.kind,
      title: ipoDocuments.title,
      url: ipoDocuments.url,
      sectionsQuoted: sql<number>`(select count(*) from ipo_rhp_extracts e where e.document_id = ${ipoDocuments.id})::int`,
    })
    .from(ipoDocuments)
    .where(and(inArray(ipoDocuments.ipoId, [...ipoIds]), inArray(ipoDocuments.kind, [...kinds])))
    .orderBy(asc(ipoDocuments.ipoId), asc(ipoDocuments.kind));
}

export type SubscriptionSnapshotRow = typeof ipoSubscriptionSnapshots.$inferSelect;
export type GmpSnapshotRow = typeof ipoGmpSnapshots.$inferSelect;
export type IpoDocumentRow = typeof ipoDocuments.$inferSelect;
export type ListingPerformanceRow = typeof ipoListingPerformance.$inferSelect;

export interface SourceUsedRow {
  readonly source: string;
  readonly feed: string;
  readonly sourceUrl: string;
  readonly lastSeenAt: Date;
}

export interface IpoDetailParts {
  readonly subscriptions: SubscriptionSnapshotRow[];
  readonly gmp: GmpSnapshotRow[];
  readonly documents: IpoDocumentRow[];
  readonly listing: ListingPerformanceRow[];
  readonly sources: SourceUsedRow[];
  readonly rhp: RhpExtractRow[];
  readonly filings: SebiFilingRow[];
}

export async function ipoDetailParts(db: Database, ipoId: number): Promise<IpoDetailParts> {
  const [subscriptions, gmp, documents, listing, sources, rhp, filings] = await Promise.all([
    db
      .select()
      .from(ipoSubscriptionSnapshots)
      .where(eq(ipoSubscriptionSnapshots.ipoId, ipoId))
      .orderBy(asc(ipoSubscriptionSnapshots.asOf)),
    db
      .select()
      .from(ipoGmpSnapshots)
      .where(eq(ipoGmpSnapshots.ipoId, ipoId))
      .orderBy(asc(ipoGmpSnapshots.observedAt)),
    db
      .select()
      .from(ipoDocuments)
      .where(eq(ipoDocuments.ipoId, ipoId))
      .orderBy(asc(ipoDocuments.kind)),
    db.select().from(ipoListingPerformance).where(eq(ipoListingPerformance.ipoId, ipoId)),
    db
      .selectDistinctOn([ipoSourceRecords.source, ipoSourceRecords.feed], {
        source: ipoSourceRecords.source,
        feed: ipoSourceRecords.feed,
        sourceUrl: ipoSourceRecords.sourceUrl,
        lastSeenAt: ipoSourceRecords.lastSeenAt,
      })
      .from(ipoSourceRecords)
      .where(eq(ipoSourceRecords.ipoId, ipoId))
      .orderBy(ipoSourceRecords.source, ipoSourceRecords.feed, desc(ipoSourceRecords.lastSeenAt)),
    listRhpExtracts(db, ipoId),
    sebiFilingsForIssue(db, ipoId),
  ]);
  return { subscriptions, gmp, documents, listing, sources, rhp, filings };
}

export interface GmpTrackRow {
  readonly slug: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly listingDate: string;
  readonly priceBandHighPaise: number | null;
  readonly issuePricePaise: number;
  readonly listingOpenPaise: number;
  /** Last GMP observed before 10:00 IST on listing day (the listing open). */
  readonly lastGmpPaise: number;
}

/** Listed issues that had a GMP quote before listing, for the track record. */
export async function gmpTrackRows(
  db: Database,
  since: string,
  board?: IpoBoard,
): Promise<GmpTrackRow[]> {
  const rows = await db
    .select({
      slug: ipoIssues.slug,
      companyName: ipoIssues.companyName,
      board: ipoIssues.board,
      listingDate: ipoListingPerformance.listingDate,
      priceBandHighPaise: ipoIssues.priceBandHighPaise,
      issuePricePaise: ipoListingPerformance.issuePricePaise,
      listingOpenPaise: ipoListingPerformance.listingOpenPaise,
      lastGmpPaise: sql<number | null>`(
        select g.gmp_paise from ipo_gmp_snapshots g
        where g.ipo_id = ${ipoIssues.id} and g.gmp_paise is not null
          and g.observed_at < ((${ipoListingPerformance.listingDate}::timestamp + interval '10 hours') at time zone 'Asia/Kolkata')
        order by g.observed_at desc limit 1)`.mapWith((v: unknown) =>
        v === null ? null : Number(v),
      ),
    })
    .from(ipoIssues)
    .innerJoin(ipoListingPerformance, eq(ipoListingPerformance.ipoId, ipoIssues.id))
    .where(
      and(
        sql`${ipoListingPerformance.listingDate} >= ${since}::date`,
        board === undefined ? undefined : eq(ipoIssues.board, board),
        sql`(${ipoListingPerformance.exchange} = ${ipoIssues.designatedExchange} OR ${ipoIssues.designatedExchange} IS NULL)`,
      ),
    )
    .orderBy(desc(ipoListingPerformance.listingDate));
  const out: GmpTrackRow[] = [];
  for (const r of rows)
    if (r.lastGmpPaise !== null)
      out.push({ ...r, board: r.board as IpoBoard, lastGmpPaise: r.lastGmpPaise });
  return out;
}

/** Issues whose provenance records an official disagreement. */
export async function listIssuesWithConflicts(db: Database, limit = 50): Promise<IpoIssueRow[]> {
  return db
    .select()
    .from(ipoIssues)
    .where(sql`jsonb_path_exists(${ipoIssues.fieldSources}, '$.* ? (@.basis == "conflict")')`)
    .orderBy(desc(ipoIssues.updatedAt))
    .limit(limit);
}

// ---------------------------------------------------------------------------
// RHP extracts (Phase 11)
// ---------------------------------------------------------------------------

export interface RhpWorkRow {
  readonly documentId: number;
  readonly ipoId: number;
  readonly url: string;
  readonly title: string;
  readonly source: string;
  readonly companyName: string;
}

/**
 * RHPs the current extractor has not read yet, newest issues first. An issue
 * that already has extracts at this version is skipped (its RHP may be listed
 * by both exchanges), and a document that failed `maxAttempts` times is left
 * alone until someone resets it.
 */
export async function listRhpDocumentsToExtract(
  db: Database,
  options: {
    readonly version: number;
    readonly maxAttempts: number;
    readonly limit: number;
    /**
     * Domains some enabled source may fetch from (`nseindia.com` covers its
     * subdomains). Only their documents are returned, so documents nobody can
     * fetch never fill the batch ahead of ones that can be read.
     */
    readonly hosts: readonly string[];
    /** Only issues that opened on or after this IST day, or have no open date yet. */
    readonly openedSince?: string;
  },
): Promise<RhpWorkRow[]> {
  if (options.hosts.length === 0) return [];
  const host = sql`lower(substring(${ipoDocuments.url} from '^[A-Za-z][A-Za-z0-9+.-]*://([^/:?#]+)'))`;
  const fetchable = or(
    ...options.hosts.map((domain) => {
      const d = domain.toLowerCase();
      const escaped = d.replace(/[\\%_]/g, (c) => `\\${c}`);
      return sql`(${host} = ${d} OR ${host} LIKE ${`%.${escaped}`})`;
    }),
  );
  return db
    .select({
      documentId: ipoDocuments.id,
      ipoId: ipoDocuments.ipoId,
      url: ipoDocuments.url,
      title: ipoDocuments.title,
      source: ipoDocuments.source,
      companyName: ipoIssues.companyName,
    })
    .from(ipoDocuments)
    .innerJoin(ipoIssues, eq(ipoIssues.id, ipoDocuments.ipoId))
    .where(
      and(
        // A fixed-price SME issue files a Prospectus, not an RHP: same sections.
        inArray(ipoDocuments.kind, ['rhp', 'prospectus']),
        or(
          isNull(ipoDocuments.extractorVersion),
          sql`${ipoDocuments.extractorVersion} < ${options.version}`,
        ),
        sql`${ipoDocuments.extractAttempts} < ${options.maxAttempts}`,
        fetchable,
        options.openedSince === undefined
          ? undefined
          : sql`(${ipoIssues.openDate} IS NULL OR ${ipoIssues.openDate} >= ${options.openedSince}::date)`,
        sql`not exists (
          select 1 from ipo_rhp_extracts e
          where e.ipo_id = ${ipoDocuments.ipoId} and e.extractor_version >= ${options.version}
        )`,
      ),
    )
    .orderBy(sql`${ipoIssues.openDate} desc nulls first`, asc(ipoDocuments.id))
    .limit(options.limit);
}

export interface RhpExtractInput {
  readonly section: string;
  readonly title: string;
  readonly body: string | null;
  readonly items: readonly string[];
  readonly table: RhpTableData | null;
  readonly pageFrom: number;
  readonly pageTo: number;
}

/**
 * Replaces a document's extracts with a fresh read, and records the read on
 * the document, in one transaction. An empty `extracts` is a successful read
 * that found nothing it could quote with confidence.
 */
export async function saveRhpExtracts(
  db: Database,
  input: {
    readonly documentId: number;
    readonly ipoId: number;
    readonly sha256: string;
    readonly sizeBytes: number;
    readonly version: number;
    readonly extractedAt: Date;
    readonly extracts: readonly RhpExtractInput[];
  },
): Promise<number> {
  return db.transaction(async (tx) => {
    await tx.delete(ipoRhpExtracts).where(eq(ipoRhpExtracts.documentId, input.documentId));
    if (input.extracts.length > 0)
      await tx.insert(ipoRhpExtracts).values(
        input.extracts.map((e) => ({
          documentId: input.documentId,
          ipoId: input.ipoId,
          section: e.section,
          title: e.title,
          body: e.body,
          items: e.items,
          tableData: e.table,
          pageFrom: e.pageFrom,
          pageTo: e.pageTo,
          extractorVersion: input.version,
          extractedAt: input.extractedAt,
        })),
      );
    await tx
      .update(ipoDocuments)
      .set({
        sha256: input.sha256,
        sizeBytes: input.sizeBytes,
        extractorVersion: input.version,
        extractedAt: input.extractedAt,
        extractError: null,
      })
      .where(eq(ipoDocuments.id, input.documentId));
    return input.extracts.length;
  });
}

/** A failed read: counted, with the reason kept for the admin page. */
export async function recordRhpFailure(
  db: Database,
  documentId: number,
  error: string,
): Promise<void> {
  await db
    .update(ipoDocuments)
    .set({
      extractAttempts: sql`${ipoDocuments.extractAttempts} + 1`,
      extractError: error.slice(0, 500),
    })
    .where(eq(ipoDocuments.id, documentId));
}

export interface RhpExtractRow {
  readonly documentId: number;
  readonly documentUrl: string;
  readonly documentTitle: string;
  readonly section: string;
  readonly title: string;
  readonly body: string | null;
  readonly items: readonly string[];
  readonly table: RhpTableData | null;
  readonly pageFrom: number;
  readonly pageTo: number;
  readonly extractedAt: Date;
}

/** An issue's extracts from its most recently read RHP. */
export async function listRhpExtracts(db: Database, ipoId: number): Promise<RhpExtractRow[]> {
  const rows = await db
    .select({
      documentId: ipoRhpExtracts.documentId,
      documentUrl: ipoDocuments.url,
      documentTitle: ipoDocuments.title,
      section: ipoRhpExtracts.section,
      title: ipoRhpExtracts.title,
      body: ipoRhpExtracts.body,
      items: ipoRhpExtracts.items,
      table: ipoRhpExtracts.tableData,
      pageFrom: ipoRhpExtracts.pageFrom,
      pageTo: ipoRhpExtracts.pageTo,
      extractedAt: ipoRhpExtracts.extractedAt,
    })
    .from(ipoRhpExtracts)
    .innerJoin(ipoDocuments, eq(ipoDocuments.id, ipoRhpExtracts.documentId))
    .where(eq(ipoRhpExtracts.ipoId, ipoId))
    .orderBy(desc(ipoRhpExtracts.extractedAt), asc(ipoRhpExtracts.documentId));
  const latest = rows[0]?.documentId;
  return rows.filter((r) => r.documentId === latest);
}

export interface RhpExtractionCounts {
  readonly extracted: number;
  readonly pending: number;
  readonly failed: number;
  readonly lastError: string | null;
}

/** RHP documents by extraction state, for the admin health page. */
export async function rhpExtractionCounts(
  db: Database,
  options: { readonly version: number; readonly maxAttempts: number },
): Promise<RhpExtractionCounts> {
  const [row] = await db
    .select({
      extracted: sql<number>`count(*) filter (where ${ipoDocuments.extractorVersion} >= ${options.version})::int`,
      failed: sql<number>`count(*) filter (where ${ipoDocuments.extractAttempts} >= ${options.maxAttempts}
        and (${ipoDocuments.extractorVersion} is null or ${ipoDocuments.extractorVersion} < ${options.version}))::int`,
      total: sql<number>`count(*)::int`,
      lastError: sql<
        string | null
      >`(array_agg(${ipoDocuments.extractError} order by ${ipoDocuments.lastCheckedAt} desc)
        filter (where ${ipoDocuments.extractError} is not null))[1]`,
    })
    .from(ipoDocuments)
    .where(inArray(ipoDocuments.kind, ['rhp', 'prospectus']));
  const extracted = row?.extracted ?? 0;
  const failed = row?.failed ?? 0;
  return {
    extracted,
    failed,
    pending: Math.max(0, (row?.total ?? 0) - extracted - failed),
    lastError: row?.lastError ?? null,
  };
}

// ---------------------------------------------------------------------------
// SEBI filings (Phase 11)
// ---------------------------------------------------------------------------

export interface SebiFilingInput {
  readonly sebiId: string;
  readonly companyName: string;
  readonly documentLabel: string | null;
  readonly title: string;
  readonly filedDate: string;
  readonly pageUrl: string;
  readonly abridgedUrl: string | null;
}

/** Records filings by SEBI's id; a filing seen again only moves `last_seen_at`. Returns how many were new. */
export async function upsertSebiFilings(
  db: Database,
  filings: readonly SebiFilingInput[],
  seenAt: Date,
): Promise<number> {
  if (filings.length === 0) return 0;
  const rows = await db
    .insert(ipoSebiFilings)
    .values(filings.map((f) => ({ ...f, firstSeenAt: seenAt, lastSeenAt: seenAt })))
    .onConflictDoUpdate({ target: ipoSebiFilings.sebiId, set: { lastSeenAt: seenAt } })
    .returning({ inserted: sql<boolean>`(xmax = 0)` });
  return rows.filter((r) => r.inserted).length;
}

/** Filings not yet linked to an issue, filed since `since` (IST date key). */
export async function listUnlinkedSebiFilings(
  db: Database,
  since: string,
): Promise<{ sebiId: string; companyName: string; filedDate: string }[]> {
  return db
    .select({
      sebiId: ipoSebiFilings.sebiId,
      companyName: ipoSebiFilings.companyName,
      filedDate: ipoSebiFilings.filedDate,
    })
    .from(ipoSebiFilings)
    .where(and(isNull(ipoSebiFilings.ipoId), sql`${ipoSebiFilings.filedDate} >= ${since}`));
}

export async function linkSebiFiling(db: Database, sebiId: string, ipoId: number): Promise<void> {
  await db.update(ipoSebiFilings).set({ ipoId }).where(eq(ipoSebiFilings.sebiId, sebiId));
}

export interface SebiFilingRow {
  readonly sebiId: string;
  readonly companyName: string;
  readonly documentLabel: string | null;
  readonly filedDate: string;
  readonly pageUrl: string;
  readonly abridgedUrl: string | null;
  /** The linked issue's slug, when an exact name match found one. */
  readonly slug: string | null;
  readonly lastSeenAt: Date;
}

const filingColumns = {
  sebiId: ipoSebiFilings.sebiId,
  companyName: ipoSebiFilings.companyName,
  documentLabel: ipoSebiFilings.documentLabel,
  filedDate: ipoSebiFilings.filedDate,
  pageUrl: ipoSebiFilings.pageUrl,
  abridgedUrl: ipoSebiFilings.abridgedUrl,
  slug: ipoIssues.slug,
  lastSeenAt: ipoSebiFilings.lastSeenAt,
};

/** The most recent filings, newest first, with the linked issue when there is one. */
export async function listSebiFilings(db: Database, limit: number): Promise<SebiFilingRow[]> {
  return db
    .select(filingColumns)
    .from(ipoSebiFilings)
    .leftJoin(ipoIssues, eq(ipoIssues.id, ipoSebiFilings.ipoId))
    .orderBy(desc(ipoSebiFilings.filedDate), desc(ipoSebiFilings.sebiId))
    .limit(limit);
}

/** An issue's SEBI filings, oldest first (the DRHP, then its addenda). */
export async function sebiFilingsForIssue(db: Database, ipoId: number): Promise<SebiFilingRow[]> {
  return db
    .select(filingColumns)
    .from(ipoSebiFilings)
    .leftJoin(ipoIssues, eq(ipoIssues.id, ipoSebiFilings.ipoId))
    .where(eq(ipoSebiFilings.ipoId, ipoId))
    .orderBy(asc(ipoSebiFilings.filedDate), asc(ipoSebiFilings.sebiId));
}
