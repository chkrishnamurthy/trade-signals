/**
 * Provider-neutral failures.
 *
 * The product must be able to react to "the credential died" or "we are being
 * throttled" without knowing which provider said so. Adapters translate their
 * own error taxonomy into these; nothing downstream imports a provider's
 * error class.
 */

export type MarketDataFailure =
  /** The credential is missing, expired, or rejected. A human must act. */
  | 'auth'
  /** Throttled upstream. Retryable after a wait. */
  | 'rate_limit'
  /** The provider is not configured at all. */
  | 'not_configured'
  /** The provider answered, but with an error or an unparseable shape. */
  | 'upstream'
  /** The product asked for something the provider does not have. */
  | 'not_found'
  /** The provider cannot do this at all — see `ProviderCapabilities`. */
  | 'unsupported'
  | 'unknown';

export class MarketDataProviderError extends Error {
  readonly failure: MarketDataFailure;
  /** Which provider raised it, for logs and for multi-provider fallback. */
  readonly providerId: string;
  /** What the operator can do about it. Surfaced to the UI verbatim. */
  readonly remedy: string | undefined;
  /** True when trying again later could plausibly succeed. */
  readonly retryable: boolean;

  constructor(
    message: string,
    options: {
      failure: MarketDataFailure;
      providerId: string;
      remedy?: string | undefined;
      retryable?: boolean;
      cause?: unknown;
    },
  ) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'MarketDataProviderError';
    this.failure = options.failure;
    this.providerId = options.providerId;
    this.remedy = options.remedy;
    this.retryable = options.retryable ?? options.failure === 'rate_limit';
  }
}

export function isMarketDataProviderError(value: unknown): value is MarketDataProviderError {
  return value instanceof MarketDataProviderError;
}
