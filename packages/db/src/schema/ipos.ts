import type { FieldSources } from '@equitywise/shared';
import { sql } from 'drizzle-orm';
import {
  bigint,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';

/**
 * IPOs (docs/planning/ipos-plan.md §6).
 *
 *   - `ipo_issues`                  the canonical record, one row per issue,
 *                                   resolved from every official source with
 *                                   per-field provenance (`field_sources`).
 *   - `ipo_source_records`          every observation a source made, with a
 *                                   change history (a new row when the payload
 *                                   hash changes). Unmatched rows have no issue.
 *   - `ipo_subscription_snapshots`  append-only bids-by-category time series.
 *   - `ipo_documents`               links to official documents — never rehosted.
 *   - `ipo_listing_performance`     listing-day prices from the exchange file,
 *                                   frozen once written; latest close rolls on.
 *   - `ipo_gmp_snapshots`           append-only UNOFFICIAL grey-market premium.
 *   - `ipo_rhp_extracts`            sections quoted from an RHP, with pages.
 *   - `ipo_sebi_filings`            DRHPs and addenda filed with SEBI — not issues.
 *
 * Invariants (CLAUDE.md): money is INTEGER PAISE in `bigint` (issue sizes run
 * to ~3×10¹³ paise); calendar days are IST `date` keys; instants are UTC
 * `timestamptz`. Status is never stored — it derives from dates on read.
 */

/** Every money column: integer paise, as a JS number (safe to ~9×10¹⁵). */
const paise = () => bigint({ mode: 'number' });

export const ipoIssues = pgTable(
  'ipo_issues',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** URL key: `vishal-nirmiti-ipo-2026`. */
    slug: text().notNull(),
    companyName: text().notNull(),
    /** `mainboard` | `sme`. */
    board: text().notNull(),
    /** `book_building` | `fixed_price`. */
    issueMethod: text(),
    /** `NSE` | `BSE` — whose facts win a disagreement (§6.3). */
    designatedExchange: text(),
    /** Every exchange the issue lists on. */
    exchanges: text().array().notNull().default(sql`'{}'::text[]`),
    nseSymbol: text(),
    nseSeries: text(),
    bseScripCode: text(),
    isin: text(),

    openDate: date(),
    closeDate: date(),
    /** Official only; an expected (T+3) date never lands here. */
    listingDate: date(),
    allotmentDate: date(),
    refundDate: date(),
    dematCreditDate: date(),
    upiCutoffAt: timestamp({ withTimezone: true }),

    priceBandLowPaise: paise(),
    priceBandHighPaise: paise(),
    /** Final issue price, once fixed. */
    issuePricePaise: paise(),
    faceValuePaise: paise(),
    lotSize: integer(),
    minBidQuantity: integer(),
    retailMaxPaise: paise(),
    employeeDiscountPaise: paise(),

    sharesOffered: bigint({ mode: 'number' }),
    freshIssueShares: bigint({ mode: 'number' }),
    freshIssuePaise: paise(),
    ofsShares: bigint({ mode: 'number' }),
    ofsPaise: paise(),
    marketMakerShares: bigint({ mode: 'number' }),
    anchorShares: bigint({ mode: 'number' }),
    /** The source's issue-size sentence, verbatim — shown when a parse is partial. */
    issueSizeText: text(),

    registrarName: text(),
    registrarContact: text(),
    leadManagers: text().array().notNull().default(sql`'{}'::text[]`),
    sponsorBanks: text().array().notNull().default(sql`'{}'::text[]`),
    marketMaker: text(),

    /** `withdrawn` | `postponed`, only when a source says so. */
    lifecycleOverride: text(),
    /** `{ field: { source, url, observedAt, basis } }` for every resolved field. */
    fieldSources: jsonb().$type<FieldSources>().notNull().default(sql`'{}'::jsonb`),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ipo_issues_slug_idx').on(t.slug),
    uniqueIndex('ipo_issues_nse_symbol_open_idx')
      .on(t.nseSymbol, t.openDate)
      .where(sql`${t.nseSymbol} IS NOT NULL`),
    uniqueIndex('ipo_issues_isin_idx').on(t.isin).where(sql`${t.isin} IS NOT NULL`),
    uniqueIndex('ipo_issues_bse_code_idx')
      .on(t.bseScripCode)
      .where(sql`${t.bseScripCode} IS NOT NULL`),
    index('ipo_issues_open_idx').on(t.openDate.desc()),
    index('ipo_issues_close_idx').on(t.closeDate),
    index('ipo_issues_listing_idx').on(t.listingDate.desc()),
    index('ipo_issues_board_idx').on(t.board),
    check('ipo_issues_board_known', sql`${t.board} IN ('mainboard','sme')`),
    check(
      'ipo_issues_method_known',
      sql`${t.issueMethod} IS NULL OR ${t.issueMethod} IN ('book_building','fixed_price')`,
    ),
    check(
      'ipo_issues_exchange_known',
      sql`${t.designatedExchange} IS NULL OR ${t.designatedExchange} IN ('NSE','BSE')`,
    ),
    check(
      'ipo_issues_override_known',
      sql`${t.lifecycleOverride} IS NULL OR ${t.lifecycleOverride} IN ('withdrawn','postponed')`,
    ),
    check(
      'ipo_issues_band_sane',
      sql`(${t.priceBandLowPaise} IS NULL OR ${t.priceBandLowPaise} > 0) AND (${t.priceBandHighPaise} IS NULL OR ${t.priceBandHighPaise} > 0) AND (${t.priceBandLowPaise} IS NULL OR ${t.priceBandHighPaise} IS NULL OR ${t.priceBandLowPaise} <= ${t.priceBandHighPaise})`,
    ),
    check(
      'ipo_issues_prices_positive',
      sql`(${t.issuePricePaise} IS NULL OR ${t.issuePricePaise} > 0) AND (${t.faceValuePaise} IS NULL OR ${t.faceValuePaise} > 0)`,
    ),
    check(
      'ipo_issues_quantities_positive',
      sql`(${t.lotSize} IS NULL OR ${t.lotSize} > 0) AND (${t.minBidQuantity} IS NULL OR ${t.minBidQuantity} > 0)`,
    ),
    check(
      'ipo_issues_dates_ordered',
      sql`(${t.openDate} IS NULL OR ${t.closeDate} IS NULL OR ${t.closeDate} >= ${t.openDate}) AND (${t.closeDate} IS NULL OR ${t.listingDate} IS NULL OR ${t.listingDate} >= ${t.closeDate})`,
    ),
  ],
);

