import { PathCircuitBreaker, RateLimiter } from '@equitywise/shared';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { fetchProfile, generateAccessToken, renewToken } from '../auth.js';
import { fetchCandles } from '../candles.js';
import { DhanApiError, DhanAuthError, DhanRateLimitError } from '../errors.js';
import { DHAN_API_BASE, DhanHttpClient } from '../http.js';
import { fetchQuotes } from '../quotes.js';
import { jsonFixture, recordingSleep, type StubResponse, stubFetch } from './helpers.js';

const instant = (): RateLimiter =>
  new RateLimiter({
    limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
    sleep: async () => {},
  });

function client(
  responses: StubResponse[],
  extra: { circuit?: PathCircuitBreaker; quoteLimiter?: RateLimiter; attempts?: number } = {},
) {
  const stub = stubFetch(responses);
  const { sleep, delays } = recordingSleep();
  const http = new DhanHttpClient({
    fetchImpl: stub.impl,
    sleep,
    dataRateLimiter: instant(),
    quoteRateLimiter: extra.quoteLimiter ?? instant(),
    ...(extra.circuit === undefined ? {} : { circuitBreaker: extra.circuit }),
    backoff: { attempts: extra.attempts ?? 3, baseDelayMs: 10, maxDelayMs: 10 },
  });
  return { http, stub, delays };
}

const session = { clientId: '1103361782', accessToken: 'jwt' };
const anySchema = z.object({}).passthrough();

describe('DhanHttpClient', () => {
  it('sends the two auth headers and parses the body with the schema', async () => {
    const { http, stub } = client([{ body: { ok: true } }]);
    const calls: RequestInit[] = [];
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push(init ?? {});
      return stub.impl(input, init);
    }) as typeof fetch;
    const spied = new DhanHttpClient({ fetchImpl: spy, dataRateLimiter: instant() });

    await spied.request(`${DHAN_API_BASE}/profile`, anySchema, {
      headers: { 'access-token': 'jwt', 'client-id': '1' },
    });
    const headers = calls[0]?.headers as Record<string, string>;
    expect(headers['access-token']).toBe('jwt');
    expect(headers['client-id']).toBe('1');
    expect(http).toBeDefined();
  });

  it('retries 5xx with backoff, then succeeds', async () => {
    const { http, stub, delays } = client([
      { status: 503, body: {} },
      { status: 502, body: {} },
      { body: { fine: 1 } },
    ]);
    const out = await http.request(`${DHAN_API_BASE}/profile`, anySchema);
    expect(out).toEqual({ fine: 1 });
    expect(stub.calls).toHaveLength(3);
    expect(delays).toHaveLength(2);
  });

  it('does not retry a 4xx, and surfaces the Dhan error code', async () => {
    const { http, stub } = client([
      {
        status: 401,
        body: { errorType: 'Invalid_Authentication', errorCode: 'DH-901', errorMessage: 'expired' },
      },
    ]);
    await expect(http.request(`${DHAN_API_BASE}/profile`, anySchema)).rejects.toMatchObject({
      name: 'DhanApiError',
      code: 'DH-901',
      httpStatus: 401,
    });
    expect(stub.calls).toHaveLength(1);
  });

  it('treats a 200 with status:failure as an API error, not data', async () => {
    const { http } = client([
      {
        body: { status: 'failure', remarks: { error_code: 806, error_message: 'not subscribed' } },
      },
    ]);
    await expect(http.request(`${DHAN_API_BASE}/charts/intraday`, anySchema)).rejects.toMatchObject(
      {
        name: 'DhanApiError',
        code: '806',
        message: 'not subscribed',
      },
    );
  });

  it('trips the breaker on 429 and short-circuits the path until Retry-After', async () => {
    const circuit = new PathCircuitBreaker();
    const { http, stub } = client([{ status: 429, body: {}, headers: { 'retry-after': '120' } }], {
      circuit,
    });
    const url = `${DHAN_API_BASE}/marketfeed/quote`;
    await expect(http.request(url, anySchema)).rejects.toBeInstanceOf(DhanRateLimitError);
    // Second call never reaches the network.
    await expect(http.request(url, anySchema)).rejects.toMatchObject({
      name: 'DhanRateLimitError',
      retryAfterMs: expect.any(Number),
    });
    expect(stub.calls).toHaveLength(1);
    expect(http.cooldownMs('/v2/marketfeed/quote')).toBeGreaterThan(100_000);
    // Other paths are untouched.
    expect(http.cooldownMs('/v2/charts/intraday')).toBe(0);
  });

  it('trips on the in-band DH-904 too', async () => {
    const { http } = client([
      { status: 400, body: { errorCode: 'DH-904', errorMessage: 'Too many' } },
    ]);
    await expect(http.request(`${DHAN_API_BASE}/profile`, anySchema)).rejects.toBeInstanceOf(
      DhanRateLimitError,
    );
  });

  it('rejects a body that does not match the schema, naming the field', async () => {
    const { http } = client([{ body: { open: 'nope' } }]);
    const schema = z.object({ open: z.array(z.number()) });
    await expect(http.request(`${DHAN_API_BASE}/charts/historical`, schema)).rejects.toThrow(
      /Unexpected response shape.*open/,
    );
  });

  it('spends quote calls from the quote bucket', async () => {
    let acquired = 0;
    const quoteLimiter = new RateLimiter({
      limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
      sleep: async () => {},
    });
    const original = quoteLimiter.acquire.bind(quoteLimiter);
    quoteLimiter.acquire = async () => {
      acquired += 1;
      await original();
    };
    const { http } = client([{ body: jsonFixture('quote.json') }], { quoteLimiter });
    await fetchQuotes({ http, session }, [{ segment: 'NSE_EQ', securityId: '2885' }]);
    expect(acquired).toBe(1);
  });
});

