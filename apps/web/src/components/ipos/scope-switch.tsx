import type { Route } from 'next';
import Link from 'next/link';
import { BOARD_SCOPE_LABEL, IPO_SCOPES, type IpoScope } from '@/lib/ipo-routes';
import { cn } from '@/lib/utils';

/**
 * All boards / Mainboard / SME. Links, not buttons: each scope is its own
 * address, so a view can be bookmarked and the back button returns to the
 * last one. Every IPO page shows it in the same place and every tab carries
 * the choice. Full width with 40px targets on a phone; a compact pill from
 * `sm` up.
 */
export function ScopeSwitch({
  active,
  hrefs,
  className,
}: {
  active: IpoScope;
  hrefs: Readonly<Record<IpoScope, Route>>;
  className?: string | undefined;
}) {
  return (
    <nav
      aria-label="Board"
      className={cn(
        'grid w-full grid-cols-3 gap-0.5 rounded-lg border border-border bg-surface p-[3px] sm:inline-grid sm:w-auto',
        className,
      )}
    >
      {IPO_SCOPES.map((scope) => {
        const on = scope === active;
        return (
          <Link
            key={scope}
            href={hrefs[scope]}
            aria-current={on ? 'page' : undefined}
            scroll={false}
            className={cn(
              'inline-flex h-10 items-center justify-center whitespace-nowrap rounded-md px-3 font-medium text-sm transition-colors sm:h-8 sm:px-4',
              on
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {BOARD_SCOPE_LABEL[scope]}
          </Link>
        );
      })}
    </nav>
  );
}
