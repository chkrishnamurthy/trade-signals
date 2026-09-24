import { describe, expect, it } from 'vitest';
import { bearerToken, isNativeClient, nativeClientLabel } from './client';

const h = (init: Record<string, string>): Headers => new Headers(init);
const TOKEN = `${'a'.repeat(43)}.${'b'.repeat(43)}`;

describe('nativeClientLabel', () => {
  it('accepts the app header in its documented shapes', () => {
    expect(nativeClientLabel(h({ 'x-equitywise-client': 'android/1.0.0 (build 3)' }))).toBe(
      'android/1.0.0 (build 3)',
    );
    expect(isNativeClient(h({ 'x-equitywise-client': 'android/1.2.0' }))).toBe(true);
    expect(isNativeClient(h({ 'x-equitywise-client': 'ios/2.0.1 (build 40)' }))).toBe(true);
  });

  it('rejects browsers, junk and look-alikes', () => {
    expect(isNativeClient(h({}))).toBe(false);
    expect(isNativeClient(h({ 'x-equitywise-client': 'web' }))).toBe(false);
    expect(isNativeClient(h({ 'x-equitywise-client': 'android/' }))).toBe(false);
    expect(isNativeClient(h({ 'x-equitywise-client': 'android/1.0.0; drop table' }))).toBe(false);
  });
});

describe('bearerToken', () => {
  it('extracts a well-formed signed token', () => {
    expect(bearerToken(h({ authorization: `Bearer ${TOKEN}` }))).toBe(TOKEN);
  });

  it('ignores absent, other-scheme and malformed values', () => {
    expect(bearerToken(h({}))).toBeNull();
    expect(bearerToken(h({ authorization: `Basic ${TOKEN}` }))).toBeNull();
    expect(bearerToken(h({ authorization: 'Bearer short.x' }))).toBeNull();
    expect(bearerToken(h({ authorization: `Bearer ${'a'.repeat(43)}` }))).toBeNull();
  });
});
