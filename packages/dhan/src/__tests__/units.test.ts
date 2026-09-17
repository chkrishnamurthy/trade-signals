import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  generateTotp,
  isTokenUsable,
  mintCooldownMs,
  parseExpiryTime,
  TOKEN_LIFETIME_MS,
  tokenExpiry,
} from '../auth.js';
import {
  chunkDaysFor,
  chunkRange,
  intradayHistoryStart,
  istDateTimeKey,
  requestDates,
} from '../candles.js';
import { DhanAuthError, isSubscriptionCode, isTokenExpiryCode } from '../errors.js';
import { backoffDelay, DEFAULT_LIMITS, DOCUMENTED_LIMITS } from '../http.js';
import { InstrumentIndex, parseScripMaster, splitCsvLine, tickSizePaise } from '../instruments.js';
import { chunkRefs, parseTradeTime, toQuote, toQuoteRequestBody } from '../quotes.js';
import { instrumentTypeFor, internalSymbolFor, normaliseTicker, segmentFor } from '../symbols.js';
import { envelopeError, securityKey, toCandles } from '../types.js';
import { fixture, jsonFixture } from './helpers.js';

describe('TOTP', () => {
  it('matches the RFC 6238 test vectors', () => {
    // ASCII secret "12345678901234567890" == base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(generateTotp(secret, 59, 30, 8)).toBe('94287082');
    expect(generateTotp(secret, 1111111109, 30, 8)).toBe('07081804');
    expect(generateTotp(secret, 1234567890, 30, 8)).toBe('89005924');
  });

  it('is stable inside one 30 s step and 6 digits by default', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(generateTotp(secret, 1000)).toMatch(/^\d{6}$/);
    expect(generateTotp(secret, 1000)).toBe(generateTotp(secret, 1019));
    expect(generateTotp(secret, 1000)).not.toBe(generateTotp(secret, 1020));
  });

  it('tolerates spaces and lower case in the seed, rejects a 6-digit code', () => {
    expect(base32Decode('jbsw y3dp ehpk 3pxp')).toEqual(base32Decode('JBSWY3DPEHPK3PXP'));
    expect(() => base32Decode('123456')).toThrow(DhanAuthError);
  });
});

describe('token expiry', () => {
  it('reads expiryTime as IST wall-clock', () => {
    // 23:01:04 IST on 17 Sep = 17:31:04 UTC.
    expect(parseExpiryTime('2026-09-17T23:01:04.777')?.toISOString()).toBe(
      '2026-09-17T17:31:04.000Z',
    );
    expect(parseExpiryTime('garbage')).toBeNull();
  });

  it('never trusts an expiry later than the documented 24 h, and keeps a minute of slack', () => {
    const now = new Date('2026-09-16T17:31:04.000Z');
    const reported = tokenExpiry('2026-09-17T23:01:04.777', now);
    expect(reported.getTime()).toBe(now.getTime() + TOKEN_LIFETIME_MS - 60_000);

    const tooLate = tokenExpiry('2026-09-30T00:00:00', now);
    expect(tooLate.getTime()).toBe(now.getTime() + TOKEN_LIFETIME_MS - 60_000);

    const unparseable = tokenExpiry('??', now);
    expect(unparseable.getTime()).toBe(now.getTime() + TOKEN_LIFETIME_MS - 60_000);
  });

  it('treats a token as unusable when absent, expired, empty, or for another client', () => {
    const now = new Date('2026-09-16T10:00:00Z');
    const live = { accessToken: 'jwt', expiresAt: new Date('2026-09-17T09:00:00Z'), clientId: '1' };
    expect(isTokenUsable(live, '1', now)).toBe(true);
    expect(isTokenUsable(null, '1', now)).toBe(false);
    expect(isTokenUsable({ ...live, expiresAt: now }, '1', now)).toBe(false);
    expect(isTokenUsable({ ...live, accessToken: '' }, '1', now)).toBe(false);
    expect(isTokenUsable(live, '2', now)).toBe(false);
  });
});

describe('mint throttle', () => {
  it('reads the cooldown out of the message', () => {
    expect(mintCooldownMs('Token can be generated once every 2 minutes.')).toBe(120_000);
    expect(mintCooldownMs('once every 30 seconds')).toBe(30_000);
    expect(mintCooldownMs('once every 1 hour')).toBe(3_600_000);
    expect(mintCooldownMs('Invalid TOTP')).toBeNull();
  });
});

