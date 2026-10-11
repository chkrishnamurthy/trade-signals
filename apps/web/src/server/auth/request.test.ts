import { describe, expect, it } from 'vitest';
import { clientIp } from './request';

function request(headers: Record<string, string>): Request {
  return new Request('https://equitywise.io/api/auth/sign-in', { headers });
}

describe('clientIp', () => {
  it('uses the address appended by the trusted reverse proxy', () => {
    expect(
      clientIp(
        request({
          'x-forwarded-for': '203.0.113.123, 198.51.100.44',
          'x-real-ip': '198.51.100.44',
        }),
      ),
    ).toBe('198.51.100.44');
  });

  it('falls back to X-Real-IP when the forwarded chain is absent', () => {
    expect(clientIp(request({ 'x-real-ip': '198.51.100.18' }))).toBe('198.51.100.18');
  });

  it('returns null when the proxy supplied neither header', () => {
    expect(clientIp(request({}))).toBeNull();
  });
});
