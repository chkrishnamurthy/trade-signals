import Image from 'next/image';
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
      href="/watchlists"
      className={cn('flex items-center gap-2 rounded-md font-semibold tracking-tight', className)}
    >
      {/* The tile carries its own corner radius in the alpha channel, so it
          needs no rounding here. `priority` because it sits in the header of
          every route and would otherwise pop in after first paint. */}
      <Image
        src="/brand-mark.png"
        alt=""
        width={28}
        height={28}
        priority
        className="size-7 shrink-0"
        aria-hidden
      />
      {/* Inside the navigation rail this fades with the rest of the labels;
          everywhere else the attribute is inert. See `globals.css`. */}
      {showWordmark && (
        <span data-nav-label className="text-base">
          EquityWise
        </span>
      )}
      <span className="sr-only">EquityWise — NSE market analysis, home</span>
    </Link>
  );
}
