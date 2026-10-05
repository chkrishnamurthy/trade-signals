import type { Metadata } from 'next';
import { PaperDashboard } from '@/components/paper/paper-dashboard';
import { requireAdminPage } from '@/server/auth/admin-page';
export const metadata: Metadata = {
  title: 'Paper Trading — EquityWise',
  description:
    'Intraday strategies simulated automatically on virtual capital. No real orders, ever.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
/** Admin-only while the simulation is under evaluation; a signed-in user is sent to the app. */
export default async function PaperTradingRoute() {
  await requireAdminPage();
  return <PaperDashboard />;
}