describe('auth over HTTP', () => {
  it('mints a token from client id + PIN + TOTP and computes expiry', async () => {
    const { http, stub } = client([
      { body: { accessToken: 'new-jwt', expiryTime: '2026-09-17T23:01:04.777' } },
    ]);
    const now = new Date('2026-09-16T17:31:04.000Z');
    const minted = await generateAccessToken(
      { http, now: () => now },
      { clientId: '1103361782', pin: '1234', totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
    );
    expect(minted.accessToken).toBe('new-jwt');
    expect(minted.clientId).toBe('1103361782');
    expect(minted.expiresAt.toISOString()).toBe('2026-09-17T17:30:04.000Z');

    const url = new URL(stub.calls[0] ?? '');
    expect(url.pathname).toBe('/app/generateAccessToken');
    expect(url.searchParams.get('dhanClientId')).toBe('1103361782');
    expect(url.searchParams.get('pin')).toBe('1234');
    expect(url.searchParams.get('totp')).toMatch(/^\d{6}$/);
  });

  it('turns a rejected mint into an auth error with a remedy', async () => {
    const { http } = client([
      { status: 400, body: { errorCode: 'DH-905', errorMessage: 'Invalid TOTP' } },
    ]);
    await expect(
      generateAccessToken({ http }, { clientId: '1', pin: '1', totpSecret: 'GEZDGNBV' }),
    ).rejects.toMatchObject({
      name: 'DhanAuthError',
      code: 'DH-905',
      remedy: expect.stringContaining('TOTP'),
    });
  });

  it('never puts the PIN or TOTP into an error message', async () => {
    const { http } = client([{ body: { unexpected: true } }]);
    let message = '';
    try {
      await generateAccessToken(
        { http },
        { clientId: '1103361782', pin: '938193', totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ' },
      );
    } catch (error) {
      message = error instanceof Error ? `${error.message} ${String(error.cause)}` : '';
    }
    expect(message).toContain('generateAccessToken');
    expect(message).not.toContain('938193');
    expect(message).not.toMatch(/totp=/);
    expect(message).not.toMatch(/pin=/);
    expect(message).toContain('unexpected');
  });

  it('surfaces the 2-minute mint throttle as a rate limit, not an auth failure', async () => {
    const { http } = client([
      { body: { status: 'error', message: 'Token can be generated once every 2 minutes.' } },
    ]);
    await expect(
      generateAccessToken({ http }, { clientId: '1', pin: '1', totpSecret: 'GEZDGNBV' }),
    ).rejects.toMatchObject({ name: 'DhanRateLimitError', retryAfterMs: 120_000 });
  });

  it('refuses to mint with incomplete credentials before touching the network', async () => {
    const { http, stub } = client([{ body: {} }]);
    await expect(
      generateAccessToken({ http }, { clientId: '', pin: '1', totpSecret: 'A' }),
    ).rejects.toBeInstanceOf(DhanAuthError);
    expect(stub.calls).toHaveLength(0);
  });

  it('renews a live token', async () => {
    const { http } = client([
      { body: { accessToken: 'renewed', expiryTime: '2026-09-18T10:00:00' } },
    ]);
    const now = new Date('2026-09-17T04:30:00.000Z');
    const renewed = await renewToken({ http, now: () => now }, session);
    expect(renewed.accessToken).toBe('renewed');
    expect(renewed.expiresAt.toISOString()).toBe('2026-09-18T04:29:00.000Z');
  });

  it('reads the Data API subscription from the profile', async () => {
    const { http } = client([
      {
        body: {
          dhanClientId: '1103361782',
          tokenValidity: '17/09/2026 23:01',
          dataPlan: 'Active',
          dataValidity: '2026-10-15 22:46:27.0',
          activeSegment: 'E, D, C, M',
        },
      },
    ]);
    expect(await fetchProfile({ http }, session)).toEqual({
      clientId: '1103361782',
      dataApiActive: true,
      dataValidUntil: '2026-10-15 22:46:27.0',
      tokenValidUntil: '17/09/2026 23:01',
    });
  });
});

describe('candles over HTTP', () => {
  it('posts the documented body for daily bars and returns paise candles', async () => {
    const { http, stub } = client([{ body: jsonFixture('charts-daily.json') }]);
    const bodies: unknown[] = [];
    const spy = (async (input: RequestInfo | URL, init?: RequestInit) => {
      bodies.push(JSON.parse(String(init?.body ?? '{}')));
      return stub.impl(input, init);
    }) as typeof fetch;
    const spied = new DhanHttpClient({ fetchImpl: spy, dataRateLimiter: instant() });

    const candles = await fetchCandles(
      { http: spied, session },
      { segment: 'NSE_EQ', securityId: '2885' },
      'equity',
      'D',
      { from: new Date('2026-09-13T18:30:00Z'), to: new Date('2026-09-15T18:30:00Z') },
    );
    expect(candles).toHaveLength(3);
    expect(candles[2]?.close).toBe(124690);
    expect(bodies[0]).toEqual({
      securityId: '2885',
      exchangeSegment: 'NSE_EQ',
      instrument: 'EQUITY',
      expiryCode: 0,
      oi: false,
      fromDate: '2026-09-14',
      toDate: '2026-09-17',
    });
    expect(http).toBeDefined();
  });

  it('posts the interval for intraday bars, chunks at 90 days, and deduplicates', async () => {
    const fixture = jsonFixture('charts-intraday.json');
    const { http, stub } = client([{ body: fixture }, { body: fixture }]);
    const candles = await fetchCandles(
      { http, session },
      { segment: 'IDX_I', securityId: '13' },
      'index',
      '1',
      { from: new Date('2026-06-01T00:00:00Z'), to: new Date('2026-09-16T10:00:00Z') }, // 107 days → 2 chunks
    );
    expect(stub.calls).toHaveLength(2);
    expect(stub.calls[0]).toContain('/charts/intraday');
    // Same two bars echoed by both chunks collapse to two.
    expect(candles).toHaveLength(2);
    // The fixture's bars (16 Sep 09:15, 09:16 IST) fall inside the range and survive clipping.
    expect(candles[0]?.timestamp.toISOString()).toBe('2026-09-16T03:45:00.000Z');
    expect(candles[1]?.timestamp.getTime()).toBeGreaterThan(candles[0]?.timestamp.getTime() ?? 0);
  });

  it('clips bars outside the requested range that the exclusive-end over-reach let in', async () => {
    const { http } = client([{ body: jsonFixture('charts-intraday.json') }]);
    // Ask only for the 09:16 bar; the request goes out as 09:15→09:17 and 09:15 must be clipped.
    const candles = await fetchCandles(
      { http, session },
      { segment: 'NSE_EQ', securityId: '2885' },
      'equity',
      '1',
      { from: new Date('2026-09-16T03:46:00Z'), to: new Date('2026-09-16T03:46:00Z') },
    );
    expect(candles.map((c) => c.timestamp.toISOString())).toEqual(['2026-09-16T03:46:00.000Z']);
  });

  it('propagates an expired-token error untouched', async () => {
    const { http } = client([
      { status: 401, body: { errorCode: 807, errorMessage: 'Token expired' } },
    ]);
    await expect(
      fetchCandles({ http, session }, { segment: 'NSE_EQ', securityId: '2885' }, 'equity', 'D', {
        from: new Date('2026-09-01T00:00:00Z'),
        to: new Date('2026-09-02T00:00:00Z'),
      }),
    ).rejects.toMatchObject({ name: 'DhanApiError', code: '807' });
  });
});

describe('quotes over HTTP', () => {
  it('returns usable quotes keyed by segment:id and reports the rest as missing', async () => {
    const { http } = client([{ body: jsonFixture('quote.json') }]);
    const refs = [
      { segment: 'NSE_EQ' as const, securityId: '2885' },
      { segment: 'NSE_EQ' as const, securityId: '11915' },
      { segment: 'NSE_EQ' as const, securityId: '99999' },
      { segment: 'IDX_I' as const, securityId: '13' },
      { segment: 'NSE_EQ' as const, securityId: '424242' }, // not in the response at all
    ];
    const result = await fetchQuotes({ http, session }, refs);
    expect([...result.quotes.keys()].sort()).toEqual(['IDX_I:13', 'NSE_EQ:11915', 'NSE_EQ:2885']);
    expect(result.quotes.get('IDX_I:13')).toMatchObject({ ltp: 2512345, change: -8730 });
    expect(result.missing).toEqual([
      { segment: 'NSE_EQ', securityId: '99999' },
      { segment: 'NSE_EQ', securityId: '424242' },
    ]);
  });

  it('asks for nothing when given nothing', async () => {
    const { http, stub } = client([{ body: {} }]);
    const result = await fetchQuotes({ http, session }, []);
    expect(result.quotes.size).toBe(0);
    expect(stub.calls).toHaveLength(0);
  });

  it('surfaces a not-subscribed answer as an API error', async () => {
    const { http } = client([
      {
        status: 400,
        body: {
          status: 'failure',
          remarks: { error_code: 806, error_message: 'Data APIs not subscribed' },
        },
      },
    ]);
    await expect(
      fetchQuotes({ http, session }, [{ segment: 'NSE_EQ', securityId: '2885' }]),
    ).rejects.toBeInstanceOf(DhanApiError);
  });
});
