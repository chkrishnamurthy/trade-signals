/**
 * Native-client detection and bearer-token parsing — kept free of `server-only`
 * and `node:crypto` so the Edge middleware can import it.
 *
 * The Android app identifies itself with `X-EquityWise-Client: android/<version>
 * (build <n>)` on every request and authenticates with `Authorization: Bearer
 * <token>`. Both are custom request headers: a cross-site page can only attach
 * them after a CORS preflight, and this server answers no preflight — so a
 * request carrying either cannot be a CSRF (docs/mobile/01-discovery.md §7.1).
 */

export const CLIENT_HEADER = 'x-equitywise-client';

const NATIVE_CLIENT = /^(android|ios)\/[0-9A-Za-z.+-]{1,32}(?: \(build [0-9]{1,9}\))?$/u;

type HeaderSource = Pick<Headers, 'get'>;

/** The validated client label (`android/1.0.0 (build 3)`), or null for browsers. */
export function nativeClientLabel(headers: HeaderSource): string | null {
  const value = headers.get(CLIENT_HEADER)?.trim();
  return value !== undefined && NATIVE_CLIENT.test(value) ? value : null;
}

/** True when the request comes from the mobile app rather than a browser. */
export function isNativeClient(headers: HeaderSource): boolean {
  return nativeClientLabel(headers) !== null;
}

/** The raw value after `Bearer `, or null when the header is absent or malformed. */
export function bearerToken(headers: HeaderSource): string | null {
  const value = headers.get('authorization');
  if (value === null) return null;
  const match = /^Bearer ([A-Za-z0-9_-]{16,256}\.[A-Za-z0-9_-]{16,128})$/u.exec(value.trim());
  return match?.[1] ?? null;
}
