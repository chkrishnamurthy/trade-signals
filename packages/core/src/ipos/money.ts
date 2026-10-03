import type { IpoBoard } from '@equitywise/shared';
import type { ParsedIssueSize } from './issue-size.js';

/**
 * The money arithmetic of an IPO application, in INTEGER PAISE (hard rule 3).
 *
 * Every function returns `null` rather than a guess when an input is missing,
 * and refuses a product that would leave the safe-integer range. Percentages
 * are dimensionless floats for display only; nothing downstream does money
 * arithmetic with them.
 */

function product(a: number, b: number): number | null {
  const value = a * b;
  return Number.isSafeInteger(value) ? value : null;
}

export interface ApplicationTerms {
  readonly lotSize: number | null;
  /** Minimum order quantity, when the source states it apart from the lot. */
  readonly minBidQuantity: number | null;
  readonly priceBandHighPaise: number | null;
  /** The final price once fixed; used when there is no band (fixed-price issues). */
  readonly issuePricePaise: number | null;
  /** Lots in the smallest application when no minimum quantity is stated (default 1). */
  readonly minLots?: number;
}

/**
 * SME applications are at least TWO lots: SEBI (ICDR) (Amendment)
 * Regulations, 2025, notified 3 March 2025 (approved by SEBI's board on
 * 18 December 2024). NSE's SME bid categories say it outright: "Individual
 * Investors (IND category bidding for 2 Lots)"; more than two lots is a
 * non-institutional bid. Issues that opened before the rule took effect kept
 * the one-lot minimum. Mainboard applications are one lot.
 */
export const SME_MIN_LOTS = 2;
export const SME_MIN_LOTS_FROM = '2025-03-03';

/** Lots in the smallest application an individual can make on this issue. */
export function minApplicationLots(board: IpoBoard, openDate: string | null): number {
  if (board !== 'sme') return 1;
  return openDate === null || openDate >= SME_MIN_LOTS_FROM ? SME_MIN_LOTS : 1;
}

/**
 * The quantity of the smallest application: the stated minimum order
 * quantity, else `minLots` lots. Null without a lot.
 */
export function minApplicationShares(
  terms: Pick<ApplicationTerms, 'lotSize' | 'minBidQuantity' | 'minLots'>,
): number | null {
  if (terms.minBidQuantity !== null && terms.minBidQuantity > 0) return terms.minBidQuantity;
  if (terms.lotSize === null || terms.lotSize <= 0) return null;
  return product(terms.lotSize, terms.minLots ?? 1);
}

/**
 * The smallest application, at the upper end of the band: the minimum order
 * quantity (or `minLots` lots) × the cap price. The upper end is the price a
 * cut-off bid is blocked at, so it is the honest "money you need".
 */
export function minInvestmentPaise(terms: ApplicationTerms): number | null {
  const quantity = minApplicationShares(terms);
  const price = terms.priceBandHighPaise ?? terms.issuePricePaise;
  if (quantity === null || price === null || quantity <= 0 || price <= 0) return null;
  return product(quantity, price);
}

/**
 * How many whole lots fit under a retail cap (₹2,00,000 today, as the source
 * states it), at the upper end of the band. Null without a lot, price or cap.
 */
export function maxRetailLots(
  terms: Pick<ApplicationTerms, 'lotSize' | 'priceBandHighPaise' | 'issuePricePaise'>,
  capPaise: number | null,
): number | null {
  const price = terms.priceBandHighPaise ?? terms.issuePricePaise;
  if (terms.lotSize === null || price === null || capPaise === null) return null;
  const lotCost = product(terms.lotSize, price);
  if (lotCost === null || lotCost <= 0) return null;
  return Math.floor(capPaise / lotCost);
}

/** SEBI's retail cap: a retail individual bids for at most ₹2,00,000. */
export const RETAIL_CAP_PAISE = 20_000_000;

/**
 * The split inside the non-institutional portion (SEBI ICDR, from April 2022):
 * bids above the retail cap up to ₹10,00,000 are "small NII", bids above it
 * "big NII".
 */
export const SMALL_NII_CAP_PAISE = 100_000_000;

export type InvestmentLimitKind =
  | 'individual'
  | 'retail_min'
  | 'retail_max'
  | 'snii_min'
  | 'snii_max'
  | 'bnii_min';

export interface InvestmentLimit {
  readonly kind: InvestmentLimitKind;
  readonly lots: number;
  readonly shares: number;
  readonly amountPaise: number;
}

/**
 * The smallest and largest application each mainboard investor category
 * allows, in whole lots at the upper end of the band: retail up to the retail
 * cap, small NII above it up to ₹10 lakh, big NII above that. Empty without a
 * lot or a price, or when one lot already exceeds the retail cap. SME issues
 * size applications differently and are not described by this.
 */
