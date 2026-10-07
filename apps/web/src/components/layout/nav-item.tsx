'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { isItemActive, type NavItem as NavItemModel } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * One destination, in one of three placements.
 *
 * - `bar`    — the desktop top bar. Label only; active = full-strength text plus
 *              a 2px primary underline on the bar's bottom edge (Kite/TradingView).
 * - `drawer` — a row in the "More" drawer. Icon + label + one-line description;
 *              active = accent fill plus a 3px primary bar on the leading edge.
 * - `tab`    — the mobile bottom tab bar. Icon over a short label; active =
 *              primary icon, full-strength label, 2px primary bar on top.
 *
 * Active is NEVER colour on its own (WCAG 1.4.1): every placement adds a shape
 * — the underline or bar — and weight, and the link carries
 * `aria-current="page"` so a screen reader announces it.
 *
 * The active label is `foreground`, not `primary`: primary text on its own 10%
 * tint measured 3.5:1 in the light theme, below the 4.5:1 AA minimum. The
 * brand colour now lives on the indicator (≥3:1 against the bar, which is all a
 * non-text mark needs).
 */
export type NavItemVariant = 'bar' | 'drawer' | 'tab';

const FOCUS =
  'outline-none focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-offset-2 focus-visible:outline-ring';

export function NavItem({
  item,
  variant,
  onNavigate,
  className,
}: {
  item: NavItemModel;
  variant: NavItemVariant;
  /** Called after the link is followed — closes the drawer it sits in. */
  onNavigate?: (() => void) | undefined;
  className?: string | undefined;
}) {
  const pathname = usePathname();
  const Icon = item.icon;

  if (item.status === 'planned') {
    // Visible so the product's shape is honest; not a link, so nothing is dead.
    return (
      <span
        aria-disabled="true"
        className={cn(
          'flex cursor-not-allowed items-center gap-3 rounded-md px-3 py-2.5 text-muted-foreground opacity-70',
          className,
        )}
      >
        <Icon className="size-4 shrink-0" aria-hidden />
        <span className="min-w-0 flex-1 truncate text-sm">{item.label}</span>
        <span className="rounded-sm border border-border px-1.5 text-3xs uppercase tracking-wide">
          Soon
        </span>
      </span>
    );
  }

  const active = isItemActive(item, pathname);
  const shared = {
    href: item.href,
    'aria-current': active ? ('page' as const) : undefined,
    ...(onNavigate === undefined ? {} : { onClick: onNavigate }),
  };

  if (variant === 'bar') {
    return (
      <Link
        {...shared}
        title={item.description}
        className={cn(
          FOCUS,
          'group relative flex h-full items-center rounded-md px-0.5 text-sm whitespace-nowrap',
          // The underline sits on the bar's bottom border, so it reads as the
          // tab being "attached" to the page beneath it.
          active &&
            'after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-primary',
          className,
        )}
      >
        <span
          className={cn(
            'rounded-md px-2.5 py-1.5 transition-colors',
            active
              ? 'font-semibold text-foreground'
              : 'font-medium text-muted-foreground group-hover:bg-accent/60 group-hover:text-foreground',
          )}
        >
          {item.label}
        </span>
      </Link>
    );
  }

  if (variant === 'tab') {
    return (
      <Link
        {...shared}
        className={cn(
          FOCUS,
          'relative flex min-h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 text-2xs transition-colors',
          active
            ? 'font-semibold text-foreground before:absolute before:inset-x-4 before:top-0 before:h-0.5 before:rounded-full before:bg-primary'
            : 'font-medium text-muted-foreground hover:text-foreground',
          className,
        )}
      >
        <Icon className={cn('size-5 shrink-0', active && 'text-primary')} aria-hidden />
        <span className="max-w-full truncate">{item.shortLabel ?? item.label}</span>
      </Link>
    );
  }

  return (
    <Link
      {...shared}
      className={cn(
        FOCUS,
        'relative flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors',
        active
          ? 'bg-accent text-foreground before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-primary'
          : 'text-muted-foreground hover:bg-accent/60 hover:text-foreground',
        className,
      )}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', active && 'text-primary')} aria-hidden />
      <span className="flex min-w-0 flex-col">
        <span className={cn('text-sm', active ? 'font-semibold' : 'font-medium text-foreground')}>
          {item.label}
        </span>
        <span className="text-muted-foreground text-xs">{item.description}</span>
      </span>
    </Link>
  );
}
