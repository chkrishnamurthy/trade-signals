import type {
  GmpChipDto,
  IpoAgendaDayDto,
  IpoDashboardDto,
  IpoDetailDto,
  IpoFeedStatusDto,
  IpoListItemDto,
  IpoListPageDto,
  RhpExtractDto,
  SebiFilingDto,
} from '@/lib/ipo-types';

/**
 * IPO fixtures for stories, built from the real NSE data of 2 Oct 2026
 * (apps/worker/src/sources/ipo/__fixtures__). Money is integer paise like the
 * real DTOs; GMP values are InvestorGain's reported figures that morning.
 */

export const TODAY = '2026-10-02';

const gmp = (
  latestPaise: number | null,
  pct: number | null,
  url: string,
  stale = false,
): GmpChipDto => ({
  official: false,
  latestPaise,
  percentOfUpperBand: pct,
  observedAt: '2026-10-02T01:32:00.000Z',
  sourceName: 'InvestorGain',
  sourceUrl: url,
  stale,
});

const base = (
  over: Partial<IpoListItemDto> & Pick<IpoListItemDto, 'slug' | 'companyName'>,
): IpoListItemDto => ({
  board: 'mainboard',
  status: 'open',
  closedStage: null,
  exchanges: ['NSE'],
  nseSymbol: null,
  openDate: null,
  closeDate: null,
  listingDate: null,
  expectedListingDate: null,
  upiCutoffAt: null,
  priceBand: null,
  issuePricePaise: null,
  lotSize: null,
  minApplicationLots: over.board === 'sme' ? 2 : 1,
  minInvestmentPaise: null,
  issueSizePaise: null,
  issueSizeBasis: null,
  subscription: null,
  gmp: null,
  listing: null,
  ...over,
});

export const VNL = base({
  slug: 'vishal-nirmiti-ipo-2026',
  companyName: 'Vishal Nirmiti Limited',
  nseSymbol: 'VNL',
  openDate: '2026-09-30',
  closeDate: '2026-10-05',
  expectedListingDate: '2026-10-08',
  upiCutoffAt: '2026-10-05T11:30:00.000Z',
  priceBand: { lowPaise: 20_800, highPaise: 22_000 },
  lotSize: 68,
  minInvestmentPaise: 1_496_000,
  issueSizePaise: 178_000_000_000,
  issueSizeBasis: 'derived_at_upper_band',
  subscription: {
    scope: 'consolidated',
    asOf: '2026-10-01T11:30:00.000Z',
    totalTimes: 0.5708,
    retailTimes: 0.4687,
  },
  gmp: gmp(2_000, 9.09, 'https://www.investorgain.com/gmp/vishal-nirmiti-ipo/1602/'),
});

export const NITYAS = base({
  slug: 'nityas-gems-jewellery-ipo-2026',
  companyName: 'Nityas Gems and Jewellery Limited',
  nseSymbol: 'NITYAS',
  openDate: '2026-09-30',
  closeDate: '2026-10-05',
  expectedListingDate: '2026-10-08',
  upiCutoffAt: '2026-10-05T11:30:00.000Z',
  priceBand: { lowPaise: 7_000, highPaise: 7_500 },
  lotSize: 200,
  minInvestmentPaise: 1_500_000,
  issueSizePaise: 108_420_000_000,
  issueSizeBasis: 'derived_at_upper_band',
  subscription: {
    scope: 'consolidated',
    asOf: '2026-10-01T11:30:00.000Z',
    totalTimes: 0.6895,
    retailTimes: 1.3074,
  },
  gmp: gmp(null, null, 'https://www.investorgain.com/gmp/nityas-gems-jewellery-ipo/1601/'),
});

