import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { oklchToHex } from './oklch';
import { COLOR_TOKENS, OKLCH } from './tokens';

/** Pull `--name: value;` pairs out of one `selector { … }` block of globals.css. */
function block(css: string, selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const body = css.slice(start, css.indexOf('\n}', start));
  const out = new Map<string, string>();
  for (const m of body.matchAll(/--([a-z0-9-]+):\s*(oklch\([^)]*\))\s*;/gu)) {
    if (m[1] !== undefined && m[2] !== undefined) out.set(m[1], m[2]);
  }
  return out;
}

const css = readFileSync(join(__dirname, '../../../apps/web/src/app/globals.css'), 'utf8');

describe('design tokens stay identical to the website', () => {
  it.each([
    ['light', ':root'],
    ['dark', ':root.dark'],
  ] as const)('%s theme matches globals.css %s', (theme, selector) => {
    const web = block(css, selector);
    for (const token of COLOR_TOKENS) {
      expect({ token, value: OKLCH[theme][token] }).toEqual({ token, value: web.get(token) });
    }
  });
});

describe('oklchToHex', () => {
  it('converts reference colours', () => {
    expect(oklchToHex('oklch(1 0 0)')).toBe('#ffffff');
    expect(oklchToHex('oklch(0 0 0)')).toBe('#000000');
    // Web's bullish green renders as a saturated teal-green.
    expect(oklchToHex('oklch(0.62 0.17 166)')).toMatch(/^#0[0-9a-f]a[0-9a-f]{3}$/u);
  });
});
