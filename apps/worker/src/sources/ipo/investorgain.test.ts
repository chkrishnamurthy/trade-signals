import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  exchangeTag,
  extractRows,
  parseGmpCell,
  parseInvestorGainPage,
  parseUpdatedOn,
} from './investorgain.js';

// A reconstructed copy of the live page of 2 Oct 2026 (see __fixtures__/README.md).
const page = readFileSync(
  new URL('./__fixtures__/investorgain-gmp-live.html', import.meta.url),
  'utf8',
);

describe('parseInvestorGainPage', () => {
  const quotes = parseInvestorGainPage(page);

  it('reads every row across the split flight-data chunks', () => {
    expect(quotes).toHaveLength(10);
  });

  it('reads a positive GMP with its range and IST update time (Vishal Nirmiti)', () => {
    expect(quotes.find((q) => q.companyName === 'Vishal Nirmiti')).toMatchObject({
      source: 'investorgain',
      externalKey: 'investorgain:1602',
      board: 'mainboard',
      exchange: null,
      openDate: '2026-09-30',
      closeDate: '2026-10-05',
      gmpPaise: 2_000,
      rangeLowPaise: 200,
      rangeHighPaise: 2_000,
      pageUrl: 'https://www.investorgain.com/gmp/vishal-nirmiti-ipo/1602/',
    });
    // "2-Oct 7:02" IST = 01:32 UTC.
    expect(quotes.find((q) => q.companyName === 'Vishal Nirmiti')?.updatedAt?.toISOString()).toBe(
      '2026-10-02T01:32:00.000Z',
    );
  });

  it('keeps a discount negative and decimals exact', () => {
    expect(quotes.find((q) => q.companyName === 'Runwal Enterprises')).toMatchObject({
      gmpPaise: -500,
      rangeLowPaise: -500,
      rangeHighPaise: 3_700,
    });
    expect(quotes.find((q) => q.companyName === 'German Green Steel')?.gmpPaise).toBe(1_350);
  });

  it('reads "--" as no quote, never zero, and tags the SME exchange', () => {
    expect(quotes.find((q) => q.companyName === 'Eventions')).toMatchObject({
      gmpPaise: null,
      rangeLowPaise: null,
      rangeHighPaise: null,
      board: 'sme',
      exchange: 'NSE',
    });
  });

  it('decodes HTML entities in names', () => {
    expect(quotes.some((q) => q.companyName === 'Nityas Gems & Jewellery')).toBe(true);
    expect(quotes.some((q) => q.companyName === "Shah Investor's Home")).toBe(true);
  });

  it('fails loudly on a page without the table', () => {
    expect(() => parseInvestorGainPage('<html><body>maintenance</body></html>')).toThrow(
      /initialTableResponse/,
    );
  });

  it('extracts the page clock used for the year', () => {
    expect(extractRows(page).currentTime).toBe('2026-10-02 07:18:04');
  });
});

describe('cell readers', () => {
  it('parseGmpCell', () => {
    expect(parseGmpCell('&#8377;<b>20</b> (9.09%)<br><small>2 ↓ / 20 ↑</small>')).toEqual({
      gmpPaise: 2_000,
      rangeLowPaise: 200,
      rangeHighPaise: 2_000,
    });
    expect(parseGmpCell('&#8377;<b>--</b> (0.00%) 0 ↓ / 0 ↑')).toEqual({
      gmpPaise: null,
      rangeLowPaise: null,
      rangeHighPaise: null,
    });
  });
  it('parseUpdatedOn rolls a December quote back a year in January', () => {
    expect(parseUpdatedOn('<span>30-Dec 9:30</span>', '2027-01-02 07:00:00')?.toISOString()).toBe(
      '2026-12-30T04:00:00.000Z',
    );
    expect(parseUpdatedOn('no time', '2026-10-02 07:00:00')).toBeNull();
  });
  it('exchangeTag', () => {
    expect(exchangeTag('<b>X</b> <span>BSE SME</span>')).toEqual({ board: 'sme', exchange: 'BSE' });
    expect(exchangeTag('<b>X</b> <span>IPO</span>')).toEqual({
      board: 'mainboard',
      exchange: null,
    });
  });
});
