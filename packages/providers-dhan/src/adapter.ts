import {
  DAILY_HISTORY_START,
  DhanFeedTransport,
  DhanHttpClient,
  type DhanSession,
  type FeedMode,
  fetchCandles,
  fetchFuturesCandles,
  fetchQuotes,
  InstrumentIndex,
  listInstruments,
  MAX_FEED_INSTRUMENTS,
  MAX_QUOTE_INSTRUMENTS,
  type SecurityRef,
  securityKey,
  streamTicks as streamDhanTicks,
} from '@equitywise/dhan';
import type {
  Bar,
  BarsRequest,
  FuturesOiBar,
  FuturesOiRequest,
  Instrument,
  InstrumentRef,
  MarketDataProvider,
  MarketStatus,
  ProviderCapabilities,
  Quote,
  QuotesResult,
  Resolution,
  StreamRequest,
  StreamState,
  TickSubscription,
} from '@equitywise/market-data';
import { exchangeOf, listingKey } from '@equitywise/market-data';
import type { PathCircuitBreaker, RateLimiter, TickTransport } from '@equitywise/shared';
import { istDateKey, isWeekend } from '@equitywise/shared';
import {
  DhanNotConfiguredError,
  PROVIDER_ID,
  toProviderError,
  unknownInstrumentError,
} from './errors.js';
import {
  aggregateMinutes,
  aggregateWeekly,
  inferMarketStatus,
  toBar,
  toFuturesOiBar,
  toInstrument,
  toQuote,
} from './mapping.js';
import { planResolution, SUPPORTED_RESOLUTIONS } from './resolution.js';

/**
 * Dhan as a `MarketDataProvider`.
 *
 * This is the only file in the repo that may hold both a Dhan type and a
 * product type in the same scope. Everything Dhan-shaped stops here: security
 * ids, segments, interval codes, error classes.
 *
 * One piece of state Fyers never needed: Dhan addresses instruments by a
 * numeric id, so every call first resolves our symbol through the scrip
 * master. The master (~35 MB, refreshed daily upstream) is downloaded on
 * first use and cached for a day; a lookup miss is a loud `not_found`, never
 * an empty result.
 */

export interface DhanProviderOptions {
  /** The 10-digit client id. */
  readonly clientId: string;
  /**
   * The bearer credential, or a function returning the current one.
   *
   * Pass a function when the credential rotates underneath a long-lived
   * process — the worker's daily refresh. The provider then reads it per
   * request rather than capturing it, so rotation does not require rebuilding
   * the provider and with it the limiters and breaker below, whose state must
   * outlive a rotation.
   */
  readonly accessToken: string | (() => string);
  /** Shared across every request on purpose: Dhan's budgets are per ACCOUNT. */
  readonly dataRateLimiter?: RateLimiter;
  readonly quoteRateLimiter?: RateLimiter;
  /** Shared across providers for one account; bans outlive a credential. */
  readonly circuitBreaker?: PathCircuitBreaker;
  readonly timeoutMs?: number;
  readonly attempts?: number;
  /** Injectable transport for tests. */
  readonly fetchImpl?: typeof fetch;
  /** A pre-built index, for tests and for sharing one download between processes. */
  readonly instruments?: InstrumentIndex;
  /** How long a downloaded scrip master is trusted. Default one day. */
  readonly instrumentCacheTtlMs?: number;
  /** Injectable clock, for the cache TTL, the forming-bar rule and market status. */
  readonly now?: () => Date;
  /** Injectable pause, so tests of the paced derivatives loop do not wait. */
  readonly sleep?: (ms: number) => Promise<void>;
  /**
   * Enables the live tick socket (Phase 7). Absent means no streaming: the
   * product's hub then polls `fetchQuotes`, exactly as before.
   *
   * `createTransport` is called with the CURRENT session on every
   * (re)connect, so a rotated credential reaches the socket without
   * rebuilding the provider. Injectable for tests; the default speaks the
   * documented binary feed over Node's built-in `WebSocket`.
   */
  readonly stream?: {
    readonly mode?: FeedMode;
    readonly createTransport?: (session: DhanSession) => TickTransport<string>;
  };
}

