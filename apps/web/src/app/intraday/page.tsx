import type { Metadata } from 'next';
import { IntradayDashboard } from '@/components/intraday/intraday-dashboard';
export const metadata: Metadata = {
  title: 'Intraday Strategies — EquityWise',
  description:
    'One rule-based intraday strategy, its signals and simulated paper trades for today.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function IntradayRoute() {
  return <IntradayDashboard />;
}