export function investmentLimits(
  terms: Pick<ApplicationTerms, 'lotSize' | 'priceBandHighPaise' | 'issuePricePaise'>,
  retailCapPaise: number = RETAIL_CAP_PAISE,
): InvestmentLimit[] {
  const { lotSize } = terms;
  const price = terms.priceBandHighPaise ?? terms.issuePricePaise;
  if (lotSize === null || price === null || lotSize <= 0 || price <= 0) return [];
  const lotCost = product(lotSize, price);
  if (lotCost === null) return [];
  const retailMax = Math.floor(retailCapPaise / lotCost);
  if (retailMax < 1) return [];
  const sniiMax = Math.floor(SMALL_NII_CAP_PAISE / lotCost);
  const out: InvestmentLimit[] = [];
  const add = (kind: InvestmentLimitKind, lots: number) => {
    const shares = product(lots, lotSize);
    const amountPaise = product(lots, lotCost);
    if (shares !== null && amountPaise !== null) out.push({ kind, lots, shares, amountPaise });
  };
  add('retail_min', 1);
  add('retail_max', retailMax);
  if (sniiMax > retailMax) {
    add('snii_min', retailMax + 1);
    add('snii_max', sniiMax);
  }
  add('bnii_min', Math.max(sniiMax, retailMax) + 1);
  return out;
}

/**
 * The SME version: an individual applies for exactly `minLots` lots (two since
 * March 2025); anything larger is a non-institutional bid — above ₹2 lakh up
 * to ₹10 lakh "small NII", above ₹10 lakh "big NII" (NSE's SME categories).
 * Whole lots at the upper end of the band. Empty without a lot or a price.
 */
export function smeInvestmentLimits(
  terms: Pick<ApplicationTerms, 'lotSize' | 'priceBandHighPaise' | 'issuePricePaise'>,
  minLots: number = SME_MIN_LOTS,
): InvestmentLimit[] {
  const { lotSize } = terms;
  const price = terms.priceBandHighPaise ?? terms.issuePricePaise;
  if (lotSize === null || price === null || lotSize <= 0 || price <= 0 || minLots < 1) return [];
  const lotCost = product(lotSize, price);
  if (lotCost === null) return [];
  const out: InvestmentLimit[] = [];
  const add = (kind: InvestmentLimitKind, lots: number) => {
    const shares = product(lots, lotSize);
    const amountPaise = product(lots, lotCost);
    if (shares !== null && amountPaise !== null) out.push({ kind, lots, shares, amountPaise });
  };
  add('individual', minLots);
  // A non-institutional bid is more than the individual's lots AND above ₹2 lakh.
  const sniiMin = Math.max(minLots + 1, Math.floor(RETAIL_CAP_PAISE / lotCost) + 1);
  const sniiMax = Math.floor(SMALL_NII_CAP_PAISE / lotCost);
  if (sniiMax >= sniiMin) {
    add('snii_min', sniiMin);
    add('snii_max', sniiMax);
  }
  add('bnii_min', Math.max(sniiMax + 1, sniiMin));
  return out;
}

export type IssueSizeBasis = 'official' | 'derived_at_upper_band';

export interface IssueSizeTotal {
  readonly totalPaise: number;
  /** `derived_at_upper_band` when any share count was priced by us. */
  readonly basis: IssueSizeBasis;
  readonly freshPaise: number | null;
  readonly offerForSalePaise: number | null;
}

/**
 * The issue size in rupees: fresh issue + offer for sale. A component stated
 * only in shares is priced at the upper band and the total is then marked
 * DERIVED. Null when any present component cannot be priced.
 */
export function issueSizePaise(
  parsed: ParsedIssueSize,
  priceBandHighPaise: number | null,
): IssueSizeTotal | null {
  let derived = false;
  const price = (q: { paise: number | null; shares: number | null } | null): number | null => {
    if (q === null) return 0;
    if (q.paise !== null) return q.paise;
    if (q.shares === null || priceBandHighPaise === null) return null;
    derived = true;
    return product(q.shares, priceBandHighPaise);
  };
  if (parsed.fresh === null && parsed.offerForSale === null) {
    const total = price(parsed.total);
    if (total === null || total === 0) return null;
    return {
      totalPaise: total,
      basis: derived ? 'derived_at_upper_band' : 'official',
      freshPaise: null,
      offerForSalePaise: null,
    };
  }
  const fresh = price(parsed.fresh);
  const ofs = price(parsed.offerForSale);
  if (fresh === null || ofs === null) return null;
  const total = fresh + ofs;
  if (!Number.isSafeInteger(total) || total <= 0) return null;
  return {
    totalPaise: total,
    basis: derived ? 'derived_at_upper_band' : 'official',
    freshPaise: parsed.fresh === null ? null : fresh,
    offerForSalePaise: parsed.offerForSale === null ? null : ofs,
  };
}

/**
 * Times subscribed = shares bid ÷ shares offered. Null — never zero, never
 * infinity — when either is unknown or nothing was offered (an SME QIB row can
 * read "offered 0" while carrying bids).
 */
export function subscriptionTimes(
  sharesBid: number | null,
  sharesOffered: number | null,
): number | null {
  if (sharesBid === null || sharesOffered === null || sharesOffered <= 0 || sharesBid < 0)
    return null;
  return sharesBid / sharesOffered;
}

/** (to − from) ÷ from × 100, from paise integers; null without a positive base. */
export function percentChange(fromPaise: number | null, toPaise: number | null): number | null {
  if (fromPaise === null || toPaise === null || fromPaise <= 0) return null;
  return ((toPaise - fromPaise) / fromPaise) * 100;
}

/**
 * The grey-market premium as a % of the upper band. Labelled "unofficial
 * premium" wherever shown — never "expected gain" (plan §10.2).
 */
export function gmpPercent(
  gmpPaise: number | null,
  priceBandHighPaise: number | null,
): number | null {
  if (gmpPaise === null || priceBandHighPaise === null || priceBandHighPaise <= 0) return null;
  return (gmpPaise / priceBandHighPaise) * 100;
}