export const EVENTIONS = base({
  slug: 'eventions-ipo-2026',
  companyName: 'Eventions Limited',
  board: 'sme',
  nseSymbol: 'EVENTIONS',
  openDate: '2026-09-30',
  closeDate: '2026-10-05',
  expectedListingDate: '2026-10-08',
  upiCutoffAt: '2026-10-05T11:30:00.000Z',
  priceBand: { lowPaise: 11_200, highPaise: 11_800 },
  lotSize: 1_200,
  minInvestmentPaise: 28_320_000,
  issueSizePaise: 3_811_872_000,
  issueSizeBasis: 'derived_at_upper_band',
  subscription: {
    scope: 'consolidated',
    asOf: '2026-10-01T11:30:00.000Z',
    totalTimes: 1.75,
    retailTimes: null,
  },
});

export const RKFAL = base({
  slug: 'r-k-fashion-accessories-ipo-2026',
  companyName: 'R.K. Fashion Accessories Limited',
  board: 'sme',
  status: 'upcoming',
  nseSymbol: 'RKFAL',
  openDate: '2026-10-05',
  closeDate: '2026-10-07',
  expectedListingDate: '2026-10-12',
  priceBand: { lowPaise: 7_700, highPaise: 8_200 },
  lotSize: 1_600,
  // Two lots: 2 × 1,600 × ₹82.
  minInvestmentPaise: 26_240_000,
  issueSizePaise: 3_499_104_000,
  issueSizeBasis: 'derived_at_upper_band',
});

export const ORIENT = base({
  slug: 'orient-cables-india-ipo-2026',
  companyName: 'Orient Cables (India) Limited',
  status: 'closed',
  closedStage: 'allotment_done',
  nseSymbol: 'ORIENTCABL',
  openDate: '2026-09-25',
  closeDate: '2026-09-29',
  expectedListingDate: '2026-10-05',
  priceBand: { lowPaise: 25_800, highPaise: 27_200 },
  lotSize: 55,
  minInvestmentPaise: 1_496_000,
  issueSizePaise: 70_000_000_000,
  issueSizeBasis: 'official',
  subscription: {
    scope: 'consolidated',
    asOf: '2026-09-29T13:35:00.000Z',
    totalTimes: 23.41,
    retailTimes: 8.02,
  },
  gmp: gmp(-500, -1.84, 'https://www.investorgain.com/gmp/orient-cables-ipo/1597/', true),
});

export const AONE = base({
  slug: 'a-one-steels-india-ipo-2026',
  companyName: 'A-One Steels India Limited',
  status: 'listed',
  nseSymbol: 'AONESTEELS',
  openDate: '2026-09-24',
  closeDate: '2026-09-28',
  listingDate: '2026-10-01',
  priceBand: { lowPaise: 38_500, highPaise: 40_500 },
  issuePricePaise: 40_500,
  lotSize: 37,
  minInvestmentPaise: 1_498_500,
  issueSizePaise: 405_000_000_000,
  issueSizeBasis: 'official',
  subscription: {
    scope: 'consolidated',
    asOf: '2026-09-28T13:35:00.000Z',
    totalTimes: 12.23,
    retailTimes: 4.1,
  },
  listing: {
    exchange: 'NSE',
    listingDate: '2026-10-01',
    issuePricePaise: 40_500,
    listingOpenPaise: 45_500,
    listingGainPercent: 12.35,
    listingClosePaise: 41_655,
    listingDayChangePercent: 2.85,
    latestClosePaise: 41_655,
    latestCloseDate: '2026-10-01',
    sinceIssuePercent: 2.85,
  },
});

