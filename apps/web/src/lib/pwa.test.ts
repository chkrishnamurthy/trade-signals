import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import manifest from '@/app/manifest';
import { MOBILE_TABS } from './navigation';
import {
  INSTALL_SNOOZE_MS,
  IOS_SPLASH_SCREENS,
  isIosDevice,
  PWA_COLORS,
  shouldOfferInstall,
} from './pwa';

const WEB = resolve(import.meta.dirname, '..', '..');
const PUBLIC = join(WEB, 'public');

/** OKLCH → sRGB hex (CSS Color 4 reference matrices), for checking token parity. */
function oklchToHex(l: number, c: number, h: number): string {
  const a = c * Math.cos((h * Math.PI) / 180);
  const b = c * Math.sin((h * Math.PI) / 180);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
  return `#${linear
    .map((x) => {
      const v = Math.min(1, Math.max(0, x));
      const srgb = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
      return Math.round(srgb * 255)
        .toString(16)
        .padStart(2, '0');
    })
    .join('')}`;
}

/** The value of `--name` in the first block of globals.css that matches `scope`. */
function token(css: string, scope: RegExp, name: string): string {
  const block = css.slice(css.search(scope));
  const match = new RegExp(`--${name}:\\s*oklch\\(([\\d.]+) ([\\d.]+) ([\\d.]+)\\)`).exec(block);
  if (match === null) throw new Error(`token --${name} not found`);
  return oklchToHex(Number(match[1]), Number(match[2]), Number(match[3]));
}

describe('PWA colours match the theme tokens', () => {
  const css = readFileSync(join(WEB, 'src', 'app', 'globals.css'), 'utf8');
  it.each([
    ['lightBackground', /:root\s*\{/, 'background'],
    ['lightSurface', /:root\s*\{/, 'surface'],
    ['darkBackground', /:root\.dark\s*\{/, 'background'],
    ['darkSurface', /:root\.dark\s*\{/, 'surface'],
  ] as const)('%s', (key, scope, name) => {
    expect(PWA_COLORS[key]).toBe(token(css, scope, name));
  });
});

describe('manifest', () => {
  const m = manifest();

  it('keeps its identity and opens on the Market Brief', () => {
    expect(m.id).toBe('/');
    expect(m.start_url?.startsWith('/today')).toBe(true);
    expect(m.scope).toBe('/');
    expect(m.display).toBe('standalone');
  });

  it('lists icons that exist, including a maskable one', () => {
    const icons = m.icons ?? [];
    for (const icon of icons) expect(existsSync(join(PUBLIC, icon.src))).toBe(true);
    expect(icons.some((icon) => icon.purpose === 'maskable')).toBe(true);
    expect(icons.some((icon) => icon.sizes === '512x512')).toBe(true);
  });

  it('has shortcuts only to real destinations', () => {
    const known = new Set<string>([...MOBILE_TABS.map((item) => item.href), '/ipos']);
    for (const shortcut of m.shortcuts ?? []) expect(known.has(shortcut.url)).toBe(true);
  });
});

describe('iOS launch screens', () => {
  it('exist for every listed device class, in both themes', () => {
    expect(IOS_SPLASH_SCREENS.length).toBeGreaterThan(0);
    for (const screen of IOS_SPLASH_SCREENS)
      expect(existsSync(join(PUBLIC, screen.url))).toBe(true);
  });

  it('have a static offline page', () => {
    expect(existsSync(join(PUBLIC, 'offline.html'))).toBe(true);
  });
});

describe('isIosDevice', () => {
  it.each([
    ['Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X)', 5, true],
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 5, true], // iPadOS
    ['Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 0, false], // a real Mac
    ['Mozilla/5.0 (Linux; Android 14; Pixel 8)', 5, false],
  ])('%s (%i touch points) → %s', (ua, touch, expected) => {
    expect(isIosDevice(ua, touch)).toBe(expected);
  });
});

describe('shouldOfferInstall', () => {
  const now = 1_800_000_000_000;
  const base = {
    standalone: false,
    installed: false,
    installable: true,
    visits: 2,
    dismissedAt: null,
    now,
  };

  it('offers from the second visit', () => {
    expect(shouldOfferInstall(base)).toBe(true);
    expect(shouldOfferInstall({ ...base, visits: 1 })).toBe(false);
  });

  it('never offers inside an installed app, after install, or where install is impossible', () => {
    expect(shouldOfferInstall({ ...base, standalone: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, installed: true })).toBe(false);
    expect(shouldOfferInstall({ ...base, installable: false })).toBe(false);
  });

  it('stays quiet for 30 days after "Not now"', () => {
    expect(shouldOfferInstall({ ...base, dismissedAt: now - INSTALL_SNOOZE_MS + 1 })).toBe(false);
    expect(shouldOfferInstall({ ...base, dismissedAt: now - INSTALL_SNOOZE_MS })).toBe(true);
  });
});
