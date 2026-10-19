import type { Metadata } from 'next';
import type * as React from 'react';
import { PublicArticle, PublicList, PublicSection } from '@/components/layout/public-page';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'How EquityWise calculates its indicators — RSI, moving averages, MACD, ATR — and how splits and bonuses are applied to price history.';

export const metadata: Metadata = {
  title: 'Methodology: how the numbers are calculated',
  description: DESCRIPTION,
  alternates: { canonical: '/methodology' },
  openGraph: {
    title: 'Methodology — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/methodology`,
    images: [SHARE_IMAGE],
  },
};

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1 overflow-x-auto rounded-lg border border-border bg-surface p-4 font-mono text-foreground text-xs">
      {children}
    </div>
  );
}

export default function MethodologyPage() {
  return (
    <PublicArticle
      path="/methodology"
      crumb="Methodology"
      title="How the numbers are calculated"
      intro="Every indicator is written by hand and tested against values worked out independently. Here are the formulas."
    >
      <PublicSection title="1. The same calculation every time">
        <p className="m-0">
          Each indicator is a self-contained calculation: it takes a series of completed daily bars
          and its settings, and returns values. It does not read the clock, the network or the
          database, so the same history always gives the same answer.
        </p>
        <PublicList>
          <li>Only completed trading days are used — never a day still in progress.</li>
          <li>
            When a split, bonus or data correction is recorded, the history is restated and the
            readings are calculated again from it, so an older reading can change.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="2. Relative Strength Index (RSI, 14 days)">
        <p className="m-0">
          RSI follows J. Welles Wilder Jr.&rsquo;s original smoothing, not the simple-average
          shortcut some charting tools use.
        </p>
        <Formula>
          <p className="m-0">Change = Close[t] − Close[t−1]</p>
          <p className="m-0">Gain = max(Change, 0), Loss = max(−Change, 0)</p>
          <p className="m-0">AvgGain[t] = (AvgGain[t−1] × 13 + Gain[t]) / 14</p>
          <p className="m-0">AvgLoss[t] = (AvgLoss[t−1] × 13 + Loss[t]) / 14</p>
          <p className="m-0">RSI = 100 − 100 / (1 + AvgGain / AvgLoss)</p>
        </Formula>
        <p className="m-0 text-sm">
          The first value needs 15 closes. Wilder smoothing settles over roughly the next 100
          sessions, so a stock with a short history can show a slightly different RSI from a
          platform that holds more of it. When there were no losses at all, RSI is 100.
        </p>
      </PublicSection>

      <PublicSection title="3. Moving averages (SMA and EMA)">
        <p className="m-0">
          Simple moving averages (20 and 50 days) are the plain average of the last N closes.
          Exponential moving averages (20, 50 and 200 days) weight recent closes more:
        </p>
        <Formula>
          <p className="m-0">α = 2 / (N + 1)</p>
          <p className="m-0">EMA[t] = Close[t] × α + EMA[t−1] × (1 − α)</p>
        </Formula>
        <p className="m-0 text-sm">
          The first EMA value is the simple average of the first N closes — the convention charting
          platforms use.
        </p>
      </PublicSection>

      <PublicSection title="4. MACD (12, 26, 9)">
        <Formula>
          <p className="m-0">MACD line = EMA(12) − EMA(26)</p>
          <p className="m-0">Signal line = EMA(9) of the MACD line</p>
          <p className="m-0">Histogram = MACD line − Signal line</p>
        </Formula>
      </PublicSection>

      <PublicSection title="5. Average True Range (ATR, 14 days)">
        <p className="m-0">
          True range is the largest of: today&rsquo;s high − low, |high − previous close| and |low −
          previous close|, so overnight gaps count. ATR is its 14-day Wilder average, in rupees.
        </p>
      </PublicSection>

      <PublicSection title="6. Splits, bonuses and price history">
        <p className="m-0">
          Prices are stored as the exchange reported them and are never edited. A split or bonus is
          recorded separately, with its ex-date and exact ratio:
        </p>
        <PublicList>
          <li>
            Every price before the ex-date is multiplied by the combined ratio when the history is
            read (a 1:5 split has a ratio of 0.2).
          </li>
          <li>Volume is divided by the same ratio, so traded value stays comparable.</li>
          <li>Adjusted prices are rounded to the nearest whole paisa.</li>
          <li>Dividends are recorded but are not applied to prices.</li>
        </PublicList>
      </PublicSection>
    </PublicArticle>
  );
}
