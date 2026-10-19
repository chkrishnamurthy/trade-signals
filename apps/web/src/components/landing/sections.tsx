import type { LucideIcon } from 'lucide-react';
import {
  BriefcaseIcon,
  CalendarRangeIcon,
  CheckIcon,
  DatabaseIcon,
  FileSearchIcon,
  ListIcon,
  LockKeyholeIcon,
  RulerIcon,
  SlidersHorizontalIcon,
  SunriseIcon,
  XIcon,
} from 'lucide-react';
import type { Route } from 'next';
import Link from 'next/link';
import type * as React from 'react';
import { cn } from '@/lib/utils';
import { AlreadyHaveAccount, SECONDARY_CTA, SignupCta } from './cta';
import { WhyPanel } from './previews';

/**
 * Landing-page sections, in reading order. The journey is
 * hero → what it is and isn't → features by question → see it → how to start
 * → who it's for → trust and safety → FAQ → sign up.
 * Plan: docs/planning/landing-and-public-navigation-plan.md.
 *
 * Copy rules (CLAUDE.md + SEBI research-analyst FAQ): "facts", "readings",
 * "conditions" — never signals, calls, targets, tips, buy/sell. No outcome,
 * accuracy or return claims. Every product figure is sample data.
 */

function Container({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div className={cn('mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8', className)} {...props} />
  );
}

