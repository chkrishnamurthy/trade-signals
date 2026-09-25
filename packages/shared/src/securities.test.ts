import { describe, expect, it } from 'vitest';
import { isBseEquityRow, isEquityIsin, isTradeForTrade } from './securities.js';

describe('isEquityIsin', () => {
  it('accepts equity-share ISINs and rejects debt, G-secs and fund units', () => {
    expect(isEquityIsin('INE002A01018')).toBe(true); // Reliance
    expect(isEquityIsin('INE0TE101010')).toBe(true);
    expect(isEquityIsin('INE549A08963')).toBe(false); // debenture (type 08)
    expect(isEquityIsin('INF204KB17R6')).toBe(false); // MF unit
    expect(isEquityIsin('IN0020200104')).toBe(false); // sovereign gold bond
    expect(isEquityIsin('')).toBe(false);
  });
});

describe('isBseEquityRow', () => {
  it('needs both an equity ISIN and a main-board group', () => {
    expect(isBseEquityRow('INE002A01018', 'A')).toBe(true);
    expect(isBseEquityRow('INE748C01038', 'XT')).toBe(true);
    expect(isBseEquityRow('INE0TE101010', 'M')).toBe(false); // SME
    expect(isBseEquityRow('INF204KB17R6', 'B')).toBe(false); // fund unit in group B
  });
});

describe('isTradeForTrade', () => {
  it('flags BSE T-groups and NSE BE/BZ, and nothing unknown', () => {
    expect(isTradeForTrade('BSE', 'T')).toBe(true);
    expect(isTradeForTrade('BSE', 'XT')).toBe(true);
    expect(isTradeForTrade('BSE', 'A')).toBe(false);
    expect(isTradeForTrade('NSE', 'BE')).toBe(true);
    expect(isTradeForTrade('NSE', 'EQ')).toBe(false);
    expect(isTradeForTrade('BSE', null)).toBe(false);
  });
});
