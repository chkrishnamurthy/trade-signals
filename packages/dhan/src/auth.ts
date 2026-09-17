import { createHmac } from 'node:crypto';
import { fromIstParts } from '@equitywise/shared';
import { DhanApiError, DhanAuthError, DhanRateLimitError, isTokenExpiryCode } from './errors.js';
import {
  authHeaders,
  DHAN_API_BASE,
  DHAN_AUTH_BASE,
  type DhanHttpClient,
  type DhanSession,
} from './http.js';
import {
  generateTokenResponseSchema,
  type ProfileResponse,
  profileResponseSchema,
  renewTokenResponseSchema,
} from './types.js';

/**
 * Authentication.
 *
 * Dhan access tokens live 24 hours from the instant they are minted. Unlike
 * Fyers, minting one headlessly is a DOCUMENTED flow — client id + PIN + a
 * TOTP code from the account's authenticator seed — and, as verified on
 * 2026-09-16, a token is NOT invalidated by the operator logging into the Dhan
 * app or website. So the credential job can mint at a fixed time each morning
 * and never be surprised mid-session.
 *
 * Two paths:
 *
 *  1. **`generateAccessToken`** — mint from scratch. Needs the secrets.
 *  2. **`renewToken`** — swap a still-valid token for a fresh 24 h one. Needs
 *     only the token. Fails on an expired one, so it is a top-up, not a rescue.
 *
 * `DhanAuthError` is raised only when a human has to act.
 */

export interface DhanCredentials {
  /** The 10-digit client id shown on the Dhan profile. */
  readonly clientId: string;
  /** Login PIN. Never logged. */
  readonly pin: string;
  /** Base32 seed from the API-TOTP enrolment (web.dhan.co → Access DhanHQ APIs → Set-up TOTP). */
  readonly totpSecret: string;
}

export interface MintedToken {
  readonly accessToken: string;
  readonly clientId: string;
  /** Absolute instant, UTC. */
  readonly expiresAt: Date;
}

// ---------------------------------------------------------------------------
// TOTP (RFC 6238, SHA-1, 6 digits, 30 s) — kept here rather than in
// `@equitywise/shared` because it needs `node:crypto`, and `shared` is also
// bundled into client components.
// ---------------------------------------------------------------------------

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/** Decodes an RFC 4648 base32 string (the format 2FA apps show). */
export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const output: number[] = [];

  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) {
      throw new DhanAuthError(
        `TOTP secret contains a non-base32 character: ${JSON.stringify(char)}`,
        'Copy the setup key exactly as shown under "Set-up TOTP" (A-Z and 2-7 only), not a 6-digit code.',
      );
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bits -= 8;
      output.push((value >>> bits) & 0xff);
    }
  }
  return Buffer.from(output);
}

/** `atSeconds` is injectable so the tests do not depend on the wall clock. */
export function generateTotp(
  secret: string,
  atSeconds: number,
  stepSeconds = 30,
  digits = 6,
): string {
  const counter = Math.floor(atSeconds / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));

  const digest = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = (digest[digest.length - 1] ?? 0) & 0x0f;
  const binary =
    (((digest[offset] ?? 0) & 0x7f) << 24) |
    (((digest[offset + 1] ?? 0) & 0xff) << 16) |
    (((digest[offset + 2] ?? 0) & 0xff) << 8) |
    ((digest[offset + 3] ?? 0) & 0xff);

  return String(binary % 10 ** digits).padStart(digits, '0');
}

// ---------------------------------------------------------------------------
// Expiry
// ---------------------------------------------------------------------------

/** Dhan's documented token lifetime. */
export const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1_000;

/**
 * Parses Dhan's zone-less `expiryTime` (`2026-09-17T23:01:04.777`) as IST.
 *
 * Verified 2026-09-16: a token minted at 23:01 IST reported `…T23:01:04` the
 * next day, so the string is IST wall-clock. Returns null on anything
 * unparseable; the caller then falls back to "now + 24 h", which is what the
 * docs promise anyway and is never LATER than the truth.
 */
export function parseExpiryTime(text: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?/.exec(text.trim());
  if (match === null) return null;
  const [, y, mo, d, h, mi, s] = match;
  if (y === undefined || mo === undefined || d === undefined || h === undefined || mi === undefined)
    return null;
  const date = fromIstParts({
    year: Number(y),
    month: Number(mo),
    day: Number(d),
    hour: Number(h),
    minute: Number(mi),
    second: s === undefined ? 0 : Number(s),
  });
  return Number.isNaN(date.getTime()) ? null : date;
}

/**
 * When a freshly minted token stops working: the earlier of what Dhan said and
 * the documented 24 h, minus a minute of slack so a call in flight at the
 * boundary is not the one that discovers the expiry.
 */
export function tokenExpiry(expiryTime: string, now: Date): Date {
  const documented = now.getTime() + TOKEN_LIFETIME_MS;
  const reported = parseExpiryTime(expiryTime)?.getTime() ?? documented;
  return new Date(Math.min(reported, documented) - 60_000);
}

