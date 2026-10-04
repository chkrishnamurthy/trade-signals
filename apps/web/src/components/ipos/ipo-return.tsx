'use client';

import { ArrowLeftIcon } from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import type * as React from 'react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/**
 * Where an IPO page's back button goes.
 *
 * The Overview and the master table record their own address (filters, year
 * and page included) as the user reads them; an issue page reads it back so
 * "Back" returns to the exact list the user left, not a reset one. Kept in
 * `sessionStorage` so it is per-tab and gone with the tab.
 */
const KEY = 'equitywise:ipo-return';

/** Only the IPO section's own pages are places to return to, never an issue page. */
const RETURNABLE = /^\/ipos(\/(all|calendar|listings|gmp|pipeline))?(\?|$)/;

interface Stored {
  readonly href: string;
  readonly label: string;
  /** `history.length` while the list was showing: one more on the issue page means it is the previous entry. */
  readonly depth: number;
}

function read(): Stored | null {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (raw === null) return null;
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const { href, label, depth } = value as Record<string, unknown>;
    if (typeof href !== 'string' || !RETURNABLE.test(href)) return null;
    if (typeof label !== 'string' || label === '' || typeof depth !== 'number') return null;
    return { href, label, depth };
  } catch {
    return null;
  }
}

/** Rendered by the Overview and the master table: remembers this page as the way back. */
export function RememberIpoReturn({ label }: { label: string }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  useEffect(() => {
    const href = search === '' ? pathname : `${pathname}?${search}`;
    try {
      window.sessionStorage.setItem(
        KEY,
        JSON.stringify({ href, label, depth: window.history.length } satisfies Stored),
      );
    } catch {
      // Storage blocked: the issue page falls back to its board's list.
    }
  }, [pathname, search, label]);
  return null;
}

/**
 * Back from an issue to the page the user came from, or to the master table
 * when they arrived some other way (a shared link, a new tab). When that
 * list is the browser's previous entry it goes back through history, so the
 * list comes back scrolled where the user left it.
 */
export function IpoBackLink({
  fallbackHref,
  fallbackLabel,
  className,
}: {
  fallbackHref: Route;
  fallbackLabel: string;
  className?: string | undefined;
}) {
  const router = useRouter();
  const [target, setTarget] = useState<{ href: string; label: string; viaHistory: boolean }>({
    href: fallbackHref,
    label: fallbackLabel,
    viaHistory: false,
  });

  useEffect(() => {
    const stored = read();
    if (stored === null) return;
    setTarget({
      href: stored.href,
      label: stored.label,
      viaHistory: window.history.length === stored.depth + 1,
    });
  }, []);

  function onClick(event: React.MouseEvent<HTMLAnchorElement>) {
    // A modified click opens a new tab: let the link do that.
    if (!target.viaHistory || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
      return;
    event.preventDefault();
    router.back();
  }

  return (
    <Button
      asChild
      variant="ghost"
      className={cn(
        '-ml-2.5 h-9 self-start text-muted-foreground hover:text-foreground sm:h-8',
        className,
      )}
    >
      <Link href={target.href as Route} onClick={onClick}>
        <ArrowLeftIcon aria-hidden />
        Back to {target.label}
      </Link>
    </Button>
  );
}
