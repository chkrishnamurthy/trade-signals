import type {
  DateKeyRange,
  MarketCalendarSummary,
  MarketEventImportance,
  MarketEventMetadata,
  MarketEventType,
} from '@equitywise/shared';
import { and, asc, eq, gte, inArray, lte, or, type SQL, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { instruments, marketEvents } from '../schema/index.js';

const UPSERT_CHUNK = 500;

export interface MarketEventUpsert {
  readonly sourceKey: string;
  readonly instrumentId: number | null;
  readonly symbol: string | null;
  readonly eventType: MarketEventType;
  readonly eventCategory: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly eventDate: string;
  readonly eventTime: Date | null;
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  readonly importance: MarketEventImportance | null;
  readonly metadata: MarketEventMetadata;
}

export async function upsertMarketEvents(
  db: Database,
  rows: readonly MarketEventUpsert[],
): Promise<number> {
  let written = 0;
  for (let offset = 0; offset < rows.length; offset += UPSERT_CHUNK) {
    const chunk = rows.slice(offset, offset + UPSERT_CHUNK);
    if (chunk.length === 0) continue;
    const result = await db
      .insert(marketEvents)
      .values(chunk)
      .onConflictDoUpdate({
        target: marketEvents.sourceKey,
        set: {
          instrumentId: sql`excluded.instrument_id`,
          symbol: sql`excluded.symbol`,
          eventType: sql`excluded.event_type`,
          eventCategory: sql`excluded.event_category`,
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          eventDate: sql`excluded.event_date`,
          eventTime: sql`excluded.event_time`,
          sourceName: sql`excluded.source_name`,
          sourceUrl: sql`excluded.source_url`,
          importance: sql`excluded.importance`,
          metadata: sql`excluded.metadata`,
          updatedAt: sql`now()`,
        },
      })
      .returning({ id: marketEvents.id });
    written += result.length;
  }
  return written;
}

export interface MarketEventScope {
  readonly instrumentIds: readonly number[];
  readonly symbols: readonly string[];
}

export interface MarketEventQuery {
  readonly from: string;
  readonly to: string;
  readonly eventType?: MarketEventType;
  readonly scope?: MarketEventScope;
}

export interface MarketEventRow {
  readonly id: number;
  readonly instrumentId: number | null;
  readonly symbol: string | null;
  readonly companyName: string | null;
  readonly eventType: MarketEventType;
  readonly eventCategory: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly eventDate: string;
  readonly eventTime: Date | null;
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  readonly importance: MarketEventImportance | null;
  readonly metadata: MarketEventMetadata;
}

function scopeCondition(scope: MarketEventScope): SQL | null {
  const conditions: SQL[] = [];
  if (scope.instrumentIds.length > 0)
    conditions.push(inArray(marketEvents.instrumentId, [...scope.instrumentIds]));
  if (scope.symbols.length > 0) conditions.push(inArray(marketEvents.symbol, [...scope.symbols]));
  if (conditions.length === 0) return null;
  return or(...conditions) ?? null;
}

export async function listMarketEvents(
  db: Database,
  query: MarketEventQuery,
): Promise<MarketEventRow[]> {
  const conditions: SQL[] = [
    gte(marketEvents.eventDate, query.from),
    lte(marketEvents.eventDate, query.to),
  ];
  if (query.eventType !== undefined) conditions.push(eq(marketEvents.eventType, query.eventType));
  if (query.scope !== undefined) {
    const scoped = scopeCondition(query.scope);
    if (scoped === null) return [];
    conditions.push(scoped);
  }

  return db
    .select({
      id: marketEvents.id,
      instrumentId: marketEvents.instrumentId,
      symbol: marketEvents.symbol,
      companyName: instruments.name,
      eventType: marketEvents.eventType,
      eventCategory: marketEvents.eventCategory,
      title: marketEvents.title,
      description: marketEvents.description,
      eventDate: marketEvents.eventDate,
      eventTime: marketEvents.eventTime,
      sourceName: marketEvents.sourceName,
      sourceUrl: marketEvents.sourceUrl,
      importance: marketEvents.importance,
      metadata: marketEvents.metadata,
    })
    .from(marketEvents)
    .leftJoin(instruments, eq(instruments.id, marketEvents.instrumentId))
    .where(and(...conditions))
    .orderBy(
      asc(marketEvents.eventDate),
      sql`${marketEvents.eventTime} asc nulls last`,
      sql`case ${marketEvents.importance} when 'high' then 1 when 'medium' then 2 when 'low' then 3 else 4 end`,
      asc(marketEvents.title),
      asc(marketEvents.id),
    );
}

async function countEvents(
  db: Database,
  range: DateKeyRange,
  options: { eventTypes?: readonly MarketEventType[]; scope?: MarketEventScope } = {},
): Promise<number> {
  const conditions: SQL[] = [
    gte(marketEvents.eventDate, range.from),
    lte(marketEvents.eventDate, range.to),
  ];
  if (options.eventTypes !== undefined && options.eventTypes.length > 0)
    conditions.push(inArray(marketEvents.eventType, [...options.eventTypes]));
  if (options.scope !== undefined) {
    const scoped = scopeCondition(options.scope);
    if (scoped === null) return 0;
    conditions.push(scoped);
  }
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(marketEvents)
    .where(and(...conditions));
  return Number(row?.count ?? 0);
}

export async function marketEventSummary(
  db: Database,
  input: {
    readonly today: DateKeyRange;
    readonly week: DateKeyRange;
    readonly upcoming: DateKeyRange;
    readonly watchlistScope: MarketEventScope;
    readonly corporateActionTypes: readonly MarketEventType[];
  },
): Promise<MarketCalendarSummary> {
  const [today, thisWeekResults, upcomingCorporateActions, watchlistRelated] = await Promise.all([
    countEvents(db, input.today),
    countEvents(db, input.week, { eventTypes: ['result'] }),
    countEvents(db, input.upcoming, { eventTypes: input.corporateActionTypes }),
    countEvents(db, input.upcoming, { scope: input.watchlistScope }),
  ]);
  return { today, thisWeekResults, upcomingCorporateActions, watchlistRelated };
}
