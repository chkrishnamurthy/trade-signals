import Link from 'next/link';
import { HELP_LINKS } from '@/lib/navigation';
import { cn } from '@/lib/utils';

/**
 * The signed-in footer: the product's position and where its numbers come
 * from, on every page, in the same place.
 *
 * Before this, "not investment advice" appeared on nine pages and was missing
 * from Portfolio, Alerts, Calendar and IPOs, and no signed-in page linked to
 * the disclaimer, methodology or data sources at all. One quiet line, once,
 * fixes all of it — trust signals work because they are always where you
 * expect them, not because they are loud.
 */
export function AppFooter({ className }: { className?: string | undefined }) {
  return (
    <footer
      className={cn(
        'border-border border-t bg-background text-muted-foreground text-xs',
        className,
      )}
    >
      <div className="mx-auto flex max-w-[1800px] flex-col gap-2 px-4 py-4 sm:px-6 md:flex-row md:items-center md:justify-between">
        <p>
          <span className="font-medium text-foreground">
            EquityWise is a research tool, not investment advice.
          </span>{' '}
          Prices can be delayed — the market status above shows how fresh they are.
        </p>
        <nav aria-label="Help and legal">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {HELP_LINKS.map((link) => (
              <li key={link.id}>
                <Link
                  href={link.href}
                  className="rounded-sm underline-offset-4 transition-colors hover:text-foreground hover:underline focus-visible:outline-2 focus-visible:outline-ring"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
