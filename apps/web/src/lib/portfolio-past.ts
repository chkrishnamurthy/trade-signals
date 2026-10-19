import {
  type DailyCloseInput,
  type PastSeries,
  pastSeries,
  type ShareChange,
  yearBefore,
} from '@equitywise/core';
import type { PortfolioHoldingDto } from './portfolio-types';

/**
 * The shares held now, valued at each of the last twelve months' closes. Used
 * when the user's own record is too short to draw: always labelled as past
 * prices of today's shares, never as the user's own history.
 */
export function pastOfHoldings(input: {
  readonly holdings: readonly PortfolioHoldingDto[];
  readonly changes: readonly ShareChange[];
  readonly closes: ReadonlyMap<number, readonly DailyCloseInput[]>;
  readonly today: string;
}): PastSeries {
  return pastSeries({
    held: input.holdings
      .filter((h) => h.valuePaise !== null)
      .map((h) => ({ instrumentId: h.instrumentId, shares: h.shares })),
    changes: input.changes,
    closes: input.closes,
    from: yearBefore(input.today),
    to: input.today,
  });
}

/** True when the user's own record starts at least a year ago, so it can speak for itself. */
export function ownRecordCoversYear(firstDate: string | null, today: string): boolean {
  if (firstDate === null) return false;
  const d = new Date(`${yearBefore(today)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 7);
  return firstDate <= d.toISOString().slice(0, 10);
}
