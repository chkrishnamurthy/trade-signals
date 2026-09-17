import { MarketDataProviderError } from './errors.js';
import { ROUTE_NAMES, type RouteName, type RoutingTable } from './routed.js';

/**
 * Which provider serves the product — read from the environment by the two
 * composition roots (`apps/web/src/server/provider.ts`, `apps/worker/src/context.ts`).
 *
 * Provider ids are opaque strings here. The roots decide which ids exist by
 * which adapters they were able to build; this module only checks that the
 * operator asked for one of them, and says exactly what to fix when not.
 */

/** The env var naming the active provider. */
export const PROVIDER_ENV_VAR = 'MARKET_DATA_PROVIDER';

/**
 * The active provider id.
 *
 * @param available ids the caller can actually build (its adapters with
 *   at least an identity configured), so a typo or a provider without
 *   credentials fails at startup with a remedy, not at the first request.
 * @param fallback used when the variable is unset — the incumbent, so an
 *   existing deployment behaves exactly as before the variable existed.
 */
export function readProviderSelection(
  env: NodeJS.ProcessEnv,
  available: readonly string[],
  fallback: string,
): string {
  const raw = env[PROVIDER_ENV_VAR] ?? '';
  const selected = raw === '' ? fallback : raw.trim().toLowerCase();

  if (!available.includes(selected)) {
    throw new MarketDataProviderError(
      `${PROVIDER_ENV_VAR}=${selected} but no such provider is configured (have: ${
        available.length === 0 ? 'none' : available.join(', ')
      })`,
      {
        failure: 'not_configured',
        providerId: selected,
        remedy:
          `Set ${PROVIDER_ENV_VAR} to one of the configured providers, or add the ` +
          `${selected} credentials to .env.`,
      },
    );
  }
  return selected;
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/** `MARKET_DATA_PROVIDER=routed` selects the router built from these. */
export const ROUTED_PROVIDER_ID = 'routed';

/** One env var per route, `MARKET_DATA_ROUTE_<ROUTE>`, each a provider id. */
export const ROUTE_ENV_VARS: Readonly<Record<RouteName, string>> = {
  bars: 'MARKET_DATA_ROUTE_BARS',
  intradayBars: 'MARKET_DATA_ROUTE_INTRADAY_BARS',
  quotes: 'MARKET_DATA_ROUTE_QUOTES',
  instruments: 'MARKET_DATA_ROUTE_INSTRUMENTS',
  status: 'MARKET_DATA_ROUTE_STATUS',
  stream: 'MARKET_DATA_ROUTE_STREAM',
  derivatives: 'MARKET_DATA_ROUTE_DERIVATIVES',
};

/** `MARKET_DATA_FALLBACK=0` disables the second opinion (for measurement). */
export const FALLBACK_ENV_VAR = 'MARKET_DATA_FALLBACK';

/**
 * The production split (docs/planning/dhan-provider-plan.md §5, amended by
 * §10f): deep daily history, bulk quotes and the instrument master from Dhan;
 * intraday bars, market status and the tick socket from Fyers.
 *
 * Intraday bars stay on Fyers because Dhan's equity 1-minute history ends at
 * 15:14 (verified 2026-09-17) — the closing fifteen minutes are absent, and a
 * signal engine that never sees the close is wrong in a way no test catches.
 *
 * Provider ids are opaque strings to this package; these are policy
 * defaults, overridable per route from the environment.
 */
export const DEFAULT_ROUTES: RoutingTable = {
  bars: 'dhan',
  intradayBars: 'fyers',
  quotes: 'dhan',
  instruments: 'dhan',
  status: 'fyers',
  stream: 'fyers',
  // Stock-futures open interest: only Dhan serves derivatives history.
  derivatives: 'dhan',
};

export interface RoutingConfig {
  readonly routes: RoutingTable;
  readonly fallback: boolean;
}

/**
 * The routing table from the environment, each route checked against the
 * providers the caller could build.
 */
export function readRoutingConfig(
  env: NodeJS.ProcessEnv,
  available: readonly string[],
  defaults: RoutingTable = DEFAULT_ROUTES,
): RoutingConfig {
  const routes = { ...defaults } as Record<RouteName, string>;
  for (const route of ROUTE_NAMES) {
    const raw = env[ROUTE_ENV_VARS[route]] ?? '';
    if (raw !== '') routes[route] = raw.trim().toLowerCase();
    if (!available.includes(routes[route])) {
      throw new MarketDataProviderError(
        `${ROUTE_ENV_VARS[route]}=${routes[route]} but no such provider is configured (have: ${
          available.length === 0 ? 'none' : available.join(', ')
        })`,
        {
          failure: 'not_configured',
          providerId: routes[route],
          remedy: `Set ${ROUTE_ENV_VARS[route]} to one of the configured providers, or configure ${routes[route]}.`,
        },
      );
    }
  }
  return { routes, fallback: env[FALLBACK_ENV_VAR] !== '0' };
}