describe('error codes', () => {
  it('recognises both code vocabularies for a dead token', () => {
    expect(isTokenExpiryCode('DH-901')).toBe(true);
    expect(isTokenExpiryCode('807')).toBe(true);
    expect(isTokenExpiryCode('809')).toBe(true);
    expect(isTokenExpiryCode('806')).toBe(false);
    expect(isTokenExpiryCode(undefined)).toBe(false);
    expect(isSubscriptionCode('806')).toBe(true);
    expect(isSubscriptionCode('DH-902')).toBe(true);
  });

  it('extracts a code and message from every envelope variant', () => {
    expect(
      envelopeError({
        errorType: 'Invalid_Authentication',
        errorCode: 'DH-901',
        errorMessage: 'x',
      }),
    ).toEqual({
      code: 'DH-901',
      message: 'x',
    });
    expect(
      envelopeError({ status: 'failure', remarks: { error_code: 807, error_message: 'expired' } }),
    ).toEqual({ code: '807', message: 'expired' });
    expect(envelopeError({ status: 'failure', remarks: 'plain text' })).toEqual({
      code: undefined,
      message: 'plain text',
    });
    expect(
      envelopeError({ status: 'error', message: 'Token can be generated once every 2 minutes.' }),
    ).toEqual({ code: undefined, message: 'Token can be generated once every 2 minutes.' });
    expect(envelopeError({ status: 'success', data: {} })).toBeNull();
    expect(envelopeError({ open: [], close: [] })).toBeNull();
  });
});

describe('rate limits', () => {
  it('runs below the documented Data ceiling and at the Quote floor', () => {
    expect(DEFAULT_LIMITS.data.perSecond).toBeLessThan(DOCUMENTED_LIMITS.data.perSecond);
    expect(DEFAULT_LIMITS.data.perDay).toBeLessThan(DOCUMENTED_LIMITS.data.perDay);
    expect(DEFAULT_LIMITS.quote.perSecond).toBe(1);
  });

  it('backs off with full jitter under a ceiling', () => {
    expect(backoffDelay(1, { baseDelayMs: 1000 }, () => 0)).toBe(500);
    expect(backoffDelay(1, { baseDelayMs: 1000 }, () => 1)).toBe(1000);
    expect(backoffDelay(3, { baseDelayMs: 1000 }, () => 1)).toBe(4000);
    expect(backoffDelay(10, { baseDelayMs: 1000, maxDelayMs: 5000 }, () => 1)).toBe(5000);
  });
});

describe('symbols', () => {
  it('maps kinds to segments and instrument types', () => {
    expect(segmentFor('equity')).toBe('NSE_EQ');
    expect(segmentFor('index')).toBe('IDX_I');
    expect(instrumentTypeFor('equity')).toBe('EQUITY');
    expect(instrumentTypeFor('index')).toBe('INDEX');
  });

  it('normalises Dhan index tickers into our vocabulary', () => {
    expect(internalSymbolFor('NIFTY', 'index')).toBe('NIFTY50');
    expect(internalSymbolFor('BANKNIFTY', 'index')).toBe('NIFTYBANK');
    expect(internalSymbolFor('NIFTYNXT50', 'index')).toBe('NIFTYNEXT50');
    expect(internalSymbolFor('MIDCPNIFTY', 'index')).toBe('NIFTYMIDSELECT');
    expect(internalSymbolFor('INDIA VIX', 'index')).toBe('INDIAVIX');
    expect(internalSymbolFor('NIFTY 100', 'index')).toBe('NIFTY100');
    expect(internalSymbolFor('FINNIFTY', 'index')).toBe('FINNIFTY');
    expect(normaliseTicker(' nifty it ')).toBe('NIFTYIT');
  });

  it('leaves equity tickers alone', () => {
    expect(internalSymbolFor('RELIANCE', 'equity')).toBe('RELIANCE');
    expect(internalSymbolFor('BAJAJ-AUTO', 'equity')).toBe('BAJAJ-AUTO');
    expect(internalSymbolFor('M&M', 'equity')).toBe('M&M');
  });

  it('keys a ref by segment and id', () => {
    expect(securityKey({ segment: 'NSE_EQ', securityId: '2885' })).toBe('NSE_EQ:2885');
  });
});

