import {
  FyersHttpClient,
  fetchCandles,
  fetchMarketStatus,
  fetchQuotes,
  HISTORY_EPOCH_START,
  internalSymbolFor,
  listAllInstruments,
  listInstruments,
  MAX_SUBSCRIPTION_SYMBOLS,
  PathCircuitBreaker,
  parseFyersSymbol,
  RateLimiter,
  SYMBOL_MASTER_URLS,
  streamTicks,
  type TickTransport,
  toFyersSymbol,
} from '@equitywise/fyers';
import type {
  Bar,
  BarsRequest,
  Instrument,
  InstrumentRef,
  MarketDataProvider,
  MarketStatus,
  ProviderCapabilities,
  Quote,
  QuotesResult,
  StreamRequest,
  StreamState,
  Tick,
  TickSubscription,
} from '@equitywise/market-data';
import { exchangeOf, listingKey, MarketDataProviderError } from '@equitywise/market-data';
import { istDateKey } from '@equitywise/shared';
import { FyersNotConfiguredError, PROVIDER_ID, toProviderError } from './errors.js';
import { toBar, toInstrument, toMarketStatus, toQuote, toTick } from './mapping.js';
import { SUPPORTED_RESOLUTIONS, toFyersResolution } from './resolution.js';

/**
 * Fyers as a `MarketDataProvider`.
 *
 * This is the only file in the repo that may hold both a Fyers type and a
 * product type in the same scope. Everything Fyers-shaped stops here: symbol
 * formats, resolution codes, error classes, `fyToken`s.
 */

export interface FyersProviderOptions {
  readonly appId: string;
  /**
   * The bearer credential, or a function returning the current one.
   *
   * Pass a function when the credential rotates underneath a long-lived process
   * — the worker's daily refresh. The provider then reads it per request rather
   * than capturing it, so rotation does not require rebuilding the provider and
   * with it the limiter and breaker below, whose state must outlive a rotation.
   */
  readonly accessToken: string | (() => string);
  /**
   * Shared across every request on purpose.
   *
   * Fyers' limits are per ACCOUNT, not per process or per request. A limiter
   * built per call would let N concurrent callers each believe they owned the
   * whole budget, and three breaches in a day cost the rest of the day.
   */
  readonly rateLimiter?: RateLimiter;
  /** Shared across providers for one account; edge bans outlive a credential. */
  readonly circuitBreaker?: PathCircuitBreaker;
  readonly timeoutMs?: number;
  readonly attempts?: number;
  /** Builds the live socket transport. Omit to disable streaming. */
  readonly createTransport?: () => TickTransport;
  /** How long a downloaded BSE master is trusted. Default one day. */
  readonly bseMasterTtlMs?: number;
  /** Injected clock for the master cache, for tests. */
  readonly now?: () => number;
}

const DAY_MS = 86_400_000;

const CAPABILITIES_BASE = {
  intradayHistory: true,
  resolutions: SUPPORTED_RESOLUTIONS,
  historyStart: HISTORY_EPOCH_START,
  maxStreamSymbols: MAX_SUBSCRIPTION_SYMBOLS,
  marketStatus: true,
  derivatives: false,
} as const;

