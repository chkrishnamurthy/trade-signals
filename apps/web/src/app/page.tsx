import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { MobileCtaBar } from '@/components/landing/mobile-cta-bar';
import { ProductTour } from '@/components/landing/product-tour';
import {
  Audiences,
  ClosingCta,
  Faq,
  Features,
  Hero,
  HowItWorks,
  Stance,
  TrustAndSafety,
} from '@/components/landing/sections';
import { PublicFrame } from '@/components/layout/public-page';
import { HOME_HREF } from '@/lib/navigation';
import { SITE_URL } from '@/lib/seo/schema';
import { getSessionUser } from '@/server/auth/require-user';

const TITLE = 'EquityWise — know why an NSE stock deserves your attention';
const DESCRIPTION =
  'Plain-English research on NSE stocks: what stands out on each stock, a screener across about 95 measures, watchlists, a portfolio tracker and a brief after every close. Free to use. Not a broker, not investment advice.';

export const metadata: Metadata = {
  // Absolute: the layout's "%s | EquityWise" template would repeat the name.
  title: { absolute: TITLE },
  description: DESCRIPTION,
  alternates: { canonical: '/' },
  openGraph: { title: TITLE, description: DESCRIPTION, url: SITE_URL },
  twitter: { title: TITLE, description: DESCRIPTION },
};

/**
 * The marketing home page (docs/planning/landing-and-public-navigation-plan.md §5).
 *
 * Signed-in visitors never see it: their home is the Market brief, so there is
 * one home per state. A failing session lookup shows the landing page rather
 * than an error — the home page is the last page that should go down.
 *
 * No live market data: every figure is labelled sample data about made-up
 * companies.
 */
export default async function HomePage() {
  const user = await getSessionUser().catch(() => null);
  if (user !== null) redirect(HOME_HREF);

  return (
    <PublicFrame>
      <Hero />
      <Stance />
      <Features />
      <ProductTour />
      <HowItWorks />
      <Audiences />
      <TrustAndSafety />
      <Faq />
      <ClosingCta />
      <MobileCtaBar />
    </PublicFrame>
  );
}
