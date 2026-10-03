import type {
  IpoBoard,
  IpoDocumentKind,
  IpoExchange,
  IpoIssueMethod,
  IpoSubscriptionCategory,
  PriceBand,
  SubscriptionScope,
} from '@equitywise/shared';

/**
 * The IPO boundary (docs/planning/ipos-plan.md §5.2).
 *
 * Public-issue data is its own domain — neither market data nor corporate
 * disclosures — so it has its own provider-neutral shapes. Ingestion depends on
 * these; a concrete source (NSE, BSE) is chosen at the edge and its response
 * types never cross this file, the same discipline `DisclosureSource` follows.
 *
 * Money is INTEGER PAISE; calendar days are `YYYY-MM-DD` IST keys; instants are
 * UTC `Date`s. `null` always means "the source did not say", never zero.
 *
 * Two interfaces, on purpose: `IpoSource` carries OFFICIAL facts (exchanges,
 * regulator); `GmpSource` carries the unofficial grey-market premium from an
 * aggregator. A GMP source cannot implement `IpoSource`'s fact methods, so the
 * type system keeps aggregator data out of every official field (§6.3).
 */

/** Identifies one issue at one source, enough to ask that source for more. */
export interface IpoKey {
  readonly source: string;
  /** Stable per-source key, e.g. `nse:VNL:EQ:2026-09-30`. */
  readonly externalKey: string;
  /** Exchange symbol (NSE) or scrip code (BSE) as the source uses it. */
  readonly symbol: string;
  /** The source's series / segment code, e.g. `EQ`, `SME`. */
  readonly series: string;
}

/** One issue as it appears in a source's calendar or past-issue list. */
export interface RawIpoListing extends IpoKey {
  readonly sourceUrl: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  /** The exchange this source speaks for. */
  readonly exchange: IpoExchange;
  readonly bseScripCode: string | null;
  readonly isin: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
  /** Official listing date — only once the exchange has published it. */
  readonly listingDate: string | null;
  readonly priceBand: PriceBand | null;
  /** The final issue price, once fixed (after allotment). */
  readonly issuePricePaise: number | null;
  readonly lotSize: number | null;
  /** Shares offered, as the source counts them (often excluding the anchor portion). */
  readonly sharesOffered: number | null;
  /** The source's own status word, verbatim (`Active`, `Forthcoming`, …). */
  readonly sourceStatus: string | null;
}

export interface RawIpoDocument {
  readonly kind: IpoDocumentKind;
  readonly title: string;
  /** Absolute URL; the adapter has already checked it against the host allowlist. */
  readonly url: string;
}

export interface RawSubscriptionRow {
  readonly category: IpoSubscriptionCategory;
  /** The source's label, verbatim. */
  readonly label: string;
  readonly sharesOffered: number | null;
  readonly sharesBid: number | null;
}

export interface RawIpoSubscription {
  readonly source: string;
  readonly scope: SubscriptionScope;
  /** The source's own "as of" instant; null when it does not state one. */
  readonly asOf: Date | null;
  readonly rows: readonly RawSubscriptionRow[];
}

/** An issue's detail page, parsed field by field. */
export interface RawIpoDetail {
  readonly source: string;
  readonly externalKey: string;
  readonly sourceUrl: string;
  readonly companyName: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
  /** Last moment a UPI mandate is accepted, UTC. */
  readonly upiCutoffAt: Date | null;
  readonly issueMethod: IpoIssueMethod | null;
  readonly priceBand: PriceBand | null;
  readonly faceValuePaise: number | null;
  readonly lotSize: number | null;
  /** Minimum order quantity, when the source states it separately from the lot. */
  readonly minBidQuantity: number | null;
  /** Maximum application amount for a retail individual, paise. */
  readonly retailMaxPaise: number | null;
  /** Employee discount per share, paise. */
  readonly employeeDiscountPaise: number | null;
  /** The issue-size sentence, verbatim — always kept, parsed downstream. */
  readonly issueSizeText: string | null;
  readonly leadManagers: readonly string[];
  readonly registrarName: string | null;
  readonly registrarContact: string | null;
  readonly marketMaker: string | null;
  readonly sponsorBanks: readonly string[];
  readonly documents: readonly RawIpoDocument[];
  /**
   * Bids carried on the detail payload itself — NSE mainboard: NSE's own
   * platform; NSE SME: the consolidated book (see the NSE adapter).
   */
  readonly subscription: RawIpoSubscription | null;
}

