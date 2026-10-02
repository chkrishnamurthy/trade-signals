import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  ddmmyyyy,
  parseNseActiveCategory,
  parseNseBhavcopyPrices,
  parseNseDetail,
  parseNseIssueList,
  parseNseRecentListings,
  parseUpiCutoff,
  type SeriesBoard,
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

  it('keeps an SME QIB row with zero offered rather than inventing a ratio (EVENTIONS)', () => {
    const detail = parseNseDetail(json('nse-detail-eventions-sme.json'), {
      key: key('EVENTIONS', 'SME', '2026-09-30'),
      sourceUrl: 'https://x',
      documentHosts: HOSTS,
    });
    expect(detail.lotSize).toBe(1_200);
    expect(detail.registrarName).toBe('Mudra RTA Ventures Private Limited');
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
