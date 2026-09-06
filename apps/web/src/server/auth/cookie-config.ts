/**
 * Cookie naming — deliberately free of `node:crypto` and `server-only` so the
 * Edge-runtime middleware can import it for a cheap presence check.
 *
 * The `__Host-` prefix requires a Secure cookie, which needs HTTPS. Production is
 * behind TLS so it gets the hardened `__Host-session`; local dev runs over
 * http://localhost, where a `__Host-` cookie would be rejected by the browser, so
 * it falls back to a plain name.
 */
export const IS_PROD = process.env.NODE_ENV === 'production';

export const SESSION_COOKIE_NAME = IS_PROD ? '__Host-session' : 'session';
