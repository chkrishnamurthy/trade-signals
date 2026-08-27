import { formatPaise } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import {
  appIdHash,
  base32Decode,
  buildAuthCodeUrl,
  defaultExpiry,
  generateTotp,
  isTokenUsable,
} from '../auth.js';
import { chunkDaysFor, chunkRange } from '../candles.js';
import { parseSymbolMaster, splitCsvLine } from '../instruments.js';
import { DEFAULT_LIMITS, DOCUMENTED_LIMITS, RateLimiter } from '../rate-limit.js';
import {
  encodeFyersSymbol,
  internalSymbolFor,
  isFyersSymbol,
  parseFyersSymbol,
  toFyersSymbol,
} from '../symbols.js';
import { rawCandleSchema, rawLiteTickSchema, toCandle, toTick } from '../types.js';
import { fixture, jsonFixture } from './helpers.js';

describe('symbols', () => {
  it('builds Fyers symbols in the documented format', () => {
    expect(toFyersSymbol('RELIANCE', 'equity')).toBe('NSE:RELIANCE-EQ');
    expect(toFyersSymbol('NIFTY50', 'index')).toBe('NSE:NIFTY50-INDEX');
    expect(toFyersSymbol('NIFTYBANK', 'index')).toBe('NSE:NIFTYBANK-INDEX');
    expect(toFyersSymbol('  reliance  ', 'equity')).toBe('NSE:RELIANCE-EQ');
  });

  it('parses them back', () => {
    expect(parseFyersSymbol('NSE:RELIANCE-EQ')).toEqual({
      symbol: 'RELIANCE',
      kind: 'equity',
      exchange: 'NSE',
    });
    expect(parseFyersSymbol('NSE:NIFTY50-INDEX')).toEqual({
      symbol: 'NIFTY50',
      kind: 'index',
      exchange: 'NSE',
    });
  });

  it('round-trips', () => {
    for (const [symbol, kind] of [
      ['RELIANCE', 'equity'],
      ['NIFTY50', 'index'],
      ['NIFTYBANK', 'index'],
    ] as const) {
      expect(parseFyersSymbol(toFyersSymbol(symbol, kind))).toMatchObject({ symbol, kind });
    }
  });

  it('rejects non-NSE and malformed symbols', () => {
    for (const bad of ['BSE:SENSEX-INDEX', 'RELIANCE', 'NSE:RELIANCE', 'NSE:NIFTY-FUT', '']) {
      expect(() => parseFyersSymbol(bad), bad).toThrow(RangeError);
      expect(isFyersSymbol(bad), bad).toBe(false);
    }
    expect(() => toFyersSymbol('   ', 'equity')).toThrow(RangeError);
  });

  it('percent-encodes ampersands, which the docs require to avoid error -300', () => {
    expect(encodeFyersSymbol('NSE:M&M-EQ')).toBe('NSE%3AM%26M-EQ');
    expect(encodeFyersSymbol('NSE:M&M-EQ')).toContain('%26');
  });

  it('applies aliases for indices Fyers publishes under two tickers', () => {
    expect(internalSymbolFor('NSE:MIDCPNIFTY-INDEX')).toBe('NIFTYMIDSELECT');
    expect(internalSymbolFor('NSE:NIFTYNXT50-INDEX')).toBe('NIFTYNEXT50');
    expect(internalSymbolFor('NSE:RELIANCE-EQ')).toBe('RELIANCE');
  });
});

describe('toCandle', () => {
  it('converts a positional array to paise', () => {
    const raw = rawCandleSchema.parse([1621814400, 417.0, 419.2, 405.3, 412.05, 142964052]);
    const candle = toCandle(raw);
    expect(candle.timestamp.toISOString()).toBe('2021-05-24T00:00:00.000Z');
    expect(candle.open).toBe(41700);
    expect(candle.high).toBe(41920);
    expect(candle.low).toBe(40530);
    expect(candle.close).toBe(41205);
    expect(candle.volume).toBe(142964052);
    expect(candle.openInterest).toBeUndefined();
  });

  it('never lets a rupee float through — every price is an integer', () => {
    const { candles } = jsonFixture<{ candles: number[][] }>('history-daily.json');
    for (const raw of candles) {
      const candle = toCandle(rawCandleSchema.parse(raw));
      for (const price of [candle.open, candle.high, candle.low, candle.close]) {
        expect(Number.isSafeInteger(price)).toBe(true);
      }
    }
  });

  it('keeps sub-rupee precision exactly', () => {
    const candle = toCandle(rawCandleSchema.parse([1621814400, 412.05, 412.05, 412.05, 412.05, 1]));
    expect(candle.close).toBe(41205);
    expect(formatPaise(candle.close)).toBe('₹412.05');
  });

  it('carries open interest when the 7th element is present', () => {
    const candle = toCandle(rawCandleSchema.parse([1621814400, 417, 419, 405, 412, 100, 98765]));
    expect(candle.openInterest).toBe(98765);
  });

  it('rejects a malformed candle rather than guessing', () => {
    expect(() => rawCandleSchema.parse([1621814400, 417, 419, 405])).toThrow();
    expect(() => rawCandleSchema.parse(['1621814400', 417, 419, 405, 412, 1])).toThrow();
    expect(() => toCandle(rawCandleSchema.parse([0, 417, 419, 405, 412, 1]))).toThrow(RangeError);
    expect(() => toCandle(rawCandleSchema.parse([1621814400, 417, 419, 405, 412, -1]))).toThrow(
      RangeError,
    );
  });
});

