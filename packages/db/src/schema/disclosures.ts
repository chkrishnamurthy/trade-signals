import type { AnnouncementInterpretation } from '@equitywise/core';
import {
  bigint,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { instruments } from './instruments.js';

/**
 * Exchange & regulator DISCLOSURES — the free, official public record.
 *
 * Public availability does not establish automated collection or redistribution rights.
 * Source-specific permission is required; disclosures use their own neutral boundary.
 *
 * Invariants that still apply (CLAUDE.md):
 *   - Money is INTEGER PAISE (rule 3): deal prices and flow values are paise.
 *   - Timestamps are TIMESTAMPTZ in UTC (rule 6); IST appears only at display.
 *
 * These rows are NOT append-only like candles: a filing can be revised and
 * re-fetched, so every table upserts on a stable natural key rather than
 * accumulating duplicates.
 */

/**
 * One corporate announcement / filing.
 *
 * `instrumentId` is nullable: the exchange publishes announcements for names
 * outside our tracked universe too, and dropping those would silently hide real
 * filings. `symbol`/`companyName` are stored verbatim so such a row still reads
 * correctly with no instrument join.
 */
export const corporateAnnouncements = pgTable(
  'corporate_announcements',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Resolved instrument, when the symbol is one we track. */
    instrumentId: integer().references(() => instruments.id),
    /** Exchange symbol as published, e.g. `RELIANCE`. */
    symbol: text().notNull(),
    companyName: text().notNull(),
    /** Which feed supplied it, e.g. `bse`. Part of the idempotency key. */
    source: text().notNull(),
    /** The provider's own id for this filing — dedup key with `source`. */
    externalId: text().notNull(),
    /** Normalised bucket, e.g. `Financial Results`, `Board Meeting`, `Dividend`. */
    category: text(),
    headline: text().notNull(),
    /** A short factual summary — never the full copyrighted document. */
    detail: text(),
    /** Link to the official filing on the exchange. */
    attachmentUrl: text(),
    /** When the exchange disseminated it, UTC. */
    announcedAt: timestamp({ withTimezone: true }).notNull(),
    interpretation: jsonb().$type<AnnouncementInterpretation>(),
    interpretationChecksum: text(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    // Idempotent ingestion: re-fetching the same filing updates in place.
    uniqueIndex('corporate_announcements_source_ext_idx').on(table.source, table.externalId),
    index('corporate_announcements_instrument_idx').on(
      table.instrumentId,
      table.announcedAt.desc(),
    ),
    index('corporate_announcements_announced_idx').on(table.announcedAt.desc()),
    index('corporate_announcements_category_idx').on(table.category),
  ],
);

/**
 * Daily net institutional activity, market-wide.
 *
 * One row per (session, participant, segment). Values are PAISE — the exchange
 * publishes ₹ crore, converted on ingestion so the integer-paise rule holds and
 * a single formatter renders crores at the boundary.
 */
export const fiiDiiFlows = pgTable(
  'fii_dii_flows',
  {
    /** IST trading date of the session. */
    tradingDate: date().notNull(),
    /** `fii` (foreign) or `dii` (domestic) institutions. */
    participant: text().notNull(),
    /** Market segment, e.g. `cash`. */
    segment: text().notNull(),
    /** Gross buy value, paise. */
    buyValue: bigint({ mode: 'number' }).notNull(),
    /** Gross sell value, paise. */
    sellValue: bigint({ mode: 'number' }).notNull(),
    /** Net (buy − sell), paise. Positive is net buying. */
    netValue: bigint({ mode: 'number' }).notNull(),
    source: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.tradingDate, table.participant, table.segment] }),
    index('fii_dii_flows_date_idx').on(table.tradingDate.desc()),
  ],
);

/**
 * One bulk or block deal reported by the exchange.
 *
 * A single large trade with the trading party named — the closest free proxy
 * for institutional order flow at the single-name level. `price` is paise.
 */
export const bulkBlockDeals = pgTable(
  'bulk_block_deals',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** `bulk` or `block`. */
    dealType: text().notNull(),
    tradingDate: date().notNull(),
    instrumentId: integer().references(() => instruments.id),
    symbol: text().notNull(),
    companyName: text().notNull(),
    /** The party to the deal, as reported. */
    clientName: text().notNull(),
    /** `buy` or `sell`. */
    side: text().notNull(),
    /** Shares traded — a count, so a plain bigint. */
    quantity: bigint({ mode: 'number' }).notNull(),
    /** Weighted average trade price, paise. */
    price: integer().notNull(),
    exchange: text().notNull(),
    source: text().notNull(),
    /** Stable natural key for idempotent ingestion. */
    dedupeKey: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('bulk_block_deals_source_key_idx').on(table.source, table.dedupeKey),
    index('bulk_block_deals_instrument_idx').on(table.instrumentId, table.tradingDate.desc()),
    index('bulk_block_deals_date_idx').on(table.tradingDate.desc()),
  ],
);

/**
 * A company's shareholding pattern at a quarter end.
 *
 * Percentages are dimensionless floats, not money, so `doublePrecision` is
 * correct here. One row per (instrument, quarter).
 */
export const shareholdingPatterns = pgTable(
  'shareholding_patterns',
  {
    instrumentId: integer()
      .notNull()
      .references(() => instruments.id),
    /** Quarter-end date the pattern describes. */
    asOfDate: date().notNull(),
    promoterPercent: doublePrecision(),
    fiiPercent: doublePrecision(),
    diiPercent: doublePrecision(),
    publicPercent: doublePrecision(),
    source: text().notNull(),
    ingestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.instrumentId, table.asOfDate] }),
    index('shareholding_patterns_date_idx').on(table.asOfDate.desc()),
  ],
);
