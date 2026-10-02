import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  bseParties,
  parseBseBhavcopy,
  parseBseCalendar,
  parseBseCutoff,
  parseBseDay,
  parseBseDemand,
  parseBseDetail,
  parseBseListings,
  tickerAndCode,
} from './bse.js';

// Fixtures captured from BSE on 2026-10-02 (see __fixtures__/README.md).
const fixture = (name: string) =>
  readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url), 'utf8');
const json = (name: string): unknown => JSON.parse(fixture(name));
const HOSTS = ['nseindia.com', 'bseindia.com', 'sebi.gov.in'];
const key = { source: 'bse', externalKey: 'bse:8020', symbol: '8020', series: 'MainBoard' };

describe('parseBseCalendar', () => {
  const rows = parseBseCalendar(json('bse-public-issues.json'), 'https://x');
  it('keeps equity IPOs only and drops FPO, rights, buyback, debt', () => {
    expect(rows).toHaveLength(9);
    expect(rows.every((r) => r.exchange === 'BSE')).toBe(true);
  });
  it('reads a mainboard issue', () => {
    expect(rows.find((r) => r.symbol === '8020')).toMatchObject({
      externalKey: 'bse:8020',
      companyName: 'Vishal Nirmiti Limited',
      board: 'mainboard',
      bseScripCode: '4870',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      priceBand: { lowPaise: 20_800, highPaise: 22_000 },
      sourceStatus: 'Live',
    });
  });
  it('reads a BSE SME issue and collapses double spaces in names', () => {
    expect(rows.find((r) => r.symbol === '8015')).toMatchObject({
      companyName: 'Dove Soft Limited',
      board: 'sme',
      priceBand: { lowPaise: 10_400, highPaise: 11_100 },
    });
  });
});

describe('parseBseDetail', () => {
  const detail = parseBseDetail(json('bse-issue-bbs-8020.json'), {
    key,
    sourceUrl: 'https://x',
    documentHosts: HOSTS,
  });
  it('reads the flat record', () => {
    expect(detail).toMatchObject({
      companyName: 'Vishal Nirmiti Limited',
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      priceBand: { lowPaise: 20_800, highPaise: 22_000 },
      faceValuePaise: 1_000,
      lotSize: 68,
      minBidQuantity: 68,
      leadManagers: ['Saffron Capital Advisors Private Limited'],
      registrarName: 'MUFG INTIME INDIA PRIVATE LIMITED',
      sponsorBanks: ['HDFC BANK'],
      issueSizeText: 'Public issue of 8471153 equity shares',
    });
    // "05th Octomber 2026 (Upto 5.00 Pm)" — BSE's own spelling.
    expect(detail.upiCutoffAt?.toISOString()).toBe('2026-10-05T11:30:00.000Z');
  });
  it('keeps the RHP and price-band ad on BSE hosts', () => {
    expect(detail.documents.map((d) => d.kind).sort()).toEqual(['price_band_ad', 'rhp']);
    expect(detail.documents.find((d) => d.kind === 'rhp')?.url).toMatch(
      /^https:\/\/listing\.bseindia\.com\//,
    );
  });
});

describe('parseBseDemand', () => {
  it('reads headline categories and the stated time', () => {
    const demand = parseBseDemand(json('bse-cumulative-demand-8020.json'));
    expect(demand?.scope).toBe('consolidated');
    // Maxdt "2026-10-01T17:00:00" IST.
    expect(demand?.asOf?.toISOString()).toBe('2026-10-01T11:30:00.000Z');
    expect(demand?.rows.map((r) => r.category)).toEqual([
      'qib',
      'nii',
      'nii_big',
      'nii_small',
      'retail',
      'employee',
      'shareholder',
      'total',
    ]);
    expect(demand?.rows.at(-1)).toMatchObject({ sharesOffered: 8_471_153, sharesBid: 4_838_948 });
  });
});

describe('parseBseDemand fallbacks', () => {
  it('treats an empty SME answer as no figure', () => {
    expect(parseBseDemand(json('bse-cumulative-demand-8015-sme.json'))).toBeNull();
  });
  it('reads the book-building table as BSE-only bids', () => {
    const demand = parseBseDemand(json('bse-bkbldg-demand-8020.json'));
    expect(demand?.scope).toBe('bse');
    // "10/1/2026 5:00:00 PM" IST.
    expect(demand?.asOf?.toISOString()).toBe('2026-10-01T11:30:00.000Z');
    expect(demand?.rows.find((r) => r.category === 'qib')?.sharesBid).toBe(0);
  });
});

describe('listings and the end-of-day file', () => {
  it('reads mainboard and SME new listings with the issue price', () => {
    const main = parseBseListings(json('bse-listings-20261001.json'), 'mainboard');
    expect(main.find((r) => r.ticker === 'AONESTEELS')).toMatchObject({
      symbol: '544952',
      listingDate: '2026-10-01',
      issuePricePaise: 40_500,
    });
    const sme = parseBseListings(json('bse-listings-sme-20260929.json'), 'sme');
    expect(sme.find((r) => r.companyName === 'Roopa Screen Limited')).toMatchObject({
      symbol: '544954',
      ticker: 'ROOPA',
      issuePricePaise: 6_400,
      listingDate: '2026-10-01',
      series: 'SME',
    });
  });
  it('reads the bhavcopy with a null previous close on listing day', () => {
    const rows = parseBseBhavcopy(fixture('bse-bhavcopy-20261001.csv'), 'https://x');
    expect(rows.find((r) => r.symbol === '544952')).toMatchObject({
      isin: 'INE0OTC01025',
      tradingDate: '2026-10-01',
      prevClosePaise: null,
      openPaise: 46_200,
      closePaise: 41_700,
    });
    expect(rows.find((r) => r.symbol === '500325')?.prevClosePaise).toBe(118_750);
    expect(() => parseBseBhavcopy('<html>', 'https://x')).toThrow();
  });
});

describe('small readers', () => {
  it('dates, cut-off, parties, URL code', () => {
    expect(parseBseDay('30 Sep 2026')).toBe('2026-09-30');
    expect(parseBseDay('05th Octomber 2026')).toBe('2026-10-05');
    expect(parseBseCutoff('07th October 2026 (Upto 5.00 PM)')?.toISOString()).toBe(
      '2026-10-07T11:30:00.000Z',
    );
    expect(bseParties('A Limited^addr||||||||a@x.in|Person~B Limited^addr2')).toEqual([
      'A Limited',
      'B Limited',
    ]);
    expect(
      tickerAndCode('https://www.bseindia.com/stock-share-price/roopa-screen-ltd/roopa/544954/'),
    ).toEqual({
      ticker: 'ROOPA',
      code: '544954',
    });
  });
});
