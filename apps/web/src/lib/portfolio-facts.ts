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
  large: 'Large cap',
  mid: 'Mid cap',
  small: 'Small cap',
  micro: 'Micro cap',
  other: 'Not categorised',
};

export const UNCLASSIFIED_SECTOR = 'Not classified';

/** Sectors past the largest few are drawn as one group, so colours stay distinct. */
export const OTHER_SECTORS = 'Other sectors';

/** The most sector groups a chart draws, "Other sectors" included. */
export const MAX_SECTOR_GROUPS = 8;

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

/**
 * A dividend estimate on today's share count, or null when the amount is unknown or
 * a bonus or split changes the share count before the ex-date.
 */
export function dividendEstimatePaise(event: UpcomingEventDto): number | null {
  if (event.dividendPaise === null || event.shareChangeBefore !== null) return null;
  return event.dividendPaise * event.shares;
}

/** How many upcoming events "Worth a look" names before pointing to "Coming up". */
export const EVENTS_IN_FACTS = 3;

function eventFact(e: UpcomingEventDto): string | null {
  if (e.eventType === 'dividend') {
    const est = dividendEstimatePaise(e);
    if (e.dividendPaise !== null && est !== null) {
      return `${e.name} goes ex-dividend on ${shortDate(e.eventDate)}: ${formatPaise(e.dividendPaise)} a share, about ${formatPaise(est, { decimals: 0 })} on your ${e.shares.toLocaleString('en-IN')} shares.`;
    }
    if (e.dividendPaise !== null && e.shareChangeBefore !== null) {
      return `${e.name} goes ex-dividend on ${shortDate(e.eventDate)}: ${formatPaise(e.dividendPaise)} a share. Your share count changes with the ${e.shareChangeBefore.kind === 'bonus' ? 'bonus' : 'split'} on ${shortDate(e.shareChangeBefore.date)} first, so no total is estimated.`;
    }
    return `${e.name} goes ex-dividend on ${shortDate(e.eventDate)}.`;
  }
  if (e.eventType === 'bonus' || e.eventType === 'stock_split') {
    return `${e.name} has a ${e.eventType === 'bonus' ? 'bonus' : 'split'} with ex-date ${shortDate(e.eventDate)}. Your share count is adjusted for you once it is on record.`;
  }
  if (e.eventType === 'result' || e.eventType === 'board_meeting') {
    return `${e.name}: ${eventLabel(e.eventType).toLowerCase()} on ${shortDate(e.eventDate)}.`;
  }
  return null;
}

/**
 * The facts, most important first: anything left out of the figures, then where
 * the money is concentrated, then what is coming up (a few; the rest are in the
 * "Coming up" list).
 */
export function attentionFacts(input: {
  holdings: readonly AnalysisHoldingDto[];
  sectors: readonly WeightGroupDto[];
  upcoming: readonly UpcomingEventDto[];
  unpriced: number;
}): string[] {
  const out: string[] = [];
  if (input.unpriced > 0) {
    out.push(
      `${input.unpriced} ${input.unpriced === 1 ? 'holding has' : 'holdings have'} no price yet and ${input.unpriced === 1 ? 'is' : 'are'} left out of these figures.`,
    );
  }
  const top = [...input.holdings].sort((a, b) => b.weight - a.weight)[0];
  if (top !== undefined && input.holdings.length >= 2) {
    out.push(`${top.name} is ${pct(top.weight)} of your value, your largest holding.`);
  }
  const [largest] = input.sectors;
  if (largest !== undefined && input.sectors.length >= 2) {
    if (largest.key === UNCLASSIFIED_SECTOR) {
      const classified = input.sectors.find(
        (s) => s.key !== UNCLASSIFIED_SECTOR && s.key !== OTHER_SECTORS,
      );
      out.push(
        `${pct(largest.weight)} of your value is in stocks NSE has not classified by sector${classified === undefined ? '' : `; the largest classified sector is ${classified.label} at ${pct(classified.weight)}`}.`,
      );
    } else if (largest.key !== OTHER_SECTORS) {
      out.push(
        `${largest.label} is your largest sector at ${pct(largest.weight)}, across ${largest.count} ${largest.count === 1 ? 'holding' : 'holdings'}.`,
      );
    }
  }
  const below = input.holdings.filter((h) => (h.gainRatio ?? 0) < 0);
  if (below.length > 0) {
    const worst = [...below].sort((a, b) => (a.gainRatio ?? 0) - (b.gainRatio ?? 0))[0];
    out.push(
      `${below.length} of ${input.holdings.length} ${input.holdings.length === 1 ? 'holding is' : 'holdings are'} below your average cost${worst?.gainRatio == null ? '' : `; ${worst.name} is the furthest, ${pct(worst.gainRatio)} below`}.`,
    );
  }
  const events = input.upcoming.map(eventFact).filter((f): f is string => f !== null);
  out.push(...events.slice(0, EVENTS_IN_FACTS));
  if (events.length > EVENTS_IN_FACTS) {
    const more = events.length - EVENTS_IN_FACTS;
    out.push(`${more} more ${more === 1 ? 'event is' : 'events are'} in Upcoming company events.`);
  }
  return out;
}
