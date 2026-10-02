import type {
  MarketEventImportance,
  MarketEventMetadata,
  MarketEventType,
} from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Public/general market events used by the signed-in Market Calendar.
 *
 * `eventDate` is an exchange-local IST date key. A supplied wall-clock time is
 * converted at ingestion and stored as the UTC instant `eventTime`.
 */
export const marketEvents = pgTable(
  'market_events',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Stable config/source identity. Nullable for future sources without one. */
    sourceKey: text(),
    instrumentId: integer().references(() => instruments.id),
    symbol: text(),
    eventType: text().$type<MarketEventType>().notNull(),
    eventCategory: text(),
    title: text().notNull(),
    description: text(),
    eventDate: date().notNull(),
    eventTime: timestamp({ withTimezone: true }),
    sourceName: text(),
    sourceUrl: text(),
    importance: text().$type<MarketEventImportance>(),
    metadata: jsonb().$type<MarketEventMetadata>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // PostgreSQL unique indexes allow multiple nulls, while every configured
    // event has a non-null key and can therefore upsert on this target.
    uniqueIndex('market_events_source_key_idx').on(table.sourceKey),
    index('market_events_date_type_idx').on(table.eventDate, table.eventType),
    index('market_events_instrument_date_idx').on(table.instrumentId, table.eventDate),
    check(
      'market_events_type_check',
      sql`${table.eventType} in ('market_holiday','result','board_meeting','dividend','bonus','stock_split','rights_issue','buyback','ipo','corporate_announcement')`,
    ),
    check(
      'market_events_importance_check',
      sql`${table.importance} is null or ${table.importance} in ('low','medium','high')`,
    ),
  ],
);
