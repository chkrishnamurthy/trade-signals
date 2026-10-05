import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseIndexCloses, parseOldBhavcopy } from './nse-index-tax.js';
import { firstZipEntry } from './zip.js';

const fixture = (name: string) => readFileSync(new URL(`./__fixtures__/${name}`, import.meta.url));

describe('parseIndexCloses (NSE ind_close_all, 1 Oct 2026)', () => {
  it('reads Nifty 50 and Nifty 500 in paise and ignores other indices', () => {
    const rows = parseIndexCloses(fixture('ind_close_all_01102026.csv').toString('utf8'));
    expect(rows).toEqual([
      {
        symbol: 'NIFTY50',
        name: 'Nifty 50',
        date: '2026-10-01',
        openPaise: 2_254_370,
        highPaise: 2_261_060,
        lowPaise: 2_221_730,
        closePaise: 2_242_195,
      },
      {
        symbol: 'NIFTY500',
        name: 'Nifty 500',
        date: '2026-10-01',
        openPaise: 2_200_500,
        highPaise: 2_204_680,
        lowPaise: 2_162_325,
        closePaise: 2_185_775,
      },
    ]);
  });
  it('drops an incoherent row', () => {
    const csv =
      'Index Name,Index Date,Open Index Value,High Index Value,Low Index Value,Closing Index Value\nNifty 50,01-10-2026,10,9,8,11\n';
    expect(parseIndexCloses(csv)).toEqual([]);
  });
});

describe('the 31 Jan 2018 bhavcopy (zipped, old format)', () => {
  it('unzips and reads the highest price per ISIN, preferring EQ', () => {
    const { name, data } = firstZipEntry(fixture('cm31JAN2018bhav.csv.zip'));
    expect(name).toBe('cm31JAN2018bhav.csv');
    const rows = parseOldBhavcopy(data.toString('utf8'));
    expect(rows.find((r) => r.symbol === 'ITC')).toEqual({
      isin: 'INE154A01025',
      symbol: 'ITC',
      series: 'EQ',
      highPaise: 27_600,
      closePaise: 27_140,
    });
    expect(rows.find((r) => r.symbol === 'HDFCBANK')?.highPaise).toBe(201_350);
    expect(rows).toHaveLength(5);
  });
  it('refuses something that is not a zip', () => {
    expect(() => firstZipEntry(new Uint8Array([1, 2, 3]))).toThrow(/zip/);
  });
});
