import type { Metadata } from 'next';
import Link from 'next/link';
import { PublicArticle, PublicSection } from '@/components/layout/public-page';
import { SHARE_IMAGE, SITE_URL } from '@/lib/seo/schema';

const DESCRIPTION =
  'The terms for using EquityWise, a research tool for NSE-listed stocks. Not a broker, not investment advice.';

export const metadata: Metadata = {
  title: 'Terms of service',
  description: DESCRIPTION,
  alternates: { canonical: '/terms' },
  openGraph: {
    title: 'Terms of service — EquityWise',
    description: DESCRIPTION,
    url: `${SITE_URL}/terms`,
    images: [SHARE_IMAGE],
  },
};

const LINK = 'font-semibold text-foreground underline underline-offset-4';

export default function TermsPage() {
  return (
    <PublicArticle
      path="/terms"
      crumb="Terms of service"
      title="Terms of service"
      updated="October 2026"
    >
      <PublicSection title="1. Agreeing to these terms">
        <p className="m-0">
          By using EquityWise (equitywise.io) you agree to these terms. If you do not agree, please
          do not use the service.
        </p>
      </PublicSection>

      <PublicSection title="2. What the service is">
        <p className="m-0">
          EquityWise is a research tool that shows market data and technical readings about stocks
          listed on the National Stock Exchange of India. It is not a stockbroker, and it is not
          registered with SEBI as an investment adviser, research analyst or portfolio manager.
          Readings, screener results, alerts and every other part of the service are information,
          not investment advice or a recommendation to buy, sell or hold.
        </p>
        <p className="m-0">
          You alone are responsible for your investment decisions. See the{' '}
          <Link href="/disclaimer" className={LINK}>
            disclaimer
          </Link>
          .
        </p>
      </PublicSection>

      <PublicSection title="3. Your account">
        <p className="m-0">
          Give an email address you control and keep your sign-in details to yourself; you are
          responsible for what happens under your account. Do not scrape the service, overload it
          with automated requests, try to reach other people&rsquo;s data, or reverse-engineer its
          private interfaces.
        </p>
        <p className="m-0">
          You can delete your account at any time from your profile. We may suspend an account that
          breaks these terms.
        </p>
      </PublicSection>

      <PublicSection title="4. Data and content">
        <p className="m-0">
          Market data comes from the exchanges and from third-party providers, as listed on the{' '}
          <Link href="/data-sources" className={LINK}>
            data sources
          </Link>{' '}
          page. It is provided for your own personal research. You may not copy, resell or republish
          it, or the readings calculated from it, in bulk or for commercial use.
        </p>
        <p className="m-0">
          The software, its design and its calculations belong to EquityWise. You keep everything
          you enter — watchlists, notes, holdings — and can delete it at any time.
        </p>
      </PublicSection>

      <PublicSection title="5. Availability and accuracy">
        <p className="m-0">
          EquityWise is free to use today and is provided as it is. Data can be late, incomplete or
          wrong, and the service can be unavailable. Features may change.
        </p>
      </PublicSection>

      <PublicSection title="6. Limitation of liability">
        <p className="m-0">
          To the fullest extent the law allows, EquityWise and the people who run it are not liable
          for any direct, indirect, incidental or consequential loss arising from market movements,
          outages, data delays or errors, or decisions made using the service.
        </p>
      </PublicSection>

      <PublicSection title="7. Changes and contact">
        <p className="m-0">
          We may update these terms; the date above shows the latest version. Questions:{' '}
          <Link href="/contact" className={LINK}>
            contact us
          </Link>
          .
        </p>
      </PublicSection>
    </PublicArticle>
  );
}
