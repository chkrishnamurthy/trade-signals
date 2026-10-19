'use client';

import type * as React from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BriefPreview,
  IpoPreview,
  PortfolioPreview,
  ScreenerPreview,
  WatchlistPreview,
  WhyPanel,
} from './previews';

/**
 * "See it in action" — one tab per screen, each a recreation of the real
 * screen with sample data plus the two sentences that say why it is useful.
 * Radix Tabs: arrow keys move between tabs, the panel is labelled by its tab.
 */
const TABS: ReadonlyArray<{
  id: string;
  label: string;
  title: string;
  body: string;
  preview: React.ReactNode;
}> = [
  {
    id: 'brief',
    label: 'Market brief',
    title: 'Start the day knowing what happened',
    body: 'How the Nifty 50 closed — breadth, moving averages, unusual volume — and how the stocks you follow moved, in one short read after every session.',
    preview: <BriefPreview />,
  },
  {
    id: 'watchlists',
    label: 'Watchlists',
    title: 'Your stocks, with the numbers filled in',
    body: 'Prices update during market hours. Add columns for RSI, moving averages, returns and the 52-week range; sort, filter and keep several lists.',
    preview: <WatchlistPreview />,
  },
  {
    id: 'screener',
    label: 'Screener',
    title: 'Search the whole market on conditions you can check',
    body: 'Combine technical, delivery, F&O and ownership conditions across NSE mainboard stocks. No fundamentals yet — we only offer what our data can back up.',
    preview: <ScreenerPreview />,
  },
  {
    id: 'stock',
    label: 'Stock page',
    title: 'See why a stock is on your radar',
    body: 'What stands out, each fact with its number, and a tab with the evidence behind it: technicals, delivery, F&O, ownership and events.',
    preview: <WhyPanel />,
  },
  {
    id: 'portfolio',
    label: 'Portfolio',
    title: 'Everything you hold, in one view',
    body: 'Type your shares in, or upload a CSV or Excel holdings file or a broker contract note. See value, today’s change and what you paid — no broker login, ever.',
    preview: <PortfolioPreview />,
  },
  {
    id: 'ipos',
    label: 'IPOs',
    title: 'Every mainboard and SME issue, from the source',
    body: 'Dates, price bands, subscription and listing day, from exchange data and the offer documents. Grey-market premiums are labelled unofficial.',
    preview: <IpoPreview />,
  },
];

export function ProductTour() {
  return (
    <section aria-labelledby="tour-title" id="tour" className="scroll-mt-20 pb-20 sm:pb-24">
      <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8">
        <h2
          id="tour-title"
          className="m-0 max-w-2xl text-balance font-bold font-display text-3xl tracking-tight sm:text-4xl"
        >
          See it before you sign up
        </h2>
        <Tabs defaultValue="brief" className="mt-8 gap-8">
          <TabsList
            variant="pill"
            aria-label="Product screens"
            className="flex w-full flex-wrap sm:w-fit"
          >
            {TABS.map((tab) => (
              <TabsTrigger key={tab.id} value={tab.id}>
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
          {TABS.map((tab) => (
            <TabsContent
              key={tab.id}
              value={tab.id}
              className="grid items-start gap-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.4fr)] lg:gap-12"
            >
              <div className="flex flex-col gap-3 lg:pt-4">
                <h3 className="m-0 text-balance font-bold text-2xl tracking-tight">{tab.title}</h3>
                <p className="m-0 text-muted-foreground leading-relaxed">{tab.body}</p>
              </div>
              {tab.preview}
            </TabsContent>
          ))}
        </Tabs>
      </div>
    </section>
  );
}