describe('toTick', () => {
  const identity = (s: string) => s;

  it('reads equity feeds from ltp', () => {
    const [equity] = jsonFixture<unknown[]>('lite-ticks.json');
    const tick = toTick(rawLiteTickSchema.parse(equity), identity);
    expect(tick?.ltp).toBe(124550);
    expect(tick?.volumeToday).toBe(4821993);
    expect(tick?.lastTradedAt?.toISOString()).toBe('2025-08-21T10:40:00.000Z');
  });

  it('reads index feeds from iv, which is where the value actually lives', () => {
    const [, index] = jsonFixture<unknown[]>('lite-ticks.json');
    const tick = toTick(rawLiteTickSchema.parse(index), identity);
    expect(tick?.ltp).toBe(2456785);
    expect(tick?.lastTradedAt).toBeNull();
  });

  it('returns null for a payload with no price — acks share the channel', () => {
    const [, , ack] = jsonFixture<unknown[]>('lite-ticks.json');
    expect(toTick(rawLiteTickSchema.parse(ack), identity)).toBeNull();
  });

  it('maps to the internal symbol', () => {
    const [equity] = jsonFixture<unknown[]>('lite-ticks.json');
    const tick = toTick(rawLiteTickSchema.parse(equity), internalSymbolFor);
    expect(tick?.symbol).toBe('RELIANCE');
    expect(tick?.fyersSymbol).toBe('NSE:RELIANCE-EQ');
  });
});

