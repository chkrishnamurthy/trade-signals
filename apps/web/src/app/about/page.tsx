import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicArticle, PublicList, PublicSection } from '@/components/layout/public-page';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'EquityWise is a research tool for NSE-listed stocks: watchlists, a screener, stock pages, a portfolio tracker and a brief after every close. Not a broker, not investment advice.';

export const metadata: Metadata = {
  title: { absolute: 'About EquityWise' },
  description: DESCRIPTION,
  alternates: { canonical: '/about' },
  openGraph: {
    title: 'About EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/about`,
    images: [SHARE_IMAGE],
  },
};

const STRONG = 'font-semibold text-foreground';
const LINK = 'font-semibold text-foreground underline underline-offset-4';

export default function AboutPage() {
  return (
    <PublicArticle
      path="/about"
      crumb="About"
      title="About EquityWise"
      intro="A research tool for people who invest in Indian stocks and want to check the numbers for themselves."
    >
      <PublicSection title="What it is">
        <p className="m-0">
          EquityWise tracks stocks listed on the{' '}
          <strong className={STRONG}>National Stock Exchange of India (NSE)</strong> and answers
          three questions, in plain English and with the number behind every statement:
        </p>
        <ol className="m-0 flex list-decimal flex-col gap-2 pl-5 font-medium text-foreground">
          <li>What is happening in the market?</li>
          <li>Which stocks deserve a closer look?</li>
          <li>Why does this one stand out?</li>
        </ol>
        <p className="m-0">
          It does that with watchlists, a screener across about 95 technical, delivery, F&amp;O and
          ownership measures, a page for each stock, a brief on every completed session, IPO and
          market-calendar pages, email alerts on levels you choose, and a private record of the
          shares you hold. The screener and stock pages cover NSE mainboard stocks in the EQ, BE and
          BZ series; SME stocks and ETFs are not included yet.
        </p>
      </PublicSection>

      <PublicSection title="What it is not">
        <PublicList>
          <li>
            <strong className={STRONG}>Not a broker.</strong> EquityWise never places, changes or
            routes an order, and never connects to your demat or trading account. Any order is yours
            to place, on your own broker.
          </li>
          <li>
            <strong className={STRONG}>Not investment advice.</strong> It is not registered with
            SEBI as an investment adviser or research analyst, and nothing on it is a recommendation
            to buy, sell or hold. It does not give tips, targets or entry prices.
          </li>
          <li>
            <strong className={STRONG}>Not a black box.</strong> A figure is shown with how it was
            worked out, or it is not shown. The formulas are on the{' '}
            <Link href="/methodology" className={LINK}>
              methodology page
            </Link>
            .
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="The rules the numbers follow">
        <PublicList>
          <li>
            <strong className={STRONG}>Completed sessions only.</strong> Indicators are calculated
            from trading days that have closed, never from a day still in progress.
          </li>
          <li>
            <strong className={STRONG}>Splits and bonuses are applied, not ignored.</strong> Price
            history is stored as the exchange reported it, and each split or bonus is applied with
            its exact ratio when the history is read — so a 52-week high is a like-for-like one.
            When a new split or bonus is recorded, earlier prices and the readings built on them are
            restated to match.
          </li>
          <li>
            <strong className={STRONG}>Exact amounts.</strong> Prices are calculated in whole paise,
            so there is no rounding drift.
          </li>
          <li>
            <strong className={STRONG}>Times in IST.</strong> Every time you see is Indian Standard
            Time.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="Your data">
        <p className="m-0">
          Your watchlists, alerts and portfolio are visible to you alone. Statements you upload are
          read and discarded; only the rows you confirm are saved. The{' '}
          <Link href="/privacy" className={LINK}>
            privacy policy
          </Link>{' '}
          says exactly what is stored and for how long.
        </p>
      </PublicSection>

      <PublicSection title="Questions">
        <p className="m-0">
          Something wrong, unclear or missing?{' '}
          <Link href="/contact" className={LINK}>
            Contact us
          </Link>
          .
        </p>
      </PublicSection>
    </PublicArticle>
  );
}
