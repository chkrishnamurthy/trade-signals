import 'server-only';
import { getProviderCredential } from '@equitywise/db';
import { createDataRateLimiter, createQuoteRateLimiter } from '@equitywise/dhan';
import {
  createSdkTransport,
  type FyersSdk,
  loadFyersSdk,
  PathCircuitBreaker,
  RateLimiter,
} from '@equitywise/fyers';
import {
  createRoutedProvider,
  type MarketDataProvider,
  ROUTE_NAMES,
  ROUTED_PROVIDER_ID,
  type RouteName,
  readProviderSelection,
  readRoutingConfig,
} from '@equitywise/market-data';
import { createDhanProvider, PROVIDER_ID as DHAN } from '@equitywise/providers-dhan';
import { createFyersProvider, PROVIDER_ID as FYERS } from '@equitywise/providers-fyers';
import { getDatabase, isDatabaseConfigured } from './db';

/**
 * Composition root for market data.
 *
 * The ONLY module in `apps/web` allowed to name a concrete provider. Everything
 * else takes a `MarketDataProvider`. Adding a second source means editing this
 * file and nothing else (CLAUDE.md: broker independence).
 *
 * `server-only` makes importing this from a client component a build error, so
 * the credential cannot reach the browser even by accident.
 *
 * The credential comes from the DATABASE, written by the worker's daily
 * refresh. This app never mints one: doing so would require the account's TOTP
 * seed and PIN, and those deliberately never reach a deployed host. What lands
 * here is a token that expires within the day and can only read market data.
 *
 * Which provider serves the app is `MARKET_DATA_PROVIDER`: `fyers` (the
 * default), `dhan`, or `routed` — a router sending each question to the
 * provider best at it with the other as fallback (`MARKET_DATA_ROUTE_*`).
 * Each provider has its own identity env var, its own credential row and its
 * own limiter state; switching is one variable and a restart.
 */

/**
 * One limiter per provider for the whole process, deliberately outliving the
 * provider instance.
 *
 * Upstream limits are per ACCOUNT. Rebuilding the limiter when the credential
 * rotates would hand the new provider a full budget the account does not have.
 */
const fyersRateLimiter = new RateLimiter();

/**
 * One breaker for the whole process, for the same reason.
 *
 * Edge bans are keyed on IP and path, so re-authorising does not lift one.
 * A fresh breaker per provider would send us straight back into a live ban.
 */
const fyersCircuitBreaker = new PathCircuitBreaker();

/** Dhan's budgets are per account too; same rule, separate state per bucket. */
const dhanDataRateLimiter = createDataRateLimiter();
const dhanQuoteRateLimiter = createQuoteRateLimiter();
const dhanCircuitBreaker = new PathCircuitBreaker();

let cached: { provider: MarketDataProvider; credential: string } | null = null;

/**
 * Streaming is on unless switched off. `FYERS_STREAM=0` is the operator's
 * kill switch: the watchlist then falls back to the server-side quote poll in
 * `live-quotes.ts` and nothing else changes.
 */
function streamingEnabled(): boolean {
  return process.env.FYERS_STREAM !== '0';
}

/** The same kill switch for the Dhan feed. */
function dhanStreamingEnabled(): boolean {
  return process.env.DHAN_STREAM !== '0';
}

let sdkPromise: Promise<FyersSdk | null> | null = null;

/**
 * The socket SDK, loaded once per process. A missing or broken install is
 * "no streaming", not a failed provider: every REST path keeps working and
 * the watchlist falls back to the server-side poll.
 */
function fyersSdk(): Promise<FyersSdk | null> {
  sdkPromise ??= loadFyersSdk().catch((error: unknown) => {
    console.warn('[provider] live tick socket unavailable; polling instead', error);
    return null;
  });
  return sdkPromise;
}

/**
 * How long a credential read is trusted before going back to the database.
 *
 * The token changes once a day, so this is not about freshness — it is about
 * not paying a round-trip on every request while still picking up the morning's
 * refresh without a redeploy.
 */
