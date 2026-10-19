import type { IpoBoard } from '@equitywise/shared';

/**
 * Deciding that two records describe the same IPO (plan §6.3).
 *
 * The cost of a wrong merge is a real company shown with another company's
 * numbers, so every rule here prefers "unmatched" to "probably". A record that
 * only looks alike is never merged; the worker lists it for the operator.
 */

/** Legal-form and filler words that never distinguish two companies. */
const NOISE = new Set(['limited', 'ltd', 'private', 'pvt', 'and', 'the']);

/**
 * A company name as comparable tokens: lowercase, `&` → `and`, apostrophes
 * dropped (`Investor's` → `investors`), other punctuation → space, legal-form
 * and filler words removed. "India" is deliberately KEPT — "X India" and "X"
 * can be different companies.
 */
export function nameTokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/['’`]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((token) => token !== '' && !NOISE.has(token));
}

/** The normalised name as one string, for exact comparison. */
export function normalisedName(name: string): string {
  return nameTokens(name).join(' ');
}

/** Whole days between two `YYYY-MM-DD` keys (b − a). */
export function daysBetween(a: string, b: string): number {
  const ms = (key: string) => {
    const [y, m, d] = key.split('-').map(Number);
    return Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1);
  };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

function within(a: string | null, b: string | null, days: number): boolean {
  return a !== null && b !== null && Math.abs(daysBetween(a, b)) <= days;
}

/** What is known about one issue's identity. */
export interface IssueIdentity {
  readonly id: number;
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly isin: string | null;
  readonly nseSymbol: string | null;
  readonly bseScripCode: string | null;
  readonly openDate: string | null;
  readonly closeDate: string | null;
}

export type IssueCandidate = Omit<IssueIdentity, 'id'>;

export type MatchResult =
  | { readonly kind: 'isin' | 'nse_symbol' | 'bse_code' | 'name_dates'; readonly id: number }
  | { readonly kind: 'probable'; readonly ids: readonly number[] }
  | { readonly kind: 'none' };

function single(ids: readonly number[]): number | null {
  return ids.length === 1 ? (ids[0] ?? null) : null;
}

/**
 * Match an official record to a known issue, strongest identifier first:
 *   1. ISIN exact
 *   2. NSE symbol with open dates within ±10 days (symbols are reused years apart)
 *   3. BSE scrip code exact
 *   4. normalised name exact with open dates within ±3 days
 * A name-only match (no dates to confirm) is `probable` and is never merged.
 * Two qualifying issues at one step is ambiguous: nothing is merged.
 */
export function matchIssue(
  candidate: IssueCandidate,
  known: readonly IssueIdentity[],
): MatchResult {
  if (candidate.isin !== null) {
    const id = single(known.filter((k) => k.isin === candidate.isin).map((k) => k.id));
    if (id !== null) return { kind: 'isin', id };
  }
  if (candidate.nseSymbol !== null) {
    const sameSymbol = known.filter((k) => k.nseSymbol === candidate.nseSymbol);
    const ids = sameSymbol
      .filter(
        (k) =>
          within(k.openDate, candidate.openDate, 10) ||
          // A known issue whose dates are not announced yet is still pending;
          // the record that now carries the symbol (dated or not) is that issue.
          k.openDate === null,
      )
      .map((k) => k.id);
    const id = single(ids);
    if (id !== null) return { kind: 'nse_symbol', id };
    if (ids.length > 1) return { kind: 'probable', ids };
    // An UNDATED record never merges into a DATED issue on the symbol alone:
    // symbols are reused years apart, and without a date nothing tells the
    // old issue from a new one. Held for review rather than merged or duplicated.
    const dated = sameSymbol.map((k) => k.id);
    if (candidate.openDate === null && dated.length > 0) return { kind: 'probable', ids: dated };
  }
  if (candidate.bseScripCode !== null) {
    const id = single(
      known.filter((k) => k.bseScripCode === candidate.bseScripCode).map((k) => k.id),
    );
    if (id !== null) return { kind: 'bse_code', id };
  }
  const name = normalisedName(candidate.companyName);
  if (name === '') return { kind: 'none' };
  const sameName = known.filter(
    (k) => k.board === candidate.board && normalisedName(k.companyName) === name,
  );
  const dated = sameName.filter((k) => within(k.openDate, candidate.openDate, 3)).map((k) => k.id);
  const id = single(dated);
  if (id !== null) return { kind: 'name_dates', id };
  if (dated.length > 1) return { kind: 'probable', ids: dated };
  const undated = sameName
    .filter((k) => k.openDate === null || candidate.openDate === null)
    .map((k) => k.id);
  return undated.length > 0 ? { kind: 'probable', ids: undated } : { kind: 'none' };
}

