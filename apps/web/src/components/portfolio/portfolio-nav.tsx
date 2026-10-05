'use client';

import type { Route } from 'next';
import Link from 'next/link';
import * as React from 'react';
import { cn } from '@/lib/utils';

/** The unread notices count, refreshed when the notices page marks them read. */
export function useUnreadNotices(): number {
  const [unread, setUnread] = React.useState(0);
  React.useEffect(() => {
    let cancelled = false;
    const load = () =>
      fetch('/api/portfolio/notices/count')
        .then((r) => (r.ok ? (r.json() as Promise<{ unread: number }>) : { unread: 0 }))
        .then((d) => {
          if (!cancelled) setUnread(d.unread);
        })
        .catch(() => undefined);
    void load();
    window.addEventListener('equitywise:notices-read', load);
    return () => {
      cancelled = true;
      window.removeEventListener('equitywise:notices-read', load);
    };
  }, []);
  return unread;
}

/** Overview / Analysis / Notices switch shared by the portfolio pages. */
export function PortfolioNav({ current }: { current: 'overview' | 'analysis' | 'notices' }) {
  const unread = useUnreadNotices();
  const items = [
    { key: 'overview', href: '/portfolio', label: 'Overview' },
    { key: 'analysis', href: '/portfolio/analysis', label: 'Analysis' },
    { key: 'notices', href: '/portfolio/notices', label: 'Notices' },
  ] as const;
  return (
    <nav aria-label="Portfolio sections" className="flex gap-1">
      {items.map((item) => (
        <Link
          key={item.key}
          href={item.href as Route}
          aria-current={current === item.key ? 'page' : undefined}
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring',
            current === item.key
              ? 'bg-primary/10 font-semibold text-primary'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground',
          )}
        >
          {item.label}
          {item.key === 'notices' && unread > 0 && current !== 'notices' && (
            <span className="rounded-full bg-primary px-1.5 text-xs font-semibold tabular-nums text-primary-foreground">
              {unread}
              <span className="sr-only"> new</span>
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