describe('chunkRange', () => {
  it('uses the documented per-resolution limits', () => {
    expect(chunkDaysFor('1')).toBe(100);
    expect(chunkDaysFor('240')).toBe(100);
    expect(chunkDaysFor('D')).toBe(366);
    expect(chunkDaysFor('1D')).toBe(366);
    expect(chunkDaysFor('1W')).toBe(366);
    expect(chunkDaysFor('30S')).toBe(30);
  });

  it('returns one chunk when the range already fits', () => {
    const range = { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-02-01T00:00:00Z') };
    expect(chunkRange(range, '1')).toEqual([range]);
  });

  it('splits a minute range at 100-day boundaries', () => {
    const chunks = chunkRange(
      { from: new Date('2026-01-01T00:00:00Z'), to: new Date('2026-12-31T00:00:00Z') },
      '5',
    );
    expect(chunks).toHaveLength(4);
    expect(chunks[0]?.from.toISOString()).toBe('2026-01-01T00:00:00.000Z');
    expect(chunks[0]?.to.toISOString()).toBe('2026-04-10T00:00:00.000Z'); // 100 days inclusive
    expect(chunks.at(-1)?.to.toISOString()).toBe('2026-12-31T00:00:00.000Z');
  });

  it('splits a daily range at 366-day boundaries', () => {
    const chunks = chunkRange(
      { from: new Date('2020-01-01T00:00:00Z'), to: new Date('2026-01-01T00:00:00Z') },
      'D',
    );
    expect(chunks.length).toBe(6);
  });

  it('produces contiguous, non-overlapping chunks that cover the whole range', () => {
    const from = new Date('2023-03-15T00:00:00Z');
    const to = new Date('2026-08-21T00:00:00Z');
    const chunks = chunkRange({ from, to }, '15');

    expect(chunks[0]?.from.getTime()).toBe(from.getTime());
    expect(chunks.at(-1)?.to.getTime()).toBe(to.getTime());
    for (const [i, chunk] of chunks.entries()) {
      expect(chunk.to.getTime()).toBeGreaterThanOrEqual(chunk.from.getTime());
      const spanDays = (chunk.to.getTime() - chunk.from.getTime()) / 86_400_000 + 1;
      expect(spanDays).toBeLessThanOrEqual(100);
      const next = chunks[i + 1];
      if (next !== undefined) {
        expect(next.from.getTime() - chunk.to.getTime()).toBe(86_400_000);
      }
    }
  });

  it('handles a single-day range', () => {
    const day = new Date('2026-08-21T00:00:00Z');
    expect(chunkRange({ from: day, to: day }, '1')).toEqual([{ from: day, to: day }]);
  });

  it('rejects an inverted or invalid range', () => {
    expect(() =>
      chunkRange({ from: new Date('2026-02-01Z'), to: new Date('2026-01-01Z') }, '1'),
    ).toThrow(RangeError);
    expect(() => chunkRange({ from: new Date('nope'), to: new Date() }, '1')).toThrow(RangeError);
  });
});

describe('parseSymbolMaster', () => {
  const csv = fixture('nse-cm-sample.csv');

  it('parses equities and indices, skipping other segments', () => {
    const { instruments } = parseSymbolMaster(csv);
    const symbols = instruments.map((i) => i.symbol);
    expect(symbols).toContain('RELIANCE');
    expect(symbols).toContain('NIFTY50');
    expect(symbols).toContain('NIFTYBANK');
    expect(symbols).not.toContain('BADSEGMENT'); // instrument type 11 = futures
  });

  it('normalises a full equity row', () => {
    const { instruments } = parseSymbolMaster(csv);
    expect(instruments.find((i) => i.symbol === 'RELIANCE')).toEqual({
      fyToken: '10100000002885',
      symbol: 'RELIANCE',
      fyersSymbol: 'NSE:RELIANCE-EQ',
      name: 'RELIANCE INDUSTRIES LTD',
      kind: 'equity',
      exchange: 'NSE',
      isin: 'INE002A01018',
      lotSize: 1,
      tickSize: 10,
      scripCode: 2885,
      lastUpdated: '2026-08-20',
    });
  });

  it('converts tick size from rupees to paise', () => {
    const { instruments } = parseSymbolMaster(csv);
    expect(instruments.find((i) => i.symbol === 'RELIANCE')?.tickSize).toBe(10); // 0.1
    expect(instruments.find((i) => i.symbol === 'NIFTY50')?.tickSize).toBe(5); // 0.05
    expect(instruments.find((i) => i.symbol === '20MICRONS')?.tickSize).toBe(1); // 0.01
  });

  it('gives indices a null ISIN rather than an empty string', () => {
    const { instruments } = parseSymbolMaster(csv);
    expect(instruments.find((i) => i.symbol === 'NIFTY50')?.isin).toBeNull();
    expect(instruments.find((i) => i.symbol === 'RELIANCE')?.isin).toBe('INE002A01018');
  });

  it('handles quoted fields containing commas', () => {
    const { instruments } = parseSymbolMaster(csv);
    const mm = instruments.find((i) => i.symbol === 'M&M');
    expect(mm?.name).toBe('MAHINDRA & MAHINDRA, LTD');
    expect(mm?.scripCode).toBe(2031);
  });

  it('records malformed rows instead of throwing or silently dropping them', () => {
    const { skipped } = parseSymbolMaster(csv);
    expect(skipped).toHaveLength(1);
    expect(skipped[0]?.reason).toMatch(/expected 21 columns/);
  });

  it('ignores blank lines', () => {
    expect(parseSymbolMaster('\n\n  \n').instruments).toHaveLength(0);
  });
});

describe('splitCsvLine', () => {
  it('splits plain fields', () => {
    expect(splitCsvLine('a,b,c')).toEqual(['a', 'b', 'c']);
  });

  it('keeps commas inside quotes', () => {
    expect(splitCsvLine('a,"b,c",d')).toEqual(['a', 'b,c', 'd']);
  });

  it('unescapes doubled quotes', () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b']);
  });

  it('preserves empty trailing fields', () => {
    expect(splitCsvLine('a,,')).toEqual(['a', '', '']);
  });
});