describe('scrip master', () => {
  it('splits quoted fields with embedded commas and quotes', () => {
    expect(splitCsvLine('a,"b, c",d')).toEqual(['a', 'b, c', 'd']);
    expect(splitCsvLine('a,"say ""hi""",d')).toEqual(['a', 'say "hi"', 'd']);
    expect(splitCsvLine('a,,c')).toEqual(['a', '', 'c']);
  });

  it('settles tick size into paise per segment', () => {
    // Verified live rows: YESBANK 1.0000 → ₹0.01, RELIANCE 10.0000 → ₹0.10; indices in rupees.
    expect(tickSizePaise(1, 'equity')).toBe(1);
    expect(tickSizePaise(10, 'equity')).toBe(10);
    expect(tickSizePaise(500, 'equity')).toBe(500);
    expect(tickSizePaise(0.05, 'index')).toBe(5);
  });

  it('keeps NSE cash equities and indices, drops everything else', () => {
    const { instruments, skipped } = parseScripMaster(fixture('scrip-master-excerpt.csv'));
    expect(skipped).toEqual([]);
    const symbols = instruments.map((i) => `${i.kind}:${i.symbol}`).sort();
    expect(symbols).toEqual([
      'equity:EMAMIPAP',
      'equity:IDEA',
      'equity:RELIANCE',
      'equity:TCS',
      'equity:YESBANK',
      'index:INDIAVIX',
      'index:NIFTY100',
      'index:NIFTY50',
      'index:NIFTYBANK',
      'index:NIFTYMIDSELECT',
      'index:NIFTYNEXT50',
    ]);
    // SME (SM series), BSE, and derivatives are out of scope, not malformed.
    expect(symbols).not.toContain('equity:GOLDSTAR');
    expect(symbols).not.toContain('equity:MCL');
  });

  it('normalises the RELIANCE row exactly', () => {
    const { instruments } = parseScripMaster(fixture('scrip-master-excerpt.csv'));
    const reliance = instruments.find((i) => i.symbol === 'RELIANCE');
    expect(reliance).toEqual({
      securityId: '2885',
      segment: 'NSE_EQ',
      symbol: 'RELIANCE',
      dhanSymbol: 'RELIANCE',
      name: 'Reliance Industries',
      kind: 'equity',
      exchange: 'NSE',
      isin: 'INE002A01018',
      lotSize: 1,
      tickSize: 10,
      series: 'EQ',
    });
    const nifty = instruments.find((i) => i.symbol === 'NIFTY50');
    expect(nifty).toMatchObject({
      securityId: '13',
      segment: 'IDX_I',
      dhanSymbol: 'NIFTY',
      name: 'Nifty 50',
      kind: 'index',
      isin: null,
      tickSize: 5,
      series: null,
    });
  });

  it('fails loudly when a required column is missing', () => {
    expect(() => parseScripMaster('EXCH_ID,SEGMENT\nNSE,E\n')).toThrow(/missing columns/);
  });

  it('indexes by symbol and by ref, and misses are null', () => {
    const { instruments } = parseScripMaster(fixture('scrip-master-excerpt.csv'));
    const index = new InstrumentIndex(instruments);
    expect(index.size).toBe(instruments.length);
    expect(index.refFor('reliance', 'equity')).toEqual({ segment: 'NSE_EQ', securityId: '2885' });
    expect(index.refFor('NIFTY50', 'index')).toEqual({ segment: 'IDX_I', securityId: '13' });
    expect(index.refFor('RELIANCE', 'index')).toBeNull();
    expect(index.refFor('NOSUCH', 'equity')).toBeNull();
    expect(index.byRef({ segment: 'NSE_EQ', securityId: '11536' })?.symbol).toBe('TCS');
    expect(index.byRef({ segment: 'NSE_EQ', securityId: '0' })).toBeNull();
  });
});

describe('candles', () => {
  it('chunks by the documented window per resolution', () => {
    expect(chunkDaysFor('1')).toBe(90);
    expect(chunkDaysFor('60')).toBe(90);
    expect(chunkDaysFor('D')).toBe(366);
  });

  it('splits a long range into non-overlapping inclusive chunks', () => {
    const from = new Date('2026-01-01T00:00:00Z');
    const to = new Date('2026-06-30T00:00:00Z'); // 181 days
    const chunks = chunkRange({ from, to }, '1');
    expect(chunks).toHaveLength(3);
    expect(chunks[0]?.from).toEqual(from);
    expect(chunks[0]?.to).toEqual(new Date('2026-03-31T00:00:00Z')); // day 89
    expect(chunks[1]?.from).toEqual(new Date('2026-04-01T00:00:00Z'));
    expect(chunks[2]?.to).toEqual(to);
    expect(chunkRange({ from, to }, 'D')).toHaveLength(1);
  });

  it('rejects an inverted or invalid range', () => {
    const a = new Date('2026-01-02T00:00:00Z');
    const b = new Date('2026-01-01T00:00:00Z');
    expect(() => chunkRange({ from: a, to: b }, '1')).toThrow(RangeError);
    expect(() => chunkRange({ from: new Date('x'), to: b }, '1')).toThrow(RangeError);
  });

  it('formats request dates in IST: timed exclusive start, bare next-day end', () => {
    // 2026-09-16 09:15:00 IST → 03:45:00Z; 15:29:00 IST → 09:59:00Z.
    const from = new Date('2026-09-16T03:45:00Z');
    const to = new Date('2026-09-16T09:59:00Z');
    expect(istDateTimeKey(from)).toBe('2026-09-16 09:15:00');
    expect(requestDates({ from, to }, '1')).toEqual({
      fromDate: '2026-09-16 09:14:00',
      toDate: '2026-09-17',
    });
    expect(requestDates({ from, to }, 'D')).toEqual({
      fromDate: '2026-09-16',
      toDate: '2026-09-17',
    });
  });

  it('rolls the intraday horizon five years back from now', () => {
    expect(intradayHistoryStart(new Date('2026-09-16T00:00:00Z')).toISOString()).toBe(
      '2021-09-16T00:00:00.000Z',
    );
  });

  it('zips columns into paise candles with UTC timestamps', () => {
    const candles = toCandles(jsonFixture('charts-daily.json'));
    expect(candles).toHaveLength(3);
    expect(candles[0]).toEqual({
      timestamp: new Date('2026-09-13T18:30:00.000Z'), // 14 Sep 00:00 IST
      open: 123000,
      high: 124200,
      low: 122505,
      close: 123810,
      volume: 8123456,
    });
    expect(candles[2]?.close).toBe(124690);
  });

  it('rejects ragged columns and bad values', () => {
    const good = jsonFixture<Record<string, number[]>>('charts-intraday.json');
    expect(() => toCandles({ ...good, close: [1] } as never)).toThrow();
    expect(() => toCandles({ ...good, timestamp: [0, 1] } as never)).toThrow(/epoch/);
    expect(() => toCandles({ ...good, volume: [-1, 1] } as never)).toThrow(/volume/);
  });
});

