import 'server-only';
import { RateLimiter } from '@signal/fyers';
import type { MarketDataProvider } from '@signal/market-data';
import { createFyersProvider } from '@signal/providers-fyers';

/**
 * Composition root for market data.
 *
 * The ONLY module in `apps/web` allowed to name a concrete provider. Everything
 * else takes a `MarketDataProvider`. Adding a second source means editing this
 * file and nothing else (CLAUDE.md: broker independence).
 *
 * `server-only` makes importing this from a client component a build error, so
 * the credential cannot reach the browser even by accident.
 */

/**
 * One limiter for the whole process, deliberately outliving the provider.
 *
 * Upstream limits are per ACCOUNT. Rebuilding the limiter when the credential
 * rotates would hand the new provider a full budget the account does not have.
 */
const rateLimiter = new RateLimiter();

let cached: { provider: MarketDataProvider; credential: string } | null = null;

/**
 * The active provider.
 *
 * Env is read on every call rather than captured once, so re-authorising
 * through /login takes effect without restarting the server.
 *
 * @throws MarketDataProviderError with `failure: 'not_configured'`.
 */
export function getProvider(): MarketDataProvider {
  const appId = process.env.FYERS_APP_ID ?? '';
  const accessToken = process.env.FYERS_ACCESS_TOKEN ?? '';
  const credential = `${appId}:${accessToken}`;

  if (cached !== null && cached.credential === credential) return cached.provider;

  const provider = createFyersProvider({ appId, accessToken, rateLimiter });
  cached = { provider, credential };
  return provider;
}
