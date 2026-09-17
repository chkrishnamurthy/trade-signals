import {
  DhanApiError,
  DhanAuthError,
  DhanFeedError,
  DhanRateLimitError,
  isSubscriptionCode,
  isTokenExpiryCode,
} from '@equitywise/dhan';
import { MarketDataProviderError } from '@equitywise/market-data';

export const PROVIDER_ID = 'dhan';

/**
 * Dhan's error taxonomy to the product's.
 *
 * Every path out of this adapter goes through here, so a `DhanApiError` can
 * never surface above the provider boundary.
 */
export function toProviderError(error: unknown): MarketDataProviderError {
  if (error instanceof MarketDataProviderError) return error;

  if (error instanceof DhanAuthError) {
    return new MarketDataProviderError(error.message, {
      failure: 'auth',
      providerId: PROVIDER_ID,
      remedy: error.remedy,
      retryable: false,
      cause: error,
    });
  }

  if (error instanceof DhanRateLimitError) {
    const seconds = Math.ceil(error.retryAfterMs / 1000);
    return new MarketDataProviderError('Upstream rate limit reached.', {
      failure: 'rate_limit',
      providerId: PROVIDER_ID,
      remedy: `Blocked upstream for another ${seconds}s. Reduce refresh frequency if this recurs.`,
      retryable: true,
      retryAfterMs: error.retryAfterMs,
      cause: error,
    });
  }

  if (error instanceof DhanApiError) {
    if (isTokenExpiryCode(error.code)) {
      return new MarketDataProviderError('The market-data credential has expired.', {
        failure: 'auth',
        providerId: PROVIDER_ID,
        remedy: 'The worker mints a new Dhan token daily; check its log, or run `pnpm dhan:probe`.',
        retryable: false,
        cause: error,
      });
    }
    if (isSubscriptionCode(error.code)) {
      return new MarketDataProviderError('The Dhan Data API subscription is not active.', {
        failure: 'auth',
        providerId: PROVIDER_ID,
        remedy:
          'Renew the Data API subscription at web.dhan.co (₹499 + GST / 30 days) and keep the ' +
          'trading balance above the debit.',
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

  if (error instanceof DhanFeedError) {
    // The feed's disconnect reasons mirror the REST codes: 806 is the
    // subscription, 807–810 the credential, 805 too many connections.
    if (error.code === 806) {
      return new MarketDataProviderError('The Dhan Data API subscription is not active.', {
        failure: 'auth',
        providerId: PROVIDER_ID,
        remedy: 'Renew the Data API subscription at web.dhan.co (₹499 + GST / 30 days).',
        retryable: false,
        cause: error,
      });
    }
    if (error.code >= 807 && error.code <= 810) {
      return new MarketDataProviderError('The live feed rejected the market-data credential.', {
        failure: 'auth',
        providerId: PROVIDER_ID,
        remedy: 'The worker mints a new Dhan token daily; check its log, or run `pnpm dhan:probe`.',
        retryable: false,
        cause: error,
      });
    }
    return new MarketDataProviderError(error.message, {
      failure: error.code === 805 ? 'rate_limit' : 'upstream',
      providerId: PROVIDER_ID,
      remedy:
        error.code === 805
          ? 'Dhan allows five feed connections per account; close another client.'
          : undefined,
      retryable: true,
      cause: error,
    });
  }

  if (error instanceof DhanNotConfiguredError) {
    return new MarketDataProviderError(error.message, {
      failure: 'not_configured',
      providerId: PROVIDER_ID,
      remedy: error.remedy,
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

export class DhanNotConfiguredError extends Error {
  readonly remedy: string;

  constructor(missing: readonly string[]) {
    super(`Market data is not configured: ${missing.join(' and ')} missing from .env`);
    this.name = 'DhanNotConfiguredError';
    this.remedy =
      'Set DHAN_CLIENT_ID, DHAN_PIN and DHAN_TOTP_SECRET for the worker, or DHAN_ACCESS_TOKEN.';
  }
}

/** The product asked for a symbol the scrip master does not list. */
export function unknownInstrumentError(symbol: string, kind: string): MarketDataProviderError {
  return new MarketDataProviderError(`Dhan does not list ${kind} ${symbol}`, {
    failure: 'not_found',
    providerId: PROVIDER_ID,
    remedy: 'Check the symbol; if it is newly listed, the scrip master refreshes daily.',
    retryable: false,
  });
}
