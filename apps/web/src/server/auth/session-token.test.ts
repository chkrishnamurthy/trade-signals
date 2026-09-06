import { describe, expect, it } from 'vitest';
import {
  generateSessionToken,
  hashToken,
  readCookieValue,
  signCookieValue,
} from './session-token';

const SECRET = 'test-secret-at-least-32-bytes-long-000';

describe('session token', () => {
  it('generates unique 256-bit base64url tokens', () => {
    const a = generateSessionToken();
    const b = generateSessionToken();
    expect(a).not.toBe(b);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/); // 32 bytes → 43 base64url chars
  });

  it('hashes deterministically to 64 hex chars, never the raw token', () => {
    const token = generateSessionToken();
    expect(hashToken(token)).toBe(hashToken(token));
    expect(hashToken(token)).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken(token)).not.toContain(token);
  });

  it('round-trips a signed cookie value back to the token', () => {
    const token = generateSessionToken();
    const cookie = signCookieValue(token, SECRET);
    expect(readCookieValue(cookie, SECRET)).toBe(token);
  });

  it('rejects a cookie signed with a different secret', () => {
    const cookie = signCookieValue(generateSessionToken(), SECRET);
    expect(readCookieValue(cookie, 'a-different-secret-value-here-0000000')).toBeNull();
  });

  it('rejects a tampered token', () => {
    const token = generateSessionToken();
    const cookie = signCookieValue(token, SECRET);
    const tampered = cookie.replace(/^./, (c) => (c === 'A' ? 'B' : 'A'));
    expect(readCookieValue(tampered, SECRET)).toBeNull();
  });

  it('rejects malformed cookie values', () => {
    expect(readCookieValue('no-dot-here', SECRET)).toBeNull();
    expect(readCookieValue('.onlymac', SECRET)).toBeNull();
    expect(readCookieValue('token.', SECRET)).toBeNull();
    expect(readCookieValue('', SECRET)).toBeNull();
  });
});