/** What an aggregator's GMP row tells us about which issue it means. */
export interface GmpRowIdentity {
  readonly companyName: string;
  readonly board: IpoBoard;
  readonly openDate: string | null;
  readonly closeDate: string | null;
}

export type GmpMatch =
  | { readonly kind: 'matched'; readonly id: number }
  | { readonly kind: 'ambiguous'; readonly ids: readonly number[] }
  | { readonly kind: 'unmatched' };

/**
 * The stricter rule for unofficial GMP rows, which carry no symbol or ISIN:
 * same board, open AND close dates within ±1 day, and every token of the
 * aggregator's (often shortened) name present in the official name —
 * "A-One Steels" ⊆ "A-One Steels India Limited". Anything else is unmatched.
 */
export function matchGmpRow(row: GmpRowIdentity, known: readonly IssueIdentity[]): GmpMatch {
  const tokens = nameTokens(row.companyName);
  if (tokens.length === 0 || row.openDate === null || row.closeDate === null)
    return { kind: 'unmatched' };
  const ids = known
    .filter((k) => {
      if (k.board !== row.board) return false;
      if (!within(k.openDate, row.openDate, 1) || !within(k.closeDate, row.closeDate, 1))
        return false;
      const official = new Set(nameTokens(k.companyName));
      if (tokens.every((t) => official.has(t))) return true;
      // "R.K.Fashion" vs "R.K. Fashion": compare with the spaces removed too.
      return nameTokens(k.companyName).join('').startsWith(tokens.join(''));
    })
    .map((k) => k.id);
  if (ids.length === 1 && ids[0] !== undefined) return { kind: 'matched', id: ids[0] };
  return ids.length > 1 ? { kind: 'ambiguous', ids } : { kind: 'unmatched' };
}

/** What a new-listings row tells us about which issue just listed. */
export interface ListingIdentity {
  readonly companyName: string;
  /** A ticker that may equal the NSE symbol of a dual-listed issue. */
  readonly ticker: string | null;
  readonly isin: string | null;
  readonly listingDate: string;
}

/**
 * Match a new listing to the issue that just finished bidding. ISIN wins when
 * both sides have it; otherwise the name (or the ticker against the NSE
 * symbol) must agree AND the issue must have closed within the 15 days before
 * listing — so a symbol reused years apart can never be confused.
 */
export function matchListing(row: ListingIdentity, known: readonly IssueIdentity[]): GmpMatch {
  if (row.isin !== null) {
    const byIsin = known.filter((k) => k.isin === row.isin).map((k) => k.id);
    if (byIsin.length === 1 && byIsin[0] !== undefined) return { kind: 'matched', id: byIsin[0] };
  }
  const name = normalisedName(row.companyName);
  const ids = known
    .filter((k) => {
      if (k.closeDate === null) return false;
      const gap = daysBetween(k.closeDate, row.listingDate);
      if (gap < 0 || gap > 15) return false;
      return (
        (name !== '' && normalisedName(k.companyName) === name) ||
        (row.ticker !== null && k.nseSymbol === row.ticker)
      );
    })
    .map((k) => k.id);
  if (ids.length === 1 && ids[0] !== undefined) return { kind: 'matched', id: ids[0] };
  return ids.length > 1 ? { kind: 'ambiguous', ids } : { kind: 'unmatched' };
}

/** How long after a DRHP filing an issue may open and still be that filing's (SEBI: 12 months, plus extensions). */
const FILING_HORIZON_DAYS = 550;

/**
 * The issue a SEBI filing belongs to, for DISPLAY only: exactly one issue with
 * the same normalised name that has not opened before the filing, or opened
 * within the horizon after it. Anything less certain links nothing — a filing
 * is shown on its own rather than on the wrong issue.
 */
export function matchFiling(
  filing: { readonly companyName: string; readonly filedDate: string },
  identities: readonly Pick<IssueIdentity, 'id' | 'companyName' | 'openDate'>[],
): number | null {
  const name = normalisedName(filing.companyName);
  if (name === '') return null;
  const candidates = identities.filter((issue) => {
    if (normalisedName(issue.companyName) !== name) return false;
    if (issue.openDate === null) return true;
    const days = daysBetween(filing.filedDate, issue.openDate);
    return days >= 0 && days <= FILING_HORIZON_DAYS;
  });
  return candidates.length === 1 ? (candidates[0]?.id ?? null) : null;
}
