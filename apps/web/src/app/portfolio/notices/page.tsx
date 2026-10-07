import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { NoticesView } from '@/components/portfolio/notices-view';
import { MarketDataError } from '@/server/errors';
import { getNotices } from '@/server/portfolio-notices';

export const metadata: Metadata = {
  title: 'Portfolio notices',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function PortfolioNoticesPage() {
  try {
    return <NoticesView data={await getNotices()} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent('/portfolio/notices')}`);
    throw error;
  }
}
