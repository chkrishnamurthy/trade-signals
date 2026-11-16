import { describe, expect, it } from 'vitest';
import { buildServiceWorkerSource, classifyRequest } from './service-worker';

const ORIGIN = 'https://equitywise.io';
const nav = (
  path: string,
  overrides: Partial<{ method: string; mode: string; url: string }> = {},
) =>
  classifyRequest({
    url: `${ORIGIN}${path}`,
    method: 'GET',
    mode: 'navigate',
    origin: ORIGIN,
    ...overrides,
  });

describe('classifyRequest — the worker only ever answers failed page navigations', () => {
  it('handles same-origin page navigations', () => {
    expect(nav('/today')).toBe('offline-fallback');
    expect(nav('/stocks/RELIANCE')).toBe('offline-fallback');
    expect(nav('/login?next=/today')).toBe('offline-fallback');
  });

  it('never touches the API, including the Google sign-in hop', () => {
    expect(nav('/api/watchlists')).toBe('bypass');
    expect(nav('/api/auth/google')).toBe('bypass');
    expect(nav('/api')).toBe('bypass');
  });

  it('never touches fetches, event streams, scripts or images', () => {
    for (const mode of ['cors', 'same-origin', 'no-cors']) {
      expect(nav('/api/market/indices/live', { mode })).toBe('bypass');
      expect(nav('/_next/static/chunks/main.js', { mode })).toBe('bypass');
      expect(nav('/icons/icon-192.png', { mode })).toBe('bypass');
    }
  });

  it('never touches non-GET requests or other origins', () => {
    expect(nav('/today', { method: 'POST' })).toBe('bypass');
    expect(nav('/', { url: 'https://accounts.google.com/o/oauth2/auth' })).toBe('bypass');
    expect(nav('/', { url: 'not a url' })).toBe('bypass');
  });
});

describe('buildServiceWorkerSource', () => {
  it('produces parseable JavaScript carrying the version and routing function', () => {
    const source = buildServiceWorkerSource({ version: 'build-123', kill: false });
    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain('"build-123"');
    expect(source).toContain('/offline.html');
    // Never stores responses beyond the precache.
    expect(source).not.toMatch(/cache\.put\(/);
  });

  it('kill switch unregisters and clears its caches', () => {
    const source = buildServiceWorkerSource({ version: 'x', kill: true });
    expect(() => new Function(source)).not.toThrow();
    expect(source).toContain('registration.unregister()');
    expect(source).not.toContain("addEventListener('fetch'");
  });
});
