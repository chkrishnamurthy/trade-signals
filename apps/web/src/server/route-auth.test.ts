import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Every API route must authenticate itself.
 *
 * The Edge middleware only checks that a session cookie is present, so a
 * made-up cookie passes it. A route that spends provider budget or returns data
 * and does not run the real check (`getSessionUser` and friends) is open to
 * anyone. This test walks every `route.ts` — and the `@/server/*` modules it
 * imports, since most routes delegate — and fails if none of them references a
 * guard. It is a floor, not a proof: it cannot tell that a guard covers every
 * branch, only that the route has one at all.
 */

const SRC = resolve(import.meta.dirname, '..');
const API = join(SRC, 'app', 'api');
const APP = join(SRC, 'app');

/** Public on purpose. Adding to this list needs a reason. */
const PUBLIC_BY_DESIGN: Record<string, string> = {
  'search/route.ts': 'symbol lookup for signed-out visitors; rate-limited by IP instead',
  'avatars/[file]/route.ts': 'immutable, random-named image files',
};
const PUBLIC_PREFIXES = ['auth/'];

const GUARD =
  /\b(getSessionUser|getAdminUser|getSessionAuthContext|requireOwnerId|requireSignedIn|requireAdminAccess|requireAdminUser|requireAdminPage)\b|\bauthenticated\(/;

function routeFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return routeFiles(path);
    return name === 'route.ts' ? [path] : [];
  });
}

function resolveImport(from: string, spec: string): string | null {
  const base = spec.startsWith('@/') ? join(SRC, spec.slice(2)) : resolve(dirname(from), spec);
  for (const candidate of [
    `${base}.ts`,
    `${base}.tsx`,
    join(base, 'index.ts'),
    join(base, 'index.tsx'),
  ]) {
    try {
      if (statSync(candidate).isFile()) return candidate;
    } catch {
      // not this one
    }
  }
  return null;
}

function guarded(file: string, seen = new Set<string>(), depth = 0): boolean {
  if (seen.has(file) || depth > 2) return false;
  seen.add(file);
  const source = readFileSync(file, 'utf8');
  if (GUARD.test(source)) return true;
  const imports = [...source.matchAll(/from '((?:@\/server|@\/components|\.\.?)\/[^']+)'/g)];
  return imports.some((match) => {
    const target = resolveImport(file, match[1] ?? '');
    // Importing the guard module is not the same as calling a guard: its own
    // source names every guard, so following it would pass every route.
    if (target === null || target.startsWith(join(SRC, 'server', 'auth'))) return false;
    return guarded(target, seen, depth + 1);
  });
}

describe('API route authentication', () => {
  const routes = routeFiles(API).map((file) => ({
    file,
    rel: relative(API, file).split('\\').join('/'),
  }));

  it('finds the routes', () => {
    expect(routes.length).toBeGreaterThan(20);
  });

  for (const { file, rel } of routes) {
    if (PUBLIC_PREFIXES.some((prefix) => rel.startsWith(prefix))) continue;
    if (rel in PUBLIC_BY_DESIGN) continue;
    it(`${rel} authenticates`, () => {
      expect(guarded(file)).toBe(true);
    });
  }
});

describe('non-API route handler authentication', () => {
  const routes = routeFiles(APP)
    .map((file) => ({ file, rel: relative(APP, file).split('\\').join('/') }))
    .filter((route) => !route.rel.startsWith('api/'));

  it('covers the provider OAuth callback', () => {
    expect(routes.map((route) => route.rel)).toContain('callback/route.ts');
  });

  for (const { file, rel } of routes) {
    it(`${rel} authenticates`, () => {
      expect(guarded(file)).toBe(true);
    });
  }
});

describe('server-data page authentication', () => {
  const protectedPages = [
    'admin/page.tsx',
    'admin/ipos/page.tsx',
    'admin/paper/page.tsx',
    'alerts/page.tsx',
    'announcements/page.tsx',
    'calendar/page.tsx',
    'flows/page.tsx',
    'intraday/page.tsx',
    'ipos/page.tsx',
    'ipos/[slug]/page.tsx',
    'ipos/all/page.tsx',
    'ipos/calendar/page.tsx',
    'ipos/gmp/page.tsx',
    'ipos/listings/page.tsx',
    'ipos/pipeline/page.tsx',
    'markets/breadth/page.tsx',
    'paper-trading/page.tsx',
    'profile/page.tsx',
    'screener/page.tsx',
    'stocks/[symbol]/page.tsx',
    'today/page.tsx',
  ] as const;

  for (const rel of protectedPages) {
    it(`${rel} authenticates`, () => {
      expect(guarded(join(APP, rel))).toBe(true);
    });
  }
});
