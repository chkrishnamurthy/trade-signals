import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { MarketDataError } from '@/server/errors';
import { getPortfolio } from '@/server/portfolio';

export const metadata: Metadata = {
  title: 'My portfolio — EquityWise',
  description:
    'The shares you hold, valued at the latest price. You type them in or upload a file.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  try {
    return <PortfolioView portfolio={await getPortfolio()} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent('/portfolio')}`);
    throw error;
  }
}
