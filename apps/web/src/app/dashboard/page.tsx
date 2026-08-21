import type { Metadata } from 'next';
import { Dashboard } from '@/components/dashboard/dashboard';

export const metadata: Metadata = {
  title: 'Market dashboard — NSE Signal Platform',
  description: 'Live NSE market overview, breadth, sectors and technical signals from Fyers.',
};

/** Live market data; never prerender. */
export const dynamic = 'force-dynamic';

export default function DashboardPage() {
  return <Dashboard indexKey="nifty50" />;
}
