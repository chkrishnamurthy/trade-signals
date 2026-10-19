/**
 * Cross-site request forgery check for state-changing API calls.
 *
 * Pure and Edge-safe (no `server-only`, no Node APIs) so the middleware can run
 * it on every `/api/*` request. The session cookie is `SameSite=Lax`, which
 * already keeps browsers from attaching it to cross-site POST/PUT/PATCH/DELETE;
 * this is the second layer, so one forgotten check on one route is not an open
 * door. The auth routes keep their own `isSameOrigin` check as well.
 */

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export interface CsrfInput {
  method: string;
  origin: string | null;
  referer: string | null;
  /** The host the request was addressed to (forwarded host when behind the proxy). */
  host: string | null;
  /** Origins configured as ours, e.g. `https://equitywise.io`. */
  trustedOrigins: ReadonlySet<string>;
}

/** True when the request is a mutation that did not come from our own site. */
export function isCrossSiteMutation(input: CsrfInput): boolean {
  if (SAFE_METHODS.has(input.method.toUpperCase())) return false;

  // Browsers send Origin on every non-GET fetch/form post. A missing one is a
  // scripted or cross-site request; Referer is the fallback some privacy
  // settings leave in place.
  const source = input.origin ?? input.referer;
  if (source === null || source === '') return true;

  let parsed: URL;
  try {
    parsed = new URL(source);
  } catch {
    return true;
  }
  if (input.trustedOrigins.has(parsed.origin)) return false;
  return !(input.host !== null && parsed.host === input.host);
}

/** Same defaults as the auth layer: explicit list, else the base URL, else the dev origins. */
export function trustedOriginsFrom(env: {
  AUTH_TRUSTED_ORIGINS?: string | undefined;
  AUTH_BASE_URL?: string | undefined;
  NODE_ENV?: string | undefined;
}): ReadonlySet<string> {
  const configured = env.AUTH_TRUSTED_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const base = env.AUTH_BASE_URL?.trim();
  const defaults =
    env.NODE_ENV === 'production'
      ? ['https://equitywise.io']
      : ['http://localhost:3000', 'http://localhost'];
  return new Set(configured?.length ? configured : base ? [base] : defaults);
}
