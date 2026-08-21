import 'server-only';
import { FyersHttpClient, type QuoteFetcher, RateLimiter } from '@signal/fyers';

/**
 * The single server-side Fyers client.
 *
 * `server-only` makes importing this from a client component a build error, so
 * the access token cannot reach the browser even by accident.
 *
 * One process-wide rate limiter matters: the Fyers limits are per ACCOUNT, not
 * per request. A limiter constructed per request would let N concurrent
 * requests each believe they had a full budget.
 */

export class FyersNotConfiguredError extends Error {
  readonly remedy: string;

  constructor(missing: string[]) {
    super(`Fyers is not configured: ${missing.join(' and ')} missing from .env`);
    this.name = 'FyersNotConfiguredError';
    this.remedy = 'Run `pnpm fyers:login` to obtain an access token, then reload.';
  }
}

let fetcher: QuoteFetcher | null = null;

/**
 * Returns the shared fetcher, or throws `FyersNotConfiguredError`.
 *
 * The token is read on every call rather than captured once, so `pnpm
 * fyers:login` takes effect without restarting the dev server.
 */
export function getFyersFetcher(): QuoteFetcher {
  const appId = process.env.FYERS_APP_ID;
  const accessToken = process.env.FYERS_ACCESS_TOKEN;

  const missing: string[] = [];
  if (appId === undefined || appId === '') missing.push('FYERS_APP_ID');
  if (accessToken === undefined || accessToken === '') missing.push('FYERS_ACCESS_TOKEN');
  if (missing.length > 0) throw new FyersNotConfiguredError(missing);

  const authorization = `${appId}:${accessToken}`;

  // Rebuild only when the token actually changes; the limiter must survive.
  if (fetcher === null) {
    fetcher = {
      http: new FyersHttpClient({
        rateLimiter: new RateLimiter(),
        backoff: { attempts: 3, baseDelayMs: 800, maxDelayMs: 5_000 },
        timeoutMs: 12_000,
      }),
      authorization,
    };
  } else if (fetcher.authorization !== authorization) {
    fetcher = { http: fetcher.http, authorization };
  }

  return fetcher;
}