const CREDENTIAL_TTL_MS = 60_000;

const tokenCache = new Map<string, { token: string; readAt: number }>();

/**
 * The current access token for one provider.
 *
 * Prefers what the worker stored; falls back to the provider's `*_ACCESS_TOKEN`
 * so a purely local setup, and any deployment predating the credential table,
 * keeps working. A database failure falls back rather than throwing: an
 * unreachable credential store should degrade the live-quote routes, not take
 * down pages that never needed the provider.
 *
 * @param appId the principal the token must have been minted for — the Fyers
 *   app id or the Dhan client id. A stored row for another principal is not
 *   sent upstream to fail as a confusing authorisation error.
 */
async function currentAccessToken(
  providerId: string,
  appId: string,
  fromEnv: string,
  now = Date.now(),
): Promise<string> {
  const hit = tokenCache.get(providerId);
  if (hit !== undefined && now - hit.readAt < CREDENTIAL_TTL_MS) return hit.token;
  if (!isDatabaseConfigured()) return fromEnv;

  try {
    const stored = await getProviderCredential(getDatabase(), providerId);
    // An expired or wrong-principal row is worse than useless: it would be sent
    // upstream and fail as an authorisation error. Prefer the environment,
    // which at least an operator can fix without a worker run.
    const usable =
      stored !== null && stored.appId === appId && stored.expiresAt.getTime() > now
        ? stored.accessToken
        : fromEnv;
    tokenCache.set(providerId, { token: usable, readAt: now });
    return usable;
  } catch (error) {
    console.warn(
      `[provider] ${providerId} credential store unreachable; falling back to environment:`,
      error instanceof Error ? error.message : String(error),
    );
    return fromEnv;
  }
}

/**
 * Providers this process can build: those with an identity configured. The
 * selection below must name one of them.
 */
function availableProviders(): string[] {
  const ids: string[] = [];
  if ((process.env.FYERS_APP_ID ?? '') !== '') ids.push(FYERS);
  if ((process.env.DHAN_CLIENT_ID ?? '') !== '') ids.push(DHAN);
  return ids;
}

/** The provider the environment asks for; the default keeps Fyers. */
export function activeProviderId(): string {
  const available = availableProviders();
  // The router is selectable only when it has two providers to route between.
  const selectable = available.length >= 2 ? [...available, ROUTED_PROVIDER_ID] : available;
  return readProviderSelection(process.env, selectable, FYERS);
}

/**
 * Which provider answers which question — for the operator-facing data
 * sources page. Display names only; never a credential or an endpoint.
 */
export function describeDataSources(): {
  readonly active: string;
  readonly routes: readonly { readonly route: RouteName; readonly provider: string }[];
} {
  const names: Record<string, string> = { [FYERS]: 'Fyers', [DHAN]: 'Dhan' };
  const active = activeProviderId();
  if (active !== ROUTED_PROVIDER_ID) {
    const provider = names[active] ?? active;
    return { active: provider, routes: ROUTE_NAMES.map((route) => ({ route, provider })) };
  }
  const { routes } = readRoutingConfig(process.env, availableProviders());
  return {
    active: 'Routed',
    routes: ROUTE_NAMES.map((route) => ({
      route,
      provider: names[routes[route]] ?? routes[route],
    })),
  };
}

interface Built {
  readonly provider: MarketDataProvider;
  /** Identity + token; a change means the provider must be rebuilt. */
  readonly credential: string;
}

/** The last built instance per provider id, reused while its credential holds. */
const built = new Map<string, Built>();

