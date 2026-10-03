import type { FilterLeaf, FilterNode, MetricKey } from '@equitywise/core';
import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  gte,
  inArray,
  isNull,
  lte,
  type SQL,
  sql,
} from 'drizzle-orm';
import type { PgColumn } from 'drizzle-orm/pg-core';
import type { Database } from '../client.js';
import {
  bulkBlockDeals,
  corporateActions,
  corporateAnnouncements,
  dailyCandles,
  deliveryStats,
  derivativeOiDaily,
  indexMemberships,
  instrumentReference,
  instruments,
  marketBreadthDaily,
  marketEvents,
  savedScreens,
  screenerSnapshotBuilds,
  screenerSnapshots,
  shareholdingPatterns,
  signals,
} from '../schema/index.js';

/**
 * Screener persistence (docs/planning/screener-dhan-fyers-plan.md §5, §9).
 *
 * Writes (reference data, snapshots, breadth) are the worker's; reads and the
 * owner-scoped saved-screen CRUD are the web app's.
 *
 * The SQL compiler below turns a validated FilterNode into a parameterised
 * WHERE clause. It never interpolates text: metric keys map to columns
 * through the table definition, values are bound parameters, and an unknown
 * key throws rather than being skipped.
 */

export type SnapshotInsert = typeof screenerSnapshots.$inferInsert;
export type SnapshotRow = typeof screenerSnapshots.$inferSelect;

const COLUMNS = getTableColumns(screenerSnapshots) as unknown as Record<string, PgColumn>;

function column(key: string): PgColumn {
  const col = COLUMNS[key];
  if (col === undefined) throw new Error(`screener: no column for metric "${key}"`);
  return col;
}

/** Every catalogue key must be a column; exported so a unit test can assert it. */
export function snapshotHasColumn(key: string): boolean {
  return COLUMNS[key] !== undefined;
}

// ---------------------------------------------------------------------------
// Reference data
// ---------------------------------------------------------------------------

export interface EquityListEntry {
  readonly symbol: string;
  readonly name: string;
  readonly series: 'EQ' | 'BE' | 'BZ';
  readonly isin: string;
  readonly listingDate: string | null;
  readonly faceValuePaise: number | null;
}

const CHUNK = 500;

/**
 * Brings NSE's equity list into `instruments` and `instrument_reference`.
 *
 * New symbols are inserted under provider `nse`; an existing row (often a
 * Fyers-ingested one) keeps its provider and name and only gains a missing
 * ISIN and an `active` flag. Equities this list owns (`provider_id = 'nse'`)
 * that drop off it are deactivated — never deleted.
 */
export async function syncEquityList(
  db: Database,
  entries: readonly EquityListEntry[],
): Promise<{ instruments: number; deactivated: number }> {
  if (entries.length === 0) return { instruments: 0, deactivated: 0 };
  let touched = 0;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const chunk = entries.slice(i, i + CHUNK);
    const rows = await db
      .insert(instruments)
      .values(
        chunk.map((e) => ({
          symbol: e.symbol,
          name: e.name,
          kind: 'equity',
          exchange: 'NSE',
          isin: e.isin,
          lotSize: 1,
          tickSize: 5,
          providerRef: null,
          providerId: 'nse',
        })),
      )
      .onConflictDoUpdate({
        target: [instruments.symbol, instruments.exchange],
        set: {
          isin: sql`coalesce(${instruments.isin}, excluded.isin)`,
          active: sql`true`,
          lastSeenAt: sql`now()`,
        },
      })
      .returning({ id: instruments.id, symbol: instruments.symbol });
    touched += rows.length;

    const idBySymbol = new Map(rows.map((r) => [r.symbol, r.id]));
    const refs = chunk.flatMap((e) => {
      const instrumentId = idBySymbol.get(e.symbol);
      return instrumentId === undefined
        ? []
        : [
            {
              instrumentId,
              series: e.series,
              listingDate: e.listingDate,
              faceValuePaise: e.faceValuePaise,
            },
          ];
    });
    if (refs.length > 0) {
      await db
        .insert(instrumentReference)
        .values(refs)
        .onConflictDoUpdate({
          target: instrumentReference.instrumentId,
          set: {
            series: sql`excluded.series`,
            listingDate: sql`excluded.listing_date`,
            faceValuePaise: sql`excluded.face_value_paise`,
            updatedAt: sql`now()`,
          },
        });
    }
  }

  const listed = entries.map((e) => e.symbol);
  const gone = await db
    .update(instruments)
    .set({ active: false })
    .where(
      and(
        eq(instruments.providerId, 'nse'),
        eq(instruments.kind, 'equity'),
        eq(instruments.active, true),
        sql`${instruments.symbol} <> ALL(${listed})`,
      ),
    )
    .returning({ id: instruments.id });
  return { instruments: touched, deactivated: gone.length };
}