const DEFAULT_INSTRUMENT_TTL_MS = 24 * 60 * 60 * 1_000;

/**
 * Gap between one stock's contract requests.
 *
 * Dhan counts chart calls in a ROLLING second (observed 2026-09-17: three
 * back-to-back calls at the end of one limiter window plus one at the start
 * of the next earned `HTTP 429`, at a steady 2.8/s nothing did). The shared
 * limiter's fixed windows cannot express that, so the one place that fires
 * several chart calls in a row spaces them itself.
 */
const CONTRACT_PACE_MS = 400;

function capabilities(streaming: boolean): ProviderCapabilities {
  return {
    streaming,
    intradayHistory: true,
    resolutions: SUPPORTED_RESOLUTIONS,
    // Daily history reaches back to listing. Intraday is a rolling five years;
    // callers that backfill 1m must clamp to `intradayHistoryStart(now)` from
    // `@equitywise/dhan` rather than read this single instant as the 1m horizon.
    historyStart: DAILY_HISTORY_START,
    // Documented per-connection cap — 25× the Fyers socket's 200.
    maxStreamSymbols: streaming ? MAX_FEED_INSTRUMENTS : null,
    // No market-status endpoint. `fetchMarketStatus` infers from the clock and
    // says so here, so nothing badges "Live" on a trading holiday because of us.
    marketStatus: false,
    // `/charts/historical` with `oi: true` on an `NSE_FNO` stock future.
    derivatives: true,
  };
}

