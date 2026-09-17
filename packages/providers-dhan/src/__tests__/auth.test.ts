import { describe, expect, it } from 'vitest';
import {
  type AuthorizedCredential,
  type CredentialStore,
  checkSubscription,
  ensureCredential,
  RENEW_WITHIN_MS,
  readRefreshConfig,
  refreshCredential,
} from '../auth.js';
import { routedFetch } from './helpers.js';

const config = {
  clientId: '1103361782',
  pin: '1234',
  totpSecret: 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ',
};
const now = new Date('2026-09-17T03:00:00.000Z'); // 08:30 IST

function memoryStore(
  initial: AuthorizedCredential | null,
): CredentialStore & { writes: AuthorizedCredential[] } {
  let current = initial;
  const writes: AuthorizedCredential[] = [];
  return {
    writes,
    async read() {
      return current;
    },
    async write(credential) {
      current = credential;
      writes.push(credential);
    },
  };
}

describe('readRefreshConfig', () => {
  it('is null when nothing is set, complete when all three are, and loud in between', () => {
    expect(readRefreshConfig({})).toBeNull();
    expect(
      readRefreshConfig({ DHAN_CLIENT_ID: '1', DHAN_PIN: '2', DHAN_TOTP_SECRET: 'A' }),
    ).toEqual({
      clientId: '1',
      pin: '2',
      totpSecret: 'A',
    });
    expect(() => readRefreshConfig({ DHAN_CLIENT_ID: '1' })).toThrow(/DHAN_PIN, DHAN_TOTP_SECRET/);
  });
});

describe('refreshCredential', () => {
  it('mints and returns the product-shaped credential', async () => {
    const stub = routedFetch({
      '/app/generateAccessToken': {
        body: { accessToken: 'jwt-1', expiryTime: '2026-09-18T08:30:00' },
      },
    });
    const credential = await refreshCredential({ config, now, fetchImpl: stub.impl });
    expect(credential.accessToken).toBe('jwt-1');
    expect(credential.appId).toBe('1103361782');
    // 08:30 IST next day, minus a minute of slack → 02:59 UTC.
    expect(credential.expiresAt.toISOString()).toBe('2026-09-18T02:59:00.000Z');
  });

  it('surfaces the mint throttle as a retryable product rate limit', async () => {
    const stub = routedFetch({
      '/app/generateAccessToken': {
        body: { status: 'error', message: 'Token can be generated once every 2 minutes.' },
      },
    });
    await expect(refreshCredential({ config, now, fetchImpl: stub.impl })).rejects.toMatchObject({
      name: 'MarketDataProviderError',
      failure: 'rate_limit',
      retryable: true,
      retryAfterMs: 120_000,
    });
  });

  it('surfaces a rejected PIN as an auth failure with a remedy', async () => {
    const stub = routedFetch({
      '/app/generateAccessToken': {
        status: 400,
        body: { errorCode: 'DH-905', errorMessage: 'Invalid PIN' },
      },
    });
    await expect(refreshCredential({ config, now, fetchImpl: stub.impl })).rejects.toMatchObject({
      failure: 'auth',
      retryable: false,
      remedy: expect.stringContaining('DHAN_PIN'),
    });
  });
});

describe('ensureCredential', () => {
  const fresh: AuthorizedCredential = {
    accessToken: 'stored',
    appId: '1103361782',
    expiresAt: new Date(now.getTime() + 20 * 60 * 60 * 1_000), // 20 h left
  };

  it('keeps a stored token with plenty of life and touches nothing', async () => {
    const stub = routedFetch({});
    const store = memoryStore(fresh);
    const result = await ensureCredential({ config, store, now, fetchImpl: stub.impl });
    expect(result).toEqual({ credential: fresh, refreshed: false, via: 'stored' });
    expect(stub.calls).toHaveLength(0);
    expect(store.writes).toHaveLength(0);
  });

  it('renews a token that is alive but ageing, without touching the secrets', async () => {
    const stub = routedFetch({
      '/v2/RenewToken': { body: { accessToken: 'renewed', expiryTime: '2026-09-18T08:30:00' } },
    });
    const ageing = { ...fresh, expiresAt: new Date(now.getTime() + RENEW_WITHIN_MS - 1) };
    const store = memoryStore(ageing);
    const result = await ensureCredential({ config, store, now, fetchImpl: stub.impl });
    expect(result.via).toBe('renewed');
    expect(result.credential.accessToken).toBe('renewed');
    expect(store.writes).toHaveLength(1);
    expect(stub.calls).toHaveLength(1);
    expect(stub.calls[0]).toContain('/v2/RenewToken');
    expect((stub.headers[0] as Record<string, string>)['access-token']).toBe('stored');
  });

  it('falls back to a mint when renewal fails', async () => {
    const stub = routedFetch({
      '/v2/RenewToken': { status: 401, body: { errorCode: 807, errorMessage: 'expired' } },
      '/app/generateAccessToken': {
        body: { accessToken: 'minted', expiryTime: '2026-09-18T08:30:00' },
      },
    });
    const ageing = { ...fresh, expiresAt: new Date(now.getTime() + 60_000) };
    const store = memoryStore(ageing);
    const result = await ensureCredential({ config, store, now, fetchImpl: stub.impl });
    expect(result.via).toBe('minted');
    expect(result.credential.accessToken).toBe('minted');
    expect(stub.calls.map((u) => new URL(u).pathname)).toEqual([
      '/v2/RenewToken',
      '/app/generateAccessToken',
    ]);
  });

  it('mints when the store is empty, expired, or for another client', async () => {
    const routes = {
      '/app/generateAccessToken': {
        body: { accessToken: 'minted', expiryTime: '2026-09-18T08:30:00' },
      },
    };
    for (const initial of [
      null,
      { ...fresh, expiresAt: new Date(now.getTime() - 1) },
      { ...fresh, appId: '999' },
    ]) {
      const stub = routedFetch(routes);
      const store = memoryStore(initial);
      const result = await ensureCredential({ config, store, now, fetchImpl: stub.impl });
      expect(result.via).toBe('minted');
      expect(store.writes).toHaveLength(1);
      expect(stub.calls.map((u) => new URL(u).pathname)).toEqual(['/app/generateAccessToken']);
    }
  });

  it('does not paper over a failed mint with the stale token', async () => {
    const stub = routedFetch({
      '/app/generateAccessToken': {
        status: 400,
        body: { errorCode: 'DH-905', errorMessage: 'Invalid TOTP' },
      },
    });
    const store = memoryStore({ ...fresh, expiresAt: new Date(now.getTime() - 1) });
    await expect(
      ensureCredential({ config, store, now, fetchImpl: stub.impl }),
    ).rejects.toMatchObject({
      failure: 'auth',
    });
    expect(store.writes).toHaveLength(0);
  });
});

describe('checkSubscription', () => {
  it('reads the Data API state from the profile', async () => {
    const stub = routedFetch({
      '/v2/profile': {
        body: {
          dhanClientId: '1103361782',
          dataPlan: 'Active',
          dataValidity: '2026-10-15 22:46:27.0',
          tokenValidity: '18/09/2026 08:30',
        },
      },
    });
    expect(await checkSubscription({ appId: '1103361782', accessToken: 'jwt' }, stub.impl)).toEqual(
      {
        dataApiActive: true,
        dataValidUntil: '2026-10-15 22:46:27.0',
        tokenValidUntil: '18/09/2026 08:30',
      },
    );
  });
});