export const ipoSourceRecords = pgTable(
  'ipo_source_records',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    /** Null until matched; unmatched records are listed in admin health. */
    ipoId: bigint({ mode: 'number' }).references(() => ipoIssues.id, { onDelete: 'set null' }),
    source: text().notNull(),
    /** `calendar` | `past` | `detail` | `subscription` | `listing` | `gmp` | `document`. */
    feed: text().notNull(),
    externalKey: text().notNull(),
    sourceUrl: text().notNull(),
    /** The NORMALISED observation (a `RawIpo*` shape), never a raw page. */
    payload: jsonb().$type<Record<string, unknown>>().notNull(),
    payloadHash: text().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('ipo_source_records_version_idx').on(
      t.source,
      t.feed,
      t.externalKey,
      t.payloadHash,
    ),
    index('ipo_source_records_ipo_idx').on(t.ipoId),
    index('ipo_source_records_feed_idx').on(t.source, t.feed, t.lastSeenAt.desc()),
  ],
);

export const ipoSubscriptionSnapshots = pgTable(
  'ipo_subscription_snapshots',
  {
    ipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoIssues.id, { onDelete: 'cascade' }),
    source: text().notNull(),
    /** `nse` | `bse` | `consolidated` — never compare across scopes. */
    scope: text().notNull(),
    /** The source's "updated as on" instant (or the fetch time, see `asOfBasis`). */
    asOf: timestamp({ withTimezone: true }).notNull(),
    /** `stated` by the source, or `fetched` when it gave no time. */
    asOfBasis: text().notNull(),
    category: text().notNull(),
    /** The source's label, verbatim. */
    categoryLabel: text().notNull(),
    sharesOffered: bigint({ mode: 'number' }),
    sharesBid: bigint({ mode: 'number' }),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({
      name: 'ipo_subscription_snapshots_pk',
      columns: [t.ipoId, t.source, t.scope, t.asOf, t.categoryLabel],
    }),
    index('ipo_subscription_snapshots_latest_idx').on(t.ipoId, t.scope, t.asOf.desc()),
    check('ipo_subscription_scope_known', sql`${t.scope} IN ('nse','bse','consolidated')`),
    check('ipo_subscription_basis_known', sql`${t.asOfBasis} IN ('stated','fetched')`),
    check(
      'ipo_subscription_category_known',
      sql`${t.category} IN ('qib','nii','nii_big','nii_small','retail','employee','shareholder','policyholder','other','total')`,
    ),
    check(
      'ipo_subscription_counts_nonnegative',
      sql`(${t.sharesOffered} IS NULL OR ${t.sharesOffered} >= 0) AND (${t.sharesBid} IS NULL OR ${t.sharesBid} >= 0)`,
    ),
  ],
);

