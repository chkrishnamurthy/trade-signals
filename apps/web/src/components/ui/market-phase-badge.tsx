import type { MarketPhase } from '@/lib/market-types';

/**
 * Session-state badge.
 *
 * Phases are the product's own vocabulary, not a data provider's status codes,
 * so a second provider renders identically without touching this file.
 *
 * Only `open` gets the live treatment. A price printed during pre-open or a
 * closing auction is not a continuous trading price, and badging it "live"
 * would misrepresent the data.
 */
const LABELS: Record<MarketPhase, string> = {
  pre_open: 'Pre-open',
  open: 'Open',
  closed: 'Closed',
  post_close: 'Post-close',
  closing_auction: 'Closing auction',
  unknown: 'Session state unavailable',
};

const TONES: Record<MarketPhase, string> = {
  open: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-950 dark:text-emerald-300 dark:ring-emerald-400/30',
  pre_open:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
  closing_auction:
    'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-950 dark:text-amber-300 dark:ring-amber-400/30',
  post_close:
    'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
  closed:
    'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20',
  // Deliberately not grey: "we don't know" must not look like "closed".
  unknown:
    'bg-orange-50 text-orange-700 ring-orange-600/20 dark:bg-orange-950 dark:text-orange-300 dark:ring-orange-400/30',
};

export function MarketPhaseBadge({ phase, isOpen }: { phase: MarketPhase; isOpen: boolean }) {
  const live = isOpen && phase === 'open';

  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset ${TONES[phase]}`}
    >
      <span
        className={`size-1.5 rounded-full ${live ? 'bg-emerald-500' : 'bg-slate-400'}`}
        aria-hidden
      />
      {LABELS[phase]}
    </span>
  );
}
