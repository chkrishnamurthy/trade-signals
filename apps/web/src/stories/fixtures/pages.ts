import { CATEGORY_LABELS, catalogueFor, INDEX_OPTIONS, METRIC_CATEGORIES } from '@equitywise/core';
import type { ScreenerInitialState } from '@/components/screener/screener-view';
import type { AlertsOverviewDto } from '@/lib/alert-types';
import type {
  AnnouncementDto,
  AnnouncementsPageDto,
  InstitutionalFlowDto,
  StockFlowRowDto,
} from '@/lib/disclosure-types';
import {
  type ConditionCountsDto,
  DEFAULT_COLUMNS,
  type MetricDto,
  type ScreenerMetaDto,
  type ScreenerRowDto,
  type ScreenResultDto,
} from '@/lib/screener-types';
import type { ChartBarDto, StockPageDto } from '@/lib/stock-types';

/**
 * Sample data for the page-level stories (Screener, Stock, Institutional flow,
 * Alerts, Announcements). Names are long and figures are wide on purpose: the
 * stories exist to show that a phone holds them.
 *
 * Prices are integer paise, as everywhere (CLAUDE.md rule 3). Nothing here is
 * market data; the numbers are made up and internally consistent.
 */

// --- Screener ---------------------------------------------------------------

const METRICS: MetricDto[] = catalogueFor(false).map((d) => ({
  key: d.key,
  label: d.label,
  category: d.category,
  unit: d.unit,
  description: d.description,
  decimals: d.decimals ?? null,
  options: d.options ?? null,
}));

export const SCREENER_META: ScreenerMetaDto = {
  isAdmin: false,
  metrics: METRICS,
  categories: METRIC_CATEGORIES.filter((c) => METRICS.some((m) => m.category === c)).map((c) => ({
    key: c,
    label: CATEGORY_LABELS[c],
  })),
  presets: [
    {
      id: 'momentum',
      group: 'Momentum',
      label: 'Momentum leaders',
      description: 'Up over a month, strong against the market, on above-average volume.',
      filter: { op: 'and', children: [{ metric: 'ret1m', cmp: 'gt', value: 8 }] },
      sort: 'ret1m:desc',
    },
    {
      id: 'delivery-spike',
      group: 'Delivery',
      label: 'Delivery spikes',
      description: 'Delivery percentage well above its own recent average.',
      filter: { op: 'and', children: [{ metric: 'deliveryPct', cmp: 'gt', value: 60 }] },
      sort: 'deliveryPct:desc',
    },
  ],
  industries: ['Banks', 'Information Technology', 'Automobiles', 'Consumer Staples'],
  sessions: ['2026-11-16', '2026-11-13'],
  latest: { tradingDate: '2026-11-16', builtAt: '2026-11-16T13:55:00.000Z' },
  watchlists: [
    { id: 1, name: 'My Watchlist' },
    { id: 2, name: 'Swing' },
  ],
  indices: INDEX_OPTIONS,
  defaultColumns: DEFAULT_COLUMNS,
};

function screenerRow(
  instrumentId: number,
  symbol: string,
  name: string,
  close: number,
  changePct: number,
  ret1m: number,
  rsRank: number,
  relVolume: number,
  deliveryPct: number,
): ScreenerRowDto {
  return {
    instrumentId,
    symbol,
    name,
    values: {
      close,
      changePct,
      ret1m,
      rsRank,
      relVolume,
      deliveryPct,
      rsi14: 48 + rsRank / 4,
      closeVsEma200: ret1m / 2,
      oiBuildup: null,
      promoterChgQoq: null,
    },
    spark: Array.from({ length: 60 }, (_, i) =>
      Math.round(close * (0.9 + (i / 60) * 0.1 + Math.sin(i / 5) * 0.01)),
    ),
    dataIssue: null,
  };
}

const SCREENER_ROWS: ScreenerRowDto[] = [
  screenerRow(1, 'LICHSGFIN', 'LIC Housing Finance', 61_240, 2.07, 13.2, 85, 2.1, 52.4),
  screenerRow(2, 'MODIS', 'Modis Navnirman', 31_875, 4.96, 9.9, 78, 1.3, 60.8),
  screenerRow(3, 'HDFCLIFE', 'HDFC Life Insurance Company', 74_310, 2.07, 11.1, 85, 1.5, 48.5),
  screenerRow(4, 'BEARDSELL', 'Beardsell Limited', 2_781, 7.29, 23.1, 84, 4.5, 89.0),
  screenerRow(5, 'THOMASCOOK', 'Thomas Cook (India) Limited', 11_098, 1.01, 9.8, 73, 1.8, 47.0),
];