export const ipoDocuments = pgTable(
  'ipo_documents',
  {
    id: bigint({ mode: 'number' }).primaryKey().generatedAlwaysAsIdentity(),
    ipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoIssues.id, { onDelete: 'cascade' }),
    kind: text().notNull(),
    title: text().notNull(),
    /** Host already checked against `documentHosts` (config/ipo-sources.yaml). */
    url: text().notNull(),
    source: text().notNull(),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastCheckedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Filled when the RHP extractor downloads the file (Phase 11). */
    sha256: text(),
    sizeBytes: bigint({ mode: 'number' }),
    /** The extractor version that last read this document; null = never read. */
    extractorVersion: integer(),
    extractedAt: timestamp({ withTimezone: true }),
    /** Failed reads so far; the job gives up on a document after a few. */
    extractAttempts: integer().notNull().default(0),
    extractError: text(),
  },
  (t) => [
    uniqueIndex('ipo_documents_url_idx').on(t.ipoId, t.url),
    check(
      'ipo_documents_kind_known',
      sql`${t.kind} IN ('drhp','rhp','prospectus','addendum','basis_of_allotment','anchor_allocation','price_band_ad')`,
    ),
  ],
);

export const ipoListingPerformance = pgTable(
  'ipo_listing_performance',
  {
    ipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoIssues.id, { onDelete: 'cascade' }),
    exchange: text().notNull(),
    listingDate: date().notNull(),
    /** The exchange file's previous close on listing day — the issue price. */
    issuePricePaise: paise().notNull(),
    listingOpenPaise: paise().notNull(),
    listingHighPaise: paise().notNull(),
    listingLowPaise: paise().notNull(),
    listingClosePaise: paise().notNull(),
    listingVolume: bigint({ mode: 'number' }).notNull(),
    latestClosePaise: paise(),
    latestCloseDate: date(),
    source: text().notNull(),
    sourceUrl: text().notNull(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'ipo_listing_performance_pk', columns: [t.ipoId, t.exchange] }),
    index('ipo_listing_performance_date_idx').on(t.listingDate.desc()),
    check('ipo_listing_exchange_known', sql`${t.exchange} IN ('NSE','BSE')`),
    check(
      'ipo_listing_prices_positive',
      sql`${t.issuePricePaise} > 0 AND ${t.listingOpenPaise} > 0 AND ${t.listingHighPaise} > 0 AND ${t.listingLowPaise} > 0 AND ${t.listingClosePaise} > 0 AND ${t.listingHighPaise} >= ${t.listingLowPaise}`,
    ),
  ],
);

