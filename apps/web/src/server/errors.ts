import 'server-only';
import {
  FyersApiError,
  FyersAuthError,
  FyersRateLimitError,
  isTokenExpiryCode,
} from '@signal/fyers';

/** A failure shaped for the UI: what happened, and what the operator can do. */
export class MarketDataError extends Error {
  readonly remedy: string | undefined;
  readonly code: string;
  readonly status: number;

  constructor(message: string, options: { code: string; status: number; remedy?: string }) {
    super(message);
    this.name = 'MarketDataError';
    this.code = options.code;
    this.status = options.status;
    this.remedy = options.remedy;
  }
}

/** Translates any upstream failure into something actionable. */
export function toMarketError(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) return error;

  if (error instanceof FyersAuthError) {
    return new MarketDataError(error.message, { code: 'AUTH', status: 401, remedy: error.remedy });
  }
  if (error instanceof FyersRateLimitError) {
    return new MarketDataError('Fyers rate limit reached. Backing off.', {
      code: 'RATE_LIMIT',
      status: 429,
      remedy: 'Wait a moment — requests retry automatically with backoff.',
    });
  }
  if (error instanceof FyersApiError) {
    if (isTokenExpiryCode(error.code)) {
      return new MarketDataError('The Fyers access token has expired.', {
        code: 'TOKEN_EXPIRED',
        status: 401,
        remedy: 'Visit /login to sign in again. Tokens expire daily.',
      });
    }
    return new MarketDataError(error.message, { code: 'FYERS_API', status: 502 });
  }
  if (error instanceof Error && error.name === 'FyersNotConfiguredError') {
    return new MarketDataError(error.message, {
      code: 'NOT_CONFIGURED',
      status: 503,
      remedy: (error as { remedy?: string }).remedy ?? 'Visit /login to sign in to Fyers.',
    });
  }
  return new MarketDataError(error instanceof Error ? error.message : String(error), {
    code: 'UNKNOWN',
    status: 500,
  });
}
