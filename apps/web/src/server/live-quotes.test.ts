import type {
  InstrumentRef,
  MarketDataProvider,
  MarketStatus,
  StreamRequest,
  StreamState,
} from '@equitywise/market-data';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LiveBatchDto } from '@/lib/watchlist-types';

const mock = vi.hoisted(() => ({
  provider: vi.fn(),
  status: vi.fn(),
}));
vi.mock('./provider', () => ({ getProvider: mock.provider }));
vi.mock('./market-status', () => ({ getMarketStatus: mock.status }));

import { liveQuoteHub } from './live-quotes';

/**
 * A provider whose socket and REST calls are both recorded, so a test can say
 * exactly what upstream was asked for.
 */
function fakeProvider(options: { streaming: boolean }) {
  const socket = {
    requests: [] as StreamRequest[],
    subscribed: new Set<string>(),
    state: 'connecting' as StreamState,
    stopped: 0,
    lastMessageAt: null as Date | null,
  };
  const fetchQuotes = vi.fn(async (refs: readonly InstrumentRef[]) => ({
    quotes: new Map(
      refs.map((ref) => [
        ref.symbol,
        {
          symbol: ref.symbol,
          ltp: 100_00,
          change: 0,
          changePercent: 0,
          open: null,
          high: null,
          low: null,
          previousClose: null,
          averagePrice: null,
          volume: 10,
          timestamp: new Date('2026-09-14T04:00:00Z'),
        },
      ]),
    ),
    missing: [],
  }));

  const provider = {
    id: 'fake',
    displayName: 'Fake',
    capabilities: {
      streaming: options.streaming,
      intradayHistory: false,
      resolutions: [],
      historyStart: null,
      maxStreamSymbols: 200,
      marketStatus: true,
    },
    listInstruments: vi.fn(),
    fetchBars: vi.fn(),
    fetchMarketStatus: vi.fn(),
    fetchQuotes,
    ...(options.streaming
      ? {
          streamTicks(request: StreamRequest) {
            socket.requests.push(request);
            for (const ref of request.refs) socket.subscribed.add(ref.symbol);
            return {
              state: () => socket.state,
              lastMessageAt: () => socket.lastMessageAt,
              subscribe: (refs: readonly InstrumentRef[]) => {
                for (const ref of refs) socket.subscribed.add(ref.symbol);
              },
              unsubscribe: (refs: readonly InstrumentRef[]) => {
                for (const ref of refs) socket.subscribed.delete(ref.symbol);
              },
              stop: () => {
                socket.stopped += 1;
              },
            };
          },
        }
      : {}),
  } as unknown as MarketDataProvider;

  /** Drives the socket to live and delivers a tick, as the real adapter would. */
  const goLive = (): void => {
    socket.state = 'live';
    for (const request of socket.requests) request.onStateChange?.('live');
  };
  const tick = (symbol: string, ltp: number): void => {
    socket.lastMessageAt = new Date();
    for (const request of socket.requests) {
      request.onTick({
        symbol,
        ltp,
        lastTradedAt: null,
        exchangeFeedAt: new Date('2026-09-14T04:00:01Z'),
        volumeToday: 42,
      });
    }
  };

  return { provider, socket, fetchQuotes, goLive, tick };
}

const open: MarketStatus = { isOpen: true, phase: 'open', checkedAt: new Date() };
const closed: MarketStatus = { isOpen: false, phase: 'closed', checkedAt: new Date() };

const ref = (symbol: string): InstrumentRef => ({ symbol, exchange: 'NSE', kind: 'equity' });

/** Lets the hub's awaited status/provider calls settle inside fake time. */
async function settle(ms = 0): Promise<void> {
  await vi.advanceTimersByTimeAsync(ms);
}

/** Every subscription a test opens, so a failed assertion cannot leak one into the next test. */
const opened: { release(): void }[] = [];
function subscribe(refs: InstrumentRef[], deliver: (batch: LiveBatchDto) => void = () => {}) {
  const sub = liveQuoteHub().subscribe(refs, deliver);
  opened.push(sub);
  return sub;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
});
afterEach(async () => {
  // The hub is a process singleton: leave it idle for the next test.
  for (const sub of opened.splice(0)) sub.release();
  await settle(20_000);
  vi.useRealTimers();
});

