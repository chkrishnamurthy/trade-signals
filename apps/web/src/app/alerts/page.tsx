import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { AlertsView } from '@/components/alerts/alerts-view';
import { getAlertsOverview } from '@/server/alerts';
import { MarketDataError } from '@/server/errors';

export const metadata: Metadata = {
  title: 'Alerts',
  description: 'Be told when a stock crosses a price or RSI level on a completed session.',
  robots: { index: false, follow: false },
};

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function AlertsPage() {
  try {
    return <AlertsView overview={await getAlertsOverview()} />;
  } catch (error) {
    if (error instanceof MarketDataError && error.status === 401)
      redirect(`/login?next=${encodeURIComponent('/alerts')}`);
    throw error;
  }
}
