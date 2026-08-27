import {
  FyersHttpClient,
  fetchCandles,
  fetchMarketStatus,
  fetchQuotes,
  HISTORY_EPOCH_START,
  internalSymbolFor,
  listInstruments,
  MAX_SUBSCRIPTION_SYMBOLS,
  PathCircuitBreaker,
  RateLimiter,
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
  TickSubscription,
} from '@equitywise/market-data';
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
}

const CAPABILITIES_BASE = {
  intradayHistory: true,
  resolutions: SUPPORTED_RESOLUTIONS,
  historyStart: HISTORY_EPOCH_START,
  maxStreamSymbols: MAX_SUBSCRIPTION_SYMBOLS,
  marketStatus: true,
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

  /** Our ref to a Fyers symbol. The only direction that needs the `kind`. */
  const encode = (ref: InstrumentRef): string => toFyersSymbol(ref.symbol, ref.kind);

  const provider: MarketDataProvider = {
    id: PROVIDER_ID,
    displayName: 'Fyers',
    capabilities,

    async listInstruments(): Promise<readonly Instrument[]> {
      try {
        const { instruments } = await listInstruments(http);
        return instruments.map(toInstrument);
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchQuotes(refs: readonly InstrumentRef[]): Promise<QuotesResult> {
      if (refs.length === 0) return { quotes: new Map(), missing: [] };

      // Round-trip through the Fyers symbol, then back to ours by the same
      // mapping the socket uses, so aliases resolve identically on both paths.
      const bySymbol = new Map<string, InstrumentRef>();
      for (const ref of refs) bySymbol.set(encode(ref), ref);

      try {
        const result = await fetchQuotes(fetcher, [...bySymbol.keys()]);
        const quotes = new Map<string, Quote>();
        for (const [fyersSymbol, quote] of result.quotes) {
          const ref = bySymbol.get(fyersSymbol);
          const symbol = ref?.symbol ?? internalSymbolFor(fyersSymbol);
          quotes.set(symbol, toQuote(symbol, quote));
        }
        const missing = result.missing.map(
          (fyersSymbol) => bySymbol.get(fyersSymbol)?.symbol ?? internalSymbolFor(fyersSymbol),
        );
        return { quotes, missing };
      } catch (error) {
        throw toProviderError(error);
      }
    },

    async fetchBars(request: BarsRequest): Promise<readonly Bar[]> {
      const { ref, resolution, range, includeForming = false, now = new Date() } = request;
      try {
        const candles = await fetchCandles(fetcher, encode(ref), toFyersResolution(resolution), {
          from: range.from,
          to: range.to,
        });
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
      const refBySymbol = new Map<string, InstrumentRef>();
      for (const ref of request.refs) refBySymbol.set(ref.symbol, ref);

      let lastMessageAt: Date | null = null;
      let state: StreamState = 'connecting';

      const stream = streamTicks(
        request.refs.map(encode),
        (tick) => {
          lastMessageAt = new Date();
          request.onTick(toTick(tick.symbol, tick));
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

      return {
        state: () => state,
        lastMessageAt: () => lastMessageAt,
        subscribe: (refs) => {
          stream.subscribe(refs.map(encode));
        },
        unsubscribe: (refs) => {
          stream.unsubscribe(refs.map(encode));
        },
        stop: () => {
          state = 'stopped';
          stream.close();
        },
      };
    },
  };
}

/**
 * Drops the final bar when it may still be forming.
 *
 * The signal engine must never see a partial bar — that is lookahead bias and
 * it silently corrupts every backtest sharing this code path (hard rule 2).
 *
 * Daily bars are decided by IST trading date. Intraday bars are left alone:
 * Fyers stamps a bar with its OPEN time, so deciding whether the last one has
 * closed needs the resolution's duration, which `history` handles at a level
 * that knows the session calendar.
 */
function dropFormingBar(bars: readonly Bar[], resolution: string, now: Date): readonly Bar[] {
  const last = bars.at(-1);
  if (last === undefined) return bars;
  if (resolution !== '1d' && resolution !== '1w') return bars;
  return istDateKey(new Date(last.timestamp)) === istDateKey(now) ? bars.slice(0, -1) : bars;
}
