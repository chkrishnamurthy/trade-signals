import type { Metadata } from 'next';
import { MarketBriefView } from '@/components/market-brief/market-brief-view';
import { getMarketBrief } from '@/server/market-brief';

export const metadata: Metadata = {
  title: 'Daily Market Brief — EquityWise',
  description: 'A technical summary of the latest completed NSE session.',
  robots: { index: false, follow: false },
};

/** Reads per-user data on every request; never prerender. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function TodayRoute() {
  const { brief, defaultWatchlistId } = await getMarketBrief();
  return <MarketBriefView brief={brief} defaultWatchlistId={defaultWatchlistId} />;
}
