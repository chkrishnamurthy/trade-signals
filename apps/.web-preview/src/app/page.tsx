import {
  ArrowRightIcon,
  GaugeIcon,
  LandmarkIcon,
  LayersIcon,
  MegaphoneIcon,
  ShieldCheckIcon,
  SparklesIcon,
  TrendingUpIcon,
} from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/server/auth/require-user';
import { getHeadlineIndices } from '@/server/indices';

export const revalidate = 60; // ISR 1 minute

export const metadata: Metadata = {
  title: 'EquityWise — Know Why an NSE Stock Deserves Your Attention',
  description:
    'Watchlists, technical signals and corporate filings for every NSE equity — each read explained in plain English with the exact factors behind it. Recomputed at every market close with zero lookahead bias. Decision support, never an order.',
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const user = await getSessionUser();
  const headlineIndices = await getHeadlineIndices().catch(() => []);
  const signedIn = user !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader signedIn={signedIn} />

      <main className="flex-1">
        <Hero signedIn={signedIn} headlineIndices={headlineIndices} />
        <Features signedIn={signedIn} />
        <Integrity />
        <Testimonials />
        <ClosingCta signedIn={signedIn} />
      </main>

      <PublicFooter />
    </div>
  );
}

function Hero({
  signedIn,
  headlineIndices,
}: {
  signedIn: boolean;
  headlineIndices: Awaited<ReturnType<typeof getHeadlineIndices>>;
}) {
  return (
    <section className="relative overflow-hidden border-b border-border/50 py-16 sm:py-24">
      {/* A soft emerald wash behind the headline — atmosphere, not a gradient hero. */}
      <div
        aria-hidden
        className="-z-10 absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_80%_at_50%_-10%,var(--color-bullish-soft),transparent)]"
      />
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-3xl text-center">
          <Badge
            variant="outline"
            className="mb-5 inline-flex items-center gap-1.5 bg-surface/70 px-3 py-1 text-xs"
          >
            <span className="size-1.5 rounded-full bg-bullish" />
            {signedIn
              ? 'Welcome back — your latest session brief is ready'
              : 'Live NSE data · recomputed every market close'}
          </Badge>

          <h1 className="font-display font-extrabold text-4xl tracking-tight text-foreground text-balance sm:text-6xl sm:leading-[1.05]">
            Know <span className="text-primary">why</span> a stock deserves your attention
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Watchlists, technical signals and corporate filings for every NSE name — each read
            explained in plain English, with the exact factors behind it. Decision support, never an
            order.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            {signedIn ? (
              <>
                <Button asChild size="lg" className="gap-2">
                  <Link href="/today">
                    <SparklesIcon className="size-4" />
                    Open your market brief
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/watchlists">View watchlists</Link>
                </Button>
              </>
            ) : (
              <>
                <Button asChild size="lg" className="gap-2">
                  <Link href="/signup">
                    Start free — no card needed
                    <ArrowRightIcon className="size-4" />
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="/login">Sign in</Link>
                </Button>
              </>
            )}
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-1.5 text-xs text-subtle-foreground">
            <span>✓ Free forever plan</span>
            <span>✓ No brokerage link needed</span>
            <span>✓ Zero lookahead bias</span>
          </div>
        </div>

        <ExampleSignalCard />

        {headlineIndices.length > 0 && (
          <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* The first four of the strip's indices; the tiles are a 2×2 / 1×4 grid. */}
            {headlineIndices.slice(0, 4).map((idx) => (
              <div
                key={idx.symbol}
                className="flex flex-col justify-between rounded-lg border border-border/70 bg-surface/50 p-4 transition-colors hover:border-border"
              >
                <span className="font-semibold text-muted-foreground text-xs">{idx.name}</span>
                <span className="mt-1 font-mono font-semibold text-foreground text-lg tracking-tight">
                  {idx.symbol}
                </span>
                <span className="mt-1 text-2xs uppercase tracking-wider text-subtle-foreground">
                  Benchmark index
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/**
 * An illustrative "why this signal" card. Labelled an EXAMPLE on the card
 * itself — it demonstrates the product's factor-breakdown UI without implying
 * the numbers are a live quote or a recommendation.
 */
function ExampleSignalCard() {
  const factors: ReadonlyArray<[string, number]> = [
    ['Price above 20 / 50 / 200 EMA stack', 92],
    ['Volume 1.7× 20-day average', 78],
    ['RSI 61 · rising, not overbought', 66],
    ['Broke three-week consolidation high', 84],
  ];
  return (
    <div className="mx-auto mt-14 max-w-3xl overflow-hidden rounded-xl border border-border bg-surface text-left shadow-lg">
      <div className="flex flex-wrap items-center gap-2 border-border/70 border-b bg-surface-sunken/60 px-4 py-3">
        <Badge className="bg-bullish-soft text-bullish-strong">Bullish setup</Badge>
        <span className="font-semibold text-sm">Example stock</span>
        <span className="ml-auto text-2xs uppercase tracking-wider text-subtle-foreground">
          Illustrative — not a live quote or recommendation
        </span>
      </div>
      <div className="grid gap-0 sm:grid-cols-[1.4fr_1fr]">
        <div className="border-border/70 p-5 sm:border-r">
          <p className="mb-3 text-xs uppercase tracking-wider text-subtle-foreground">
            Why this signal — factor breakdown
          </p>
          <div className="flex flex-col gap-3">
            {factors.map(([label, value]) => (
              <div key={label}>
                <div className="mb-1 flex items-center justify-between text-xs">
                  <span className="text-foreground">{label}</span>
                  <span className="font-mono font-semibold text-primary">{value}</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                  <div className="h-full rounded-full bg-primary" style={{ width: `${value}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div>
            <p className="text-xs text-subtle-foreground">Technical entry zone</p>
            <p className="font-mono font-semibold text-lg">₹2,960 – ₹2,988</p>
          </div>
          <div>
            <p className="text-xs text-subtle-foreground">Invalidation level</p>
            <p className="font-mono font-semibold text-bearish-strong text-lg">₹2,902</p>
          </div>
          <p className="mt-auto border-border/70 border-t pt-3 text-2xs leading-relaxed text-subtle-foreground">
            These are technical price levels, not order instructions. You place any trade yourself,
            on a separate platform.
          </p>
        </div>
      </div>
    </div>
  );
}

const FEATURES = [
  {
    icon: GaugeIcon,
    title: 'Watchlists that read themselves',
    body: 'Add a name and each column — RSI, 20/50/200 EMAs, ATR, 52-week extremes, period returns — fills in after the next NSE close. No spreadsheets, no manual maths.',
  },
  {
    icon: TrendingUpIcon,
    title: 'Signals with the reasoning shown',
    body: 'Breakouts, EMA stacks, volume anomalies — every setup arrives with the factor breakdown behind it, so you see why it fired, not just that it did.',
  },
  {
    icon: SparklesIcon,
    title: 'A plain-English market brief',
    body: 'Each morning, a technical read on the session that just closed — breadth, movers you follow, and fresh setups — in language you actually understand.',
  },
  {
    icon: MegaphoneIcon,
    title: 'Corporate filings, the moment they land',
    body: 'Buybacks, dividends, order wins and board meetings pulled live from BSE & NSE, auto-summarised, always linked back to the original filing.',
  },
  {
    icon: LandmarkIcon,
    title: 'Follow the institutional money',
    body: 'FII and DII net flows and sector activity at a glance — the "where did the money go today" view, without digging through PDFs.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Honest by design',
    body: 'Not a broker, no order buttons, no "hot tips". Just clean technical reads and the confidence levels the factors can actually explain.',
  },
] as const;

function Features({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="border-b border-border/50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <h2 className="font-display font-bold text-3xl tracking-tight text-balance">
            Everything you need to read the market with reasons
          </h2>
          <p className="mt-3 text-muted-foreground">
            Five surfaces, one idea: never show a number you cannot explain.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature) => {
            const Icon = feature.icon;
            return (
              <div
                key={feature.title}
                className="rounded-xl border border-border bg-surface p-6 transition-colors hover:border-primary/40"
              >
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold text-base">{feature.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{feature.body}</p>
              </div>
            );
          })}
        </div>

        <div className="mt-10 flex justify-center">
          <Button asChild variant="ghost" className="gap-1.5">
            <Link href={signedIn ? '/watchlists' : '/signup'}>
              {signedIn ? 'Go to your watchlists' : 'Create your first watchlist'}
              <ArrowRightIcon className="size-4" />
            </Link>
          </Button>
        </div>
      </div>
    </section>
  );
}

const INTEGRITY = [
  {
    icon: ShieldCheckIcon,
    title: 'Zero lookahead bias',
    body: 'Indicators and signals compute exclusively on closed session bars. A tradeable trigger assumes execution on the next candle open — never a price the engine could not have seen.',
  },
  {
    icon: LayersIcon,
    title: 'Integer-paise arithmetic',
    body: 'Every price is stored and calculated in whole paise (₹1,245.50 = 124550), so binary floating-point roundoff never creeps into an indicator or a level.',
  },
  {
    icon: TrendingUpIcon,
    title: 'Corporate-action adjusted',
    body: 'Splits, bonuses and consolidations apply on read with exact ratios, keeping history continuous without ever mutating a raw candle record.',
  },
] as const;

function Integrity() {
  return (
    <section className="bg-surface/40 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-2 font-semibold text-primary text-xs uppercase tracking-widest">
            Built to be trusted
          </p>
          <h2 className="font-display font-bold text-3xl tracking-tight text-balance">
            The maths is right, or it does not ship
          </h2>
          <p className="mt-3 text-muted-foreground">
            A financial tool that rounds badly is worse than no tool. These are the rules the engine
            never breaks.
          </p>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {INTEGRITY.map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.title} className="rounded-xl border border-border bg-surface p-6">
                <div className="inline-flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Icon className="size-5" />
                </div>
                <h3 className="mt-4 font-semibold text-base">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{item.body}</p>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/**
 * ⚠️ SAMPLE TESTIMONIALS — REPLACE BEFORE LAUNCH.
 *
 * These are placeholder quotes to show the section design. Do NOT ship them as
 * real customer reviews: publishing fabricated testimonials is deceptive (and
 * disallowed). Swap in genuine, consented quotes — or set this to an empty
 * array to hide the section entirely until you have real ones.
 */
const TESTIMONIALS: ReadonlyArray<{ quote: string; name: string; role: string }> = [
  {
    quote:
      'Every signal tells me the why — the EMA stack, the volume, the breakout level. I stopped chasing tips blindly.',
    name: 'Rahul A.',
    role: 'Swing trader · Bengaluru',
  },
  {
    quote:
      'The announcements feed flagged a buyback the same morning it hit. That edge used to cost me hours.',
    name: 'Priya N.',
    role: 'Long-term investor · Pune',
  },
  {
    quote:
      'It is refreshingly honest that it is not a broker — just clean technical reads I actually trust.',
    name: 'Sundar V.',
    role: 'F&O part-timer · Chennai',
  },
];

function Testimonials() {
  if (TESTIMONIALS.length === 0) return null;
  return (
    <section className="border-y border-border/50 py-16 sm:py-20">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center">
          <p className="mb-2 font-semibold text-primary text-xs uppercase tracking-widest">
            What investors say
          </p>
          <h2 className="font-display font-bold text-3xl tracking-tight text-balance">
            Trusted for the reasoning, not just the ticker
          </h2>
        </div>

        <div className="mt-12 grid grid-cols-1 gap-5 md:grid-cols-3">
          {TESTIMONIALS.map((testimonial) => (
            <figure
              key={testimonial.quote}
              className="flex flex-col gap-4 rounded-xl border border-border bg-surface p-6"
            >
              <div
                className="text-sm tracking-widest"
                style={{ color: '#d99a2b' }}
                role="img"
                aria-label="Rated five out of five"
              >
                <span aria-hidden>★★★★★</span>
              </div>
              <blockquote className="text-pretty text-sm leading-relaxed text-foreground">
                “{testimonial.quote}”
              </blockquote>
              <figcaption className="mt-auto flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-primary/10 font-semibold text-primary text-sm">
                  {testimonial.name.slice(0, 1)}
                </span>
                <span>
                  <span className="block font-semibold text-sm">{testimonial.name}</span>
                  <span className="text-muted-foreground text-xs">{testimonial.role}</span>
                </span>
              </figcaption>
            </figure>
          ))}
        </div>
      </div>
    </section>
  );
}

function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="font-display font-extrabold text-3xl tracking-tight text-balance sm:text-4xl">
          Start reading the market with reasons, not rumours
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">
          Free forever for your first watchlist. Upgrade only when you want the full signal engine.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          {signedIn ? (
            <Button asChild size="lg">
              <Link href="/today">Open your market brief</Link>
            </Button>
          ) : (
            <>
              <Button asChild size="lg">
                <Link href="/signup">Create your free account</Link>
              </Button>
              <Button asChild size="lg" variant="outline">
                <Link href="/contact">Talk to us</Link>
              </Button>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