/**
 * Replaces an index's current membership with `symbols`: new members get a
 * row from `asOf`, departed members have their row closed at `asOf`.
 */
export async function syncIndexMembership(
  db: Database,
  input: {
    readonly indexKey: string;
    readonly symbols: readonly string[];
    readonly asOf: string;
    readonly source: string;
  },
): Promise<{ added: number; removed: number; unknown: string[] }> {
  const ids = await db
    .select({ id: instruments.id, symbol: instruments.symbol })
    .from(instruments)
    .where(and(inArray(instruments.symbol, [...input.symbols]), eq(instruments.exchange, 'NSE')));
  const idBySymbol = new Map(ids.map((r) => [r.symbol, r.id]));
  const unknown = input.symbols.filter((s) => !idBySymbol.has(s));
  const wanted = new Set(idBySymbol.values());

  return db.transaction(async (tx) => {
    const current = await tx
      .select({ instrumentId: indexMemberships.instrumentId })
      .from(indexMemberships)
      .where(and(eq(indexMemberships.indexKey, input.indexKey), isNull(indexMemberships.effectiveTo)));
    const have = new Set(current.map((r) => r.instrumentId));
    const toAdd = [...wanted].filter((id) => !have.has(id));
    const toRemove = [...have].filter((id) => !wanted.has(id));

    if (toRemove.length > 0) {
      await tx
        .update(indexMemberships)
        .set({ effectiveTo: input.asOf })
        .where(
          and(
            eq(indexMemberships.indexKey, input.indexKey),
            isNull(indexMemberships.effectiveTo),
            inArray(indexMemberships.instrumentId, toRemove),
          ),
        );
    }
    if (toAdd.length > 0) {
      await tx
        .insert(indexMemberships)
        .values(
          toAdd.map((instrumentId) => ({
            indexKey: input.indexKey,
            instrumentId,
            effectiveFrom: input.asOf,
            source: input.source,
          })),
        )
        .onConflictDoNothing();
    }
    return { added: toAdd.length, removed: toRemove.length, unknown };
  });
}

/** Sets industry for the given symbols (from an index file). Others are left as they are. */
export async function setIndustries(
  db: Database,
  industries: ReadonlyMap<string, string>,
  source: string,
): Promise<number> {
  if (industries.size === 0) return 0;
  const ids = await db
    .select({ id: instruments.id, symbol: instruments.symbol })
    .from(instruments)
    .where(and(inArray(instruments.symbol, [...industries.keys()]), eq(instruments.exchange, 'NSE')));
  let updated = 0;
  for (const row of ids) {
    const industry = industries.get(row.symbol);
    if (industry === undefined) continue;
    const result = await db
      .update(instrumentReference)
      .set({ industry, industrySource: source, updatedAt: sql`now()` })
      .where(eq(instrumentReference.instrumentId, row.id))
      .returning({ id: instrumentReference.instrumentId });
    updated += result.length;
  }
  return updated;
}

export interface ScreenableInstrument {
  readonly id: number;
  readonly symbol: string;
  readonly name: string;
  readonly series: string;
  readonly listingDate: string | null;
  readonly industry: string | null;
}

/** Active NSE equities with an EQ/BE/BZ reference row — the screener's universe. */
export async function listScreenableInstruments(db: Database): Promise<ScreenableInstrument[]> {
  return db
    .select({
      id: instruments.id,
      symbol: instruments.symbol,
      name: instruments.name,
      series: instrumentReference.series,
      listingDate: instrumentReference.listingDate,
      industry: instrumentReference.industry,
    })
    .from(instruments)
    .innerJoin(instrumentReference, eq(instrumentReference.instrumentId, instruments.id))
    .where(
      and(
        eq(instruments.active, true),
        eq(instruments.kind, 'equity'),
        eq(instruments.exchange, 'NSE'),
      ),
    )
    .orderBy(asc(instruments.symbol));
}

