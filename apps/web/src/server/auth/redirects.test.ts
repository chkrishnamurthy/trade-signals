import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './redirects';

describe('safeRedirectPath', () => {
  it('accepts local paths and preserves local query strings', () => {
    expect(safeRedirectPath('/signals?date=2026-09-20')).toBe('/signals?date=2026-09-20');
  });

  it.each([
    'https://attacker.example',
    '//attacker.example',
    '/\\attacker.example',
    '/%5c%5cattacker.example',
    '/path\nnext',
    '',
  ])('rejects unsafe destination %s', (value) => {
    expect(safeRedirectPath(value)).toBe('/watchlists');
  });
});
