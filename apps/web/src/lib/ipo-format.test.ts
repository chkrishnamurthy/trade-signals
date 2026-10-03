import { describe, expect, it } from 'vitest';
import {
  AGENDA_LABEL,
  dateRange,
  dayLabel,
  GMP_SHORT_NOTE,
  gmpText,
  istDayTime,
  longDate,
  nextMilestone,
  SCOPE_LABEL,
  STATUS_LABEL,
  shortDate,
  shortName,
  stateLabel,
  statusParts,
  times,
  trackSpan,
} from './ipo-format';
import type { IpoListItemDto } from './ipo-types';

const item = (over: Partial<IpoListItemDto>): IpoListItemDto => ({
  slug: 's',
  companyName: 'C',
  board: 'mainboard',
  status: 'open',
  closedStage: null,
  exchanges: ['NSE'],
  nseSymbol: null,
  openDate: '2026-09-30',
  closeDate: '2026-10-05',
  listingDate: null,
  expectedListingDate: '2026-10-08',
  upiCutoffAt: null,
  priceBand: null,
  issuePricePaise: null,
  lotSize: null,
  minApplicationLots: 1,
  minInvestmentPaise: null,
  issueSizePaise: null,
  issueSizeBasis: null,
  subscription: null,
  gmp: null,
  listing: null,
  ...over,
});

describe('dates', () => {
  it('formats IST date keys without drifting a day', () => {
    expect(shortDate('2026-10-05')).toBe('Mon 5 Oct');
    expect(longDate('2026-10-05')).toBe('5 Oct 2026');
    expect(dateRange('2026-09-30', '2026-10-05')).toBe('30 Sep – 5 Oct');
    expect(shortDate('2026-09-30')).toBe('Wed 30 Sep');
    expect(dateRange(null, null)).toBe('Dates not announced');
    expect(istDayTime('2026-10-05T11:30:00.000Z')).toBe('5 Oct, 5:00 pm');
    // 18:45 UTC is 00:15 IST the next day.
    expect(istDayTime('2026-10-01T18:45:00.000Z')).toBe('2 Oct, 12:15 am');
  });
});

describe('nextMilestone', () => {
  it('describes each state factually', () => {
    expect(nextMilestone(item({}), '2026-10-05')).toBe('Closes today');
    expect(nextMilestone(item({ status: 'closed' }), '2026-10-06')).toBe(
      'Expected listing Thu 8 Oct',
    );
    expect(nextMilestone(item({ status: 'upcoming', openDate: null }), '2026-10-02')).toBe(
      'Dates not announced',
    );
  });
});

describe('trackSpan', () => {
  it('names the start of GMP coverage while it is shorter than the window', () => {
    expect(trackSpan({ months: 12, since: '2026-10-02' })).toBe('Since Fri 2 Oct');
    expect(trackSpan({ months: 12, since: null })).toBe('Last 12 months');
  });
});

describe('statusParts and stateLabel', () => {
  // Fri 2 Oct 2026.
  const today = '2026-10-02';
  it('says what is happening and when, marking T+3 dates', () => {
    expect(dayLabel('2026-10-02', today)).toBe('today');
    expect(dayLabel('2026-10-03', today)).toBe('tomorrow');
    expect(dayLabel('2026-10-05', today)).toBe('Mon');
    expect(dayLabel('2026-10-12', today)).toBe('12 Oct');
    expect(stateLabel(item({}), today)).toEqual({ label: 'Open · closes Mon', tone: 'open' });
    const awaiting = item({
      status: 'closed',
      closedStage: 'allotment_done',
      expectedListingDate: '2026-10-06',
    });
    expect(statusParts(awaiting, today)).toEqual({
      chip: 'Allotment due',
      note: 'lists Tue 6 Oct*',
      tone: 'waiting',
    });
    expect(stateLabel(awaiting, today).label).toBe('Lists Tue 6 Oct*');
    // An official listing date carries no asterisk.
    expect(
      stateLabel({ ...awaiting, listingDate: '2026-10-06', expectedListingDate: null }, today)
        .label,
    ).toBe('Lists Tue 6 Oct');
    expect(stateLabel(item({ status: 'listed', listingDate: '2026-10-01' }), today)).toEqual({
      label: 'Listed Thu 1 Oct',
      tone: 'listed',
    });
    expect(stateLabel(item({ status: 'listed', listingDate: today }), today)).toEqual({
      label: 'Listing today',
      tone: 'info',
    });
    expect(
      statusParts(item({ status: 'closed', closedStage: 'listing_unconfirmed' }), today),
    ).toEqual({ chip: 'Not listed on NSE', note: null, tone: 'inactive' });
    expect(stateLabel(item({ status: 'upcoming', openDate: null }), today).label).toBe(
      'Dates not announced',
    );
  });
});

describe('shortName', () => {
  it('drops a trailing Limited and nothing else', () => {
    expect(shortName('Vishal Nirmiti Limited')).toBe('Vishal Nirmiti');
    expect(shortName('SRIT INDIA LIMITED')).toBe('SRIT INDIA');
    expect(shortName('Orient Cables (India) Ltd.')).toBe('Orient Cables (India)');
    expect(shortName('Limited Brands India')).toBe('Limited Brands India');
  });
});

describe('numbers', () => {
  it('times and GMP text', () => {
    expect(times(0.5707851)).toBe('0.57×');
    expect(times(152.4)).toBe('152×');
    expect(times(null)).toBe('—');
    expect(gmpText({ latestPaise: 2_000, percentOfUpperBand: 9.0909 })).toBe('₹20 (+9.09%)');
    expect(gmpText({ latestPaise: -500, percentOfUpperBand: -1.639 })).toBe('−₹5 (−1.64%)');
    expect(gmpText({ latestPaise: 1_350, percentOfUpperBand: null })).toBe('₹13.5');
    expect(gmpText({ latestPaise: null, percentOfUpperBand: null })).toBe('No quote');
  });
});

describe('copy rules (plan §10.3, §11)', () => {
  it('never uses order-shaped or promotional words', () => {
    const copy = [
      ...Object.values(STATUS_LABEL),
      ...Object.values(AGENDA_LABEL),
      ...Object.values(SCOPE_LABEL),
      GMP_SHORT_NOTE,
      statusParts(item({ status: 'closed', closedStage: 'listing_pending' }), '2026-10-02').chip,
      nextMilestone(item({ status: 'listed', listingDate: '2026-10-01' }), '2026-10-02'),
      ...(['open', 'upcoming', 'closed', 'listed', 'withdrawn', 'postponed'] as const).flatMap(
        (status) => {
          const parts = statusParts(item({ status }), '2026-10-02');
          return [parts.chip, parts.note ?? '', stateLabel(item({ status }), '2026-10-02').label];
        },
      ),
    ].join(' | ');
    expect(copy).not.toMatch(
      /\b(apply|subscribe now|recommend|avoid|hot|target|buy|sell|expected gain|estimated listing)\b/i,
    );
    expect(GMP_SHORT_NOTE).toMatch(/unofficial/i);
    expect(GMP_SHORT_NOTE).toMatch(/not a forecast/i);
  });
});
