/**
 * Dhan error taxonomy.
 *
 * Same three-way split as the Fyers package, because callers reason about it
 * the same way: transport blips are retried internally, `DhanRateLimitError`
 * means back off for a known duration, and `DhanAuthError` means a human has
 * to act. An *expired* token is none of these — it is recoverable by minting
 * another and is signalled through {@link isTokenExpiryCode}.
 */

/** Base for anything this package throws. */
export class DhanError extends Error {
  /** Dhan's own code: `DH-901` for trading-API errors, `807` for data-API ones. */
  readonly code: string | undefined;

  constructor(message: string, options: { code?: string | undefined; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DhanError';
    this.code = options.code;
  }
}

/**
 * Authentication failed in a way automation cannot fix.
 *
 * Thrown only when manual intervention is genuinely required — the PIN was
 * rejected, TOTP is not enabled on the account, the client id is wrong. A
 * merely expired token is not this: that is recoverable and triggers a mint.
 */
export class DhanAuthError extends DhanError {
  /** What the operator has to do. Surfaced directly in logs. */
  readonly remedy: string;

  constructor(
    message: string,
    remedy: string,
    options: { code?: string | undefined; cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'DhanAuthError';
    this.remedy = remedy;
  }
}

/**
 * Rate limited (HTTP 429, or `DH-904` in-band).
 *
 * NOT retried internally. The HTTP layer raises this immediately and opens a
 * circuit for the path; `retryAfterMs` is always populated so callers never
 * have to guess.
 */
export class DhanRateLimitError extends DhanError {
  /** Attempts already made when this was raised. */
  readonly attempts: number;
  readonly retryAfterMs: number;

  constructor(
    message: string,
    attempts: number,
    options: { code?: string | undefined; retryAfterMs: number },
  ) {
    super(message, options);
    this.name = 'DhanRateLimitError';
    this.attempts = attempts;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** The API answered, but with an error envelope or a shape we could not parse. */
export class DhanApiError extends DhanError {
  readonly httpStatus: number | undefined;

  constructor(
    message: string,
    options: { code?: string | undefined; httpStatus?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'DhanApiError';
    this.httpStatus = options.httpStatus;
  }
}

/**
 * Error codes, as strings because Dhan mixes two vocabularies: `DH-9xx` for
 * the trading/common layer and bare `8xx` for the data APIs.
 * Source: v2 docs, Annexure → "Error Codes".
 */
export const DHAN_ERROR_CODES = {
  /** "Client ID or user generated access token is invalid or expired". */
  INVALID_AUTH: 'DH-901',
  /** "Insufficient API subscriptions or access". */
  NO_ACCESS: 'DH-902',
  RATE_LIMITED: 'DH-904',
  INVALID_INPUT: 'DH-905',
  /** Data APIs: not subscribed. */
  DATA_NOT_SUBSCRIBED: '806',
  /** Data APIs: token expired. */
  DATA_TOKEN_EXPIRED: '807',
  /** Data APIs: authentication failed. */
  DATA_AUTH_FAILED: '808',
  /** Data APIs: invalid token. */
  DATA_INVALID_TOKEN: '809',
  /** Data APIs: invalid client id. */
  DATA_INVALID_CLIENT: '810',
} as const;

/** Codes that mean "this token is no longer usable" — recoverable by minting again. */
export const TOKEN_EXPIRY_CODES: readonly string[] = [
  DHAN_ERROR_CODES.INVALID_AUTH,
  DHAN_ERROR_CODES.DATA_TOKEN_EXPIRED,
  DHAN_ERROR_CODES.DATA_AUTH_FAILED,
  DHAN_ERROR_CODES.DATA_INVALID_TOKEN,
];

/** True when the API is telling us the access token needs regenerating. */
export function isTokenExpiryCode(code: string | undefined): boolean {
  return code !== undefined && TOKEN_EXPIRY_CODES.includes(code);
}

/** True when the account's Data API subscription has lapsed. */
export function isSubscriptionCode(code: string | undefined): boolean {
  return code === DHAN_ERROR_CODES.DATA_NOT_SUBSCRIBED || code === DHAN_ERROR_CODES.NO_ACCESS;
}
