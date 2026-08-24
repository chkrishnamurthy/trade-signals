import Link from 'next/link';
import { cn } from '@/lib/utils';

/**
 * Product mark.
 *
 * A monogram and a wordmark, not a broker's logo. The app is broker-independent
 * and must never present itself as a Fyers client, so nothing here references
 * the data provider.
 */
export function Brand({
  showWordmark = true,
  className,
}: {
  showWordmark?: boolean | undefined;
  className?: string | undefined;
}) {
  return (
    <Link
      href="/dashboard"
      className={cn('flex items-center gap-2 rounded-md font-semibold tracking-tight', className)}
    >
      <span
        className="grid size-6 shrink-0 place-items-center rounded-md bg-primary text-xs text-primary-foreground"
        aria-hidden
      >
        W
      </span>
      {/* Inside the navigation rail this fades with the rest of the labels;
          everywhere else the attribute is inert. See `globals.css`. */}
      {showWordmark && (
        <span data-nav-label className="text-sm">
          WealthOS
        </span>
      )}
      <span className="sr-only">WealthOS — NSE market analysis, home</span>
    </Link>
  );
}
