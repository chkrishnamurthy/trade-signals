'use client';

import { UserMenu } from '@/components/auth/user-menu';
import { StockSearch } from '@/components/market/stock-search';
import { NoticesBell } from '@/components/portfolio/notices-bell';
import { HOME_HREF, LAB_GROUP, PRIMARY_NAV } from '@/lib/navigation';
import type { IndexStripState } from '@/lib/use-index-strip';
import type { LiveSourceState } from '@/lib/watchlist-types';
import { Brand } from './brand';
import { MarketStatusPill } from './market-status-pill';
import { NavItem } from './nav-item';
import { NavMenu } from './nav-menu';

/**
 * The top bar — one 56px row on every signed-in route, in the order every
 * broker app uses: brand · where you can go · find a stock · market state ·
 * notices · account.
 *
 * Breakpoints (`--nav-*` tokens in globals.css):
 * - < lg (1024): brand mark, search (fills), market pill from `md`, bell,
 *   account. The destinations move to the bottom tab bar (`MobileNav`).
 * - lg–xl: the six destinations join the bar; the market pill steps out (the
 *   indices strip right below still states the session) so nothing overflows.
 * - ≥ xl (1280): everything, with the pill. Wordmark from 2xl.
 *
 * Six destinations — five links and the "Markets" menu — fit from 1024px with
 * room for an admin's "Lab" menu; the old bar's ten names needed 1680px.
 */
export function Navbar({
  onSearchSelect,
  strip,
  isAdmin,
}: {
  onSearchSelect: (symbol: string) => void;
  /** The shared market snapshot — the same one the indices strip shows. */
  strip: { readonly state: IndexStripState; readonly liveState: LiveSourceState | null };
  isAdmin: boolean;
}) {
  return (
    <header className="sticky top-0 z-40 h-(--nav-bar-height) border-border border-b bg-surface/85 backdrop-blur supports-[backdrop-filter]:bg-surface/75">
      <div className="mx-auto flex h-full max-w-[1800px] items-center gap-3 px-4 sm:px-6 lg:gap-4">
        <Brand href={HOME_HREF} showWordmark={false} className="shrink-0 2xl:hidden" />
        <Brand href={HOME_HREF} className="hidden shrink-0 2xl:flex" />

        <nav aria-label="Primary" className="hidden h-full items-stretch lg:flex">
          <ul className="flex h-full items-stretch gap-0.5">
            {PRIMARY_NAV.map((entry) => (
              <li key={entry.kind === 'link' ? entry.item.id : entry.group.id} className="flex">
                {entry.kind === 'link' ? (
                  <NavItem item={entry.item} variant="bar" />
                ) : (
                  <NavMenu group={entry.group} />
                )}
              </li>
            ))}
            {isAdmin && (
              <li className="flex border-border border-l pl-1.5 ml-1">
                <NavMenu group={LAB_GROUP} badge="Admin" />
              </li>
            )}
          </ul>
        </nav>

        <div className="flex min-w-0 flex-1 items-center justify-end gap-2 sm:gap-3">
          <StockSearch
            onSelect={onSearchSelect}
            shortcut
            className="min-w-0 flex-1 sm:max-w-sm lg:w-44 lg:flex-none xl:w-64"
          />
          <MarketStatusPill
            state={strip.state}
            liveState={strip.liveState}
            className="hidden md:inline-flex lg:hidden xl:inline-flex"
          />
          <NoticesBell />
          <UserMenu />
        </div>
      </div>
    </header>
  );
}
