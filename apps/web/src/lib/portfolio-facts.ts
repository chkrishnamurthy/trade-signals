import { formatPaise } from '@equitywise/shared';
import type {
  AnalysisHoldingDto,
  CompanySizeKey,
  UpcomingEventDto,
  WeightGroupDto,
} from './portfolio-types';

/**
 * Plain sentences about a user's own portfolio. Each states a fact and stops:
 * no "too much", no "consider", no rating (CLAUDE.md portfolio vocabulary).
 */

export const SIZE_LABEL: Record<CompanySizeKey, string> = {
  large: 'Large (NIFTY 100)',
  mid: 'Mid (Midcap 150)',
  small: 'Small (Smallcap 250)',
  micro: 'Micro (Microcap 250)',
  other: 'Not in these indices',
};

export const UNCLASSIFIED_SECTOR = 'Not classified';

const EVENT_LABEL: Record<string, string> = {
  result: 'Results',
  board_meeting: 'Board meeting',
  dividend: 'Ex-dividend',
  bonus: 'Bonus ex-date',
  stock_split: 'Split ex-date',
  rights_issue: 'Rights issue',
  buyback: 'Buyback',
};

export function eventLabel(type: string): string {
  return EVENT_LABEL[type] ?? 'Event';
}

export const shortDate = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });

const pct = (ratio: number) => `${(Math.abs(ratio) * 100).toFixed(1)}%`;

/** A dividend estimate on today's share count, or null when the amount is unknown. */
export function dividendEstimatePaise(event: UpcomingEventDto): number | null {
  return event.dividendPaise === null ? null : event.dividendPaise * event.shares;
}

export function attentionFacts(input: {
  holdings: readonly AnalysisHoldingDto[];
  sectors: readonly WeightGroupDto[];
  upcoming: readonly UpcomingEventDto[];
  unpriced: number;
  limit?: number;
}): string[] {
  const out: string[] = [];
  const top = [...input.holdings].sort((a, b) => b.weight - a.weight)[0];
  if (top !== undefined && input.holdings.length >= 2) {
    out.push(`${top.name} is ${pct(top.weight)} of your value, your largest holding.`);
  }
  const sector = input.sectors.find((s) => s.key !== UNCLASSIFIED_SECTOR);
  if (sector !== undefined && input.sectors.length >= 2) {
    out.push(
      `${sector.label} is your largest sector at ${pct(sector.weight)}, across ${sector.count} ${sector.count === 1 ? 'holding' : 'holdings'}.`,
    );
  }
  const below = input.holdings.filter((h) => (h.gainRatio ?? 0) < 0);
  if (below.length > 0) {
    const worst = [...below].sort((a, b) => (a.gainRatio ?? 0) - (b.gainRatio ?? 0))[0];
    out.push(
      `${below.length} of ${input.holdings.length} ${input.holdings.length === 1 ? 'holding is' : 'holdings are'} below your average cost${worst?.gainRatio == null ? '' : `; ${worst.name} is the furthest, ${pct(worst.gainRatio)} below`}.`,
    );
  }
  for (const e of input.upcoming) {
    if (e.eventType === 'dividend') {
      const est = dividendEstimatePaise(e);
      out.push(
        est === null || e.dividendPaise === null
          ? `${e.name} goes ex-dividend on ${shortDate(e.eventDate)}.`
          : `${e.name} goes ex-dividend on ${shortDate(e.eventDate)}: ${formatPaise(e.dividendPaise)} a share, about ${formatPaise(est, { decimals: 0 })} on your ${e.shares.toLocaleString('en-IN')} shares.`,
      );
    } else if (e.eventType === 'bonus' || e.eventType === 'stock_split') {
      out.push(
        `${e.name} has a ${e.eventType === 'bonus' ? 'bonus' : 'split'} with ex-date ${shortDate(e.eventDate)}. Your share count is adjusted for you once it is on record.`,
      );
    } else if (e.eventType === 'result' || e.eventType === 'board_meeting') {
      out.push(`${e.name}: ${eventLabel(e.eventType).toLowerCase()} on ${shortDate(e.eventDate)}.`);
    }
  }
  if (input.unpriced > 0) {
    out.push(
      `${input.unpriced} ${input.unpriced === 1 ? 'holding has' : 'holdings have'} no price yet and ${input.unpriced === 1 ? 'is' : 'are'} left out of these figures.`,
    );
  }
  return out.slice(0, input.limit ?? 7);
}