/** instrumentId → current index keys. */
export async function currentIndexKeys(db: Database): Promise<Map<number, string[]>> {
  const rows = await db
    .select({ instrumentId: indexMemberships.instrumentId, indexKey: indexMemberships.indexKey })
    .from(indexMemberships)
    .where(isNull(indexMemberships.effectiveTo));
  const out = new Map<number, string[]>();
  for (const row of rows) {
    const list = out.get(row.instrumentId);
    if (list === undefined) out.set(row.instrumentId, [row.indexKey]);
    else list.push(row.indexKey);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Snapshot inputs (batched, for the worker)
// ---------------------------------------------------------------------------

export async function deliveryPointsSince(db: Database, from: string) {
  return db
    .select({
      instrumentId: deliveryStats.instrumentId,
      tradingDate: deliveryStats.tradingDate,
      deliveryPercent: deliveryStats.deliveryPercent,
      deliverableQty: deliveryStats.deliverableQty,
      turnoverPaise: deliveryStats.turnoverPaise,
      trades: deliveryStats.trades,
    })
    .from(deliveryStats)
    .where(gte(deliveryStats.tradingDate, from));
}

export async function oiPointsSince(db: Database, from: string) {
  return db
    .select({
      instrumentId: derivativeOiDaily.instrumentId,
      tradingDate: derivativeOiDaily.tradingDate,
      futuresOi: derivativeOiDaily.futuresOi,
      oiChange: derivativeOiDaily.oiChange,
      buildup: derivativeOiDaily.buildup,
    })
    .from(derivativeOiDaily)
    .where(gte(derivativeOiDaily.tradingDate, from));
}

export async function shareholdingPointsSince(db: Database, from: string) {
  return db
    .select({
      instrumentId: shareholdingPatterns.instrumentId,
      asOf: shareholdingPatterns.asOfDate,
      promoterPercent: shareholdingPatterns.promoterPercent,
      publicPercent: shareholdingPatterns.publicPercent,
    })
    .from(shareholdingPatterns)
    .where(gte(shareholdingPatterns.asOfDate, from));
}

/** Deal counts per instrument and type since `from` (inclusive). */
export async function dealCountsSince(
  db: Database,
  from: string,
  to: string,
): Promise<Map<number, { bulk: number; block: number }>> {
  const rows = await db
    .select({
      instrumentId: bulkBlockDeals.instrumentId,
      dealType: bulkBlockDeals.dealType,
      count: sql<number>`count(*)::int`,
    })
    .from(bulkBlockDeals)
    .where(and(gte(bulkBlockDeals.tradingDate, from), lte(bulkBlockDeals.tradingDate, to)))
    .groupBy(bulkBlockDeals.instrumentId, bulkBlockDeals.dealType);
  const out = new Map<number, { bulk: number; block: number }>();
  for (const row of rows) {
    if (row.instrumentId === null) continue;
    const entry = out.get(row.instrumentId) ?? { bulk: 0, block: 0 };
    if (row.dealType === 'block') entry.block += row.count;
    else entry.bulk += row.count;
    out.set(row.instrumentId, entry);
  }
  return out;
}

/** Upcoming event dates per instrument, split into results and ex-dates. */
export async function upcomingEventDates(
  db: Database,
  from: string,
  to: string,
): Promise<Map<number, { results: string[]; exDates: string[] }>> {
  const rows = await db
    .select({
      instrumentId: marketEvents.instrumentId,
      eventType: marketEvents.eventType,
      eventDate: marketEvents.eventDate,
    })
    .from(marketEvents)
    .where(and(gte(marketEvents.eventDate, from), lte(marketEvents.eventDate, to)));
  const exTypes = new Set(['dividend', 'bonus', 'stock_split', 'rights_issue', 'buyback']);
  const out = new Map<number, { results: string[]; exDates: string[] }>();
  for (const row of rows) {
    if (row.instrumentId === null) continue;
    const entry = out.get(row.instrumentId) ?? { results: [], exDates: [] };
    if (row.eventType === 'result' || row.eventType === 'board_meeting') entry.results.push(row.eventDate);
    else if (exTypes.has(row.eventType)) entry.exDates.push(row.eventDate);
    out.set(row.instrumentId, entry);
  }
  return out;
}

export async function announcementCountsSince(db: Database, since: Date): Promise<Map<number, number>> {
  const rows = await db
    .select({ instrumentId: corporateAnnouncements.instrumentId, count: sql<number>`count(*)::int` })
    .from(corporateAnnouncements)
    .where(gte(corporateAnnouncements.announcedAt, since))
    .groupBy(corporateAnnouncements.instrumentId);
  const out = new Map<number, number>();
  for (const row of rows) if (row.instrumentId !== null) out.set(row.instrumentId, row.count);
  return out;
}

/** Latest end-of-day signal per instrument on or before `date`. */
export async function latestSignalsOnOrBefore(
  db: Database,
  date: string,
): Promise<Map<number, { direction: string; strength: number }>> {
  const rows = await db.execute<{ instrument_id: number; direction: string; strength: number }>(sql`
    SELECT DISTINCT ON (instrument_id) instrument_id, direction, strength
    FROM ${signals}
    WHERE trading_date <= ${date} AND trading_date >= (${date}::date - 7)
    ORDER BY instrument_id, trading_date DESC
  `);
  return new Map(rows.rows.map((r) => [r.instrument_id, { direction: r.direction, strength: Number(r.strength) }]));
}

// ---------------------------------------------------------------------------
// Snapshot writes
// ---------------------------------------------------------------------------

export async function startSnapshotBuild(
  db: Database,
  tradingDate: string,
  calcVersion: string,
): Promise<number> {
  const [row] = await db
    .insert(screenerSnapshotBuilds)
    .values({ tradingDate, calcVersion })
    .returning({ id: screenerSnapshotBuilds.id });
  if (row === undefined) throw new Error('screener: could not start a snapshot build');
  return row.id;
}

export async function finishSnapshotBuild(
  db: Database,
  id: number,
  result: { status: 'ok' | 'failed'; instruments: number; rowsWritten: number; skipped: number; error?: string },
): Promise<void> {
  await db
    .update(screenerSnapshotBuilds)
    .set({
      status: result.status,
      instruments: result.instruments,
      rowsWritten: result.rowsWritten,
      skipped: result.skipped,
      error: result.error ?? null,
      finishedAt: sql`now()`,
    })
    .where(eq(screenerSnapshotBuilds.id, id));
}

/** ~115 columns per row: 400 rows stays far below Postgres's 65,535 parameters. */
const SNAPSHOT_CHUNK = 400;

/**
 * Writes a session's rows. A rebuild of the same session replaces its rows:
 * snapshots are derived, and the newest build is the truth.
 */
export async function upsertScreenerSnapshots(
  db: Database,
  rows: readonly SnapshotInsert[],
): Promise<number> {
  let written = 0;
  const updatable = Object.keys(COLUMNS).filter((k) => k !== 'tradingDate' && k !== 'instrumentId');
  const set = Object.fromEntries(
    updatable.map((k) => [k, sql.raw(`excluded."${column(k).name}"`)]),
  );
  for (let i = 0; i < rows.length; i += SNAPSHOT_CHUNK) {
    const chunk = rows.slice(i, i + SNAPSHOT_CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(screenerSnapshots)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [screenerSnapshots.tradingDate, screenerSnapshots.instrumentId],
        set,
      })
      .returning({ id: screenerSnapshots.instrumentId });
    written += result.length;
  }
  return written;
}

/** The newest session with a successful build, or null. */
export async function latestSnapshotDate(db: Database): Promise<string | null> {
  const [row] = await db
    .select({ tradingDate: screenerSnapshotBuilds.tradingDate, finishedAt: screenerSnapshotBuilds.finishedAt })
    .from(screenerSnapshotBuilds)
    .where(eq(screenerSnapshotBuilds.status, 'ok'))
    .orderBy(desc(screenerSnapshotBuilds.tradingDate), desc(screenerSnapshotBuilds.id))
    .limit(1);
  return row?.tradingDate ?? null;
}

export async function latestSnapshotBuild(db: Database) {
  const [row] = await db
    .select()
    .from(screenerSnapshotBuilds)
    .where(eq(screenerSnapshotBuilds.status, 'ok'))
    .orderBy(desc(screenerSnapshotBuilds.tradingDate), desc(screenerSnapshotBuilds.id))
    .limit(1);
  return row ?? null;
}

/** Sessions that have snapshots, newest first (for "screen as of"). */
export async function snapshotDates(db: Database, limit = 60): Promise<string[]> {
  const rows = await db
    .selectDistinct({ tradingDate: screenerSnapshotBuilds.tradingDate })
    .from(screenerSnapshotBuilds)
    .where(eq(screenerSnapshotBuilds.status, 'ok'))
    .orderBy(desc(screenerSnapshotBuilds.tradingDate))
    .limit(limit);
  return rows.map((r) => r.tradingDate);
}

// ---------------------------------------------------------------------------
// The SQL compiler
// ---------------------------------------------------------------------------

function textArray(values: readonly string[]): SQL {
  return sql`ARRAY[${sql.join(
    values.map((v) => sql`${v}`),
    sql`, `,
  )}]::text[]`;
}

const OPS: Readonly<Record<string, string>> = { gt: '>', gte: '>=', lt: '<', lte: '<=' };

/** One leaf → one boolean SQL expression. Assumes the tree passed `validateFilter`. */
export function compileLeaf(leaf: FilterLeaf): SQL {
  const col = column(leaf.metric);
  const op = OPS[leaf.cmp];
  if (leaf.rhsMetric !== undefined) {
    if (op === undefined) throw new Error(`screener: ${leaf.cmp} cannot compare metrics`);
    return sql`(${col} ${sql.raw(op)} ${column(leaf.rhsMetric)})`;
  }
  const v = leaf.value;
  if (op !== undefined && typeof v === 'number') return sql`(${col} ${sql.raw(op)} ${v})`;
  if (leaf.cmp === 'between' && Array.isArray(v) && typeof v[0] === 'number' && typeof v[1] === 'number')
    return sql`(${col} BETWEEN ${v[0]} AND ${v[1]})`;
  if (leaf.cmp === 'within' && typeof v === 'number') return sql`(${col} BETWEEN 0 AND ${v})`;
  if (leaf.cmp === 'is' && (typeof v === 'boolean' || typeof v === 'string')) return sql`(${col} = ${v})`;
  if (leaf.cmp === 'in' && Array.isArray(v) && v.every((x) => typeof x === 'string')) {
    const values = v as readonly string[];
    return leaf.metric === 'indexKeys'
      ? sql`(${col} && ${textArray(values)})`
      : sql`(${col} = ANY(${textArray(values)}))`;
  }
  throw new Error(`screener: cannot compile ${leaf.metric} ${leaf.cmp}`);
}

export function compileFilter(node: FilterNode): SQL {
  if ('op' in node) {
    const parts = node.children.map(compileFilter);
    if (parts.length === 0) return sql`TRUE`;
    return sql`(${sql.join(parts, node.op === 'and' ? sql` AND ` : sql` OR `)})`;
  }
  return compileLeaf(node);
}

export type ScreenUniverse =
  | { readonly kind: 'all' }
  | { readonly kind: 'index'; readonly indexKey: string }
  | { readonly kind: 'instruments'; readonly instrumentIds: readonly number[] };

function universeCondition(universe: ScreenUniverse): SQL | undefined {
  if (universe.kind === 'index')
    return sql`(${screenerSnapshots.indexKeys} && ${textArray([universe.indexKey])})`;
  if (universe.kind === 'instruments')
    return universe.instrumentIds.length === 0
      ? sql`FALSE`
      : inArray(screenerSnapshots.instrumentId, [...universe.instrumentIds]);
  return undefined;
}

export interface ScreenQuery {
  readonly tradingDate: string;
  readonly filter: FilterNode | null;
  readonly universe: ScreenUniverse;
  readonly sort: { readonly metric: MetricKey | 'symbol'; readonly direction: 'asc' | 'desc' };
  readonly limit: number;
  readonly offset: number;
}

/** Hard ceiling on one page: a screener narrows, it does not dump the universe. */
export const MAX_SCREEN_PAGE = 200;

export async function runScreen(
  db: Database,
  query: ScreenQuery,
): Promise<{ rows: SnapshotRow[]; total: number; base: number }> {
  const scope = [eq(screenerSnapshots.tradingDate, query.tradingDate)];
  const u = universeCondition(query.universe);
  if (u !== undefined) scope.push(u);
  const where = query.filter === null ? and(...scope) : and(...scope, compileFilter(query.filter));

  const sortCol = query.sort.metric === 'symbol' ? screenerSnapshots.symbol : column(query.sort.metric);
  const order =
    query.sort.direction === 'asc' ? sql`${sortCol} ASC NULLS LAST` : sql`${sortCol} DESC NULLS LAST`;

  const [counts] = await db
    .select({
      base: sql<number>`count(*)::int`,
      total: query.filter === null ? sql<number>`count(*)::int` : sql<number>`(count(*) FILTER (WHERE ${compileFilter(query.filter)}))::int`,
    })
    .from(screenerSnapshots)
    .where(and(...scope));

  const rows = await db
    .select()
    .from(screenerSnapshots)
    .where(where)
    .orderBy(order, asc(screenerSnapshots.symbol))
    .limit(Math.min(Math.max(query.limit, 1), MAX_SCREEN_PAGE))
    .offset(Math.max(query.offset, 0));

  return { rows, total: counts?.total ?? 0, base: counts?.base ?? 0 };
}

/**
 * Match counts for each condition: `individual[i]` = rows satisfying condition
 * i alone; `cumulative[i]` = rows satisfying conditions 0..i together (the
 * funnel). One scan, whatever the number of conditions.
 */
export async function conditionCounts(
  db: Database,
  input: { tradingDate: string; universe: ScreenUniverse; conditions: readonly FilterNode[] },
): Promise<{ base: number; individual: number[]; cumulative: number[] }> {
  const scope = [eq(screenerSnapshots.tradingDate, input.tradingDate)];
  const u = universeCondition(input.universe);
  if (u !== undefined) scope.push(u);
  if (input.conditions.length === 0) {
    const [row] = await db
      .select({ base: sql<number>`count(*)::int` })
      .from(screenerSnapshots)
      .where(and(...scope));
    return { base: row?.base ?? 0, individual: [], cumulative: [] };
  }

  const compiled = input.conditions.map(compileFilter);
  const selections: SQL[] = [sql`count(*)::int`];
  compiled.forEach((c) => selections.push(sql`(count(*) FILTER (WHERE ${c}))::int`));
  compiled.forEach((_, i) =>
    selections.push(sql`(count(*) FILTER (WHERE ${sql.join(compiled.slice(0, i + 1), sql` AND `)}))::int`),
  );
  const result = await db.execute<Record<string, number>>(sql`
    SELECT ${sql.join(
      selections.map((s, i) => sql`${s} AS ${sql.raw(`c${i}`)}`),
      sql`, `,
    )}
    FROM ${screenerSnapshots}
    WHERE ${and(...scope)}
  `);
  const row = result.rows[0] ?? {};
  const n = compiled.length;
  const at = (i: number) => Number(row[`c${i}`] ?? 0);
  return {
    base: at(0),
    individual: Array.from({ length: n }, (_, i) => at(1 + i)),
    cumulative: Array.from({ length: n }, (_, i) => at(1 + n + i)),
  };
}

/** Distinct industries on a session, for the picker's options. */
export async function snapshotIndustries(db: Database, tradingDate: string): Promise<string[]> {
  const rows = await db
    .selectDistinct({ industry: screenerSnapshots.industry })
    .from(screenerSnapshots)
    .where(eq(screenerSnapshots.tradingDate, tradingDate))
    .orderBy(asc(screenerSnapshots.industry));
  return rows.flatMap((r) => (r.industry === null ? [] : [r.industry]));
}

/** One stock's latest snapshot row on or before `date`. */
export async function snapshotForInstrument(
  db: Database,
  instrumentId: number,
  onOrBefore?: string,
): Promise<SnapshotRow | null> {
  const conditions = [eq(screenerSnapshots.instrumentId, instrumentId)];
  if (onOrBefore !== undefined) conditions.push(lte(screenerSnapshots.tradingDate, onOrBefore));
  const [row] = await db
    .select()
    .from(screenerSnapshots)
    .where(and(...conditions))
    .orderBy(desc(screenerSnapshots.tradingDate))
    .limit(1);
  return row ?? null;
}

/** Peers: same industry on the same session, ranked by RS. */
export async function industryPeers(
  db: Database,
  input: { tradingDate: string; industry: string; excludeInstrumentId: number; limit: number },
): Promise<SnapshotRow[]> {
  return db
    .select()
    .from(screenerSnapshots)
    .where(
      and(
        eq(screenerSnapshots.tradingDate, input.tradingDate),
        eq(screenerSnapshots.industry, input.industry),
        sql`${screenerSnapshots.instrumentId} <> ${input.excludeInstrumentId}`,
      ),
    )
    .orderBy(sql`${screenerSnapshots.rsRank} DESC NULLS LAST`, asc(screenerSnapshots.symbol))
    .limit(input.limit);
}

/** Top rows of one metric on a session (breadth-page leader lists). */
export async function snapshotLeaders(
  db: Database,
  input: { tradingDate: string; metric: MetricKey; filter: FilterNode | null; limit: number },
): Promise<SnapshotRow[]> {
  const col = column(input.metric);
  const conditions = [eq(screenerSnapshots.tradingDate, input.tradingDate), sql`${col} IS NOT NULL`];
  if (input.filter !== null) conditions.push(compileFilter(input.filter));
  return db
    .select()
    .from(screenerSnapshots)
    .where(and(...conditions))
    .orderBy(sql`${col} DESC`, asc(screenerSnapshots.symbol))
    .limit(input.limit);
}

export interface IndustryAggregate {
  readonly industry: string;
  readonly stocks: number;
  readonly change1d: number | null;
  readonly ret1w: number | null;
  readonly ret1m: number | null;
  readonly ret3m: number | null;
  readonly above50Pct: number | null;
}

/** Median returns and % above EMA 50 per industry on a session. */
export async function industryAggregates(db: Database, tradingDate: string): Promise<IndustryAggregate[]> {
  const result = await db.execute<{
    industry: string;
    stocks: number;
    change1d: number | null;
    ret1w: number | null;
    ret1m: number | null;
    ret3m: number | null;
    above50_pct: number | null;
  }>(sql`
    SELECT industry,
           count(*)::int AS stocks,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY change_pct) AS change1d,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ret1w) AS ret1w,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ret1m) AS ret1m,
           percentile_cont(0.5) WITHIN GROUP (ORDER BY ret3m) AS ret3m,
           100.0 * count(*) FILTER (WHERE close_vs_ema50 > 0) / NULLIF(count(close_vs_ema50), 0) AS above50_pct
    FROM ${screenerSnapshots}
    WHERE trading_date = ${tradingDate} AND industry IS NOT NULL
    GROUP BY industry
    HAVING count(*) >= 3
    ORDER BY ret1m DESC NULLS LAST
  `);
  return result.rows.map((r) => ({
    industry: r.industry,
    stocks: Number(r.stocks),
    change1d: num(r.change1d),
    ret1w: num(r.ret1w),
    ret1m: num(r.ret1m),
    ret3m: num(r.ret3m),
    above50Pct: num(r.above50_pct),
  }));
}

function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

// ---------------------------------------------------------------------------
// Breadth
// ---------------------------------------------------------------------------

export type BreadthUpsert = typeof marketBreadthDaily.$inferInsert;

export async function upsertBreadth(db: Database, rows: readonly BreadthUpsert[]): Promise<number> {
  let written = 0;
  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(marketBreadthDaily)
      .values([...chunk])
      .onConflictDoUpdate({
        target: [marketBreadthDaily.universe, marketBreadthDaily.tradingDate],
        set: {
          advances: sql`excluded.advances`,
          declines: sql`excluded.declines`,
          unchanged: sql`excluded.unchanged`,
          above20: sql`excluded.above20`,
          base20: sql`excluded.base20`,
          above50: sql`excluded.above50`,
          base50: sql`excluded.base50`,
          above200: sql`excluded.above200`,
          base200: sql`excluded.base200`,
          newHighs: sql`excluded.new_highs`,
          newLows: sql`excluded.new_lows`,
          base52: sql`excluded.base52`,
          computedAt: sql`now()`,
        },
      })
      .returning({ d: marketBreadthDaily.tradingDate });
    written += result.length;
  }
  return written;
}

