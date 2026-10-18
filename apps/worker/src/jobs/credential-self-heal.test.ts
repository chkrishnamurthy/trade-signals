import { MarketDataProviderError } from '@equitywise/market-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import {
  createCredentialSelfHeal,
  probeProviderCredentials,
  SELF_HEAL_INTERVAL_MS,
} from './credential-self-heal.js';

const mocks = vi.hoisted(() => ({
  invalidate: vi.fn(async () => undefined),
  refresh: vi.fn(async () => []),
}));
vi.mock('@equitywise/db', () => ({ invalidateProviderCredential: mocks.invalidate }));
vi.mock('./refresh-credential.js', () => ({ refreshProviderCredential: mocks.refresh }));

const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
const context = {
  db: {},
  providerId: 'fyers',
  providers: new Map([['fyers', {}]]),
} as unknown as WorkerContext;
const authError = (providerId = 'fyers') =>
  new MarketDataProviderError('token rejected', { failure: 'auth', providerId });

beforeEach(() => vi.clearAllMocks());

describe('createCredentialSelfHeal', () => {
  it('expires and re-mints the credential on an auth failure', async () => {
    const heal = createCredentialSelfHeal(context, log, () => 1_000);
    expect(await heal(authError())).toBe(true);
    expect(mocks.invalidate).toHaveBeenCalledWith({}, 'fyers');
    expect(mocks.refresh).toHaveBeenCalledWith(context, log, { providerId: 'fyers' });
  });

  it('ignores anything that is not an auth failure', async () => {
    const heal = createCredentialSelfHeal(context, log, () => 1_000);
    const limited = new MarketDataProviderError('slow down', {
      failure: 'rate_limit',
      providerId: 'fyers',
    });
    expect(await heal(limited)).toBe(false);
    expect(await heal(new Error('network'))).toBe(false);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('recovers a provider at most once per interval', async () => {
    let clock = 1_000;
    const heal = createCredentialSelfHeal(context, log, () => clock);
    expect(await heal(authError())).toBe(true);
    clock += SELF_HEAL_INTERVAL_MS - 1;
    expect(await heal(authError())).toBe(false);
    clock += 1;
    expect(await heal(authError())).toBe(true);
    expect(mocks.refresh).toHaveBeenCalledTimes(2);
  });

  it('falls back to the active provider for an unknown provider id', async () => {
    const heal = createCredentialSelfHeal(context, log, () => 1_000);
    await heal(authError('routed'));
    expect(mocks.invalidate).toHaveBeenCalledWith({}, 'fyers');
  });
});

describe('probeProviderCredentials', () => {
  const status = { isOpen: true, phase: 'open', checkedAt: new Date(0) };
  const routedContext = (fyersStatus: () => Promise<unknown>) =>
    ({
      db: {},
      providerId: 'dhan',
      providers: new Map([
        ['dhan', { fetchMarketStatus: async () => status }],
        ['fyers', { fetchMarketStatus: fyersStatus }],
      ]),
    }) as unknown as WorkerContext;

  it('re-mints the provider whose credential is rejected, even when it is not the active one', async () => {
    const context = routedContext(async () => {
      throw authError('fyers');
    });
    await probeProviderCredentials(context, createCredentialSelfHeal(context, log), log);
    expect(mocks.invalidate).toHaveBeenCalledTimes(1);
    expect(mocks.invalidate).toHaveBeenCalledWith({}, 'fyers');
  });

  it('attributes an auth failure without a known provider id to the probed provider', async () => {
    const context = routedContext(async () => {
      throw authError('unknown');
    });
    await probeProviderCredentials(context, createCredentialSelfHeal(context, log), log);
    expect(mocks.invalidate).toHaveBeenCalledWith({}, 'fyers');
  });

  it('does nothing when every credential is accepted', async () => {
    const context = routedContext(async () => status);
    await probeProviderCredentials(context, createCredentialSelfHeal(context, log), log);
    expect(mocks.invalidate).not.toHaveBeenCalled();
  });

  it('logs a non-auth failure and keeps probing', async () => {
    const dhan = vi.fn(async () => status);
    const context = {
      db: {},
      providerId: 'fyers',
      providers: new Map([
        ['fyers', { fetchMarketStatus: async () => Promise.reject(new Error('timeout')) }],
        ['dhan', { fetchMarketStatus: dhan }],
      ]),
    } as unknown as WorkerContext;
    await probeProviderCredentials(context, createCredentialSelfHeal(context, log), log);
    expect(mocks.invalidate).not.toHaveBeenCalled();
    expect(dhan).toHaveBeenCalled();
    expect(log.warn).toHaveBeenCalledWith('credential probe failed', expect.anything());
  });

  it('keeps probing when one re-mint throws', async () => {
    mocks.refresh.mockRejectedValueOnce(new Error('login failed'));
    const dhan = vi.fn(async () => status);
    const context = {
      db: {},
      providerId: 'fyers',
      providers: new Map([
        ['fyers', { fetchMarketStatus: async () => Promise.reject(authError('fyers')) }],
        ['dhan', { fetchMarketStatus: dhan }],
      ]),
    } as unknown as WorkerContext;
    await probeProviderCredentials(context, createCredentialSelfHeal(context, log), log);
    expect(dhan).toHaveBeenCalled();
    expect(log.error).toHaveBeenCalledWith('credential self-heal failed', expect.anything());
  });
});
