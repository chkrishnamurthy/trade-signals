'use client';

import { BellIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { useUnreadNotices } from './portfolio-nav';

/**
 * Header bell for new notices about the user's holdings. Shown only when there
 * is something new, so the header stays as it was otherwise (and on phones).
 */
export function NoticesBell() {
  const unread = useUnreadNotices();
  if (unread === 0) return null;
  return (
    <Link
      href={'/portfolio/notices' as Route}
      aria-label={`${unread} new ${unread === 1 ? 'notice' : 'notices'} about your holdings`}
      className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring"
    >
      <BellIcon className="size-4" aria-hidden />
      <span
        aria-hidden
        className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-primary px-1 text-center text-[10px] font-semibold leading-4 tabular-nums text-primary-foreground"
      >
        {unread > 99 ? '99+' : unread}
      </span>
    </Link>
  );
}
