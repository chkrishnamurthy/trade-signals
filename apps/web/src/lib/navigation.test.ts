import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  allReadyItems,
  DRAWER_SECTIONS,
  HELP_LINKS,
  isGroupActive,
  isItemActive,
  LAB_GROUP,
  MARKETS_GROUP,
  MOBILE_TABS,
  PRIMARY_NAV,
} from './navigation';

const APP_DIR = join(__dirname, '..', 'app');

/** Whether a static route has a page file (route groups like `(auth)` are not used by nav routes). */
function routeExists(href: string): boolean {
  return existsSync(join(APP_DIR, href, 'page.tsx'));
}

describe('navigation model', () => {
  it('links only to routes that exist', () => {
    for (const item of [...allReadyItems(true), ...HELP_LINKS]) {
      expect(routeExists(item.href), item.href).toBe(true);
    }
  });

  it('keeps the primary bar to six entries or fewer', () => {
    expect(PRIMARY_NAV.length).toBeLessThanOrEqual(6);
  });

  it('gives each destination a unique id and href', () => {
    const items = [...allReadyItems(true), ...HELP_LINKS];
    expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
    expect(new Set(items.map((item) => item.href)).size).toBe(items.length);
  });

  it('reaches every user destination on mobile, through a tab or the drawer', () => {
    const mobile = new Set([
      ...MOBILE_TABS.map((item) => item.id),
      ...DRAWER_SECTIONS.flatMap((group) => group.items.map((item) => item.id)),
    ]);
    for (const item of allReadyItems(false)) expect(mobile.has(item.id), item.id).toBe(true);
  });

  it('keeps admin-only destinations out of the user arrangement', () => {
    const user = new Set(allReadyItems(false).map((item) => item.href));
    for (const href of ['/intraday', '/paper-trading', '/admin'])
      expect(user.has(href)).toBe(false);
  });
});

describe('active matching', () => {
  const find = (id: string) => {
    const item = allReadyItems(true).find((candidate) => candidate.id === id);
    if (item === undefined) throw new Error(`no item ${id}`);
    return item;
  };

  it('matches the route and anything beneath it', () => {
    expect(isItemActive(find('portfolio'), '/portfolio')).toBe(true);
    expect(isItemActive(find('portfolio'), '/portfolio/analysis')).toBe(true);
  });

  it('does not match a route that merely shares a prefix', () => {
    expect(isItemActive(find('ipos'), '/iposx')).toBe(false);
    expect(isItemActive(find('admin'), '/administrator')).toBe(false);
  });

  it('lights Screener on a stock page', () => {
    expect(isItemActive(find('screener'), '/stocks/reliance')).toBe(true);
  });

  it('lights the Markets menu for a page inside it', () => {
    expect(isGroupActive(MARKETS_GROUP, '/ipos/calendar')).toBe(true);
    expect(isGroupActive(MARKETS_GROUP, '/watchlists')).toBe(false);
  });

  it('never marks a planned item active', () => {
    const planned = LAB_GROUP.items.find((item) => item.status === 'planned');
    expect(planned).toBeDefined();
    if (planned !== undefined) expect(isItemActive(planned, '/backtests')).toBe(false);
  });
});