export const SCREENER_RESULT: ScreenResultDto = {
  tradingDate: '2026-11-16',
  builtAt: '2026-11-16T13:55:00.000Z',
  stale: false,
  total: SCREENER_ROWS.length,
  base: 2_186,
  limit: 50,
  offset: 0,
  rows: SCREENER_ROWS,
};

export const SCREENER_COUNTS: ConditionCountsDto = {
  base: 2_186,
  labels: ['1M return above 8%'],
  individual: [SCREENER_ROWS.length],
  cumulative: [SCREENER_ROWS.length],
};

export const SCREENER_INITIAL: ScreenerInitialState = {
  filter: { op: 'and', children: [{ metric: 'ret1m', cmp: 'gt', value: 8 }] },
  presetId: 'momentum',
  universe: 'all',
  sort: 'ret1m:desc',
  columns: [...DEFAULT_COLUMNS],
  asOf: null,
};

// --- Stock page -------------------------------------------------------------

const DAY = 86_400_000;
const FIRST_BAR = Date.UTC(2026, 4, 25);

const BARS: ChartBarDto[] = Array.from({ length: 120 }, (_, i) => {
  const base = 105_000 + i * 90 + Math.round(Math.sin(i / 6) * 2_200);
  return {
    t: FIRST_BAR + i * DAY,
    o: base - 300,
    h: base + 900,
    l: base - 1_100,
    c: base,
    v: 1_800_000 + (i % 7) * 240_000,
  };
});

function ema(period: number): (number | null)[] {
  const k = 2 / (period + 1);
  let value: number | null = null;
  return BARS.map((bar, i) => {
    if (i < period - 1) return null;
    value = value === null ? bar.c : Math.round(bar.c * k + value * (1 - k));
    return value;
  });
}

const LAST_CLOSE = BARS[BARS.length - 1]?.c ?? 0;

export const STOCK_PAGE: StockPageDto = {
  symbol: 'TATACONSUM',
  name: 'Tata Consumer Products Limited',
  isin: 'INE192A01025',
  series: 'EQ',
  industry: 'Consumer Staples',
  indexLabels: ['Nifty 50', 'Nifty 500', 'Nifty FMCG'],
  indices: [
    { key: 'nifty50', label: 'Nifty 50' },
    { key: 'nifty500', label: 'Nifty 500' },
  ],
  listingDate: '1998-11-04',
  faceValuePaise: 100,
  industrySource: 'NSE index list',
  ratioKeys: ['changePct', 'ret1m', 'rsi14', 'deliveryPct', 'relVolume', 'closeVsEma200'],
  ratioSaved: false,
  ratioExtras: [],
  keyPoints: [
    {
      id: 'delivery',
      text: 'Delivery was 61.2% of traded volume, against a 20-session average of 44.8%.',
      tone: 'info',
      metric: 'deliveryPct',
      tab: 'delivery',
    },
    {
      id: 'ema200',
      text: 'The close is 3.1% above the 200-day EMA.',
      tone: 'bullish',
      metric: 'closeVsEma200',
      tab: 'technicals',
    },
  ],
  dividends: [{ exDate: '2026-05-29', kind: 'final', amountPaise: 825 }],
  session: '2026-11-16',
  stale: false,
  values: {
    close: LAST_CLOSE,
    changePct: 2.96,
    ret1m: 6.4,
    rsi14: 58.2,
    deliveryPct: 61.2,
    relVolume: 1.6,
    closeVsEma200: 3.1,
    rsRank: 71,
  },
  metrics: METRICS,
  bars: BARS,
  ema20: ema(20),
  ema50: ema(50),
  corporateActions: [{ exDate: '2026-05-29', kind: 'dividend', ratio: '₹8.25', note: null }],
  delivery: BARS.slice(-20).map((bar, i) => ({
    date: new Date(bar.t).toISOString().slice(0, 10),
    pct: 40 + (i % 6) * 4,
    qty: Math.round(bar.v * 0.45),
  })),
  deals: [
    {
      date: '2026-11-12',
      type: 'bulk',
      client: 'A Long-Named Institutional Investor Fund (Mauritius) Limited',
      side: 'buy',
      quantity: 1_250_000,
      price: 112_400,
    },
  ],
  oi: [
    {
      date: '2026-11-16',
      oi: 18_400_000,
      change: 4.2,
      buildup: 'long_buildup',
      futuresClose: LAST_CLOSE + 350,
    },
    {
      date: '2026-11-13',
      oi: 17_650_000,
      change: -1.1,
      buildup: 'long_unwinding',
      futuresClose: LAST_CLOSE - 2_800,
    },
  ],
  shareholding: [
    { asOf: '2026-09-30', promoter: 33.84, public: 66.16 },
    { asOf: '2026-06-30', promoter: 33.84, public: 66.16 },
  ],
  announcements: [
    {
      id: 1,
      at: '2026-11-10T11:30:00.000Z',
      headline: 'Outcome of board meeting: unaudited financial results for the quarter',
      category: 'Results',
      url: null,
    },
  ],
  events: [{ date: '2026-11-28', type: 'result', title: 'Board meeting to consider results' }],
  peers: [
    {
      symbol: 'HINDUNILVR',
      name: 'Hindustan Unilever',
      close: 236_450,
      changePct: 0.31,
      ret3m: -4.2,
      rsRank: 38,
    },
    {
      symbol: 'NESTLEIND',
      name: 'Nestle India',
      close: 241_200,
      changePct: -0.6,
      ret3m: 2.4,
      rsRank: 55,
    },
    {
      symbol: 'BRITANNIA',
      name: 'Britannia Industries',
      close: 512_300,
      changePct: 1.2,
      ret3m: 7.9,
      rsRank: 67,
    },
  ],
  levels: [
    { label: '52-week high', paise: 124_800, note: null },
    { label: '200-day EMA', paise: Math.round(LAST_CLOSE / 1.031), note: 'Close is above' },
    { label: '52-week low', paise: 88_200, note: null },
  ],
  match: null,
};

