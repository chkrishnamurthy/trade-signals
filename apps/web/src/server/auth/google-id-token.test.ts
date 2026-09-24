import { createSign, generateKeyPairSync } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { checkGoogleClaims, GoogleIdTokenError, verifyGoogleIdToken } from './google-id-token';

vi.mock('server-only', () => ({}));

const AUD = 'web-client.apps.googleusercontent.com';
const NOW = 1_790_000_000;

function claims(over: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    iss: 'https://accounts.google.com',
    aud: AUD,
    sub: '1234567890',
    exp: NOW + 3600,
    iat: NOW - 10,
    nonce: 'the-nonce',
    email: 'Person@Example.com',
    email_verified: true,
    name: 'Person',
    ...over,
  };
}

const expected = { audience: AUD, nonce: 'the-nonce', nowS: NOW };

describe('checkGoogleClaims', () => {
  it('returns the principal for a valid token', () => {
    expect(checkGoogleClaims(claims(), expected)).toEqual({
      sub: '1234567890',
      email: 'person@example.com',
      email_verified: true,
      name: 'Person',
      picture: undefined,
    });
  });

  it.each([
    ['wrong issuer', { iss: 'https://evil.example' }],
    ['wrong audience', { aud: 'someone-else' }],
    ['expired', { exp: NOW - 120 }],
    ['issued in the future', { iat: NOW + 600 }],
    ['wrong nonce', { nonce: 'replayed' }],
    ['missing nonce', { nonce: undefined }],
  ])('rejects %s', (_label, over) => {
    expect(() => checkGoogleClaims(claims(over), expected)).toThrow(GoogleIdTokenError);
  });

  it('reports an unverified email as unverified (caller refuses it)', () => {
    expect(checkGoogleClaims(claims({ email_verified: 'false' }), expected).email_verified).toBe(
      false,
    );
  });
});

describe('verifyGoogleIdToken', () => {
  const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const jwk = { ...publicKey.export({ format: 'jwk' }), kid: 'k1', alg: 'RS256', use: 'sig' };

  function sign(payload: Record<string, unknown>, kid = 'k1'): string {
    const enc = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url');
    const body = `${enc({ alg: 'RS256', kid, typ: 'JWT' })}.${enc(payload)}`;
    const sig = createSign('RSA-SHA256').update(body).sign(privateKey).toString('base64url');
    return `${body}.${sig}`;
  }

  afterEach(() => vi.unstubAllGlobals());

  it('accepts a correctly signed token and rejects a tampered one', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response(JSON.stringify({ keys: [jwk] }), { status: 200 })),
    );
    const now = Math.floor(Date.now() / 1000);
    const token = sign(claims({ exp: now + 600, iat: now }));
    await expect(
      verifyGoogleIdToken(token, { audience: AUD, nonce: 'the-nonce' }),
    ).resolves.toMatchObject({ sub: '1234567890' });

    const [h, , s] = token.split('.');
    const forged = `${h}.${Buffer.from(JSON.stringify(claims({ sub: 'attacker', exp: now + 600, iat: now }))).toString('base64url')}.${s}`;
    await expect(
      verifyGoogleIdToken(forged, { audience: AUD, nonce: 'the-nonce' }),
    ).rejects.toThrow(/signature/u);
  });
});
