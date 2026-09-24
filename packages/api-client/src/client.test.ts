import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './client';
import { ApiError } from './errors';

const TOKEN = `${'a'.repeat(43)}.${'b'.repeat(43)}`;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function client(fetchImpl: typeof fetch, onSessionEnded = vi.fn()) {
  return {
    api: createApiClient({
      baseUrl: 'https://equitywise.io/',
      clientLabel: 'android/1.0.0 (build 1)',
      getToken: () => TOKEN,
      onSessionEnded,
      fetchImpl,
    }),
    onSessionEnded,
  };
}

const summary = {
  id: 1,
  name: 'Core',
  position: 0,
  isDefault: true,
  count: 2,
  updatedAt: '2026-09-24T04:00:00.000Z',
};

describe('createApiClient', () => {
  it('sends the client label and bearer token, and parses the contract', async () => {
    const fetchImpl = vi.fn(async (_url: RequestInfo | URL, _init?: RequestInit) =>
      jsonResponse({ watchlists: [summary] }),
    );
    const { api } = client(fetchImpl as unknown as typeof fetch);
    await expect(api.watchlists()).resolves.toEqual([summary]);

    const [url, init] = fetchImpl.mock.calls[0] ?? [];
    expect(url).toBe('https://equitywise.io/api/watchlists');
    const headers = init?.headers as Record<string, string>;
    expect(headers['X-EquityWise-Client']).toBe('android/1.0.0 (build 1)');
    expect(headers.Authorization).toBe(`Bearer ${TOKEN}`);
  });

  it('never sends the token to public endpoints', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, session: { token: TOKEN, expiresAt: '2026-10-24T00:00:00Z' } }),
    );
    const { api } = client(fetchImpl as unknown as typeof fetch);
    await api.signIn({
      email: 'a@b.co',
      password: 'x',
      device: { name: 'S24', platform: 'android', appVersion: '1.0.0' },
    });
    const init = (fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('rejects a float where paise belong (contract drift is loud)', async () => {
    const { api } = client((async () =>
      jsonResponse({
        stock: { symbol: 'X', close: 1245.5 },
      })) as unknown as typeof fetch);
    await expect(api.stock('X')).rejects.toMatchObject({ kind: 'parse' });
  });

  it('maps the server error shape and ends the session on 401', async () => {
    const { api, onSessionEnded } = client((async () =>
      jsonResponse(
        { error: 'Not signed in.', code: 'UNAUTHENTICATED' },
        401,
      )) as unknown as typeof fetch);
    const error = await api.watchlists().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: 'UNAUTHENTICATED', endsSession: true });
    expect(onSessionEnded).toHaveBeenCalledOnce();
  });

  it('does not end the session for a plain 403 or a validation error', async () => {
    const { api, onSessionEnded } = client((async () =>
      jsonResponse({ error: 'Forbidden.', code: 'FORBIDDEN' }, 403)) as unknown as typeof fetch);
    await expect(api.adminUsers()).rejects.toMatchObject({ status: 403 });
    expect(onSessionEnded).not.toHaveBeenCalled();
  });

  it('surfaces Retry-After on a 429 and does not retry it', async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ error: 'Too many attempts.', code: 'RATE_LIMIT' }, 429, {
        'Retry-After': '30',
      }),
    );
    const { api } = client(fetchImpl as unknown as typeof fetch);
    await expect(api.watchlists()).rejects.toMatchObject({ retryAfterSeconds: 30 });
    expect(fetchImpl).toHaveBeenCalledOnce();
  });

  it('retries a GET once on a network failure, never a POST', async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls += 1;
      if (calls === 1) throw new TypeError('Network request failed');
      return jsonResponse({ watchlists: [] });
    });
    await expect(client(flaky as unknown as typeof fetch).api.watchlists()).resolves.toEqual([]);
    expect(flaky).toHaveBeenCalledTimes(2);

    const down = vi.fn(async () => {
      throw new TypeError('Network request failed');
    });
    await expect(
      client(down as unknown as typeof fetch).api.createWatchlist('New'),
    ).rejects.toMatchObject({ kind: 'network' });
    expect(down).toHaveBeenCalledOnce();
  });
});
