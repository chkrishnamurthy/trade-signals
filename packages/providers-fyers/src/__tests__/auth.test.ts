import { describe, expect, it, vi } from 'vitest';
import {
  type AuthorizedCredential,
  type CredentialStore,
  ensureCredential,
  readRefreshConfig,
  refreshCredential,
} from '../auth.js';

/**
 * The unattended refresh.
 *
 * What matters here is not the happy path — it is that a still-valid credential
 * is NOT replaced (a needless login is a needless 2FA event), that an unusable
 * one always is, and that a half-configured worker fails loudly instead of
 * silently never refreshing.
 */

const CONFIG = {
  appId: 'APP-100',
  fyId: 'XK12345',
  // "SIGNAL" in base32 — valid alphabet, so TOTP generation succeeds.
  totpSecret: 'KNQWY2LO',
  pin: '1234',
} as const;

/** A transport that walks the three vagator steps and then hands back a token. */
function stubLogin(accessToken: string): { fetchImpl: typeof fetch; calls: () => number } {
  let calls = 0;
  const fetchImpl = vi.fn(async (input: string | URL | Request) => {
    calls += 1;
    const url = String(input);
    const body = url.includes('verify_pin')
      ? { data: { access_token: accessToken } }
      : { request_key: 'rk-1' };
    return new Response(JSON.stringify(body), { status: 200 });
  });
  return { fetchImpl: fetchImpl as unknown as typeof fetch, calls: () => calls };
}

function memoryStore(initial: AuthorizedCredential | null = null): CredentialStore & {
  written: () => AuthorizedCredential | null;
} {
  let held = initial;
  return {
    read: async () => held,
    write: async (credential) => {
      held = credential;
    },
    written: () => held,
  };
}

describe('readRefreshConfig', () => {
  it('returns null when no minting secrets are set at all', () => {
    // A deployment that deliberately holds none of these is valid, not broken.
    expect(readRefreshConfig({ FYERS_APP_ID: 'APP-100' })).toBeNull();
  });

  it('reads a complete configuration', () => {
    expect(
      readRefreshConfig({
        FYERS_APP_ID: 'APP-100',
        FYERS_ID: 'XK12345',
        FYERS_TOTP_SECRET: 'KNQWY2LO',
        FYERS_PIN: '1234',
      }),
    ).toEqual(CONFIG);
  });

  it('throws on a half-configuration, naming what is missing', () => {
    // The dangerous case: silently treating this as "not configured" would mean
    // the operator believes refresh is on while it never runs.
    expect(() =>
      readRefreshConfig({ FYERS_APP_ID: 'APP-100', FYERS_ID: 'XK12345', FYERS_PIN: '1234' }),
    ).toThrow(/FYERS_TOTP_SECRET/);
  });
});

describe('refreshCredential', () => {
  it('mints a token and dates it to the next expiry', async () => {
    const { fetchImpl } = stubLogin('fresh-token');
    const credential = await refreshCredential({
      config: CONFIG,
      now: new Date('2026-08-24T03:00:00Z'),
      fetchImpl,
    });

    expect(credential.accessToken).toBe('fresh-token');
    expect(credential.appId).toBe('APP-100');
    // 01:30 UTC the following morning — 07:00 IST, before the pre-open.
    expect(credential.expiresAt.toISOString()).toBe('2026-08-25T01:30:00.000Z');
  });
});

describe('ensureCredential', () => {
  const now = new Date('2026-08-24T03:00:00Z');

  it('reuses a stored credential that is still valid', async () => {
    const store = memoryStore({
      accessToken: 'still-good',
      expiresAt: new Date('2026-08-25T01:30:00Z'),
      appId: 'APP-100',
    });
    const { fetchImpl, calls } = stubLogin('should-not-be-used');

    const result = await ensureCredential({ config: CONFIG, store, now, fetchImpl });

    expect(result.refreshed).toBe(false);
    expect(result.credential.accessToken).toBe('still-good');
    // The point of the test: no login was attempted.
    expect(calls()).toBe(0);
  });

  it('mints and stores a replacement when the stored one has expired', async () => {
    const store = memoryStore({
      accessToken: 'yesterday',
      expiresAt: new Date('2026-08-24T01:30:00Z'),
      appId: 'APP-100',
    });
    const { fetchImpl } = stubLogin('today');

    const result = await ensureCredential({ config: CONFIG, store, now, fetchImpl });

    expect(result.refreshed).toBe(true);
    expect(result.credential.accessToken).toBe('today');
    expect(store.written()?.accessToken).toBe('today');
  });

  it('mints when the stored credential belongs to a different app', async () => {
    // Sending another app's token upstream fails as an opaque auth error.
    const store = memoryStore({
      accessToken: 'other-app',
      expiresAt: new Date('2026-08-25T01:30:00Z'),
      appId: 'APP-999',
    });
    const { fetchImpl } = stubLogin('correct-app');

    const result = await ensureCredential({ config: CONFIG, store, now, fetchImpl });

    expect(result.refreshed).toBe(true);
    expect(result.credential.accessToken).toBe('correct-app');
  });

  it('mints when nothing has ever been stored', async () => {
    const store = memoryStore(null);
    const { fetchImpl } = stubLogin('first-token');

    const result = await ensureCredential({ config: CONFIG, store, now, fetchImpl });

    expect(result.refreshed).toBe(true);
    expect(store.written()?.accessToken).toBe('first-token');
  });

  it('propagates a login failure rather than returning the stale credential', async () => {
    // Continuing with an expired token would surface later as an unrelated
    // authorisation error, hiding the real cause.
    const store = memoryStore({
      accessToken: 'expired',
      expiresAt: new Date('2026-08-24T01:30:00Z'),
      appId: 'APP-100',
    });
    const fetchImpl = vi.fn(
      async () => new Response('upstream unavailable', { status: 503 }),
    ) as unknown as typeof fetch;

    await expect(ensureCredential({ config: CONFIG, store, now, fetchImpl })).rejects.toThrow();
    expect(store.written()?.accessToken).toBe('expired');
  });
});
