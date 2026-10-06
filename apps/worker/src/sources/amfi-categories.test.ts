import { describe, expect, it } from 'vitest';
import { listAmfiFiles, parseAmfiRows } from './amfi-categories.js';

describe('listAmfiFiles', () => {
  it('finds each Excel list on the listing page across host and folder changes, newest first', () => {
    const html = `
      <a href="https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalization31Dec2025.xlsx">Dec</a>
      <a href="https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalization31Dec2025.pdf">pdf</a>
      "https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.xlsx"
      <a href="https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.xlsx">again</a>
      <a href="https://www.amfiindia.com/Themes/Theme1/downloads/Average%20Market%20Capitalization%20of%20Listed%20Companies%20during%20Jul%20-%20Dec%202021.xlsx">old</a>`;
    expect(listAmfiFiles(html)).toEqual([
      {
        periodEnd: '2026-06-30',
        url: 'https://portal.amfiindia.com/spages/AverageMarketCapitalization30Jun2026.xlsx',
      },
      {
        periodEnd: '2025-12-31',
        url: 'https://www.amfiindia.com/Themes/Theme1/downloads/AverageMarketCapitalization31Dec2025.xlsx',
      },
    ]);
  });
  it('finds nothing on a page with no list', () => {
    expect(listAmfiFiles('<html>nothing</html>')).toEqual([]);
  });
});

// The layout of AMFI's sheet for the six months ended 30 Jun 2026 (a title row, then the headings).
const HEADER = [
  'Sr. No.',
  'Company name',
  'ISIN',
  'BSE Symbol',
  'BSE 6 month Avg Total Market Cap in (Rs. Crs.)',
  'NSE Symbol',
  'NSE 6 month Avg Total Market Cap (Rs. Crs.)',
  'MSEI Symbol',
  'MSEI 6 month Avg Total Market Cap in (Rs Crs.)',
  'Average of All Exchanges (Rs. Cr.)',
  'Categorization as per SEBI Circular dated Oct 6, 2017',
];

describe('parseAmfiRows', () => {
  it('reads ISIN, NSE symbol and category by heading, skipping the title and bad rows', () => {
    const rows = parseAmfiRows([
      [
        'Average Market Capitalization of listed companies during the six months ended 30 June 2026',
      ],
      HEADER,
      [
        1,
        'Reliance Industries Ltd',
        'INE002A01018',
        'RELIANCE',
        1873294.7,
        'RELIANCE',
        1873278.8,
        '-',
        null,
        1873286.8,
        'Large Cap',
      ],
      [150, 'Mid Co Ltd', 'INE111A01010', 'MIDCO', 9000, 'MIDCO', 9000, '-', null, 9000, 'Mid Cap'],
      [
        5425,
        'BSE Only Ltd',
        'INE825M01017',
        'ANTARIKSH',
        0.04,
        '-',
        null,
        '-',
        null,
        0.04,
        'Small Cap',
      ],
      [9, 'No category', 'INE222A01011', 'X', 1, 'X', 1, '-', null, 1, ''],
      [10, 'Bad ISIN', 'NOT-AN-ISIN', 'Y', 1, 'Y', 1, '-', null, 1, 'Large Cap'],
      [11, 'Odd category', 'INE333A01012', 'Z', 1, 'Z', 1, '-', null, 1, 'Micro Cap'],
    ]);
    expect(rows).toEqual([
      { isin: 'INE002A01018', nseSymbol: 'RELIANCE', category: 'large' },
      { isin: 'INE111A01010', nseSymbol: 'MIDCO', category: 'mid' },
      { isin: 'INE825M01017', nseSymbol: null, category: 'small' },
    ]);
  });
  it('reads nothing from a sheet without the headings it needs', () => {
    expect(
      parseAmfiRows([
        ['a', 'b'],
        [1, 2],
      ]),
    ).toEqual([]);
    expect(parseAmfiRows([['ISIN', 'Company']])).toEqual([]);
  });
});
