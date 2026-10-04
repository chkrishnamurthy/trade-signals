import type { IpoBoard } from '@equitywise/shared';
import type { Route } from 'next';
import Link from 'next/link';
import { BOARD_LABEL } from '@/lib/ipo-format';
import { cn } from '@/lib/utils';

const BOARDS: readonly IpoBoard[] = ['mainboard', 'sme'];

/**
 * Mainboard / SME. Links, not buttons: each board is its own address, so a
 * board view can be bookmarked and the back button returns to the last one.
 * Full width with 40px targets on a phone; a compact pill from `sm` up.
 */
export function BoardTabs({
  active,
  hrefs,
  className,
}: {
  active: IpoBoard;
  hrefs: Readonly<Record<IpoBoard, Route>>;
  className?: string | undefined;
}) {
  return (
    <nav
      aria-label="Board"
      className={cn(
        'grid w-full grid-cols-2 gap-0.5 rounded-lg border border-border bg-surface p-[3px] sm:inline-grid sm:w-auto',
        className,
      )}
    >
      {BOARDS.map((board) => {
        const on = board === active;
        return (
          <Link
            key={board}
            href={hrefs[board]}
            aria-current={on ? 'page' : undefined}
            scroll={false}
            className={cn(
              'inline-flex h-10 items-center justify-center rounded-md px-4 font-medium text-sm transition-colors sm:h-8',
              on
                ? 'bg-foreground text-background'
                : 'text-muted-foreground hover:bg-accent hover:text-foreground',
            )}
          >
            {BOARD_LABEL[board]}
          </Link>
        );
      })}
    </nav>
  );
}