// --- Institutional flow -----------------------------------------------------

const CRORE = 10_000_000 * 100;

function flowRow(
  instrumentId: number,
  symbol: string,
  companyName: string,
  close: number,
  changePercent: number,
  deliveryPercent: number,
  score: number,
): StockFlowRowDto {
  return {
    instrumentId,
    symbol,
    companyName,
    onWatchlist: instrumentId % 2 === 1,
    inFno: true,
    delivery: {
      tradingDate: '2026-11-16',
      percent: deliveryPercent,
      trailingPercent: deliveryPercent - 12,
      trailingSessions: 20,
      delta: 12,
    },
    price: {
      tradingDate: '2026-11-16',
      close,
      change: Math.round((close * changePercent) / 100),
      changePercent,
    },
    volume: { tradedQty: 4_800_000, ratio: 1.8 },
    oi: {
      tradingDate: '2026-11-13',
      futuresOi: 21_400_000,
      changePercent: 6.4,
      buildup: changePercent >= 0 ? 'long_buildup' : 'short_buildup',
    },
    deals: { netPaise: 84 * CRORE, count: 2, latestDate: '2026-11-12' },
    attention: {
      score,
      factors: [
        {
          id: 'delivery',
          label: 'Delivery',
          reading: `${deliveryPercent.toFixed(1)}% vs ${(deliveryPercent - 12).toFixed(1)}% average`,
          contribution: Math.round(score * 0.5),
          tone: 'positive',
        },
        {
          id: 'oi',
          label: 'Open interest',
          reading: '+6.4% with price up',
          contribution: Math.round(score * 0.3),
          tone: 'neutral',
        },
        {
          id: 'deals',
          label: 'Deals',
          reading: '2 deals, ₹84 Cr net',
          contribution: Math.round(score * 0.2),
          tone: 'positive',
        },
      ],
    },
  };
}

const NETS = [-1_240, 860, -2_310, 1_540, -420, 2_180, -960, 730, -1_880, 1_120];

