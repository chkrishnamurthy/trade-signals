import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { HoldingDetailView } from '@/components/portfolio/holding-detail-view';
import { MarketDataError } from '@/server/errors';
import { getHoldingDetail } from '@/server/portfolio';

export const metadata: Metadata = {
  title: 'Holding',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function HoldingPage({ params }: { params: Promise<{ symbol: string }> }) {
  const { symbol } = await params;
  try {
    const detail = await getHoldingDetail(decodeURIComponent(symbol));
    if (detail === null) notFound();
    return <HoldingDetailView detail={detail} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent(`/portfolio/${symbol}`)}`);
    throw error;
  }
}
