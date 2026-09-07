import 'server-only';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { authSessionSecret } from '@/server/auth/env';

/**
 * Stateless, signed email-change confirmation token.
 *
 * Unlike verification / reset tokens (which are one-shot rows in `auth_tokens`),
 * an email change needs to carry the *target address* through the click. Rather
 * than add a column and a migration, the target rides inside an HMAC-signed,
 * expiring token — the same construction as the session cookie's MAC. The link
 * only proves the new inbox is reachable; the confirm route additionally requires
 * an authenticated session for the SAME user id, so a leaked link alone can do
 * nothing. Replay is bounded by the 30-minute expiry and made inert once the
 * address is already the account's email.
 *
 * A dedicated key (derived from the session secret) keeps these tokens from being
 * interchangeable with session cookies.
 */

const TTL_MS = 30 * 60 * 1000; // 30 minutes
const KEY_PURPOSE = 'email-change-v1';

interface Payload {
  readonly userId: number;
  readonly newEmail: string;
  readonly exp: number;
}

function key(): string {
  // Bind the signing key to this purpose so an email-change MAC can never be
  // mistaken for (or forged from) a session MAC.
  return createHmac('sha256', authSessionSecret()).update(KEY_PURPOSE).digest('hex');
}

function sign(body: string): string {
  return createHmac('sha256', key()).update(body).digest('base64url');
}

/** Mint a token binding `userId` → `newEmail`, valid for 30 minutes. */
export function createEmailChangeToken(userId: number, newEmail: string): string {
  const payload: Payload = { userId, newEmail, exp: Date.now() + TTL_MS };
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `${body}.${sign(body)}`;
}

/**
 * Verify a token: returns its payload only if the MAC is valid (constant-time)
 * and it has not expired. Null on any tampering, malformed input, or expiry.
 */
export function verifyEmailChangeToken(token: string): { userId: number; newEmail: string } | null {
  const dot = token.lastIndexOf('.');
  if (dot <= 0 || dot === token.length - 1) return null;
  const body = token.slice(0, dot);
  const mac = token.slice(dot + 1);

  const expected = sign(body);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as Payload;
    if (typeof payload.userId !== 'number' || typeof payload.newEmail !== 'string') return null;
    if (typeof payload.exp !== 'number' || payload.exp <= Date.now()) return null;
    return { userId: payload.userId, newEmail: payload.newEmail };
  } catch {
    return null;
  }
}
