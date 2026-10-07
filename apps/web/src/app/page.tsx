import {
  ArrowRightIcon,
  FileSearchIcon,
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
import { WhyPanel } from '@/components/landing/why-panel';
import { PublicFooter } from '@/components/layout/public-footer';
import { PublicHeader } from '@/components/layout/public-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getSessionUser } from '@/server/auth/require-user';

export const revalidate = 60; // ISR 1 minute

export const metadata: Metadata = {
  title: 'EquityWise — Know Why an NSE Stock Deserves Your Attention',
  description:
    'Watchlists, a stock screener and plain-English facts about every NSE-listed stock, each with the number behind it. Recomputed after every market close. Free to use. A research tool, not a broker and not investment advice.',
  alternates: {
    canonical: '/',
  },
};

export default async function HomePage() {
  const user = await getSessionUser();
  const signedIn = user !== null;

  return (
    <div className="flex min-h-dvh flex-col bg-background text-foreground">
      <PublicHeader signedIn={signedIn} />

      <main className="flex-1">
        <Hero signedIn={signedIn} />
        <Features signedIn={signedIn} />
        <Integrity />
        <ClosingCta signedIn={signedIn} />
      </main>

      <PublicFooter />
    </div>
  );
}

function Hero({ signedIn }: { signedIn: boolean }) {
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
              : 'Every NSE-listed stock · recomputed after each close'}
          </Badge>

          <h1 className="font-display font-extrabold text-4xl tracking-tight text-foreground text-balance sm:text-6xl sm:leading-[1.05]">
            Know <span className="text-primary">why</span> a stock deserves your attention
          </h1>

          <p className="mx-auto mt-5 max-w-xl text-pretty text-base text-muted-foreground sm:text-lg">
            Watchlists, a stock screener and plain-English facts about every NSE-listed stock — each
            fact with the number behind it. You make the decisions; EquityWise never places an
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
                    Create free account
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
            <span>✓ Free to use, no card needed</span>
            <span>✓ Never asks for your broker login</span>
            <span>✓ No tips, targets or order buttons</span>
          </div>
        </div>

        <WhyPanel className="mx-auto mt-14 max-w-2xl" />
      </div>
    </section>
  );
}

const FEATURES = [
  {
    icon: GaugeIcon,
    title: 'Watchlists that read themselves',
    body: 'Add a stock and each column — RSI, moving averages, ATR, 52-week range, period returns — fills in after the next NSE close. No spreadsheets, no manual maths.',
  },
  {
    icon: FileSearchIcon,
    title: 'What stands out, with the evidence',
    body: 'Every stock page lists the facts worth knowing — a new 52-week high, unusual delivery, an upcoming result — each with its number and a link to the data behind it.',
  },
  {
    icon: SparklesIcon,
    title: 'A plain-English market brief',
    body: 'A read on the session that just closed — how many stocks rose and fell, and what moved in your watchlists — in language you actually understand.',
  },
  {
    icon: MegaphoneIcon,
    title: 'Corporate announcements, sorted',
    body: 'Exchange filings, checked several times a day and sorted by type — results, dividends, buybacks, order wins, board meetings — each linked to the original filing.',
  },
  {
    icon: LandmarkIcon,
    title: 'Follow the institutional money',
    body: 'Where the big money went — cash flows, futures positioning, delivery and large deals — without digging through exchange files.',
  },
  {
    icon: ShieldCheckIcon,
    title: 'Honest by design',
    body: 'Not a broker, no order buttons, no "hot tips", no recommendations. Facts and readings you can check, and the decision stays yours.',
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
            One idea throughout: never show a number we cannot explain.
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
    title: 'Completed sessions only',
    body: 'Indicators are computed on finished trading days, never the bar still forming — so a reading never depends on a price that was not yet known, and never changes after you have seen it.',
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

function ClosingCta({ signedIn }: { signedIn: boolean }) {
  return (
    <section className="py-20">
      <div className="mx-auto max-w-3xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="font-display font-extrabold text-3xl tracking-tight text-balance sm:text-4xl">
          Start reading the market with reasons, not rumours
        </h2>
        <p className="mx-auto mt-4 max-w-xl text-muted-foreground sm:text-lg">
          Free to use. No card, no broker login — just the facts behind every NSE-listed stock.
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
