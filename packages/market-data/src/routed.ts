import { MarketDataProviderError } from './errors.js';
import type {
  BarsRequest,
  MarketDataProvider,
  ProviderCapabilities,
  StreamRequest,
  TickSubscription,
} from './provider.js';
import type {
  Bar,
  Instrument,
  InstrumentRef,
  MarketStatus,
  QuotesResult,
  Resolution,
} from './types.js';
import { isDailyOrSlower } from './types.js';

/**
 * A provider assembled from others, one per question.
 *
 * The product asks six things of a market-data source and no provider is best
 * at all of them: one has deep daily history and thousand-symbol quotes, the
 * other an authoritative market-status endpoint and a working tick socket.
 * The router sends each question to the provider configured for it and, when
 * that provider fails in a way a second opinion could fix, asks the other.
 *
 * Provider-neutral by construction: it holds `MarketDataProvider`s by opaque
 * id and knows nothing about what they are. Which id serves which route is
 * the composition roots' decision, read from the environment.
 */

export type RouteName = 'bars' | 'intradayBars' | 'quotes' | 'instruments' | 'status' | 'stream';

export const ROUTE_NAMES: readonly RouteName[] = [
  'bars',
  'intradayBars',
  'quotes',
  'instruments',
  'status',
  'stream',
];

/** Which provider id answers each route. */
export type RoutingTable = Readonly<Record<RouteName, string>>;

export interface RouteEvent {
  readonly route: RouteName;
  /** The provider that failed. */
  readonly from: string;
  /** The provider tried instead. */
  readonly to: string;
  readonly error: MarketDataProviderError;
  /** Set when the fallback ALSO failed; the primary's error is what propagates. */
  readonly fallbackError?: MarketDataProviderError;
}

export interface RoutedProviderOptions {
  readonly providers: ReadonlyMap<string, MarketDataProvider>;
  readonly routes: RoutingTable;
  /**
   * Try the other provider when the routed one fails. Default true.
   *
   * Off is for measurement: with fallback on, a broken route looks like a
   * slow one.
   */
  readonly fallback?: boolean;
  /** Observability hook; the router has no logger of its own. */
  readonly onRouteEvent?: (event: RouteEvent) => void;
  readonly id?: string;
}

export interface RoutedProvider extends MarketDataProvider {
  readonly routes: RoutingTable;
  /** The concrete provider currently answering a route. */
  providerFor(route: RouteName): MarketDataProvider;
}

/**
 * Failures worth a second opinion. `not_found` and `unsupported` are answers,
 * not outages — asking someone else would turn "this symbol does not exist"
 * into a slower "this symbol does not exist".
 */
const FALLBACK_FAILURES = new Set(['auth', 'rate_limit', 'upstream', 'unknown', 'not_configured']);

export function createRoutedProvider(options: RoutedProviderOptions): RoutedProvider {
  const { providers, routes } = options;
  const fallbackEnabled = options.fallback ?? true;
  const id = options.id ?? 'routed';

  for (const route of ROUTE_NAMES) {
    if (!providers.has(routes[route])) {
      throw new MarketDataProviderError(
        `Route "${route}" names provider "${routes[route]}", which is not configured (have: ${[
          ...providers.keys(),
        ].join(', ')})`,
        { failure: 'not_configured', providerId: routes[route] },
      );
    }
  }

  function primary(route: RouteName): MarketDataProvider {
    const provider = providers.get(routes[route]);
    // Checked above; the type system cannot see that.
    if (provider === undefined) throw new Error(`route ${route} lost its provider`);
    return provider;
  }

  /** The first configured provider that is not the primary, if any. */
  function alternate(route: RouteName): MarketDataProvider | null {
    for (const [providerId, provider] of providers) {
      if (providerId !== routes[route]) return provider;
    }
    return null;
  }

  async function withFallback<T>(
    route: RouteName,
    call: (provider: MarketDataProvider) => Promise<T>,
  ): Promise<T> {
    const first = primary(route);
    try {
      return await call(first);
    } catch (error) {
      const second = fallbackEnabled ? alternate(route) : null;
      if (
        second === null ||
        !(error instanceof MarketDataProviderError) ||
        !FALLBACK_FAILURES.has(error.failure)
      ) {
        throw error;
      }
      try {
        const result = await call(second);
        options.onRouteEvent?.({ route, from: first.id, to: second.id, error });
        return result;
      } catch (fallbackError) {
        options.onRouteEvent?.({
          route,
          from: first.id,
          to: second.id,
          error,
          ...(fallbackError instanceof MarketDataProviderError ? { fallbackError } : {}),
        });
        // The primary's failure is the one to act on: it is the provider
        // this route is configured for, and its `providerId` is what a
        // self-heal needs.
        throw error;
      }
    }
  }

  const daily = primary('bars');
  const intraday = primary('intradayBars');
  const status = primary('status');
  const stream = primary('stream');

  const resolutions: Resolution[] = [
    ...intraday.capabilities.resolutions.filter((r) => !isDailyOrSlower(r)),
    ...daily.capabilities.resolutions.filter((r) => isDailyOrSlower(r)),
  ];

  const capabilities: ProviderCapabilities = {
    streaming: stream.capabilities.streaming && stream.streamTicks !== undefined,
    intradayHistory: intraday.capabilities.intradayHistory,
    resolutions,
    historyStart: daily.capabilities.historyStart,
    maxStreamSymbols: stream.capabilities.maxStreamSymbols,
    marketStatus: status.capabilities.marketStatus,
  };

  const provider: RoutedProvider = {
    id,
    displayName: [...new Set(ROUTE_NAMES.map((route) => primary(route).displayName))].join(' + '),
    capabilities,
    routes,
    providerFor: primary,

    listInstruments(): Promise<readonly Instrument[]> {
      return withFallback('instruments', (p) => p.listInstruments());
    },

    fetchQuotes(refs: readonly InstrumentRef[]): Promise<QuotesResult> {
      return withFallback('quotes', (p) => p.fetchQuotes(refs));
    },

    fetchBars(request: BarsRequest): Promise<readonly Bar[]> {
      const route: RouteName = isDailyOrSlower(request.resolution) ? 'bars' : 'intradayBars';
      return withFallback(route, (p) => p.fetchBars(request));
    },

    fetchMarketStatus(): Promise<MarketStatus> {
      return withFallback('status', (p) => p.fetchMarketStatus());
    },
  };

  // Streaming is a subscription, not a request: there is no sensible
  // "fall back" mid-stream, so it delegates to the stream provider as-is and
  // is absent when that provider has no socket (the hub then polls).
  if (stream.streamTicks !== undefined && stream.capabilities.streaming) {
    const streamTicks = stream.streamTicks.bind(stream);
    return {
      ...provider,
      streamTicks(request: StreamRequest): TickSubscription {
        return streamTicks(request);
      },
    };
  }
  return provider;
}
