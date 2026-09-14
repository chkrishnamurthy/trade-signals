import { describe, expect, it } from 'vitest';
import { applyLiveQuote, applyLiveQuotes, overlayNewerQuotes } from './watchlist-live';
import type { LiveQuoteDto, WatchlistRowDto } from './watchlist-types';

/** Prices are PAISE: 250000 is ₹2,500. */
function row(overrides: Partial<WatchlistRowDto> = {}): WatchlistRowDto {
  return {
    instrumentId: 1,
    symbol: 'RELIANCE',
    name: 'Reliance Industries',
    exchange: 'NSE',
    sector: 'Energy',
    note: null,
    addedAt: '2026-09-01T00:00:00.000Z',
    ltp: 250000,
    change: 2500,
    changePercent: 1.0101,
    open: 248000,
    dayHigh: 251000,
    dayLow: 247000,
    previousClose: 247500,
    averagePrice: 249000,
    volume: 1_000_000,
    quoteAt: '2026-09-14T09:30:00.000Z',
    indicatorDate: '2026-09-12',
    rsi14: 55,
    ema20: null,
    ema50: null,
    ema200: null,
    sma20: null,
    sma50: null,
    macdHistogram: null,
    atr14: null,
    high52w: null,
    low52w: null,
    averageVolume: null,
    relativeVolume: null,
    previousVolume: null,
    returnCloses: {},
    signal: null,
    ...overrides,
  };
}

function tick(overrides: Partial<LiveQuoteDto> = {}): LiveQuoteDto {
  return {
    symbol: 'RELIANCE',
    ltp: 252000,
    volume: 1_200_000,
    at: '2026-09-14T09:30:05.000Z',
    ...overrides,
  };
}

describe('applyLiveQuote', () => {
  it('moves the price and recomputes change against the previous close', () => {
    const next = applyLiveQuote(row(), tick());
    expect(next.ltp).toBe(252000);
    expect(next.change).toBe(4500);
    expect(next.changePercent).toBeCloseTo((4500 / 247500) * 100, 6);
    expect(next.volume).toBe(1_200_000);
    expect(next.quoteAt).toBe('2026-09-14T09:30:05.000Z');
  });

  it('stretches the day range when the price prints outside it', () => {
    expect(applyLiveQuote(row(), tick({ ltp: 253000 })).dayHigh).toBe(253000);
    expect(applyLiveQuote(row(), tick({ ltp: 246000 })).dayLow).toBe(246000);
    // Inside the range: untouched.
    const inside = applyLiveQuote(row(), tick({ ltp: 249000 }));
    expect(inside.dayHigh).toBe(251000);
    expect(inside.dayLow).toBe(247000);
  });

  it('returns the same object when nothing moved', () => {
    const before = row();
    expect(applyLiveQuote(before, tick({ ltp: 250000, volume: 1_000_000 }))).toBe(before);
    // A tick with no volume and the same price is also not a change.
    expect(applyLiveQuote(before, tick({ ltp: 250000, volume: null }))).toBe(before);
  });

  it('keeps the row volume when the tick has none', () => {
    expect(applyLiveQuote(row(), tick({ volume: null })).volume).toBe(1_000_000);
  });

  it('ignores a tick older than the price already shown', () => {
    const before = row();
    expect(applyLiveQuote(before, tick({ at: '2026-09-14T09:29:00.000Z' }))).toBe(before);
  });

  it('applies to a row that has no quote yet', () => {
    const next = applyLiveQuote(
      row({ ltp: null, change: null, changePercent: null, previousClose: null, quoteAt: null }),
      tick(),
    );
    expect(next.ltp).toBe(252000);
    // No previous close: the change cannot be computed and stays absent.
    expect(next.change).toBeNull();
    expect(next.changePercent).toBeNull();
  });

  it('never touches what a tick does not carry', () => {
    const before = row();
    const next = applyLiveQuote(before, tick());
    expect(next.previousClose).toBe(before.previousClose);
    expect(next.open).toBe(before.open);
    expect(next.rsi14).toBe(before.rsi14);
    expect(next.returnCloses).toBe(before.returnCloses);
  });
});

describe('applyLiveQuotes', () => {
  it('patches only matching rows and keeps untouched rows by reference', () => {
    const a = row({ instrumentId: 1, symbol: 'RELIANCE' });
    const b = row({ instrumentId: 2, symbol: 'TCS' });
    const next = applyLiveQuotes([a, b], [tick()]);
    expect(next[0]?.ltp).toBe(252000);
    expect(next[1]).toBe(b);
  });

  it('returns the same array when no quote matches or moves anything', () => {
    const rows = [row()];
    expect(applyLiveQuotes(rows, [])).toBe(rows);
    expect(applyLiveQuotes(rows, [tick({ symbol: 'NOPE' })])).toBe(rows);
    expect(applyLiveQuotes(rows, [tick({ ltp: 250000, volume: 1_000_000 })])).toBe(rows);
  });
});

describe('overlayNewerQuotes', () => {
  it('re-applies only quotes newer than the poll', () => {
    const held = new Map<string, LiveQuoteDto>([
      ['RELIANCE', tick({ at: '2026-09-14T09:31:00.000Z', ltp: 255000 })],
      ['TCS', tick({ symbol: 'TCS', at: '2026-09-14T09:29:00.000Z', ltp: 999 })],
    ]);
    const polled = [
      row({ instrumentId: 1, symbol: 'RELIANCE' }),
      row({ instrumentId: 2, symbol: 'TCS', ltp: 400000 }),
    ];
    const next = overlayNewerQuotes(polled, held, '2026-09-14T09:30:30.000Z');
    expect(next[0]?.ltp).toBe(255000);
    expect(next[1]?.ltp).toBe(400000);
  });
});