export async function breadthHistory(
  db: Database,
  input: { universe: string; from: string },
): Promise<(typeof marketBreadthDaily.$inferSelect)[]> {
  return db
    .select()
    .from(marketBreadthDaily)
    .where(and(eq(marketBreadthDaily.universe, input.universe), gte(marketBreadthDaily.tradingDate, input.from)))
    .orderBy(asc(marketBreadthDaily.tradingDate));
}

// ---------------------------------------------------------------------------
// Saved screens (owner-scoped — every query names the owner)
// ---------------------------------------------------------------------------

export type SavedScreenRow = typeof savedScreens.$inferSelect;

export interface SavedScreenInput {
  readonly name: string;
  readonly definition: unknown;
  readonly columns: readonly string[];
  readonly sort: string;
  readonly universe: string;
}

export const MAX_SAVED_SCREENS = 50;

export async function listSavedScreens(db: Database, ownerId: number): Promise<SavedScreenRow[]> {
  return db
    .select()
    .from(savedScreens)
    .where(eq(savedScreens.ownerId, ownerId))
    .orderBy(desc(savedScreens.updatedAt));
}

export async function getSavedScreen(
  db: Database,
  ownerId: number,
  id: number,
): Promise<SavedScreenRow | null> {
  const [row] = await db
    .select()
    .from(savedScreens)
    .where(and(eq(savedScreens.ownerId, ownerId), eq(savedScreens.id, id)))
    .limit(1);
  return row ?? null;
}

