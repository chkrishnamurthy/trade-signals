import 'server-only';
import { createPublicKey, createVerify } from 'node:crypto';
import { z } from 'zod';
import type { GoogleUserInfo } from './google-oauth';

/**
 * Verifies a Google ID token (a signed JWT) handed to us by the mobile app after
 * Android Credential Manager's "Sign in with Google" (docs/mobile/01-discovery.md
 * §7.2). Nothing from the token is trusted until every check passes:
 *
 *   - RS256 signature against Google's published keys (JWKS, cached per its
 *     Cache-Control, refetched once on an unknown `kid` — Google rotates keys);
 *   - `iss` is Google, `aud` is OUR web client id, `exp`/`iat` are sane;
 *   - `nonce` equals the single-use nonce this server issued;
 *   - the email is verified.
 *
 * Pure checks live in `checkGoogleClaims` so they are testable without keys.
 */

const JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);
const CLOCK_SKEW_S = 60;

const headerSchema = z.object({ alg: z.literal('RS256'), kid: z.string().min(1) });

const claimsSchema = z.object({
  iss: z.string(),
  aud: z.union([z.string(), z.array(z.string())]),
  sub: z.string().min(1).max(255),
  exp: z.number(),
  iat: z.number(),
  nonce: z.string().optional(),
  email: z.string().email(),
  email_verified: z.union([z.boolean(), z.literal('true'), z.literal('false')]),
  name: z.string().optional(),
  picture: z.string().optional(),
});

export type GoogleClaims = z.infer<typeof claimsSchema>;

export class GoogleIdTokenError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

interface JwksCache {
  readonly keys: Map<string, JsonWebKey>;
  readonly expiresAt: number;
}
let jwks: JwksCache | null = null;

async function fetchJwks(): Promise<JwksCache> {
  const response = await fetch(JWKS_URL, { cache: 'no-store' });
  if (!response.ok) throw new GoogleIdTokenError('JWKS_UNAVAILABLE', 'Google keys unavailable.');
  const body = (await response.json()) as { keys?: Array<JsonWebKey & { kid?: string }> };
  const keys = new Map<string, JsonWebKey>();
  for (const key of body.keys ?? []) if (typeof key.kid === 'string') keys.set(key.kid, key);
  const maxAge = /max-age=(\d+)/u.exec(response.headers.get('cache-control') ?? '')?.[1];
  const ttlMs = Math.min(Number(maxAge ?? 3600), 24 * 3600) * 1000;
  return { keys, expiresAt: Date.now() + ttlMs };
}

async function keyFor(kid: string): Promise<JsonWebKey> {
  if (jwks === null || jwks.expiresAt <= Date.now()) jwks = await fetchJwks();
  let key = jwks.keys.get(kid);
  if (key === undefined) {
    jwks = await fetchJwks(); // key rotation: one refetch, then give up
    key = jwks.keys.get(kid);
  }
  if (key === undefined) throw new GoogleIdTokenError('UNKNOWN_KEY', 'Unknown signing key.');
  return key;
}

function decodePart(part: string): unknown {
  return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'));
}

/** Claim checks, separated from signature work so they can be unit-tested. */
export function checkGoogleClaims(
  raw: unknown,
  expected: { audience: string; nonce: string; nowS: number },
): GoogleUserInfo {
  const parsed = claimsSchema.safeParse(raw);
  if (!parsed.success) throw new GoogleIdTokenError('INVALID_TOKEN', 'Malformed Google token.');
  const c = parsed.data;
  if (!ISSUERS.has(c.iss)) throw new GoogleIdTokenError('INVALID_TOKEN', 'Wrong token issuer.');
  const audiences = Array.isArray(c.aud) ? c.aud : [c.aud];
  if (!audiences.includes(expected.audience))
    throw new GoogleIdTokenError('INVALID_TOKEN', 'Token was not issued for EquityWise.');
  if (c.exp + CLOCK_SKEW_S < expected.nowS)
    throw new GoogleIdTokenError('EXPIRED_TOKEN', 'Google sign-in expired. Try again.');
  if (c.iat - CLOCK_SKEW_S > expected.nowS)
    throw new GoogleIdTokenError('INVALID_TOKEN', 'Token issued in the future.');
  if (c.nonce !== expected.nonce)
    throw new GoogleIdTokenError('INVALID_TOKEN', 'Google sign-in could not be verified.');
  const verified = c.email_verified === true || c.email_verified === 'true';
  return {
    sub: c.sub,
    email: c.email.toLowerCase().trim(),
    email_verified: verified,
    name: c.name?.trim(),
    picture: c.picture?.trim(),
  };
}

/** Verify signature + claims; returns the Google principal or throws `GoogleIdTokenError`. */
export async function verifyGoogleIdToken(
  idToken: string,
  expected: { audience: string; nonce: string },
): Promise<GoogleUserInfo> {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new GoogleIdTokenError('INVALID_TOKEN', 'Malformed Google token.');
  const [headerPart, payloadPart, signaturePart] = parts as [string, string, string];

  let header: z.infer<typeof headerSchema>;
  let payload: unknown;
  try {
    header = headerSchema.parse(decodePart(headerPart));
    payload = decodePart(payloadPart);
  } catch {
    throw new GoogleIdTokenError('INVALID_TOKEN', 'Malformed Google token.');
  }

  const key = createPublicKey({ key: await keyFor(header.kid), format: 'jwk' });
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${headerPart}.${payloadPart}`);
  if (!verifier.verify(key, Buffer.from(signaturePart, 'base64url'))) {
    throw new GoogleIdTokenError('INVALID_TOKEN', 'Google token signature is invalid.');
  }

  return checkGoogleClaims(payload, { ...expected, nowS: Math.floor(Date.now() / 1000) });
}
