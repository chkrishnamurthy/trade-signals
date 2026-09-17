import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_ROUTES, readProviderSelection, readRoutingConfig } from '../config.js';
import { MarketDataProviderError } from '../errors.js';
import type { MarketDataProvider, TickSubscription } from '../provider.js';
import { createRoutedProvider, type RouteEvent } from '../routed.js';
import type { Bar } from '../types.js';

const bar: Bar = { timestamp: 0, open: 1, high: 2, low: 1, close: 2, volume: 10 };

function stub(
  id: string,
  overrides: Partial<MarketDataProvider> & { marketStatus?: boolean; streaming?: boolean } = {},
): MarketDataProvider & { calls: string[] } {
  const calls: string[] = [];
  const { marketStatus = false, streaming = false, ...rest } = overrides;
  const base: MarketDataProvider & { calls: string[] } = {
    calls,
    id,
    displayName: id.toUpperCase(),
    capabilities: {
      streaming,
      intradayHistory: true,
      resolutions: ['1m', '5m', '1d', '1w'],
      historyStart: new Date(`2000-01-0${id === 'dhan' ? 1 : 2}T00:00:00Z`),
      maxStreamSymbols: streaming ? 200 : null,
      marketStatus,
    },
    async listInstruments() {
      calls.push('instruments');
      return [];
    },
    async fetchQuotes() {
      calls.push('quotes');
      return { quotes: new Map(), missing: [] };
    },
    async fetchBars(request) {
      calls.push(`bars:${request.resolution}`);
      return [bar];
    },
    async fetchMarketStatus() {
      calls.push('status');
      return { isOpen: true, phase: 'open', checkedAt: new Date(0) };
    },
  };
  return { ...base, ...rest };
}

const failing =
  (failure: MarketDataProviderError['failure'], providerId: string) => async (): Promise<never> => {
    throw new MarketDataProviderError(`${providerId} ${failure}`, { failure, providerId });
  };

function router(
  fyers: MarketDataProvider,
  dhan: MarketDataProvider,
  options: { fallback?: boolean; onRouteEvent?: (e: RouteEvent) => void } = {},
) {
  return createRoutedProvider({
    providers: new Map([
      ['fyers', fyers],
      ['dhan', dhan],
    ]),
    routes: DEFAULT_ROUTES,
    ...options,
  });
}