/** True when a stored token can still be sent upstream. */
export function isTokenUsable(
  token: {
    readonly accessToken: string;
    readonly expiresAt: Date;
    readonly clientId: string;
  } | null,
  clientId: string,
  now: Date,
): boolean {
  if (token === null) return false;
  if (token.clientId !== clientId) return false;
  if (token.accessToken === '') return false;
  return token.expiresAt.getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// Minting
// ---------------------------------------------------------------------------

export interface AuthDependencies {
  readonly http: DhanHttpClient;
  /** Injectable clock. */
  readonly now?: () => Date;
}

/**
 * Mints a new token from client id + PIN + TOTP.
 *
 * `POST https://auth.dhan.co/app/generateAccessToken?dhanClientId=…&pin=…&totp=…`
 * — query parameters, no body, no prior token. The PIN and seed travel only in
 * this one request; nothing logs the URL.
 */
export async function generateAccessToken(
  deps: AuthDependencies,
  credentials: DhanCredentials,
): Promise<MintedToken> {
  const now = deps.now?.() ?? new Date();
  if (credentials.clientId === '' || credentials.pin === '' || credentials.totpSecret === '') {
    throw new DhanAuthError(
      'Dhan credentials are incomplete',
      'Set DHAN_CLIENT_ID, DHAN_PIN and DHAN_TOTP_SECRET.',
    );
  }
  const totp = generateTotp(credentials.totpSecret, Math.floor(now.getTime() / 1_000));

  try {
    const response = await deps.http.request(
      `${DHAN_AUTH_BASE}/generateAccessToken`,
      generateTokenResponseSchema,
      {
        method: 'POST',
        query: { dhanClientId: credentials.clientId, pin: credentials.pin, totp },
        // Auth is not a data call, but it must not race a burst either.
        bucket: 'data',
      },
    );
    return {
      accessToken: response.accessToken,
      clientId: credentials.clientId,
      expiresAt: tokenExpiry(response.expiryTime, now),
    };
  } catch (error) {
    // Undocumented, observed 2026-09-16: "Token can be generated once every
    // 2 minutes." That is a throttle, not a broken credential — surface it as
    // one so the credential job waits instead of paging the operator.
    if (error instanceof DhanApiError) {
      const cooldown = mintCooldownMs(error.message);
      if (cooldown !== null) {
        throw new DhanRateLimitError(`Dhan mint throttled: ${error.message}`, 1, {
          retryAfterMs: cooldown,
        });
      }
    }
    // Otherwise a rejected mint is not recoverable by retrying: the PIN, the
    // seed, or the client id is wrong, or TOTP is not enabled. Say so, and say
    // what to do.
    if (error instanceof DhanApiError) {
      throw new DhanAuthError(
        `Dhan rejected the TOTP login: ${error.message}`,
        'Check DHAN_CLIENT_ID (10 digits), DHAN_PIN, that API TOTP is enabled on the account, ' +
          'and that DHAN_TOTP_SECRET is the base32 setup key. The host clock must be accurate.',
        { code: error.code, cause: error },
      );
    }
    throw error;
  }
}

/** Dhan's mint throttle, from its message; null when the error is something else. */
export function mintCooldownMs(message: string): number | null {
  const match = /once every (\d+) (second|minute|hour)s?/i.exec(message);
  if (match === null) return null;
  const n = Number(match[1]);
  const unit = (match[2] ?? '').toLowerCase();
  const unitMs = unit === 'hour' ? 3_600_000 : unit === 'minute' ? 60_000 : 1_000;
  return n * unitMs;
}

/**
 * Exchanges a still-valid token for a fresh 24 h one.
 *
 * Dhan invalidates the old token on success. On an expired token it errors,
 * which the caller should treat as "mint instead", not as a failure to alert on.
 */
export async function renewToken(
  deps: AuthDependencies,
  session: DhanSession,
): Promise<MintedToken> {
  const now = deps.now?.() ?? new Date();
  const response = await deps.http.request(
    `${DHAN_API_BASE}/RenewToken`,
    renewTokenResponseSchema,
    {
      method: 'GET',
      headers: { ...authHeaders(session), dhanClientId: session.clientId },
    },
  );
  return {
    accessToken: response.accessToken,
    clientId: session.clientId,
    expiresAt: tokenExpiry(response.expiryTime, now),
  };
}

// ---------------------------------------------------------------------------
// Profile — the subscription and token health check
// ---------------------------------------------------------------------------

export interface DhanProfile {
  readonly clientId: string;
  /** True when the Data API subscription is live. */
  readonly dataApiActive: boolean;
  /** Raw `dataValidity` (`2026-10-15 22:46:27.0`, IST), or null. */
  readonly dataValidUntil: string | null;
  /** Raw `tokenValidity` (`17/09/2026 23:01`, IST), or null. */
  readonly tokenValidUntil: string | null;
}

/** Reads `/profile`. Cheap; the one call that tells us whether data calls can succeed. */
export async function fetchProfile(
  deps: AuthDependencies,
  session: DhanSession,
): Promise<DhanProfile> {
  const raw: ProfileResponse = await deps.http.request(
    `${DHAN_API_BASE}/profile`,
    profileResponseSchema,
    { method: 'GET', headers: authHeaders(session) },
  );
  return {
    clientId: String(raw.dhanClientId),
    dataApiActive: (raw.dataPlan ?? '').toLowerCase() === 'active',
    dataValidUntil: raw.dataValidity ?? null,
    tokenValidUntil: raw.tokenValidity ?? null,
  };
}

/** True when `error` says the token is dead and a mint would fix it. */
export function isExpiredTokenError(error: unknown): boolean {
  return error instanceof DhanApiError && isTokenExpiryCode(error.code);
}
