import { describe, expect, it } from 'vitest';
import { FyersRateLimitError } from '../errors.js';
import { FyersHttpClient } from '../http.js';
import {
  chunkSymbols,
  fetchMarketStatus,
  fetchQuotes,
  MAX_QUOTE_SYMBOLS,
  quotesResponseSchema,
  toQuote,
} from '../quotes.js';
import { RateLimiter } from '../rate-limit.js';
import { jsonFixture, type StubResponse, stubFetch } from './helpers.js';

const instantLimiter = (): RateLimiter =>
  new RateLimiter({
    limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
    sleep: async () => {},
  });

function fetcher(responses: StubResponse[]) {
  const stub = stubFetch(responses);
  return {
    stub,
    fetcher: {
      http: new FyersHttpClient({
        fetchImpl: stub.impl,
        sleep: async () => {},
        rateLimiter: instantLimiter(),
      }),
      authorization: 'APP-100:token',
    },
  };
}

const parsed = () => quotesResponseSchema.parse(jsonFixture('quotes.json'));

describe('chunkSymbols', () => {
  it('respects the documented 50-symbol cap', () => {
    expect(MAX_QUOTE_SYMBOLS).toBe(50);
    const symbols = Array.from({ length: 51 }, (_, i) => `NSE:S${i}-EQ`);
    const chunks = chunkSymbols(symbols);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(50);
    expect(chunks[1]).toHaveLength(1);
  });

  it('returns one chunk when it already fits, and none when empty', () => {
    expect(chunkSymbols(['NSE:A-EQ'])).toEqual([['NSE:A-EQ']]);
    expect(chunkSymbols([])).toEqual([]);
  });

  it('covers every symbol exactly once', () => {
    const symbols = Array.from({ length: 137 }, (_, i) => `NSE:S${i}-EQ`);
    expect(chunkSymbols(symbols).flat()).toEqual(symbols);
  });

  it('rejects a nonsense chunk size', () => {
    expect(() => chunkSymbols(['a'], 0)).toThrow(RangeError);
  });
});

describe('toQuote', () => {
  it('converts every price to integer paise', () => {
    const entry = parsed().d?.[0];
    const quote = toQuote(entry!);
    expect(quote).toMatchObject({
      fyersSymbol: 'NSE:SBIN-EQ',
      ltp: 42690,
      change: 170,
      changePercent: 0.4,
      open: 43050,
      high: 43365,
      low: 42360,
      previousClose: 42520,
      averagePrice: 42807,
      volume: 38977242,
    });
    for (const value of [quote?.ltp, quote?.change, quote?.open, quote?.high, quote?.low]) {
      expect(Number.isSafeInteger(value)).toBe(true);
    }
  });

  it('keeps changePercent a float — it is a ratio, not money', () => {
    expect(toQuote(parsed().d![0]!)?.changePercent).toBe(0.4);
    expect(toQuote(parsed().d![1]!)?.changePercent).toBe(-0.39);
  });

  it('handles a negative change', () => {
    const index = toQuote(parsed().d![1]!);
    expect(index?.ltp).toBe(2456785);
    expect(index?.change).toBe(-9540);
  });

  it('accepts tt as either a string or a number', () => {
    expect(toQuote(parsed().d![0]!)?.timestamp?.toISOString()).toBe('2021-05-28T00:00:00.000Z');
    expect(toQuote(parsed().d![1]!)?.timestamp?.toISOString()).toBe('2021-05-28T00:00:00.000Z');
  });

  it('reports an index with no volume as null, not zero', () => {
    expect(toQuote(parsed().d![1]!)?.volume).toBeNull();
  });

  it('maps zero-placeholder OHLC to null rather than a fake price', () => {
    const thin = toQuote(parsed().d![2]!);
    expect(thin?.ltp).toBe(1250);
    expect(thin?.open).toBeNull();
    expect(thin?.high).toBeNull();
    expect(thin?.low).toBeNull();
    // volume 0 is a real, meaningful figure for an untraded stock.
    expect(thin?.volume).toBe(0);
  });

  it('returns null for an entry Fyers marked as failed', () => {
    expect(toQuote(parsed().d![3]!)).toBeNull();
  });

  it('returns null for the nested-error shape, where s is "ok" but v is an error', () => {
    // Observed live 2026-08-21: a delisted symbol comes back with the envelope
    // AND the entry both reporting "ok", while `v` holds { errmsg, code: -300,
    // s: "error" }. Requiring `lp` here failed the whole 50-symbol batch.
    const entry = parsed().d![4]!;
    expect(entry.s).toBe('ok');
    expect(toQuote(entry)).toBeNull();
  });
});

