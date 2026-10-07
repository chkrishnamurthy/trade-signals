import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicArticle, PublicList, PublicSection } from '@/components/layout/public-page';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'EquityWise is a research tool, not investment advice. It is not a broker and not registered with SEBI as an investment adviser or research analyst.';

export const metadata: Metadata = {
  title: 'Disclaimer and risk notice',
  description: DESCRIPTION,
  alternates: { canonical: '/disclaimer' },
  openGraph: {
    title: 'Disclaimer and risk notice — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/disclaimer`,
    images: [SHARE_IMAGE],
  },
};

const STRONG = 'font-semibold text-foreground';

export default function DisclaimerPage() {
  return (
    <PublicArticle
      path="/disclaimer"
      crumb="Disclaimer"
      title="Disclaimer and risk notice"
      intro="What EquityWise is, what it is not, and the risk that comes with investing."
      updated="October 2026"
    >
      <section
        aria-labelledby="status-heading"
        className="flex flex-col gap-3 rounded-xl border border-border-strong bg-surface p-6"
      >
        <h2 id="status-heading" className="m-0 font-bold text-foreground text-xl tracking-tight">
          Not investment advice
        </h2>
        <p className="m-0 text-foreground">
          EquityWise is a research tool. It is <strong>not</strong> registered with the Securities
          and Exchange Board of India (SEBI) as an investment adviser, research analyst, portfolio
          manager or stockbroker.
        </p>
        <p className="m-0">
          Nothing on EquityWise — the market brief, the screener, stock pages, watchlists, alerts,
          IPO pages or anywhere else — is investment advice, a tip, or a recommendation to buy, sell
          or hold any security.
        </p>
      </section>

      <PublicSection title="What the readings are">
        <p className="m-0">
          EquityWise shows market data and technical readings calculated from it: for example,
          &ldquo;closed above its 200-day average&rdquo;, &ldquo;RSI 64&rdquo; or &ldquo;volume 2.4×
          its 20-session average&rdquo;. Words such as &ldquo;rising&rdquo;, &ldquo;falling&rdquo;
          or &ldquo;overbought&rdquo; describe what prices have done. They say nothing about what
          prices will do, and they are not instructions to trade.
        </p>
        <PublicList>
          <li>
            Readings use completed trading days and can be restated when a split, bonus or data
            correction is recorded.
          </li>
          <li>
            Data can be late, incomplete or wrong. Check anything that matters against the exchange
            or the company&rsquo;s own filings.
          </li>
          <li>
            The grey-market premium shown on IPO pages is an unofficial figure from a third party.
            It is labelled as such and is not a forecast of the listing price.
          </li>
        </PublicList>
      </PublicSection>

      <PublicSection title="No orders, no broker account">
        <p className="m-0">
          EquityWise does not hold money, take orders, or connect to a trading or demat account. Any
          decision to invest, and any order, is yours alone, made through your own SEBI-registered
          broker.
        </p>
      </PublicSection>

      <PublicSection title="Market risk">
        <p className="m-0">
          <strong className={STRONG}>
            Investments in the securities market are subject to market risks.
          </strong>{' '}
          Prices can fall as well as rise, and you can lose money. Past price behaviour, and any
          pattern in it, is no guarantee of what happens next. Read the company&rsquo;s documents
          carefully, do your own research, and consider speaking to a SEBI-registered investment
          adviser before you invest.
        </p>
      </PublicSection>

      <PublicSection title="Questions or complaints">
        <p className="m-0">
          See{' '}
          <Link
            href="/contact"
            className="font-semibold text-foreground underline underline-offset-4"
          >
            Contact &amp; grievances
          </Link>{' '}
          for how to reach us and how we handle a complaint.
        </p>
      </PublicSection>
    </PublicArticle>
  );
}
