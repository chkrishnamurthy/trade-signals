import { MarketDataProviderError } from '@equitywise/market-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createCredentialSelfHeal, SELF_HEAL_INTERVAL_MS } from './credential-self-heal.js';

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
