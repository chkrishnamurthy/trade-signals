import type * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Product previews for the landing page.
 *
 * Recreations of real screens, drawn with the app's own tokens and wording
 * (the "What stands out" sentences are the phrasing `packages/core/src/screener/
 * key-points.ts` produces). They are HTML, not screenshots: sharp at any size,
 * themed in light and dark, readable by a screen reader.
 *
 * Every figure is SAMPLE data about made-up companies, and every frame says so.
 * A landing page that showed a real stock with a real "bullish" reading would
 * read as a recommendation; one that invented performance would be worse.
 */

type Tone = 'up' | 'down' | 'flat' | 'info' | 'warning';

const TONE_DOT: Readonly<Record<Tone, string>> = {
  up: 'bg-bullish',
  down: 'bg-bearish',
  flat: 'bg-neutral',
  info: 'bg-info',
  warning: 'bg-warning',
};

const CHANGE_TEXT: Readonly<Record<'up' | 'down', string>> = {
  up: 'text-bullish-strong',
  down: 'text-bearish-strong',
};

/** A product window: title bar, the "Sample data" tag, content, an optional caption. */
export function PreviewFrame({
  title,
  detail,
  caption,
  children,
  className,
}: {
  title: string;
  detail?: string | undefined;
  caption?: string | undefined;
  children: React.ReactNode;
  className?: string | undefined;
}) {
  return (
    <figure
      className={cn(
        'm-0 overflow-hidden rounded-2xl border border-border bg-surface text-foreground shadow-elevated',
        className,
      )}
    >
      <div className="flex items-center gap-2 border-border border-b bg-surface-sunken/70 px-4 py-3">
        <span className="font-semibold text-sm">{title}</span>
        {detail !== undefined && (
          <span className="truncate text-muted-foreground text-xs max-sm:hidden">{detail}</span>
        )}
        <span className="ml-auto shrink-0 rounded-md bg-muted px-2 py-0.5 font-medium text-2xs text-muted-foreground">
          Sample data
        </span>
      </div>
      {children}
      {caption !== undefined && (
        <figcaption className="border-border border-t bg-surface-sunken/70 px-4 py-2.5 text-muted-foreground text-xs">
          {caption}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Hero: one stock, and the facts that put it on the radar
// ---------------------------------------------------------------------------

const HERO_FACTS: ReadonlyArray<{ tone: Tone; text: string; evidence: string }> = [
  { tone: 'up', text: 'Closed above its previous 52-week high.', evidence: 'Technicals' },
  {
    tone: 'up',
    text: 'Delivery 61% of traded quantity, against a 20-session average of 38%.',
    evidence: 'Delivery',
  },
  { tone: 'info', text: 'Volume 2.4× its 20-session average.', evidence: 'Technicals' },
  { tone: 'warning', text: 'Board meeting to consider results in 6 days.', evidence: 'Events' },
  {
    tone: 'flat',
    text: 'Promoter holding down 0.42 pp from the previous quarter.',
    evidence: 'Ownership',
  },
];

export function WhyPanel({ className }: { className?: string | undefined }) {
  return (
    <PreviewFrame
      title="Example Industries"
      detail="NSE · Capital goods"
      caption="Facts computed from price, delivery and filing history. They describe; they don't recommend."
      className={className}
    >
      <div className="flex flex-wrap items-end gap-x-6 gap-y-1 px-5 pt-5">
        <div>
          <p className="m-0 font-mono font-semibold text-3xl tracking-tight">₹2,148.60</p>
          <p className="m-0 mt-1 font-mono font-semibold text-bullish-strong text-sm">
            +₹31.40 (+1.48%)
          </p>
        </div>
        <Sparkline className="ml-auto h-12 w-40" />
      </div>
      <div className="px-5 pt-5 pb-4">
        <h3 className="m-0 mb-2 font-semibold text-sm">What stands out</h3>
        <ul className="m-0 flex list-none flex-col p-0">
          {HERO_FACTS.map((fact) => (
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
    </PreviewFrame>
  );
}

function Sparkline({ className }: { className?: string | undefined }) {
  return (
    <svg viewBox="0 0 160 48" className={className} aria-hidden="true" preserveAspectRatio="none">
      <polyline
        fill="none"
        stroke="var(--color-bullish)"
        strokeWidth="2"
        strokeLinejoin="round"
        points="0,40 14,37 28,39 42,31 56,33 70,26 84,29 98,21 112,23 126,15 140,17 154,8 160,6"
      />
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Tour panels
// ---------------------------------------------------------------------------

const WATCHLIST: ReadonlyArray<{
  name: string;
  ltp: string;
  change: string;
  dir: 'up' | 'down';
  rsi: string;
  fromHigh: string;
}> = [
  {
    name: 'Sample Motors',
    ltp: '1,248.50',
    change: '+2.10%',
    dir: 'up',
    rsi: '64',
    fromHigh: '−0.4%',
  },
  {
    name: 'Example Bank',
    ltp: '712.20',
    change: '−0.84%',
    dir: 'down',
    rsi: '41',
    fromHigh: '−12.8%',
  },
  {
    name: 'Demo Pharma',
    ltp: '3,960.00',
    change: '+0.41%',
    dir: 'up',
    rsi: '55',
    fromHigh: '−6.1%',
  },
  {
    name: 'Placeholder Power',
    ltp: '388.15',
    change: '−1.62%',
    dir: 'down',
    rsi: '33',
    fromHigh: '−24.9%',
  },
  {
    name: 'Model Cements',
    ltp: '9,412.75',
    change: '+0.07%',
    dir: 'up',
    rsi: '58',
    fromHigh: '−3.3%',
  },
];

/** The watchlist table, with column names as the app shows them. */
export function WatchlistPreview() {
  return (
    <PreviewFrame title="My watchlist" detail="5 stocks · prices update during market hours">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[480px] border-collapse text-sm">
          <thead>
            <tr className="text-right text-muted-foreground text-xs">
              <th scope="col" className="px-4 py-2.5 text-left font-medium">
                Stock
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                LTP (₹)
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Change %
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                RSI
              </th>
              <th scope="col" className="px-4 py-2.5 font-medium">
                % From 52W High
              </th>
            </tr>
          </thead>
          <tbody>
            {WATCHLIST.map((row) => (
              <tr key={row.name} className="border-border/70 border-t text-right">
                <th scope="row" className="px-4 py-2.5 text-left font-semibold">
                  {row.name}
                </th>
                <td className="px-3 py-2.5 font-mono">{row.ltp}</td>
                <td className={cn('px-3 py-2.5 font-mono', CHANGE_TEXT[row.dir])}>{row.change}</td>
                <td className="px-3 py-2.5 font-mono">{row.rsi}</td>
                <td className="px-4 py-2.5 font-mono">{row.fromHigh}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </PreviewFrame>
  );
}

export function ScreenerPreview() {
  const conditions = [
    'Close above EMA 200',
    'RSI (14) between 50 and 70',
    'Delivery vs average above 1.5×',
    'Index: Nifty 500',
  ];
  const results = [
    ['Sample Motors', 'RSI 64', 'Delivery 58%'],
    ['Demo Pharma', 'RSI 55', 'Delivery 61%'],
    ['Model Cements', 'RSI 58', 'Delivery 49%'],
    ['Example Textiles', 'RSI 52', 'Delivery 66%'],
  ] as const;
  return (
    <PreviewFrame title="Screener" detail="Nifty 500 · 4 conditions">
      <div className="flex flex-wrap gap-2 border-border border-b px-4 py-3.5">
        {conditions.map((condition) => (
          <span
            key={condition}
            className="rounded-lg border border-border bg-surface-sunken px-2.5 py-1 font-medium text-xs"
          >
            {condition}
          </span>
        ))}
      </div>
      <p className="m-0 border-border/70 border-b px-4 py-2.5 text-muted-foreground text-xs">
        <strong className="text-foreground">38 stocks</strong> meet every condition at the last
        close
      </p>
      <ul className="m-0 list-none p-0">
        {results.map(([name, rsi, delivery]) => (
          <li
            key={name}
            className="flex items-center gap-4 border-border/70 border-t px-4 py-2.5 text-sm first:border-t-0"
          >
            <span className="flex-1 font-semibold">{name}</span>
            <span className="font-mono text-muted-foreground text-xs">{rsi}</span>
            <span className="font-mono text-muted-foreground text-xs">{delivery}</span>
          </li>
        ))}
      </ul>
    </PreviewFrame>
  );
}

export function BriefPreview() {
  const movers = [
    ['Sample Motors', '+2.10%', 'up'],
    ['Placeholder Power', '−1.62%', 'down'],
    ['Demo Pharma', '+0.41%', 'up'],
  ] as const;
  return (
    <PreviewFrame title="Market brief" detail="Nifty 50 · session of Monday">
      <div className="grid gap-5 p-5 sm:grid-cols-2">
        <div className="flex flex-col gap-3">
          <h3 className="m-0 font-semibold text-sm">Breadth</h3>
          <div className="flex h-2.5 overflow-hidden rounded-full" aria-hidden>
            <span className="bg-bullish" style={{ width: '62%' }} />
            <span className="bg-neutral/40" style={{ width: '4%' }} />
            <span className="bg-bearish" style={{ width: '34%' }} />
          </div>
          <dl className="m-0 grid grid-cols-3 gap-2 text-xs">
            <div>
              <dt className="text-muted-foreground">Advancing</dt>
              <dd className="m-0 font-mono font-semibold text-sm">31</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Unchanged</dt>
              <dd className="m-0 font-mono font-semibold text-sm">2</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Declining</dt>
              <dd className="m-0 font-mono font-semibold text-sm">17</dd>
            </div>
          </dl>
          <p className="m-0 text-muted-foreground text-xs">
            32 of 50 stocks closed above their 20-day average.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <h3 className="m-0 font-semibold text-sm">Movers you follow</h3>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-sm">
            {movers.map(([name, change, dir]) => (
              <li key={name} className="flex justify-between gap-3">
                <span>{name}</span>
                <span className={cn('font-mono', CHANGE_TEXT[dir])}>{change}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </PreviewFrame>
  );
}

export function PortfolioPreview() {
  const summary = [
    ['Value', '₹3,37,017'],
    ['Today', '+₹1,105'],
    ['You paid', '₹2,98,950'],
    ['Total gain', '+₹38,067'],
  ] as const;
  return (
    <PreviewFrame title="My portfolio" detail="Imported from a CSV holdings file">
      <dl className="m-0 grid grid-cols-2 gap-4 border-border border-b p-5 sm:grid-cols-4">
        {summary.map(([label, value]) => (
          <div key={label}>
            <dt className="text-muted-foreground text-xs">{label}</dt>
            <dd className="m-0 mt-1 font-mono font-semibold text-base">{value}</dd>
          </div>
        ))}
      </dl>
      <ul className="m-0 list-none p-0 text-sm" aria-label="Holdings">
        <li className="flex items-center gap-4 px-5 py-2.5">
          <span className="flex-1 font-semibold">Example Bank</span>
          <span className="text-muted-foreground text-xs">120 shares</span>
          <span className="font-mono">₹85,464</span>
        </li>
        <li className="flex items-center gap-4 border-border/70 border-t px-5 py-2.5">
          <span className="flex-1 font-semibold">Demo Pharma</span>
          <span className="text-muted-foreground text-xs">35 shares</span>
          <span className="font-mono">₹1,38,600</span>
        </li>
        <li className="flex items-center gap-4 border-border/70 border-t px-5 py-2.5">
          <span className="flex-1 font-semibold">Model Cements</span>
          <span className="text-muted-foreground text-xs">12 shares</span>
          <span className="font-mono">₹1,12,953</span>
        </li>
      </ul>
    </PreviewFrame>
  );
}

export function IpoPreview() {
  const issues = [
    {
      name: 'Example Robotics',
      board: 'Mainboard',
      dates: 'Opens Wed, closes Fri',
      band: '₹412–434',
      sub: 'Subscribed 3.1× so far',
    },
    {
      name: 'Sample Agro Foods',
      board: 'SME',
      dates: 'Closes today',
      band: '₹96–101',
      sub: 'Subscribed 11.8× so far',
    },
  ] as const;
  return (
    <PreviewFrame title="IPOs" detail="Open and upcoming">
      <ul className="m-0 list-none p-0">
        {issues.map((issue) => (
          <li
            key={issue.name}
            className="flex flex-col gap-1.5 border-border/70 border-t px-5 py-4 first:border-t-0"
          >
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-semibold">{issue.name}</span>
              <span className="rounded-md bg-muted px-1.5 py-0.5 text-2xs text-muted-foreground">
                {issue.board}
              </span>
            </div>
            <p className="m-0 text-muted-foreground text-sm">
              {issue.dates} · Price band {issue.band} · {issue.sub}
            </p>
          </li>
        ))}
      </ul>
      <p className="m-0 border-border border-t px-5 py-2.5 text-muted-foreground text-xs">
        Grey-market premium, where shown, is unofficial and labelled with its source.
      </p>
    </PreviewFrame>
  );
}
