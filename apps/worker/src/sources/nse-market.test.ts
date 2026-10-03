import { describe, expect, it } from 'vitest';
import {
  parseBhavdataBars,
  parseCorporateActions,
  parseEquityList,
  parseIndexConstituents,
} from './nse-market.js';

// Header and rows copied from NSE's live files on 2026-10-03.
const EQUITY_L = `SYMBOL,NAME OF COMPANY, SERIES, DATE OF LISTING, PAID UP VALUE, MARKET LOT, ISIN NUMBER, FACE VALUE
20MICRONS,20 Microns Limited,EQ,06-OCT-2008,5,1,INE144J01027,5
21STCENMGM,21st Century Management Services Limited,BE,03-MAY-1995,10,1,INE253B01015,10
360ONE,360 ONE WAM LIMITED,EQ,19-SEP-2019,1,1,INE466L01038,1
SMESTOCK,Some SME Limited,SM,01-JAN-2024,10,1,INE000X01011,10
BADISIN,Broken Isin Limited,EQ,01-JAN-2020,10,1,NOTANISIN,10`;

const INDEX = `Company Name,Industry,Symbol,Series,ISIN Code
360 ONE WAM Ltd.,Financial Services,360ONE,EQ,INE466L01038
ABB India Ltd.,Capital Goods,ABB,EQ,INE117A01022`;

// Real 2 Jan 2025 rows, plus synthetic ones exercising the guards.
const BHAV = `SYMBOL, SERIES, DATE1, PREV_CLOSE, OPEN_PRICE, HIGH_PRICE, LOW_PRICE, LAST_PRICE, CLOSE_PRICE, AVG_PRICE, TTL_TRD_QNTY, TURNOVER_LACS, NO_OF_TRADES, DELIV_QTY, DELIV_PER
1018GS2026, GS, 02-Jan-2025, 112.00, 113.00, 113.00, 110.50, 110.50, 110.50, 110.79, 1200, 1.33, 4, 1200, 100.00
20MICRONS, BE, 02-Jan-2025, 236.81, 239.40, 248.65, 236.12, 248.65, 248.65, 242.68, 82081, 199.20, 671, -, -
DUALSER, BE, 02-Jan-2025, 100.00, 101.00, 102.00, 99.00, 101.50, 101.50, 101.00, 10, 0.01, 1, -, -
DUALSER, EQ, 02-Jan-2025, 100.00, 101.10, 102.10, 99.10, 101.60, 101.60, 101.10, 20, 0.02, 2, 10, 50.00
BADBAR, EQ, 02-Jan-2025, 100.00, 101.00, 99.00, 98.00, 100.00, 100.00, 100.00, 10, 0.01, 1, 5, 50.00`;

describe('parseEquityList', () => {
  it('keeps EQ/BE/BZ rows with a valid ISIN, in paise', () => {
    const rows = parseEquityList(EQUITY_L);
    expect(rows.map((r) => r.symbol)).toEqual(['20MICRONS', '21STCENMGM', '360ONE']);
    expect(rows[0]).toEqual({
      symbol: '20MICRONS',
      name: '20 Microns Limited',
      series: 'EQ',
      isin: 'INE144J01027',
      listingDate: '2008-10-06',
      faceValuePaise: 500,
    });
    expect(rows[1]?.series).toBe('BE');
  });
});

describe('parseIndexConstituents', () => {
  it('reads symbol and industry', () => {
    expect(parseIndexConstituents(INDEX)).toEqual([
      { symbol: '360ONE', industry: 'Financial Services' },
      { symbol: 'ABB', industry: 'Capital Goods' },
    ]);
  });
});

describe('parseBhavdataBars', () => {
  const bars = parseBhavdataBars(BHAV);

  it('skips non-equity series and keeps BE rows without delivery', () => {
    expect(bars.map((b) => b.symbol).sort()).toEqual(['20MICRONS', 'DUALSER']);
  });

  it('converts rupees to paise exactly and lakh turnover to paise', () => {
    const micron = bars.find((b) => b.symbol === '20MICRONS');
    // 248.65 → 24865 paise; 199.20 lakh → ₹1,99,20,000 → 1,992,000,000 paise
    expect(micron).toMatchObject({
      tradingDate: '2025-01-02',
      open: 23940,
      high: 24865,
      low: 23612,
      close: 24865,
      volume: 82081,
      trades: 671,
      turnoverPaise: 1_992_000_000,
    });
  });

  it('prefers the EQ row when a symbol appears in two series', () => {
    expect(bars.find((b) => b.symbol === 'DUALSER')?.series).toBe('EQ');
  });

  it('drops incoherent OHLC rather than failing the batch', () => {
    // BADBAR: high 99 below open 101
    expect(bars.some((b) => b.symbol === 'BADBAR')).toBe(false);
  });
});

describe('parseCorporateActions', () => {
  it('reads the API rows and ISO ex-dates', () => {
    const rows = parseCorporateActions([
      { symbol: 'SURYAROSNI', series: 'EQ', subject: 'Bonus 1:1', exDate: '01-Jan-2025', comp: 'x' },
      { symbol: 'BAD', subject: 'Bonus 1:1', exDate: 'not a date' },
      { nope: true },
    ]);
    expect(rows).toEqual([
      { symbol: 'SURYAROSNI', series: 'EQ', subject: 'Bonus 1:1', exDate: '2025-01-01' },
    ]);
  });

  it('throws on a non-array payload', () => {
    expect(() => parseCorporateActions({ error: 'blocked' })).toThrow();
  });
});
