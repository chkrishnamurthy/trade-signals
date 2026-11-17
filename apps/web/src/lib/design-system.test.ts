import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Design-system guard.
 *
 * The rules in `docs/design-system/contributing.md` that a grep can check, run
 * as a test so a pull request that breaks one fails CI instead of drifting in.
 * Each rule names the shared thing to use instead. An allowlist entry is a
 * deliberate exception and says why; it is not a place to park new violations.
 *
 * It reads source text, not rendered output: it catches the pattern, not every
 * way to write it. Storybook's viewport stories cover what a grep cannot.
 */
const SRC = fileURLToPath(new URL('..', import.meta.url));

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    if (!entry.name.endsWith('.tsx')) return [];
    if (entry.name.endsWith('.stories.tsx')) return [];
    return [path];
  });
}

const FILES = [...sourceFiles(join(SRC, 'components')), ...sourceFiles(join(SRC, 'app'))].map(
  (path) => ({
    /** Path from `src`, with forward slashes on every platform. */
    name: relative(SRC, path).split(sep).join('/'),
    text: readFileSync(path, 'utf8'),
  }),
);

/** Files in which `pattern` occurs, minus the allowlist. */
function offenders(pattern: RegExp, allow: readonly string[] = []): string[] {
  return FILES.filter((file) => !allow.includes(file.name) && pattern.test(file.text)).map(
    (file) => file.name,
  );
}

describe('design-system guard', () => {
  it('finds the source tree', () => {
    expect(FILES.length).toBeGreaterThan(100);
  });

  it('names no raw colour in a class — colours are tokens in globals.css', () => {
    expect(offenders(/-\[(#[0-9a-fA-F]{3,8}|oklch\(|rgba?\(|hsla?\()/)).toEqual([]);
  });

  it('picks no arbitrary font size — use the type scale (text-2xs / text-3xs below text-xs)', () => {
    expect(
      // `em` sizes are relative to their parent (a glyph beside a figure) and stay.
      offenders(/\btext-\[[0-9.]+(px|rem)\]/, [
        // Marketing pages set display type outside the app's data scale.
        'components/landing/sections.tsx',
        'components/layout/public-page.tsx',
      ]),
    ).toEqual([]);
  });

  it('opens panels with AdaptivePopover, so they become a sheet on phones', () => {
    expect(
      offenders(/from '@\/components\/ui\/popover'/, [
        'components/ui/adaptive-popover.tsx',
        // A one-line info card that only exists from `md` up.
        'components/layout/market-status-pill.tsx',
        // The search results list is anchored to its input at every width.
        'components/market/stock-search.tsx',
        // A column-header hint, desktop table only.
        'components/ipos/list/ipo-board-table.tsx',
      ]),
    ).toEqual([]);
  });

  it('has no fly-out sub-menu a phone cannot use — list entries flat', () => {
    expect(
      offenders(/DropdownMenuSub\b/, [
        'components/ui/dropdown-menu.tsx',
        // Switches to a flat list below `sm` (useIsPhone).
        'components/watchlists/watchlist-row-menu.tsx',
      ]),
    ).toEqual([]);
  });

  it('builds one-of-a-few switches with SegmentedControl, not aria-pressed buttons in a track', () => {
    // The hand-built form: a track element holding buttons that carry the
    // selected style themselves.
    expect(
      offenders(/aria-pressed=\{[^}]+\}[\s\S]{0,400}?bg-surface text-foreground shadow-subtle/, [
        'components/ui/toggle-group.tsx',
      ]),
    ).toEqual([]);
  });

  it('does not pin a control to a mouse-only height — sizes come from --control-* tokens', () => {
    // An opening tag of a control whose own classes fix its height or size.
    const pinned =
      /<(?:button|input|select|Button|Input|SelectTrigger)\b(?:(?!\/?>)[\s\S]){0,600}?className=(?:"|\{cn\(\s*')[^"']*\b(?:h-7|h-8|h-9|size-7|size-8|size-9)\b/;
    expect(
      offenders(pinned, [
        // The drag grip is a pointer-only affordance; the row menu moves rows on touch.
        'components/watchlists/watchlist-table.tsx',
      ]),
    ).toEqual([]);
  });
});
