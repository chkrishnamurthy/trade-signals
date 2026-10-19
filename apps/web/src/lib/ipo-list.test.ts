import { describe, expect, it } from 'vitest';
import {
  csvRupees,
  initials,
  ipoListCsv,
  listingDay,
} from '@/components/ipos/list/ipo-list-columns';
import {
  countByStatus,
  DEMAND_BAR_ONE_TIMES,
  demandBarPercent,
  listingMonths,
  listingStats,
  median,
  sortListItems,
} from './ipo-list';
import type { IpoListItemDto, ListingSummaryDto } from './ipo-types';

const item = (over: Partial<IpoListItemDto> & Pick<IpoListItemDto, 'slug'>): IpoListItemDto => ({
  companyName: over.slug.toUpperCase(),
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

const listing = (gain: number | null, since: number | null): ListingSummaryDto => ({
  exchange: 'NSE',
  listingDate: '2026-10-01',
  issuePricePaise: 10_000,
  listingOpenPaise: 11_000,
  listingGainPercent: gain,
  listingClosePaise: 11_000,
  listingDayChangePercent: null,
  latestClosePaise: since === null ? null : 11_000,
  latestCloseDate: since === null ? null : '2026-10-01',
  sinceIssuePercent: since,
});

const subscribed = (totalTimes: number) => ({
  scope: 'consolidated' as const,
  asOf: '2026-10-01T11:30:00.000Z',
  totalTimes,
  retailTimes: null,
});

// Today is Fri 2 Oct 2026 in every case below.
const OPEN_LATE = item({ slug: 'open-late', closeDate: '2026-10-06' });
const OPEN_SOON = item({
  slug: 'open-soon',
  closeDate: '2026-10-05',
  upiCutoffAt: '2026-10-05T11:30:00.000Z',
});
const OPEN_SOON_2 = item({ slug: 'open-soon-2', closeDate: '2026-10-05' });
const WAITING = item({
  slug: 'waiting',
  status: 'closed',
  closedStage: 'allotment_done',
  closeDate: '2026-09-29',
  expectedListingDate: '2026-10-05',
});
const UNCONFIRMED = item({
  slug: 'unconfirmed',
  status: 'closed',
  closedStage: 'listing_unconfirmed',
  closeDate: '2026-08-01',
  expectedListingDate: null,
});
const UPCOMING = item({ slug: 'upcoming', status: 'upcoming', openDate: '2026-10-07' });
const UNDATED = item({ slug: 'undated', status: 'upcoming', openDate: null, closeDate: null });
const LISTED_OLD = item({
  slug: 'listed-old',
  status: 'listed',
  listingDate: '2026-09-18',
  listing: listing(4.7, 19.3),
});
const LISTED_NEW = item({
  slug: 'listed-new',
  status: 'listed',
  listingDate: '2026-10-01',
  listing: listing(-8.4, -11.2),
});
const WITHDRAWN = item({ slug: 'withdrawn', status: 'withdrawn' });

const ALL = [
  LISTED_OLD,
  WITHDRAWN,
  UNDATED,
  OPEN_LATE,
  UNCONFIRMED,
  LISTED_NEW,
  UPCOMING,
  WAITING,
  OPEN_SOON_2,
  OPEN_SOON,
];

const slugs = (rows: readonly IpoListItemDto[]) => rows.map((r) => r.slug);

describe('sortListItems', () => {
  it('orders by stage: open by close, waiting by listing, upcoming by opening, listed newest first', () => {
    expect(slugs(sortListItems(ALL, { key: 'stage', dir: 'asc' }))).toEqual([
      'open-soon',
      'open-soon-2',
      'open-late',
      'waiting',
      'unconfirmed',
      'upcoming',
      'undated',
      'listed-new',
      'listed-old',
      'withdrawn',
    ]);
  });

  it('sinks a missing value in both directions and breaks ties by name', () => {
    const rows = [
      item({ slug: 'b', subscription: subscribed(2) }),
      item({ slug: 'none' }),
      item({ slug: 'a', subscription: subscribed(2) }),
      item({ slug: 'c', subscription: subscribed(40) }),
    ];
    expect(slugs(sortListItems(rows, { key: 'demand', dir: 'desc' }))).toEqual([
      'c',
      'a',
      'b',
      'none',
    ]);
    expect(slugs(sortListItems(rows, { key: 'demand', dir: 'asc' }))).toEqual([
      'a',
      'b',
      'c',
      'none',
    ]);
  });

  it('sorts by listing gains and by company name', () => {
    expect(
      slugs(sortListItems([LISTED_NEW, OPEN_SOON, LISTED_OLD], { key: 'day1', dir: 'desc' })),
    ).toEqual(['listed-old', 'listed-new', 'open-soon']);
    expect(
      slugs(sortListItems([OPEN_SOON, LISTED_NEW, WAITING], { key: 'company', dir: 'asc' })),
    ).toEqual(['listed-new', 'open-soon', 'waiting']);
  });

  it('ignores a GMP with no amount when sorting by GMP', () => {
    const gmp = (latestPaise: number | null, percentOfUpperBand: number | null) => ({
      official: false as const,
      latestPaise,
      percentOfUpperBand,
      observedAt: '2026-10-02T01:32:00.000Z',
      sourceName: 'InvestorGain',
      sourceUrl: 'https://www.investorgain.com/',
      stale: false,
    });
    const rows = [
      item({ slug: 'blank', gmp: gmp(null, null) }),
      item({ slug: 'low', gmp: gmp(200, 2.1) }),
      item({ slug: 'high', gmp: gmp(2_000, 9.09) }),
    ];
    expect(slugs(sortListItems(rows, { key: 'gmp', dir: 'desc' }))).toEqual([
      'high',
      'low',
      'blank',
    ]);
  });
});

describe('countByStatus', () => {
  it('counts rows per status', () => {
    expect(countByStatus(ALL)).toEqual({
      open: 3,
      closed: 2,
      upcoming: 2,
      listed: 2,
      withdrawn: 1,
      postponed: 0,
    });
  });
});

describe('demandBarPercent', () => {
  it('puts 1× a third of the way along a 0.1×–100× log scale', () => {
    expect(demandBarPercent(1)).toBeCloseTo(DEMAND_BAR_ONE_TIMES);
    expect(demandBarPercent(10)).toBeCloseTo(200 / 3);
    expect(demandBarPercent(100)).toBe(100);
    expect(demandBarPercent(500)).toBe(100);
    expect(demandBarPercent(0.01)).toBe(2);
    expect(demandBarPercent(0)).toBe(0);
  });
});

describe('board table helpers', () => {
  it('writes paise as plain rupees without a float', () => {
    expect(csvRupees(1_496_000)).toBe('14960.00');
    expect(csvRupees(-500)).toBe('-5.00');
    expect(csvRupees(7)).toBe('0.07');
    expect(csvRupees(null)).toBe('');
  });

  it('marks an expected listing day and makes issuer initials', () => {
    expect(listingDay(OPEN_SOON)).toBe('8 Oct*');
    expect(listingDay(LISTED_NEW)).toBe('1 Oct');
    expect(listingDay(UNDATED)).toBe('8 Oct*');
    expect(initials('Vishal Nirmiti Limited')).toBe('VN');
    expect(initials('Orient Cables (India) Ltd')).toBe('OC');
    expect(initials('R.K. Fashion Accessories Limited')).toBe('RK');
  });

  it('exports the visible columns, quoting text that needs it', () => {
    const row = item({
      slug: 'vnl',
      companyName: 'Vishal Nirmiti, Ltd',
      nseSymbol: 'VNL',
      priceBand: { lowPaise: 20_800, highPaise: 22_000 },
      subscription: subscribed(0.5708),
    });
    expect(ipoListCsv([row], ['company', 'band', 'demand'], '2026-10-02')).toBe(
      'Company,Symbol,Price band low (₹),Price band high (₹),Subscribed (times),Subscription as of\r\n' +
        '"Vishal Nirmiti, Ltd",VNL,208.00,220.00,0.57,2026-10-01T11:30:00.000Z\r\n',
    );
  });
});

describe('listing outcomes', () => {
  const listed = (slug: string, listingDate: string, gain: number | null, since: number | null) =>
    item({ slug, status: 'listed', listingDate, listing: listing(gain, since) });

  it('takes the middle value, averaging the middle two', () => {
    expect(median([])).toBeNull();
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
  });

  it('counts only priced listings in the denominators', () => {
    const stats = listingStats([
      listed('a', '2026-10-01', 12, 5),
      listed('b', '2026-09-20', -4, -10),
      listed('c', '2026-09-10', 30, null),
      item({ slug: 'unpriced', status: 'listed', listingDate: '2026-09-05' }),
    ]);
    expect(stats).toEqual({
      listed: 4,
      withListingPrice: 3,
      openedAbove: 2,
      withLatestClose: 2,
      latestAbove: 1,
      medianListingGain: 12,
      medianSinceIssue: -2.5,
    });
  });

  it('groups listings by month, newest month first', () => {
    const months = listingMonths([
      listed('a', '2026-09-30', 10, null),
      listed('b', '2026-10-01', -2, null),
      listed('c', '2026-09-02', 6, null),
      item({ slug: 'no-date', status: 'listed', listingDate: null }),
    ]);
    expect(months).toEqual([
      { month: '2026-10', listed: 1, withListingPrice: 1, openedAbove: 0, medianListingGain: -2 },
      { month: '2026-09', listed: 2, withListingPrice: 2, openedAbove: 2, medianListingGain: 8 },
    ]);
  });
});
