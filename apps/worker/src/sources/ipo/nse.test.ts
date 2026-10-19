import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ddmmyyyy,
  isNotAnIpo,
  parseNseActiveCategory,
  parseNseBhavcopyPrices,
  parseNseDetail,
  parseNseIssueList,
  parseNseRecentListings,
  parseUpiCutoff,
  type SeriesBoard,
  splitNameStatus,
  splitParties,
} from './nse.js';

// Fixtures captured from NSE on 2026-10-02 (see __fixtures__/README.md).
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const json = (name: string): unknown => JSON.parse(fixture(name));

const boardOf: SeriesBoard = (series) =>
  ['EQ', 'BE', 'BZ'].includes(series)
    ? 'mainboard'
    : ['SME', 'SM', 'ST'].includes(series)
      ? 'sme'
      : null;
const HOSTS = ['nseindia.com', 'bseindia.com', 'sebi.gov.in'];
const key = (symbol: string, series: string, open: string) => ({
  source: 'nse',
  externalKey: `nse:${symbol}:${series}:${open}`,
  symbol,
  series,
});

describe('parseNseIssueList', () => {
  it('reads the current list: band, share count, and drops nothing equity', () => {
    const rows = parseNseIssueList(json('nse-current-issue.json'), 'https://x', boardOf);
    expect(rows.map((r) => r.symbol)).toEqual(['VNL', 'NITYAS', 'EVENTIONS']);
    const vnl = rows[0];
    expect(vnl).toMatchObject({
      externalKey: 'nse:VNL:EQ:2026-09-30',
      companyName: 'Vishal Nirmiti Limited',
      board: 'mainboard',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      priceBand: { lowPaise: 20_800, highPaise: 22_000 },
      sharesOffered: 8_471_153,
      issuePricePaise: null,
      listingDate: null,
      sourceStatus: 'Active',
    });
    expect(rows[2]?.board).toBe('sme');
  });

  it('drops the debt issue from the upcoming list and keeps the SME lot', () => {
    const rows = parseNseIssueList(json('nse-upcoming-issues.json'), 'https://x', boardOf);
    expect(rows.map((r) => r.symbol)).toEqual(['VNL', 'NITYAS', 'RKFAL']);
    expect(rows.find((r) => r.symbol === 'RKFAL')).toMatchObject({
      board: 'sme',
      lotSize: 1_600,
      priceBand: { lowPaise: 7_700, highPaise: 8_200 },
      sourceStatus: 'Forthcoming',
    });
  });

  it('reads past issues: padded final price, listing date, both name keys', () => {
    const rows = parseNseIssueList(json('nse-past-issues.json'), 'https://x', boardOf);
    // 54 fixture rows minus DEBT, IV, RR and N0 = 50 equity rows.
    expect(rows).toHaveLength(50);
    expect(rows.find((r) => r.symbol === 'AONESTEELS')).toMatchObject({
      companyName: 'A-One Steels India Limited',
      openDate: '2026-09-24',
      closeDate: '2026-09-28',
      listingDate: '2026-10-01',
      issuePricePaise: 40_500,
      priceBand: { lowPaise: 38_500, highPaise: 40_500 },
      sharesOffered: null,
    });
    // `companyName`-only SME rows still read; a "-" listing date is null.
    expect(rows.find((r) => r.symbol === 'PAPADMALJI')).toMatchObject({
      companyName: 'Papadmalji Agro Foods Limited',
      board: 'sme',
      listingDate: null,
      issuePricePaise: null,
    });
    // The oldest fixture row is a 2012 fixed-price SME issue.
    expect(rows.at(-1)).toMatchObject({ symbol: 'THEJO', openDate: '2012-09-04' });
  });

  it('fails loudly when the envelope is not a list', () => {
    expect(() => parseNseIssueList({ error: 'blocked' }, 'https://x', boardOf)).toThrow();
  });
});

