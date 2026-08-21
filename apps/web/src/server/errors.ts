import 'server-only';
import { type MarketDataFailure, MarketDataProviderError } from '@signal/market-data';

/**
 * A failure shaped for the UI: what happened, and what the operator can do.
 *
 * Provider error types stop at the adapter; this layer only ever sees
 * `MarketDataProviderError`, so adding a second data source cannot introduce a
 * new error shape here.
 */
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

/** HTTP status and stable UI code per failure kind. */
const BY_FAILURE: Readonly<Record<MarketDataFailure, { code: string; status: number }>> = {
  auth: { code: 'AUTH', status: 401 },
  rate_limit: { code: 'RATE_LIMIT', status: 429 },
  not_configured: { code: 'NOT_CONFIGURED', status: 503 },
  upstream: { code: 'UPSTREAM', status: 502 },
  not_found: { code: 'NOT_FOUND', status: 404 },
  unsupported: { code: 'UNSUPPORTED', status: 501 },
  unknown: { code: 'UNKNOWN', status: 500 },
};

/** Translates any failure into something actionable. */
export function toMarketError(error: unknown): MarketDataError {
  if (error instanceof MarketDataError) return error;

  if (error instanceof MarketDataProviderError) {
    const mapped = BY_FAILURE[error.failure] ?? BY_FAILURE.unknown;
    return new MarketDataError(error.message, {
      code: mapped.code,
      status: mapped.status,
      ...(error.remedy === undefined ? {} : { remedy: error.remedy }),
    });
  }

  return new MarketDataError(error instanceof Error ? error.message : String(error), {
    code: 'UNKNOWN',
    status: 500,
  });
}

/** True when showing the last good snapshot instead of an error is honest. */
export function canServeStale(error: MarketDataError): boolean {
  return error.code !== 'NOT_CONFIGURED' && error.code !== 'AUTH';
}