export const MONEYVIEW = base({
  slug: 'moneyview-ipo-2026',
  companyName: 'Moneyview Limited',
  status: 'listed',
  nseSymbol: 'MONEYVIEW',
  openDate: '2026-09-24',
  closeDate: '2026-09-28',
  listingDate: '2026-10-01',
  priceBand: { lowPaise: 3_200, highPaise: 3_400 },
  issuePricePaise: 3_400,
  lotSize: 441,
  minInvestmentPaise: 1_499_400,
  issueSizePaise: 2_500_000_000_000,
  issueSizeBasis: 'official',
  listing: {
    exchange: 'NSE',
    listingDate: '2026-10-01',
    issuePricePaise: 3_400,
    listingOpenPaise: 5_500,
    listingGainPercent: 61.76,
    listingClosePaise: 5_388,
    listingDayChangePercent: 58.47,
    latestClosePaise: 5_388,
    latestCloseDate: '2026-10-01',
    sinceIssuePercent: 58.47,
  },
});

export const AGENDA: IpoAgendaDayDto[] = [
  {
    date: '2026-10-05',
    events: [
      {
        slug: RKFAL.slug,
        companyName: RKFAL.companyName,
        board: 'sme',
        kind: 'opens',
        expected: false,
      },
      {
        slug: EVENTIONS.slug,
        companyName: EVENTIONS.companyName,
        board: 'sme',
        kind: 'closes',
        expected: false,
      },
      {
        slug: NITYAS.slug,
        companyName: NITYAS.companyName,
        board: 'mainboard',
        kind: 'closes',
        expected: false,
      },
      {
        slug: VNL.slug,
        companyName: VNL.companyName,
        board: 'mainboard',
        kind: 'closes',
        expected: false,
      },
      {
        slug: ORIENT.slug,
        companyName: ORIENT.companyName,
        board: 'mainboard',
        kind: 'listing',
        expected: true,
      },
    ],
  },
  {
    date: '2026-10-06',
    events: [
      {
        slug: VNL.slug,
        companyName: VNL.companyName,
        board: 'mainboard',
        kind: 'allotment',
        expected: true,
      },
    ],
  },
  {
    date: '2026-10-08',
    events: [
      {
        slug: VNL.slug,
        companyName: VNL.companyName,
        board: 'mainboard',
        kind: 'listing',
        expected: true,
      },
      {
        slug: EVENTIONS.slug,
        companyName: EVENTIONS.companyName,
        board: 'sme',
        kind: 'listing',
        expected: true,
      },
    ],
  },
];

export const FEEDS_OK: IpoFeedStatusDto[] = [
  {
    id: 'ipo-nse-calendar',
    label: 'NSE issue calendar',
    status: 'fresh',
    lastSuccessAt: '2026-10-02T03:10:00.000Z',
    lastAttemptAt: '2026-10-02T03:10:00.000Z',
    error: null,
  },
  {
    id: 'ipo-nse-detail',
    label: 'NSE issue details',
    status: 'fresh',
    lastSuccessAt: '2026-10-02T02:20:00.000Z',
    lastAttemptAt: '2026-10-02T02:20:00.000Z',
    error: null,
  },
  {
    id: 'ipo-investorgain-gmp',
    label: 'InvestorGain GMP (unofficial)',
    status: 'fresh',
    lastSuccessAt: '2026-10-02T04:45:00.000Z',
    lastAttemptAt: '2026-10-02T04:45:00.000Z',
    error: null,
  },
];

export const DISCLAIMER =
  'For information only — not investment advice. EquityWise does not recommend applying for, or avoiding, any IPO. Figures are as published by the exchanges and may change or be revised; check the timestamp on each. Subscription figures show demand so far, not future performance. Read the Red Herring Prospectus (RHP), especially its Risk Factors, before investing. Past listing gains do not indicate future returns.';
export const GMP_NOTE =
  'Grey-market premium (GMP) is an unofficial, unregulated quote. No exchange or regulator publishes it. EquityWise shows it as reported by a third-party website and does not verify it. It can change sharply or disappear, it is not a forecast of the listing price, and grey-market deals are not enforceable. Past GMP accuracy does not indicate future results.';