export async function countSavedScreens(db: Database, ownerId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(savedScreens)
    .where(eq(savedScreens.ownerId, ownerId));
  return row?.n ?? 0;
}

export async function createSavedScreen(
  db: Database,
  ownerId: number,
  input: SavedScreenInput,
): Promise<SavedScreenRow> {
  const [row] = await db
    .insert(savedScreens)
    .values({ ownerId, ...input, columns: [...input.columns] })
    .returning();
  if (row === undefined) throw new Error('screener: could not save the screen');
  return row;
}

export async function updateSavedScreen(
  db: Database,
  ownerId: number,
  id: number,
  input: Partial<SavedScreenInput>,
): Promise<SavedScreenRow | null> {
  const [row] = await db
    .update(savedScreens)
    .set({
      ...input,
      ...(input.columns === undefined ? {} : { columns: [...input.columns] }),
      updatedAt: sql`now()`,
    })
    .where(and(eq(savedScreens.ownerId, ownerId), eq(savedScreens.id, id)))
    .returning();
  return row ?? null;
}

export async function deleteSavedScreen(db: Database, ownerId: number, id: number): Promise<boolean> {
  const rows = await db
    .delete(savedScreens)
    .where(and(eq(savedScreens.ownerId, ownerId), eq(savedScreens.id, id)))
    .returning({ id: savedScreens.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------
// Corporate actions (the adjustment rows candles are read through)
// ---------------------------------------------------------------------------

/**
 * The RAW stored bars either side of an ex-date: the last close before it and
 * the first open on or after it. Raw on purpose — the question is whether the
 * stored series already shows the jump, so adjustments must not be applied.
 */
export async function rawBarsAroundExDate(
  db: Database,
  instrumentId: number,
  exDate: string,
): Promise<{ lastCloseBefore: number | null; firstOpenOnOrAfter: number | null }> {
  const boundary = new Date(`${exDate}T00:00:00Z`);
  const [before] = await db
    .select({ close: dailyCandles.close })
    .from(dailyCandles)
    .where(and(eq(dailyCandles.instrumentId, instrumentId), sql`${dailyCandles.ts} < ${boundary}`))
    .orderBy(desc(dailyCandles.ts))
    .limit(1);
  const [after] = await db
    .select({ open: dailyCandles.open })
    .from(dailyCandles)
    .where(and(eq(dailyCandles.instrumentId, instrumentId), gte(dailyCandles.ts, boundary)))
    .orderBy(asc(dailyCandles.ts))
    .limit(1);
  return { lastCloseBefore: before?.close ?? null, firstOpenOnOrAfter: after?.open ?? null };
}

/** Records one adjusting action; an existing (instrument, ex-date, kind) row is kept. */
export async function recordCorporateAction(
  db: Database,
  row: { instrumentId: number; kind: string; exDate: string; ratio: string; note: string },
): Promise<boolean> {
  const result = await db
    .insert(corporateActions)
    .values(row)
    .onConflictDoNothing()
    .returning({ id: corporateActions.id });
  return result.length > 0;
}

/** `instrumentId|exDate|kind` for every recorded action on or after `from`. */
export async function recordedCorporateActionKeys(db: Database, from: string): Promise<Set<string>> {
  const rows = await db
    .select({
      instrumentId: corporateActions.instrumentId,
      exDate: corporateActions.exDate,
      kind: corporateActions.kind,
    })
    .from(corporateActions)
    .where(gte(corporateActions.exDate, from));
  return new Set(rows.map((r) => `${r.instrumentId}|${r.exDate}|${r.kind}`));
}
