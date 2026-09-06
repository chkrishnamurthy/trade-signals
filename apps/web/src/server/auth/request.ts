import 'server-only';

/**
 * Request-derived facts and the CSRF origin check.
 *
 * The client IP is read from the proxy header Nginx sets, falling back to the
 * socket. The origin check is our primary CSRF defence on state-changing routes:
 * a cross-site form POST either omits `Origin`/`Referer` or carries a foreign
 * one, and either way we reject it.
 */

/** Best-effort client IP, trusting the reverse proxy in front of us. */
export function clientIp(request: Request): string | null {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded !== null && forwarded !== '') {
    const first = forwarded.split(',')[0]?.trim();
    if (first !== undefined && first !== '') return first;
  }
  return request.headers.get('x-real-ip');
}

export function userAgent(request: Request): string | null {
  const ua = request.headers.get('user-agent');
  return ua === null || ua === '' ? null : ua.slice(0, 512);
}

/**
 * True when the request came from our own site. Compares the `Origin` (or, if
 * absent, `Referer`) host against the request's own `Host`. State-changing auth
 * routes must reject when this is false.
 */
export function isSameOrigin(request: Request): boolean {
  const host = request.headers.get('host');
  if (host === null) return false;

  const origin = request.headers.get('origin');
  const source = origin ?? request.headers.get('referer');
  if (source === null || source === '') {
    // No Origin/Referer at all: block state-changing use. (Same-origin browsers
    // send Origin on POST; a missing one is a cross-site or scripted request.)
    return false;
  }

  try {
    return new URL(source).host === host;
  } catch {
    return false;
  }
}