export const FLOW_PAGE: InstitutionalFlowDto = {
  tape: {
    fiiCash: {
      tradingDate: '2026-11-16',
      net: -1_240 * CRORE,
      sum5: -3_870 * CRORE,
      sum20: 6_420 * CRORE,
      series: NETS.map((n) => n * CRORE),
    },
    diiCash: {
      tradingDate: '2026-11-16',
      net: 1_985 * CRORE,
      sum5: 7_310 * CRORE,
      sum20: 18_940 * CRORE,
      series: NETS.map((n) => -n * CRORE),
    },
    fiiIndexFutures: {
      tradingDate: '2026-11-13',
      longContracts: 62_400,
      shortContracts: 148_900,
      net: -86_500,
      netChange: -4_200,
      longPercent: 29.5,
      series: NETS.map((n) => n * 40),
    },
    participantOi: [
      {
        participant: 'fii',
        bucket: 'index_fut',
        longContracts: 62_400,
        shortContracts: 148_900,
        netChange: -4_200,
      },
      {
        participant: 'dii',
        bucket: 'index_fut',
        longContracts: 91_300,
        shortContracts: 12_800,
        netChange: 1_150,
      },
      {
        participant: 'client',
        bucket: 'index_fut',
        longContracts: 212_700,
        shortContracts: 168_400,
        netChange: 2_900,
      },
    ],
    participantOiDate: '2026-11-13',
    fiiDii: NETS.map((n, i) => ({
      tradingDate: `2026-11-${String(16 - i).padStart(2, '0')}`,
      fii: { buy: 12_400 * CRORE, sell: (12_400 - n) * CRORE, net: n * CRORE },
      dii: { buy: 11_200 * CRORE, sell: (11_200 + n) * CRORE, net: -n * CRORE },
    })),
  },
  stocks: [
    flowRow(1, 'JIOFIN', 'Jio Financial Services', 22_600, -0.66, 58.4, 82),
    flowRow(2, 'TMPV', 'Tata Motors Passenger Vehicles', 26_240, -8.7, 71.2, 77),
    flowRow(3, 'HDFCBANK', 'HDFC Bank', 81_650, 0.84, 63.9, 64),
    flowRow(4, 'APOLLOHOSP', 'Apollo Hospitals Enterprise', 877_100, 2.31, 55.1, 51),
  ],
  stocksAsOf: '2026-11-16',
  oiAsOf: '2026-11-13',
  deals: [
    {
      id: 1,
      dealType: 'bulk',
      tradingDate: '2026-11-12',
      instrumentId: 1,
      symbol: 'JIOFIN',
      companyName: 'Jio Financial Services',
      clientName: 'A Long-Named Institutional Investor Fund (Mauritius) Limited',
      side: 'buy',
      quantity: 3_700_000,
      price: 22_710,
      value: 3_700_000 * 22_710,
      exchange: 'NSE',
      onWatchlist: true,
    },
    {
      id: 2,
      dealType: 'block',
      tradingDate: '2026-11-11',
      instrumentId: 3,
      symbol: 'HDFCBANK',
      companyName: 'HDFC Bank',
      clientName: 'Sovereign Wealth Holdings Pte',
      side: 'sell',
      quantity: 1_200_000,
      price: 80_950,
      value: 1_200_000 * 80_950,
      exchange: 'NSE',
      onWatchlist: false,
    },
  ],
  shareholding: [
    {
      instrumentId: 3,
      symbol: 'HDFCBANK',
      companyName: 'HDFC Bank',
      asOfDate: '2026-09-30',
      promoterPercent: 0,
      fiiPercent: 48.3,
      diiPercent: 34.9,
      publicPercent: 16.8,
      promoterChange: 0,
      fiiChange: -1.2,
      diiChange: 1.4,
      publicChange: -0.2,
      previousAsOfDate: '2026-06-30',
    },
  ],
  feeds: [
    {
      id: 'fii-dii',
      label: 'FII/DII cash',
      status: 'fresh',
      asOf: '2026-11-16',
      lastAttemptAt: '2026-11-16T13:40:00.000Z',
      error: null,
    },
    {
      id: 'participant-oi',
      label: 'Participant OI',
      status: 'stale',
      asOf: '2026-11-13',
      lastAttemptAt: '2026-11-16T13:42:00.000Z',
      error: null,
    },
    {
      id: 'deals',
      label: 'Bulk & block deals',
      status: 'fresh',
      asOf: '2026-11-12',
      lastAttemptAt: '2026-11-16T13:45:00.000Z',
      error: null,
    },
  ],
  watchlistOnly: false,
  hasWatchlists: true,
  disclaimer: 'Official exchange disclosures. Figures are as published by the exchanges.',
};

// --- Alerts -----------------------------------------------------------------

