import { describe, expect, it } from 'vitest';
import { isCrossSiteMutation, trustedOriginsFrom } from './csrf';

const trusted = new Set(['https://equitywise.io']);
const base = { origin: null, referer: null, host: 'equitywise.io', trustedOrigins: trusted };

describe('isCrossSiteMutation', () => {
  it('never blocks safe methods', () => {
    for (const method of ['GET', 'HEAD', 'OPTIONS']) {
      expect(isCrossSiteMutation({ ...base, method, origin: 'https://evil.example' })).toBe(false);
    }
  });

  it('allows a mutation from a trusted origin', () => {
    expect(isCrossSiteMutation({ ...base, method: 'POST', origin: 'https://equitywise.io' })).toBe(
      false,
    );
  });

  it('allows a mutation whose origin matches the request host', () => {
    expect(
      isCrossSiteMutation({
        ...base,
        method: 'DELETE',
        host: 'localhost:3001',
        origin: 'http://localhost:3001',
      }),
    ).toBe(false);
  });

  it('blocks a foreign origin', () => {
    for (const method of ['POST', 'PUT', 'PATCH', 'DELETE']) {
      expect(isCrossSiteMutation({ ...base, method, origin: 'https://evil.example' })).toBe(true);
    }
  });

  it('blocks a lookalike host', () => {
    expect(
      isCrossSiteMutation({
        ...base,
        method: 'POST',
        origin: 'https://equitywise.io.evil.example',
      }),
    ).toBe(true);
  });

  it('blocks a mutation with no origin and no referer', () => {
    expect(isCrossSiteMutation({ ...base, method: 'POST' })).toBe(true);
  });

  it('falls back to the referer when origin is absent', () => {
    expect(
      isCrossSiteMutation({ ...base, method: 'POST', referer: 'https://equitywise.io/watchlists' }),
    ).toBe(false);
    expect(
      isCrossSiteMutation({ ...base, method: 'POST', referer: 'https://evil.example/x' }),
    ).toBe(true);
  });

  it('blocks an unparseable source', () => {
    expect(isCrossSiteMutation({ ...base, method: 'POST', origin: 'not a url' })).toBe(true);
  });
});

describe('trustedOriginsFrom', () => {
  it('prefers the explicit list, then the base URL, then the defaults', () => {
    expect([
      ...trustedOriginsFrom({ AUTH_TRUSTED_ORIGINS: 'https://a.test, https://b.test' }),
    ]).toEqual(['https://a.test', 'https://b.test']);
    expect([...trustedOriginsFrom({ AUTH_BASE_URL: 'https://c.test' })]).toEqual([
      'https://c.test',
    ]);
    expect([...trustedOriginsFrom({ NODE_ENV: 'production' })]).toEqual(['https://equitywise.io']);
    expect(trustedOriginsFrom({}).has('http://localhost:3000')).toBe(true);
  });
});
