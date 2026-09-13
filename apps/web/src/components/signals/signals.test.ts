import { evaluateVwapSetup, pendingProjection } from '@equitywise/core';
import { signalDtoSchema } from '@equitywise/shared';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { strategyFixture } from '../../../../../packages/core/src/vwap-fixture';

const mocked = vi.hoisted(() => ({ feed: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mocked.push, replace: mocked.push }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('./use-signal-resource', () => ({ useSignalResource: mocked.feed }));
vi.mock('@/components/layout/app-shell', () => ({
  AppShell: ({ children }: { children: ReactNode }) => children,
}));

import { decimalPaise } from './paper-study-form';
import { conditionValue, SignalCard, SignalsPage, signalDataMode } from './signals-page';

const fixture = strategyFixture();
const signal = signalDtoSchema.parse({
  dataOrigin: 'SIMULATED',
  id: 1,
  instrumentId: 1,
  symbol: 'TEST',
  companyName: 'Test',
  sector: null,
  strategyVersionId: 1,
  publishedAt: fixture.now,
  expiresAt: fixture.now + 900_000,
  evidence: evaluateVwapSetup(fixture, 'BUY').evidence,
  projection: pendingProjection(fixture.now),
  lastPrice: 101560,
  quoteAt: fixture.now,
});
beforeEach(() => {
  mocked.feed.mockReturnValue({ data: null, error: null, refreshing: false, refresh: vi.fn() });
});
describe('signal presentation', () => {
  it('formats frozen checklist prices and times for readers', () => {
    const byId = (id: string) => signal.evidence.conditions.find((c) => c.id === id)!;
    expect(conditionValue(byId('SESSION'), signal)).toBe('2s after candle close');
    expect(conditionValue(byId('PRICE_VWAP'), signal)).toContain('₹1,015.65');
    expect(conditionValue(byId('BENCHMARK_UNAVAILABLE'), signal)).toContain('IST');
  });
  it('renders cards with the strategy name, direction and explainable score', () => {
    const html = renderToStaticMarkup(
      createElement(SignalCard, { signal, now: fixture.now, onInspect: () => {} }),
    );
    expect(html).toContain('Confirmed VWAP Trend Pullback');
    expect(html).toContain('BUY');
    expect(html).toContain('SIMULATED');
    expect(html).toContain('Setup quality');
    expect(html).toContain('Trend');
    expect(html).toContain('Inspect TEST signal');
  });
  it('never labels fixtures or stale observations as live', () => {
    expect(signalDataMode(signal, fixture.now)).toBe('SIMULATED');
    expect(signalDataMode({ ...signal, dataOrigin: 'MARKET' }, fixture.now + 16_000)).toBe(
      'DELAYED',
    );
    expect(signalDataMode({ ...signal, dataOrigin: 'MARKET' }, fixture.now + 86_400_000)).toBe(
      'HISTORICAL',
    );
  });
  it('parses decimal capital exactly, and rejects ambiguous money strings', () => {
    expect(decimalPaise('1245.50')).toBe(124550);
    expect(decimalPaise('0.01')).toBe(1);
    expect(decimalPaise('1.234')).toBeNull();
    expect(decimalPaise('1e5')).toBeNull();
    expect(decimalPaise('-100')).toBeNull();
  });
  it('shows initial loading without fabricated signals', () => {
    const html = renderToStaticMarkup(createElement(SignalsPage));
    expect(html).toContain('Loading verified signals');
    expect(html).not.toContain('<article');
  });
  it('shows a recoverable API error', () => {
    mocked.feed.mockReturnValue({
      data: null,
      error: 'Market data unavailable',
      refreshing: false,
      refresh: vi.fn(),
    });
    const html = renderToStaticMarkup(createElement(SignalsPage));
    expect(html).toContain('role="alert"');
    expect(html).toContain('Retry');
  });
  it('shows an explicit empty and stale-scanner state', () => {
    mocked.feed.mockImplementation((url: string | null) => ({
      data: url?.startsWith('/api/signals?')
        ? { signals: [], total: 0, scanner: null, watchlists: [], asOf: fixture.now }
        : null,
      error: null,
      refreshing: false,
      refresh: vi.fn(),
    }));
    const html = renderToStaticMarkup(createElement(SignalsPage));
    expect(html).toContain('No qualifying setups yet');
    expect(html).toContain('Scanner status unavailable');
  });
});