/** SEBI filings as the 2026-10-02 page listed them. */
export const FILINGS: SebiFilingDto[] = [
  {
    sebiId: '104866',
    companyName: 'JAGATJIT AGRI ENGINEERING LIMITED',
    documentLabel: 'DRHP',
    filedDate: '2026-10-01',
    pageUrl:
      'https://www.sebi.gov.in/filings/public-issues/oct-2026/jagatjit-agri-engineering-limited-drhp_104866.html',
    abridgedUrl:
      'https://www.sebi.gov.in/sebi_data/commondocs/oct-2026/DAP%20Jagatjit%20Agri%20Engineering%20Limited_p.pdf',
    slug: null,
  },
  {
    sebiId: '104860',
    companyName: 'Arohan Financial Services Limited',
    documentLabel: 'Addendum to DRHP',
    filedDate: '2026-10-01',
    pageUrl:
      'https://www.sebi.gov.in/filings/public-issues/oct-2026/arohan-financial-services-limited-addendum-to-drhp_104860.html',
    abridgedUrl: null,
    slug: null,
  },
  {
    sebiId: '104848',
    companyName: 'KOOLKING INDUSTRIES INDIA LIMITED',
    documentLabel: null,
    filedDate: '2026-10-01',
    pageUrl:
      'https://www.sebi.gov.in/filings/public-issues/oct-2026/koolking-industries-india-limited_104848.html',
    abridgedUrl: null,
    slug: null,
  },
  {
    sebiId: '104864',
    companyName: 'AITMC Ventures Limited',
    documentLabel: 'UDRHP-I',
    filedDate: '2026-09-30',
    pageUrl:
      'https://www.sebi.gov.in/filings/public-issues/sep-2026/aitmc-ventures-limited-udrhp-i_104864.html',
    abridgedUrl: null,
    slug: null,
  },
];

const GMP_POLICY = {
  enabled: true,
  sourceName: 'InvestorGain',
  sourceUrl: 'https://www.investorgain.com/report/ipo-gmp-live/331/',
  trackedSince: '2026-10-02',
} as const;

const COVERAGE =
  'Covers issues bid on NSE, including NSE Emerge SME. BSE-only SME issues are not yet included.';

/** The mainboard dashboard on Fri 2 Oct 2026. */
export const DASHBOARD: IpoDashboardDto = {
  board: 'mainboard',
  today: TODAY,
  asOf: '2026-10-02T13:43:00.000Z',
  feeds: FEEDS_OK,
  counts: { upcoming: 0, open: 2, closed: 1, listed: 88, withdrawn: 0, postponed: 0 },
  awaitingListing: 1,
  yearStats: {
    year: 2026,
    listed: 88,
    withListingPrice: 8,
    openedAboveIssue: 6,
    withLatestClose: 8,
    latestAboveIssue: 4,
  },
  current: [VNL, NITYAS, ORIENT, AONE, MONEYVIEW],
  subscription: [NITYAS, VNL, ORIENT],
  gmp: [VNL, ORIENT],
  listings: [AONE, MONEYVIEW],
  agenda: AGENDA,
  allotment: [
    {
      slug: ORIENT.slug,
      companyName: ORIENT.companyName,
      allotmentDate: '2026-09-30',
      allotmentExpected: false,
      listingDate: '2026-10-05',
      listingExpected: true,
      registrarName: 'MUFG Intime India Private Limited',
      registrarUrl: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    },
  ],
  documents: [
    {
      slug: VNL.slug,
      companyName: VNL.companyName,
      kind: 'rhp',
      url: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
      host: 'nsearchives.nseindia.com',
      sectionsQuoted: 5,
    },
    {
      slug: NITYAS.slug,
      companyName: NITYAS.companyName,
      kind: 'rhp',
      url: 'https://nsearchives.nseindia.com/content/ipo/RHP_NITYAS.zip',
      host: 'nsearchives.nseindia.com',
      sectionsQuoted: 2,
    },
  ],
  filings: FILINGS,
  exchangeAllotment: [
    { label: 'BSE application status', url: 'https://www.bseindia.com/investors/appli_check.aspx' },
    {
      label: 'NSE bid verification',
      url: 'https://www.nseindia.com/invest/check-trades-bids-verify-ipo-bids',
    },
  ],
  gmpPolicy: GMP_POLICY,
  gmpTrack: {
    official: false,
    months: 12,
    since: '2026-10-02',
    tolerancePoints: 10,
    total: 7,
    within: 5,
  },
  coverageNote: COVERAGE,
  disclaimer: DISCLAIMER,
  gmpNote: GMP_NOTE,
};