async function buildFyers(): Promise<Built> {
  const appId = process.env.FYERS_APP_ID ?? '';
  const accessToken = await currentAccessToken(FYERS, appId, process.env.FYERS_ACCESS_TOKEN ?? '');
  const credential = `${FYERS}:${appId}:${accessToken}`;
  const previous = built.get(FYERS);
  if (previous !== undefined && previous.credential === credential) return previous;

  const sdk = streamingEnabled() ? await fyersSdk() : null;
  const provider = createFyersProvider({
    appId,
    accessToken,
    rateLimiter: fyersRateLimiter,
    circuitBreaker: fyersCircuitBreaker,
    // A route handler here is answering a page a human is looking at, not
    // running a background pull — unlike apps/worker (5 attempts, 30s each),
    // this should fail toward `quotesStale` quickly rather than sit through a
    // full generic retry budget. One retry survives a single transient blip;
    // beyond that, the client's own poll (`refreshAfterSeconds`) is what
    // actually recovers a live price, not a longer wait on this request.
    attempts: 2,
    timeoutMs: 6_000,
    // The live tick socket, for the watchlist's per-second prices. The
    // provider is rebuilt whenever the credential changes (above), so a
    // transport built here always carries the current token; the socket
    // singleton behind it rebuilds itself on a new credential too.
    ...(sdk === null
      ? {}
      : {
          createTransport: () => createSdkTransport({ sdk, credential: `${appId}:${accessToken}` }),
        }),
  });
  const result = { provider, credential };
  built.set(FYERS, result);
  return result;
}

async function buildDhan(): Promise<Built> {
  const clientId = process.env.DHAN_CLIENT_ID ?? '';
  const accessToken = await currentAccessToken(DHAN, clientId, process.env.DHAN_ACCESS_TOKEN ?? '');
  const credential = `${DHAN}:${clientId}:${accessToken}`;
  const previous = built.get(DHAN);
  if (previous !== undefined && previous.credential === credential) return previous;

  const provider = createDhanProvider({
    clientId,
    accessToken,
    dataRateLimiter: dhanDataRateLimiter,
    quoteRateLimiter: dhanQuoteRateLimiter,
    circuitBreaker: dhanCircuitBreaker,
    // Same reasoning as Fyers: a page is waiting.
    attempts: 2,
    timeoutMs: 6_000,
    // The documented binary feed over Node's built-in WebSocket, ticker mode
    // (price + trade time; the hub wants nothing more). 5,000 symbols per
    // connection. Under the router it serves only when
    // MARKET_DATA_ROUTE_STREAM=dhan; the default keeps the proven Fyers socket.
    ...(dhanStreamingEnabled() ? { stream: { mode: 'ticker' as const } } : {}),
  });
  const result = { provider, credential };
  built.set(DHAN, result);
  return result;
}

/**
 * The router over both. Rebuilt when EITHER credential changes: the live
 * hub detects a rotated credential by provider identity, so a new Fyers token
 * must surface as a new provider object. The cost is one socket reconnect a
 * day at the Dhan rollover (01:35 IST), when no market is open.
 */
async function buildRouted(): Promise<Built> {
  const fyers = await buildFyers();
  const dhan = await buildDhan();
  const credential = `${ROUTED_PROVIDER_ID}|${fyers.credential}|${dhan.credential}`;
  if (cached !== null && cached.credential === credential) return cached;

  const routing = readRoutingConfig(process.env, availableProviders());
  const provider = createRoutedProvider({
    providers: new Map([
      [FYERS, fyers.provider],
      [DHAN, dhan.provider],
    ]),
    routes: routing.routes,
    fallback: routing.fallback,
    onRouteEvent: (event) => {
      console.warn(
        `[provider] ${event.route}: ${event.from} failed (${event.error.failure}), ` +
          (event.fallbackError === undefined
            ? `answered by ${event.to}`
            : `${event.to} failed too (${event.fallbackError.failure})`),
      );
    },
  });
  return { provider, credential };
}

/**
 * The active provider.
 *
 * The credential is resolved on every call rather than captured once, so the
 * worker's daily refresh takes effect without a redeploy.
 *
 * @throws MarketDataProviderError with `failure: 'not_configured'`.
 */
export async function getProvider(): Promise<MarketDataProvider> {
  const id = activeProviderId();
  cached =
    id === ROUTED_PROVIDER_ID
      ? await buildRouted()
      : id === DHAN
        ? await buildDhan()
        : await buildFyers();
  return cached.provider;
}
