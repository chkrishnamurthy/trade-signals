import type { Metadata } from 'next';
import { PaperDashboard } from '@/components/paper/paper-dashboard';
export const metadata: Metadata = {
  title: 'Paper Trading — EquityWise',
  description:
    'Your intraday strategies simulated automatically on virtual capital. No real orders, ever.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
export default function PaperTradingRoute() {
  return <PaperDashboard />;
}
