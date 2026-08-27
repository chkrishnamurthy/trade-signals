import 'server-only';
import { getProviderCredential } from '@equitywise/db';
import { PathCircuitBreaker, RateLimiter } from '@equitywise/fyers';
import type { MarketDataProvider } from '@equitywise/market-data';
import { createFyersProvider, PROVIDER_ID } from '@equitywise/providers-fyers';
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
 */

/**
 * One limiter for the whole process, deliberately outliving the provider.
 *
 * Upstream limits are per ACCOUNT. Rebuilding the limiter when the credential
 * rotates would hand the new provider a full budget the account does not have.
 */
const rateLimiter = new RateLimiter();

/**
 * One breaker for the whole process, for the same reason.
 *
 * Edge bans are keyed on IP and path, so re-authorising does not lift one.
 * A fresh breaker per provider would send us straight back into a live ban.
 */
const circuitBreaker = new PathCircuitBreaker();

let cached: { provider: MarketDataProvider; credential: string } | null = null;

/**
 * How long a credential read is trusted before going back to the database.
 *
 * The token changes once a day, so this is not about freshness — it is about
 * not paying a round-trip on every request while still picking up the morning's
 * refresh without a redeploy.
 */
const CREDENTIAL_TTL_MS = 60_000;

let tokenCache: { token: string; readAt: number } | null = null;

/**
 * The current access token.
 *
 * Prefers what the worker stored; falls back to `FYERS_ACCESS_TOKEN` so a purely
 * local setup, and any deployment predating the credential table, keeps working.
 * A database failure falls back rather than throwing: an unreachable credential
 * store should degrade the live-quote routes, not take down pages that never
 * needed the provider.
 */
async function currentAccessToken(appId: string, now = Date.now()): Promise<string> {
  const fromEnv = process.env.FYERS_ACCESS_TOKEN ?? '';

  if (tokenCache !== null && now - tokenCache.readAt < CREDENTIAL_TTL_MS) {
    return tokenCache.token;
  }
  if (!isDatabaseConfigured()) return fromEnv;

  try {
    const stored = await getProviderCredential(getDatabase(), PROVIDER_ID);
    // An expired or wrong-app row is worse than useless: it would be sent
    // upstream and fail as an authorisation error. Prefer the environment,
    // which at least an operator can fix without a worker run.
    const usable =
      stored !== null && stored.appId === appId && stored.expiresAt.getTime() > now
        ? stored.accessToken
        : fromEnv;
    tokenCache = { token: usable, readAt: now };
    return usable;
  } catch (error) {
    console.warn(
      '[provider] credential store unreachable; falling back to environment:',
      error instanceof Error ? error.message : String(error),
    );
    return fromEnv;
  }
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
  const appId = process.env.FYERS_APP_ID ?? '';
  const accessToken = await currentAccessToken(appId);
  const credential = `${appId}:${accessToken}`;

  if (cached !== null && cached.credential === credential) return cached.provider;

  const provider = createFyersProvider({
    appId,
    accessToken,
    rateLimiter,
    circuitBreaker,
    // A route handler here is answering a page a human is looking at, not
    // running a background pull — unlike apps/worker (5 attempts, 30s each),
    // this should fail toward `quotesStale` quickly rather than sit through a
    // full generic retry budget. One retry survives a single transient blip;
    // beyond that, the client's own poll (`refreshAfterSeconds`) is what
    // actually recovers a live price, not a longer wait on this request.
    attempts: 2,
    timeoutMs: 6_000,
  });
  cached = { provider, credential };
  return provider;
}
