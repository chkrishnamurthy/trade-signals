'use client';

import { BellIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { useUnreadNotices } from './portfolio-nav';

/**
 * Header bell for notices about the user's holdings.
 *
 * Always rendered, so the account control never jumps sideways when a notice
 * arrives or is read; the count badge is what appears and disappears. The
 * accessible name carries the count, because the badge itself is decorative.
 * The badge is neutral (foreground on background), not red: in a market app
 * red already means "down", and a notice is not bad news by default.
 */
export function NoticesBell({ className }: { className?: string | undefined }) {
  const unread = useUnreadNotices();
  const label =
    unread === 0
      ? 'Portfolio notices, none new'
      : `Portfolio notices, ${unread} new ${unread === 1 ? 'notice' : 'notices'}`;
  return (
    <Link
      href={'/portfolio/notices' as Route}
      aria-label={label}
      title="Portfolio notices"
      className={cn(
        'relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground',
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
    </Link>
  );
}
