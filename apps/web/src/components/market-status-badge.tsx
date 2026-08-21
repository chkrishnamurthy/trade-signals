import type { KnownMarketStatus, MarketStatusCode } from '@/lib/market-types';

const LABELS: Record<KnownMarketStatus, string> = {
  OPEN: 'Open',
  PREOPEN: 'Pre-open',
  CLOSE: 'Closed',
  POSTCLOSE_START: 'Post-close',
  CTS_CLOSE: 'Closing session',
  CAS_START: 'Closing auction',
  CAS_MKT_ORD_RESTRICT: 'Auction — orders restricted',
  CAS_END: 'Auction ended',
  POSTCLOSE_CLOSED: 'Closed',
  UNKNOWN: 'Status unknown',
};

/** `POSTCLOSE_CLOSED` -> `Postclose closed`, for statuses the docs never listed. */
function humanise(status: string): string {
  const words = status.toLowerCase().replace(/_/g, ' ').trim();
  return words === '' ? 'Status unknown' : words.charAt(0).toUpperCase() + words.slice(1);
}

export function MarketStatusBadge({
  status,
  isOpen,
}: {
  status: MarketStatusCode;
  isOpen: boolean;
}) {
  const tone = isOpen
    ? 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30'
    : status === 'PREOPEN'
      ? 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30'
      : 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${tone}`}
    >
      <span
        className={`size-1.5 rounded-full ${isOpen ? 'bg-emerald-500' : 'bg-slate-400'}`}
        aria-hidden
      />
      {LABELS[status as KnownMarketStatus] ?? humanise(status)}
    </span>
  );
}
