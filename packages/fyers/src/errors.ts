/**
 * Fyers error taxonomy.
 *
 * The distinction that matters to callers: transient transport failures are
 * *expected* and retried internally, `FyersRateLimitError` means back off for a
 * known duration, and `FyersAuthError` means a human has to go and log in.
 */

/** Base for anything this package throws. */
export class FyersError extends Error {
  readonly code: number | undefined;

  constructor(message: string, options: { code?: number | undefined; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'FyersError';
    this.code = options.code;
  }
}

/**
 * Authentication failed in a way automation cannot fix.
 *
 * Thrown only when manual intervention is genuinely required — the app secret is
 * wrong, TOTP is not enabled on the account, the PIN was rejected, or the
 * undocumented auto-login flow has changed shape. A merely *expired* token is
 * not this: that is recoverable and triggers a silent re-login.
 */
export class FyersAuthError extends FyersError {
  /** What the operator has to do. Surfaced directly in logs. */
  readonly remedy: string;

  constructor(
    message: string,
    remedy: string,
    options: { code?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'FyersAuthError';
    this.remedy = remedy;
  }
}

/**
 * Rate limited (HTTP 429 or API code -429).
 *
 * NOT retried internally. The upstream ban is fixed-duration — Cloudflare's
 * edge rule on `/data/quotes` was observed handing out `Retry-After: 1358`
 * (~22 minutes) — so retrying inside it cannot succeed and only wastes budget.
 * The HTTP layer raises this immediately and opens a circuit for the path.
 */
export class FyersRateLimitError extends FyersError {
  /** Attempts already made when this was raised. */
  readonly attempts: number;
  /**
   * How long to wait before this path can be used again.
   *
   * Taken from `Retry-After` when the upstream sends one, otherwise a
   * conservative default. Always populated, so callers never have to guess.
   */
  readonly retryAfterMs: number;

  constructor(
    message: string,
    attempts: number,
    options: { code?: number | undefined; retryAfterMs: number },
  ) {
    super(message, options);
    this.name = 'FyersRateLimitError';
    this.attempts = attempts;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** The API answered, but with `s: "error"` or a shape we could not parse. */
export class FyersApiError extends FyersError {
  readonly httpStatus: number | undefined;

  constructor(
    message: string,
    options: { code?: number | undefined; httpStatus?: number | undefined; cause?: unknown } = {},
  ) {
    super(message, options);
    this.name = 'FyersApiError';
    this.httpStatus = options.httpStatus;
  }
}

/**
 * Error codes the API returns in the `code` field.
 * Source: v3 spec, "Common API Error Codes".
 */
export const FYERS_ERROR_CODES = {
  TOKEN_EXPIRED: -8,
  INVALID_TOKEN: -15,
  TOKEN_AUTH_FAILED: -16,
  TOKEN_INVALID_OR_EXPIRED: -17,
  INVALID_PARAMS: -50,
  INVALID_SYMBOL: -300,
  INVALID_APP_ID: -352,
  RATE_LIMITED: -429,
} as const;

/** Codes that mean "this token is no longer usable" — recoverable by re-login. */
export const TOKEN_EXPIRY_CODES: readonly number[] = [
  FYERS_ERROR_CODES.TOKEN_EXPIRED,
  FYERS_ERROR_CODES.INVALID_TOKEN,
  FYERS_ERROR_CODES.TOKEN_AUTH_FAILED,
  FYERS_ERROR_CODES.TOKEN_INVALID_OR_EXPIRED,
];

/** True when the API is telling us the access token needs regenerating. */
export function isTokenExpiryCode(code: number | undefined): boolean {
  return code !== undefined && TOKEN_EXPIRY_CODES.includes(code);
}
