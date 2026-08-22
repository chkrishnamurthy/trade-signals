import {
  FyersApiError,
  FyersAuthError,
  FyersRateLimitError,
  isTokenExpiryCode,
} from '@signal/fyers';
import { MarketDataProviderError } from '@signal/market-data';

export const PROVIDER_ID = 'fyers';

/**
 * Fyers' error taxonomy to the product's.
 *
 * Every path out of this adapter goes through here, so a `FyersApiError` can
 * never surface above the provider boundary.
 */
export function toProviderError(error: unknown): MarketDataProviderError {
  if (error instanceof MarketDataProviderError) return error;

  if (error instanceof FyersAuthError) {
    return new MarketDataProviderError(error.message, {
      failure: 'auth',
      providerId: PROVIDER_ID,
      remedy: error.remedy,
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof FyersRateLimitError) {
    const seconds = Math.ceil(error.retryAfterMs / 1000);
    return new MarketDataProviderError('Upstream rate limit reached.', {
      failure: 'rate_limit',
      providerId: PROVIDER_ID,
      // The ban is fixed-duration and not shortened by waiting quietly, so the
      // honest remedy is a deadline, not "it will sort itself out".
      remedy: `Blocked upstream for another ${seconds}s. Reduce refresh frequency if this recurs.`,
      retryable: true,
      retryAfterMs: error.retryAfterMs,
      cause: error,
    });
  }

  if (error instanceof FyersApiError) {
    if (isTokenExpiryCode(error.code)) {
      return new MarketDataProviderError('The market-data credential has expired.', {
        failure: 'auth',
        providerId: PROVIDER_ID,
        remedy: 'Visit /login to re-authorise. Credentials expire daily.',
        retryable: false,
        cause: error,
      });
    }
    return new MarketDataProviderError(error.message, {
      failure: 'upstream',
      providerId: PROVIDER_ID,
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof Error && error.name === 'FyersNotConfiguredError') {
    return new MarketDataProviderError(error.message, {
      failure: 'not_configured',
      providerId: PROVIDER_ID,
      remedy: (error as { remedy?: string }).remedy ?? 'Visit /login to connect a data source.',
      retryable: false,
      cause: error,
    });
  }

  return new MarketDataProviderError(error instanceof Error ? error.message : String(error), {
    failure: 'unknown',
    providerId: PROVIDER_ID,
    retryable: false,
    cause: error,
  });
}

export class FyersNotConfiguredError extends Error {
  readonly remedy: string;

  constructor(missing: readonly string[]) {
    super(`Market data is not configured: ${missing.join(' and ')} missing from .env`);
    this.name = 'FyersNotConfiguredError';
    this.remedy = 'Visit /login to authorise, or run `pnpm fyers:login`.';
  }
}
