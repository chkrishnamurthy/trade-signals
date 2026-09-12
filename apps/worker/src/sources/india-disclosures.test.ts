import { describe, expect, it } from 'vitest';
import {
  croreToPaise,
  parseBseAnnouncements,
  parseDdMonYyyy,
  parseIstTimestamp,
  parseNseDeals,
  parseNseFiiDii,
  parseShareholding,
} from './india-disclosures.js';

describe('date & money helpers', () => {
  it('parses a DD-Mon-YYYY date to an ISO key', () => {
    expect(parseDdMonYyyy('11-Sep-2026')).toBe('2026-09-11');
    expect(parseDdMonYyyy('01-Jan-2027')).toBe('2027-01-01');
  });

  it('returns null for an unparseable date', () => {
    expect(parseDdMonYyyy('not a date')).toBeNull();
  });

  it('reads an IST wall-clock timestamp as the correct UTC instant', () => {
    // 16:30 IST is 11:00 UTC.
    expect(parseIstTimestamp('2026-09-11T16:30:00').toISOString()).toBe('2026-09-11T11:00:00.000Z');
  });

  it('converts crore to integer paise', () => {
    expect(croreToPaise(1)).toBe(1_000_000_000);
    expect(croreToPaise(-1234)).toBe(-1_234_000_000_000);
  });
});

describe('parseBseAnnouncements', () => {
  it('maps a BSE announcement row into the neutral shape', () => {
    const payload = {
      Table: [
        {
          NEWSID: 'N123',
          SCRIP_CD: 500325,
          SLONGNAME: 'Reliance Industries Ltd',
          HEADLINE: 'Board Meeting Outcome',
          NEWSSUB: 'Approved quarterly results',
          CATEGORYNAME: 'Result',
          NEWS_DT: '2026-09-11T16:30:00',
          ATTACHMENTNAME: 'abc.pdf',
        },
      ],
    };
    const rows = parseBseAnnouncements(payload);
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.source).toBe('bse');
    expect(row?.externalId).toBe('N123');
    expect(row?.symbol).toBe('500325');
    expect(row?.category).toBe('Result');
    expect(row?.headline).toBe('Board Meeting Outcome');
    expect(row?.attachmentUrl).toContain('abc.pdf');
    expect(row?.announcedAt.toISOString()).toBe('2026-09-11T11:00:00.000Z');
  });

  it('skips rows with no headline and tolerates a missing Table', () => {
    expect(parseBseAnnouncements({ Table: [{ NEWSID: 'x' }] })).toHaveLength(0);
    expect(parseBseAnnouncements({})).toHaveLength(0);
    expect(parseBseAnnouncements(null)).toHaveLength(0);
  });
});

describe('parseNseFiiDii', () => {
  it('classifies participants and converts crore values to paise', () => {
    const payload = [
      {
        category: 'FII/FPI **',
        date: '11-Sep-2026',
        buyValue: '12,000.50',
        sellValue: '10,000.50',
        netValue: '2,000.00',
      },
      { category: 'DII **', date: '11-Sep-2026', buyValue: 8000, sellValue: 9000, netValue: -1000 },
    ];
    const rows = parseNseFiiDii(payload);
    expect(rows).toHaveLength(2);
    expect(rows[0]?.participant).toBe('fii');
    expect(rows[0]?.netPaise).toBe(croreToPaise(2000));
    expect(rows[0]?.tradingDate).toBe('2026-09-11');
    expect(rows[1]?.participant).toBe('dii');
    expect(rows[1]?.netPaise).toBe(croreToPaise(-1000));
  });

  it('drops rows with an unparseable date and tolerates non-arrays', () => {
    expect(
      parseNseFiiDii([{ category: 'FII', date: 'bad', buyValue: 1, sellValue: 1, netValue: 0 }]),
    ).toHaveLength(0);
    expect(parseNseFiiDii({})).toHaveLength(0);
  });
});

describe('parseNseDeals', () => {
  it('maps deal fields, side and price to paise', () => {
    const payload = {
      data: [
        {
          BD_SYMBOL: 'INFY',
          BD_SCRIP_NAME: 'Infosys Limited',
          BD_CLIENT_NAME: 'Morgan Stanley',
          BD_BUY_SELL: 'SELL',
          BD_QTY_TRD: '1,100,000',
          BD_TP_WATP: '1540.25',
          BD_DT_DATE: '11-Sep-2026',
        },
      ],
    };
    const rows = parseNseDeals(payload, 'block');
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.dealType).toBe('block');
    expect(row?.symbol).toBe('INFY');
    expect(row?.side).toBe('sell');
    expect(row?.quantity).toBe(1_100_000);
    expect(row?.pricePaise).toBe(154_025);
    expect(row?.tradingDate).toBe('2026-09-11');
    // The dedup key is stable across the identifying fields.
    expect(row?.externalId).toContain('block');
    expect(row?.externalId).toContain('INFY');
  });

  it('defaults an unknown side to buy and skips symbol-less rows', () => {
    expect(parseNseDeals([{ symbol: '', watp: 1 }], 'bulk')).toHaveLength(0);
    const rows = parseNseDeals([{ symbol: 'TCS', watp: 100, quantity: 10 }], 'bulk');
    expect(rows[0]?.side).toBe('buy');
  });
});

describe('parseShareholding', () => {
  it('maps a normalised shareholding row', () => {
    const rows = parseShareholding([
      {
        symbol: 'HDFCBANK',
        name: 'HDFC Bank',
        asOf: '2026-06-30',
        promoter: 25.5,
        fii: 40.2,
        dii: 20.1,
        public: 14.2,
      },
    ]);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.symbol).toBe('HDFCBANK');
    expect(rows[0]?.promoterPercent).toBe(25.5);
    expect(rows[0]?.publicPercent).toBe(14.2);
  });

  it('tolerates missing optional percentages', () => {
    const rows = parseShareholding([{ symbol: 'X', asOf: '2026-06-30' }]);
    expect(rows[0]?.fiiPercent).toBeNull();
  });
});