describe('withdrawn, postponed and withdrawal-window rows', () => {
  const past = (company: string, symbol: string) => ({
    company,
    symbol,
    securityType: 'SME',
    ipoStartDate: '24-JUN-2026',
    ipoEndDate: '29-JUN-2026',
    listingDate: '-',
    issuePrice: '-',
    priceRange: 'Rs.100 to Rs.105',
  });

  it('reads the status NSE writes into the name, and strips it', () => {
    const rows = parseNseIssueList(
      [
        past('Sri Priyanka Geo Commex Limited-Issue Withdrawn', 'SPGCL'),
        past('IC Electricals Company Limited-Issue postponed', 'ICEL'),
      ],
      'https://x',
      boardOf,
    );
    expect(rows.map((r) => [r.companyName, r.sourceStatus])).toEqual([
      ['Sri Priyanka Geo Commex Limited', 'Issue Withdrawn'],
      ['IC Electricals Company Limited', 'Issue postponed'],
    ]);
  });

  it('drops withdrawal-window rows: they are not issues', () => {
    const rows = parseNseIssueList(
      [
        past('C2C Advanced Systems Limited- Withdrawal Window', 'C2CW'),
        past('Rajputana Stainless Limited-Special Withdrawal Option', 'RSL'),
        past('Rays of Belief Limited- For Profit Social Enterprise (FPSE)', 'MOMSBELIEF'),
      ],
      'https://x',
      boardOf,
    );
    expect(rows.map((r) => r.symbol)).toEqual(['MOMSBELIEF']);
  });

  it('drops follow-on offers and numbered partly-paid lines, keeps real PP-suffixed IPOs', () => {
    const rows = parseNseIssueList(
      [
        past('Vodafone Idea Limited - FPO', 'IDEAFPO'),
        past('Adani Enterprises Limited', 'ADANIENPP1'),
        past('Varanium Cloud Limited', 'CLOUDPP'),
      ],
      'https://x',
      boardOf,
    );
    expect(rows.map((r) => r.symbol)).toEqual(['CLOUDPP']);
    expect(isNotAnIpo('Adani Enterprises Limited-FPO', 'ADANIENTPP')).toBe(true);
    expect(isNotAnIpo('Silgo Retail Limited', 'SILGOPP')).toBe(false);
  });

  it('leaves a name without a status suffix alone', () => {
    expect(splitNameStatus('Withdrawal Systems Limited')).toEqual({
      name: 'Withdrawal Systems Limited',
      status: null,
    });
  });
});

