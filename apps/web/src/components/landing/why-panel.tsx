import { cn } from '@/lib/utils';

/**
 * The landing page's product preview: one made-up stock and the facts that
 * put it on the radar, in the exact phrasing `packages/core/src/screener/
 * key-points.ts` produces for real stock pages.
 *
 * Sample data about a made-up company, and it says so. A landing page that
 * showed a real stock with a "bullish" reading, an entry zone or a target
 * would read as a recommendation — this shows only facts.
 */

type Tone = 'up' | 'info' | 'warning' | 'flat';

const TONE_DOT: Readonly<Record<Tone, string>> = {
  up: 'bg-bullish',
  info: 'bg-info',
  warning: 'bg-warning',
  flat: 'bg-neutral',
};

const FACTS: ReadonlyArray<{ tone: Tone; text: string; evidence: string }> = [
  { tone: 'up', text: 'Closed above its previous 52-week high.', evidence: 'Technicals' },
  {
    tone: 'up',
    text: 'Delivery 61% of traded quantity, against a 20-session average of 38%.',
    evidence: 'Delivery',
  },
  { tone: 'info', text: 'Volume 2.4× its 20-session average.', evidence: 'Technicals' },
  { tone: 'warning', text: 'Board meeting for quarterly results in 6 days.', evidence: 'Events' },
  {
    tone: 'flat',
    text: 'Promoter holding down 0.42 pp from the previous quarter.',
    evidence: 'Ownership',
  },
];

export function WhyPanel({ className }: { className?: string | undefined }) {
  return (
    <figure
      className={cn(
        'm-0 overflow-hidden rounded-xl border border-border bg-surface text-left shadow-lg',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-border border-b bg-surface-sunken/70 px-4 py-3">
        <span className="font-semibold text-sm">Example Industries</span>
        <span className="truncate text-muted-foreground text-xs max-sm:hidden">
          NSE · Capital goods
        </span>
        <span className="ml-auto shrink-0 rounded-md bg-muted px-2 py-0.5 font-medium text-2xs text-muted-foreground">
          Sample data
        </span>
      </div>
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 px-5 pt-5">
        <div>
          <p className="m-0 font-mono font-semibold text-3xl tracking-tight">₹2,148.60</p>
          <p className="m-0 mt-1 font-mono font-semibold text-bullish-strong text-sm">
            +₹31.40 (+1.48%)
          </p>
        </div>
        <svg
          viewBox="0 0 160 48"
          className="ml-auto h-12 w-40"
          aria-hidden="true"
          preserveAspectRatio="none"
        >
          <polyline
            fill="none"
            stroke="var(--color-bullish)"
            strokeWidth="2"
            strokeLinejoin="round"
            points="0,40 14,37 28,39 42,31 56,33 70,26 84,29 98,21 112,23 126,15 140,17 154,8 160,6"
          />
        </svg>
      </div>
      <div className="px-5 pt-5 pb-4">
        <h3 className="m-0 mb-2 font-semibold text-sm">What stands out</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          {FACTS.map((fact) => (
            <li
              key={fact.text}
              className="flex items-start gap-3 border-border/70 border-t py-2.5 first:border-t-0"
            >
              <span
                aria-hidden
                className={cn('mt-1.5 size-2 shrink-0 rounded-full', TONE_DOT[fact.tone])}
              />
              <span className="flex-1 text-sm leading-snug">{fact.text}</span>
              <span className="shrink-0 rounded-md border border-border px-1.5 py-0.5 text-2xs text-muted-foreground">
                {fact.evidence}
              </span>
            </li>
          ))}
        </ul>
      </div>
      <figcaption className="border-border border-t bg-surface-sunken/70 px-4 py-2.5 text-muted-foreground text-xs">
        Made-up company. Facts are computed from price, delivery and filing history — they describe;
        they don&rsquo;t recommend.
      </figcaption>
    </figure>
  );
}