describe('live quote hub', () => {
  it('opens ONE socket for the union of what every client watches', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    const a = subscribe([ref('RELIANCE'), ref('TCS')], () => {});
    await settle();
    const b = subscribe([ref('TCS'), ref('INFY')], () => {});
    await settle();

    expect(fake.socket.requests).toHaveLength(1);
    expect([...fake.socket.subscribed].sort()).toEqual(['INFY', 'RELIANCE', 'TCS']);

    // The shared symbol survives one client leaving; the private one does not.
    a.release();
    expect([...fake.socket.subscribed].sort()).toEqual(['INFY', 'TCS']);
    b.release();
  });

  it('coalesces ticks to one frame per second, per client, for its own symbols', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    const frames: LiveBatchDto[] = [];
    const sub = subscribe([ref('RELIANCE')], (batch) => frames.push(batch));
    await settle();
    fake.goLive();

    fake.tick('RELIANCE', 250_000);
    fake.tick('RELIANCE', 250_100);
    fake.tick('RELIANCE', 250_200);
    fake.tick('TCS', 400_000); // not this client's

    await settle(1_000);
    const withQuotes = frames.filter((frame) => frame.quotes.length > 0);
    expect(withQuotes).toHaveLength(1);
    expect(withQuotes[0]?.quotes).toEqual([
      expect.objectContaining({ symbol: 'RELIANCE', ltp: 250_200, volume: 42 }),
    ]);
    expect(withQuotes[0]?.state).toBe('streaming');
    sub.release();
  });

  it('polls REST while the socket is not live, and stops once it is', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    const frames: LiveBatchDto[] = [];
    const sub = subscribe([ref('RELIANCE')], (batch) => frames.push(batch));
    await settle();
    // Socket still 'connecting': the first loop iteration polled.
    expect(fake.fetchQuotes).toHaveBeenCalledTimes(1);
    await settle(1_000);
    expect(frames.at(-1)?.state).toBe('polling');

    fake.goLive();
    await settle(3_000);
    await settle(3_000);
    expect(fake.fetchQuotes).toHaveBeenCalledTimes(1);
    sub.release();
  });

  it('keeps polling when a connected socket goes silent', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    subscribe([ref('RELIANCE')]);
    await settle();
    fake.goLive();
    // Ticking keeps the poll off…
    fake.tick('RELIANCE', 250_000);
    await settle(3_000);
    fake.tick('RELIANCE', 250_100);
    await settle(3_000);
    expect(fake.fetchQuotes).toHaveBeenCalledTimes(1);
    // …and ten seconds of nothing turns it back on.
    await settle(12_000);
    expect(fake.fetchQuotes.mock.calls.length).toBeGreaterThan(1);
  });

  it('falls back to REST entirely when the provider cannot stream', async () => {
    const fake = fakeProvider({ streaming: false });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    const sub = subscribe([ref('RELIANCE')], () => {});
    await settle();
    await settle(3_000);
    await settle(3_000);
    expect(fake.fetchQuotes).toHaveBeenCalledTimes(3);
    sub.release();
  });

  it('does nothing upstream while the market is closed', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(closed);

    const frames: LiveBatchDto[] = [];
    const sub = subscribe([ref('RELIANCE')], (batch) => frames.push(batch));
    await settle();
    await settle(30_000);
    expect(fake.socket.requests).toHaveLength(0);
    expect(fake.fetchQuotes).not.toHaveBeenCalled();
    expect(frames.at(-1)?.state).toBe('closed');
    sub.release();
  });

  it('closes the socket once the last client has been gone for a grace period', async () => {
    const fake = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(fake.provider);
    mock.status.mockResolvedValue(open);

    const sub = subscribe([ref('RELIANCE')], () => {});
    await settle();
    sub.release();
    await settle(5_000);
    expect(fake.socket.stopped).toBe(0);
    await settle(10_000);
    expect(fake.socket.stopped).toBe(1);
  });

  it('rebuilds the socket when the provider (credential) changes', async () => {
    const first = fakeProvider({ streaming: true });
    const second = fakeProvider({ streaming: true });
    mock.provider.mockResolvedValue(first.provider);
    mock.status.mockResolvedValue(open);

    const sub = subscribe([ref('RELIANCE')], () => {});
    await settle();
    expect(first.socket.requests).toHaveLength(1);

    mock.provider.mockResolvedValue(second.provider);
    await settle(3_000);
    expect(first.socket.stopped).toBe(1);
    expect(second.socket.requests).toHaveLength(1);
    sub.release();
  });
});