describe('parseNseDetail', () => {
  it('reads a mainboard issue by title (VNL)', () => {
    const detail = parseNseDetail(json('nse-detail-vnl-eq.json'), {
      key: key('VNL', 'EQ', '2026-09-30'),
      sourceUrl: 'https://www.nseindia.com/api/ipo-detail?symbol=VNL&series=EQ',
      documentHosts: HOSTS,
    });
    expect(detail).toMatchObject({
      companyName: 'Vishal Nirmiti Limited',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      issueMethod: 'book_building',
      priceBand: { lowPaise: 20_800, highPaise: 22_000 },
      faceValuePaise: 1_000,
      lotSize: 68,
      minBidQuantity: 68,
      retailMaxPaise: 20_000_000,
      employeeDiscountPaise: null,
      leadManagers: ['Saffron Capital Advisors Private Limited'],
      registrarName: 'MUFG Intime India Private Limited',
      sponsorBanks: ['HDFC Bank Limited'],
    });
    // 5:00 PM IST on 5 Oct = 11:30 UTC.
    expect(detail.upiCutoffAt?.toISOString()).toBe('2026-10-05T11:30:00.000Z');
    expect(detail.issueSizeText).toContain('14500 lakhs');
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(['price_band_ad', 'rhp']);
    expect(detail.documents.find((d) => d.kind === 'rhp')?.url).toBe(
      'https://nsearchives.nseindia.com/content/ipo/RHP_VNL.zip',
    );
    // NSE-only bids from bidDetails: headline rows only, sub-rows dropped.
    expect(detail.subscription?.scope).toBe('nse');
    expect(detail.subscription?.asOf?.toISOString()).toBe('2026-10-01T11:30:03.000Z');
    expect(detail.subscription?.rows.map((r) => r.category)).toEqual([
      'qib',
      'nii',
      'nii_big',
      'nii_small',
      'retail',
      'total',
    ]);
    expect(detail.subscription?.rows.at(-1)).toMatchObject({
      sharesOffered: 8_471_153,
      sharesBid: 3_721_912,
    });
  });

  it('reads two lead managers, two sponsor banks and the employee discount (AONESTEELS)', () => {
    const detail = parseNseDetail(json('nse-detail-aonesteels-eq.json'), {
      key: key('AONESTEELS', 'EQ', '2026-09-24'),
      sourceUrl: 'https://x',
      documentHosts: HOSTS,
    });
    expect(detail.leadManagers).toEqual([
      'PL Capital Markets Private Limited',
      'Khambatta Securities Limited',
    ]);
    expect(detail.sponsorBanks).toEqual(['Axis Bank Limited', 'HDFC Bank Limited']);
    expect(detail.employeeDiscountPaise).toBe(3_800);
    expect(detail.documents.map((d) => d.kind)).toContain('anchor_allocation');
  });

  it('reads an SME issue with a "Lot Size" title and no bids yet (RKFAL)', () => {
    const detail = parseNseDetail(json('nse-detail-rkfal-sme.json'), {
      key: key('RKFAL', 'SME', '2026-10-05'),
      sourceUrl: 'https://x',
      documentHosts: HOSTS,
    });
    expect(detail).toMatchObject({
      lotSize: 1_600,
      minBidQuantity: null,
      priceBand: { lowPaise: 7_700, highPaise: 8_200 },
      registrarName: 'Cameo Corporate Service Limited',
      subscription: null,
    });
    // 07-Oct 5:00 PM IST.
    expect(detail.upiCutoffAt?.toISOString()).toBe('2026-10-07T11:30:00.000Z');
  });

  it('reads the SME book from bidDetails + demandGraphALL, individuals included (EVENTIONS)', () => {
    const detail = parseNseDetail(json('nse-detail-eventions-sme.json'), {
      key: key('EVENTIONS', 'SME', '2026-09-30'),
      sourceUrl: 'https://x',
      documentHosts: HOSTS,
    });
    expect(detail.lotSize).toBe(1_200);
    expect(detail.registrarName).toBe('Mudra RTA Ventures Private Limited');
    // SME rows spell the bid column `noOfshareBid` and state no shares offered;
    // their Total equals demandGraphALL's, so this is the consolidated book.
    const sub = detail.subscription;
    expect(sub?.scope).toBe('consolidated');
    // "As on 01-Oct-2026 17:00:00 IST" = 11:30 UTC.
    expect(sub?.asOf?.toISOString()).toBe('2026-10-01T11:30:00.000Z');
    expect(sub?.rows.map((r) => r.category)).toEqual([
      'qib',
      'nii',
      'nii_big',
      'nii_small',
      'retail',
      'total',
    ]);
    expect(sub?.rows.find((r) => r.category === 'retail')).toMatchObject({
      label: 'Individual Investors (IND category bidding for 2 Lots)',
      sharesBid: 1_197_600,
      sharesOffered: null,
    });
    // NSE's own ratio: 56,64,000 ÷ 32,30,400 = 1.75×. No category is given a
    // denominator NSE does not publish.
    expect(sub?.rows.find((r) => r.category === 'total')).toMatchObject({
      sharesBid: 5_664_000,
      sharesOffered: 3_230_400,
    });
    expect(sub?.rows.find((r) => r.category === 'qib')?.sharesOffered).toBeNull();
  });

  it('keeps an old SME book whole even when the graph total differs, timed by the graph', () => {
    // VICTORYEV (Jan 2026): bid rows total 81,36,000; the graph counts 80,28,000.
    const payload = json('nse-detail-eventions-sme.json') as Record<string, unknown>;
    const detail = parseNseDetail(
      {
        ...payload,
        demandDataNSE: [],
        demandGraphALL: {
          totalIssueSize: '3230400',
          totalBidRecieved: '1',
          timestamp: 'As on 09-Jan-2026 17:42:00 IST',
        },
      },
      { key: key('EVENTIONS', 'SME', '2026-09-30'), sourceUrl: 'https://x', documentHosts: HOSTS },
    );
    expect(detail.subscription?.scope).toBe('consolidated');
    expect(detail.subscription?.asOf?.toISOString()).toBe('2026-01-09T12:12:00.000Z');
    expect(detail.subscription?.rows.find((r) => r.category === 'total')?.sharesOffered).toBe(
      3_230_400,
    );
  });

  it("times a closed mainboard issue's NSE-only bids by demandGraph once demandDataNSE is empty", () => {
    const payload = json('nse-detail-vnl-eq.json') as Record<string, unknown>;
    const detail = parseNseDetail(
      {
        ...payload,
        demandDataNSE: [],
        demandGraph: { timestamp: 'As on 13-Jan-2026 19:01:19 IST' },
      },
      { key: key('VNL', 'EQ', '2026-09-30'), sourceUrl: 'https://x', documentHosts: HOSTS },
    );
    expect(detail.subscription?.scope).toBe('nse');
    // 19:01:19 IST = 13:31:19 UTC — not "now", which would misdate a final figure.
    expect(detail.subscription?.asOf?.toISOString()).toBe('2026-01-13T13:31:19.000Z');
  });

  it('reads a band written with the "/-" suffix and a ₹5 face value (NITYAS)', () => {
    const detail = parseNseDetail(json('nse-detail-nityas-eq.json'), {
      key: key('NITYAS', 'EQ', '2026-09-30'),
      sourceUrl: 'https://x',
      documentHosts: HOSTS,
    });
    expect(detail).toMatchObject({
      companyName: 'Nityas Gems and Jewellery Limited',
      priceBand: { lowPaise: 7_000, highPaise: 7_500 },
      faceValuePaise: 500,
      lotSize: 200,
      registrarName: 'Bigshare Services Private Limited',
    });
  });

  it('joins an archive link NSE split with a stray space (PRANAV, SRM)', () => {
    // As published: the archive serves RHP_PRANAV.zip and RHP_SRM.zip; the
    // spaced spellings 404.
    const detail = parseNseDetail(
      {
        issueInfo: {
          dataList: [
            {
              title: 'Red Herring Prospectus',
              value: 'https://nsearchives.nseindia.com/content/ipo/RHP_PRANAV .zip',
            },
            {
              title: 'Ratios / Basis of Issue Price',
              value: 'https://nsearchives.nseindia.com/content/ipo/RATIOS_ SRM.zip',
            },
            {
              title: 'Anchor Allocation Report',
              value: 'https://nsearchives.nseindia.com/content/ipo/ANCHOR_PRANAV.zip',
            },
          ],
        },
      },
      { key: key('PRANAV', 'EQ', '2026-09-07'), sourceUrl: 'https://x', documentHosts: HOSTS },
    );
    expect(detail.documents.map((d) => d.url)).toEqual([
      'https://nsearchives.nseindia.com/content/ipo/RHP_PRANAV.zip',
      'https://nsearchives.nseindia.com/content/ipo/RATIOS_SRM.zip',
      'https://nsearchives.nseindia.com/content/ipo/ANCHOR_PRANAV.zip',
    ]);
  });

  it('keeps two complete links apart, and leaves an HTML link with its attributes alone', () => {
    const detail = parseNseDetail(
      {
        issueInfo: {
          dataList: [
            {
              title: 'Addendum',
              value:
                'https://nsearchives.nseindia.com/content/ipo/ADD_1.pdf https://nsearchives.nseindia.com/content/ipo/ADD_2.pdf',
            },
            {
              title: 'Corrigendum',
              value:
                '<a href=https://nsearchives.nseindia.com/content/ipo/CORR_X target=new>CORR.pdf</a>',
            },
          ],
        },
      },
      { key: key('X', 'EQ', '2026-10-01'), sourceUrl: 'https://x', documentHosts: HOSTS },
    );
    expect(detail.documents.map((d) => d.url)).toEqual([
      'https://nsearchives.nseindia.com/content/ipo/ADD_1.pdf',
      'https://nsearchives.nseindia.com/content/ipo/ADD_2.pdf',
      'https://nsearchives.nseindia.com/content/ipo/CORR_X',
    ]);
  });

  it('never keeps a link to a host outside the allowlist', () => {
    const detail = parseNseDetail(
      {
        issueInfo: {
          dataList: [
            { title: 'Red Herring Prospectus', value: 'https://evil.example/RHP.zip' },
            { title: 'Issue Period', value: '01-Oct-2026 to 03-Oct-2026' },
          ],
        },
      },
      { key: key('X', 'EQ', '2026-10-01'), sourceUrl: 'https://x', documentHosts: HOSTS },
    );
    expect(detail.documents).toEqual([]);
  });
});