/** `/ipos/mainboard`, 2026. */
export const LIST_PAGE: IpoListPageDto = {
  board: 'mainboard',
  today: TODAY,
  filters: { status: null, year: 2026, q: '' },
  years: [2026, 2025, 2024],
  counts: { upcoming: 0, open: 2, closed: 1, listed: 2, withdrawn: 0, postponed: 0 },
  rows: [VNL, NITYAS, ORIENT, AONE, MONEYVIEW],
  total: 5,
  page: 1,
  pageSize: 25,
  feeds: FEEDS_OK,
  gmpPolicy: GMP_POLICY,
  coverageNote: COVERAGE,
  disclaimer: DISCLAIMER,
  gmpNote: GMP_NOTE,
};

/**
 * What the extractor reads out of the real VNL RHP (first four risk headings
 * of the ten). Quoted verbatim; figures stay strings.
 */
export const RHP_VNL: RhpExtractDto[] = [
  {
    section: 'overview',
    title: 'Overview',
    text: 'We are a civil engineering, manufacturing and construction company, primarily engaged in the business of manufacturing and dealing of Pre-Stressed Concrete (PSC) sleepers for railways, pre cast and prestressed concrete products for various applications and are also into fabrication and erection of Mild Steel Pipes (MS Pipes), MS Liner, and Penstock Pipes for Pumped Storage Project (PSP). We provide engineering, procurement, infrastructure and construction services for railway infrastructure and various civil engineering, irrigation and infrastructure development projects across sectors such as railways, renewable power and industrial sectors. Our business is divided into two segments, namely, (a) Manufacturing segment and (b) Services segment.',
    items: [],
    table: null,
    pageFrom: 247,
    pageTo: 247,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    extractedAt: '2026-10-02T02:50:00.000Z',
  },
  {
    section: 'objects',
    title: 'Objects of the issue',
    text: null,
    items: [
      'Funding Working Capital Requirements of the Company — 7,500.00 (₹ lakh)',
      'Repayment and/ or pre-payment, in part or full of term loans availed by our Company — 1,900.00 (₹ lakh)',
      'General corporate purposes',
    ],
    table: null,
    pageFrom: 128,
    pageTo: 129,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    extractedAt: '2026-10-02T02:50:00.000Z',
  },
  {
    section: 'promoters',
    title: 'Promoters',
    text: null,
    items: [
      'Brij B Tapadiya',
      'Ajay Bhagwandas Tapadiya',
      'Pavan Vithaldas Tapadiya',
      'Akhil Ranchod Tapadiya',
      'Naveen Tapadiya',
      'Rajendrakumar Badrinarayan Tapadiya',
      'Suyash Vithaldas Tapadiya',
      'Vedant Tapadiya',
      'Keshav Tapadiya',
    ],
    table: null,
    pageFrom: 322,
    pageTo: 322,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    extractedAt: '2026-10-02T02:50:00.000Z',
  },
  {
    section: 'financials',
    title: 'Restated financial summary',
    text: null,
    items: [],
    table: {
      unit: '₹ lakh',
      columns: ['31 March 2026', '31 March 2025', '31 March 2024'],
      rows: [
        {
          label: 'Revenue from operations',
          values: ['33,867.73', '31,851.62', '24,288.20'],
        },
        {
          label: 'Total income',
          values: ['34,413.26', '32,486.36', '24,793.18'],
        },
        {
          label: 'Profit after tax',
          values: ['2,497.50', '2,363.59', '344.56'],
        },
        {
          label: 'Total equity (net worth)',
          values: ['8,678.35', '6,156.22', '3,856.33'],
        },
        {
          label: 'Total assets',
          values: ['33,491.77', '29,660.98', '24,203.76'],
        },
      ],
    },
    pageFrom: 71,
    pageTo: 73,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    extractedAt: '2026-10-02T02:50:00.000Z',
  },
  {
    section: 'risks',
    title: 'Risk factors',
    text: null,
    items: [
      'Our business and revenues in the manufacturing segment for Pre-Stressed Concrete (“PSC”) sleepers are substantially dependent on railroad infrastructure projects undertaken or awarded by government authorities such as the Ministry of Railways and operations of Indian Railways and other government owned public sector undertakings such as Indian Railways, DFCCIL (Dedicated Freight Corridor Corporation of India Ltd.) and are thereby dependent on governmental policies and budgetary allocation, accordingly, ₹ 14,421.16 lakhs, ₹ 15,294.65 lakhs and ₹ 14,695.18 lakhs corresponding to 42.61%, 47.30% and 58.09% of our Revenue from Operations during Fiscal 2026, Fiscal 2025 and Fiscal 2024 was generated from government authorities and entities related to the government in the manufacturing segment for PSC sleepers. Any adverse changes in the central or state government policies may lead to change in the volume of our business and/or a change in the terms of our contracts.',
      'We depend significantly on a certain number of customers for our business and revenue. A substantial decrease in the orders placed on us by these customers or a decrease in the demand of these products may adversely impact our revenues and profitability.',
      'We rely on suppliers for our raw materials under our manufacturing segment. Though there are availability of substantial suppliers for the raw materials for our business, any loss or reduction in the number of suppliers may have an adverse effect on our business, results of operations and financial conditions.',
      'A substantial increase in our profitability in the recent past has been contributed by the increase in the revenue and the higher margins in the services segment. There can be no assurance that we will continue to enjoy higher revenue and profitability from such segment on a regular basis in the future. Any reduction of revenue or profit margins from such segment will affect our profitability and may have an adverse effect on our financial condition and results of operation.',
    ],
    table: null,
    pageFrom: 28,
    pageTo: 30,
    documentUrl: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    extractedAt: '2026-10-02T02:50:00.000Z',
  },
];

