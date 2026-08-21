import { createHash, createHmac } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
import { FyersApiError, FyersAuthError, isTokenExpiryCode } from './errors.js';
import { FYERS_V3_BASE, type FyersHttpClient } from './http.js';
import { validateAuthCodeResponseSchema } from './types.js';

/**
 * Authentication.
 *
 * Two paths, in order of preference:
 *
 *  1. **A cached token that is still valid.** Free.
 *  2. **Automated TOTP re-login.** Fyers access tokens expire daily, and as of
 *     1 April 2026 the refresh-token flow is gone and SEBI mandates a daily 2FA
 *     login. The endpoints used here are the ones Fyers' own web login calls;
 *     they are NOT in the published v3 spec. See AUTOMATED_LOGIN_CAVEAT.
 *  3. **Manual OAuth.** Always works. Requires a human to open a URL.
 *
 * Only when 1 and 2 both fail do we raise `FyersAuthError`, which is the signal
 * that a human has to act.
 */

/**
 * The automated login flow is undocumented and unsupported.
 *
 * Fyers publishes only the browser OAuth flow. The `/vagator/v2/*` endpoints
 * below are what the Fyers web client itself uses, and the community relies on
 * them for headless re-login. They can change without notice. Every failure in
 * this path degrades to a `FyersAuthError` telling the operator to log in by
 * hand rather than retrying blindly.
 */
export const AUTOMATED_LOGIN_CAVEAT =
  'Automated TOTP login uses undocumented Fyers endpoints and may break without notice; ' +
  'the manual OAuth flow is the only supported path.';

const VAGATOR_BASE = 'https://api-t2.fyers.in/vagator/v2';

export interface FyersCredentials {
  /** App ID from the API dashboard, e.g. `SPXXXXE7-100`. */
  readonly appId: string;
  /** App secret. Never logged. */
  readonly secretKey: string;
  /** Must match the redirect URI registered with the app. */
  readonly redirectUri: string;
  /** Client ID for automated login — your FYERS login ID, e.g. `XK12345`. */
  readonly fyId?: string;
  /** Base32 TOTP secret from the FYERS 2FA setup. */
  readonly totpSecret?: string;
  /** 4-digit login PIN. */
  readonly pin?: string;
}

export interface CachedToken {
  readonly accessToken: string;
  /** ISO-8601. */
  readonly expiresAt: string;
  readonly appId: string;
}

const cachedTokenSchema = z.object({
  accessToken: z.string().min(1),
  expiresAt: z.string().datetime(),
  appId: z.string().min(1),
});

/** SHA-256 of `appId:secretKey`, as `appIdHash` in the validate-authcode call. */
export function appIdHash(appId: string, secretKey: string): string {
  return createHash('sha256').update(`${appId}:${secretKey}`).digest('hex');
}

