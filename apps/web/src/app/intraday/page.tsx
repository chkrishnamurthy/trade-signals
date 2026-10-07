import type { Metadata } from 'next';
import { IntradayDashboard } from '@/components/intraday/intraday-dashboard';
import { requireAdminPage } from '@/server/auth/admin-page';
export const metadata: Metadata = {
  title: 'Intraday strategies',
  description:
    'One rule-based intraday strategy, its signals and simulated paper trades for today.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
/** Admin-only while the strategy is under evaluation; a signed-in user is sent to the app. */
export default async function IntradayRoute() {
  await requireAdminPage();
  return <IntradayDashboard />;
}
