import { describe, expect, it, vi } from 'vitest';
import { createContext } from './context.js';
import { CREDENTIAL_STRATEGIES } from './credentials.js';

vi.mock('@equitywise/db', () => ({
  // The pool is never opened here: only the wiring above it is under test.
  createDatabase: () => ({ db: {}, close: async () => undefined }),
}));

const fyersEnv = { FYERS_APP_ID: 'APP-100', FYERS_ACCESS_TOKEN: 'fyers-env' };
const dhanEnv = { DHAN_CLIENT_ID: '1103361782', DHAN_ACCESS_TOKEN: 'dhan-env' };

describe('createContext', () => {
  it('defaults to Fyers so an existing deployment is unchanged by the switch', () => {
    const context = createContext({ ...fyersEnv, ...dhanEnv });
    expect(context.providerId).toBe('fyers');
    expect([...context.providers.keys()]).toEqual(['fyers', 'dhan']);
    expect(context.credentialStrategies.map((s) => s.providerId)).toEqual(['fyers', 'dhan']);
  });

  it('switches the active provider with MARKET_DATA_PROVIDER', () => {
    const context = createContext({ ...fyersEnv, ...dhanEnv, MARKET_DATA_PROVIDER: 'dhan' });
    expect(context.providerId).toBe('dhan');
    expect(context.provider.displayName).toBe('Dhan');
    expect(context.provider.capabilities.marketStatus).toBe(false);
  });

  it('builds only the providers whose identity is configured', () => {
    const context = createContext({ ...dhanEnv, MARKET_DATA_PROVIDER: 'dhan' });
    expect([...context.providers.keys()]).toEqual(['dhan']);
    expect(context.credentialStrategies.map((s) => s.providerId)).toEqual(['dhan']);
  });

  it('refuses a selection that was not built, with a remedy', () => {
    expect(() => createContext({ ...fyersEnv, MARKET_DATA_PROVIDER: 'dhan' })).toThrow(
      /MARKET_DATA_PROVIDER=dhan but no such provider is configured \(have: fyers\)/,
    );
    expect(() => createContext({ MARKET_DATA_PROVIDER: 'upstox', ...fyersEnv })).toThrow(
      /have: fyers/,
    );
  });

  it('assembles the router from both providers and tags rows by route', () => {
    const context = createContext({ ...fyersEnv, ...dhanEnv, MARKET_DATA_PROVIDER: 'routed' });
    expect(context.provider.id).toBe('routed');
    expect(context.provider.displayName).toBe('Dhan + Fyers');
    // Daily rows come from Dhan, signal minutes from Fyers — never "routed".
    expect(context.providerId).toBe('dhan');
    expect(context.providerIdFor('intradayBars')).toBe('fyers');
    expect(context.providerIdFor('status')).toBe('fyers');
    expect(context.credentialStrategies.map((s) => s.providerId)).toEqual(['fyers', 'dhan']);
  });

  it('honours a per-route override and refuses the router with one provider', () => {
    const context = createContext({
      ...fyersEnv,
      ...dhanEnv,
      MARKET_DATA_PROVIDER: 'routed',
      MARKET_DATA_ROUTE_BARS: 'fyers',
    });
    expect(context.providerId).toBe('fyers');
    expect(() => createContext({ ...fyersEnv, MARKET_DATA_PROVIDER: 'routed' })).toThrow(
      /MARKET_DATA_PROVIDER=routed but no such provider is configured \(have: fyers\)/,
    );
  });

  it('keeps one token per provider and ignores a provider it did not build', () => {
    const context = createContext({ ...fyersEnv, ...dhanEnv });
    // No throw, no effect: an unknown provider id is not a programming error
    // worth crashing a self-heal over.
    expect(() => context.setAccessToken('upstox', 'x')).not.toThrow();
    expect(() => context.setAccessToken('dhan', 'dhan-rotated')).not.toThrow();
  });
});

describe('credential strategies', () => {
  it('report null when no minting secrets are set, and are loud when half-set', () => {
    const fyers = CREDENTIAL_STRATEGIES.get('fyers');
    const dhan = CREDENTIAL_STRATEGIES.get('dhan');
    expect(fyers?.minter({})).toBeNull();
    expect(dhan?.minter({})).toBeNull();
    expect(() => dhan?.minter({ DHAN_CLIENT_ID: '1' })).toThrow(/DHAN_PIN, DHAN_TOTP_SECRET/);
    expect(() => fyers?.minter({ FYERS_ID: 'XK1' })).toThrow(/FYERS_TOTP_SECRET/);
  });

  it('only Dhan asks for the nightly rollover', () => {
    expect(CREDENTIAL_STRATEGIES.get('fyers')?.nightlyRollover).toBe(false);
    expect(CREDENTIAL_STRATEGIES.get('dhan')?.nightlyRollover).toBe(true);
  });
});
