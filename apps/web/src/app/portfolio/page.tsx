import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { PortfolioView } from '@/components/portfolio/portfolio-view';
import { FIFO_NOTE_COOKIE } from '@/lib/portfolio-prefs';
import { MarketDataError } from '@/server/errors';
import { getPortfolio } from '@/server/portfolio';

export const metadata: Metadata = {
  title: 'Portfolio — EquityWise',
  description:
    'The shares you hold, valued at the latest price. You type them in or upload a file.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PortfolioPage() {
  try {
    const [portfolio, jar] = await Promise.all([getPortfolio(), cookies()]);
    return (
      <PortfolioView
        portfolio={portfolio}
        fifoNoteSeen={jar.get(FIFO_NOTE_COOKIE)?.value === '1'}
      />
    );
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent('/portfolio')}`);
    throw error;
  }
}
