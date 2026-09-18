import { createDatabase, type Database, type DatabaseHandle } from '@equitywise/db';
import {
  createRoutedProvider,
  type MarketDataProvider,
  MarketDataProviderError,
  ROUTED_PROVIDER_ID,
  type RouteName,
  readProviderSelection,
  readRoutingConfig,
} from '@equitywise/market-data';
import { createDhanProvider, PROVIDER_ID as DHAN } from '@equitywise/providers-dhan';
import { createFyersProvider, PROVIDER_ID as FYERS } from '@equitywise/providers-fyers';
import { CREDENTIAL_STRATEGIES, type CredentialStrategy } from './credentials.js';

/**
 * Worker composition root.
 *
 * The only place the worker names a concrete provider (with `credentials.ts`,
 * which names their login flows). Jobs receive a `MarketDataProvider` and a
 * `Database` and know nothing about either's implementation.
 *
 * Every provider whose identity is configured is BUILT — `FYERS_APP_ID` for
 * Fyers, `DHAN_CLIENT_ID` for Dhan — and has its credential kept fresh, so the
 * two can be compared side by side and a switch between them is one env var.
 * Which one the jobs actually use is `MARKET_DATA_PROVIDER`: `fyers` (the
 * default, so an existing deployment is unchanged by the variable's
 * existence), `dhan`, or `routed` — a router sending each question to the
 * provider best at it, with the other as fallback (`MARKET_DATA_ROUTE_*`).
 */

export interface WorkerContext {
  readonly db: Database;
  /** The provider every job reads from. */
  readonly provider: MarketDataProvider;
  /**
   * The id recorded against ingested DAILY rows: which provider supplied
   * them, for reconciling a disagreement later. Under the router this is the
   * provider answering the `bars` route, never `routed` — see `providerIdFor`.
   */
  readonly providerId: string;
  /**
   * The concrete provider answering one route. A plain provider answers every
   * route itself; the router names whichever it was configured with. Jobs use
   * this to tag rows with their true source.
   */
  providerIdFor(route: RouteName): string;
  /** Every provider that was built, by id — for jobs that compare sources. */
  readonly providers: ReadonlyMap<string, MarketDataProvider>;
  /** One per built provider; the refresh job keeps each of them fresh. */
  readonly credentialStrategies: readonly CredentialStrategy[];
  /**
   * Swaps in a newly minted credential for one provider.
   *
   * Each provider reads its token per request, so this takes effect on the
   * next call without rebuilding anything. That matters: the rate limiter and
   * circuit breaker live inside the provider and track per-ACCOUNT budgets and
   * edge bans, neither of which is reset by a new credential. Rebuilding on
   * each daily refresh would hand the replacement a budget the account does not
   * have, or walk straight back into a live ban.
   */
  setAccessToken(providerId: string, accessToken: string): void;
  close(): Promise<void>;
}

/**
 * The worker is a long-lived process doing bulk history pulls. A wider retry
 * budget than the web app's is right: nobody is waiting on a page.
 */
const WORKER_ATTEMPTS = 5;
const WORKER_TIMEOUT_MS = 30_000;

export function createContext(env: NodeJS.ProcessEnv = process.env): WorkerContext {
  const handle: DatabaseHandle = createDatabase({
    // The worker is long-lived and spends minutes at a time on upstream
    // fetches, so idle connections get dropped underneath it. Logging rather
    // than swallowing: a sudden run of these means something worse than an idle
    // timeout.
    onIdleError: (error) => {
      process.stderr.write(
        `${JSON.stringify({
          ts: new Date().toISOString(),
          level: 'warn',
          job: 'db',
          message: 'idle pool connection failed; it has been discarded',
          errorMessage: error.message,
        })}\n`,
      );
    },
  });

  // Each starts as whatever the environment holds — possibly empty, possibly
  // yesterday's — and is replaced by the credential refresh at startup.
  const tokens = new Map<string, string>();
  const providers = new Map<string, MarketDataProvider>();
  const tokenFor = (providerId: string) => (): string => tokens.get(providerId) ?? '';

  const fyersAppId = env.FYERS_APP_ID ?? '';
  if (fyersAppId !== '') {
    tokens.set(FYERS, env.FYERS_ACCESS_TOKEN ?? '');
    providers.set(
      FYERS,
      createFyersProvider({
        appId: fyersAppId,
        accessToken: tokenFor(FYERS),
        attempts: WORKER_ATTEMPTS,
        timeoutMs: WORKER_TIMEOUT_MS,
      }),
    );
  }

  const dhanClientId = env.DHAN_CLIENT_ID ?? '';
  if (dhanClientId !== '') {
    tokens.set(DHAN, env.DHAN_ACCESS_TOKEN ?? '');
    providers.set(
      DHAN,
      createDhanProvider({
        clientId: dhanClientId,
        accessToken: tokenFor(DHAN),
        attempts: WORKER_ATTEMPTS,
        timeoutMs: WORKER_TIMEOUT_MS,
        // The live socket for the paper-trading feed job. Declaring it costs
        // nothing until `streamTicks` is called; the transport is built with
        // the current token on every (re)connect, so a rotated credential
        // reaches the socket without rebuilding the provider.
        stream: { mode: 'ticker' },
      }),
    );
  }

  // The router is selectable only when it has two providers to route between.
  const selectable = [...providers.keys()];
  if (providers.size >= 2) selectable.push(ROUTED_PROVIDER_ID);
  const activeId = readProviderSelection(env, selectable, FYERS);

  let provider: MarketDataProvider;
  let providerIdFor: (route: RouteName) => string;
  if (activeId === ROUTED_PROVIDER_ID) {
    const routing = readRoutingConfig(env, [...providers.keys()]);
    const routed = createRoutedProvider({
      providers,
      routes: routing.routes,
      fallback: routing.fallback,
      onRouteEvent: (event) => {
        process.stderr.write(
          `${JSON.stringify({
            ts: new Date().toISOString(),
            level: 'warn',
            job: 'provider',
            message:
              event.fallbackError === undefined
                ? 'route fell back to the other provider'
                : 'route failed on both providers',
            route: event.route,
            from: event.from,
            to: event.to,
            failure: event.error.failure,
            errorMessage: event.error.message,
            ...(event.fallbackError === undefined
              ? {}
              : { fallbackFailure: event.fallbackError.failure }),
          })}\n`,
        );
      },
    });
    provider = routed;
    providerIdFor = (route) => routed.routes[route];
  } else {
    const selected = providers.get(activeId);
    if (selected === undefined) {
      // Unreachable — `readProviderSelection` only returns a built id — but
      // the type system cannot know that, and a throw beats a non-null assertion.
      throw new MarketDataProviderError(`provider ${activeId} was not built`, {
        failure: 'not_configured',
        providerId: activeId,
      });
    }
    provider = selected;
    providerIdFor = () => selected.id;
  }

  const credentialStrategies = [...providers.keys()].flatMap((id) => {
    const strategy = CREDENTIAL_STRATEGIES.get(id);
    return strategy === undefined ? [] : [strategy];
  });

  return {
    db: handle.db,
    provider,
    providerId: providerIdFor('bars'),
    providerIdFor,
    providers,
    credentialStrategies,
    setAccessToken(providerId: string, next: string): void {
      if (!providers.has(providerId)) return;
      tokens.set(providerId, next);
    },
    close: () => handle.close(),
  };
}
