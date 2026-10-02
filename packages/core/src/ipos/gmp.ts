/**
 * The grey-market premium track record (plan §7, §10.2).
 *
 * GMP is unofficial and EquityWise never presents it as a forecast. What it
 * CAN show honestly is history: for issues that have listed, how the last GMP
 * before listing compared with what actually happened. The aggregate is a
 * COUNT with the per-issue list behind it — a breakdown, not a score.
 */

export interface GmpTrackRecordInput {
  readonly slug: string;
  readonly companyName: string;
  readonly listingDate: string;
  /** Last GMP before listing, as a % of the upper band. */
  readonly lastGmpPercent: number;
  /** Actual listing-open gain over the issue price, %. */
  readonly listingGainPercent: number;
}

export type GmpOutcome = 'within' | 'gmp_above' | 'gmp_below';

export interface GmpTrackRecordRow extends GmpTrackRecordInput {
  /** listing gain − GMP, in percentage points. */
  readonly differencePoints: number;
  readonly outcome: GmpOutcome;
}

export interface GmpTrackRecord {
  readonly tolerancePoints: number;
  readonly total: number;
  readonly within: number;
  /** GMP promised more than listing delivered. */
  readonly gmpAbove: number;
  /** Listing beat the GMP. */
  readonly gmpBelow: number;
  /** Newest listing first. */
  readonly rows: readonly GmpTrackRecordRow[];
}

export function gmpTrackRecord(
  items: readonly GmpTrackRecordInput[],
  tolerancePoints = 10,
): GmpTrackRecord {
  const rows: GmpTrackRecordRow[] = items
    .filter((i) => Number.isFinite(i.lastGmpPercent) && Number.isFinite(i.listingGainPercent))
    .map((i) => {
      const differencePoints = i.listingGainPercent - i.lastGmpPercent;
      const outcome: GmpOutcome =
        Math.abs(differencePoints) <= tolerancePoints
          ? 'within'
          : differencePoints < 0
            ? 'gmp_above'
            : 'gmp_below';
      return { ...i, differencePoints, outcome };
    })
    .sort((a, b) => b.listingDate.localeCompare(a.listingDate) || a.slug.localeCompare(b.slug));
  return {
    tolerancePoints,
    total: rows.length,
    within: rows.filter((r) => r.outcome === 'within').length,
    gmpAbove: rows.filter((r) => r.outcome === 'gmp_above').length,
    gmpBelow: rows.filter((r) => r.outcome === 'gmp_below').length,
    rows,
  };
}
