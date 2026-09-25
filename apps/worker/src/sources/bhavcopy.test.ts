import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import {
  BhavcopyNotPublishedError,
  bhavcopyUrl,
  createBhavcopySource,
  isScreenableEquity,
  parseBhavcopy,
  unzipSingleFile,
} from './bhavcopy.js';

/** Real rows from both exchanges' 2026-09-24 UDiFF bhavcopies. */
const fixture = (name: string): Buffer => readFileSync(join(import.meta.dirname, 'fixtures', name));

describe('parseBhavcopy — BSE', () => {
  const { rows, skipped } = parseBhavcopy(fixture('bse-bhavcopy-sample.csv').toString(), 'BSE');
  const bySymbol = new Map(rows.map((row) => [row.symbol, row]));

  it('keeps main-board equities of every group, with scrip code, ISIN and group', () => {
    expect([...bySymbol.keys()].sort()).toEqual(['ABB', 'BHAGGAS', 'BOMDYEING', 'M&M', 'RELIANCE']);
    expect(bySymbol.get('RELIANCE')).toEqual({
      exchange: 'BSE',
      tradingDate: '2026-09-24',
      symbol: 'RELIANCE',
      exchangeCode: '500325',
      isin: 'INE002A01018',
      series: 'A',
      name: 'RELIANCE INDUSTRIES LTD.',
      open: 1238_00,
      high: 1242_00,
      low: 1219_00,
      close: 1219_00,
      previousClose: expect.any(Number),
      volume: 1453295,
      value: expect.any(Number),
      trades: expect.any(Number),
    });
    expect(bySymbol.get('BHAGGAS')?.series).toBe('XT');
    expect(skipped).toEqual([]);
  });

  it('converts rupee decimals to exact paise', () => {
    expect(bySymbol.get('ABB')).toMatchObject({
      open: 7104_65,
      high: 7140_60,
      low: 7075_00,
      close: 7115_00,
    });
  });

  it('drops fund units, ETFs in group F, and SME listings', () => {
    expect(bySymbol.has('SENSEX1')).toBe(false); // INF… MF unit in group B
    expect(bySymbol.has('LIQUIDETF')).toBe(false); // group F
    expect(bySymbol.has('TARINI')).toBe(false); // SME group M
  });
});

describe('parseBhavcopy — NSE', () => {
  const { rows } = parseBhavcopy(fixture('nse-bhavcopy-sample.csv').toString(), 'NSE');

  it('keeps EQ and BE series, drops SME and gold bonds', () => {
    expect(rows.map((r) => `${r.symbol}:${r.series}`).sort()).toEqual([
      '3IINFOLTD:BE',
      'M&M:EQ',
      'RELIANCE:EQ',
    ]);
    expect(rows.find((r) => r.symbol === 'RELIANCE')).toMatchObject({
      exchange: 'NSE',
      exchangeCode: '2885',
      close: 1219_20,
      volume: 13923795,
    });
  });
});

describe('parseBhavcopy — malformed input', () => {
  const header =
    'TradDt,BizDt,Sgmt,Src,FinInstrmTp,FinInstrmId,ISIN,TckrSymb,SctySrs,XpryDt,FininstrmActlXpryDt,StrkPric,OptnTp,FinInstrmNm,OpnPric,HghPric,LwPric,ClsPric,LastPric,PrvsClsgPric,UndrlygPric,SttlmPric,OpnIntrst,ChngInOpnIntrst,TtlTradgVol,TtlTrfVal,TtlNbOfTxsExctd,SsnId,NewBrdLotQty,Rmks,Rsvd1,Rsvd2,Rsvd3,Rsvd4';
  const row = (open: string, high: string, low: string, close: string): string =>
    `2026-09-24,2026-09-24,CM,BSE,STK,500002,INE117A01022,ABB,A,,,,,ABB INDIA LIMITED,${open},${high},${low},${close},${close},7106.00,,,,,3402,24208926.00,751,F1,1,,,,,`;

  it('records an in-scope row with inconsistent OHLC instead of storing it', () => {
    const { rows, skipped } = parseBhavcopy(`${header}\n${row('10', '9', '8', '9')}`, 'BSE');
    expect(rows).toEqual([]);
    expect(skipped).toEqual([{ line: 2, reason: 'OHLC out of order' }]);
  });

  it('records a non-numeric price', () => {
    const { skipped } = parseBhavcopy(`${header}\n${row('x', '9', '8', '9')}`, 'BSE');
    expect(skipped[0]?.reason).toMatch(/not a price/);
  });

  it('fails loudly on a header it does not recognise', () => {
    expect(() => parseBhavcopy('SYMBOL,OPEN\nABB,1', 'BSE')).toThrow(/missing/);
  });
});

describe('isScreenableEquity', () => {
  it('applies each exchange its own series rules', () => {
    expect(isScreenableEquity('NSE', 'INE002A01018', 'EQ')).toBe(true);
    expect(isScreenableEquity('NSE', 'INE002A01018', 'A')).toBe(false);
    expect(isScreenableEquity('BSE', 'INE002A01018', 'A')).toBe(true);
    expect(isScreenableEquity('BSE', 'INE002A01018', 'EQ')).toBe(false);
  });
});

describe('transport', () => {
  it('builds each exchange’s documented URL', () => {
    expect(bhavcopyUrl('BSE', '2026-09-24')).toBe(
      'https://www.bseindia.com/download/BhavCopy/Equity/BhavCopy_BSE_CM_0_0_0_20260924_F_0000.CSV',
    );
    expect(bhavcopyUrl('NSE', '2026-09-24')).toBe(
      'https://nsearchives.nseindia.com/content/cm/BhavCopy_NSE_CM_0_0_0_20260924_F_0000.csv.zip',
    );
  });

  it('unzips NSE’s single-file archive', () => {
    const csv = unzipSingleFile(fixture('nse-bhavcopy-sample.csv.zip'));
    expect(csv).toBe(fixture('nse-bhavcopy-sample.csv').toString());
  });

  it('fetches and parses both exchanges', async () => {
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      const body = String(url).includes('bseindia')
        ? fixture('bse-bhavcopy-sample.csv')
        : fixture('nse-bhavcopy-sample.csv.zip');
      return new Response(new Uint8Array(body), { status: 200 });
    }) as unknown as typeof fetch;
    const source = createBhavcopySource(fetchImpl);
    expect((await source.fetch('BSE', '2026-09-24')).rows).toHaveLength(5);
    expect((await source.fetch('NSE', '2026-09-24')).rows).toHaveLength(3);
  });

  it('reports a missing file, or an HTML page in its place, as not published', async () => {
    const missing = createBhavcopySource(
      vi.fn(async () => new Response('', { status: 404 })) as unknown as typeof fetch,
    );
    await expect(missing.fetch('BSE', '2026-09-26')).rejects.toBeInstanceOf(
      BhavcopyNotPublishedError,
    );
    const html = createBhavcopySource(
      vi.fn(
        async () => new Response('<html>busy</html>', { status: 200 }),
      ) as unknown as typeof fetch,
    );
    await expect(html.fetch('BSE', '2026-09-26')).rejects.toBeInstanceOf(BhavcopyNotPublishedError);
  });
});