export const ipoGmpSnapshots = pgTable(
  'ipo_gmp_snapshots',
  {
    ipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoIssues.id, { onDelete: 'cascade' }),
    /** The aggregator, e.g. `investorgain`. UNOFFICIAL by definition. */
    source: text().notNull(),
    observedAt: timestamp({ withTimezone: true }).notNull(),
    /** `stated` by the source, or `fetched` when it gave no time. */
    observedAtBasis: text().notNull(),
    /** Premium over the upper band; negative is a discount; null is "no quote". */
    gmpPaise: paise(),
    rangeLowPaise: paise(),
    rangeHighPaise: paise(),
    /** The aggregator's page for this issue — linked for attribution. */
    sourceUrl: text().notNull(),
    fetchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: 'ipo_gmp_snapshots_pk', columns: [t.ipoId, t.source, t.observedAt] }),
    index('ipo_gmp_snapshots_latest_idx').on(t.ipoId, t.observedAt.desc()),
    check('ipo_gmp_basis_known', sql`${t.observedAtBasis} IN ('stated','fetched')`),
  ],
);

/** One RHP section, as `RhpTable` in `@equitywise/core` — figures stay verbatim text. */
export interface RhpTableData {
  readonly unit: string;
  readonly columns: readonly string[];
  readonly rows: readonly { readonly label: string; readonly values: readonly (string | null)[] }[];
}

export const ipoRhpExtracts = pgTable(
  'ipo_rhp_extracts',
  {
    documentId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoDocuments.id, { onDelete: 'cascade' }),
    ipoId: bigint({ mode: 'number' })
      .notNull()
      .references(() => ipoIssues.id, { onDelete: 'cascade' }),
    section: text().notNull(),
    title: text().notNull(),
    /** A quoted passage (overview). */
    body: text(),
    /** Quoted list items (objects, promoters, strengths, risks). */
    items: jsonb().$type<readonly string[]>().notNull().default(sql`'[]'::jsonb`),
    /** Quoted figures (financials). */
    tableData: jsonb().$type<RhpTableData>(),
    /** 1-based PDF pages the quote came from. */
    pageFrom: integer().notNull(),
    pageTo: integer().notNull(),
    extractorVersion: integer().notNull(),
    extractedAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [
    primaryKey({ name: 'ipo_rhp_extracts_pk', columns: [t.documentId, t.section] }),
    index('ipo_rhp_extracts_ipo_idx').on(t.ipoId),
    check(
      'ipo_rhp_extracts_section_known',
      sql`${t.section} IN ('overview','objects','promoters','financials','strengths','risks')`,
    ),
    check('ipo_rhp_extracts_pages', sql`${t.pageFrom} >= 1 AND ${t.pageTo} >= ${t.pageFrom}`),
    check(
      'ipo_rhp_extracts_has_content',
      sql`${t.body} IS NOT NULL OR jsonb_array_length(${t.items}) > 0 OR ${t.tableData} IS NOT NULL`,
    ),
  ],
);

export const ipoSebiFilings = pgTable(
  'ipo_sebi_filings',
  {
    /** SEBI's numeric id for the filing page. */
    sebiId: text().primaryKey(),
    companyName: text().notNull(),
    /** `DRHP`, `Addendum to DRHP`, `UDRHP-I`…; null when SEBI's title names none. */
    documentLabel: text(),
    title: text().notNull(),
    /** IST date key. */
    filedDate: date().notNull(),
    pageUrl: text().notNull(),
    abridgedUrl: text(),
    /** Set only on an exact normalised-name match, for display. Never merged. */
    ipoId: bigint({ mode: 'number' }).references(() => ipoIssues.id, { onDelete: 'set null' }),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('ipo_sebi_filings_filed_idx').on(t.filedDate.desc()),
    index('ipo_sebi_filings_ipo_idx').on(t.ipoId),
  ],
);
