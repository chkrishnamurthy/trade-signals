import { describe, expect, it, vi } from 'vitest';
import { FyersApiError, FyersRateLimitError } from '../errors.js';
import { backoffDelay, FyersHttpClient } from '../http.js';
import { RateLimiter } from '../rate-limit.js';
import { historyResponseSchema } from '../types.js';
import { jsonFixture, recordingSleep, stubFetch } from './helpers.js';

/** A limiter that never makes a test wait. */
const instantLimiter = (): RateLimiter =>
  new RateLimiter({
    limits: { perSecond: 1e9, perMinute: 1e9, perDay: 1e9 },
    sleep: async () => {},
  });

describe('backoffDelay', () => {
  it('doubles the ceiling per attempt', () => {
    const atMax = (attempt: number) =>
      backoffDelay(attempt, { baseDelayMs: 1000, maxDelayMs: 30_000 }, () => 1);
    expect(atMax(1)).toBe(1000);
    expect(atMax(2)).toBe(2000);
    expect(atMax(3)).toBe(4000);
    expect(atMax(4)).toBe(8000);
  });

  it('caps at maxDelayMs', () => {
    expect(backoffDelay(10, { baseDelayMs: 1000, maxDelayMs: 30_000 }, () => 1)).toBe(30_000);
  });

  it('jitters within [ceiling/2, ceiling]', () => {
    expect(backoffDelay(1, { baseDelayMs: 1000 }, () => 0)).toBe(500);
    expect(backoffDelay(1, { baseDelayMs: 1000 }, () => 1)).toBe(1000);
  });
});

describe('FyersHttpClient — 429 handling', () => {
  it('treats an HTTP 429 as expected: backs off and retries, does not throw', async () => {
    const { sleep, delays } = recordingSleep();
    const fetchStub = stubFetch([
      { status: 429, body: jsonFixture('rate-limited-429.json') },
      { status: 429, body: jsonFixture('rate-limited-429.json') },
      { status: 200, body: jsonFixture('history-daily.json') },
    ]);

    const client = new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep,
      rateLimiter: instantLimiter(),
      backoff: { baseDelayMs: 1000, maxDelayMs: 8000 },
    });

    const result = await client.request(
      'https://api-t1.fyers.in/data/history',
      historyResponseSchema,
    );

    expect(result.s).toBe('ok');
    expect(result.candles).toHaveLength(4);
    expect(fetchStub.calls).toHaveLength(3);
    // Backoff fired twice, growing, each within its jitter band.
    expect(delays).toHaveLength(2);
    expect(delays[0]).toBeGreaterThanOrEqual(500);
    expect(delays[0]).toBeLessThanOrEqual(1000);
    expect(delays[1]).toBeGreaterThanOrEqual(1000);
    expect(delays[1]).toBeLessThanOrEqual(2000);
  });

  it('also backs off when 429 arrives in-band as code -429 with HTTP 200', async () => {
    const { sleep, delays } = recordingSleep();
    const fetchStub = stubFetch([
      { status: 200, body: jsonFixture('rate-limited-429.json') },
      { status: 200, body: jsonFixture('history-daily.json') },
    ]);

    const client = new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep,
      rateLimiter: instantLimiter(),
    });

    await expect(
      client.request('https://api-t1.fyers.in/data/history', historyResponseSchema),
    ).resolves.toMatchObject({ s: 'ok' });
    expect(delays).toHaveLength(1);
  });

  it('reports every retry to onRetry', async () => {
    const onRetry = vi.fn();
    const fetchStub = stubFetch([
      { status: 429, body: jsonFixture('rate-limited-429.json') },
      { status: 200, body: jsonFixture('history-daily.json') },
    ]);

    await new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep: async () => {},
      rateLimiter: instantLimiter(),
      onRetry,
    }).request('https://x/data/history', historyResponseSchema);

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry.mock.calls[0]?.[0]).toMatchObject({ attempt: 1, status: 429 });
  });

  it('surfaces FyersRateLimitError only once the retry budget is spent', async () => {
    const { sleep, delays } = recordingSleep();
    const fetchStub = stubFetch([{ status: 429, body: jsonFixture('rate-limited-429.json') }]);

    const client = new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep,
      rateLimiter: instantLimiter(),
      backoff: { attempts: 4 },
    });

    await expect(
      client.request('https://x/data/history', historyResponseSchema),
    ).rejects.toBeInstanceOf(FyersRateLimitError);
    expect(fetchStub.calls).toHaveLength(4);
    expect(delays).toHaveLength(3);
  });
});

describe('FyersHttpClient — error surfacing', () => {
  it('throws immediately on a non-retryable API error', async () => {
    const fetchStub = stubFetch([{ status: 200, body: jsonFixture('error-invalid-symbol.json') }]);
    const client = new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep: async () => {},
      rateLimiter: instantLimiter(),
    });

    await expect(client.request('https://x/data/history', historyResponseSchema)).rejects.toThrow(
      /Invalid symbol/,
    );
    expect(fetchStub.calls).toHaveLength(1);
  });

  it('carries the API error code through', async () => {
    const fetchStub = stubFetch([{ status: 200, body: jsonFixture('error-token-expired.json') }]);
    const client = new FyersHttpClient({
      fetchImpl: fetchStub.impl,
      sleep: async () => {},
      rateLimiter: instantLimiter(),
    });

    await expect(
      client.request('https://x/data/history', historyResponseSchema),
    ).rejects.toMatchObject({
      code: -8,
    });
  });

  it('retries 5xx but not 4xx', async () => {
    const serverError = stubFetch([
      { status: 500, body: {} },
      { status: 200, body: jsonFixture('history-empty.json') },
    ]);
    const client = new FyersHttpClient({
      fetchImpl: serverError.impl,
      sleep: async () => {},
      rateLimiter: instantLimiter(),
    });
    await expect(client.request('https://x/a', historyResponseSchema)).resolves.toMatchObject({
      s: 'ok',
    });
    expect(serverError.calls).toHaveLength(2);

    const badRequest = stubFetch([{ status: 400, body: {} }]);
    await expect(
      new FyersHttpClient({
        fetchImpl: badRequest.impl,
        sleep: async () => {},
        rateLimiter: instantLimiter(),
      }).request('https://x/a', historyResponseSchema),
    ).rejects.toBeInstanceOf(FyersApiError);
    expect(badRequest.calls).toHaveLength(1);
  });

  it('rejects a response whose shape does not match the schema', async () => {
    const fetchStub = stubFetch([{ status: 200, body: { s: 'ok', candles: [['not-a-number']] } }]);
    await expect(
      new FyersHttpClient({
        fetchImpl: fetchStub.impl,
        sleep: async () => {},
        rateLimiter: instantLimiter(),
      }).request('https://x/a', historyResponseSchema),
    ).rejects.toThrow(/Unexpected response shape/);
  });
});