export function createFyersProvider(options: FyersProviderOptions): MarketDataProvider {
  const { accessToken } = options;
  const readToken = typeof accessToken === 'function' ? accessToken : (): string => accessToken;

  const missing: string[] = [];
  if (options.appId === '') missing.push('FYERS_APP_ID');
  // Only a literal empty token is a configuration error at construction. A
  // getter is legitimately empty until the first refresh lands, so it is
  // checked per request instead — see the getter below.
  if (typeof accessToken === 'string' && accessToken === '') missing.push('FYERS_ACCESS_TOKEN');
  if (missing.length > 0) throw toProviderError(new FyersNotConfiguredError(missing));

  const http = new FyersHttpClient({
    rateLimiter: options.rateLimiter ?? new RateLimiter(),
    circuitBreaker: options.circuitBreaker ?? new PathCircuitBreaker(),
    backoff: { attempts: options.attempts ?? 3, baseDelayMs: 800, maxDelayMs: 5_000 },
    timeoutMs: options.timeoutMs ?? 12_000,
  });
  const fetcher = {
    http,
    /**
     * Resolved per request, so a rotated credential takes effect immediately.
     *
     * An empty token fails here rather than upstream: a request sent with no
     * credential comes back as an opaque authorisation error that gives no hint
     * the real cause was a refresh that never completed.
     */
    get authorization(): string {
      const token = readToken();
      if (token === '') throw toProviderError(new FyersNotConfiguredError(['FYERS_ACCESS_TOKEN']));
      return `${options.appId}:${token}`;
    },
  };

  const capabilities: ProviderCapabilities = {
    ...CAPABILITIES_BASE,
    streaming: options.createTransport !== undefined,
  };

  // -------------------------------------------------------------------------
  // BSE master cache
  // -------------------------------------------------------------------------
  //
  // A BSE equity's Fyers ticker ends in its group (`BSE:RELIANCE-A`), which the
  // exchange reassigns, so it is read from the BSE master rather than
  // templated. The master is a public CDN file: one download a day, shared by
  // every caller, and a stale copy beats none — groups change rarely.

  const clock = options.now ?? Date.now;
  const bseTtl = options.bseMasterTtlMs ?? DAY_MS;
  let bseTickers: { readonly at: number; readonly bySymbol: Map<string, string> } | null = null;
  let bseLoading: Promise<Map<string, string>> | null = null;

  async function bseTickerMap(): Promise<Map<string, string>> {
    if (bseTickers !== null && clock() - bseTickers.at < bseTtl) return bseTickers.bySymbol;
    bseLoading ??= listInstruments(http, SYMBOL_MASTER_URLS.bseCapitalMarket)
      .then(({ instruments }) => {
        const bySymbol = new Map<string, string>();
        for (const i of instruments) if (i.kind === 'equity') bySymbol.set(i.symbol, i.fyersSymbol);
        bseTickers = { at: clock(), bySymbol };
        return bySymbol;
      })
      .catch((error: unknown) => {
        if (bseTickers !== null) return bseTickers.bySymbol;
        throw error;
      })
      .finally(() => {
        bseLoading = null;
      });
    return bseLoading;
  }

  /** True when a ref can be encoded without the BSE master. */
  const encodesSync = (ref: InstrumentRef): boolean =>
    exchangeOf(ref) === 'NSE' || ref.kind === 'index';

  /** Our ref to a Fyers symbol, for refs that need no master lookup. */
  const encodeSync = (ref: InstrumentRef): string =>
    toFyersSymbol(ref.symbol, ref.kind, exchangeOf(ref));

  /**
   * Our ref to a Fyers symbol. A BSE equity missing from the master is a
   * `null`, reported by the caller as missing / not found — never guessed.
   */
  async function encode(ref: InstrumentRef): Promise<string | null> {
    if (encodesSync(ref)) return encodeSync(ref);
    return (await bseTickerMap()).get(ref.symbol.trim().toUpperCase()) ?? null;
  }

  async function encodeOrThrow(ref: InstrumentRef): Promise<string> {
    const encoded = await encode(ref);
    if (encoded === null) throw unknownBse([ref.symbol]);
    return encoded;
  }

  /** A Fyers symbol back to our ref, for rows or ticks that arrive unannounced. */
  function decode(fyersSymbol: string): { symbol: string; exchange: 'NSE' | 'BSE' } {
    try {
      return {
        symbol: internalSymbolFor(fyersSymbol),
        exchange: parseFyersSymbol(fyersSymbol).exchange,
      };
    } catch {
      return { symbol: fyersSymbol, exchange: 'NSE' };
    }
  }

  const provider: MarketDataProvider = {
    id: PROVIDER_ID,
    displayName: 'Fyers',
    capabilities,

    async listInstruments(): Promise<readonly Instrument[]> {
      try {
        const { instruments } = await listAllInstruments(http);
        return instruments.map(toInstrument);
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchQuotes(refs: readonly InstrumentRef[]): Promise<QuotesResult> {
      if (refs.length === 0) return { quotes: new Map(), missing: [] };

      try {
        // Round-trip through the Fyers symbol, then back to ours by the same
        // mapping the socket uses, so aliases resolve identically on both paths.
        const bySymbol = new Map<string, InstrumentRef>();
        const unresolved: string[] = [];
        for (const ref of refs) {
          const encoded = await encode(ref);
          if (encoded === null) unresolved.push(listingKey(ref));
          else bySymbol.set(encoded, ref);
        }
        if (bySymbol.size === 0) return { quotes: new Map(), missing: unresolved };

        const result = await fetchQuotes(fetcher, [...bySymbol.keys()]);
        const quotes = new Map<string, Quote>();
        for (const [fyersSymbol, quote] of result.quotes) {
          const ref = bySymbol.get(fyersSymbol);
          const { symbol, exchange } =
            ref === undefined
              ? decode(fyersSymbol)
              : { symbol: ref.symbol, exchange: exchangeOf(ref) };
          quotes.set(listingKey({ symbol, exchange }), toQuote(symbol, exchange, quote));
        }
        const missing = result.missing.map((fyersSymbol) => {
          const ref = bySymbol.get(fyersSymbol);
          return listingKey(ref ?? decode(fyersSymbol));
        });
        return { quotes, missing: [...missing, ...unresolved] };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchBars(request: BarsRequest): Promise<readonly Bar[]> {
      const { ref, resolution, range, includeForming = false, now = new Date() } = request;
      try {
        const candles = await fetchCandles(
          fetcher,
          await encodeOrThrow(ref),
          toFyersResolution(resolution),
          {
            from: range.from,
            to: range.to,
          },
        );
        const bars = candles.map(toBar);
        return includeForming ? bars : dropFormingBar(bars, resolution, now);
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchMarketStatus(): Promise<MarketStatus> {
      try {
        return toMarketStatus(await fetchMarketStatus(fetcher));
      } catch (error) {
        throw toProviderError(error);
      }
    },
  };

  const createTransport = options.createTransport;
  if (createTransport === undefined) return provider;

  return {
    ...provider,
    streamTicks(request: StreamRequest): TickSubscription {
      /** Fyers symbol -> our ref, so a tick is named exactly as it was asked for. */
      const refByFyers = new Map<string, InstrumentRef>();
      /** Listing key -> Fyers symbol, for unsubscribe. */
      const fyersByKey = new Map<string, string>();
      let stopped = false;

      let lastMessageAt: Date | null = null;
      let state: StreamState = 'connecting';

      const toProductTick = (tick: Parameters<typeof toTick>[2]): Tick => {
        const ref = refByFyers.get(tick.fyersSymbol);
        const { symbol, exchange } =
          ref === undefined
            ? decode(tick.fyersSymbol)
            : { symbol: ref.symbol, exchange: exchangeOf(ref) };
        return toTick(symbol, exchange, tick);
      };

      const remember = (ref: InstrumentRef, fyersSymbol: string): void => {
        refByFyers.set(fyersSymbol, ref);
        fyersByKey.set(listingKey(ref), fyersSymbol);
      };

      const initial = request.refs.filter(encodesSync);
      for (const ref of initial) remember(ref, encodeSync(ref));

      const stream = streamTicks(
        initial.map(encodeSync),
        (tick) => {
          lastMessageAt = new Date();
          request.onTick(toProductTick(tick));
        },
        {
          createTransport,
          onStateChange: (next) => {
            // 'idle' and 'closed' are transport-level; the product only needs
            // to know whether it is receiving data.
            state = next === 'idle' ? 'connecting' : next === 'closed' ? 'stopped' : next;
            request.onStateChange?.(state);
          },
          onError: (error) => {
            request.onError?.(toProviderError(error));
          },
        },
      );

      /**
       * Subscribes now what encodes synchronously, and BSE equities once the
       * master has resolved their group. A name the master does not know is
       * reported through `onError` rather than silently never ticking.
       */
      const add = (refs: readonly InstrumentRef[]): void => {
        const now = refs.filter(encodesSync);
        for (const ref of now) remember(ref, encodeSync(ref));
        if (now.length > 0) stream.subscribe(now.map(encodeSync));

        const later = refs.filter((ref) => !encodesSync(ref));
        if (later.length === 0) return;
        void Promise.all(later.map(async (ref) => ({ ref, fyers: await encode(ref) })))
          .then((resolved) => {
            if (stopped) return;
            const known = resolved.filter(
              (entry): entry is { ref: InstrumentRef; fyers: string } => entry.fyers !== null,
            );
            for (const { ref, fyers } of known) remember(ref, fyers);
            if (known.length > 0) stream.subscribe(known.map((entry) => entry.fyers));
            const unknown = resolved.filter((entry) => entry.fyers === null);
            if (unknown.length > 0) {
              request.onError?.(unknownBse(unknown.map((entry) => entry.ref.symbol)));
            }
          })
          .catch((error: unknown) => request.onError?.(toProviderError(error)));
      };

      add(request.refs.filter((ref) => !encodesSync(ref)));

      return {
        state: () => state,
        lastMessageAt: () => lastMessageAt,
        subscribe: (refs) => {
          add(refs);
        },
        unsubscribe: (refs) => {
          const symbols: string[] = [];
          for (const ref of refs) {
            const key = listingKey(ref);
            const fyers = fyersByKey.get(key);
            if (fyers === undefined) continue;
            fyersByKey.delete(key);
            refByFyers.delete(fyers);
            symbols.push(fyers);
          }
          if (symbols.length > 0) stream.unsubscribe(symbols);
        },
        stop: () => {
          stopped = true;
          state = 'stopped';
          stream.close();
        },
      };
    },
  };
}

/** A BSE equity the master does not list — delisted, SME, or mistyped. */
function unknownBse(symbols: readonly string[]): MarketDataProviderError {
  return new MarketDataProviderError(`Not a listed BSE equity: ${symbols.join(', ')}`, {
    failure: 'not_found',
    providerId: PROVIDER_ID,
    retryable: false,
  });
}

/**
 * Drops the final bar when it may still be forming.
 *
 * The signal engine must never see a partial bar — that is lookahead bias and
 * it silently corrupts every backtest sharing this code path (hard rule 2).
 *
 * Daily bars are decided by IST trading date. Intraday timestamps denote the
 * candle open; retain a candle only after its resolution duration has elapsed
 * against the request's injected clock.
 */
function dropFormingBar(bars: readonly Bar[], resolution: string, now: Date): readonly Bar[] {
  const last = bars.at(-1);
  if (last === undefined) return bars;
  if (resolution !== '1d' && resolution !== '1w') {
    const minutes: Readonly<Record<string, number>> = {
      '1m': 1,
      '5m': 5,
      '15m': 15,
      '30m': 30,
      '1h': 60,
    };
    const duration = minutes[resolution];
    return duration === undefined
      ? []
      : bars.filter((bar) => bar.timestamp + duration * 60_000 <= now.getTime());
  }
  return istDateKey(new Date(last.timestamp)) === istDateKey(now) ? bars.slice(0, -1) : bars;
}
