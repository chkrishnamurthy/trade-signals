import { describe, expect, it } from 'vitest';
import { secondaryListings } from './compute-indicators.js';

describe('secondaryListings', () => {
  const rows = [
    { exchange: 'NSE', isin: 'INE002A01018' }, // RELIANCE on NSE
    { exchange: 'BSE', isin: 'INE002A01018' }, // RELIANCE on BSE
    { exchange: 'BSE', isin: 'INE454F01010' }, // 7SEASL, BSE only
    { exchange: 'BSE', isin: null }, // not yet synced: never suppressed
  ];
  const isSecondary = secondaryListings(rows);

  it('marks the BSE listing of a company that trades on NSE as secondary', () => {
    expect(rows.map(isSecondary)).toEqual([false, true, false, false]);
  });
});