/** The URL a human opens to authorise the app. */
export function buildAuthCodeUrl(credentials: FyersCredentials, state = 'signal'): string {
  const url = new URL(`${FYERS_V3_BASE}/generate-authcode`);
  url.searchParams.set('client_id', credentials.appId);
  url.searchParams.set('redirect_uri', credentials.redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('state', state);
  return url.toString();
}

// ---------------------------------------------------------------------------
// TOTP
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
      throw new FyersAuthError(
        `TOTP secret contains a non-base32 character: ${JSON.stringify(char)}`,
        'Copy the TOTP secret exactly as shown during FYERS 2FA setup (A-Z and 2-7 only).',
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

/**
 * RFC 6238 TOTP, SHA-1, 6 digits, 30-second step.
 *
 * `atSeconds` is injectable so the tests do not depend on the wall clock.
 */
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
// Token cache
// ---------------------------------------------------------------------------

/**
 * When a token expires.
 *
 * Fyers tokens die at the next trading day's start rather than N hours after
 * issue. We conservatively treat a token as good until 07:00 IST the following
 * morning (01:30 UTC), which is comfortably before the 09:00 pre-open.
 */
export function defaultExpiry(issuedAt: Date): Date {
  const next = new Date(issuedAt.getTime());
  next.setUTCHours(1, 30, 0, 0);
  if (next.getTime() <= issuedAt.getTime()) {
    next.setUTCDate(next.getUTCDate() + 1);
  }
  return next;
}

export async function readCachedToken(path: string): Promise<CachedToken | null> {
  let contents: string;
  try {
    contents = await readFile(path, 'utf8');
  } catch {
    return null;
  }

  let payload: unknown;
  try {
    payload = JSON.parse(contents);
  } catch {
    return null;
  }

  const parsed = cachedTokenSchema.safeParse(payload);
  return parsed.success ? parsed.data : null;
}

export async function writeCachedToken(path: string, token: CachedToken): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  // 0600: the token is a bearer credential for a brokerage account.
  await writeFile(path, `${JSON.stringify(token, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
}

/** True when the token is present, matches the app, and has not expired. */
export function isTokenUsable(token: CachedToken | null, appId: string, now: Date): boolean {
  if (token === null) return false;
  if (token.appId !== appId) return false;
  return new Date(token.expiresAt).getTime() > now.getTime();
}

// ---------------------------------------------------------------------------
// OAuth exchange
// ---------------------------------------------------------------------------

/** Exchanges an `auth_code` for an `access_token`. */
export async function exchangeAuthCode(
  http: FyersHttpClient,
  credentials: FyersCredentials,
  authCode: string,
): Promise<string> {
  try {
    const response = await http.request(
      `${FYERS_V3_BASE}/validate-authcode`,
      validateAuthCodeResponseSchema,
      {
        method: 'POST',
        body: {
          grant_type: 'authorization_code',
          appIdHash: appIdHash(credentials.appId, credentials.secretKey),
          code: authCode,
        },
      },
    );
    return response.access_token;
  } catch (error) {
    if (error instanceof FyersApiError && isTokenExpiryCode(error.code)) {
      throw new FyersAuthError(
        'The auth_code has expired.',
        'Generate a fresh auth_code — they are single-use and short-lived.',
        { cause: error },
      );
    }
    throw new FyersAuthError(
      `Could not exchange auth_code: ${error instanceof Error ? error.message : String(error)}`,
      'Check FYERS_APP_ID / FYERS_SECRET_KEY and that the redirect URI matches the app registration exactly.',
      { cause: error },
    );
  }
}

// ---------------------------------------------------------------------------
// Automated TOTP login (undocumented)
// ---------------------------------------------------------------------------

const sendOtpSchema = z.object({ request_key: z.string().min(1) });
const verifyOtpSchema = z.object({ request_key: z.string().min(1) });
const verifyPinSchema = z.object({ data: z.object({ access_token: z.string().min(1) }) });

export interface AutoLoginDeps {
  readonly http: FyersHttpClient;
  readonly credentials: FyersCredentials;
  /** Injectable clock, epoch seconds. */
  readonly nowSeconds?: () => number;
  readonly fetchImpl?: typeof fetch;
}

/**
 * Logs in headlessly with TOTP and returns an access token.
 *
 * @throws FyersAuthError whenever a human is genuinely needed.
 */
export async function autoLogin(deps: AutoLoginDeps): Promise<string> {
  const { credentials } = deps;
  const { fyId, totpSecret, pin } = credentials;

  if (fyId === undefined || totpSecret === undefined || pin === undefined) {
    throw new FyersAuthError(
      'Automated login is not configured.',
      'Set FYERS_ID, FYERS_TOTP_SECRET and FYERS_PIN in .env, or complete the manual OAuth flow.',
    );
  }

  const nowSeconds = deps.nowSeconds ?? (() => Math.floor(Date.now() / 1000));
  const fetchImpl = deps.fetchImpl ?? globalThis.fetch;

  const post = async <T>(
    path: string,
    body: unknown,
    schema: z.ZodType<T>,
    step: string,
  ): Promise<T> => {
    const response = await fetchImpl(`${VAGATOR_BASE}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const text = await response.text();
    if (!response.ok) {
      throw new FyersAuthError(
        `Automated login failed at ${step}: HTTP ${response.status} ${text.slice(0, 200)}`,
        `${AUTOMATED_LOGIN_CAVEAT} Log in manually via buildAuthCodeUrl().`,
      );
    }
    let payload: unknown;
    try {
      payload = JSON.parse(text);
    } catch {
      throw new FyersAuthError(
        `Automated login returned non-JSON at ${step}.`,
        AUTOMATED_LOGIN_CAVEAT,
      );
    }
    const parsed = schema.safeParse(payload);
    if (!parsed.success) {
      throw new FyersAuthError(
        `Automated login response changed shape at ${step}.`,
        `${AUTOMATED_LOGIN_CAVEAT} Re-check the flow against a browser login.`,
      );
    }
    return parsed.data;
  };

  const otp = await post(
    '/send_login_otp_v2',
    { fy_id: encodeBase64(fyId), app_id: '2' },
    sendOtpSchema,
    'send_login_otp',
  );

  const totp = generateTotp(totpSecret, nowSeconds());
  const verified = await post(
    '/verify_otp',
    { request_key: otp.request_key, otp: totp },
    verifyOtpSchema,
    'verify_otp',
  );

  const authenticated = await post(
    '/verify_pin_v2',
    { request_key: verified.request_key, identity_type: 'pin', identifier: encodeBase64(pin) },
    verifyPinSchema,
    'verify_pin',
  );

  return authenticated.data.access_token;
}

function encodeBase64(value: string): string {
  return Buffer.from(value, 'utf8').toString('base64');
}
