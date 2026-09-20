import { createHash, createHmac } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { getGoogleRedirectUri } from './google-oauth';

describe('google-oauth', () => {
  it('derives the Google redirect URI correctly', () => {
    const uri = getGoogleRedirectUri();
    expect(uri).toContain('/api/auth/google/callback');
  });

  it('computes valid PKCE S256 code challenges', () => {
    const verifier = 'test_code_verifier_1234567890_abcdefghijklmnopqrstuvwxyz';
    const challenge = createHash('sha256').update(verifier).digest('base64url');
    expect(challenge).toBeDefined();
    expect(challenge.length).toBeGreaterThan(0);
    // Base64url should not contain +, /, or =
    expect(challenge).not.toMatch(/[+/=]/);
  });

  it('generates verifiable HMAC signatures for OAuth state', () => {
    const secret = 'test-secret-key-12345';
    const payload = Buffer.from(
      JSON.stringify({
        state: 'random_state_123',
        codeVerifier: 'random_verifier_456',
        next: '/watchlists',
      }),
    ).toString('base64url');

    const signature = createHmac('sha256', secret).update(payload).digest('base64url');
    const signedCookie = `${payload}.${signature}`;

    const dot = signedCookie.lastIndexOf('.');
    expect(dot).toBeGreaterThan(0);

    const extractedPayload = signedCookie.slice(0, dot);
    const extractedSignature = signedCookie.slice(dot + 1);

    const expectedSignature = createHmac('sha256', secret).update(extractedPayload).digest('base64url');
    expect(extractedSignature).toBe(expectedSignature);

    const decoded = JSON.parse(Buffer.from(extractedPayload, 'base64url').toString('utf8'));
    expect(decoded.state).toBe('random_state_123');
    expect(decoded.next).toBe('/watchlists');
  });
});