function SectionHeading({
  id,
  title,
  intro,
  className,
}: {
  id: string;
  title: string;
  intro?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <div className={cn('max-w-2xl', className)}>
      <h2
        id={id}
        className="m-0 text-balance font-bold font-display text-3xl tracking-tight sm:text-4xl"
      >
        {title}
      </h2>
      {intro !== undefined && (
        <p className="m-0 mt-3 text-pretty text-lg text-muted-foreground leading-relaxed">
          {intro}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// 1. Hero
// ---------------------------------------------------------------------------

const REASSURANCES = [
  'Free to use, no card asked for',
  'Never asks for your broker or demat login',
  'No tips, targets or order buttons',
] as const;

export function Hero() {
  return (
    <section
      aria-labelledby="hero-title"
      data-cta-zone
      className="border-border border-b bg-surface"
    >
      <Container className="grid items-center gap-12 py-14 sm:py-20 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] lg:gap-16">
        <div className="flex flex-col gap-6">
          <h1
            id="hero-title"
            className="m-0 text-balance font-display font-extrabold text-[2.6rem] leading-[1.02] tracking-tight sm:text-6xl"
          >
            Know why a stock deserves your attention.
          </h1>
          <p className="m-0 max-w-xl text-pretty text-lg text-muted-foreground leading-relaxed sm:text-xl">
            After each close, EquityWise reads NSE mainboard stocks and tells you, in plain English,
            what stands out — trend, volume, delivery, upcoming results, dividends. Keep your
            watchlists and holdings in one place, and make your own decisions.
          </p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <SignupCta />
            <a href="#tour" className={SECONDARY_CTA}>
              See it in action
            </a>
          </div>
          <ul className="m-0 flex list-none flex-col gap-2 p-0 text-muted-foreground text-sm sm:flex-row sm:flex-wrap sm:gap-x-6">
            {REASSURANCES.map((line) => (
              <li key={line} className="flex items-center gap-2">
                <CheckIcon className="size-4 shrink-0 text-bullish-strong" aria-hidden />
                {line}
              </li>
            ))}
          </ul>
          <AlreadyHaveAccount />
        </div>
        <WhyPanel className="lg:-mr-4" />
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 2. What it is, and what it is not — the first trust moment, right under the fold
// ---------------------------------------------------------------------------

const STANCE: ReadonlyArray<{ term: string; detail: string }> = [
  {
    term: 'The NSE mainboard',
    detail: 'Every stock in the EQ, BE and BZ series, not a hand-picked few.',
  },
  { term: 'Updated after every close', detail: 'Readings are recalculated each trading day.' },
  {
    term: 'Facts, not opinions',
    detail: 'We describe what the data shows. We never tell you what to buy.',
  },
  { term: 'You stay in charge', detail: 'No orders here. You act, if at all, on your own broker.' },
];

export function Stance() {
  return (
    <section aria-label="What EquityWise is" className="border-border border-b">
      <Container>
        <dl className="m-0 grid gap-x-8 gap-y-6 py-10 sm:grid-cols-2 lg:grid-cols-4">
          {STANCE.map((item) => (
            <div key={item.term} className="flex flex-col gap-1">
              <dt className="font-semibold text-base">{item.term}</dt>
              <dd className="m-0 text-muted-foreground text-sm leading-relaxed">{item.detail}</dd>
            </div>
          ))}
        </dl>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 3. Features, grouped by the question each one answers
// ---------------------------------------------------------------------------

const QUESTIONS: ReadonlyArray<{
  question: string;
  features: ReadonlyArray<{ icon: LucideIcon; name: string; body: string }>;
}> = [
  {
    question: 'What is happening in the market?',
    features: [
      {
        icon: SunriseIcon,
        name: 'Market brief',
        body: 'The session that just closed, in a short read: how many Nifty 50 stocks rose and fell, how many held above their averages, and how the stocks you follow moved.',
      },
      {
        icon: CalendarRangeIcon,
        name: 'Markets data',
        body: 'Breadth, institutional flows, exchange announcements, the results-and-dividends calendar, and IPOs from their filings.',
      },
    ],
  },
  {
    question: 'Which stocks deserve attention?',
    features: [
      {
        icon: SlidersHorizontalIcon,
        name: 'Screener',
        body: 'Combine conditions across about 95 technical, delivery, F&O and ownership measures, run on NSE mainboard stocks after every close.',
      },
      {
        icon: ListIcon,
        name: 'Watchlists',
        body: 'Add stocks by name or paste a list. Prices update during market hours; add columns for RSI, moving averages, returns and the 52-week range.',
      },
    ],
  },
  {
    question: 'Why this one?',
    features: [
      {
        icon: FileSearchIcon,
        name: 'Stock pages',
        body: 'A short list of what stands out, each fact with its number, and a tab with the evidence behind it.',
      },
      {
        icon: BriefcaseIcon,
        name: 'Portfolio and alerts',
        body: 'Type your shares in or upload a CSV or Excel holdings file or a broker contract note, valued at the last price. Get an email when a stock\u2019s close or RSI crosses a level you set.',
      },
    ],
  },
];

export function Features() {
  return (
    <section aria-labelledby="features-title" id="features" className="scroll-mt-20 py-20 sm:py-24">
      <Container>
        <SectionHeading
          id="features-title"
          title="Built around the questions you ask before you look at a stock"
          intro="Six tools, each answering one of three questions. None of them tells you what to do; all of them show their working."
        />
        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-8">
          {QUESTIONS.map((group) => (
            <div
              key={group.question}
              className="flex flex-col gap-6 border-foreground border-t-2 pt-5"
            >
              <h3 className="m-0 font-bold text-xl tracking-tight">{group.question}</h3>
              {group.features.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.name} className="flex gap-4">
                    <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary-strong">
                      <Icon className="size-5" aria-hidden />
                    </span>
                    <div>
                      <p className="m-0 font-semibold">{feature.name}</p>
                      <p className="m-0 mt-1 text-muted-foreground text-sm leading-relaxed">
                        {feature.body}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 5. How it works — a real sequence, so it is numbered
// ---------------------------------------------------------------------------

const STEPS = [
  {
    title: 'Create a free account',
    body: 'It takes a minute. Nothing to link to your broker, nothing to pay.',
  },
  {
    title: 'Add the stocks you follow',
    body: 'Search by name, paste a list, or upload a holdings file. Or start from a screen across NSE mainboard stocks.',
  },
  {
    title: 'Read what changed after each close',
    body: 'Open the market brief, check what stands out on a stock, and decide for yourself. Any order is yours to place, on your own broker.',
  },
] as const;

export function HowItWorks() {
  return (
    <section
      aria-labelledby="how-title"
      id="how-it-works"
      data-cta-zone
      className="scroll-mt-20 border-border border-y bg-surface py-20 sm:py-24"
    >
      <Container>
        <SectionHeading id="how-title" title="Up and running in three steps" />
        <ol className="m-0 mt-12 grid list-none gap-10 p-0 md:grid-cols-3 md:gap-8">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex flex-col gap-3">
              <span
                aria-hidden
                className="grid size-10 place-items-center rounded-full border-2 border-foreground font-bold font-display text-lg"
              >
                {index + 1}
              </span>
              <h3 className="m-0 font-bold text-xl tracking-tight">{step.title}</h3>
              <p className="m-0 text-muted-foreground leading-relaxed">{step.body}</p>
            </li>
          ))}
        </ol>
        <div className="mt-12">
          <SignupCta />
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 6. Who it is for
// ---------------------------------------------------------------------------

const AUDIENCES = [
  {
    who: 'You hold a few stocks and have a day job.',
    how: 'Upload your holdings once. The market brief and email alerts tell you what changed, so you don’t have to watch the screen.',
  },
  {
    who: 'You look for new ideas but want evidence first.',
    how: 'Screen NSE mainboard stocks on conditions you understand, then read each result’s stock page before it goes anywhere near your watchlist.',
  },
  {
    who: 'You follow IPOs.',
    how: 'Dates, price bands, subscription and listing day for mainboard and SME issues, with the offer document quoted, not summarised away.',
  },
  {
    who: 'You are new to the market.',
    how: 'Every fact is a plain sentence with its number, and the methodology page shows the formula behind each indicator.',
  },
] as const;

export function Audiences() {
  return (
    <section aria-labelledby="audience-title" className="py-20 sm:py-24">
      <Container>
        <SectionHeading
          id="audience-title"
          title="Made for Indian investors who like to check for themselves"
        />
        <ul className="m-0 mt-10 grid list-none gap-px overflow-hidden rounded-2xl border border-border bg-border p-0 md:grid-cols-2">
          {AUDIENCES.map((item) => (
            <li key={item.who} className="flex flex-col gap-2 bg-surface p-6 sm:p-8">
              <p className="m-0 font-bold text-lg tracking-tight">{item.who}</p>
              <p className="m-0 text-muted-foreground leading-relaxed">{item.how}</p>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 7. Trust and safety
// ---------------------------------------------------------------------------

const TRUST: ReadonlyArray<{
  icon: LucideIcon;
  title: string;
  points: readonly string[];
  link: { label: string; href: Route };
}> = [
  {
    icon: RulerIcon,
    title: 'How the numbers are made',
    points: [
      'Indicators use completed trading days only — never a day still in progress.',
      'Splits and bonuses are applied with their exact ratios, so a 52-week high is a like-for-like one. When one is recorded, earlier readings are restated to match.',
      'Prices are calculated in whole paise, with no rounding drift.',
    ],
    link: { label: 'Read the methodology', href: '/methodology' },
  },
  {
    icon: LockKeyholeIcon,
    title: 'How your data is handled',
    points: [
      'Your portfolio is visible to you alone: not to other users, and no admin screen shows it.',
      'Uploaded statements are read and discarded; only the rows you confirm are saved.',
      'Two-factor sign-in is available, and deleting your account deletes your data.',
    ],
    link: { label: 'Read the privacy policy', href: '/privacy' },
  },
  {
    icon: DatabaseIcon,
    title: 'Where the data comes from',
    points: [
      'Prices, IPO details and most filings come from the National Stock Exchange of India; company announcements from BSE.',
      'Prices carry their date or time, and a warning when they are out of date.',
      'Unofficial figures, like grey-market premiums, are always labelled with their source.',
    ],
    link: { label: 'See data sources', href: '/data-sources' },
  },
];

const NOT = [
  'Not a broker — there is nothing to buy or sell here.',
  'Not investment advice, and not a tip or "target" service.',
  'Not connected to your demat or trading account.',
] as const;

export function TrustAndSafety() {
  return (
    <section
      aria-labelledby="trust-title"
      id="trust"
      className="scroll-mt-20 bg-foreground py-20 text-background sm:py-24 dark:border-border dark:border-y dark:bg-surface dark:text-foreground"
    >
      <Container>
        <div className="max-w-2xl">
          <h2
            id="trust-title"
            className="m-0 text-balance font-bold font-display text-3xl tracking-tight sm:text-4xl"
          >
            Built to be checked, not just believed
          </h2>
          <p className="m-0 mt-3 text-lg leading-relaxed opacity-80">
            A research tool is only as good as its numbers and its honesty about what it is.
          </p>
        </div>
        <div className="mt-12 grid gap-10 md:grid-cols-3 md:gap-8">
          {TRUST.map((block) => {
            const Icon = block.icon;
            return (
              <div key={block.title} className="flex flex-col gap-4">
                <Icon className="size-6 text-bullish-line dark:text-primary-strong" aria-hidden />
                <h3 className="m-0 font-bold text-lg">{block.title}</h3>
                <ul className="m-0 flex list-none flex-col gap-3 p-0 text-[0.95rem] leading-relaxed opacity-85">
                  {block.points.map((point) => (
                    <li key={point}>{point}</li>
                  ))}
                </ul>
                <Link
                  href={block.link.href}
                  className="mt-auto w-fit font-semibold text-bullish-line underline-offset-4 dark:text-primary-strong hover:underline focus-visible:outline-2 focus-visible:outline-solid focus-visible:outline-ring"
                >
                  {block.link.label}
                </Link>
              </div>
            );
          })}
        </div>
        <ul className="m-0 mt-14 grid list-none gap-4 border-background/20 border-t p-0 pt-8 dark:border-border md:grid-cols-3">
          {NOT.map((line) => (
            <li key={line} className="flex items-start gap-3">
              <XIcon
                className="mt-0.5 size-5 shrink-0 text-bullish-line dark:text-primary-strong"
                aria-hidden
              />
              <span className="font-medium">{line}</span>
            </li>
          ))}
        </ul>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 8. FAQ — the objections a first-time visitor actually has
// ---------------------------------------------------------------------------

export const FAQS: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: 'Is EquityWise free?',
    a: 'Yes, it is free to use and no card is asked for. Create an account to save watchlists, screens, alerts and your portfolio.',
  },
  {
    q: 'Is this investment advice?',
    a: 'No. EquityWise shows data and technical readings about stocks — facts such as "volume 2.4× its 20-session average". It does not recommend buying, selling or holding anything. Decisions, and any orders, are yours. EquityWise is not registered with SEBI as an investment adviser or research analyst.',
  },
  {
    q: 'Do I need a demat or trading account?',
    a: 'No, and EquityWise never asks for your broker login. To track holdings, type them in, or upload a CSV or Excel holdings file or a broker contract note.',
  },
  {
    q: 'How up to date is the data?',
    a: 'Watchlist prices update during market hours. Indicators, the screener and stock pages are recalculated after each NSE close from completed sessions only, and say which close they show.',
  },
  {
    q: 'Is my portfolio data private?',
    a: 'Yes. Holdings are visible only to you, uploaded files are discarded after you review them, and deleting your account removes your data.',
  },
  {
    q: 'I am new to investing. Is this for me?',
    a: 'If you want to understand what a stock has been doing, yes: every fact is written as a plain sentence with its number. It will not tell you what to buy, so pair it with your own learning — and remember that markets carry risk.',
  },
];

export function Faq() {
  return (
    <section aria-labelledby="faq-title" id="faq" className="scroll-mt-20 py-20 sm:py-24">
      <Container className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.6fr)] lg:gap-16">
        <div>
          <SectionHeading id="faq-title" title="Questions people ask first" />
          <p className="m-0 mt-3 text-lg text-muted-foreground leading-relaxed">
            Something else on your mind?{' '}
            <Link
              href="/contact"
              className="font-semibold text-foreground underline underline-offset-4"
            >
              Write to us
            </Link>
            .
          </p>
        </div>
        <div className="border-border-strong border-t">
          {FAQS.map((item, index) => (
            <details
              key={item.q}
              open={index === 0}
              className="group border-border-strong border-b"
            >
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-4 font-semibold text-lg [&::-webkit-details-marker]:hidden">
                {item.q}
                <span
                  aria-hidden
                  className="grid size-7 shrink-0 place-items-center rounded-full border border-border-strong text-muted-foreground transition-transform group-open:rotate-45 motion-reduce:transition-none"
                >
                  +
                </span>
              </summary>
              <p className="m-0 max-w-2xl pb-5 text-muted-foreground leading-relaxed">{item.a}</p>
            </details>
          ))}
        </div>
      </Container>
    </section>
  );
}

// ---------------------------------------------------------------------------
// 9. Closing call to action
// ---------------------------------------------------------------------------

export function ClosingCta() {
  return (
    <section aria-labelledby="cta-title" data-cta-zone className="pb-20 sm:pb-24">
      <Container>
        <div className="flex flex-col items-start gap-6 rounded-3xl border border-border bg-surface p-8 sm:p-12 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h2
              id="cta-title"
              className="m-0 text-balance font-bold font-display text-3xl tracking-tight sm:text-4xl"
            >
              Read the market with reasons, not rumours.
            </h2>
            <p className="m-0 mt-3 text-lg text-muted-foreground">
              Free account. Takes a minute. No broker login.
            </p>
          </div>
          <SignupCta className="shrink-0" />
        </div>
      </Container>
    </section>
  );
}