/** One stock's row in an exchange's end-of-day file — a listing day's prices. */
export interface RawListingDay {
  readonly source: string;
  readonly exchange: IpoExchange;
  readonly symbol: string;
  readonly series: string;
  readonly tradingDate: string;
  /**
   * The previous close. On a stock's listing day NSE writes the issue price
   * here; BSE writes 0, which the adapter turns into null.
   */
  readonly prevClosePaise: number | null;
  /** The ISIN, when the exchange file carries it (BSE does, NSE does not). */
  readonly isin: string | null;
  readonly openPaise: number;
  readonly highPaise: number;
  readonly lowPaise: number;
  readonly closePaise: number;
  readonly volume: number;
  readonly sourceUrl: string;
}

/** A recently listed security, from the exchange's new-listings list. */
export interface RawRecentListing {
  readonly source: string;
  /** The exchange's trading code for the security (NSE symbol; BSE scrip code). */
  readonly symbol: string;
  readonly series: string;
  readonly isin: string | null;
  /** A ticker that may equal the NSE symbol of a dual-listed issue. */
  readonly ticker: string | null;
  readonly companyName: string;
  readonly listingDate: string;
  /** The final issue price, when the exchange's list states it (BSE does). */
  readonly issuePricePaise: number | null;
}

/**
 * Official IPO facts from one exchange or regulator.
 *
 * Every method THROWS on a transport or envelope failure so the job records
 * the reason against the feed; a method a source cannot answer returns `[]` or
 * `null` and the source's YAML says it does not offer that feed.
 */
export interface IpoSource {
  readonly id: string;
  /** Upcoming and currently open issues. */
  fetchCalendar(): Promise<readonly RawIpoListing[]>;
  /** Closed and listed issues, newest first. */
  fetchPastIssues(): Promise<readonly RawIpoListing[]>;
  fetchDetail(key: IpoKey): Promise<RawIpoDetail | null>;
  /** The broadest-scope subscription figure the source publishes for an issue. */
  fetchSubscription(key: IpoKey): Promise<RawIpoSubscription | null>;
  /** Every equity row of the exchange's end-of-day file for one session. */
  fetchListingDay(dateKey: string): Promise<readonly RawListingDay[]>;
  fetchRecentListings(): Promise<readonly RawRecentListing[]>;
}

/** One unofficial grey-market quote, as an aggregator reports it. */
export interface RawGmpQuote {
  readonly source: string;
  /** The aggregator's own id for the issue. */
  readonly externalKey: string;
  readonly companyName: string;
  readonly board: IpoBoard;
  /** The exchange the aggregator tags the issue with, when it does. */
  readonly exchange: IpoExchange | null;
  /** Used for matching only — never written to an official field. */
  readonly openDate: string | null;
  readonly closeDate: string | null;
  /** Premium over the upper band, paise. Negative is a discount; null is "no quote". */
  readonly gmpPaise: number | null;
  readonly rangeLowPaise: number | null;
  readonly rangeHighPaise: number | null;
  /** The aggregator's "updated" instant, UTC; null when it gives none. */
  readonly updatedAt: Date | null;
  /** The aggregator's page for this issue, linked for attribution. */
  readonly pageUrl: string;
}

export interface GmpSource {
  readonly id: string;
  fetchGmp(): Promise<readonly RawGmpQuote[]>;
}

/**
 * One public-issue filing on the regulator's site: a DRHP, an addendum to
 * one, an updated DRHP, or an offer document SEBI lists without a label.
 * A filing is not an announced issue — many never open — so it never creates
 * or changes an `ipo_issues` row; it is only linked to one on an exact name match.
 */
export interface RawSebiFiling {
  readonly source: string;
  /** SEBI's numeric id for the filing page. */
  readonly externalKey: string;
  readonly companyName: string;
  /** The document as SEBI names it (`DRHP`, `Addendum to DRHP`, `UDRHP-I`); null when the title names none. */
  readonly documentLabel: string | null;
  /** The listing's title, verbatim. */
  readonly title: string;
  /** IST date key the filing was posted. */
  readonly filedDate: string;
  readonly pageUrl: string;
  /** The draft abridged prospectus PDF, when SEBI links one. */
  readonly abridgedUrl: string | null;
}

export interface FilingSource {
  readonly id: string;
  fetchFilings(): Promise<readonly RawSebiFiling[]>;
}
