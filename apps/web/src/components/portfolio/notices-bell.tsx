'use client';

import { BellIcon, ChevronRightIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import * as React from 'react';
import {
  AdaptivePopover,
  PanelBody,
  PanelFooter,
  PanelHeader,
  PanelItem,
  PanelMessage,
} from '@/components/ui/adaptive-popover';
import { Button } from '@/components/ui/button';
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
 * The panel is an `AdaptivePopover`: anchored under the bell on wide screens,
 * a bottom sheet on phones.
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
    <AdaptivePopover
      open={open}
      onOpenChange={setOpen}
      title="Portfolio notices"
      trigger={
        <button
          type="button"
          aria-label={label}
          title="Portfolio notices"
          className={cn(
            'relative inline-flex size-(--control-md) shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground data-[state=open]:bg-accent data-[state=open]:text-foreground',
            'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring',
            className,
          )}
        >
          <BellIcon className="size-4 pointer-coarse:size-5" aria-hidden />
          {unread > 0 && (
            <span
              aria-hidden
              className="absolute -top-0.5 -right-0.5 min-w-4 rounded-full bg-foreground px-1 text-center font-semibold text-3xs text-background tabular-nums leading-4 pointer-coarse:top-0.5 pointer-coarse:right-0.5"
            >
              {unread > 99 ? '99+' : unread}
            </span>
          )}
        </button>
      }
    >
      <PanelHeader
        title="Notices"
        action={
          anyUnread && (
            <Button variant="link" size="sm" onClick={markAllRead} disabled={marking}>
              {marking ? 'Marking…' : 'Mark all as read'}
            </Button>
          )
        }
      />

      <PanelBody aria-live="polite" aria-busy={feed.status === 'loading'}>
        {(feed.status === 'loading' || feed.status === 'idle') && (
          <PanelMessage>Loading…</PanelMessage>
        )}
        {feed.status === 'error' && (
          <div className="flex flex-col items-center gap-1 px-4 py-6 text-center text-sm">
            <p className="m-0 text-muted-foreground">Notices could not be loaded.</p>
            <Button variant="link" size="sm" onClick={load}>
              Try again
            </Button>
          </div>
        )}
        {feed.status === 'ready' && latest.length === 0 && (
          <PanelMessage>
            No notices yet. Each weekday evening the stocks you hold are checked for anything coming
            up or a large move.
          </PanelMessage>
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
      </PanelBody>

      <PanelFooter>
        <PanelItem asChild className="justify-between font-semibold">
          <Link href={'/portfolio/notices' as Route} onClick={() => setOpen(false)}>
            See all notices and settings
            <ChevronRightIcon className="size-4 text-subtle-foreground" aria-hidden />
          </Link>
        </PanelItem>
      </PanelFooter>
    </AdaptivePopover>
  );
}
