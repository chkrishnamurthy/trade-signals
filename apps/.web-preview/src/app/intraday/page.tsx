import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { IntradayDashboard } from '@/components/intraday/intraday-dashboard';
import { getAdminUser } from '@/server/auth/require-user';
export const metadata: Metadata = {
  title: 'Intraday Strategies — EquityWise',
  description:
    'One rule-based intraday strategy, its signals and simulated paper trades for today.',
  robots: { index: false, follow: false },
};
export const dynamic = 'force-dynamic';
/** Admin-only while the strategy is under evaluation; a signed-in user is sent to the app. */
export default async function IntradayRoute() {
  const admin = await getAdminUser();
  if (admin === null) redirect('/watchlists');
  return <IntradayDashboard />;
}