export const DETAIL_VNL: IpoDetailDto = {
  ...VNL,
  isin: null,
  bseScripCode: null,
  designatedExchange: 'NSE',
  issueMethod: 'book_building',
  faceValuePaise: 1_000,
  minBidQuantity: 68,
  retailMaxPaise: 20_000_000,
  maxRetailLots: 13,
  investmentLimits: [
    { kind: 'retail_min', lots: 1, shares: 68, amountPaise: 1_496_000 },
    { kind: 'retail_max', lots: 13, shares: 884, amountPaise: 19_448_000 },
    { kind: 'snii_min', lots: 14, shares: 952, amountPaise: 20_944_000 },
    { kind: 'snii_max', lots: 66, shares: 4_488, amountPaise: 98_736_000 },
    { kind: 'bnii_min', lots: 67, shares: 4_556, amountPaise: 100_232_000 },
  ],
  employeeDiscountPaise: null,
  sharesOffered: 8_471_153,
  issueSize: {
    text: 'Initial Public Offering comprising fresh issue aggregating up to 14500 lakhs and offer for sale up to 15,00,000 Equity Shares',
    totalPaise: 178_000_000_000,
    basis: 'derived_at_upper_band',
    freshPaise: 145_000_000_000,
    freshShares: null,
    offerForSalePaise: 33_000_000_000,
    offerForSaleShares: 1_500_000,
    marketMakerShares: null,
    anchorShares: null,
  },
  registrar: {
    name: 'MUFG Intime India Private Limited',
    contact: 'Shanti Gopalkrishna , +91 810 811 4949, vishalnirmiti.ipo@in.mpms.mufg.com',
    allotmentUrl: 'https://in.mpms.mufg.com/Initial_Offer/public-issues.html',
    allotmentChecked: '2026-10-02',
  },
  exchangeAllotment: [
    { label: 'BSE application status', url: 'https://www.bseindia.com/investors/appli_check.aspx' },
    {
      label: 'NSE bid verification',
      url: 'https://www.nseindia.com/invest/check-trades-bids-verify-ipo-bids',
    },
  ],
  leadManagers: ['Saffron Capital Advisors Private Limited'],
  sponsorBanks: ['HDFC Bank Limited'],
  marketMaker: null,
  timeline: [
    { kind: 'opens', date: '2026-09-30', expected: false, done: true },
    { kind: 'closes', date: '2026-10-05', expected: false, done: false },
    { kind: 'allotment', date: '2026-10-06', expected: true, done: false },
    { kind: 'refunds', date: '2026-10-07', expected: true, done: false },
    { kind: 'demat_credit', date: '2026-10-07', expected: true, done: false },
    { kind: 'listing', date: '2026-10-08', expected: true, done: false },
  ],
  subscriptionTable: {
    source: 'nse',
    scope: 'consolidated',
    asOf: '2026-10-01T11:30:00.000Z',
    asOfBasis: 'stated',
    rows: [
      {
        category: 'qib',
        label: 'Qualified Institutional Buyers(QIBs)',
        sharesOffered: 84_710,
        sharesBid: 80_920,
        times: 0.9553,
      },
      {
        category: 'nii',
        label: 'Non Institutional Investors',
        sharesOffered: 2_456_635,
        sharesBid: 1_975_196,
        times: 0.804,
      },
      {
        category: 'nii_big',
        label: 'Non Institutional Investors(Bid amount of more than Ten Lakh Rupees)',
        sharesOffered: 1_637_757,
        sharesBid: 1_723_120,
        times: 1.0521,
      },
      {
        category: 'nii_small',
        label:
          'Non Institutional Investors(Bid amount of more than Two Lakh Rupees upto Ten Lakh Rupees)',
        sharesOffered: 818_878,
        sharesBid: 252_076,
        times: 0.3078,
      },
      {
        category: 'retail',
        label: 'Retail Individual Investors(RIIs)',
        sharesOffered: 5_929_808,
        sharesBid: 2_779_092,
        times: 0.4687,
      },
      {
        category: 'total',
        label: 'Total',
        sharesOffered: 8_471_153,
        sharesBid: 4_835_208,
        times: 0.5708,
      },
    ],
  },
  subscriptionNseOnly: null,
  subscriptionHistory: [
    {
      asOf: '2026-09-30T13:35:00.000Z',
      totalTimes: 0.21,
      retailTimes: 0.19,
      qibTimes: 0.4,
      niiTimes: 0.12,
    },
    {
      asOf: '2026-10-01T11:30:00.000Z',
      totalTimes: 0.5708,
      retailTimes: 0.4687,
      qibTimes: 0.9553,
      niiTimes: 0.804,
    },
  ],
  documents: [
    {
      kind: 'rhp',
      title: 'Red Herring Prospectus',
      url: 'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
      host: 'nsearchives.nseindia.com',
    },
    {
      kind: 'price_band_ad',
      title: 'Ratios / Basis of Issue Price',
      url: 'https://nsearchives.nseindia.com/content/ipo/RATIOS_VNL.zip',
      host: 'nsearchives.nseindia.com',
    },
  ],
  rhp: RHP_VNL,
  rhpReadFrom: '2026-01-01',
  filings: [],
  gmpPanel: {
    official: false,
    available: true,
    sourceName: 'InvestorGain',
    sourceUrl: 'https://www.investorgain.com/gmp/vishal-nirmiti-ipo/1602/',
    latestPaise: 2_000,
    percentOfUpperBand: 9.09,
    rangeLowPaise: 200,
    rangeHighPaise: 2_000,
    observedAt: '2026-10-02T01:32:00.000Z',
    stale: false,
    history: [
      { observedAt: '2026-09-28T04:00:00.000Z', gmpPaise: 1_000, percentOfUpperBand: 4.55 },
      { observedAt: '2026-09-29T04:00:00.000Z', gmpPaise: 1_200, percentOfUpperBand: 5.45 },
      { observedAt: '2026-09-30T04:00:00.000Z', gmpPaise: 1_500, percentOfUpperBand: 6.82 },
      { observedAt: '2026-10-01T04:00:00.000Z', gmpPaise: 1_800, percentOfUpperBand: 8.18 },
      { observedAt: '2026-10-02T01:32:00.000Z', gmpPaise: 2_000, percentOfUpperBand: 9.09 },
    ],
  },
  gmpTrackRecord: {
    official: false,
    months: 12,
    board: 'mainboard',
    since: '2026-10-02',
    tolerancePoints: 10,
    total: 4,
    within: 2,
    gmpAbove: 1,
    gmpBelow: 1,
    rows: [
      {
        slug: AONE.slug,
        companyName: 'A-One Steels India Limited',
        board: 'mainboard',
        listingDate: '2026-10-01',
        lastGmpPercent: 11.36,
        listingGainPercent: 12.35,
        differencePoints: 0.99,
        outcome: 'within',
      },
      {
        slug: MONEYVIEW.slug,
        companyName: 'Moneyview Limited',
        board: 'mainboard',
        listingDate: '2026-10-01',
        lastGmpPercent: 42.65,
        listingGainPercent: 61.76,
        differencePoints: 19.11,
        outcome: 'gmp_below',
      },
      {
        slug: 'fx-multitech-ipo-2026',
        companyName: 'FX Multitech Limited',
        board: 'sme',
        listingDate: '2026-09-29',
        lastGmpPercent: 5.6,
        listingGainPercent: 1.2,
        differencePoints: -4.4,
        outcome: 'within',
      },
      {
        slug: 'elevate-campuses-ipo-2026',
        companyName: 'Elevate Campuses Limited',
        board: 'mainboard',
        listingDate: '2026-09-30',
        lastGmpPercent: 1.8,
        listingGainPercent: -14.2,
        differencePoints: -16,
        outcome: 'gmp_above',
      },
    ],
    thisIssue: null,
  },
  sources: [
    {
      source: 'nse',
      sourceName: 'NSE',
      feed: 'calendar',
      url: 'https://www.nseindia.com/api/ipo-current-issue',
      lastSeenAt: '2026-10-02T03:10:00.000Z',
    },
    {
      source: 'nse',
      sourceName: 'NSE',
      feed: 'detail',
      url: 'https://www.nseindia.com/api/ipo-detail?symbol=VNL&series=EQ',
      lastSeenAt: '2026-10-02T02:20:00.000Z',
    },
  ],
  fieldSources: {
    lotSize: {
      source: 'nse',
      sourceName: 'NSE',
      url: 'https://www.nseindia.com/api/ipo-detail?symbol=VNL&series=EQ',
      observedAt: '2026-10-02T02:20:00.000Z',
      basis: 'official',
    },
    priceBandHighPaise: {
      source: 'nse',
      sourceName: 'NSE',
      url: 'https://www.nseindia.com/api/ipo-detail?symbol=VNL&series=EQ',
      observedAt: '2026-10-02T02:20:00.000Z',
      basis: 'official',
    },
  },
  updatedAt: '2026-10-02T03:10:00.000Z',
  disclaimer: DISCLAIMER,
  gmpNote: GMP_NOTE,
};
