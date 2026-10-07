'use client';

import { BellIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import * as React from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { NoticeDto, PortfolioNoticesDto } from '@/lib/portfolio-types';
import { cn } from '@/lib/utils';
import { noticeText } from './notice-text';
import { longDate } from './portfolio-client';
import { useUnreadNotices } from './portfolio-nav';

/** Kept in step with `NOTICES_READ_EVENT` in notices-view (not imported: that module is a page). */
const NOTICES_READ_EVENT = 'equitywise:notices-read';
/** How many notices the panel shows; the notices page has the rest. */
const PANEL_LIMIT = 6;

type Feed =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; notices: readonly NoticeDto[] }
  | { status: 'error' };

/**
 * Header bell for notices about the user's holdings, with a panel of the
 * latest ones.
 *
 * The button is always rendered, so the account control never jumps sideways
 * when a notice arrives; the count badge is what appears and disappears. The
 * accessible name carries the count, because the badge itself is decorative.
 * The badge is neutral (foreground on background), not red: in a market app
 * red already means "down", and a notice is not bad news by default.
 *
 * Opening the panel does NOT mark anything read — reading a title in a
 * dropdown is not the same as having dealt with it. "Mark all as read" and the
 * full notices page do that.
 */
export function NoticesBell({ className }: { className?: string | undefined }) {
  const unread = useUnreadNotices();
  const [open, setOpen] = React.useState(false);
  const [feed, setFeed] = React.useState<Feed>({ status: 'idle' });
  const [marking, setMarking] = React.useState(false);

  const load = React.useCallback(() => {
    setFeed({ status: 'loading' });
    fetch('/api/portfolio/notices')
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        return r.json() as Promise<PortfolioNoticesDto>;
      })
      .then((data) => setFeed({ status: 'ready', notices: data.notices }))
      .catch(() => setFeed({ status: 'error' }));
  }, []);

  React.useEffect(() => {
    if (open) load();
  }, [open, load]);

  const markAllRead = () => {
    setMarking(true);
    fetch('/api/portfolio/notices/read', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then((r) => {
        if (!r.ok) throw new Error(String(r.status));
        setFeed((current) =>
          current.status === 'ready'
            ? { status: 'ready', notices: current.notices.map((n) => ({ ...n, read: true })) }
            : current,
        );
        window.dispatchEvent(new Event(NOTICES_READ_EVENT));
      })
      .catch(() => undefined)
      .finally(() => setMarking(false));
  };

  const label =
    unread === 0
      ? 'Portfolio notices, none new'
      : `Portfolio notices, ${unread} new ${unread === 1 ? 'notice' : 'notices'}`;

  const latest =
    feed.status === 'ready'
      ? [...feed.notices]
          .sort((a, b) => Number(a.read) - Number(b.read) || b.createdAt.localeCompare(a.createdAt))
          .slice(0, PANEL_LIMIT)
      : [];
  const anyUnread = feed.status === 'ready' && feed.notices.some((n) => !n.read);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        aria-label={label}
        title="Portfolio notices"
        className={cn(
          'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
          'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
          className,
        )}
      >
        <BellIcon className="size-4" aria-hidden />
        {unread > 0 && (
          <span
            aria-hidden
            className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-foreground px-1 text-center font-semibold text-[10px] text-background tabular-nums leading-4"
          >
            {unread > 99 ? '99+' : unread}
          </span>
        )}
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={8}
        aria-label="Portfolio notices"
        className="flex w-[min(24rem,calc(100vw-1rem))] flex-col gap-0 p-0"
      >
        <div className="flex items-center justify-between gap-3 border-border border-b px-4 py-3">
          <h2 className="m-0 font-semibold text-sm">Notices</h2>
          {anyUnread && (
            <button
              type="button"
              onClick={markAllRead}
              disabled={marking}
              className="rounded-sm font-medium text-muted-foreground text-xs underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring disabled:opacity-60"
            >
              {marking ? 'Marking…' : 'Mark all as read'}
            </button>
          )}
        </div>

        <div
          className="max-h-[min(24rem,60vh)] overflow-y-auto"
          aria-live="polite"
          aria-busy={feed.status === 'loading'}
        >
          {(feed.status === 'loading' || feed.status === 'idle') && (
            <p className="m-0 px-4 py-6 text-center text-muted-foreground text-sm">Loading…</p>
          )}
          {feed.status === 'error' && (
            <div className="flex flex-col items-center gap-2 px-4 py-6 text-center text-sm">
              <p className="m-0 text-muted-foreground">Notices could not be loaded.</p>
              <button
                type="button"
                onClick={load}
                className="rounded-sm font-semibold text-foreground underline underline-offset-2 outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
              >
                Try again
              </button>
            </div>
          )}
          {feed.status === 'ready' && latest.length === 0 && (
            <p className="m-0 px-4 py-6 text-center text-muted-foreground text-sm">
              No notices yet. Each weekday evening the stocks you hold are checked for anything
              coming up or a large move.
            </p>
          )}
          {latest.length > 0 && (
            <ul className="m-0 list-none divide-y divide-border p-0">
              {latest.map((n) => {
                const t = noticeText(n);
                return (
                  <li key={n.id} className="flex gap-3 px-4 py-3">
                    <span
                      aria-hidden
                      className={cn(
                        'mt-1.5 size-2 shrink-0 rounded-full',
                        n.read ? 'bg-transparent' : 'bg-primary',
                      )}
                    />
                    <div className="min-w-0 flex-1">
                      <p className={cn('m-0 text-sm', n.read ? 'font-medium' : 'font-semibold')}>
                        {!n.read && <span className="sr-only">New: </span>}
                        {t.title}
                      </p>
                      <p className="m-0 mt-0.5 line-clamp-2 text-muted-foreground text-sm">
                        {t.body}
                      </p>
                      <p className="m-0 mt-1 flex flex-wrap gap-x-3 text-muted-foreground text-xs">
                        <span>{longDate(n.createdAt.slice(0, 10))}</span>
                        {t.symbol !== null && (
                          <Link
                            href={`/portfolio/${encodeURIComponent(t.symbol)}` as Route}
                            onClick={() => setOpen(false)}
                            className="rounded-sm underline-offset-2 outline-none hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                          >
                            Your {t.symbol} holding
                          </Link>
                        )}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-border border-t px-4 py-2.5">
          <Link
            href={'/portfolio/notices' as Route}
            onClick={() => setOpen(false)}
            className="rounded-sm font-semibold text-foreground text-sm underline-offset-2 outline-none hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
          >
            See all notices and settings
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
}
