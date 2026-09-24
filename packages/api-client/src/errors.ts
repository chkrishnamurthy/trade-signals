/**
 * The one error type the app sees from the API. `kind` separates what the
 * user can act on (network, timeout) from what they cannot (parse), and `code`
 * / `remedy` carry the server's own explanation through unchanged.
 */
export type ApiErrorKind = 'http' | 'network' | 'timeout' | 'parse' | 'cancelled';

export class ApiError extends Error {
  readonly kind: ApiErrorKind;
  readonly status: number | null;
  readonly code: string | null;
  readonly remedy: string | null;
  readonly retryAfterSeconds: number | null;

  constructor(
    message: string,
    init: {
      kind: ApiErrorKind;
      status?: number;
      code?: string;
      remedy?: string;
      retryAfterSeconds?: number;
      cause?: unknown;
    },
  ) {
    super(message, init.cause === undefined ? undefined : { cause: init.cause });
    this.name = 'ApiError';
    this.kind = init.kind;
    this.status = init.status ?? null;
    this.code = init.code ?? null;
    this.remedy = init.remedy ?? null;
    this.retryAfterSeconds = init.retryAfterSeconds ?? null;
  }

  /** The session is gone for good: sign out locally, never retry. */
  get endsSession(): boolean {
    return this.status === 401 || (this.status === 403 && this.code === 'ACCOUNT_DISABLED');
  }

  /** Worth offering "Try again" for. */
  get retryable(): boolean {
    return (
      this.kind === 'network' ||
      this.kind === 'timeout' ||
      (this.kind === 'http' && this.status !== null && this.status >= 500)
    );
  }
}