describe('parseNseActiveCategory', () => {
  it('reads the consolidated figure with its "as of" time', () => {
    const subscription = parseNseActiveCategory(json('nse-active-category-vnl.json'));
    expect(subscription?.scope).toBe('consolidated');
    // "Updated as on 01-Oct-2026 17:00:00" IST.
    expect(subscription?.asOf?.toISOString()).toBe('2026-10-01T11:30:00.000Z');
    expect(subscription?.rows.find((r) => r.category === 'total')).toMatchObject({
      sharesOffered: 8_471_153,
      sharesBid: 4_835_208,
    });
    expect(subscription?.rows.find((r) => r.category === 'retail')?.sharesBid).toBe(2_779_092);
  });

  it('is null for an issue with no bids yet', () => {
    expect(
      parseNseActiveCategory({
        dataList: [
          { category: 'Total', noOfShareOffered: '0.0', noOfSharesBid: '0.0', srNo: null },
        ],
        updateTime: 'Updated as on null',
      }),
    ).toBeNull();
  });
});

describe('parseNseBhavcopyPrices', () => {
  const rows = parseNseBhavcopyPrices(fixture('nse-bhavcopy-01102026.csv'), 'https://x', boardOf);
  it('reads listing-day prices: PREV_CLOSE is the issue price', () => {
    expect(rows.find((r) => r.symbol === 'AONESTEELS')).toMatchObject({
      series: 'EQ',
      tradingDate: '2026-10-01',
      prevClosePaise: 40_500,
      openPaise: 45_500,
      highPaise: 47_000,
      lowPaise: 39_370,
      closePaise: 41_655,
      volume: 14_841_745,
    });
  });
  it('keeps SME series and drops government securities', () => {
    expect(rows.some((r) => r.series === 'SM')).toBe(true);
    expect(rows.some((r) => r.series === 'ST')).toBe(true);
    expect(rows.some((r) => r.series === 'GS')).toBe(false);
  });
  it('throws on a file that is not the bhavdata layout', () => {
    expect(() =>
      parseNseBhavcopyPrices('<html>maintenance</html>', 'https://x', boardOf),
    ).toThrow();
  });
});

