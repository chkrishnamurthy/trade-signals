import type { StreamRequest, StreamState } from '@equitywise/market-data';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { WorkerContext } from '../context.js';
import type { Logger } from '../log.js';
import { createFeedJob } from './feed.js';

const mock = vi.hoisted(() => ({
  observe: vi.fn(async () => undefined),
  instruments: vi.fn(async () => [
    { id: 1, symbol: 'RELIANCE', kind: 'equity', tickSize: 5 },
    { id: 2, symbol: 'TCS', kind: 'equity', tickSize: 5 },
  ]),
  upsertRef: vi.fn(async () => undefined),
  invalidate: vi.fn(async () => undefined),
  refresh: vi.fn(async () => undefined),
}));
vi.mock('node:fs/promises', () => ({
  readFile: async () =>
    'enabled: true\nuniverse: nifty50\nhistoryDays: 14\nhistoryConcurrency: 4\nstrategyRevision: 1',
}));
vi.mock('../universe.js', () => ({
  loadIndexConstituents: async () => [
    { symbol: 'RELIANCE', kind: 'equity', name: 'Reliance', sector: 'Energy' },
    { symbol: 'TCS', kind: 'equity', name: 'TCS', sector: 'IT' },
  ],
}));
vi.mock('./refresh-credential.js', () => ({ refreshProviderCredential: mock.refresh }));
vi.mock('@equitywise/db', () => ({
  observeIntradayPrice: mock.observe,
  signalUniverseInstruments: mock.instruments,
  upsertInstrumentProviderRef: mock.upsertRef,
  invalidateProviderCredential: mock.invalidate,
}));

let clock = 1_000_000;
function setup() {
  let request: StreamRequest | null = null;
  let state: StreamState = 'connecting';
  const stop = vi.fn();
  const provider = {
    id: 'dhan',
    capabilities: { streaming: true },
    listInstruments: vi.fn(async () => [
      { symbol: 'RELIANCE', kind: 'equity', providerRef: '2885' },
      { symbol: 'TCS', kind: 'equity', providerRef: '11536' },
    ]),
    streamTicks: (r: StreamRequest) => {
      request = r;
      return {
        state: () => state,
        lastMessageAt: () => null,
        subscribe() {},
        unsubscribe() {},
        stop,
      };
    },
  };
  const context = {
    db: {},
    provider,
    providers: new Map([['dhan', provider]]),
  } as unknown as WorkerContext;
  const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
  const timers: (() => void)[] = [];
  const feed = createFeedJob(context, log, {
    now: () => clock,
    setInterval: ((fn: () => void) => {
      timers.push(fn);
      return 1 as unknown as ReturnType<typeof setInterval>;
    }) as unknown as typeof setInterval,
    clearInterval: (() => undefined) as unknown as typeof clearInterval,
  });
  const live = () => {
    state = 'live';
    request?.onStateChange?.('live');
  };
  const tick = (symbol: string, ltp: number, at: number) =>
    request?.onTick({
      symbol,
      ltp,
      lastTradedAt: new Date(at),
      exchangeFeedAt: null,
      volumeToday: null,
    });
  const flush = async () => {
    for (const t of timers) t();
    await vi.waitFor(() =>
      expect(feed.status().observations + feed.status().dropped).toBeGreaterThanOrEqual(0),
    );
    await new Promise((r) => setTimeout(r, 0));
  };
  return { feed, provider, request: () => request, live, tick, flush, stop, log };
}

beforeEach(() => {
  vi.clearAllMocks();
  clock = 1_000_000;
});

describe('feed job', () => {
  it('subscribes the universe and coalesces ticks to one observation per instrument per flush', async () => {
    const s = setup();
    await s.feed.start();
    expect(s.request()?.refs.map((r) => r.symbol)).toEqual(['RELIANCE', 'TCS']);
    s.live();
    s.tick('RELIANCE', 295_000, clock - 500);
    s.tick('RELIANCE', 295_100, clock - 200); // newer: wins
    s.tick('TCS', 400_000, clock - 300);
    s.tick('UNKNOWN', 1, clock); // not in the universe
    s.tick('TCS', 400_500, clock + 5_000); // exchange time ahead of receipt: dropped
    s.tick('TCS', 400_600, clock - 20_000); // older than the coverage window: dropped
    await s.flush();
    await vi.waitFor(() => expect(mock.observe).toHaveBeenCalledTimes(2));
    const calls = mock.observe.mock.calls.map((c) => [c[1], c[2]]);
    expect(calls).toContainEqual([1, { at: clock - 200, receivedAt: clock, price: 295_100 }]);
    expect(calls).toContainEqual([2, { at: clock - 300, receivedAt: clock, price: 400_000 }]);
    expect(s.feed.status().dropped).toBe(3);
    expect(s.feed.status().subscribed).toBe(2);
    // The provider refs were recorded for the operator's reconciliation.
    await vi.waitFor(() => expect(mock.upsertRef).toHaveBeenCalledTimes(2));
  });

  it('is healthy only while live and recently ticking; the quote sweep resumes otherwise', async () => {
    const s = setup();
    await s.feed.start();
    expect(s.feed.healthy()).toBe(false);
    s.live();
    expect(s.feed.healthy()).toBe(false); // no tick yet
    s.tick('RELIANCE', 295_000, clock);
    expect(s.feed.healthy()).toBe(true);
    clock += 16_000;
    expect(s.feed.healthy()).toBe(false); // silent beyond the coverage window
    s.request()?.onStateChange?.('reconnecting');
    expect(s.feed.status().reconnects).toBe(1);
    s.feed.stop();
    expect(s.stop).toHaveBeenCalled();
    expect(s.feed.status().running).toBe(false);
  });

  it('self-heals the credential once on an auth failure', async () => {
    const s = setup();
    await s.feed.start();
    const error = Object.assign(new Error('token rejected'), { failure: 'auth' });
    s.request()?.onError?.(error as never);
    s.request()?.onError?.(error as never);
    await vi.waitFor(() => expect(mock.refresh).toHaveBeenCalledTimes(1));
    expect(mock.invalidate).toHaveBeenCalledWith({}, 'dhan');
  });

  it('does nothing without a streaming provider', async () => {
    const context = {
      db: {},
      provider: { id: 'fyers', capabilities: { streaming: false } },
      providers: new Map(),
    } as unknown as WorkerContext;
    const log = { warn: vi.fn(), info: vi.fn(), error: vi.fn() } as unknown as Logger;
    const feed = createFeedJob(context, log);
    await feed.start();
    expect(feed.status().running).toBe(false);
    expect(log.warn).toHaveBeenCalled();
  });
});