export const ALERTS_OVERVIEW: AlertsOverviewDto = {
  alerts: [
    {
      id: 1,
      symbol: 'TATACONSUM',
      name: 'Tata Consumer Products Limited',
      metric: 'close',
      comparator: 'crosses_above',
      threshold: 115_000,
      enabled: true,
      oneShot: false,
      createdAt: '2026-11-02T09:00:00.000Z',
      lastTriggeredAt: null,
    },
    {
      id: 2,
      symbol: 'HDFCBANK',
      name: 'HDFC Bank',
      metric: 'rsi14',
      comparator: 'crosses_below',
      threshold: 30,
      enabled: true,
      oneShot: true,
      createdAt: '2026-10-21T09:00:00.000Z',
      lastTriggeredAt: '2026-11-13T12:30:00.000Z',
    },
    {
      id: 3,
      symbol: 'TMPV',
      name: 'Tata Motors Passenger Vehicles',
      metric: 'close',
      comparator: 'crosses_below',
      threshold: 27_000,
      enabled: false,
      oneShot: false,
      createdAt: '2026-10-05T09:00:00.000Z',
      lastTriggeredAt: '2026-11-16T12:30:00.000Z',
    },
  ],
  events: [
    {
      id: 11,
      alertId: 3,
      symbol: 'TMPV',
      tradingDate: '2026-11-16',
      message: 'TMPV closed at ₹262.40, below ₹270.00.',
      triggeredAt: '2026-11-16T12:30:00.000Z',
      acknowledged: false,
    },
    {
      id: 12,
      alertId: 2,
      symbol: 'HDFCBANK',
      tradingDate: '2026-11-13',
      message: 'HDFCBANK RSI (14) closed at 28.6, below 30.',
      triggeredAt: '2026-11-13T12:30:00.000Z',
      acknowledged: true,
    },
  ],
  unacknowledged: 1,
  limit: 50,
};

// --- Announcements ----------------------------------------------------------

function announcement(
  id: number,
  symbol: string,
  companyName: string,
  category: string,
  headline: string,
  announcedAt: string,
  onWatchlist: boolean,
): AnnouncementDto {
  return {
    interpretation: null,
    interpretationChecksum: null,
    externalId: `story-${id}`,
    ingestedAt: announcedAt,
    watchlistNames: onWatchlist ? ['My Watchlist'] : [],
    userState: { read: id % 2 === 0, saved: false, dismissed: false, issueReported: false },
    id,
    instrumentId: id,
    symbol,
    companyName,
    category,
    headline,
    detail:
      'The company has informed the exchange of the above. The full text is in the attached filing.',
    attachmentUrl: null,
    announcedAt,
    source: 'BSE',
    onWatchlist,
  };
}

export const ANNOUNCEMENTS_PAGE: AnnouncementsPageDto = {
  coverage: {
    latestAttempt: '2026-11-16T13:50:00.000Z',
    lastSuccess: '2026-11-16T13:50:00.000Z',
    failed: false,
    stale: false,
  },
  personalFilters: {
    state: 'all',
    eventStatus: '',
    normalizedCategory: '',
    source: '',
    hasFacts: false,
  },
  rows: [
    announcement(
      1,
      'TATACONSUM',
      'Tata Consumer Products Limited',
      'Result',
      'Outcome of board meeting: unaudited standalone and consolidated financial results for the quarter and half year ended 30 September 2026',
      '2026-11-16T11:42:00.000Z',
      true,
    ),
    announcement(
      2,
      'HDFCBANK',
      'HDFC Bank',
      'Company Update',
      'Intimation of schedule of analyst and institutional investor meetings',
      '2026-11-16T09:15:00.000Z',
      true,
    ),
    announcement(
      3,
      'BSE:543210',
      'A Company Listed Only On BSE With A Long Registered Name Limited',
      'Board Meeting',
      'Board meeting intimation for considering fund raising',
      '2026-11-15T14:05:00.000Z',
      false,
    ),
  ],
  total: 3,
  page: 1,
  pageSize: 25,
  categories: ['Result', 'Company Update', 'Board Meeting', 'Corp. Action'],
  latestAt: '2026-11-16T11:42:00.000Z',
  status: 'fresh',
  watchlistOnly: false,
  hasWatchlists: true,
  nowIso: '2026-11-16T14:00:00.000Z',
  query: { search: null, symbol: null, range: 'all', highImpactOnly: false, categories: [] },
  disclaimer: 'Official exchange disclosures. Figures are as published by the exchanges.',
};
