import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/dashboard';

export const metadata: Metadata = {
  title: 'Market overview — EquityWise',
  description:
    'How the market is trading today — indices, breadth, sector strength and the biggest moves.',
};

/** Live market data; never prerender. */
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <Dashboard indexKey="nifty50" />;
}