describe('small readers', () => {
  it('parseNseRecentListings keeps equity with valid ISINs', () => {
    const rows = parseNseRecentListings(json('nse-recent-listing.json'), boardOf);
    expect(rows.find((r) => r.symbol === 'MONEYVIEW')).toMatchObject({
      isin: 'INE0PTN01011',
      listingDate: '2026-10-01',
    });
    expect(rows.some((r) => r.series === 'N0')).toBe(false);
  });
  it('splitParties splits only after a legal form', () => {
    expect(splitParties('Axis Bank Limited and HDFC Bank Limited')).toEqual([
      'Axis Bank Limited',
      'HDFC Bank Limited',
    ]);
    expect(splitParties('Smith and Sons Capital Limited')).toEqual([
      'Smith and Sons Capital Limited',
    ]);
    expect(splitParties(null)).toEqual([]);
  });
  it('parseUpiCutoff reads PM times', () => {
    expect(parseUpiCutoff('"05-Oct-2026 (upto 5:00 PM) The new cut-off"')?.toISOString()).toBe(
      '2026-10-05T11:30:00.000Z',
    );
    expect(parseUpiCutoff('no date here')).toBeNull();
  });
  it('ddmmyyyy formats archive file names', () => {
    expect(ddmmyyyy('2026-10-01')).toBe('01102026');
  });
});
