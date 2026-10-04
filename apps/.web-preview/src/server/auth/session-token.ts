import 'server-only';
import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Session token crypto.
 *
 * The raw token is a 256-bit random value that lives ONLY in the browser cookie.
 * The database stores its SHA-256 hash, so a database read alone cannot resurrect
 * a live session. The cookie value additionally carries an HMAC of the token, so
 * the (Edge-runtime) middleware can reject forged/absent cookies without a DB hit;
 * the authoritative revocable check is the hashed-token lookup in `requireUser`.
 */

const TOKEN_BYTES = 32; // 256-bit

/** Idle timeout (rolling) and absolute lifetime. */
export const SESSION_IDLE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
export const SESSION_ABSOLUTE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

/** A fresh, unguessable session token (base64url, no padding). */
export function generateSessionToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

/** What we store in the DB — never the raw token. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sign(token: string, secret: string): string {
  return createHmac('sha256', secret).update(token).digest('base64url');
}

/** Cookie value = `<token>.<hmac>`. */
export function signCookieValue(token: string, secret: string): string {
  return `${token}.${sign(token, secret)}`;
}

/**
 * Returns the token if the cookie's HMAC is valid for `secret`, else null.
 * Constant-time comparison, so a forged MAC can't be discovered byte by byte.
 */
export function readCookieValue(value: string, secret: string): string | null {
  const dot = value.lastIndexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  const token = value.slice(0, dot);
  const mac = value.slice(dot + 1);
  const expected = sign(token, secret);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  return token;
}
