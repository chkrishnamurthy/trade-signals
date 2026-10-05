import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AnalysisView } from '@/components/portfolio/analysis-view';
import { MarketDataError } from '@/server/errors';
import { getPortfolioAnalysis } from '@/server/portfolio';

export const metadata: Metadata = {
  title: 'Portfolio analysis — EquityWise',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PortfolioAnalysisPage() {
  try {
    const { analysis, returns } = await getPortfolioAnalysis();
    return <AnalysisView analysis={analysis} returns={returns} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent('/portfolio/analysis')}`);
    throw error;
  }
}