describe('quotes', () => {
  it('parses Dhan trade times as IST and treats 1980 as null', () => {
    expect(parseTradeTime('16/09/2026 15:29:58')?.toISOString()).toBe('2026-09-16T09:59:58.000Z');
    expect(parseTradeTime('01/01/1980 00:00:00')).toBeNull();
    expect(parseTradeTime(undefined)).toBeNull();
    expect(parseTradeTime('2026-09-16')).toBeNull();
  });

  it('chunks to the 1,000-instrument cap and groups the body by segment', () => {
    const refs = Array.from({ length: 1001 }, (_, i) => ({
      segment: i % 2 === 0 ? ('NSE_EQ' as const) : ('IDX_I' as const),
      securityId: String(i),
    }));
    const chunks = chunkRefs(refs);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(1000);
    expect(chunks.flat()).toEqual(refs);
    expect(toQuoteRequestBody(refs.slice(0, 4))).toEqual({ NSE_EQ: [0, 2], IDX_I: [1, 3] });
    expect(() => chunkRefs(refs, 0)).toThrow(RangeError);
  });

  it('derives change from the previous close, ignoring a zeroed net_change', () => {
    const ref = { segment: 'NSE_EQ' as const, securityId: '2885' };
    // The after-hours shape seen live: net_change 0, ohlc.close = previous close.
    const quote = toQuote(ref, { last_price: 1240, net_change: 0, ohlc: { close: 1235.3 } });
    expect(quote?.change).toBe(470);
    expect(quote?.changePercent).toBeCloseTo(0.3805, 4);
    // With no previous close at all, net_change is the only signal.
    expect(toQuote(ref, { last_price: 1240, net_change: -2.5 })?.change).toBe(-250);
    expect(toQuote(ref, { last_price: 1240 })?.change).toBeNull();
  });

  it('normalises a full quote to paise with top-of-book and signed change', () => {
    const raw = jsonFixture<{ data: Record<string, Record<string, never>> }>('quote.json');
    const ref = { segment: 'NSE_EQ' as const, securityId: '2885' };
    const quote = toQuote(ref, raw.data.NSE_EQ?.['2885'] as never);
    expect(quote).toEqual({
      ref,
      ltp: 124690,
      change: 1160,
      changePercent: (1160 / 123530) * 100,
      open: 124000,
      high: 125200,
      low: 123660,
      previousClose: 123530,
      averagePrice: 124337,
      bid: 124685,
      ask: 124695,
      volume: 8123456,
      timestamp: new Date('2026-09-16T09:59:58.000Z'),
    });
  });

  it('nulls every zero placeholder and derives change when net_change is absent', () => {
    const raw = jsonFixture<{ data: Record<string, Record<string, never>> }>('quote.json');
    const ref = { segment: 'NSE_EQ' as const, securityId: '11915' };
    const quote = toQuote(ref, raw.data.NSE_EQ?.['11915'] as never);
    expect(quote).toMatchObject({
      ltp: 2314,
      change: 0,
      changePercent: 0,
      open: null,
      high: null,
      low: null,
      previousClose: 2314,
      bid: null,
      ask: null,
      volume: 0,
      timestamp: null,
    });
  });

  it('drops an entry with no usable last price', () => {
    const raw = jsonFixture<{ data: Record<string, Record<string, never>> }>('quote.json');
    const ref = { segment: 'NSE_EQ' as const, securityId: '99999' };
    expect(toQuote(ref, raw.data.NSE_EQ?.['99999'] as never)).toBeNull();
  });
});
