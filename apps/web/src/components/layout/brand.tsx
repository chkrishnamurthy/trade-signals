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
        S
      </span>
      {showWordmark && <span className="text-sm">Signal</span>}
      <span className="sr-only">Signal — NSE market analysis, home</span>
    </Link>
  );
}
