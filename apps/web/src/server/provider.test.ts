import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({
  getProviderCredential: vi.fn(),
}));
vi.mock('@equitywise/db', () => ({ getProviderCredential: mock.getProviderCredential }));
vi.mock('./db', () => ({ isDatabaseConfigured: () => true, getDatabase: () => ({}) }));

const future = new Date(Date.now() + 6 * 60 * 60 * 1_000);

/** A fresh module per test: the root caches the provider and the token read. */
async function root() {
  vi.resetModules();
  return import('./provider');
}

beforeEach(() => {
  vi.stubEnv('FYERS_APP_ID', 'APP-100');
  vi.stubEnv('FYERS_ACCESS_TOKEN', 'fyers-env');
  vi.stubEnv('FYERS_STREAM', '0');
  vi.stubEnv('DHAN_STREAM', '0');
  vi.stubEnv('DHAN_CLIENT_ID', '1103361782');
  vi.stubEnv('DHAN_ACCESS_TOKEN', 'dhan-env');
  vi.stubEnv('MARKET_DATA_PROVIDER', '');
  mock.getProviderCredential.mockReset();
  mock.getProviderCredential.mockImplementation(async (_db: unknown, providerId: string) => ({
    providerId,
    appId: providerId === 'dhan' ? '1103361782' : 'APP-100',
    accessToken: `${providerId}-stored`,
    expiresAt: future,
    updatedAt: new Date(),
  }));
});
afterEach(() => vi.unstubAllEnvs());

describe('getProvider', () => {
  it('serves Fyers by default and reads its own credential row', async () => {
    const { getProvider, activeProviderId } = await root();
    expect(activeProviderId()).toBe('fyers');
    const provider = await getProvider();
    expect(provider.id).toBe('fyers');
    expect(mock.getProviderCredential).toHaveBeenCalledWith({}, 'fyers');
  });

  it('serves Dhan when MARKET_DATA_PROVIDER says so, from the dhan row', async () => {
    vi.stubEnv('MARKET_DATA_PROVIDER', 'dhan');
    const { getProvider } = await root();
    const provider = await getProvider();
    expect(provider.id).toBe('dhan');
    expect(provider.capabilities.streaming).toBe(false);
    expect(mock.getProviderCredential).toHaveBeenCalledWith({}, 'dhan');
    expect(mock.getProviderCredential).not.toHaveBeenCalledWith({}, 'fyers');
  });

  it('reuses the built provider while the credential is unchanged', async () => {
    const { getProvider } = await root();
    const first = await getProvider();
    const second = await getProvider();
    expect(second).toBe(first);
    expect(mock.getProviderCredential).toHaveBeenCalledTimes(1); // cached read
  });

  it('ignores a stored row minted for another principal', async () => {
    vi.stubEnv('MARKET_DATA_PROVIDER', 'dhan');
    mock.getProviderCredential.mockResolvedValue({
      providerId: 'dhan',
      appId: '9999999999',
      accessToken: 'someone-elses',
      expiresAt: future,
      updatedAt: new Date(),
    });
    const { getProvider } = await root();
    // No throw: the environment token is used instead. The provider cannot be
    // asked which token it holds, so the observable is that it builds at all
    // (an empty token would be a `not_configured` error).
    await expect(getProvider()).resolves.toMatchObject({ id: 'dhan' });
  });

  it('assembles the router and reuses it while both credentials hold', async () => {
    vi.stubEnv('MARKET_DATA_PROVIDER', 'routed');
    const { getProvider, describeDataSources } = await root();
    const provider = await getProvider();
    expect(provider.id).toBe('routed');
    expect(provider.displayName).toBe('Dhan + Fyers');
    // Status stays authoritative (Fyers); the socket is off in this test env.
    expect(provider.capabilities.marketStatus).toBe(true);
    expect(provider.capabilities.streaming).toBe(false);
    expect(await getProvider()).toBe(provider);
    expect(describeDataSources()).toEqual({
      active: 'Routed',
      routes: [
        { route: 'bars', provider: 'Dhan' },
        { route: 'intradayBars', provider: 'Fyers' },
        { route: 'quotes', provider: 'Dhan' },
        { route: 'instruments', provider: 'Dhan' },
        { route: 'status', provider: 'Fyers' },
        { route: 'stream', provider: 'Fyers' },
      ],
    });
  });

  it('describes a single provider as answering every route', async () => {
    const { describeDataSources } = await root();
    const described = describeDataSources();
    expect(described.active).toBe('Fyers');
    expect(new Set(described.routes.map((r) => r.provider))).toEqual(new Set(['Fyers']));
  });

  it('routes the live socket to Dhan on request, 5,000 symbols per connection', async () => {
    vi.stubEnv('MARKET_DATA_PROVIDER', 'routed');
    vi.stubEnv('MARKET_DATA_ROUTE_STREAM', 'dhan');
    vi.stubEnv('DHAN_STREAM', '1');
    const { getProvider, describeDataSources } = await root();
    const provider = await getProvider();
    expect(provider.capabilities.streaming).toBe(true);
    expect(provider.capabilities.maxStreamSymbols).toBe(5_000);
    expect(provider.streamTicks).toBeDefined();
    expect(describeDataSources().routes.find((r) => r.route === 'stream')?.provider).toBe('Dhan');
  });

  it('DHAN_STREAM=0 is the kill switch: no socket, the hub polls', async () => {
    vi.stubEnv('MARKET_DATA_PROVIDER', 'dhan');
    const { getProvider } = await root();
    const provider = await getProvider();
    expect(provider.capabilities.streaming).toBe(false);
    expect(provider.streamTicks).toBeUndefined();
  });

  it('refuses a selection whose identity is not configured', async () => {
    vi.stubEnv('DHAN_CLIENT_ID', '');
    vi.stubEnv('MARKET_DATA_PROVIDER', 'dhan');
    const { getProvider } = await root();
    await expect(getProvider()).rejects.toMatchObject({
      failure: 'not_configured',
      message: expect.stringContaining('have: fyers'),
    });
  });
});