describe('fetchQuotes', () => {
  it('returns a map keyed by Fyers symbol and reports the rest as missing', async () => {
    const { fetcher: f } = fetcher([{ body: jsonFixture('quotes.json') }]);
    const result = await fetchQuotes(f, [
      'NSE:SBIN-EQ',
      'NSE:NIFTY50-INDEX',
      'NSE:BADSYMBOL-EQ',
      'NSE:DELISTED-EQ',
    ]);

    // Two dead symbols must not cost us the good ones.
    expect(result.quotes.get('NSE:SBIN-EQ')?.ltp).toBe(42690);
    expect(result.quotes.get('NSE:NIFTY50-INDEX')?.ltp).toBe(2456785);
    expect(result.quotes.has('NSE:BADSYMBOL-EQ')).toBe(false);
    expect(result.quotes.has('NSE:DELISTED-EQ')).toBe(false);
    expect(result.missing).toEqual(['NSE:BADSYMBOL-EQ', 'NSE:DELISTED-EQ']);
  });

  it('sends a comma-separated symbols parameter', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('quotes.json') }]);
    await fetchQuotes(f, ['NSE:SBIN-EQ', 'NSE:INFY-EQ']);
    const url = new URL(stub.calls[0] ?? '');
    expect(url.pathname).toBe('/data/quotes');
    expect(url.searchParams.get('symbols')).toBe('NSE:SBIN-EQ,NSE:INFY-EQ');
  });

  it('splits a NIFTY 50 request (index + 50 stocks) into two calls', async () => {
    const { fetcher: f, stub } = fetcher([{ body: jsonFixture('quotes.json') }]);
    const symbols = ['NSE:NIFTY50-INDEX', ...Array.from({ length: 50 }, (_, i) => `NSE:S${i}-EQ`)];
    await fetchQuotes(f, symbols);
    expect(stub.calls).toHaveLength(2);
  });

  it('surfaces a 429 rather than retrying into a ban', async () => {
    const { fetcher: f, stub } = fetcher([
      { status: 429, body: jsonFixture('rate-limited-429.json') },
      { body: jsonFixture('quotes.json') },
    ]);

    // /data/quotes is the path Cloudflare actually bans, and the ban is
    // fixed-duration. The 200 in the script must stay unreached.
    await expect(fetchQuotes(f, ['NSE:SBIN-EQ'])).rejects.toBeInstanceOf(FyersRateLimitError);
    expect(stub.calls).toHaveLength(1);
  });
});

describe('fetchMarketStatus', () => {
  it('reports OPEN only for the NSE capital-market segment', async () => {
    const { fetcher: f } = fetcher([
      {
        body: {
          s: 'ok',
          marketStatus: [
            { exchange: 10, segment: 12, status: 'CLOSE' },
            { exchange: 10, segment: 10, status: 'OPEN' },
          ],
        },
      },
    ]);
    const status = await fetchMarketStatus(f);
    expect(status.isOpen).toBe(true);
    expect(status.status).toBe('OPEN');
  });

  it('treats pre-open as not open', async () => {
    const { fetcher: f } = fetcher([
      { body: { s: 'ok', marketStatus: [{ exchange: 10, segment: 10, status: 'PREOPEN' }] } },
    ]);
    const status = await fetchMarketStatus(f);
    expect(status.isOpen).toBe(false);
    expect(status.status).toBe('PREOPEN');
  });

  it('falls back to UNKNOWN when NSE cash is absent', async () => {
    const { fetcher: f } = fetcher([{ body: { s: 'ok', marketStatus: [] } }]);
    expect((await fetchMarketStatus(f)).status).toBe('UNKNOWN');
  });
});
