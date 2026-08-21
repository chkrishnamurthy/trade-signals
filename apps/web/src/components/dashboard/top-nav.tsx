'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MarketStatusBadge } from '@/components/market-status-badge';
import type { MarketStatusCode } from '@/lib/market-types';
import { StockSearch } from './search';

const LINKS = [
  { href: '/dashboard', label: 'Dashboard' },
  { href: '/nifty50', label: 'NIFTY 50' },
] as const;

/** Sections that exist only as routes-to-be; shown disabled rather than dead. */
const PLANNED = ['Markets', 'Watchlist', 'Screener', 'Signals', 'Portfolio', 'Alerts'] as const;

export function TopNav({
  status,
  isOpen,
  lastUpdated,
  onSelectSymbol,
}: {
  status: MarketStatusCode;
  isOpen: boolean;
  lastUpdated: string;
  onSelectSymbol: (symbol: string) => void;
}) {
  const pathname = usePathname();

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/90 backdrop-blur dark:border-slate-800 dark:bg-slate-950/90">
      <div className="mx-auto flex max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 sm:px-6">
        <Link href="/dashboard" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="grid size-6 place-items-center rounded bg-slate-900 text-xs text-white dark:bg-slate-100 dark:text-slate-900">
            S
          </span>
          <span className="hidden sm:inline">Signal</span>
        </Link>

        <nav aria-label="Primary" className="flex items-center gap-1 overflow-x-auto">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={pathname === link.href ? 'page' : undefined}
              className={`whitespace-nowrap rounded px-2 py-1 text-sm ${
                pathname === link.href
                  ? 'bg-slate-100 font-medium text-slate-900 dark:bg-slate-800 dark:text-white'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
              }`}
            >
              {link.label}
            </Link>
          ))}
          {PLANNED.map((label) => (
            <span
              key={label}
              title="Not built yet"
              className="hidden cursor-not-allowed whitespace-nowrap px-2 py-1 text-sm text-slate-300 lg:inline dark:text-slate-600"
            >
              {label}
            </span>
          ))}
        </nav>

        <div className="ml-auto flex flex-1 items-center justify-end gap-3">
          <StockSearch onSelect={onSelectSymbol} />
          <div className="hidden items-center gap-2 sm:flex">
            <MarketStatusBadge status={status} isOpen={isOpen} />
            <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-slate-400">
              {lastUpdated}
            </span>
          </div>
        </div>
      </div>
    </header>
  );
}