describe('createRoutedProvider', () => {
  it('sends each question to the provider configured for it', async () => {
    const fyers = stub('fyers', { marketStatus: true });
    const dhan = stub('dhan');
    const routed = router(fyers, dhan);

    await routed.fetchBars({
      ref: { symbol: 'X', kind: 'equity' },
      resolution: '1d',
      range: { from: new Date(0), to: new Date(1) },
    });
    await routed.fetchBars({
      ref: { symbol: 'X', kind: 'equity' },
      resolution: '5m',
      range: { from: new Date(0), to: new Date(1) },
    });
    await routed.fetchQuotes([]);
    await routed.listInstruments();
    await routed.fetchMarketStatus();

    expect(dhan.calls).toEqual(['bars:1d', 'quotes', 'instruments']);
    expect(fyers.calls).toEqual(['bars:5m', 'status']);
  });

  it('composes capabilities from the providers answering each route', () => {
    const fyers = stub('fyers', { marketStatus: true, streaming: true, streamTicks: () => sub() });
    const dhan = stub('dhan');
    const routed = router(fyers, dhan);
    expect(routed.id).toBe('routed');
    expect(routed.displayName).toBe('DHAN + FYERS');
    expect(routed.capabilities).toEqual({
      streaming: true,
      intradayHistory: true,
      resolutions: ['1m', '5m', '1d', '1w'],
      historyStart: new Date('2000-01-01T00:00:00Z'), // from the daily-bars provider
      maxStreamSymbols: 200,
      marketStatus: true,
    });
    expect(routed.providerFor('quotes').id).toBe('dhan');
    expect(routed.streamTicks).toBeDefined();
  });

  it('has no socket when the stream provider has none, so the hub polls', () => {
    const routed = router(stub('fyers'), stub('dhan'));
    expect(routed.capabilities.streaming).toBe(false);
    expect(routed.streamTicks).toBeUndefined();
  });

  it('asks the other provider when the routed one is down, and reports it', async () => {
    const events: RouteEvent[] = [];
    const fyers = stub('fyers');
    const dhan = stub('dhan', { fetchQuotes: failing('rate_limit', 'dhan') });
    const routed = router(fyers, dhan, { onRouteEvent: (e) => events.push(e) });

    const result = await routed.fetchQuotes([{ symbol: 'X', kind: 'equity' }]);
    expect(result.missing).toEqual([]);
    expect(fyers.calls).toEqual(['quotes']);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ route: 'quotes', from: 'dhan', to: 'fyers' });
    expect(events[0]?.fallbackError).toBeUndefined();
  });

  it('does not second-guess an answer: not_found and unsupported propagate', async () => {
    const fyers = stub('fyers');
    const dhan = stub('dhan', { fetchQuotes: failing('not_found', 'dhan') });
    const routed = router(fyers, dhan);
    await expect(routed.fetchQuotes([])).rejects.toMatchObject({ failure: 'not_found' });
    expect(fyers.calls).toEqual([]);
  });

  it('propagates the PRIMARY failure when both fail, so a self-heal targets the right token', async () => {
    const events: RouteEvent[] = [];
    const fyers = stub('fyers', { fetchQuotes: failing('upstream', 'fyers') });
    const dhan = stub('dhan', { fetchQuotes: failing('auth', 'dhan') });
    const routed = router(fyers, dhan, { onRouteEvent: (e) => events.push(e) });

    await expect(routed.fetchQuotes([])).rejects.toMatchObject({
      failure: 'auth',
      providerId: 'dhan',
    });
    expect(events[0]?.fallbackError?.providerId).toBe('fyers');
  });

  it('can have the fallback switched off for measurement', async () => {
    const fyers = stub('fyers');
    const dhan = stub('dhan', { fetchQuotes: failing('upstream', 'dhan') });
    const routed = router(fyers, dhan, { fallback: false });
    await expect(routed.fetchQuotes([])).rejects.toMatchObject({ providerId: 'dhan' });
    expect(fyers.calls).toEqual([]);
  });

  it('refuses a route naming a provider that was not built', () => {
    expect(() =>
      createRoutedProvider({
        providers: new Map([['fyers', stub('fyers')]]),
        routes: DEFAULT_ROUTES,
      }),
    ).toThrow(/Route "bars" names provider "dhan"/);
  });
});

describe('readRoutingConfig', () => {
  it('starts from the production split and lets the environment override a route', () => {
    const config = readRoutingConfig(
      { MARKET_DATA_ROUTE_QUOTES: 'fyers', MARKET_DATA_FALLBACK: '0' },
      ['fyers', 'dhan'],
    );
    expect(config.routes).toEqual({ ...DEFAULT_ROUTES, quotes: 'fyers' });
    expect(config.fallback).toBe(false);
  });

  it('names the variable and the available providers when a route is misconfigured', () => {
    expect(() =>
      readRoutingConfig({ MARKET_DATA_ROUTE_STATUS: 'upstox' }, ['fyers', 'dhan']),
    ).toThrow(/MARKET_DATA_ROUTE_STATUS=upstox .* \(have: fyers, dhan\)/);
    // The defaults themselves need both providers.
    expect(() => readRoutingConfig({}, ['fyers'])).toThrow(/MARKET_DATA_ROUTE_BARS=dhan/);
  });
});

describe('readProviderSelection', () => {
  it('falls back to the incumbent and normalises the value', () => {
    expect(readProviderSelection({}, ['fyers'], 'fyers')).toBe('fyers');
    expect(
      readProviderSelection({ MARKET_DATA_PROVIDER: ' Dhan ' }, ['fyers', 'dhan'], 'fyers'),
    ).toBe('dhan');
    expect(() =>
      readProviderSelection({ MARKET_DATA_PROVIDER: 'routed' }, ['fyers'], 'fyers'),
    ).toThrow(/have: fyers/);
  });
});

function sub(): TickSubscription {
  return {
    state: () => 'live',
    lastMessageAt: () => null,
    subscribe: vi.fn(),
    unsubscribe: vi.fn(),
    stop: vi.fn(),
  };
}
