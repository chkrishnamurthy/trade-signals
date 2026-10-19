/**
 * IPO vocabulary (docs/planning/ipos-plan.md).
 *
 * The shared, provider-neutral words every layer uses for an Indian public
 * issue: the source boundary in `@equitywise/market-data`, the pure domain
 * rules in `@equitywise/core`, the schema in `@equitywise/db`, and the web DTOs.
 * Money is INTEGER PAISE (CLAUDE.md rule 3); calendar days are `YYYY-MM-DD`
 * IST keys; instants are UTC `Date`s.
 */

/** Mainboard issues list on the main exchange segment; SME on NSE Emerge / BSE SME. */
export const IPO_BOARDS = ['mainboard', 'sme'] as const;
export type IpoBoard = (typeof IPO_BOARDS)[number];

export const IPO_EXCHANGES = ['NSE', 'BSE'] as const;
export type IpoExchange = (typeof IPO_EXCHANGES)[number];

/**
 * Where an issue is in its life, derived from dates and today — never stored,
 * so it cannot go stale. `withdrawn`/`postponed` only ever come from a source.
 */
export const IPO_STATUSES = [
  'upcoming',
  'open',
  'closed',
  'listed',
  'withdrawn',
  'postponed',
] as const;
export type IpoStatus = (typeof IPO_STATUSES)[number];

/**
 * The sub-stage of a closed issue, from the SEBI T+3 timeline.
 * `listing_unconfirmed`: well past the expected listing with no official
 * listing date — shown as "no listing reported", never as withdrawn.
 */
export type IpoClosedStage =
  | 'allotment_pending'
  | 'allotment_done'
  | 'listing_pending'
  | 'listing_unconfirmed';

export type IpoIssueMethod = 'book_building' | 'fixed_price';

/** A source withdrawing or postponing an issue overrides the date-derived status. */
export type IpoLifecycleOverride = 'withdrawn' | 'postponed';

/**
 * Investor categories a subscription figure is reported for. `nii_big` is the
 * ≥ ₹10 lakh bucket (bNII), `nii_small` the ₹2–10 lakh bucket (sNII). SME
 * "Individual Investors" are reported under `retail`; the verbatim label is
 * always kept beside the category.
 */
export const IPO_SUBSCRIPTION_CATEGORIES = [
  'qib',
  'nii',
  'nii_big',
  'nii_small',
  'retail',
  'employee',
  'shareholder',
  'policyholder',
  'other',
  'total',
] as const;
export type IpoSubscriptionCategory = (typeof IPO_SUBSCRIPTION_CATEGORIES)[number];

/** Whose bids a subscription figure counts. Never mix them in one comparison. */
export const SUBSCRIPTION_SCOPES = ['nse', 'bse', 'consolidated'] as const;
export type SubscriptionScope = (typeof SUBSCRIPTION_SCOPES)[number];

export const IPO_DOCUMENT_KINDS = [
  'drhp',
  'rhp',
  'prospectus',
  'addendum',
  'basis_of_allotment',
  'anchor_allocation',
  'price_band_ad',
] as const;
export type IpoDocumentKind = (typeof IPO_DOCUMENT_KINDS)[number];

/** A price band in paise. A fixed-price issue has `lowPaise === highPaise`. */
export interface PriceBand {
  readonly lowPaise: number;
  readonly highPaise: number;
}

/**
 * How a displayed fact came to be. `official` is as published by an exchange
 * or regulator; `derived` is computed by EquityWise (and says so on screen);
 * `conflict` means official sources disagree and the priority source is shown.
 */
export type FactBasis = 'official' | 'derived' | 'conflict';

export interface FactSource {
  readonly source: string;
  readonly url: string;
  /** ISO-8601 UTC instant the value was observed. */
  readonly observedAt: string;
  readonly basis: FactBasis;
}

/** Per-field provenance for a canonical issue: `{ fieldName: FactSource }`. */
export type FieldSources = Readonly<Record<string, FactSource>>;