describe('RateLimiter', () => {
  it('defaults to roughly half the documented ceilings', () => {
    expect(DOCUMENTED_LIMITS).toEqual({ perSecond: 10, perMinute: 200, perDay: 100_000 });
    expect(DEFAULT_LIMITS.perSecond / DOCUMENTED_LIMITS.perSecond).toBe(0.5);
    expect(DEFAULT_LIMITS.perMinute / DOCUMENTED_LIMITS.perMinute).toBe(0.5);
    expect(DEFAULT_LIMITS.perDay / DOCUMENTED_LIMITS.perDay).toBe(0.5);
  });

  it('admits up to the per-second capacity without waiting', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      limits: { perSecond: 3, perMinute: 100, perDay: 1000 },
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    });

    for (let i = 0; i < 3; i += 1) await limiter.acquire();
    expect(slept).toEqual([]);
  });

  it('makes the next caller wait once the second bucket is empty', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      limits: { perSecond: 2, perMinute: 100, perDay: 1000 },
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    });

    await limiter.acquire();
    await limiter.acquire();
    await limiter.acquire();

    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(0);
    expect(slept[0]).toBeLessThanOrEqual(500); // 2/sec -> a token every 500ms
  });

  it('refills continuously rather than on a window boundary', async () => {
    let now = 0;
    const limiter = new RateLimiter({
      limits: { perSecond: 10, perMinute: 600, perDay: 10_000 },
      now: () => now,
      sleep: async (ms) => {
        now += ms;
      },
    });

    for (let i = 0; i < 10; i += 1) await limiter.acquire();
    expect(limiter.available().perSecond).toBe(0);
    now += 500;
    expect(limiter.available().perSecond).toBe(5);
  });

  it('enforces the per-minute ceiling too, not just per-second', async () => {
    let now = 0;
    const slept: number[] = [];
    const limiter = new RateLimiter({
      limits: { perSecond: 100, perMinute: 5, perDay: 1000 },
      now: () => now,
      sleep: async (ms) => {
        slept.push(ms);
        now += ms;
      },
    });

    for (let i = 0; i < 5; i += 1) await limiter.acquire();
    expect(slept).toEqual([]);
    await limiter.acquire();
    expect(slept).toHaveLength(1);
    expect(slept[0]).toBeGreaterThan(1000); // 5/min -> 12s per token
  });
});

describe('auth helpers', () => {
  it('hashes appId:secretKey with SHA-256', () => {
    // Independently computed: printf '%s' 'test-100:secret' | shasum -a 256
    expect(appIdHash('test-100', 'secret')).toBe(
      'b53033f09a2ee91fb7a6f2b8f1b7b7cbbaee6cdde960521128909774f810e12c',
    );
    expect(appIdHash('a', 'b')).not.toBe(appIdHash('b', 'a'));
  });

  it('builds the documented authorisation URL', () => {
    const url = new URL(
      buildAuthCodeUrl(
        { appId: 'SPX-100', secretKey: 's', redirectUri: 'https://example.test/cb' },
        'xyz',
      ),
    );
    expect(url.origin + url.pathname).toBe('https://api-t1.fyers.in/api/v3/generate-authcode');
    expect(url.searchParams.get('client_id')).toBe('SPX-100');
    expect(url.searchParams.get('response_type')).toBe('code');
    expect(url.searchParams.get('redirect_uri')).toBe('https://example.test/cb');
    expect(url.searchParams.get('state')).toBe('xyz');
  });

  it('decodes base32 per RFC 4648', () => {
    expect(base32Decode('MZXW6===').toString('utf8')).toBe('foo');
    expect(base32Decode('JBSWY3DP').toString('utf8')).toBe('Hello');
    expect(() => base32Decode('MZXW6!!!')).toThrow(/non-base32/);
  });

  it('generates RFC 6238 TOTP values matching the published test vectors', () => {
    // RFC 6238 uses the ASCII secret "12345678901234567890" == base32 GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    expect(generateTotp(secret, 59, 30, 8)).toBe('94287082');
    expect(generateTotp(secret, 1111111109, 30, 8)).toBe('07081804');
    expect(generateTotp(secret, 1234567890, 30, 8)).toBe('89005924');
  });

  it('produces a stable 6-digit code inside one 30s step', () => {
    const secret = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ';
    // Steps are floor(t / 30): 990-1019 is step 33, 1020-1049 is step 34.
    expect(generateTotp(secret, 1000)).toMatch(/^\d{6}$/);
    expect(generateTotp(secret, 1000)).toBe(generateTotp(secret, 1019));
    expect(generateTotp(secret, 1000)).not.toBe(generateTotp(secret, 1020));
  });

  it('expires a token before the next pre-open', () => {
    const issued = new Date('2026-08-21T10:00:00Z'); // 15:30 IST
    const expiry = defaultExpiry(issued);
    expect(expiry.toISOString()).toBe('2026-08-22T01:30:00.000Z'); // 07:00 IST next day
    expect(expiry.getTime()).toBeGreaterThan(issued.getTime());
  });

  it('treats a token as unusable when absent, expired, or for another app', () => {
    const now = new Date('2026-08-21T10:00:00Z');
    const good = { accessToken: 't', appId: 'A-100', expiresAt: '2026-08-22T01:30:00.000Z' };
    expect(isTokenUsable(good, 'A-100', now)).toBe(true);
    expect(isTokenUsable(null, 'A-100', now)).toBe(false);
    expect(isTokenUsable(good, 'B-100', now)).toBe(false);
    expect(isTokenUsable({ ...good, expiresAt: '2026-08-21T09:00:00.000Z' }, 'A-100', now)).toBe(
      false,
    );
  });
});
