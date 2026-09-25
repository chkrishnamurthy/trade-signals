import { describe, expect, it } from 'vitest';
import { exchangeOf, listingKey, parseListingKey } from './listing.js';

describe('listing keys', () => {
  it('names an NSE listing by its bare symbol, so existing keys stay valid', () => {
    expect(listingKey({ symbol: 'RELIANCE' })).toBe('RELIANCE');
    expect(listingKey({ symbol: 'RELIANCE', exchange: 'NSE' })).toBe('RELIANCE');
  });

  it('qualifies a BSE listing so it never collides with the NSE one', () => {
    expect(listingKey({ symbol: 'RELIANCE', exchange: 'BSE' })).toBe('BSE:RELIANCE');
  });

  it('round-trips, keeping hyphens and ampersands in the symbol', () => {
    for (const ref of [
      { symbol: 'M&M', exchange: 'NSE' },
      { symbol: 'BAJAJ-AUTO', exchange: 'BSE' },
      { symbol: 'SENSEX', exchange: 'BSE' },
    ] as const) {
      expect(parseListingKey(listingKey(ref))).toEqual(ref);
    }
  });

  it('treats an unknown prefix as part of the symbol, not an exchange', () => {
    expect(parseListingKey('MCX:GOLD')).toEqual({ symbol: 'MCX:GOLD', exchange: 'NSE' });
    expect(parseListingKey('bse:TCS')).toEqual({ symbol: 'TCS', exchange: 'BSE' });
  });

  it('defaults an unqualified ref to NSE', () => {
    expect(exchangeOf({})).toBe('NSE');
    expect(exchangeOf({ exchange: 'BSE' })).toBe('BSE');
  });
});