export function createDhanProvider(options: DhanProviderOptions): MarketDataProvider {
  const { accessToken } = options;
  const readToken = typeof accessToken === 'function' ? accessToken : (): string => accessToken;
  const now = options.now ?? ((): Date => new Date());
  const sleep =
    options.sleep ?? ((ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms)));

  const missing: string[] = [];
  if (options.clientId === '') missing.push('DHAN_CLIENT_ID');
  // Only a literal empty token is a configuration error at construction. A
  // getter is legitimately empty until the first refresh lands, so it is
  // checked per request instead — see `session()` below.
  if (typeof accessToken === 'string' && accessToken === '') missing.push('DHAN_ACCESS_TOKEN');
  if (missing.length > 0) throw toProviderError(new DhanNotConfiguredError(missing));

  const http = new DhanHttpClient({
    ...(options.dataRateLimiter === undefined ? {} : { dataRateLimiter: options.dataRateLimiter }),
    ...(options.quoteRateLimiter === undefined
      ? {}
      : { quoteRateLimiter: options.quoteRateLimiter }),
    ...(options.circuitBreaker === undefined ? {} : { circuitBreaker: options.circuitBreaker }),
    ...(options.fetchImpl === undefined ? {} : { fetchImpl: options.fetchImpl }),
    backoff: { attempts: options.attempts ?? 3, baseDelayMs: 800, maxDelayMs: 5_000 },
    timeoutMs: options.timeoutMs ?? 12_000,
  });

  /** Resolved per request, so a rotated credential takes effect immediately. */
  function session(): DhanSession {
    const token = readToken();
    if (token === '') throw toProviderError(new DhanNotConfiguredError(['DHAN_ACCESS_TOKEN']));
    return { clientId: options.clientId, accessToken: token };
  }

  // -------------------------------------------------------------------------
  // Scrip master cache
  // -------------------------------------------------------------------------

  let cached: { index: InstrumentIndex; loadedAt: number } | null =
    options.instruments === undefined
      ? null
      : { index: options.instruments, loadedAt: Number.POSITIVE_INFINITY };
  let loading: Promise<InstrumentIndex> | null = null;
  const ttlMs = options.instrumentCacheTtlMs ?? DEFAULT_INSTRUMENT_TTL_MS;

  async function instrumentIndex(): Promise<InstrumentIndex> {
    const at = now().getTime();
    if (cached !== null && at - cached.loadedAt < ttlMs) return cached.index;
    // One download at a time: N concurrent first calls share the promise
    // rather than each pulling 35 MB.
    loading ??= (async () => {
      try {
        const { instruments, futures } = await listInstruments(http);
        const index = new InstrumentIndex(instruments, futures);
        cached = { index, loadedAt: now().getTime() };
        return index;
      } catch (error) {
        // A stale master beats no master: symbols rarely change day to day,
        // and the alternative is every call failing until the CDN is back.
        if (cached !== null) return cached.index;
        throw toProviderError(error);
      } finally {
        loading = null;
      }
    })();
    return loading;
  }

  async function resolve(ref: InstrumentRef): Promise<SecurityRef> {
    const index = await instrumentIndex();
    const found = index.refFor(ref.symbol, ref.kind, exchangeOf(ref));
    if (found === null) throw unknownInstrumentError(ref.symbol, ref.kind);
    return found;
  }

  // -------------------------------------------------------------------------

  const provider: MarketDataProvider = {
    id: PROVIDER_ID,
    displayName: 'Dhan',
    capabilities: capabilities(options.stream !== undefined),

    async listInstruments(): Promise<readonly Instrument[]> {
      const index = await instrumentIndex();
      return index.all().map(toInstrument);
    },

    async fetchQuotes(refs: readonly InstrumentRef[]): Promise<QuotesResult> {
      if (refs.length === 0) return { quotes: new Map(), missing: [] };

      const index = await instrumentIndex();
      const wanted: SecurityRef[] = [];
      const refByKey = new Map<string, InstrumentRef>();
      const missing: string[] = [];
      for (const ref of refs) {
        const found = index.refFor(ref.symbol, ref.kind, exchangeOf(ref));
        // A watchlist with one delisted name must not fail for the other
        // forty-nine; the unknown symbol is reported, not thrown.
        if (found === null) {
          missing.push(listingKey(ref));
          continue;
        }
        wanted.push(found);
        refByKey.set(securityKey(found), ref);
      }

      try {
        const result = await fetchQuotes({ http, session: session() }, wanted);
        const quotes = new Map<string, Quote>();
        for (const [key, quote] of result.quotes) {
          const ref = refByKey.get(key);
          if (ref !== undefined) {
            quotes.set(listingKey(ref), toQuote(ref.symbol, exchangeOf(ref), quote));
          }
        }
        for (const securityRef of result.missing) {
          const ref = refByKey.get(securityKey(securityRef));
          if (ref !== undefined) missing.push(listingKey(ref));
        }
        return { quotes, missing };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchBars(request: BarsRequest): Promise<readonly Bar[]> {
      const { ref, resolution, range, includeForming = false } = request;
      const at = request.now ?? now();
      const plan = planResolution(resolution);
      try {
        const target = await resolve(ref);
        const candles = await fetchCandles(
          { http, session: session() },
          target,
          ref.kind,
          plan.fetch,
          { from: range.from, to: range.to },
        );
        const native: Resolution = plan.fetch === 'D' ? '1d' : '1m';
        let bars: Bar[] = candles.map((candle) => toBar(candle, native));
        if (plan.derived === 'minutes-from-1m') bars = aggregateMinutes(bars, plan.minutes);
        if (plan.derived === '1w-from-1d') bars = aggregateWeekly(bars);
        return includeForming ? bars : dropFormingBar(bars, resolution, at);
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchMarketStatus(): Promise<MarketStatus> {
      return inferMarketStatus(now());
    },

    async listDerivativeUnderlyings(): Promise<readonly string[]> {
      try {
        const index = await instrumentIndex();
        // Only underlyings that are also listed cash equities: a futures row
        // on a name the master has no `NSE_EQ` row for is not screenable.
        return index
          .futuresUnderlyings()
          .filter((symbol) => index.lookup(symbol, 'equity') !== null)
          .sort();
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchFuturesOpenInterest(request: FuturesOiRequest): Promise<readonly FuturesOiBar[]> {
      const { ref, range } = request;
      const at = request.now ?? now();
      try {
        const index = await instrumentIndex();
        // A stock outside F&O is a `not_found` like an unknown symbol — the
        // caller asked for something this market does not list.
        const contracts = index.futuresFor(ref.symbol);
        if (contracts.length === 0) throw unknownInstrumentError(ref.symbol, ref.kind);

        const bars: FuturesOiBar[] = [];
        for (const [i, contract] of contracts.entries()) {
          if (i > 0) await sleep(CONTRACT_PACE_MS);
          const candles = await fetchFuturesCandles({ http, session: session() }, contract, {
            from: range.from,
            to: range.to,
          });
          const mapped = candles.map((candle) => toFuturesOiBar(candle, contract.expiry));
          // Closed sessions only, per contract: the same rule as `fetchBars`.
          bars.push(...dropFormingBar(mapped, '1d', at));
        }
        return bars.sort(
          (a, b) =>
            a.timestamp - b.timestamp || (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0),
        );
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };

  const streamOptions = options.stream;
  if (streamOptions === undefined) return provider;
  const mode = streamOptions.mode ?? 'ticker';
  const createTransport =
    streamOptions.createTransport ??
    ((current: DhanSession): TickTransport<string> => new DhanFeedTransport(current, { mode }));

  return {
    ...provider,
    streamTicks(request: StreamRequest): TickSubscription {
      return openStream(request, {
        instrumentIndex,
        createTransport: () => createTransport(session()),
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Streaming
// ---------------------------------------------------------------------------

interface StreamDeps {
  readonly instrumentIndex: () => Promise<InstrumentIndex>;
  readonly createTransport: () => TickTransport<string>;
}

/**
 * A product subscription over the Dhan feed.
 *
 * The one thing Fyers never needed: symbols must be resolved to security ids
 * through the scrip master, which is asynchronous, while `streamTicks` is not.
 * So the subscription is returned at once in `connecting`, the socket opens
 * once the master is in hand, and symbols added or removed meanwhile are
 * applied when it is. An unknown symbol is simply not streamed — the hub
 * polls whatever the socket does not cover, so it degrades, never fails.
 */
function openStream(request: StreamRequest, deps: StreamDeps): TickSubscription {
  // Keyed by listing key: RELIANCE and BSE:RELIANCE are two subscriptions.
  const wanted = new Map<string, InstrumentRef>();
  for (const ref of request.refs) wanted.set(listingKey(ref), ref);
  const keyByListing = new Map<string, string>();
  const refByKey = new Map<string, InstrumentRef>();

  let state: StreamState = 'connecting';
  let lastMessageAt: Date | null = null;
  let stream: ReturnType<typeof streamDhanTicks> | null = null;
  let index: InstrumentIndex | null = null;
  let stopped = false;

  const setState = (next: StreamState): void => {
    if (state === next) return;
    state = next;
    request.onStateChange?.(next);
  };

  /** Resolves and remembers; returns only the keys that are new. */
  const keysFor = (refs: readonly InstrumentRef[]): string[] => {
    if (index === null) return [];
    const keys: string[] = [];
    for (const ref of refs) {
      const listing = listingKey(ref);
      if (keyByListing.has(listing)) continue;
      const found = index.refFor(ref.symbol, ref.kind, exchangeOf(ref));
      if (found === null) continue;
      const key = securityKey(found);
      keyByListing.set(listing, key);
      refByKey.set(key, ref);
      keys.push(key);
    }
    return keys;
  };

  void (async () => {
    try {
      index = await deps.instrumentIndex();
    } catch (error) {
      request.onError?.(toProviderError(error));
      setState('stopped');
      return;
    }
    if (stopped) return;

    stream = streamDhanTicks(
      keysFor([...wanted.values()]),
      (tick) => {
        lastMessageAt = new Date();
        const ref = refByKey.get(securityKey(tick.ref));
        if (ref === undefined) return;
        request.onTick({
          symbol: ref.symbol,
          exchange: exchangeOf(ref),
          ltp: tick.ltp,
          lastTradedAt: tick.lastTradedAt,
          // The feed carries no exchange timestamp of its own; the trade time
          // is the best "as of" the product can be given.
          exchangeFeedAt: tick.lastTradedAt,
          volumeToday: tick.volume,
        });
      },
      {
        createTransport: deps.createTransport,
        onStateChange: (next) => {
          // 'idle' and 'closed' are transport-level; the product only needs
          // to know whether it is receiving data.
          setState(next === 'idle' ? 'connecting' : next === 'closed' ? 'stopped' : next);
        },
        onError: (error) => {
          request.onError?.(toProviderError(error));
        },
      },
    );
  })();

  return {
    state: () => state,
    lastMessageAt: () => lastMessageAt,
    subscribe: (refs) => {
      for (const ref of refs) wanted.set(listingKey(ref), ref);
      const keys = keysFor(refs);
      if (stream !== null && keys.length > 0) stream.subscribe(keys);
    },
    unsubscribe: (refs) => {
      const keys: string[] = [];
      for (const ref of refs) {
        const listing = listingKey(ref);
        wanted.delete(listing);
        const key = keyByListing.get(listing);
        if (key === undefined) continue;
        keyByListing.delete(listing);
        refByKey.delete(key);
        keys.push(key);
      }
      if (stream !== null && keys.length > 0) stream.unsubscribe(keys);
    },
    stop: () => {
      stopped = true;
      stream?.close();
      setState('stopped');
    },
  };
}

/** Documented per-call quote cap, re-exported for the composition root's sizing. */
export const QUOTE_BATCH_SIZE = MAX_QUOTE_INSTRUMENTS;

const INTRADAY_MINUTES: Readonly<Partial<Record<Resolution, number>>> = {
  '1m': 1,
  '5m': 5,
  '15m': 15,
  '30m': 30,
  '1h': 60,
};

const MS_PER_DAY = 86_400_000;

/** Monday (UTC date) of the week a daily-convention timestamp falls in. */
function weekKey(timestamp: number): string {
  const weekday = new Date(timestamp).getUTCDay();
  return new Date(timestamp - ((weekday + 6) % 7) * MS_PER_DAY).toISOString().slice(0, 10);
}

/**
 * Drops the final bar when it may still be forming.
 *
 * The signal engine must never see a partial bar — that is lookahead bias and
 * it silently corrupts every backtest sharing this code path (hard rule 2).
 *
 * Intraday timestamps denote the candle open; a candle is kept only once its
 * full duration has elapsed against the injected clock. Daily bars are decided
 * by IST trading date. Weekly bars are decided by trading WEEK: a bar stamped
 * Monday is forming all the way to Friday's close.
 */
export function dropFormingBar<T extends Bar>(
  bars: readonly T[],
  resolution: Resolution,
  now: Date,
): readonly T[] {
  const last = bars.at(-1);
  if (last === undefined) return bars;

  const minutes = INTRADAY_MINUTES[resolution];
  if (minutes !== undefined) {
    return bars.filter((bar) => bar.timestamp + minutes * 60_000 <= now.getTime());
  }
  if (resolution === '1w') {
    // Forming until the trading week is over: the same Monday-keyed week AND
    // still a weekday. From Saturday the week's bar is final, like a daily bar
    // is final the morning after.
    const today = Date.UTC(
      Number(istDateKey(now).slice(0, 4)),
      Number(istDateKey(now).slice(5, 7)) - 1,
      Number(istDateKey(now).slice(8, 10)),
    );
    const forming = weekKey(last.timestamp) === weekKey(today) && !isWeekend(now);
    return forming ? bars.slice(0, -1) : bars;
  }
  return istDateKey(new Date(last.timestamp)) === istDateKey(now) ? bars.slice(0, -1) : bars;
}
